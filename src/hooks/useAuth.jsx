/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { addPlatformSessionListener, clearPlatformSession, getPlatformSession } from '@/lib/platformSession';
import { pickPrimaryRole } from '@/lib/defaultRoute';
import {
  fetchPlatformSessionProfile,
  signInWithPlatform,
  signOutWithPlatform,
  signUpWithPlatform,
} from '@/services/authService';

const AuthContext = createContext(undefined);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [roles, setRoles] = useState([]);
  const [tenantContext, setTenantContext] = useState(null);

  const applyAuthPayload = useCallback((payload, fallbackSession = null) => {
    const uniqueRoles = [...new Set(payload?.roles || [])];
    setSession(payload?.session || fallbackSession || getPlatformSession() || null);
    setUser(payload?.user || fallbackSession?.user || null);
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

    syncAuthState()
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
  }, [syncAuthState]);

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
  }), [loading, roles, session, signIn, signOut, signUp, tenantContext, user, userRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
