import { User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import {
  AppConfig,
  AppStateResponse,
  Assignment,
  DriverMaster,
  OriginMaster,
  RouteMaster,
  TaskStatus,
  VehicleMaster,
} from '../types';
import { auth, db } from './googleAuth';

// ============================================================================
// 1. Mandatory Firestore Error Handler (Synced with Firebase Integration Skill)
// ============================================================================

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// ============================================================================
// 2. Boot-Time Connection Validation
// ============================================================================

async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('the client is offline')
    ) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

// ============================================================================
// 3. Schema Validation & Sanitization Constants (Synced verbatim with firebase-blueprint.json)
// ============================================================================

export const BLUEPRINT_ID_PATTERN = /^[a-zA-Z0-9_\-]+$/;
const BOOTSTRAP_ADMIN_EMAIL = 'dispatchercrk@gmail.com';

const MAX_LEN = {
  DOC_ID: 128,
  CODE_ID: 64,
  ADMIN_EMAIL: 160,
  DRIVER_NAME: 120,
  DRIVER_LICENSE: 40,
  DRIVER_PHONE: 40,
  DRIVER_PIN: 32,
  VEHICLE_PLATE: 32,
  VEHICLE_TYPE: 100,
  VEHICLE_CAPACITY: 80,
  VEHICLE_STATUS: 32,
  ORIGIN_NAME: 160,
  ORIGIN_ADDRESS: 300,
  ROUTE_DEST: 200,
  ROUTE_PIC_NAME: 120,
  ROUTE_PIC_PHONE: 40,
  ASG_NO_PENUGASAN: 80,
  ASG_SURAT_JALAN: 80,
  ASG_SEGEL: 64,
  ASG_TANGGAL: 32,
  ASG_JADWAL_TIBA: 16,
  ASG_PURPOSE: 240,
  ASG_TIMESTAMP: 64,
  ASG_SUHU: 32,
  ASG_BBM: 32,
  ASG_KONDISI: 120,
  ASG_NOTES: 500,
  CFG_SHEET_ID: 160,
  CFG_SHEET_TITLE: 200,
  CFG_SHEET_URL: 300,
  CFG_WA_PHONE: 64,
  CFG_WA_GROUP_NAME: 120,
  CFG_WA_GROUP_URL: 300,
  CFG_PREFIX: 32,
} as const;

export function sanitizeFirestoreId(
  raw: string,
  maxLength: number = MAX_LEN.CODE_ID,
  fallbackPrefix = 'ID'
): string {
  const cleaned = String(raw || '')
    .trim()
    .replace(/[^a-zA-Z0-9_\-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, maxLength);
  if (cleaned.length >= 1 && BLUEPRINT_ID_PATTERN.test(cleaned)) {
    return cleaned;
  }
  return `${fallbackPrefix}-${Date.now()}`.slice(0, maxLength);
}

function clampString(
  val: unknown,
  maxLength: number,
  requiredFallback?: string
): string {
  const trimmed = String(val ?? '').trim().slice(0, maxLength);
  if (requiredFallback !== undefined && trimmed.length === 0) {
    return requiredFallback.slice(0, maxLength);
  }
  return trimmed;
}

function canSyncWithUser(user: User | null | undefined): user is User {
  return Boolean(
    user &&
      user.uid &&
      BLUEPRINT_ID_PATTERN.test(user.uid) &&
      user.emailVerified === true
  );
}

function timestampToIso(ts: unknown): string {
  if (ts instanceof Timestamp) {
    return ts.toDate().toISOString();
  }
  if (
    ts &&
    typeof ts === 'object' &&
    'toDate' in ts &&
    typeof (ts as { toDate: () => Date }).toDate === 'function'
  ) {
    return (ts as { toDate: () => Date }).toDate().toISOString();
  }
  return new Date().toISOString();
}

function shallowFieldsEqual(
  existingData: Record<string, unknown>,
  nextFields: Record<string, unknown>
): boolean {
  for (const [key, val] of Object.entries(nextFields)) {
    if (existingData[key] !== val) {
      return false;
    }
  }
  return true;
}

// ============================================================================
// 4. Individual Entity Upsert & Delete Operations
// ============================================================================

export async function ensureAdminBootstrapRecord(user: User): Promise<void> {
  if (!canSyncWithUser(user)) return;
  if (user.email !== BOOTSTRAP_ADMIN_EMAIL) return;

  const adminPath = `admins/${user.uid}`;
  const adminRef = doc(db, 'admins', user.uid);
  let snap;
  try {
    snap = await getDoc(adminRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, adminPath);
  }

  if (!snap.exists()) {
    try {
      await setDoc(adminRef, {
        uid: user.uid,
        email: clampString(user.email, MAX_LEN.ADMIN_EMAIL, BOOTSTRAP_ADMIN_EMAIL),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, adminPath);
    }
  }
}

export async function upsertDriverInFirestore(
  user: User | null,
  driver: DriverMaster,
  previousId?: string
): Promise<void> {
  if (!canSyncWithUser(user)) return;

  const docId = sanitizeFirestoreId(driver.id, MAX_LEN.CODE_ID, 'DRV');
  if (previousId) {
    const oldDocId = sanitizeFirestoreId(previousId, MAX_LEN.CODE_ID, 'DRV');
    if (oldDocId !== docId) {
      await deleteDriverFromFirestore(user, oldDocId);
    }
  }

  const publicPath = `drivers/${docId}`;
  const secretPath = `drivers/${docId}/private/credentials`;
  const publicRef = doc(db, 'drivers', docId);
  const secretRef = doc(db, 'drivers', docId, 'private', 'credentials');

  let publicSnap;
  try {
    publicSnap = await getDoc(publicRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, publicPath);
  }

  const mutablePublic = {
    name: clampString(driver.name, MAX_LEN.DRIVER_NAME, docId),
    licenseType: clampString(driver.licenseType, MAX_LEN.DRIVER_LICENSE),
    active: driver.active !== false,
  };
  const mutableSecret = {
    phone: clampString(driver.phone, MAX_LEN.DRIVER_PHONE),
    pin: clampString(driver.pin, MAX_LEN.DRIVER_PIN),
  };

  if (!publicSnap.exists()) {
    const batch = writeBatch(db);
    batch.set(publicRef, {
      id: docId,
      ...mutablePublic,
      ownerUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(secretRef, {
      driverId: docId,
      ...mutableSecret,
      ownerUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, publicPath);
    }
    return;
  }

  let secretSnap;
  try {
    secretSnap = await getDoc(secretRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, secretPath);
  }

  const publicUnchanged = shallowFieldsEqual(
    publicSnap.data() as Record<string, unknown>,
    mutablePublic
  );
  const secretUnchanged =
    secretSnap.exists() &&
    shallowFieldsEqual(
      secretSnap.data() as Record<string, unknown>,
      mutableSecret
    );

  if (publicUnchanged && secretUnchanged) return;

  const batch = writeBatch(db);
  if (!publicUnchanged) {
    batch.update(publicRef, {
      ...mutablePublic,
      updatedAt: serverTimestamp(),
    });
  }
  if (!secretSnap.exists()) {
    batch.set(secretRef, {
      driverId: docId,
      ...mutableSecret,
      ownerUid: user.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } else if (!secretUnchanged) {
    batch.update(secretRef, {
      ...mutableSecret,
      updatedAt: serverTimestamp(),
    });
  }

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, publicPath);
  }
}

export async function deleteDriverFromFirestore(
  user: User | null,
  driverId: string
): Promise<void> {
  if (!canSyncWithUser(user)) return;
  const docId = sanitizeFirestoreId(driverId, MAX_LEN.CODE_ID, 'DRV');
  const publicPath = `drivers/${docId}`;
  const publicRef = doc(db, 'drivers', docId);
  const secretRef = doc(db, 'drivers', docId, 'private', 'credentials');

  let publicSnap;
  try {
    publicSnap = await getDoc(publicRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, publicPath);
  }
  if (!publicSnap.exists()) return;

  const batch = writeBatch(db);
  batch.delete(secretRef);
  batch.delete(publicRef);
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, publicPath);
  }
}

export async function upsertVehicleInFirestore(
  user: User | null,
  vehicle: VehicleMaster,
  previousId?: string
): Promise<void> {
  if (!canSyncWithUser(user)) return;
  const docId = sanitizeFirestoreId(vehicle.id, MAX_LEN.CODE_ID, 'UNT');
  if (previousId) {
    const oldDocId = sanitizeFirestoreId(previousId, MAX_LEN.CODE_ID, 'UNT');
    if (oldDocId !== docId) {
      await deleteVehicleFromFirestore(user, oldDocId);
    }
  }

  const path = `vehicles/${docId}`;
  const ref = doc(db, 'vehicles', docId);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const validStatus: VehicleMaster['status'] =
    vehicle.status === 'Dalam Tugas' || vehicle.status === 'Perawatan'
      ? vehicle.status
      : 'Siap Jalan';

  const mutableFields = {
    plateNumber: clampString(vehicle.plateNumber, MAX_LEN.VEHICLE_PLATE, '-'),
    vehicleType: clampString(vehicle.vehicleType, MAX_LEN.VEHICLE_TYPE),
    capacity: clampString(vehicle.capacity, MAX_LEN.VEHICLE_CAPACITY),
    status: validStatus,
  };

  if (!snap.exists()) {
    try {
      await setDoc(ref, {
        id: docId,
        ...mutableFields,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    return;
  }

  if (shallowFieldsEqual(snap.data() as Record<string, unknown>, mutableFields)) {
    return;
  }

  try {
    await updateDoc(ref, {
      ...mutableFields,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteVehicleFromFirestore(
  user: User | null,
  vehicleId: string
): Promise<void> {
  if (!canSyncWithUser(user)) return;
  const docId = sanitizeFirestoreId(vehicleId, MAX_LEN.CODE_ID, 'UNT');
  const path = `vehicles/${docId}`;
  const ref = doc(db, 'vehicles', docId);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
  if (!snap.exists()) return;
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function upsertOriginInFirestore(
  user: User | null,
  origin: OriginMaster,
  previousId?: string
): Promise<void> {
  if (!canSyncWithUser(user)) return;
  const docId = sanitizeFirestoreId(origin.id, MAX_LEN.CODE_ID, 'LOC');
  if (previousId) {
    const oldDocId = sanitizeFirestoreId(previousId, MAX_LEN.CODE_ID, 'LOC');
    if (oldDocId !== docId) {
      await deleteOriginFromFirestore(user, oldDocId);
    }
  }

  const path = `origins/${docId}`;
  const ref = doc(db, 'origins', docId);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const mutableFields = {
    name: clampString(origin.name, MAX_LEN.ORIGIN_NAME, '-'),
    address: clampString(origin.address, MAX_LEN.ORIGIN_ADDRESS),
  };

  if (!snap.exists()) {
    try {
      await setDoc(ref, {
        id: docId,
        ...mutableFields,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    return;
  }

  if (shallowFieldsEqual(snap.data() as Record<string, unknown>, mutableFields)) {
    return;
  }

  try {
    await updateDoc(ref, {
      ...mutableFields,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteOriginFromFirestore(
  user: User | null,
  originId: string
): Promise<void> {
  if (!canSyncWithUser(user)) return;
  const docId = sanitizeFirestoreId(originId, MAX_LEN.CODE_ID, 'LOC');
  const path = `origins/${docId}`;
  const ref = doc(db, 'origins', docId);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
  if (!snap.exists()) return;
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function upsertRouteInFirestore(
  user: User | null,
  route: RouteMaster,
  previousId?: string
): Promise<void> {
  if (!canSyncWithUser(user)) return;
  const docId = sanitizeFirestoreId(route.id, MAX_LEN.CODE_ID, 'RT');
  if (previousId) {
    const oldDocId = sanitizeFirestoreId(previousId, MAX_LEN.CODE_ID, 'RT');
    if (oldDocId !== docId) {
      await deleteRouteFromFirestore(user, oldDocId);
    }
  }

  const path = `routes/${docId}`;
  const ref = doc(db, 'routes', docId);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const mutableFields = {
    destination: clampString(route.destination, MAX_LEN.ROUTE_DEST, '-'),
    picName: clampString(route.picName, MAX_LEN.ROUTE_PIC_NAME),
    picPhone: clampString(route.picPhone, MAX_LEN.ROUTE_PIC_PHONE),
  };

  if (!snap.exists()) {
    try {
      await setDoc(ref, {
        id: docId,
        ...mutableFields,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    return;
  }

  if (shallowFieldsEqual(snap.data() as Record<string, unknown>, mutableFields)) {
    return;
  }

  try {
    await updateDoc(ref, {
      ...mutableFields,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteRouteFromFirestore(
  user: User | null,
  routeId: string
): Promise<void> {
  if (!canSyncWithUser(user)) return;
  const docId = sanitizeFirestoreId(routeId, MAX_LEN.CODE_ID, 'RT');
  const path = `routes/${docId}`;
  const ref = doc(db, 'routes', docId);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
  if (!snap.exists()) return;
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function upsertAssignmentInFirestore(
  user: User | null,
  assignment: Assignment
): Promise<void> {
  if (!canSyncWithUser(user)) return;
  const docId = sanitizeFirestoreId(assignment.id, MAX_LEN.DOC_ID, 'asg');
  const path = `assignments/${docId}`;
  const ref = doc(db, 'assignments', docId);

  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const validStatus: TaskStatus =
    assignment.status === TaskStatus.DALAM_PERJALANAN ||
    assignment.status === TaskStatus.SELESAI
      ? assignment.status
      : TaskStatus.MENUNGGU_BERANGKAT;

  const seqNum = Math.max(
    1,
    Math.floor(Number(assignment.sequenceNumber) || 1)
  );
  const depKm =
    typeof assignment.departureData?.kmAwal === 'number' &&
    Number.isFinite(assignment.departureData.kmAwal)
      ? assignment.departureData.kmAwal
      : -1;
  const hoKm =
    typeof assignment.handoverData?.kmAkhir === 'number' &&
    Number.isFinite(assignment.handoverData.kmAkhir)
      ? assignment.handoverData.kmAkhir
      : -1;

  const mutableFields = {
    noSuratJalanFisik: clampString(
      assignment.noSuratJalanFisik,
      MAX_LEN.ASG_SURAT_JALAN
    ),
    kodeSegel: clampString(assignment.kodeSegel, MAX_LEN.ASG_SEGEL),
    tanggalTugas: clampString(
      assignment.tanggalTugas,
      MAX_LEN.ASG_TANGGAL,
      new Date().toISOString().slice(0, 10)
    ),
    jadwalJamTiba: clampString(
      assignment.jadwalJamTiba,
      MAX_LEN.ASG_JADWAL_TIBA
    ),
    driverCode: clampString(assignment.driverId, MAX_LEN.CODE_ID, 'DRV-000'),
    driverName: clampString(assignment.driverName, MAX_LEN.DRIVER_NAME, '-'),
    driverPhone: clampString(assignment.driverPhone, MAX_LEN.DRIVER_PHONE),
    vehicleCode: clampString(assignment.vehicleId, MAX_LEN.CODE_ID),
    plateNumber: clampString(assignment.plateNumber, MAX_LEN.VEHICLE_PLATE, '-'),
    vehicleType: clampString(assignment.vehicleType, MAX_LEN.VEHICLE_TYPE),
    originCode: clampString(assignment.originId, MAX_LEN.CODE_ID),
    origin: clampString(assignment.origin, MAX_LEN.ROUTE_DEST, '-'),
    routeCode: clampString(assignment.routeId, MAX_LEN.CODE_ID),
    destination: clampString(assignment.destination, MAX_LEN.ROUTE_DEST, '-'),
    purpose: clampString(assignment.purpose, MAX_LEN.ASG_PURPOSE),
    status: validStatus,
    depTimestamp: clampString(
      assignment.departureData?.timestamp,
      MAX_LEN.ASG_TIMESTAMP
    ),
    depKmAwal: depKm,
    depSuhuAwal: clampString(
      assignment.departureData?.suhuAwal,
      MAX_LEN.ASG_SUHU
    ),
    depBbmAwal: clampString(
      assignment.departureData?.bbmAwal,
      MAX_LEN.ASG_BBM
    ),
    depKondisi: clampString(
      assignment.departureData?.kondisiKendaraan,
      MAX_LEN.ASG_KONDISI
    ),
    depCatatan: clampString(
      assignment.departureData?.catatanBerangkat,
      MAX_LEN.ASG_NOTES
    ),
    hoTimestamp: clampString(
      assignment.handoverData?.timestamp,
      MAX_LEN.ASG_TIMESTAMP
    ),
    hoKmAkhir: hoKm,
    hoSuhuAkhir: clampString(
      assignment.handoverData?.suhuAkhir,
      MAX_LEN.ASG_SUHU
    ),
    hoBbmAkhir: clampString(
      assignment.handoverData?.bbmAkhir,
      MAX_LEN.ASG_BBM
    ),
    hoPenerima: clampString(
      assignment.handoverData?.penerimaNama,
      MAX_LEN.DRIVER_NAME
    ),
    hoKondisi: clampString(
      assignment.handoverData?.kondisiAkhir,
      MAX_LEN.ASG_KONDISI
    ),
    hoCatatan: clampString(
      assignment.handoverData?.catatanSerahTerima,
      MAX_LEN.ASG_NOTES
    ),
    notes: clampString(assignment.notes, MAX_LEN.ASG_NOTES),
  };

  if (!snap.exists()) {
    try {
      await setDoc(ref, {
        id: docId,
        sequenceNumber: seqNum,
        noPenugasan: clampString(
          assignment.noPenugasan,
          MAX_LEN.ASG_NO_PENUGASAN,
          `ST-CRK/${seqNum}`
        ),
        ...mutableFields,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    return;
  }

  const existingData = snap.data() as Record<string, unknown>;
  if (shallowFieldsEqual(existingData, mutableFields)) {
    return;
  }

  // Respect terminal state locking if existing is 'Selesai' and current user is not bootstrap admin
  if (
    existingData.status === TaskStatus.SELESAI &&
    user.email !== BOOTSTRAP_ADMIN_EMAIL
  ) {
    return;
  }

  try {
    await updateDoc(ref, {
      ...mutableFields,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteAssignmentFromFirestore(
  user: User | null,
  assignmentId: string
): Promise<void> {
  if (!canSyncWithUser(user)) return;
  const docId = sanitizeFirestoreId(assignmentId, MAX_LEN.DOC_ID, 'asg');
  const path = `assignments/${docId}`;
  const ref = doc(db, 'assignments', docId);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
  if (!snap.exists()) return;
  try {
    await deleteDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function upsertConfigInFirestore(
  user: User | null,
  config: AppConfig
): Promise<void> {
  if (!canSyncWithUser(user)) return;
  const path = `configs/${user.uid}`;
  const ref = doc(db, 'configs', user.uid);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }

  const mutableFields = {
    spreadsheetId: clampString(config.spreadsheetId, MAX_LEN.CFG_SHEET_ID),
    spreadsheetTitle: clampString(
      config.spreadsheetTitle,
      MAX_LEN.CFG_SHEET_TITLE
    ),
    spreadsheetUrl: clampString(config.spreadsheetUrl, MAX_LEN.CFG_SHEET_URL),
    dispatcherWaPhone: clampString(
      config.dispatcherWaPhone,
      MAX_LEN.CFG_WA_PHONE
    ),
    whatsappTargetMode:
      config.whatsappTargetMode === 'DIRECT'
        ? ('DIRECT' as const)
        : ('GROUP' as const),
    whatsappGroupName: clampString(
      config.whatsappGroupName,
      MAX_LEN.CFG_WA_GROUP_NAME
    ),
    whatsappGroupInviteUrl: clampString(
      config.whatsappGroupInviteUrl,
      MAX_LEN.CFG_WA_GROUP_URL
    ),
    letterPrefix: clampString(
      config.letterPrefix,
      MAX_LEN.CFG_PREFIX,
      'ST-CRK'
    ),
    lastSequence: Math.max(0, Math.floor(Number(config.lastSequence) || 0)),
  };

  if (!snap.exists()) {
    try {
      await setDoc(ref, {
        ...mutableFields,
        ownerUid: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, path);
    }
    return;
  }

  if (shallowFieldsEqual(snap.data() as Record<string, unknown>, mutableFields)) {
    return;
  }

  try {
    await updateDoc(ref, {
      ...mutableFields,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ============================================================================
// 5. Full Workspace Pull, Reconcile & Real-Time Listeners
// ============================================================================

export interface FirestoreWorkspaceSnapshot {
  hasAnyCloudData: boolean;
  config: Partial<AppConfig> | null;
  drivers: DriverMaster[];
  vehicles: VehicleMaster[];
  origins: OriginMaster[];
  routes: RouteMaster[];
  assignments: Assignment[];
}

function mapDocToAssignment(data: Record<string, unknown>): Assignment {
  const depTimestamp = String(data.depTimestamp || '');
  const depKmAwal =
    typeof data.depKmAwal === 'number' && data.depKmAwal >= 0
      ? data.depKmAwal
      : 0;
  const hasDeparture =
    depTimestamp.length > 0 ||
    (typeof data.depKmAwal === 'number' && data.depKmAwal >= 0) ||
    String(data.depSuhuAwal || '').length > 0;

  const hoTimestamp = String(data.hoTimestamp || '');
  const hoKmAkhir =
    typeof data.hoKmAkhir === 'number' && data.hoKmAkhir >= 0
      ? data.hoKmAkhir
      : 0;
  const hasHandover =
    hoTimestamp.length > 0 ||
    (typeof data.hoKmAkhir === 'number' && data.hoKmAkhir >= 0) ||
    String(data.hoPenerima || '').length > 0;

  const rawStatus = String(data.status || '');
  const status: TaskStatus =
    rawStatus === TaskStatus.SELESAI
      ? TaskStatus.SELESAI
      : rawStatus === TaskStatus.DALAM_PERJALANAN
        ? TaskStatus.DALAM_PERJALANAN
        : TaskStatus.MENUNGGU_BERANGKAT;

  return {
    id: String(data.id || ''),
    sequenceNumber: Math.max(1, Math.floor(Number(data.sequenceNumber) || 1)),
    noPenugasan: String(data.noPenugasan || ''),
    noSuratJalanFisik: String(data.noSuratJalanFisik || ''),
    kodeSegel: String(data.kodeSegel || ''),
    createdAt: timestampToIso(data.createdAt),
    tanggalTugas: String(data.tanggalTugas || ''),
    jadwalJamTiba: String(data.jadwalJamTiba || ''),
    driverId: String(data.driverCode || ''),
    driverName: String(data.driverName || ''),
    driverPhone: String(data.driverPhone || ''),
    vehicleId: String(data.vehicleCode || ''),
    plateNumber: String(data.plateNumber || ''),
    vehicleType: String(data.vehicleType || ''),
    originId: String(data.originCode || ''),
    origin: String(data.origin || ''),
    routeId: String(data.routeCode || ''),
    destination: String(data.destination || ''),
    purpose: String(data.purpose || ''),
    status,
    departureData: hasDeparture
      ? {
          timestamp: depTimestamp,
          kmAwal: depKmAwal,
          suhuAwal: String(data.depSuhuAwal || ''),
          bbmAwal: String(data.depBbmAwal || ''),
          kondisiKendaraan: String(data.depKondisi || ''),
          catatanBerangkat: String(data.depCatatan || ''),
        }
      : undefined,
    handoverData: hasHandover
      ? {
          timestamp: hoTimestamp,
          kmAkhir: hoKmAkhir,
          suhuAkhir: String(data.hoSuhuAkhir || ''),
          bbmAkhir: String(data.hoBbmAkhir || ''),
          penerimaNama: String(data.hoPenerima || ''),
          kondisiAkhir: String(data.hoKondisi || ''),
          catatanSerahTerima: String(data.hoCatatan || ''),
        }
      : undefined,
    notes: String(data.notes || ''),
  };
}

async function hydrateDriverSecrets(
  driverDocs: Array<Record<string, unknown>>
): Promise<DriverMaster[]> {
  return Promise.all(
    driverDocs.map(async (pub) => {
      const drvId = String(pub.id || '');
      const secretPath = `drivers/${drvId}/private/credentials`;
      let phone = '';
      let pin = '';
      try {
        const secretSnap = await getDoc(
          doc(db, 'drivers', drvId, 'private', 'credentials')
        );
        if (secretSnap.exists()) {
          const secData = secretSnap.data();
          phone = String(secData.phone || '');
          pin = String(secData.pin || '');
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.GET, secretPath);
      }
      return {
        id: drvId,
        name: String(pub.name || ''),
        phone,
        pin,
        licenseType: String(pub.licenseType || ''),
        active: pub.active !== false,
      };
    })
  );
}

export async function pullWorkspaceFromFirestore(
  user: User
): Promise<FirestoreWorkspaceSnapshot | null> {
  if (!canSyncWithUser(user)) return null;

  await ensureAdminBootstrapRecord(user);

  const ownerFilter = where('ownerUid', '==', user.uid);
  const configPath = `configs/${user.uid}`;

  let configSnap;
  try {
    configSnap = await getDoc(doc(db, 'configs', user.uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, configPath);
  }

  let driversSnap;
  try {
    driversSnap = await getDocs(query(collection(db, 'drivers'), ownerFilter));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'drivers');
  }

  let vehiclesSnap;
  try {
    vehiclesSnap = await getDocs(
      query(collection(db, 'vehicles'), ownerFilter)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'vehicles');
  }

  let originsSnap;
  try {
    originsSnap = await getDocs(query(collection(db, 'origins'), ownerFilter));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'origins');
  }

  let routesSnap;
  try {
    routesSnap = await getDocs(query(collection(db, 'routes'), ownerFilter));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'routes');
  }

  let assignmentsSnap;
  try {
    assignmentsSnap = await getDocs(
      query(collection(db, 'assignments'), ownerFilter)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'assignments');
  }

  const drivers = await hydrateDriverSecrets(
    driversSnap.docs.map((d) => d.data() as Record<string, unknown>)
  );

  const vehicles: VehicleMaster[] = vehiclesSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: String(data.id || d.id),
      plateNumber: String(data.plateNumber || ''),
      vehicleType: String(data.vehicleType || ''),
      capacity: String(data.capacity || ''),
      status:
        data.status === 'Dalam Tugas' || data.status === 'Perawatan'
          ? data.status
          : 'Siap Jalan',
    };
  });

  const origins: OriginMaster[] = originsSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: String(data.id || d.id),
      name: String(data.name || ''),
      address: String(data.address || ''),
    };
  });

  const routes: RouteMaster[] = routesSnap.docs.map((d) => {
    const data = d.data();
    return {
      id: String(data.id || d.id),
      destination: String(data.destination || ''),
      picName: String(data.picName || ''),
      picPhone: String(data.picPhone || ''),
    };
  });

  const assignments: Assignment[] = assignmentsSnap.docs.map((d) =>
    mapDocToAssignment(d.data() as Record<string, unknown>)
  );

  let config: Partial<AppConfig> | null = null;
  if (configSnap.exists()) {
    const cfg = configSnap.data();
    config = {
      spreadsheetId: String(cfg.spreadsheetId || ''),
      spreadsheetTitle: String(cfg.spreadsheetTitle || ''),
      spreadsheetUrl: String(cfg.spreadsheetUrl || ''),
      dispatcherWaPhone: String(cfg.dispatcherWaPhone || ''),
      whatsappTargetMode:
        cfg.whatsappTargetMode === 'DIRECT' ? 'DIRECT' : 'GROUP',
      whatsappGroupName: String(cfg.whatsappGroupName || ''),
      whatsappGroupInviteUrl: String(cfg.whatsappGroupInviteUrl || ''),
      letterPrefix: String(cfg.letterPrefix || 'ST-CRK'),
      lastSequence: Math.max(0, Math.floor(Number(cfg.lastSequence) || 0)),
    };
  }

  const hasAnyCloudData =
    configSnap.exists() ||
    drivers.length > 0 ||
    vehicles.length > 0 ||
    origins.length > 0 ||
    routes.length > 0 ||
    assignments.length > 0;

  return {
    hasAnyCloudData,
    config,
    drivers,
    vehicles,
    origins,
    routes,
    assignments,
  };
}

export async function reconcileFullStateToFirestore(
  user: User | null,
  state: AppStateResponse,
  pruneExtraneous = false
): Promise<void> {
  if (!canSyncWithUser(user)) return;

  await ensureAdminBootstrapRecord(user);
  await upsertConfigInFirestore(user, state.config);

  for (const drv of state.drivers) {
    await upsertDriverInFirestore(user, drv);
  }
  for (const veh of state.vehicles) {
    await upsertVehicleInFirestore(user, veh);
  }
  for (const org of state.origins) {
    await upsertOriginInFirestore(user, org);
  }
  for (const rt of state.routes) {
    await upsertRouteInFirestore(user, rt);
  }
  for (const asg of state.assignments) {
    await upsertAssignmentInFirestore(user, asg);
  }

  if (pruneExtraneous) {
    const currentCloud = await pullWorkspaceFromFirestore(user);
    if (!currentCloud) return;

    const validDriverIds = new Set(
      state.drivers.map((d) => sanitizeFirestoreId(d.id, MAX_LEN.CODE_ID, 'DRV'))
    );
    for (const cDrv of currentCloud.drivers) {
      if (!validDriverIds.has(cDrv.id)) {
        await deleteDriverFromFirestore(user, cDrv.id);
      }
    }

    const validVehicleIds = new Set(
      state.vehicles.map((v) =>
        sanitizeFirestoreId(v.id, MAX_LEN.CODE_ID, 'UNT')
      )
    );
    for (const cVeh of currentCloud.vehicles) {
      if (!validVehicleIds.has(cVeh.id)) {
        await deleteVehicleFromFirestore(user, cVeh.id);
      }
    }

    const validOriginIds = new Set(
      state.origins.map((o) => sanitizeFirestoreId(o.id, MAX_LEN.CODE_ID, 'LOC'))
    );
    for (const cOrg of currentCloud.origins) {
      if (!validOriginIds.has(cOrg.id)) {
        await deleteOriginFromFirestore(user, cOrg.id);
      }
    }

    const validRouteIds = new Set(
      state.routes.map((r) => sanitizeFirestoreId(r.id, MAX_LEN.CODE_ID, 'RT'))
    );
    for (const cRt of currentCloud.routes) {
      if (!validRouteIds.has(cRt.id)) {
        await deleteRouteFromFirestore(user, cRt.id);
      }
    }

    const validAsgIds = new Set(
      state.assignments.map((a) =>
        sanitizeFirestoreId(a.id, MAX_LEN.DOC_ID, 'asg')
      )
    );
    for (const cAsg of currentCloud.assignments) {
      if (!validAsgIds.has(cAsg.id)) {
        await deleteAssignmentFromFirestore(user, cAsg.id);
      }
    }
  }
}

export function subscribeToFirestoreWorkspace(
  user: User,
  onUpdate: (partial: Partial<FirestoreWorkspaceSnapshot>) => void
): () => void {
  if (!canSyncWithUser(user)) {
    return () => undefined;
  }

  const ownerFilter = where('ownerUid', '==', user.uid);
  const unsubscribes: Array<() => void> = [];

  unsubscribes.push(
    onSnapshot(
      doc(db, 'configs', user.uid),
      (snap) => {
        if (!snap.exists()) return;
        const cfg = snap.data();
        onUpdate({
          config: {
            spreadsheetId: String(cfg.spreadsheetId || ''),
            spreadsheetTitle: String(cfg.spreadsheetTitle || ''),
            spreadsheetUrl: String(cfg.spreadsheetUrl || ''),
            dispatcherWaPhone: String(cfg.dispatcherWaPhone || ''),
            whatsappTargetMode:
              cfg.whatsappTargetMode === 'DIRECT' ? 'DIRECT' : 'GROUP',
            whatsappGroupName: String(cfg.whatsappGroupName || ''),
            whatsappGroupInviteUrl: String(cfg.whatsappGroupInviteUrl || ''),
            letterPrefix: String(cfg.letterPrefix || 'ST-CRK'),
            lastSequence: Math.max(0, Math.floor(Number(cfg.lastSequence) || 0)),
          },
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.GET, `configs/${user.uid}`);
      }
    )
  );

  unsubscribes.push(
    onSnapshot(
      query(collection(db, 'drivers'), ownerFilter),
      (snap) => {
        void hydrateDriverSecrets(
          snap.docs.map((d) => d.data() as Record<string, unknown>)
        ).then((drivers) => {
          onUpdate({ drivers });
        });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'drivers');
      }
    )
  );

  unsubscribes.push(
    onSnapshot(
      query(collection(db, 'vehicles'), ownerFilter),
      (snap) => {
        const vehicles: VehicleMaster[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            plateNumber: String(data.plateNumber || ''),
            vehicleType: String(data.vehicleType || ''),
            capacity: String(data.capacity || ''),
            status:
              data.status === 'Dalam Tugas' || data.status === 'Perawatan'
                ? data.status
                : 'Siap Jalan',
          };
        });
        onUpdate({ vehicles });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'vehicles');
      }
    )
  );

  unsubscribes.push(
    onSnapshot(
      query(collection(db, 'origins'), ownerFilter),
      (snap) => {
        const origins: OriginMaster[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            name: String(data.name || ''),
            address: String(data.address || ''),
          };
        });
        onUpdate({ origins });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'origins');
      }
    )
  );

  unsubscribes.push(
    onSnapshot(
      query(collection(db, 'routes'), ownerFilter),
      (snap) => {
        const routes: RouteMaster[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: String(data.id || d.id),
            destination: String(data.destination || ''),
            picName: String(data.picName || ''),
            picPhone: String(data.picPhone || ''),
          };
        });
        onUpdate({ routes });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'routes');
      }
    )
  );

  unsubscribes.push(
    onSnapshot(
      query(collection(db, 'assignments'), ownerFilter),
      (snap) => {
        const assignments: Assignment[] = snap.docs.map((d) =>
          mapDocToAssignment(d.data() as Record<string, unknown>)
        );
        onUpdate({ assignments });
      },
      (error) => {
        handleFirestoreError(error, OperationType.LIST, 'assignments');
      }
    )
  );

  return () => {
    for (const unsub of unsubscribes) {
      unsub();
    }
  };
}
