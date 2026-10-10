import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Download, ExternalLink, Copy, Check, ShieldCheck, Fingerprint } from 'lucide-react';
import { Appointment } from '../types';
import { api } from '../api/client';
import { BlockchainBadge } from './BlockchainBadge';
import { networkName, shortHash, verifyUrl } from '../blockchain/chain';

interface Props {
  appointment: Appointment;
  onClose: () => void;
}

/**
 * Shows the patient a scannable, independently verifiable copy of their prescription:
 * QR code -> public /verify page, the on-chain fingerprint, and a downloadable JSON document
 * that anyone can re-hash and check against the blockchain.
 */
export const PrescriptionCertificateModal: React.FC<Props> = ({ appointment, onClose }) => {
  const record = appointment.blockchainRecord!;
  const link = verifyUrl(record.recordHash);
  const [qr, setQr] = useState<string>('');
  const [canonical, setCanonical] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 220, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''));
    api.verifyRecord(record.recordHash).then((r) => setCanonical(r?.record?.canonicalPayload ?? null));
  }, [link, record.recordHash]);

  const download = () => {
    if (!canonical) return;
    const blob = new Blob([canonical], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `prescription-${appointment.date}-${record.recordHash.slice(2, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copyHash = async () => {
    try {
      await navigator.clipboard.writeText(record.recordHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in text-[#dae2fd]">
      <div className="glass-panel rounded-3xl shadow-2xl max-w-xl w-full border border-white/15 overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="ai-gradient-card px-6 py-5 text-white flex items-center justify-between border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-500/15 text-emerald-300 rounded-2xl border border-emerald-400/30">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-heading font-extrabold text-base">Verifiable Prescription</h2>
              <p className="text-[11px] text-on-surface-variant">
                {appointment.doctor?.name} · {appointment.date}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 text-xs">
          <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
            <div className="bg-white p-2 rounded-2xl shrink-0">
              {qr ? <img src={qr} alt="QR code linking to the verification page" className="w-40 h-40" /> : <div className="w-40 h-40" />}
            </div>
            <div className="space-y-3 flex-1 min-w-0">
              <BlockchainBadge status={record.status} />
              <p className="text-on-surface-variant leading-relaxed">
                Show this QR code at the pharmacy. Scanning it opens a public page that checks the blockchain to confirm the
                prescription was issued by a verified doctor and has not been changed.
              </p>
              <p className="text-on-surface-variant leading-relaxed">
                Only a fingerprint is stored on-chain. Your name, medicines and notes are never published.
              </p>
            </div>
          </div>

          <div className="bg-surface-container/70 rounded-xl border border-white/5 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant font-heading flex items-center gap-1">
                <Fingerprint className="w-3.5 h-3.5" /> Record fingerprint (SHA-256)
              </span>
              <button onClick={copyHash} className="flex items-center gap-1 text-primary hover:underline font-bold">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <code className="block text-[11px] text-white break-all font-mono">{record.recordHash}</code>

            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 pt-1 text-[11px]">
              {record.chainId > 0 && (
                <>
                  <dt className="text-on-surface-variant">Network</dt>
                  <dd className="text-white">{networkName(record.chainId)}</dd>
                </>
              )}
              {record.doctorAddress && !/^0x0+$/.test(record.doctorAddress) && (
                <>
                  <dt className="text-on-surface-variant">Signed by</dt>
                  <dd className="text-white font-mono">{shortHash(record.doctorAddress)}</dd>
                </>
              )}
              {record.anchoredAt && (
                <>
                  <dt className="text-on-surface-variant">Anchored</dt>
                  <dd className="text-white">{new Date(record.anchoredAt).toLocaleString()}</dd>
                </>
              )}
              {record.txHash && (
                <>
                  <dt className="text-on-surface-variant">Transaction</dt>
                  <dd className="text-white font-mono">
                    {record.txUrl ? (
                      <a href={record.txUrl} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">
                        {shortHash(record.txHash)} <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      shortHash(record.txHash)
                    )}
                  </dd>
                </>
              )}
            </dl>
          </div>

          <div className="flex flex-col sm:flex-row gap-2.5">
            <a
              href={link}
              target="_blank"
              rel="noreferrer"
              className="flex-1 px-4 py-2.5 rounded-xl bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 font-heading font-bold flex items-center justify-center gap-1.5 transition-colors"
            >
              <ExternalLink className="w-4 h-4" /> Open verification page
            </a>
            <button
              onClick={download}
              disabled={!canonical}
              className="flex-1 px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-white border border-white/10 font-heading font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> Download verifiable copy
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
