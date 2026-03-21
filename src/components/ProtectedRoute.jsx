import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { AppShellState } from '@/components/AppShellState';

const FIXED_TENANT_ADMIN_EMAIL = 'nt@gmail.com';
const FIXED_ADMIN_ALLOWED_PATHS = ['/reclamacoes'];

export function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

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

  const isFixedAdmin = String(user?.email || '').trim().toLowerCase() === FIXED_TENANT_ADMIN_EMAIL;
  const canAccessNonAdminPath = FIXED_ADMIN_ALLOWED_PATHS.some((path) => location.pathname.startsWith(path));

  if (isFixedAdmin && !location.pathname.startsWith('/admin') && !canAccessNonAdminPath) {
    return <Navigate to="/admin/tenants" replace />;
  }

  return children;
}

