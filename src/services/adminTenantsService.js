import { supabase } from '@/integrations/supabase/client';
import { isPlatformApiConfigured, isPlatformApiUnavailableError, requestPlatformApi } from '@/lib/platformApi';

async function requestWithFallback(platformCall, supabaseCall) {
  if (isPlatformApiConfigured()) {
    try {
      return await platformCall();
    } catch (error) {
      if (!isPlatformApiUnavailableError(error)) throw error;
    }
  }

  return supabaseCall();
}

export async function fetchAdminTenantsDashboard() {
  return requestWithFallback(
    async () => {
      const payload = await requestPlatformApi('/v1/admin/tenants');
      return {
        tenants: Array.isArray(payload?.tenants) ? payload.tenants : [],
        schoolsWithoutTenant: Array.isArray(payload?.schoolsWithoutTenant) ? payload.schoolsWithoutTenant : [],
      };
    },
    async () => {
      const [tenantsRes, escolasRes] = await Promise.all([
        supabase
          .from('tenants')
          .select('id, escola_id, nome, subdominio, schema_name, plano, ativo, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('escolas')
          .select('id, nome, gestor_id')
          .order('nome', { ascending: true }),
      ]);

      if (tenantsRes.error) throw tenantsRes.error;
      if (escolasRes.error) throw escolasRes.error;

      const tenants = tenantsRes.data || [];
      const schools = escolasRes.data || [];
      const schoolIdsWithTenant = new Set(tenants.map((tenant) => tenant.escola_id).filter(Boolean));

      return {
        tenants,
        schoolsWithoutTenant: schools.filter((school) => !schoolIdsWithTenant.has(school.id)),
      };
    },
  );
}

export async function provisionAdminTenant(payload) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/admin/tenants', { method: 'POST', body: payload }),
    async () => {
      let { data, error } = await supabase.rpc('provision_tenant', {
        _escola_nome: payload?.escolaNome,
        _subdominio: payload?.subdominio,
        _plano: payload?.plano,
        _base_domain: payload?.baseDomain,
        _invite_cpf: payload?.inviteCpf || null,
        _invite_expires_hours: payload?.inviteExpiresHours || 72,
      });

      if (
        error &&
        (error?.code === 'PGRST202'
          || error?.status === 404
          || `${error?.message || ''} ${error?.details || ''}`.toLowerCase().includes('could not find the function public.provision_tenant'))
      ) {
        ({ data, error } = await supabase.rpc('provision_tenant', {
          _escola_nome: payload?.escolaNome,
          _subdominio: payload?.subdominio,
          _plano: payload?.plano,
          _base_domain: payload?.baseDomain,
          _invite_email: null,
          _invite_expires_hours: payload?.inviteExpiresHours || 72,
        }));
      }

      if (error) throw error;
      return data;
    },
  );
}

export async function toggleAdminTenantStatus(tenantId, ativo) {
  return requestWithFallback(
    async () => requestPlatformApi(`/v1/admin/tenants/${tenantId}/status`, { method: 'PATCH', body: { ativo } }),
    async () => {
      const { error } = await supabase
        .from('tenants')
        .update({ ativo })
        .eq('id', tenantId);

      if (error) throw error;
      return { success: true };
    },
  );
}
