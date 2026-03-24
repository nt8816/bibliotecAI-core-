import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchConviteContext(token) {
  return requestPlatformApi('/v1/public/convites/context', {
    method: 'POST',
    auth: false,
    body: { token },
  });
}

export async function registerViaConvite(payload) {
  return requestPlatformApi('/v1/public/convites/register', {
    method: 'POST',
    auth: false,
    body: payload,
  });
}

export async function fetchTenantInviteContext(token) {
  return requestPlatformApi('/v1/public/tenant-invites/context', {
    method: 'POST',
    auth: false,
    body: { token },
  });
}

export async function registerTenantGestor(payload) {
  return requestPlatformApi('/v1/public/tenant-invites/register', {
    method: 'POST',
    auth: false,
    body: payload,
  });
}
