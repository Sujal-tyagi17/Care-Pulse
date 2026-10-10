import { randomUUID } from 'crypto';
import { getAddress, isAddress } from 'ethers';
import { prisma } from '../db.js';
import { PrescriptionItem } from '../types.js';
import {
  RegistryClient,
  ChainConfig,
  RecordTypeName,
  OnChainRecord,
  hashRecord,
  newSalt,
  sha256Hex,
  signAnchor,
  signRevoke,
  deriveDoctorWallet,
  buildBatchTree
} from '../blockchain/core.js';
import { GENESIS_HASH } from '../blockchain/audit-chain.js';
import { logAudit, getAuditHead, verifyAuditIntegrity } from './audit.service.js';

const SIGNATURE_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_ATTEMPTS = 6;
const ZERO_ROOT = '0x' + '0'.repeat(64);

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

let client: RegistryClient | null | undefined;

function readConfig(): ChainConfig | null {
  const rpcUrl = process.env.BLOCKCHAIN_RPC_URL;
  const contractAddress = process.env.BLOCKCHAIN_REGISTRY_ADDRESS;
  const chainId = Number(process.env.BLOCKCHAIN_CHAIN_ID);
  const relayerPrivateKey = process.env.BLOCKCHAIN_RELAYER_PRIVATE_KEY;
  const doctorKeySecret = process.env.BLOCKCHAIN_DOCTOR_KEY_SECRET;
  if (!rpcUrl || !contractAddress || !chainId || !relayerPrivateKey || !doctorKeySecret) return null;
  if (!isAddress(contractAddress)) {
    console.warn('[Blockchain] BLOCKCHAIN_REGISTRY_ADDRESS is not a valid address — blockchain disabled.');
    return null;
  }
  return {
    rpcUrl,
    contractAddress: getAddress(contractAddress),
    chainId,
    relayerPrivateKey,
    doctorKeySecret,
    explorerUrl: process.env.BLOCKCHAIN_EXPLORER_URL?.replace(/\/$/, ''),
    confirmations: Number(process.env.BLOCKCHAIN_CONFIRMATIONS || 1)
  };
}

/** Batch settings. BLOCKCHAIN_BATCH_INTERVAL_MINUTES=0 switches to one transaction per record. */
export function getBatchSettings() {
  const raw = process.env.BLOCKCHAIN_BATCH_INTERVAL_MINUTES;
  const intervalMinutes = raw === undefined || raw === '' ? 15 : Math.max(0, Number(raw) || 0);
  return {
    mode: (intervalMinutes > 0 ? 'BATCH' : 'SINGLE') as 'BATCH' | 'SINGLE',
    intervalMinutes,
    maxSize: Math.min(Math.max(Number(process.env.BLOCKCHAIN_BATCH_MAX_SIZE) || 500, 1), 2000)
  };
}

export function getChain(): RegistryClient | null {
  if (client === undefined) {
    const cfg = readConfig();
    client = cfg ? new RegistryClient(cfg) : null;
    if (client) {
      const b = getBatchSettings();
      console.log(
        `[Blockchain] Enabled — registry ${cfg!.contractAddress} on chain ${cfg!.chainId}, relayer ${client.relayer.address}, ` +
          (b.mode === 'BATCH' ? `Merkle batches every ${b.intervalMinutes} min` : 'one transaction per record')
      );
    } else {
      console.log('[Blockchain] Not configured — records will not be anchored (set BLOCKCHAIN_* env vars to enable).');
    }
  }
  return client;
}

export function isBlockchainEnabled(): boolean {
  return getChain() !== null;
}

export function explorerTxUrl(txHash?: string | null): string | null {
  const base = getChain()?.config.explorerUrl;
  return base && txHash ? `${base}/tx/${txHash}` : null;
}

export function explorerAddressUrl(address?: string | null): string | null {
  const base = getChain()?.config.explorerUrl;
  return base && address ? `${base}/address/${address}` : null;
}

// ---------------------------------------------------------------------------
// Doctor wallets & registry
// ---------------------------------------------------------------------------

/** Returns (and persists) the doctor's signing address. Works whenever the key secret is set. */
export async function ensureDoctorWallet(doctorUserId: string): Promise<string | null> {
  const secret = process.env.BLOCKCHAIN_DOCTOR_KEY_SECRET;
  if (!secret) return null;
  const address = deriveDoctorWallet(secret, doctorUserId).address;
  const profile = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (profile && profile.walletAddress !== address) {
    await prisma.doctorProfile.update({ where: { userId: doctorUserId }, data: { walletAddress: address } });
  }
  return address;
}

export async function registerDoctorOnChain(doctorUserId: string) {
  const chain = requireChain();
  const doctor = await prisma.user.findUnique({ where: { id: doctorUserId }, include: { doctorProfile: true } });
  if (!doctor || doctor.role !== 'DOCTOR' || !doctor.doctorProfile) throw httpError(404, 'Doctor not found');

  const address = (await ensureDoctorWallet(doctorUserId))!;
  const onChain = await chain.getDoctor(address);
  if (onChain.registered) {
    const data = { chainRegisteredAt: doctor.doctorProfile.chainRegisteredAt ?? new Date(onChain.registeredAt * 1000) };
    await prisma.doctorProfile.update({ where: { userId: doctorUserId }, data });
    return { address, alreadyRegistered: true, txHash: doctor.doctorProfile.chainRegistrationTx, active: onChain.active };
  }

  // The credential hash commits to the doctor's identity without publishing any registration number.
  const credentialHash = sha256Hex(`${doctor.id}|${doctor.email}|${doctor.doctorProfile.specialization}`);
  const { txHash } = await chain.registerDoctor(address, doctor.name, doctor.doctorProfile.specialization, credentialHash);
  await prisma.doctorProfile.update({
    where: { userId: doctorUserId },
    data: { chainRegisteredAt: new Date(), chainRegistrationTx: txHash }
  });

  // Single-mode records that failed because this doctor wasn't registered yet can now go through.
  await prisma.blockchainRecord.updateMany({
    where: { doctorAddress: address, status: 'FAILED', isCurrent: true },
    data: { status: 'PENDING', attempts: 0, lastError: null }
  });
  processPendingRecords().catch((err) => console.error('[Blockchain] Retry after registration failed:', err.message));

  return { address, alreadyRegistered: false, txHash, active: true };
}

export async function setDoctorChainActive(doctorUserId: string, active: boolean) {
  const chain = requireChain();
  const address = await ensureDoctorWallet(doctorUserId);
  if (!address) throw httpError(400, 'Doctor wallet not available');
  const { txHash } = await chain.setDoctorActive(address, active);
  return { address, active, txHash };
}

// ---------------------------------------------------------------------------
// Record creation (prescriptions and medical certificates share one envelope)
// ---------------------------------------------------------------------------

interface CreateRecordInput {
  appointmentId: string;
  recordType: RecordTypeName;
  schema: string;
  body: Record<string, unknown>;
}

/**
 * Builds the canonical document, signs its fingerprint with the assigned doctor's key and queues
 * it for anchoring. An earlier record of the same type for this appointment is superseded (and
 * revoked on-chain if already anchored), so an edited document never leaves a valid stale copy.
 */
async function createRecord(input: CreateRecordInput) {
  const chain = getChain();
  if (!chain) return null;

  const apt = await prisma.appointment.findUnique({
    where: { id: input.appointmentId },
    include: { patient: { select: { name: true } }, doctor: { include: { doctorProfile: true } } }
  });
  if (!apt) throw httpError(404, 'Appointment not found');

  const doctorWallet = chain.doctorWallet(apt.doctorId);
  await ensureDoctorWallet(apt.doctorId);

  const recordId = randomUUID();
  const payload = {
    schema: input.schema,
    recordType: input.recordType,
    recordId,
    issuedAt: new Date().toISOString(),
    salt: newSalt(),
    issuer: {
      name: apt.doctor.name,
      specialization: apt.doctor.doctorProfile?.specialization ?? 'General',
      wallet: doctorWallet.address,
      registry: chain.config.contractAddress,
      chainId: chain.config.chainId
    },
    patient: { name: apt.patient.name },
    appointment: { id: apt.id, date: apt.date },
    ...input.body
  };

  const { canonical, recordHash } = hashRecord(payload);
  const deadline = Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS;
  const signature = await signAnchor(doctorWallet, chain.domain, recordHash, input.recordType, deadline);
  const { mode } = getBatchSettings();

  const previous = await prisma.blockchainRecord.findMany({
    where: { appointmentId: apt.id, recordType: input.recordType, isCurrent: true }
  });

  const record = await prisma.$transaction(async (tx) => {
    await tx.blockchainRecord.updateMany({
      where: { appointmentId: apt.id, recordType: input.recordType, isCurrent: true },
      data: { isCurrent: false }
    });
    return tx.blockchainRecord.create({
      data: {
        id: recordId,
        appointmentId: apt.id,
        recordType: input.recordType,
        recordHash,
        canonicalPayload: canonical,
        doctorAddress: doctorWallet.address,
        signature,
        signatureDeadline: deadline,
        chainId: chain.config.chainId,
        contractAddress: chain.config.contractAddress,
        status: 'PENDING',
        anchorMode: mode
      }
    });
  });

  // Background work: the HTTP response never waits for the chain.
  (async () => {
    for (const old of previous) await retireRecord(old.id);
    if (mode === 'SINGLE') await processRecord(record.id);
    // In BATCH mode the batch worker picks the record up on its next run.
  })().catch((err) => console.error(`[Blockchain] Background work for record ${record.id} failed:`, err.message));

  return record;
}

export async function createPrescriptionRecord(input: {
  appointmentId: string;
  clinicalNotes: string;
  prescriptions: PrescriptionItem[];
}) {
  return createRecord({
    appointmentId: input.appointmentId,
    recordType: 'PRESCRIPTION',
    schema: 'carepulse.prescription.v1',
    body: {
      medications: input.prescriptions.map((p) => ({
        medicineName: p.medicineName,
        dosage: p.dosage,
        frequency: p.frequency,
        durationDays: p.durationDays,
        instructions: p.instructions
      })),
      // Clinical notes are covered by the fingerprint without being shown to whoever verifies it.
      clinicalNotesHash: sha256Hex(input.clinicalNotes)
    }
  });
}

export type CertificateType = 'SICK_LEAVE' | 'FITNESS' | 'VISIT';

export interface CertificateDetails {
  type: CertificateType;
  fromDate: string | null;
  toDate: string | null;
  remarks: string;
}

export async function createCertificateRecord(appointmentId: string, details: CertificateDetails) {
  return createRecord({
    appointmentId,
    recordType: 'MEDICAL_CERTIFICATE',
    schema: 'carepulse.certificate.v1',
    body: { certificate: details }
  });
}

/** Revoke an outdated record on-chain if it was anchored; otherwise just mark it superseded. */
async function retireRecord(recordId: string) {
  const chain = getChain();
  const rec = await prisma.blockchainRecord.findUnique({
    where: { id: recordId },
    include: { appointment: { select: { doctorId: true } } }
  });
  if (!chain || !rec || rec.status === 'REVOKED') return;

  if (rec.status !== 'CONFIRMED') {
    await prisma.blockchainRecord.updateMany({
      where: { id: recordId, status: { in: ['PENDING', 'FAILED'] } },
      data: { status: 'SUPERSEDED' }
    });
    return;
  }
  try {
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const doctorWallet = chain.doctorWallet(rec.appointment.doctorId);
    const sig = await signRevoke(doctorWallet, chain.domain, rec.recordHash, deadline);
    const { txHash } =
      rec.anchorMode === 'BATCH' && rec.onChainBatchId !== null && rec.merkleProof
        ? await chain.revokeBatched(
            rec.recordHash,
            rec.recordType as RecordTypeName,
            rec.doctorAddress,
            rec.onChainBatchId,
            JSON.parse(rec.merkleProof),
            deadline,
            sig
          )
        : await chain.revoke(rec.recordHash, deadline, sig);
    await prisma.blockchainRecord.update({
      where: { id: recordId },
      data: { status: 'REVOKED', revokeTxHash: txHash, revokedAt: new Date() }
    });
    await logAudit({
      eventType: 'RECORD_REVOKED',
      entityType: 'RECORD',
      entityId: rec.id,
      data: { recordType: rec.recordType, reason: 'SUPERSEDED_BY_EDIT', appointmentId: rec.appointmentId }
    });
  } catch (err) {
    console.error(`[Blockchain] Failed to revoke superseded record ${rec.recordHash}:`, (err as Error).message);
    await prisma.blockchainRecord.update({ where: { id: recordId }, data: { lastError: `Revoke failed: ${(err as Error).message}` } });
  }
}

/** Keep a doctor signature valid until the record is anchored (signatures carry a deadline). */
async function refreshSignatureIfExpiring(rec: { id: string; recordHash: string; recordType: string; signatureDeadline: number }, doctorUserId: string, minValiditySeconds: number) {
  const chain = getChain()!;
  if (rec.signatureDeadline >= Math.floor(Date.now() / 1000) + minValiditySeconds) return null;
  const signatureDeadline = Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS;
  const signature = await signAnchor(chain.doctorWallet(doctorUserId), chain.domain, rec.recordHash, rec.recordType as RecordTypeName, signatureDeadline);
  await prisma.blockchainRecord.update({ where: { id: rec.id }, data: { signature, signatureDeadline } });
  return { signature, signatureDeadline };
}

// ---------------------------------------------------------------------------
// Single-record anchoring worker (BLOCKCHAIN_BATCH_INTERVAL_MINUTES=0)
// ---------------------------------------------------------------------------

const inFlight = new Set<string>();

async function processRecord(recordId: string) {
  const chain = getChain();
  if (!chain || inFlight.has(recordId)) return;
  inFlight.add(recordId);
  try {
    // Claim the record atomically so two workers never submit it twice.
    const claimed = await prisma.blockchainRecord.updateMany({
      where: { id: recordId, anchorMode: 'SINGLE', status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: MAX_ATTEMPTS } },
      data: { status: 'SUBMITTED', attempts: { increment: 1 } }
    });
    if (claimed.count === 0) return;
    const rec = (await prisma.blockchainRecord.findUnique({
      where: { id: recordId },
      include: { appointment: { select: { doctorId: true } } }
    }))!;

    // If the record already landed on-chain (e.g. server crashed after sending), just reconcile.
    const existing = await chain.verify(rec.recordHash);
    if (existing.exists) {
      await markSingleConfirmed(recordId, null, null, existing);
      return;
    }

    const refreshed = await refreshSignatureIfExpiring(rec, rec.appointment.doctorId, 120);
    const signature = refreshed?.signature ?? rec.signature;
    const deadline = refreshed?.signatureDeadline ?? rec.signatureDeadline;

    const { txHash, blockNumber } = await chain.anchor(rec.recordHash, rec.recordType as RecordTypeName, deadline, signature);
    await markSingleConfirmed(recordId, txHash, blockNumber, null);
    console.log(`[Blockchain] Anchored ${rec.recordType} ${rec.recordHash} in tx ${txHash}`);

    // Edited again while this one was in flight? Revoke it straight away.
    const fresh = await prisma.blockchainRecord.findUnique({ where: { id: recordId } });
    if (fresh && !fresh.isCurrent) await retireRecord(recordId);
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[Blockchain] Anchoring record ${recordId} failed:`, message);
    await prisma.blockchainRecord.updateMany({
      where: { id: recordId, status: 'SUBMITTED' },
      data: { status: 'FAILED', lastError: message.slice(0, 500) }
    });
  } finally {
    inFlight.delete(recordId);
  }
}

async function markSingleConfirmed(recordId: string, txHash: string | null, blockNumber: number | null, onChain: OnChainRecord | null) {
  await prisma.blockchainRecord.update({
    where: { id: recordId },
    data: {
      status: 'CONFIRMED',
      lastError: null,
      anchoredAt: onChain ? new Date(onChain.issuedAt * 1000) : new Date(),
      ...(txHash && { txHash }),
      ...(blockNumber !== null && { blockNumber })
    }
  });
}

/** Called by the scheduler: retries single-mode PENDING/FAILED records and recovers interrupted ones. */
export async function processPendingRecords(): Promise<number> {
  if (!getChain()) return 0;
  const stuckBefore = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.blockchainRecord.updateMany({
    where: { anchorMode: 'SINGLE', status: 'SUBMITTED', updatedAt: { lt: stuckBefore } },
    data: { status: 'FAILED', lastError: 'Recovered from interrupted submission' }
  });
  const due = await prisma.blockchainRecord.findMany({
    where: { anchorMode: 'SINGLE', status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: MAX_ATTEMPTS }, isCurrent: true },
    orderBy: { createdAt: 'asc' },
    take: 20
  });
  for (const rec of due) await processRecord(rec.id);
  return due.length;
}

// ---------------------------------------------------------------------------
// Merkle batch worker
// ---------------------------------------------------------------------------

let batchRunning = false;

export interface BatchCycleResult {
  status: 'ANCHORED' | 'SKIPPED' | 'FAILED';
  reason?: string;
  onChainBatchId?: number;
  records?: number;
  auditSeq?: number;
  txHash?: string;
}

/**
 * One cycle of the batch worker. Every interval it collects all pending BATCH-mode records,
 * builds a Merkle tree, and anchors the root together with the current audit-log head in a
 * single transaction. With no new records it still checkpoints the audit log if it advanced.
 * `force` skips the interval wait (admin "Anchor now" button).
 */
export async function runBatchCycle(force = false): Promise<BatchCycleResult> {
  const chain = getChain();
  const settings = getBatchSettings();
  if (!chain) return { status: 'SKIPPED', reason: 'Blockchain not configured' };
  if (batchRunning) return { status: 'SKIPPED', reason: 'A batch is already being anchored' };
  batchRunning = true;
  try {
    await recoverStuckBatches();

    if (!force) {
      if (settings.mode !== 'BATCH') return { status: 'SKIPPED', reason: 'Single-transaction mode' };
      const last = await prisma.anchorBatch.findFirst({ where: { status: { in: ['CONFIRMED', 'SUBMITTED'] } }, orderBy: { createdAt: 'desc' } });
      if (last && Date.now() - last.createdAt.getTime() < settings.intervalMinutes * 60 * 1000) {
        return { status: 'SKIPPED', reason: 'Interval not reached' };
      }
    }

    const pending = await prisma.blockchainRecord.findMany({
      where: { anchorMode: 'BATCH', status: 'PENDING', isCurrent: true },
      orderBy: { createdAt: 'asc' },
      take: settings.maxSize,
      include: { appointment: { select: { doctorId: true } } }
    });
    const head = await getAuditHead();
    const lastAnchored = await prisma.anchorBatch.findFirst({ where: { status: 'CONFIRMED' }, orderBy: { auditSeq: 'desc' } });
    const auditSeq = head?.seq ?? 0;
    const auditHead = head?.entryHash ?? GENESIS_HASH;
    const auditAdvanced = auditSeq > (lastAnchored?.auditSeq ?? 0);

    if (pending.length === 0 && !auditAdvanced) return { status: 'SKIPPED', reason: 'Nothing new to anchor' };

    // Signatures must still be valid when the batch lands; refresh any that are close to expiry.
    for (const rec of pending) {
      const refreshed = await refreshSignatureIfExpiring(rec, rec.appointment.doctorId, 3600);
      if (refreshed) Object.assign(rec, refreshed);
    }

    const tree = pending.length
      ? buildBatchTree(pending.map((r) => ({ recordHash: r.recordHash, recordType: r.recordType as RecordTypeName, doctor: r.doctorAddress })))
      : { root: ZERO_ROOT, proofs: [] as string[][] };

    // Claim the records for this batch atomically (protects against a second server instance).
    const batch = await prisma.$transaction(async (tx) => {
      const created = await tx.anchorBatch.create({
        data: { root: tree.root, leafCount: pending.length, auditHead, auditSeq, status: 'SUBMITTED' }
      });
      if (pending.length) {
        const claimed = await tx.blockchainRecord.updateMany({
          where: { id: { in: pending.map((r) => r.id) }, status: 'PENDING' },
          data: { status: 'SUBMITTED', batchId: created.id, attempts: { increment: 1 } }
        });
        if (claimed.count !== pending.length) throw new Error('Records changed while building the batch; retrying next cycle');
      }
      return created;
    });

    try {
      const res = await chain.anchorBatch(tree.root, pending.length, batch.auditHead, auditSeq);
      const anchoredAt = new Date();
      await prisma.$transaction([
        prisma.anchorBatch.update({
          where: { id: batch.id },
          data: { status: 'CONFIRMED', onChainBatchId: res.batchId, txHash: res.txHash, blockNumber: res.blockNumber, anchoredAt }
        }),
        ...pending.map((r, i) =>
          prisma.blockchainRecord.update({
            where: { id: r.id },
            data: {
              status: 'CONFIRMED',
              onChainBatchId: res.batchId,
              merkleProof: JSON.stringify(tree.proofs[i]),
              txHash: res.txHash,
              blockNumber: res.blockNumber,
              anchoredAt,
              lastError: null
            }
          })
        )
      ]);
      console.log(`[Blockchain] Anchored batch #${res.batchId}: ${pending.length} record(s) + audit checkpoint seq ${auditSeq} in tx ${res.txHash}`);

      // Any record edited while its batch was in flight gets revoked now.
      const stale = await prisma.blockchainRecord.findMany({ where: { batchId: batch.id, isCurrent: false }, select: { id: true } });
      for (const s of stale) await retireRecord(s.id);

      return { status: 'ANCHORED', onChainBatchId: res.batchId, records: pending.length, auditSeq, txHash: res.txHash };
    } catch (err) {
      let message = (err as Error).message.slice(0, 500);
      if (message.startsWith('AuditSequenceWentBackwards')) {
        message =
          'The audit log is behind the last on-chain checkpoint (was the database reset or re-seeded?). ' +
          'Deploy a fresh contract for a fresh database, or restore the audit log. ' + message;
      }
      console.error('[Blockchain] Batch anchoring failed:', message);
      await releaseBatch(batch.id, message);
      return { status: 'FAILED', reason: message };
    }
  } finally {
    batchRunning = false;
  }
}

async function releaseBatch(batchId: string, message: string) {
  await prisma.$transaction([
    prisma.anchorBatch.update({ where: { id: batchId }, data: { status: 'FAILED', lastError: message } }),
    prisma.blockchainRecord.updateMany({
      where: { batchId, status: 'SUBMITTED' },
      data: { status: 'PENDING', batchId: null, lastError: `Batch failed: ${message}` }
    })
  ]);
}

/**
 * A batch left SUBMITTED for >10 min means the server stopped mid-flight. Check the chain:
 * if the root landed, confirm it (and rebuild proofs); otherwise release its records.
 */
async function recoverStuckBatches() {
  const chain = getChain();
  if (!chain) return;
  const stuck = await prisma.anchorBatch.findMany({
    where: { status: 'SUBMITTED', createdAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } },
    include: { records: true }
  });
  if (stuck.length === 0) return;

  const count = await chain.batchCount();
  const recent: Array<{ id: number; root: string; auditSeq: number; anchoredAt: number }> = [];
  for (let i = count - 1; i >= Math.max(0, count - 50); i--) {
    const b = await chain.getBatch(i);
    recent.push({ id: i, root: b.root, auditSeq: b.auditSeq, anchoredAt: b.anchoredAt });
  }
  const known = new Set(
    (await prisma.anchorBatch.findMany({ where: { onChainBatchId: { not: null } }, select: { onChainBatchId: true } })).map((b) => b.onChainBatchId)
  );

  for (const batch of stuck) {
    const match = recent.find((b) => !known.has(b.id) && b.root === batch.root && b.auditSeq === batch.auditSeq);
    if (!match) {
      await releaseBatch(batch.id, 'Recovered from interrupted submission (not found on-chain)');
      continue;
    }
    // Rebuild the identical tree (same leaves, same order) to recover the proofs.
    const ordered = [...batch.records].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const tree = ordered.length
      ? buildBatchTree(ordered.map((r) => ({ recordHash: r.recordHash, recordType: r.recordType as RecordTypeName, doctor: r.doctorAddress })))
      : { root: ZERO_ROOT, proofs: [] };
    if (tree.root !== batch.root) {
      await releaseBatch(batch.id, 'Recovered batch could not be reconstructed');
      continue;
    }
    const anchoredAt = new Date(match.anchoredAt * 1000);
    await prisma.$transaction([
      prisma.anchorBatch.update({ where: { id: batch.id }, data: { status: 'CONFIRMED', onChainBatchId: match.id, anchoredAt } }),
      ...ordered.map((r, i) =>
        prisma.blockchainRecord.update({
          where: { id: r.id },
          data: { status: 'CONFIRMED', onChainBatchId: match.id, merkleProof: JSON.stringify(tree.proofs[i]), anchoredAt }
        })
      )
    ]);
    known.add(match.id);
    console.log(`[Blockchain] Recovered batch #${match.id} after an interrupted submission.`);
  }
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type Verdict = 'VALID' | 'REVOKED' | 'PENDING' | 'NOT_FOUND' | 'TAMPERED' | 'UNAVAILABLE';

/** Everything a third party needs to re-check a record against the chain by itself. */
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

function anchorBundleOf(rec: {
  anchorMode: string;
  chainId: number;
  contractAddress: string;
  recordType: string;
  doctorAddress: string;
  signature: string;
  signatureDeadline: number;
  onChainBatchId: number | null;
  merkleProof: string | null;
  status: string;
}): AnchorBundle | null {
  if (rec.status !== 'CONFIRMED' && rec.status !== 'REVOKED') return null;
  return {
    mode: rec.anchorMode === 'BATCH' ? 'BATCH' : 'SINGLE',
    chainId: rec.chainId,
    registry: rec.contractAddress,
    recordType: rec.recordType,
    doctor: rec.doctorAddress,
    signature: rec.signature,
    deadline: rec.signatureDeadline,
    batchId: rec.onChainBatchId,
    proof: rec.merkleProof ? JSON.parse(rec.merkleProof) : null
  };
}

export async function verifyRecordHash(recordHash: string) {
  const normalized = recordHash.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) throw httpError(400, 'Invalid record fingerprint');

  const chain = getChain();
  const rec = await prisma.blockchainRecord.findUnique({ where: { recordHash: normalized } });
  const anchor = rec ? anchorBundleOf(rec) : null;

  let onChain: OnChainRecord | null = null;
  let chainError: string | null = null;
  if (chain) {
    try {
      onChain =
        anchor?.mode === 'BATCH' && anchor.batchId !== null && anchor.proof
          ? await chain.verifyBatched(normalized, anchor.recordType as RecordTypeName, anchor.deadline, anchor.signature, anchor.batchId, anchor.proof)
          : await chain.verify(normalized);
    } catch (err) {
      chainError = (err as Error).message;
    }
  }

  // Re-hash what our database holds: proves the server copy wasn't edited after anchoring.
  const payloadIntact = rec ? sha256Hex(rec.canonicalPayload) === normalized : null;
  const batchProofBroken = onChain?.mode === 'BATCH' && !onChain.exists;

  let verdict: Verdict;
  if (!chain || chainError) verdict = 'UNAVAILABLE';
  else if (payloadIntact === false || batchProofBroken) verdict = 'TAMPERED';
  else if (onChain?.exists && onChain.revoked) verdict = 'REVOKED';
  else if (onChain?.exists) verdict = 'VALID';
  else if (rec && ['PENDING', 'SUBMITTED', 'FAILED'].includes(rec.status)) verdict = 'PENDING';
  else verdict = 'NOT_FOUND';

  return {
    recordHash: normalized,
    verdict,
    chainError,
    network: chain
      ? { chainId: chain.config.chainId, contractAddress: chain.config.contractAddress, explorerUrl: chain.config.explorerUrl ?? null }
      : null,
    onChain,
    anchor,
    nextBatchAt: rec && rec.anchorMode === 'BATCH' && rec.status === 'PENDING' ? await nextBatchEta() : null,
    record: rec
      ? {
          recordType: rec.recordType,
          status: rec.status,
          isCurrent: rec.isCurrent,
          anchorMode: rec.anchorMode,
          txHash: rec.txHash,
          txUrl: explorerTxUrl(rec.txHash),
          revokeTxHash: rec.revokeTxHash,
          anchoredAt: rec.anchoredAt,
          payloadIntact,
          payload: payloadIntact ? JSON.parse(rec.canonicalPayload) : null,
          canonicalPayload: payloadIntact ? rec.canonicalPayload : null
        }
      : null
  };
}

async function nextBatchEta(): Promise<string | null> {
  const s = getBatchSettings();
  if (s.mode !== 'BATCH') return null;
  const last = await prisma.anchorBatch.findFirst({ where: { status: { in: ['CONFIRMED', 'SUBMITTED'] } }, orderBy: { createdAt: 'desc' } });
  const base = last ? last.createdAt.getTime() + s.intervalMinutes * 60 * 1000 : Date.now();
  // The worker ticks every minute, so round up to the next minute boundary.
  return new Date(Math.ceil(Math.max(base, Date.now()) / 60000) * 60000 + 60000).toISOString();
}

/** Compact record info attached to appointment responses. */
export function toRecordSummary(rec: {
  recordHash: string;
  recordType: string;
  status: string;
  txHash: string | null;
  anchoredAt: Date | null;
  doctorAddress: string;
  chainId: number;
  anchorMode?: string;
  onChainBatchId?: number | null;
  lastError?: string | null;
}) {
  return {
    recordHash: rec.recordHash,
    recordType: rec.recordType,
    status: rec.status,
    txHash: rec.txHash,
    txUrl: explorerTxUrl(rec.txHash),
    anchoredAt: rec.anchoredAt,
    doctorAddress: rec.doctorAddress,
    chainId: rec.chainId,
    anchorMode: rec.anchorMode ?? 'SINGLE',
    batchId: rec.onChainBatchId ?? null,
    lastError: rec.status === 'FAILED' ? rec.lastError ?? null : null
  };
}

/** Certificate details for the patient/doctor UI, parsed from the signed document itself. */
export function toCertificateSummary(rec: Parameters<typeof toRecordSummary>[0] & { canonicalPayload: string; createdAt: Date }) {
  const payload = JSON.parse(rec.canonicalPayload);
  return { ...toRecordSummary(rec), issuedAt: payload.issuedAt, certificate: payload.certificate as CertificateDetails };
}

// ---------------------------------------------------------------------------
// Admin overview & audit integrity
// ---------------------------------------------------------------------------

export async function getBlockchainOverview() {
  const chain = getChain();
  const settings = getBatchSettings();
  const doctors = await prisma.user.findMany({
    where: { role: 'DOCTOR' },
    select: { id: true, name: true, doctorProfile: { select: { specialization: true, walletAddress: true, chainRegisteredAt: true, chainRegistrationTx: true } } },
    orderBy: { name: 'asc' }
  });
  const counts = await prisma.blockchainRecord.groupBy({ by: ['status'], _count: { _all: true } });
  const recent = await prisma.blockchainRecord.findMany({
    orderBy: { createdAt: 'desc' },
    take: 10,
    include: { appointment: { select: { date: true, patient: { select: { name: true } }, doctor: { select: { name: true } } } } }
  });
  const recentBatches = await prisma.anchorBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 8 });
  const pendingForBatch = await prisma.blockchainRecord.count({ where: { anchorMode: 'BATCH', status: 'PENDING', isCurrent: true } });

  let network: Record<string, unknown> | null = null;
  let networkError: string | null = null;
  const doctorStatus: Record<string, { registered: boolean; active: boolean }> = {};
  if (chain) {
    try {
      network = {
        chainId: chain.config.chainId,
        contractAddress: chain.config.contractAddress,
        contractUrl: explorerAddressUrl(chain.config.contractAddress),
        explorerUrl: chain.config.explorerUrl ?? null,
        ...(await chain.status())
      };
      for (const d of doctors) {
        const addr = d.doctorProfile?.walletAddress ?? (await ensureDoctorWallet(d.id));
        if (addr) doctorStatus[d.id] = await chain.getDoctor(addr);
      }
    } catch (err) {
      networkError = (err as Error).message;
    }
  }

  return {
    enabled: !!chain,
    network,
    networkError,
    batching: {
      mode: settings.mode,
      intervalMinutes: settings.intervalMinutes,
      pendingRecords: pendingForBatch,
      nextBatchAt: chain ? await nextBatchEta() : null,
      recentBatches: recentBatches.map((b) => ({
        id: b.id,
        onChainBatchId: b.onChainBatchId,
        leafCount: b.leafCount,
        auditSeq: b.auditSeq,
        status: b.status,
        txHash: b.txHash,
        txUrl: explorerTxUrl(b.txHash),
        createdAt: b.createdAt,
        anchoredAt: b.anchoredAt,
        lastError: b.lastError
      }))
    },
    recordCounts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
    doctors: doctors.map((d) => ({
      id: d.id,
      name: d.name,
      specialization: d.doctorProfile?.specialization,
      walletAddress: d.doctorProfile?.walletAddress ?? null,
      walletUrl: explorerAddressUrl(d.doctorProfile?.walletAddress),
      registeredOnChain: doctorStatus[d.id]?.registered ?? false,
      activeOnChain: doctorStatus[d.id]?.active ?? false,
      registrationTx: d.doctorProfile?.chainRegistrationTx ?? null
    })),
    recentRecords: recent.map((r) => ({
      ...toRecordSummary(r),
      isCurrent: r.isCurrent,
      createdAt: r.createdAt,
      attempts: r.attempts,
      lastError: r.lastError,
      appointmentDate: r.appointment.date,
      patientName: r.appointment.patient.name,
      doctorName: r.appointment.doctor.name
    }))
  };
}

/** Full audit-log integrity check, comparing against checkpoints read from the contract. */
export async function checkAuditIntegrity() {
  const chain = getChain();
  return verifyAuditIntegrity(chain ? async (id) => chain.getBatch(id) : undefined).then((report) => ({
    ...report,
    checkpointSource: chain ? 'blockchain' : 'database',
    latestCheckpointTxUrl: explorerTxUrl(report.latestCheckpoint?.txHash)
  }));
}

// ---------------------------------------------------------------------------

function requireChain(): RegistryClient {
  const chain = getChain();
  if (!chain) throw httpError(503, 'Blockchain is not configured on this server (set BLOCKCHAIN_* environment variables).');
  return chain;
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}
