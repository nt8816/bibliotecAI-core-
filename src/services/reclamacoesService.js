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

export async function fetchReclamacoesFeed() {
  return requestWithFallback(
    async () => {
      const payload = await requestPlatformApi('/v1/reclamacoes');
      return Array.isArray(payload?.items) ? payload.items : [];
    },
    async () => {
      const { data, error } = await supabase.rpc('get_reclamacoes_super_admin_feed');
      if (error) throw error;
      return data || [];
    },
  );
}

export async function createReclamacao(payload) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/reclamacoes', { method: 'POST', body: payload }),
    async () => {
      const { error } = await supabase.from('reclamacoes_super_admin').insert(payload);
      if (error) throw error;
      return { success: true };
    },
  );
}

export async function updateReclamacao(id, payload) {
  return requestWithFallback(
    async () => requestPlatformApi(`/v1/reclamacoes/${id}`, { method: 'PATCH', body: payload }),
    async () => {
      const { error } = await supabase
        .from('reclamacoes_super_admin')
        .update(payload)
        .eq('id', id);
      if (error) throw error;
      return { success: true };
    },
  );
}

export async function markReclamacaoAsRead(id) {
  return requestWithFallback(
    async () => requestPlatformApi(`/v1/reclamacoes/${id}/read`, { method: 'POST' }),
    async () => {
      const { error } = await supabase.rpc('mark_reclamacao_super_admin_lida', {
        _reclamacao_id: id,
      });
      if (error) throw error;
      return { success: true };
    },
  );
}
