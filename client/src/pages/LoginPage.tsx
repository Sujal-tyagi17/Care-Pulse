import React, { useState } from 'react';
import { Activity, ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { linkProps, navigate } from '../lib/router';
import { ThemeToggle } from '../components/ThemeToggle';

type Role = 'PATIENT' | 'DOCTOR' | 'ADMIN';

const ROLE_LABELS: Record<Role, string> = { PATIENT: 'Patient', DOCTOR: 'Doctor', ADMIN: 'Clinic admin' };

export const LoginPage: React.FC = () => {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<'signin' | 'register'>(() =>
    new URLSearchParams(window.location.search).get('mode') === 'register' ? 'register' : 'signin'
  );
  const [role, setRole] = useState<Role>('PATIENT');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [specialization, setSpecialization] = useState('General Medicine');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const switchMode = (m: 'signin' | 'register') => {
    setMode(m);
    setError(null);
    window.history.replaceState(null, '', m === 'register' ? '/login?mode=register' : '/login');
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === 'register' && password.length < 6) return setError('Use a password with at least 6 characters.');
    setLoading(true);
    try {
      if (mode === 'signin') {
        await login(email.trim(), password);
      } else {
        await register({
          name: name.trim(),
          email: email.trim(),
          password,
          role,
          phone: phone.trim() || undefined,
          ...(role === 'DOCTOR' ? { specialization } : {})
        } as Parameters<typeof register>[0]);
      }
      navigate('/');
    } catch (err) {
      setError((err as Error).message || 'Sign-in failed. Check your email and password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-[0.9fr_1.1fr] bg-background text-fg">
      {/* Brand panel */}
      <aside className="relative hidden lg:flex flex-col justify-between bg-[#0B1513] text-[#E5EEEB] p-12 dark:bg-[#0E1A18] dark:border-r dark:border-line">
        <a {...linkProps('/')} className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F766E] text-white">
            <Activity className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="font-heading text-lg font-extrabold">CarePulse</span>
        </a>
        <div className="max-w-md">
          <p className="font-heading text-4xl font-extrabold leading-tight tracking-tight">Every prescription you get here can be checked by any pharmacy.</p>
          <p className="mt-5 flex items-start gap-2.5 text-[#9AACA7] leading-relaxed">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#4ADE80]" aria-hidden="true" />
            Your doctor signs it, a fingerprint goes on a public blockchain, and your details stay private.
          </p>
        </div>
        <p className="text-sm text-[#8FA39E]">
          Just looking around?{' '}
          <a href="/#demo" className="font-semibold text-[#5EEAD4] hover:underline">
            Use a demo account
          </a>
        </p>
      </aside>

      {/* Form */}
      <main className="flex flex-col">
        <div className="flex items-center justify-between px-5 sm:px-8 py-5">
          <a {...linkProps('/')} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to home
          </a>
          <ThemeToggle className="text-muted hover:bg-surface-container hover:text-fg" />
        </div>

        <div className="flex flex-1 items-center justify-center px-5 sm:px-8 pb-16">
          <div className="w-full max-w-[420px]">
            <h1 className="font-heading text-3xl font-extrabold tracking-tight">{mode === 'signin' ? 'Sign in' : 'Create your account'}</h1>
            <p className="mt-2 text-muted">
              {mode === 'signin' ? 'Welcome back. Sign in to see your appointments and records.' : 'It takes a minute. You can book right after.'}
            </p>

            <div className="mt-8 grid grid-cols-2 rounded-xl bg-surface-container p-1 text-sm font-semibold" role="tablist" aria-label="Sign in or register">
              {(['signin', 'register'] as const).map((m) => (
                <button
                  key={m}
                  role="tab"
                  aria-selected={mode === m}
                  type="button"
                  onClick={() => switchMode(m)}
                  className={`rounded-lg py-2 transition-colors ${mode === m ? 'bg-surface text-fg shadow-card' : 'text-muted hover:text-fg'}`}
                >
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4" noValidate>
              {mode === 'register' && (
                <>
                  <fieldset>
                    <legend className="mb-2 text-sm font-medium">I'm a</legend>
                    <div className="grid grid-cols-3 gap-2">
                      {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                        <button
                          key={r}
                          type="button"
                          aria-pressed={role === r}
                          onClick={() => setRole(r)}
                          className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                            role === r ? 'border-primary bg-primary/10 text-primary' : 'border-line-strong text-muted hover:text-fg'
                          }`}
                        >
                          {ROLE_LABELS[r]}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">Full name</span>
                    <input className="field" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Ananya Iyer" autoComplete="name" />
                  </label>
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium">
                      Phone <span className="text-subtle font-normal">(optional)</span>
                    </span>
                    <input className="field" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" autoComplete="tel" type="tel" />
                  </label>
                  {role === 'DOCTOR' && (
                    <label className="block space-y-1.5">
                      <span className="text-sm font-medium">Specialization</span>
                      <input className="field" value={specialization} onChange={(e) => setSpecialization(e.target.value)} placeholder="Dermatology" />
                    </label>
                  )}
                </>
              )}
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Email</span>
                <input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="email" />
              </label>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">Password</span>
                <input
                  className="field"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
              </label>

              {error && (
                <p className="rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-2.5 text-sm text-danger" role="alert">
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading} className="btn btn-primary w-full py-3 text-[15px]">
                {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {mode === 'signin' ? 'Sign in' : 'Create account'}
              </button>
            </form>

            <p className="mt-6 text-sm text-muted lg:hidden">
              Just looking around?{' '}
              <a href="/#demo" className="font-semibold text-primary hover:underline">
                Use a demo account
              </a>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};
