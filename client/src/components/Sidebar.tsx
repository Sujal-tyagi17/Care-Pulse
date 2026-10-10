import React from 'react';
import { Activity, LogOut, Sparkles } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Icon } from './Icon';
import { linkProps } from '../lib/router';
import { UserRole } from '../types';

interface SidebarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onOpenAIInsights?: () => void;
  /** Kept for compatibility; navigation is now defined per role below. */
  extraItems?: Array<{ label: string; icon: string }>;
}

/** Tab keys stay the same as the dashboards' state; labels describe what each role actually finds there. */
const NAV: Record<UserRole, Array<{ key: string; label: string; short: string; icon: string }>> = {
  PATIENT: [
    { key: 'Dashboard', label: 'Home', short: 'Home', icon: 'dashboard' },
    { key: 'Schedule', label: 'Appointments', short: 'Visits', icon: 'calendar_today' },
    { key: 'Records', label: 'Medications', short: 'Meds', icon: 'medication' }
  ],
  DOCTOR: [
    { key: 'Dashboard', label: 'Today', short: 'Today', icon: 'dashboard' },
    { key: 'Schedule', label: 'Schedule', short: 'Schedule', icon: 'calendar_today' },
    { key: 'Records', label: 'Completed visits', short: 'Visits', icon: 'clinical_notes' },
    { key: 'Settings', label: 'Profile', short: 'Profile', icon: 'account_circle' }
  ],
  ADMIN: [
    { key: 'Dashboard', label: 'Overview', short: 'Overview', icon: 'dashboard' },
    { key: 'Schedule', label: 'Doctors and leave', short: 'Doctors', icon: 'group' },
    { key: 'Records', label: 'Notifications', short: 'Notices', icon: 'mail' },
    { key: 'Blockchain', label: 'Blockchain', short: 'Chain', icon: 'token' },
    { key: 'Settings', label: 'Settings', short: 'Settings', icon: 'settings' }
  ]
};

export const Sidebar: React.FC<SidebarProps> = ({ activeTab = 'Dashboard', onTabChange, onOpenAIInsights }) => {
  const { user, logout } = useAuth();
  const items = NAV[user?.role ?? 'PATIENT'];
  const isActive = (key: string) => activeTab.toLowerCase() === key.toLowerCase();

  return (
    <>
      {/* Desktop sidebar */}
      <nav className="fixed left-0 top-0 h-full w-64 z-40 hidden md:flex flex-col bg-surface border-r border-line" aria-label="Main">
        <a {...linkProps('/')} className="flex items-center gap-2.5 px-5 h-16 border-b border-line">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-on-primary">
            <Activity className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="font-heading text-lg font-extrabold">CarePulse</span>
        </a>

        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {items.map((item) => (
            <button
              key={item.key}
              onClick={() => onTabChange?.(item.key)}
              aria-current={isActive(item.key) ? 'page' : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-left transition-colors ${
                isActive(item.key) ? 'bg-primary/10 text-primary' : 'text-muted hover:text-fg hover:bg-surface-container'
              }`}
            >
              <Icon name={item.icon} className="text-lg" />
              {item.label}
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-line space-y-2">
          <button
            onClick={onOpenAIInsights}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold text-muted hover:text-primary hover:bg-surface-container transition-colors"
          >
            <Sparkles className="h-[18px] w-[18px]" aria-hidden="true" />
            AI insights
          </button>
          <div className="flex items-center justify-between gap-2 rounded-xl bg-surface-container px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{user?.name}</p>
              <p className="text-xs text-muted">{user?.role === 'ADMIN' ? 'Clinic admin' : user?.role === 'DOCTOR' ? 'Doctor' : 'Patient'}</p>
            </div>
            <button onClick={logout} aria-label="Sign out" title="Sign out" className="p-2 rounded-lg text-muted hover:text-danger hover:bg-danger-soft">
              <LogOut className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 bg-surface/95 backdrop-blur border-t border-line flex pb-[env(safe-area-inset-bottom)]"
        aria-label="Main"
      >
        {items.map((item) => (
          <button
            key={item.key}
            onClick={() => onTabChange?.(item.key)}
            aria-current={isActive(item.key) ? 'page' : undefined}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors ${
              isActive(item.key) ? 'text-primary' : 'text-muted'
            }`}
          >
            <Icon name={item.icon} className="text-xl" />
            {item.short}
          </button>
        ))}
        <button onClick={logout} className="flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-muted" aria-label="Sign out">
          <LogOut className="h-5 w-5" aria-hidden="true" />
          Sign out
        </button>
      </nav>
    </>
  );
};
