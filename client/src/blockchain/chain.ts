/**
 * Reads the MedicalRegistry contract directly from the browser through a public RPC,
 * so verification does not depend on trusting the CarePulse server.
 * ethers is loaded lazily, only when a verification actually runs.
 */
import abi from './MedicalRegistry.abi.json';
import type { AnchorBundle, BatchCheck, OnChainRecord } from '../types';

const RECORD_TYPE_NAMES = ['PRESCRIPTION', 'CLINICAL_SUMMARY', 'MEDICAL_CERTIFICATE'];

export const chainConfig = {
  rpcUrl: (import.meta.env.VITE_BLOCKCHAIN_RPC_URL as string | undefined) || '',
  contractAddress: (import.meta.env.VITE_BLOCKCHAIN_REGISTRY_ADDRESS as string | undefined) || '',
  chainId: Number(import.meta.env.VITE_BLOCKCHAIN_CHAIN_ID || 0),
  explorerUrl: ((import.meta.env.VITE_BLOCKCHAIN_EXPLORER_URL as string | undefined) || '').replace(/\/$/, '')
};

export const NETWORK_NAMES: Record<number, string> = {
  1: 'Ethereum',
  137: 'Polygon',
  80002: 'Polygon Amoy testnet',
  11155111: 'Ethereum Sepolia testnet',
  31337: 'Local Hardhat chain'
};

export function networkName(chainId?: number | null): string {
  if (!chainId) return 'Unknown network';
  return NETWORK_NAMES[chainId] ?? `Chain ${chainId}`;
}

export function isDirectChainConfigured(): boolean {
  return !!(chainConfig.rpcUrl && /^0x[0-9a-fA-F]{40}$/.test(chainConfig.contractAddress) && chainConfig.chainId);
}

export function explorerTx(txHash?: string | null, base?: string | null): string | null {
  const b = (base || chainConfig.explorerUrl || '').replace(/\/$/, '');
  return b && txHash ? `${b}/tx/${txHash}` : null;
}

export function explorerAddress(address?: string | null, base?: string | null): string | null {
  const b = (base || chainConfig.explorerUrl || '').replace(/\/$/, '');
  return b && address ? `${b}/address/${address}` : null;
}

export async function readRecordDirect(recordHash: string): Promise<OnChainRecord> {
  if (!isDirectChainConfigured()) throw new Error('Direct chain access is not configured for this site.');
  const { JsonRpcProvider, Contract } = await import('ethers');
  const provider = new JsonRpcProvider(chainConfig.rpcUrl, chainConfig.chainId, { staticNetwork: true });
  const contract = new Contract(chainConfig.contractAddress, abi, provider);
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

const BATCH_CHECKS: BatchCheck[] = [
  'VALID',
  'UNKNOWN_BATCH',
  'NOT_IN_BATCH',
  'SIGNER_NOT_REGISTERED',
  'DOCTOR_SUSPENDED_AT_ANCHOR_TIME',
  'SIGNATURE_EXPIRED_BEFORE_ANCHOR'
];

/** Verifies a Merkle-batched record directly: proof + doctor signature + registry, all on-chain. */
export async function readBatchedRecordDirect(recordHash: string, anchor: AnchorBundle): Promise<OnChainRecord> {
  if (!isDirectChainConfigured()) throw new Error('Direct chain access is not configured for this site.');
  if (anchor.batchId === null || !anchor.proof) throw new Error('Anchor bundle has no Merkle proof');
  const { JsonRpcProvider, Contract } = await import('ethers');
  const provider = new JsonRpcProvider(chainConfig.rpcUrl, chainConfig.chainId, { staticNetwork: true });
  const contract = new Contract(chainConfig.contractAddress, abi, provider);
  const typeIndex = Math.max(0, RECORD_TYPE_NAMES.indexOf(anchor.recordType));
  const v = await contract.verifyBatchedRecord(recordHash, typeIndex, anchor.deadline, anchor.signature, anchor.batchId, anchor.proof);
  const batchCheck = BATCH_CHECKS[Number(v.check)] ?? 'NOT_IN_BATCH';
  return {
    exists: batchCheck === 'VALID',
    revoked: v.revoked,
    doctor: v.doctor,
    doctorName: v.doctorName,
    doctorSpecialization: v.doctorSpecialization,
    doctorCurrentlyActive: v.doctorCurrentlyActive,
    issuedAt: Number(v.anchoredAt),
    recordType: anchor.recordType,
    mode: 'BATCH',
    batchId: anchor.batchId,
    batchCheck
  };
}

export function shortHash(value?: string | null, lead = 6, tail = 4): string {
  if (!value) return '';
  return value.length > lead + tail + 2 ? `${value.slice(0, lead + 2)}…${value.slice(-tail)}` : value;
}

export function verifyUrl(recordHash: string): string {
  return `${window.location.origin}/verify?h=${recordHash}`;
}
