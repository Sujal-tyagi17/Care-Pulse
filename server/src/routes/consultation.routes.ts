import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { AuthRequest, PrescriptionItem } from '../types.js';
import { generatePostVisitSummary } from '../services/llm.service.js';
import { sendEmailNotification, getPostVisitSummaryHtml, formatDoctorName } from '../services/email.service.js';
import { createPrescriptionRecord, toRecordSummary } from '../services/blockchain.service.js';

const router = Router();

const prescriptionItemSchema = z.object({
  medicineName: z.string().min(1),
  dosage: z.string().min(1),
  frequency: z.string().min(1), // e.g. "Once daily", "Twice daily", "Three times daily", "Every 8 hours"
  durationDays: z.number().min(1).default(7),
  instructions: z.string().default('Take after meals'),
  reminderTimes: z.array(z.string()).optional()
});

const postVisitSchema = z.object({
  clinicalNotes: z.string().min(5, 'Clinical notes are required.'),
  prescriptions: z.array(prescriptionItemSchema).default([])
});

// Helper to determine reminder times based on frequency
function computeReminderTimes(frequency: string, customTimes?: string[]): string[] {
  if (customTimes && customTimes.length > 0) return customTimes;
  const f = frequency.toLowerCase();
  if (f.includes('three') || f.includes('3 times') || f.includes('tid')) {
    return ['08:00', '14:00', '20:00'];
  }
  if (f.includes('twice') || f.includes('2 times') || f.includes('bid') || f.includes('every 12')) {
    return ['09:00', '21:00'];
  }
  if (f.includes('four') || f.includes('4 times') || f.includes('qid') || f.includes('every 6')) {
    return ['08:00', '12:00', '16:00', '20:00'];
  }
  return ['09:00']; // Once daily default
}

// 1. Doctor submits post-visit notes & prescription -> AI translates & creates medication reminders
router.post('/:appointmentId/post-visit', requireAuth, requireRole(['DOCTOR', 'ADMIN']), async (req: AuthRequest, res) => {
  try {
    const { appointmentId } = req.params;
    const { clinicalNotes, prescriptions } = postVisitSchema.parse(req.body);
    const doctorId = req.user!.id;
    const userRole = req.user!.role;

    const apt = await prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: true,
        doctor: { include: { doctorProfile: true } },
        postVisitSummary: true
      }
    });

    if (!apt) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    if (userRole === 'DOCTOR' && apt.doctorId !== doctorId) {
      return res.status(403).json({ success: false, message: 'Unauthorized. You are not the assigned doctor.' });
    }

    // Generate AI Patient-Friendly Translation
    let aiTranslation;
    try {
      aiTranslation = await generatePostVisitSummary(clinicalNotes, prescriptions);
    } catch (llmErr) {
      console.warn('AI Post-visit translation failed, using fallback:', (llmErr as Error).message);
      aiTranslation = {
        patientFriendlySummary: `Doctor's Notes: ${clinicalNotes}`,
        medicationSchedule: prescriptions.map(p => `${p.medicineName} (${p.dosage}) - ${p.frequency}`).join(', '),
        followUpSteps: 'Follow your medication plan and book a follow-up if symptoms persist.',
        rawResponse: 'Fallback translation'
      };
    }

    // Save or update PostVisitSummary in DB
    const savedSummary = await prisma.postVisitSummary.upsert({
      where: { appointmentId },
      create: {
        appointmentId,
        clinicalNotes,
        prescriptionJson: JSON.stringify(prescriptions),
        patientFriendlySummary: aiTranslation.patientFriendlySummary,
        followUpSteps: `${aiTranslation.followUpSteps}\n\nMedication Guidance:\n${aiTranslation.medicationSchedule}`
      },
      update: {
        clinicalNotes,
        prescriptionJson: JSON.stringify(prescriptions),
        patientFriendlySummary: aiTranslation.patientFriendlySummary,
        followUpSteps: `${aiTranslation.followUpSteps}\n\nMedication Guidance:\n${aiTranslation.medicationSchedule}`
      }
    });

    // Mark appointment as COMPLETED
    await prisma.appointment.update({
      where: { id: appointmentId },
      data: { status: 'COMPLETED' }
    });

    // Create Medication Reminders for each prescription item
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Clean previous reminders for this appointment
    await prisma.medicationReminder.deleteMany({ where: { appointmentId } });

    for (const rx of prescriptions) {
      const reminderTimes = computeReminderTimes(rx.frequency, rx.reminderTimes);
      const endDate = new Date(Date.now() + (rx.durationDays || 7) * 24 * 60 * 60 * 1000);
      const endDateStr = endDate.toISOString().split('T')[0];

      await prisma.medicationReminder.create({
        data: {
          appointmentId,
          patientId: apt.patientId,
          medicineName: rx.medicineName,
          dosage: rx.dosage,
          frequency: rx.frequency,
          reminderTimes: JSON.stringify(reminderTimes),
          instructions: rx.instructions,
          startDate: todayStr,
          endDate: endDateStr,
          isActive: true
        }
      });
    }

    // Fingerprint the prescription, have the doctor's key sign it, and queue it for on-chain anchoring.
    // A blockchain problem must never block the consultation itself.
    let blockchainRecord = null;
    try {
      const rec = await createPrescriptionRecord({
        appointmentId,
        doctorUserId: apt.doctorId, // always the assigned doctor's key, even when an admin submits
        doctorName: apt.doctor.name,
        specialization: apt.doctor.doctorProfile?.specialization ?? 'General',
        patientName: apt.patient.name,
        appointmentDate: apt.date,
        clinicalNotes,
        prescriptions
      });
      blockchainRecord = rec ? toRecordSummary(rec) : null;
    } catch (chainErr) {
      console.error('[Blockchain] Could not create prescription record:', (chainErr as Error).message);
    }

    // Send email to patient with patient-friendly summary
    const doctorDisplayName = formatDoctorName(apt.doctor.name);
    await sendEmailNotification({
      recipientEmail: apt.patient.email,
      recipientName: apt.patient.name,
      subject: `Your Care Plan & Visit Summary - ${doctorDisplayName}`,
      type: 'POST_VISIT_SUMMARY',
      appointmentId,
      html: getPostVisitSummaryHtml({
        patientName: apt.patient.name,
        doctorName: apt.doctor.name,
        date: apt.date,
        patientFriendlySummary: aiTranslation.patientFriendlySummary,
        medicationSchedule: aiTranslation.medicationSchedule || prescriptions.map(p => `${p.medicineName} (${p.dosage}): ${p.frequency}`).join('\n'),
        followUpSteps: aiTranslation.followUpSteps
      })
    });

    return res.json({
      success: true,
      message: 'Consultation summary saved, AI translation created, and medication reminders scheduled.',
      postVisitSummary: {
        id: savedSummary.id,
        clinicalNotes: savedSummary.clinicalNotes,
        patientFriendlySummary: savedSummary.patientFriendlySummary,
        followUpSteps: savedSummary.followUpSteps,
        prescriptions
      },
      blockchainRecord
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Get medication reminders for the current logged-in patient
router.get('/medications', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const reminders = await prisma.medicationReminder.findMany({
      where: { patientId: userId },
      include: {
        appointment: {
          include: {
            doctor: {
              select: { name: true, doctorProfile: { select: { specialization: true } } }
            }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const formatted = reminders.map(r => ({
      id: r.id,
      appointmentId: r.appointmentId,
      medicineName: r.medicineName,
      dosage: r.dosage,
      frequency: r.frequency,
      reminderTimes: JSON.parse(r.reminderTimes || '[]'),
      instructions: r.instructions,
      startDate: r.startDate,
      endDate: r.endDate,
      isActive: r.isActive,
      lastSentAt: r.lastSentAt,
      doctorName: r.appointment.doctor.name,
      specialization: r.appointment.doctor.doctorProfile?.specialization
    }));

    return res.json({ success: true, medications: formatted });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Toggle medication reminder active state
router.patch('/medications/:id/toggle', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const reminder = await prisma.medicationReminder.findFirst({
      where: { id, patientId: userId }
    });

    if (!reminder) {
      return res.status(404).json({ success: false, message: 'Medication reminder not found.' });
    }

    const updated = await prisma.medicationReminder.update({
      where: { id },
      data: { isActive: !reminder.isActive }
    });

    return res.json({ success: true, isActive: updated.isActive });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
