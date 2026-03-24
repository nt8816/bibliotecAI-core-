import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchSchoolConfiguration() {
  const payload = await requestPlatformApi('/v1/escola/config');
  return {
    escola: payload?.escola || null,
    salas: Array.isArray(payload?.salas) ? payload.salas : [],
  };
}

export async function saveSchoolConfiguration(nome) {
  const payload = await requestPlatformApi('/v1/escola/config', {
    method: 'POST',
    body: { nome },
  });
  return payload?.escola || null;
}

export async function createSchoolRoom({ nome, tipo }) {
  const payload = await requestPlatformApi('/v1/escola/salas', {
    method: 'POST',
    body: { nome, tipo },
  });
  return payload?.sala || null;
}

export async function renameSchoolRoom(id, nome) {
  return requestPlatformApi(`/v1/escola/salas/${id}`, {
    method: 'PATCH',
    body: { nome },
  });
}

export async function deleteSchoolRoom({ salaId, salaNome }) {
  return requestPlatformApi('/v1/escola/salas/delete', {
    method: 'POST',
    body: { salaId, salaNome },
  });
}
