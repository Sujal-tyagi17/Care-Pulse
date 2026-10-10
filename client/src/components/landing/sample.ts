import { canonicalize, sha256Hex } from '../../blockchain/canonical';

/**
 * The sample prescription used on the landing page. It has the same shape as a real
 * CarePulse document, and its fingerprint is computed with the same code the app uses.
 */
export interface SampleRx {
  patient: string;
  doctor: string;
  specialization: string;
  date: string;
  medications: Array<{ medicineName: string; dosage: string; frequency: string; durationDays: number }>;
}

export const ORIGINAL_RX: SampleRx = {
  patient: 'Rahul Sharma',
  doctor: 'Dr. Priya Nair',
  specialization: 'General Medicine',
  date: '2026-10-11',
  medications: [
    { medicineName: 'Paracetamol', dosage: '650mg', frequency: 'Twice daily', durationDays: 5 },
    { medicineName: 'Cetirizine', dosage: '10mg', frequency: 'At bedtime', durationDays: 5 }
  ]
};

const SALT = '0x7c1e5a9d3b2f48e6a0c4d7b1e9f3a5c2d8b6e0f4a2c9d1b7e3f5a8c0d6b2e4f1';

export function sampleDocument(rx: SampleRx) {
  return {
    schema: 'carepulse.prescription.v1',
    recordType: 'PRESCRIPTION',
    recordId: 'landing-sample',
    issuedAt: `${rx.date}T10:24:00.000Z`,
    salt: SALT,
    issuer: { name: rx.doctor, specialization: rx.specialization, wallet: '0x4B8a…F1C', registry: 'MedicalRegistry', chainId: 80002 },
    patient: { name: rx.patient },
    appointment: { id: 'sample', date: rx.date },
    medications: rx.medications.map((m) => ({ ...m, instructions: 'After meals' })),
    clinicalNotesHash: '0x' + '0'.repeat(64)
  };
}

export const fingerprintOf = (rx: SampleRx) => sha256Hex(canonicalize(sampleDocument(rx)));

export const formatDate = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
