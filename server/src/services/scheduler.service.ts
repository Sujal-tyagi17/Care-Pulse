import cron from 'node-cron';
import { prisma } from '../db.js';
import { sendEmailNotification, retryFailedNotifications, getMedicationReminderHtml } from './email.service.js';
import { processPendingRecords, getChain } from './blockchain.service.js';

/**
 * Background Scheduler Service
 * Manages periodic jobs:
 * 1. Slot Hold cleanup
 * 2. Medication reminders based on prescription frequency
 * 3. Appointment reminders (24h and 1h prior)
 * 4. Failed email retries with exponential backoff
 * 5. Blockchain anchoring retries for medical records
 */

export function startBackgroundSchedulers() {
  console.log('[Scheduler] Initializing automated healthcare background workers...');

  // Job 1: Clean up expired slot holds every minute
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const deleted = await prisma.slotHold.deleteMany({
        where: { expiresAt: { lt: now } }
      });
      if (deleted.count > 0) {
        console.log(`[Scheduler] Purged ${deleted.count} expired slot hold(s).`);
      }
    } catch (err) {
      console.error('[Scheduler] Error cleaning up slot holds:', (err as Error).message);
    }
  });

  // Job 2: Check & Send Medication Reminders every minute
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const todayStr = now.toISOString().split('T')[0];
      const currentHours = String(now.getHours()).padStart(2, '0');
      const currentMins = String(now.getMinutes()).padStart(2, '0');
      const currentTimeStr = `${currentHours}:${currentMins}`;

      // Find active medication reminders valid today
      const activeReminders = await prisma.medicationReminder.findMany({
        where: {
          isActive: true,
          startDate: { lte: todayStr },
          endDate: { gte: todayStr }
        },
        include: { patient: true }
      });

      for (const reminder of activeReminders) {
        let reminderTimes: string[] = [];
        try {
          reminderTimes = JSON.parse(reminder.reminderTimes);
        } catch {
          reminderTimes = ['09:00', '21:00'];
        }

        // Check if current time matches scheduled reminder time
        if (reminderTimes.includes(currentTimeStr)) {
          // Check if already sent in the last 15 minutes to avoid duplicates
          const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);
          if (reminder.lastSentAt && reminder.lastSentAt > fifteenMinutesAgo) {
            continue;
          }

          console.log(`[Scheduler] Sending medication reminder for ${reminder.medicineName} to ${reminder.patient.email}`);

          await sendEmailNotification({
            recipientEmail: reminder.patient.email,
            recipientName: reminder.patient.name,
            subject: `Medication Reminder: Time to take your ${reminder.medicineName}`,
            type: 'MEDICATION_REMINDER',
            appointmentId: reminder.appointmentId,
            html: getMedicationReminderHtml({
              patientName: reminder.patient.name,
              medicineName: reminder.medicineName,
              dosage: reminder.dosage,
              frequency: reminder.frequency,
              instructions: reminder.instructions || undefined
            })
          });

          await prisma.medicationReminder.update({
            where: { id: reminder.id },
            data: { lastSentAt: now }
          });
        }
      }
    } catch (err) {
      console.error('[Scheduler] Error in medication reminder worker:', (err as Error).message);
    }
  });

  // Job 3: Retry failed notifications every 5 minutes
  cron.schedule('*/5 * * * *', async () => {
    try {
      const retriedCount = await retryFailedNotifications();
      if (retriedCount > 0) {
        console.log(`[Scheduler] Successfully retried ${retriedCount} queued notification(s).`);
      }
    } catch (err) {
      console.error('[Scheduler] Error retrying notifications:', (err as Error).message);
    }
  });

  // Job 4: Anchor pending / retry failed blockchain records every minute
  getChain(); // logs whether blockchain anchoring is enabled
  let anchoringRunning = false;
  cron.schedule('* * * * *', async () => {
    if (anchoringRunning) return;
    anchoringRunning = true;
    try {
      const processed = await processPendingRecords();
      if (processed > 0) {
        console.log(`[Scheduler] Processed ${processed} pending blockchain record(s).`);
      }
    } catch (err) {
      console.error('[Scheduler] Error in blockchain anchoring worker:', (err as Error).message);
    } finally {
      anchoringRunning = false;
    }
  });

  console.log('[Scheduler] Background workers running successfully.');
}
