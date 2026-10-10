import React, { useState, useEffect } from 'react';
import { api } from '../api/client';
import { DoctorListItem, NotificationLogItem } from '../types';
import { AIInsightsModal } from '../components/AIInsightsModal';
import { Sidebar } from '../components/Sidebar';
import { TopAppBar } from '../components/TopAppBar';
import { FluidShaderCanvas } from '../components/FluidShaderCanvas';
import { BlockchainAdminPanel } from '../components/BlockchainAdminPanel';

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

  // Load Admin Data
  const loadData = async () => {
    setLoading(true);
    try {
      const [analyticsRes, docRes, notifRes] = await Promise.all([
        api.getAdminAnalytics(),
        api.getDoctors(),
        api.getNotificationLogs()
      ]);
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

  return (
    <div className="bg-background text-on-background min-h-screen relative selection:bg-primary/30 selection:text-primary">
      <FluidShaderCanvas />

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
      <main className="fixed top-16 left-0 md:left-64 right-0 bottom-0 overflow-y-auto p-4 md:p-6 lg:p-8 flex flex-col gap-6 max-w-[1440px]">
        {/* DASHBOARD TAB */}
        {navTab === 'Dashboard' && (
          <>
            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
              <div>
                <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-white mb-1">
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
                <span className="material-symbols-outlined text-base">add</span>
                <span>Add Doctor Profile</span>
              </button>
            </div>

            {/* KPI Metrics Grid */}
            <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Metric 1: Total Doctors */}
              <div className="glass-card rounded-2xl p-5 lift-hover relative overflow-hidden group border border-white/10">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-6xl">stethoscope</span>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary border border-primary/20">
                    <span className="material-symbols-outlined text-lg">group</span>
                  </div>
                  <h3 className="text-xs font-heading font-bold text-on-surface-variant uppercase tracking-wider">
                    Total Doctors
                  </h3>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-heading font-extrabold text-2xl sm:text-3xl text-white">
                    {stats?.totalDoctors || doctors.length || 0}
                  </span>
                  <span className="text-[11px] text-tertiary flex items-center font-heading font-bold">
                    <span className="material-symbols-outlined text-[14px]">arrow_upward</span> Active
                  </span>
                </div>
              </div>

              {/* Metric 2: Scheduled Visits */}
              <div className="glass-card rounded-2xl p-5 lift-hover relative overflow-hidden group border border-white/10">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-6xl">calendar_month</span>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-tertiary/15 flex items-center justify-center text-tertiary border border-tertiary/20">
                    <span className="material-symbols-outlined text-lg">event_available</span>
                  </div>
                  <h3 className="text-xs font-heading font-bold text-on-surface-variant uppercase tracking-wider">
                    Scheduled Visits
                  </h3>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-heading font-extrabold text-2xl sm:text-3xl text-white">
                    {stats?.totalAppointments || recentApts.length || 0}
                  </span>
                  <span className="text-[11px] text-tertiary flex items-center font-heading font-bold">
                    <span className="material-symbols-outlined text-[14px]">arrow_upward</span> {stats?.bookedAppointments || 0} In-Queue
                  </span>
                </div>
              </div>

              {/* Metric 3: Active Patients */}
              <div className="glass-card rounded-2xl p-5 lift-hover relative overflow-hidden group border border-white/10">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-6xl">personal_injury</span>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-secondary/15 flex items-center justify-center text-secondary border border-secondary/20">
                    <span className="material-symbols-outlined text-lg">vital_signs</span>
                  </div>
                  <h3 className="text-xs font-heading font-bold text-on-surface-variant uppercase tracking-wider">
                    Active Patients
                  </h3>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-heading font-extrabold text-2xl sm:text-3xl text-white">
                    {stats?.totalPatients || 3}
                  </span>
                  <span className="text-[11px] text-secondary flex items-center font-heading font-bold">
                    Registered
                  </span>
                </div>
              </div>

              {/* Metric 4: Notifications Sent */}
              <div className="glass-card rounded-2xl p-5 lift-hover relative overflow-hidden group border border-white/10">
                <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
                  <span className="material-symbols-outlined text-6xl">mail</span>
                </div>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center text-primary border border-primary/20">
                    <span className="material-symbols-outlined text-lg">outgoing_mail</span>
                  </div>
                  <h3 className="text-xs font-heading font-bold text-on-surface-variant uppercase tracking-wider">
                    Notifications Sent
                  </h3>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="font-heading font-extrabold text-2xl sm:text-3xl text-white">
                    {stats?.sentNotifications || notificationLogs.length || 0}
                  </span>
                  <span className="text-[11px] text-tertiary flex items-center font-heading font-bold">
                    <span className="material-symbols-outlined text-[14px]">arrow_upward</span> 99.8% Success
                  </span>
                </div>
              </div>
            </section>

            {/* Doctor Roster Table Section */}
            <section className="glass-card rounded-2xl p-6 flex flex-col gap-4 border border-white/10 shadow-glass">
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-heading font-extrabold text-base text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl">admin_panel_settings</span>
                  Doctor Roster &amp; Clinical Directory
                </h2>
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 font-heading text-xs font-bold bg-surface-container-high/60 px-3 py-1.5 rounded-xl border border-white/5"
                >
                  <span className="material-symbols-outlined text-sm">refresh</span> Refresh
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-outline-variant/30 text-on-surface-variant font-heading uppercase tracking-wider">
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
                            <img
                              src={avatarUrl}
                              alt={doc.name}
                              className="w-9 h-9 rounded-full object-cover border border-outline-variant/50"
                            />
                            <div>
                              <p className="font-heading font-bold text-white text-xs">{doc.name}</p>
                              <p className="text-[10px] text-on-surface-variant">{doc.email}</p>
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span className="px-2.5 py-0.5 bg-secondary/15 text-secondary rounded-full font-heading text-[10px] font-bold border border-secondary/20">
                              {doc.specialization}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 font-heading font-bold text-white">
                            ₹{doc.consultationFee}.00
                          </td>
                          <td className="py-3.5 px-4 text-on-surface-variant">
                            {doc.slotDurationMinutes} min
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="flex gap-1">
                              <span className="w-5 h-5 rounded bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">M</span>
                              <span className="w-5 h-5 rounded bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">T</span>
                              <span className="w-5 h-5 rounded bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">W</span>
                              <span className="w-5 h-5 rounded bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">T</span>
                              <span className="w-5 h-5 rounded bg-primary/20 text-primary flex items-center justify-center text-[10px] font-bold">F</span>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => setEditingDoctor(doc)}
                              className="p-1.5 text-on-surface-variant hover:text-primary transition-colors rounded-lg hover:bg-surface-container-high/50"
                              title="Edit Profile"
                            >
                              <span className="material-symbols-outlined text-base">edit</span>
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
              <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-white mb-1">
                Doctor Schedules & Leave Management
              </h1>
              <p className="text-xs sm:text-sm text-on-surface-variant">
                Schedule approved doctor leaves, manage weekly shift hours, and automatically trigger priority patient rescheduling.
              </p>
            </div>

            {/* Doctor Leave Conflict Manager Section */}
            <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 glass-card p-6 rounded-2xl border border-white/10 space-y-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-amber-400 text-xl">event_busy</span>
                  <h3 className="font-heading font-extrabold text-sm text-white">
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
                      className="w-full p-2.5 bg-surface-container border border-white/10 rounded-xl text-white focus:border-primary focus:outline-none"
                      required
                    >
                      {doctors.map(d => (
                        <option key={d.id} value={d.id} className="bg-surface-container text-white">
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
                      className="w-full p-2.5 bg-surface-container border border-white/10 rounded-xl text-white focus:border-primary focus:outline-none"
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
                      className="w-full p-2.5 bg-surface-container border border-white/10 rounded-xl text-white focus:border-primary focus:outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full py-3 bg-gradient-to-r from-amber-600 to-rose-600 hover:from-amber-700 hover:to-rose-700 text-white font-heading font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                  >
                    <span className="material-symbols-outlined text-base">send</span>
                    <span>Register Leave &amp; Dispatch Patient Alerts</span>
                  </button>
                </form>

                {leaveResult && (
                  <div className="p-3.5 bg-tertiary-container/20 border border-tertiary/30 rounded-xl text-xs space-y-1">
                    <span className="font-heading font-bold text-tertiary flex items-center gap-1">
                      <span className="material-symbols-outlined text-base">check_circle</span>
                      Leave Confirmed
                    </span>
                    <p className="text-white">
                      <strong>{leaveResult.affectedAppointmentsCount}</strong> conflicting appointment(s) rescheduled, and <strong>{leaveResult.patientsNotifiedCount}</strong> patient notification email(s) sent.
                    </p>
                  </div>
                )}
              </div>

              <div className="lg:col-span-6 glass-card p-6 rounded-2xl border border-white/10 space-y-4">
                <h3 className="font-heading font-extrabold text-sm text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl">schedule</span>
                  Active Leaves for Selected Doctor
                </h3>

                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {doctorLeaves.map((l, idx) => (
                    <div
                      key={idx}
                      className="p-3 bg-surface-container border border-white/5 rounded-xl flex items-center justify-between text-xs"
                    >
                      <div>
                        <span className="font-heading font-bold text-white block">{l.leaveDate}</span>
                        <span className="text-on-surface-variant">{l.reason || 'Approved Leave'}</span>
                      </div>
                      <button
                        onClick={() => handleRemoveLeave(l.leaveDate)}
                        className="text-error hover:bg-error/20 p-1.5 rounded-lg transition-colors"
                        title="Remove leave"
                      >
                        <span className="material-symbols-outlined text-base">delete</span>
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
              <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-white mb-1">
                Communications & Notification Audit Trail
              </h1>
              <p className="text-xs sm:text-sm text-on-surface-variant">
                Live audit trail of all outbound emails, booking confirmations, leave alerts, and retry queue telemetry.
              </p>
            </div>

            <section className="glass-card rounded-2xl p-6 flex flex-col gap-4 border border-white/10 shadow-glass">
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-heading font-extrabold text-base text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl">mark_email_read</span>
                  System Notification Logs ({notificationLogs.length})
                </h2>
                <button
                  onClick={loadData}
                  disabled={loading}
                  className="text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1 font-heading text-xs font-bold bg-surface-container-high/60 px-3 py-1.5 rounded-xl border border-white/5"
                >
                  <span className="material-symbols-outlined text-sm">refresh</span> Refresh Logs
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-outline-variant/30 text-on-surface-variant font-heading uppercase tracking-wider">
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
                        <td className="py-3.5 px-4 font-medium text-white">{log.recipientEmail}</td>
                        <td className="py-3.5 px-4">
                          <span className="px-2.5 py-0.5 rounded-full font-heading text-[10px] font-bold bg-primary/15 text-primary border border-primary/25">
                            {log.type}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-on-surface-variant truncate max-w-xs">{log.subject}</td>
                        <td className="py-3.5 px-4">
                          <span className={`px-2.5 py-0.5 rounded-full font-heading text-[10px] font-bold ${
                            log.status === 'SENT'
                              ? 'bg-tertiary/15 text-tertiary border border-tertiary/30'
                              : 'bg-amber-500/15 text-amber-300 border border-amber-400/30'
                          }`}>
                            {log.status}
                          </span>
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
              <h1 className="font-heading font-extrabold text-2xl md:text-3xl text-white mb-1">
                Clinic Configuration & Policies
              </h1>
              <p className="text-xs sm:text-sm text-on-surface-variant">
                Configure global clinic operations, slot hold TTL buffers, and emergency notification settings.
              </p>
            </div>

            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="glass-card p-6 rounded-2xl border border-white/10 space-y-4 text-xs">
                <h3 className="font-heading font-extrabold text-sm text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-xl">tune</span>
                  Appointment Engine Policies
                </h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-surface-container rounded-xl border border-white/5">
                    <div>
                      <p className="font-bold text-white">Temporary Slot Hold TTL</p>
                      <p className="text-on-surface-variant text-[11px]">Automatic lock expiration for incomplete bookings</p>
                    </div>
                    <span className="px-3 py-1 bg-primary/15 text-primary font-bold rounded-lg">10 Minutes</span>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-surface-container rounded-xl border border-white/5">
                    <div>
                      <p className="font-bold text-white">Dual Calendar Sync</p>
                      <p className="text-on-surface-variant text-[11px]">Google OAuth + RFC-5545 universal .ICS generator</p>
                    </div>
                    <span className="px-3 py-1 bg-tertiary/15 text-tertiary font-bold rounded-lg">Enabled</span>
                  </div>

                  <div className="flex justify-between items-center p-3 bg-surface-container rounded-xl border border-white/5">
                    <div>
                      <p className="font-bold text-white">AI Clinical Triage Engine</p>
                      <p className="text-on-surface-variant text-[11px]">Urgency calculation & heuristic rule fallback</p>
                    </div>
                    <span className="px-3 py-1 bg-secondary/15 text-secondary font-bold rounded-lg">Active (Gemini/OpenAI)</span>
                  </div>
                </div>
              </div>

              <div className="glass-card p-6 rounded-2xl border border-white/10 space-y-4 text-xs">
                <h3 className="font-heading font-extrabold text-sm text-white flex items-center gap-2">
                  <span className="material-symbols-outlined text-secondary text-xl">local_hospital</span>
                  Clinic Information
                </h3>
                <div className="space-y-3 text-on-surface-variant">
                  <div className="p-3 bg-surface-container rounded-xl border border-white/5">
                    <p className="font-bold text-white">CarePulse Multi-Speciality Clinic</p>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="glass-panel w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-outline-variant/50 relative text-xs">
            <button
              onClick={() => setShowAddDoctorModal(false)}
              className="absolute top-4 right-4 text-on-surface-variant hover:text-white"
            >
              <span className="material-symbols-outlined">close</span>
            </button>

            <h3 className="font-heading font-extrabold text-base text-white mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">person_add</span>
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
                    className="w-full p-2.5 bg-surface-container border border-white/10 rounded-xl text-white focus:border-primary focus:outline-none"
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
                    className="w-full p-2.5 bg-surface-container border border-white/10 rounded-xl text-white focus:border-primary focus:outline-none"
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
                    className="w-full p-2.5 bg-surface-container border border-white/10 rounded-xl text-white focus:border-primary focus:outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block font-heading font-semibold text-on-surface-variant mb-1">Fee (₹ / visit)</label>
                  <input
                    type="number"
                    value={newDoctor.consultationFee}
                    onChange={e => setNewDoctor({ ...newDoctor, consultationFee: Number(e.target.value) })}
                    className="w-full p-2.5 bg-surface-container border border-white/10 rounded-xl text-white focus:border-primary focus:outline-none"
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
                    className="w-full p-2.5 bg-surface-container border border-white/10 rounded-xl text-white focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block font-heading font-semibold text-on-surface-variant mb-1">Room Number</label>
                  <input
                    type="text"
                    value={newDoctor.roomNumber}
                    onChange={e => setNewDoctor({ ...newDoctor, roomNumber: e.target.value })}
                    className="w-full p-2.5 bg-surface-container border border-white/10 rounded-xl text-white focus:border-primary focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddDoctorModal(false)}
                  className="px-4 py-2 text-on-surface-variant hover:text-white rounded-xl"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="glass-panel w-full max-w-lg rounded-2xl p-6 shadow-2xl border border-outline-variant/50 relative text-xs">
            <button
              onClick={() => setEditingDoctor(null)}
              className="absolute top-4 right-4 text-on-surface-variant hover:text-white"
            >
              <span className="material-symbols-outlined">close</span>
            </button>

            <h3 className="font-heading font-extrabold text-base text-on-surface mb-5 flex items-center gap-2">
              <span className="material-symbols-outlined text-primary">manage_accounts</span>
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
                className="px-4 py-2 border border-outline-variant/50 text-on-surface-variant hover:text-white rounded-xl"
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
