import { supabase } from '@/integrations/supabase/client';

const DEFAULT_ERROR_MESSAGE = 'Não foi possível concluir a operação.';
const JWT_REFRESH_BUFFER_SECONDS = 60;

const decodeJwtPayload = (token) => {
  try {
    const part = String(token || '').split('.')[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
};

const isTokenLikelyInvalidForCurrentProject = (token) => {
  const payload = decodeJwtPayload(token);
  if (!payload) return true;

  const nowInSeconds = Math.floor(Date.now() / 1000);
  if (!payload.exp || Number(payload.exp) <= nowInSeconds + JWT_REFRESH_BUFFER_SECONDS) {
    return true;
  }

  const expectedProjectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID;
  if (!expectedProjectRef) return false;
  if (payload.ref && String(payload.ref) !== String(expectedProjectRef)) return true;

  return false;
};

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

const getAccessToken = async ({ forceRefresh = false } = {}) => {
  if (forceRefresh) {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    if (refreshError) throw new Error('Sessão expirada. Faça login novamente.');

    const refreshedToken = refreshData?.session?.access_token;
    if (!refreshedToken || isTokenLikelyInvalidForCurrentProject(refreshedToken)) {
      throw new Error('Sessão inválida. Faça login novamente.');
    }
    return refreshedToken;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw new Error(sessionError.message || 'Não foi possível validar sua sessão.');

  const session = sessionData?.session;
  const accessToken = session?.access_token;
  if (!accessToken) throw new Error('Sessão inválida. Faça login novamente.');
  if (isTokenLikelyInvalidForCurrentProject(accessToken)) {
    return getAccessToken({ forceRefresh: true });
  }

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
  const invokeOnce = async ({ forceRefresh = false } = {}) => {
    const finalHeaders = { ...(headers || {}) };

    if (requireAuth) {
      const accessToken = await getAccessToken({ forceRefresh });
      finalHeaders.Authorization = `Bearer ${accessToken}`;
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

  if (result.error) {
    const message = await extractFunctionErrorMessage(result.error, fallbackErrorMessage);
    throw new Error(message);
  }

  return result.data;
};
