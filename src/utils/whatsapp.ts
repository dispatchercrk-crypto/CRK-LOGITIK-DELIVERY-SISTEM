import { Assignment } from '../types';

export function normalizePhoneForWa(rawPhone: string): string {
  const firstToken = String(rawPhone || '')
    .split(',')[0]
    .trim();

  // Do not treat WhatsApp Group JIDs (@g.us) or URLs as personal phone numbers
  if (
    !firstToken ||
    firstToken.includes('@g.us') ||
    firstToken.startsWith('http://') ||
    firstToken.startsWith('https://')
  ) {
    return '';
  }

  const digits = firstToken.replace(/[^\d+]/g, '').trim();
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

/**
 * Builds a WhatsApp URL that opens the Group & Contact picker directly in WhatsApp
 * so the user can choose any WhatsApp Group (or chat) and send the message.
 */
export function buildWhatsAppGroupUrl(message: string): string {
  const encodedText = encodeURIComponent(message);
  return `https://wa.me/?text=${encodedText}`;
}

/**
 * Builds a WhatsApp URL either for Group picker (when preferGroup is true or no valid phone)
 * or for a specific normalized phone number.
 */
export function buildWhatsAppDirectUrl(
  phone: string,
  message: string,
  preferGroup = false
): string {
  if (preferGroup) {
    return buildWhatsAppGroupUrl(message);
  }
  const normalized = normalizePhoneForWa(phone);
  const encodedText = encodeURIComponent(message);
  if (normalized) {
    return `https://wa.me/${normalized}?text=${encodedText}`;
  }
  return `https://wa.me/?text=${encodedText}`;
}

export function buildSuratTugasWaMessage(
  asg: Pick<
    Assignment,
    | 'noPenugasan'
    | 'noSuratJalanFisik'
    | 'kodeSegel'
    | 'tanggalTugas'
    | 'jadwalJamTiba'
    | 'driverId'
    | 'driverName'
    | 'plateNumber'
    | 'vehicleType'
    | 'origin'
    | 'destination'
    | 'purpose'
    | 'status'
    | 'notes'
  >,
  groupName?: string
): string {
  return [
    '*[CRK LOGISTIK DELIVERY SISTEM — SURAT TUGAS RANTAI DINGIN]*',
    groupName ? `Grup Operasional : ${groupName}` : '',
    `No. Penugasan : ${asg.noPenugasan}`,
    asg.noSuratJalanFisik
      ? `No. Surat Jalan Fisik : ${asg.noSuratJalanFisik}`
      : '',
    asg.kodeSegel ? `Kode Segel : ${asg.kodeSegel}` : '',
    `Jadwal Tugas : ${asg.tanggalTugas}${
      asg.jadwalJamTiba ? ` (Target Tiba ${asg.jadwalJamTiba})` : ''
    }`,
    `Driver : ${asg.driverId} - ${asg.driverName}`,
    `Armada Reefer : ${asg.plateNumber}${
      asg.vehicleType ? ` (${asg.vehicleType})` : ''
    }`,
    `Lokasi Asal : ${asg.origin}`,
    `Lokasi Tujuan : ${asg.destination}`,
    `Muatan Dingin : ${asg.purpose || '-'}`,
    `Status : ${asg.status}`,
    asg.notes ? `Instruksi Dispatcher : ${asg.notes}` : '',
    '_Mohon Driver segera cek suhu box pendingin & laporkan keberangkatan melalui sistem._',
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Triggers opening a WhatsApp URL in 1 click using a temporary semantic <a> element
 * (strictly avoiding window.open for iframe compatibility).
 */
export function launchWhatsAppUrl(url: string): void {
  if (!url || typeof document === 'undefined') return;
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  setTimeout(() => {
    if (anchor.parentNode) {
      anchor.parentNode.removeChild(anchor);
    }
  }, 200);
}
