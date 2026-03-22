import { supabase } from '@/integrations/supabase/client';
import { isPlatformApiConfigured, isPlatformApiUnavailableError, requestPlatformApi } from '@/lib/platformApi';

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
