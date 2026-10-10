import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { Icon } from './Icon';
import { ThemeToggle } from './ThemeToggle';

interface TopAppBarProps {
  searchQuery?: string;
  onSearchChange?: (val: string) => void;
  title?: string;
  onOpenAIInsights?: () => void;
}

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'appointment' | 'medication' | 'system' | 'ai';
  read: boolean;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  searchQuery = '',
  onSearchChange,
  title = 'CarePulse',
  onOpenAIInsights
}) => {
  const { user } = useAuth();
  const [showNotifications, setShowNotifications] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Role-tailored initial notifications
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => {
    if (user?.role === 'DOCTOR') {
      return [
        {
          id: '1',
          title: 'AI Pre-Visit Triage Ready',
          message: 'Patient Rahul Sharma chief complaint synthesized with 3 diagnostic questions.',
          time: '5m ago',
          type: 'ai',
          read: false
        },
        {
          id: '2',
          title: 'Appointment Booked',
          message: 'Confirmed slot for 11:00 AM today (Room 102).',
          time: '25m ago',
          type: 'appointment',
          read: false
        },
        {
          id: '3',
          title: 'Google Calendar Synced',
          message: 'Real-time two-way synchronization active for today’s schedule.',
          time: '1h ago',
          type: 'system',
          read: true
        }
      ];
    } else if (user?.role === 'ADMIN') {
      return [
        {
          id: '1',
          title: 'Audit Trail Telemetry',
          message: 'New outbound booking confirmation dispatched successfully.',
          time: '2m ago',
          type: 'system',
          read: false
        },
        {
          id: '2',
          title: 'Anti-Collision Hold Engine',
          message: '10-Minute slot mutex lock successfully resolved.',
          time: '18m ago',
          type: 'appointment',
          read: false
        },
        {
          id: '3',
          title: 'Automated Cron Worker',
          message: 'Prescription adherence verification cycle executed normally.',
          time: '45m ago',
          type: 'system',
          read: true
        }
      ];
    } else {
      return [
        {
          id: '1',
          title: 'Prescription Medication Alarm',
          message: 'Scheduled reminder for Metoprolol 25mg (Twice daily).',
          time: '10m ago',
          type: 'medication',
          read: false
        },
        {
          id: '2',
          title: 'Appointment Confirmed',
          message: 'Your consultation with Dr. Amit Verma is confirmed with Google Calendar link.',
          time: '30m ago',
          type: 'appointment',
          read: false
        },
        {
          id: '3',
          title: 'AI Symptom Assessment',
          message: 'Your intake was stratified as LOW URGENCY. Doctor has been briefed.',
          time: '1h ago',
          type: 'ai',
          read: true
        }
      ];
    }
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };
    if (showNotifications) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showNotifications]);

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const removeNotification = (id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const getIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'appointment':
        return <Icon name="calendar_month" className="text-primary text-base" />;
      case 'medication':
        return <Icon name="alarm_on" className="text-tertiary text-base" />;
      case 'ai':
        return <Icon name="psychiatry" className="text-secondary text-base" />;
      default:
        return <Icon name="info" className="text-on-surface-variant text-base" />;
    }
  };

  return (
    <header className="fixed top-0 right-0 left-0 md:left-64 flex justify-between items-center gap-3 px-4 sm:px-6 h-16 z-30 bg-surface/90 backdrop-blur border-b border-line">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <div className="relative w-full max-w-md hidden sm:block">
          <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-subtle text-base" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange && onSearchChange(e.target.value)}
            placeholder="Search patients, records, doctors"
            aria-label="Search"
            className="field rounded-full py-2 pl-10"
          />
        </div>
        <span className="font-heading font-extrabold text-base text-fg sm:hidden truncate">{title}</span>
      </div>

      <div className="flex items-center gap-1">
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors relative ${
              showNotifications ? 'bg-primary/10 text-primary' : 'text-muted hover:text-fg hover:bg-surface-container'
            }`}
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
            aria-expanded={showNotifications}
          >
            <Icon name="notifications" className="text-lg" />
            {unreadCount > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-primary rounded-full ring-2 ring-surface" />}
          </button>

          {showNotifications && (
            <div className="absolute right-0 top-full mt-2 w-[min(22rem,calc(100vw-2rem))] bg-surface border border-line rounded-2xl shadow-pop overflow-hidden z-50 animate-fade-in">
              <div className="px-4 py-3 border-b border-line flex items-center justify-between">
                <span className="font-heading font-bold text-sm text-fg">
                  Notifications{unreadCount > 0 && <span className="ml-2 text-xs font-semibold text-primary">{unreadCount} new</span>}
                </span>
                {unreadCount > 0 && (
                  <button onClick={markAllAsRead} className="text-xs text-primary hover:underline font-semibold">
                    Mark all as read
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-line">
                {notifications.length === 0 ? (
                  <div className="py-10 px-6 text-center text-muted space-y-2">
                    <Icon name="notifications_off" className="text-2xl text-subtle" />
                    <p className="text-sm">You're all caught up.</p>
                  </div>
                ) : (
                  notifications.map((item) => (
                    <div key={item.id} className={`px-4 py-3 flex items-start gap-3 relative group ${item.read ? '' : 'bg-primary/[0.04]'}`}>
                      <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center shrink-0">{getIcon(item.type)}</div>
                      <div className="flex-1 min-w-0 pr-5">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-semibold text-fg truncate">{item.title}</p>
                          <span className="text-xs text-subtle shrink-0">{item.time}</span>
                        </div>
                        <p className="text-xs text-muted mt-0.5 leading-relaxed line-clamp-2">{item.message}</p>
                      </div>
                      {!item.read && <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-primary" aria-label="Unread" />}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeNotification(item.id);
                        }}
                        className="absolute right-2 top-2.5 p-1 text-subtle hover:text-danger rounded opacity-0 group-hover:opacity-100 focus:opacity-100"
                        aria-label={`Dismiss ${item.title}`}
                      >
                        <Icon name="close" className="text-sm" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button
          onClick={onOpenAIInsights}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover:text-primary hover:bg-surface-container transition-colors"
          aria-label="AI assistant"
          title="AI assistant"
        >
          <Icon name="auto_awesome" className="text-lg" />
        </button>

        <ThemeToggle className="text-muted hover:text-fg hover:bg-surface-container" />

        <div className="flex items-center gap-2.5 ml-1 pl-3 border-l border-line">
          <div className="w-8 h-8 rounded-full bg-primary-soft text-on-primary-soft flex items-center justify-center font-heading font-bold text-sm">
            {user?.name?.charAt(0) || 'U'}
          </div>
          <div className="hidden lg:block text-left">
            <p className="text-sm font-semibold text-fg leading-tight truncate max-w-[140px]">{user?.name}</p>
            <p className="text-xs text-muted capitalize">{user?.role === 'ADMIN' ? 'Clinic admin' : user?.role?.toLowerCase()}</p>
          </div>
        </div>
      </div>
    </header>
  );
};
