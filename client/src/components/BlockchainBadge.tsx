import React from 'react';
import { ShieldCheck, Clock, AlertTriangle, ShieldOff, FlaskConical } from 'lucide-react';
import { BlockchainRecordStatus } from '../types';

const STYLES: Record<BlockchainRecordStatus, { label: string; className: string; Icon: React.ElementType; hint: string }> = {
  CONFIRMED: {
    label: 'Verified on blockchain',
    className: 'bg-success-soft text-success border-success/40',
    Icon: ShieldCheck,
    hint: 'This prescription is signed by your doctor and anchored on-chain. It cannot be altered without detection.'
  },
  PENDING: {
    label: 'Anchoring…',
    className: 'bg-warning-soft text-warning border-warning/40',
    Icon: Clock,
    hint: 'Signed by your doctor and waiting to be confirmed on the blockchain.'
  },
  SUBMITTED: {
    label: 'Confirming on-chain…',
    className: 'bg-warning-soft text-warning border-warning/40',
    Icon: Clock,
    hint: 'The transaction has been sent and is waiting for block confirmation.'
  },
  FAILED: {
    label: 'Anchoring delayed',
    className: 'bg-warning-soft text-warning border-warning/40',
    Icon: AlertTriangle,
    hint: 'Anchoring will be retried automatically.'
  },
  SUPERSEDED: {
    label: 'Replaced by newer version',
    className: 'bg-surface-container text-muted border-line-strong',
    Icon: ShieldOff,
    hint: 'This version was replaced before it was anchored.'
  },
  REVOKED: {
    label: 'Revoked',
    className: 'bg-danger-soft text-danger border-danger/40',
    Icon: ShieldOff,
    hint: 'This version was revoked on-chain by the issuing doctor.'
  },
  DEMO: {
    label: 'Fingerprinted (demo, not on-chain)',
    className: 'bg-info-soft text-info border-info/40',
    Icon: FlaskConical,
    hint: 'Demo mode without a backend: a real fingerprint is computed, but nothing is written to a blockchain.'
  }
};

export const BlockchainBadge: React.FC<{ status: BlockchainRecordStatus; compact?: boolean }> = ({ status, compact }) => {
  const s = STYLES[status] ?? STYLES.PENDING;
  const { Icon } = s;
  return (
    <span
      title={s.hint}
      className={`inline-flex items-center gap-1 rounded-full border font-heading font-bold ${s.className} ${
        compact ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs'
      }`}
    >
      <Icon className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {s.label}
    </span>
  );
};
