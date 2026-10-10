import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { ShieldCheck } from 'lucide-react';
import { SampleRx, formatDate } from './sample';

/**
 * A paper prescription. The paper stays white in both themes: it's a physical document.
 * In `animated` mode it plays the landing page's one orchestrated moment:
 * the slip arrives, the QR code is scanned, the fingerprint resolves, the stamp lands.
 */
export const PrescriptionSlip: React.FC<{ rx: SampleRx; fingerprint: string | null; animated?: boolean; className?: string }> = ({
  rx,
  fingerprint,
  animated = false,
  className = ''
}) => {
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/verify`, { margin: 0, width: 160, color: { dark: '#0F1F1C', light: '#FFFFFF' } })
      .then(setQr)
      .catch(() => setQr(''));
  }, []);

  return (
    <div
      className={`relative w-full max-w-[420px] rounded-[18px] bg-white text-[#0F1F1C] p-6 sm:p-7 shadow-[0_30px_60px_-20px_rgba(0,0,0,0.55)] ${
        animated ? 'slip-in' : ''
      } ${className}`}
      style={animated ? undefined : { transform: 'rotate(-1.5deg)' }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-dashed border-[#C8D3CE] pb-4">
        <div>
          <p className="font-heading font-bold text-[15px] leading-tight">CarePulse Health</p>
          <p className="text-[12px] text-[#5A6B66]">Outpatient prescription</p>
        </div>
        <div className="text-right text-[12px] text-[#5A6B66] leading-snug">
          <p className="text-[#0F1F1C] font-medium">{rx.patient}</p>
          <p>{formatDate(rx.date)}</p>
        </div>
      </div>

      <div className="flex gap-4 pt-4">
        <span className="font-heading text-[40px] leading-none text-[#0F766E] select-none" aria-hidden="true">
          ℞
        </span>
        <ol className="flex-1 space-y-3">
          {rx.medications.map((m, i) => (
            <li key={i}>
              <p className="font-semibold text-[15px] leading-tight">
                {m.medicineName} <span className="font-normal text-[#3E4E4A]">{m.dosage}</span>
              </p>
              <p className="text-[13px] text-[#5A6B66]">
                {m.frequency}, {m.durationDays} days
              </p>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="font-heading italic text-[20px] leading-none text-[#0F1F1C]/80" aria-hidden="true">
            P. Nair
          </p>
          <p className="mt-2 text-[12px] text-[#5A6B66] leading-snug">
            {rx.doctor}
            <br />
            {rx.specialization}
          </p>
        </div>
        <div className="relative shrink-0 rounded-lg border border-[#E2E8E5] p-1.5 overflow-hidden">
          {qr ? <img src={qr} alt="" className="w-[84px] h-[84px]" /> : <div className="w-[84px] h-[84px]" />}
          {animated && (
            <span
              aria-hidden="true"
              className="scan-line absolute left-0 right-0 top-1.5 h-[2px] bg-[#16A34A] shadow-[0_0_10px_2px_rgba(22,163,74,0.55)]"
              style={{ ['--scan-distance' as string]: '84px' }}
            />
          )}
        </div>
      </div>

      <div className="mt-4 rounded-lg bg-[#F1F5F3] px-3 py-2 font-mono text-[11px] text-[#3E4E4A] break-all leading-relaxed">
        <span className="text-[#5A6B66]">fingerprint </span>
        {fingerprint ?? '…'}
      </div>

      {animated && (
        <div
          className="stamp-in absolute -right-3 top-[38%] sm:-right-8 flex items-center gap-2 rounded-xl border-[2.5px] border-[#16A34A] bg-white/95 px-3.5 py-2 text-[#15803D]"
          role="img"
          aria-label="Verified on blockchain"
        >
          <ShieldCheck className="w-6 h-6" strokeWidth={2.25} />
          <span className="font-heading font-extrabold text-[15px] leading-tight">
            Verified
            <span className="block text-[11px] font-semibold text-[#15803D]/80">on Polygon</span>
          </span>
        </div>
      )}
    </div>
  );
};
