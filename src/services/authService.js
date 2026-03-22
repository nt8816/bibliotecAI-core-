import { supabase } from '@/integrations/supabase/client';
import { isPlatformApiConfigured, isPlatformApiUnavailableError, requestPlatformApi } from '@/lib/platformApi';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';

async function requestWithFallback(platformCall, fallbackCall) {
  if (isPlatformApiConfigured()) {
    try {
      return await platformCall();
    } catch (error) {
      if (!isPlatformApiUnavailableError(error)) throw error;
    }
  }

  return fallbackCall();
}

export async function signInWithPlatform(email, password) {
  return requestWithFallback(
    async () => {
      const payload = await requestPlatformApi('/v1/auth/login', {
        method: 'POST',
        body: { email, password },
      });

      const accessToken = payload?.session?.access_token;
      const refreshToken = payload?.session?.refresh_token;

      if (!accessToken || !refreshToken) {
        throw new Error('Sessao invalida retornada pela Platform API.');
      }

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      return { error };
    },
    async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      return { error };
    },
  );
}

export async function signUpWithPlatform(email, password, nome) {
  const redirectUrl = `${window.location.origin}/`;
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: redirectUrl,
      data: { nome },
    },
  });

  return { error };
}

export async function signOutWithPlatform() {
  return requestWithFallback(
    async () => {
      try {
        await requestPlatformApi('/v1/auth/logout', { method: 'POST' });
      } finally {
        await supabase.auth.signOut();
      }

      return { error: null };
    },
    async () => {
      await supabase.auth.signOut();
      return { error: null };
    },
  );
}

export async function fetchPlatformSessionProfile() {
  return requestWithFallback(
    async () => {
      const payload = await requestPlatformApi('/v1/auth/session');
      return {
        session: payload?.session || null,
        user: payload?.user || null,
        roles: Array.isArray(payload?.roles) ? payload.roles : [],
      };
    },
    async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const session = sessionData?.session || null;
      const user = session?.user || null;

      if (!user?.id) {
        return { session, user, roles: [] };
      }

      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (roleError) throw roleError;

      return {
        session,
        user,
        roles: [...new Set((roleData || []).map((item) => item.role))],
      };
    },
  );
}

export async function fetchPlatformCurrentRoles() {
  return requestWithFallback(
    async () => {
      const payload = await requestPlatformApi('/v1/auth/session');
      return Array.isArray(payload?.roles) ? payload.roles : [];
    },
    async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const userId = sessionData?.session?.user?.id;
      if (!userId) return [];

      const { data: roleData, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (roleError) throw roleError;
      return [...new Set((roleData || []).map((item) => item.role))];
    },
  );
}

export async function resolvePlatformLoginIdentifier(identifier) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/auth/resolve-login', {
      method: 'POST',
      body: { identifier },
    }),
    async () => {
      const normalized = String(identifier || '').trim();
      const cpfDigits = normalized.replace(/\D/g, '');
      const matriculaCompacta = normalized.replace(/\s+/g, '');

      const [superAdminRes, cpfRes, matriculaRes, activatedRes] = await Promise.all([
        supabase.rpc('resolve_super_admin_login', { _identifier: normalized }),
        supabase.rpc('get_login_email_by_cpf', { _cpf: cpfDigits || normalized }),
        supabase.rpc('get_login_email_by_matricula', { _matricula: matriculaCompacta || normalized }),
        supabase.rpc('is_matricula_login_activated', { _matricula: matriculaCompacta || normalized }),
      ]);

      if (superAdminRes.error) throw superAdminRes.error;
      if (cpfRes.error && !(cpfRes.error.code === 'PGRST202' || cpfRes.error.status === 404)) throw cpfRes.error;
      if (matriculaRes.error && !(matriculaRes.error.code === 'PGRST202' || matriculaRes.error.status === 404)) throw matriculaRes.error;
      if (activatedRes.error && !(activatedRes.error.code === 'PGRST202' || activatedRes.error.status === 404)) throw activatedRes.error;

      return {
        superAdminMatch: superAdminRes.data || null,
        cpfEmail: cpfRes.data || null,
        matriculaEmail: matriculaRes.data || null,
        matriculaActivated: activatedRes.data ?? null,
      };
    },
  );
}

export async function registerPlatformSuperAdminLoginSuccess(email) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/auth/super-admin/login-success', {
      method: 'POST',
      body: { email, path: '/auth' },
    }),
    async () => {
      const { data, error } = await supabase.rpc('register_super_admin_login_success', {
        _email: email,
        _path: '/auth',
      });
      if (error) throw error;
      return data;
    },
  );
}

export async function registerPlatformSuperAdminFailedAttempt(identifier, context) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/auth/super-admin/failed-attempt', {
      method: 'POST',
      body: { identifier, path: '/auth', context },
    }),
    async () => {
      const { data, error } = await supabase.rpc('register_super_admin_failed_attempt', {
        _identifier: identifier,
        _path: '/auth',
        _context: context,
      });
      if (error) throw error;
      return data;
    },
  );
}

export async function activateStudentMatricula(matricula, senha) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/auth/activate-matricula', {
      method: 'POST',
      body: { matricula, senha },
    }),
    async () => invokeEdgeFunction('ativar-aluno-matricula', {
      body: { matricula, senha },
      requireAuth: false,
      fallbackErrorMessage: 'Não foi possível ativar sua conta por matrícula.',
    }),
  );
}
