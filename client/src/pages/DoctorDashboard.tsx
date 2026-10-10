import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import { Appointment } from '../types';
import { PrescriptionModal } from '../components/PrescriptionModal';
import { AIInsightsModal } from '../components/AIInsightsModal';
import { Sidebar } from '../components/Sidebar';
import { TopAppBar } from '../components/TopAppBar';
import { FluidShaderCanvas } from '../components/FluidShaderCanvas';
import { formatDoctorName } from '../utils/format';
import { BlockchainBadge } from '../components/BlockchainBadge';
import { shortHash } from '../blockchain/chain';

export const DoctorDashboard: React.FC = () => {
  const { user } = useAuth();
  const [navTab, setNavTab] = useState<'Dashboard' | 'Schedule' | 'Records' | 'Settings'>('Dashboard');
  const [showAIModal, setShowAIModal] = useState(false);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Selected appointment for AI Brief
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);

  // Active consultation modal
  const [activeConsultationApt, setActiveConsultationApt] = useState<Appointment | null>(null);

  const fetchAppointments = async () => {
    setIsLoading(true);
    try {
      const res = await api.getAppointments(selectedStatus);
      const list = res?.appointments || [];
      setAppointments(list);
      if (list.length > 0) {
        if (!selectedAppointment || !list.find(a => a.id === selectedAppointment.id)) {
          setSelectedAppointment(list[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load appointments:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAppointments();
  }, [selectedStatus]);

  const filteredAppointments = appointments.filter(a => {
    if (!searchQuery) return true;
    const nameMatch = a.patient?.name?.toLowerCase().includes(searchQuery.toLowerCase());
    const symptomMatch = a.symptoms?.toLowerCase().includes(searchQuery.toLowerCase());
    return nameMatch || symptomMatch;
  });

  const bookedCount = appointments.filter(a => a.status === 'BOOKED').length;

  const getInitials = (name?: string) => {
    if (!name) return 'PT';
    const parts = name.trim().split(' ');
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  };

  const parseQuestions = (rawQuestions: string | string[]): string[] => {
    if (Array.isArray(rawQuestions)) return rawQuestions;
    if (typeof rawQuestions === 'string') {
      try {
        const parsed = JSON.parse(rawQuestions);
        if (Array.isArray(parsed)) return parsed;
      } catch {
        return rawQuestions.split('\n').map(q => q.trim()).filter(Boolean);
      }
    }
    return [];
  };

  return (
    <div className="bg-background text-on-background min-h-screen relative selection:bg-primary/30 selection:text-primary">
      <FluidShaderCanvas />

      {/* Side Navigation Bar */}
      <Sidebar
        activeTab={navTab}
        onTabChange={(tab) => setNavTab(tab as any)}
        onOpenAIInsights={() => setShowAIModal(true)}
      />

      {/* Top App Bar */}
      <TopAppBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        title="Doctor Clinical Station"
        onOpenAIInsights={() => setShowAIModal(true)}
      />

      {/* Main Content Area */}
      <main className="fixed top-16 left-0 md:left-64 right-0 bottom-0 overflow-y-auto p-4 md:p-6 lg:p-8 flex flex-col gap-6">
        {/* Doctor Summary Bar */}
        <div className="glass-card backdrop-blur-lg rounded-2xl p-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div>
            <h2 className="font-heading font-extrabold text-2xl md:text-3xl text-white mb-1">
              {formatDoctorName(user?.name)}
            </h2>
            <div className="flex items-center gap-3 text-xs text-on-surface-variant font-medium">
              <span className="flex items-center gap-1.5 text-primary">
                <span className="material-symbols-outlined text-sm">cardiology</span>
                {user?.doctorProfile?.specialization || 'Cardiology'}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1.5 text-secondary">
                <span className="material-symbols-outlined text-sm">meeting_room</span>
                {user?.doctorProfile?.roomNumber || 'Room 402'}
              </span>
              <span>•</span>
              <span>Slot Duration: {user?.doctorProfile?.slotDurationMinutes || 30} mins</span>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-surface-container-high/70 backdrop-blur-md rounded-full px-4 py-2 border border-outline-variant/40">
            <div className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse"></div>
            <span className="font-heading text-xs font-bold text-on-surface">Active Queue:</span>
            <span className="font-heading font-extrabold text-lg text-primary ml-1">{bookedCount}</span>
          </div>
        </div>

        {/* DASHBOARD TAB */}
        {navTab === 'Dashboard' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Queue List */}
            <div className="lg:col-span-7 flex flex-col gap-4">
              {/* Filter Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-outline-variant/30 hide-scrollbar">
                <button
                  onClick={() => setSelectedStatus('ALL')}
                  className={`px-4 py-2 rounded-full font-heading text-xs font-bold whitespace-nowrap transition-all ${
                    selectedStatus === 'ALL'
                      ? 'bg-surface-container-highest text-white border border-primary/40 shadow-sm'
                      : 'bg-surface-container/50 text-on-surface-variant hover:text-white'
                  }`}
                >
                  All Visits ({appointments.length})
                </button>
                <button
                  onClick={() => setSelectedStatus('BOOKED')}
                  className={`px-4 py-2 rounded-full font-heading text-xs font-bold whitespace-nowrap transition-all border ${
                    selectedStatus === 'BOOKED'
                      ? 'bg-primary/20 text-primary border-primary shadow-neon-cyan'
                      : 'bg-surface-container/50 text-on-surface-variant hover:text-white border-transparent'
                  }`}
                >
                  Booked Today ({bookedCount})
                </button>
                <button
                  onClick={() => setSelectedStatus('COMPLETED')}
                  className={`px-4 py-2 rounded-full font-heading text-xs font-bold whitespace-nowrap transition-all border ${
                    selectedStatus === 'COMPLETED'
                      ? 'bg-tertiary/20 text-tertiary border-tertiary shadow-sm'
                      : 'bg-surface-container/50 text-on-surface-variant hover:text-white border-transparent'
                  }`}
                >
                  Completed
                </button>
              </div>

              {/* Queue List */}
              <div className="flex flex-col gap-3.5">
                {isLoading ? (
                  <div className="text-center py-16 text-on-surface-variant flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-xs font-heading font-medium">Loading...</span>
                  </div>
                ) : (
                  filteredAppointments.map(apt => {
                    const isSelected = selectedAppointment?.id === apt.id;
                    return (
                      <div
                        key={apt.id}
                        onClick={() => setSelectedAppointment(apt)}
                        className={`glass-card rounded-2xl p-5 flex flex-col sm:flex-row gap-4 transition-all duration-300 shadow-sm cursor-pointer relative overflow-hidden ${
                          isSelected
                            ? 'border-l-4 border-l-primary border-primary/50 bg-surface-container/80 shadow-neon-cyan'
                            : 'border-l-4 border-l-transparent hover:border-l-primary/50'
                        }`}
                      >
                        <div className="flex-shrink-0 flex items-center justify-center w-12 h-12 rounded-full bg-surface-container-highest text-white font-heading font-extrabold text-sm border border-white/10 shadow-sm">
                          {getInitials(apt.patient?.name)}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                            <h3 className="font-heading font-extrabold text-base text-white truncate">
                              {apt.patient?.name}
                            </h3>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-on-surface-variant flex items-center gap-1 font-medium">
                                <span className="material-symbols-outlined text-sm text-primary">schedule</span>
                                {apt.startTime}
                              </span>
                              <span
                                className={`px-2.5 py-0.5 rounded-full font-heading text-[10px] font-bold border ${
                                  apt.status === 'BOOKED'
                                    ? 'bg-primary/15 text-primary border-primary/30'
                                    : apt.status === 'COMPLETED'
                                    ? 'bg-tertiary/15 text-tertiary border-tertiary/30'
                                    : 'bg-error/15 text-error border-error/30'
                                }`}
                              >
                                {apt.status}
                              </span>
                            </div>
                          </div>

                          <p className="text-xs text-on-surface-variant line-clamp-2 leading-relaxed">
                            <strong className="text-white">Chief Complaint: </strong>
                            {apt.preVisitSummary?.chiefComplaint || apt.symptoms}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}

                {filteredAppointments.length === 0 && !isLoading && (
                  <div className="text-center py-16 glass-card rounded-2xl text-xs text-on-surface-variant">
                    No appointments found matching the selected filters.
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: AI Pre-Visit Brief */}
            <div className="lg:col-span-5 sticky top-0">
              {selectedAppointment ? (
                <div className="glass-card rounded-2xl overflow-hidden flex flex-col ai-gradient-border shadow-2xl">
                  {/* Header */}
                  <div className="bg-gradient-to-r from-secondary-container/40 to-surface-container p-5 border-b border-outline-variant/30 flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="material-symbols-outlined text-secondary text-xl">psychiatry</span>
                      <h3 className="font-heading font-extrabold text-base text-white">AI Pre-Visit Brief</h3>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full font-heading text-xs font-bold flex items-center gap-1.5 border ${
                        selectedAppointment.preVisitSummary?.urgencyLevel === 'HIGH'
                          ? 'bg-error/15 text-error border-error/30'
                          : selectedAppointment.preVisitSummary?.urgencyLevel === 'MEDIUM'
                          ? 'bg-amber-500/15 text-amber-300 border-amber-400/30'
                          : 'bg-tertiary/15 text-tertiary border-tertiary/30'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">warning</span>
                      Urgency: {selectedAppointment.preVisitSummary?.urgencyLevel || 'STANDARD'}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="p-5 flex flex-col gap-5 text-xs">
                    {/* Selected Patient Info */}
                    <div className="flex items-center gap-3.5 pb-4 border-b border-outline-variant/20">
                      <div className="w-11 h-11 rounded-full bg-surface-container-high flex items-center justify-center text-white font-heading font-bold text-sm border border-white/10">
                        {getInitials(selectedAppointment.patient?.name)}
                      </div>
                      <div>
                        <h4 className="font-heading font-extrabold text-sm text-white">{selectedAppointment.patient?.name}</h4>
                        <p className="text-[11px] text-on-surface-variant mt-0.5">
                          Schedule: {selectedAppointment.date} • {selectedAppointment.startTime} - {selectedAppointment.endTime}
                        </p>
                      </div>
                    </div>

                    {/* Patient Raw Symptoms */}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[11px] font-heading font-bold text-on-surface-variant uppercase tracking-wider">
                        Reported Symptoms
                      </span>
                      <p className="p-3 bg-surface-container-low rounded-xl border border-white/5 text-white italic leading-relaxed">
                        "{selectedAppointment.symptoms}"
                      </p>
                    </div>

                    {/* AI Chief Complaint Summary */}
                    {selectedAppointment.preVisitSummary && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[11px] font-heading font-bold text-secondary flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">auto_awesome</span>
                          Synthesized Chief Complaint
                        </span>
                        <div className="p-3 ai-gradient-card rounded-xl text-white">
                          <p className="font-medium">{selectedAppointment.preVisitSummary.chiefComplaint}</p>
                        </div>
                      </div>
                    )}

                    {/* AI Suggested Diagnostic Inquiries */}
                    {selectedAppointment.preVisitSummary?.suggestedQuestions && (
                      <div className="flex flex-col gap-2">
                        <span className="text-[11px] font-heading font-bold text-secondary uppercase tracking-wider flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm">help</span>
                          Suggested Diagnostic Inquiries
                        </span>
                        <ul className="flex flex-col gap-2">
                          {parseQuestions(selectedAppointment.preVisitSummary.suggestedQuestions).map((q, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-on-surface-variant leading-relaxed">
                              <span className="text-primary font-bold">{idx + 1}.</span>
                              <span className="text-white font-medium">{q}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Action Button */}
                    {selectedAppointment.status === 'BOOKED' ? (
                      <button
                        onClick={() => setActiveConsultationApt(selectedAppointment)}
                        className="w-full mt-2 py-3 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-heading font-extrabold text-xs shadow-neon-cyan hover:-translate-y-0.5 transition-all flex items-center justify-center gap-2"
                      >
                        <span>Begin Consultation</span>
                        <span className="material-symbols-outlined text-base">arrow_forward</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => setActiveConsultationApt(selectedAppointment)}
                        className="w-full mt-2 py-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-tertiary font-heading font-bold text-xs border border-tertiary/30 transition-all flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-base">edit_note</span>
                        <span>Review / Edit Clinical Records</span>
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="glass-card rounded-2xl p-12 text-center text-xs text-on-surface-variant">
                  Select a patient queue item to inspect their AI Pre-Visit Brief.
                </div>
              )}
            </div>
          </div>
        )}

        {/* SCHEDULE TAB */}
        {navTab === 'Schedule' && (
          <div className="flex flex-col gap-4">
            <div className="glass-card p-5 rounded-2xl flex items-center justify-between">
              <div>
                <h3 className="font-heading font-extrabold text-lg text-white">Clinical Schedule & Appointments Agenda</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Manage daily consultation time slots, view booked patients, and export calendar schedules.</p>
              </div>
              <button
                onClick={fetchAppointments}
                disabled={isLoading}
                className="px-4 py-2 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 rounded-xl text-xs font-heading font-bold transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">refresh</span> Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {appointments.map(apt => (
                <div key={apt.id} className="glass-card rounded-2xl p-5 border border-white/10 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-heading font-bold text-white text-sm">{apt.patient?.name}</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-heading font-bold ${
                      apt.status === 'BOOKED' ? 'bg-primary/20 text-primary border border-primary/30' : 'bg-tertiary/20 text-tertiary border border-tertiary/30'
                    }`}>
                      {apt.status}
                    </span>
                  </div>
                  <p className="text-xs text-on-surface-variant flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm text-primary">calendar_month</span>
                    Date: {apt.date} • {apt.startTime} - {apt.endTime}
                  </p>
                  <p className="text-xs text-white bg-surface-container p-2.5 rounded-lg border border-white/5 italic">
                    "{apt.symptoms}"
                  </p>
                  <div className="pt-2 flex justify-between items-center border-t border-white/5">
                    <a
                      href={`/api/appointments/${apt.id}/ics`}
                      download
                      className="text-primary hover:underline text-xs font-heading font-bold flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-sm">download</span> .ICS File
                    </a>
                    <button
                      onClick={() => setActiveConsultationApt(apt)}
                      className="px-3 py-1.5 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 rounded-lg text-xs font-heading font-bold"
                    >
                      {apt.status === 'BOOKED' ? 'Start Visit' : 'View Plan'}
                    </button>
                  </div>
                </div>
              ))}

              {appointments.length === 0 && (
                <div className="col-span-3 text-center py-16 glass-card rounded-2xl text-xs text-on-surface-variant">
                  No appointments scheduled for this doctor.
                </div>
              )}
            </div>
          </div>
        )}

        {/* RECORDS TAB */}
        {navTab === 'Records' && (
          <div className="flex flex-col gap-4">
            <div className="glass-card p-5 rounded-2xl flex items-center justify-between">
              <div>
                <h3 className="font-heading font-extrabold text-lg text-white">Completed Consultations & Care Plans</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Archive of completed patient diagnoses, AI translated care summaries, and prescribed medications.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {appointments.filter(a => a.status === 'COMPLETED').map(apt => (
                <div key={apt.id} className="glass-card rounded-2xl p-5 border border-white/10 space-y-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-heading font-extrabold text-base text-white">{apt.patient?.name}</h4>
                      <p className="text-xs text-on-surface-variant">Consultation Date: {apt.date} at {apt.startTime}</p>
                    </div>
                    <span className="px-3 py-1 bg-tertiary/20 text-tertiary font-heading font-bold text-xs rounded-full border border-tertiary/30">
                      COMPLETED
                    </span>
                  </div>

                  {apt.postVisitSummary && (
                    <div className="bg-surface-container p-4 rounded-xl space-y-2 text-xs border border-white/5">
                      <p className="font-heading font-bold text-tertiary flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-sm">verified</span>
                        AI Patient-Friendly Care Plan:
                      </p>
                      <p className="text-white leading-relaxed">{apt.postVisitSummary.patientFriendlySummary}</p>
                      <div className="pt-2 border-t border-white/5">
                        <p className="font-heading font-bold text-on-surface-variant">Clinical Notes:</p>
                        <p className="text-on-surface-variant/90">{apt.postVisitSummary.clinicalNotes}</p>
                      </div>
                      {apt.blockchainRecord && (
                        <div className="pt-2 border-t border-white/5 flex flex-wrap items-center gap-2">
                          <BlockchainBadge status={apt.blockchainRecord.status} compact />
                          <a
                            href={`/verify?h=${apt.blockchainRecord.recordHash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[11px] text-primary hover:underline font-mono"
                            title="Open the public verification page for this prescription"
                          >
                            {shortHash(apt.blockchainRecord.recordHash, 8, 6)}
                          </a>
                          {apt.blockchainRecord.lastError && (
                            <span className="text-[11px] text-orange-300">{apt.blockchainRecord.lastError}</span>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {appointments.filter(a => a.status === 'COMPLETED').length === 0 && (
                <div className="text-center py-16 glass-card rounded-2xl text-xs text-on-surface-variant">
                  No completed consultations found in clinical records yet.
                </div>
              )}
            </div>
          </div>
        )}

        {/* SETTINGS TAB */}
        {navTab === 'Settings' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="glass-card p-6 rounded-2xl border border-white/10 space-y-4 text-xs">
              <h3 className="font-heading font-extrabold text-sm text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-xl">account_circle</span>
                Doctor Profile & Practice Settings
              </h3>
              <div className="space-y-3 text-on-surface-variant">
                <div className="p-3 bg-surface-container rounded-xl border border-white/5">
                  <span className="font-bold text-white block">{user?.name}</span>
                  <span>{user?.email}</span>
                </div>
                <div className="p-3 bg-surface-container rounded-xl border border-white/5 space-y-1">
                  <p><strong className="text-white">Specialization:</strong> {user?.doctorProfile?.specialization || 'Cardiology'}</p>
                  <p><strong className="text-white">Assigned Room:</strong> {user?.doctorProfile?.roomNumber || 'Room 101'}</p>
                  <p><strong className="text-white">Consultation Fee:</strong> ₹{user?.doctorProfile?.consultationFee || 1200}</p>
                  <p><strong className="text-white">Slot Duration:</strong> {user?.doctorProfile?.slotDurationMinutes || 30} minutes</p>
                </div>
              </div>
            </div>

            <div className="glass-card p-6 rounded-2xl border border-white/10 space-y-4 text-xs">
              <h3 className="font-heading font-extrabold text-sm text-white flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-xl">psychiatry</span>
                Clinical AI Preferences
              </h3>
              <div className="space-y-3">
                <div className="p-3 bg-surface-container rounded-xl border border-white/5 space-y-1">
                  <p className="font-bold text-white">AI Diagnostic Questionnaire</p>
                  <p className="text-on-surface-variant text-[11px]">Generate 3 triage inquiries prior to each patient consultation</p>
                  <span className="inline-block mt-1 px-2.5 py-0.5 bg-primary/15 text-primary text-[10px] font-bold rounded">Active</span>
                </div>
                <div className="p-3 bg-surface-container rounded-xl border border-white/5 space-y-1">
                  <p className="font-bold text-white">1-Click Patient Care Plan Translation</p>
                  <p className="text-on-surface-variant text-[11px]">Automatically translate doctor diagnoses into simple language and schedule alarms</p>
                  <span className="inline-block mt-1 px-2.5 py-0.5 bg-tertiary/15 text-tertiary text-[10px] font-bold rounded">Active</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Post-Visit Clinical Consultation & Prescription Modal */}
      {activeConsultationApt && (
        <PrescriptionModal
          appointment={activeConsultationApt}
          onClose={() => setActiveConsultationApt(null)}
          onSuccess={() => {
            setActiveConsultationApt(null);
            fetchAppointments();
          }}
        />
      )}

      {/* AI Clinical Intelligence & Diagnostics Insights Modal */}
      {showAIModal && (
        <AIInsightsModal onClose={() => setShowAIModal(false)} />
      )}
    </div>
  );
};
