import React, { useState, useEffect } from 'react';
import { TimeSlot, DoctorListItem } from '../types';
import { api } from '../api/client';
import { Clock, AlertTriangle, Sparkles, CheckCircle, Calendar, Download, X } from 'lucide-react';
import { formatDoctorName } from '../utils/format';

interface SymptomModalProps {
  doctor: DoctorListItem;
  date: string;
  slot: TimeSlot;
  holdToken?: string;
  onClose: () => void;
  onSuccess: () => void;
}

const COMMON_SYMPTOM_TAGS = [
  'Chest discomfort',
  'Shortness of breath',
  'Persistent cough',
  'High fever',
  'Severe migraine',
  'Skin rash / itchiness',
  'Joint & back pain',
  'Chronic fatigue',
  'Dizziness / Vertigo'
];

export const SymptomModal: React.FC<SymptomModalProps> = ({
  doctor,
  date,
  slot,
  holdToken,
  onClose,
  onSuccess
}) => {
  const [symptoms, setSymptoms] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bookingResult, setBookingResult] = useState<any | null>(null);

  // 10-minute hold countdown timer (600s)
  const [timeLeft, setTimeLeft] = useState(600);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatSeconds = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleTagClick = (tag: string) => {
    setSymptoms(prev => prev ? `${prev}, ${tag}` : tag);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!symptoms.trim()) {
      setError('Please describe your symptoms before confirming.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await api.bookAppointment({
        doctorId: doctor.id,
        date,
        startTime: slot.startTime,
        endTime: slot.endTime,
        symptoms,
        holdToken
      });
      setBookingResult(res.appointment);
    } catch (err: any) {
      setError(err.message || 'Failed to book appointment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = async () => {
    if (holdToken && !bookingResult) {
      try {
        await api.releaseHold(holdToken);
      } catch {
        // Ignore
      }
    }
    if (bookingResult) {
      onSuccess();
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0b1513]/50 backdrop-blur-md animate-fade-in text-fg">
      <div className="glass-panel rounded-3xl shadow-2xl max-w-xl w-full border border-line-strong overflow-hidden">
        {/* Header */}
        <div className="ai-gradient-card px-6 py-5 text-fg flex items-center justify-between border-b border-line">
          <div>
            <h3 className="font-bold text-lg font-heading">
              {bookingResult ? 'Appointment Confirmed!' : 'Pre-Visit Symptom Questionnaire'}
            </h3>
            <p className="text-xs text-on-surface-variant mt-0.5">
              {formatDoctorName(doctor.name)} • {doctor.specialization}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-xl text-on-surface-variant hover:text-fg hover:bg-fg/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 max-h-[80vh] overflow-y-auto space-y-4">
          {!bookingResult ? (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Slot & Hold Timer Bar */}
              <div className="bg-surface-container border border-primary/30 rounded-2xl p-4 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-on-surface-variant">Selected Slot: </span>
                  <span className="font-bold text-primary font-heading">{date} at {slot.startTime} - {slot.endTime}</span>
                  <p className="text-on-surface-variant/80 mt-1">{doctor.roomNumber || 'Room 101'} • Consultation Fee: ₹{doctor.consultationFee}</p>
                </div>
                <div className="flex items-center gap-1.5 bg-surface-container-high px-3 py-1.5 rounded-xl border border-primary/40 shadow-neon-cyan">
                  <Clock className="w-3.5 h-3.5 text-primary animate-spin" />
                  <span className="font-mono font-bold text-primary">{formatSeconds(timeLeft)}</span>
                </div>
              </div>

              {/* AI Triage Explainer */}
              <div className="bg-secondary-container/15 border border-secondary/30 rounded-2xl p-3.5 text-xs text-secondary flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-secondary shrink-0 mt-0.5 animate-pulse" />
                <p className="leading-relaxed">
                  Our <strong className="text-fg">AI Clinical Triage Assistant</strong> will evaluate your symptoms in advance to calculate an urgency score and prepare diagnostic questions for your doctor.
                </p>
              </div>

              {/* Symptom Input */}
              <div>
                <label className="block text-xs font-bold text-fg mb-2 font-heading">
                  Describe what you are experiencing *
                </label>
                <textarea
                  rows={4}
                  value={symptoms}
                  onChange={e => setSymptoms(e.target.value)}
                  placeholder="E.g., I've had a dull headache for 4 days, mild sensitivity to light, and felt nauseous this morning..."
                  className="w-full text-xs sm:text-sm p-3.5 rounded-2xl bg-surface-container border border-line text-fg focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all placeholder:text-on-surface-variant/50"
                  required
                />
              </div>

              {/* Quick Tags */}
              <div>
                <span className="text-xs font-semibold text-on-surface-variant block mb-2 font-heading">Quick Symptom Tags:</span>
                <div className="flex flex-wrap gap-1.5">
                  {COMMON_SYMPTOM_TAGS.map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleTagClick(tag)}
                      className="text-xs px-3 py-1.5 bg-surface-container hover:bg-primary-container hover:text-fg border border-line hover:border-primary/40 rounded-xl text-on-surface transition-all font-heading"
                    >
                      + {tag}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="p-3.5 bg-error-container/20 border border-error/30 rounded-2xl text-xs text-error flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Actions */}
              <div className="pt-3 flex items-center justify-end gap-3 border-t border-line">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-xs font-semibold text-on-surface-variant hover:text-fg rounded-xl transition-colors font-heading"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || timeLeft === 0}
                  className="px-5 py-2.5 bg-primary   text-on-primary text-xs font-bold rounded-xl shadow-neon-cyan disabled:opacity-50 transition-all flex items-center gap-2 font-heading"
                >
                  {isSubmitting ? (
                    <>
                      <Sparkles className="w-4 h-4 animate-spin" />
                      <span>Analyzing & Confirming...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Confirm & Book Appointment</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Success State with AI Triage Results */
            <div className="space-y-5 animate-fade-in">
              <div className="text-center py-2">
                <div className="w-14 h-14 bg-tertiary-container/20 border border-tertiary/40 text-tertiary rounded-full flex items-center justify-center mx-auto mb-3 shadow-neon-cyan">
                  <CheckCircle className="w-8 h-8" />
                </div>
                <h4 className="font-extrabold text-fg text-xl font-heading">Booking Confirmed!</h4>
                <p className="text-xs text-on-surface-variant mt-1">
                  A confirmation email has been dispatched to your inbox.
                </p>
              </div>

              {/* AI Triage Card */}
              {bookingResult.preVisitSummary && (
                <div className="ai-gradient-card rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-secondary flex items-center gap-1.5 font-heading">
                      <Sparkles className="w-4 h-4 text-secondary animate-pulse" />
                      AI Pre-Visit Triage Summary
                    </span>
                    <span
                      className={`text-xs px-2.5 py-0.5 font-extrabold rounded-full font-heading ${
                        bookingResult.preVisitSummary.urgencyLevel === 'HIGH'
                          ? 'bg-error-container/30 text-error border border-error/40'
                          : bookingResult.preVisitSummary.urgencyLevel === 'MEDIUM'
                          ? 'bg-warning-soft text-warning border border-warning/40'
                          : 'bg-tertiary-container/20 text-tertiary border border-tertiary/40'
                      }`}
                    >
                      Urgency: {bookingResult.preVisitSummary.urgencyLevel}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs text-on-surface-variant font-semibold">Chief Complaint:</p>
                    <p className="text-xs font-medium text-fg mt-1 leading-relaxed">
                      {bookingResult.preVisitSummary.chiefComplaint}
                    </p>
                  </div>

                  {bookingResult.preVisitSummary.suggestedQuestions?.length > 0 && (
                    <div className="pt-2 border-t border-line">
                      <p className="text-xs text-secondary font-semibold mb-1 font-heading">
                        Doctor's AI Suggested Diagnostic Inquiries:
                      </p>
                      <ul className="text-xs text-on-surface-variant space-y-1 list-disc list-inside">
                        {bookingResult.preVisitSummary.suggestedQuestions.map((q: string, idx: number) => (
                          <li key={idx} className="leading-relaxed text-fg/90">{q}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Calendar Sync Actions */}
              <div className="glass-card rounded-2xl p-4 space-y-2.5 border border-line">
                <p className="text-xs font-bold text-fg font-heading">Add to your personal schedule:</p>
                <div className="flex flex-wrap gap-2">
                  {bookingResult.calendarLink && (
                    <a
                      href={bookingResult.calendarLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-primary-container hover:bg-primary text-on-primary rounded-xl text-xs font-bold transition-all shadow-neon-cyan font-heading"
                    >
                      <Calendar className="w-4 h-4" />
                      <span>Add to Google Calendar</span>
                    </a>
                  )}
                  <a
                    href={`/api/appointments/${bookingResult.id}/ics`}
                    download
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-surface-container hover:bg-surface-container-high text-fg border border-line rounded-xl text-xs font-semibold transition-all font-heading"
                  >
                    <Download className="w-4 h-4 text-primary" />
                    <span>Download .ICS File</span>
                  </a>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  onClick={handleClose}
                  className="px-6 py-2.5 bg-primary-container hover:bg-primary text-on-primary text-xs font-bold rounded-xl transition-all shadow-neon-cyan font-heading"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

