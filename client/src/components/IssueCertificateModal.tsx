import React, { useMemo, useState } from 'react';
import { X, FileBadge, Loader2, ShieldCheck } from 'lucide-react';
import { Appointment, CertificateType } from '../types';
import { api } from '../api/client';
import { CERTIFICATE_LABELS, certificateStatement } from './certificateText';

interface Props {
  appointment: Appointment;
  onClose: () => void;
  onIssued: () => void;
}

const TYPES: Array<{ type: CertificateType; hint: string }> = [
  { type: 'SICK_LEAVE', hint: 'Rest advised for a period' },
  { type: 'FITNESS', hint: 'Fit to resume work / school / sport' },
  { type: 'VISIT', hint: 'Proof that the patient attended' }
];

const today = () => new Date().toISOString().split('T')[0];

/** Doctor form for issuing a blockchain-verifiable medical certificate after a consultation. */
export const IssueCertificateModal: React.FC<Props> = ({ appointment, onClose, onIssued }) => {
  const existing = appointment.certificate?.certificate;
  const [type, setType] = useState<CertificateType>(existing?.type ?? 'SICK_LEAVE');
  const [fromDate, setFromDate] = useState(existing?.fromDate ?? appointment.date ?? today());
  const [toDate, setToDate] = useState(existing?.toDate ?? appointment.date ?? today());
  const [remarks, setRemarks] = useState(existing?.remarks ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsRange = type === 'SICK_LEAVE';
  const usesFrom = type !== 'VISIT';
  const details = {
    type,
    fromDate: usesFrom ? fromDate || null : null,
    toDate: needsRange ? toDate || null : null,
    remarks: remarks.trim()
  };
  const preview = useMemo(
    () => certificateStatement(details, appointment.patient?.name ?? 'the patient', appointment.date),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [type, fromDate, toDate, appointment]
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (needsRange && toDate < fromDate) return setError('The end date must be on or after the start date.');
    if (details.remarks.length < 3) return setError('Add a short remark for the certificate.');
    setSubmitting(true);
    try {
      await api.issueCertificate(appointment.id, details);
      onIssued();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  const input =
    'w-full bg-surface-container border border-line rounded-xl px-3 py-2 text-sm text-fg focus:outline-none focus:border-primary';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1513]/50 backdrop-blur-md animate-fade-in text-fg">
      <form onSubmit={submit} className="glass-panel rounded-3xl shadow-2xl max-w-lg w-full border border-line-strong overflow-hidden max-h-[92vh] overflow-y-auto">
        <div className="ai-gradient-card px-6 py-5 text-fg flex items-center justify-between border-b border-line">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-tertiary-container/20 text-tertiary rounded-2xl border border-tertiary/30">
              <FileBadge className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-heading font-extrabold text-base">{existing ? 'Re-issue' : 'Issue'} medical certificate</h2>
              <p className="text-xs text-on-surface-variant">
                {appointment.patient?.name} · visit {appointment.date}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl hover:bg-fg/10 transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4 text-xs">
          <fieldset className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <legend className="sr-only">Certificate type</legend>
            {TYPES.map((t) => (
              <label
                key={t.type}
                className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                  type === t.type ? 'border-primary bg-primary/10' : 'border-line hover:border-line-strong'
                }`}
              >
                <input type="radio" name="type" className="sr-only" checked={type === t.type} onChange={() => setType(t.type)} />
                <span className="block font-heading font-bold text-fg">{CERTIFICATE_LABELS[t.type]}</span>
                <span className="block text-on-surface-variant mt-0.5">{t.hint}</span>
              </label>
            ))}
          </fieldset>

          {usesFrom && (
            <div className={`grid gap-3 ${needsRange ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <label className="space-y-1">
                <span className="text-on-surface-variant">{needsRange ? 'Rest from' : 'Fit from'}</span>
                <input type="date" required className={input} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
              </label>
              {needsRange && (
                <label className="space-y-1">
                  <span className="text-on-surface-variant">Rest until (inclusive)</span>
                  <input type="date" required min={fromDate} className={input} value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </label>
              )}
            </div>
          )}

          <label className="block space-y-1">
            <span className="text-on-surface-variant">Remarks (shown on the certificate and to anyone who verifies it)</span>
            <textarea
              required
              maxLength={500}
              rows={3}
              className={input}
              placeholder={type === 'SICK_LEAVE' ? 'e.g. Viral fever; advised rest and fluids.' : 'e.g. Recovered fully; no restrictions.'}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </label>

          <div className="bg-surface-container/70 rounded-xl border border-line p-3.5 space-y-1">
            <p className="text-xs font-bold text-on-surface-variant font-heading">Certificate will read</p>
            <p className="text-fg leading-relaxed">{preview}</p>
          </div>

          <p className="text-on-surface-variant flex gap-1.5">
            <ShieldCheck className="w-4 h-4 text-success shrink-0" />
            Signed with your doctor key and recorded on the blockchain. {existing ? 'The previous certificate will be revoked.' : ''}
          </p>

          {error && <p className="text-danger">{error}</p>}

          <div className="flex gap-2.5 justify-end">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-line text-fg font-heading font-bold">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 rounded-xl bg-primary text-on-primary font-heading font-bold flex items-center gap-1.5 disabled:opacity-60"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {existing ? 'Re-issue certificate' : 'Issue certificate'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
