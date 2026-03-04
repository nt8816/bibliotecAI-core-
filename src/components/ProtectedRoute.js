import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

const FIXED_TENANT_ADMIN_EMAIL = 'nt@gmail.com';
export function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();
    const location = useLocation();
    if (loading) {
        return (_jsx("div", { className: "min-h-screen flex items-center justify-center bg-background", children: _jsx(Loader2, { className: "w-8 h-8 animate-spin text-primary" }) }));
    }
    if (!user) {
        return _jsx(Navigate, { to: "/auth", replace: true });
    }
    const isFixedAdmin = String(user?.email || '').trim().toLowerCase() === FIXED_TENANT_ADMIN_EMAIL;
    if (isFixedAdmin && !location.pathname.startsWith('/admin')) {
        return _jsx(Navigate, { to: "/admin/tenants", replace: true });
    }
    return _jsx(_Fragment, { children: children });
}
