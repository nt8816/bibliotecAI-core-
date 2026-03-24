import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchAdminTenantsDashboard() {
  const payload = await requestPlatformApi('/v1/admin/tenants');
  return {
    tenants: Array.isArray(payload?.tenants) ? payload.tenants : [],
    schoolsWithoutTenant: Array.isArray(payload?.schoolsWithoutTenant) ? payload.schoolsWithoutTenant : [],
  };
}

export async function provisionAdminTenant(payload) {
  return requestPlatformApi('/v1/admin/tenants', {
    method: 'POST',
    body: payload,
  });
}

export async function toggleAdminTenantStatus(tenantId, ativo) {
  return requestPlatformApi(`/v1/admin/tenants/${tenantId}/status`, {
    method: 'PATCH',
    body: { ativo },
  });
}

export async function createAdminTenantInvite(tenantId, payload = {}) {
  return requestPlatformApi(`/v1/admin/tenants/${tenantId}/invite`, {
    method: 'POST',
    body: payload,
  });
}

export async function deleteAdminTenantSchool(tenantId) {
  return requestPlatformApi(`/v1/admin/tenants/${tenantId}/delete`, {
    method: 'POST',
  });
}

export async function deleteAdminOrphanSchool(escolaId) {
  return requestPlatformApi(`/v1/admin/schools/${escolaId}/delete`, {
    method: 'POST',
  });
}

export async function listAdminTenantGestores(escolaId) {
  const payload = await requestPlatformApi('/v1/admin/gestores/list', {
    method: 'POST',
    body: { escola_id: escolaId },
  });
  return Array.isArray(payload?.gestores) ? payload.gestores : [];
}

export async function resetAdminTenantGestorPassword(escolaId, gestorId, novaSenha) {
  return requestPlatformApi('/v1/admin/gestores/reset-password', {
    method: 'POST',
    body: { escola_id: escolaId, gestor_id: gestorId, nova_senha: novaSenha },
  });
}

export async function deleteAdminTenantGestor(payload) {
  return requestPlatformApi('/v1/admin/gestores/delete', {
    method: 'POST',
    body: payload,
  });
}
