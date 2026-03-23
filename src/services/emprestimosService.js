import { supabase } from '@/integrations/supabase/client';
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

export async function fetchEmprestimosData({ userId, canManageLoans }) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/emprestimos'),
    async () => {
      const { data: escolaId, error: escolaError } = await supabase.rpc('get_user_escola_id', { _user_id: userId });
      if (escolaError) throw escolaError;

      const [emprestimosRes, livrosRes, usuariosRes, solicitacoesRes] = await Promise.all([
        supabase
          .from('emprestimos')
          .select('*, livros(titulo, autor, escola_id), usuarios_biblioteca(nome, email, escola_id)')
          .order('data_emprestimo', { ascending: false }),
        supabase.from('livros').select('id, titulo, autor, disponivel, escola_id').order('titulo'),
        supabase.from('usuarios_biblioteca').select('id, nome, email, escola_id').order('nome'),
        canManageLoans
          ? supabase
              .from('solicitacoes_emprestimo')
              .select('*, livros(id, titulo, autor, disponivel, escola_id), usuarios_biblioteca(nome, email, escola_id)')
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      const maybeError = [emprestimosRes.error, livrosRes.error, usuariosRes.error, solicitacoesRes.error].find(Boolean);
      if (maybeError) throw maybeError;

      const isSameSchool = (candidateEscolaId) => !escolaId || candidateEscolaId === escolaId;

      const emprestimos = (emprestimosRes.data || []).filter(
        (item) => isSameSchool(item?.usuarios_biblioteca?.escola_id) || isSameSchool(item?.livros?.escola_id),
      );
      const livrosCatalogo = (livrosRes.data || []).filter((item) => isSameSchool(item?.escola_id));
      const usuarios = (usuariosRes.data || []).filter((item) => isSameSchool(item?.escola_id));
      const solicitacoes = (solicitacoesRes.data || []).filter(
        (item) => isSameSchool(item?.usuarios_biblioteca?.escola_id) || isSameSchool(item?.livros?.escola_id),
      );

      return {
        escolaId: escolaId || null,
        emprestimos,
        solicitacoes,
        livrosCatalogo,
        livrosDisponiveis: livrosCatalogo.filter((item) => item?.disponivel),
        usuarios,
      };
    },
  );
}

export async function createEmprestimo(payload) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/emprestimos', { method: 'POST', body: payload }),
    async () => {
      const insertData = {
        livro_id: payload?.livro_id,
        usuario_id: payload?.usuario_id,
      };

      if (payload?.data_devolucao_prevista) {
        insertData.data_devolucao_prevista = payload.data_devolucao_prevista;
      }

      const { error: empError } = await supabase.from('emprestimos').insert(insertData);
      if (empError) throw empError;

      const { error: livroError } = await supabase.from('livros').update({ disponivel: false }).eq('id', payload?.livro_id);
      if (livroError) throw livroError;

      return { success: true };
    },
  );
}

export async function registerEmprestimoDevolucao(emprestimoId) {
  return requestWithFallback(
    async () => requestPlatformApi(`/v1/emprestimos/${emprestimoId}/devolucao`, { method: 'POST' }),
    async () => {
      const { data: emprestimo, error: emprestimoLookupError } = await supabase
        .from('emprestimos')
        .select('id, livro_id')
        .eq('id', emprestimoId)
        .maybeSingle();

      if (emprestimoLookupError) throw emprestimoLookupError;
      if (!emprestimo?.livro_id) throw new Error('Emprestimo nao encontrado.');

      const { error: empError } = await supabase
        .from('emprestimos')
        .update({ data_devolucao_real: new Date().toISOString(), status: 'devolvido' })
        .eq('id', emprestimoId);
      if (empError) throw empError;

      const { error: livroError } = await supabase.from('livros').update({ disponivel: true }).eq('id', emprestimo.livro_id);
      if (livroError) throw livroError;

      return { success: true };
    },
  );
}

export async function approveSolicitacaoEmprestimo(solicitacaoId, resposta) {
  return requestWithFallback(
    async () => requestPlatformApi(`/v1/solicitacoes-emprestimo/${solicitacaoId}/aprovar`, {
      method: 'POST',
      body: { resposta },
    }),
    async () => {
      const { data: solicitacao, error: solicitacaoLookupError } = await supabase
        .from('solicitacoes_emprestimo')
        .select('id, livro_id, usuario_id, status, livros(disponivel)')
        .eq('id', solicitacaoId)
        .maybeSingle();

      if (solicitacaoLookupError) throw solicitacaoLookupError;
      if (!solicitacao?.id) throw new Error('Solicitacao nao encontrada.');
      if (solicitacao.status !== 'pendente') throw new Error('A solicitacao ja foi processada.');
      if (!solicitacao?.livros?.disponivel) throw new Error('Este livro nao esta disponivel para emprestimo no momento.');

      let emprestimoCriadoId = null;
      try {
        const { data: novoEmprestimo, error: empError } = await supabase
          .from('emprestimos')
          .insert({ livro_id: solicitacao.livro_id, usuario_id: solicitacao.usuario_id })
          .select('id')
          .single();

        if (empError) throw empError;
        emprestimoCriadoId = novoEmprestimo?.id || null;

        const { error: livroError } = await supabase.from('livros').update({ disponivel: false }).eq('id', solicitacao.livro_id);
        if (livroError) throw livroError;

        const { error: solicitacaoError } = await supabase
          .from('solicitacoes_emprestimo')
          .update({ status: 'aprovada', resposta: resposta || 'Solicitacao aprovada pela biblioteca.' })
          .eq('id', solicitacao.id);
        if (solicitacaoError) throw solicitacaoError;

        return { success: true };
      } catch (error) {
        if (emprestimoCriadoId) {
          await supabase.from('emprestimos').delete().eq('id', emprestimoCriadoId);
        }
        throw error;
      }
    },
  );
}

export async function rejectSolicitacaoEmprestimo(solicitacaoId, resposta) {
  return requestWithFallback(
    async () => requestPlatformApi(`/v1/solicitacoes-emprestimo/${solicitacaoId}/recusar`, {
      method: 'POST',
      body: { resposta },
    }),
    async () => {
      const { error } = await supabase
        .from('solicitacoes_emprestimo')
        .update({ status: 'recusada', resposta: resposta || 'Solicitacao recusada pela biblioteca.' })
        .eq('id', solicitacaoId);

      if (error) throw error;
      return { success: true };
    },
  );
}

export async function createHistoricEmprestimo(payload) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/emprestimos/historico', { method: 'POST', body: payload }),
    async () => {
      const { error: insertError } = await supabase.from('emprestimos').insert(payload);
      if (insertError) throw insertError;

      if (payload?.status === 'ativo') {
        const { error: livroError } = await supabase
          .from('livros')
          .update({ disponivel: false })
          .eq('id', payload?.livro_id);
        if (livroError) throw livroError;
      }

      return { success: true };
    },
  );
}

export async function deleteHistoricEmprestimo(emprestimoId) {
  return requestWithFallback(
    async () => requestPlatformApi(`/v1/emprestimos/${emprestimoId}/delete`, { method: 'POST' }),
    async () => {
      const { error } = await supabase.from('emprestimos').delete().eq('id', emprestimoId);
      if (error) throw error;
      return { success: true };
    },
  );
}
