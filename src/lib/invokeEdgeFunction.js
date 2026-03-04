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
  const invokeOnce = async () => {
    // Let the Supabase SDK attach the current auth session token.
    // For public functions we can explicitly remove Authorization.
    const finalHeaders = { ...(headers || {}) };
    if (!requireAuth) {
      delete finalHeaders.Authorization;
      delete finalHeaders.authorization;
    }
    return supabase.functions.invoke(functionName, { body, headers: finalHeaders });
  };

  let result = await invokeOnce();

  if (result.error && requireAuth && retryOnUnauthorized && isUnauthorized(result.error)) {
    try {
      const { error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw refreshError;
      result = await invokeOnce();
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

