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

export async function fetchPainelAlunoData() {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/aluno/painel'),
    async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user?.id) throw new Error('Usuario nao autenticado.');

      await supabase.rpc('cleanup_expired_comunicados');

      const { data: perfil, error: perfilError } = await supabase
        .from('usuarios_biblioteca')
        .select('id, escola_id, turma')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (perfilError || !perfil) throw perfilError || new Error('Perfil do aluno nao encontrado.');

      const comunicadosPromise = perfil.escola_id
        ? supabase
            .from('comunidade_posts')
            .select('id, titulo, conteudo, turma_publico, created_at, tipo, expires_at')
            .eq('escola_id', perfil.escola_id)
            .eq('tipo', 'comunicado')
            .order('created_at', { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [], error: null });

      const [
        emprestimosRes,
        avaliacoesRes,
        wishlistRes,
        sugestoesRes,
        solicitacoesRes,
        atividadesRes,
        comunicadosRes,
        entregasRes,
        audioCatalogoRes,
        meusAudiobooksRes,
        criacoesRes,
        notificacoesLidasRes,
        preferenciasRes,
      ] = await Promise.all([
        supabase.from('emprestimos').select('*, livros(titulo, autor)').eq('usuario_id', perfil.id).order('data_emprestimo', { ascending: false }),
        supabase.from('avaliacoes_livros').select('*, livros(titulo, autor)').eq('usuario_id', perfil.id).order('created_at', { ascending: false }),
        supabase.from('lista_desejos').select('livro_id').eq('usuario_id', perfil.id),
        supabase.from('sugestoes_livros').select('*, livros(titulo, autor)').eq('aluno_id', perfil.id).order('created_at', { ascending: false }),
        supabase.from('solicitacoes_emprestimo').select('*, livros(titulo, autor)').eq('usuario_id', perfil.id).order('created_at', { ascending: false }),
        supabase.from('atividades_leitura').select('*, livros(titulo, autor), professor:usuarios_biblioteca!atividades_leitura_professor_id_fkey(nome)').eq('aluno_id', perfil.id).order('created_at', { ascending: false }),
        comunicadosPromise,
        supabase.from('atividades_entregas').select('*').eq('aluno_id', perfil.id).order('updated_at', { ascending: false }),
        supabase.from('audiobooks_biblioteca').select('*, livros(titulo, autor)').order('created_at', { ascending: false }),
        supabase.from('aluno_audiobooks').select('*, audiobooks_biblioteca(*, livros(titulo, autor))').eq('aluno_id', perfil.id).order('created_at', { ascending: false }),
        supabase.from('laboratorio_criacoes').select('*').eq('aluno_id', perfil.id).order('created_at', { ascending: false }),
        supabase.from('notificacoes_lidas').select('notification_id').eq('usuario_id', perfil.id),
        supabase.from('preferencias_aluno').select('desafio_ia_ativo, desafio_ia_concluido_em, desafio_ia_gerado_em, desafio_ia_xp_bonus').eq('usuario_id', perfil.id).maybeSingle(),
      ]);

      const maybeError = [
        emprestimosRes.error,
        avaliacoesRes.error,
        wishlistRes.error,
        sugestoesRes.error,
        solicitacoesRes.error,
        atividadesRes.error,
        comunicadosRes.error,
      ].find(Boolean);
      if (maybeError) throw maybeError;

      return {
        success: true,
        perfil,
        emprestimos: emprestimosRes.data || [],
        avaliacoes: avaliacoesRes.data || [],
        wishlist: wishlistRes.data || [],
        sugestoes: sugestoesRes.data || [],
        solicitacoes: solicitacoesRes.data || [],
        atividades: atividadesRes.data || [],
        comunicados: comunicadosRes.data || [],
        entregas: entregasRes.error ? [] : (entregasRes.data || []),
        audiobookCatalogo: audioCatalogoRes.error ? [] : (audioCatalogoRes.data || []),
        meusAudiobooks: meusAudiobooksRes.error ? [] : (meusAudiobooksRes.data || []),
        criacoesLaboratorio: criacoesRes.error ? [] : (criacoesRes.data || []),
        notificacoesLidas: notificacoesLidasRes.error ? [] : (notificacoesLidasRes.data || []),
        preferenciasAluno: preferenciasRes.error ? null : (preferenciasRes.data || null),
      };
    },
  );
}

export async function fetchPainelAlunoBooks({ escolaId, searchTerm }) {
  return requestWithFallback(
    async () => {
      const payload = await requestPlatformApi('/v1/livros');
      const normalizedTerm = String(searchTerm || '').trim().toLowerCase();
      let items = Array.isArray(payload?.livros) ? payload.livros : [];

      if (escolaId) {
        items = items.filter((item) => !item?.escola_id || String(item.escola_id) === String(escolaId));
      }

      if (normalizedTerm) {
        items = items.filter((item) =>
          [item?.titulo, item?.autor, item?.area].some((value) =>
            String(value || '').toLowerCase().includes(normalizedTerm),
          ),
        );
      }

      return {
        success: true,
        livros: items,
      };
    },
    async () => {
      let query = supabase
        .from('livros')
        .select('id, titulo, autor, area, vol, ano, disponivel, sinopse, created_at, escola_id')
        .order('titulo');

      if (escolaId) {
        query = query.eq('escola_id', escolaId);
      }

      const term = String(searchTerm || '').trim();
      if (term) {
        const escaped = term.replace(/%/g, '\\%').replace(/_/g, '\\_');
        query = query.or(`titulo.ilike.%${escaped}%,autor.ilike.%${escaped}%,area.ilike.%${escaped}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      let items = data || [];

      if (escolaId) {
        let legacyQuery = supabase
          .from('livros')
          .select('id, titulo, autor, area, vol, ano, disponivel, sinopse, created_at, escola_id')
          .is('escola_id', null)
          .order('titulo');

        if (term) {
          const escaped = term.replace(/%/g, '\\%').replace(/_/g, '\\_');
          legacyQuery = legacyQuery.or(`titulo.ilike.%${escaped}%,autor.ilike.%${escaped}%,area.ilike.%${escaped}%`);
        }

        const { data: legacyData, error: legacyError } = await legacyQuery;
        if (legacyError) throw legacyError;

        const byId = new Map();
        [...items, ...(legacyData || [])].forEach((item) => {
          if (item?.id) byId.set(item.id, item);
        });
        items = Array.from(byId.values());
      }

      return {
        success: true,
        livros: items,
      };
    },
  );
}

export async function updatePainelAlunoPassword({ password, metadata }) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/auth/password', {
      method: 'POST',
      body: {
        password,
        metadata,
      },
    }),
    async () => {
      const { error } = await supabase.auth.updateUser({
        password,
        data: metadata,
      });
      if (error) throw error;
      return { success: true };
    },
  );
}

export async function togglePainelAlunoWishlist({ livroId, alunoId, enabled }) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/aluno/wishlist/toggle', {
      method: 'POST',
      body: { livroId, enabled },
    }),
    async () => {
      if (enabled) {
        const { error } = await supabase.from('lista_desejos').insert({ livro_id: livroId, usuario_id: alunoId });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('lista_desejos').delete().eq('livro_id', livroId).eq('usuario_id', alunoId);
        if (error) throw error;
      }
      return { success: true };
    },
  );
}

export async function createPainelAlunoLoanRequest({ livroId, mensagem }) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/aluno/solicitacoes-emprestimo', {
      method: 'POST',
      body: { livroId, mensagem },
    }),
    async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user?.id) throw new Error('Usuario nao autenticado.');

      const { data: perfil, error: perfilError } = await supabase
        .from('usuarios_biblioteca')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (perfilError || !perfil?.id) throw perfilError || new Error('Perfil do aluno nao encontrado.');

      const { error } = await supabase.from('solicitacoes_emprestimo').insert({
        livro_id: livroId,
        usuario_id: perfil.id,
        mensagem: mensagem || null,
      });
      if (error) throw error;
      return { success: true };
    },
  );
}

export async function markPainelAlunoNotificationRead(notificationId) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/notifications/read', {
      method: 'POST',
      body: { notification_id: notificationId },
    }),
    async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user?.id) throw new Error('Usuario nao autenticado.');

      const { data: perfil, error: perfilError } = await supabase
        .from('usuarios_biblioteca')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (perfilError || !perfil?.id) throw perfilError || new Error('Perfil do aluno nao encontrado.');

      const { error } = await supabase
        .from('notificacoes_lidas')
        .upsert({ usuario_id: perfil.id, notification_id: notificationId }, { onConflict: 'usuario_id,notification_id' });
      if (error) throw error;
      return { success: true };
    },
  );
}

export async function markPainelAlunoNotificationsReadBatch(notificationIds) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/aluno/notificacoes/read-batch', {
      method: 'POST',
      body: { notification_ids: notificationIds },
    }),
    async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user?.id) throw new Error('Usuario nao autenticado.');

      const { data: perfil, error: perfilError } = await supabase
        .from('usuarios_biblioteca')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (perfilError || !perfil?.id) throw perfilError || new Error('Perfil do aluno nao encontrado.');

      const payload = (Array.isArray(notificationIds) ? notificationIds : [])
        .filter(Boolean)
        .map((notificationId) => ({ usuario_id: perfil.id, notification_id: notificationId }));

      if (payload.length === 0) return { success: true };

      const { error } = await supabase
        .from('notificacoes_lidas')
        .upsert(payload, { onConflict: 'usuario_id,notification_id' });
      if (error) throw error;
      return { success: true };
    },
  );
}

export async function savePainelAlunoChallenge({ desafio, xpBonus }) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/aluno/preferencias/desafio', {
      method: 'POST',
      body: { desafio, xpBonus },
    }),
    async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user?.id) throw new Error('Usuario nao autenticado.');

      const { data: perfil, error: perfilError } = await supabase
        .from('usuarios_biblioteca')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (perfilError || !perfil?.id) throw perfilError || new Error('Perfil do aluno nao encontrado.');

      const { error } = await supabase.from('preferencias_aluno').upsert(
        {
          usuario_id: perfil.id,
          desafio_ia_ativo: desafio,
          desafio_ia_gerado_em: desafio?.gerado_em || null,
          desafio_ia_concluido_em: desafio?.concluido_em || null,
          desafio_ia_xp_bonus: Math.max(0, Number(xpBonus || 0)),
        },
        { onConflict: 'usuario_id' },
      );
      if (error) throw error;
      return { success: true };
    },
  );
}

export async function savePainelAlunoReview({ livroId, nota, resenha }) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/aluno/avaliacoes', {
      method: 'POST',
      body: { livroId, nota, resenha },
    }),
    async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user?.id) throw new Error('Usuario nao autenticado.');
      const { data: perfil, error: perfilError } = await supabase
        .from('usuarios_biblioteca')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (perfilError || !perfil?.id) throw perfilError || new Error('Perfil do aluno nao encontrado.');
      const { error } = await supabase
        .from('avaliacoes_livros')
        .upsert({ livro_id: livroId, usuario_id: perfil.id, nota, resenha: resenha || null }, { onConflict: 'livro_id,usuario_id' });
      if (error) throw error;
      return { success: true };
    },
  );
}

export async function submitPainelAlunoActivity({ atividadeId, textoEntrega, status, enviadoEm }) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/aluno/atividades/entregas', {
      method: 'POST',
      body: { atividadeId, textoEntrega, status, enviadoEm },
    }),
    async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user?.id) throw new Error('Usuario nao autenticado.');
      const { data: perfil, error: perfilError } = await supabase
        .from('usuarios_biblioteca')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (perfilError || !perfil?.id) throw perfilError || new Error('Perfil do aluno nao encontrado.');
      const { error } = await supabase.from('atividades_entregas').upsert({
        atividade_id: atividadeId,
        aluno_id: perfil.id,
        texto_entrega: textoEntrega,
        status,
        enviado_em: enviadoEm,
      }, { onConflict: 'atividade_id,aluno_id' });
      if (error) throw error;
      return { success: true };
    },
  );
}

export async function createPainelAlunoAudiobook(payload) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/aluno/audiobooks', {
      method: 'POST',
      body: payload,
    }),
    async () => {
      const { error } = await supabase.from('audiobooks_biblioteca').insert(payload);
      if (error) throw error;
      return { success: true };
    },
  );
}

export async function togglePainelAlunoAudiobook({ audiobookId, enabled }) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/aluno/meus-audiobooks/toggle', {
      method: 'POST',
      body: { audiobookId, enabled },
    }),
    async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user?.id) throw new Error('Usuario nao autenticado.');
      const { data: perfil, error: perfilError } = await supabase
        .from('usuarios_biblioteca')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (perfilError || !perfil?.id) throw perfilError || new Error('Perfil do aluno nao encontrado.');
      if (enabled) {
        const { error } = await supabase.from('aluno_audiobooks').insert({ aluno_id: perfil.id, audiobook_id: audiobookId, progresso_segundos: 0 });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('aluno_audiobooks').delete().eq('aluno_id', perfil.id).eq('audiobook_id', audiobookId);
        if (error) throw error;
      }
      return { success: true };
    },
  );
}

export async function createPainelAlunoLabCreation(payload) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/aluno/laboratorio/criacoes', {
      method: 'POST',
      body: payload,
    }),
    async () => {
      const { error } = await supabase.from('laboratorio_criacoes').insert(payload);
      if (error) throw error;
      return { success: true };
    },
  );
}

export async function updatePainelAlunoLabCreation(id, payload) {
  return requestWithFallback(
    async () => requestPlatformApi(`/v1/aluno/laboratorio/criacoes/${id}`, {
      method: 'PATCH',
      body: payload,
    }),
    async () => {
      const { error } = await supabase.from('laboratorio_criacoes').update(payload).eq('id', id);
      if (error) throw error;
      return { success: true };
    },
  );
}

export async function deletePainelAlunoLabCreation({ id, comunidadePostId }) {
  return requestWithFallback(
    async () => requestPlatformApi(`/v1/aluno/laboratorio/criacoes/${id}/delete`, {
      method: 'POST',
      body: { comunidadePostId },
    }),
    async () => {
      if (comunidadePostId) {
        const { error: communityError } = await supabase.from('comunidade_posts').delete().eq('id', comunidadePostId);
        if (communityError) throw communityError;
      }
      const { error } = await supabase.from('laboratorio_criacoes').delete().eq('id', id);
      if (error) throw error;
      return { success: true };
    },
  );
}
