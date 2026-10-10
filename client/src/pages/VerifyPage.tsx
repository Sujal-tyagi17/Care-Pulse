import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  Clock,
  Search,
  Upload,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ExternalLink,
  Pill,
  FlaskConical,
  Loader2,
  Activity,
  FileBadge
} from 'lucide-react';
import { api } from '../api/client';
import { canonicalize, sha256Hex, parseVerifiableFile, isCertificate } from '../blockchain/canonical';
import {
  chainConfig,
  explorerAddress,
  explorerTx,
  isDirectChainConfigured,
  networkName,
  readRecordDirect,
  readBatchedRecordDirect,
  shortHash
} from '../blockchain/chain';
import { AnchorBundle, BatchCheck, OnChainRecord, VerifiableDocument, VerificationResult } from '../types';
import { CERTIFICATE_LABELS, formatCertificatePeriod } from '../components/certificateText';

type Verdict = 'VALID' | 'REVOKED' | 'TAMPERED' | 'FORGED' | 'PENDING' | 'NOT_FOUND' | 'UNAVAILABLE' | 'DEMO';
type CheckState = 'pass' | 'fail' | 'skip';

interface Outcome {
  hash: string;
  verdict: Verdict;
  verdictDetail?: string;
  document: VerifiableDocument | null;
  onChain: OnChainRecord | null;
  anchor: AnchorBundle | null;
  chainSource: 'browser' | 'server' | null;
  server: VerificationResult | null;
  checks: Array<{ label: string; state: CheckState; detail?: string }>;
  note?: string;
}

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

const BATCH_FAILURE_TEXT: Record<Exclude<BatchCheck, 'VALID'>, { verdict: Verdict; detail: string }> = {
  UNKNOWN_BATCH: { verdict: 'NOT_FOUND', detail: 'The referenced batch does not exist on this blockchain.' },
  NOT_IN_BATCH: { verdict: 'TAMPERED', detail: 'The content or signature does not match what was anchored in the batch.' },
  SIGNER_NOT_REGISTERED: { verdict: 'FORGED', detail: 'It was signed by a key that is not a hospital-verified doctor.' },
  DOCTOR_SUSPENDED_AT_ANCHOR_TIME: { verdict: 'FORGED', detail: 'The doctor was suspended when this was recorded.' },
  SIGNATURE_EXPIRED_BEFORE_ANCHOR: { verdict: 'TAMPERED', detail: "The doctor's signature had expired before it was recorded." }
};

async function runVerification(hash: string, uploaded: { document: VerifiableDocument; anchor: AnchorBundle | null } | null): Promise<Outcome> {
  const normalized = hash.toLowerCase();
  const checks: Outcome['checks'] = [];

  const server = await api.verifyRecord(normalized).catch(() => null);
  // Proof bundle: from the uploaded file (works with no server at all), else from the server.
  const anchor = uploaded?.anchor ?? server?.anchor ?? null;

  let direct: OnChainRecord | null = null;
  if (isDirectChainConfigured()) {
    try {
      direct =
        anchor?.mode === 'BATCH' && anchor.proof && anchor.batchId !== null
          ? await readBatchedRecordDirect(normalized, anchor)
          : await readRecordDirect(normalized);
    } catch {
      direct = null;
    }
  }

  // 1. The document itself: uploaded by the user, or served by CarePulse and re-hashed here.
  let document: VerifiableDocument | null = uploaded?.document ?? null;
  let documentOk: boolean | null = uploaded ? true : null;
  if (!document && server?.record?.payload) {
    document = server.record.payload;
    documentOk = (await sha256Hex(canonicalize(document))) === normalized;
  }
  if (uploaded) {
    checks.push({ label: 'Fingerprint computed from your file in this browser', state: 'pass' });
  } else if (documentOk !== null) {
    checks.push({
      label: 'Document content matches its fingerprint (re-hashed in your browser)',
      state: documentOk ? 'pass' : 'fail',
      detail: documentOk ? undefined : 'The server copy of this document has been modified.'
    });
  } else {
    checks.push({ label: 'Document content available', state: 'skip', detail: 'Only the fingerprint was provided.' });
  }

  // 2. The blockchain: read directly from the browser when possible, otherwise via the server.
  const onChain = direct ?? server?.onChain ?? null;
  const chainSource: Outcome['chainSource'] = direct ? 'browser' : onChain ? 'server' : null;
  const via = chainSource === 'browser' ? 'checked directly from your browser' : 'via CarePulse server';
  let batchFailure: { verdict: Verdict; detail: string } | null = null;

  if (onChain) {
    if (onChain.mode === 'BATCH') {
      const ok = onChain.batchCheck === 'VALID';
      checks.push({
        label: `Included in on-chain batch #${onChain.batchId} — Merkle proof and doctor signature verified (${via})`,
        state: ok ? 'pass' : 'fail',
        detail: ok ? undefined : BATCH_FAILURE_TEXT[onChain.batchCheck as Exclude<BatchCheck, 'VALID'>]?.detail
      });
      if (!ok) batchFailure = BATCH_FAILURE_TEXT[onChain.batchCheck as Exclude<BatchCheck, 'VALID'>] ?? BATCH_FAILURE_TEXT.NOT_IN_BATCH;
    } else {
      checks.push({ label: `Fingerprint found on the blockchain (${via})`, state: onChain.exists ? 'pass' : 'fail' });
    }
    if (onChain.exists) {
      checks.push({ label: `Signed by a hospital-verified doctor: ${onChain.doctorName}`, state: 'pass', detail: onChain.doctor });
      checks.push({ label: 'Not revoked by the doctor or hospital', state: onChain.revoked ? 'fail' : 'pass' });
      if (document) {
        const issuerMatches = document.issuer.wallet.toLowerCase() === onChain.doctor.toLowerCase();
        checks.push({ label: 'Doctor named in the document is the one who signed it', state: issuerMatches ? 'pass' : 'fail' });
        if (!issuerMatches) documentOk = false;
      }
      if (!onChain.doctorCurrentlyActive) {
        checks.push({ label: 'Doctor currently active', state: 'skip', detail: 'Suspended since issuing. Records issued before suspension remain valid.' });
      }
    }
  } else {
    checks.push({
      label: 'Blockchain lookup',
      state: 'skip',
      detail: server?.demo ? 'Demo mode: nothing is anchored on-chain.' : 'No blockchain connection available from this page.'
    });
  }

  let verdict: Verdict;
  let verdictDetail: string | undefined;
  if (documentOk === false) verdict = 'TAMPERED';
  else if (batchFailure) {
    verdict = batchFailure.verdict;
    verdictDetail = batchFailure.detail;
  } else if (onChain?.exists && onChain.revoked) verdict = 'REVOKED';
  else if (onChain?.exists) verdict = 'VALID';
  else if (server?.demo) verdict = 'DEMO';
  else if (server?.verdict === 'PENDING') {
    verdict = 'PENDING';
    if (server.nextBatchAt) verdictDetail = `Expected on-chain by about ${new Date(server.nextBatchAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.`;
  } else if (onChain) verdict = 'NOT_FOUND';
  else verdict = 'UNAVAILABLE';

  return { hash: normalized, verdict, verdictDetail, document, onChain, anchor, chainSource, server, checks, note: server?.chainError ?? undefined };
}

function verdictCopy(verdict: Verdict, docName: string) {
  const VERDICTS: Record<Verdict, { title: string; body: string; className: string; Icon: React.ElementType }> = {
    VALID: {
      title: `Authentic ${docName}`,
      body: 'Issued and signed by a verified doctor, recorded on the blockchain, and unchanged since.',
      className: 'border-success/40 bg-success-soft text-success',
      Icon: ShieldCheck
    },
    REVOKED: {
      title: `Revoked — do not accept this ${docName}`,
      body: 'It was genuinely issued but has since been revoked (for example, replaced by a corrected version).',
      className: 'border-danger/40 bg-danger-soft text-danger',
      Icon: ShieldX
    },
    TAMPERED: {
      title: 'Altered document',
      body: 'The content does not match what the doctor signed. Treat it as forged.',
      className: 'border-danger/40 bg-danger-soft text-danger',
      Icon: ShieldX
    },
    FORGED: {
      title: 'Not issued by a verified doctor',
      body: 'This document was not signed by a doctor the hospital had verified at the time.',
      className: 'border-danger/40 bg-danger-soft text-danger',
      Icon: ShieldX
    },
    PENDING: {
      title: 'Awaiting blockchain confirmation',
      body: 'Signed by the doctor and queued for the next on-chain batch. Check again shortly.',
      className: 'border-warning/40 bg-warning-soft text-warning',
      Icon: Clock
    },
    NOT_FOUND: {
      title: 'Not found on the blockchain',
      body: 'No record with this fingerprint was ever issued. If this came from a document, it may have been edited.',
      className: 'border-danger/40 bg-danger-soft text-danger',
      Icon: ShieldAlert
    },
    UNAVAILABLE: {
      title: 'Could not reach the blockchain',
      body: 'Verification is not possible from this page right now.',
      className: 'border-line-strong bg-surface-container text-muted',
      Icon: ShieldAlert
    },
    DEMO: {
      title: 'Demo record (not on-chain)',
      body: 'This site is running without a backend. The fingerprint is real, but it was never written to a blockchain.',
      className: 'border-info/40 bg-info-soft text-info',
      Icon: FlaskConical
    }
  };
  return VERDICTS[verdict];
}

const CheckIcon: React.FC<{ state: CheckState }> = ({ state }) =>
  state === 'pass' ? (
    <CheckCircle2 className="w-4 h-4 text-success shrink-0 mt-0.5" />
  ) : state === 'fail' ? (
    <XCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
  ) : (
    <MinusCircle className="w-4 h-4 text-on-surface-variant shrink-0 mt-0.5" />
  );

const DocumentContents: React.FC<{ document: VerifiableDocument }> = ({ document }) => (
  <>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
      <div>
        <p className="text-on-surface-variant">Doctor</p>
        <p className="text-fg font-semibold">{document.issuer.name}</p>
        <p className="text-on-surface-variant">{document.issuer.specialization}</p>
      </div>
      <div>
        <p className="text-on-surface-variant">Patient</p>
        <p className="text-fg font-semibold">{document.patient.name}</p>
      </div>
      <div>
        <p className="text-on-surface-variant">Visit date</p>
        <p className="text-fg font-semibold">{document.appointment.date}</p>
      </div>
    </div>
    {isCertificate(document) ? (
      <div className="space-y-2">
        <p className="text-xs font-bold text-on-surface-variant font-heading">Medical certificate</p>
        <div className="flex gap-3 items-start bg-surface-container/60 border border-line rounded-xl p-3 text-xs">
          <FileBadge className="w-4 h-4 text-tertiary mt-0.5 shrink-0" />
          <div className="space-y-1">
            <p className="text-fg font-semibold">{CERTIFICATE_LABELS[document.certificate.type]}</p>
            {formatCertificatePeriod(document.certificate) && <p className="text-on-surface-variant">{formatCertificatePeriod(document.certificate)}</p>}
            <p className="text-fg/90">{document.certificate.remarks}</p>
          </div>
        </div>
      </div>
    ) : (
      <div className="space-y-2">
        <p className="text-xs font-bold text-on-surface-variant font-heading">Medications</p>
        {document.medications.length === 0 && <p className="text-xs text-on-surface-variant">No medication prescribed.</p>}
        {document.medications.map((m, i) => (
          <div key={i} className="flex gap-3 items-start bg-surface-container/60 border border-line rounded-xl p-3">
            <Pill className="w-4 h-4 text-tertiary mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="text-fg font-semibold">
                {m.medicineName} <span className="text-on-surface-variant font-normal">· {m.dosage}</span>
              </p>
              <p className="text-on-surface-variant">
                {m.frequency} for {m.durationDays} day{m.durationDays === 1 ? '' : 's'} · {m.instructions}
              </p>
            </div>
          </div>
        ))}
      </div>
    )}
  </>
);

export const VerifyPage: React.FC = () => {
  // Read the QR-code hash once; later URL updates (replaceState below) must not re-trigger verification.
  const [initialHash] = useState(() => new URLSearchParams(window.location.search).get('h') ?? '');
  const [input, setInput] = useState(initialHash);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);

  const verify = useCallback(async (hash: string, uploaded: { document: VerifiableDocument; anchor: AnchorBundle | null } | null = null) => {
    const id = ++requestId.current;
    setError(null);
    setOutcome(null);
    if (!HASH_RE.test(hash)) {
      setLoading(false);
      setError('Enter a 64-character fingerprint starting with 0x, or upload a verifiable document file.');
      return;
    }
    setLoading(true);
    try {
      const result = await runVerification(hash, uploaded);
      if (id !== requestId.current) return; // a newer verification superseded this one
      setOutcome(result);
      const url = new URL(window.location.href);
      url.searchParams.set('h', hash.toLowerCase());
      window.history.replaceState(null, '', url.toString());
    } catch (err) {
      if (id === requestId.current) setError((err as Error).message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialHash) verify(initialHash);
  }, [initialHash, verify]);

  const onFile = async (file?: File) => {
    if (!file) return;
    try {
      const parsed = parseVerifiableFile(await file.text());
      const hash = await sha256Hex(canonicalize(parsed.document));
      setInput(hash);
      await verify(hash, parsed);
    } catch {
      setError('That file is not a valid CarePulse verifiable document (expected the downloaded .json file).');
    }
  };

  const docName = outcome?.document ? (isCertificate(outcome.document) ? 'medical certificate' : 'prescription') : 'document';
  const v = outcome ? verdictCopy(outcome.verdict, docName) : null;
  const contract = outcome?.chainSource === 'browser' ? chainConfig.contractAddress : outcome?.server?.network?.contractAddress;
  const explorerBase = outcome?.chainSource === 'browser' ? chainConfig.explorerUrl : outcome?.server?.network?.explorerUrl;
  const txUrl = outcome?.server?.record?.txUrl ?? explorerTx(outcome?.server?.record?.txHash, explorerBase);

  return (
    <div className="min-h-screen bg-background text-on-background">
      <header className="border-b border-line bg-surface/80 backdrop-blur-xl">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-primary flex items-center justify-center text-on-primary">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="font-heading font-extrabold text-primary leading-tight">CarePulse</p>
              <p className="text-xs text-on-surface-variant">Document Verification</p>
            </div>
          </a>
          <span className="text-xs text-on-surface-variant hidden sm:block">No login required</span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <section className="space-y-2">
          <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-fg">Verify a prescription or certificate</h1>
          <p className="text-sm text-on-surface-variant">
            For pharmacies, employers, insurers and patients. Scan the QR code, paste the fingerprint, or upload the downloaded
            file. The check runs against a public blockchain, so you don't have to trust our servers.
          </p>
        </section>

        <section className="glass-card rounded-2xl p-5 space-y-3">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verify(input.trim());
            }}
            className="flex flex-col sm:flex-row gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="0x… record fingerprint"
              spellCheck={false}
              className="flex-1 min-w-0 bg-surface-container border border-line rounded-xl px-3.5 py-2.5 text-sm text-fg font-mono placeholder:text-on-surface-variant/60 focus:outline-none focus:border-primary"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2.5 rounded-xl bg-primary text-on-primary font-heading font-bold text-sm flex items-center justify-center gap-1.5 disabled:opacity-60"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} Verify
            </button>
          </form>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              onFile(e.dataTransfer.files?.[0]);
            }}
            className="w-full border border-dashed border-line-strong hover:border-primary/50 rounded-xl px-4 py-3 text-xs text-on-surface-variant flex items-center justify-center gap-2 transition-colors"
          >
            <Upload className="w-4 h-4" /> Or drop / choose a verifiable document file (.json)
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
          {error && <p className="text-xs text-danger">{error}</p>}
        </section>

        {loading && (
          <div className="flex items-center justify-center gap-2 text-sm text-on-surface-variant py-8">
            <Loader2 className="w-4 h-4 animate-spin" /> Checking the blockchain…
          </div>
        )}

        {outcome && v && (
          <>
            <section className={`rounded-2xl border p-5 flex gap-4 items-start ${v.className}`}>
              <v.Icon className="w-8 h-8 shrink-0" />
              <div className="space-y-1">
                <h2 className="font-heading font-extrabold text-lg">{v.title}</h2>
                <p className="text-sm text-on-surface/90">{v.body}</p>
                {outcome.verdictDetail && <p className="text-sm font-semibold">{outcome.verdictDetail}</p>}
                {outcome.note && outcome.verdict === 'UNAVAILABLE' && <p className="text-xs opacity-80">{outcome.note}</p>}
              </div>
            </section>

            {outcome.document && (
              <section
                className={`glass-card rounded-2xl p-5 space-y-4 text-sm ${outcome.verdict === 'VALID' ? '' : 'border border-danger/40 opacity-90'}`}
              >
                {outcome.verdict === 'VALID' ? (
                  <p className="text-xs font-bold text-success font-heading flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> Verified contents
                  </p>
                ) : (
                  <p className="text-xs font-bold text-danger font-heading flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" />
                    {outcome.verdict === 'REVOKED'
                      ? `Contents of a revoked ${docName}. Do not use.`
                      : 'Unverified contents. Do not rely on anything shown below.'}
                  </p>
                )}
                <DocumentContents document={outcome.document} />
              </section>
            )}

            <section className="glass-card rounded-2xl p-5 space-y-3">
              <h3 className="font-heading font-bold text-fg text-sm">Checks performed</h3>
              <ul className="space-y-2.5">
                {outcome.checks.map((c, i) => (
                  <li key={i} className="flex gap-2.5 text-xs">
                    <CheckIcon state={c.state} />
                    <div className="min-w-0">
                      <p className="text-fg">{c.label}</p>
                      {c.detail && <p className="text-on-surface-variant break-all">{c.detail}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="glass-card rounded-2xl p-5 text-xs space-y-2">
              <h3 className="font-heading font-bold text-fg text-sm">Technical details</h3>
              <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1.5">
                <dt className="text-on-surface-variant">Fingerprint</dt>
                <dd className="text-fg font-mono break-all">{outcome.hash}</dd>
                {outcome.onChain?.exists && (
                  <>
                    <dt className="text-on-surface-variant">Recorded</dt>
                    <dd className="text-fg">{new Date(outcome.onChain.issuedAt * 1000).toLocaleString()}</dd>
                    <dt className="text-on-surface-variant">Doctor wallet</dt>
                    <dd className="text-fg font-mono break-all">
                      {explorerAddress(outcome.onChain.doctor, explorerBase) ? (
                        <a className="text-primary hover:underline" href={explorerAddress(outcome.onChain.doctor, explorerBase)!} target="_blank" rel="noreferrer">
                          {outcome.onChain.doctor}
                        </a>
                      ) : (
                        outcome.onChain.doctor
                      )}
                    </dd>
                  </>
                )}
                {outcome.onChain?.mode === 'BATCH' && (
                  <>
                    <dt className="text-on-surface-variant">Anchoring</dt>
                    <dd className="text-fg">
                      Merkle batch #{outcome.onChain.batchId}
                      {outcome.anchor?.proof ? ` · proof of ${outcome.anchor.proof.length} hash${outcome.anchor.proof.length === 1 ? '' : 'es'}` : ''}
                    </dd>
                  </>
                )}
                {contract && (
                  <>
                    <dt className="text-on-surface-variant">Registry contract</dt>
                    <dd className="text-fg font-mono break-all">
                      {explorerAddress(contract, explorerBase) ? (
                        <a className="text-primary hover:underline" href={explorerAddress(contract, explorerBase)!} target="_blank" rel="noreferrer">
                          {contract}
                        </a>
                      ) : (
                        contract
                      )}
                    </dd>
                    <dt className="text-on-surface-variant">Network</dt>
                    <dd className="text-fg">
                      {networkName(outcome.chainSource === 'browser' ? chainConfig.chainId : outcome.server?.network?.chainId)}
                    </dd>
                  </>
                )}
                {outcome.server?.record?.txHash && (
                  <>
                    <dt className="text-on-surface-variant">Transaction</dt>
                    <dd className="text-fg font-mono">
                      {txUrl ? (
                        <a className="text-primary hover:underline inline-flex items-center gap-1" href={txUrl} target="_blank" rel="noreferrer">
                          {shortHash(outcome.server.record.txHash, 10, 8)} <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        shortHash(outcome.server.record.txHash, 10, 8)
                      )}
                    </dd>
                  </>
                )}
              </dl>
              <p className="text-on-surface-variant pt-2 leading-relaxed">
                Only this fingerprint is stored on the blockchain. It is a salted SHA-256 hash of the document, so it can be proven
                authentic without its contents ever being made public.
              </p>
            </section>
          </>
        )}
      </main>
    </div>
  );
};
