import {
  Assignment,
  DriverMaster,
  OriginMaster,
  RouteMaster,
  TaskStatus,
  VehicleMaster,
} from '../types';

export type CanonicalSheetKey =
  | 'Master_Driver'
  | 'Master_Armada'
  | 'Master_Lokasi_Asal'
  | 'Master_Rute'
  | 'Surat_Tugas'
  | 'Konfigurasi';

const SHEET_HEADERS: Record<CanonicalSheetKey, string[]> = {
  Master_Driver: [
    'ID Driver',
    'Nama Driver',
    'No WhatsApp',
    'PIN Login',
    'Jenis SIM',
    'Status Aktif',
  ],
  Master_Armada: [
    'Kode Unit',
    'No Polisi',
    'Tipe Kendaraan Pendingin',
    'Kapasitas',
    'Status Unit',
  ],
  Master_Lokasi_Asal: [
    'Kode Lokasi Asal',
    'Nama Lokasi Asal / Cold Storage',
    'Alamat / Keterangan',
  ],
  Master_Rute: [
    'Kode Rute',
    'Lokasi Tujuan',
    'Nama PIC Tujuan',
    'No WA PIC Tujuan',
  ],
  Surat_Tugas: [
    'ID Internal',
    'Urutan',
    'No Penugasan',
    'No Surat Jalan Fisik',
    'Kode Segel',
    'Tanggal Tugas',
    'ID Driver',
    'Nama Driver',
    'No WA Driver',
    'Kode Unit',
    'No Polisi',
    'Tipe Kendaraan',
    'Kode Lokasi Asal',
    'Lokasi Asal',
    'Kode Rute',
    'Lokasi Tujuan',
    'Muatan Rantai Dingin',
    'Status',
    'Timestamp Berangkat',
    'KM Awal',
    'Suhu Awal',
    'BBM Awal',
    'Kondisi Berangkat',
    'Catatan Berangkat',
    'Status Foto Berangkat',
    'Timestamp Serah Terima',
    'KM Akhir',
    'Suhu Serah Terima',
    'BBM Akhir',
    'Penerima Serah Terima',
    'Kondisi Akhir',
    'Catatan Serah Terima',
    'Status Foto & TTD Serah Terima',
    'Catatan Dispatcher',
    'Dibuat Pada',
    'Target Jam Tiba',
  ],
  Konfigurasi: ['Kunci', 'Nilai'],
};

const SHEET_ALIASES: Record<CanonicalSheetKey, string[]> = {
  Master_Driver: [
    'master_driver',
    'master driver',
    'driver',
    'drivers',
    'data driver',
    'daftar driver',
  ],
  Master_Armada: [
    'master_armada',
    'master armada',
    'armada',
    'kendaraan',
    'unit',
    'master kendaraan',
    'data kendaraan',
  ],
  Master_Lokasi_Asal: [
    'master_lokasi_asal',
    'master lokasi asal',
    'lokasi asal',
    'lokasi_asal',
    'cold storage asal',
    'gudang asal',
  ],
  Master_Rute: [
    'master_rute',
    'master rute',
    'rute',
    'tujuan',
    'lokasi tujuan',
    'data rute',
  ],
  Surat_Tugas: [
    'surat_tugas',
    'surat tugas',
    'penugasan',
    'tugas',
    'assignments',
    'data surat tugas',
  ],
  Konfigurasi: ['konfigurasi', 'pengaturan', 'config', 'setting', 'admin'],
};

export function extractSpreadsheetId(input: string): string {
  const trimmed = String(input || '').trim();
  if (!trimmed) return '';
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }
  return trimmed;
}

interface SpreadsheetMetadata {
  spreadsheetId: string;
  spreadsheetUrl: string;
  properties?: {
    title?: string;
  };
  sheets?: Array<{
    properties?: {
      sheetId?: number;
      title?: string;
    };
  }>;
}

async function sheetsFetch<T>(
  url: string,
  accessToken: string,
  options: RequestInit = {}
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let errDetail = `HTTP ${res.status}`;
    try {
      const errBody = await res.json();
      if (errBody?.error?.message) {
        errDetail = errBody.error.message;
      }
    } catch {
      // ignore json parse error
    }
    const err = new Error(errDetail) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  return (await res.json()) as T;
}

export async function getSpreadsheetMetadata(
  accessToken: string,
  spreadsheetId: string
): Promise<{
  title: string;
  url: string;
  resolvedTabs: Record<CanonicalSheetKey, string | null>;
  allTabTitles: string[];
}> {
  const meta = await sheetsFetch<SpreadsheetMetadata>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}?includeGridData=false`,
    accessToken
  );

  const allTabTitles = (meta.sheets || [])
    .map((s) => s.properties?.title || '')
    .filter(Boolean);

  const resolvedTabs: Record<CanonicalSheetKey, string | null> = {
    Master_Driver: null,
    Master_Armada: null,
    Master_Lokasi_Asal: null,
    Master_Rute: null,
    Surat_Tugas: null,
    Konfigurasi: null,
  };

  for (const key of Object.keys(SHEET_ALIASES) as CanonicalSheetKey[]) {
    const aliases = SHEET_ALIASES[key];
    const found = allTabTitles.find((t) =>
      aliases.includes(t.trim().toLowerCase())
    );
    resolvedTabs[key] = found || null;
  }

  return {
    title: meta.properties?.title || 'CRK Logistik Delivery Sistem',
    url:
      meta.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    resolvedTabs,
    allTabTitles,
  };
}

export async function ensureSpreadsheetStructure(
  accessToken: string,
  spreadsheetId: string
): Promise<{
  title: string;
  url: string;
  tabNames: Record<CanonicalSheetKey, string>;
}> {
  const meta = await getSpreadsheetMetadata(accessToken, spreadsheetId);
  const missingKeys = (
    Object.keys(meta.resolvedTabs) as CanonicalSheetKey[]
  ).filter((k) => !meta.resolvedTabs[k]);

  const finalTabNames: Record<CanonicalSheetKey, string> = {
    Master_Driver: meta.resolvedTabs.Master_Driver || 'Master_Driver',
    Master_Armada: meta.resolvedTabs.Master_Armada || 'Master_Armada',
    Master_Lokasi_Asal:
      meta.resolvedTabs.Master_Lokasi_Asal || 'Master_Lokasi_Asal',
    Master_Rute: meta.resolvedTabs.Master_Rute || 'Master_Rute',
    Surat_Tugas: meta.resolvedTabs.Surat_Tugas || 'Surat_Tugas',
    Konfigurasi: meta.resolvedTabs.Konfigurasi || 'Konfigurasi',
  };

  if (missingKeys.length > 0) {
    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          requests: missingKeys.map((key) => ({
            addSheet: {
              properties: {
                title: key,
                gridProperties: { frozenRowCount: 1 },
              },
            },
          })),
        }),
      }
    );

    await sheetsFetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
        spreadsheetId
      )}/values:batchUpdate`,
      accessToken,
      {
        method: 'POST',
        body: JSON.stringify({
          valueInputOption: 'RAW',
          data: missingKeys.map((key) => ({
            range: `'${key}'!A1`,
            values: [SHEET_HEADERS[key]],
          })),
        }),
      }
    );
  }

  return {
    title: meta.title,
    url: meta.url,
    tabNames: finalTabNames,
  };
}

export async function createNewDatabaseSpreadsheet(
  accessToken: string,
  customTitle?: string
): Promise<{
  spreadsheetId: string;
  title: string;
  url: string;
}> {
  const title =
    (customTitle || '').trim() ||
    `CRK LOGISTIK DELIVERY SISTEM (${new Date().toISOString().slice(0, 10)})`;

  const keys = Object.keys(SHEET_HEADERS) as CanonicalSheetKey[];
  const created = await sheetsFetch<SpreadsheetMetadata>(
    'https://sheets.googleapis.com/v4/spreadsheets',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        properties: { title },
        sheets: keys.map((key) => ({
          properties: {
            title: key,
            gridProperties: { frozenRowCount: 1 },
          },
        })),
      }),
    }
  );

  const spreadsheetId = created.spreadsheetId;

  await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({
        valueInputOption: 'RAW',
        data: keys.map((key) => ({
          range: `'${key}'!A1`,
          values: [SHEET_HEADERS[key]],
        })),
      }),
    }
  );

  return {
    spreadsheetId,
    title: created.properties?.title || title,
    url:
      created.spreadsheetUrl ||
      `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
  };
}

function parseTaskStatus(raw: string): TaskStatus {
  const val = String(raw || '').trim().toLowerCase();
  if (val === 'dalam perjalanan') return TaskStatus.DALAM_PERJALANAN;
  if (val === 'selesai') return TaskStatus.SELESAI;
  return TaskStatus.MENUNGGU_BERANGKAT;
}

export async function pullAllFromSpreadsheet(
  accessToken: string,
  spreadsheetId: string
): Promise<{
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  drivers: DriverMaster[];
  vehicles: VehicleMaster[];
  origins: OriginMaster[];
  routes: RouteMaster[];
  assignments: Assignment[];
  adminPin?: string;
  dispatcherWaPhone?: string;
  whatsappTargetMode?: 'GROUP' | 'DIRECT';
  whatsappGroupName?: string;
  whatsappGroupInviteUrl?: string;
  letterPrefix?: string;
}> {
  const ensured = await ensureSpreadsheetStructure(accessToken, spreadsheetId);
  const { tabNames } = ensured;

  const ranges = [
    `'${tabNames.Master_Driver}'!A1:G2000`,
    `'${tabNames.Master_Armada}'!A1:F2000`,
    `'${tabNames.Master_Lokasi_Asal}'!A1:C2000`,
    `'${tabNames.Master_Rute}'!A1:F2000`,
    `'${tabNames.Surat_Tugas}'!A1:AL3000`,
    `'${tabNames.Konfigurasi}'!A2:B50`,
  ];

  const query = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
  const batchRes = await sheetsFetch<{
    valueRanges?: Array<{ range?: string; values?: string[][] }>;
  }>(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values:batchGet?${query}`,
    accessToken
  );

  const valueRanges = batchRes.valueRanges || [];
  const driverAll = valueRanges[0]?.values || [];
  const vehicleAll = valueRanges[1]?.values || [];
  const originAll = valueRanges[2]?.values || [];
  const routeAll = valueRanges[3]?.values || [];
  const assignmentAll = valueRanges[4]?.values || [];
  const configRows = valueRanges[5]?.values || [];

  // Parse Drivers (supports both new 6-col format and legacy 7-col format)
  const driverHeader = (driverAll[0] || []).map((h) =>
    String(h || '').toLowerCase()
  );
  const drvStatusIdx = driverHeader.findIndex((h) => h.includes('status'));
  const drivers: DriverMaster[] = driverAll
    .slice(1)
    .filter((row) => row && String(row[0] || '').trim() !== '')
    .map((row) => {
      const sIdx = drvStatusIdx >= 0 ? drvStatusIdx : row.length >= 7 ? 6 : 5;
      const statusRaw = String(row[sIdx] ?? 'Aktif').trim().toLowerCase();
      return {
        id: String(row[0] || '').trim().toUpperCase(),
        name: String(row[1] || '').trim(),
        phone: String(row[2] || '').trim(),
        pin: String(row[3] || '').trim(),
        licenseType: String(row[4] || 'SIM B1').trim(),
        active:
          statusRaw !== 'nonaktif' && statusRaw !== 'false' && statusRaw !== '0',
      };
    });

  // Parse Vehicles (supports both new 5-col format and legacy 6-col format)
  const vehHeader = (vehicleAll[0] || []).map((h) =>
    String(h || '').toLowerCase()
  );
  const vehStatusIdx = vehHeader.findIndex((h) => h.includes('status'));
  const vehicles: VehicleMaster[] = vehicleAll
    .slice(1)
    .filter(
      (row) =>
        row &&
        (String(row[0] || '').trim() !== '' ||
          String(row[1] || '').trim() !== '')
    )
    .map((row, idx) => {
      const sIdx = vehStatusIdx >= 0 ? vehStatusIdx : row.length >= 6 ? 5 : 4;
      const rawStatus = String(row[sIdx] || 'Siap Jalan').trim();
      const status: VehicleMaster['status'] =
        rawStatus === 'Dalam Tugas' || rawStatus === 'Perawatan'
          ? rawStatus
          : 'Siap Jalan';
      return {
        id: String(row[0] || `UNT-${String(idx + 1).padStart(3, '0')}`)
          .trim()
          .toUpperCase(),
        plateNumber: String(row[1] || '').trim().toUpperCase(),
        vehicleType: String(row[2] || '').trim(),
        capacity: String(row[3] || '').trim(),
        status,
      };
    });

  // Parse Master Lokasi Asal
  const origins: OriginMaster[] = originAll
    .slice(1)
    .filter((row) => row && String(row[0] || '').trim() !== '')
    .map((row) => ({
      id: String(row[0] || '').trim().toUpperCase(),
      name: String(row[1] || '').trim(),
      address: String(row[2] || '').trim(),
    }));

  // Parse Master Rute / Tujuan (supports both new 4-col format and legacy 6-col format)
  const routeHeader = (routeAll[0] || []).map((h) =>
    String(h || '').toLowerCase()
  );
  const isLegacyRoute = routeHeader.some((h) => h.includes('asal'));
  const routes: RouteMaster[] = routeAll
    .slice(1)
    .filter((row) => row && String(row[0] || '').trim() !== '')
    .map((row) =>
      isLegacyRoute
        ? {
            id: String(row[0] || '').trim().toUpperCase(),
            destination: String(row[2] || row[1] || '').trim(),
            picName: String(row[4] || '').trim(),
            picPhone: String(row[5] || '').trim(),
          }
        : {
            id: String(row[0] || '').trim().toUpperCase(),
            destination: String(row[1] || '').trim(),
            picName: String(row[2] || '').trim(),
            picPhone: String(row[3] || '').trim(),
          }
    );

  // Parse Assignments (supports both Cold Chain schema and legacy 28-col schema)
  const asgHeader = (assignmentAll[0] || []).map((h) =>
    String(h || '').toLowerCase()
  );
  const isNewColdChainSchema = asgHeader.some((h) =>
    h.includes('surat jalan fisik')
  );

  const assignments: Assignment[] = assignmentAll
    .slice(1)
    .filter((row) => row && String(row[2] || '').trim() !== '')
    .map((row, index) => {
      const noPenugasan = String(row[2] || '').trim();
      const seqNum =
        Number(row[1]) ||
        (() => {
          const m = noPenugasan.match(/(\d+)\s*$/);
          return m ? parseInt(m[1], 10) : index + 1;
        })();

      if (isNewColdChainSchema) {
        const hasDeparture =
          String(row[18] || '').trim() !== '' ||
          String(row[19] || '').trim() !== '';
        const hasHandover =
          String(row[25] || '').trim() !== '' ||
          String(row[26] || '').trim() !== '';

        return {
          id: String(row[0] || `ASG-SHEET-${seqNum}`).trim(),
          sequenceNumber: seqNum,
          noPenugasan,
          noSuratJalanFisik: String(row[3] || '').trim(),
          kodeSegel: String(row[4] || '').trim().toUpperCase(),
          tanggalTugas: String(row[5] || '').trim(),
          jadwalJamTiba: String(row[35] || '').trim() || undefined,
          driverId: String(row[6] || '').trim().toUpperCase(),
          driverName: String(row[7] || '').trim(),
          driverPhone: String(row[8] || '').trim(),
          vehicleId: String(row[9] || '').trim().toUpperCase(),
          plateNumber: String(row[10] || '').trim().toUpperCase(),
          vehicleType: String(row[11] || '').trim(),
          originId: String(row[12] || '').trim().toUpperCase(),
          origin: String(row[13] || '').trim(),
          routeId: String(row[14] || '').trim().toUpperCase(),
          destination: String(row[15] || '').trim(),
          purpose: String(row[16] || '').trim(),
          status: parseTaskStatus(row[17]),
          departureData: hasDeparture
            ? {
                timestamp: String(row[18] || ''),
                kmAwal:
                  Number(String(row[19] || '0').replace(/[^\d.-]/g, '')) || 0,
                suhuAwal: String(row[20] || ''),
                bbmAwal: String(row[21] || ''),
                kondisiKendaraan: String(row[22] || ''),
                catatanBerangkat: String(row[23] || ''),
              }
            : undefined,
          handoverData: hasHandover
            ? {
                timestamp: String(row[25] || ''),
                kmAkhir:
                  Number(String(row[26] || '0').replace(/[^\d.-]/g, '')) || 0,
                suhuAkhir: String(row[27] || ''),
                bbmAkhir: String(row[28] || ''),
                penerimaNama: String(row[29] || ''),
                kondisiAkhir: String(row[30] || ''),
                catatanSerahTerima: String(row[31] || ''),
              }
            : undefined,
          notes: String(row[33] || '').trim(),
          createdAt: String(row[34] || new Date().toISOString()).trim(),
          needsSheetSync: false,
        };
      }

      // Legacy fallback mapping
      const hasDeparture =
        String(row[15] || '').trim() !== '' ||
        String(row[16] || '').trim() !== '';
      const hasHandover =
        String(row[20] || '').trim() !== '' ||
        String(row[21] || '').trim() !== '';

      return {
        id: String(row[0] || `ASG-SHEET-${seqNum}`).trim(),
        sequenceNumber: seqNum,
        noPenugasan,
        noSuratJalanFisik: '',
        kodeSegel: '',
        tanggalTugas: String(row[3] || '').trim(),
        driverId: String(row[4] || '').trim().toUpperCase(),
        driverName: String(row[5] || '').trim(),
        driverPhone: String(row[6] || '').trim(),
        vehicleId: String(row[7] || '').trim().toUpperCase(),
        plateNumber: String(row[8] || '').trim().toUpperCase(),
        vehicleType: String(row[9] || '').trim(),
        originId: '',
        origin: String(row[11] || '').trim(),
        routeId: String(row[10] || '').trim().toUpperCase(),
        destination: String(row[12] || '').trim(),
        purpose: String(row[13] || '').trim(),
        status: parseTaskStatus(row[14]),
        departureData: hasDeparture
          ? {
              timestamp: String(row[15] || ''),
              kmAwal:
                Number(String(row[16] || '0').replace(/[^\d.-]/g, '')) || 0,
              suhuAwal: '',
              bbmAwal: String(row[17] || ''),
              kondisiKendaraan: String(row[18] || ''),
              catatanBerangkat: String(row[19] || ''),
            }
          : undefined,
        handoverData: hasHandover
          ? {
              timestamp: String(row[20] || ''),
              kmAkhir:
                Number(String(row[21] || '0').replace(/[^\d.-]/g, '')) || 0,
              suhuAkhir: '',
              bbmAkhir: String(row[22] || ''),
              penerimaNama: String(row[23] || ''),
              kondisiAkhir: String(row[24] || ''),
              catatanSerahTerima: String(row[25] || ''),
            }
          : undefined,
        notes: String(row[26] || '').trim(),
        createdAt: String(row[27] || new Date().toISOString()).trim(),
        needsSheetSync: false,
      };
    });

  let adminPin: string | undefined;
  let dispatcherWaPhone: string | undefined;
  let whatsappTargetMode: 'GROUP' | 'DIRECT' | undefined;
  let whatsappGroupName: string | undefined;
  let whatsappGroupInviteUrl: string | undefined;
  let letterPrefix: string | undefined;

  for (const row of configRows) {
    const k = String(row[0] || '').trim().toLowerCase();
    const v = String(row[1] || '').trim();
    if (k === 'admin_pin' && v) adminPin = v;
    if (k === 'dispatcher_wa' && v !== undefined) dispatcherWaPhone = v;
    if (k === 'whatsapp_target_mode' && (v === 'GROUP' || v === 'DIRECT')) {
      whatsappTargetMode = v;
    }
    if (k === 'whatsapp_group_name' && v !== undefined) whatsappGroupName = v;
    if (k === 'whatsapp_group_invite' && v !== undefined) {
      whatsappGroupInviteUrl = v;
    }
    if (k === 'letter_prefix' && v) letterPrefix = v;
  }

  return {
    spreadsheetId,
    spreadsheetTitle: ensured.title,
    spreadsheetUrl: ensured.url,
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
  };
}

async function replaceSheetRows(
  accessToken: string,
  spreadsheetId: string,
  tabName: string,
  headerRow: string[],
  dataRows: Array<Array<string | number>>
): Promise<void> {
  await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`'${tabName}'!A1:AL3000`)}:clear`,
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({}),
    }
  );

  const values = [headerRow, ...dataRows];
  await sheetsFetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
      spreadsheetId
    )}/values/${encodeURIComponent(`'${tabName}'!A1`)}?valueInputOption=RAW`,
    accessToken,
    {
      method: 'PUT',
      body: JSON.stringify({
        range: `'${tabName}'!A1`,
        majorDimension: 'ROWS',
        values,
      }),
    }
  );
}

export async function pushDriversToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  drivers: DriverMaster[]
): Promise<void> {
  const ensured = await ensureSpreadsheetStructure(accessToken, spreadsheetId);
  const rows = drivers.map((d) => [
    d.id,
    d.name,
    d.phone,
    d.pin,
    d.licenseType,
    d.active ? 'Aktif' : 'Nonaktif',
  ]);
  await replaceSheetRows(
    accessToken,
    spreadsheetId,
    ensured.tabNames.Master_Driver,
    SHEET_HEADERS.Master_Driver,
    rows
  );
}

export async function pushVehiclesToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  vehicles: VehicleMaster[]
): Promise<void> {
  const ensured = await ensureSpreadsheetStructure(accessToken, spreadsheetId);
  const rows = vehicles.map((v) => [
    v.id,
    v.plateNumber,
    v.vehicleType,
    v.capacity,
    v.status,
  ]);
  await replaceSheetRows(
    accessToken,
    spreadsheetId,
    ensured.tabNames.Master_Armada,
    SHEET_HEADERS.Master_Armada,
    rows
  );
}

export async function pushOriginsToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  origins: OriginMaster[]
): Promise<void> {
  const ensured = await ensureSpreadsheetStructure(accessToken, spreadsheetId);
  const rows = origins.map((o) => [o.id, o.name, o.address]);
  await replaceSheetRows(
    accessToken,
    spreadsheetId,
    ensured.tabNames.Master_Lokasi_Asal,
    SHEET_HEADERS.Master_Lokasi_Asal,
    rows
  );
}

export async function pushRoutesToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  routes: RouteMaster[]
): Promise<void> {
  const ensured = await ensureSpreadsheetStructure(accessToken, spreadsheetId);
  const rows = routes.map((r) => [
    r.id,
    r.destination,
    r.picName,
    r.picPhone,
  ]);
  await replaceSheetRows(
    accessToken,
    spreadsheetId,
    ensured.tabNames.Master_Rute,
    SHEET_HEADERS.Master_Rute,
    rows
  );
}

export async function pushAssignmentsToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  assignments: Assignment[]
): Promise<void> {
  const ensured = await ensureSpreadsheetStructure(accessToken, spreadsheetId);
  const sorted = [...assignments].sort(
    (a, b) => a.sequenceNumber - b.sequenceNumber
  );
  const rows = sorted.map((a) => {
    const depMediaStatus = [
      a.departureData?.fotoOdometerBerangkat ? 'Odo:Ada' : '',
      a.departureData?.fotoSuhuBerangkat ? 'Suhu:Ada' : '',
    ]
      .filter(Boolean)
      .join(', ');

    const hoMediaStatus = [
      a.handoverData?.fotoOdometerSerahTerima ? 'Odo:Ada' : '',
      a.handoverData?.fotoSuhuSerahTerima ? 'Suhu:Ada' : '',
      a.handoverData?.fotoBuktiSerahTerima ? 'Bukti:Ada' : '',
      a.handoverData?.tandaTanganPenerima ? 'TTD:Ada' : '',
    ]
      .filter(Boolean)
      .join(', ');

    return [
      a.id,
      a.sequenceNumber,
      a.noPenugasan,
      a.noSuratJalanFisik || '',
      a.kodeSegel || '',
      a.tanggalTugas,
      a.driverId,
      a.driverName,
      a.driverPhone,
      a.vehicleId,
      a.plateNumber,
      a.vehicleType,
      a.originId || '',
      a.origin,
      a.routeId,
      a.destination,
      a.purpose,
      a.status,
      a.departureData?.timestamp || '',
      a.departureData?.kmAwal ?? '',
      a.departureData?.suhuAwal || '',
      a.departureData?.bbmAwal || '',
      a.departureData?.kondisiKendaraan || '',
      a.departureData?.catatanBerangkat || '',
      depMediaStatus,
      a.handoverData?.timestamp || '',
      a.handoverData?.kmAkhir ?? '',
      a.handoverData?.suhuAkhir || '',
      a.handoverData?.bbmAkhir || '',
      a.handoverData?.penerimaNama || '',
      a.handoverData?.kondisiAkhir || '',
      a.handoverData?.catatanSerahTerima || '',
      hoMediaStatus,
      a.notes || '',
      a.createdAt,
      a.jadwalJamTiba || '',
    ];
  });
  await replaceSheetRows(
    accessToken,
    spreadsheetId,
    ensured.tabNames.Surat_Tugas,
    SHEET_HEADERS.Surat_Tugas,
    rows
  );
}

export async function pushConfigToSpreadsheet(
  accessToken: string,
  spreadsheetId: string,
  config: {
    adminPin: string;
    dispatcherWaPhone: string;
    whatsappTargetMode?: 'GROUP' | 'DIRECT';
    whatsappGroupName?: string;
    whatsappGroupInviteUrl?: string;
    letterPrefix: string;
  }
): Promise<void> {
  const ensured = await ensureSpreadsheetStructure(accessToken, spreadsheetId);
  const rows = [
    ['admin_pin', config.adminPin],
    ['dispatcher_wa', config.dispatcherWaPhone],
    ['whatsapp_target_mode', config.whatsappTargetMode || 'GROUP'],
    ['whatsapp_group_name', config.whatsappGroupName || ''],
    ['whatsapp_group_invite', config.whatsappGroupInviteUrl || ''],
    ['letter_prefix', config.letterPrefix],
  ];
  await replaceSheetRows(
    accessToken,
    spreadsheetId,
    ensured.tabNames.Konfigurasi,
    SHEET_HEADERS.Konfigurasi,
    rows
  );
}
