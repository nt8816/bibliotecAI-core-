import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchAdminLogs({ page = 0, pageSize = 50, level = 'all', range = '7', search = '' } = {}) {
  const query = new URLSearchParams({
    page: String(page),
    pageSize: String(pageSize),
    level: String(level || 'all'),
    range: String(range || '7'),
    search: String(search || ''),
  });
  const payload = await requestPlatformApi(`/v1/admin/logs?${query.toString()}`);
  return Array.isArray(payload?.items) ? payload.items : [];
}
