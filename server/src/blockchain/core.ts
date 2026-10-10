/**
 * Pure blockchain helpers (no database access) so they can be unit/integration tested
 * against a local Hardhat node in isolation.
 *
 * Privacy model: only `recordHash` (a salted SHA-256 fingerprint) ever goes on-chain.
 */
import { createHash, randomBytes } from 'crypto';
import { Contract, JsonRpcProvider, Wallet, NonceManager, keccak256, AbiCoder, getAddress, TypedDataDomain } from 'ethers';
import { StandardMerkleTree } from '@openzeppelin/merkle-tree';
import abi from './MedicalRegistry.abi.json' with { type: 'json' };

export const RECORD_TYPES = { PRESCRIPTION: 0, CLINICAL_SUMMARY: 1, MEDICAL_CERTIFICATE: 2 } as const;
export type RecordTypeName = keyof typeof RECORD_TYPES;
export const RECORD_TYPE_NAMES = Object.keys(RECORD_TYPES) as RecordTypeName[];

export const BATCH_CHECKS = [
  'VALID',
  'UNKNOWN_BATCH',
  'NOT_IN_BATCH',
  'SIGNER_NOT_REGISTERED',
  'DOCTOR_SUSPENDED_AT_ANCHOR_TIME',
  'SIGNATURE_EXPIRED_BEFORE_ANCHOR'
] as const;
export type BatchCheck = (typeof BATCH_CHECKS)[number];

/** Leaf encoding shared with the contract's batchLeaf(): (recordHash, recordType, doctor). */
export const LEAF_ENCODING = ['bytes32', 'uint8', 'address'];

export interface BatchLeafInput {
  recordHash: string;
  recordType: RecordTypeName;
  doctor: string;
}

/** Builds an OpenZeppelin StandardMerkleTree and returns the root plus one proof per input, in order. */
export function buildBatchTree(leaves: BatchLeafInput[]): { root: string; proofs: string[][] } {
  if (leaves.length === 0) throw new Error('Cannot build an empty batch');
  const values = leaves.map((l) => [l.recordHash, RECORD_TYPES[l.recordType], getAddress(l.doctor)]);
  const tree = StandardMerkleTree.of(values, LEAF_ENCODING);
  // tree.getProof(i) takes the index into the original values array
  return { root: tree.root, proofs: values.map((_, i) => tree.getProof(i)) };
}

export const EIP712_NAME = 'CarePulse MedicalRegistry';
export const EIP712_VERSION = '1';

export const ANCHOR_TYPES = {
  AnchorRecord: [
    { name: 'recordHash', type: 'bytes32' },
    { name: 'recordType', type: 'uint8' },
    { name: 'deadline', type: 'uint256' }
  ]
};

export const REVOKE_TYPES = {
  RevokeRecord: [
    { name: 'recordHash', type: 'bytes32' },
    { name: 'deadline', type: 'uint256' }
  ]
};

// ---------------------------------------------------------------------------
// Canonical hashing — MUST stay byte-for-byte identical to client/src/blockchain/verify.ts
// ---------------------------------------------------------------------------

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
  const entries = Object.keys(value as Record<string, unknown>)
    .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalize((value as Record<string, unknown>)[k])}`);
  return `{${entries.join(',')}}`;
}

export function sha256Hex(text: string): string {
  return '0x' + createHash('sha256').update(text, 'utf8').digest('hex');
}

export function newSalt(): string {
  return '0x' + randomBytes(32).toString('hex');
}

export function hashRecord(payload: unknown): { canonical: string; recordHash: string } {
  const canonical = canonicalize(payload);
  return { canonical, recordHash: sha256Hex(canonical) };
}

// ---------------------------------------------------------------------------
// Doctor signing keys
// ---------------------------------------------------------------------------

/**
 * Deterministically derives a doctor's signing wallet from a server-side master secret.
 * This is a custodial model chosen so the demo works without browser wallets; in production
 * the key would live in a KMS/HSM, or doctors would sign with their own wallet (MetaMask) —
 * the contract is identical either way because it only checks the EIP-712 signature.
 */
export function deriveDoctorWallet(masterSecret: string, doctorUserId: string): Wallet {
  if (!masterSecret || masterSecret.length < 16) {
    throw new Error('BLOCKCHAIN_DOCTOR_KEY_SECRET must be set (min 16 chars)');
  }
  const privateKey = keccak256(
    AbiCoder.defaultAbiCoder().encode(['string', 'string', 'string'], ['carepulse-doctor-key-v1', masterSecret, doctorUserId])
  );
  return new Wallet(privateKey);
}

export function domainFor(chainId: number, contractAddress: string): TypedDataDomain {
  return { name: EIP712_NAME, version: EIP712_VERSION, chainId, verifyingContract: getAddress(contractAddress) };
}

export async function signAnchor(
  doctor: Wallet,
  domain: TypedDataDomain,
  recordHash: string,
  recordType: RecordTypeName,
  deadline: number
): Promise<string> {
  return doctor.signTypedData(domain, ANCHOR_TYPES, { recordHash, recordType: RECORD_TYPES[recordType], deadline });
}

export async function signRevoke(doctor: Wallet, domain: TypedDataDomain, recordHash: string, deadline: number): Promise<string> {
  return doctor.signTypedData(domain, REVOKE_TYPES, { recordHash, deadline });
}

// ---------------------------------------------------------------------------
// Chain client
// ---------------------------------------------------------------------------

export interface ChainConfig {
  rpcUrl: string;
  contractAddress: string;
  chainId: number;
  relayerPrivateKey: string;
  doctorKeySecret: string;
  explorerUrl?: string;
  confirmations?: number;
}

export interface OnChainRecord {
  exists: boolean;
  revoked: boolean;
  doctor: string;
  doctorName: string;
  doctorSpecialization: string;
  doctorCurrentlyActive: boolean;
  issuedAt: number;
  recordType: RecordTypeName;
  mode: 'SINGLE' | 'BATCH';
  batchId?: number;
  batchCheck?: BatchCheck;
}

export class RegistryClient {
  readonly provider: JsonRpcProvider;
  readonly relayer: Wallet;
  readonly contract: Contract;
  readonly domain: TypedDataDomain;
  private readonly sender: NonceManager;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(readonly config: ChainConfig) {
    // cacheTimeout -1: ethers otherwise reuses identical call/estimateGas results for 250ms,
    // which can replay a stale revert right after the state it depended on changed.
    this.provider = new JsonRpcProvider(config.rpcUrl, config.chainId, { staticNetwork: true, cacheTimeout: -1 });
    this.relayer = new Wallet(config.relayerPrivateKey, this.provider);
    this.sender = new NonceManager(this.relayer);
    this.contract = new Contract(config.contractAddress, abi, this.sender);
    this.domain = domainFor(config.chainId, config.contractAddress);
  }

  doctorWallet(doctorUserId: string): Wallet {
    return deriveDoctorWallet(this.config.doctorKeySecret, doctorUserId);
  }

  /** Serialise transactions from the single relayer account to avoid nonce races. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async send(
    method: string,
    args: unknown[]
  ): Promise<{ txHash: string; blockNumber: number; logs: ReadonlyArray<{ topics: ReadonlyArray<string>; data: string }> }> {
    return this.enqueue(async () => {
      for (let attempt = 1; ; attempt++) {
        try {
          const tx = await this.contract[method](...args);
          const receipt = await tx.wait(this.config.confirmations ?? 1);
          if (!receipt || receipt.status !== 1) throw new Error(`Transaction ${tx.hash} reverted`);
          return { txHash: tx.hash as string, blockNumber: Number(receipt.blockNumber), logs: receipt.logs };
        } catch (err) {
          this.sender.reset(); // resync nonce after a failed send
          // Another process used the relayer wallet (second instance, manual tx): retry once with a fresh nonce.
          if (attempt === 1 && isNonceError(err)) continue;
          throw new Error(decodeRevert(this.contract, err));
        }
      }
    });
  }

  async registerDoctor(address: string, name: string, specialization: string, credentialHash: string) {
    return this.send('registerDoctor', [address, name, specialization, credentialHash]);
  }

  async setDoctorActive(address: string, active: boolean) {
    return this.send('setDoctorActive', [address, active]);
  }

  async anchor(recordHash: string, recordType: RecordTypeName, deadline: number, signature: string) {
    return this.send('anchorRecord', [recordHash, RECORD_TYPES[recordType], deadline, signature]);
  }

  async revoke(recordHash: string, deadline: number, signature: string) {
    return this.send('revokeRecord', [recordHash, deadline, signature]);
  }

  /** Anchors a Merkle root + audit checkpoint; returns the on-chain batch id from the BatchAnchored event. */
  async anchorBatch(root: string, leafCount: number, auditHead: string, auditSeq: number) {
    const res = await this.send('anchorBatch', [root, leafCount, auditHead, auditSeq]);
    let batchId: number | null = null;
    for (const log of res.logs) {
      try {
        const parsed = this.contract.interface.parseLog({ topics: [...log.topics], data: log.data });
        if (parsed?.name === 'BatchAnchored') batchId = Number(parsed.args.batchId);
      } catch {
        /* not our event */
      }
    }
    if (batchId === null) throw new Error(`BatchAnchored event missing from tx ${res.txHash}`);
    return { txHash: res.txHash, blockNumber: res.blockNumber, batchId };
  }

  async revokeBatched(
    recordHash: string,
    recordType: RecordTypeName,
    doctor: string,
    batchId: number,
    proof: string[],
    deadline: number,
    signature: string
  ) {
    return this.send('revokeBatchedRecord', [recordHash, RECORD_TYPES[recordType], doctor, batchId, proof, deadline, signature]);
  }

  async verifyBatched(
    recordHash: string,
    recordType: RecordTypeName,
    deadline: number,
    signature: string,
    batchId: number,
    proof: string[]
  ): Promise<OnChainRecord> {
    return readBatchedRecord(this.contract, { recordHash, recordType, deadline, signature, batchId, proof });
  }

  async batchCount(): Promise<number> {
    return Number(await this.contract.batchCount());
  }

  async getBatch(batchId: number) {
    const b = await this.contract.getBatch(batchId);
    return {
      root: b.root as string,
      auditHead: b.auditHead as string,
      auditSeq: Number(b.auditSeq),
      anchoredAt: Number(b.anchoredAt),
      leafCount: Number(b.leafCount)
    };
  }

  async getDoctor(address: string) {
    const d = await this.contract.getDoctor(address);
    return {
      registered: d.registered as boolean,
      active: d.active as boolean,
      registeredAt: Number(d.registeredAt),
      name: d.name as string,
      specialization: d.specialization as string
    };
  }

  async verify(recordHash: string): Promise<OnChainRecord> {
    return readRecord(this.contract, recordHash);
  }

  async status() {
    const [balance, totalRecords, totalBatched, batches, doctorCount, owner, block] = await Promise.all([
      this.provider.getBalance(this.relayer.address),
      this.contract.totalRecords(),
      this.contract.totalBatchedRecords(),
      this.contract.batchCount(),
      this.contract.doctorCount(),
      this.contract.owner(),
      this.provider.getBlockNumber()
    ]);
    return {
      relayerAddress: this.relayer.address,
      relayerBalanceWei: balance.toString(),
      relayerIsOwner: getAddress(owner) === this.relayer.address,
      totalRecords: Number(totalRecords) + Number(totalBatched),
      totalBatches: Number(batches),
      registeredDoctors: Number(doctorCount),
      latestBlock: block
    };
  }
}

export async function readRecord(contract: Contract, recordHash: string): Promise<OnChainRecord> {
  const r = await contract.verifyRecord(recordHash);
  return {
    exists: r.exists,
    revoked: r.revoked,
    doctor: r.doctor,
    doctorName: r.doctorName,
    doctorSpecialization: r.doctorSpecialization,
    doctorCurrentlyActive: r.doctorCurrentlyActive,
    issuedAt: Number(r.issuedAt),
    recordType: RECORD_TYPE_NAMES[Number(r.recordType)] ?? 'PRESCRIPTION',
    mode: 'SINGLE'
  };
}

export interface BatchedAnchorInput {
  recordHash: string;
  recordType: RecordTypeName;
  deadline: number;
  signature: string;
  batchId: number;
  proof: string[];
}

/** Reads a batched record. `exists` is true only when proof, signature and doctor checks all pass. */
export async function readBatchedRecord(contract: Contract, a: BatchedAnchorInput): Promise<OnChainRecord> {
  const v = await contract.verifyBatchedRecord(a.recordHash, RECORD_TYPES[a.recordType], a.deadline, a.signature, a.batchId, a.proof);
  const batchCheck = BATCH_CHECKS[Number(v.check)] ?? 'NOT_IN_BATCH';
  return {
    exists: batchCheck === 'VALID',
    revoked: v.revoked,
    doctor: v.doctor,
    doctorName: v.doctorName,
    doctorSpecialization: v.doctorSpecialization,
    doctorCurrentlyActive: v.doctorCurrentlyActive,
    issuedAt: Number(v.anchoredAt),
    recordType: a.recordType,
    mode: 'BATCH',
    batchId: a.batchId,
    batchCheck
  };
}

function isNonceError(err: unknown): boolean {
  const e = err as { code?: string; message?: string };
  return e?.code === 'NONCE_EXPIRED' || /nonce (has already been used|too low)/i.test(e?.message ?? '');
}

/** Turn ethers errors (including custom Solidity errors) into a readable message. */
export function decodeRevert(contract: Contract, err: unknown): string {
  const e = err as { data?: string; info?: { error?: { data?: string } }; shortMessage?: string; message?: string };
  const data = e?.data ?? e?.info?.error?.data;
  if (typeof data === 'string' && data.startsWith('0x') && data.length >= 10) {
    try {
      const parsed = contract.interface.parseError(data);
      if (parsed) return `${parsed.name}(${parsed.args.map(String).join(', ')})`;
    } catch {
      /* fall through */
    }
  }
  return e?.shortMessage ?? e?.message ?? String(err);
}
