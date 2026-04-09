import { Navigate, useLocation } from 'react-router-dom';

import { useAuth } from '@/hooks/useAuth';
import { getDefaultRouteForRole } from '@/lib/defaultRoute';
import { AppShellState } from '@/components/AppShellState';

export function RoleProtectedRoute({ children, allowedRoles = [] }) {
  const { user, loading, userRole } = useAuth();
  const location = useLocation();
  const normalizedAllowedRoles = Array.isArray(allowedRoles)
    ? allowedRoles.map((role) => String(role || '').trim().toLowerCase()).filter(Boolean)
    : [];

  if (loading) {
    return (
      <AppShellState
        title="Validando acesso"
        description="Conferindo permissões da sua conta."
      />
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ from: location }} />;
  }

  if (!userRole) {
    return (
      <AppShellState
        title="Finalizando acesso"
        description="Estamos carregando o perfil da sua conta."
      />
    );
  }

  if (!normalizedAllowedRoles.includes(userRole)) {
    return <Navigate to={getDefaultRouteForRole(userRole)} replace />;
  }

  return children;
}
