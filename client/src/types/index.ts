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
  certificate?: CertificateSummary | null;
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
  anchorMode?: 'SINGLE' | 'BATCH';
  batchId?: number | null;
  lastError?: string | null;
}

export type CertificateType = 'SICK_LEAVE' | 'FITNESS' | 'VISIT';

export interface CertificateDetails {
  type: CertificateType;
  fromDate: string | null;
  toDate: string | null;
  remarks: string;
}

export interface CertificateSummary extends BlockchainRecordSummary {
  issuedAt: string;
  certificate: CertificateDetails;
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
  mode?: 'SINGLE' | 'BATCH';
  batchId?: number;
  batchCheck?: BatchCheck;
}

export type BatchCheck =
  | 'VALID'
  | 'UNKNOWN_BATCH'
  | 'NOT_IN_BATCH'
  | 'SIGNER_NOT_REGISTERED'
  | 'DOCTOR_SUSPENDED_AT_ANCHOR_TIME'
  | 'SIGNATURE_EXPIRED_BEFORE_ANCHOR';

/** Everything needed to re-check a record against the chain without the CarePulse server. */
export interface AnchorBundle {
  mode: 'SINGLE' | 'BATCH';
  chainId: number;
  registry: string;
  recordType: string;
  doctor: string;
  signature: string;
  deadline: number;
  batchId: number | null;
  proof: string[] | null;
}

/** Downloadable file: the signed document plus its anchor proof. */
export interface VerifiableFile {
  carepulseVerifiable: 1;
  document: VerifiableDocument;
  anchor: AnchorBundle | null;
}

interface VerifiableDocumentBase {
  schema: string;
  recordType: string;
  recordId: string;
  issuedAt: string;
  salt: string;
  issuer: { name: string; specialization: string; wallet: string; registry: string; chainId: number };
  patient: { name: string };
  appointment: { id: string; date: string };
}

export interface VerifiableCertificate extends VerifiableDocumentBase {
  certificate: CertificateDetails;
}

export type VerifiableDocument = VerifiablePrescription | VerifiableCertificate;

export interface VerifiablePrescription extends VerifiableDocumentBase {
  medications: Array<{ medicineName: string; dosage: string; frequency: string; durationDays: number; instructions: string }>;
  clinicalNotesHash: string;
}

export interface VerificationResult {
  recordHash: string;
  verdict: VerificationVerdict;
  chainError: string | null;
  network: { chainId: number; contractAddress: string; explorerUrl: string | null } | null;
  onChain: OnChainRecord | null;
  anchor?: AnchorBundle | null;
  nextBatchAt?: string | null;
  record: {
    recordType: string;
    status: BlockchainRecordStatus;
    isCurrent: boolean;
    anchorMode?: 'SINGLE' | 'BATCH';
    txHash: string | null;
    txUrl: string | null;
    revokeTxHash: string | null;
    anchoredAt: string | null;
    payloadIntact: boolean | null;
    payload: VerifiableDocument | null;
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
    totalBatches?: number;
    registeredDoctors: number;
    latestBlock: number;
  } | null;
  networkError: string | null;
  batching?: {
    mode: 'SINGLE' | 'BATCH';
    intervalMinutes: number;
    pendingRecords: number;
    nextBatchAt: string | null;
    recentBatches: Array<{
      id: string;
      onChainBatchId: number | null;
      leafCount: number;
      auditSeq: number;
      status: 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
      txHash: string | null;
      txUrl: string | null;
      createdAt: string;
      anchoredAt: string | null;
      lastError: string | null;
    }>;
  };
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

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

export interface AuditEntry {
  seq: number;
  eventType: string;
  entityType: string;
  entityId: string;
  actorRole: string | null;
  actorName: string | null;
  data: Record<string, unknown>;
  occurredAt: string;
  entryHash: string;
}

export interface AuditIntegrityReport {
  totalEntries: number;
  chainIntact: boolean;
  firstBreak: { seq: number; reason: 'HASH_MISMATCH' | 'BROKEN_LINK' | 'SEQUENCE_GAP' } | null;
  checkpointsVerified: number;
  checkpointMismatch: { onChainBatchId: number; auditSeq: number } | null;
  latestCheckpoint: { onChainBatchId: number; auditSeq: number; anchoredAt: string; txHash: string | null } | null;
  latestCheckpointTxUrl?: string | null;
  unanchoredEntries: number;
  verdict: 'INTACT' | 'TAMPERED' | 'INTACT_NOT_ANCHORED';
  checkpointSource?: 'blockchain' | 'database';
  checkedAt: string;
}
