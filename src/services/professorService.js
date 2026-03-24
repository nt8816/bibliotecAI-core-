import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchProfessorPainelData() {
  return requestPlatformApi('/v1/professor/painel');
}

export async function createProfessorSugestão(payload) {
  return requestPlatformApi('/v1/professor/sugestoes', {
    method: 'POST',
    body: payload,
  });
}

export async function deleteProfessorSugestão(id) {
  return requestPlatformApi(`/v1/professor/sugestoes/${id}/delete`, {
    method: 'POST',
  });
}

export async function saveProfessorAtividade(payload, atividadeId = null) {
  return requestPlatformApi(
    atividadeId ? `/v1/professor/atividades/${atividadeId}` : '/v1/professor/atividades',
    {
      method: atividadeId ? 'PATCH' : 'POST',
      body: payload,
    },
  );
}

export async function deleteProfessorAtividade(id) {
  return requestPlatformApi(`/v1/professor/atividades/${id}/delete`, {
    method: 'POST',
  });
}

export async function updateProfessorAtividadeStatus(id, status) {
  return requestPlatformApi(`/v1/professor/atividades/${id}/status`, {
    method: 'POST',
    body: { status },
  });
}

export async function avaliarProfessorEntrega(id, payload) {
  return requestPlatformApi(`/v1/professor/entregas/${id}/avaliar`, {
    method: 'POST',
    body: payload,
  });
}

