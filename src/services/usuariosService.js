import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchUsuariosModuleData() {
  return requestPlatformApi('/v1/usuarios');
}

export async function saveProfessorTurmas({ professorId, professorUserId, currentEscolaId, turmas }) {
  return requestPlatformApi('/v1/usuarios/professor-turmas', {
    method: 'POST',
    body: { professorId, professorUserId, currentEscolaId, turmas },
  });
}

export async function provisionarAlunoComMatricula(payload) {
  return requestPlatformApi('/v1/usuarios/provisionar-aluno', {
    method: 'POST',
    body: payload,
  });
}

export async function saveUsuario(payload, editingUsuarioId) {
  return editingUsuarioId
    ? requestPlatformApi(`/v1/usuarios/${editingUsuarioId}`, {
      method: 'PATCH',
      body: payload,
    })
    : requestPlatformApi('/v1/usuarios', {
      method: 'POST',
      body: payload,
    });
}

export async function excluirUsuarios(ids) {
  const normalizedIds = Array.isArray(ids)
    ? ids.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  if (normalizedIds.length === 0) {
    throw new Error('Nenhum usuario informado para exclusao.');
  }

  try {
    return await requestPlatformApi('/v1/usuarios/delete-batch', {
      method: 'POST',
      body: { ids: normalizedIds },
    });
  } catch (error) {
    const routeNotFound = error?.status === 404 || String(error?.message || '').toLowerCase().includes('rota nao encontrada');
    if (!routeNotFound) {
      throw error;
    }

    const results = [];
    for (const id of normalizedIds) {
      const payload = await requestPlatformApi(`/v1/usuarios/${id}/delete`, {
        method: 'POST',
      });
      results.push(payload);
    }

    return {
      success: true,
      deleted_count: results.reduce((total, item) => total + Number(item?.deleted_count || 0), 0),
      deleted_ids: results.flatMap((item) => Array.isArray(item?.deleted_ids) ? item.deleted_ids : []),
      deleted_user_ids: results.flatMap((item) => Array.isArray(item?.deleted_user_ids) ? item.deleted_user_ids : []),
    };
  }
}

export async function importUsuariosBatch({ usuarios, tipoUsuarioImport, currentEscolaId, userId }) {
  return requestPlatformApi('/v1/usuarios/import', {
    method: 'POST',
    body: { usuarios, tipoUsuarioImport, currentEscolaId, userId },
  });
}

export async function resetAlunoPassword(alunoId, novaSenha) {
  return requestPlatformApi('/v1/usuarios/reset-aluno-password', {
    method: 'POST',
    body: { aluno_id: alunoId, nova_senha: novaSenha },
  });
}
