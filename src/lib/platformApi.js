import { getPlatformAccessToken, refreshPlatformSession } from '@/lib/platformSession';

const PLATFORM_API_BASE_URL = String(import.meta.env.VITE_PLATFORM_API_BASE_URL || '').trim().replace(/\/+$/, '');

function buildUrl(routePath) {
  const safePath = String(routePath || '').trim();
  if (!safePath.startsWith('/')) {
    throw new Error('A rota da Platform API deve comecar com "/".');
  }
  return `${PLATFORM_API_BASE_URL}${safePath}`;
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

export async function requestPlatformApi(routePath, {
  method = 'GET',
  body,
  headers,
  auth = true,
  retryOnUnauthorized = true,
} = {}) {
  if (!isPlatformApiConfigured()) {
    const error = new Error('Platform API nao configurada.');
    error.platformUnavailable = true;
    throw error;
  }

  const executeRequest = async () => {
    const accessToken = auth ? getPlatformAccessToken() : '';
    return fetch(buildUrl(routePath), {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}`, 'x-user-access-token': accessToken } : {}),
        ...(headers || {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  };

  let response = await executeRequest();

  if (response.status === 401 && auth && retryOnUnauthorized) {
    try {
      await refreshPlatformSession();
      response = await executeRequest();
    } catch (refreshError) {
      const error = new Error(refreshError?.message || 'Sessao invalida. Faca login novamente.');
      error.status = 401;
      throw error;
    }
  }

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
