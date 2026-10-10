/**
 * Hash-chain primitives for the audit log (no database access).
 *
 * entryHash = SHA-256(canonical({ seq, prevHash, eventType, entityType, entityId, actorId, actorRole, data, occurredAt }))
 * Each entry commits to the previous one, so editing, deleting or reordering any entry breaks
 * every hash after it. Anchoring the head on-chain makes even a full re-computation detectable.
 */
import { canonicalize, sha256Hex } from './core.js';

export const GENESIS_HASH = '0x' + '0'.repeat(64);

export interface AuditEntryFields {
  seq: number;
  prevHash: string;
  eventType: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  actorRole: string | null;
  data: string; // canonical JSON string
  occurredAt: string;
}

export function computeEntryHash(e: AuditEntryFields): string {
  return sha256Hex(
    canonicalize({
      seq: e.seq,
      prevHash: e.prevHash,
      eventType: e.eventType,
      entityType: e.entityType,
      entityId: e.entityId,
      actorId: e.actorId,
      actorRole: e.actorRole,
      data: e.data,
      occurredAt: e.occurredAt
    })
  );
}

export interface ChainBreak {
  seq: number;
  reason: 'HASH_MISMATCH' | 'BROKEN_LINK' | 'SEQUENCE_GAP';
}

/**
 * Walks entries (sorted by seq, possibly a slice of the full log) and returns the first break.
 * `expectedPrev` / `expectedSeq` let callers verify a long log chunk by chunk.
 */
export function findChainBreak(
  entries: Array<AuditEntryFields & { entryHash: string }>,
  expectedPrev = GENESIS_HASH,
  expectedSeq = 1
): { break: ChainBreak | null; lastHash: string; nextSeq: number } {
  let prev = expectedPrev;
  let seq = expectedSeq;
  for (const e of entries) {
    if (e.seq !== seq) return { break: { seq, reason: 'SEQUENCE_GAP' }, lastHash: prev, nextSeq: seq };
    if (e.prevHash !== prev) return { break: { seq: e.seq, reason: 'BROKEN_LINK' }, lastHash: prev, nextSeq: seq };
    if (computeEntryHash(e) !== e.entryHash) return { break: { seq: e.seq, reason: 'HASH_MISMATCH' }, lastHash: prev, nextSeq: seq };
    prev = e.entryHash;
    seq++;
  }
  return { break: null, lastHash: prev, nextSeq: seq };
}
