export type UserRole = 'PATIENT' | 'DOCTOR' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  phone?: string;
  doctorProfile?: DoctorProfile;
}

export interface DoctorProfile {
  id: string;
  specialization: string;
  bio?: string;
  slotDurationMinutes: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  consultationFee: number;
  roomNumber?: string;
}

export interface DoctorListItem {
  id: string;
  name: string;
  email: string;
  phone?: string;
  specialization: string;
  bio?: string;
  slotDurationMinutes: number;
  workingHoursStart: string;
  workingHoursEnd: string;
  consultationFee: number;
  roomNumber?: string;
  leaves?: string[];
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  isHeld: boolean;
  isPast?: boolean;
  status: 'AVAILABLE' | 'HELD' | 'BOOKED' | 'PAST';
}

export interface PreVisitSummary {
  urgencyLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  chiefComplaint: string;
  suggestedQuestions: string[];
}

export interface PrescriptionItem {
  medicineName: string;
  dosage: string;
  frequency: string;
  durationDays: number;
  instructions: string;
  reminderTimes?: string[];
}

export interface PostVisitSummary {
  clinicalNotes: string;
  prescription: PrescriptionItem[];
  patientFriendlySummary: string;
  followUpSteps: string;
}

export interface Appointment {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  status: 'BOOKED' | 'CANCELLED' | 'COMPLETED' | 'REQUIRES_RESCHEDULE';
  symptoms: string;
  cancelReason?: string;
  patient?: { id: string; name: string; email: string; phone?: string };
  doctor?: {
    id: string;
    name: string;
    specialization?: string;
    roomNumber?: string;
    consultationFee?: number;
  };
  preVisitSummary?: PreVisitSummary | null;
  postVisitSummary?: PostVisitSummary | null;
  medicationRemindersCount?: number;
  blockchainRecord?: BlockchainRecordSummary | null;
}

export interface MedicationReminderItem {
  id: string;
  appointmentId: string;
  medicineName: string;
  dosage: string;
  frequency: string;
  reminderTimes: string[];
  instructions?: string;
  startDate: string;
  endDate: string;
  isActive: boolean;
  lastSentAt?: string;
  doctorName?: string;
  specialization?: string;
}

export interface NotificationLogItem {
  id: string;
  recipientEmail: string;
  recipientName?: string;
  type: string;
  subject: string;
  bodyPreview?: string;
  status: 'PENDING' | 'SENT' | 'FAILED';
  retryCount: number;
  lastError?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Blockchain verification
// ---------------------------------------------------------------------------

export type BlockchainRecordStatus = 'PENDING' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED' | 'SUPERSEDED' | 'REVOKED' | 'DEMO';

export interface BlockchainRecordSummary {
  recordHash: string;
  recordType: string;
  status: BlockchainRecordStatus;
  txHash: string | null;
  txUrl: string | null;
  anchoredAt: string | null;
  doctorAddress: string;
  chainId: number;
  lastError?: string | null;
}

export type VerificationVerdict = 'VALID' | 'REVOKED' | 'PENDING' | 'NOT_FOUND' | 'TAMPERED' | 'UNAVAILABLE';

export interface OnChainRecord {
  exists: boolean;
  revoked: boolean;
  doctor: string;
  doctorName: string;
  doctorSpecialization: string;
  doctorCurrentlyActive: boolean;
  issuedAt: number;
  recordType: string;
}

export interface VerifiablePrescription {
  schema: string;
  recordType: string;
  recordId: string;
  issuedAt: string;
  salt: string;
  issuer: { name: string; specialization: string; wallet: string; registry: string; chainId: number };
  patient: { name: string };
  appointment: { id: string; date: string };
  medications: Array<{ medicineName: string; dosage: string; frequency: string; durationDays: number; instructions: string }>;
  clinicalNotesHash: string;
}

export interface VerificationResult {
  recordHash: string;
  verdict: VerificationVerdict;
  chainError: string | null;
  network: { chainId: number; contractAddress: string; explorerUrl: string | null } | null;
  onChain: OnChainRecord | null;
  record: {
    recordType: string;
    status: BlockchainRecordStatus;
    isCurrent: boolean;
    txHash: string | null;
    txUrl: string | null;
    revokeTxHash: string | null;
    anchoredAt: string | null;
    payloadIntact: boolean | null;
    payload: VerifiablePrescription | null;
    canonicalPayload: string | null;
  } | null;
  demo?: boolean;
}

export interface BlockchainOverview {
  enabled: boolean;
  network: {
    chainId: number;
    contractAddress: string;
    contractUrl: string | null;
    explorerUrl: string | null;
    relayerAddress: string;
    relayerBalanceWei: string;
    relayerIsOwner: boolean;
    totalRecords: number;
    registeredDoctors: number;
    latestBlock: number;
  } | null;
  networkError: string | null;
  recordCounts: Record<string, number>;
  doctors: Array<{
    id: string;
    name: string;
    specialization?: string;
    walletAddress: string | null;
    walletUrl: string | null;
    registeredOnChain: boolean;
    activeOnChain: boolean;
    registrationTx: string | null;
  }>;
  recentRecords: Array<BlockchainRecordSummary & {
    isCurrent: boolean;
    createdAt: string;
    attempts: number;
    appointmentDate: string;
    patientName: string;
    doctorName: string;
  }>;
  demo?: boolean;
}
