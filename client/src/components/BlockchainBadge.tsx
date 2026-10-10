import React from 'react';
import { ShieldCheck, Clock, AlertTriangle, ShieldOff, FlaskConical } from 'lucide-react';
import { BlockchainRecordStatus } from '../types';

const STYLES: Record<BlockchainRecordStatus, { label: string; className: string; Icon: React.ElementType; hint: string }> = {
  CONFIRMED: {
    label: 'Verified on blockchain',
    className: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/40',
    Icon: ShieldCheck,
    hint: 'This prescription is signed by your doctor and anchored on-chain. It cannot be altered without detection.'
  },
  PENDING: {
    label: 'Anchoring…',
    className: 'bg-amber-500/15 text-amber-300 border-amber-400/40',
    Icon: Clock,
    hint: 'Signed by your doctor and waiting to be confirmed on the blockchain.'
  },
  SUBMITTED: {
    label: 'Confirming on-chain…',
    className: 'bg-amber-500/15 text-amber-300 border-amber-400/40',
    Icon: Clock,
    hint: 'The transaction has been sent and is waiting for block confirmation.'
  },
  FAILED: {
    label: 'Anchoring delayed',
    className: 'bg-orange-500/15 text-orange-300 border-orange-400/40',
    Icon: AlertTriangle,
    hint: 'Anchoring will be retried automatically.'
  },
  SUPERSEDED: {
    label: 'Replaced by newer version',
    className: 'bg-slate-500/15 text-slate-300 border-slate-400/40',
    Icon: ShieldOff,
    hint: 'This version was replaced before it was anchored.'
  },
  REVOKED: {
    label: 'Revoked',
    className: 'bg-red-500/15 text-red-300 border-red-400/40',
    Icon: ShieldOff,
    hint: 'This version was revoked on-chain by the issuing doctor.'
  },
  DEMO: {
    label: 'Fingerprinted (demo, not on-chain)',
    className: 'bg-sky-500/15 text-sky-300 border-sky-400/40',
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
        compact ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
      }`}
    >
      <Icon className={compact ? 'w-3 h-3' : 'w-3.5 h-3.5'} />
      {s.label}
    </span>
  );
};
