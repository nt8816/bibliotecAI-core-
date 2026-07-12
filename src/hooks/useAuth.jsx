/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { addPlatformSessionListener, clearPlatformSession, getPlatformSession } from '@/lib/platformSession';
import { pickPrimaryRole } from '@/lib/defaultRoute';
import {
  consumeTenantSessionHandoff,
  fetchPlatformSessionProfile,
  signInWithPlatform,
  signOutWithPlatform,
  signUpWithPlatform,
} from '@/services/authService';

const AuthContext = createContext(undefined);

function normalizeRoleList(rawRoles) {
  if (!Array.isArray(rawRoles)) return [];
  return [...new Set(
    rawRoles
      .map((role) => String(role || '').trim().toLowerCase())
      .filter(Boolean),
  )];
}

function extractRolesFromPayload(payload, fallbackSession = null) {
  const directRoles = normalizeRoleList(payload?.roles);
  if (directRoles.length > 0) return directRoles;

  const user = payload?.user || fallbackSession?.user || null;
  const fromUserArray = normalizeRoleList(
    user?.roles
    || user?.app_metadata?.roles
    || user?.user_metadata?.roles,
  );
  if (fromUserArray.length > 0) return fromUserArray;

  const singleCandidates = [
    user?.role,
    user?.app_metadata?.role,
    user?.user_metadata?.role,
  ]
    .map((role) => String(role || '').trim().toLowerCase())
    .filter(Boolean);

  return [...new Set(singleCandidates)];
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [roles, setRoles] = useState([]);
  const [tenantContext, setTenantContext] = useState(null);

  const applyAuthPayload = useCallback((payload, fallbackSession = null) => {
    const resolvedSession = payload?.session || fallbackSession || getPlatformSession() || null;
    const resolvedUser = payload?.user || fallbackSession?.user || null;
    const uniqueRoles = extractRolesFromPayload({ ...payload, user: resolvedUser }, resolvedSession);
    setSession(resolvedSession);
    setUser(resolvedUser);
    setRoles(uniqueRoles);
    setUserRole(pickPrimaryRole(uniqueRoles));
    setTenantContext(payload?.tenant || null);
  }, []);

  const syncAuthState = useCallback(async () => {
    const localSession = getPlatformSession();

    if (!localSession?.access_token) {
      setSession(null);
      setUser(null);
      setRoles([]);
      setUserRole(null);
      setTenantContext(null);
      return;
    }

    try {
      const payload = await fetchPlatformSessionProfile();
      applyAuthPayload(payload, localSession);
    } catch (error) {
      console.error('Error syncing auth state:', error);
      clearPlatformSession();
      setSession(null);
      setUser(null);
      setRoles([]);
      setUserRole(null);
      setTenantContext(null);
    }
  }, [applyAuthPayload]);

  useEffect(() => {
    let mounted = true;

    const bootstrapAuthState = async () => {
      const handoffPayload = await consumeTenantSessionHandoff().catch((error) => {
        console.error('Falha ao consumir handoff de sessao:', error);
        return null;
      });
      if (handoffPayload) {
        applyAuthPayload(handoffPayload, handoffPayload.session || getPlatformSession());
        return;
      }

      await syncAuthState();
    };

    bootstrapAuthState()
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const unsubscribe = addPlatformSessionListener(() => {
      syncAuthState();
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, [applyAuthPayload, syncAuthState]);

  const signIn = useCallback(async (email, password) => {
    const result = await signInWithPlatform(email, password);
    if (!result.error) {
      applyAuthPayload(result.data || {}, getPlatformSession());
      await syncAuthState().catch(() => null);
    }
    return { error: result.error };
  }, [applyAuthPayload, syncAuthState]);

  const signUp = useCallback(async (email, password, nome) => {
    const result = await signUpWithPlatform(email, password, nome);
    if (!result.error) {
      await syncAuthState();
    }
    return { error: result.error };
  }, [syncAuthState]);

  const signOut = useCallback(async () => {
    await signOutWithPlatform();
      setSession(null);
      setUser(null);
      setRoles([]);
      setUserRole(null);
      setTenantContext(null);
  }, []);

  const applySuperAdminSession = useCallback((sessionData) => {
    const resolvedSession = sessionData?.session || getPlatformSession() || null;
    const resolvedUser = sessionData?.user || resolvedSession?.user || null;
    const adminRoles = ['super_admin'];
    setSession(resolvedSession);
    setUser(resolvedUser);
    setRoles(adminRoles);
    setUserRole('super_admin');
    setTenantContext(sessionData?.tenant || null);
  }, []);

  const value = useMemo(() => ({
    user,
    session,
    loading,
    userRole,
    roles,
    tenantContext,
    isGestor: userRole === 'gestor',
    isProfessor: userRole === 'professor',
    isBibliotecaria: userRole === 'bibliotecaria',
    isAluno: userRole === 'aluno',
    isSuperAdmin: userRole === 'super_admin',
    signIn,
    signUp,
    signOut,
    applySuperAdminSession,
  }), [loading, roles, session, signIn, signOut, signUp, tenantContext, user, userRole, applySuperAdminSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
