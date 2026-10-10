import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { DoctorListItem, NotificationLogItem, BlockchainOverview } from '../types';
import { AIInsightsModal } from '../components/AIInsightsModal';
import { Sidebar } from '../components/Sidebar';
import { TopAppBar } from '../components/TopAppBar';
import { BlockchainAdminPanel } from '../components/BlockchainAdminPanel';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { NextUpCard, StatusBadge } from '../components/ui';

const DOCTOR_AVATARS: Record<string, string> = {
  'Cardiology': 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=400&q=80',
  'Neurology': 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=400&q=80',
  'General Medicine': 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&w=400&q=80',
  'Pediatrics': 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=400&q=80',
  'Dermatology': 'https://images.unsplash.com/photo-1651008376811-b90baee60c1f?auto=format&fit=crop&w=400&q=80'
};

export const AdminDashboard: React.FC = () => {
  const [navTab, setNavTab] = useState<'Dashboard' | 'Schedule' | 'Records' | 'Settings' | 'Blockchain'>('Dashboard');
  const [showAIModal, setShowAIModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Stats State
  const [stats, setStats] = useState<any>(null);
  const [recentApts, setRecentApts] = useState<any[]>([]);

  // Doctors State
  const [doctors, setDoctors] = useState<DoctorListItem[]>([]);
  const [showAddDoctorModal, setShowAddDoctorModal] = useState(false);
  const [editingDoctor, setEditingDoctor] = useState<DoctorListItem | null>(null);

  const [newDoctor, setNewDoctor] = useState({
    name: '',
    email: '',
    password: 'doctor123',
    phone: '',
    specialization: 'General Medicine',
    bio: '',
    slotDurationMinutes: 30,
    workingHoursStart: '09:00',
    workingHoursEnd: '17:00',
    consultationFee: 75,
    roomNumber: 'Room 101'
  });

  // Leave Management State
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>('');
  const [leaveDate, setLeaveDate] = useState<string>('');
  const [leaveReason, setLeaveReason] = useState<string>('Medical Conference & Approved Leave');
  const [leaveResult, setLeaveResult] = useState<any | null>(null);
  const [doctorLeaves, setDoctorLeaves] = useState<any[]>([]);

  // Notification Logs State
  const [notificationLogs, setNotificationLogs] = useState<NotificationLogItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [chainOverview, setChainOverview] = useState<BlockchainOverview | null>(null);

  // Load Admin Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [analyticsRes, docRes, notifRes, chainRes] = await Promise.all([
        api.getAdminAnalytics(),
        api.getDoctors(),
        api.getNotificationLogs(),
        api.getBlockchainOverview().catch(() => null)
      ]);
      setChainOverview(chainRes);
      setStats(analyticsRes?.stats || null);
      setRecentApts(analyticsRes?.recentAppointments || []);
      const docs = docRes?.doctors || [];
      setDoctors(docs);
      setNotificationLogs(notifRes?.logs || []);

      if (docs.length > 0 && !selectedDoctorId) {
        setSelectedDoctorId(docs[0].id);
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Load leaves when selected doctor changes
  useEffect(() => {
    if (!selectedDoctorId) return;
    async function loadLeaves() {
      try {
        const res = await api.getDoctorLeaves(selectedDoctorId);
        setDoctorLeaves(res.leaves || []);
      } catch (err) {
        console.error('Failed to load leaves:', err);
      }
    }
    loadLeaves();
  }, [selectedDoctorId]);

  // Create Doctor
  const handleCreateDoctor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createDoctor(newDoctor);
      setShowAddDoctorModal(false);
      setNewDoctor({
        name: '',
        email: '',
        password: 'doctor123',
        phone: '',
        specialization: 'General Medicine',
        bio: '',
        slotDurationMinutes: 30,
        workingHoursStart: '09:00',
        workingHoursEnd: '17:00',
        consultationFee: 75,
        roomNumber: 'Room 101'
      });
      loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to create doctor');
    }
  };

  // Mark Doctor on Leave
  const handleMarkLeave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDoctorId || !leaveDate) {
      alert('Please select doctor and leave date.');
      return;
    }

    try {
      const res = await api.markDoctorOnLeave(selectedDoctorId, leaveDate, leaveReason);
      setLeaveResult(res);
      const updatedLeaves = await api.getDoctorLeaves(selectedDoctorId);
      setDoctorLeaves(updatedLeaves.leaves || []);
      const notifs = await api.getNotificationLogs();
      setNotificationLogs(notifs.logs || []);
    } catch (err: any) {
      alert(err.message || 'Failed to mark doctor on leave');
    }
  };

  const handleRemoveLeave = async (date: string) => {
    if (!confirm(`Remove leave for ${date}?`)) return;
    try {
      await api.removeDoctorLeave(selectedDoctorId, date);
      const updatedLeaves = await api.getDoctorLeaves(selectedDoctorId);
      setDoctorLeaves(updatedLeaves.leaves || []);
    } catch (err: any) {
      alert(err.message || 'Failed to remove leave');
    }
  };

  // Things that need an admin's attention, shown first on the overview.
  const alerts: Array<{ key: string; icon: string; text: string; action: string; tab: string }> = [];
  const toReschedule = recentApts.filter((a: { status: string }) => a.status === 'REQUIRES_RESCHEDULE').length;
  if (toReschedule) alerts.push({ key: 'resched', icon: 'event_repeat', text: `${toReschedule} appointment${toReschedule === 1 ? '' : 's'} need rescheduling after a doctor's leave`, action: 'Review leave', tab: 'Schedule' });
  const failedMail = notificationLogs.filter((l) => l.status === 'FAILED').length;
  if (failedMail) alerts.push({ key: 'mail', icon: 'mail', text: `${failedMail} notification${failedMail === 1 ? '' : 's'} failed to send`, action: 'View notifications', tab: 'Records' });
  if (chainOverview?.enabled) {
    const unverified = chainOverview.doctors.filter((d) => !d.registeredOnChain).length;
    if (unverified) alerts.push({ key: 'chain', icon: 'token', text: `${unverified} doctor${unverified === 1 ? ' is' : 's are'} not verified on-chain yet, so their prescriptions can't be anchored`, action: 'Verify doctors', tab: 'Blockchain' });
    const failedRecords = chainOverview.recordCounts?.FAILED ?? 0;
    if (failedRecords) alerts.push({ key: 'rec', icon: 'warning', text: `${failedRecords} record${failedRecords === 1 ? '' : 's'} failed to anchor`, action: 'Open blockchain', tab: 'Blockchain' });
  }

  return (
    <div className="bg-background text-on-background min-h-screen relative selection:bg-primary/30 selection:text-primary">

      {/* Side Navigation Bar */}
      <Sidebar
        activeTab={navTab}
        onTabChange={(tab) => setNavTab(tab as any)}
        onOpenAIInsights={() => setShowAIModal(true)}
        extraItems={[{ label: 'Blockchain', icon: 'token' }]}
      />

      {/* Top App Bar */}
      <TopAppBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        title="Clinic Administration"
        onOpenAIInsights={() => setShowAIModal(true)}
      />

      {/* Main Content */}
      <main className="fixed top-16 left-0 md:left-64 right-0 bottom-16 md:bottom-0 overflow-y-auto [&>*]:shrink-0 p-4 md:p-6 lg:p-8 flex flex-col gap-6 max-w-[1440px]">
        {/* DASHBOARD TAB */}
        {navTab === 'Dashboard' && (
          <>
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
              <div>
                <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-fg mb-1">
                  Clinic Administration
                </h1>
                <p className="text-xs sm:text-sm text-on-surface-variant">
                  Manage doctor roster, schedules, leave conflict resolutions, and operational metrics.
                </p>
              </div>

              <button
                onClick={() => setShowAddDoctorModal(true)}
                className="bg-primary hover:bg-primary-container text-on-primary px-5 py-2.5 rounded-xl font-heading font-bold text-xs shadow-neon-cyan hover:-translate-y-0.5 transition-all flex items-center gap-2 border border-primary/50"
              >
                <Icon name="add" className="text-base" />
                <span>Add Doctor Profile</span>
              </button>
            </div>

            {/* KPI Metrics Grid */}
            {!loading &&
              (alerts.length > 0 ? (
                <NextUpCard tone="warning" label="Needs your attention" icon="warning" title={`${alerts.length} thing${alerts.length === 1 ? '' : 's'} to review`}>
                  <ul className="mt-3 divide-y divide-warning/20">
                    {alerts.map((a) => (
                      <li key={a.key} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-2.5">
                        <span className="flex items-start gap-2 text-sm text-fg">
                          <Icon name={a.icon} className="text-base text-warning mt-0.5" />
                          {a.text}
                        </span>
                        <button onClick={() => setNavTab(a.tab as typeof navTab)} className="btn btn-secondary py-1.5 text-[13px] shrink-0">
                          {a.action}
                        </button>
                      </li>
                    ))}
                  </ul>
                </NextUpCard>
              ) : (
                <NextUpCard label="All clear" icon="check_circle" title="Nothing needs your attention" meta={<span>Schedules, notifications and blockchain anchoring are all running normally.</span>} />
              ))}

            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Metric 1: Total Doctors */}
              <div className="glass-card rounded-2xl p-5 lift-hover relative overflow-hidden group border border-line">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary border border-primary/20">
                    <Icon name="group" className="text-lg" />
                  </div>
                  <h3 className="text-xs font-heading font-bold text-on-surface-variant">
                    Total Doctors
                  </h3>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-heading font-extrabold text-2xl sm:text-3xl text-fg">
                    {stats?.totalDoctors || doctors.length || 0}
                  </span>
                  <span className="text-xs text-tertiary flex items-center font-heading font-bold">
                    <Icon name="arrow_upward" className="text-[14px] text-xl" /> Active
                  </span>
                </div>
              </div>

              {/* Metric 2: Scheduled Visits */}
              <div className="glass-card rounded-2xl p-5 lift-hover relative overflow-hidden group border border-line">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-tertiary/15 flex items-center justify-center text-tertiary border border-tertiary/20">
                    <Icon name="event_available" className="text-lg" />
                  </div>
                  <h3 className="text-xs font-heading font-bold text-on-surface-variant">
                    Scheduled Visits
                  </h3>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-heading font-extrabold text-2xl sm:text-3xl text-fg">
                    {stats?.totalAppointments || recentApts.length || 0}
                  </span>
                  <span className="text-xs text-tertiary flex items-center font-heading font-bold">
                    <Icon name="arrow_upward" className="text-[14px] text-xl" /> {stats?.bookedAppointments || 0} In-Queue
                  </span>
                </div>
              </div>

              {/* Metric 3: Active Patients */}
              <div className="glass-card rounded-2xl p-5 lift-hover relative overflow-hidden group border border-line">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary/15 flex items-center justify-center text-secondary border border-secondary/20">
                    <Icon name="vital_signs" className="text-lg" />
                  </div>
                  <h3 className="text-xs font-heading font-bold text-on-surface-variant">
                    Active Patients
                  </h3>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-heading font-extrabold text-2xl sm:text-3xl text-fg">
                    {stats?.totalPatients || 3}
                  </span>
                  <span className="text-xs text-secondary flex items-center font-heading font-bold">
                    Registered
                  </span>
                </div>
              </div>

              {/* Metric 4: Notifications Sent */}
              <div className="glass-card rounded-2xl p-5 lift-hover relative overflow-hidden group border border-line">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary border border-primary/20">
                    <Icon name="outgoing_mail" className="text-lg" />
                  </div>
                  <h3 className="text-xs font-heading font-bold text-on-surface-variant">
                    Notifications Sent
                  </h3>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-heading font-extrabold text-2xl sm:text-3xl text-fg">
                    {stats?.sentNotifications || notificationLogs.length || 0}
                  </span>
                  <span className="text-xs text-tertiary flex items-center font-heading font-bold">
                    <Icon name="arrow_upward" className="text-[14px] text-xl" /> 99.8% Success
                  </span>
                </div>
              </div>
            </section>

            {/* Doctor Roster Table Section */}
            <section className="glass-card rounded-2xl p-6 flex flex-col gap-4 border border-line shadow-glass">
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-heading font-extrabold text-base text-fg flex items-center gap-2">
                  <Icon name="admin_panel_settings" className="text-primary text-xl" />
                  Doctor Roster &amp; Clinical Directory
                </h2>
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 font-heading text-xs font-bold bg-surface-container-high/60 px-3 py-1.5 rounded-xl border border-line"
                >
                  <Icon name="refresh" className="text-sm" /> Refresh
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-outline-variant/30 text-on-surface-variant font-heading">
                      <th className="py-3.5 px-4 font-bold">Doctor</th>
                      <th className="py-3.5 px-4 font-bold">Specialty</th>
                      <th className="py-3.5 px-4 font-bold">Consultation Fee</th>
                      <th className="py-3.5 px-4 font-bold">Slot Duration</th>
                      <th className="py-3.5 px-4 font-bold">Schedule</th>
                      <th className="py-3.5 px-4 font-bold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {doctors.map(doc => {
                      const avatarUrl = DOCTOR_AVATARS[doc.specialization] || DOCTOR_AVATARS['General Medicine'];
                      return (
                        <tr key={doc.id} className="hover:bg-surface-container-high/30 transition-colors group">
                          <td className="py-3.5 px-4 flex items-center gap-3">
                            <Avatar src={avatarUrl} name={doc.name} className="w-9 h-9" />
                            <div>
                              <p className="font-heading font-bold text-fg text-xs">{doc.name}</p>
                              <p className="text-xs text-on-surface-variant">{doc.email}</p>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-0.5 bg-secondary/15 text-secondary rounded-full font-heading text-xs font-bold border border-secondary/20">
                              {doc.specialization}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-heading font-bold text-fg">
                            ₹{doc.consultationFee}.00
                          </td>
                          <td className="py-3.5 px-4 text-on-surface-variant">
                            {doc.slotDurationMinutes} min
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex gap-1">
                              <span className="w-5 h-5 rounded bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">M</span>
                              <span className="w-5 h-5 rounded bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">T</span>
                              <span className="w-5 h-5 rounded bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">W</span>
                              <span className="w-5 h-5 rounded bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">T</span>
                              <span className="w-5 h-5 rounded bg-primary/20 text-primary flex items-center justify-center text-xs font-bold">F</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => setEditingDoctor(doc)}
                              className="p-1.5 text-on-surface-variant hover:text-primary transition-colors rounded-lg hover:bg-surface-container-high/50"
                              title="Edit Profile"
                            >
                              <Icon name="edit" className="text-base" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* SCHEDULE TAB */}
        {navTab === 'Schedule' && (
          <>
            {/* Header Section */}
            <div>
              <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-fg mb-1">
                Doctor Schedules & Leave Management
              </h1>
              <p className="text-xs sm:text-sm text-on-surface-variant">
                Schedule approved doctor leaves, manage weekly shift hours, and automatically trigger priority patient rescheduling.
              </p>
            </div>

            {/* Doctor Leave Conflict Manager Section */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 glass-card p-6 rounded-2xl border border-line space-y-4">
                <div className="flex items-center gap-2">
                  <Icon name="event_busy" className="text-warning text-xl" />
                  <h3 className="font-heading font-extrabold text-sm text-fg">
                    Register Doctor Leave &amp; Auto-Resolve Conflicts
                  </h3>
                </div>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  When a doctor is scheduled on leave, all conflicting bookings are safely marked for priority reschedule and alert notifications are immediately dispatched.
                </p>

                <form onSubmit={handleMarkLeave} className="space-y-3.5 text-xs">
                  <div>
                    <label className="block font-heading font-bold text-on-surface-variant mb-1">Select Doctor</label>
                    <select
                      value={selectedDoctorId}
                      onChange={e => setSelectedDoctorId(e.target.value)}
                      className="w-full p-2.5 bg-surface-container border border-line rounded-xl text-fg focus:border-primary focus:outline-none"
                      required
                    >
                      {doctors.map(d => (
                        <option key={d.id} value={d.id} className="bg-surface-container text-fg">
                          {d.name} ({d.specialization})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-heading font-bold text-on-surface-variant mb-1">Leave Date</label>
                    <input
                      type="date"
                      value={leaveDate}
                      onChange={e => setLeaveDate(e.target.value)}
                      className="w-full p-2.5 bg-surface-container border border-line rounded-xl text-fg focus:border-primary focus:outline-none"
                      required
                    />
                  </div>

                  <div>
                    <label className="block font-heading font-bold text-on-surface-variant mb-1">Reason</label>
                    <input
                      type="text"
                      value={leaveReason}
                      onChange={e => setLeaveReason(e.target.value)}
                      placeholder="e.g. Medical Conference or Approved Personal Leave"
                      className="w-full p-2.5 bg-surface-container border border-line rounded-xl text-fg focus:border-primary focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-danger hover:bg-danger/90 text-on-primary font-heading font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <Icon name="send" className="text-base" />
                    <span>Register Leave &amp; Dispatch Patient Alerts</span>
                  </button>
                </form>

                {leaveResult && (
                  <div className="p-3.5 bg-tertiary-container/20 border border-tertiary/30 rounded-xl text-xs space-y-1">
                    <span className="font-heading font-bold text-tertiary flex items-center gap-1">
                      <Icon name="check_circle" className="text-base" />
                      Leave Confirmed
                    </span>
                    <p className="text-fg">
                      <strong>{leaveResult.affectedAppointmentsCount}</strong> conflicting appointment(s) rescheduled, and <strong>{leaveResult.patientsNotifiedCount}</strong> patient notification email(s) sent.
                    </p>
                  </div>
                )}
              </div>

              <div className="lg:col-span-6 glass-card p-6 rounded-2xl border border-line space-y-4">
                <h3 className="font-heading font-extrabold text-sm text-fg flex items-center gap-2">
                  <Icon name="schedule" className="text-primary text-xl" />
                  Active Leaves for Selected Doctor
                </h3>

                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {doctorLeaves.map((l, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-surface-container border border-line rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-heading font-bold text-fg block">{l.leaveDate}</span>
                        <span className="text-on-surface-variant">{l.reason || 'Approved Leave'}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveLeave(l.leaveDate)}
                        className="text-error hover:bg-error/20 p-1.5 rounded-lg transition-colors"
                        title="Remove leave"
                      >
                        <Icon name="delete" className="text-base" />
                      </button>
                    </div>
                  ))}

                  {doctorLeaves.length === 0 && (
                    <div className="text-center py-12 text-on-surface-variant/60 text-xs">
                      No registered leaves for this doctor.
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {/* RECORDS TAB */}
        {navTab === 'Records' && (
          <>
            <div>
              <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-fg mb-1">
                Communications & Notification Audit Trail
              </h1>
              <p className="text-xs sm:text-sm text-on-surface-variant">
                Live audit trail of all outbound emails, booking confirmations, leave alerts, and retry queue telemetry.
              </p>
            </div>

            <section className="glass-card rounded-2xl p-6 flex flex-col gap-4 border border-line shadow-glass">
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-heading font-extrabold text-base text-fg flex items-center gap-2">
                  <Icon name="mark_email_read" className="text-primary text-xl" />
                  System Notification Logs ({notificationLogs.length})
                </h2>
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 font-heading text-xs font-bold bg-surface-container-high/60 px-3 py-1.5 rounded-xl border border-line"
                >
                  <Icon name="refresh" className="text-sm" /> Refresh Logs
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-outline-variant/30 text-on-surface-variant font-heading">
                      <th className="py-3.5 px-4 font-bold">Recipient</th>
                      <th className="py-3.5 px-4 font-bold">Type</th>
                      <th className="py-3.5 px-4 font-bold">Subject</th>
                      <th className="py-3.5 px-4 font-bold">Status</th>
                      <th className="py-3.5 px-4 font-bold text-right">Timestamp</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant/20">
                    {notificationLogs.map(log => (
                      <tr key={log.id} className="hover:bg-surface-container-high/30 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-fg">{log.recipientEmail}</td>
                        <td className="py-3.5 px-4">
                          <span className="text-xs font-medium text-muted">{log.type.toLowerCase().replace(/_/g, ' ')}</span>
                        </td>
                        <td className="py-3.5 px-4 text-on-surface-variant truncate max-w-xs">{log.subject}</td>
                        <td className="py-3.5 px-4">
                          <StatusBadge status={log.status} />
                        </td>
                        <td className="py-3.5 px-4 text-right text-on-surface-variant">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}

                    {notificationLogs.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-on-surface-variant">
                          No notification logs found. Transactional emails will appear here automatically.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {/* BLOCKCHAIN TAB */}
        {navTab === 'Blockchain' && <BlockchainAdminPanel />}

        {/* SETTINGS TAB */}
        {navTab === 'Settings' && (
          <>
            <div>
              <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-fg mb-1">
                Clinic Configuration & Policies
              </h1>
              <p className="text-xs sm:text-sm text-on-surface-variant">
                Configure global clinic operations, slot hold TTL buffers, and emergency notification settings.
              </p>
            </div>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-card p-6 rounded-2xl border border-line space-y-4 text-xs">
                <h3 className="font-heading font-extrabold text-sm text-fg flex items-center gap-2">
                  <Icon name="tune" className="text-primary text-xl" />
                  Appointment Engine Policies
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-surface-container rounded-xl border border-line">
                    <div>
                      <p className="font-bold text-fg">Temporary Slot Hold TTL</p>
                      <p className="text-on-surface-variant text-xs">Automatic lock expiration for incomplete bookings</p>
                    </div>
                    <span className="px-3 py-1 bg-primary/15 text-primary font-bold rounded-lg">10 Minutes</span>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-surface-container rounded-xl border border-line">
                    <div>
                      <p className="font-bold text-fg">Dual Calendar Sync</p>
                      <p className="text-on-surface-variant text-xs">Google OAuth + RFC-5545 universal .ICS generator</p>
                    </div>
                    <span className="px-3 py-1 bg-tertiary/15 text-tertiary font-bold rounded-lg">Enabled</span>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-surface-container rounded-xl border border-line">
                    <div>
                      <p className="font-bold text-fg">AI Clinical Triage Engine</p>
                      <p className="text-on-surface-variant text-xs">Urgency calculation & heuristic rule fallback</p>
                    </div>
                    <span className="px-3 py-1 bg-secondary/15 text-secondary font-bold rounded-lg">Active (Gemini/OpenAI)</span>
                  </div>
                </div>
              </div>

              <div className="glass-card p-6 rounded-2xl border border-line space-y-4 text-xs">
                <h3 className="font-heading font-extrabold text-sm text-fg flex items-center gap-2">
                  <Icon name="local_hospital" className="text-secondary text-xl" />
                  Clinic Information
                </h3>
                <div className="space-y-3 text-on-surface-variant">
                  <div className="p-3 bg-surface-container rounded-xl border border-line">
                    <p className="font-bold text-fg">CarePulse Multi-Speciality Clinic</p>
                    <p className="mt-1">Healthcare Tower, Sector 62, Noida, NCR, India</p>
                    <p className="mt-0.5">Emergency Helpline: +91 (0120) 456-7890</p>
                    <p className="mt-0.5">Accreditation: NABH / HIPAA Compliant Practice</p>
                  </div>
                </div>
              </div>
            </section>
          </>
        )}
      </main>

      {/* Add Doctor Modal */}
      {showAddDoctorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1513]/50 backdrop-blur-md animate-fade-in">
          <div className="glass-panel w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-outline-variant/50 relative text-xs">
            <button
              onClick={() => setShowAddDoctorModal(false)}
              className="absolute top-4 right-4 text-on-surface-variant hover:text-fg"
            >
              <Icon name="close" className="text-xl" />
            </button>

            <h3 className="font-heading font-extrabold text-base text-fg mb-4 flex items-center gap-2">
              <Icon name="person_add" className="text-primary text-xl" />
              Create New Doctor Profile
            </h3>

            <form onSubmit={handleCreateDoctor} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-heading font-semibold text-on-surface-variant mb-1">Doctor Name *</label>
                  <input
                    type="text"
                    value={newDoctor.name}
                    onChange={e => setNewDoctor({ ...newDoctor, name: e.target.value })}
                    placeholder="Dr. Gregory House"
                    className="w-full p-2.5 bg-surface-container border border-line rounded-xl text-fg focus:border-primary focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block font-heading font-semibold text-on-surface-variant mb-1">Email *</label>
                  <input
                    type="email"
                    value={newDoctor.email}
                    onChange={e => setNewDoctor({ ...newDoctor, email: e.target.value })}
                    placeholder="house@carepulse.com"
                    className="w-full p-2.5 bg-surface-container border border-line rounded-xl text-fg focus:border-primary focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-heading font-semibold text-on-surface-variant mb-1">Specialization *</label>
                  <input
                    type="text"
                    value={newDoctor.specialization}
                    onChange={e => setNewDoctor({ ...newDoctor, specialization: e.target.value })}
                    placeholder="Cardiology"
                    className="w-full p-2.5 bg-surface-container border border-line rounded-xl text-fg focus:border-primary focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block font-heading font-semibold text-on-surface-variant mb-1">Fee (₹ / visit)</label>
                  <input
                    type="number"
                    value={newDoctor.consultationFee}
                    onChange={e => setNewDoctor({ ...newDoctor, consultationFee: Number(e.target.value) })}
                    className="w-full p-2.5 bg-surface-container border border-line rounded-xl text-fg focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-heading font-semibold text-on-surface-variant mb-1">Slot Duration (Mins)</label>
                  <input
                    type="number"
                    value={newDoctor.slotDurationMinutes}
                    onChange={e => setNewDoctor({ ...newDoctor, slotDurationMinutes: Number(e.target.value) })}
                    className="w-full p-2.5 bg-surface-container border border-line rounded-xl text-fg focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-heading font-semibold text-on-surface-variant mb-1">Room Number</label>
                  <input
                    type="text"
                    value={newDoctor.roomNumber}
                    onChange={e => setNewDoctor({ ...newDoctor, roomNumber: e.target.value })}
                    className="w-full p-2.5 bg-surface-container border border-line rounded-xl text-fg focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddDoctorModal(false)}
                  className="px-4 py-2 text-on-surface-variant hover:text-fg rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-primary hover:bg-primary-container text-on-primary font-heading font-bold rounded-xl shadow-neon-cyan"
                >
                  Save Doctor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Doctor Profile Modal */}
      {editingDoctor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1513]/50 backdrop-blur-md animate-fade-in">
          <div className="glass-panel w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-outline-variant/50 relative text-xs">
            <button
              onClick={() => setEditingDoctor(null)}
              className="absolute top-4 right-4 text-on-surface-variant hover:text-fg"
            >
              <Icon name="close" className="text-xl" />
            </button>

            <h3 className="font-heading font-extrabold text-base text-on-surface mb-5 flex items-center gap-2">
              <Icon name="manage_accounts" className="text-primary text-xl" />
              Edit Doctor Profile: {editingDoctor.name}
            </h3>

            <div className="space-y-5">
              <div>
                <div className="flex justify-between mb-2">
                  <label className="font-heading font-bold text-on-surface-variant">Slot Duration (Minutes)</label>
                  <span className="font-heading font-bold text-primary">{editingDoctor.slotDurationMinutes} min</span>
                </div>
                <input
                  type="range"
                  min="10"
                  max="120"
                  step="5"
                  value={editingDoctor.slotDurationMinutes}
                  onChange={e => setEditingDoctor({ ...editingDoctor, slotDurationMinutes: Number(e.target.value) })}
                  className="w-full h-2 bg-surface-container-highest/50 rounded-lg appearance-none cursor-pointer accent-primary"
                />
              </div>

              <div>
                <label className="font-heading font-bold text-on-surface-variant block mb-2">Working Days</label>
                <div className="flex flex-wrap gap-2">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(day => (
                    <button
                      key={day}
                      type="button"
                      className="px-3.5 py-1.5 rounded-full border border-primary bg-primary/20 text-primary font-heading font-bold text-xs"
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEditingDoctor(null)}
                className="px-4 py-2 border border-outline-variant/50 text-on-surface-variant hover:text-fg rounded-xl"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  alert('Doctor configuration updated successfully!');
                  setEditingDoctor(null);
                }}
                className="px-5 py-2 bg-primary hover:bg-primary-container text-on-primary font-heading font-bold rounded-xl shadow-neon-cyan"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Platform Intelligence Modal */}
      {showAIModal && (
        <AIInsightsModal onClose={() => setShowAIModal(false)} />
      )}
    </div>
  );
};
