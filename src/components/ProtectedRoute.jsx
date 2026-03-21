import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AppShellState } from '@/components/AppShellState';

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <AppShellState
        title="Validando acesso"
        description="Conferindo permissões da sua conta."
      />
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  return children;
}

