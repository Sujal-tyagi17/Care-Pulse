import {
  User,
  DoctorListItem,
  TimeSlot,
  Appointment,
  MedicationReminderItem,
  PrescriptionItem,
  VerificationResult,
  BlockchainOverview
} from '../types';
import { MockDataStore } from './mockData';

const API_BASE = import.meta.env.VITE_API_BASE || import.meta.env.VITE_API_URL || '/api';

function getHeaders(): HeadersInit {
  const token = localStorage.getItem('carepulse_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function handleResponse<T>(res: Response): Promise<T> {
  const contentType = res.headers.get('content-type');
  if (contentType && !contentType.includes('application/json')) {
    throw new Error('Non-JSON response from server (Backend may not be reachable)');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const errorMsg = data.message || (data.errors ? JSON.stringify(data.errors) : `Request failed with status ${res.status}`);
    throw new Error(errorMsg);
  }
  return data;
}

export const api = {
  // Auth
  async login(email: string, password: string): Promise<{ token: string; user: User }> {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      return await handleResponse(res);
    } catch (err) {
      // Re-throw so AuthContext can handle demo user fallback
      throw err;
    }
  },

  async register(data: { name: string; email: string; password: string; role?: string; phone?: string }): Promise<{ token: string; user: User }> {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      return await handleResponse(res);
    } catch (err) {
      // Fallback for standalone demo
      const newUser: User = {
        id: `user-${Date.now()}`,
        name: data.name,
        email: data.email,
        role: (data.role as any) || 'PATIENT',
        phone: data.phone || '+91 98765 43210'
      };
      return {
        token: `demo-token-${newUser.role.toLowerCase()}`,
        user: newUser
      };
    }
  },

  async getMe(): Promise<{ user: User }> {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, {
        headers: getHeaders()
      });
      return await handleResponse(res);
    } catch (err) {
      const cached = localStorage.getItem('carepulse_user');
      if (cached) {
        return { user: JSON.parse(cached) };
      }
      throw err;
    }
  },

  // Doctors & Availability
  async getDoctors(search?: string, specialization?: string): Promise<{ doctors: DoctorListItem[] }> {
    try {
      const params = new URLSearchParams();
      if (search) params.append('search', search);
      if (specialization) params.append('specialization', specialization);
      const res = await fetch(`${API_BASE}/doctors?${params.toString()}`);
      const data = await handleResponse<{ doctors: DoctorListItem[] }>(res);
      if (Array.isArray(data.doctors)) return data;
      throw new Error('Invalid doctor data');
    } catch (err) {
      let docs = MockDataStore.getDoctors();
      if (specialization && specialization !== 'ALL') {
        docs = docs.filter(d => d.specialization.toLowerCase() === specialization.toLowerCase());
      }
      if (search) {
        const q = search.toLowerCase();
        docs = docs.filter(d => d.name.toLowerCase().includes(q) || d.specialization.toLowerCase().includes(q) || (d.bio && d.bio.toLowerCase().includes(q)));
      }
      return { doctors: docs };
    }
  },

  async getSpecializations(): Promise<{ specializations: string[] }> {
    try {
      const res = await fetch(`${API_BASE}/doctors/specializations`);
      const data = await handleResponse<{ specializations: string[] }>(res);
      if (Array.isArray(data.specializations)) return data;
      throw new Error('Invalid specialization data');
    } catch (err) {
      return { specializations: MockDataStore.getSpecializations() };
    }
  },

  async getDoctorAvailability(doctorId: string, date: string): Promise<{
    isOnLeave: boolean;
    leaveReason?: string;
    slots: TimeSlot[];
    doctor: any;
  }> {
    try {
      const res = await fetch(`${API_BASE}/doctors/${doctorId}/availability?date=${date}`);
      const data = await handleResponse<any>(res);
      if (data && Array.isArray(data.slots)) return data;
      throw new Error('Invalid availability data');
    } catch (err) {
      return MockDataStore.getDoctorSlots(doctorId, date);
    }
  },

  // Appointments
  async holdSlot(doctorId: string, date: string, startTime: string, endTime: string): Promise<{ holdToken: string; expiresAt: string }> {
    try {
      const res = await fetch(`${API_BASE}/appointments/hold`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ doctorId, date, startTime, endTime })
      });
      return await handleResponse(res);
    } catch (err) {
      return {
        holdToken: `hold-${Date.now()}`,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
      };
    }
  },

  async releaseHold(holdToken: string): Promise<void> {
    try {
      await fetch(`${API_BASE}/appointments/hold/${holdToken}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
    } catch {
      // Mock hold release succeeds silently
    }
  },

  async bookAppointment(data: {
    doctorId: string;
    date: string;
    startTime: string;
    endTime: string;
    symptoms: string;
    holdToken?: string;
  }): Promise<{ appointment: Appointment }> {
    try {
      const res = await fetch(`${API_BASE}/appointments/book`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      return await handleResponse(res);
    } catch (err) {
      const apt = MockDataStore.bookAppointment(data);
      return { appointment: apt };
    }
  },

  async getAppointments(status?: string, date?: string): Promise<{ appointments: Appointment[] }> {
    try {
      const params = new URLSearchParams();
      if (status) params.append('status', status);
      if (date) params.append('date', date);
      const res = await fetch(`${API_BASE}/appointments?${params.toString()}`, {
        headers: getHeaders()
      });
      const data = await handleResponse<{ appointments: Appointment[] }>(res);
      if (Array.isArray(data.appointments)) return data;
      throw new Error('Invalid appointments response');
    } catch (err) {
      return { appointments: await MockDataStore.attachDemoRecords(MockDataStore.getAppointments(status)) };
    }
  },

  async cancelAppointment(id: string, reason?: string): Promise<void> {
    try {
      const res = await fetch(`${API_BASE}/appointments/${id}`, {
        method: 'DELETE',
        headers: getHeaders(),
        body: JSON.stringify({ reason })
      });
      await handleResponse(res);
    } catch (err) {
      MockDataStore.cancelAppointment(id);
    }
  },

  // Consultations & Post-Visit
  async submitPostVisit(appointmentId: string, data: { clinicalNotes: string; prescriptions: PrescriptionItem[] }): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/consultations/${appointmentId}/post-visit`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      return await handleResponse(res);
    } catch (err) {
      return MockDataStore.submitPostVisit(appointmentId, data);
    }
  },

  async getMedicationReminders(): Promise<{ medications: MedicationReminderItem[] }> {
    try {
      const res = await fetch(`${API_BASE}/consultations/medications`, {
        headers: getHeaders()
      });
      const data = await handleResponse<{ medications: MedicationReminderItem[] }>(res);
      if (Array.isArray(data.medications)) return data;
      throw new Error('Invalid medications response');
    } catch (err) {
      return { medications: MockDataStore.getMedications() };
    }
  },

  async toggleMedicationReminder(id: string): Promise<{ isActive: boolean }> {
    try {
      const res = await fetch(`${API_BASE}/consultations/medications/${id}/toggle`, {
        method: 'PATCH',
        headers: getHeaders()
      });
      return await handleResponse(res);
    } catch (err) {
      const next = MockDataStore.toggleMedication(id);
      return { isActive: next };
    }
  },

  // Admin
  async getAdminAnalytics(): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/admin/analytics`, {
        headers: getHeaders()
      });
      const data = await handleResponse<any>(res);
      if (data && data.stats) return data;
      throw new Error('Invalid analytics response');
    } catch (err) {
      return MockDataStore.getAdminAnalytics();
    }
  },

  async createDoctor(data: any): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/admin/doctors`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      return await handleResponse(res);
    } catch (err) {
      const doc = MockDataStore.addDoctor(data);
      return { doctor: doc };
    }
  },

  async updateDoctor(id: string, data: any): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/admin/doctors/${id}`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify(data)
      });
      return await handleResponse(res);
    } catch (err) {
      return { success: true };
    }
  },

  async markDoctorOnLeave(doctorId: string, leaveDate: string, reason?: string): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/admin/doctors/${doctorId}/leave`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ leaveDate, reason })
      });
      return await handleResponse(res);
    } catch (err) {
      return { success: true, message: 'Leave recorded (demo mode)' };
    }
  },

  async getDoctorLeaves(doctorId: string): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/admin/doctors/${doctorId}/leaves`, {
        headers: getHeaders()
      });
      return await handleResponse(res);
    } catch (err) {
      return { leaves: [] };
    }
  },

  async removeDoctorLeave(doctorId: string, leaveDate: string): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/admin/doctors/${doctorId}/leaves/${leaveDate}`, {
        method: 'DELETE',
        headers: getHeaders()
      });
      return await handleResponse(res);
    } catch (err) {
      return { success: true };
    }
  },

  // Notifications Log
  async getNotificationLogs(): Promise<any> {
    try {
      const res = await fetch(`${API_BASE}/notifications`, {
        headers: getHeaders()
      });
      const data = await handleResponse<any>(res);
      if (data && Array.isArray(data.logs)) return data;
      throw new Error('Invalid notification logs');
    } catch (err) {
      return { logs: MockDataStore.getNotificationLogs() };
    }
  },

  // Real-time AI Symptom Analysis
  async analyzeSymptoms(symptoms: string): Promise<{ analysis: { urgencyLevel: 'LOW' | 'MEDIUM' | 'HIGH'; chiefComplaint: string; suggestedQuestions: string[] } }> {
    try {
      const res = await fetch(`${API_BASE}/appointments/analyze-symptoms`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ symptoms })
      });
      return await handleResponse(res);
    } catch (err) {
      const s = symptoms.toLowerCase();
      let urgency: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      let complaint = symptoms.slice(0, 40);
      let questions = [
        'How long have you had these symptoms?',
        'Does anything make the symptoms better or worse?',
        'Are you currently taking any prescription medications?'
      ];

      if (s.includes('chest') || s.includes('breath') || s.includes('heart') || s.includes('severe')) {
        urgency = 'HIGH';
        complaint = 'Cardiorespiratory / Acute Chest Discomfort';
        questions = [
          'Does the chest discomfort radiate to your arm, neck, or back?',
          'Are you experiencing sweating, lightheadedness, or shortness of breath?',
          'Do you have a personal or family history of heart disease?'
        ];
      } else if (s.includes('fever') || s.includes('cough') || s.includes('throat') || s.includes('headache')) {
        urgency = 'MEDIUM';
        complaint = 'Acute Upper Respiratory & Febrile Symptoms';
        questions = [
          'What is your highest recorded body temperature?',
          'Are you producing colored phlegm or experiencing wheezing?',
          'Have you been in close contact with anyone who tested positive for influenza or COVID-19?'
        ];
      }

      return {
        analysis: {
          urgencyLevel: urgency,
          chiefComplaint: complaint,
          suggestedQuestions: questions
        }
      };
    }
  },

  // Blockchain verification (public — no login required)
  async verifyRecord(recordHash: string): Promise<VerificationResult | null> {
    try {
      const res = await fetch(`${API_BASE}/verify/${encodeURIComponent(recordHash)}`);
      return await handleResponse<VerificationResult>(res);
    } catch (err) {
      // No backend (standalone demo): fall back to demo records; the page still checks the chain directly when configured.
      return MockDataStore.getDemoVerification(recordHash);
    }
  },

  // Blockchain admin
  async getBlockchainOverview(): Promise<BlockchainOverview> {
    try {
      const res = await fetch(`${API_BASE}/admin/blockchain`, { headers: getHeaders() });
      const data = await handleResponse<BlockchainOverview>(res);
      if (data && Array.isArray(data.doctors)) return data;
      throw new Error('Invalid blockchain overview response');
    } catch (err) {
      return MockDataStore.getBlockchainOverview();
    }
  },

  async registerDoctorOnChain(doctorId: string): Promise<{ message: string; txHash?: string | null }> {
    const res = await fetch(`${API_BASE}/admin/doctors/${doctorId}/blockchain/register`, {
      method: 'POST',
      headers: getHeaders()
    });
    return handleResponse(res);
  },

  async setDoctorChainStatus(doctorId: string, active: boolean): Promise<{ message: string; txHash?: string }> {
    const res = await fetch(`${API_BASE}/admin/doctors/${doctorId}/blockchain/status`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ active })
    });
    return handleResponse(res);
  }
};
