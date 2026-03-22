import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
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

async function getUserAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const accessToken = data?.session?.access_token;
  if (!accessToken) {
    throw new Error('Sessao invalida. Faca login novamente.');
  }
  return accessToken;
}

export async function fetchSuperAdminsDashboard() {
  return requestWithFallback(
    async () => {
      const payload = await requestPlatformApi('/v1/admin/super-admins');
      return {
        items: Array.isArray(payload?.items) ? payload.items : [],
        securityAlert: payload?.securityAlert || null,
      };
    },
    async () => {
      const [accountsRes, alertsRes] = await Promise.all([
        supabase
          .from('super_admin_accounts')
          .select('id, nome, email, cpf, ativo, bloqueado, tentativas_falhas, ultima_tentativa_em, ultimo_login_em, bloqueado_em, created_at')
          .order('created_at', { ascending: true }),
        supabase
          .from('system_logs')
          .select('id, event, message, ip, created_at, context')
          .in('event', ['super_admin_login_failed', 'super_admin_account_locked'])
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      if (accountsRes.error) throw accountsRes.error;
      if (alertsRes.error) throw alertsRes.error;

      return {
        items: accountsRes.data || [],
        securityAlert: (alertsRes.data || [])[0] || null,
      };
    },
  );
}

export async function createSuperAdminAccount(payload) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/admin/super-admins', { method: 'POST', body: payload }),
    async () => {
      const accessToken = await getUserAccessToken();
      return invokeEdgeFunction('gerenciar-super-admins', {
        body: {
          operation: 'create',
          ...payload,
        },
        requireAuth: false,
        headers: {
          'x-user-access-token': accessToken,
        },
        transport: 'http',
        fallbackErrorMessage: 'Nao foi possivel criar o Super Admin.',
      });
    },
  );
}

export async function unlockSuperAdminAccount(accountId) {
  return requestWithFallback(
    async () => requestPlatformApi(`/v1/admin/super-admins/${accountId}/unlock`, { method: 'POST' }),
    async () => {
      const accessToken = await getUserAccessToken();
      return invokeEdgeFunction('gerenciar-super-admins', {
        body: {
          operation: 'unlock',
          account_id: accountId,
        },
        requireAuth: false,
        headers: {
          'x-user-access-token': accessToken,
        },
        transport: 'http',
        fallbackErrorMessage: 'Nao foi possivel liberar a conta.',
      });
    },
  );
}
