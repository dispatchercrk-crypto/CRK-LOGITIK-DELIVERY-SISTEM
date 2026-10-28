export enum TaskStatus {
  MENUNGGU_BERANGKAT = 'Menunggu Berangkat',
  DALAM_PERJALANAN = 'Dalam Perjalanan',
  SELESAI = 'Selesai',
}

export enum UserRole {
  DRIVER = 'DRIVER',
  ADMIN = 'ADMIN',
}

export type WhatsAppTargetMode = 'GROUP' | 'DIRECT';

export interface DriverMaster {
  id: string; // ID Driver, e.g. DRV-001
  name: string;
  phone: string;
  pin: string;
  licenseType: string;
  active: boolean;
}

export interface VehicleMaster {
  id: string; // Kode Unit, e.g. UNT-001
  plateNumber: string;
  vehicleType: string;
  capacity: string;
  status: 'Siap Jalan' | 'Dalam Tugas' | 'Perawatan';
}

export interface OriginMaster {
  id: string; // Kode Lokasi Asal, e.g. LOC-001
  name: string;
  address: string;
}

export interface RouteMaster {
  id: string; // Kode Rute / Tujuan, e.g. RT-001
  destination: string;
  picName: string;
  picPhone: string;
}

export interface DepartureReport {
  timestamp: string;
  kmAwal: number;
  suhuAwal: string;
  bbmAwal: string;
  kondisiKendaraan: string;
  catatanBerangkat: string;
  fotoOdometerBerangkat?: string;
  fotoSuhuBerangkat?: string;
}

export interface HandoverReport {
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

export interface Assignment {
  id: string;
  sequenceNumber: number;
  noPenugasan: string;
  noSuratJalanFisik: string;
  kodeSegel: string;
  createdAt: string;
  tanggalTugas: string;
  jadwalJamTiba?: string; // Optional HH:mm target SLA on tanggalTugas
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
  status: TaskStatus;
  departureData?: DepartureReport;
  handoverData?: HandoverReport;
  notes: string;
  needsSheetSync?: boolean;
}

export interface WhatsAppNotificationLog {
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

export interface AppConfig {
  spreadsheetId: string;
  spreadsheetTitle: string;
  spreadsheetUrl: string;
  lastSyncedAt: string | null;
  dispatcherWaPhone: string;
  whatsappTargetMode: WhatsAppTargetMode;
  whatsappGroupName: string;
  whatsappGroupInviteUrl: string;
  letterPrefix: string;
  lastSequence: number;
  isDefaultPin: boolean;
  whatsappGatewayConfigured: boolean;
}

export interface AppStateResponse {
  drivers: DriverMaster[];
  vehicles: VehicleMaster[];
  origins: OriginMaster[];
  routes: RouteMaster[];
  assignments: Assignment[];
  notifications: WhatsAppNotificationLog[];
  config: AppConfig;
}

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}
