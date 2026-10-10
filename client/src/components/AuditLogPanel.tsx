import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldX, ShieldAlert, Loader2, RefreshCw, ExternalLink, Link2 } from 'lucide-react';
import { api } from '../api/client';
import { AuditEntry, AuditIntegrityReport } from '../types';
import { shortHash } from '../blockchain/chain';

const EVENT_LABELS: Record<string, string> = {
  APPOINTMENT_BOOKED: 'Appointment booked',
  APPOINTMENT_CANCELLED: 'Appointment cancelled',
  APPOINTMENTS_RESCHEDULE_REQUIRED: 'Appointments need rescheduling',
  CONSULTATION_COMPLETED: 'Consultation completed',
  PRESCRIPTION_ISSUED: 'Prescription issued',
  CERTIFICATE_ISSUED: 'Certificate issued',
  RECORD_REVOKED: 'Record revoked',
  DOCTOR_CREATED: 'Doctor added',
  DOCTOR_UPDATED: 'Doctor profile updated',
  DOCTOR_LEAVE_ADDED: 'Doctor leave added',
  DOCTOR_LEAVE_REMOVED: 'Doctor leave removed',
  DOCTOR_CHAIN_REGISTERED: 'Doctor verified on-chain',
  DOCTOR_CHAIN_STATUS_CHANGED: 'Doctor on-chain status changed'
};

const BREAK_TEXT: Record<string, string> = {
  HASH_MISMATCH: 'an entry was edited',
  BROKEN_LINK: 'an entry was replaced or reordered',
  SEQUENCE_GAP: 'an entry was deleted'
};

/**
 * Tamper-evident audit log: every entry is hash-chained to the previous one, and the head is
 * checkpointed on-chain with each batch. The integrity check recomputes everything.
 */
export const AuditLogPanel: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [demo, setDemo] = useState(false);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<AuditIntegrityReport | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getAuditEntries(30);
      setEntries(res.entries);
      setDemo(!!res.demo);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const check = async () => {
    setChecking(true);
    setError(null);
    try {
      setReport((await api.verifyAuditLog()).report);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  };

  const verdictBox = (r: AuditIntegrityReport) => {
    if (r.verdict === 'TAMPERED') {
      const where = r.firstBreak
        ? `Entry #${r.firstBreak.seq}: ${BREAK_TEXT[r.firstBreak.reason]}.`
        : `History up to entry #${r.checkpointMismatch?.auditSeq} no longer matches what was anchored on-chain in batch #${r.checkpointMismatch?.onChainBatchId}, so it was rewritten.`;
      return { cls: 'border-red-400/40 bg-red-500/10 text-red-300', Icon: ShieldX, title: 'Audit history has been tampered with', body: where };
    }
    if (r.verdict === 'INTACT_NOT_ANCHORED') {
      return {
        cls: 'border-amber-400/40 bg-amber-500/10 text-amber-300',
        Icon: ShieldAlert,
        title: 'Hash chain intact, not yet anchored',
        body: 'Every entry links correctly, but no checkpoint is on-chain yet, so a full rewrite could not be detected.'
      };
    }
    return {
      cls: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
      Icon: ShieldCheck,
      title: 'Audit history intact',
      body: `All ${r.totalEntries} entries verified; ${r.checkpointsVerified} on-chain checkpoint${r.checkpointsVerified === 1 ? '' : 's'} match.${
        r.unanchoredEntries ? ` ${r.unanchoredEntries} newest entr${r.unanchoredEntries === 1 ? 'y is' : 'ies are'} protected by the hash chain until the next batch.` : ''
      }`
    };
  };

  return (
    <section className="glass-card rounded-2xl border border-white/10 overflow-hidden">
      <div className="px-5 py-4 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h3 className="font-heading font-extrabold text-sm text-white flex items-center gap-1.5">
            <Link2 className="w-4 h-4 text-primary" /> Tamper-evident audit log
          </h3>
          <p className="text-[11px] text-on-surface-variant max-w-2xl">
            Each entry is hash-chained to the one before it, and the latest hash is anchored with every blockchain batch. Only IDs
            and statuses are logged, never medical details, and nothing about individual events goes on-chain.
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={load}
            className="px-3 py-2 rounded-xl border border-white/10 text-white text-xs font-heading font-bold flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={check}
            disabled={checking || demo}
            className="px-3 py-2 rounded-xl bg-primary text-on-primary text-xs font-heading font-bold flex items-center gap-1.5 disabled:opacity-60"
          >
            {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />} Verify integrity
          </button>
        </div>
      </div>

      {error && <p className="px-5 pt-4 text-xs text-red-300">{error}</p>}

      {report &&
        (() => {
          const b = verdictBox(report);
          return (
            <div className={`mx-5 mt-4 rounded-xl border p-4 flex gap-3 text-xs ${b.cls}`}>
              <b.Icon className="w-6 h-6 shrink-0" />
              <div className="space-y-1">
                <p className="font-heading font-extrabold text-sm">{b.title}</p>
                <p className="text-on-surface/90">{b.body}</p>
                {report.latestCheckpoint && (
                  <p className="text-on-surface-variant">
                    Latest checkpoint: entry #{report.latestCheckpoint.auditSeq} in batch #{report.latestCheckpoint.onChainBatchId},{' '}
                    {new Date(report.latestCheckpoint.anchoredAt).toLocaleString()}
                    {report.latestCheckpointTxUrl && (
                      <a href={report.latestCheckpointTxUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1 ml-1">
                        tx <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {report.checkpointSource === 'blockchain' ? ' · checkpoints read from the blockchain' : ''}
                  </p>
                )}
              </div>
            </div>
          );
        })()}

      <div className="p-5">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-on-surface-variant">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading audit log…
          </div>
        ) : demo ? (
          <p className="text-xs text-on-surface-variant">The audit log needs the backend; it isn't available in the standalone demo.</p>
        ) : entries.length === 0 ? (
          <p className="text-xs text-on-surface-variant">No audit entries yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-on-surface-variant text-left">
                <tr className="border-b border-white/5">
                  <th className="py-2 pr-4 font-semibold">#</th>
                  <th className="py-2 pr-4 font-semibold">Event</th>
                  <th className="py-2 pr-4 font-semibold">By</th>
                  <th className="py-2 pr-4 font-semibold">When</th>
                  <th className="py-2 font-semibold">Entry hash</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.seq} className="border-b border-white/5 last:border-0">
                    <td className="py-2 pr-4 text-on-surface-variant font-mono">{e.seq}</td>
                    <td className="py-2 pr-4">
                      <span className="text-white">{EVENT_LABELS[e.eventType] ?? e.eventType}</span>
                      <span className="block text-on-surface-variant font-mono">
                        {e.entityType.toLowerCase()} {shortHash(e.entityId, 8, 4)}
                      </span>
                    </td>
                    <td className="py-2 pr-4 text-on-surface-variant">
                      {e.actorName ?? (e.actorRole ? e.actorRole.toLowerCase() : 'system')}
                    </td>
                    <td className="py-2 pr-4 text-on-surface-variant whitespace-nowrap">{new Date(e.occurredAt).toLocaleString()}</td>
                    <td className="py-2 font-mono text-on-surface-variant">{shortHash(e.entryHash, 6, 4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
};
