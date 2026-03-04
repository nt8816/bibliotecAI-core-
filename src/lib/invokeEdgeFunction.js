import { supabase } from '@/integrations/supabase/client';

const DEFAULT_ERROR_MESSAGE = 'Não foi possível concluir a operação.';

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
  const getAccessToken = async ({ forceRefresh = false } = {}) => {
    if (forceRefresh) {
      const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      const refreshedToken = refreshData?.session?.access_token;
      if (!refreshedToken) throw new Error('Sessão inválida. Faça login novamente.');
      return refreshedToken;
    }

    const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) throw new Error('Sessão inválida. Faça login novamente.');
    return accessToken;
  };

  const invokeOnce = async ({ forceRefresh = false } = {}) => {
    const finalHeaders = { ...(headers || {}) };

    if (requireAuth) {
      const accessToken = await getAccessToken({ forceRefresh });
      finalHeaders.Authorization = `Bearer ${accessToken}`;
    } else {
      delete finalHeaders.Authorization;
      delete finalHeaders.authorization;
    }

    return supabase.functions.invoke(functionName, { body, headers: finalHeaders });
  };

  let result = await invokeOnce();

  if (result.error && requireAuth && retryOnUnauthorized && isUnauthorized(result.error)) {
    try {
      result = await invokeOnce({ forceRefresh: true });
    } catch {
      if (signOutOnAuthFailure) await supabase.auth.signOut();
      throw new Error('Sua sessão expirou. Faça login novamente.');
    }
  }

  if (result.error && requireAuth && isUnauthorized(result.error) && signOutOnAuthFailure) {
    await supabase.auth.signOut();
    throw new Error('Sua sessão expirou. Faça login novamente.');
  }

  if (result.error) {
    const message = await extractFunctionErrorMessage(result.error, fallbackErrorMessage);
    throw new Error(message);
  }

  return result.data;
};
