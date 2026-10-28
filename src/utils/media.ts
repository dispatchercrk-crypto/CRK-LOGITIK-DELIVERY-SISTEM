export async function compressImageFile(
  file: File,
  maxDimension = 960,
  quality = 0.72
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Format gambar tidak didukung.'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(String(reader.result || ''));
          return;
        }
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const compressed = canvas.toDataURL('image/jpeg', quality);
        resolve(compressed);
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

export function formatRealTimeTimestamp(dateOrIso: Date | string): string {
  const d = typeof dateOrIso === 'string' ? new Date(dateOrIso) : dateOrIso;
  if (Number.isNaN(d.getTime())) return String(dateOrIso || '-');
  return d.toLocaleString('id-ID', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function parseFlexibleTimestamp(raw?: string): number | null {
  const str = String(raw || '').trim();
  if (!str) return null;

  const direct = new Date(str).getTime();
  if (!Number.isNaN(direct)) return direct;

  // Handle DD/MM/YYYY or DD-MM-YYYY optional HH:mm(:ss)
  const dmyMatch = str.match(
    /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[,\s]+(\d{1,2})[:.](\d{1,2})(?:[:.](\d{1,2}))?)?/
  );
  if (dmyMatch) {
    const day = Number(dmyMatch[1]);
    const month = Number(dmyMatch[2]) - 1;
    const year = Number(dmyMatch[3]);
    const hr = Number(dmyMatch[4] || 0);
    const min = Number(dmyMatch[5] || 0);
    const sec = Number(dmyMatch[6] || 0);
    const dt = new Date(year, month, day, hr, min, sec);
    if (!Number.isNaN(dt.getTime())) return dt.getTime();
  }

  return null;
}

export function parseScheduledDeadlineMs(
  tanggalTugas?: string,
  jadwalJamTiba?: string
): number | null {
  const dateRaw = String(tanggalTugas || '').trim();
  if (!dateRaw) return null;

  let year = 0;
  let monthIdx = 0;
  let day = 0;

  const ymd = dateRaw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (ymd) {
    year = Number(ymd[1]);
    monthIdx = Number(ymd[2]) - 1;
    day = Number(ymd[3]);
  } else {
    const dmy = dateRaw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
    if (dmy) {
      day = Number(dmy[1]);
      monthIdx = Number(dmy[2]) - 1;
      year = Number(dmy[3]);
    } else {
      const parsed = new Date(dateRaw);
      if (Number.isNaN(parsed.getTime())) return null;
      year = parsed.getFullYear();
      monthIdx = parsed.getMonth();
      day = parsed.getDate();
    }
  }

  let hours = 23;
  let minutes = 59;
  let seconds = 59;

  const timeRaw = String(jadwalJamTiba || '').trim();
  if (timeRaw) {
    const hm = timeRaw.match(/^(\d{1,2})[:.](\d{2})/);
    if (hm) {
      hours = Math.min(23, Math.max(0, Number(hm[1])));
      minutes = Math.min(59, Math.max(0, Number(hm[2])));
      seconds = 59;
    }
  }

  const deadline = new Date(year, monthIdx, day, hours, minutes, seconds, 999);
  if (Number.isNaN(deadline.getTime())) return null;
  return deadline.getTime();
}

export type OtdCategory =
  | 'ON_TIME'
  | 'LATE_COMPLETED'
  | 'ON_TRACK_ACTIVE'
  | 'OVERDUE_ACTIVE'
  | 'UNSCHEDULED';

export interface AssignmentOtdEvaluation {
  category: OtdCategory;
  deadlineMs: number | null;
  referenceMs: number | null;
  delayMinutes: number;
}

export function evaluateAssignmentOtd(
  assignment: {
    status: string;
    tanggalTugas?: string;
    jadwalJamTiba?: string;
    departureData?: { timestamp?: string };
    handoverData?: { timestamp?: string };
    createdAt?: string;
  },
  nowMs: number = Date.now()
): AssignmentOtdEvaluation {
  const deadlineMs = parseScheduledDeadlineMs(
    assignment.tanggalTugas,
    assignment.jadwalJamTiba
  );
  if (deadlineMs === null) {
    return {
      category: 'UNSCHEDULED',
      deadlineMs: null,
      referenceMs: null,
      delayMinutes: 0,
    };
  }

  const isCompleted =
    String(assignment.status || '')
      .trim()
      .toLowerCase() === 'selesai';

  if (isCompleted) {
    const completedMs =
      parseFlexibleTimestamp(assignment.handoverData?.timestamp) ??
      parseFlexibleTimestamp(assignment.departureData?.timestamp) ??
      parseFlexibleTimestamp(assignment.createdAt);

    if (completedMs === null) {
      return {
        category: 'ON_TIME',
        deadlineMs,
        referenceMs: null,
        delayMinutes: 0,
      };
    }

    if (completedMs <= deadlineMs) {
      return {
        category: 'ON_TIME',
        deadlineMs,
        referenceMs: completedMs,
        delayMinutes: 0,
      };
    }

    return {
      category: 'LATE_COMPLETED',
      deadlineMs,
      referenceMs: completedMs,
      delayMinutes: Math.max(1, Math.round((completedMs - deadlineMs) / 60000)),
    };
  }

  // Active task ('Menunggu Berangkat' | 'Dalam Perjalanan')
  if (nowMs <= deadlineMs) {
    return {
      category: 'ON_TRACK_ACTIVE',
      deadlineMs,
      referenceMs: nowMs,
      delayMinutes: 0,
    };
  }

  return {
    category: 'OVERDUE_ACTIVE',
    deadlineMs,
    referenceMs: nowMs,
    delayMinutes: Math.max(1, Math.round((nowMs - deadlineMs) / 60000)),
  };
}

export function calculateTripDurationMinutes(
  startIso?: string,
  endIso?: string
): number | null {
  const startMs = parseFlexibleTimestamp(startIso);
  const endMs = parseFlexibleTimestamp(endIso);
  if (startMs === null || endMs === null || endMs < startMs) {
    return null;
  }
  return Math.max(1, Math.round((endMs - startMs) / 60000));
}

export function formatDurationMinutes(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes)) return '-';
  if (minutes >= 1440) {
    const days = Math.floor(minutes / 1440);
    const remHrs = Math.floor((minutes % 1440) / 60);
    return remHrs > 0 ? `${days}h ${remHrs}j` : `${days} hari`;
  }
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hrs === 0) return `${mins} mnt`;
  return `${hrs}j ${mins}m`;
}
