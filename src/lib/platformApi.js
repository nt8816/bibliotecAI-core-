import { supabase } from '@/integrations/supabase/client';

const PLATFORM_API_BASE_URL = String(import.meta.env.VITE_PLATFORM_API_BASE_URL || '').trim().replace(/\/+$/, '');

function buildUrl(routePath) {
  const safePath = String(routePath || '').trim();
  if (!safePath.startsWith('/')) {
    throw new Error('A rota da Platform API deve comecar com "/".');
  }
  return `${PLATFORM_API_BASE_URL}${safePath}`;
}

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data?.session?.access_token || '';
}

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  return response.text();
}

export function isPlatformApiConfigured() {
  return Boolean(PLATFORM_API_BASE_URL);
}

export function isPlatformApiUnavailableError(error) {
  return Boolean(error?.platformUnavailable);
}

export async function requestPlatformApi(routePath, { method = 'GET', body, headers } = {}) {
  if (!isPlatformApiConfigured()) {
    const error = new Error('Platform API nao configurada.');
    error.platformUnavailable = true;
    throw error;
  }

  const accessToken = await getAccessToken();
  const response = await fetch(buildUrl(routePath), {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { Authorization: `Bearer ${accessToken}`, 'x-user-access-token': accessToken } : {}),
      ...(headers || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await parseResponse(response);

  if (!response.ok) {
    const message =
      (typeof payload === 'string' && payload.trim()) ||
      payload?.error ||
      payload?.message ||
      `Falha na Platform API (HTTP ${response.status}).`;

    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;
    error.platformUnavailable = response.status === 404 || response.status === 501;
    throw error;
  }

  return payload;
}
