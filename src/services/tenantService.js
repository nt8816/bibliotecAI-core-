import { requestPlatformApi } from '@/lib/platformApi';

export async function resolveTenantBySubdomain(subdomain) {
  const safe = String(subdomain || '').trim().toLowerCase();
  if (!safe) return null;
  const payload = await requestPlatformApi(`/v1/public/tenant?subdomain=${encodeURIComponent(safe)}`, { auth: false });
  return payload?.tenant || null;
}
