import React, { useCallback, useEffect, useState } from 'react';
import { ShieldCheck, ShieldOff, RefreshCw, Loader2, ExternalLink, Wallet, Boxes, FileCheck2, AlertTriangle, Layers, Zap } from 'lucide-react';
import { AuditLogPanel } from './AuditLogPanel';
import { api } from '../api/client';
import { BlockchainOverview } from '../types';
import { BlockchainBadge } from './BlockchainBadge';
import { networkName, shortHash } from '../blockchain/chain';

const formatBalance = (wei: string) => {
  try {
    const n = Number(BigInt(wei) / 10n ** 12n) / 1e6; // to 6 decimals without float overflow
    return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
  } catch {
    return '—';
  }
};

const Stat: React.FC<{ label: string; value: React.ReactNode; Icon: React.ElementType }> = ({ label, value, Icon }) => (
  <div className="glass-card rounded-2xl p-4 border border-line flex items-center gap-3">
    <div className="p-2.5 rounded-xl bg-primary/10 text-primary border border-primary/20">
      <Icon className="w-5 h-5" />
    </div>
    <div className="min-w-0">
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p className="font-heading font-extrabold text-fg text-lg truncate">{value}</p>
    </div>
  </div>
);

export const BlockchainAdminPanel: React.FC = () => {
  const [data, setData] = useState<BlockchainOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyDoctor, setBusyDoctor] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const [anchoring, setAnchoring] = useState(false);

  const anchorNow = async () => {
    setAnchoring(true);
    setMessage(null);
    try {
      const r = await api.anchorBatchNow();
      if (r.status === 'ANCHORED') {
        setMessage({
          type: 'ok',
          text: `Batch #${r.onChainBatchId} anchored: ${r.records} record${r.records === 1 ? '' : 's'} + audit checkpoint in one transaction.`
        });
      } else if (r.status === 'SKIPPED') {
        setMessage({ type: 'ok', text: r.reason ?? 'Nothing to anchor.' });
      } else {
        setMessage({ type: 'error', text: r.reason ?? 'Anchoring failed.' });
      }
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setAnchoring(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getBlockchainOverview());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (doctorId: string, fn: () => Promise<{ message: string; txHash?: string | null }>) => {
    setBusyDoctor(doctorId);
    setMessage(null);
    try {
      const res = await fn();
      setMessage({ type: 'ok', text: res.txHash ? `${res.message} Tx ${shortHash(res.txHash, 8, 6)}` : res.message });
      await load();
    } catch (err) {
      setMessage({ type: 'error', text: (err as Error).message });
    } finally {
      setBusyDoctor(null);
    }
  };

  const net = data?.network;
  const counts = data?.recordCounts ?? {};

  return (
    // shrink-0: the dashboard's <main> is a fixed-height flex column; without it the cards get squashed instead of scrolling.
    <div className="flex flex-col gap-6 shrink-0">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-fg mb-1">Blockchain Verification</h1>
          <p className="text-xs sm:text-sm text-on-surface-variant max-w-2xl">
            Verify doctors on-chain so their signed prescriptions and certificates are accepted, and monitor anchoring. Only salted fingerprints
            are written to the chain; no patient data ever leaves the database.
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-2 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 rounded-xl text-xs font-heading font-bold transition-all flex items-center gap-1.5"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refresh
        </button>
      </div>

      {data && !data.enabled && (
        <div className="glass-card rounded-2xl p-5 border border-warning/40 text-xs space-y-1.5">
          <p className="font-heading font-bold text-warning flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            {data.demo ? 'Demo mode: no backend connected' : 'Blockchain anchoring is not configured on the server'}
          </p>
          <p className="text-on-surface-variant">
            Deploy the MedicalRegistry contract (<code>cd blockchain && npm run deploy:amoy</code>) and set the{' '}
            <code>BLOCKCHAIN_*</code> variables in the server's <code>.env</code>. See the Blockchain section of the README.
          </p>
        </div>
      )}

      {data?.networkError && (
        <div className="glass-card rounded-2xl p-4 border border-danger/40 text-xs text-danger">
          Could not reach the blockchain: {data.networkError}
        </div>
      )}

      {net && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Network" value={networkName(net.chainId)} Icon={Boxes} />
          <Stat label="Records anchored on-chain" value={net.totalRecords} Icon={FileCheck2} />
          <Stat label="Verified doctors on-chain" value={net.registeredDoctors} Icon={ShieldCheck} />
          <Stat label="Relayer gas balance" value={formatBalance(net.relayerBalanceWei)} Icon={Wallet} />
        </section>
      )}

      {net && (
        <section className="glass-card rounded-2xl p-5 border border-line text-xs grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5">
          <span className="text-on-surface-variant">Registry contract</span>
          <span className="font-mono text-fg break-all">
            {net.contractUrl ? (
              <a href={net.contractUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                {net.contractAddress} <ExternalLink className="w-3 h-3" />
              </a>
            ) : (
              net.contractAddress
            )}
          </span>
          <span className="text-on-surface-variant">Hospital relayer</span>
          <span className="font-mono text-fg break-all">
            {net.relayerAddress}{' '}
            {!net.relayerIsOwner && <span className="text-danger font-sans">(not the contract owner — doctor registration will fail)</span>}
          </span>
          <span className="text-on-surface-variant">Records</span>
          <span className="text-fg">
            {['CONFIRMED', 'PENDING', 'SUBMITTED', 'FAILED', 'REVOKED'].map((k) => `${k.toLowerCase()}: ${counts[k] ?? 0}`).join(' · ')}
          </span>
        </section>
      )}

      {net && data?.batching && (
        <section className="glass-card rounded-2xl border border-line overflow-hidden">
          <div className="px-5 py-4 border-b border-line flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h3 className="font-heading font-extrabold text-sm text-fg flex items-center gap-1.5">
                <Layers className="w-4 h-4 text-primary" /> Merkle batch anchoring
              </h3>
              <p className="text-xs text-on-surface-variant">
                {data.batching.mode === 'BATCH'
                  ? `Every ${data.batching.intervalMinutes} min, all new records and the audit-log head go on-chain in one transaction. ${
                      data.batching.pendingRecords
                    } record${data.batching.pendingRecords === 1 ? '' : 's'} waiting${
                      data.batching.nextBatchAt
                        ? `; next batch about ${new Date(data.batching.nextBatchAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                        : ''
                    }.`
                  : 'Single-transaction mode: each record is anchored on its own (BLOCKCHAIN_BATCH_INTERVAL_MINUTES=0).'}
              </p>
            </div>
            <button
              onClick={anchorNow}
              disabled={anchoring}
              className="px-3 py-2 rounded-xl bg-primary text-on-primary text-xs font-heading font-bold flex items-center gap-1.5 disabled:opacity-60 shrink-0"
            >
              {anchoring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />} Anchor now
            </button>
          </div>
          {data.batching.recentBatches.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="text-on-surface-variant text-left">
                  <tr className="border-b border-line">
                    <th className="px-5 py-2.5 font-semibold">Batch</th>
                    <th className="px-5 py-2.5 font-semibold">Records</th>
                    <th className="px-5 py-2.5 font-semibold">Audit checkpoint</th>
                    <th className="px-5 py-2.5 font-semibold">When</th>
                    <th className="px-5 py-2.5 font-semibold text-right">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.batching.recentBatches.map((b) => (
                    <tr key={b.id} className="border-b border-line last:border-0">
                      <td className="px-5 py-2.5 text-fg font-mono">
                        {b.onChainBatchId !== null ? (
                          b.txUrl ? (
                            <a href={b.txUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                              #{b.onChainBatchId} <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            `#${b.onChainBatchId}`
                          )
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-fg">{b.leafCount}</td>
                      <td className="px-5 py-2.5 text-on-surface-variant">entry #{b.auditSeq}</td>
                      <td className="px-5 py-2.5 text-on-surface-variant whitespace-nowrap">{new Date(b.anchoredAt ?? b.createdAt).toLocaleString()}</td>
                      <td className="px-5 py-2.5 text-right">
                        <span
                          title={b.lastError ?? undefined}
                          className={
                            b.status === 'CONFIRMED' ? 'text-success font-bold' : b.status === 'FAILED' ? 'text-danger font-bold' : 'text-warning font-bold'
                          }
                        >
                          {b.status.toLowerCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {message && (
        <div
          className={`rounded-xl px-4 py-3 text-xs border ${
            message.type === 'ok' ? 'border-success/40 bg-success-soft text-success' : 'border-danger/40 bg-danger-soft text-danger'
          }`}
        >
          {message.text}
        </div>
      )}

      <section className="glass-card rounded-2xl border border-line overflow-hidden">
        <div className="px-5 py-4 border-b border-line">
          <h3 className="font-heading font-extrabold text-sm text-fg">Doctor registry</h3>
          <p className="text-xs text-on-surface-variant">A doctor's prescriptions are only accepted on-chain after you verify them here.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-on-surface-variant text-left">
              <tr className="border-b border-line">
                <th className="px-5 py-2.5 font-semibold">Doctor</th>
                <th className="px-5 py-2.5 font-semibold">Signing wallet</th>
                <th className="px-5 py-2.5 font-semibold">On-chain status</th>
                <th className="px-5 py-2.5 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {(data?.doctors ?? []).map((d) => (
                <tr key={d.id} className="border-b border-line last:border-0">
                  <td className="px-5 py-3">
                    <p className="text-fg font-semibold">{d.name}</p>
                    <p className="text-on-surface-variant">{d.specialization}</p>
                  </td>
                  <td className="px-5 py-3 font-mono text-on-surface-variant">
                    {d.walletAddress ? (
                      d.walletUrl ? (
                        <a href={d.walletUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                          {shortHash(d.walletAddress)}
                        </a>
                      ) : (
                        shortHash(d.walletAddress)
                      )
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {!d.registeredOnChain ? (
                      <span className="text-on-surface-variant">Not verified</span>
                    ) : d.activeOnChain ? (
                      <span className="inline-flex items-center gap-1 text-success font-bold">
                        <ShieldCheck className="w-3.5 h-3.5" /> Verified
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-danger font-bold">
                        <ShieldOff className="w-3.5 h-3.5" /> Suspended
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {data?.enabled &&
                      (busyDoctor === d.id ? (
                        <Loader2 className="w-4 h-4 animate-spin inline text-primary" />
                      ) : !d.registeredOnChain ? (
                        <button
                          onClick={() => act(d.id, () => api.registerDoctorOnChain(d.id))}
                          className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-heading font-bold"
                        >
                          Verify on-chain
                        </button>
                      ) : (
                        <button
                          onClick={() => act(d.id, () => api.setDoctorChainStatus(d.id, !d.activeOnChain))}
                          className={`px-3 py-1.5 rounded-lg border font-heading font-bold ${
                            d.activeOnChain ? 'border-danger/40 text-danger hover:bg-danger-soft' : 'border-success/40 text-success hover:bg-success-soft'
                          }`}
                        >
                          {d.activeOnChain ? 'Suspend' : 'Reinstate'}
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {data && data.recentRecords.length > 0 && (
        <section className="glass-card rounded-2xl border border-line overflow-hidden">
          <div className="px-5 py-4 border-b border-line">
            <h3 className="font-heading font-extrabold text-sm text-fg">Recent records</h3>
          </div>
          <div className="divide-y divide-line">
            {data.recentRecords.map((r) => (
              <div key={r.recordHash} className="px-5 py-3 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 text-xs">
                <div className="flex-1 min-w-0">
                  <p className="text-fg font-semibold">
                    {r.patientName} · {r.doctorName}
                  </p>
                  <p className="text-on-surface-variant">
                    Visit {r.appointmentDate} · {r.attempts} attempt{r.attempts === 1 ? '' : 's'}
                    {r.lastError && r.status !== 'CONFIRMED' ? ` · ${r.lastError}` : ''}
                  </p>
                </div>
                <a href={`/verify?h=${r.recordHash}`} target="_blank" rel="noreferrer" className="font-mono text-primary hover:underline">
                  {shortHash(r.recordHash, 8, 6)}
                </a>
                {r.txUrl && (
                  <a href={r.txUrl} target="_blank" rel="noreferrer" className="text-on-surface-variant hover:text-primary inline-flex items-center gap-1">
                    tx <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <BlockchainBadge status={r.status} compact />
              </div>
            ))}
          </div>
        </section>
      )}

      {data && (data.enabled || !data.demo) && <AuditLogPanel />}
    </div>
  );
};
