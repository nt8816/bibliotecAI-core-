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
