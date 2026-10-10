import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../db.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { AuthRequest } from '../types.js';
import { generatePreVisitSummary } from '../services/llm.service.js';
import { sendEmailNotification, getBookingConfirmationHtml, formatDoctorName } from '../services/email.service.js';
import { syncGoogleCalendarEvent, generateIcsContent, deleteGoogleCalendarEvent } from '../services/calendar.service.js';
import { getISTDateAndTime } from './doctor.routes.js';
import { toRecordSummary } from '../services/blockchain.service.js';

const router = Router();

// 1. Hold a slot temporarily for 10 minutes
const holdSlotSchema = z.object({
  doctorId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date format. Use YYYY-MM-DD'),
  startTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid start time. Use HH:MM'),
  endTime: z.string().regex(/^\d{2}:\d{2}$/, 'Invalid end time. Use HH:MM')
});

router.post('/hold', requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = holdSlotSchema.parse(req.body);
    const patientId = req.user!.id;

    // Check if slot has already passed in IST
    const { todayIST, nowISTTime } = getISTDateAndTime();
    if (data.date < todayIST || (data.date === todayIST && data.startTime <= nowISTTime)) {
      return res.status(400).json({
        success: false,
        message: 'This consultation time slot has already passed. Please select an upcoming slot.'
      });
    }

    // Check if doctor is on leave
    const leave = await prisma.doctorLeave.findUnique({
      where: { doctorId_leaveDate: { doctorId: data.doctorId, leaveDate: data.date } }
    });
    if (leave) {
      return res.status(400).json({ success: false, message: 'Doctor is on leave on this date.' });
    }

    // Check existing booking
    const existing = await prisma.appointment.findFirst({
      where: {
        doctorId: data.doctorId,
        date: data.date,
        startTime: data.startTime,
        status: { in: ['BOOKED', 'COMPLETED'] }
      }
    });
    if (existing) {
      return res.status(409).json({ success: false, message: 'This slot is already booked.' });
    }

    // Check if currently held by someone else
    const activeHold = await prisma.slotHold.findFirst({
      where: {
        doctorId: data.doctorId,
        date: data.date,
        startTime: data.startTime,
        expiresAt: { gt: new Date() },
        patientId: { not: patientId }
      }
    });

    if (activeHold) {
      return res.status(409).json({
        success: false,
        message: 'This slot is temporarily held by another patient. Please choose another slot or try again in a few minutes.'
      });
    }

    // Create or renew hold (10 minutes TTL)
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const holdToken = crypto.randomBytes(24).toString('hex');

    // Clean any previous holds for this user on this slot
    await prisma.slotHold.deleteMany({
      where: { doctorId: data.doctorId, date: data.date, startTime: data.startTime, patientId }
    });

    const hold = await prisma.slotHold.create({
      data: {
        doctorId: data.doctorId,
        patientId,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        holdToken,
        expiresAt
      }
    });

    return res.json({
      success: true,
      message: 'Slot held for 10 minutes.',
      holdToken: hold.holdToken,
      expiresAt: hold.expiresAt
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Release a slot hold
router.delete('/hold/:holdToken', requireAuth, async (req, res) => {
  try {
    const { holdToken } = req.params;
    await prisma.slotHold.deleteMany({ where: { holdToken } });
    return res.json({ success: true, message: 'Slot hold released.' });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Confirm booking with AI pre-visit triage analysis & transaction lock
const bookSchema = z.object({
  doctorId: z.string(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
  symptoms: z.string().min(5, 'Please provide details about your symptoms or reason for visit.'),
  holdToken: z.string().optional()
});

router.post('/book', requireAuth, async (req: AuthRequest, res) => {
  try {
    const data = bookSchema.parse(req.body);
    const patientId = req.user!.id;

    // Concurrency Protection & Transaction
    const appointmentResult = await prisma.$transaction(async (tx) => {
      // 1. Verify Doctor exists & is not on leave
      const doctor = await tx.user.findUnique({
        where: { id: data.doctorId },
        include: { doctorProfile: true }
      });

      if (!doctor || !doctor.doctorProfile) {
        throw new Error('DOCTOR_NOT_FOUND');
      }

      const leave = await tx.doctorLeave.findUnique({
        where: { doctorId_leaveDate: { doctorId: data.doctorId, leaveDate: data.date } }
      });

      if (leave) {
        throw new Error('DOCTOR_ON_LEAVE');
      }

      // 2. Strict Check for existing active booking
      const conflictingBooking = await tx.appointment.findFirst({
        where: {
          doctorId: data.doctorId,
          date: data.date,
          startTime: data.startTime,
          status: { in: ['BOOKED', 'COMPLETED'] }
        }
      });

      if (conflictingBooking) {
        throw new Error('SLOT_ALREADY_BOOKED');
      }

      // 3. Create Appointment
      const appointment = await tx.appointment.create({
        data: {
          patientId,
          doctorId: data.doctorId,
          date: data.date,
          startTime: data.startTime,
          endTime: data.endTime,
          symptoms: data.symptoms,
          status: 'BOOKED'
        },
        include: {
          patient: true,
          doctor: { include: { doctorProfile: true } }
        }
      });

      // 4. Release hold
      if (data.holdToken) {
        await tx.slotHold.deleteMany({ where: { holdToken: data.holdToken } });
      }
      await tx.slotHold.deleteMany({
        where: { doctorId: data.doctorId, date: data.date, startTime: data.startTime }
      });

      return appointment;
    });

    // 5. Run LLM Pre-Visit Symptom Analysis (Safe with Fallback)
    let preVisitAnalysis;
    try {
      preVisitAnalysis = await generatePreVisitSummary(data.symptoms);
    } catch (llmErr) {
      console.warn('LLM analysis error:', (llmErr as Error).message);
      preVisitAnalysis = {
        urgencyLevel: 'LOW' as const,
        chiefComplaint: data.symptoms.substring(0, 80),
        suggestedQuestions: ['What is the duration of symptoms?', 'Are you taking any current medication?', 'Do you have allergies?'],
        rawResponse: 'Fallback generated'
      };
    }

    // Save Pre-Visit Summary to DB
    const savedPreSummary = await prisma.preVisitSummary.create({
      data: {
        appointmentId: appointmentResult.id,
        urgencyLevel: preVisitAnalysis.urgencyLevel,
        chiefComplaint: preVisitAnalysis.chiefComplaint,
        suggestedQuestions: JSON.stringify(preVisitAnalysis.suggestedQuestions),
        rawResponse: preVisitAnalysis.rawResponse
      }
    });

    // 6. Google Calendar Event Creation & Link Generation
    const doctorDisplayName = formatDoctorName(appointmentResult.doctor.name);
    const calEvent = await syncGoogleCalendarEvent({
      id: appointmentResult.id,
      title: `CarePulse Consultation: ${appointmentResult.patient.name} & ${doctorDisplayName}`,
      description: `Chief Complaint: ${preVisitAnalysis.chiefComplaint}\nSymptoms: ${data.symptoms}\nUrgency: ${preVisitAnalysis.urgencyLevel}`,
      location: appointmentResult.doctor.doctorProfile?.roomNumber || 'Clinic Room 101',
      startDate: data.date,
      startTime: data.startTime,
      endDate: data.date,
      endTime: data.endTime,
      doctorEmail: appointmentResult.doctor.email,
      patientEmail: appointmentResult.patient.email
    });

    if (calEvent.eventId) {
      await prisma.appointment.update({
        where: { id: appointmentResult.id },
        data: { googleCalendarEventId: calEvent.eventId }
      });
    }

    // 7. Dispatch Confirmation Emails
    const emailHtmlPatient = getBookingConfirmationHtml({
      patientName: appointmentResult.patient.name,
      doctorName: appointmentResult.doctor.name,
      specialization: appointmentResult.doctor.doctorProfile?.specialization || 'Specialist',
      date: data.date,
      time: `${data.startTime} - ${data.endTime}`,
      roomNumber: appointmentResult.doctor.doctorProfile?.roomNumber || undefined,
      urgencyLevel: preVisitAnalysis.urgencyLevel,
      calendarLink: calEvent.htmlLink
    });

    await sendEmailNotification({
      recipientEmail: appointmentResult.patient.email,
      recipientName: appointmentResult.patient.name,
      subject: `Appointment Confirmed: ${doctorDisplayName} on ${data.date}`,
      type: 'BOOKING_CONFIRMATION',
      appointmentId: appointmentResult.id,
      html: emailHtmlPatient
    });

    return res.status(201).json({
      success: true,
      message: 'Appointment booked successfully with AI Pre-Visit summary generated.',
      appointment: {
        id: appointmentResult.id,
        date: appointmentResult.date,
        startTime: appointmentResult.startTime,
        endTime: appointmentResult.endTime,
        status: appointmentResult.status,
        symptoms: appointmentResult.symptoms,
        doctor: {
          id: appointmentResult.doctor.id,
          name: appointmentResult.doctor.name,
          specialization: appointmentResult.doctor.doctorProfile?.specialization,
          roomNumber: appointmentResult.doctor.doctorProfile?.roomNumber
        },
        preVisitSummary: {
          urgencyLevel: savedPreSummary.urgencyLevel,
          chiefComplaint: savedPreSummary.chiefComplaint,
          suggestedQuestions: JSON.parse(savedPreSummary.suggestedQuestions)
        },
        calendarLink: calEvent.htmlLink
      }
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    if (err.message === 'SLOT_ALREADY_BOOKED') {
      return res.status(409).json({ success: false, message: 'This slot was just booked by another patient. Please choose another slot.' });
    }
    if (err.message === 'DOCTOR_ON_LEAVE') {
      return res.status(400).json({ success: false, message: 'Doctor is on approved leave on the selected date.' });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 3. List appointments for user (Patient or Doctor)
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const { status, date } = req.query;

    const whereClause: any = {};
    if (userRole === 'PATIENT') {
      whereClause.patientId = userId;
    } else if (userRole === 'DOCTOR') {
      whereClause.doctorId = userId;
    }

    if (status && status !== 'ALL') {
      whereClause.status = String(status);
    }
    if (date) {
      whereClause.date = String(date);
    }

    const appointments = await prisma.appointment.findMany({
      where: whereClause,
      include: {
        patient: { select: { id: true, name: true, email: true, phone: true } },
        doctor: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            doctorProfile: true
          }
        },
        preVisitSummary: true,
        postVisitSummary: true,
        medicationReminders: true,
        blockchainRecords: { where: { isCurrent: true }, take: 1 }
      },
      orderBy: [{ date: 'desc' }, { startTime: 'desc' }]
    });

    const formatted = appointments.map(apt => ({
      id: apt.id,
      date: apt.date,
      startTime: apt.startTime,
      endTime: apt.endTime,
      status: apt.status,
      symptoms: apt.symptoms,
      cancelReason: apt.cancelReason,
      patient: apt.patient,
      doctor: {
        id: apt.doctor.id,
        name: apt.doctor.name,
        specialization: apt.doctor.doctorProfile?.specialization,
        roomNumber: apt.doctor.doctorProfile?.roomNumber,
        consultationFee: apt.doctor.doctorProfile?.consultationFee
      },
      preVisitSummary: apt.preVisitSummary ? {
        urgencyLevel: apt.preVisitSummary.urgencyLevel,
        chiefComplaint: apt.preVisitSummary.chiefComplaint,
        suggestedQuestions: JSON.parse(apt.preVisitSummary.suggestedQuestions)
      } : null,
      postVisitSummary: apt.postVisitSummary ? {
        clinicalNotes: apt.postVisitSummary.clinicalNotes,
        prescription: JSON.parse(apt.postVisitSummary.prescriptionJson || '[]'),
        patientFriendlySummary: apt.postVisitSummary.patientFriendlySummary,
        followUpSteps: apt.postVisitSummary.followUpSteps
      } : null,
      medicationRemindersCount: apt.medicationReminders.length,
      blockchainRecord: apt.blockchainRecords[0] ? toRecordSummary(apt.blockchainRecords[0]) : null
    }));

    return res.json({ success: true, appointments: formatted });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Cancel appointment
router.delete('/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user!.id;
    const userRole = req.user!.role;

    const apt = await prisma.appointment.findUnique({
      where: { id },
      include: { patient: true, doctor: true }
    });

    if (!apt) {
      return res.status(404).json({ success: false, message: 'Appointment not found.' });
    }

    if (userRole === 'PATIENT' && apt.patientId !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized to cancel this appointment.' });
    }
    if (userRole === 'DOCTOR' && apt.doctorId !== userId) {
      return res.status(403).json({ success: false, message: 'Unauthorized to cancel this appointment.' });
    }

    const updated = await prisma.appointment.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelReason: reason || 'Cancelled by user'
      }
    });

    if (apt.googleCalendarEventId) {
      await deleteGoogleCalendarEvent(apt.googleCalendarEventId);
    }

    return res.json({ success: true, message: 'Appointment cancelled successfully.', appointment: updated });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Download .ics calendar file
router.get('/:id/ics', requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const apt = await prisma.appointment.findUnique({
      where: { id },
      include: {
        patient: true,
        doctor: { include: { doctorProfile: true } },
        preVisitSummary: true
      }
    });

    if (!apt) {
      return res.status(404).json({ success: false, message: 'Appointment not found' });
    }

    const doctorDisplayName = formatDoctorName(apt.doctor.name);
    const icsString = generateIcsContent({
      id: apt.id,
      title: `CarePulse: ${apt.patient.name} & ${doctorDisplayName}`,
      description: `Appointment with ${doctorDisplayName} (${apt.doctor.doctorProfile?.specialization}).\nSymptoms: ${apt.symptoms}`,
      location: apt.doctor.doctorProfile?.roomNumber || 'CarePulse Clinic',
      startDate: apt.date,
      startTime: apt.startTime,
      endDate: apt.date,
      endTime: apt.endTime,
      doctorEmail: apt.doctor.email,
      patientEmail: apt.patient.email
    });

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="carepulse-appointment-${apt.date}.ics"`);
    return res.send(icsString);
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Real-time AI Symptom Analysis Endpoint
router.post('/analyze-symptoms', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { symptoms } = req.body;
    if (!symptoms || typeof symptoms !== 'string') {
      return res.status(400).json({ success: false, message: 'Symptoms description is required.' });
    }

    const analysis = await generatePreVisitSummary(symptoms);
    return res.json({
      success: true,
      analysis: {
        urgencyLevel: analysis.urgencyLevel,
        chiefComplaint: analysis.chiefComplaint,
        suggestedQuestions: analysis.suggestedQuestions
      }
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
