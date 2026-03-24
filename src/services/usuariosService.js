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
  return requestPlatformApi('/v1/usuarios/delete-batch', {
    method: 'POST',
    body: { ids },
  });
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
