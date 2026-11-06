import { requestPlatformApi } from '@/lib/platformApi';

function buildRoleHintHeaders() {
  // Role must come from the authenticated session, never from a client header.
  return {};
}

export async function fetchArquivosAulaData({ roleHint } = {}) {
  return requestPlatformApi('/v1/arquivos-aula', {
    headers: buildRoleHintHeaders(roleHint),
  });
}

export async function createArquivosAulaPost(payload, { roleHint } = {}) {
  return requestPlatformApi('/v1/arquivos-aula', {
    method: 'POST',
    body: payload,
    headers: buildRoleHintHeaders(roleHint),
  });
}

export async function updateArquivosAulaFiles(postId, arquivos, { roleHint } = {}) {
  return requestPlatformApi(`/v1/arquivos-aula/${postId}/arquivos`, {
    method: 'PATCH',
    body: { arquivos },
    headers: buildRoleHintHeaders(roleHint),
  });
}

export async function deleteArquivosAulaPost(postId, { roleHint } = {}) {
  return requestPlatformApi(`/v1/arquivos-aula/${postId}/delete`, {
    method: 'POST',
    headers: buildRoleHintHeaders(roleHint),
  });
}
