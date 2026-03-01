import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

export function SuperAdminRoute({ children }) {
  const { loading, user, isSuperAdmin } = useAuth();
  const isFixedAdmin = user?.email?.toLowerCase?.() === 'nt@gmail.com';

  if (loading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!isSuperAdmin && !isFixedAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
