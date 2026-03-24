import { requestPlatformApi } from '@/lib/platformApi';
import { clearPlatformSession, getPlatformSession, setPlatformSession } from '@/lib/platformSession';

function toErrorResult(error) {
  return { error: error instanceof Error ? error : new Error(String(error || 'Falha inesperada.')) };
}

export async function signInWithPlatform(email, password) {
  try {
    const payload = await requestPlatformApi('/v1/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });

    const session = setPlatformSession(payload?.session || payload);
    if (!session?.access_token || !session?.refresh_token) {
      throw new Error('Sessao invalida retornada pela Platform API.');
    }

    return { error: null, user: payload?.user || session?.user || null };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function signUpWithPlatform(email, password, nome) {
  try {
    const payload = await requestPlatformApi('/v1/auth/signup', {
      method: 'POST',
      body: {
        email,
        password,
        nome,
        redirectUrl: `${window.location.origin}/`,
      },
      auth: false,
    });

    if (payload?.session?.access_token && payload?.session?.refresh_token) {
      setPlatformSession(payload.session);
    }

    return { error: null, data: payload };
  } catch (error) {
    return toErrorResult(error);
  }
}

export async function signOutWithPlatform() {
  try {
    if (getPlatformSession()?.access_token) {
      await requestPlatformApi('/v1/auth/logout', {
        method: 'POST',
      }).catch(() => null);
    }
  } finally {
    clearPlatformSession();
  }

  return { error: null };
}

export async function fetchPlatformSessionProfile() {
  const session = getPlatformSession();
  if (!session?.access_token) {
    return { session: null, user: null, roles: [] };
  }

  const payload = await requestPlatformApi('/v1/auth/session');
  return {
    session: getPlatformSession(),
    user: payload?.user || session?.user || null,
    roles: Array.isArray(payload?.roles) ? payload.roles : [],
  };
}

export async function fetchPlatformCurrentRoles() {
  const payload = await fetchPlatformSessionProfile();
  return Array.isArray(payload?.roles) ? payload.roles : [];
}

export async function resolvePlatformLoginIdentifier(identifier) {
  return requestPlatformApi('/v1/auth/resolve-login', {
    method: 'POST',
    body: { identifier },
    auth: false,
  });
}

export async function registerPlatformSuperAdminLoginSuccess(email) {
  return requestPlatformApi('/v1/auth/super-admin/login-success', {
    method: 'POST',
    body: { email, path: '/auth' },
  });
}

export async function registerPlatformSuperAdminFailedAttempt(identifier, context) {
  return requestPlatformApi('/v1/auth/super-admin/failed-attempt', {
    method: 'POST',
    body: { identifier, path: '/auth', context },
    auth: false,
  });
}

export async function activateStudentMatricula(matricula, senha) {
  return requestPlatformApi('/v1/auth/activate-matricula', {
    method: 'POST',
    body: { matricula, senha },
    auth: false,
  });
}
