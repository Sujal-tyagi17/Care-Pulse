import React, { useEffect } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from './context/AuthContext';
import { usePath, navigate } from './lib/router';
import { LandingPage } from './pages/LandingPage';
import { LoginPage } from './pages/LoginPage';
import { PatientDashboard } from './pages/PatientDashboard';
import { DoctorDashboard } from './pages/DoctorDashboard';
import { AdminDashboard } from './pages/AdminDashboard';
import { VerifyPage } from './pages/VerifyPage';

const Redirect: React.FC<{ to: string }> = ({ to }) => {
  useEffect(() => navigate(to), [to]);
  return null;
};

export const App: React.FC = () => {
  const { user, isLoading } = useAuth();
  const path = usePath();

  // Public prescription verification (QR code target): no login required.
  if (path.startsWith('/verify')) return <VerifyPage />;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center gap-2 text-muted">
        <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
        Loading your workspace…
      </div>
    );
  }

  if (path.startsWith('/login')) return user ? <Redirect to="/" /> : <LoginPage />;
  if (!user) return <LandingPage />;

  return (
    <div className="min-h-screen bg-background text-fg">
      {user.role === 'PATIENT' && <PatientDashboard />}
      {user.role === 'DOCTOR' && <DoctorDashboard />}
      {user.role === 'ADMIN' && <AdminDashboard />}
    </div>
  );
};
