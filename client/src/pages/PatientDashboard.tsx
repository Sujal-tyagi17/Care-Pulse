import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api/client';
import {
  DoctorListItem,
  TimeSlot,
  Appointment,
  MedicationReminderItem
} from '../types';
import { SymptomModal } from '../components/SymptomModal';
import { AIInsightsModal } from '../components/AIInsightsModal';
import { Sidebar } from '../components/Sidebar';
import { TopAppBar } from '../components/TopAppBar';
import { formatDoctorName } from '../utils/format';
import { BlockchainBadge } from '../components/BlockchainBadge';
import { VerifiableDocumentModal } from '../components/VerifiableDocumentModal';
import { CERTIFICATE_LABELS } from '../components/certificateText';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { NextUpCard, MetaItem, EmptyState, SkeletonRows, StatusBadge } from '../components/ui';

const DOCTOR_AVATARS: Record<string, string> = {
  'Cardiology': 'https://images.unsplash.com/photo-1622253692010-333f2da6031d?auto=format&fit=crop&w=400&q=80',
  'Neurology': 'https://images.unsplash.com/photo-1537368910025-700350fe46c7?auto=format&fit=crop&w=400&q=80',
  'General Medicine': 'https://images.unsplash.com/photo-1582750433449-648ed127bb54?auto=format&fit=crop&w=400&q=80',
  'Pediatrics': 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=400&q=80',
  'Dermatology': 'https://images.unsplash.com/photo-1651008376811-b90baee60c1f?auto=format&fit=crop&w=400&q=80'
};

export const PatientDashboard: React.FC = () => {
  const { user } = useAuth();
  const [navTab, setNavTab] = useState<'Dashboard' | 'Schedule' | 'Records' | 'Settings'>('Dashboard');
  const [showAIModal, setShowAIModal] = useState(false);

  // Booking & Specialist State
  const [doctors, setDoctors] = useState<DoctorListItem[]>([]);
  const [specializations, setSpecializations] = useState<string[]>([]);
  const [selectedSpec, setSelectedSpec] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedDoctor, setSelectedDoctor] = useState<DoctorListItem | null>(null);

  // Date Strip (Next 7 Days)
  const [dateList, setDateList] = useState<{ dayName: string; dayNum: number; fullDate: string }[]>([]);
  const todayStr = new Date().toISOString().split('T')[0];
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);

  const [availability, setAvailability] = useState<{
    isOnLeave: boolean;
    leaveReason?: string;
    slots: TimeSlot[];
  } | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);

  // Selected Slot & Hold
  const [selectedSlot, setSelectedSlot] = useState<TimeSlot | null>(null);
  const [holdToken, setHoldToken] = useState<string | undefined>(undefined);
  const [holdingSlot, setHoldingSlot] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState(false);

  // Appointments & Medications State
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [docView, setDocView] = useState<{ apt: Appointment; kind: 'prescription' | 'certificate' } | null>(null);
  const [medications, setMedications] = useState<MedicationReminderItem[]>([]);
  const [loadingUserData, setLoadingUserData] = useState(false);

  // Generate 7-day strip (Local / IST timezone accurate)
  useEffect(() => {
    const list = [];
    const now = new Date();
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(now.getDate() + i);
      const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
      const dayNum = d.getDate();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const fullDate = `${year}-${month}-${day}`;
      list.push({ dayName, dayNum, fullDate });
    }
    setDateList(list);
    if (list.length > 0) {
      setSelectedDate(list[0].fullDate);
    }
  }, []);

  // Load Doctors & Specializations
  useEffect(() => {
    async function loadInit() {
      try {
        const [docRes, specRes] = await Promise.all([
          api.getDoctors(),
          api.getSpecializations()
        ]);
        const docs = docRes?.doctors || [];
        const specs = specRes?.specializations || [];
        setDoctors(docs);
        setSpecializations(specs);
        if (docs.length > 0) {
          setSelectedDoctor(docs[0]);
        }
      } catch (err) {
        console.error('Failed to load doctors:', err);
      }
    }
    loadInit();
  }, []);

  // Filter Doctors
  useEffect(() => {
    async function filterDocs() {
      try {
        const res = await api.getDoctors(searchQuery || undefined, selectedSpec);
        const docs = res?.doctors || [];
        setDoctors(docs);
        if (docs.length > 0 && (!selectedDoctor || !docs.find(d => d.id === selectedDoctor.id))) {
          setSelectedDoctor(docs[0]);
        }
      } catch (err) {
        console.error('Failed to filter doctors:', err);
      }
    }
    filterDocs();
  }, [searchQuery, selectedSpec]);

  // Load Doctor Availability
  useEffect(() => {
    if (!selectedDoctor) return;
    async function loadAvailability() {
      setLoadingSlots(true);
      setSelectedSlot(null);
      setHoldToken(undefined);
      try {
        const res = await api.getDoctorAvailability(selectedDoctor!.id, selectedDate);
        setAvailability(res);
        if (res && !res.isOnLeave && res.slots && res.slots.length > 0) {
          const firstAvail = res.slots.find(s => s.isAvailable);
          if (firstAvail) {
            setSelectedSlot(firstAvail);
          }
        }
      } catch (err) {
        console.error('Failed to fetch availability:', err);
      } finally {
        setLoadingSlots(false);
      }
    }
    loadAvailability();
  }, [selectedDoctor, selectedDate]);

  // Load Appointments & Medications
  const refreshUserData = async () => {
    setLoadingUserData(true);
    try {
      const [aptRes, medRes] = await Promise.all([
        api.getAppointments(),
        api.getMedicationReminders()
      ]);
      setAppointments(aptRes?.appointments || []);
      setMedications(medRes?.medications || []);
    } catch (err) {
      console.error('Failed to load user data:', err);
    } finally {
      setLoadingUserData(false);
    }
  };

  useEffect(() => {
    refreshUserData();
  }, []);

  // Pick Slot & Immediately Open Booking Modal with Hold Lock
  const handleSlotPick = async (slot: TimeSlot) => {
    if (!slot.isAvailable || !selectedDoctor) return;
    setSelectedSlot(slot);
    setHoldingSlot(true);
    try {
      const res = await api.holdSlot(selectedDoctor.id, selectedDate, slot.startTime, slot.endTime);
      setHoldToken(res.holdToken);
      setShowBookingModal(true);
    } catch (err: any) {
      alert(err.message || 'Slot could not be reserved. Please select another slot.');
      const updated = await api.getDoctorAvailability(selectedDoctor.id, selectedDate);
      setAvailability(updated);
    } finally {
      setHoldingSlot(false);
    }
  };

  // Open Booking & Acquire Slot Hold Token
  const handleOpenBookingModal = async () => {
    if (!selectedSlot || !selectedDoctor) return;
    setHoldingSlot(true);
    try {
      const res = await api.holdSlot(selectedDoctor.id, selectedDate, selectedSlot.startTime, selectedSlot.endTime);
      setHoldToken(res.holdToken);
      setShowBookingModal(true);
    } catch (err: any) {
      alert(err.message || 'Slot could not be reserved. Please select another slot.');
      const updated = await api.getDoctorAvailability(selectedDoctor.id, selectedDate);
      setAvailability(updated);
    } finally {
      setHoldingSlot(false);
    }
  };

  // Toggle Medication Reminder Alarm
  const handleToggleMedication = async (medId: string) => {
    try {
      // Optimistic local state update
      setMedications(prev => prev.map(m => m.id === medId ? { ...m, isActive: !m.isActive } : m));
      const res = await api.toggleMedicationReminder(medId);
      setMedications(prev => prev.map(m => m.id === medId ? { ...m, isActive: res.isActive } : m));
    } catch (err) {
      console.error('Failed to toggle medication reminder:', err);
      refreshUserData();
    }
  };

  const activeMedsCount = medications.filter(m => m.isActive).length;

  // The soonest booked visit that hasn't started yet drives the "next up" card.
  const nextAppointment = appointments
    .filter((a) => a.status === 'BOOKED' && new Date(`${a.date}T${a.startTime}:00`).getTime() >= Date.now() - 30 * 60 * 1000)
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))[0];
  const formatVisitDate = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

  return (
    <div className="bg-background text-on-background min-h-screen relative selection:bg-primary/30 selection:text-primary">

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
        title="Patient Portal"
        onOpenAIInsights={() => setShowAIModal(true)}
      />

      {/* Main Canvas Area */}
      <main className="fixed top-16 left-0 md:left-64 right-0 bottom-16 md:bottom-0 overflow-y-auto p-4 md:p-6 lg:p-8 flex flex-col xl:flex-row gap-6">
        {navTab === 'Dashboard' && (
          <>
            {/* Left Column: Primary Content */}
            <div className="flex-1 flex flex-col gap-6 min-w-0">
              <header>
                <h1 className="font-heading font-extrabold text-2xl sm:text-3xl text-fg tracking-tight">Good day, {user?.name?.split(' ')[0]}</h1>
                <p className="text-muted mt-1">
                  {activeMedsCount > 0
                    ? `You have ${activeMedsCount} active medication reminder${activeMedsCount === 1 ? '' : 's'}.`
                    : 'Find a specialist and book a time that suits you.'}
                </p>
              </header>

              {nextAppointment ? (
                <NextUpCard
                  label="Your next appointment"
                  icon="event_available"
                  title={nextAppointment.doctor?.name ?? 'Your doctor'}
                  meta={
                    <>
                      <MetaItem icon="calendar_month">{formatVisitDate(nextAppointment.date)}</MetaItem>
                      <MetaItem icon="schedule">
                        {nextAppointment.startTime} – {nextAppointment.endTime}
                      </MetaItem>
                      {nextAppointment.doctor?.roomNumber && <MetaItem icon="meeting_room">{nextAppointment.doctor.roomNumber}</MetaItem>}
                    </>
                  }
                  actions={
                    <button onClick={() => setNavTab('Schedule')} className="btn btn-primary">
                      View details
                    </button>
                  }
                />
              ) : (
                <NextUpCard
                  label="No upcoming visits"
                  icon="calendar_add_on"
                  title="Book a doctor in under a minute"
                  meta={<span>Pick a specialist below, choose a slot, and it's held for you for 10 minutes.</span>}
                  actions={
                    <a href="#find-doctor" className="btn btn-primary">
                      Find a doctor
                    </a>
                  }
                />
              )}

              {/* Specialist Discovery Section */}
              <section id="find-doctor" className="flex flex-col gap-4 scroll-mt-4">
                {/* Filters & Search */}
                <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 glass-card p-4 rounded-2xl">
                  {/* Category Pills */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setSelectedSpec('ALL')}
                      className={`font-heading text-xs font-bold px-4 py-2 rounded-full transition-all ${
                        selectedSpec === 'ALL'
                          ? 'bg-primary text-on-primary shadow-neon-cyan'
                          : 'bg-surface-container/60 hover:bg-surface-container text-on-surface border border-outline-variant/40'
                      }`}
                    >
                      All Specialties
                    </button>
                    {specializations.map(spec => (
                      <button
                        key={spec}
                        onClick={() => setSelectedSpec(spec)}
                        className={`font-heading text-xs font-bold px-4 py-2 rounded-full border transition-all ${
                          selectedSpec === spec
                            ? 'bg-primary text-on-primary border-primary shadow-neon-cyan'
                            : 'bg-surface-container/60 hover:bg-surface-container text-on-surface border-outline-variant/40'
                        }`}
                      >
                        {spec}
                      </button>
                    ))}
                  </div>

                  {/* Search Input */}
                  <div className="relative min-w-[240px]">
                    <Icon name="search" className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-base" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search doctor, specialty, or clinic..."
                      className="w-full bg-surface-container/60 text-on-surface border border-outline-variant/40 focus:border-primary focus:ring-1 focus:ring-primary rounded-full pl-10 pr-9 py-2 text-xs outline-none transition-all placeholder:text-on-surface-variant/70"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-fg p-0.5"
                        title="Clear search"
                      >
                        <Icon name="close" className="text-sm" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Doctor Grid or Empty State */}
                {doctors.length === 0 ? (
                  <div className="glass-card rounded-2xl p-10 flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface-variant/60 border border-outline-variant">
                      <Icon name="person_search" className="text-3xl" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-fg font-heading">No Specialists Found</h3>
                      <p className="text-xs text-on-surface-variant mt-1 max-w-sm">
                        {searchQuery && selectedSpec !== 'ALL'
                          ? `No doctors found matching "${searchQuery}" in ${selectedSpec}. Try searching across All Specialties.`
                          : searchQuery
                          ? `No doctors found matching "${searchQuery}".`
                          : `No doctors currently available in ${selectedSpec}.`}
                      </p>
                    </div>
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSelectedSpec('ALL');
                      }}
                      className="bg-primary hover:bg-primary-container text-on-primary font-heading font-bold text-xs px-5 py-2.5 rounded-full transition-all shadow-neon-cyan flex items-center gap-2"
                    >
                      <Icon name="restart_alt" className="text-sm" />
                      <span>Show All Specialists</span>
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {doctors.map(doc => {
                    const isSelected = selectedDoctor?.id === doc.id;
                    const avatarUrl = DOCTOR_AVATARS[doc.specialization] || DOCTOR_AVATARS['General Medicine'];
                    return (
                      <div
                        key={doc.id}
                        onClick={() => setSelectedDoctor(doc)}
                        className={`glass-card rounded-2xl p-5 flex flex-col justify-between gap-4 cursor-pointer transition-all duration-300 ${
                          isSelected
                            ? 'border-primary ring-2 ring-primary/50 shadow-neon-cyan bg-surface-container/90 scale-[1.01]'
                            : 'hover:border-primary/40'
                        }`}
                      >
                        <div className="flex gap-4">
                          <div className="relative shrink-0">
                            <Avatar src={avatarUrl} name={doc.name} className="w-14 h-14 text-base" />
                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-tertiary rounded-full border-2 border-surface flex items-center justify-center"></div>
                          </div>
                          <div className="flex flex-col justify-center truncate">
                            <h3 className="font-heading font-extrabold text-base text-fg truncate">
                              {doc.name}
                            </h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="bg-secondary/15 text-secondary border border-secondary/25 px-2.5 py-0.5 rounded-full font-heading text-xs font-bold">
                                {doc.specialization}
                              </span>
                            </div>
                          </div>
                        </div>

                        <p className="text-xs text-on-surface-variant line-clamp-2 leading-relaxed">
                          {doc.bio || 'Experienced clinic specialist providing dedicated diagnostic consultations and preventive medical care.'}
                        </p>

                        <div className="flex items-center justify-between py-2.5 border-y border-outline-variant/20 text-xs text-on-surface-variant">
                          <div className="flex items-center gap-1.5">
                            <Icon name="payments" className="text-sm text-primary" />
                            <span className="text-fg font-heading font-bold">₹{doc.consultationFee} / visit</span>
                          </div>
                          <div className="w-px h-4 bg-outline-variant/30"></div>
                          <div className="flex items-center gap-1.5">
                            <Icon name="meeting_room" className="text-sm text-secondary" />
                            <span className="text-fg font-medium">{doc.roomNumber || 'Room 101'}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedDoctor(doc);
                            }}
                            className={`flex-1 font-heading font-bold text-xs py-2.5 rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                              isSelected
                                ? 'bg-primary text-on-primary shadow-neon-cyan'
                                : 'bg-surface-container-highest/70 hover:bg-primary hover:text-on-primary text-on-surface border border-outline-variant/40'
                            }`}
                          >
                            <Icon name="calendar_month" className="text-base" />
                            <span>{isSelected ? '✓ Selected: choose a time slot' : 'Select & View Slots'}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <p className="flex items-start gap-2 text-sm text-muted">
              <Icon name="warning" className="text-base text-danger mt-0.5" />
              In a medical emergency, call 112 or go to the nearest emergency room. Don't wait for an appointment.
            </p>
            </div>

            {/* Right Column: Sidebar Preview (Expanded Booking & Slots Panel) */}
            <aside className="w-full xl:w-[400px] shrink-0 xl:sticky xl:top-0">
              <div className="glass-card border border-outline-variant/50 rounded-2xl flex flex-col overflow-hidden shadow-2xl relative">
                {/* Subtle Gradient Header Bg */}
                

                {selectedDoctor ? (
                  <>
                    {/* Expanded Profile Header */}
                    <div className="p-4 pb-3 flex flex-col items-center text-center relative z-10 border-b border-outline-variant/20">
                      <Avatar
                        src={DOCTOR_AVATARS[selectedDoctor.specialization] || DOCTOR_AVATARS['General Medicine']}
                        name={selectedDoctor.name}
                        className="w-14 h-14 text-base mb-1.5"
                      />
                      <h2 className="font-heading font-extrabold text-base text-fg">
                        {selectedDoctor.name}
                      </h2>
                      <p className="text-xs text-primary font-heading font-bold">
                        {selectedDoctor.specialization} Specialist
                      </p>
                      <div className="flex items-center gap-1 mt-1 text-secondary text-xs">
                        <Icon name="star" className="text-xs" />
                        <Icon name="star" className="text-xs" />
                        <Icon name="star" className="text-xs" />
                        <Icon name="star" className="text-xs" />
                        <Icon name="star_half" className="text-xs" />
                        <span className="text-xs text-on-surface-variant ml-1">(128 Patient Reviews)</span>
                      </div>
                    </div>

                    {/* Scrollable Booking Content */}
                    <div className="p-4 flex flex-col gap-4 overflow-y-auto max-h-[340px]">
                      {/* 7-Day Date Strip */}
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <h4 className="font-heading text-xs font-bold text-fg">
                            Select Consultation Date
                          </h4>
                          <span className="text-xs text-primary font-medium">Upcoming 7 Days</span>
                        </div>

                        <div className="flex items-center gap-2 overflow-x-auto pb-1 hide-scrollbar">
                          {dateList.map(item => {
                            const isDateSelected = selectedDate === item.fullDate;
                            return (
                              <button
                                key={item.fullDate}
                                onClick={() => setSelectedDate(item.fullDate)}
                                className={`flex flex-col items-center justify-center min-w-[52px] h-14 rounded-xl transition-all cursor-pointer ${
                                  isDateSelected
                                    ? 'bg-primary text-on-primary font-bold shadow-neon-cyan scale-95'
                                    : 'bg-surface-container/50 hover:bg-surface-container border border-outline-variant/40 text-on-surface'
                                }`}
                              >
                                <span className="text-[9px] opacity-80 font-heading">{item.dayName}</span>
                                <span className="font-heading font-extrabold text-sm">{item.dayNum}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Time Slots Matrix */}
                      <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-heading text-xs font-bold text-fg">
                            Available Consultation Slots
                          </h4>
                          <span className="text-xs text-on-surface-variant">({selectedDoctor.slotDurationMinutes} min slots)</span>
                        </div>

                        {loadingSlots ? (
                          <div className="py-8 text-center text-on-surface-variant flex flex-col items-center gap-2">
                            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                            <span className="text-xs">Loading...</span>
                          </div>
                        ) : availability?.isOnLeave ? (
                          <div className="p-4 bg-error-container/20 border border-error/30 rounded-xl text-center text-xs space-y-1">
                            <Icon name="event_busy" className="text-error text-2xl" />
                            <p className="font-heading font-bold text-fg">Doctor On Approved Leave</p>
                            <p className="text-on-surface-variant">{availability.leaveReason || 'Unavailable on this date.'}</p>
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {/* Passed Day Banner */}
                            {availability && availability.slots.length > 0 && availability.slots.every(s => !s.isAvailable && s.status === 'PAST') && (
                              <div className="p-3 bg-info-soft border border-info/40 rounded-xl text-center space-y-1">
                                <div className="flex items-center justify-center gap-1.5 text-info font-heading font-bold text-xs">
                                  <Icon name="schedule" className="text-base" />
                                  <span>Today's Consultation Hours Have Ended</span>
                                </div>
                                <p className="text-xs text-muted">
                                  Please select an upcoming date (e.g. tomorrow) above to book your appointment.
                                </p>
                              </div>
                            )}

                            <div className="grid grid-cols-3 gap-2">
                              {availability?.slots.map((slot, idx) => {
                                const isPicked = selectedSlot?.startTime === slot.startTime;
                                const isPast = slot.status === 'PAST';
                                const isBooked = slot.status === 'BOOKED';
                                const isHeld = slot.status === 'HELD';

                                return (
                                  <button
                                    key={idx}
                                    disabled={!slot.isAvailable || holdingSlot}
                                    onClick={() => handleSlotPick(slot)}
                                    title={
                                      isPast
                                        ? 'Time slot has already passed for today (IST)'
                                        : isBooked
                                        ? 'Slot already booked'
                                        : isHeld
                                        ? 'Slot temporarily held'
                                        : 'Available slot'
                                    }
                                    className={`py-2.5 px-2 rounded-lg text-xs font-heading font-bold transition-all border ${
                                      isPicked
                                        ? 'bg-primary text-on-primary border-primary shadow-neon-cyan ring-1 ring-primary'
                                        : slot.isAvailable
                                        ? 'bg-surface-container/60 hover:bg-primary/20 hover:border-primary border-outline-variant/40 text-fg'
                                        : isHeld
                                        ? 'bg-warning-soft border-warning/40 text-warning cursor-not-allowed'
                                        : isBooked
                                        ? 'bg-danger-soft border-danger/40 text-danger line-through cursor-not-allowed'
                                        : 'bg-surface-container-lowest/30 border-line text-muted line-through cursor-not-allowed opacity-40'
                                    }`}
                                  >
                                    <span>{slot.startTime}</span>
                                  </button>
                                );
                              })}

                              {availability?.slots.length === 0 && (
                                <div className="col-span-3 py-6 text-center text-xs text-on-surface-variant bg-surface-container/30 rounded-xl">
                                  No consultation slots available on this date.
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Sticky Footer CTA */}
                    <div className="p-4 bg-surface-container-lowest/90 backdrop-blur-xl border-t border-outline-variant/25">
                      <button
                        disabled={!selectedSlot || availability?.isOnLeave || holdingSlot}
                        onClick={handleOpenBookingModal}
                        className="w-full bg-primary hover:brightness-110 text-on-primary font-heading font-extrabold text-xs py-3.5 rounded-xl transition-all shadow-neon-cyan hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-40"
                      >
                        <Icon name="calendar_add_on" className="text-base" />
                        <span>
                          {holdingSlot
                            ? 'Reserving Slot...'
                            : selectedSlot
                            ? `Confirm & Book Appointment (${selectedSlot.startTime})`
                            : availability?.slots && availability.slots.every(s => !s.isAvailable)
                            ? 'Pick An Upcoming Date Above'
                            : 'Select Time Slot & Book'}
                        </span>
                        <Icon name="arrow_forward" className="text-base" />
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="p-12 text-center text-xs text-on-surface-variant">
                    Select a specialist from the list to view profile and slots.
                  </div>
                )}
              </div>
            </aside>
          </>
        )}

        {/* Schedule Tab: Consultation History */}
        {navTab === 'Schedule' && (
          <div className="flex-1 space-y-4">
            <div className="glass-card p-5 rounded-2xl flex items-center justify-between">
              <div>
                <h3 className="font-heading font-extrabold text-lg text-fg">Your Scheduled Consultations & Visits</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Manage booked appointments, view diagnostic summaries, and download calendar schedules.</p>
              </div>
              <button
                onClick={refreshUserData}
                disabled={loadingUserData}
                className="px-4 py-2 bg-primary/15 hover:bg-primary/25 text-primary border border-primary/30 rounded-xl text-xs font-heading font-bold transition-all"
              >
                Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
              {loadingUserData && appointments.length === 0 && <SkeletonRows rows={3} />}
              {appointments.map(apt => (
                <div key={apt.id} className="glass-card rounded-2xl p-5 border border-line space-y-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-heading font-extrabold text-base text-fg">
                          {formatDoctorName(apt.doctor?.name)}
                        </span>
                        <span className="text-xs text-muted">{apt.doctor?.specialization}</span>
                        <StatusBadge status={apt.status} />
                      </div>
                      <p className="text-xs text-on-surface-variant mt-1">
                        {formatVisitDate(apt.date)}, {apt.startTime} – {apt.endTime} in {apt.doctor?.roomNumber || 'Room 101'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <a
                        href={`/api/appointments/${apt.id}/ics`}
                        download
                        className="px-3 py-1.5 text-xs font-bold text-fg bg-surface-container hover:bg-surface-container-high rounded-xl border border-line transition-colors flex items-center gap-1 font-heading"
                      >
                        <Icon name="download" className="text-sm text-primary" />
                        <span>.ICS</span>
                      </a>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="bg-surface-container/60 p-3.5 rounded-xl border border-line space-y-1">
                      <span className="text-xs font-bold text-on-surface-variant block font-heading">Reported Symptoms:</span>
                      <p className="text-fg italic">"{apt.symptoms}"</p>
                    </div>

                    {apt.preVisitSummary && (
                      <div className="ai-gradient-card p-3.5 rounded-xl space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-secondary font-heading flex items-center gap-1">
                            <Icon name="auto_awesome" className="text-sm" />
                            AI Pre-Visit Assessment
                          </span>
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-surface-container text-fg font-heading">
                            Urgency: {apt.preVisitSummary.urgencyLevel}
                          </span>
                        </div>
                        <p className="text-fg text-xs">{apt.preVisitSummary.chiefComplaint}</p>
                      </div>
                    )}
                  </div>

                  {apt.postVisitSummary && (
                    <div className="p-4 bg-tertiary-container/10 border border-tertiary/30 rounded-xl space-y-2 text-xs">
                      <span className="font-heading font-bold text-tertiary text-sm flex items-center gap-1.5">
                        <Icon name="verified" className="text-base" />
                        Doctor's Care Plan & AI Translated Summary
                      </span>
                      <p className="text-fg leading-relaxed bg-surface-container p-3 rounded-lg border border-line">
                        {apt.postVisitSummary.patientFriendlySummary}
                      </p>
                      {apt.blockchainRecord && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                          <BlockchainBadge status={apt.blockchainRecord.status} />
                          <button
                            onClick={() => setDocView({ apt, kind: 'prescription' })}
                            className="px-3 py-1.5 text-xs font-bold text-fg bg-surface-container hover:bg-surface-container-high rounded-xl border border-line transition-colors flex items-center gap-1 font-heading"
                          >
                            <Icon name="qr_code_2" className="text-sm text-primary" />
                            Verifiable prescription
                          </button>
                        </div>
                      )}
                      {apt.certificate && (
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-line">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-fg font-semibold">{CERTIFICATE_LABELS[apt.certificate.certificate.type]}</span>
                            <BlockchainBadge status={apt.certificate.status} compact />
                          </div>
                          <button
                            onClick={() => setDocView({ apt, kind: 'certificate' })}
                            className="px-3 py-1.5 text-xs font-bold text-fg bg-surface-container hover:bg-surface-container-high rounded-xl border border-line transition-colors flex items-center gap-1 font-heading"
                          >
                            <Icon name="workspace_premium" className="text-sm text-primary" />
                            View & print
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {!loadingUserData && appointments.length === 0 && (
                <EmptyState
                  icon="calendar_add_on"
                  title="Book your first visit"
                  body="Your appointments, care plans and verifiable prescriptions will show up here."
                  action={
                    <button onClick={() => setNavTab('Dashboard')} className="btn btn-primary">
                      Find a doctor
                    </button>
                  }
                />
              )}
            </div>
          </div>
        )}

        {/* Records Tab: Medication Reminders */}
        {(navTab === 'Records' || navTab === 'Settings') && (
          <div className="flex-1 space-y-4">
            <div className="glass-card p-5 rounded-2xl flex items-center justify-between">
              <div>
                <h3 className="font-heading font-extrabold text-lg text-fg">Active Medication Schedules & Alerts</h3>
                <p className="text-xs text-on-surface-variant mt-0.5">Automated email alerts are dispatched at your prescribed daily dose timings. Use the switches below to enable/disable daily alarms.</p>
              </div>
              <button
                onClick={refreshUserData}
                disabled={loadingUserData}
                className="px-4 py-2 bg-tertiary/15 hover:bg-tertiary/25 text-tertiary border border-tertiary/30 rounded-xl text-xs font-heading font-bold transition-all flex items-center gap-1.5"
              >
                <Icon name="refresh" className="text-sm" /> Refresh
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {medications.map(med => {
                const doctorDisplayName = formatDoctorName(med.doctorName);
                return (
                  <div key={med.id} className="glass-card rounded-2xl p-5 border border-line space-y-3 relative overflow-hidden">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-tertiary/15 text-tertiary border border-tertiary/30 font-heading">
                          {med.dosage} • {med.frequency}
                        </span>
                        <h4 className="font-heading font-extrabold text-base text-fg mt-1.5">{med.medicineName}</h4>
                        <p className="text-xs text-on-surface-variant">Prescribed by {doctorDisplayName}</p>
                      </div>

                      {/* Interactive Alarm Toggle Switch */}
                      <div className="flex flex-col items-end gap-1.5">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={med.isActive}
                          onClick={() => handleToggleMedication(med.id)}
                          className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                            med.isActive ? 'bg-tertiary shadow-neon-ai' : 'bg-surface-container-highest'
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                              med.isActive ? 'translate-x-5' : 'translate-x-0'
                            }`}
                          />
                        </button>
                        <span className={`text-xs font-heading font-bold ${med.isActive ? 'text-tertiary' : 'text-on-surface-variant'}`}>
                          {med.isActive ? 'Alarm Active' : 'Alarm Paused'}
                        </span>
                      </div>
                    </div>

                    <div className="bg-surface-container p-3 rounded-xl text-xs space-y-1.5 border border-line">
                      <div className="flex justify-between items-center text-on-surface-variant">
                        <span className="flex items-center gap-1.5">
                          <Icon name={med.isActive ? 'alarm_on' : 'alarm_off'} className={`text-sm ${med.isActive ? 'text-tertiary' : 'text-on-surface-variant'}`} />
                          Daily Alert Times:
                        </span>
                        <span className="font-mono font-bold text-tertiary">{med.reminderTimes?.join(', ') || '09:00'}</span>
                      </div>
                      {med.instructions && (
                        <p className="text-on-surface-variant pt-1.5 border-t border-line leading-relaxed">
                          <strong className="text-fg">Instructions: </strong>{med.instructions}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}

              {medications.length === 0 && (
                <EmptyState
                  className="md:col-span-2"
                  icon="medication"
                  title="No medication reminders yet"
                  body="When your doctor prescribes something, reminders are set up automatically at the right times of day."
                />
              )}
            </div>
          </div>
        )}
      </main>

      {/* Pre-Visit Symptom Questionnaire & Confirmation Modal */}
      {selectedDoctor && selectedSlot && showBookingModal && (
        <SymptomModal
          doctor={selectedDoctor}
          date={selectedDate}
          slot={selectedSlot}
          holdToken={holdToken}
          onClose={() => setShowBookingModal(false)}
          onSuccess={() => {
            setShowBookingModal(false);
            setSelectedSlot(null);
            setHoldToken(undefined);
            setNavTab('Schedule');
            refreshUserData();
          }}
        />
      )}

      {/* AI Clinical Intelligence & Symptom Insights Modal */}
      {docView && <VerifiableDocumentModal appointment={docView.apt} kind={docView.kind} onClose={() => setDocView(null)} />}

      {showAIModal && (
        <AIInsightsModal onClose={() => setShowAIModal(false)} />
      )}
    </div>
  );
};
