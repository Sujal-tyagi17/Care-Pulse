import React from 'react';
import { useAuth } from './context/AuthContext';
import { AuthPage } from './pages/AuthPage';
import { PatientDashboard } from './pages/PatientDashboard';
import { DoctorDashboard } from './pages/DoctorDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { VerifyPage } from './pages/VerifyPage';

export const App: React.FC = () => {
  const { user, isLoading } = useAuth();

  // Public prescription verification (QR code target) — no login required.
  if (window.location.pathname.startsWith('/verify')) {
    return <VerifyPage />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#070e1e] flex flex-col items-center justify-center text-white space-y-4">
        <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin shadow-neon-cyan" />
        <p className="text-sm font-semibold tracking-wide text-on-surface-variant font-heading">
          Loading...
        </p>
      </div>
    );
  }

  if (!user) {
    return <AuthPage />;
  }

  return (
    <div className="min-h-screen bg-background text-on-background selection:bg-primary-container selection:text-white">
      {user.role === 'PATIENT' && <PatientDashboard />}
      {user.role === 'DOCTOR' && <DoctorDashboard />}
      {user.role === 'ADMIN' && <AdminDashboard />}
    </div>
  );
};
