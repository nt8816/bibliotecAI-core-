import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchSuperAdminsDashboard() {
  const payload = await requestPlatformApi('/v1/admin/super-admins');
  return {
    items: Array.isArray(payload?.items) ? payload.items : [],
    securityAlert: payload?.securityAlert || null,
  };
}

export async function createSuperAdminAccount(payload) {
  return requestPlatformApi('/v1/admin/super-admins', {
    method: 'POST',
    body: payload,
  });
}

export async function unlockSuperAdminAccount(accountId) {
  return requestPlatformApi(`/v1/admin/super-admins/${accountId}/unlock`, {
    method: 'POST',
  });
}
