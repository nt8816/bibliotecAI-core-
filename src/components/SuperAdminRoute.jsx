import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function SuperAdminRoute({ children }) {
  const { loading, user, isSuperAdmin } = useAuth();

  if (loading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isSuperAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
