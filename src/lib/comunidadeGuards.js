const ALLOWED_COMMUNITY_POST_TIPOS = new Set([
  'resenha',
  'sugestao',
  'dica',
  'quiz',
  'comunicado',
]);

const COMMUNITY_POST_INSERT_FIELDS = [
  'tipo',
  'titulo',
  'conteudo',
  'livro_id',
  'audiobook_id',
  'tags',
  'imagem_urls',
  'arquivos',
  'audio_url',
  'audio_duration_seconds',
  'expires_at',
  'turma_publico',
];

export function normalizeCommunityPostTipo(value) {
  return String(value || '').trim().toLowerCase();
}

export function isAllowedCommunityPostTipo(value) {
  return ALLOWED_COMMUNITY_POST_TIPOS.has(normalizeCommunityPostTipo(value));
}

export function pickCommunityPostInsertFields(body) {
  const source = body && typeof body === 'object' ? body : {};
  const payload = {};
  for (const field of COMMUNITY_POST_INSERT_FIELDS) {
    if (source[field] !== undefined) {
      payload[field] = source[field];
    }
  }
  return payload;
}

export function isExpiredComunicado(item) {
  if (!item?.expires_at) return false;
  const expiresAt = new Date(String(item.expires_at));
  return !Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date();
}

export function normalizeTurmaKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function canShowCommunityPost({
  post,
  escolaId,
  turma,
  allowCrossEscola = false,
  role = 'aluno',
} = {}) {
  if (!post) return false;
  if (isExpiredComunicado(post)) return false;

  const postEscola = String(post.escola_id || '').trim();
  const currentEscola = String(escolaId || '').trim();
  const isManagerRole = ['gestor', 'bibliotecaria', 'super_admin', 'professor'].includes(role);

  if (!allowCrossEscola && currentEscola && postEscola && postEscola !== currentEscola && !isManagerRole) {
    return false;
  }

  const turmaPost = normalizeTurmaKey(post.turma_publico);
  const turmaAtual = normalizeTurmaKey(turma);
  if (!turmaPost) return true;
  if (isManagerRole && role !== 'professor') return true;
  return turmaPost === turmaAtual;
}

export function resolvePostsSafely(items, resolveFn) {
  return Promise.all(
    (Array.isArray(items) ? items : []).map(async (item) => {
      try {
        return await resolveFn(item);
      } catch {
        return item || null;
      }
    }),
  ).then((rows) => rows.filter(Boolean));
}
