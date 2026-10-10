import { prisma } from '../db.js';
import { canonicalize } from '../blockchain/core.js';
import { GENESIS_HASH, computeEntryHash, findChainBreak, ChainBreak } from '../blockchain/audit-chain.js';

export type AuditEventType =
  | 'APPOINTMENT_BOOKED'
  | 'APPOINTMENT_CANCELLED'
  | 'APPOINTMENTS_RESCHEDULE_REQUIRED'
  | 'CONSULTATION_COMPLETED'
  | 'PRESCRIPTION_ISSUED'
  | 'CERTIFICATE_ISSUED'
  | 'RECORD_REVOKED'
  | 'DOCTOR_CREATED'
  | 'DOCTOR_UPDATED'
  | 'DOCTOR_LEAVE_ADDED'
  | 'DOCTOR_LEAVE_REMOVED'
  | 'DOCTOR_CHAIN_REGISTERED'
  | 'DOCTOR_CHAIN_STATUS_CHANGED';

export interface AuditEventInput {
  eventType: AuditEventType;
  entityType: 'APPOINTMENT' | 'DOCTOR' | 'RECORD';
  entityId: string;
  actor?: { id: string; role: string } | null;
  /** Identifiers and statuses only. Never put symptoms, notes or medication details here. */
  data?: Record<string, string | number | boolean | null>;
}

const AUDIT_LOCK_KEY = 784512019; // arbitrary constant for pg_advisory_xact_lock

/**
 * Appends one entry to the hash chain. A Postgres advisory lock serialises writers so the
 * chain can never fork; the unique seq primary key is a second line of defence.
 * Logging failures are reported but never break the business action that triggered them.
 */
export async function logAudit(event: AuditEventInput): Promise<void> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await prisma.$transaction(async (tx) => {
        // Explicit bigint cast picks the right overload; wrapping hides the void result Prisma can't decode.
        await tx.$queryRaw`SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY}::bigint)) AS l`;
        const last = await tx.auditLog.findFirst({ orderBy: { seq: 'desc' }, select: { seq: true, entryHash: true } });
        const fields = {
          seq: (last?.seq ?? 0) + 1,
          prevHash: last?.entryHash ?? GENESIS_HASH,
          eventType: event.eventType,
          entityType: event.entityType,
          entityId: event.entityId,
          actorId: event.actor?.id ?? null,
          actorRole: event.actor?.role ?? null,
          data: canonicalize(event.data ?? {}),
          occurredAt: new Date().toISOString()
        };
        await tx.auditLog.create({ data: { ...fields, entryHash: computeEntryHash(fields) } });
      });
      return;
    } catch (err) {
      if (attempt === 3) {
        console.error(`[Audit] Failed to record ${event.eventType} for ${event.entityType} ${event.entityId}:`, (err as Error).message);
      }
    }
  }
}

export async function getAuditHead(): Promise<{ seq: number; entryHash: string } | null> {
  return prisma.auditLog.findFirst({ orderBy: { seq: 'desc' }, select: { seq: true, entryHash: true } });
}

export async function listAuditEntries(limit = 50, beforeSeq?: number) {
  const entries = await prisma.auditLog.findMany({
    where: beforeSeq ? { seq: { lt: beforeSeq } } : undefined,
    orderBy: { seq: 'desc' },
    take: Math.min(Math.max(limit, 1), 200)
  });
  const actorIds = [...new Set(entries.map((e) => e.actorId).filter((x): x is string => !!x))];
  const actors = await prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } });
  const names = new Map(actors.map((a) => [a.id, a.name]));
  return entries.map((e) => ({
    seq: e.seq,
    eventType: e.eventType,
    entityType: e.entityType,
    entityId: e.entityId,
    actorRole: e.actorRole,
    actorName: e.actorId ? names.get(e.actorId) ?? null : null,
    data: JSON.parse(e.data),
    occurredAt: e.occurredAt,
    entryHash: e.entryHash
  }));
}

export interface AuditCheckpoint {
  onChainBatchId: number;
  auditSeq: number;
  auditHead: string;
  anchoredAt: string;
  txHash: string | null;
  matches: boolean;
}

export interface AuditIntegrityReport {
  totalEntries: number;
  chainIntact: boolean;
  firstBreak: ChainBreak | null;
  checkpointsVerified: number;
  checkpointMismatch: AuditCheckpoint | null;
  latestCheckpoint: AuditCheckpoint | null;
  unanchoredEntries: number;
  verdict: 'INTACT' | 'TAMPERED' | 'INTACT_NOT_ANCHORED';
  checkedAt: string;
}

/**
 * Re-verifies the whole log: recomputes every hash and link, then compares each on-chain
 * checkpoint (read from the contract, not from our database) with the entry at that seq.
 */
export async function verifyAuditIntegrity(
  readCheckpoint?: (onChainBatchId: number) => Promise<{ auditSeq: number; auditHead: string; anchoredAt: number }>
): Promise<AuditIntegrityReport> {
  const CHUNK = 1000;
  let prev = GENESIS_HASH;
  let nextSeq = 1;
  let firstBreak: ChainBreak | null = null;
  let total = 0;
  const hashBySeq = new Map<number, string>();

  // Only keep hashes for seqs we need to compare against checkpoints.
  const batches = await prisma.anchorBatch.findMany({
    where: { status: 'CONFIRMED', onChainBatchId: { not: null } },
    orderBy: { onChainBatchId: 'asc' },
    select: { onChainBatchId: true, auditSeq: true, auditHead: true, anchoredAt: true, txHash: true }
  });
  const neededSeqs = new Set(batches.map((b) => b.auditSeq));

  for (;;) {
    const chunk = await prisma.auditLog.findMany({ where: { seq: { gte: nextSeq } }, orderBy: { seq: 'asc' }, take: CHUNK });
    if (chunk.length === 0) break;
    const res = findChainBreak(chunk, prev, nextSeq);
    for (const e of chunk) if (neededSeqs.has(e.seq)) hashBySeq.set(e.seq, e.entryHash);
    total += chunk.length;
    if (res.break) {
      firstBreak = res.break;
      break;
    }
    prev = res.lastHash;
    nextSeq = res.nextSeq;
    if (chunk.length < CHUNK) break;
  }
  if (firstBreak) total = await prisma.auditLog.count();

  let checkpointsVerified = 0;
  let checkpointMismatch: AuditCheckpoint | null = null;
  let latestCheckpoint: AuditCheckpoint | null = null;
  for (const b of batches) {
    if (b.auditSeq === 0) continue;
    // Trust the chain, not our own table, for what was anchored.
    const onChain = readCheckpoint
      ? await readCheckpoint(b.onChainBatchId!)
      : { auditSeq: b.auditSeq, auditHead: b.auditHead, anchoredAt: Math.floor((b.anchoredAt?.getTime() ?? 0) / 1000) };
    const local = hashBySeq.get(onChain.auditSeq) ?? (await prisma.auditLog.findUnique({ where: { seq: onChain.auditSeq } }))?.entryHash;
    const cp: AuditCheckpoint = {
      onChainBatchId: b.onChainBatchId!,
      auditSeq: onChain.auditSeq,
      auditHead: onChain.auditHead,
      anchoredAt: new Date(onChain.anchoredAt * 1000).toISOString(),
      txHash: b.txHash,
      matches: local === onChain.auditHead
    };
    if (!cp.matches && !checkpointMismatch) checkpointMismatch = cp;
    if (cp.matches) checkpointsVerified++;
    latestCheckpoint = cp;
  }

  const lastAnchoredSeq = latestCheckpoint?.auditSeq ?? 0;
  const chainIntact = !firstBreak;
  return {
    totalEntries: total,
    chainIntact,
    firstBreak,
    checkpointsVerified,
    checkpointMismatch,
    latestCheckpoint,
    unanchoredEntries: Math.max(0, total - lastAnchoredSeq),
    verdict: !chainIntact || checkpointMismatch ? 'TAMPERED' : latestCheckpoint ? 'INTACT' : 'INTACT_NOT_ANCHORED',
    checkedAt: new Date().toISOString()
  };
}
