/**
 * Browser implementation of the record fingerprint.
 * MUST stay byte-for-byte identical to server/src/blockchain/core.ts (covered by the
 * server integration test), otherwise genuine documents would fail verification.
 */

import type { AnchorBundle, VerifiableCertificate, VerifiableDocument, VerifiableFile } from '../types';

/** Deterministic JSON: object keys sorted recursively, no whitespace. */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error('Cannot canonicalize non-finite number');
    }
    return JSON.stringify(value ?? null);
  }
  if (Array.isArray(value)) {
    return `[${value.map((v) => canonicalize(v === undefined ? null : v)).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const entries = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalize(obj[k])}`);
  return `{${entries.join(',')}}`;
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return (
    '0x' +
    Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  );
}

/** Fingerprint of a verifiable document (parsed JSON object or raw JSON text). */
export async function fingerprintOf(document: unknown): Promise<string> {
  const parsed = typeof document === 'string' ? JSON.parse(document) : document;
  return sha256Hex(canonicalize(parsed));
}

// ---------------------------------------------------------------------------
// Verifiable files: either a bare signed document (older downloads) or
// { carepulseVerifiable: 1, document, anchor } with the on-chain proof bundled in.
// ---------------------------------------------------------------------------

export function parseVerifiableFile(text: string): { document: VerifiableDocument; anchor: AnchorBundle | null } {
  const parsed = JSON.parse(text);
  if (parsed && parsed.carepulseVerifiable === 1 && parsed.document) {
    return { document: parsed.document, anchor: parsed.anchor ?? null };
  }
  if (parsed && typeof parsed.schema === 'string' && parsed.schema.startsWith('carepulse.')) {
    return { document: parsed, anchor: null };
  }
  throw new Error('Not a CarePulse verifiable document');
}

export function buildVerifiableFile(canonicalDocument: string, anchor: AnchorBundle | null): string {
  const file: VerifiableFile = { carepulseVerifiable: 1, document: JSON.parse(canonicalDocument), anchor };
  return JSON.stringify(file, null, 2);
}

export function isCertificate(doc: VerifiableDocument | null | undefined): doc is VerifiableCertificate {
  return !!doc && 'certificate' in doc;
}
