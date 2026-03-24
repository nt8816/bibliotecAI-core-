import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchComunidadeAlunoData() {
  const payload = await requestPlatformApi('/v1/aluno/comunidade');
  return {
    perfil: payload?.perfil || null,
    livros: Array.isArray(payload?.livros) ? payload.livros : [],
    likes: Array.isArray(payload?.likes) ? payload.likes : [],
    audiobooks: Array.isArray(payload?.audiobooks) ? payload.audiobooks : [],
    posts: Array.isArray(payload?.posts) ? payload.posts : [],
    professorTurmas: Array.isArray(payload?.professorTurmas) ? payload.professorTurmas : [],
    turmasPublicacao: Array.isArray(payload?.turmasPublicacao) ? payload.turmasPublicacao : [],
  };
}

export async function fetchComunidadeAlunoPostsPage({ offset = 0, limit = 20 } = {}) {
  const safeOffset = Number(offset) || 0;
  const safeLimit = Number(limit) || 20;
  const payload = await requestPlatformApi(`/v1/aluno/comunidade/feed?offset=${safeOffset}&limit=${safeLimit}`);
  return {
    success: true,
    posts: Array.isArray(payload?.posts) ? payload.posts : [],
  };
}

export async function createComunidadePost(payload) {
  return requestPlatformApi('/v1/aluno/comunidade/posts', { method: 'POST', body: payload });
}

export async function fetchComunidadePostById(postId) {
  const payload = await requestPlatformApi(`/v1/aluno/comunidade/posts/${postId}`);
  return {
    success: true,
    post: payload?.post || null,
  };
}

export async function toggleComunidadeLike({ postId, usuarioId, liked }) {
  return requestPlatformApi(`/v1/aluno/comunidade/posts/${postId}/like`, {
    method: 'POST',
    body: { usuarioId, liked },
  });
}

export async function updateComunidadePost(postId, payload) {
  return requestPlatformApi(`/v1/aluno/comunidade/posts/${postId}`, { method: 'PATCH', body: payload });
}

export async function deleteComunidadePost(postId, autorId) {
  return requestPlatformApi(`/v1/aluno/comunidade/posts/${postId}/delete`, {
    method: 'POST',
    body: { autorId },
  });
}

export async function submitComunidadeQuizTentativa(payload) {
  return requestPlatformApi('/v1/aluno/comunidade/quiz-tentativas', { method: 'POST', body: payload });
}
