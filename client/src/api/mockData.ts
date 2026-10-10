import {
  DoctorListItem,
  Appointment,
  MedicationReminderItem,
  NotificationLogItem,
  TimeSlot,
  VerificationResult,
  BlockchainOverview,
  VerifiablePrescription,
  VerifiableCertificate,
  CertificateDetails,
  CertificateSummary
} from '../types';
import { canonicalize, sha256Hex } from '../blockchain/canonical';

export const INITIAL_MOCK_DOCTORS: DoctorListItem[] = [
  {
    id: 'doc-cardio-1',
    name: 'Dr. Rajesh Sharma',
    email: 'dr.rajesh@carepulse.com',
    specialization: 'Cardiology',
    bio: 'Senior Consultant Cardiologist & Electrophysiologist with 15+ years experience in preventive cardiology, lipid management, and arrhythmias.',
    slotDurationMinutes: 30,
    workingHoursStart: '09:00',
    workingHoursEnd: '17:00',
    consultationFee: 1200,
    roomNumber: 'Suite 201 (Cardiology Wing)'
  },
  {
    id: 'doc-neuro-1',
    name: 'Dr. Ananya Iyer',
    email: 'dr.ananya@carepulse.com',
    specialization: 'Neurology',
    bio: 'Renowned Neurologist specializing in migraine management, neuromuscular disorders, epilepsy, and neurodegenerative conditions.',
    slotDurationMinutes: 30,
    workingHoursStart: '10:00',
    workingHoursEnd: '16:30',
    consultationFee: 1500,
    roomNumber: 'Suite 305 (Neuroscience Block)'
  },
  {
    id: 'doc-gen-1',
    name: 'Dr. Priya Nair',
    email: 'dr.priya@carepulse.com',
    specialization: 'General Medicine',
    bio: 'Primary care physician focusing on holistic wellness, chronic hypertension, diabetes management, and preventive health screenings.',
    slotDurationMinutes: 20,
    workingHoursStart: '08:30',
    workingHoursEnd: '18:00',
    consultationFee: 800,
    roomNumber: 'Suite 102 (OPD Level 1)'
  },
  {
    id: 'doc-pedia-1',
    name: 'Dr. Vikramaditya Sen',
    email: 'dr.vikram@carepulse.com',
    specialization: 'Pediatrics',
    bio: 'Compassionate Pediatrician & Child Health Specialist with 12+ years experience in pediatric immunology, developmental growth, and newborn care.',
    slotDurationMinutes: 30,
    workingHoursStart: '09:30',
    workingHoursEnd: '17:30',
    consultationFee: 950,
    roomNumber: 'Suite 108 (Pediatrics Center)'
  },
  {
    id: 'doc-derm-1',
    name: 'Dr. Sarah Jenkins',
    email: 'dr.sarah@carepulse.com',
    specialization: 'Dermatology',
    bio: 'Board-certified Dermatologist offering advanced clinical skincare, eczema treatments, psoriasis therapies, and laser dermatology.',
    slotDurationMinutes: 30,
    workingHoursStart: '11:00',
    workingHoursEnd: '18:00',
    consultationFee: 1100,
    roomNumber: 'Suite 401 (Aesthetic & Derm Lab)'
  }
];

export const INITIAL_MOCK_APPOINTMENTS: Appointment[] = [
  {
    id: 'apt-demo-1',
    date: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    startTime: '10:00',
    endTime: '10:30',
    status: 'BOOKED',
    symptoms: 'Experiencing intermittent chest tightness during brisk walking, along with slight shortness of breath in the mornings.',
    preVisitSummary: {
      urgencyLevel: 'MEDIUM',
      chiefComplaint: 'Intermittent chest tightness during exertion',
      suggestedQuestions: [
        'Does the chest tightness radiate down your left arm or up to your jaw?',
        'Have you noticed any associated dizziness or cold sweating?',
        'Are you currently on any blood pressure or cholesterol medication?'
      ]
    },
    doctor: {
      id: 'doc-cardio-1',
      name: 'Dr. Rajesh Sharma',
      specialization: 'Cardiology',
      roomNumber: 'Suite 201 (Cardiology Wing)',
      consultationFee: 1200
    },
    patient: {
      id: 'demo-patient-id',
      name: 'Rahul Sharma',
      email: 'rahul@example.com',
      phone: '+91 98765 43210'
    }
  },
  {
    id: 'apt-demo-2',
    date: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0],
    startTime: '11:00',
    endTime: '11:30',
    status: 'COMPLETED',
    symptoms: 'Persistent dry cough for over 10 days, accompanied by mild evening fever and fatigue.',
    preVisitSummary: {
      urgencyLevel: 'LOW',
      chiefComplaint: 'Subacute dry cough and mild fatigue',
      suggestedQuestions: [
        'Any history of allergies or seasonal asthma?',
        'Have you noticed any blood or yellowish phlegm when coughing?'
      ]
    },
    postVisitSummary: {
      clinicalNotes: 'Patient presented with post-viral reactive airway cough. Chest clear upon auscultation. Vitals stable: BP 120/78, SpO2 99%. Advised hydration, warm steam inhalation, and prescribed oral antihistamine and bronchodilator syrup for 5 days.',
      patientFriendlySummary: 'You have a post-infection airway irritation causing your dry cough. Your lungs are clear and vital signs are healthy. Continue prescribed syrup and warm steam. Follow up if fever exceeds 101°F.',
      followUpSteps: 'Follow up in 7 days if symptoms do not improve.',
      prescription: [
        {
          medicineName: 'Montelukast + Levocetirizine',
          dosage: '10mg / 5mg',
          frequency: 'Once daily at bedtime',
          durationDays: 5,
          instructions: 'Take after dinner with water. May cause mild drowsiness.'
        },
        {
          medicineName: 'Ascoril D Plus Syrup',
          dosage: '10 ml',
          frequency: 'Thrice daily',
          durationDays: 5,
          instructions: 'Take 30 mins after meals. Avoid cold drinks during recovery.'
        }
      ]
    },
    doctor: {
      id: 'doc-gen-1',
      name: 'Dr. Priya Nair',
      specialization: 'General Medicine',
      roomNumber: 'Suite 102 (OPD Level 1)',
      consultationFee: 800
    },
    patient: {
      id: 'demo-patient-id',
      name: 'Rahul Sharma',
      email: 'rahul@example.com',
      phone: '+91 98765 43210'
    }
  }
];

export const INITIAL_MOCK_MEDICATIONS: MedicationReminderItem[] = [
  {
    id: 'rx-1',
    appointmentId: 'apt-demo-2',
    medicineName: 'Montelukast + Levocetirizine',
    dosage: '10mg / 5mg',
    frequency: 'Once daily at bedtime',
    reminderTimes: ['21:30'],
    instructions: 'Take after dinner with water. May cause mild drowsiness.',
    startDate: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0],
    endDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    isActive: true,
    doctorName: 'Dr. Priya Nair',
    specialization: 'General Medicine'
  },
  {
    id: 'rx-2',
    appointmentId: 'apt-demo-2',
    medicineName: 'Ascoril D Plus Syrup',
    dosage: '10 ml',
    frequency: 'Thrice daily',
    reminderTimes: ['09:00', '14:00', '21:00'],
    instructions: 'Take 30 mins after meals. Avoid cold drinks during recovery.',
    startDate: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0],
    endDate: new Date(Date.now() + 86400000 * 2).toISOString().split('T')[0],
    isActive: true,
    doctorName: 'Dr. Priya Nair',
    specialization: 'General Medicine'
  },
  {
    id: 'rx-3',
    appointmentId: 'apt-demo-1',
    medicineName: 'Atorvastatin (Lipitor)',
    dosage: '20 mg',
    frequency: 'Once daily at night',
    reminderTimes: ['22:00'],
    instructions: 'Maintain low-cholesterol diet and regular daily walking.',
    startDate: new Date(Date.now() - 86400000 * 30).toISOString().split('T')[0],
    endDate: new Date(Date.now() + 86400000 * 60).toISOString().split('T')[0],
    isActive: true,
    doctorName: 'Dr. Rajesh Sharma',
    specialization: 'Cardiology'
  }
];

export const INITIAL_MOCK_NOTIFICATIONS: NotificationLogItem[] = [
  {
    id: 'notif-1',
    recipientEmail: 'rahul@example.com',
    recipientName: 'Rahul Sharma',
    type: 'APPOINTMENT_CONFIRMATION',
    subject: 'Appointment Confirmed - Dr. Rajesh Sharma (Cardiology)',
    bodyPreview: 'Your appointment is confirmed for upcoming consultation at Suite 201.',
    status: 'SENT',
    retryCount: 0,
    createdAt: new Date(Date.now() - 3600000 * 4).toISOString()
  },
  {
    id: 'notif-2',
    recipientEmail: 'rahul@example.com',
    recipientName: 'Rahul Sharma',
    type: 'CALENDAR_INVITE',
    subject: 'Google Calendar Event: CarePulse Appointment',
    bodyPreview: 'Synced event with Google Meet & clinic location details.',
    status: 'SENT',
    retryCount: 0,
    createdAt: new Date(Date.now() - 3600000 * 3).toISOString()
  },
  {
    id: 'notif-3',
    recipientEmail: 'rahul@example.com',
    recipientName: 'Rahul Sharma',
    type: 'PRESCRIPTION_TRANSLATION',
    subject: 'Post-Visit Care Plan Ready',
    bodyPreview: 'Your simplified medication schedule and instructions are now available in your portal.',
    status: 'SENT',
    retryCount: 0,
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString()
  }
];

// In-memory / LocalStorage Mock DB Store Helper
export class MockDataStore {
  private static getStorage<T>(key: string, fallback: T): T {
    try {
      const data = localStorage.getItem(`carepulse_${key}`);
      return data ? JSON.parse(data) : fallback;
    } catch {
      return fallback;
    }
  }

  private static setStorage<T>(key: string, value: T): void {
    try {
      localStorage.setItem(`carepulse_${key}`, JSON.stringify(value));
    } catch (e) {
      console.warn('Storage quota exceeded or unavailable', e);
    }
  }

  static getDoctors(): DoctorListItem[] {
    return this.getStorage('doctors_list', INITIAL_MOCK_DOCTORS);
  }

  static getSpecializations(): string[] {
    const docs = this.getDoctors();
    const specs = Array.from(new Set(docs.map(d => d.specialization)));
    return specs;
  }

  static getDoctorSlots(doctorId: string, date: string): { isOnLeave: boolean; slots: TimeSlot[]; doctor: any } {
    const doctors = this.getDoctors();
    const doc = doctors.find(d => d.id === doctorId) || doctors[0];
    const leaves = this.getStorage<any[]>('doctor_leaves', []);
    const isOnLeave = leaves.some(l => l.doctorId === doctorId && l.leaveDate === date);

    if (isOnLeave) {
      return { isOnLeave: true, slots: [], doctor: doc };
    }

    const times = [
      '09:00', '09:30', '10:00', '10:30', '11:00', '11:30',
      '14:00', '14:30', '15:00', '15:30', '16:00', '16:30'
    ];

    const appointments = this.getAppointments();
    const bookedSlots = appointments
      .filter(a => a.doctor?.id === doctorId && a.date === date && a.status === 'BOOKED')
      .map(a => a.startTime);

    const slots: TimeSlot[] = times.map((t, idx) => {
      const [hourStr, minStr] = t.split(':');
      const hour = parseInt(hourStr, 10);
      const min = parseInt(minStr, 10) + 30;
      const endHour = min >= 60 ? hour + 1 : hour;
      const endMin = min >= 60 ? min - 60 : min;
      const endTime = `${String(endHour).padStart(2, '0')}:${String(endMin).padStart(2, '0')}`;
      const isBooked = bookedSlots.includes(t) || idx === 1; // Mark slot 2 as booked for demo realism

      return {
        startTime: t,
        endTime,
        isAvailable: !isBooked,
        isHeld: false,
        status: isBooked ? 'BOOKED' : 'AVAILABLE'
      };
    });

    return {
      isOnLeave: false,
      slots,
      doctor: doc
    };
  }

  static getAppointments(status?: string): Appointment[] {
    const all = this.getStorage<Appointment[]>('appointments_list', INITIAL_MOCK_APPOINTMENTS);
    if (!status || status === 'ALL') return all;
    return all.filter(a => a.status === status);
  }

  static bookAppointment(data: {
    doctorId: string;
    date: string;
    startTime: string;
    endTime: string;
    symptoms: string;
    patient?: any;
  }): Appointment {
    const doctors = this.getDoctors();
    const doctor = doctors.find(d => d.id === data.doctorId) || doctors[0];
    const cachedUser = localStorage.getItem('carepulse_user');
    const user = cachedUser ? JSON.parse(cachedUser) : { id: 'demo-patient-id', name: 'Rahul Sharma', email: 'rahul@example.com' };

    // AI Urgency Evaluation
    const symptomsLower = (data.symptoms || '').toLowerCase();
    let urgency: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
    if (symptomsLower.includes('chest') || symptomsLower.includes('breath') || symptomsLower.includes('heart') || symptomsLower.includes('severe') || symptomsLower.includes('bleeding')) {
      urgency = 'HIGH';
    } else if (symptomsLower.includes('fever') || symptomsLower.includes('pain') || symptomsLower.includes('cough') || symptomsLower.includes('migraine')) {
      urgency = 'MEDIUM';
    }

    const newApt: Appointment = {
      id: `apt-${Date.now()}`,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      status: 'BOOKED',
      symptoms: data.symptoms,
      preVisitSummary: {
        urgencyLevel: urgency,
        chiefComplaint: data.symptoms.slice(0, 45),
        suggestedQuestions: [
          'How long have you been experiencing these symptoms?',
          'Are there any aggravating or relieving factors?',
          'Do you have any known drug allergies?'
        ]
      },
      doctor: {
        id: doctor.id,
        name: doctor.name,
        specialization: doctor.specialization,
        roomNumber: doctor.roomNumber || 'Suite 101',
        consultationFee: doctor.consultationFee || 1000
      },
      patient: {
        id: user.id,
        name: user.name || 'Rahul Sharma',
        email: user.email || 'rahul@example.com',
        phone: user.phone || '+91 98765 43210'
      }
    };

    const current = this.getAppointments();
    const updated = [newApt, ...current];
    this.setStorage('appointments_list', updated);
    return newApt;
  }

  static cancelAppointment(id: string): void {
    const current = this.getAppointments();
    const updated = current.map(a => a.id === id ? { ...a, status: 'CANCELLED' as const } : a);
    this.setStorage('appointments_list', updated);
  }

  static getMedications(): MedicationReminderItem[] {
    return this.getStorage('medications_list', INITIAL_MOCK_MEDICATIONS);
  }

  static toggleMedication(id: string): boolean {
    const meds = this.getMedications();
    let nextState = false;
    const updated = meds.map(m => {
      if (m.id === id) {
        nextState = !m.isActive;
        return { ...m, isActive: nextState };
      }
      return m;
    });
    this.setStorage('medications_list', updated);
    return nextState;
  }

  static submitPostVisit(appointmentId: string, data: { clinicalNotes: string; prescriptions: any[] }) {
    const appointments = this.getAppointments();
    const apt = appointments.find(a => a.id === appointmentId);
    const postVisitSummary = {
      clinicalNotes: data.clinicalNotes,
      patientFriendlySummary: `Here is your plain-language care plan: ${data.clinicalNotes}. Your vital signs and clinical evaluation have been reviewed. Please follow the medication directions as outlined below.`,
      followUpSteps: '1. Take all medications with meals as prescribed.\n2. Hydrate well and monitor symptoms daily.\n3. Return for a follow-up consultation in 7 days if symptoms persist.',
      prescription: data.prescriptions.map((p) => ({
        medicineName: p.medicineName || p.medicationName || 'Prescribed Medicine',
        dosage: p.dosage || 'Standard dose',
        frequency: p.frequency || 'Once daily',
        durationDays: typeof p.durationDays === 'number' ? p.durationDays : parseInt(p.duration, 10) || 7,
        instructions: p.instructions || 'Take after meals'
      }))
    };

    if (apt) {
      apt.status = 'COMPLETED';
      apt.postVisitSummary = postVisitSummary;
      this.setStorage('appointments_list', appointments);
    }

    // Also create reminders in the medications list
    const currentMeds = this.getMedications();
    const newMeds: MedicationReminderItem[] = postVisitSummary.prescription.map((rx, i) => ({
      id: `med-${Date.now()}-${i}`,
      appointmentId,
      medicineName: rx.medicineName,
      dosage: rx.dosage,
      frequency: rx.frequency,
      reminderTimes: ['09:00', '21:00'],
      instructions: rx.instructions,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + (rx.durationDays || 7) * 86400000).toISOString().split('T')[0],
      isActive: true,
      doctorName: apt?.doctor?.name || 'Dr. Rajesh Sharma',
      specialization: apt?.doctor?.specialization || 'Cardiology'
    }));
    this.setStorage('medications_list', [...newMeds, ...currentMeds]);

    return {
      success: true,
      postVisitSummary
    };
  }

  static getAdminAnalytics() {
    const appointments = this.getAppointments();
    const doctors = this.getDoctors();
    return {
      stats: {
        totalAppointments: appointments.length + 28,
        todayAppointments: appointments.filter(a => a.date === new Date().toISOString().split('T')[0]).length || 8,
        activeDoctors: doctors.length,
        totalDoctors: doctors.length,
        aiTriageProcessed: 142,
        remindersSentToday: 36
      },
      recentAppointments: appointments.slice(0, 5)
    };
  }

  static getNotificationLogs(): NotificationLogItem[] {
    return this.getStorage('notifications_list', INITIAL_MOCK_NOTIFICATIONS);
  }

  static addDoctor(doc: any): DoctorListItem {
    const doctors = this.getDoctors();
    const newDoc: DoctorListItem = {
      id: `doc-${Date.now()}`,
      name: doc.name,
      email: doc.email,
      specialization: doc.specialization,
      bio: doc.bio || 'Consulting Physician at CarePulse.',
      slotDurationMinutes: doc.slotDurationMinutes || 30,
      workingHoursStart: doc.workingHoursStart || '09:00',
      workingHoursEnd: doc.workingHoursEnd || '17:00',
      consultationFee: doc.consultationFee || 1000,
      roomNumber: doc.roomNumber || 'Room 101'
    };
    const updated = [...doctors, newDoc];
    this.setStorage('doctors_list', updated);
    return newDoc;
  }

  // -------------------------------------------------------------------------
  // Blockchain demo mode (no backend): documents are fingerprinted for real in the
  // browser, but are clearly marked as DEMO because nothing is anchored on-chain.
  // -------------------------------------------------------------------------

  static async attachDemoRecords(appointments: Appointment[]): Promise<Appointment[]> {
    const store = this.getStorage<Record<string, string>>('demo_chain_records', {});
    const byAppointment = this.getStorage<Record<string, string>>('demo_chain_index', {});
    let changed = false;

    for (const apt of appointments) {
      if (apt.status !== 'COMPLETED' || !apt.postVisitSummary) continue;
      let hash = byAppointment[apt.id];
      if (!hash || !store[hash]) {
        const salt =
          '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, '0')).join('');
        const payload: VerifiablePrescription = {
          schema: 'carepulse.prescription.v1',
          recordType: 'PRESCRIPTION',
          recordId: `demo-${apt.id}`,
          issuedAt: new Date().toISOString(),
          salt,
          issuer: {
            name: apt.doctor?.name || 'CarePulse Doctor',
            specialization: apt.doctor?.specialization || 'General Medicine',
            wallet: '0x0000000000000000000000000000000000000000',
            registry: '0x0000000000000000000000000000000000000000',
            chainId: 0
          },
          patient: { name: apt.patient?.name || 'Patient' },
          appointment: { id: apt.id, date: apt.date },
          medications: (apt.postVisitSummary.prescription || []).map((p) => ({
            medicineName: p.medicineName,
            dosage: p.dosage,
            frequency: p.frequency,
            durationDays: p.durationDays,
            instructions: p.instructions
          })),
          clinicalNotesHash: await sha256Hex(apt.postVisitSummary.clinicalNotes || '')
        };
        const canonical = canonicalize(payload);
        hash = await sha256Hex(canonical);
        store[hash] = canonical;
        byAppointment[apt.id] = hash;
        changed = true;
      }
      apt.blockchainRecord = {
        recordHash: hash,
        recordType: 'PRESCRIPTION',
        status: 'DEMO',
        txHash: null,
        txUrl: null,
        anchoredAt: null,
        doctorAddress: '0x0000000000000000000000000000000000000000',
        chainId: 0
      };
    }

    if (changed) {
      this.setStorage('demo_chain_records', store);
      this.setStorage('demo_chain_index', byAppointment);
    }
    const certs = this.getStorage<Record<string, string>>('demo_cert_index', {});
    const allRecords = this.getStorage<Record<string, string>>('demo_chain_records', {});
    for (const apt of appointments) {
      const h = certs[apt.id];
      if (h && allRecords[h]) apt.certificate = this.demoCertificateSummary(h, JSON.parse(allRecords[h]));
    }
    return appointments;
  }

  static async issueDemoCertificate(appointmentId: string, details: CertificateDetails) {
    const apt = this.getAppointments().find((a) => a.id === appointmentId);
    if (!apt) throw new Error('Appointment not found');
    const document: VerifiableCertificate = {
      schema: 'carepulse.certificate.v1',
      recordType: 'MEDICAL_CERTIFICATE',
      recordId: `demo-cert-${appointmentId}-${Date.now()}`,
      issuedAt: new Date().toISOString(),
      salt: '0x' + Array.from(crypto.getRandomValues(new Uint8Array(32))).map((b) => b.toString(16).padStart(2, '0')).join(''),
      issuer: {
        name: apt.doctor?.name || 'CarePulse Doctor',
        specialization: apt.doctor?.specialization || 'General Medicine',
        wallet: '0x0000000000000000000000000000000000000000',
        registry: '0x0000000000000000000000000000000000000000',
        chainId: 0
      },
      patient: { name: apt.patient?.name || 'Patient' },
      appointment: { id: apt.id, date: apt.date },
      certificate: details
    };
    const canonical = canonicalize(document);
    const hash = await sha256Hex(canonical);
    const store = this.getStorage<Record<string, string>>('demo_chain_records', {});
    store[hash] = canonical;
    this.setStorage('demo_chain_records', store);
    const certs = this.getStorage<Record<string, string>>('demo_cert_index', {});
    certs[appointmentId] = hash;
    this.setStorage('demo_cert_index', certs);
    return this.demoCertificateSummary(hash, document);
  }

  private static demoCertificateSummary(hash: string, document: VerifiableCertificate): CertificateSummary {
    return {
      recordHash: hash,
      recordType: 'MEDICAL_CERTIFICATE',
      status: 'DEMO',
      txHash: null,
      txUrl: null,
      anchoredAt: null,
      doctorAddress: '0x0000000000000000000000000000000000000000',
      chainId: 0,
      issuedAt: document.issuedAt,
      certificate: document.certificate
    };
  }

  static getDemoVerification(recordHash: string): VerificationResult | null {
    const store = this.getStorage<Record<string, string>>('demo_chain_records', {});
    const canonical = store[recordHash.toLowerCase()];
    if (!canonical) return null;
    return {
      recordHash: recordHash.toLowerCase(),
      verdict: 'UNAVAILABLE',
      chainError: 'Demo mode: no backend connected, so this record was fingerprinted in your browser but never anchored on-chain.',
      network: null,
      onChain: null,
      record: {
        recordType: 'PRESCRIPTION',
        status: 'DEMO',
        isCurrent: true,
        txHash: null,
        txUrl: null,
        revokeTxHash: null,
        anchoredAt: null,
        payloadIntact: true,
        payload: JSON.parse(canonical),
        canonicalPayload: canonical
      },
      demo: true
    };
  }

  static getBlockchainOverview(): BlockchainOverview {
    const doctors = this.getDoctors();
    return {
      enabled: false,
      network: null,
      networkError: null,
      recordCounts: {},
      doctors: doctors.map((d) => ({
        id: d.id,
        name: d.name,
        specialization: d.specialization,
        walletAddress: null,
        walletUrl: null,
        registeredOnChain: false,
        activeOnChain: false,
        registrationTx: null
      })),
      recentRecords: [],
      demo: true
    };
  }
}
