import dotenv from 'dotenv';
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface DriverRecord {
  id: string;
  name: string;
  phone: string;
  pin: string;
  licenseType: string;
  active: boolean;
}

interface VehicleRecord {
  id: string;
  plateNumber: string;
  vehicleType: string;
  capacity: string;
  status: 'Siap Jalan' | 'Dalam Tugas' | 'Perawatan';
}

interface OriginRecord {
  id: string;
  name: string;
  address: string;
}

interface RouteRecord {
  id: string;
  destination: string;
  picName: string;
  picPhone: string;
}

interface DepartureData {
  timestamp: string;
  kmAwal: number;
  suhuAwal: string;
  bbmAwal: string;
  kondisiKendaraan: string;
  catatanBerangkat: string;
  fotoOdometerBerangkat?: string;
  fotoSuhuBerangkat?: string;
}

interface HandoverData {
  timestamp: string;
  kmAkhir: number;
  suhuAkhir: string;
  bbmAkhir: string;
  penerimaNama: string;
  kondisiAkhir: string;
  catatanSerahTerima: string;
  fotoOdometerSerahTerima?: string;
  fotoSuhuSerahTerima?: string;
  fotoBuktiSerahTerima?: string;
  tandaTanganPenerima?: string;
}

interface AssignmentRecord {
  id: string;
  sequenceNumber: number;
  noPenugasan: string;
  noSuratJalanFisik: string;
  kodeSegel: string;
  createdAt: string;
  tanggalTugas: string;
  jadwalJamTiba?: string;
  driverId: string;
  driverName: string;
  driverPhone: string;
  vehicleId: string;
  plateNumber: string;
  vehicleType: string;
  originId: string;
  origin: string;
  routeId: string;
  destination: string;
  purpose: string;
  status: 'Menunggu Berangkat' | 'Dalam Perjalanan' | 'Selesai';
  departureData?: DepartureData;
  handoverData?: HandoverData;
  notes: string;
  needsSheetSync?: boolean;
}

interface NotificationRecord {
  id: string;
  timestamp: string;
  eventType: 'SURAT_TUGAS' | 'KEBERANGKATAN' | 'SERAH_TERIMA' | 'UJI_JARINGAN';
  noPenugasan: string;
  driverId: string;
  driverName: string;
  plateNumber: string;
  targetPhone: string;
  message: string;
  waDirectUrl: string;
  waGroupUrl: string;
  networkStatus: 'TERKIRIM_GATEWAY' | 'SIAP_GATEWAY' | 'GAGAL_JARINGAN';
  gatewayDetail: string;
}

interface PersistentStore {
  adminPin: string;
  isDefaultPin: boolean;
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  lastSyncedAt: string | null;
  dispatcherWaPhone: string;
  whatsappTargetMode: 'GROUP' | 'DIRECT';
  whatsappGroupName: string;
  whatsappGroupInviteUrl: string;
  letterPrefix: string;
  lastSequence: number;
  drivers: DriverRecord[];
  vehicles: VehicleRecord[];
  origins: OriginRecord[];
  routes: RouteRecord[];
  assignments: AssignmentRecord[];
  notifications: NotificationRecord[];
}

const DATA_DIR = path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'dispatch-store.json');

function getInitialStore(): PersistentStore {
  return {
    adminPin: '123456',
    isDefaultPin: true,
    spreadsheetId: (process.env.GOOGLE_SPREADSHEET_ID || '').trim(),
    spreadsheetTitle: '',
    spreadsheetUrl: '',
    lastSyncedAt: null,
    dispatcherWaPhone: (process.env.WHATSAPP_DEFAULT_TARGET || '').trim(),
    whatsappTargetMode: 'GROUP',
    whatsappGroupName: 'Grup Operasional CRK Logistik',
    whatsappGroupInviteUrl: '',
    letterPrefix: 'ST-CRK',
    lastSequence: 0,
    drivers: [],
    vehicles: [],
    origins: [],
    routes: [],
    assignments: [],
    notifications: [],
  };
}

function loadStore(): PersistentStore {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(STORE_PATH)) {
      const initial = getInitialStore();
      fs.writeFileSync(STORE_PATH, JSON.stringify(initial, null, 2), 'utf-8');
      return initial;
    }
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<PersistentStore>;
    return {
      ...getInitialStore(),
      ...parsed,
      whatsappTargetMode:
        parsed.whatsappTargetMode === 'DIRECT' ? 'DIRECT' : 'GROUP',
      whatsappGroupName:
        typeof parsed.whatsappGroupName === 'string'
          ? parsed.whatsappGroupName
          : 'Grup Operasional CRK Logistik',
      whatsappGroupInviteUrl:
        typeof parsed.whatsappGroupInviteUrl === 'string'
          ? parsed.whatsappGroupInviteUrl
          : '',
      drivers: Array.isArray(parsed.drivers) ? parsed.drivers : [],
      vehicles: Array.isArray(parsed.vehicles) ? parsed.vehicles : [],
      origins: Array.isArray(parsed.origins) ? parsed.origins : [],
      routes: Array.isArray(parsed.routes) ? parsed.routes : [],
      assignments: Array.isArray(parsed.assignments)
        ? parsed.assignments.map((a) => ({
            ...a,
            noSuratJalanFisik: a.noSuratJalanFisik || '',
            kodeSegel: a.kodeSegel || '',
            originId: a.originId || '',
          }))
        : [],
      notifications: Array.isArray(parsed.notifications)
        ? parsed.notifications.map((n) => ({
            ...n,
            waGroupUrl: n.waGroupUrl || buildWaGroupUrl(n.message || ''),
            waDirectUrl:
              n.waDirectUrl ||
              buildWaDirectUrl(n.targetPhone || '', n.message || ''),
          }))
        : [],
    };
  } catch (err) {
    console.error('Failed to read store, initializing clean store:', err);
    return getInitialStore();
  }
}

function saveStore(storeObj: PersistentStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify(storeObj, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write store:', err);
  }
}

let store: PersistentStore = loadStore();

function extractSequenceFromNo(noPenugasan: string): number {
  const cleaned = String(noPenugasan || '').trim();
  const match = cleaned.match(/(\d+)\s*$/);
  if (match) {
    const num = parseInt(match[1], 10);
    return Number.isFinite(num) ? num : 0;
  }
  return 0;
}

function computeNextSequence(currentStore: PersistentStore): number {
  let maxSeq = currentStore.lastSequence || 0;
  for (const item of currentStore.assignments) {
    if (typeof item.sequenceNumber === 'number' && item.sequenceNumber > maxSeq) {
      maxSeq = item.sequenceNumber;
    }
    const parsedFromNo = extractSequenceFromNo(item.noPenugasan);
    if (parsedFromNo > maxSeq) {
      maxSeq = parsedFromNo;
    }
  }
  return maxSeq + 1;
}

function formatSequentialNo(prefix: string, seq: number, dateStr?: string): string {
  const safePrefix = (prefix || 'ST-CRK').trim().toUpperCase();
  const d = dateStr ? new Date(dateStr) : new Date();
  const year = Number.isNaN(d.getTime()) ? new Date().getFullYear() : d.getFullYear();
  const month = String(
    (Number.isNaN(d.getTime()) ? new Date().getMonth() : d.getMonth()) + 1
  ).padStart(2, '0');
  const paddedSeq = String(seq).padStart(4, '0');
  return `${safePrefix}/${year}/${month}/${paddedSeq}`;
}

function normalizePhone(phone: string): string {
  const token = String(phone || '')
    .split(',')[0]
    .trim();
  if (
    !token ||
    token.includes('@g.us') ||
    token.startsWith('http://') ||
    token.startsWith('https://')
  ) {
    return '';
  }
  const digits = token.replace(/[^\d+]/g, '').trim();
  if (!digits) return '';
  if (digits.startsWith('08')) {
    return '62' + digits.slice(1);
  }
  if (digits.startsWith('+62')) {
    return digits.slice(1);
  }
  if (digits.startsWith('8')) {
    return '62' + digits;
  }
  return digits.replace(/^\+/, '');
}

function buildWaGroupUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

function buildWaDirectUrl(targetPhone: string, message: string): string {
  const cleanPhone = normalizePhone(targetPhone);
  const encoded = encodeURIComponent(message);
  if (cleanPhone) {
    return `https://wa.me/${cleanPhone}?text=${encoded}`;
  }
  return `https://wa.me/?text=${encoded}`;
}

function pinsMatchResilient(storedPin: string, enteredPin: string): boolean {
  const a = String(storedPin ?? '').trim();
  const b = String(enteredPin ?? '').trim();
  if (!a) return true;
  if (a === b) return true;
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    if (a.replace(/^0+/, '') === b.replace(/^0+/, '') && b.length >= a.length) {
      return true;
    }
  }
  return false;
}

async function dispatchWhatsAppNetwork(params: {
  eventType: 'SURAT_TUGAS' | 'KEBERANGKATAN' | 'SERAH_TERIMA' | 'UJI_JARINGAN';
  noPenugasan: string;
  driverId: string;
  driverName: string;
  plateNumber: string;
  targets: string[];
  message: string;
}): Promise<NotificationRecord> {
  const apiUrl = (process.env.WHATSAPP_API_URL || '').trim();
  const apiToken = (process.env.WHATSAPP_API_TOKEN || '').trim();
  const cleanedPhoneTargets = Array.from(
    new Set(params.targets.map(normalizePhone).filter(Boolean))
  );
  const groupJidTarget = store.whatsappGroupInviteUrl.includes('@g.us')
    ? store.whatsappGroupInviteUrl.trim()
    : '';
  const gatewayTargets = Array.from(
    new Set([groupJidTarget, ...cleanedPhoneTargets].filter(Boolean))
  );

  const primaryPhone =
    cleanedPhoneTargets[0] || normalizePhone(store.dispatcherWaPhone);
  const preferGroup = store.whatsappTargetMode === 'GROUP';

  const waGroupUrl = buildWaGroupUrl(params.message);
  const waDirectUrl = preferGroup
    ? waGroupUrl
    : buildWaDirectUrl(primaryPhone, params.message);

  const targetDisplay = preferGroup
    ? store.whatsappGroupName || 'Grup WhatsApp'
    : cleanedPhoneTargets.length > 0
    ? cleanedPhoneTargets.join(', ')
    : store.dispatcherWaPhone || store.whatsappGroupName || 'Grup WhatsApp';

  let networkStatus: 'TERKIRIM_GATEWAY' | 'SIAP_GATEWAY' | 'GAGAL_JARINGAN' =
    'SIAP_GATEWAY';
  let gatewayDetail = preferGroup
    ? `Siap dikirim 1-klik ke Grup WhatsApp (${
        store.whatsappGroupName || 'Pilih Grup di WhatsApp'
      }).`
    : 'Siap dikirim 1-klik langsung ke Aplikasi WhatsApp.';

  if (apiUrl && gatewayTargets.length > 0) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 6500);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiToken) {
        headers['Authorization'] = apiToken;
      }

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          target: gatewayTargets.join(','),
          phone: gatewayTargets[0],
          group: groupJidTarget || undefined,
          message: params.message,
          eventType: params.eventType,
          noPenugasan: params.noPenugasan,
          driverId: params.driverId,
          driverName: params.driverName,
          plateNumber: params.plateNumber,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        networkStatus = 'TERKIRIM_GATEWAY';
        gatewayDetail = `Terkirim otomatis via WhatsApp Gateway (HTTP ${response.status}) & tersedia tombol 1-klik Grup/Personal.`;
      } else {
        networkStatus = 'GAGAL_JARINGAN';
        gatewayDetail = `Gateway merespons HTTP ${response.status}. Gunakan pengiriman WhatsApp 1-klik.`;
      }
    } catch (err: unknown) {
      networkStatus = 'GAGAL_JARINGAN';
      const msg = err instanceof Error ? err.message : 'Koneksi gateway gagal';
      gatewayDetail = `Gateway tidak terjangkau (${msg}). Gunakan pengiriman WhatsApp 1-klik.`;
    }
  }

  const record: NotificationRecord = {
    id: `WA-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    eventType: params.eventType,
    noPenugasan: params.noPenugasan,
    driverId: params.driverId,
    driverName: params.driverName,
    plateNumber: params.plateNumber,
    targetPhone: targetDisplay,
    message: params.message,
    waDirectUrl,
    waGroupUrl,
    networkStatus,
    gatewayDetail,
  };

  store.notifications = [record, ...store.notifications].slice(0, 200);
  saveStore(store);
  return record;
}

function buildPublicState() {
  const sortedAssignments = [...store.assignments].sort((a, b) => {
    if (b.sequenceNumber !== a.sequenceNumber) {
      return b.sequenceNumber - a.sequenceNumber;
    }
    return b.createdAt.localeCompare(a.createdAt);
  });

  return {
    drivers: store.drivers,
    vehicles: store.vehicles,
    origins: store.origins,
    routes: store.routes,
    assignments: sortedAssignments,
    notifications: store.notifications,
    config: {
      spreadsheetId: store.spreadsheetId,
      spreadsheetTitle: store.spreadsheetTitle,
      spreadsheetUrl: store.spreadsheetUrl,
      lastSyncedAt: store.lastSyncedAt,
      dispatcherWaPhone: store.dispatcherWaPhone,
      whatsappTargetMode: store.whatsappTargetMode || 'GROUP',
      whatsappGroupName:
        store.whatsappGroupName || 'Grup Operasional CRK Logistik',
      whatsappGroupInviteUrl: store.whatsappGroupInviteUrl || '',
      letterPrefix: store.letterPrefix || 'ST-CRK',
      lastSequence: store.lastSequence,
      isDefaultPin: store.isDefaultPin,
      whatsappGatewayConfigured: Boolean(
        (process.env.WHATSAPP_API_URL || '').trim()
      ),
    },
  };
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Support compressed Cold Chain camera photos + canvas signatures
  app.use(express.json({ limit: '30mb' }));

  app.get('/api/state', (_req, res) => {
    res.json(buildPublicState());
  });

  app.get('/api/assignments/next-number', (req, res) => {
    const tanggal =
      typeof req.query.tanggal === 'string' ? req.query.tanggal : undefined;
    const nextSeq = computeNextSequence(store);
    const nextNo = formatSequentialNo(store.letterPrefix, nextSeq, tanggal);
    res.json({ sequenceNumber: nextSeq, noPenugasan: nextNo });
  });

  // Resilient Driver Login
  app.post('/api/auth/driver', (req, res) => {
    const driverId = String(req.body?.driverId || '').trim();
    const pin = String(req.body?.pin || '').trim();

    if (!driverId) {
      res
        .status(400)
        .json({ error: 'Pilih ID Driver terlebih dahulu dari daftar dropdown.' });
      return;
    }

    const driver = store.drivers.find(
      (d) => d.id.trim().toLowerCase() === driverId.toLowerCase()
    );

    if (!driver) {
      res.status(404).json({
        error:
          'ID Driver tidak ditemukan. Silakan tekan tombol Sinkronkan Data untuk memuat data terbaru dari Spreadsheet.',
      });
      return;
    }

    if (driver.active === false) {
      res.status(403).json({
        error: `ID Driver ${driver.id} (${driver.name}) berstatus nonaktif. Silakan hubungi Admin Dispatcher.`,
      });
      return;
    }

    if (!pinsMatchResilient(driver.pin, pin)) {
      res.status(401).json({
        error:
          'PIN Driver tidak sesuai. Pastikan angka PIN benar atau hubungi Admin Dispatcher.',
      });
      return;
    }

    res.json({
      success: true,
      driver,
    });
  });

  // Admin Login
  app.post('/api/auth/admin', (req, res) => {
    const pin = String(req.body?.pin || '').trim();
    if (!pin) {
      res.status(400).json({ error: 'Masukkan PIN Admin Dispatcher.' });
      return;
    }

    if (pin !== store.adminPin.trim()) {
      res.status(401).json({ error: 'PIN Admin Dispatcher tidak valid.' });
      return;
    }

    res.json({
      success: true,
      isDefaultPin: store.isDefaultPin,
    });
  });

  // Admin Change Own PIN
  app.put('/api/admin/pin', (req, res) => {
    const currentPin = String(req.body?.currentPin || '').trim();
    const newPin = String(req.body?.newPin || '').trim();

    if (!currentPin || !newPin) {
      res.status(400).json({ error: 'PIN lama dan PIN baru wajib diisi.' });
      return;
    }

    if (currentPin !== store.adminPin.trim()) {
      res.status(401).json({ error: 'PIN saat ini tidak sesuai.' });
      return;
    }

    if (newPin.length < 4) {
      res
        .status(400)
        .json({ error: 'PIN baru minimal terdiri dari 4 karakter/angka.' });
      return;
    }

    store.adminPin = newPin;
    store.isDefaultPin = false;
    saveStore(store);

    res.json({
      success: true,
      adminPin: store.adminPin,
      state: buildPublicState(),
    });
  });

  // Update Config
  app.put('/api/config', (req, res) => {
    const {
      spreadsheetId,
      spreadsheetTitle,
      spreadsheetUrl,
      dispatcherWaPhone,
      whatsappTargetMode,
      whatsappGroupName,
      whatsappGroupInviteUrl,
      letterPrefix,
      lastSyncedAt,
    } = req.body || {};

    if (typeof spreadsheetId === 'string') {
      const nextId = spreadsheetId.trim();
      if (req.body?.resetLocalCache === true) {
        store.drivers = [];
        store.vehicles = [];
        store.origins = [];
        store.routes = [];
        store.assignments = [];
        store.lastSequence = 0;
      }
      store.spreadsheetId = nextId;
    }
    if (typeof spreadsheetTitle === 'string')
      store.spreadsheetTitle = spreadsheetTitle.trim();
    if (typeof spreadsheetUrl === 'string')
      store.spreadsheetUrl = spreadsheetUrl.trim();
    if (typeof dispatcherWaPhone === 'string')
      store.dispatcherWaPhone = dispatcherWaPhone.trim();
    if (whatsappTargetMode === 'GROUP' || whatsappTargetMode === 'DIRECT') {
      store.whatsappTargetMode = whatsappTargetMode;
    }
    if (typeof whatsappGroupName === 'string') {
      store.whatsappGroupName = whatsappGroupName.trim();
    }
    if (typeof whatsappGroupInviteUrl === 'string') {
      store.whatsappGroupInviteUrl = whatsappGroupInviteUrl.trim();
    }
    if (typeof letterPrefix === 'string' && letterPrefix.trim()) {
      store.letterPrefix = letterPrefix.trim().toUpperCase();
    }
    if (lastSyncedAt !== undefined) store.lastSyncedAt = lastSyncedAt;

    saveStore(store);
    res.json({
      success: true,
      adminPin: store.adminPin,
      state: buildPublicState(),
    });
  });

  // Sync from Google Sheets while preserving local photos & canvas signatures
  app.post('/api/sync/from-sheets', (req, res) => {
    const {
      spreadsheetId,
      spreadsheetTitle,
      spreadsheetUrl,
      drivers,
      vehicles,
      origins,
      routes,
      assignments,
      adminPin,
      dispatcherWaPhone,
      whatsappTargetMode,
      whatsappGroupName,
      whatsappGroupInviteUrl,
      letterPrefix,
    } = req.body || {};

    if (typeof spreadsheetId === 'string' && spreadsheetId.trim()) {
      store.spreadsheetId = spreadsheetId.trim();
    }
    if (typeof spreadsheetTitle === 'string') {
      store.spreadsheetTitle = spreadsheetTitle.trim();
    }
    if (typeof spreadsheetUrl === 'string') {
      store.spreadsheetUrl = spreadsheetUrl.trim();
    }
    if (typeof dispatcherWaPhone === 'string' && dispatcherWaPhone.trim()) {
      store.dispatcherWaPhone = dispatcherWaPhone.trim();
    }
    if (whatsappTargetMode === 'GROUP' || whatsappTargetMode === 'DIRECT') {
      store.whatsappTargetMode = whatsappTargetMode;
    }
    if (typeof whatsappGroupName === 'string' && whatsappGroupName.trim()) {
      store.whatsappGroupName = whatsappGroupName.trim();
    }
    if (
      typeof whatsappGroupInviteUrl === 'string' &&
      whatsappGroupInviteUrl.trim()
    ) {
      store.whatsappGroupInviteUrl = whatsappGroupInviteUrl.trim();
    }
    if (typeof letterPrefix === 'string' && letterPrefix.trim()) {
      store.letterPrefix = letterPrefix.trim().toUpperCase();
    }
    if (typeof adminPin === 'string' && adminPin.trim().length >= 4) {
      store.adminPin = adminPin.trim();
      if (store.adminPin !== '123456') {
        store.isDefaultPin = false;
      }
    }

    if (Array.isArray(drivers)) store.drivers = drivers;
    if (Array.isArray(vehicles)) store.vehicles = vehicles;
    if (Array.isArray(origins)) store.origins = origins;
    if (Array.isArray(routes)) store.routes = routes;

    let hasPendingDriverUpdates = false;
    if (Array.isArray(assignments)) {
      const localByNo = new Map<string, AssignmentRecord>();
      for (const localItem of store.assignments) {
        localByNo.set(localItem.noPenugasan, localItem);
      }

      const usedLocalNos = new Set<string>();
      const merged: AssignmentRecord[] = assignments.map(
        (sheetItem: AssignmentRecord) => {
          const existingLocal = localByNo.get(sheetItem.noPenugasan);
          if (existingLocal) {
            usedLocalNos.add(sheetItem.noPenugasan);
            if (existingLocal.needsSheetSync) {
              hasPendingDriverUpdates = true;
              return existingLocal;
            }
            // Preserve base64 photos & signature stored on server
            return {
              ...sheetItem,
              departureData: sheetItem.departureData
                ? {
                    ...sheetItem.departureData,
                    fotoOdometerBerangkat:
                      existingLocal.departureData?.fotoOdometerBerangkat,
                    fotoSuhuBerangkat:
                      existingLocal.departureData?.fotoSuhuBerangkat,
                  }
                : existingLocal.departureData,
              handoverData: sheetItem.handoverData
                ? {
                    ...sheetItem.handoverData,
                    fotoOdometerSerahTerima:
                      existingLocal.handoverData?.fotoOdometerSerahTerima,
                    fotoSuhuSerahTerima:
                      existingLocal.handoverData?.fotoSuhuSerahTerima,
                    fotoBuktiSerahTerima:
                      existingLocal.handoverData?.fotoBuktiSerahTerima,
                    tandaTanganPenerima:
                      existingLocal.handoverData?.tandaTanganPenerima,
                  }
                : existingLocal.handoverData,
              needsSheetSync: false,
            };
          }
          return {
            ...sheetItem,
            needsSheetSync: false,
          };
        }
      );

      for (const [noKey, localItem] of localByNo.entries()) {
        if (!usedLocalNos.has(noKey) && localItem.needsSheetSync) {
          hasPendingDriverUpdates = true;
          merged.push(localItem);
        }
      }

      store.assignments = merged;
    }

    let maxSeq = 0;
    for (const a of store.assignments) {
      const s = Math.max(
        a.sequenceNumber || 0,
        extractSequenceFromNo(a.noPenugasan)
      );
      if (s > maxSeq) maxSeq = s;
    }
    store.lastSequence = maxSeq;
    store.lastSyncedAt = new Date().toISOString();

    saveStore(store);
    res.json({
      success: true,
      hasPendingDriverUpdates,
      adminPin: store.adminPin,
      state: buildPublicState(),
    });
  });

  // Hydrate & reconcile server state with Cloud Firestore while preserving local photos, signatures & in-flight driver updates
  app.post('/api/sync/from-firestore', (req, res) => {
    const {
      config: cloudConfig,
      drivers,
      vehicles,
      origins,
      routes,
      assignments,
      replaceCollections,
    } = req.body || {};

    if (cloudConfig && typeof cloudConfig === 'object') {
      if (
        typeof cloudConfig.spreadsheetId === 'string' &&
        (cloudConfig.spreadsheetId.trim() || !store.spreadsheetId)
      ) {
        store.spreadsheetId = cloudConfig.spreadsheetId.trim();
      }
      if (
        typeof cloudConfig.spreadsheetTitle === 'string' &&
        (cloudConfig.spreadsheetTitle.trim() || !store.spreadsheetTitle)
      ) {
        store.spreadsheetTitle = cloudConfig.spreadsheetTitle.trim();
      }
      if (
        typeof cloudConfig.spreadsheetUrl === 'string' &&
        (cloudConfig.spreadsheetUrl.trim() || !store.spreadsheetUrl)
      ) {
        store.spreadsheetUrl = cloudConfig.spreadsheetUrl.trim();
      }
      if (
        typeof cloudConfig.dispatcherWaPhone === 'string' &&
        (cloudConfig.dispatcherWaPhone.trim() || !store.dispatcherWaPhone)
      ) {
        store.dispatcherWaPhone = cloudConfig.dispatcherWaPhone.trim();
      }
      if (
        cloudConfig.whatsappTargetMode === 'GROUP' ||
        cloudConfig.whatsappTargetMode === 'DIRECT'
      ) {
        store.whatsappTargetMode = cloudConfig.whatsappTargetMode;
      }
      if (
        typeof cloudConfig.whatsappGroupName === 'string' &&
        cloudConfig.whatsappGroupName.trim()
      ) {
        store.whatsappGroupName = cloudConfig.whatsappGroupName.trim();
      }
      if (typeof cloudConfig.whatsappGroupInviteUrl === 'string') {
        store.whatsappGroupInviteUrl = cloudConfig.whatsappGroupInviteUrl.trim();
      }
      if (
        typeof cloudConfig.letterPrefix === 'string' &&
        cloudConfig.letterPrefix.trim()
      ) {
        store.letterPrefix = cloudConfig.letterPrefix.trim().toUpperCase();
      }
      if (
        typeof cloudConfig.lastSequence === 'number' &&
        cloudConfig.lastSequence > store.lastSequence
      ) {
        store.lastSequence = cloudConfig.lastSequence;
      }
    }

    let hasLocalUpdatesForCloud = false;

    if (Array.isArray(drivers)) {
      const localDriverMap = new Map<string, DriverRecord>();
      for (const d of store.drivers) {
        localDriverMap.set(d.id.trim().toLowerCase(), d);
      }
      const nextDrivers: DriverRecord[] = drivers.map((cloudDrv: DriverRecord) => {
        const existingLocal = localDriverMap.get(
          String(cloudDrv.id || '').trim().toLowerCase()
        );
        return {
          id: String(cloudDrv.id || '').trim(),
          name: String(cloudDrv.name || '').trim(),
          phone:
            cloudDrv.phone !== undefined && cloudDrv.phone !== ''
              ? String(cloudDrv.phone)
              : existingLocal?.phone || '',
          pin:
            cloudDrv.pin !== undefined && cloudDrv.pin !== ''
              ? String(cloudDrv.pin)
              : existingLocal?.pin || '',
          licenseType: String(cloudDrv.licenseType || ''),
          active: cloudDrv.active !== false,
        };
      });

      if (!replaceCollections) {
        const cloudIds = new Set(
          nextDrivers.map((d) => d.id.trim().toLowerCase())
        );
        for (const localDrv of store.drivers) {
          if (!cloudIds.has(localDrv.id.trim().toLowerCase())) {
            nextDrivers.push(localDrv);
            hasLocalUpdatesForCloud = true;
          }
        }
      }
      store.drivers = nextDrivers;
    }

    if (Array.isArray(vehicles)) {
      const localVehicleMap = new Map<string, VehicleRecord>();
      for (const v of store.vehicles) {
        localVehicleMap.set(v.id.trim().toLowerCase(), v);
      }
      const nextVehicles: VehicleRecord[] = [...vehicles];
      if (!replaceCollections) {
        const cloudIds = new Set(
          nextVehicles.map((v) => String(v.id || '').trim().toLowerCase())
        );
        for (const localVeh of store.vehicles) {
          if (!cloudIds.has(localVeh.id.trim().toLowerCase())) {
            nextVehicles.push(localVeh);
            hasLocalUpdatesForCloud = true;
          }
        }
      } else {
        // Preserve vehicle status if an active local driver update changed it
        for (let i = 0; i < nextVehicles.length; i++) {
          const localVeh = localVehicleMap.get(
            nextVehicles[i].id.trim().toLowerCase()
          );
          const hasUnsyncedAsg = store.assignments.some(
            (a) =>
              a.needsSheetSync &&
              a.plateNumber.trim().toLowerCase() ===
                nextVehicles[i].plateNumber.trim().toLowerCase()
          );
          if (localVeh && hasUnsyncedAsg && localVeh.status !== nextVehicles[i].status) {
            nextVehicles[i] = { ...nextVehicles[i], status: localVeh.status };
            hasLocalUpdatesForCloud = true;
          }
        }
      }
      store.vehicles = nextVehicles;
    }

    if (Array.isArray(origins)) {
      const nextOrigins: OriginRecord[] = [...origins];
      if (!replaceCollections) {
        const cloudIds = new Set(
          nextOrigins.map((o) => String(o.id || '').trim().toLowerCase())
        );
        for (const localOrg of store.origins) {
          if (!cloudIds.has(localOrg.id.trim().toLowerCase())) {
            nextOrigins.push(localOrg);
            hasLocalUpdatesForCloud = true;
          }
        }
      }
      store.origins = nextOrigins;
    }

    if (Array.isArray(routes)) {
      const nextRoutes: RouteRecord[] = [...routes];
      if (!replaceCollections) {
        const cloudIds = new Set(
          nextRoutes.map((r) => String(r.id || '').trim().toLowerCase())
        );
        for (const localRt of store.routes) {
          if (!cloudIds.has(localRt.id.trim().toLowerCase())) {
            nextRoutes.push(localRt);
            hasLocalUpdatesForCloud = true;
          }
        }
      }
      store.routes = nextRoutes;
    }

    const statusRank = (s: string): number => {
      if (s === 'Selesai') return 2;
      if (s === 'Dalam Perjalanan') return 1;
      return 0;
    };

    if (Array.isArray(assignments)) {
      const localById = new Map<string, AssignmentRecord>();
      for (const localItem of store.assignments) {
        localById.set(localItem.id, localItem);
      }

      const usedLocalIds = new Set<string>();
      const mergedAssignments: AssignmentRecord[] = assignments.map(
        (cloudItem: AssignmentRecord) => {
          const existingLocal = localById.get(cloudItem.id);
          if (existingLocal) {
            usedLocalIds.add(existingLocal.id);
            // If driver progressed status locally on server, keep local progression and flag cloud push
            if (
              existingLocal.needsSheetSync ||
              statusRank(existingLocal.status) > statusRank(cloudItem.status)
            ) {
              hasLocalUpdatesForCloud = true;
              return existingLocal;
            }
            return {
              ...cloudItem,
              createdAt: existingLocal.createdAt || cloudItem.createdAt,
              departureData: cloudItem.departureData
                ? {
                    ...cloudItem.departureData,
                    fotoOdometerBerangkat:
                      existingLocal.departureData?.fotoOdometerBerangkat,
                    fotoSuhuBerangkat:
                      existingLocal.departureData?.fotoSuhuBerangkat,
                  }
                : existingLocal.departureData,
              handoverData: cloudItem.handoverData
                ? {
                    ...cloudItem.handoverData,
                    fotoOdometerSerahTerima:
                      existingLocal.handoverData?.fotoOdometerSerahTerima,
                    fotoSuhuSerahTerima:
                      existingLocal.handoverData?.fotoSuhuSerahTerima,
                    fotoBuktiSerahTerima:
                      existingLocal.handoverData?.fotoBuktiSerahTerima,
                    tandaTanganPenerima:
                      existingLocal.handoverData?.tandaTanganPenerima,
                  }
                : existingLocal.handoverData,
              needsSheetSync: existingLocal.needsSheetSync ?? false,
            };
          }
          return {
            ...cloudItem,
            needsSheetSync: false,
          };
        }
      );

      if (!replaceCollections) {
        for (const [localId, localItem] of localById.entries()) {
          if (!usedLocalIds.has(localId)) {
            mergedAssignments.push(localItem);
            hasLocalUpdatesForCloud = true;
          }
        }
      } else {
        for (const [localId, localItem] of localById.entries()) {
          if (!usedLocalIds.has(localId) && localItem.needsSheetSync) {
            mergedAssignments.push(localItem);
            hasLocalUpdatesForCloud = true;
          }
        }
      }

      store.assignments = mergedAssignments;
    }

    let maxSeq = store.lastSequence || 0;
    for (const a of store.assignments) {
      const s = Math.max(
        a.sequenceNumber || 0,
        extractSequenceFromNo(a.noPenugasan)
      );
      if (s > maxSeq) maxSeq = s;
    }
    store.lastSequence = maxSeq;

    saveStore(store);
    res.json({
      success: true,
      hasLocalUpdatesForCloud,
      state: buildPublicState(),
    });
  });

  app.post('/api/sync/mark-pushed', (_req, res) => {
    store.assignments = store.assignments.map((a) => ({
      ...a,
      needsSheetSync: false,
    }));
    store.lastSyncedAt = new Date().toISOString();
    saveStore(store);
    res.json({ success: true, state: buildPublicState() });
  });

  // Master Data: Drivers CRUD (without No. Polisi Default)
  app.post('/api/master/drivers', (req, res) => {
    const id = String(req.body?.id || '').trim().toUpperCase();
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const pin = String(req.body?.pin || '').trim();
    const licenseType = String(req.body?.licenseType || 'SIM B1').trim();
    const active = req.body?.active !== false;

    if (!id || !name) {
      res.status(400).json({ error: 'ID Driver dan Nama Driver wajib diisi.' });
      return;
    }

    if (store.drivers.some((d) => d.id.toLowerCase() === id.toLowerCase())) {
      res
        .status(409)
        .json({ error: `ID Driver ${id} sudah terdaftar di Master Data.` });
      return;
    }

    store.drivers.push({ id, name, phone, pin, licenseType, active });
    saveStore(store);
    res.json({ success: true, state: buildPublicState() });
  });

  app.put('/api/master/drivers/:id', (req, res) => {
    const targetId = String(req.params.id || '').trim().toLowerCase();
    const idx = store.drivers.findIndex((d) => d.id.toLowerCase() === targetId);
    if (idx === -1) {
      res.status(404).json({ error: 'Data Driver tidak ditemukan.' });
      return;
    }

    const updatedId = String(req.body?.id || store.drivers[idx].id)
      .trim()
      .toUpperCase();
    const duplicate = store.drivers.find(
      (d, i) => i !== idx && d.id.toLowerCase() === updatedId.toLowerCase()
    );
    if (duplicate) {
      res
        .status(409)
        .json({ error: `ID Driver ${updatedId} sudah digunakan driver lain.` });
      return;
    }

    store.drivers[idx] = {
      id: updatedId,
      name: String(req.body?.name ?? store.drivers[idx].name).trim(),
      phone: String(req.body?.phone ?? store.drivers[idx].phone).trim(),
      pin: String(req.body?.pin ?? store.drivers[idx].pin).trim(),
      licenseType: String(
        req.body?.licenseType ?? store.drivers[idx].licenseType
      ).trim(),
      active:
        req.body?.active !== undefined
          ? Boolean(req.body.active)
          : store.drivers[idx].active,
    };

    saveStore(store);
    res.json({ success: true, state: buildPublicState() });
  });

  app.delete('/api/master/drivers/:id', (req, res) => {
    const targetId = String(req.params.id || '').trim().toLowerCase();
    const before = store.drivers.length;
    store.drivers = store.drivers.filter((d) => d.id.toLowerCase() !== targetId);
    if (store.drivers.length === before) {
      res.status(404).json({ error: 'Data Driver tidak ditemukan.' });
      return;
    }
    saveStore(store);
    res.json({ success: true, state: buildPublicState() });
  });

  // Master Data: Vehicles CRUD (without Odometer KM Terakhir)
  app.post('/api/master/vehicles', (req, res) => {
    const id = String(req.body?.id || '').trim().toUpperCase();
    const plateNumber = String(req.body?.plateNumber || '').trim().toUpperCase();
    const vehicleType = String(req.body?.vehicleType || '').trim();
    const capacity = String(req.body?.capacity || '').trim();
    const status =
      (req.body?.status as VehicleRecord['status']) || 'Siap Jalan';

    if (!id || !plateNumber) {
      res
        .status(400)
        .json({ error: 'Kode Unit dan Nomor Polisi wajib diisi.' });
      return;
    }

    if (store.vehicles.some((v) => v.id.toLowerCase() === id.toLowerCase())) {
      res.status(409).json({ error: `Kode Unit ${id} sudah terdaftar.` });
      return;
    }

    store.vehicles.push({ id, plateNumber, vehicleType, capacity, status });
    saveStore(store);
    res.json({ success: true, state: buildPublicState() });
  });

  app.put('/api/master/vehicles/:id', (req, res) => {
    const targetId = String(req.params.id || '').trim().toLowerCase();
    const idx = store.vehicles.findIndex((v) => v.id.toLowerCase() === targetId);
    if (idx === -1) {
      res.status(404).json({ error: 'Data Armada tidak ditemukan.' });
      return;
    }

    const updatedId = String(req.body?.id || store.vehicles[idx].id)
      .trim()
      .toUpperCase();
    const duplicate = store.vehicles.find(
      (v, i) => i !== idx && v.id.toLowerCase() === updatedId.toLowerCase()
    );
    if (duplicate) {
      res
        .status(409)
        .json({ error: `Kode Unit ${updatedId} sudah digunakan unit lain.` });
      return;
    }

    store.vehicles[idx] = {
      id: updatedId,
      plateNumber: String(
        req.body?.plateNumber ?? store.vehicles[idx].plateNumber
      )
        .trim()
        .toUpperCase(),
      vehicleType: String(
        req.body?.vehicleType ?? store.vehicles[idx].vehicleType
      ).trim(),
      capacity: String(
        req.body?.capacity ?? store.vehicles[idx].capacity
      ).trim(),
      status:
        (req.body?.status as VehicleRecord['status']) ||
        store.vehicles[idx].status,
    };

    saveStore(store);
    res.json({ success: true, state: buildPublicState() });
  });

  app.delete('/api/master/vehicles/:id', (req, res) => {
    const targetId = String(req.params.id || '').trim().toLowerCase();
    const before = store.vehicles.length;
    store.vehicles = store.vehicles.filter(
      (v) => v.id.toLowerCase() !== targetId
    );
    if (store.vehicles.length === before) {
      res.status(404).json({ error: 'Data Armada tidak ditemukan.' });
      return;
    }
    saveStore(store);
    res.json({ success: true, state: buildPublicState() });
  });

  // Master Data: Lokasi Asal CRUD (New Requirement #8)
  app.post('/api/master/origins', (req, res) => {
    const id = String(req.body?.id || '').trim().toUpperCase();
    const name = String(req.body?.name || '').trim();
    const address = String(req.body?.address || '').trim();

    if (!id || !name) {
      res
        .status(400)
        .json({ error: 'Kode Lokasi Asal dan Nama Lokasi Asal wajib diisi.' });
      return;
    }

    if (store.origins.some((o) => o.id.toLowerCase() === id.toLowerCase())) {
      res
        .status(409)
        .json({ error: `Kode Lokasi Asal ${id} sudah terdaftar.` });
      return;
    }

    store.origins.push({ id, name, address });
    saveStore(store);
    res.json({ success: true, state: buildPublicState() });
  });

  app.put('/api/master/origins/:id', (req, res) => {
    const targetId = String(req.params.id || '').trim().toLowerCase();
    const idx = store.origins.findIndex((o) => o.id.toLowerCase() === targetId);
    if (idx === -1) {
      res.status(404).json({ error: 'Data Lokasi Asal tidak ditemukan.' });
      return;
    }

    const updatedId = String(req.body?.id || store.origins[idx].id)
      .trim()
      .toUpperCase();
    const duplicate = store.origins.find(
      (o, i) => i !== idx && o.id.toLowerCase() === updatedId.toLowerCase()
    );
    if (duplicate) {
      res
        .status(409)
        .json({ error: `Kode Lokasi Asal ${updatedId} sudah digunakan.` });
      return;
    }

    store.origins[idx] = {
      id: updatedId,
      name: String(req.body?.name ?? store.origins[idx].name).trim(),
      address: String(req.body?.address ?? store.origins[idx].address).trim(),
    };

    saveStore(store);
    res.json({ success: true, state: buildPublicState() });
  });

  app.delete('/api/master/origins/:id', (req, res) => {
    const targetId = String(req.params.id || '').trim().toLowerCase();
    const before = store.origins.length;
    store.origins = store.origins.filter(
      (o) => o.id.toLowerCase() !== targetId
    );
    if (store.origins.length === before) {
      res.status(404).json({ error: 'Data Lokasi Asal tidak ditemukan.' });
      return;
    }
    saveStore(store);
    res.json({ success: true, state: buildPublicState() });
  });

  // Master Data: Routes / Tujuan CRUD (without Lokasi Asal & Estimasi Jarak)
  app.post('/api/master/routes', (req, res) => {
    const id = String(req.body?.id || '').trim().toUpperCase();
    const destination = String(req.body?.destination || '').trim();
    const picName = String(req.body?.picName || '').trim();
    const picPhone = String(req.body?.picPhone || '').trim();

    if (!id || !destination) {
      res
        .status(400)
        .json({ error: 'Kode Rute dan Lokasi Tujuan wajib diisi.' });
      return;
    }

    if (store.routes.some((r) => r.id.toLowerCase() === id.toLowerCase())) {
      res.status(409).json({ error: `Kode Rute ${id} sudah terdaftar.` });
      return;
    }

    store.routes.push({ id, destination, picName, picPhone });
    saveStore(store);
    res.json({ success: true, state: buildPublicState() });
  });

  app.put('/api/master/routes/:id', (req, res) => {
    const targetId = String(req.params.id || '').trim().toLowerCase();
    const idx = store.routes.findIndex((r) => r.id.toLowerCase() === targetId);
    if (idx === -1) {
      res.status(404).json({ error: 'Data Rute tidak ditemukan.' });
      return;
    }

    const updatedId = String(req.body?.id || store.routes[idx].id)
      .trim()
      .toUpperCase();
    const duplicate = store.routes.find(
      (r, i) => i !== idx && r.id.toLowerCase() === updatedId.toLowerCase()
    );
    if (duplicate) {
      res
        .status(409)
        .json({ error: `Kode Rute ${updatedId} sudah digunakan rute lain.` });
      return;
    }

    store.routes[idx] = {
      id: updatedId,
      destination: String(
        req.body?.destination ?? store.routes[idx].destination
      ).trim(),
      picName: String(req.body?.picName ?? store.routes[idx].picName).trim(),
      picPhone: String(req.body?.picPhone ?? store.routes[idx].picPhone).trim(),
    };

    saveStore(store);
    res.json({ success: true, state: buildPublicState() });
  });

  app.delete('/api/master/routes/:id', (req, res) => {
    const targetId = String(req.params.id || '').trim().toLowerCase();
    const before = store.routes.length;
    store.routes = store.routes.filter((r) => r.id.toLowerCase() !== targetId);
    if (store.routes.length === before) {
      res.status(404).json({ error: 'Data Rute tidak ditemukan.' });
      return;
    }
    saveStore(store);
    res.json({ success: true, state: buildPublicState() });
  });

  // Assignments CRUD + 1-Click Surat Tugas WhatsApp Notification
  app.post('/api/assignments', async (req, res) => {
    const {
      tanggalTugas,
      jadwalJamTiba,
      noSuratJalanFisik,
      kodeSegel,
      driverId,
      driverName,
      driverPhone,
      vehicleId,
      plateNumber,
      vehicleType,
      originId,
      origin,
      routeId,
      destination,
      purpose,
      notes,
    } = req.body || {};

    if (!driverId || !driverName || !plateNumber || !origin || !destination) {
      res.status(400).json({
        error:
          'Driver, Kendaraan (No. Polisi), Lokasi Asal, dan Lokasi Tujuan wajib dilengkapi.',
      });
      return;
    }

    const nextSeq = computeNextSequence(store);
    const dateVal = String(
      tanggalTugas || new Date().toISOString().slice(0, 10)
    ).trim();
    const sequentialNo = formatSequentialNo(store.letterPrefix, nextSeq, dateVal);
    const jamTibaClean = String(jadwalJamTiba || '').trim();

    const newAssignment: AssignmentRecord = {
      id: `ASG-${Date.now()}-${nextSeq}`,
      sequenceNumber: nextSeq,
      noPenugasan: sequentialNo,
      noSuratJalanFisik: String(noSuratJalanFisik || '').trim(),
      kodeSegel: String(kodeSegel || '').trim().toUpperCase(),
      createdAt: new Date().toISOString(),
      tanggalTugas: dateVal,
      jadwalJamTiba: jamTibaClean || undefined,
      driverId: String(driverId).trim(),
      driverName: String(driverName).trim(),
      driverPhone: String(driverPhone || '').trim(),
      vehicleId: String(vehicleId || '').trim(),
      plateNumber: String(plateNumber).trim().toUpperCase(),
      vehicleType: String(vehicleType || '').trim(),
      originId: String(originId || '').trim(),
      origin: String(origin).trim(),
      routeId: String(routeId || '').trim(),
      destination: String(destination).trim(),
      purpose: String(purpose || '').trim(),
      status: 'Menunggu Berangkat',
      notes: String(notes || '').trim(),
      needsSheetSync: false,
    };

    store.lastSequence = nextSeq;
    store.assignments.push(newAssignment);
    saveStore(store);

    const waMessage = [
      '*[CRK LOGISTIK DELIVERY SISTEM — SURAT TUGAS RANTAI DINGIN]*',
      store.whatsappGroupName
        ? `Grup Operasional : ${store.whatsappGroupName}`
        : '',
      `No. Penugasan : ${newAssignment.noPenugasan}`,
      newAssignment.noSuratJalanFisik
        ? `No. Surat Jalan Fisik : ${newAssignment.noSuratJalanFisik}`
        : '',
      newAssignment.kodeSegel ? `Kode Segel : ${newAssignment.kodeSegel}` : '',
      `Jadwal Tugas : ${newAssignment.tanggalTugas}${
        newAssignment.jadwalJamTiba
          ? ` (Target Tiba ${newAssignment.jadwalJamTiba})`
          : ''
      }`,
      `Driver : ${newAssignment.driverId} - ${newAssignment.driverName}`,
      `Armada Reefer : ${newAssignment.plateNumber}${
        newAssignment.vehicleType ? ` (${newAssignment.vehicleType})` : ''
      }`,
      `Lokasi Asal : ${newAssignment.origin}`,
      `Lokasi Tujuan : ${newAssignment.destination}`,
      `Muatan Dingin : ${newAssignment.purpose || '-'}`,
      newAssignment.notes
        ? `Instruksi Dispatcher : ${newAssignment.notes}`
        : '',
      '_Mohon Driver segera cek suhu box pendingin & laporkan keberangkatan melalui sistem._',
    ]
      .filter(Boolean)
      .join('\n');

    const targets = [
      newAssignment.driverPhone,
      store.dispatcherWaPhone,
    ].filter(Boolean);

    const notification = await dispatchWhatsAppNetwork({
      eventType: 'SURAT_TUGAS',
      noPenugasan: newAssignment.noPenugasan,
      driverId: newAssignment.driverId,
      driverName: newAssignment.driverName,
      plateNumber: newAssignment.plateNumber,
      targets,
      message: waMessage,
    });

    res.json({
      success: true,
      assignment: newAssignment,
      notification,
      state: buildPublicState(),
    });
  });

  app.put('/api/assignments/:id', (req, res) => {
    const targetId = String(req.params.id || '').trim();
    const idx = store.assignments.findIndex((a) => a.id === targetId);
    if (idx === -1) {
      res.status(404).json({ error: 'Surat Tugas tidak ditemukan.' });
      return;
    }

    const existing = store.assignments[idx];
    const updated: AssignmentRecord = {
      ...existing,
      tanggalTugas: String(req.body?.tanggalTugas ?? existing.tanggalTugas).trim(),
      jadwalJamTiba:
        req.body?.jadwalJamTiba !== undefined
          ? String(req.body.jadwalJamTiba || '').trim() || undefined
          : existing.jadwalJamTiba,
      noSuratJalanFisik: String(
        req.body?.noSuratJalanFisik ?? existing.noSuratJalanFisik
      ).trim(),
      kodeSegel: String(req.body?.kodeSegel ?? existing.kodeSegel)
        .trim()
        .toUpperCase(),
      driverId: String(req.body?.driverId ?? existing.driverId).trim(),
      driverName: String(req.body?.driverName ?? existing.driverName).trim(),
      driverPhone: String(req.body?.driverPhone ?? existing.driverPhone).trim(),
      vehicleId: String(req.body?.vehicleId ?? existing.vehicleId).trim(),
      plateNumber: String(req.body?.plateNumber ?? existing.plateNumber)
        .trim()
        .toUpperCase(),
      vehicleType: String(req.body?.vehicleType ?? existing.vehicleType).trim(),
      originId: String(req.body?.originId ?? existing.originId).trim(),
      origin: String(req.body?.origin ?? existing.origin).trim(),
      routeId: String(req.body?.routeId ?? existing.routeId).trim(),
      destination: String(req.body?.destination ?? existing.destination).trim(),
      purpose: String(req.body?.purpose ?? existing.purpose).trim(),
      status:
        (req.body?.status as AssignmentRecord['status']) || existing.status,
      notes: String(req.body?.notes ?? existing.notes).trim(),
    };

    if (req.body?.kmAwal !== undefined && req.body?.kmAwal !== '') {
      updated.departureData = {
        timestamp: existing.departureData?.timestamp || new Date().toISOString(),
        kmAwal: Number(req.body.kmAwal) || 0,
        suhuAwal: String(
          req.body?.suhuAwal ?? existing.departureData?.suhuAwal ?? ''
        ),
        bbmAwal: String(
          req.body?.bbmAwal ?? existing.departureData?.bbmAwal ?? 'Penuh'
        ),
        kondisiKendaraan: String(
          req.body?.kondisiKendaraan ??
            existing.departureData?.kondisiKendaraan ??
            'Pendingin Normal'
        ),
        catatanBerangkat: String(
          req.body?.catatanBerangkat ??
            existing.departureData?.catatanBerangkat ??
            ''
        ),
        fotoOdometerBerangkat: existing.departureData?.fotoOdometerBerangkat,
        fotoSuhuBerangkat: existing.departureData?.fotoSuhuBerangkat,
      };
    }

    if (req.body?.kmAkhir !== undefined && req.body?.kmAkhir !== '') {
      updated.handoverData = {
        timestamp: existing.handoverData?.timestamp || new Date().toISOString(),
        kmAkhir: Number(req.body.kmAkhir) || 0,
        suhuAkhir: String(
          req.body?.suhuAkhir ?? existing.handoverData?.suhuAkhir ?? ''
        ),
        bbmAkhir: String(
          req.body?.bbmAkhir ?? existing.handoverData?.bbmAkhir ?? '1/2'
        ),
        penerimaNama: String(
          req.body?.penerimaNama ?? existing.handoverData?.penerimaNama ?? ''
        ),
        kondisiAkhir: String(
          req.body?.kondisiAkhir ??
            existing.handoverData?.kondisiAkhir ??
            'Rantai Dingin Terjaga'
        ),
        catatanSerahTerima: String(
          req.body?.catatanSerahTerima ??
            existing.handoverData?.catatanSerahTerima ??
            ''
        ),
        fotoOdometerSerahTerima: existing.handoverData?.fotoOdometerSerahTerima,
        fotoSuhuSerahTerima: existing.handoverData?.fotoSuhuSerahTerima,
        fotoBuktiSerahTerima: existing.handoverData?.fotoBuktiSerahTerima,
        tandaTanganPenerima: existing.handoverData?.tandaTanganPenerima,
      };
    }

    store.assignments[idx] = updated;
    saveStore(store);

    res.json({
      success: true,
      assignment: updated,
      state: buildPublicState(),
    });
  });

  app.delete('/api/assignments/:id', (req, res) => {
    const targetId = String(req.params.id || '').trim();
    const before = store.assignments.length;
    store.assignments = store.assignments.filter((a) => a.id !== targetId);
    if (store.assignments.length === before) {
      res.status(404).json({ error: 'Surat Tugas tidak ditemukan.' });
      return;
    }
    saveStore(store);
    res.json({ success: true, state: buildPublicState() });
  });

  // Role Driver: Submit Cold Chain Departure Data + Real-time Timestamp + Photos + WA
  app.post('/api/assignments/:id/departure', async (req, res) => {
    const targetId = String(req.params.id || '').trim();
    const idx = store.assignments.findIndex((a) => a.id === targetId);
    if (idx === -1) {
      res.status(404).json({ error: 'Surat Tugas tidak ditemukan.' });
      return;
    }

    const assignment = store.assignments[idx];
    const kmAwal = Number(req.body?.kmAwal);
    const suhuAwal = String(req.body?.suhuAwal || '').trim();
    const bbmAwal = String(req.body?.bbmAwal || 'Penuh (Full)').trim();
    const kondisiKendaraan = String(
      req.body?.kondisiKendaraan || 'Thermo Pendingin Normal'
    ).trim();
    const catatanBerangkat = String(req.body?.catatanBerangkat || '').trim();
    const fotoOdometerBerangkat = String(
      req.body?.fotoOdometerBerangkat || ''
    ).trim();
    const fotoSuhuBerangkat = String(req.body?.fotoSuhuBerangkat || '').trim();

    if (!Number.isFinite(kmAwal) || kmAwal < 0) {
      res
        .status(400)
        .json({ error: 'Odometer KM Awal wajib diisi dengan angka valid.' });
      return;
    }

    if (!suhuAwal) {
      res.status(400).json({
        error: 'Suhu Monitor Keberangkatan wajib diisi manual oleh Driver.',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const jamWib = new Date(nowIso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    assignment.status = 'Dalam Perjalanan';
    assignment.departureData = {
      timestamp: nowIso,
      kmAwal,
      suhuAwal,
      bbmAwal,
      kondisiKendaraan,
      catatanBerangkat,
      fotoOdometerBerangkat: fotoOdometerBerangkat || undefined,
      fotoSuhuBerangkat: fotoSuhuBerangkat || undefined,
    };
    assignment.needsSheetSync = true;

    const vehicleIdx = store.vehicles.findIndex(
      (v) =>
        v.id.toLowerCase() === assignment.vehicleId.toLowerCase() ||
        v.plateNumber.toLowerCase() === assignment.plateNumber.toLowerCase()
    );
    if (vehicleIdx !== -1) {
      store.vehicles[vehicleIdx].status = 'Dalam Tugas';
    }

    saveStore(store);

    const routeObj = store.routes.find((r) => r.id === assignment.routeId);
    const targets = [store.dispatcherWaPhone, routeObj?.picPhone || ''].filter(
      Boolean
    );

    const waMessage = [
      '*[CRK LOGISTIK DELIVERY SISTEM — KEBERANGKATAN RANTAI DINGIN]*',
      store.whatsappGroupName
        ? `Grup Operasional : ${store.whatsappGroupName}`
        : '',
      `No. Penugasan : ${assignment.noPenugasan}`,
      assignment.noSuratJalanFisik
        ? `No. Surat Jalan Fisik : ${assignment.noSuratJalanFisik}`
        : '',
      assignment.kodeSegel ? `Kode Segel : ${assignment.kodeSegel}` : '',
      `Driver : ${assignment.driverId} - ${assignment.driverName}`,
      `Unit Reefer : ${assignment.plateNumber}${
        assignment.vehicleType ? ` (${assignment.vehicleType})` : ''
      }`,
      `Rute : ${assignment.origin} -> ${assignment.destination}`,
      `Muatan Dingin : ${assignment.purpose || '-'}`,
      `Timestamp Berangkat : ${jamWib}`,
      `Odometer Awal : ${kmAwal.toLocaleString('id-ID')} km`,
      `Suhu Monitor Keberangkatan : ${suhuAwal}`,
      `BBM Awal : ${bbmAwal}`,
      `Kondisi Unit : ${kondisiKendaraan}`,
      `Dokumentasi : Foto Odometer (${
        fotoOdometerBerangkat ? 'Ada' : '-'
      }), Foto Monitor Suhu (${fotoSuhuBerangkat ? 'Ada' : '-'})`,
      catatanBerangkat ? `Catatan : ${catatanBerangkat}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const notification = await dispatchWhatsAppNetwork({
      eventType: 'KEBERANGKATAN',
      noPenugasan: assignment.noPenugasan,
      driverId: assignment.driverId,
      driverName: assignment.driverName,
      plateNumber: assignment.plateNumber,
      targets,
      message: waMessage,
    });

    res.json({
      success: true,
      assignment,
      notification,
      state: buildPublicState(),
    });
  });

  // Role Driver: Submit Cold Chain Handover Data + Real-time Timestamp + Photos + Signature + WA
  app.post('/api/assignments/:id/handover', async (req, res) => {
    const targetId = String(req.params.id || '').trim();
    const idx = store.assignments.findIndex((a) => a.id === targetId);
    if (idx === -1) {
      res.status(404).json({ error: 'Surat Tugas tidak ditemukan.' });
      return;
    }

    const assignment = store.assignments[idx];
    const kmAkhir = Number(req.body?.kmAkhir);
    const suhuAkhir = String(req.body?.suhuAkhir || '').trim();
    const bbmAkhir = String(req.body?.bbmAkhir || '1/2 Tangki').trim();
    const penerimaNama = String(req.body?.penerimaNama || '').trim();
    const kondisiAkhir = String(
      req.body?.kondisiAkhir || 'Suhu & Segel Utuh - Lengkap'
    ).trim();
    const catatanSerahTerima = String(
      req.body?.catatanSerahTerima || ''
    ).trim();
    const fotoOdometerSerahTerima = String(
      req.body?.fotoOdometerSerahTerima || ''
    ).trim();
    const fotoSuhuSerahTerima = String(
      req.body?.fotoSuhuSerahTerima || ''
    ).trim();
    const fotoBuktiSerahTerima = String(
      req.body?.fotoBuktiSerahTerima || ''
    ).trim();
    const tandaTanganPenerima = String(
      req.body?.tandaTanganPenerima || ''
    ).trim();

    if (!Number.isFinite(kmAkhir) || kmAkhir < 0) {
      res
        .status(400)
        .json({ error: 'Odometer KM Akhir wajib diisi dengan angka valid.' });
      return;
    }

    const kmAwal = assignment.departureData?.kmAwal ?? 0;
    if (kmAwal > 0 && kmAkhir < kmAwal) {
      res.status(400).json({
        error: `KM Akhir (${kmAkhir}) tidak boleh lebih kecil dari KM Awal (${kmAwal}).`,
      });
      return;
    }

    if (!penerimaNama) {
      res.status(400).json({ error: 'Nama Penerima Serah Terima wajib diisi.' });
      return;
    }

    if (!suhuAkhir) {
      res.status(400).json({
        error: 'Suhu Monitor Serah Terima wajib diisi manual oleh Driver.',
      });
      return;
    }

    const nowIso = new Date().toISOString();
    const jamWib = new Date(nowIso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const selisihKm = kmAwal > 0 ? kmAkhir - kmAwal : 0;

    assignment.status = 'Selesai';
    assignment.handoverData = {
      timestamp: nowIso,
      kmAkhir,
      suhuAkhir,
      bbmAkhir,
      penerimaNama,
      kondisiAkhir,
      catatanSerahTerima,
      fotoOdometerSerahTerima: fotoOdometerSerahTerima || undefined,
      fotoSuhuSerahTerima: fotoSuhuSerahTerima || undefined,
      fotoBuktiSerahTerima: fotoBuktiSerahTerima || undefined,
      tandaTanganPenerima: tandaTanganPenerima || undefined,
    };
    assignment.needsSheetSync = true;

    const vehicleIdx = store.vehicles.findIndex(
      (v) =>
        v.id.toLowerCase() === assignment.vehicleId.toLowerCase() ||
        v.plateNumber.toLowerCase() === assignment.plateNumber.toLowerCase()
    );
    if (vehicleIdx !== -1) {
      store.vehicles[vehicleIdx].status = 'Siap Jalan';
    }

    saveStore(store);

    const routeObj = store.routes.find((r) => r.id === assignment.routeId);
    const targets = [store.dispatcherWaPhone, routeObj?.picPhone || ''].filter(
      Boolean
    );

    const waMessage = [
      '*[CRK LOGISTIK DELIVERY SISTEM — SERAH TERIMA RANTAI DINGIN]*',
      store.whatsappGroupName
        ? `Grup Operasional : ${store.whatsappGroupName}`
        : '',
      `No. Penugasan : ${assignment.noPenugasan}`,
      assignment.noSuratJalanFisik
        ? `No. Surat Jalan Fisik : ${assignment.noSuratJalanFisik}`
        : '',
      assignment.kodeSegel ? `Kode Segel : ${assignment.kodeSegel}` : '',
      `Driver : ${assignment.driverId} - ${assignment.driverName}`,
      `Unit Reefer : ${assignment.plateNumber}${
        assignment.vehicleType ? ` (${assignment.vehicleType})` : ''
      }`,
      `Rute : ${assignment.origin} -> ${assignment.destination}`,
      `Timestamp Serah Terima : ${jamWib}`,
      `KM Awal -> Akhir : ${kmAwal.toLocaleString('id-ID')} -> ${kmAkhir.toLocaleString(
        'id-ID'
      )} km (${selisihKm.toLocaleString('id-ID')} km)`,
      `Suhu Monitor Serah Terima : ${suhuAkhir}`,
      `BBM Akhir : ${bbmAkhir}`,
      `Penerima : ${penerimaNama}`,
      `Kondisi Muatan : ${kondisiAkhir}`,
      `Bukti & TTD Digital : Foto Odometer (${
        fotoOdometerSerahTerima ? 'Ada' : '-'
      }), Foto Suhu (${fotoSuhuSerahTerima ? 'Ada' : '-'}), Foto Bukti (${
        fotoBuktiSerahTerima ? 'Ada' : '-'
      }), TTD Penerima (${tandaTanganPenerima ? 'Tersimpan' : '-'})`,
      catatanSerahTerima ? `Catatan : ${catatanSerahTerima}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    const notification = await dispatchWhatsAppNetwork({
      eventType: 'SERAH_TERIMA',
      noPenugasan: assignment.noPenugasan,
      driverId: assignment.driverId,
      driverName: assignment.driverName,
      plateNumber: assignment.plateNumber,
      targets,
      message: waMessage,
    });

    res.json({
      success: true,
      assignment,
      notification,
      state: buildPublicState(),
    });
  });

  app.post('/api/whatsapp/test', async (req, res) => {
    const target = String(
      req.body?.targetPhone || store.dispatcherWaPhone || ''
    ).trim();

    const message = [
      '*[CRK LOGISTIK DELIVERY SISTEM — UJI PESAN WHATSAPP & GRUP]*',
      store.whatsappGroupName
        ? `Grup Operasional : ${store.whatsappGroupName}`
        : '',
      `Waktu Uji : ${new Date().toLocaleString('id-ID')}`,
      'Status : Pengiriman pesan ke Grup WhatsApp & Nomor Tujuan siap digunakan.',
    ]
      .filter(Boolean)
      .join('\n');

    const notification = await dispatchWhatsAppNetwork({
      eventType: 'UJI_JARINGAN',
      noPenugasan: '-',
      driverId: 'ADMIN',
      driverName: 'Admin Dispatcher',
      plateNumber: '-',
      targets: target ? [target] : [],
      message,
    });

    res.json({
      success: true,
      notification,
      state: buildPublicState(),
    });
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CRK Logistik Delivery Sistem listening on http://localhost:${PORT}`);
  });
}

startServer();
