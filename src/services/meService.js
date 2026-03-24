import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchMyProfile() {
  const payload = await requestPlatformApi('/v1/me/profile');
  return payload?.profile || null;
}

export async function updateMyProfile(profile) {
  const payload = await requestPlatformApi('/v1/me/profile', {
    method: 'PATCH',
    body: profile,
  });

  return payload?.profile || null;
}

export async function updateMyPassword({ password, metadata }) {
  return requestPlatformApi('/v1/auth/password', {
    method: 'POST',
    body: { password, metadata },
  });
}
