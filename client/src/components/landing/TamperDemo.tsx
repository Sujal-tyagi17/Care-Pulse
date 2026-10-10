import React, { useEffect, useMemo, useState } from 'react';
import { ShieldCheck, ShieldX, RotateCcw, FlaskConical } from 'lucide-react';
import { ORIGINAL_RX, SampleRx, fingerprintOf } from './sample';

/** Splits two hex strings into matching / differing runs so the change is visible at a glance. */
function diffRuns(a: string, b: string) {
  const runs: Array<{ text: string; same: boolean }> = [];
  for (let i = 0; i < b.length; i++) {
    const same = a[i] === b[i];
    const last = runs[runs.length - 1];
    if (last && last.same === same) last.text += b[i];
    else runs.push({ text: b[i], same });
  }
  return runs;
}

const paperInput =
  'min-w-0 bg-transparent border-b border-dashed border-[#C8D3CE] focus:border-[#0F766E] focus:outline-none py-0.5 text-[#0F1F1C]';

/**
 * Live tamper demo: edit the sample prescription and the SHA-256 fingerprint is recomputed in the
 * browser with the app's own hashing code, then compared with the fingerprint that was anchored.
 */
export const TamperDemo: React.FC = () => {
  const [rx, setRx] = useState<SampleRx>(ORIGINAL_RX);
  const [anchored, setAnchored] = useState<string | null>(null);
  const [current, setCurrent] = useState<string | null>(null);

  useEffect(() => {
    fingerprintOf(ORIGINAL_RX).then(setAnchored);
  }, []);
  useEffect(() => {
    let live = true;
    fingerprintOf(rx).then((h) => live && setCurrent(h));
    return () => {
      live = false;
    };
  }, [rx]);

  const authentic = !!anchored && anchored === current;
  const changedFields = useMemo(() => {
    const out: string[] = [];
    rx.medications.forEach((m, i) => {
      const o = ORIGINAL_RX.medications[i];
      if (m.medicineName !== o.medicineName) out.push(`medicine ${i + 1}`);
      if (m.dosage !== o.dosage) out.push(`dose of ${o.medicineName}`);
      if (m.frequency !== o.frequency) out.push(`frequency of ${o.medicineName}`);
      if (m.durationDays !== o.durationDays) out.push(`days of ${o.medicineName}`);
    });
    if (rx.patient !== ORIGINAL_RX.patient) out.push('patient name');
    return out;
  }, [rx]);

  const setMed = (i: number, patch: Partial<SampleRx['medications'][number]>) =>
    setRx((r) => ({ ...r, medications: r.medications.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] items-start">
      {/* Editable paper */}
      <div className="rounded-[18px] bg-white text-[#0F1F1C] p-6 sm:p-7 border border-line shadow-pop">
        <div className="flex items-center justify-between gap-3 border-b border-dashed border-[#C8D3CE] pb-3 mb-4">
          <p className="font-heading font-bold">Prescription</p>
          <label className="text-[13px] text-[#5A6B66] flex items-center gap-2">
            Patient
            <input className={`${paperInput} w-36`} value={rx.patient} onChange={(e) => setRx({ ...rx, patient: e.target.value })} aria-label="Patient name" />
          </label>
        </div>
        <div className="space-y-5">
          {rx.medications.map((m, i) => (
            <fieldset key={i} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2">
              <legend className="sr-only">Medicine {i + 1}</legend>
              <input className={`${paperInput} w-full font-semibold text-[15px]`} value={m.medicineName} aria-label={`Medicine ${i + 1} name`} onChange={(e) => setMed(i, { medicineName: e.target.value })} />
              <input className={`${paperInput} w-20 text-right font-semibold text-[15px]`} value={m.dosage} aria-label={`Medicine ${i + 1} dose`} onChange={(e) => setMed(i, { dosage: e.target.value })} />
              <input className={`${paperInput} w-full text-[13px] text-[#5A6B66]`} value={m.frequency} aria-label={`Medicine ${i + 1} frequency`} onChange={(e) => setMed(i, { frequency: e.target.value })} />
              <label className="flex items-center gap-1.5 text-[13px] text-[#5A6B66] justify-end">
                <input
                  type="number"
                  min={1}
                  max={90}
                  className={`${paperInput} w-12 text-right`}
                  value={m.durationDays}
                  aria-label={`Medicine ${i + 1} days`}
                  onChange={(e) => setMed(i, { durationDays: Number(e.target.value) || 0 })}
                />
                days
              </label>
            </fieldset>
          ))}
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMed(0, { dosage: '6500mg' })}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#B91C1C]/30 bg-[#FEE2E2] px-3 py-1.5 text-[13px] font-semibold text-[#991B1B] hover:bg-[#FECACA]"
          >
            <FlaskConical className="w-4 h-4" aria-hidden="true" />
            Change 650mg to 6500mg
          </button>
          <button
            type="button"
            onClick={() => setRx(ORIGINAL_RX)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#C8D3CE] px-3 py-1.5 text-[13px] font-semibold text-[#3E4E4A] hover:bg-[#F1F5F3]"
          >
            <RotateCcw className="w-4 h-4" aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>

      {/* Live verification */}
      <div className="space-y-4" aria-live="polite">
        <div
          className={`rounded-2xl border p-5 flex gap-4 items-start transition-colors ${
            authentic ? 'border-success/40 bg-success-soft text-success' : 'border-danger/40 bg-danger-soft text-danger'
          }`}
        >
          {authentic ? <ShieldCheck className="w-8 h-8 shrink-0" aria-hidden="true" /> : <ShieldX className="w-8 h-8 shrink-0" aria-hidden="true" />}
          <div>
            <p className="font-heading font-extrabold text-lg">{authentic ? 'Authentic' : 'Altered document'}</p>
            <p className="text-fg/80 text-sm">
              {authentic
                ? 'The fingerprint matches what Dr. Priya Nair signed and anchored on-chain.'
                : `This isn't what the doctor signed. Changed: ${changedFields.length ? changedFields.join(', ') : 'content'}. A pharmacy would refuse it.`}
            </p>
          </div>
        </div>

        <div className="card rounded-2xl p-5 space-y-4">
          <div>
            <p className="text-sm text-muted mb-1">Fingerprint anchored on-chain when the doctor signed</p>
            <p className="font-mono text-[12.5px] break-all text-fg">{anchored ?? '…'}</p>
          </div>
          <div>
            <p className="text-sm text-muted mb-1">Fingerprint of the document in front of you</p>
            <p className="font-mono text-[12.5px] break-all">
              {current && anchored
                ? diffRuns(anchored, current).map((r, i) => (
                    <span key={i} className={r.same ? 'text-fg' : 'bg-danger-soft text-danger rounded-sm'}>
                      {r.text}
                    </span>
                  ))
                : '…'}
            </p>
          </div>
          <p className="text-[13px] text-muted border-t border-line pt-3">
            One changed character scrambles the whole SHA-256 fingerprint, so a forger can't adjust it to match. In the app the
            anchored value is read straight from the blockchain; here it's the fingerprint of the original sample.
          </p>
        </div>
      </div>
    </div>
  );
};
