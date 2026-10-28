import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  ClipboardList,
  Clock,
  Copy,
  Database,
  Edit3,
  ExternalLink,
  FileSpreadsheet,
  KeyRound,
  LogOut,
  Menu,
  MessageSquare,
  Navigation,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Send,
  Snowflake,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  AppConfig,
  Assignment,
  DriverMaster,
  OriginMaster,
  RouteMaster,
  TaskStatus,
  VehicleMaster,
  WhatsAppNotificationLog,
  WhatsAppTargetMode,
} from '../types';
import {
  buildSuratTugasWaMessage,
  buildWhatsAppDirectUrl,
  buildWhatsAppGroupUrl,
} from '../utils/whatsapp';
import {
  evaluateAssignmentOtd,
  formatDurationMinutes,
  formatRealTimeTimestamp,
} from '../utils/media';
import {
  DashboardChartsSection,
  DriverPerformanceView,
  OnTimeDeliverySummarySection,
} from './AnalyticsAndPerformance';
import { ConfirmModal } from './ConfirmModal';
import { GoogleSignInButton } from './GoogleSignInButton';
import { PrintableAssignmentModal } from './PrintableAssignmentModal';

type AdminMenuTab =
  | 'surat_tugas'
  | 'driver_performance'
  | 'master_data'
  | 'notifikasi_wa'
  | 'spreadsheets'
  | 'ubah_pin';

type MasterSubTab = 'drivers' | 'vehicles' | 'origins' | 'routes';

interface AdminPortalProps {
  drivers: DriverMaster[];
  vehicles: VehicleMaster[];
  origins: OriginMaster[];
  routes: RouteMaster[];
  assignments: Assignment[];
  notifications: WhatsAppNotificationLog[];
  config: AppConfig;
  googleUser: User | null;
  hasGoogleToken: boolean;
  isSyncing: boolean;
  onGoogleLogin: () => Promise<void>;
  onGoogleLogout: () => Promise<void>;
  onManualSync: () => Promise<void>;
  onConnectSpreadsheet: (spreadsheetInput: string) => Promise<boolean>;
  onCreateSpreadsheet: (customTitle: string) => Promise<boolean>;
  onCreateAssignment: (
    payload: Partial<Assignment>,
    waTargetMode: WhatsAppTargetMode
  ) => Promise<WhatsAppNotificationLog | null>;
  onUpdateAssignment: (
    id: string,
    payload: Partial<Assignment> & {
      kmAwal?: number | '';
      suhuAwal?: string;
      kmAkhir?: number | '';
      suhuAkhir?: string;
      penerimaNama?: string;
    }
  ) => Promise<boolean>;
  onDeleteAssignment: (id: string) => Promise<boolean>;
  onSaveDriver: (
    mode: 'create' | 'edit',
    originalId: string,
    driver: DriverMaster
  ) => Promise<boolean>;
  onDeleteDriver: (id: string) => Promise<boolean>;
  onSaveVehicle: (
    mode: 'create' | 'edit',
    originalId: string,
    vehicle: VehicleMaster
  ) => Promise<boolean>;
  onDeleteVehicle: (id: string) => Promise<boolean>;
  onSaveOrigin: (
    mode: 'create' | 'edit',
    originalId: string,
    origin: OriginMaster
  ) => Promise<boolean>;
  onDeleteOrigin: (id: string) => Promise<boolean>;
  onSaveRoute: (
    mode: 'create' | 'edit',
    originalId: string,
    route: RouteMaster
  ) => Promise<boolean>;
  onDeleteRoute: (id: string) => Promise<boolean>;
  onSaveOperationalSettings: (settings: {
    dispatcherWaPhone: string;
    whatsappTargetMode: WhatsAppTargetMode;
    whatsappGroupName: string;
    whatsappGroupInviteUrl: string;
    letterPrefix: string;
  }) => Promise<boolean>;
  onTestWhatsAppNetwork: (targetPhone: string) => Promise<void>;
  onChangeAdminPin: (currentPin: string, newPin: string) => Promise<boolean>;
  onCopyText: (text: string, label: string) => void;
  onLogout: () => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  drivers,
  vehicles,
  origins,
  routes,
  assignments,
  notifications,
  config,
  googleUser,
  hasGoogleToken,
  isSyncing,
  onGoogleLogin,
  onGoogleLogout,
  onManualSync,
  onConnectSpreadsheet,
  onCreateSpreadsheet,
  onCreateAssignment,
  onUpdateAssignment,
  onDeleteAssignment,
  onSaveDriver,
  onDeleteDriver,
  onSaveVehicle,
  onDeleteVehicle,
  onSaveOrigin,
  onDeleteOrigin,
  onSaveRoute,
  onDeleteRoute,
  onSaveOperationalSettings,
  onTestWhatsAppNetwork,
  onChangeAdminPin,
  onCopyText,
  onLogout,
}) => {
  const [activeMenu, setActiveMenu] = useState<AdminMenuTab>('surat_tugas');
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  // Search Bar + Status Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | TaskStatus>('ALL');

  // Printable PDF Report Modal State
  const [printableAssignment, setPrintableAssignment] =
    useState<Assignment | null>(null);

  // Create / Edit Assignment Modal
  const [assignmentModalOpen, setAssignmentModalOpen] = useState<boolean>(false);
  const [editingAssignment, setEditingAssignment] = useState<Assignment | null>(
    null
  );
  const [nextPreviewNo, setNextPreviewNo] = useState<string>('');
  const [createWaMode, setCreateWaMode] = useState<WhatsAppTargetMode>(
    config.whatsappTargetMode || 'GROUP'
  );
  const [creatingSubmitting, setCreatingSubmitting] = useState<boolean>(false);
  const [lastCreatedNotification, setLastCreatedNotification] =
    useState<WhatsAppNotificationLog | null>(null);

  const [asgForm, setAsgForm] = useState({
    tanggalTugas: new Date().toISOString().slice(0, 10),
    jadwalJamTiba: '',
    noSuratJalanFisik: '',
    kodeSegel: '',
    driverId: '',
    driverName: '',
    driverPhone: '',
    vehicleId: '',
    plateNumber: '',
    vehicleType: '',
    originId: '',
    origin: '',
    routeId: '',
    destination: '',
    purpose: '',
    status: TaskStatus.MENUNGGU_BERANGKAT,
    kmAwal: '' as string,
    suhuAwal: '',
    kmAkhir: '' as string,
    suhuAkhir: '',
    penerimaNama: '',
    notes: '',
  });

  // Master Data States
  const [masterTab, setMasterTab] = useState<MasterSubTab>('drivers');
  const [masterSearch, setMasterSearch] = useState<string>('');

  // Master Driver (without No. Polisi Default)
  const [driverModalOpen, setDriverModalOpen] = useState<boolean>(false);
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [driverForm, setDriverForm] = useState<DriverMaster>({
    id: '',
    name: '',
    phone: '',
    pin: '',
    licenseType: 'SIM B1',
    active: true,
  });

  // Master Armada (without Odometer KM Terakhir)
  const [vehicleModalOpen, setVehicleModalOpen] = useState<boolean>(false);
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [vehicleForm, setVehicleForm] = useState<VehicleMaster>({
    id: '',
    plateNumber: '',
    vehicleType: '',
    capacity: '',
    status: 'Siap Jalan',
  });

  // Master Lokasi Asal (New Requirement #8)
  const [originModalOpen, setOriginModalOpen] = useState<boolean>(false);
  const [editingOriginId, setEditingOriginId] = useState<string | null>(null);
  const [originForm, setOriginForm] = useState<OriginMaster>({
    id: '',
    name: '',
    address: '',
  });

  // Master Rute / Tujuan (without Lokasi Asal & Estimasi Jarak)
  const [routeModalOpen, setRouteModalOpen] = useState<boolean>(false);
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [routeForm, setRouteForm] = useState<RouteMaster>({
    id: '',
    destination: '',
    picName: '',
    picPhone: '',
  });

  // Spreadsheet Connection Form
  const [sheetInput, setSheetInput] = useState<string>(
    config.spreadsheetId || ''
  );
  const [newSheetTitle, setNewSheetTitle] = useState<string>(
    'CRK LOGISTIK DELIVERY SISTEM Database'
  );

  // WhatsApp Group, Direct Number & Prefix Settings
  const [waPhoneInput, setWaPhoneInput] = useState<string>(
    config.dispatcherWaPhone || ''
  );
  const [waTargetModeInput, setWaTargetModeInput] =
    useState<WhatsAppTargetMode>(config.whatsappTargetMode || 'GROUP');
  const [waGroupNameInput, setWaGroupNameInput] = useState<string>(
    config.whatsappGroupName || 'Grup Operasional CRK Logistik'
  );
  const [waGroupInviteInput, setWaGroupInviteInput] = useState<string>(
    config.whatsappGroupInviteUrl || ''
  );
  const [prefixInput, setPrefixInput] = useState<string>(
    config.letterPrefix || 'ST-CRK'
  );

  // Admin Change Own PIN Form
  const [currentPin, setCurrentPin] = useState<string>('');
  const [newPin, setNewPin] = useState<string>('');
  const [confirmNewPin, setConfirmNewPin] = useState<string>('');
  const [pinError, setPinError] = useState<string>('');

  // Generic Confirmation Dialog State
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    description: string;
    details: string[];
    confirmLabel: string;
    variant: 'primary' | 'danger';
    action: () => Promise<void>;
  } | null>(null);
  const [confirmLoading, setConfirmLoading] = useState<boolean>(false);

  useEffect(() => {
    setWaPhoneInput(config.dispatcherWaPhone || '');
    setWaTargetModeInput(config.whatsappTargetMode || 'GROUP');
    setWaGroupNameInput(
      config.whatsappGroupName || 'Grup Operasional CRK Logistik'
    );
    setWaGroupInviteInput(config.whatsappGroupInviteUrl || '');
    setCreateWaMode(config.whatsappTargetMode || 'GROUP');
    setPrefixInput(config.letterPrefix || 'ST-CRK');
    if (config.spreadsheetId && !sheetInput) {
      setSheetInput(config.spreadsheetId);
    }
  }, [
    config.dispatcherWaPhone,
    config.whatsappTargetMode,
    config.whatsappGroupName,
    config.whatsappGroupInviteUrl,
    config.letterPrefix,
    config.spreadsheetId,
  ]);

  const fetchNextSequentialPreview = async (dateStr: string) => {
    try {
      const res = await fetch(
        `/api/assignments/next-number?tanggal=${encodeURIComponent(dateStr)}`
      );
      if (res.ok) {
        const data = await res.json();
        setNextPreviewNo(data.noPenugasan);
      }
    } catch {
      // ignore preview error
    }
  };

  const statusCounts = useMemo(() => {
    let menunggu = 0;
    let perjalanan = 0;
    let selesai = 0;
    for (const a of assignments) {
      if (a.status === TaskStatus.MENUNGGU_BERANGKAT) menunggu++;
      else if (a.status === TaskStatus.DALAM_PERJALANAN) perjalanan++;
      else if (a.status === TaskStatus.SELESAI) selesai++;
    }
    return {
      all: assignments.length,
      menunggu,
      perjalanan,
      selesai,
    };
  }, [assignments]);

  const filteredAssignments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assignments.filter((item) => {
      const matchesStatus =
        statusFilter === 'ALL' || item.status === statusFilter;
      if (!matchesStatus) return false;

      if (!q) return true;
      return (
        item.noPenugasan.toLowerCase().includes(q) ||
        item.driverName.toLowerCase().includes(q) ||
        item.driverId.toLowerCase().includes(q) ||
        (item.noSuratJalanFisik || '').toLowerCase().includes(q) ||
        (item.kodeSegel || '').toLowerCase().includes(q)
      );
    });
  }, [assignments, searchQuery, statusFilter]);

  const openCreateAssignmentModal = () => {
    const today = new Date().toISOString().slice(0, 10);
    setEditingAssignment(null);
    setCreateWaMode(config.whatsappTargetMode || 'GROUP');
    setAsgForm({
      tanggalTugas: today,
      jadwalJamTiba: '',
      noSuratJalanFisik: '',
      kodeSegel: '',
      driverId: '',
      driverName: '',
      driverPhone: '',
      vehicleId: '',
      plateNumber: '',
      vehicleType: '',
      originId: '',
      origin: '',
      routeId: '',
      destination: '',
      purpose: '',
      status: TaskStatus.MENUNGGU_BERANGKAT,
      kmAwal: '',
      suhuAwal: '',
      kmAkhir: '',
      suhuAkhir: '',
      penerimaNama: '',
      notes: '',
    });
    fetchNextSequentialPreview(today);
    setAssignmentModalOpen(true);
  };

  const openEditAssignmentModal = (asg: Assignment) => {
    setEditingAssignment(asg);
    setAsgForm({
      tanggalTugas: asg.tanggalTugas,
      jadwalJamTiba: asg.jadwalJamTiba || '',
      noSuratJalanFisik: asg.noSuratJalanFisik || '',
      kodeSegel: asg.kodeSegel || '',
      driverId: asg.driverId,
      driverName: asg.driverName,
      driverPhone: asg.driverPhone,
      vehicleId: asg.vehicleId,
      plateNumber: asg.plateNumber,
      vehicleType: asg.vehicleType,
      originId: asg.originId || '',
      origin: asg.origin,
      routeId: asg.routeId,
      destination: asg.destination,
      purpose: asg.purpose,
      status: asg.status,
      kmAwal:
        asg.departureData?.kmAwal !== undefined
          ? String(asg.departureData.kmAwal)
          : '',
      suhuAwal: asg.departureData?.suhuAwal || '',
      kmAkhir:
        asg.handoverData?.kmAkhir !== undefined
          ? String(asg.handoverData.kmAkhir)
          : '',
      suhuAkhir: asg.handoverData?.suhuAkhir || '',
      penerimaNama: asg.handoverData?.penerimaNama || '',
      notes: asg.notes || '',
    });
    setAssignmentModalOpen(true);
  };

  const handleDriverSelectInAssignment = (driverId: string) => {
    const drv = drivers.find((d) => d.id === driverId);
    if (!drv) {
      setAsgForm((prev) => ({ ...prev, driverId }));
      return;
    }
    setAsgForm((prev) => ({
      ...prev,
      driverId: drv.id,
      driverName: drv.name,
      driverPhone: drv.phone,
    }));
  };

  const handleVehicleSelectInAssignment = (vehicleId: string) => {
    const veh = vehicles.find((v) => v.id === vehicleId);
    if (!veh) {
      setAsgForm((prev) => ({ ...prev, vehicleId }));
      return;
    }
    setAsgForm((prev) => ({
      ...prev,
      vehicleId: veh.id,
      plateNumber: veh.plateNumber,
      vehicleType: veh.vehicleType,
    }));
  };

  const handleOriginSelectInAssignment = (originId: string) => {
    const org = origins.find((o) => o.id === originId);
    if (!org) {
      setAsgForm((prev) => ({ ...prev, originId }));
      return;
    }
    setAsgForm((prev) => ({
      ...prev,
      originId: org.id,
      origin: org.name,
    }));
  };

  const handleRouteSelectInAssignment = (routeId: string) => {
    const rt = routes.find((r) => r.id === routeId);
    if (!rt) {
      setAsgForm((prev) => ({ ...prev, routeId }));
      return;
    }
    setAsgForm((prev) => ({
      ...prev,
      routeId: rt.id,
      destination: rt.destination,
    }));
  };

  const buildAssignmentWaDirectUrl = (asg: Assignment): string => {
    const msg = buildSuratTugasWaMessage(asg, config.whatsappGroupName);
    return buildWhatsAppDirectUrl(
      asg.driverPhone || config.dispatcherWaPhone,
      msg,
      false
    );
  };

  const buildAssignmentWaGroupUrl = (asg: Assignment): string => {
    const msg = buildSuratTugasWaMessage(asg, config.whatsappGroupName);
    return buildWhatsAppGroupUrl(msg);
  };

  const triggerConfirm = (cfg: NonNullable<typeof confirmDialog>) => {
    setConfirmDialog(cfg);
  };

  const executeConfirmedAction = async () => {
    if (!confirmDialog) return;
    setConfirmLoading(true);
    try {
      await confirmDialog.action();
      setConfirmDialog(null);
    } finally {
      setConfirmLoading(false);
    }
  };

  const menuTitles: Record<AdminMenuTab, string> = {
    surat_tugas: 'Dasbor Surat Tugas & Analitik Rantai Dingin',
    driver_performance: 'Performa Driver (Driver Performance)',
    master_data: 'Master Data Rantai Pengiriman Dingin',
    notifikasi_wa: 'Pengiriman & Log WhatsApp 1-Klik',
    spreadsheets: 'Sinkronisasi Database Spreadsheets',
    ubah_pin: 'Pengaturan PIN Admin Dispatcher',
  };

  const filteredDrivers = useMemo(() => {
    const q = masterSearch.trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter(
      (d) =>
        d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)
    );
  }, [drivers, masterSearch]);

  const filteredVehicles = useMemo(() => {
    const q = masterSearch.trim().toLowerCase();
    if (!q) return vehicles;
    return vehicles.filter(
      (v) =>
        v.id.toLowerCase().includes(q) ||
        v.plateNumber.toLowerCase().includes(q) ||
        v.vehicleType.toLowerCase().includes(q)
    );
  }, [vehicles, masterSearch]);

  const filteredOrigins = useMemo(() => {
    const q = masterSearch.trim().toLowerCase();
    if (!q) return origins;
    return origins.filter(
      (o) =>
        o.id.toLowerCase().includes(q) ||
        o.name.toLowerCase().includes(q) ||
        o.address.toLowerCase().includes(q)
    );
  }, [origins, masterSearch]);

  const filteredRoutes = useMemo(() => {
    const q = masterSearch.trim().toLowerCase();
    if (!q) return routes;
    return routes.filter(
      (r) =>
        r.id.toLowerCase().includes(q) ||
        r.destination.toLowerCase().includes(q) ||
        r.picName.toLowerCase().includes(q)
    );
  }, [routes, masterSearch]);

  return (
    <>
      <div className="no-print min-h-screen bg-slate-50 flex">
        {/* Desktop Sidebar Navigation */}
        <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-6 py-4">
            <div className="flex items-center gap-2 text-sm font-bold tracking-tight text-slate-900">
              <Snowflake className="h-4 w-4 shrink-0 text-sky-700" />
              <span className="truncate">CRK LOGISTIK</span>
            </div>
            <p className="mt-0.5 text-[11px] font-medium text-slate-500">
              Cold Chain Delivery Sistem
            </p>
          </div>

          <nav className="flex-1 space-y-1 p-4">
            <button
              type="button"
              onClick={() => setActiveMenu('surat_tugas')}
              className={`flex w-full items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeMenu === 'surat_tugas'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <ClipboardList className="h-4 w-4 shrink-0" />
                Surat Tugas
              </span>
              <span className="font-mono text-xs tabular-nums">
                {assignments.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMenu('driver_performance')}
              className={`flex w-full items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeMenu === 'driver_performance'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Award className="h-4 w-4 shrink-0" />
                Performa Driver
              </span>
              <span className="font-mono text-xs tabular-nums">
                {drivers.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMenu('master_data')}
              className={`flex w-full items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeMenu === 'master_data'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Database className="h-4 w-4 shrink-0" />
                Master Data
              </span>
              <span className="font-mono text-xs tabular-nums">
                {drivers.length +
                  vehicles.length +
                  origins.length +
                  routes.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMenu('notifikasi_wa')}
              className={`flex w-full items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeMenu === 'notifikasi_wa'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <MessageSquare className="h-4 w-4 shrink-0" />
                WhatsApp 1-Klik
              </span>
              <span className="font-mono text-xs tabular-nums">
                {notifications.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMenu('spreadsheets')}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeMenu === 'spreadsheets'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="h-4 w-4 shrink-0" />
              Database Spreadsheets
            </button>

            <button
              type="button"
              onClick={() => setActiveMenu('ubah_pin')}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                activeMenu === 'ubah_pin'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <KeyRound className="h-4 w-4 shrink-0" />
              Ubah PIN Admin
            </button>
          </nav>

          <div className="border-t border-slate-200 p-4 space-y-3">
            <div className="text-xs text-slate-500">
              <p className="font-medium text-slate-800 truncate">
                {config.spreadsheetTitle || 'Spreadsheet Belum Dipilih'}
              </p>
              <p className="mt-0.5 font-mono tabular-nums">
                {config.lastSyncedAt
                  ? `Sinkron: ${new Date(
                      config.lastSyncedAt
                    ).toLocaleTimeString('id-ID', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : 'Menunggu sinkronisasi'}
              </p>
            </div>
            <button
              type="button"
              onClick={onLogout}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
            >
              <LogOut className="h-3.5 w-3.5" />
              Keluar ke Halaman Login
            </button>
          </div>
        </aside>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 z-40 flex lg:hidden">
            <div
              className="fixed inset-0 bg-slate-950/40"
              onClick={() => setMobileMenuOpen(false)}
            />
            <div className="relative z-10 flex w-72 flex-col bg-white p-5 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <span className="text-sm font-bold text-slate-900">
                  CRK LOGISTIK DELIVERY SISTEM
                </span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="rounded p-1 text-slate-500 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="mt-4 flex-1 space-y-1">
                {(
                  [
                    ['surat_tugas', 'Surat Tugas'],
                    ['driver_performance', 'Performa Driver'],
                    ['master_data', 'Master Data'],
                    ['notifikasi_wa', 'WhatsApp 1-Klik'],
                    ['spreadsheets', 'Database Spreadsheets'],
                    ['ubah_pin', 'Ubah PIN Admin'],
                  ] as Array<[AdminMenuTab, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setActiveMenu(key);
                      setMobileMenuOpen(false);
                    }}
                    className={`block w-full rounded-lg px-3.5 py-2.5 text-left text-sm font-medium ${
                      activeMenu === key
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
              <button
                type="button"
                onClick={onLogout}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-800"
              >
                <LogOut className="h-4 w-4" />
                Keluar
              </button>
            </div>
          </div>
        )}

        {/* Main Workspace Area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top Bar */}
          <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3.5 sm:px-8">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="rounded-lg border border-slate-200 p-2 text-slate-700 lg:hidden"
                aria-label="Buka menu navigasi"
              >
                <Menu className="h-4 w-4" />
              </button>
              <div className="truncate text-sm font-medium text-slate-500">
                CRK LOGISTIK DELIVERY SISTEM{' '}
                <span className="mx-1.5 text-slate-300">/</span>
                <span className="font-semibold text-slate-900">
                  {menuTitles[activeMenu]}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 shrink-0">
              <button
                type="button"
                onClick={onManualSync}
                disabled={isSyncing}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                />
                {isSyncing ? 'Menyinkronkan...' : 'Sinkron Spreadsheets'}
              </button>

              {activeMenu === 'surat_tugas' && (
                <button
                  type="button"
                  onClick={openCreateAssignmentModal}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  Buat Surat Tugas
                </button>
              )}
            </div>
          </header>

          {/* Main Viewport */}
          <main className="flex-1 p-4 sm:p-8 max-w-7xl w-full mx-auto">
            {(!hasGoogleToken || !config.spreadsheetId) &&
              activeMenu !== 'spreadsheets' && (
                <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-amber-950">
                      {!hasGoogleToken
                        ? 'Hubungkan Akun Google untuk Sinkronisasi Otomatis Spreadsheets'
                        : 'Pilih atau Buat Database Google Spreadsheets'}
                    </p>
                    <p className="mt-0.5 text-xs text-amber-800">
                      CRK LOGISTIK DELIVERY SISTEM terhubung langsung ke Google
                      Sheets tanpa data dummy.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveMenu('spreadsheets')}
                    className="self-start rounded-lg bg-amber-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-amber-950 whitespace-nowrap shrink-0 sm:self-center"
                  >
                    Atur Database Spreadsheets
                  </button>
                </div>
              )}

            {/* ========================================================== */}
            {/* TAB 1: DASBOR SURAT TUGAS + RECHARTS + PDF PRINT           */}
            {/* ========================================================== */}
            {activeMenu === 'surat_tugas' && (
              <div className="space-y-6">
                {/* Post-Create 1-Click WhatsApp Quick Resend Bar */}
                {lastCreatedNotification && (
                  <div className="rounded-xl border border-emerald-300 bg-emerald-50/90 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-bold text-emerald-950">
                          Surat Tugas {lastCreatedNotification.noPenugasan}{' '}
                          Diterbitkan — Aplikasi WhatsApp Dibuka Otomatis
                        </p>
                        <p className="mt-0.5 text-xs text-emerald-800">
                          Jika tab baru tertahan atau Anda ingin meneruskan ke
                          Grup WhatsApp maupun chat Driver, gunakan tombol
                          1-klik berikut:
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <a
                          href={
                            lastCreatedNotification.waGroupUrl ||
                            buildWhatsAppGroupUrl(
                              lastCreatedNotification.message
                            )
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                        >
                          <Users className="h-3.5 w-3.5" />
                          Kirim ke Grup WhatsApp
                        </a>
                        <a
                          href={
                            lastCreatedNotification.waDirectUrl ||
                            buildWhatsAppDirectUrl(
                              lastCreatedNotification.targetPhone,
                              lastCreatedNotification.message,
                              false
                            )
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                          WA Driver
                        </a>
                        <button
                          type="button"
                          onClick={() =>
                            onCopyText(
                              lastCreatedNotification.message,
                              'Pesan Surat Tugas WhatsApp'
                            )
                          }
                          className="inline-flex items-center gap-1 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Salin
                        </button>
                        <button
                          type="button"
                          onClick={() => setLastCreatedNotification(null)}
                          className="rounded-lg p-1.5 text-emerald-800 hover:bg-emerald-100"
                          aria-label="Tutup banner WhatsApp"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Flat KPI Strip */}
                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-4">
                  <div className="bg-white p-5">
                    <p className="text-xs font-medium text-slate-500">
                      Total Surat Tugas
                    </p>
                    <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
                      {statusCounts.all}
                    </p>
                  </div>
                  <div className="bg-white p-5">
                    <p className="text-xs font-medium text-slate-500">
                      Menunggu Berangkat
                    </p>
                    <p className="mt-1.5 font-mono text-2xl font-bold text-amber-700 tabular-nums">
                      {statusCounts.menunggu}
                    </p>
                  </div>
                  <div className="bg-white p-5">
                    <p className="text-xs font-medium text-slate-500">
                      Dalam Perjalanan
                    </p>
                    <p className="mt-1.5 font-mono text-2xl font-bold text-sky-700 tabular-nums">
                      {statusCounts.perjalanan}
                    </p>
                  </div>
                  <div className="bg-white p-5">
                    <p className="text-xs font-medium text-slate-500">
                      Tugas Selesai
                    </p>
                    <p className="mt-1.5 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
                      {statusCounts.selesai}
                    </p>
                  </div>
                </div>

                {/* On-Time Delivery Summary & Schedule Visualization Section */}
                <OnTimeDeliverySummarySection assignments={assignments} />

                {/* Recharts Data Visualization Section */}
                <DashboardChartsSection
                  assignments={assignments}
                  drivers={drivers}
                />

                {/* Search Bar + Status Filter */}
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="relative w-full lg:max-w-md">
                    <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari No. Penugasan, Driver, Surat Jalan, atau Segel..."
                      aria-label="Cari berdasarkan No. Penugasan atau Nama Driver"
                      className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-9 text-sm text-slate-900 transition-colors focus:border-slate-900 focus:outline-none"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-700"
                        aria-label="Bersihkan pencarian"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/75 p-1">
                    {(
                      [
                        ['ALL', `Semua (${statusCounts.all})`],
                        [
                          TaskStatus.MENUNGGU_BERANGKAT,
                          `Menunggu Berangkat (${statusCounts.menunggu})`,
                        ],
                        [
                          TaskStatus.DALAM_PERJALANAN,
                          `Dalam Perjalanan (${statusCounts.perjalanan})`,
                        ],
                        [
                          TaskStatus.SELESAI,
                          `Selesai (${statusCounts.selesai})`,
                        ],
                      ] as Array<['ALL' | TaskStatus, string]>
                    ).map(([val, label]) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setStatusFilter(val)}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                          statusFilter === val
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* High-Density Cold Chain Assignments Table */}
                <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {filteredAssignments.length === 0 ? (
                    <div className="p-12 text-center">
                      <ClipboardList className="mx-auto h-8 w-8 text-slate-400" />
                      <h3 className="mt-3 text-base font-semibold text-slate-900">
                        {assignments.length === 0
                          ? 'Belum Ada Data Surat Tugas'
                          : 'Tidak Ada Penugasan yang Cocok'}
                      </h3>
                      <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
                        {assignments.length === 0
                          ? 'Buat Surat Tugas pengiriman dingin pertama dengan penomoran berurutan otomatis.'
                          : 'Ubah kata kunci pencarian atau pilih filter status lainnya.'}
                      </p>
                      {assignments.length === 0 && (
                        <button
                          type="button"
                          onClick={openCreateAssignmentModal}
                          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800"
                        >
                          <Plus className="h-4 w-4" />
                          Buat Surat Tugas Pertama
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                            <th className="px-4 py-3 whitespace-nowrap">
                              No. Penugasan &amp; Segel
                            </th>
                            <th className="px-4 py-3 whitespace-nowrap">
                              Jadwal &amp; OTD
                            </th>
                            <th className="px-4 py-3 whitespace-nowrap">
                              Driver
                            </th>
                            <th className="px-4 py-3 whitespace-nowrap">
                              Armada Reefer
                            </th>
                            <th className="px-4 py-3 whitespace-nowrap">
                              Asal → Tujuan
                            </th>
                            <th className="px-4 py-3 whitespace-nowrap">
                              Status &amp; Suhu
                            </th>
                            <th className="px-4 py-3 text-right whitespace-nowrap">
                              Aksi (PDF / WA Grup / Edit)
                            </th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {filteredAssignments.map((asg) => {
                            const otd = evaluateAssignmentOtd(asg);
                            return (
                              <tr
                                key={asg.id}
                                className="transition-colors hover:bg-slate-50/80"
                              >
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="font-mono text-xs font-semibold text-slate-900 tabular-nums">
                                    {asg.noPenugasan}
                                  </div>
                                  <div className="mt-0.5 font-mono text-[11px] text-slate-500 tabular-nums">
                                    SJ: {asg.noSuratJalanFisik || '-'} · Segel:{' '}
                                    {asg.kodeSegel || '-'}
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="font-mono text-xs text-slate-800 tabular-nums">
                                    {asg.tanggalTugas}
                                    {asg.jadwalJamTiba
                                      ? ` · ${asg.jadwalJamTiba}`
                                      : ''}
                                  </div>
                                  <div className="mt-0.5 text-[11px] font-medium tabular-nums">
                                    {otd.category === 'ON_TIME' && (
                                      <span className="text-emerald-700">
                                        Tepat Waktu
                                      </span>
                                    )}
                                    {otd.category === 'LATE_COMPLETED' && (
                                      <span className="text-red-600">
                                        Terlambat +
                                        {formatDurationMinutes(
                                          otd.delayMinutes
                                        )}
                                      </span>
                                    )}
                                    {otd.category === 'ON_TRACK_ACTIVE' && (
                                      <span className="text-slate-500">
                                        Sesuai Jadwal
                                      </span>
                                    )}
                                    {otd.category === 'OVERDUE_ACTIVE' && (
                                      <span className="text-amber-700">
                                        Lewat Jadwal +
                                        {formatDurationMinutes(
                                          otd.delayMinutes
                                        )}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="font-medium text-slate-900">
                                    {asg.driverName}
                                  </div>
                                  <div className="font-mono text-xs text-slate-500 tabular-nums">
                                    {asg.driverId}
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap">
                                  <div className="font-mono text-xs font-semibold text-slate-900">
                                    {asg.plateNumber}
                                  </div>
                                  {asg.vehicleType && (
                                    <div className="text-xs text-slate-500">
                                      {asg.vehicleType}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 max-w-xs">
                                  <div className="truncate font-medium text-slate-900">
                                    {asg.origin} → {asg.destination}
                                  </div>
                                  <div className="truncate text-xs text-slate-500">
                                    {asg.purpose || '-'}
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap text-xs font-semibold">
                                  <div>
                                    {asg.status ===
                                      TaskStatus.MENUNGGU_BERANGKAT && (
                                      <span className="inline-flex items-center gap-1.5 text-amber-700">
                                        <Clock className="h-3.5 w-3.5 shrink-0" />
                                        Menunggu Berangkat
                                      </span>
                                    )}
                                    {asg.status ===
                                      TaskStatus.DALAM_PERJALANAN && (
                                      <span className="inline-flex items-center gap-1.5 text-sky-700">
                                        <Navigation className="h-3.5 w-3.5 shrink-0" />
                                        Dalam Perjalanan
                                      </span>
                                    )}
                                    {asg.status === TaskStatus.SELESAI && (
                                      <span className="inline-flex items-center gap-1.5 text-emerald-700">
                                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                                        Selesai
                                      </span>
                                    )}
                                  </div>
                                  {(asg.departureData?.suhuAwal ||
                                    asg.handoverData?.suhuAkhir) && (
                                    <div className="mt-0.5 font-mono text-[11px] font-normal text-slate-500 tabular-nums">
                                      Suhu:{' '}
                                      {asg.departureData?.suhuAwal || '-'}
                                      {asg.handoverData?.suhuAkhir
                                        ? ` → ${asg.handoverData.suhuAkhir}`
                                        : ''}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                  <div className="inline-flex items-center justify-end gap-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setPrintableAssignment(asg)
                                      }
                                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                                      title="Laporan Detail & Cetak PDF"
                                    >
                                      <Printer className="h-3.5 w-3.5" />
                                      PDF
                                    </button>
                                    <a
                                      href={buildAssignmentWaGroupUrl(asg)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                                      title="Kirim Surat Tugas ke Grup WhatsApp"
                                    >
                                      <Users className="h-3.5 w-3.5" />
                                      WA Grup
                                    </a>
                                    <a
                                      href={buildAssignmentWaDirectUrl(asg)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                                      title="Kirim ke Nomor WhatsApp Driver"
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                      WA Driver
                                    </a>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        openEditAssignmentModal(asg)
                                      }
                                      className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                      title="Edit Surat Tugas"
                                      aria-label={`Edit ${asg.noPenugasan}`}
                                    >
                                      <Edit3 className="h-4 w-4" />
                                    </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      triggerConfirm({
                                        open: true,
                                        title: 'Hapus Surat Tugas?',
                                        description:
                                          'Surat Tugas ini akan dihapus secara permanen dari aplikasi dan lembar Surat_Tugas di Google Spreadsheets.',
                                        details: [
                                          `No. Penugasan : ${asg.noPenugasan}`,
                                          `Driver        : ${asg.driverId} - ${asg.driverName}`,
                                          `Rute          : ${asg.origin} -> ${asg.destination}`,
                                        ],
                                        confirmLabel: 'Hapus Surat Tugas',
                                        variant: 'danger',
                                        action: async () => {
                                          await onDeleteAssignment(asg.id);
                                        },
                                      })
                                    }
                                    className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                                    title="Hapus Surat Tugas"
                                    aria-label={`Hapus ${asg.noPenugasan}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================== */}
            {/* TAB 2: DRIVER PERFORMANCE (Requirement #3)                 */}
            {/* ========================================================== */}
            {activeMenu === 'driver_performance' && (
              <DriverPerformanceView
                assignments={assignments}
                drivers={drivers}
              />
            )}

            {/* ========================================================== */}
            {/* TAB 3: MASTER DATA (DRIVER, ARMADA, LOKASI ASAL, RUTE)     */}
            {/* ========================================================== */}
            {activeMenu === 'master_data' && (
              <div className="space-y-6">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                  {/* 4 Segmented Master Category Tabs */}
                  <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/75 p-1 self-start">
                    <button
                      type="button"
                      onClick={() => setMasterTab('drivers')}
                      className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                        masterTab === 'drivers'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Master Driver ({drivers.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMasterTab('vehicles')}
                      className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                        masterTab === 'vehicles'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Master Armada ({vehicles.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMasterTab('origins')}
                      className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                        masterTab === 'origins'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Master Lokasi Asal ({origins.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setMasterTab('routes')}
                      className={`rounded-md px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                        masterTab === 'routes'
                          ? 'bg-white text-slate-900 shadow-sm'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Master Rute Tujuan ({routes.length})
                    </button>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <div className="relative flex-1 sm:w-64">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        value={masterSearch}
                        onChange={(e) => setMasterSearch(e.target.value)}
                        placeholder="Cari di Master Data..."
                        className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                      />
                    </div>

                    {masterTab === 'drivers' && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextIdx = drivers.length + 1;
                          setEditingDriverId(null);
                          setDriverForm({
                            id: `DRV-${String(nextIdx).padStart(3, '0')}`,
                            name: '',
                            phone: '',
                            pin: '',
                            licenseType: 'SIM B1',
                            active: true,
                          });
                          setDriverModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Tambah Driver
                      </button>
                    )}

                    {masterTab === 'vehicles' && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextIdx = vehicles.length + 1;
                          setEditingVehicleId(null);
                          setVehicleForm({
                            id: `UNT-${String(nextIdx).padStart(3, '0')}`,
                            plateNumber: '',
                            vehicleType: '',
                            capacity: '',
                            status: 'Siap Jalan',
                          });
                          setVehicleModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Tambah Armada
                      </button>
                    )}

                    {masterTab === 'origins' && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextIdx = origins.length + 1;
                          setEditingOriginId(null);
                          setOriginForm({
                            id: `LOC-${String(nextIdx).padStart(3, '0')}`,
                            name: '',
                            address: '',
                          });
                          setOriginModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Tambah Lokasi Asal
                      </button>
                    )}

                    {masterTab === 'routes' && (
                      <button
                        type="button"
                        onClick={() => {
                          const nextIdx = routes.length + 1;
                          setEditingRouteId(null);
                          setRouteForm({
                            id: `RT-${String(nextIdx).padStart(3, '0')}`,
                            destination: '',
                            picName: '',
                            picPhone: '',
                          });
                          setRouteModalOpen(true);
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Tambah Rute Tujuan
                      </button>
                    )}
                  </div>
                </div>

                {/* SUB-TAB 1: MASTER DRIVER (No. Polisi Default Removed) */}
                {masterTab === 'drivers' && (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {filteredDrivers.length === 0 ? (
                      <div className="p-12 text-center">
                        <h3 className="text-base font-semibold text-slate-900">
                          Data Master Driver Kosong
                        </h3>
                        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
                          Tambahkan Master Driver atau sinkronkan dari lembar
                          Master_Driver di Google Spreadsheets.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                              <th className="px-4 py-3">ID Driver</th>
                              <th className="px-4 py-3">Nama Lengkap</th>
                              <th className="px-4 py-3">No. WhatsApp</th>
                              <th className="px-4 py-3">PIN Login</th>
                              <th className="px-4 py-3">Jenis SIM</th>
                              <th className="px-4 py-3">Status</th>
                              <th className="px-4 py-3 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {filteredDrivers.map((d) => (
                              <tr key={d.id} className="hover:bg-slate-50/80">
                                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                                  {d.id}
                                </td>
                                <td className="px-4 py-3 font-medium text-slate-900">
                                  {d.name}
                                </td>
                                <td className="px-4 py-3 font-mono text-xs text-slate-600 tabular-nums">
                                  {d.phone || '-'}
                                </td>
                                <td className="px-4 py-3 font-mono text-xs text-slate-700 tabular-nums">
                                  {d.pin || '(Tanpa PIN)'}
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-600">
                                  {d.licenseType || '-'}
                                </td>
                                <td className="px-4 py-3 text-xs font-semibold">
                                  {d.active ? (
                                    <span className="text-emerald-700">
                                      Aktif
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">
                                      Nonaktif
                                    </span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingDriverId(d.id);
                                      setDriverForm({ ...d });
                                      setDriverModalOpen(true);
                                    }}
                                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                    aria-label={`Edit driver ${d.name}`}
                                  >
                                    <Edit3 className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      triggerConfirm({
                                        open: true,
                                        title: 'Hapus Master Driver?',
                                        description:
                                          'Data driver ini akan dihapus dari daftar login dropdown dan lembar Master_Driver di Google Spreadsheets.',
                                        details: [
                                          `ID Driver : ${d.id}`,
                                          `Nama      : ${d.name}`,
                                        ],
                                        confirmLabel: 'Hapus Driver',
                                        variant: 'danger',
                                        action: async () => {
                                          await onDeleteDriver(d.id);
                                        },
                                      })
                                    }
                                    className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                                    aria-label={`Hapus driver ${d.name}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* SUB-TAB 2: MASTER ARMADA (KM Terakhir Removed) */}
                {masterTab === 'vehicles' && (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {filteredVehicles.length === 0 ? (
                      <div className="p-12 text-center">
                        <h3 className="text-base font-semibold text-slate-900">
                          Data Master Armada Kosong
                        </h3>
                        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
                          Tambahkan unit kendaraan berpendingin (reefer) atau
                          sinkronkan dari Google Spreadsheets.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                              <th className="px-4 py-3">Kode Unit</th>
                              <th className="px-4 py-3">Nomor Polisi</th>
                              <th className="px-4 py-3">
                                Tipe Kendaraan Pendingin
                              </th>
                              <th className="px-4 py-3">Kapasitas</th>
                              <th className="px-4 py-3">Status Unit</th>
                              <th className="px-4 py-3 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {filteredVehicles.map((v) => (
                              <tr key={v.id} className="hover:bg-slate-50/80">
                                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                                  {v.id}
                                </td>
                                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900">
                                  {v.plateNumber}
                                </td>
                                <td className="px-4 py-3 text-slate-800">
                                  {v.vehicleType || '-'}
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-600">
                                  {v.capacity || '-'}
                                </td>
                                <td className="px-4 py-3 text-xs font-semibold">
                                  <span
                                    className={
                                      v.status === 'Siap Jalan'
                                        ? 'text-emerald-700'
                                        : v.status === 'Dalam Tugas'
                                        ? 'text-sky-700'
                                        : 'text-amber-700'
                                    }
                                  >
                                    {v.status}
                                  </span>
                                </td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingVehicleId(v.id);
                                      setVehicleForm({ ...v });
                                      setVehicleModalOpen(true);
                                    }}
                                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                    aria-label={`Edit armada ${v.plateNumber}`}
                                  >
                                    <Edit3 className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      triggerConfirm({
                                        open: true,
                                        title: 'Hapus Master Armada?',
                                        description:
                                          'Unit armada ini akan dihapus dari database dan lembar Master_Armada pada Google Spreadsheets.',
                                        details: [
                                          `Kode Unit : ${v.id}`,
                                          `No Polisi : ${v.plateNumber}`,
                                        ],
                                        confirmLabel: 'Hapus Armada',
                                        variant: 'danger',
                                        action: async () => {
                                          await onDeleteVehicle(v.id);
                                        },
                                      })
                                    }
                                    className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                                    aria-label={`Hapus armada ${v.plateNumber}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* SUB-TAB 3: MASTER LOKASI ASAL (Requirement #8) */}
                {masterTab === 'origins' && (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {filteredOrigins.length === 0 ? (
                      <div className="p-12 text-center">
                        <h3 className="text-base font-semibold text-slate-900">
                          Data Master Lokasi Asal Kosong
                        </h3>
                        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
                          Tambahkan gudang pendingin / fasilitas Cold Storage
                          asal untuk dipilih saat membuat Surat Tugas.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                              <th className="px-4 py-3">Kode Lokasi Asal</th>
                              <th className="px-4 py-3">
                                Nama Lokasi Asal / Cold Storage
                              </th>
                              <th className="px-4 py-3">
                                Alamat / Keterangan
                              </th>
                              <th className="px-4 py-3 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {filteredOrigins.map((o) => (
                              <tr key={o.id} className="hover:bg-slate-50/80">
                                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                                  {o.id}
                                </td>
                                <td className="px-4 py-3 font-medium text-slate-900">
                                  {o.name}
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-600">
                                  {o.address || '-'}
                                </td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingOriginId(o.id);
                                      setOriginForm({ ...o });
                                      setOriginModalOpen(true);
                                    }}
                                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                    aria-label={`Edit lokasi asal ${o.name}`}
                                  >
                                    <Edit3 className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      triggerConfirm({
                                        open: true,
                                        title: 'Hapus Master Lokasi Asal?',
                                        description:
                                          'Lokasi asal ini akan dihapus dari database dan lembar Master_Lokasi_Asal pada Google Spreadsheets.',
                                        details: [
                                          `Kode : ${o.id}`,
                                          `Nama : ${o.name}`,
                                        ],
                                        confirmLabel: 'Hapus Lokasi Asal',
                                        variant: 'danger',
                                        action: async () => {
                                          await onDeleteOrigin(o.id);
                                        },
                                      })
                                    }
                                    className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                                    aria-label={`Hapus lokasi asal ${o.name}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* SUB-TAB 4: MASTER RUTE TUJUAN (Lokasi Asal & Estimasi Jarak Removed) */}
                {masterTab === 'routes' && (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {filteredRoutes.length === 0 ? (
                      <div className="p-12 text-center">
                        <h3 className="text-base font-semibold text-slate-900">
                          Data Master Rute Tujuan Kosong
                        </h3>
                        <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
                          Tambahkan daftar Lokasi Tujuan beserta PIC &amp; Nomor
                          WhatsApp tujuan.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-left text-sm">
                          <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                              <th className="px-4 py-3">Kode Rute</th>
                              <th className="px-4 py-3">Lokasi Tujuan</th>
                              <th className="px-4 py-3">Nama PIC Tujuan</th>
                              <th className="px-4 py-3">
                                No. WhatsApp PIC Tujuan
                              </th>
                              <th className="px-4 py-3 text-right">Aksi</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {filteredRoutes.map((r) => (
                              <tr key={r.id} className="hover:bg-slate-50/80">
                                <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                                  {r.id}
                                </td>
                                <td className="px-4 py-3 font-medium text-slate-900">
                                  {r.destination}
                                </td>
                                <td className="px-4 py-3 text-xs text-slate-700">
                                  {r.picName || '-'}
                                </td>
                                <td className="px-4 py-3 font-mono text-xs text-slate-600 tabular-nums">
                                  {r.picPhone || '-'}
                                </td>
                                <td className="px-4 py-3 text-right whitespace-nowrap">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingRouteId(r.id);
                                      setRouteForm({ ...r });
                                      setRouteModalOpen(true);
                                    }}
                                    className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                                    aria-label={`Edit rute ${r.id}`}
                                  >
                                    <Edit3 className="h-4 w-4" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      triggerConfirm({
                                        open: true,
                                        title: 'Hapus Master Rute?',
                                        description:
                                          'Rute tujuan ini akan dihapus dari database dan lembar Master_Rute pada Google Spreadsheets.',
                                        details: [
                                          `Kode Rute     : ${r.id}`,
                                          `Lokasi Tujuan : ${r.destination}`,
                                        ],
                                        confirmLabel: 'Hapus Rute',
                                        variant: 'danger',
                                        action: async () => {
                                          await onDeleteRoute(r.id);
                                        },
                                      })
                                    }
                                    className="rounded-md p-1.5 text-slate-500 hover:bg-red-50 hover:text-red-600"
                                    aria-label={`Hapus rute ${r.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* ========================================================== */}
            {/* TAB 4: WHATSAPP 1-KLIK & LOG NOTIFIKASI                    */}
            {/* ========================================================== */}
            {activeMenu === 'notifikasi_wa' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-slate-200 bg-white p-6">
                  <h2 className="text-base font-bold text-slate-900">
                    Pengaturan Grup WhatsApp, Nomor Dispatcher &amp; Prefix Surat
                    Tugas
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Atur tujuan default tombol WhatsApp sekali klik (Grup
                    WhatsApp Operasional atau Nomor Langsung) saat Admin
                    menerbitkan Surat Tugas maupun saat Driver mengirimkan
                    Keberangkatan &amp; Serah Terima.
                  </p>

                  {/* Default Target Mode Segmented Toggle */}
                  <div className="mt-5">
                    <label className="block text-xs font-semibold text-slate-700">
                      Mode Default Pengiriman WhatsApp Sekali Klik
                    </label>
                    <div className="mt-1.5 inline-flex flex-wrap items-center gap-1 rounded-lg bg-slate-200/80 p-1">
                      <button
                        type="button"
                        onClick={() => setWaTargetModeInput('GROUP')}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                          waTargetModeInput === 'GROUP'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Users className="h-3.5 w-3.5" />
                        Kirim ke Grup WhatsApp (Pilih Grup)
                      </button>
                      <button
                        type="button"
                        onClick={() => setWaTargetModeInput('DIRECT')}
                        className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap ${
                          waTargetModeInput === 'DIRECT'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        Nomor Langsung (Dispatcher / Driver)
                      </button>
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Nama Grup WhatsApp Operasional
                      </label>
                      <input
                        type="text"
                        value={waGroupNameInput}
                        onChange={(e) => setWaGroupNameInput(e.target.value)}
                        placeholder="Contoh: Grup Operasional CRK Logistik"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Link Undangan Grup WA / ID Grup Gateway (Opsional)
                      </label>
                      <input
                        type="text"
                        value={waGroupInviteInput}
                        onChange={(e) => setWaGroupInviteInput(e.target.value)}
                        placeholder="https://chat.whatsapp.com/... atau 1203630...@g.us"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 font-mono text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Nomor WhatsApp Dispatcher Operasional
                      </label>
                      <input
                        type="text"
                        value={waPhoneInput}
                        onChange={(e) => setWaPhoneInput(e.target.value)}
                        placeholder="Contoh: 081234567890"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700">
                        Kode Awalan (Prefix) Nomor Surat Tugas Berurutan
                      </label>
                      <input
                        type="text"
                        value={prefixInput}
                        onChange={(e) =>
                          setPrefixInput(e.target.value.toUpperCase())
                        }
                        placeholder="ST-CRK"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 font-mono text-sm text-slate-900 uppercase focus:border-slate-900 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        triggerConfirm({
                          open: true,
                          title: 'Simpan Pengaturan WhatsApp & Operasional?',
                          description:
                            'Mode Grup WhatsApp, nama grup operasional, nomor Dispatcher, dan prefix Surat Tugas akan disimpan serta disinkronkan ke Google Spreadsheets.',
                          details: [
                            `Mode Default WA   : ${
                              waTargetModeInput === 'GROUP'
                                ? 'Grup WhatsApp'
                                : 'Nomor Langsung'
                            }`,
                            `Nama Grup WA      : ${waGroupNameInput || '-'}`,
                            `No. WA Dispatcher : ${waPhoneInput || '-'}`,
                            `Prefix Surat      : ${prefixInput || 'ST-CRK'}`,
                          ],
                          confirmLabel: 'Simpan Pengaturan',
                          variant: 'primary',
                          action: async () => {
                            await onSaveOperationalSettings({
                              dispatcherWaPhone: waPhoneInput.trim(),
                              whatsappTargetMode: waTargetModeInput,
                              whatsappGroupName:
                                waGroupNameInput.trim() ||
                                'Grup Operasional CRK Logistik',
                              whatsappGroupInviteUrl: waGroupInviteInput.trim(),
                              letterPrefix: prefixInput.trim() || 'ST-CRK',
                            });
                          },
                        })
                      }
                      className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                    >
                      Simpan Pengaturan
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        onTestWhatsAppNetwork(
                          waGroupInviteInput.trim().includes('@g.us')
                            ? waGroupInviteInput.trim()
                            : waPhoneInput.trim()
                        )
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Buat Pesan Uji WhatsApp
                    </button>

                    <a
                      href={buildWhatsAppGroupUrl(
                        `*[CRK LOGISTIK DELIVERY SISTEM]*\nUji kirim pesan ke Grup WhatsApp (${
                          waGroupNameInput.trim() || 'Grup Operasional'
                        }) pada ${formatRealTimeTimestamp(new Date())}.`
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0"
                    >
                      <Users className="h-3.5 w-3.5" />
                      Kirim Uji ke Grup WhatsApp
                    </a>

                    <a
                      href={buildWhatsAppDirectUrl(
                        waPhoneInput.trim(),
                        `*[CRK LOGISTIK DELIVERY SISTEM]*\nTes koneksi langsung pembuka Aplikasi WhatsApp (${formatRealTimeTimestamp(
                          new Date()
                        )}).`,
                        false
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap shrink-0"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Buka Chat WA Dispatcher
                    </a>

                    {waGroupInviteInput
                      .trim()
                      .startsWith('https://chat.whatsapp.com/') && (
                      <a
                        href={waGroupInviteInput.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Buka Link Grup WA
                      </a>
                    )}
                  </div>
                </div>

                {/* Log Pengiriman WhatsApp */}
                <div className="rounded-xl border border-slate-200 bg-white">
                  <div className="border-b border-slate-200 px-6 py-4">
                    <h3 className="text-sm font-bold text-slate-900">
                      Riwayat Pesan WhatsApp Sekali Klik ({notifications.length}
                      )
                    </h3>
                  </div>

                  {notifications.length === 0 ? (
                    <div className="p-10 text-center text-sm text-slate-600">
                      Belum ada Surat Tugas, laporan keberangkatan, atau serah
                      terima yang dikirimkan.
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200">
                      {notifications.map((notif) => (
                        <div key={notif.id} className="p-5">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                            <div className="flex flex-wrap items-center gap-2 text-slate-600">
                              <span className="font-semibold text-slate-900">
                                {notif.eventType === 'SURAT_TUGAS'
                                  ? 'Penerbitan Surat Tugas'
                                  : notif.eventType === 'KEBERANGKATAN'
                                  ? 'Keberangkatan Rantai Dingin'
                                  : notif.eventType === 'SERAH_TERIMA'
                                  ? 'Serah Terima Rantai Dingin'
                                  : 'Uji WhatsApp'}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono tabular-nums">
                                {notif.noPenugasan}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>
                                {notif.driverName} ({notif.plateNumber})
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-slate-500 tabular-nums">
                                {formatRealTimeTimestamp(notif.timestamp)}
                              </span>
                              <a
                                href={
                                  notif.waGroupUrl ||
                                  buildWhatsAppGroupUrl(notif.message)
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1 font-semibold text-white hover:bg-emerald-700"
                              >
                                <Users className="h-3 w-3" />
                                Kirim ke Grup WA
                              </a>
                              <a
                                href={
                                  notif.waDirectUrl ||
                                  buildWhatsAppDirectUrl(
                                    notif.targetPhone,
                                    notif.message,
                                    false
                                  )
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-800 hover:bg-emerald-100"
                              >
                                <ExternalLink className="h-3 w-3" />
                                WA Nomor
                              </a>
                              <button
                                type="button"
                                onClick={() =>
                                  onCopyText(notif.message, 'Pesan WhatsApp')
                                }
                                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-50"
                              >
                                <Copy className="h-3 w-3" />
                                Salin
                              </button>
                            </div>
                          </div>

                          <pre className="mt-3 overflow-x-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">
                            {notif.message}
                          </pre>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================== */}
            {/* TAB 5: DATABASE SPREADSHEETS                               */}
            {/* ========================================================== */}
            {activeMenu === 'spreadsheets' && (
              <div className="space-y-6">
                <div className="rounded-xl border border-slate-200 bg-white p-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        01. Koneksi Akun Google Sheets
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        {hasGoogleToken && googleUser
                          ? `Terautentikasi sebagai ${googleUser.email}. Sinkronisasi otomatis berjalan setiap 20 detik.`
                          : 'Masuk dengan akun Google Anda untuk membaca dan menulis database Google Spreadsheets secara otomatis.'}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {!hasGoogleToken ? (
                        <GoogleSignInButton
                          onClick={onGoogleLogin}
                          label="Sign in with Google"
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={onGoogleLogout}
                          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          Putuskan Sesi Google
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        02. Hubungkan Spreadsheet yang Sudah Ada
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Tempelkan URL lengkap Google Sheets atau Spreadsheet ID.
                        Sistem otomatis mengenali lembar Master_Driver,
                        Master_Armada, Master_Lokasi_Asal, Master_Rute, dan
                        Surat_Tugas.
                      </p>

                      <div className="mt-4">
                        <label className="block text-xs font-semibold text-slate-700">
                          URL atau ID Google Spreadsheet
                        </label>
                        <input
                          type="text"
                          value={sheetInput}
                          onChange={(e) => setSheetInput(e.target.value)}
                          placeholder="https://docs.google.com/spreadsheets/d/1BxiMVs.../edit"
                          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 font-mono text-xs text-slate-900 focus:border-slate-900 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="mt-5 flex items-center gap-3">
                      <button
                        type="button"
                        disabled={
                          !hasGoogleToken || !sheetInput.trim() || isSyncing
                        }
                        onClick={() =>
                          triggerConfirm({
                            open: true,
                            title: 'Hubungkan & Sinkronkan Google Spreadsheet?',
                            description:
                              'Aplikasi akan menyinkronkan data dari Spreadsheet ini serta memastikan tab standar rantai dingin telah tersedia.',
                            details: [
                              `Target Spreadsheet : ${sheetInput.trim()}`,
                            ],
                            confirmLabel: 'Hubungkan & Sinkronkan',
                            variant: 'primary',
                            action: async () => {
                              await onConnectSpreadsheet(sheetInput.trim());
                            },
                          })
                        }
                        className="rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                      >
                        Hubungkan &amp; Sinkronkan
                      </button>

                      {config.spreadsheetUrl && (
                        <a
                          href={config.spreadsheetUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          Buka Sheet
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-6 flex flex-col justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">
                        03. Buat Spreadsheet Database Baru Otomatis
                      </h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Buat file Google Spreadsheet baru lengkap dengan tab
                        Master_Driver, Master_Armada, Master_Lokasi_Asal,
                        Master_Rute, Surat_Tugas, dan Konfigurasi.
                      </p>

                      <div className="mt-4">
                        <label className="block text-xs font-semibold text-slate-700">
                          Judul Spreadsheet Baru
                        </label>
                        <input
                          type="text"
                          value={newSheetTitle}
                          onChange={(e) => setNewSheetTitle(e.target.value)}
                          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="mt-5">
                      <button
                        type="button"
                        disabled={!hasGoogleToken || isSyncing}
                        onClick={() =>
                          triggerConfirm({
                            open: true,
                            title: 'Buat File Google Spreadsheet Baru?',
                            description:
                              'Sebuah file Google Spreadsheet baru untuk CRK LOGISTIK DELIVERY SISTEM akan dibuat pada akun Google Anda.',
                            details: [`Nama File : ${newSheetTitle.trim()}`],
                            confirmLabel: 'Buat Database Baru',
                            variant: 'primary',
                            action: async () => {
                              await onCreateSpreadsheet(newSheetTitle.trim());
                            },
                          })
                        }
                        className="inline-flex items-center gap-2 rounded-lg border border-slate-900 bg-white px-4 py-2.5 text-xs font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                      >
                        <Plus className="h-4 w-4" />
                        Buat Database Spreadsheet Baru
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ========================================================== */}
            {/* TAB 6: UBAH PIN ADMIN DISPATCHER                           */}
            {/* ========================================================== */}
            {activeMenu === 'ubah_pin' && (
              <div className="max-w-lg rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
                <h2 className="text-lg font-bold text-slate-900">
                  Ubah PIN Admin Dispatcher
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Perbarui PIN akses Admin Dispatcher Anda pada CRK LOGISTIK
                  DELIVERY SISTEM.
                </p>

                {pinError && (
                  <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium text-red-700">
                    {pinError}
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    setPinError('');
                    if (!currentPin.trim() || !newPin.trim()) {
                      setPinError('PIN lama dan PIN baru wajib diisi.');
                      return;
                    }
                    if (newPin.trim().length < 4) {
                      setPinError(
                        'PIN baru minimal terdiri dari 4 karakter/angka.'
                      );
                      return;
                    }
                    if (newPin.trim() !== confirmNewPin.trim()) {
                      setPinError('Konfirmasi PIN baru tidak cocok.');
                      return;
                    }

                    triggerConfirm({
                      open: true,
                      title: 'Simpan Perubahan PIN Admin Dispatcher?',
                      description:
                        'PIN akses Admin Dispatcher Anda akan diperbarui dan disinkronkan ke Google Spreadsheets.',
                      details: [
                        'Perubahan berlaku segera untuk sesi login berikutnya.',
                      ],
                      confirmLabel: 'Ubah PIN Sekarang',
                      variant: 'primary',
                      action: async () => {
                        const ok = await onChangeAdminPin(
                          currentPin.trim(),
                          newPin.trim()
                        );
                        if (ok) {
                          setCurrentPin('');
                          setNewPin('');
                          setConfirmNewPin('');
                        }
                      },
                    });
                  }}
                  className="mt-6 space-y-4"
                >
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      PIN Admin Saat Ini *
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      required
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value)}
                      placeholder="Masukkan PIN saat ini"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      PIN Baru (Minimal 4 Angka/Karakter) *
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      required
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      placeholder="Masukkan PIN baru"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Ulangi PIN Baru *
                    </label>
                    <input
                      type="password"
                      inputMode="numeric"
                      required
                      value={confirmNewPin}
                      onChange={(e) => setConfirmNewPin(e.target.value)}
                      placeholder="Konfirmasi PIN baru"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 font-mono text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      className="rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800"
                    >
                      Perbarui PIN Admin
                    </button>
                  </div>
                </form>
              </div>
            )}
          </main>
        </div>

        {/* ================================================================= */}
        {/* MODAL: BUAT / EDIT SURAT TUGAS (Tanpa Template Rute Opsional)     */}
        {/* ================================================================= */}
        {assignmentModalOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {editingAssignment
                      ? `Edit Surat Tugas (${editingAssignment.noPenugasan})`
                      : 'Buat Surat Tugas Pengiriman Dingin'}
                  </h3>
                  {!editingAssignment && nextPreviewNo && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      Nomor Surat Tugas Berurutan Otomatis:{' '}
                      <strong className="font-mono text-slate-900 tabular-nums">
                        {nextPreviewNo}
                      </strong>
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setAssignmentModalOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (editingAssignment) {
                    triggerConfirm({
                      open: true,
                      title: 'Simpan Perubahan Surat Tugas?',
                      description:
                        'Data Surat Tugas rantai dingin akan diperbarui dan langsung disinkronkan ke lembar Surat_Tugas pada Google Spreadsheets.',
                      details: [
                        `No. Penugasan : ${editingAssignment.noPenugasan}`,
                        `SJ Fisik/Segel: ${
                          asgForm.noSuratJalanFisik || '-'
                        } / ${asgForm.kodeSegel || '-'}`,
                        `Driver & Unit : ${asgForm.driverId} (${asgForm.driverName}) · ${asgForm.plateNumber}`,
                        `Asal -> Tujuan: ${asgForm.origin} -> ${asgForm.destination}`,
                      ],
                      confirmLabel: 'Simpan Perubahan',
                      variant: 'primary',
                      action: async () => {
                        const ok = await onUpdateAssignment(
                          editingAssignment.id,
                          {
                            ...asgForm,
                            kmAwal:
                              asgForm.kmAwal !== ''
                                ? Number(asgForm.kmAwal)
                                : '',
                            suhuAwal: asgForm.suhuAwal,
                            kmAkhir:
                              asgForm.kmAkhir !== ''
                                ? Number(asgForm.kmAkhir)
                                : '',
                            suhuAkhir: asgForm.suhuAkhir,
                            penerimaNama: asgForm.penerimaNama,
                          }
                        );
                        if (ok) setAssignmentModalOpen(false);
                      },
                    });
                    return;
                  }

                  // Requirement #3: 1-Click Terbitkan Surat Tugas -> directly save & open WhatsApp
                  setCreatingSubmitting(true);
                  try {
                    const notif = await onCreateAssignment(
                      asgForm,
                      createWaMode
                    );
                    if (notif) {
                      setLastCreatedNotification(notif);
                      setAssignmentModalOpen(false);
                    }
                  } finally {
                    setCreatingSubmitting(false);
                  }
                }}
                className="mt-5 space-y-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Tanggal Penugasan *
                    </label>
                    <input
                      type="date"
                      required
                      value={asgForm.tanggalTugas}
                      onChange={(e) => {
                        const val = e.target.value;
                        setAsgForm((p) => ({ ...p, tanggalTugas: val }));
                        if (!editingAssignment) fetchNextSequentialPreview(val);
                      }}
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Target Jam Tiba / SLA OTD (Opsional)
                    </label>
                    <input
                      type="time"
                      value={asgForm.jadwalJamTiba}
                      onChange={(e) =>
                        setAsgForm((p) => ({
                          ...p,
                          jadwalJamTiba: e.target.value,
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  {editingAssignment && (
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        Status Penugasan
                      </label>
                      <select
                        value={asgForm.status}
                        onChange={(e) =>
                          setAsgForm((p) => ({
                            ...p,
                            status: e.target.value as TaskStatus,
                          }))
                        }
                        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                      >
                        <option value={TaskStatus.MENUNGGU_BERANGKAT}>
                          Menunggu Berangkat
                        </option>
                        <option value={TaskStatus.DALAM_PERJALANAN}>
                          Dalam Perjalanan
                        </option>
                        <option value={TaskStatus.SELESAI}>Selesai</option>
                      </select>
                    </div>
                  )}

                  {/* Requirement #9: No. Surat Jalan Fisik & Kode Segel */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      No. Surat Jalan Fisik *
                    </label>
                    <input
                      type="text"
                      required
                      value={asgForm.noSuratJalanFisik}
                      onChange={(e) =>
                        setAsgForm((p) => ({
                          ...p,
                          noSuratJalanFisik: e.target.value,
                        }))
                      }
                      placeholder="Contoh: SJF-CRK-00891"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Kode Segel Box Pendingin *
                    </label>
                    <input
                      type="text"
                      required
                      value={asgForm.kodeSegel}
                      onChange={(e) =>
                        setAsgForm((p) => ({
                          ...p,
                          kodeSegel: e.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="Contoh: SGL-992104"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Pilih Driver (Master Driver) *
                    </label>
                    {drivers.length > 0 ? (
                      <select
                        required
                        value={asgForm.driverId}
                        onChange={(e) =>
                          handleDriverSelectInAssignment(e.target.value)
                        }
                        className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                      >
                        <option value="">-- Pilih Driver --</option>
                        {drivers.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.id} — {d.name}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        required
                        value={asgForm.driverId}
                        onChange={(e) =>
                          setAsgForm((p) => ({
                            ...p,
                            driverId: e.target.value,
                          }))
                        }
                        placeholder="ID Driver (mis. DRV-001)"
                        className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm"
                      />
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Nama Driver *
                    </label>
                    <input
                      type="text"
                      required
                      value={asgForm.driverName}
                      onChange={(e) =>
                        setAsgForm((p) => ({
                          ...p,
                          driverName: e.target.value,
                        }))
                      }
                      placeholder="Nama lengkap driver"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Pilih Unit Armada Reefer
                    </label>
                    <select
                      value={asgForm.vehicleId}
                      onChange={(e) =>
                        handleVehicleSelectInAssignment(e.target.value)
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    >
                      <option value="">
                        -- Pilih dari Master Armada / Isi Manual --
                      </option>
                      {vehicles.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.plateNumber} — {v.vehicleType} ({v.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Nomor Polisi Kendaraan *
                    </label>
                    <input
                      type="text"
                      required
                      value={asgForm.plateNumber}
                      onChange={(e) =>
                        setAsgForm((p) => ({
                          ...p,
                          plateNumber: e.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="Contoh: B 9124 CRK"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  {/* Lokasi Asal from Master Lokasi Asal (Requirement #8 & #10) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Lokasi Asal (Master Lokasi Asal) *
                    </label>
                    {origins.length > 0 && (
                      <select
                        value={asgForm.originId}
                        onChange={(e) =>
                          handleOriginSelectInAssignment(e.target.value)
                        }
                        className="mt-1.5 mb-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                      >
                        <option value="">-- Pilih Lokasi Asal --</option>
                        {origins.map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.id} — {o.name}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      type="text"
                      required
                      value={asgForm.origin}
                      onChange={(e) =>
                        setAsgForm((p) => ({ ...p, origin: e.target.value }))
                      }
                      placeholder="Nama Cold Storage / Gudang Asal"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  {/* Lokasi Tujuan from Master Rute Tujuan (Requirement #10 & #13) */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Lokasi Tujuan (Master Rute) *
                    </label>
                    {routes.length > 0 && (
                      <select
                        value={asgForm.routeId}
                        onChange={(e) =>
                          handleRouteSelectInAssignment(e.target.value)
                        }
                        className="mt-1.5 mb-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                      >
                        <option value="">-- Pilih Tujuan dari Master Rute --</option>
                        {routes.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.id} — {r.destination}
                          </option>
                        ))}
                      </select>
                    )}
                    <input
                      type="text"
                      required
                      value={asgForm.destination}
                      onChange={(e) =>
                        setAsgForm((p) => ({
                          ...p,
                          destination: e.target.value,
                        }))
                      }
                      placeholder="Lokasi Tujuan Pengiriman"
                      className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Deskripsi Muatan Rantai Dingin &amp; Target Suhu
                    </label>
                    <input
                      type="text"
                      value={asgForm.purpose}
                      onChange={(e) =>
                        setAsgForm((p) => ({ ...p, purpose: e.target.value }))
                      }
                      placeholder="Contoh: Frozen Poultry 3.5 Ton (Target Suhu -18°C)"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  {editingAssignment && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          KM Awal (Opsional)
                        </label>
                        <input
                          type="number"
                          value={asgForm.kmAwal}
                          onChange={(e) =>
                            setAsgForm((p) => ({
                              ...p,
                              kmAwal: e.target.value,
                            }))
                          }
                          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700">
                          KM Akhir (Opsional)
                        </label>
                        <input
                          type="number"
                          value={asgForm.kmAkhir}
                          onChange={(e) =>
                            setAsgForm((p) => ({
                              ...p,
                              kmAkhir: e.target.value,
                            }))
                          }
                          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
                        />
                      </div>
                    </>
                  )}

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Catatan Dispatcher
                    </label>
                    <input
                      type="text"
                      value={asgForm.notes}
                      onChange={(e) =>
                        setAsgForm((p) => ({ ...p, notes: e.target.value }))
                      }
                      placeholder="Instruksi penanganan suhu atau jadwal bongkar"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                    />
                  </div>

                  {!editingAssignment && (
                    <div className="sm:col-span-2 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold text-slate-800">
                            Tujuan Pesan WhatsApp Sekali Klik Saat Diterbitkan
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Menekan &ldquo;Terbitkan Surat Tugas&rdquo; akan
                            langsung menyimpan &amp; membuka Aplikasi WhatsApp.
                          </p>
                        </div>
                        <div className="inline-flex items-center gap-1 rounded-lg bg-slate-200/80 p-1 self-start sm:self-center">
                          <button
                            type="button"
                            onClick={() => setCreateWaMode('GROUP')}
                            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                              createWaMode === 'GROUP'
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <Users className="h-3.5 w-3.5" />
                            Grup WhatsApp
                          </button>
                          <button
                            type="button"
                            onClick={() => setCreateWaMode('DIRECT')}
                            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                              createWaMode === 'DIRECT'
                                ? 'bg-white text-slate-900 shadow-sm'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            <MessageSquare className="h-3.5 w-3.5" />
                            Nomor WA Driver
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4">
                  <button
                    type="button"
                    disabled={creatingSubmitting}
                    onClick={() => setAssignmentModalOpen(false)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    disabled={creatingSubmitting}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                  >
                    {!editingAssignment && (
                      <ExternalLink className="h-3.5 w-3.5" />
                    )}
                    {editingAssignment
                      ? 'Simpan Perubahan'
                      : creatingSubmitting
                      ? 'Menerbitkan & Membuka WhatsApp...'
                      : 'Terbitkan Surat Tugas'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* MODAL: MASTER DRIVER (Tanpa No. Polisi Default - Req #11)         */}
        {/* ================================================================= */}
        {driverModalOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <h3 className="text-base font-bold text-slate-900">
                  {editingDriverId
                    ? 'Edit Master Driver'
                    : 'Tambah Master Driver'}
                </h3>
                <button
                  type="button"
                  onClick={() => setDriverModalOpen(false)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  triggerConfirm({
                    open: true,
                    title: editingDriverId
                      ? 'Simpan Perubahan Master Driver?'
                      : 'Tambah Master Driver ke Database?',
                    description:
                      'Data Driver akan disimpan dan langsung disinkronkan ke lembar Master_Driver di Google Spreadsheets.',
                    details: [
                      `ID Driver : ${driverForm.id.trim().toUpperCase()}`,
                      `Nama      : ${driverForm.name.trim()}`,
                    ],
                    confirmLabel: 'Simpan Data Driver',
                    variant: 'primary',
                    action: async () => {
                      const ok = await onSaveDriver(
                        editingDriverId ? 'edit' : 'create',
                        editingDriverId || '',
                        driverForm
                      );
                      if (ok) setDriverModalOpen(false);
                    },
                  });
                }}
                className="mt-4 space-y-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      ID Driver *
                    </label>
                    <input
                      type="text"
                      required
                      value={driverForm.id}
                      onChange={(e) =>
                        setDriverForm((p) => ({
                          ...p,
                          id: e.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="DRV-001"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      PIN Login Driver
                    </label>
                    <input
                      type="text"
                      value={driverForm.pin}
                      onChange={(e) =>
                        setDriverForm((p) => ({ ...p, pin: e.target.value }))
                      }
                      placeholder="Contoh: 1122 (Kosongkan jika tanpa PIN)"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Nama Lengkap Driver *
                    </label>
                    <input
                      type="text"
                      required
                      value={driverForm.name}
                      onChange={(e) =>
                        setDriverForm((p) => ({ ...p, name: e.target.value }))
                      }
                      placeholder="Nama lengkap driver"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Nomor WhatsApp
                    </label>
                    <input
                      type="text"
                      value={driverForm.phone}
                      onChange={(e) =>
                        setDriverForm((p) => ({ ...p, phone: e.target.value }))
                      }
                      placeholder="0812..."
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Jenis SIM
                    </label>
                    <select
                      value={driverForm.licenseType}
                      onChange={(e) =>
                        setDriverForm((p) => ({
                          ...p,
                          licenseType: e.target.value,
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="SIM A">SIM A</option>
                      <option value="SIM B1">SIM B1</option>
                      <option value="SIM B1 Umum">SIM B1 Umum</option>
                      <option value="SIM B2 Umum">SIM B2 Umum</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Status Aktif Login
                    </label>
                    <select
                      value={driverForm.active ? 'true' : 'false'}
                      onChange={(e) =>
                        setDriverForm((p) => ({
                          ...p,
                          active: e.target.value === 'true',
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="true">Aktif</option>
                      <option value="false">Nonaktif</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setDriverModalOpen(false)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                  >
                    Simpan Driver
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* MODAL: MASTER ARMADA (Tanpa KM Terakhir - Req #12)                */}
        {/* ================================================================= */}
        {vehicleModalOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <h3 className="text-base font-bold text-slate-900">
                  {editingVehicleId
                    ? 'Edit Master Armada'
                    : 'Tambah Master Armada'}
                </h3>
                <button
                  type="button"
                  onClick={() => setVehicleModalOpen(false)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  triggerConfirm({
                    open: true,
                    title: editingVehicleId
                      ? 'Simpan Perubahan Master Armada?'
                      : 'Tambah Master Armada?',
                    description:
                      'Data unit armada berpendingin akan disimpan dan disinkronkan ke lembar Master_Armada pada Google Spreadsheets.',
                    details: [
                      `Kode Unit : ${vehicleForm.id}`,
                      `No Polisi : ${vehicleForm.plateNumber}`,
                    ],
                    confirmLabel: 'Simpan Armada',
                    variant: 'primary',
                    action: async () => {
                      const ok = await onSaveVehicle(
                        editingVehicleId ? 'edit' : 'create',
                        editingVehicleId || '',
                        vehicleForm
                      );
                      if (ok) setVehicleModalOpen(false);
                    },
                  });
                }}
                className="mt-4 space-y-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Kode Unit *
                    </label>
                    <input
                      type="text"
                      required
                      value={vehicleForm.id}
                      onChange={(e) =>
                        setVehicleForm((p) => ({
                          ...p,
                          id: e.target.value.toUpperCase(),
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Nomor Polisi *
                    </label>
                    <input
                      type="text"
                      required
                      value={vehicleForm.plateNumber}
                      onChange={(e) =>
                        setVehicleForm((p) => ({
                          ...p,
                          plateNumber: e.target.value.toUpperCase(),
                        }))
                      }
                      placeholder="B 9123 CRK"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Tipe Kendaraan Pendingin (Reefer)
                    </label>
                    <input
                      type="text"
                      value={vehicleForm.vehicleType}
                      onChange={(e) =>
                        setVehicleForm((p) => ({
                          ...p,
                          vehicleType: e.target.value,
                        }))
                      }
                      placeholder="Contoh: CDD Box Thermo King -20°C"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Kapasitas Muatan
                    </label>
                    <input
                      type="text"
                      value={vehicleForm.capacity}
                      onChange={(e) =>
                        setVehicleForm((p) => ({
                          ...p,
                          capacity: e.target.value,
                        }))
                      }
                      placeholder="Contoh: 5 Ton Chiller/Freezer"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700">
                      Status Unit
                    </label>
                    <select
                      value={vehicleForm.status}
                      onChange={(e) =>
                        setVehicleForm((p) => ({
                          ...p,
                          status: e.target.value as VehicleMaster['status'],
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                    >
                      <option value="Siap Jalan">Siap Jalan</option>
                      <option value="Dalam Tugas">Dalam Tugas</option>
                      <option value="Perawatan">Perawatan</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setVehicleModalOpen(false)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                  >
                    Simpan Armada
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* MODAL: MASTER LOKASI ASAL (Requirement #8)                        */}
        {/* ================================================================= */}
        {originModalOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <h3 className="text-base font-bold text-slate-900">
                  {editingOriginId
                    ? 'Edit Master Lokasi Asal'
                    : 'Tambah Master Lokasi Asal'}
                </h3>
                <button
                  type="button"
                  onClick={() => setOriginModalOpen(false)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  triggerConfirm({
                    open: true,
                    title: editingOriginId
                      ? 'Simpan Perubahan Lokasi Asal?'
                      : 'Tambah Master Lokasi Asal?',
                    description:
                      'Data Lokasi Asal / Cold Storage akan disimpan dan disinkronkan ke lembar Master_Lokasi_Asal pada Google Spreadsheets.',
                    details: [
                      `Kode Lokasi : ${originForm.id}`,
                      `Nama Lokasi : ${originForm.name}`,
                    ],
                    confirmLabel: 'Simpan Lokasi Asal',
                    variant: 'primary',
                    action: async () => {
                      const ok = await onSaveOrigin(
                        editingOriginId ? 'edit' : 'create',
                        editingOriginId || '',
                        originForm
                      );
                      if (ok) setOriginModalOpen(false);
                    },
                  });
                }}
                className="mt-4 space-y-4"
              >
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Kode Lokasi Asal *
                  </label>
                  <input
                    type="text"
                    required
                    value={originForm.id}
                    onChange={(e) =>
                      setOriginForm((p) => ({
                        ...p,
                        id: e.target.value.toUpperCase(),
                      }))
                    }
                    placeholder="LOC-001"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Nama Lokasi Asal / Cold Storage *
                  </label>
                  <input
                    type="text"
                    required
                    value={originForm.name}
                    onChange={(e) =>
                      setOriginForm((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="Contoh: Cold Storage Utama CRK Cikarang"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">
                    Alamat / Keterangan Gudang
                  </label>
                  <input
                    type="text"
                    value={originForm.address}
                    onChange={(e) =>
                      setOriginForm((p) => ({ ...p, address: e.target.value }))
                    }
                    placeholder="Kawasan Industri Jababeka, Loading Dock A"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setOriginModalOpen(false)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                  >
                    Simpan Lokasi Asal
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* ================================================================= */}
        {/* MODAL: MASTER RUTE (Tanpa Lokasi Asal & Estimasi Jarak - Req #13) */}
        {/* ================================================================= */}
        {routeModalOpen && (
          <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <h3 className="text-base font-bold text-slate-900">
                  {editingRouteId
                    ? 'Edit Master Rute Tujuan'
                    : 'Tambah Master Rute Tujuan'}
                </h3>
                <button
                  type="button"
                  onClick={() => setRouteModalOpen(false)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  triggerConfirm({
                    open: true,
                    title: editingRouteId
                      ? 'Simpan Perubahan Master Rute?'
                      : 'Tambah Master Rute Tujuan?',
                    description:
                      'Data rute tujuan akan disimpan dan disinkronkan ke lembar Master_Rute pada Google Spreadsheets.',
                    details: [
                      `Kode Rute     : ${routeForm.id}`,
                      `Lokasi Tujuan : ${routeForm.destination}`,
                    ],
                    confirmLabel: 'Simpan Rute',
                    variant: 'primary',
                    action: async () => {
                      const ok = await onSaveRoute(
                        editingRouteId ? 'edit' : 'create',
                        editingRouteId || '',
                        routeForm
                      );
                      if (ok) setRouteModalOpen(false);
                    },
                  });
                }}
                className="mt-4 space-y-4"
              >
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Kode Rute *
                    </label>
                    <input
                      type="text"
                      required
                      value={routeForm.id}
                      onChange={(e) =>
                        setRouteForm((p) => ({
                          ...p,
                          id: e.target.value.toUpperCase(),
                        }))
                      }
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm uppercase"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Lokasi Tujuan *
                    </label>
                    <input
                      type="text"
                      required
                      value={routeForm.destination}
                      onChange={(e) =>
                        setRouteForm((p) => ({
                          ...p,
                          destination: e.target.value,
                        }))
                      }
                      placeholder="Contoh: DC Cold Hub Surabaya"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      Nama PIC Tujuan
                    </label>
                    <input
                      type="text"
                      value={routeForm.picName}
                      onChange={(e) =>
                        setRouteForm((p) => ({
                          ...p,
                          picName: e.target.value,
                        }))
                      }
                      placeholder="Nama penerima di lokasi"
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700">
                      No. WhatsApp PIC Tujuan
                    </label>
                    <input
                      type="text"
                      value={routeForm.picPhone}
                      onChange={(e) =>
                        setRouteForm((p) => ({
                          ...p,
                          picPhone: e.target.value,
                        }))
                      }
                      placeholder="0813..."
                      className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <button
                    type="button"
                    onClick={() => setRouteModalOpen(false)}
                    className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700"
                  >
                    Batal
                  </button>
                  <button
                    type="submit"
                    className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white"
                  >
                    Simpan Rute
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Confirmation Dialog */}
        {confirmDialog && (
          <ConfirmModal
            open={confirmDialog.open}
            title={confirmDialog.title}
            description={confirmDialog.description}
            details={confirmDialog.details}
            confirmLabel={confirmDialog.confirmLabel}
            variant={confirmDialog.variant}
            loading={confirmLoading}
            onConfirm={executeConfirmedAction}
            onCancel={() => {
              if (!confirmLoading) setConfirmDialog(null);
            }}
          />
        )}
      </div>

      {/* Browser Print-Friendly PDF Report Modal (Outside .no-print) */}
      <PrintableAssignmentModal
        assignment={printableAssignment}
        onClose={() => setPrintableAssignment(null)}
      />
    </>
  );
};
