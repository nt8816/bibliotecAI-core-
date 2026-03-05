import { supabase } from '@/integrations/supabase/client';

const DEFAULT_ERROR_MESSAGE = 'Não foi possível concluir a operação.';
const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID;
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || (PROJECT_ID ? `https://${PROJECT_ID}.supabase.co` : '');
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const isUnauthorized = (error) => {
  const status = error?.context?.status;
  const message = String(error?.message || '').toLowerCase();
  return status === 401 || message.includes('unauthorized') || message.includes('jwt');
};

const parseResponsePayload = async (response) => {
  const contentType = response.headers?.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  return response.text();
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
      return supabase.functions.invoke(functionName, { body, headers: finalHeaders });
    } else {
      delete finalHeaders.Authorization;
      delete finalHeaders.authorization;

      if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
        return {
          data: null,
          error: new Error('Supabase env ausente. Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY.'),
        };
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
          'Content-Type': 'application/json',
          ...finalHeaders,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      if (!response.ok) {
        let message = fallbackErrorMessage;
        try {
          const payload = await parseResponsePayload(response.clone());
          message =
            (typeof payload === 'string' && payload.trim()) ||
            payload?.error ||
            payload?.message ||
            `${fallbackErrorMessage} (HTTP ${response.status})`;
        } catch {
          message = `${fallbackErrorMessage} (HTTP ${response.status})`;
        }

        return {
          data: null,
          error: { message, context: response },
        };
      }

      const payload = await parseResponsePayload(response);
      return { data: payload, error: null };
    }
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
