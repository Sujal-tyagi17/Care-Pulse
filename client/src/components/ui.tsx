import React from 'react';
import { Icon } from './Icon';

/* ---------------------------------------------------------------------------
 * Status badge: one style for every appointment / urgency state in the app.
 * ------------------------------------------------------------------------- */

type Tone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const TONES: Record<Tone, string> = {
  primary: 'bg-primary/10 text-primary border-primary/25',
  success: 'bg-success-soft text-success border-success/30',
  warning: 'bg-warning-soft text-warning border-warning/30',
  danger: 'bg-danger-soft text-danger border-danger/30',
  info: 'bg-info-soft text-info border-info/30',
  neutral: 'bg-surface-container text-muted border-line-strong'
};

const STATUS: Record<string, { label: string; tone: Tone; icon: string }> = {
  BOOKED: { label: 'Booked', tone: 'primary', icon: 'event_available' },
  COMPLETED: { label: 'Completed', tone: 'success', icon: 'check_circle' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', icon: 'event_busy' },
  REQUIRES_RESCHEDULE: { label: 'Needs rescheduling', tone: 'warning', icon: 'event_repeat' },
  HIGH: { label: 'High urgency', tone: 'danger', icon: 'warning' },
  MEDIUM: { label: 'Medium urgency', tone: 'warning', icon: 'warning' },
  LOW: { label: 'Low urgency', tone: 'success', icon: 'check_circle' },
  SENT: { label: 'Sent', tone: 'success', icon: 'mark_email_read' },
  PENDING: { label: 'Pending', tone: 'warning', icon: 'schedule' },
  FAILED: { label: 'Failed', tone: 'danger', icon: 'error' }
};

export const StatusBadge: React.FC<{ status: string; className?: string; label?: string }> = ({ status, className = '', label }) => {
  const s = STATUS[status] ?? { label: status.toLowerCase().replace(/_/g, ' '), tone: 'neutral' as Tone, icon: 'info' };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${TONES[s.tone]} ${className}`}>
      <Icon name={s.icon} className="text-[13px]" />
      {label ?? s.label}
    </span>
  );
};

/* ---------------------------------------------------------------------------
 * Next-up card: the first thing on every dashboard.
 * ------------------------------------------------------------------------- */

export const NextUpCard: React.FC<{
  label: string;
  icon: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
  tone?: 'primary' | 'warning';
}> = ({ label, icon, title, meta, children, actions, tone = 'primary' }) => (
  <section
    className={`rounded-2xl border p-5 sm:p-6 flex flex-col md:flex-row md:items-center gap-5 ${
      tone === 'warning' ? 'border-warning/30 bg-warning-soft/60' : 'border-primary/20 bg-primary/[0.05]'
    }`}
  >
    <span
      className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
        tone === 'warning' ? 'bg-warning text-[rgb(var(--c-bg))]' : 'bg-primary text-on-primary'
      }`}
    >
      <Icon name={icon} className="text-2xl" />
    </span>
    <div className="flex-1 min-w-0">
      <p className={`text-sm font-semibold ${tone === 'warning' ? 'text-warning' : 'text-primary'}`}>{label}</p>
      <h2 className="font-heading text-xl sm:text-2xl font-extrabold text-fg mt-0.5">{title}</h2>
      {meta && <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">{meta}</div>}
      {children}
    </div>
    {actions && <div className="flex flex-wrap gap-2 shrink-0">{actions}</div>}
  </section>
);

export const MetaItem: React.FC<{ icon: string; children: React.ReactNode }> = ({ icon, children }) => (
  <span className="inline-flex items-center gap-1.5">
    <Icon name={icon} className="text-base text-subtle" />
    {children}
  </span>
);

/* ---------------------------------------------------------------------------
 * Empty states and skeletons
 * ------------------------------------------------------------------------- */

export const EmptyState: React.FC<{ icon: string; title: string; body?: string; action?: React.ReactNode; className?: string }> = ({
  icon,
  title,
  body,
  action,
  className = ''
}) => (
  <div className={`card rounded-2xl px-6 py-12 text-center flex flex-col items-center ${className}`}>
    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-container text-muted">
      <Icon name={icon} className="text-2xl" />
    </span>
    <h3 className="mt-4 font-heading text-lg font-bold text-fg">{title}</h3>
    {body && <p className="mt-1.5 max-w-sm text-sm text-muted">{body}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>
);

export const SkeletonRows: React.FC<{ rows?: number; className?: string }> = ({ rows = 3, className = '' }) => (
  <div className={`space-y-3 ${className}`} aria-busy="true" aria-label="Loading">
    {Array.from({ length: rows }, (_, i) => (
      <div key={i} className="card rounded-2xl p-5 flex items-center gap-4">
        <div className="skeleton h-11 w-11 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-4 w-1/3" />
          <div className="skeleton h-3 w-2/3" />
        </div>
        <div className="skeleton h-6 w-20 rounded-full" />
      </div>
    ))}
  </div>
);
