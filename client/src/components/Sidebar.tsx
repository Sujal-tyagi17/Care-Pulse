import React from 'react';
import { useAuth } from '../context/AuthContext';

interface SidebarProps {
  activeTab?: string;
  onTabChange?: (tab: string) => void;
  onOpenAIInsights?: () => void;
  extraItems?: Array<{ label: string; icon: string }>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab = 'Dashboard',
  onTabChange,
  onOpenAIInsights,
  extraItems = []
}) => {
  const { user, logout } = useAuth();

  const navItems = [
    { label: 'Dashboard', icon: 'dashboard' },
    { label: 'Schedule', icon: 'calendar_today' },
    { label: 'Records', icon: 'folder_shared' },
    { label: 'Settings', icon: 'settings' },
    ...extraItems
  ];

  return (
    <nav className="fixed left-0 top-0 h-full flex flex-col z-40 bg-surface/95 backdrop-blur-xl border-r border-outline-variant w-64 shadow-sm hidden md:flex transition-colors duration-300">
      {/* Header */}
      <div className="px-6 py-6 flex flex-col gap-1 border-b border-outline-variant">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-container flex items-center justify-center text-white shadow-neon-cyan shrink-0">
            <span className="material-symbols-outlined text-2xl font-bold">vital_signs</span>
          </div>
          <div>
            <h1 className="font-heading font-extrabold text-lg text-primary leading-tight">CarePulse</h1>
            <p className="text-[11px] text-on-surface-variant font-medium">Clinical Intelligence</p>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <div className="flex-1 px-3 py-4 flex flex-col gap-1.5 overflow-y-auto">
        {navItems.map(item => {
          const isActive = activeTab.toLowerCase() === item.label.toLowerCase();
          return (
            <button
              key={item.label}
              onClick={() => onTabChange && onTabChange(item.label)}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-heading text-xs font-bold transition-all duration-200 text-left ${
                isActive
                  ? 'bg-primary/15 border-l-4 border-primary text-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high border-l-4 border-transparent'
              }`}
            >
              <span className="material-symbols-outlined text-lg" style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}>
                {item.icon}
              </span>
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      {/* Role & Footer CTA */}
      <div className="p-4 border-t border-outline-variant space-y-3">
        <button
          onClick={onOpenAIInsights}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-surface-container hover:bg-surface-container-high transition-all duration-200 rounded-xl border border-outline-variant group ai-gradient-border"
        >
          <span className="material-symbols-outlined text-secondary text-base group-hover:scale-110 transition-transform">
            auto_awesome
          </span>
          <span className="font-heading text-xs font-bold gradient-text-ai">AI Insights</span>
        </button>

        <div className="bg-surface-container-low p-2.5 rounded-xl border border-outline-variant flex items-center justify-between">
          <div className="truncate pr-2">
            <span className="text-[10px] font-bold text-primary block uppercase tracking-wider">{user?.role}</span>
            <span className="text-xs text-on-surface font-heading font-semibold truncate block">{user?.name}</span>
          </div>
          <button
            onClick={logout}
            title="Sign Out"
            className="p-1.5 text-on-surface-variant hover:text-error hover:bg-error-container/20 rounded-lg transition-colors"
          >
            <span className="material-symbols-outlined text-base">logout</span>
          </button>
        </div>
      </div>
    </nav>
  );
};
