import React, { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  AlertTriangle,
  Award,
  CalendarClock,
  CheckCircle2,
  Clock,
  Truck,
} from 'lucide-react';
import { Assignment, DriverMaster, TaskStatus } from '../types';
import {
  calculateTripDurationMinutes,
  evaluateAssignmentOtd,
  formatDurationMinutes,
} from '../utils/media';

const PIE_COLORS = [
  '#0f172a',
  '#0284c7',
  '#059669',
  '#d97706',
  '#475569',
  '#0d9488',
  '#2563eb',
];

export interface DriverPerformanceRow {
  driverId: string;
  driverName: string;
  totalTasks: number;
  completedDeliveries: number;
  onTimeDeliveries: number;
  pendingTasks: number;
  avgDurationMinutes: number | null;
  completionRate: number;
  onTimeRate: number | null;
}

export interface OnTimeSchedulePoint {
  tanggalLabel: string;
  tepatWaktu: number;
  terlambat: number;
  aktifDalamJadwal: number;
  aktifLewatJadwal: number;
}

export function useOnTimeDeliveryStats(assignments: Assignment[]) {
  return useMemo(() => {
    const nowMs = Date.now();
    let onTimeCompleted = 0;
    let lateCompleted = 0;
    let onTrackActive = 0;
    let overdueActive = 0;
    let lateMinutesSum = 0;
    let lateMinutesCount = 0;

    const byDate = new Map<
      string,
      {
        tanggalRaw: string;
        tepatWaktu: number;
        terlambat: number;
        aktifDalamJadwal: number;
        aktifLewatJadwal: number;
      }
    >();

    for (const asg of assignments) {
      const ev = evaluateAssignmentOtd(asg, nowMs);
      const dateKey = (asg.tanggalTugas || 'Tanpa Jadwal').trim();
      const bucket = byDate.get(dateKey) || {
        tanggalRaw: dateKey,
        tepatWaktu: 0,
        terlambat: 0,
        aktifDalamJadwal: 0,
        aktifLewatJadwal: 0,
      };

      if (ev.category === 'ON_TIME') {
        onTimeCompleted += 1;
        bucket.tepatWaktu += 1;
      } else if (ev.category === 'LATE_COMPLETED') {
        lateCompleted += 1;
        bucket.terlambat += 1;
        if (ev.delayMinutes > 0) {
          lateMinutesSum += ev.delayMinutes;
          lateMinutesCount += 1;
        }
      } else if (ev.category === 'OVERDUE_ACTIVE') {
        overdueActive += 1;
        bucket.aktifLewatJadwal += 1;
      } else if (ev.category === 'ON_TRACK_ACTIVE') {
        onTrackActive += 1;
        bucket.aktifDalamJadwal += 1;
      }

      if (asg.tanggalTugas) {
        byDate.set(dateKey, bucket);
      }
    }

    const totalCompleted = onTimeCompleted + lateCompleted;
    const totalScheduled =
      onTimeCompleted + lateCompleted + onTrackActive + overdueActive;

    const onTimeDeliveryRate =
      totalCompleted > 0
        ? Math.round((onTimeCompleted / totalCompleted) * 1000) / 10
        : null;

    const overallScheduleAdherence =
      totalScheduled > 0
        ? Math.round(
            ((onTimeCompleted + onTrackActive) / totalScheduled) * 1000
          ) / 10
        : null;

    const avgLateMinutes =
      lateMinutesCount > 0
        ? Math.round(lateMinutesSum / lateMinutesCount)
        : null;

    const timelineData: OnTimeSchedulePoint[] = Array.from(byDate.values())
      .sort((a, b) => a.tanggalRaw.localeCompare(b.tanggalRaw))
      .slice(-7)
      .map((item) => {
        const shortLabel =
          item.tanggalRaw.length >= 10
            ? item.tanggalRaw.slice(5)
            : item.tanggalRaw;
        return {
          tanggalLabel: shortLabel,
          tepatWaktu: item.tepatWaktu,
          terlambat: item.terlambat,
          aktifDalamJadwal: item.aktifDalamJadwal,
          aktifLewatJadwal: item.aktifLewatJadwal,
        };
      });

    return {
      onTimeCompleted,
      lateCompleted,
      onTrackActive,
      overdueActive,
      totalCompleted,
      totalScheduled,
      onTimeDeliveryRate,
      overallScheduleAdherence,
      avgLateMinutes,
      timelineData,
    };
  }, [assignments]);
}

export function useDriverPerformanceStats(
  assignments: Assignment[],
  drivers: DriverMaster[]
): {
  completedCount: number;
  pendingCount: number;
  waitingCount: number;
  inTransitCount: number;
  overallAvgMinutes: number | null;
  performanceRows: DriverPerformanceRow[];
} {
  return useMemo(() => {
    const nowMs = Date.now();
    let completedCount = 0;
    let waitingCount = 0;
    let inTransitCount = 0;

    let totalDurationSum = 0;
    let totalDurationTrips = 0;

    const map = new Map<
      string,
      {
        driverId: string;
        driverName: string;
        totalTasks: number;
        completedDeliveries: number;
        onTimeDeliveries: number;
        pendingTasks: number;
        durationSum: number;
        durationCount: number;
      }
    >();

    for (const d of drivers) {
      map.set(d.id.toUpperCase(), {
        driverId: d.id.toUpperCase(),
        driverName: d.name,
        totalTasks: 0,
        completedDeliveries: 0,
        onTimeDeliveries: 0,
        pendingTasks: 0,
        durationSum: 0,
        durationCount: 0,
      });
    }

    for (const asg of assignments) {
      if (asg.status === TaskStatus.SELESAI) {
        completedCount++;
      } else if (asg.status === TaskStatus.MENUNGGU_BERANGKAT) {
        waitingCount++;
      } else {
        inTransitCount++;
      }

      const key = (asg.driverId || asg.driverName || 'UNKNOWN')
        .trim()
        .toUpperCase();
      const existing = map.get(key) || {
        driverId: asg.driverId || '-',
        driverName: asg.driverName || 'Driver',
        totalTasks: 0,
        completedDeliveries: 0,
        onTimeDeliveries: 0,
        pendingTasks: 0,
        durationSum: 0,
        durationCount: 0,
      };

      existing.totalTasks += 1;
      if (asg.status === TaskStatus.SELESAI) {
        existing.completedDeliveries += 1;
        const otd = evaluateAssignmentOtd(asg, nowMs);
        if (otd.category === 'ON_TIME') {
          existing.onTimeDeliveries += 1;
        }
        const mins = calculateTripDurationMinutes(
          asg.departureData?.timestamp,
          asg.handoverData?.timestamp
        );
        if (mins !== null) {
          existing.durationSum += mins;
          existing.durationCount += 1;
          totalDurationSum += mins;
          totalDurationTrips += 1;
        }
      } else {
        existing.pendingTasks += 1;
      }

      map.set(key, existing);
    }

    const performanceRows: DriverPerformanceRow[] = Array.from(map.values())
      .map((item) => ({
        driverId: item.driverId,
        driverName: item.driverName,
        totalTasks: item.totalTasks,
        completedDeliveries: item.completedDeliveries,
        onTimeDeliveries: item.onTimeDeliveries,
        pendingTasks: item.pendingTasks,
        avgDurationMinutes:
          item.durationCount > 0
            ? Math.round(item.durationSum / item.durationCount)
            : null,
        completionRate:
          item.totalTasks > 0
            ? Math.round((item.completedDeliveries / item.totalTasks) * 100)
            : 0,
        onTimeRate:
          item.completedDeliveries > 0
            ? Math.round(
                (item.onTimeDeliveries / item.completedDeliveries) * 100
              )
            : null,
      }))
      .sort((a, b) => {
        if (b.completedDeliveries !== a.completedDeliveries) {
          return b.completedDeliveries - a.completedDeliveries;
        }
        return b.totalTasks - a.totalTasks;
      });

    return {
      completedCount,
      pendingCount: waitingCount + inTransitCount,
      waitingCount,
      inTransitCount,
      overallAvgMinutes:
        totalDurationTrips > 0
          ? Math.round(totalDurationSum / totalDurationTrips)
          : null,
      performanceRows,
    };
  }, [assignments, drivers]);
}

interface OnTimeSummaryProps {
  assignments: Assignment[];
}

export const OnTimeDeliverySummarySection: React.FC<OnTimeSummaryProps> = ({
  assignments,
}) => {
  const otd = useOnTimeDeliveryStats(assignments);

  const otdBarData = [
    {
      status: 'Tepat Waktu',
      jumlah: otd.onTimeCompleted,
      color: '#059669',
    },
    {
      status: 'Selesai Terlambat',
      jumlah: otd.lateCompleted,
      color: '#dc2626',
    },
    {
      status: 'Aktif Sesuai Jadwal',
      jumlah: otd.onTrackActive,
      color: '#0284c7',
    },
    {
      status: 'Aktif Lewat Jadwal',
      jumlah: otd.overdueActive,
      color: '#d97706',
    },
  ];

  const displayRate =
    otd.onTimeDeliveryRate !== null ? `${otd.onTimeDeliveryRate}%` : '—';

  const progressWidth =
    otd.onTimeDeliveryRate !== null
      ? Math.min(100, Math.max(0, otd.onTimeDeliveryRate))
      : 0;

  return (
    <section
      aria-label="Ringkasan On-Time Delivery"
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
    >
      <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-12 lg:divide-x lg:divide-y-0">
        {/* Left Column: On-Time Delivery KPI & Schedule Adherence Breakdown */}
        <div className="p-5 sm:p-6 lg:col-span-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <CalendarClock className="h-4 w-4 text-emerald-700 shrink-0" />
                <span>Ketepatan Waktu Pengiriman (On-Time Delivery)</span>
              </div>
              {otd.overallScheduleAdherence !== null && (
                <span className="font-mono text-xs text-slate-500 tabular-nums">
                  Kepatuhan Jadwal: {otd.overallScheduleAdherence}%
                </span>
              )}
            </div>

            <div className="mt-3 flex items-baseline gap-3">
              <span className="font-mono text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 tabular-nums">
                {displayRate}
              </span>
              <span className="text-xs text-slate-500">
                {otd.totalCompleted > 0
                  ? `${otd.onTimeCompleted} dari ${otd.totalCompleted} serah terima sesuai jadwal`
                  : 'Menunggu penyelesaian pengiriman pertama'}
              </span>
            </div>

            {/* Linear Progress Bar */}
            <div className="mt-4">
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-transform duration-200"
                  style={{ width: `${progressWidth}%` }}
                />
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500">
                <span>
                  Evaluasi timestamp real-time serah terima terhadap jadwal
                  tanggal &amp; jam tiba asli
                </span>
                {otd.avgLateMinutes !== null && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono text-red-700 tabular-nums">
                      Rata-rata deviasi terlambat:{' '}
                      {formatDurationMinutes(otd.avgLateMinutes)}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Hairline-divided 4-metric breakdown (no nested cards) */}
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-slate-200 pt-4 sm:grid-cols-4 lg:grid-cols-2">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                <span>Selesai Tepat Waktu</span>
              </div>
              <p className="mt-1 font-mono text-lg font-bold text-emerald-700 tabular-nums">
                {otd.onTimeCompleted}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <AlertTriangle className="h-3.5 w-3.5 text-red-600 shrink-0" />
                <span>Selesai Terlambat</span>
              </div>
              <p className="mt-1 font-mono text-lg font-bold text-red-600 tabular-nums">
                {otd.lateCompleted}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <Clock className="h-3.5 w-3.5 text-sky-700 shrink-0" />
                <span>Aktif Sesuai Jadwal</span>
              </div>
              <p className="mt-1 font-mono text-lg font-bold text-sky-700 tabular-nums">
                {otd.onTrackActive}
              </p>
            </div>

            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-700 shrink-0" />
                <span>Aktif Lewat Jadwal</span>
              </div>
              <p className="mt-1 font-mono text-lg font-bold text-amber-700 tabular-nums">
                {otd.overdueActive}
              </p>
            </div>
          </div>
        </div>

        {/* Right Column: Recharts On-Time vs Schedule Visualization */}
        <div className="p-5 sm:p-6 lg:col-span-7">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Visualisasi Ketepatan Jadwal Pengiriman (On-Time vs Terlambat)
              </h3>
              <p className="text-xs text-slate-500">
                {otd.timelineData.length > 1
                  ? 'Perbandingan realisasi timestamp pengiriman terhadap tanggal jadwal penugasan'
                  : 'Distribusi status ketepatan jadwal seluruh penugasan rantai dingin'}
              </p>
            </div>
          </div>

          {assignments.length === 0 ? (
            <div className="flex h-52 items-center justify-center text-xs text-slate-500">
              Data visualisasi On-Time Delivery akan tampil setelah Surat Tugas
              diterbitkan.
            </div>
          ) : otd.timelineData.length > 1 ? (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={otd.timelineData}
                  margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="tanggalLabel"
                    tick={{ fontSize: 11, fill: '#334155' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#334155' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <Tooltip
                    formatter={(val, name) => [`${val ?? 0} Tugas`, String(name)]}
                    contentStyle={{
                      borderRadius: '8px',
                      borderColor: '#cbd5e1',
                      fontSize: '12px',
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    height={30}
                    wrapperStyle={{ fontSize: '11px' }}
                  />
                  <Bar
                    dataKey="tepatWaktu"
                    name="Selesai Tepat Waktu"
                    stackId="otd"
                    fill="#059669"
                    maxBarSize={48}
                  />
                  <Bar
                    dataKey="terlambat"
                    name="Selesai Terlambat"
                    stackId="otd"
                    fill="#dc2626"
                    maxBarSize={48}
                  />
                  <Bar
                    dataKey="aktifDalamJadwal"
                    name="Aktif Sesuai Jadwal"
                    stackId="otd"
                    fill="#0284c7"
                    maxBarSize={48}
                  />
                  <Bar
                    dataKey="aktifLewatJadwal"
                    name="Aktif Lewat Jadwal"
                    stackId="otd"
                    fill="#d97706"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-56 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={otdBarData}
                  margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey="status"
                    tick={{ fontSize: 11, fill: '#334155' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#334155' }}
                    axisLine={{ stroke: '#cbd5e1' }}
                  />
                  <Tooltip
                    formatter={(val) => [`${val ?? 0} Penugasan`, 'Jumlah']}
                    contentStyle={{
                      borderRadius: '8px',
                      borderColor: '#cbd5e1',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="jumlah" radius={[6, 6, 0, 0]} maxBarSize={56}>
                    {otdBarData.map((entry, idx) => (
                      <Cell key={`otd-cell-${idx}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

interface DashboardChartsProps {
  assignments: Assignment[];
  drivers: DriverMaster[];
}

export const DashboardChartsSection: React.FC<DashboardChartsProps> = ({
  assignments,
  drivers,
}) => {
  const stats = useDriverPerformanceStats(assignments, drivers);

  const barData = [
    {
      kategori: 'Tugas Selesai',
      jumlah: stats.completedCount,
      color: '#059669',
    },
    {
      kategori: 'Tugas Pending',
      jumlah: stats.pendingCount,
      color: '#d97706',
    },
  ];

  const pieData = stats.performanceRows
    .filter((r) => r.totalTasks > 0)
    .map((r) => ({
      name: `${r.driverName} (${r.completedDeliveries}/${r.totalTasks})`,
      value: r.totalTasks,
    }));

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Bar Chart: Completed vs Pending Tasks */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-slate-900">
            Perbandingan Tugas Selesai vs Pending
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Total pengiriman rantai dingin selesai dibanding antrian &amp; dalam
            perjalanan
          </p>
        </div>

        <div className="h-60 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={barData}
              margin={{ top: 10, right: 16, left: -12, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="kategori"
                tick={{ fontSize: 12, fill: '#334155' }}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 12, fill: '#334155' }}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <Tooltip
                formatter={(val) => [`${val ?? 0} Penugasan`, 'Jumlah']}
                contentStyle={{
                  borderRadius: '8px',
                  borderColor: '#cbd5e1',
                  fontSize: '12px',
                }}
              />
              <Bar dataKey="jumlah" radius={[6, 6, 0, 0]} maxBarSize={64}>
                {barData.map((entry, index) => (
                  <Cell key={`bar-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pie Chart: Task Distribution by Driver Performance */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="mb-4">
          <h3 className="text-sm font-bold text-slate-900">
            Distribusi Penugasan &amp; Performa Driver
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Proporsi beban tugas pengiriman dan rasio selesai per Driver
          </p>
        </div>

        {pieData.length === 0 ? (
          <div className="flex h-60 items-center justify-center text-xs text-slate-500">
            Belum ada data penugasan untuk divisualisasikan.
          </div>
        ) : (
          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="46%"
                  innerRadius={48}
                  outerRadius={78}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {pieData.map((_entry, index) => (
                    <Cell
                      key={`pie-${index}`}
                      fill={PIE_COLORS[index % PIE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val) => [`${val ?? 0} Tugas`, 'Total']}
                  contentStyle={{
                    borderRadius: '8px',
                    borderColor: '#cbd5e1',
                    fontSize: '12px',
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  wrapperStyle={{ fontSize: '11px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
};

interface DriverPerformanceViewProps {
  assignments: Assignment[];
  drivers: DriverMaster[];
}

export const DriverPerformanceView: React.FC<DriverPerformanceViewProps> = ({
  assignments,
  drivers,
}) => {
  const stats = useDriverPerformanceStats(assignments, drivers);
  const otd = useOnTimeDeliveryStats(assignments);

  return (
    <div className="space-y-6">
      {/* KPI Summary Strip */}
      <div className="grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-4">
        <div className="bg-white p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
            <span>Total Pengiriman Selesai</span>
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {stats.completedCount}
          </p>
        </div>

        <div className="bg-white p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <CalendarClock className="h-4 w-4 text-emerald-700" />
            <span>On-Time Delivery Rate</span>
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold text-emerald-700 tabular-nums">
            {otd.onTimeDeliveryRate !== null
              ? `${otd.onTimeDeliveryRate}%`
              : '—'}
          </p>
        </div>

        <div className="bg-white p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Clock className="h-4 w-4 text-sky-700" />
            <span>Rata-Rata Durasi Perjalanan</span>
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {formatDurationMinutes(stats.overallAvgMinutes)}
          </p>
        </div>

        <div className="bg-white p-5">
          <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
            <Truck className="h-4 w-4 text-slate-700" />
            <span>Driver Terdaftar &amp; Aktif</span>
          </div>
          <p className="mt-1.5 font-mono text-2xl font-bold text-slate-900 tabular-nums">
            {stats.performanceRows.length}
          </p>
        </div>
      </div>

      {/* Charts */}
      <DashboardChartsSection assignments={assignments} drivers={drivers} />

      {/* Driver Performance Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-6 py-4">
          <h2 className="text-sm font-bold text-slate-900">
            Tabel Evaluasi Performa &amp; Ketepatan Waktu Driver
          </h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Dihitung otomatis berdasarkan log keberangkatan, serah terima
            real-time, dan jadwal penugasan asli
          </p>
        </div>

        {stats.performanceRows.length === 0 ? (
          <div className="p-12 text-center">
            <Award className="mx-auto h-8 w-8 text-slate-400" />
            <h3 className="mt-3 text-base font-semibold text-slate-900">
              Belum Ada Data Performa Driver
            </h3>
            <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">
              Data rata-rata durasi perjalanan dan On-Time Delivery akan
              dihitung otomatis setelah Driver menyelesaikan penugasan.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                  <th className="px-4 py-3">ID Driver</th>
                  <th className="px-4 py-3">Nama Driver</th>
                  <th className="px-4 py-3 text-right">Total Tugas</th>
                  <th className="px-4 py-3 text-right">Pengiriman Selesai</th>
                  <th className="px-4 py-3 text-right">Tugas Pending</th>
                  <th className="px-4 py-3 text-right">On-Time Rate</th>
                  <th className="px-4 py-3 text-right">
                    Rata-Rata Durasi Perjalanan
                  </th>
                  <th className="px-4 py-3 text-right">Tingkat Penyelesaian</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {stats.performanceRows.map((row) => (
                  <tr
                    key={`${row.driverId}-${row.driverName}`}
                    className="hover:bg-slate-50/80"
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-900 tabular-nums">
                      {row.driverId}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {row.driverName}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-slate-700 tabular-nums">
                      {row.totalTasks}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-bold text-emerald-700 tabular-nums">
                      {row.completedDeliveries}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs text-amber-700 tabular-nums">
                      {row.pendingTasks}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-emerald-700 tabular-nums">
                      {row.onTimeRate !== null ? `${row.onTimeRate}%` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-slate-900 tabular-nums">
                      {formatDurationMinutes(row.avgDurationMinutes)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-xs font-semibold text-slate-800 tabular-nums">
                      {row.completionRate}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
