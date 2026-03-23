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
