import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchReclamacoesFeed() {
  const payload = await requestPlatformApi('/v1/reclamacoes');
  return Array.isArray(payload?.items) ? payload.items : [];
}

export async function createReclamacao(payload) {
  return requestPlatformApi('/v1/reclamacoes', { method: 'POST', body: payload });
}

export async function updateReclamacao(id, payload) {
  return requestPlatformApi(`/v1/reclamacoes/${id}`, { method: 'PATCH', body: payload });
}

export async function markReclamacaoAsRead(id) {
  return requestPlatformApi(`/v1/reclamacoes/${id}/read`, { method: 'POST' });
}

