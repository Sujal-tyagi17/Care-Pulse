import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Download, ExternalLink, Copy, Check, ShieldCheck, Fingerprint, Printer, FileBadge } from 'lucide-react';
import { AnchorBundle, Appointment, BlockchainRecordSummary, CertificateSummary } from '../types';
import { api } from '../api/client';
import { BlockchainBadge } from './BlockchainBadge';
import { networkName, shortHash, verifyUrl } from '../blockchain/chain';
import { buildVerifiableFile } from '../blockchain/canonical';
import { CERTIFICATE_LABELS, certificateStatement } from './certificateText';

interface Props {
  appointment: Appointment;
  kind: 'prescription' | 'certificate';
  onClose: () => void;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/**
 * Shows the patient a scannable, independently verifiable copy of a prescription or medical
 * certificate: QR code → public /verify page, the on-chain fingerprint, a downloadable file that
 * carries its own Merkle proof, and (for certificates) a printable certificate.
 */
export const VerifiableDocumentModal: React.FC<Props> = ({ appointment, kind, onClose }) => {
  const record = (kind === 'certificate' ? appointment.certificate : appointment.blockchainRecord) as BlockchainRecordSummary;
  const certificate = kind === 'certificate' ? (appointment.certificate as CertificateSummary) : null;
  const link = verifyUrl(record.recordHash);
  const [qr, setQr] = useState<string>('');
  const [canonical, setCanonical] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<AnchorBundle | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    QRCode.toDataURL(link, { margin: 1, width: 220, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''));
    api.verifyRecord(record.recordHash).then((r) => {
      setCanonical(r?.record?.canonicalPayload ?? null);
      setAnchor(r?.anchor ?? null);
    });
  }, [link, record.recordHash]);

  const title = kind === 'certificate' ? CERTIFICATE_LABELS[certificate!.certificate.type] : 'Verifiable Prescription';

  const download = () => {
    if (!canonical) return;
    const blob = new Blob([buildVerifiableFile(canonical, anchor)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${kind}-${appointment.date}-${record.recordHash.slice(2, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const printCertificate = () => {
    if (!certificate) return;
    const c = certificate.certificate;
    const statement = certificateStatement(c, appointment.patient?.name ?? 'the patient', appointment.date);
    const w = window.open('', '_blank', 'width=820,height=1000');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
      <style>
        body{font-family:Georgia,'Times New Roman',serif;color:#111;margin:0;padding:48px;}
        .sheet{max-width:640px;margin:0 auto;border:2px solid #111;padding:40px 44px;}
        h1{font-size:24px;letter-spacing:.06em;text-transform:uppercase;text-align:center;margin:0 0 4px}
        .clinic{text-align:center;font-size:13px;color:#555;margin-bottom:28px}
        p{font-size:15px;line-height:1.7}
        .remarks{border-left:3px solid #999;padding-left:12px;color:#333}
        .sign{margin-top:36px;display:flex;justify-content:space-between;align-items:flex-end;gap:24px}
        .verify{font-family:ui-monospace,monospace;font-size:10px;color:#444;word-break:break-all;max-width:300px}
        img{width:120px;height:120px}
        @media print{body{padding:0}.sheet{border:none}}
      </style></head><body><div class="sheet">
      <h1>${escapeHtml(title)}</h1>
      <div class="clinic">CarePulse Health · issued ${escapeHtml(new Date(certificate.issuedAt).toLocaleDateString())}</div>
      <p>${escapeHtml(statement)}</p>
      <p class="remarks">${escapeHtml(c.remarks)}</p>
      <div class="sign">
        <div><strong>${escapeHtml(appointment.doctor?.name ?? '')}</strong><br>${escapeHtml(appointment.doctor?.specialization ?? '')}<br>
          <span style="font-size:12px;color:#555">Digitally signed</span></div>
        <div style="text-align:right">${qr ? `<img src="${qr}" alt="">` : ''}
          <div class="verify">Scan or visit ${escapeHtml(link.replace(/^https?:\/\//, ''))}</div></div>
      </div></div><script>window.onload=()=>{window.print()}</script></body></html>`);
    w.document.close();
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1513]/50 backdrop-blur-md animate-fade-in text-fg">
      <div className="glass-panel rounded-3xl shadow-2xl max-w-xl w-full border border-line-strong overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="ai-gradient-card px-6 py-5 text-fg flex items-center justify-between border-b border-line">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-success-soft text-success rounded-2xl border border-success/40">
              {kind === 'certificate' ? <FileBadge className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
            </div>
            <div>
              <h2 className="font-heading font-extrabold text-base">{title}</h2>
              <p className="text-xs text-on-surface-variant">
                {appointment.doctor?.name} · {appointment.date}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-fg/10 transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5 text-xs">
          {certificate && (
            <div className="bg-surface-container/70 rounded-xl border border-line p-4 space-y-2">
              <p className="text-fg leading-relaxed">
                {certificateStatement(certificate.certificate, appointment.patient?.name ?? 'You', appointment.date)}
              </p>
              <p className="text-on-surface-variant">Remarks: {certificate.certificate.remarks}</p>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
            <div className="bg-white p-2 rounded-2xl shrink-0">
              {qr ? <img src={qr} alt="QR code linking to the verification page" className="w-40 h-40" /> : <div className="w-40 h-40" />}
            </div>
            <div className="space-y-3 flex-1 min-w-0">
              <BlockchainBadge status={record.status} />
              <p className="text-on-surface-variant leading-relaxed">
                {kind === 'certificate'
                  ? 'Your employer, college or insurer can scan this QR code to confirm the certificate was issued by a verified doctor and has not been changed.'
                  : 'Show this QR code at the pharmacy. Scanning it opens a public page that checks the blockchain to confirm the prescription was issued by a verified doctor and has not been changed.'}
              </p>
              <p className="text-on-surface-variant leading-relaxed">Only a fingerprint is stored on-chain. Your details are never published.</p>
            </div>
          </div>

          <div className="bg-surface-container/70 rounded-xl border border-line p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-on-surface-variant font-heading flex items-center gap-1">
                <Fingerprint className="w-3.5 h-3.5" /> Record fingerprint (SHA-256)
              </span>
              <button onClick={copyHash} className="flex items-center gap-1 text-primary hover:underline font-bold">
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <code className="block text-xs text-fg break-all font-mono">{record.recordHash}</code>

            <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5 pt-1 text-xs">
              {record.chainId > 0 && (
                <>
                  <dt className="text-on-surface-variant">Network</dt>
                  <dd className="text-fg">{networkName(record.chainId)}</dd>
                </>
              )}
              {record.doctorAddress && !/^0x0+$/.test(record.doctorAddress) && (
                <>
                  <dt className="text-on-surface-variant">Signed by</dt>
                  <dd className="text-fg font-mono">{shortHash(record.doctorAddress)}</dd>
                </>
              )}
              {record.anchorMode === 'BATCH' && record.batchId !== null && record.batchId !== undefined && (
                <>
                  <dt className="text-on-surface-variant">Anchoring</dt>
                  <dd className="text-fg">Merkle batch #{record.batchId}</dd>
                </>
              )}
              {record.anchoredAt && (
                <>
                  <dt className="text-on-surface-variant">Anchored</dt>
                  <dd className="text-fg">{new Date(record.anchoredAt).toLocaleString()}</dd>
                </>
              )}
              {record.txHash && (
                <>
                  <dt className="text-on-surface-variant">Transaction</dt>
                  <dd className="text-fg font-mono">
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
            {certificate ? (
              <button
                onClick={printCertificate}
                className="flex-1 px-4 py-2.5 rounded-xl bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 font-heading font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <Printer className="w-4 h-4" /> Print certificate
              </button>
            ) : (
              <a
                href={link}
                target="_blank"
                rel="noreferrer"
                className="flex-1 px-4 py-2.5 rounded-xl bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 font-heading font-bold flex items-center justify-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-4 h-4" /> Open verification page
              </a>
            )}
            <button
              onClick={download}
              disabled={!canonical}
              className="flex-1 px-4 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-fg border border-line font-heading font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> Download verifiable copy
            </button>
          </div>
          {certificate && (
            <a href={link} target="_blank" rel="noreferrer" className="block text-center text-primary hover:underline">
              Open verification page
            </a>
          )}
        </div>
      </div>
    </div>
  );
};
