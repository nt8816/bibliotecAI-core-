/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

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
  if (Array.isArray(payload?.roles)) return normalizeRoleList(payload.roles);

  const user = payload?.user || fallbackSession?.user || null;
  const fromUserArray = normalizeRoleList(user?.app_metadata?.roles);
  if (fromUserArray.length > 0) return fromUserArray;

  const singleCandidates = [
    user?.role,
    user?.app_metadata?.role,
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
  const superAdminOverrideRef = useRef(false);
  const authSyncGenerationRef = useRef(0);

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
    if (superAdminOverrideRef.current) return;
    const generation = ++authSyncGenerationRef.current;

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
      if (generation !== authSyncGenerationRef.current || superAdminOverrideRef.current) return;
      applyAuthPayload(payload, localSession);
    } catch (error) {
      if (generation !== authSyncGenerationRef.current || superAdminOverrideRef.current) return;
      if (error?.payload?.requires_super_admin_security === true) {
        try { window.sessionStorage.setItem('bibliotecai.auth.notice', 'Confirme novamente o acesso de superadministrador para continuar.'); } catch { /* storage indisponível */ }
      }
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
      const handoffPayload = await consumeTenantSessionHandoff().catch(() => null);
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
      authSyncGenerationRef.current += 1;
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
    superAdminOverrideRef.current = false;
    authSyncGenerationRef.current += 1;
    try {
      await signOutWithPlatform();
    } finally {
      setSession(null);
      setUser(null);
      setRoles([]);
      setUserRole(null);
      setTenantContext(null);
    }
  }, []);

  const applySuperAdminSession = useCallback((sessionData) => {
    const resolvedSession = sessionData?.session || getPlatformSession() || null;
    const resolvedUser = sessionData?.user || resolvedSession?.user || null;
    const adminRoles = ['super_admin'];
    superAdminOverrideRef.current = true;
    authSyncGenerationRef.current += 1;
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
