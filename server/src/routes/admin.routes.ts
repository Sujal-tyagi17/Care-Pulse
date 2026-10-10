import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { sendEmailNotification, getDoctorLeaveCancellationHtml, formatDoctorName } from '../services/email.service.js';
import { deleteGoogleCalendarEvent } from '../services/calendar.service.js';
import {
  ensureDoctorWallet,
  registerDoctorOnChain,
  setDoctorChainActive,
  getBlockchainOverview,
  runBatchCycle,
  checkAuditIntegrity
} from '../services/blockchain.service.js';
import { logAudit, listAuditEntries } from '../services/audit.service.js';
import { AuthRequest } from '../types.js';

const router = Router();

const actorOf = (req: unknown) => {
  const u = (req as AuthRequest).user;
  return u ? { id: u.id, role: u.role } : null;
};

// Ensure all routes require Admin role
router.use(requireAuth, requireRole(['ADMIN']));

// 1. Get Platform Analytics & System Overview
router.get('/analytics', async (_req, res) => {
  try {
    const totalDoctors = await prisma.user.count({ where: { role: 'DOCTOR' } });
    const totalPatients = await prisma.user.count({ where: { role: 'PATIENT' } });
    const totalAppointments = await prisma.appointment.count();
    const bookedAppointments = await prisma.appointment.count({ where: { status: 'BOOKED' } });
    const completedAppointments = await prisma.appointment.count({ where: { status: 'COMPLETED' } });
    const cancelledAppointments = await prisma.appointment.count({ where: { status: { in: ['CANCELLED', 'REQUIRES_RESCHEDULE'] } } });

    const totalNotifications = await prisma.notificationLog.count();
    const sentNotifications = await prisma.notificationLog.count({ where: { status: 'SENT' } });

    const recentAppointments = await prisma.appointment.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        patient: { select: { name: true, email: true } },
        doctor: { select: { name: true, doctorProfile: { select: { specialization: true } } } },
        preVisitSummary: { select: { urgencyLevel: true, chiefComplaint: true } }
      }
    });

    return res.json({
      success: true,
      stats: {
        totalDoctors,
        totalPatients,
        totalAppointments,
        bookedAppointments,
        completedAppointments,
        cancelledAppointments,
        totalNotifications,
        sentNotifications
      },
      recentAppointments
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Create a new Doctor Account & Profile
const createDoctorSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
  specialization: z.string().min(2),
  bio: z.string().optional(),
  slotDurationMinutes: z.number().min(10).max(120).default(30),
  workingHoursStart: z.string().regex(/^\d{2}:\d{2}$/).default('09:00'),
  workingHoursEnd: z.string().regex(/^\d{2}:\d{2}$/).default('17:00'),
  consultationFee: z.number().min(0).default(50),
  roomNumber: z.string().default('Room 101')
});

router.post('/doctors', async (req, res) => {
  try {
    const data = createDoctorSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'User with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const doctor = await prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: 'DOCTOR',
        phone: data.phone,
        doctorProfile: {
          create: {
            specialization: data.specialization,
            bio: data.bio,
            slotDurationMinutes: data.slotDurationMinutes,
            workingHoursStart: data.workingHoursStart,
            workingHoursEnd: data.workingHoursEnd,
            consultationFee: data.consultationFee,
            roomNumber: data.roomNumber
          }
        }
      },
      include: { doctorProfile: true }
    });

    // Give the new doctor a signing wallet (registration on-chain is a separate, explicit admin step)
    const walletAddress = await ensureDoctorWallet(doctor.id).catch(() => null);
    if (walletAddress && doctor.doctorProfile) doctor.doctorProfile.walletAddress = walletAddress;
    await logAudit({ eventType: 'DOCTOR_CREATED', entityType: 'DOCTOR', entityId: doctor.id, actor: actorOf(req), data: { specialization: data.specialization } });

    return res.status(201).json({
      success: true,
      message: 'Doctor profile created successfully.',
      doctor: {
        id: doctor.id,
        name: doctor.name,
        email: doctor.email,
        doctorProfile: doctor.doctorProfile
      }
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Update Doctor Profile
router.put('/doctors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      phone,
      specialization,
      bio,
      slotDurationMinutes,
      workingHoursStart,
      workingHoursEnd,
      consultationFee,
      roomNumber
    } = req.body;

    const user = await prisma.user.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(phone && { phone }),
        doctorProfile: {
          update: {
            ...(specialization && { specialization }),
            ...(bio !== undefined && { bio }),
            ...(slotDurationMinutes && { slotDurationMinutes: Number(slotDurationMinutes) }),
            ...(workingHoursStart && { workingHoursStart }),
            ...(workingHoursEnd && { workingHoursEnd }),
            ...(consultationFee !== undefined && { consultationFee: Number(consultationFee) }),
            ...(roomNumber && { roomNumber })
          }
        }
      },
      include: { doctorProfile: true }
    });

    await logAudit({
      eventType: 'DOCTOR_UPDATED',
      entityType: 'DOCTOR',
      entityId: id,
      actor: actorOf(req),
      data: { fields: Object.keys(req.body ?? {}).sort().join(',') }
    });
    return res.json({ success: true, message: 'Doctor updated successfully.', doctor: user });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Doctor Leave Management & Automated Patient Conflict Resolution
const leaveSchema = z.object({
  leaveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  reason: z.string().optional()
});

router.post('/doctors/:id/leave', async (req, res) => {
  try {
    const { id: doctorId } = req.params;
    const { leaveDate, reason } = leaveSchema.parse(req.body);

    const doctor = await prisma.user.findUnique({
      where: { id: doctorId },
      include: { doctorProfile: true }
    });

    if (!doctor) {
      return res.status(404).json({ success: false, message: 'Doctor not found.' });
    }

    // 1. Record the Leave
    const leave = await prisma.doctorLeave.upsert({
      where: { doctorId_leaveDate: { doctorId, leaveDate } },
      create: {
        doctorId,
        leaveDate,
        reason: reason || 'Approved Medical/Personal Leave'
      },
      update: {
        reason: reason || 'Approved Medical/Personal Leave'
      }
    });

    // 2. Identify all conflicting active bookings on that leave date
    const affectedAppointments = await prisma.appointment.findMany({
      where: {
        doctorId,
        date: leaveDate,
        status: { in: ['BOOKED'] }
      },
      include: { patient: true }
    });

    // 3. Mark appointments as CANCELLED / REQUIRES_RESCHEDULE and dispatch notifications
    let notifiedCount = 0;
    const clientAppUrl = process.env.CLIENT_URL || 'http://localhost:5173';

    for (const apt of affectedAppointments) {
      await prisma.appointment.update({
        where: { id: apt.id },
        data: {
          status: 'REQUIRES_RESCHEDULE',
          cancelReason: `Doctor marked on leave: ${reason || 'Approved Leave'}`
        }
      });

      // Cleanup Google Calendar Event if it was synced
      if (apt.googleCalendarEventId) {
        try {
          await deleteGoogleCalendarEvent(apt.googleCalendarEventId);
        } catch (calErr) {
          console.error(`[Admin Leave] Failed to delete Google Calendar event for apt ${apt.id}:`, calErr);
        }
      }

      const rescheduleUrl = `${clientAppUrl}/reschedule/${apt.id}?doctorId=${doctorId}`;

      // Dispatch urgent leave notification email
      try {
        const doctorDisplayName = formatDoctorName(doctor.name);
        await sendEmailNotification({
          recipientEmail: apt.patient.email,
          recipientName: apt.patient.name,
          subject: `URGENT: Your appointment with ${doctorDisplayName} on ${leaveDate} needs to be rescheduled`,
          type: 'DOCTOR_LEAVE_ALERT',
          appointmentId: apt.id,
          html: getDoctorLeaveCancellationHtml({
            patientName: apt.patient.name,
            doctorName: doctor.name,
            date: leaveDate,
            time: `${apt.startTime} - ${apt.endTime}`,
            reason: reason || 'Doctor on Approved Leave',
            rescheduleUrl
          })
        });
        notifiedCount++;
      } catch (emailErr) {
        console.error(`[Admin Leave] Failed to dispatch leave alert to ${apt.patient.email}:`, emailErr);
      }
    }

    await logAudit({
      eventType: 'DOCTOR_LEAVE_ADDED',
      entityType: 'DOCTOR',
      entityId: doctorId,
      actor: actorOf(req),
      data: { leaveDate, affectedAppointments: affectedAppointments.length }
    });
    if (affectedAppointments.length > 0) {
      await logAudit({
        eventType: 'APPOINTMENTS_RESCHEDULE_REQUIRED',
        entityType: 'DOCTOR',
        entityId: doctorId,
        actor: actorOf(req),
        data: { leaveDate, appointmentIds: affectedAppointments.map((a) => a.id).join(',') }
      });
    }

    return res.json({
      success: true,
      message: `Doctor marked on leave for ${leaveDate}. Conflicting appointments resolved.`,
      leave,
      affectedAppointmentsCount: affectedAppointments.length,
      patientsNotifiedCount: notifiedCount,
      affectedAppointments: affectedAppointments.map(a => ({
        id: a.id,
        patientName: a.patient.name,
        patientEmail: a.patient.email,
        time: a.startTime
      }))
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) {
      return res.status(400).json({ success: false, errors: err.errors });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Get Leaves for a Doctor
router.get('/doctors/:id/leaves', async (req, res) => {
  try {
    const { id: doctorId } = req.params;
    const leaves = await prisma.doctorLeave.findMany({
      where: { doctorId },
      orderBy: { leaveDate: 'asc' }
    });
    return res.json({ success: true, leaves });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Delete a Leave
router.delete('/doctors/:id/leaves/:leaveDate', async (req, res) => {
  try {
    const { id: doctorId, leaveDate } = req.params;
    await prisma.doctorLeave.delete({
      where: { doctorId_leaveDate: { doctorId, leaveDate } }
    });
    await logAudit({ eventType: 'DOCTOR_LEAVE_REMOVED', entityType: 'DOCTOR', entityId: doctorId, actor: actorOf(req), data: { leaveDate } });
    return res.json({ success: true, message: `Leave for ${leaveDate} removed.` });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Blockchain: registry overview (network, relayer, doctor verification, recent anchors)
router.get('/blockchain', async (_req, res) => {
  try {
    return res.json({ success: true, ...(await getBlockchainOverview()) });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Blockchain: verify a doctor on-chain so their signed prescriptions are accepted
router.post('/doctors/:id/blockchain/register', async (req, res) => {
  try {
    const result = await registerDoctorOnChain(req.params.id);
    if (!result.alreadyRegistered) {
      await logAudit({
        eventType: 'DOCTOR_CHAIN_REGISTERED',
        entityType: 'DOCTOR',
        entityId: req.params.id,
        actor: actorOf(req),
        data: { wallet: result.address, txHash: result.txHash ?? null }
      });
    }
    return res.json({
      success: true,
      message: result.alreadyRegistered ? 'Doctor is already registered on-chain.' : 'Doctor registered on-chain.',
      ...result
    });
  } catch (err: any) {
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// 9. Blockchain: suspend / reinstate a doctor (existing records stay valid)
router.post('/doctors/:id/blockchain/status', async (req, res) => {
  try {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const result = await setDoctorChainActive(req.params.id, active);
    await logAudit({
      eventType: 'DOCTOR_CHAIN_STATUS_CHANGED',
      entityType: 'DOCTOR',
      entityId: req.params.id,
      actor: actorOf(req),
      data: { active, txHash: result.txHash }
    });
    return res.json({ success: true, message: active ? 'Doctor reinstated on-chain.' : 'Doctor suspended on-chain.', ...result });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ success: false, errors: err.errors });
    return res.status(err.status || 500).json({ success: false, message: err.message });
  }
});

// 10. Blockchain: anchor pending records + audit checkpoint now instead of waiting for the interval
router.post('/blockchain/anchor-now', async (_req, res) => {
  try {
    const result = await runBatchCycle(true);
    const status = result.status === 'FAILED' ? 502 : 200;
    return res.status(status).json({ success: result.status !== 'FAILED', ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 11. Audit log: most recent entries (paginate with ?before=<seq>)
router.get('/audit', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const before = req.query.before ? Number(req.query.before) : undefined;
    return res.json({ success: true, entries: await listAuditEntries(limit, before) });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// 12. Audit log: recompute the hash chain and compare it with on-chain checkpoints
router.get('/audit/verify', async (_req, res) => {
  try {
    return res.json({ success: true, report: await checkAuditIntegrity() });
  } catch (err: any) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
