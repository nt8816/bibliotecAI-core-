import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchInviteTokens() {
  const payload = await requestPlatformApi('/v1/tokens-convite');
  return {
    tokens: Array.isArray(payload?.tokens) ? payload.tokens : [],
    criadoresInfo: payload?.criadoresInfo || {},
    utilizadoresInfo: payload?.utilizadoresInfo || {},
  };
}

export async function createInviteToken(roleDestino) {
  return requestPlatformApi('/v1/tokens-convite', {
    method: 'POST',
    body: { roleDestino },
  });
}

export async function deleteInviteToken(id) {
  return requestPlatformApi(`/v1/tokens-convite/${id}/delete`, {
    method: 'POST',
  });
}
