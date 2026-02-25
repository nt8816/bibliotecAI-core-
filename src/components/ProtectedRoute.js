import { jsx as _jsx, Fragment as _Fragment } from "react/jsx-runtime";
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { BookLoadingScreen } from '@/components/BookLoadingScreen';
export function ProtectedRoute({ children }) {
    const { user, loading } = useAuth();
    if (loading) {
        return _jsx(BookLoadingScreen, { message: "Carregando sua conta..." });
    }
    if (!user) {
        return _jsx(Navigate, { to: "/auth", replace: true });
    }
    return _jsx(_Fragment, { children: children });
}
