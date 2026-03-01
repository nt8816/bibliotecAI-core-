import { supabase } from '@/integrations/supabase/client';

const DEFAULT_ERROR_MESSAGE = 'Não foi possível concluir a operação.';
const ANON_BEARER = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const isUnauthorized = (error) => {
  const status = error?.context?.status;
  const message = String(error?.message || '').toLowerCase();
  return status === 401 || message.includes('unauthorized') || message.includes('jwt');
};

export const extractFunctionErrorMessage = async (error, fallback = DEFAULT_ERROR_MESSAGE) => {
  if (!error) return fallback;

  const response = error.context;
  if (response && typeof response.clone === 'function') {
    try {
      const clone = response.clone();
      const contentType = clone.headers?.get('content-type') || '';

      if (contentType.includes('application/json')) {
        const payload = await clone.json();
        if (typeof payload?.error === 'string' && payload.error.trim()) return payload.error;
        if (typeof payload?.message === 'string' && payload.message.trim()) return payload.message;
      } else {
        const text = await clone.text();
        if (text.trim()) return text.trim();
      }
    } catch {
      // ignore parse failures and fallback to generic handling below
    }
  }

  return error.message || fallback;
};

const getAccessToken = async () => {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message || 'Não foi possível validar sua sessão.');

  const session = sessionData?.session;
  if (!session?.refresh_token) throw new Error('Sessão inválida. Faça login novamente.');

  const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError) throw new Error('Sessão expirada. Faça login novamente.');

  const accessToken = refreshData?.session?.access_token || session?.access_token;
  if (!accessToken) throw new Error('Sessão inválida. Faça login novamente.');
  return accessToken;
};

export const invokeEdgeFunction = async (
  functionName,
  {
    body,
    headers,
    requireAuth = true,
    retryOnUnauthorized = true,
    fallbackErrorMessage = DEFAULT_ERROR_MESSAGE,
    signOutOnAuthFailure = false,
  } = {},
) => {
  const invokeOnce = async () => {
    const finalHeaders = { ...(headers || {}) };

    if (requireAuth) {
      const accessToken = await getAccessToken();
      finalHeaders.Authorization = `Bearer ${accessToken}`;
    } else if (!finalHeaders.Authorization && ANON_BEARER) {
      // Algumas Edge Functions exigem cabeçalho Authorization mesmo em rotas públicas.
      finalHeaders.Authorization = `Bearer ${ANON_BEARER}`;
    }

    return supabase.functions.invoke(functionName, { body, headers: finalHeaders });
  };

  let result = await invokeOnce();

  if (result.error && requireAuth && retryOnUnauthorized && isUnauthorized(result.error)) {
    const { error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) {
      if (signOutOnAuthFailure) await supabase.auth.signOut();
      throw new Error('Sua sessão expirou. Faça login novamente.');
    }
    result = await invokeOnce();
  }

  if (result.error) {
    const message = await extractFunctionErrorMessage(result.error, fallbackErrorMessage);
    throw new Error(message);
  }

  return result.data;
};
