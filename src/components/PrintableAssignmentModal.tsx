import React from 'react';
import { Printer, Snowflake, X } from 'lucide-react';
import { Assignment } from '../types';
import {
  calculateTripDurationMinutes,
  evaluateAssignmentOtd,
  formatDurationMinutes,
  formatRealTimeTimestamp,
} from '../utils/media';

interface PrintableAssignmentModalProps {
  assignment: Assignment | null;
  onClose: () => void;
}

export const PrintableAssignmentModal: React.FC<
  PrintableAssignmentModalProps
> = ({ assignment, onClose }) => {
  if (!assignment) return null;

  const durationMins = calculateTripDurationMinutes(
    assignment.departureData?.timestamp,
    assignment.handoverData?.timestamp
  );
  const otdEval = evaluateAssignmentOtd(assignment);

  const startKm = assignment.departureData?.kmAwal;
  const endKm = assignment.handoverData?.kmAkhir;
  const distanceTraveled =
    startKm !== undefined && endKm !== undefined && endKm >= startKm
      ? endKm - startKm
      : null;

  const handlePrintPdf = () => {
    window.print();
  };

  return (
    <div
      id="printable-report-overlay"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-950/60 p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
    >
      <div
        id="printable-assignment-sheet"
        className="w-full max-w-4xl rounded-xl border border-slate-200 bg-white p-6 shadow-2xl sm:p-10"
      >
        {/* Top Action Bar (Hidden when printing) */}
        <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div className="text-sm font-semibold text-slate-700">
            Pratinjau Laporan Cetak / PDF ({assignment.noPenugasan})
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handlePrintPdf}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <Printer className="h-4 w-4" />
              Cetak / Simpan PDF
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
              Tutup
            </button>
          </div>
        </div>

        {/* Official Report Header */}
        <div className="flex flex-col justify-between gap-4 border-b-2 border-slate-900 pb-5 sm:flex-row sm:items-end">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider text-sky-800">
              <Snowflake className="h-4 w-4" />
              <span>COLD CHAIN LOGISTICS REPORT</span>
            </div>
            <h1 className="mt-1 text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">
              CRK LOGISTIK DELIVERY SISTEM
            </h1>
            <p className="mt-0.5 text-xs text-slate-600">
              Dokumen Resmi Surat Tugas, Monitoring Suhu &amp; Berita Acara Serah
              Terima Rantai Pengiriman Dingin
            </p>
          </div>

          <div className="text-left sm:text-right font-mono text-xs tabular-nums">
            <p className="font-bold text-slate-900">
              No. Penugasan: {assignment.noPenugasan}
            </p>
            <p className="mt-0.5 text-slate-600">
              Jadwal Tugas: {assignment.tanggalTugas}
              {assignment.jadwalJamTiba
                ? ` · Target ${assignment.jadwalJamTiba}`
                : ''}
            </p>
            <p className="mt-0.5 font-semibold text-slate-800">
              Status: {assignment.status}
              {otdEval.category === 'ON_TIME'
                ? ' · Tepat Waktu'
                : otdEval.category === 'LATE_COMPLETED'
                ? ` · Terlambat (+${formatDurationMinutes(otdEval.delayMinutes)})`
                : otdEval.category === 'OVERDUE_ACTIVE'
                ? ` · Lewat Jadwal (+${formatDurationMinutes(otdEval.delayMinutes)})`
                : ''}
            </p>
          </div>
        </div>

        {/* Section 1: Informasi Penugasan, Surat Jalan Fisik & Kode Segel */}
        <div className="print-avoid-break mt-6 grid grid-cols-1 gap-4 rounded-lg border border-slate-200 p-4 text-xs sm:grid-cols-3">
          <div>
            <p className="text-slate-500">No. Surat Jalan Fisik</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
              {assignment.noSuratJalanFisik || '-'}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Kode Segel Box Pendingin</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
              {assignment.kodeSegel || '-'}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Durasi Perjalanan Total</p>
            <p className="mt-0.5 font-mono text-sm font-bold text-slate-900 tabular-nums">
              {formatDurationMinutes(durationMins)}
            </p>
          </div>

          <div>
            <p className="text-slate-500">Driver Bertugas</p>
            <p className="mt-0.5 font-semibold text-slate-900">
              {assignment.driverName} ({assignment.driverId})
            </p>
            <p className="font-mono text-slate-600">
              {assignment.driverPhone || '-'}
            </p>
          </div>
          <div>
            <p className="text-slate-500">Unit Armada Reefer</p>
            <p className="mt-0.5 font-mono font-semibold text-slate-900">
              {assignment.plateNumber}
            </p>
            <p className="text-slate-600">{assignment.vehicleType || '-'}</p>
          </div>
          <div>
            <p className="text-slate-500">Muatan / Komoditas Dingin</p>
            <p className="mt-0.5 font-semibold text-slate-900">
              {assignment.purpose || '-'}
            </p>
          </div>

          <div className="sm:col-span-3 border-t border-slate-200 pt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-slate-500">Lokasi Asal (Cold Storage)</p>
              <p className="mt-0.5 font-semibold text-slate-900">
                {assignment.origin}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Lokasi Tujuan Pengiriman</p>
              <p className="mt-0.5 font-semibold text-slate-900">
                {assignment.destination}
              </p>
            </div>
          </div>

          {assignment.notes && (
            <div className="sm:col-span-3 border-t border-slate-200 pt-2">
              <p className="text-slate-500">Instruksi / Catatan Dispatcher:</p>
              <p className="mt-0.5 text-slate-800">{assignment.notes}</p>
            </div>
          )}
        </div>

        {/* Section 2: Log Timestamp Keberangkatan & Serah Terima */}
        <div className="print-avoid-break mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-lg border border-slate-200 p-4 text-xs">
            <h2 className="text-sm font-bold text-slate-900">
              01. Data Keberangkatan Rantai Dingin
            </h2>
            {assignment.departureData ? (
              <dl className="mt-3 space-y-1.5">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Timestamp Real-Time:</dt>
                  <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                    {formatRealTimeTimestamp(assignment.departureData.timestamp)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Odometer KM Awal:</dt>
                  <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                    {assignment.departureData.kmAwal.toLocaleString('id-ID')} km
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Suhu Monitor Awal:</dt>
                  <dd className="font-mono font-semibold text-sky-800 tabular-nums">
                    {assignment.departureData.suhuAwal || '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Posisi BBM Awal:</dt>
                  <dd className="text-slate-900">
                    {assignment.departureData.bbmAwal}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Kondisi Unit:</dt>
                  <dd className="text-slate-900">
                    {assignment.departureData.kondisiKendaraan}
                  </dd>
                </div>
                <div className="pt-1 border-t border-slate-100">
                  <dt className="text-slate-500">Catatan Keberangkatan:</dt>
                  <dd className="mt-0.5 text-slate-800">
                    {assignment.departureData.catatanBerangkat || '-'}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-slate-500">
                Belum ada laporan keberangkatan tercatat.
              </p>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 p-4 text-xs">
            <h2 className="text-sm font-bold text-slate-900">
              02. Data Serah Terima Rantai Dingin
            </h2>
            {assignment.handoverData ? (
              <dl className="mt-3 space-y-1.5">
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Timestamp Real-Time:</dt>
                  <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                    {formatRealTimeTimestamp(assignment.handoverData.timestamp)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Odometer KM Akhir:</dt>
                  <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                    {assignment.handoverData.kmAkhir.toLocaleString('id-ID')} km
                    {distanceTraveled !== null
                      ? ` (${distanceTraveled.toLocaleString('id-ID')} km)`
                      : ''}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Suhu Monitor Serah Terima:</dt>
                  <dd className="font-mono font-semibold text-sky-800 tabular-nums">
                    {assignment.handoverData.suhuAkhir || '-'}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Nama Penerima:</dt>
                  <dd className="font-semibold text-slate-900">
                    {assignment.handoverData.penerimaNama}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-slate-500">Kondisi Serah Terima:</dt>
                  <dd className="text-slate-900">
                    {assignment.handoverData.kondisiAkhir}
                  </dd>
                </div>
                <div className="pt-1 border-t border-slate-100">
                  <dt className="text-slate-500">Catatan Serah Terima:</dt>
                  <dd className="mt-0.5 text-slate-800">
                    {assignment.handoverData.catatanSerahTerima || '-'}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="mt-3 text-slate-500">
                Belum ada laporan serah terima tercatat.
              </p>
            )}
          </div>
        </div>

        {/* Section 3: Dokumentasi Foto Odometer, Monitor Suhu, Bukti & Tanda Tangan */}
        <div className="print-avoid-break mt-6">
          <h2 className="text-sm font-bold text-slate-900">
            03. Lampiran Foto Dokumentasi &amp; Tanda Tangan Penerima
          </h2>

          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 text-xs">
            {[
              {
                title: 'Foto Odometer Keberangkatan',
                src: assignment.departureData?.fotoOdometerBerangkat,
              },
              {
                title: 'Foto Monitor Suhu Keberangkatan',
                src: assignment.departureData?.fotoSuhuBerangkat,
              },
              {
                title: 'Foto Odometer Serah Terima',
                src: assignment.handoverData?.fotoOdometerSerahTerima,
              },
              {
                title: 'Foto Monitor Suhu Serah Terima',
                src: assignment.handoverData?.fotoSuhuSerahTerima,
              },
              {
                title: 'Foto Bukti Serah Terima',
                src: assignment.handoverData?.fotoBuktiSerahTerima,
              },
              {
                title: 'Tanda Tangan Penerima',
                src: assignment.handoverData?.tandaTanganPenerima,
                isSignature: true,
              },
            ].map((slot) => (
              <div
                key={slot.title}
                className="overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                <div className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 font-semibold text-slate-700">
                  {slot.title}
                </div>
                <div className="flex h-36 items-center justify-center bg-white p-2">
                  {slot.src ? (
                    <img
                      src={slot.src}
                      alt={slot.title}
                      referrerPolicy="no-referrer"
                      className={`h-full w-full ${
                        slot.isSignature ? 'object-contain' : 'object-cover'
                      } rounded`}
                    />
                  ) : (
                    <span className="text-slate-400">Tidak ada lampiran</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Sign-Off */}
        <div className="print-avoid-break mt-8 flex items-center justify-between border-t border-slate-200 pt-4 text-[11px] text-slate-500">
          <span>
            Dicetak melalui CRK LOGISTIK DELIVERY SISTEM pada{' '}
            {formatRealTimeTimestamp(new Date())}
          </span>
          {assignment.handoverData?.penerimaNama && (
            <span className="font-semibold text-slate-800">
              Diterima oleh: {assignment.handoverData.penerimaNama}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
