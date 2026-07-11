import { isPlatformApiUnavailableError, requestPlatformApi } from '@/lib/platformApi';
import { getPlatformAccessToken } from '@/lib/platformSession';

const SUPABASE_URL = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const SUPABASE_ANON_KEY = String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || '').trim();

async function invokeResetAlunoPasswordFunction(alunoId, novaSenha) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('Supabase nao configurado para redefinir senha.');
  }

  const accessToken = getPlatformAccessToken();
  if (!accessToken) {
    throw new Error('Sessao invalida. Faca login novamente.');
  }

  const response = await fetch(`${SUPABASE_URL}/functions/v1/redefinir-senha-aluno`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      'x-supabase-auth': accessToken,
    },
    body: JSON.stringify({ aluno_id: alunoId, nova_senha: novaSenha }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.error || payload?.message || 'Nao foi possivel redefinir a senha.');
  }

  return payload;
}

function isUnsupportedJwtAlgorithmError(error) {
  const message = String(error?.message || error?.payload?.error || error?.payload?.message || '').toLowerCase();
  return message.includes('unsupported jwt algorithm');
}

export async function fetchUsuariosModuleData({ userId, tenantEscolaId } = {}) {
  const params = new URLSearchParams();
  if (userId) params.set('userId', userId);
  if (tenantEscolaId) params.set('escolaId', tenantEscolaId);
  const query = params.toString() ? `?${params.toString()}` : '';
  return requestPlatformApi(`/v1/usuarios${query}`);
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
  try {
    return await requestPlatformApi('/v1/usuarios/reset-aluno-password', {
      method: 'POST',
      body: { aluno_id: alunoId, nova_senha: novaSenha },
    });
  } catch (error) {
    if (!isPlatformApiUnavailableError(error) && !isUnsupportedJwtAlgorithmError(error)) {
      throw error;
    }
    return invokeResetAlunoPasswordFunction(alunoId, novaSenha);
  }
}
