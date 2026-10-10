import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, UserRole } from '../types';
import { api } from '../api/client';
import { navigate } from '../lib/router';

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; role?: string; phone?: string }) => Promise<void>;
  logout: () => void;
  switchDemoUser: (role: UserRole) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const DEMO_USERS: Record<string, User> = {
  'rahul@example.com': {
    id: 'demo-patient-id',
    name: 'Rahul Sharma',
    email: 'rahul@example.com',
    role: 'PATIENT',
    phone: '+91 98765 43210'
  },
  'dr.rajesh@carepulse.com': {
    id: 'demo-doctor-id',
    name: 'Dr. Rajesh Sharma',
    email: 'dr.rajesh@carepulse.com',
    role: 'DOCTOR',
    phone: '+91 98765 43211',
    doctorProfile: {
      id: 'demo-profile-id',
      specialization: 'Cardiology',
      bio: 'Senior Consultant Cardiologist & Electrophysiologist with 15+ years experience in preventive cardiology.',
      slotDurationMinutes: 30,
      workingHoursStart: '09:00',
      workingHoursEnd: '17:00',
      consultationFee: 1200,
      roomNumber: 'Suite 201 (Cardiology Wing)'
    }
  },
  'admin@carepulse.com': {
    id: 'demo-admin-id',
    name: 'Clinic Administrator',
    email: 'admin@carepulse.com',
    role: 'ADMIN',
    phone: '+91 98765 43212'
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('carepulse_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    async function loadUser() {
      if (token) {
        if (token.startsWith('demo-token-')) {
          const cached = localStorage.getItem('carepulse_user');
          if (cached) {
            try {
              setUser(JSON.parse(cached));
            } catch {
              logout();
            }
          }
        } else {
          try {
            const res = await api.getMe();
            setUser(res.user);
          } catch {
            const cached = localStorage.getItem('carepulse_user');
            if (cached) {
              try {
                setUser(JSON.parse(cached));
              } catch {
                logout();
              }
            } else {
              logout();
            }
          }
        }
      }
      setIsLoading(false);
    }
    loadUser();
  }, [token]);

  const login = async (email: string, password: string) => {
    try {
      const res = await api.login(email, password);
      localStorage.setItem('carepulse_token', res.token);
      localStorage.setItem('carepulse_user', JSON.stringify(res.user));
      setToken(res.token);
      setUser(res.user);
    } catch (err: any) {
      // Instant demo fallback when backend is deploying or offline
      const demoUser = DEMO_USERS[email.toLowerCase().trim()];
      if (demoUser) {
        const demoToken = `demo-token-${demoUser.role.toLowerCase()}`;
        localStorage.setItem('carepulse_token', demoToken);
        localStorage.setItem('carepulse_user', JSON.stringify(demoUser));
        setToken(demoToken);
        setUser(demoUser);
        return;
      }
      throw err;
    }
  };

  const register = async (data: { name: string; email: string; password: string; role?: string; phone?: string }) => {
    const res = await api.register(data);
    localStorage.setItem('carepulse_token', res.token);
    localStorage.setItem('carepulse_user', JSON.stringify(res.user));
    setToken(res.token);
    setUser(res.user);
  };

  const logout = () => {
    localStorage.removeItem('carepulse_token');
    localStorage.removeItem('carepulse_user');
    setToken(null);
    setUser(null);
    navigate('/');
  };

  const switchDemoUser = async (role: UserRole) => {
    setIsLoading(true);
    try {
      if (role === 'PATIENT') {
        await login('rahul@example.com', 'password123');
      } else if (role === 'DOCTOR') {
        await login('dr.rajesh@carepulse.com', 'doctor123');
      } else if (role === 'ADMIN') {
        await login('admin@carepulse.com', 'admin123');
      }
    } catch (err) {
      console.error('Demo switch failed:', err);
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, register, logout, switchDemoUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
