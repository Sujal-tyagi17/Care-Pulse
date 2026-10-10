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
  deriveDoctorWallet
} from '../blockchain/core.js';

const SIGNATURE_TTL_SECONDS = 7 * 24 * 60 * 60;
const MAX_ATTEMPTS = 6;

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

export function getChain(): RegistryClient | null {
  if (client === undefined) {
    const cfg = readConfig();
    client = cfg ? new RegistryClient(cfg) : null;
    if (client) {
      console.log(`[Blockchain] Enabled — registry ${cfg!.contractAddress} on chain ${cfg!.chainId}, relayer ${client.relayer.address}`);
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

  // Anything that failed because this doctor wasn't registered yet can now go through.
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
// Record creation
// ---------------------------------------------------------------------------

interface PrescriptionRecordInput {
  appointmentId: string;
  doctorUserId: string;
  doctorName: string;
  specialization: string;
  patientName: string;
  appointmentDate: string;
  clinicalNotes: string;
  prescriptions: PrescriptionItem[];
}

/**
 * Builds the canonical prescription document, signs its fingerprint with the doctor's key and
 * queues it for anchoring. Any earlier record for this appointment is superseded (and revoked
 * on-chain if it had already been anchored), so an edited prescription never leaves a valid
 * stale copy behind.
 */
export async function createPrescriptionRecord(input: PrescriptionRecordInput) {
  const chain = getChain();
  if (!chain) return null;

  const doctorWallet = chain.doctorWallet(input.doctorUserId);
  await ensureDoctorWallet(input.doctorUserId);

  const recordId = randomUUID();
  const issuedAt = new Date().toISOString();
  const payload = {
    schema: 'carepulse.prescription.v1',
    recordType: 'PRESCRIPTION',
    recordId,
    issuedAt,
    salt: newSalt(),
    issuer: {
      name: input.doctorName,
      specialization: input.specialization,
      wallet: doctorWallet.address,
      registry: chain.config.contractAddress,
      chainId: chain.config.chainId
    },
    patient: { name: input.patientName },
    appointment: { id: input.appointmentId, date: input.appointmentDate },
    medications: input.prescriptions.map((p) => ({
      medicineName: p.medicineName,
      dosage: p.dosage,
      frequency: p.frequency,
      durationDays: p.durationDays,
      instructions: p.instructions
    })),
    // Clinical notes are covered by the fingerprint without being shown to whoever verifies it.
    clinicalNotesHash: sha256Hex(input.clinicalNotes)
  };

  const { canonical, recordHash } = hashRecord(payload);
  const deadline = Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS;
  const signature = await signAnchor(doctorWallet, chain.domain, recordHash, 'PRESCRIPTION', deadline);

  const previous = await prisma.blockchainRecord.findMany({
    where: { appointmentId: input.appointmentId, isCurrent: true }
  });

  const record = await prisma.$transaction(async (tx) => {
    await tx.blockchainRecord.updateMany({
      where: { appointmentId: input.appointmentId, isCurrent: true },
      data: { isCurrent: false }
    });
    return tx.blockchainRecord.create({
      data: {
        id: recordId,
        appointmentId: input.appointmentId,
        recordType: 'PRESCRIPTION',
        recordHash,
        canonicalPayload: canonical,
        doctorAddress: doctorWallet.address,
        signature,
        signatureDeadline: deadline,
        chainId: chain.config.chainId,
        contractAddress: chain.config.contractAddress,
        status: 'PENDING'
      }
    });
  });

  // Fire-and-forget: the HTTP response doesn't wait for block confirmation.
  (async () => {
    for (const old of previous) await retireRecord(old.id, input.doctorUserId);
    await processRecord(record.id, input.doctorUserId);
  })().catch((err) => console.error(`[Blockchain] Background anchoring for ${record.id} failed:`, err.message));

  return record;
}

/** Revoke an outdated record on-chain if it was anchored; otherwise just mark it superseded. */
async function retireRecord(recordId: string, doctorUserId: string) {
  const chain = getChain();
  const rec = await prisma.blockchainRecord.findUnique({ where: { id: recordId } });
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
    const sig = await signRevoke(chain.doctorWallet(doctorUserId), chain.domain, rec.recordHash, deadline);
    const { txHash } = await chain.revoke(rec.recordHash, deadline, sig);
    await prisma.blockchainRecord.update({
      where: { id: recordId },
      data: { status: 'REVOKED', revokeTxHash: txHash, revokedAt: new Date() }
    });
  } catch (err) {
    console.error(`[Blockchain] Failed to revoke superseded record ${rec.recordHash}:`, (err as Error).message);
    await prisma.blockchainRecord.update({ where: { id: recordId }, data: { lastError: `Revoke failed: ${(err as Error).message}` } });
  }
}

// ---------------------------------------------------------------------------
// Anchoring worker
// ---------------------------------------------------------------------------

const inFlight = new Set<string>();

async function processRecord(recordId: string, doctorUserId?: string) {
  const chain = getChain();
  if (!chain || inFlight.has(recordId)) return;
  inFlight.add(recordId);
  try {
    // Claim the record atomically so two workers never submit it twice.
    const claimed = await prisma.blockchainRecord.updateMany({
      where: { id: recordId, status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: MAX_ATTEMPTS } },
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
      await markConfirmed(recordId, null, null, existing);
      return;
    }

    let { signature, signatureDeadline } = rec;
    if (signatureDeadline < Math.floor(Date.now() / 1000) + 120) {
      // Signature about to expire (long outage) — re-sign with the doctor's key.
      signatureDeadline = Math.floor(Date.now() / 1000) + SIGNATURE_TTL_SECONDS;
      const wallet = chain.doctorWallet(doctorUserId ?? rec.appointment.doctorId);
      signature = await signAnchor(wallet, chain.domain, rec.recordHash, rec.recordType as RecordTypeName, signatureDeadline);
      await prisma.blockchainRecord.update({ where: { id: recordId }, data: { signature, signatureDeadline } });
    }

    const { txHash, blockNumber } = await chain.anchor(rec.recordHash, rec.recordType as RecordTypeName, signatureDeadline, signature);
    await markConfirmed(recordId, txHash, blockNumber, null);
    console.log(`[Blockchain] Anchored ${rec.recordType} ${rec.recordHash} in tx ${txHash}`);

    // Edited again while this one was in flight? Revoke it straight away.
    const fresh = await prisma.blockchainRecord.findUnique({ where: { id: recordId } });
    if (fresh && !fresh.isCurrent) await retireRecord(recordId, doctorUserId ?? rec.appointment.doctorId);
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

async function markConfirmed(recordId: string, txHash: string | null, blockNumber: number | null, onChain: OnChainRecord | null) {
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

/** Called by the scheduler: retries PENDING/FAILED records and recovers ones stuck mid-submit. */
export async function processPendingRecords(): Promise<number> {
  if (!getChain()) return 0;
  const stuckBefore = new Date(Date.now() - 10 * 60 * 1000);
  await prisma.blockchainRecord.updateMany({
    where: { status: 'SUBMITTED', updatedAt: { lt: stuckBefore } },
    data: { status: 'FAILED', lastError: 'Recovered from interrupted submission' }
  });
  const due = await prisma.blockchainRecord.findMany({
    where: { status: { in: ['PENDING', 'FAILED'] }, attempts: { lt: MAX_ATTEMPTS }, isCurrent: true },
    orderBy: { createdAt: 'asc' },
    take: 20
  });
  for (const rec of due) await processRecord(rec.id);
  return due.length;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type Verdict = 'VALID' | 'REVOKED' | 'PENDING' | 'NOT_FOUND' | 'TAMPERED' | 'UNAVAILABLE';

export async function verifyRecordHash(recordHash: string) {
  const normalized = recordHash.toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) throw httpError(400, 'Invalid record fingerprint');

  const chain = getChain();
  const rec = await prisma.blockchainRecord.findUnique({ where: { recordHash: normalized } });

  let onChain: OnChainRecord | null = null;
  let chainError: string | null = null;
  if (chain) {
    try {
      onChain = await chain.verify(normalized);
    } catch (err) {
      chainError = (err as Error).message;
    }
  }

  // Re-hash what our database holds: proves the server copy wasn't edited after anchoring.
  const payloadIntact = rec ? sha256Hex(rec.canonicalPayload) === normalized : null;

  let verdict: Verdict;
  if (!chain || chainError) verdict = 'UNAVAILABLE';
  else if (payloadIntact === false) verdict = 'TAMPERED';
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
    record: rec
      ? {
          recordType: rec.recordType,
          status: rec.status,
          isCurrent: rec.isCurrent,
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

/** Compact record info attached to appointment responses. */
export function toRecordSummary(rec: {
  recordHash: string;
  recordType: string;
  status: string;
  txHash: string | null;
  anchoredAt: Date | null;
  doctorAddress: string;
  chainId: number;
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
    lastError: rec.status === 'FAILED' ? rec.lastError ?? null : null
  };
}

// ---------------------------------------------------------------------------
// Admin overview
// ---------------------------------------------------------------------------

export async function getBlockchainOverview() {
  const chain = getChain();
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

// ---------------------------------------------------------------------------

function requireChain(): RegistryClient {
  const chain = getChain();
  if (!chain) throw httpError(503, 'Blockchain is not configured on this server (set BLOCKCHAIN_* environment variables).');
  return chain;
}

function httpError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}
