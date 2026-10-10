import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CalendarCheck,
  Stethoscope,
  QrCode,
  Brain,
  LockKeyhole,
  BellRing,
  Award,
  Link2,
  EyeOff,
  Fingerprint,
  Blocks,
  Github,
  Loader2,
  User,
  ShieldCheck,
  ArrowDown
} from 'lucide-react';
import { PrescriptionSlip } from '../components/landing/PrescriptionSlip';
import { TamperDemo } from '../components/landing/TamperDemo';
import { ORIGINAL_RX, fingerprintOf } from '../components/landing/sample';
import { useTheme } from '../context/ThemeContext';
import { ThemeToggle } from '../components/ThemeToggle';
import { useAuth } from '../context/AuthContext';
import { linkProps, navigate } from '../lib/router';
import { UserRole } from '../types';

const REPO_URL = 'https://github.com/Sujal-tyagi17/Healthcare-Appointment';

/** Deterministic pseudo-hashes for the drifting ledger behind the hero. */
function ledgerLines(count: number, seed: number) {
  let x = seed;
  const hex = () => {
    let s = '0x';
    for (let i = 0; i < 40; i++) {
      x = (x * 1103515245 + 12345) & 0x7fffffff;
      s += ((x >>> 16) % 16).toString(16);
    }
    return s;
  };
  return Array.from({ length: count }, hex);
}

const STEPS = [
  {
    Icon: CalendarCheck,
    title: 'Book',
    body: 'Pick a doctor and a time. The slot is held for you for 10 minutes while you describe your symptoms.'
  },
  {
    Icon: Stethoscope,
    title: 'Consult',
    body: 'Your doctor reads an AI summary of your symptoms, then writes the prescription and signs it with their verified key.'
  },
  {
    Icon: QrCode,
    title: 'Verify anywhere',
    body: 'Show the QR code at any pharmacy. They check it against a public blockchain, with no account and no phone call.'
  }
];

const ROLES: Array<{ key: 'patient' | 'doctor' | 'admin'; title: string; body: string; points: string[] }> = [
  {
    key: 'patient',
    title: 'For patients',
    body: 'Book in under a minute and leave with documents you can prove are real.',
    points: ['Live availability with 10-minute slot holds', 'Plain-language care plan after every visit', 'Medication reminders by email', 'Prescriptions and certificates with QR verification']
  },
  {
    key: 'doctor',
    title: 'For doctors',
    body: 'Walk into each consultation already knowing why the patient came.',
    points: ['AI pre-visit brief with urgency and questions to ask', 'Prescriptions signed with your verified key', 'Sick-leave and fitness certificates in a few clicks']
  },
  {
    key: 'admin',
    title: 'For clinics',
    body: 'Run the schedule, and keep a record of it nobody can quietly rewrite.',
    points: ['Verify or suspend doctors on-chain', 'Leave management with automatic patient notices', 'Audit log checked against blockchain checkpoints']
  }
];

const FEATURES = [
  { Icon: Brain, title: 'AI symptom triage', body: 'Patients describe symptoms in their own words; the doctor gets an urgency level, a chief complaint, and questions worth asking.' },
  { Icon: LockKeyhole, title: '10-minute slot holds', body: "A chosen slot is locked while the patient finishes booking, so two people can't book the same time." },
  { Icon: BellRing, title: 'Medication reminders', body: 'Reminders go out at the times each prescription calls for, and patients can pause them any time.' },
  { Icon: Award, title: 'Verifiable medical certificates', body: 'Sick-leave, fitness and visit certificates that an employer or college can check by scanning a QR code.' },
  { Icon: Link2, title: 'Tamper-evident audit log', body: 'Every booking, cancellation and record is chained by hash and checkpointed on-chain, so edited history is caught.' }
];

const TRUST = [
  { Icon: EyeOff, title: 'No patient data on-chain', body: 'Only a fingerprint is published. Names, medicines and notes stay in the clinic database.' },
  { Icon: Fingerprint, title: 'Salted fingerprints', body: 'A random salt in every record means short prescriptions can’t be guessed back from their hash.' },
  { Icon: Blocks, title: 'Anchored on Polygon', body: 'Records are batched into Merkle trees, so one transaction covers hundreds of documents.' },
  { Icon: Github, title: 'Open-source contract', body: 'The MedicalRegistry contract and its tests are public, so anyone can check how verification works.', href: `${REPO_URL}/blob/main/blockchain/contracts/MedicalRegistry.sol` }
];

const DEMO_ACCOUNTS: Array<{ role: UserRole; label: string; name: string; email: string; password: string; note: string }> = [
  { role: 'PATIENT', label: 'Patient', name: 'Rahul Sharma', email: 'rahul@example.com', password: 'password123', note: 'Book a visit and open your verifiable prescription.' },
  { role: 'DOCTOR', label: 'Doctor', name: 'Dr. Rajesh Sharma', email: 'dr.rajesh@carepulse.com', password: 'doctor123', note: 'Run a consultation and issue a certificate.' },
  { role: 'ADMIN', label: 'Clinic admin', name: 'Clinic Administrator', email: 'admin@carepulse.com', password: 'admin123', note: 'Verify doctors and check the audit log.' }
];

export const LandingPage: React.FC = () => {
  const { theme } = useTheme();
  const { switchDemoUser } = useAuth();
  const [fingerprint, setFingerprint] = useState<string | null>(null);
  const [signingIn, setSigningIn] = useState<UserRole | null>(null);
  const [demoError, setDemoError] = useState<string | null>(null);
  const ledger = useMemo(() => [ledgerLines(28, 7), ledgerLines(28, 91), ledgerLines(28, 333)], []);

  useEffect(() => {
    fingerprintOf(ORIGINAL_RX).then(setFingerprint);
  }, []);

  const tryDemo = async (role: UserRole) => {
    setSigningIn(role);
    setDemoError(null);
    try {
      await switchDemoUser(role);
      navigate('/');
    } catch (err) {
      setDemoError((err as Error).message || 'Could not start the demo. Try again.');
    } finally {
      setSigningIn(null);
    }
  };

  return (
    <div className="min-h-screen bg-background text-fg">
      {/* Navigation */}
      <header className="absolute inset-x-0 top-0 z-30">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 py-5 text-[#E5EEEB]" aria-label="Main">
          <a {...linkProps('/')} className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F766E] text-white">
              <Activity className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="font-heading text-lg font-extrabold tracking-tight">CarePulse</span>
          </a>
          <div className="hidden md:flex items-center gap-7 text-sm text-[#B8C9C4]">
            <a href="#how" className="hover:text-white">How it works</a>
            <a href="#tamper" className="hover:text-white">Try to forge one</a>
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#demo" className="hover:text-white">Demo</a>
          </div>
          <div className="flex items-center gap-1.5">
            <ThemeToggle className="text-[#B8C9C4] hover:bg-white/10 hover:text-white" />
            <a {...linkProps('/login')} className="rounded-lg px-3.5 py-2 text-sm font-semibold text-white ring-1 ring-white/25 hover:bg-white/10">
              Sign in
            </a>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-[#0B1513] text-[#E5EEEB] dark:bg-[#0E1A18] dark:border-b dark:border-line">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 hidden lg:flex w-1/2 justify-end gap-10 pr-4 opacity-[0.08] [mask-image:linear-gradient(to_bottom,transparent,black_20%,black_80%,transparent)]"
        >
          {ledger.map((col, ci) => (
            <div key={ci} className="ledger-drift font-mono text-[11px] leading-[22px] text-[#5EEAD4] hidden sm:block" style={{ animationDuration: `${70 + ci * 18}s` }}>
              {[...col, ...col].map((h, i) => (
                <div key={i}>{h}</div>
              ))}
            </div>
          ))}
        </div>

        <div className="relative mx-auto grid max-w-6xl gap-14 px-4 sm:px-6 pt-32 pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:pt-40 lg:pb-28">
          <div>
            <h1 className="font-heading text-[2.6rem] leading-[1.05] font-extrabold tracking-tight sm:text-6xl lg:text-[4.25rem]">
              Prescriptions anyone can verify.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[#B8C9C4]">
              CarePulse books your appointment, prepares your doctor, and signs every prescription and medical certificate on a public
              blockchain. A pharmacy can check it in seconds without calling the clinic.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <a href="#demo" className="btn bg-[#2DD4BF] text-[#042F2B] hover:bg-[#5EEAD4] px-5 py-3 text-[15px]">
                Try the demo
              </a>
              <a {...linkProps('/verify')} className="btn px-5 py-3 text-[15px] text-white ring-1 ring-white/25 hover:bg-white/10">
                <QrCode className="h-4 w-4" aria-hidden="true" />
                Verify a document
              </a>
            </div>
            <p className="mt-10 flex items-center gap-2 text-sm text-[#8FA39E]">
              <ShieldCheck className="h-4 w-4 text-[#4ADE80]" aria-hidden="true" />
              No patient data ever goes on-chain, only a fingerprint.
            </p>
          </div>

          <div className="flex justify-center lg:justify-end pb-4">
            <PrescriptionSlip rx={ORIGINAL_RX} fingerprint={fingerprint} animated />
          </div>
        </div>
      </section>

      {/* 1. How it works */}
      <section id="how" className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-24 scroll-mt-8">
        <h2 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight max-w-xl">From booking to a document you can prove</h2>
        <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8 relative">
          <span aria-hidden="true" className="hidden md:block absolute top-5 left-[calc(16.66%+20px)] right-[calc(16.66%+20px)] h-px bg-line-strong" />
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative">
              <div className="flex items-center gap-3 md:flex-col md:items-start">
                <span className="relative z-10 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-on-primary font-heading font-bold">
                  {i + 1}
                </span>
                <h3 className="font-heading text-xl font-bold flex items-center gap-2">
                  <s.Icon className="h-5 w-5 text-primary" aria-hidden="true" />
                  {s.title}
                </h3>
              </div>
              <p className="mt-3 text-muted leading-relaxed max-w-sm">{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* 2. Tamper demo */}
      <section id="tamper" className="border-y border-line bg-surface-container-low scroll-mt-8">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-24">
          <div className="max-w-2xl mb-10">
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">Try to forge it</h2>
            <p className="mt-4 text-lg text-muted leading-relaxed">
              Here's the same prescription. Change a dose, a day, or the patient's name, and watch the check fail. The fingerprint is
              calculated in your browser with the same code CarePulse uses.
            </p>
          </div>
          <TamperDemo />
        </div>
      </section>

      {/* 3. Roles */}
      <section className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-24">
        <h2 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight max-w-xl">One visit, three people, one shared record</h2>
        <div className="mt-14 space-y-20">
          {ROLES.map((r, i) => (
            <div key={r.key} className={`grid gap-8 lg:gap-14 lg:grid-cols-[0.85fr_1.15fr] lg:items-center ${i % 2 ? 'lg:[&>*:first-child]:order-2 lg:grid-cols-[1.15fr_0.85fr]' : ''}`}>
              <div>
                <h3 className="font-heading text-2xl font-bold">{r.title}</h3>
                <p className="mt-3 text-lg text-muted leading-relaxed">{r.body}</p>
                <ul className="mt-5 space-y-2.5">
                  {r.points.map((p) => (
                    <li key={p} className="flex gap-2.5">
                      <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <figure className="overflow-hidden rounded-2xl border border-line bg-surface shadow-pop">
                <img
                  src={`/landing/${r.key}-${theme}.webp`}
                  alt={`CarePulse ${r.title.replace('For ', '')} view`}
                  loading="lazy"
                  className="w-full h-auto block"
                  width={1440}
                  height={900}
                />
              </figure>
            </div>
          ))}
        </div>
      </section>

      {/* 4. Features */}
      <section id="features" className="border-t border-line scroll-mt-8">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 sm:px-6 py-20 sm:py-24 lg:grid-cols-[0.8fr_1.2fr]">
          <div className="lg:sticky lg:top-10 self-start">
            <h2 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">Everything a small clinic runs on</h2>
            <p className="mt-4 text-lg text-muted leading-relaxed">
              The blockchain part is one feature among many. The rest is what makes appointments run on time.
            </p>
          </div>
          <ul className="divide-y divide-line border-y border-line">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-5 py-6">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-on-primary-soft">
                  <f.Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <h3 className="font-heading text-lg font-bold">{f.title}</h3>
                  <p className="mt-1 text-muted leading-relaxed">{f.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* 5. Trust strip */}
      <section className="bg-[#0B1513] text-[#E5EEEB] dark:bg-surface dark:border-y dark:border-line">
        <div className="mx-auto grid max-w-6xl gap-px overflow-hidden px-4 sm:px-6 py-16 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map((t) => {
            const body = (
              <>
                <t.Icon className="h-6 w-6 text-[#4ADE80]" aria-hidden="true" />
                <h3 className="mt-4 font-heading text-lg font-bold">{t.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-[#9AACA7]">{t.body}</p>
              </>
            );
            return t.href ? (
              <a key={t.title} href={t.href} target="_blank" rel="noreferrer" className="p-6 hover:bg-white/[0.04] rounded-xl">
                {body}
              </a>
            ) : (
              <div key={t.title} className="p-6">
                {body}
              </div>
            );
          })}
        </div>
      </section>

      {/* 6. Demo logins */}
      <section id="demo" className="mx-auto max-w-6xl px-4 sm:px-6 py-20 sm:py-24 scroll-mt-8">
        <div className="max-w-2xl">
          <h2 className="font-heading text-3xl sm:text-4xl font-extrabold tracking-tight">Try it with a demo account</h2>
          <p className="mt-4 text-lg text-muted leading-relaxed">
            Each account is already set up. Sign in as one, then switch roles to see the same visit from the other side.
          </p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {DEMO_ACCOUNTS.map((a) => (
            <div key={a.role} className="card rounded-2xl p-6 flex flex-col">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft">
                  <User className="h-5 w-5" aria-hidden="true" />
                </span>
                <div>
                  <p className="font-heading font-bold">{a.label}</p>
                  <p className="text-sm text-muted">{a.name}</p>
                </div>
              </div>
              <p className="mt-4 text-muted">{a.note}</p>
              <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-subtle">Email</dt>
                <dd className="font-mono text-[13px] break-all">{a.email}</dd>
                <dt className="text-subtle">Password</dt>
                <dd className="font-mono text-[13px]">{a.password}</dd>
              </dl>
              <button type="button" onClick={() => tryDemo(a.role)} disabled={!!signingIn} className="btn btn-primary mt-6 w-full">
                {signingIn === a.role && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Sign in as {a.label.toLowerCase()}
              </button>
            </div>
          ))}
        </div>
        {demoError && <p className="mt-4 text-sm text-danger">{demoError}</p>}
        <p className="mt-6 text-muted">
          Prefer your own account?{' '}
          <a {...linkProps('/login?mode=register')} className="font-semibold text-primary hover:underline">
            Create one
          </a>
          .
        </p>
      </section>

      {/* 7. Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 sm:px-6 py-12 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <a {...linkProps('/')} className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-on-primary">
                <Activity className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="font-heading font-extrabold">CarePulse</span>
            </a>
            <p className="mt-3 text-sm text-muted leading-relaxed">
              Appointments, AI-assisted consultations, and prescriptions anyone can verify. Built by{' '}
              <a href="https://github.com/Sujal-tyagi17" target="_blank" rel="noreferrer" className="text-fg hover:text-primary">
                Sujal Tyagi
              </a>
              .
            </p>
          </div>
          <nav className="grid grid-cols-2 gap-x-12 gap-y-2 text-sm" aria-label="Footer">
            <a {...linkProps('/verify')} className="text-muted hover:text-fg">Verify a document</a>
            <a {...linkProps('/login')} className="text-muted hover:text-fg">Sign in</a>
            <a href="#how" className="text-muted hover:text-fg">How it works</a>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-muted hover:text-fg">Source on GitHub</a>
          </nav>
        </div>
        <div className="border-t border-line">
          <p className="mx-auto max-w-6xl px-4 sm:px-6 py-5 text-[13px] text-subtle flex items-center gap-2">
            <ArrowDown className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
            <a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="hover:text-fg">
              Back to top
            </a>
            <span className="ml-auto">© {new Date().getFullYear()} CarePulse. A portfolio project, not a medical service.</span>
          </p>
        </div>
      </footer>
    </div>
  );
};

