import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Copy,
  ExternalLink,
  LogOut,
  MapPin,
  MessageSquareShare,
  Navigation,
  RefreshCw,
  Send,
  Snowflake,
  Thermometer,
  Truck,
  Users,
} from 'lucide-react';
import {
  AppConfig,
  Assignment,
  DriverMaster,
  RouteMaster,
  TaskStatus,
  WhatsAppNotificationLog,
  WhatsAppTargetMode,
} from '../types';
import { formatRealTimeTimestamp } from '../utils/media';
import {
  buildWhatsAppDirectUrl,
  buildWhatsAppGroupUrl,
} from '../utils/whatsapp';
import { PhotoUploadField } from './PhotoUploadField';
import { SignatureCanvas } from './SignatureCanvas';

interface DriverPortalProps {
  driver: DriverMaster;
  assignments: Assignment[];
  routes: RouteMaster[];
  config: AppConfig;
  isSyncing: boolean;
  onRefreshSync: () => Promise<void>;
  onSubmitDeparture: (
    assignmentId: string,
    payload: {
      kmAwal: number;
      suhuAwal: string;
      bbmAwal: string;
      kondisiKendaraan: string;
      catatanBerangkat: string;
      fotoOdometerBerangkat?: string;
      fotoSuhuBerangkat?: string;
    },
    waTargetMode: WhatsAppTargetMode
  ) => Promise<WhatsAppNotificationLog | null>;
  onSubmitHandover: (
    assignmentId: string,
    payload: {
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
    },
    waTargetMode: WhatsAppTargetMode
  ) => Promise<WhatsAppNotificationLog | null>;
  onCopyText: (text: string, label: string) => void;
  onLogout: () => void;
}

export const DriverPortal: React.FC<DriverPortalProps> = ({
  driver,
  assignments,
  routes,
  config,
  isSyncing,
  onRefreshSync,
  onSubmitDeparture,
  onSubmitHandover,
  onCopyText,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<'aktif' | 'riwayat'>('aktif');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Real-time ticking clock for Departure & Handover Timestamp display
  const [liveNow, setLiveNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setLiveNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // WhatsApp target mode (defaults to Group WhatsApp or Admin config)
  const [waTargetMode, setWaTargetMode] = useState<WhatsAppTargetMode>(
    config.whatsappTargetMode || 'GROUP'
  );
  useEffect(() => {
    if (config.whatsappTargetMode) {
      setWaTargetMode(config.whatsappTargetMode);
    }
  }, [config.whatsappTargetMode]);

  // Departure Form States — Suhu Monitor Keberangkatan intentionally empty for manual driver input
  const [kmAwal, setKmAwal] = useState<string>('');
  const [suhuAwal, setSuhuAwal] = useState<string>('');
  const [bbmAwal, setBbmAwal] = useState<string>('Penuh (Full)');
  const [kondisiKendaraan, setKondisiKendaraan] = useState<string>(
    'Thermo Pendingin Normal'
  );
  const [catatanBerangkat, setCatatanBerangkat] = useState<string>('');
  const [fotoOdometerBerangkat, setFotoOdometerBerangkat] =
    useState<string>('');
  const [fotoSuhuBerangkat, setFotoSuhuBerangkat] = useState<string>('');

  // Handover Form States — Suhu Monitor Serah Terima intentionally empty for manual driver input
  const [kmAkhir, setKmAkhir] = useState<string>('');
  const [suhuAkhir, setSuhuAkhir] = useState<string>('');
  const [bbmAkhir, setBbmAkhir] = useState<string>('1/2 Tangki');
  const [penerimaNama, setPenerimaNama] = useState<string>('');
  const [kondisiAkhir, setKondisiAkhir] = useState<string>(
    'Suhu & Segel Utuh - Lengkap'
  );
  const [catatanSerahTerima, setCatatanSerahTerima] = useState<string>('');
  const [fotoOdometerSerahTerima, setFotoOdometerSerahTerima] =
    useState<string>('');
  const [fotoSuhuSerahTerima, setFotoSuhuSerahTerima] = useState<string>('');
  const [fotoBuktiSerahTerima, setFotoBuktiSerahTerima] = useState<string>('');
  const [tandaTanganPenerima, setTandaTanganPenerima] = useState<string>('');

  const [formValidationErr, setFormValidationErr] = useState<string>('');
  const [lastSentWaLog, setLastSentWaLog] =
    useState<WhatsAppNotificationLog | null>(null);
  const [submitting, setSubmitting] = useState<boolean>(false);

  const myAssignments = useMemo(
    () =>
      assignments.filter(
        (a) =>
          a.driverId.trim().toLowerCase() === driver.id.trim().toLowerCase()
      ),
    [assignments, driver.id]
  );

  const activeTasks = useMemo(
    () =>
      myAssignments.filter(
        (a) =>
          a.status === TaskStatus.MENUNGGU_BERANGKAT ||
          a.status === TaskStatus.DALAM_PERJALANAN
      ),
    [myAssignments]
  );

  const completedTasks = useMemo(
    () => myAssignments.filter((a) => a.status === TaskStatus.SELESAI),
    [myAssignments]
  );

  const openTaskForm = (task: Assignment) => {
    setSelectedTaskId(task.id);
    setFormValidationErr('');
    setLastSentWaLog(null);

    if (task.status === TaskStatus.MENUNGGU_BERANGKAT) {
      setKmAwal('');
      setSuhuAwal(''); // Empty for manual driver input
      setBbmAwal('Penuh (Full)');
      setKondisiKendaraan('Thermo Pendingin Normal');
      setCatatanBerangkat('');
      setFotoOdometerBerangkat('');
      setFotoSuhuBerangkat('');
    } else if (task.status === TaskStatus.DALAM_PERJALANAN) {
      const matchedRoute = routes.find((r) => r.id === task.routeId);
      setKmAkhir('');
      setSuhuAkhir(''); // Empty for manual driver input
      setBbmAkhir('1/2 Tangki');
      setPenerimaNama(matchedRoute?.picName || '');
      setKondisiAkhir('Suhu & Segel Utuh - Lengkap');
      setCatatanSerahTerima('');
      setFotoOdometerSerahTerima('');
      setFotoSuhuSerahTerima('');
      setFotoBuktiSerahTerima('');
      setTandaTanganPenerima('');
    }
  };

  const buildTaskMessage = (task: Assignment): string => {
    if (task.status === TaskStatus.SELESAI && task.handoverData) {
      return [
        '*[CRK LOGISTIK DELIVERY SISTEM — SERAH TERIMA RANTAI DINGIN]*',
        config.whatsappGroupName
          ? `Grup Operasional : ${config.whatsappGroupName}`
          : '',
        `No. Penugasan : ${task.noPenugasan}`,
        task.noSuratJalanFisik
          ? `No. Surat Jalan Fisik : ${task.noSuratJalanFisik}`
          : '',
        task.kodeSegel ? `Kode Segel : ${task.kodeSegel}` : '',
        `Driver : ${task.driverId} - ${task.driverName}`,
        `Unit Reefer : ${task.plateNumber}`,
        `Rute : ${task.origin} -> ${task.destination}`,
        `Timestamp Serah Terima : ${formatRealTimeTimestamp(
          task.handoverData.timestamp
        )}`,
        `KM Akhir : ${task.handoverData.kmAkhir.toLocaleString('id-ID')} km`,
        `Suhu Monitor Serah Terima : ${task.handoverData.suhuAkhir || '-'}`,
        `Penerima : ${task.handoverData.penerimaNama}`,
      ]
        .filter(Boolean)
        .join('\n');
    }

    return [
      '*[CRK LOGISTIK DELIVERY SISTEM — KEBERANGKATAN RANTAI DINGIN]*',
      config.whatsappGroupName
        ? `Grup Operasional : ${config.whatsappGroupName}`
        : '',
      `No. Penugasan : ${task.noPenugasan}`,
      task.noSuratJalanFisik
        ? `No. Surat Jalan Fisik : ${task.noSuratJalanFisik}`
        : '',
      task.kodeSegel ? `Kode Segel : ${task.kodeSegel}` : '',
      `Driver : ${task.driverId} - ${task.driverName}`,
      `Unit Reefer : ${task.plateNumber}`,
      `Rute : ${task.origin} -> ${task.destination}`,
      task.departureData
        ? `Timestamp Berangkat : ${formatRealTimeTimestamp(
            task.departureData.timestamp
          )}`
        : '',
      task.departureData
        ? `KM Awal : ${task.departureData.kmAwal.toLocaleString('id-ID')} km`
        : '',
      task.departureData?.suhuAwal
        ? `Suhu Monitor Keberangkatan : ${task.departureData.suhuAwal}`
        : '',
    ]
      .filter(Boolean)
      .join('\n');
  };

  const buildTaskGroupWaUrl = (task: Assignment): string => {
    return buildWhatsAppGroupUrl(buildTaskMessage(task));
  };

  const buildTaskDirectWaUrl = (task: Assignment): string => {
    const matchedRoute = routes.find((r) => r.id === task.routeId);
    const phone = config.dispatcherWaPhone || matchedRoute?.picPhone || '';
    return buildWhatsAppDirectUrl(phone, buildTaskMessage(task), false);
  };

  const handleDirectDepartureSubmit = async (
    e: React.FormEvent,
    task: Assignment
  ) => {
    e.preventDefault();
    if (submitting) return;
    setFormValidationErr('');

    if (kmAwal === '' || Number(kmAwal) < 0) {
      setFormValidationErr('Odometer KM Awal wajib diisi.');
      return;
    }
    if (!suhuAwal.trim()) {
      setFormValidationErr(
        'Suhu Monitor Keberangkatan wajib diisi manual oleh Driver.'
      );
      return;
    }
    if (!fotoOdometerBerangkat) {
      setFormValidationErr('Foto Odometer Keberangkatan wajib diunggah.');
      return;
    }
    if (!fotoSuhuBerangkat) {
      setFormValidationErr('Foto Monitor Suhu Keberangkatan wajib diunggah.');
      return;
    }

    setSubmitting(true);
    try {
      const waLog = await onSubmitDeparture(
        task.id,
        {
          kmAwal: Number(kmAwal) || 0,
          suhuAwal: suhuAwal.trim(),
          bbmAwal,
          kondisiKendaraan,
          catatanBerangkat,
          fotoOdometerBerangkat: fotoOdometerBerangkat || undefined,
          fotoSuhuBerangkat: fotoSuhuBerangkat || undefined,
        },
        waTargetMode
      );
      if (waLog) {
        setLastSentWaLog(waLog);
        setSelectedTaskId(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDirectHandoverSubmit = async (
    e: React.FormEvent,
    task: Assignment
  ) => {
    e.preventDefault();
    if (submitting) return;
    setFormValidationErr('');

    if (kmAkhir === '' || !penerimaNama.trim()) {
      setFormValidationErr('KM Akhir dan Nama Penerima wajib diisi.');
      return;
    }
    if (!suhuAkhir.trim()) {
      setFormValidationErr(
        'Suhu Monitor Serah Terima wajib diisi manual oleh Driver.'
      );
      return;
    }
    if (!fotoOdometerSerahTerima) {
      setFormValidationErr('Foto Odometer Serah Terima wajib diunggah.');
      return;
    }
    if (!fotoSuhuSerahTerima) {
      setFormValidationErr('Foto Monitor Suhu Serah Terima wajib diunggah.');
      return;
    }
    if (!fotoBuktiSerahTerima) {
      setFormValidationErr('Foto Bukti Serah Terima wajib diunggah.');
      return;
    }
    if (!tandaTanganPenerima) {
      setFormValidationErr(
        'Tanda Tangan Penerima pada canvas wajib diisi.'
      );
      return;
    }

    setSubmitting(true);
    try {
      const waLog = await onSubmitHandover(
        task.id,
        {
          kmAkhir: Number(kmAkhir) || 0,
          suhuAkhir: suhuAkhir.trim(),
          bbmAkhir,
          penerimaNama: penerimaNama.trim(),
          kondisiAkhir,
          catatanSerahTerima,
          fotoOdometerSerahTerima: fotoOdometerSerahTerima || undefined,
          fotoSuhuSerahTerima: fotoSuhuSerahTerima || undefined,
          fotoBuktiSerahTerima: fotoBuktiSerahTerima || undefined,
          tandaTanganPenerima: tandaTanganPenerima || undefined,
        },
        waTargetMode
      );
      if (waLog) {
        setLastSentWaLog(waLog);
        setSelectedTaskId(null);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const hasGroupInviteLink =
    config.whatsappGroupInviteUrl &&
    config.whatsappGroupInviteUrl.startsWith('https://chat.whatsapp.com/');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Sticky Top Bar (<= 15% mobile height, 3-zone contract) */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-4 py-3.5 sm:px-6">
        <div className="min-w-0 truncate text-sm sm:text-base font-bold tracking-tight text-slate-900">
          CRK LOGISTIK · {driver.id}
        </div>

        <div className="hidden md:flex items-center gap-3 text-xs text-slate-600">
          <span className="font-medium text-slate-900 whitespace-nowrap shrink-0">
            {driver.name}
          </span>
          <span aria-hidden="true">·</span>
          <span className="whitespace-nowrap shrink-0">
            Rantai Pengiriman Dingin
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onRefreshSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`}
            />
            Sinkron
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
            Keluar
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-800">
              <Snowflake className="h-3.5 w-3.5" />
              <span>CRK LOGISTIK DELIVERY SISTEM</span>
            </p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
              Selamat Bertugas, {driver.name}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 font-mono text-xs text-slate-500 tabular-nums">
              <span>ID Driver: {driver.id}</span>
              <span aria-hidden="true">·</span>
              <span>Waktu Sistem: {formatRealTimeTimestamp(liveNow)}</span>
              {hasGroupInviteLink && (
                <>
                  <span aria-hidden="true">·</span>
                  <a
                    href={config.whatsappGroupInviteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 font-sans font-semibold text-emerald-700 hover:underline whitespace-nowrap"
                  >
                    <Users className="h-3.5 w-3.5" />
                    Buka {config.whatsappGroupName || 'Grup WA Operasional'}
                  </a>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 rounded-lg bg-slate-200/70 p-1 self-start">
            <button
              type="button"
              onClick={() => setActiveTab('aktif')}
              className={`rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                activeTab === 'aktif'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Tugas Aktif ({activeTasks.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('riwayat')}
              className={`rounded-md px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                activeTab === 'riwayat'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Riwayat Selesai ({completedTasks.length})
            </button>
          </div>
        </div>

        {/* Post-Submission Quick Resend / Group WhatsApp Banner */}
        {lastSentWaLog && (
          <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/80 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <MessageSquareShare className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" />
                <div>
                  <h2 className="text-sm font-bold text-emerald-950">
                    Laporan Tersimpan &amp; Aplikasi WhatsApp Telah Dibuka
                  </h2>
                  <p className="mt-0.5 text-xs leading-relaxed text-emerald-800">
                    Gunakan tombol di samping jika Anda ingin meneruskan laporan
                    ke Grup WhatsApp lainnya atau ke nomor Dispatcher.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <a
                  href={
                    lastSentWaLog.waGroupUrl ||
                    buildWhatsAppGroupUrl(lastSentWaLog.message)
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 whitespace-nowrap"
                >
                  <Users className="h-3.5 w-3.5" />
                  Kirim ke Grup WhatsApp
                </a>
                {config.dispatcherWaPhone && (
                  <a
                    href={buildWhatsAppDirectUrl(
                      config.dispatcherWaPhone,
                      lastSentWaLog.message,
                      false
                    )}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 whitespace-nowrap"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    WA Dispatcher
                  </a>
                )}
                <button
                  type="button"
                  onClick={() =>
                    onCopyText(lastSentWaLog.message, 'Format laporan WhatsApp')
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-50 whitespace-nowrap"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Salin Teks
                </button>
              </div>
            </div>
            <pre className="mt-3 overflow-x-auto rounded-lg border border-emerald-200/80 bg-white p-3 font-mono text-xs leading-relaxed text-slate-800 whitespace-pre-wrap">
              {lastSentWaLog.message}
            </pre>
          </div>
        )}

        {/* ACTIVE TASKS */}
        {activeTab === 'aktif' && (
          <div className="mt-6 space-y-5">
            {activeTasks.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
                <Truck className="mx-auto h-8 w-8 text-slate-400" />
                <h2 className="mt-3 text-base font-semibold text-slate-900">
                  Belum Ada Surat Tugas Pengiriman Dingin Aktif
                </h2>
                <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
                  Penugasan baru untuk ID Driver{' '}
                  <span className="font-mono font-semibold text-slate-800">
                    {driver.id}
                  </span>{' '}
                  akan tampil otomatis di halaman ini.
                </p>
                <button
                  type="button"
                  onClick={onRefreshSync}
                  disabled={isSyncing}
                  className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`}
                  />
                  Periksa Penugasan Baru
                </button>
              </div>
            ) : (
              activeTasks.map((task) => {
                const isExpanded = selectedTaskId === task.id;
                const isWaiting = task.status === TaskStatus.MENUNGGU_BERANGKAT;
                const kmDelta =
                  !isWaiting &&
                  task.departureData &&
                  kmAkhir !== '' &&
                  Number(kmAkhir) >= task.departureData.kmAwal
                    ? Number(kmAkhir) - task.departureData.kmAwal
                    : null;

                return (
                  <article
                    key={task.id}
                    className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6"
                  >
                    {/* Unboxed Metadata Line */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2 text-slate-600">
                        <span className="font-mono font-semibold text-slate-900 tabular-nums">
                          {task.noPenugasan}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {task.tanggalTugas}
                          {task.jadwalJamTiba ? ` (${task.jadwalJamTiba})` : ''}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono font-medium text-slate-800">
                          {task.plateNumber}
                        </span>
                        {task.noSuratJalanFisik && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">
                              SJ: {task.noSuratJalanFisik}
                            </span>
                          </>
                        )}
                        {task.kodeSegel && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono font-semibold text-sky-800">
                              Segel: {task.kodeSegel}
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 font-semibold">
                        {isWaiting ? (
                          <span className="inline-flex items-center gap-1.5 text-amber-700">
                            <Clock className="h-3.5 w-3.5" />
                            Menunggu Berangkat
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 text-sky-700">
                            <Navigation className="h-3.5 w-3.5" />
                            Dalam Perjalanan
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Route & Cold Chain Cargo */}
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <div className="flex items-center gap-2 text-lg font-bold text-slate-900">
                          <MapPin className="h-4 w-4 shrink-0 text-slate-500" />
                          <span>
                            {task.origin} → {task.destination}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">
                          Muatan Rantai Dingin:{' '}
                          <span className="font-medium text-slate-900">
                            {task.purpose || 'Pengiriman Cold Chain'}
                          </span>
                        </p>
                        {task.notes && (
                          <p className="mt-1 text-xs text-slate-500">
                            Catatan Dispatcher: {task.notes}
                          </p>
                        )}
                      </div>

                      {!isExpanded && (
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                          {!isWaiting && (
                            <a
                              href={buildTaskGroupWaUrl(task)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap"
                            >
                              <Users className="h-3.5 w-3.5" />
                              WA Grup Berangkat
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => openTaskForm(task)}
                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap"
                          >
                            {isWaiting ? (
                              <>
                                <Send className="h-3.5 w-3.5" />
                                Isi Data Keberangkatan
                              </>
                            ) : (
                              <>
                                <ClipboardCheck className="h-3.5 w-3.5" />
                                Isi Data Serah Terima
                              </>
                            )}
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Recorded Departure Info */}
                    {!isWaiting && task.departureData && (
                      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-600">
                        <span>
                          Timestamp Berangkat:{' '}
                          <strong className="font-mono text-slate-800 tabular-nums">
                            {formatRealTimeTimestamp(
                              task.departureData.timestamp
                            )}
                          </strong>
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          KM Awal:{' '}
                          <strong className="font-mono text-slate-800 tabular-nums">
                            {task.departureData.kmAwal.toLocaleString('id-ID')}{' '}
                            km
                          </strong>
                        </span>
                        {task.departureData.suhuAwal && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              Suhu Awal:{' '}
                              <strong className="font-mono text-sky-800 tabular-nums">
                                {task.departureData.suhuAwal}
                              </strong>
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {/* ===================================================== */}
                    {/* FORM KEBERANGKATAN RANTAI DINGIN (1-CLICK WHATSAPP)   */}
                    {/* ===================================================== */}
                    {isExpanded && isWaiting && (
                      <form
                        onSubmit={(e) => handleDirectDepartureSubmit(e, task)}
                        className="mt-5 border-t border-slate-200 pt-5 space-y-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-slate-900">
                            Formulir Keberangkatan Rantai Pengiriman Dingin
                          </h3>
                          <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-700 tabular-nums">
                            <Clock className="h-3.5 w-3.5 text-sky-700" />
                            <span>
                              Timestamp Real-Time:{' '}
                              {formatRealTimeTimestamp(liveNow)}
                            </span>
                          </div>
                        </div>

                        {formValidationErr && (
                          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                            {formValidationErr}
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700">
                              Odometer KM Awal *
                            </label>
                            <input
                              type="number"
                              min={0}
                              required
                              value={kmAwal}
                              onChange={(e) => setKmAwal(e.target.value)}
                              placeholder="Isi angka KM keberangkatan"
                              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                              <Thermometer className="h-3.5 w-3.5 text-sky-700" />
                              <span>
                                Suhu Monitor Keberangkatan (°C) — Isi Manual *
                              </span>
                            </label>
                            <input
                              type="text"
                              required
                              value={suhuAwal}
                              onChange={(e) => setSuhuAwal(e.target.value)}
                              placeholder="Ketik suhu layar monitor (mis. -18.2°C)"
                              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700">
                              Posisi BBM Awal
                            </label>
                            <select
                              value={bbmAwal}
                              onChange={(e) => setBbmAwal(e.target.value)}
                              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                            >
                              <option value="Penuh (Full)">Penuh (Full)</option>
                              <option value="3/4 Tangki">3/4 Tangki</option>
                              <option value="1/2 Tangki">1/2 Tangki</option>
                              <option value="1/4 Tangki">1/4 Tangki</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700">
                              Kondisi Unit &amp; Pendingin
                            </label>
                            <select
                              value={kondisiKendaraan}
                              onChange={(e) =>
                                setKondisiKendaraan(e.target.value)
                              }
                              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                            >
                              <option value="Thermo Pendingin Normal">
                                Thermo Pendingin Normal
                              </option>
                              <option value="Pre-Cooling Tercapai & Segel Aman">
                                Pre-Cooling Tercapai &amp; Segel Aman
                              </option>
                              <option value="Catatan Teknis Ringan">
                                Catatan Teknis Ringan
                              </option>
                            </select>
                          </div>
                        </div>

                        {/* Photo Upload Fields: Odometer & Temperature Monitor */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <PhotoUploadField
                            label="Foto Odometer Keberangkatan"
                            helperText="Pastikan angka KM terlihat jelas"
                            required
                            value={fotoOdometerBerangkat}
                            onChange={setFotoOdometerBerangkat}
                          />

                          <PhotoUploadField
                            label="Foto Monitor Suhu Keberangkatan"
                            helperText="Pastikan layar suhu box pendingin terbaca"
                            required
                            value={fotoSuhuBerangkat}
                            onChange={setFotoSuhuBerangkat}
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700">
                            Catatan Keberangkatan (Opsional)
                          </label>
                          <input
                            type="text"
                            value={catatanBerangkat}
                            onChange={(e) =>
                              setCatatanBerangkat(e.target.value)
                            }
                            placeholder="Misal: Segel terpasang rapat, muatan frozen food aman"
                            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                          />
                        </div>

                        {/* Target WhatsApp Selector + 1-Click Submit */}
                        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                              Tujuan WA:
                            </span>
                            <div className="inline-flex rounded-lg bg-slate-100 p-1">
                              <button
                                type="button"
                                onClick={() => setWaTargetMode('GROUP')}
                                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                                  waTargetMode === 'GROUP'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Grup WhatsApp
                              </button>
                              <button
                                type="button"
                                onClick={() => setWaTargetMode('DIRECT')}
                                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                                  waTargetMode === 'DIRECT'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Nomor Dispatcher
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2.5">
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => setSelectedTaskId(null)}
                              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 disabled:opacity-50"
                            >
                              Batal
                            </button>
                            <button
                              type="submit"
                              disabled={submitting}
                              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap shrink-0 disabled:opacity-50"
                            >
                              <Send className="h-3.5 w-3.5" />
                              {submitting
                                ? 'Menyimpan & Membuka WA...'
                                : 'Simpan Keberangkatan & Siapkan WhatsApp'}
                            </button>
                          </div>
                        </div>
                      </form>
                    )}

                    {/* ===================================================== */}
                    {/* FORM SERAH TERIMA RANTAI DINGIN (1-CLICK WHATSAPP)    */}
                    {/* ===================================================== */}
                    {isExpanded && !isWaiting && (
                      <form
                        onSubmit={(e) => handleDirectHandoverSubmit(e, task)}
                        className="mt-5 border-t border-slate-200 pt-5 space-y-4"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="text-sm font-bold text-slate-900">
                            Formulir Serah Terima Tugas Rantai Dingin
                          </h3>
                          <div className="inline-flex items-center gap-1.5 font-mono text-xs font-semibold text-slate-700 tabular-nums">
                            <Clock className="h-3.5 w-3.5 text-emerald-700" />
                            <span>
                              Timestamp Real-Time:{' '}
                              {formatRealTimeTimestamp(liveNow)}
                            </span>
                          </div>
                        </div>

                        {formValidationErr && (
                          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-700">
                            {formValidationErr}
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-semibold text-slate-700">
                              Odometer KM Akhir *
                            </label>
                            <input
                              type="number"
                              min={task.departureData?.kmAwal || 0}
                              required
                              value={kmAkhir}
                              onChange={(e) => setKmAkhir(e.target.value)}
                              placeholder="Masukkan angka KM tiba"
                              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                            />
                            {kmDelta !== null && (
                              <p className="mt-1 font-mono text-xs text-emerald-700 tabular-nums">
                                Jarak tempuh: {kmDelta.toLocaleString('id-ID')}{' '}
                                km
                              </p>
                            )}
                          </div>

                          <div>
                            <label className="flex items-center gap-1 text-xs font-semibold text-slate-700">
                              <Thermometer className="h-3.5 w-3.5 text-sky-700" />
                              <span>
                                Suhu Monitor Serah Terima (°C) — Isi Manual *
                              </span>
                            </label>
                            <input
                              type="text"
                              required
                              value={suhuAkhir}
                              onChange={(e) => setSuhuAkhir(e.target.value)}
                              placeholder="Ketik suhu layar monitor saat tiba"
                              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm text-slate-900 tabular-nums focus:border-slate-900 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700">
                              Nama Penerima Serah Terima *
                            </label>
                            <input
                              type="text"
                              required
                              value={penerimaNama}
                              onChange={(e) => setPenerimaNama(e.target.value)}
                              placeholder="Nama petugas penerima"
                              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-slate-700">
                              Posisi BBM Akhir
                            </label>
                            <select
                              value={bbmAkhir}
                              onChange={(e) => setBbmAkhir(e.target.value)}
                              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                            >
                              <option value="Penuh (Full)">Penuh (Full)</option>
                              <option value="3/4 Tangki">3/4 Tangki</option>
                              <option value="1/2 Tangki">1/2 Tangki</option>
                              <option value="1/4 Tangki">1/4 Tangki</option>
                              <option value="Cadangan (Reserve)">
                                Cadangan (Reserve)
                              </option>
                            </select>
                          </div>

                          <div className="sm:col-span-2">
                            <label className="block text-xs font-semibold text-slate-700">
                              Kondisi Muatan &amp; Segel Saat Serah Terima
                            </label>
                            <select
                              value={kondisiAkhir}
                              onChange={(e) => setKondisiAkhir(e.target.value)}
                              className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                            >
                              <option value="Suhu & Segel Utuh - Lengkap">
                                Suhu &amp; Segel Utuh - Lengkap
                              </option>
                              <option value="Diterima Baik Sesuai Surat Jalan Fisik">
                                Diterima Baik Sesuai Surat Jalan Fisik
                              </option>
                              <option value="Ada Catatan Selisih / Suhu">
                                Ada Catatan Selisih / Suhu
                              </option>
                            </select>
                          </div>
                        </div>

                        {/* 3 Photo Upload Fields for Handover */}
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                          <PhotoUploadField
                            label="Foto Odometer Serah Terima"
                            required
                            value={fotoOdometerSerahTerima}
                            onChange={setFotoOdometerSerahTerima}
                          />

                          <PhotoUploadField
                            label="Foto Monitor Suhu Serah Terima"
                            required
                            value={fotoSuhuSerahTerima}
                            onChange={setFotoSuhuSerahTerima}
                          />

                          <PhotoUploadField
                            label="Foto Bukti Serah Terima"
                            required
                            value={fotoBuktiSerahTerima}
                            onChange={setFotoBuktiSerahTerima}
                          />
                        </div>

                        {/* Canvas Tanda Tangan Penerima */}
                        <SignatureCanvas
                          label="Canvas Tanda Tangan Penerima"
                          required
                          value={tandaTanganPenerima}
                          onChange={setTandaTanganPenerima}
                        />

                        <div>
                          <label className="block text-xs font-semibold text-slate-700">
                            Catatan Serah Terima (Opsional)
                          </label>
                          <input
                            type="text"
                            value={catatanSerahTerima}
                            onChange={(e) =>
                              setCatatanSerahTerima(e.target.value)
                            }
                            placeholder="Misal: Diserahterimakan di loading dock cold storage tujuan"
                            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-slate-900 focus:outline-none"
                          />
                        </div>

                        {/* Target WhatsApp Selector + 1-Click Submit */}
                        <div className="flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                              Tujuan WA:
                            </span>
                            <div className="inline-flex rounded-lg bg-slate-100 p-1">
                              <button
                                type="button"
                                onClick={() => setWaTargetMode('GROUP')}
                                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                                  waTargetMode === 'GROUP'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Grup WhatsApp
                              </button>
                              <button
                                type="button"
                                onClick={() => setWaTargetMode('DIRECT')}
                                className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                                  waTargetMode === 'DIRECT'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Nomor Dispatcher
                              </button>
                            </div>
                          </div>

                          <div className="flex items-center justify-end gap-2.5">
                            <button
                              type="button"
                              disabled={submitting}
                              onClick={() => setSelectedTaskId(null)}
                              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0 disabled:opacity-50"
                            >
                              Batal
                            </button>
                            <button
                              type="submit"
                              disabled={submitting}
                              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 whitespace-nowrap shrink-0 disabled:opacity-50"
                            >
                              <ClipboardCheck className="h-3.5 w-3.5" />
                              {submitting
                                ? 'Menyimpan & Membuka WA...'
                                : 'Selesaikan Serah Terima & Buka WhatsApp'}
                            </button>
                          </div>
                        </div>
                      </form>
                    )}
                  </article>
                );
              })
            )}
          </div>
        )}

        {/* COMPLETED HISTORY VIEW */}
        {activeTab === 'riwayat' && (
          <div className="mt-6 space-y-4">
            {completedTasks.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-10 text-center">
                <CheckCircle2 className="mx-auto h-8 w-8 text-slate-400" />
                <h2 className="mt-3 text-base font-semibold text-slate-900">
                  Belum Ada Riwayat Tugas Selesai
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Pengiriman rantai dingin yang telah selesai akan tercatat di
                  sini.
                </p>
              </div>
            ) : (
              completedTasks.map((task) => {
                const startKm = task.departureData?.kmAwal ?? 0;
                const endKm = task.handoverData?.kmAkhir ?? 0;
                const totalKm =
                  endKm >= startKm && startKm > 0 ? endKm - startKm : 0;

                return (
                  <div
                    key={task.id}
                    className="rounded-xl border border-slate-200 bg-white p-5"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2 text-slate-600">
                        <span className="font-mono font-semibold text-slate-900 tabular-nums">
                          {task.noPenugasan}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {task.tanggalTugas}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{task.plateNumber}</span>
                        {task.kodeSegel && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">
                              Segel: {task.kodeSegel}
                            </span>
                          </>
                        )}
                      </div>
                      <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Selesai
                      </span>
                    </div>

                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-base font-bold text-slate-900">
                          {task.origin} → {task.destination}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                          <span className="font-mono tabular-nums">
                            KM: {startKm.toLocaleString('id-ID')} →{' '}
                            {endKm.toLocaleString('id-ID')} (
                            {totalKm.toLocaleString('id-ID')} km)
                          </span>
                          {task.handoverData?.suhuAkhir && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span className="font-mono text-sky-800">
                                Suhu: {task.handoverData.suhuAkhir}
                              </span>
                            </>
                          )}
                          {task.handoverData?.penerimaNama && (
                            <>
                              <span aria-hidden="true">·</span>
                              <span>
                                Penerima: {task.handoverData.penerimaNama}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                        <a
                          href={buildTaskGroupWaUrl(task)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 whitespace-nowrap"
                        >
                          <Users className="h-3.5 w-3.5" />
                          Kirim ke Grup WA
                        </a>
                        {config.dispatcherWaPhone && (
                          <a
                            href={buildTaskDirectWaUrl(task)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            WA Dispatcher
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>
    </div>
  );
};
