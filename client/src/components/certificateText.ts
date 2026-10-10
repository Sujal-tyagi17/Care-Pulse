import type { CertificateDetails, CertificateType } from '../types';

export const CERTIFICATE_LABELS: Record<CertificateType, string> = {
  SICK_LEAVE: 'Sick-leave certificate',
  FITNESS: 'Fitness certificate',
  VISIT: 'Certificate of visit'
};

const fmt = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function daysInclusive(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00`).getTime() - new Date(`${from}T00:00:00`).getTime()) / 86400000) + 1;
}

export function formatCertificatePeriod(c: CertificateDetails): string | null {
  if (c.fromDate && c.toDate) {
    const days = daysInclusive(c.fromDate, c.toDate);
    return `${fmt(c.fromDate)} – ${fmt(c.toDate)} (${days} day${days === 1 ? '' : 's'})`;
  }
  if (c.fromDate) return `From ${fmt(c.fromDate)}`;
  return null;
}

/** The formal sentence printed on the certificate. */
export function certificateStatement(c: CertificateDetails, patientName: string, visitDate: string): string {
  switch (c.type) {
    case 'SICK_LEAVE':
      return `This is to certify that ${patientName} was examined on ${fmt(visitDate)} and is advised rest from ${
        c.fromDate ? fmt(c.fromDate) : '—'
      } to ${c.toDate ? fmt(c.toDate) : '—'}${c.fromDate && c.toDate ? ` (${daysInclusive(c.fromDate, c.toDate)} days)` : ''}.`;
    case 'FITNESS':
      return `This is to certify that ${patientName} was examined on ${fmt(visitDate)} and is fit to resume normal duties${
        c.fromDate ? ` from ${fmt(c.fromDate)}` : ''
      }.`;
    default:
      return `This is to certify that ${patientName} attended a consultation on ${fmt(visitDate)}.`;
  }
}
