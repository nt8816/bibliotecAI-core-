const PLATFORM_SESSION_STORAGE_KEY = 'bibliotecai.platform.session.v1';
const PLATFORM_SESSION_EVENT = 'bibliotecai:platform-session-changed';
const PLATFORM_API_BASE_URL = String(import.meta.env.VITE_PLATFORM_API_BASE_URL || '').trim().replace(/\/+$/, '');

function isBrowser() {
  return typeof window !== 'undefined'
    && typeof localStorage !== 'undefined'
    && typeof sessionStorage !== 'undefined';
}

function getSessionStorage() {
  if (!isBrowser()) return null;
  return window.sessionStorage;
}

function getLegacyStorage() {
  if (!isBrowser()) return null;
  return window.localStorage;
}

function buildPlatformApiUrl(routePath) {
  const safePath = String(routePath || '').trim();
  if (!PLATFORM_API_BASE_URL || !safePath.startsWith('/')) return '';
  return `${PLATFORM_API_BASE_URL}${safePath}`;
}

function parseJsonSafely(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function normalizeSessionPayload(session) {
  const source = session?.session && typeof session.session === 'object' ? session.session : session;
  if (!source || typeof source !== 'object') return null;

  const accessToken = String(source.access_token || '').trim();
  const refreshToken = String(source.refresh_token || '').trim();
  if (!accessToken || !refreshToken) return null;

  return {
    ...source,
    access_token: accessToken,
    refresh_token: refreshToken,
  };
}

function notifyPlatformSessionChanged(session) {
  if (!isBrowser()) return;

  window.dispatchEvent(new CustomEvent(PLATFORM_SESSION_EVENT, {
    detail: { session: session || null },
  }));
}

export function getPlatformSession() {
  if (!isBrowser()) return null;
  const sessionStorageRef = getSessionStorage();
  const legacyStorageRef = getLegacyStorage();

  const currentSession = normalizeSessionPayload(parseJsonSafely(
    sessionStorageRef?.getItem(PLATFORM_SESSION_STORAGE_KEY),
  ));

  if (currentSession) return currentSession;

  const legacySession = normalizeSessionPayload(parseJsonSafely(
    legacyStorageRef?.getItem(PLATFORM_SESSION_STORAGE_KEY),
  ));

  if (!legacySession) return null;

  sessionStorageRef?.setItem(PLATFORM_SESSION_STORAGE_KEY, JSON.stringify(legacySession));
  legacyStorageRef?.removeItem(PLATFORM_SESSION_STORAGE_KEY);
  return legacySession;
}

export function setPlatformSession(session) {
  const normalized = normalizeSessionPayload(session);
  if (!isBrowser()) return normalized;

  const sessionStorageRef = getSessionStorage();
  const legacyStorageRef = getLegacyStorage();

  if (!normalized) {
    sessionStorageRef?.removeItem(PLATFORM_SESSION_STORAGE_KEY);
    legacyStorageRef?.removeItem(PLATFORM_SESSION_STORAGE_KEY);
    notifyPlatformSessionChanged(null);
    return null;
  }

  sessionStorageRef?.setItem(PLATFORM_SESSION_STORAGE_KEY, JSON.stringify(normalized));
  legacyStorageRef?.removeItem(PLATFORM_SESSION_STORAGE_KEY);
  notifyPlatformSessionChanged(normalized);
  return normalized;
}

export function clearPlatformSession() {
  if (!isBrowser()) return;
  getSessionStorage()?.removeItem(PLATFORM_SESSION_STORAGE_KEY);
  getLegacyStorage()?.removeItem(PLATFORM_SESSION_STORAGE_KEY);
  notifyPlatformSessionChanged(null);
}

export function getPlatformAccessToken() {
  return getPlatformSession()?.access_token || '';
}

export function getPlatformRefreshToken() {
  return getPlatformSession()?.refresh_token || '';
}

export function addPlatformSessionListener(callback) {
  if (!isBrowser()) return () => {};

  const handleCustomEvent = (event) => {
    callback(event?.detail?.session || null);
  };

  const handleStorage = (event) => {
    if (event.key !== PLATFORM_SESSION_STORAGE_KEY) return;
    callback(getPlatformSession());
  };

  window.addEventListener(PLATFORM_SESSION_EVENT, handleCustomEvent);
  window.addEventListener('storage', handleStorage);

  return () => {
    window.removeEventListener(PLATFORM_SESSION_EVENT, handleCustomEvent);
    window.removeEventListener('storage', handleStorage);
  };
}

export async function refreshPlatformSession() {
  const refreshToken = getPlatformRefreshToken();
  const refreshUrl = buildPlatformApiUrl('/v1/auth/refresh');

  if (!refreshUrl) {
    throw new Error('Platform API nao configurada.');
  }

  if (!refreshToken) {
    clearPlatformSession();
    throw new Error('Sessao invalida. Faca login novamente.');
  }

  const response = await fetch(refreshUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refreshToken }),
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    clearPlatformSession();
    throw new Error(
      payload?.error ||
      payload?.message ||
      `Falha ao renovar a sessao (HTTP ${response.status}).`,
    );
  }

  const session = setPlatformSession(payload?.session || payload);
  if (!session?.access_token) {
    clearPlatformSession();
    throw new Error('Sessao invalida retornada pela Platform API.');
  }

  return session;
}
