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

export async function fetchComunidadeAlunoData() {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/aluno/comunidade'),
    async () => {
      await supabase.rpc('cleanup_expired_comunicados');

      const { data: userData } = await supabase.auth.getUser();
      const user = userData?.user;
      if (!user?.id) throw new Error('Usuario nao autenticado.');

      const { data: perfil, error: perfilError } = await supabase
        .from('usuarios_biblioteca')
        .select('id, escola_id, turma, tipo')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (perfilError || !perfil) throw perfilError || new Error('Perfil do aluno nao encontrado.');

      const [
        livrosRes,
        likesRes,
        audioRes,
        postsRes,
        professorTurmasRes,
        salasRes,
        usuariosSalaRes,
        professorTurmasEscolaRes,
      ] = await Promise.all([
        supabase.from('livros').select('id, titulo').order('titulo'),
        supabase.from('comunidade_curtidas').select('post_id, usuario_id'),
        supabase.from('audiobooks_biblioteca').select('id, titulo, autor').order('titulo'),
        supabase
          .from('comunidade_posts')
          .select('*, livros(titulo, autor), audiobooks_biblioteca(titulo, autor, audio_url), usuarios_biblioteca!comunidade_posts_autor_id_fkey(nome)')
          .order('created_at', { ascending: false })
          .range(0, 19),
        supabase.from('professor_turmas').select('turma').eq('professor_id', perfil.id),
        supabase.from('salas_cursos').select('nome').eq('escola_id', perfil.escola_id).order('nome'),
        supabase.from('usuarios_biblioteca').select('turma').eq('escola_id', perfil.escola_id),
        supabase.from('professor_turmas').select('turma').eq('escola_id', perfil.escola_id),
      ]);

      if (livrosRes.error) throw livrosRes.error;
      if (likesRes.error) throw likesRes.error;
      if (audioRes.error && audioRes.error.code !== '42P01' && audioRes.error.code !== 'PGRST205') throw audioRes.error;
      if (postsRes.error) throw postsRes.error;

      const oficiais = (salasRes.data || []).map((item) => String(item?.nome || '').trim()).filter(Boolean);
      const professorTurmas = [...new Set((professorTurmasRes.data || []).map((item) => String(item?.turma || '').trim()).filter(Boolean))].sort();
      const extras = new Map();
      [...(usuariosSalaRes.data || []), ...(professorTurmasEscolaRes.data || [])].forEach((item) => {
        const nome = String(item?.turma || '').trim();
        if (!nome) return;
        const key = nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
        const oficiaisKeys = new Set(oficiais.map((v) => v.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()));
        if (oficiaisKeys.has(key) || extras.has(key)) return;
        extras.set(key, nome);
      });

      return {
        perfil,
        livros: livrosRes.data || [],
        likes: likesRes.data || [],
        audiobooks: audioRes.error ? [] : (audioRes.data || []),
        posts: postsRes.data || [],
        professorTurmas,
        turmasPublicacao: [...oficiais, ...Array.from(extras.values())].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      };
    },
  );
}

export async function fetchComunidadeAlunoPostsPage({ offset = 0, limit = 20 } = {}) {
  return requestWithFallback(
    async () => requestPlatformApi(`/v1/aluno/comunidade/feed?offset=${Number(offset) || 0}&limit=${Number(limit) || 20}`),
    async () => {
      const start = Number(offset) || 0;
      const pageSize = Number(limit) || 20;
      const { data, error } = await supabase
        .from('comunidade_posts')
        .select('*, livros(titulo, autor), audiobooks_biblioteca(titulo, autor, audio_url), usuarios_biblioteca!comunidade_posts_autor_id_fkey(nome)')
        .order('created_at', { ascending: false })
        .range(start, start + pageSize - 1);
      if (error) throw error;
      return { success: true, posts: data || [] };
    },
  );
}

export async function createComunidadePost(payload) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/aluno/comunidade/posts', { method: 'POST', body: payload }),
    async () => {
      const { data, error } = await supabase.from('comunidade_posts').insert(payload).select('id').single();
      if (error) throw error;
      return { success: true, postId: data?.id || null };
    },
  );
}

export async function fetchComunidadePostById(postId) {
  return requestWithFallback(
    async () => requestPlatformApi(`/v1/aluno/comunidade/posts/${postId}`),
    async () => {
      const { data, error } = await supabase
        .from('comunidade_posts')
        .select('*, livros(titulo, autor), audiobooks_biblioteca(titulo, autor, audio_url), usuarios_biblioteca!comunidade_posts_autor_id_fkey(nome)')
        .eq('id', postId)
        .single();
      if (error) throw error;
      return { success: true, post: data };
    },
  );
}

export async function toggleComunidadeLike({ postId, usuarioId, liked }) {
  return requestWithFallback(
    async () => requestPlatformApi(`/v1/aluno/comunidade/posts/${postId}/like`, {
      method: 'POST',
      body: { usuarioId, liked },
    }),
    async () => {
      if (liked) {
        const { error } = await supabase.from('comunidade_curtidas').delete().eq('post_id', postId).eq('usuario_id', usuarioId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('comunidade_curtidas').insert({ post_id: postId, usuario_id: usuarioId });
        if (error) throw error;
      }
      return { success: true };
    },
  );
}

export async function updateComunidadePost(postId, payload) {
  return requestWithFallback(
    async () => requestPlatformApi(`/v1/aluno/comunidade/posts/${postId}`, { method: 'PATCH', body: payload }),
    async () => {
      const { error } = await supabase.from('comunidade_posts').update(payload).eq('id', postId);
      if (error) throw error;
      return { success: true };
    },
  );
}

export async function deleteComunidadePost(postId, autorId) {
  return requestWithFallback(
    async () => requestPlatformApi(`/v1/aluno/comunidade/posts/${postId}/delete`, { method: 'POST', body: { autorId } }),
    async () => {
      const { data, error } = await supabase.from('comunidade_posts').delete().eq('id', postId).eq('autor_id', autorId).select('id').maybeSingle();
      if (error) throw error;
      return { success: true, deleted: !!data?.id };
    },
  );
}

export async function submitComunidadeQuizTentativa(payload) {
  return requestWithFallback(
    async () => requestPlatformApi('/v1/aluno/comunidade/quiz-tentativas', { method: 'POST', body: payload }),
    async () => {
      const { error } = await supabase.from('comunidade_quiz_tentativas').insert(payload);
      if (error) throw error;
      return { success: true };
    },
  );
}
