/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { addPlatformSessionListener, clearPlatformSession, getPlatformSession } from '@/lib/platformSession';
import {
  fetchPlatformCurrentRoles,
  fetchPlatformSessionProfile,
  signInWithPlatform,
  signOutWithPlatform,
  signUpWithPlatform,
} from '@/services/authService';

const AuthContext = createContext(undefined);
const rolePriority = ['super_admin', 'gestor', 'bibliotecaria', 'professor', 'aluno'];

function pickPrimaryRole(userRoles) {
  return rolePriority.find((role) => userRoles.includes(role)) || null;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState(null);
  const [roles, setRoles] = useState([]);

  const syncAuthState = useCallback(async () => {
    const localSession = getPlatformSession();

    if (!localSession?.access_token) {
      setSession(null);
      setUser(null);
      setRoles([]);
      setUserRole(null);
      return;
    }

    try {
      const payload = await fetchPlatformSessionProfile();
      const uniqueRoles = [...new Set(payload?.roles || [])];
      setSession(payload?.session || localSession);
      setUser(payload?.user || localSession?.user || null);
      setRoles(uniqueRoles);
      setUserRole(pickPrimaryRole(uniqueRoles));
    } catch (error) {
      console.error('Error syncing auth state:', error);
      clearPlatformSession();
      setSession(null);
      setUser(null);
      setRoles([]);
      setUserRole(null);
    }
  }, []);

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
      const currentRoles = await fetchPlatformCurrentRoles().catch(() => []);
      setSession(getPlatformSession());
      setUser(result.user || getPlatformSession()?.user || null);
      setRoles(currentRoles);
      setUserRole(pickPrimaryRole(currentRoles));
    }
    return { error: result.error };
  }, []);

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
  }, []);

  const value = useMemo(() => ({
    user,
    session,
    loading,
    userRole,
    roles,
    isGestor: userRole === 'gestor',
    isProfessor: userRole === 'professor',
    isBibliotecaria: userRole === 'bibliotecaria',
    isAluno: userRole === 'aluno',
    isSuperAdmin: userRole === 'super_admin',
    signIn,
    signUp,
    signOut,
  }), [loading, roles, session, signIn, signOut, signUp, user, userRole]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
