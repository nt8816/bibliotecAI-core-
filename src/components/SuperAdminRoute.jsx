import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AppShellState } from '@/components/AppShellState';

export function SuperAdminRoute({ children }) {
  const { loading, user, isSuperAdmin } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <AppShellState title="Preparando seu painel" description="Conferindo o acesso à administração da plataforma." />
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
