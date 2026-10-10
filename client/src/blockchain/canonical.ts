/**
 * Browser implementation of the record fingerprint.
 * MUST stay byte-for-byte identical to server/src/blockchain/core.ts (covered by the
 * server integration test), otherwise genuine documents would fail verification.
 */

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
