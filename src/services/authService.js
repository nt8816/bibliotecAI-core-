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

export async function authenticatePlatformCredentials(email, password) {
  return requestPlatformApi('/v1/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

export async function finalizePlatformSession(session) {
  const accessToken = session?.access_token;
  const refreshToken = session?.refresh_token;

  if (!accessToken || !refreshToken) {
    throw new Error('Sessao temporaria invalida.');
  }

  const { error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  if (error) throw error;
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

function buildPendingHeaders(pendingAccessToken) {
  return pendingAccessToken
    ? {
      Authorization: `Bearer ${pendingAccessToken}`,
      'x-user-access-token': pendingAccessToken,
    }
    : {};
}

export async function fetchSuperAdminSecurityProfile(pendingAccessToken, context) {
  return requestPlatformApi('/v1/auth/super-admin/security-profile', {
    method: 'POST',
    headers: buildPendingHeaders(pendingAccessToken),
    body: { context },
  });
}

export async function beginSuperAdminPasskeyRegistration(pendingAccessToken, context) {
  return requestPlatformApi('/v1/auth/super-admin/passkeys/register/options', {
    method: 'POST',
    headers: buildPendingHeaders(pendingAccessToken),
    body: { context },
  });
}

export async function finishSuperAdminPasskeyRegistration(pendingAccessToken, payload) {
  return requestPlatformApi('/v1/auth/super-admin/passkeys/register/verify', {
    method: 'POST',
    headers: buildPendingHeaders(pendingAccessToken),
    body: payload,
  });
}

export async function beginSuperAdminPasskeyAuthentication(pendingAccessToken, context) {
  return requestPlatformApi('/v1/auth/super-admin/passkeys/authenticate/options', {
    method: 'POST',
    headers: buildPendingHeaders(pendingAccessToken),
    body: { context },
  });
}

export async function finishSuperAdminPasskeyAuthentication(pendingAccessToken, payload) {
  return requestPlatformApi('/v1/auth/super-admin/passkeys/authenticate/verify', {
    method: 'POST',
    headers: buildPendingHeaders(pendingAccessToken),
    body: payload,
  });
}

export async function sendSuperAdminEmailCode(pendingAccessToken, challengeId) {
  return requestPlatformApi('/v1/auth/super-admin/email/send-code', {
    method: 'POST',
    headers: buildPendingHeaders(pendingAccessToken),
    body: { challengeId },
  });
}

export async function verifySuperAdminEmailCode(pendingAccessToken, challengeId, code) {
  return requestPlatformApi('/v1/auth/super-admin/email/verify-code', {
    method: 'POST',
    headers: buildPendingHeaders(pendingAccessToken),
    body: { challengeId, code },
  });
}

export async function startSuperAdminDesktopApproval(pendingAccessToken, context) {
  return requestPlatformApi('/v1/auth/super-admin/desktop/start', {
    method: 'POST',
    headers: buildPendingHeaders(pendingAccessToken),
    body: { context },
  });
}

export async function fetchSuperAdminDesktopApprovalStatus(token) {
  return requestPlatformApi(`/v1/auth/super-admin/desktop/challenges/${encodeURIComponent(token)}`);
}

export async function approveSuperAdminDesktopAccess(pendingAccessToken, token, authChallengeId) {
  return requestPlatformApi('/v1/auth/super-admin/desktop/approve', {
    method: 'POST',
    headers: buildPendingHeaders(pendingAccessToken),
    body: { token, authChallengeId },
  });
}
