import React, { useMemo, useState } from 'react';
import {
  ChevronDown,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  LogIn,
  RefreshCw,
  ShieldCheck,
  Snowflake,
  Truck,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  AppConfig,
  Assignment,
  DriverMaster,
  TaskStatus,
  UserRole,
  VehicleMaster,
} from '../types';
import { GoogleSignInButton } from './GoogleSignInButton';
import coldChainHeroImg from '../assets/images/crk_cold_chain_fleet_1792968127070.jpg';

interface LoginPageProps {
  drivers: DriverMaster[];
  vehicles: VehicleMaster[];
  assignments: Assignment[];
  config: AppConfig;
  googleUser: User | null;
  hasGoogleToken: boolean;
  isSyncing: boolean;
  onRefreshSync: () => Promise<void>;
  onGoogleLogin: () => Promise<void>;
  onDriverLoginSuccess: (driver: DriverMaster) => void;
  onAdminLoginSuccess: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  drivers,
  vehicles,
  assignments,
  config,
  googleUser,
  hasGoogleToken,
  isSyncing,
  onRefreshSync,
  onGoogleLogin,
  onDriverLoginSuccess,
  onAdminLoginSuccess,
}) => {
  const [selectedRole, setSelectedRole] = useState<UserRole>(UserRole.DRIVER);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [driverPin, setDriverPin] = useState<string>('');
  const [adminPin, setAdminPin] = useState<string>('');
  const [showPin, setShowPin] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [imgError, setImgError] = useState<boolean>(false);

  const activeDrivers = useMemo(
    () =>
      [...drivers]
        .filter((d) => d.active !== false)
        .sort((a, b) => a.id.localeCompare(b.id, 'id', { numeric: true })),
    [drivers]
  );

  const selectedDriverObj = useMemo(
    () => activeDrivers.find((d) => d.id === selectedDriverId) || null,
    [activeDrivers, selectedDriverId]
  );

  const activeTripsCount = useMemo(
    () =>
      assignments.filter(
        (a) =>
          a.status === TaskStatus.MENUNGGU_BERANGKAT ||
          a.status === TaskStatus.DALAM_PERJALANAN
      ).length,
    [assignments]
  );

  const handleDriverSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!selectedDriverId) {
      setErrorMessage('Pilih ID Driver dari daftar dropdown terlebih dahulu.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/driver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          driverId: selectedDriverId.trim(),
          pin: driverPin.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'Gagal masuk sebagai Driver.');
        return;
      }
      onDriverLoginSuccess(data.driver);
    } catch {
      setErrorMessage(
        'Gagal menghubungi server. Periksa koneksi jaringan Anda.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!adminPin.trim()) {
      setErrorMessage('Masukkan PIN Admin Dispatcher.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: adminPin.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMessage(data.error || 'PIN Admin Dispatcher salah.');
        return;
      }
      onAdminLoginSuccess();
    } catch {
      setErrorMessage(
        'Gagal menghubungi server. Periksa koneksi jaringan Anda.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Clean Single-Row Top Bar (3-Zone Contract) */}
      <header className="flex items-center justify-between gap-8 border-b border-slate-200 bg-white px-6 py-4">
        <div className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          CRK LOGISTIK DELIVERY SISTEM
        </div>

        <div className="hidden md:flex items-center gap-6 text-xs text-slate-500">
          <span className="whitespace-nowrap shrink-0">
            Rantai Pengiriman Dingin · Database:{' '}
            <strong className="font-medium text-slate-800">
              {config.spreadsheetTitle ||
                (config.spreadsheetId
                  ? 'Google Sheets Terhubung'
                  : 'Belum Terhubung ke Spreadsheet')}
            </strong>
          </span>
          {config.lastSyncedAt && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums whitespace-nowrap shrink-0">
                Sinkron:{' '}
                {new Date(config.lastSyncedAt).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onRefreshSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`}
            />
            {isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Data'}
          </button>
        </div>
      </header>

      {/* Main Split Viewport */}
      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-1 items-stretch gap-8 px-6 py-8 lg:grid-cols-12 lg:py-12">
        {/* Left Cold Chain Fleet Visual & Operational Context */}
        <section className="relative hidden overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 lg:col-span-6 lg:flex lg:flex-col lg:justify-between">
          {!imgError ? (
            <img
              src={coldChainHeroImg}
              alt="Armada truk berpendingin CRK Logistik Delivery Sistem di fasilitas Cold Storage"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="absolute inset-0 h-full w-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-sky-950 via-slate-900 to-slate-950" />
          )}

          {/* Measured Contrast Scrim */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/95 via-slate-950/60 to-slate-900/25" />

          <div className="relative z-10 p-8">
            <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-wide text-sky-200">
              <Snowflake className="h-4 w-4" />
              <span>Sistem Manajemen Rantai Pengiriman Dingin (Cold Chain)</span>
            </p>
          </div>

          <div className="relative z-10 p-8 pt-16">
            <h1 className="max-w-lg text-3xl font-bold leading-tight tracking-tight text-white">
              CRK LOGISTIK DELIVERY SISTEM
            </h1>
            <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-200">
              Monitoring terpadu keberangkatan armada reefer, foto monitor suhu,
              odometer, kode segel, tanda tangan digital serah terima, dan
              sinkronisasi otomatis Google Sheets.
            </p>

            {/* Real Synced Metrics Strip */}
            <div className="mt-8 grid grid-cols-3 gap-6 border-t border-white/15 pt-6">
              <div>
                <p className="text-xs text-slate-300">Driver Sinkron</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
                  {activeDrivers.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-300">Armada Reefer</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
                  {vehicles.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-300">Pengiriman Aktif</p>
                <p className="mt-1 font-mono text-2xl font-semibold text-white tabular-nums">
                  {activeTripsCount}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Right Login Form Workspace */}
        <section className="flex flex-col justify-center lg:col-span-6">
          <div className="mx-auto w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            <div>
              <p className="text-xs font-semibold text-sky-800">
                Aplikasi Rantai Pengiriman Dingin
              </p>
              <h2 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">
                Masuk ke Sistem Operasional
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Pilih peran akses Anda pada CRK LOGISTIK DELIVERY SISTEM.
              </p>
            </div>

            {/* Segmented Role Switcher */}
            <div className="mt-6 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1.5">
              <button
                type="button"
                onClick={() => {
                  setSelectedRole(UserRole.DRIVER);
                  setErrorMessage('');
                }}
                className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  selectedRole === UserRole.DRIVER
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Truck className="h-4 w-4" />
                Role Driver
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedRole(UserRole.ADMIN);
                  setErrorMessage('');
                }}
                className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  selectedRole === UserRole.ADMIN
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ShieldCheck className="h-4 w-4" />
                Admin Dispatcher
              </button>
            </div>

            {errorMessage && (
              <div
                role="alert"
                className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {errorMessage}
              </div>
            )}

            {/* DRIVER LOGIN FORM */}
            {selectedRole === UserRole.DRIVER ? (
              <form onSubmit={handleDriverSubmit} className="mt-6 space-y-5">
                <div>
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="driver-id-select"
                      className="block text-sm font-semibold text-slate-800"
                    >
                      ID Driver
                    </label>
                    <button
                      type="button"
                      onClick={onRefreshSync}
                      disabled={isSyncing}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${isSyncing ? 'animate-spin' : ''}`}
                      />
                      Muat ulang dari Spreadsheet
                    </button>
                  </div>

                  <div className="relative mt-2">
                    <select
                      id="driver-id-select"
                      value={selectedDriverId}
                      onChange={(e) => {
                        setSelectedDriverId(e.target.value);
                        setErrorMessage('');
                      }}
                      className="w-full appearance-none rounded-lg border border-slate-300 bg-white py-2.5 pl-3.5 pr-10 text-sm font-medium text-slate-900 transition-colors focus:border-slate-900 focus:outline-none"
                    >
                      <option value="">
                        {activeDrivers.length > 0
                          ? '-- Pilih ID Driver dari Daftar Sinkronisasi --'
                          : '-- Belum ada data Master Driver di Spreadsheet --'}
                      </option>
                      {activeDrivers.map((drv) => (
                        <option key={drv.id} value={drv.id}>
                          {drv.id} — {drv.name}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  </div>

                  {activeDrivers.length === 0 && (
                    <p className="mt-2 text-xs leading-relaxed text-amber-700">
                      Data Master Driver masih kosong (tanpa data dummy). Masuk
                      ke{' '}
                      <button
                        type="button"
                        onClick={() => setSelectedRole(UserRole.ADMIN)}
                        className="font-semibold underline hover:text-amber-900"
                      >
                        Admin Dispatcher
                      </button>{' '}
                      untuk menghubungkan Google Sheets atau menambahkan Master
                      Driver.
                    </p>
                  )}

                  {selectedDriverObj && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="font-semibold text-slate-900">
                        {selectedDriverObj.name}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">
                        {selectedDriverObj.id}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{selectedDriverObj.licenseType}</span>
                      {!selectedDriverObj.pin && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-700">
                            Tanpa PIN (langsung masuk)
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="driver-pin-input"
                    className="block text-sm font-semibold text-slate-800"
                  >
                    PIN Driver{' '}
                    {selectedDriverObj && !selectedDriverObj.pin && (
                      <span className="font-normal text-slate-500">
                        (Opsional)
                      </span>
                    )}
                  </label>
                  <div className="relative mt-2">
                    <input
                      id="driver-pin-input"
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      autoComplete="off"
                      value={driverPin}
                      onChange={(e) => setDriverPin(e.target.value)}
                      placeholder={
                        selectedDriverObj && !selectedDriverObj.pin
                          ? 'PIN tidak disetel di Spreadsheet — tekan Masuk'
                          : 'Masukkan PIN Driver Anda'
                      }
                      className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-3.5 pr-10 font-mono text-sm text-slate-900 tabular-nums transition-colors focus:border-slate-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-800"
                      aria-label={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                    >
                      {showPin ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting || activeDrivers.length === 0}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <LogIn className="h-4 w-4" />
                  {submitting ? 'Memverifikasi Akses...' : 'Masuk sebagai Driver'}
                </button>
              </form>
            ) : (
              /* ADMIN DISPATCHER LOGIN FORM */
              <form onSubmit={handleAdminSubmit} className="mt-6 space-y-5">
                <div>
                  <label
                    htmlFor="admin-pin-input"
                    className="block text-sm font-semibold text-slate-800"
                  >
                    PIN Admin Dispatcher
                  </label>
                  <div className="relative mt-2">
                    <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="admin-pin-input"
                      type={showPin ? 'text' : 'password'}
                      inputMode="numeric"
                      autoComplete="off"
                      value={adminPin}
                      onChange={(e) => setAdminPin(e.target.value)}
                      placeholder="Masukkan PIN Admin Dispatcher"
                      className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-10 font-mono text-sm text-slate-900 tabular-nums transition-colors focus:border-slate-900 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPin((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-slate-500 hover:text-slate-800"
                      aria-label={showPin ? 'Sembunyikan PIN' : 'Tampilkan PIN'}
                    >
                      {showPin ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {config.isDefaultPin && (
                    <p className="mt-2 text-xs text-slate-500">
                      PIN awal standar:{' '}
                      <span className="font-mono font-semibold text-slate-800 tabular-nums">
                        123456
                      </span>
                      . Anda dapat mengubah PIN sendiri setelah masuk.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {submitting
                    ? 'Memverifikasi PIN...'
                    : 'Masuk Portal Dispatcher'}
                </button>
              </form>
            )}

            {/* Google Sheets Synchronization Account Connection */}
            <div className="mt-7 border-t border-slate-200 pt-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-800">
                    <FileSpreadsheet className="h-4 w-4 shrink-0 text-emerald-700" />
                    <span>Sinkronisasi Google Sheets</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-slate-500">
                    {hasGoogleToken && googleUser
                      ? `Terhubung: ${googleUser.email}`
                      : 'Hubungkan akun Google untuk sinkronisasi otomatis Spreadsheet'}
                  </p>
                </div>

                {!hasGoogleToken ? (
                  <GoogleSignInButton
                    onClick={onGoogleLogin}
                    label="Sign in with Google"
                  />
                ) : (
                  <span className="text-xs font-semibold text-emerald-700 whitespace-nowrap shrink-0">
                    Aktif &amp; Sinkron
                  </span>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
};
