import { requestPlatformApi } from '@/lib/platformApi';

function buildRoleHintHeaders(roleHint) {
  const normalized = String(roleHint || '').trim().toLowerCase();
  return normalized ? { 'x-profile-role-hint': normalized } : {};
}

export async function fetchProfessorPainelData({ roleHint } = {}) {
  return requestPlatformApi('/v1/professor/painel', {
    headers: buildRoleHintHeaders(roleHint),
  });
}

export async function createProfessorSugestão(payload, { roleHint } = {}) {
  return requestPlatformApi('/v1/professor/sugestoes', {
    method: 'POST',
    body: payload,
    headers: buildRoleHintHeaders(roleHint),
  });
}

export async function deleteProfessorSugestão(id, { roleHint } = {}) {
  return requestPlatformApi(`/v1/professor/sugestoes/${id}/delete`, {
    method: 'POST',
    headers: buildRoleHintHeaders(roleHint),
  });
}

export async function saveProfessorAtividade(payload, atividadeId = null, { roleHint } = {}) {
  return requestPlatformApi(
    atividadeId ? `/v1/professor/atividades/${atividadeId}` : '/v1/professor/atividades',
    {
      method: atividadeId ? 'PATCH' : 'POST',
      body: payload,
      headers: buildRoleHintHeaders(roleHint),
    },
  );
}

export async function deleteProfessorAtividade(id, { roleHint } = {}) {
  return requestPlatformApi(`/v1/professor/atividades/${id}/delete`, {
    method: 'POST',
    headers: buildRoleHintHeaders(roleHint),
  });
}

export async function updateProfessorAtividadeStatus(id, status, { roleHint } = {}) {
  return requestPlatformApi(`/v1/professor/atividades/${id}/status`, {
    method: 'POST',
    body: { status },
    headers: buildRoleHintHeaders(roleHint),
  });
}

export async function avaliarProfessorEntrega(id, payload, { roleHint } = {}) {
  return requestPlatformApi(`/v1/professor/entregas/${id}/avaliar`, {
    method: 'POST',
    body: payload,
    headers: buildRoleHintHeaders(roleHint),
  });
}
