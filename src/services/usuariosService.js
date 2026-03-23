import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import { isPlatformApiConfigured, isPlatformApiUnavailableError, requestPlatformApi } from '@/lib/platformApi';

async function requestWithFallback(platformCall, fallbackCall) {
  if (isPlatformApiConfigured()) {
    try {
      return await platformCall();
    } catch (error) {
      if (!isPlatformApiUnavailableError(error)) throw error;
    }
  }

  return fallbackCall();
}

export async function fetchUsuariosModuleData({ userId, tenantEscolaId }) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/usuarios'),
    async () => {
      const { data: profile, error } = await supabase
        .from('usuarios_biblioteca')
        .select('id, escola_id, tipo')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;

      let resolvedEscolaId = profile?.escola_id || tenantEscolaId || null;
      if (!resolvedEscolaId) {
        const { data: rpcEscolaId } = await supabase.rpc('get_user_escola_id', { _user_id: userId });
        resolvedEscolaId = rpcEscolaId || null;
      }

      if (!resolvedEscolaId) {
        const { data: escolaByGestor, error: escolaByGestorError } = await supabase
          .from('escolas')
          .select('id')
          .eq('gestor_id', userId)
          .maybeSingle();
        if (escolaByGestorError) throw escolaByGestorError;
        resolvedEscolaId = escolaByGestor?.id || null;
      }

      let usuariosQuery = supabase.from('usuarios_biblioteca').select('*').order('nome');
      let turmasQuery = supabase.from('salas_cursos').select('nome, tipo, escola_id').order('nome');
      let professorTurmasQuery = supabase.from('professor_turmas').select('professor_id, turma').order('turma');
      if (resolvedEscolaId) {
        usuariosQuery = usuariosQuery.eq('escola_id', resolvedEscolaId);
        turmasQuery = turmasQuery.eq('escola_id', resolvedEscolaId);
        professorTurmasQuery = professorTurmasQuery.eq('escola_id', resolvedEscolaId);
      }

      const [{ data: usuarios, error: usuariosError }, { data: turmas, error: turmasError }, { data: professorTurmas, error: professorTurmasError }] = await Promise.all([
        usuariosQuery,
        turmasQuery,
        professorTurmasQuery,
      ]);
      if (usuariosError) throw usuariosError;
      if (turmasError) throw turmasError;
      if (professorTurmasError && professorTurmasError.code !== '42P01' && professorTurmasError.code !== 'PGRST205') {
        throw professorTurmasError;
      }

      const professorTurmasMap = {};
      (professorTurmas || []).forEach((item) => {
        const professorId = String(item?.professor_id || '');
        const turma = String(item?.turma || '').trim();
        if (!professorId || !turma) return;
        if (!professorTurmasMap[professorId]) professorTurmasMap[professorId] = [];
        if (!professorTurmasMap[professorId].includes(turma)) professorTurmasMap[professorId].push(turma);
      });

      return {
        currentEscolaId: resolvedEscolaId || null,
        usuarios: usuarios || [],
        turmasDisponiveis: [...new Set((turmas || []).map((item) => String(item?.nome || '').trim()).filter(Boolean))],
        professorTurmasMap,
      };
    },
  );
}

export async function saveProfessorTurmas({ professorId, professorUserId, currentEscolaId, turmas }) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/usuarios/professor-turmas', {
      method: 'POST',
      body: { professorId, professorUserId, currentEscolaId, turmas },
    }),
    async () => {
      const turmasNormalizadas = [...new Set((turmas || []).map((turma) => String(turma || '').trim()).filter(Boolean))];
      let professorIds = [professorId];

      if (professorUserId) {
        const { data: siblingProfiles, error: siblingProfilesError } = await supabase
          .from('usuarios_biblioteca')
          .select('id')
          .eq('user_id', professorUserId)
          .eq('tipo', 'professor')
          .eq('escola_id', currentEscolaId);
        if (siblingProfilesError) throw siblingProfilesError;

        professorIds = [...new Set([professorId, ...(siblingProfiles || []).map((item) => item?.id).filter(Boolean)])];
      }

      const { error: deleteError } = await supabase
        .from('professor_turmas')
        .delete()
        .eq('escola_id', currentEscolaId)
        .in('professor_id', professorIds);
      if (deleteError) throw deleteError;

      if (turmasNormalizadas.length === 0) return { success: true };

      const payload = professorIds.flatMap((currentProfessorId) =>
        turmasNormalizadas.map((turma) => ({
          professor_id: currentProfessorId,
          escola_id: currentEscolaId,
          turma,
        })),
      );
      const { error: insertError } = await supabase.from('professor_turmas').insert(payload);
      if (insertError) throw insertError;
      return { success: true };
    },
  );
}

export async function provisionarAlunoComMatricula(payload) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/usuarios/provisionar-aluno', { method: 'POST', body: payload }),
    async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Sessao invalida. Faca login novamente.');

      const data = await invokeEdgeFunction('provisionar-aluno-matricula', {
        body: payload,
        headers: { 'x-user-access-token': accessToken },
        requireAuth: false,
        signOutOnAuthFailure: false,
        fallbackErrorMessage: 'Nao foi possivel provisionar login por matricula.',
      });
      if (!data?.success) throw new Error(data?.error || 'Nao foi possivel provisionar login por matricula.');
      return data;
    },
  );
}

export async function saveUsuario(payload, editingUsuarioId) {
  return requestWithFallback(
    async () => (
      editingUsuarioId
        ? requestPlatformApi(`/v1/usuarios/${editingUsuarioId}`, { method: 'PATCH', body: payload })
        : requestPlatformApi('/v1/usuarios', { method: 'POST', body: payload })
    ),
    async () => {
      if (editingUsuarioId) {
        const { error } = await supabase.from('usuarios_biblioteca').update(payload).eq('id', editingUsuarioId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('usuarios_biblioteca').insert(payload).select('id').single();
        if (error) throw error;
        return { success: true, id: data?.id || null };
      }
      return { success: true, id: editingUsuarioId };
    },
  );
}

export async function excluirUsuarios(ids) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/usuarios/delete-batch', { method: 'POST', body: { ids } }),
    async () => {
      const normalizedIds = [...new Set((ids || []).map((item) => String(item || '').trim()).filter(Boolean))];
      if (normalizedIds.length === 0) return { success: true, deleted_count: 0 };

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('Sessao invalida. Faca login novamente.');

      const data = await invokeEdgeFunction('excluir-usuarios-biblioteca', {
        body: { ids: normalizedIds },
        headers: { 'x-user-access-token': accessToken },
        requireAuth: false,
        signOutOnAuthFailure: false,
        fallbackErrorMessage: 'Nao foi possivel excluir os usuarios.',
      });
      if (!data?.success) throw new Error(data?.error || 'Nao foi possivel excluir os usuarios.');
      return data;
    },
  );
}

export async function importUsuariosBatch({ usuarios, tipoUsuarioImport, currentEscolaId, userId }) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/usuarios/import', {
      method: 'POST',
      body: { usuarios, tipoUsuarioImport, currentEscolaId, userId },
    }),
    async () => {
      let escolaId = currentEscolaId;
      if (tipoUsuarioImport !== 'aluno' && !escolaId) {
        const { data: escola, error: escolaError } = await supabase.from('escolas').select('id').eq('gestor_id', userId).maybeSingle();
        if (escolaError) throw escolaError;
        escolaId = escola?.id || null;
      }

      const updated = [...usuarios];
      for (let i = 0; i < updated.length; i += 1) {
        const u = updated[i];
        try {
          let error = null;

          if (tipoUsuarioImport === 'aluno') {
            const result = await provisionarAlunoComMatricula({
              nome: u.nome,
              matricula: u.matricula,
              turma: u.turma,
            });
            if (!result?.success) error = { message: result?.error || 'Nao foi possivel provisionar o aluno.' };
          } else {
            const email = u.email || `${u.matricula}@temp.bibliotecai.com`;
            const response = await supabase.from('usuarios_biblioteca').insert({
              nome: u.nome,
              matricula: u.matricula,
              email,
              turma: u.turma,
              tipo: tipoUsuarioImport,
              escola_id: escolaId,
            });
            error = response.error;
          }

          if (error) {
            updated[i] = { ...u, status: 'erro', mensagem: error.code === '23505' ? 'Ja existe' : error.message };
          } else {
            updated[i] = { ...u, status: 'sucesso' };
          }
        } catch (error) {
          updated[i] = { ...u, status: 'erro', mensagem: error.message };
        }
      }

      return { usuarios: updated };
    },
  );
}

export async function resetAlunoPassword(alunoId, novaSenha) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/usuarios/reset-aluno-password', {
      method: 'POST',
      body: { aluno_id: alunoId, nova_senha: novaSenha },
    }),
    async () => {
      const { data: sessionData, error: refreshError } = await supabase.auth.refreshSession();
      if (refreshError) throw new Error(refreshError.message || 'Nao foi possivel renovar a sessao.');
      const accessToken = sessionData?.session?.access_token || '';
      if (!accessToken) throw new Error('Sessao invalida. Faca login novamente.');

      const data = await invokeEdgeFunction('redefinir-senha-aluno', {
        body: { aluno_id: alunoId, nova_senha: novaSenha },
        requireAuth: false,
        signOutOnAuthFailure: false,
        transport: 'http',
        headers: { 'x-supabase-auth': accessToken },
        fallbackErrorMessage: 'Nao foi possivel redefinir a senha.',
      });
      if (!data?.success) throw new Error(data?.error || 'Nao foi possivel redefinir a senha.');
      return data;
    },
  );
}
