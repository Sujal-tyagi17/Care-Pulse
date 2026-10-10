import bcrypt from 'bcryptjs';
import { prisma } from './db.js';

async function main() {
  console.log('🌱 Starting Healthcare platform database seed...');

  // Clear existing records
  await prisma.blockchainRecord.deleteMany();
  await prisma.anchorBatch.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.notificationLog.deleteMany();
  await prisma.medicationReminder.deleteMany();
  await prisma.postVisitSummary.deleteMany();
  await prisma.preVisitSummary.deleteMany();
  await prisma.slotHold.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.doctorLeave.deleteMany();
  await prisma.doctorProfile.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash('password123', 10);
  const doctorPasswordHash = await bcrypt.hash('doctor123', 10);
  const adminPasswordHash = await bcrypt.hash('admin123', 10);

  // 1. Create Admin
  const admin = await prisma.user.create({
    data: {
      name: 'CarePulse Clinic Administrator',
      email: 'admin@carepulse.com',
      password: adminPasswordHash,
      role: 'ADMIN',
      phone: '+91 98765 43210'
    }
  });
  console.log(`✅ Created Admin: ${admin.email}`);

  // 2. Create Doctors with Indian Names & Consultation Fees in INR
  const doctorsData = [
    {
      name: 'Dr. Rajesh Sharma',
      email: 'dr.rajesh@carepulse.com',
      specialization: 'Cardiology',
      bio: 'Senior Consultant Cardiologist specializing in preventive cardiology, hypertension, angiography, and heart rhythm management with over 15 years of clinical practice.',
      slotDurationMinutes: 30,
      workingHoursStart: '09:00',
      workingHoursEnd: '17:00',
      consultationFee: 1200.0,
      roomNumber: 'Suite 201 (Cardiology Wing)',
      phone: '+91 98111 22334'
    },
    {
      name: 'Dr. Ananya Iyer',
      email: 'dr.ananya@carepulse.com',
      specialization: 'Dermatology',
      bio: 'Leading clinical dermatologist focusing on acne therapy, eczema, psoriasis, skin allergies, and advanced laser dermatological care.',
      slotDurationMinutes: 20,
      workingHoursStart: '09:00',
      workingHoursEnd: '16:00',
      consultationFee: 800.0,
      roomNumber: 'Suite 105 (Dermatology & Skin Care)',
      phone: '+91 98222 33445'
    },
    {
      name: 'Dr. Vikram Malhotra',
      email: 'dr.vikram@carepulse.com',
      specialization: 'Neurology',
      bio: 'Chief Neurologist with clinical expertise in migraine management, neuropathic pain, epilepsy, and cognitive neurological health.',
      slotDurationMinutes: 45,
      workingHoursStart: '10:00',
      workingHoursEnd: '18:00',
      consultationFee: 1500.0,
      roomNumber: 'Suite 310 (Neurosciences Center)',
      phone: '+91 98333 44556'
    },
    {
      name: 'Dr. Amit Verma',
      email: 'dr.amit@carepulse.com',
      specialization: 'General Medicine',
      bio: 'Experienced General Physician dedicated to comprehensive annual health checks, diabetes care, and lifestyle disease management.',
      slotDurationMinutes: 30,
      workingHoursStart: '08:30',
      workingHoursEnd: '16:30',
      consultationFee: 500.0,
      roomNumber: 'Room 102 (OPD Practice)',
      phone: '+91 98444 55667'
    },
    {
      name: 'Dr. Priya Patel',
      email: 'dr.priya@carepulse.com',
      specialization: 'Pediatrics',
      bio: 'Compassionate Pediatrician specializing in infant growth tracking, immunization schedules, childhood respiratory wellness, and nutrition.',
      slotDurationMinutes: 30,
      workingHoursStart: '09:00',
      workingHoursEnd: '15:00',
      consultationFee: 700.0,
      roomNumber: 'Suite 108 (Pediatrics Wing)',
      phone: '+91 98555 66778'
    }
  ];

  const createdDoctors = [];
  for (const doc of doctorsData) {
    const user = await prisma.user.create({
      data: {
        name: doc.name,
        email: doc.email,
        password: doctorPasswordHash,
        role: 'DOCTOR',
        phone: doc.phone,
        doctorProfile: {
          create: {
            specialization: doc.specialization,
            bio: doc.bio,
            slotDurationMinutes: doc.slotDurationMinutes,
            workingHoursStart: doc.workingHoursStart,
            workingHoursEnd: doc.workingHoursEnd,
            consultationFee: doc.consultationFee,
            roomNumber: doc.roomNumber
          }
        }
      },
      include: { doctorProfile: true }
    });
    createdDoctors.push(user);
    console.log(`✅ Created Doctor: ${user.name} (${doc.specialization}) - ₹${doc.consultationFee}`);
  }

  // 3. Create Patients
  const patient1 = await prisma.user.create({
    data: {
      name: 'Rahul Sharma',
      email: 'rahul@example.com',
      password: passwordHash,
      role: 'PATIENT',
      phone: '+91 98760 11223'
    }
  });

  // Also create john@example.com for legacy demo compatibility
  await prisma.user.create({
    data: {
      name: 'John Doe',
      email: 'john@example.com',
      password: passwordHash,
      role: 'PATIENT',
      phone: '+91 98760 11224'
    }
  });

  const patient2 = await prisma.user.create({
    data: {
      name: 'Pooja Verma',
      email: 'pooja@example.com',
      password: passwordHash,
      role: 'PATIENT',
      phone: '+91 98760 33445'
    }
  });

  console.log(`✅ Created Patients: ${patient1.name}, ${patient2.name}`);

  // 4. Create Sample Past Completed Appointment with AI Pre and Post Summaries
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const completedApt = await prisma.appointment.create({
    data: {
      patientId: patient1.id,
      doctorId: createdDoctors[0].id, // Dr. Rajesh Sharma (Cardiology)
      date: todayStr,
      startTime: '09:00',
      endTime: '09:30',
      status: 'COMPLETED',
      symptoms: 'Experiencing recurrent palpitations during evening walks, mild chest tightness when climbing stairs, and occasional dizziness.'
    }
  });

  await prisma.preVisitSummary.create({
    data: {
      appointmentId: completedApt.id,
      urgencyLevel: 'MEDIUM',
      chiefComplaint: 'Recurrent exertional palpitations and mild chest tightness with stairs.',
      suggestedQuestions: JSON.stringify([
        'How long do the palpitations typically last and do they resolve with rest?',
        'Have you noticed any shortness of breath, lightheadedness, or swelling in your feet?',
        'Do you consume high amounts of tea/coffee, energy drinks, or stress stimulants?'
      ]),
      rawResponse: 'Seeded AI analysis'
    }
  });

  const prescriptions = [
    {
      medicineName: 'Metoprolol Tartrate',
      dosage: '25mg',
      frequency: 'Twice daily',
      durationDays: 14,
      instructions: 'Take 1 tablet in the morning and 1 in the evening after meals.',
      reminderTimes: ['09:00', '21:00']
    },
    {
      medicineName: 'CoQ10 Heart Support',
      dosage: '100mg',
      frequency: 'Once daily',
      durationDays: 30,
      instructions: 'Take after lunch with water.',
      reminderTimes: ['13:00']
    }
  ];

  await prisma.postVisitSummary.create({
    data: {
      appointmentId: completedApt.id,
      clinicalNotes: 'ECG demonstrates normal sinus rhythm with occasional benign PVCs. Blood pressure elevated at 138/88 mmHg. Low-dose beta-blocker prescribed. Holter monitor scheduled for next week.',
      prescriptionJson: JSON.stringify(prescriptions),
      patientFriendlySummary: 'Your heart examination showed mild irregular beats during physical exertion, which are common and treatable. We have prescribed a gentle heart medication (Metoprolol) to keep your pulse steady and relieve chest tightness. Please monitor your blood pressure daily.',
      followUpSteps: '1. Take Metoprolol twice daily after meals.\n2. Avoid heavy exertion and high caffeine for 1 week.\n3. Return for clinical review in 2 weeks.'
    }
  });

  // Create active medication reminders
  for (const rx of prescriptions) {
    await prisma.medicationReminder.create({
      data: {
        appointmentId: completedApt.id,
        patientId: patient1.id,
        medicineName: rx.medicineName,
        dosage: rx.dosage,
        frequency: rx.frequency,
        reminderTimes: JSON.stringify(rx.reminderTimes),
        instructions: rx.instructions,
        startDate: todayStr,
        endDate: new Date(Date.now() + rx.durationDays * 86400000).toISOString().split('T')[0],
        isActive: true
      }
    });
  }

  // 5. Create Sample Upcoming Booked Appointment for Pooja
  const tomorrow = new Date(Date.now() + 86400000).toISOString().split('T')[0];
  const upcomingApt = await prisma.appointment.create({
    data: {
      patientId: patient2.id,
      doctorId: createdDoctors[1].id, // Dr. Ananya Iyer (Dermatology)
      date: tomorrow,
      startTime: '10:00',
      endTime: '10:20',
      status: 'BOOKED',
      symptoms: 'Persistent dry, itchy skin rash across both inner elbows for the past 3 weeks. OTC creams give temporary relief only.'
    }
  });

  await prisma.preVisitSummary.create({
    data: {
      appointmentId: upcomingApt.id,
      urgencyLevel: 'LOW',
      chiefComplaint: 'Subacute erythematous pruritic rash on flexural elbows refractory to OTC creams.',
      suggestedQuestions: JSON.stringify([
        'Have you switched soaps, detergents, cosmetics, or clothing fabrics recently?',
        'Does the itching intensify at night or during hot humid weather?',
        'Do you have a family history of atopic eczema, asthma, or skin allergies?'
      ]),
      rawResponse: 'Seeded AI analysis'
    }
  });

  console.log('🎉 Database seeded successfully!');
  console.log('----------------------------------------------------');
  console.log('Demo Credentials:');
  console.log('👑 Admin:   admin@carepulse.com     / admin123');
  console.log('🩺 Doctor:  dr.rajesh@carepulse.com / doctor123 (Cardiology - ₹1,200)');
  console.log('🩺 Doctor:  dr.ananya@carepulse.com / doctor123 (Dermatology - ₹800)');
  console.log('🩺 Doctor:  dr.vikram@carepulse.com / doctor123 (Neurology - ₹1,500)');
  console.log('🩺 Doctor:  dr.amit@carepulse.com   / doctor123 (General Med - ₹500)');
  console.log('🩺 Doctor:  dr.priya@carepulse.com  / doctor123 (Pediatrics - ₹700)');
  console.log('👤 Patient: rahul@example.com       / password123');
  console.log('👤 Patient: pooja@example.com       / password123');
  console.log('👤 Patient: john@example.com        / password123');
  console.log('----------------------------------------------------');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
