import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AudioLines, Filter, Heart, ImagePlus, MessageSquare, Pencil, Plus, Send, Sparkles, Trash2, X } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  createComunidadePost,
  deleteComunidadePost,
  fetchComunidadeAlunoData,
  fetchComunidadeAlunoPostsPage,
  fetchComunidadePostById as fetchComunidadePostByIdService,
  fetchComunidadeQuizRanking,
  submitComunidadeQuizTentativa,
  toggleComunidadeLike,
  updateComunidadePost,
} from '@/services/comunidadeAlunoService';
import { uploadDataUrlToR2 } from '@/lib/r2Storage';
import { resolveR2MediaUrl, resolveR2MediaUrls } from '@/lib/resolveR2Media';

const ENABLE_OPTIONAL_STUDENT_FEATURES = import.meta.env.VITE_ENABLE_OPTIONAL_STUDENT_FEATURES !== 'false';
const POSTS_PAGE_SIZE = 20;
const CACHE_TTL_MS = 5 * 60 * 1000;
const POSTS_CACHE_KEY = 'aluno:comunidade_posts:page0';
const ALL_TURMAS_OPTION = '__all_turmas__';
const COMUNICADO_AUTO_TAG = 'comunicado';

function formatDateBR(dateValue) {
  if (!dateValue) return '-';
  try {
    return format(new Date(dateValue), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return '-';
  }
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function normalizeTurmaKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function toEndOfDayIso(dateValue) {
  if (!dateValue) return null;
  const localDate = new Date(`${dateValue}T23:59:59.999`);
  return Number.isNaN(localDate.getTime()) ? null : localDate.toISOString();
}

function getTodayInputValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isExpiredComunicado(post) {
  if (post?.tipo !== 'comunicado' || !post?.expires_at) return false;
  const expiresAt = new Date(post.expires_at);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date();
}

function mergeById(list, incoming, idKey = 'id') {
  const map = new Map(ensureArray(list).map((item) => [item?.[idKey], item]));
  ensureArray(incoming).forEach((item) => {
    if (item?.[idKey]) map.set(item[idKey], item);
  });
  return Array.from(map.values());
}

function readCache(key, ttlMs = CACHE_TTL_MS) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > ttlMs) return null;
    return parsed?.data ?? null;
  } catch {
    return null;
  }
}

function writeCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // ignore cache failures
  }
}

function syncPostsCache(nextPosts) {
  writeCache(POSTS_CACHE_KEY, ensureArray(nextPosts).slice(0, POSTS_PAGE_SIZE));
}

function safeText(value, fallback = '-') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function safeNestedName(value, fallback = 'Usuario') {
  if (!value) return fallback;
  if (Array.isArray(value)) {
    const first = value[0];
    return safeText(first?.nome, fallback);
  }
  return safeText(value?.nome, fallback);
}

function decodeJsonBase64(value) {
  try {
    const decoded = decodeURIComponent(escape(atob(String(value || ''))));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

const QUIZ_MARKER = '[QUIZ_COMUNIDADE_V1]';

function extractQuizFromConteudo(rawConteudo) {
  const source = String(rawConteudo || '');
  const markerIndex = source.indexOf(QUIZ_MARKER);
  if (markerIndex < 0) return null;

  const descricao = source.slice(0, markerIndex).trim();
  const encoded = source.slice(markerIndex + QUIZ_MARKER.length).trim();
  const decoded = decodeJsonBase64(encoded);
  const perguntas = Array.isArray(decoded?.perguntas) ? decoded.perguntas : [];

  const perguntasLimpa = perguntas
    .map((item) => ({
      enunciado: safeText(item?.enunciado, '').trim(),
      opcoes: Array.isArray(item?.opcoes) ? item.opcoes.map((op) => safeText(op, '').trim()).filter(Boolean) : [],
      correta: Number.isInteger(item?.correta) ? item.correta : null,
    }))
    .filter((item) => item.enunciado && item.opcoes.length >= 2 && item.correta !== null && item.correta >= 0);

  if (perguntasLimpa.length === 0) return null;

  return {
    descricao,
    tema: safeText(decoded?.tema, ''),
    perguntas: perguntasLimpa,
  };
}

function isMissingTableError(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return (
    error?.code === '42P01' ||
    error?.code === 'PGRST205' ||
    message.includes('could not find the table') ||
    message.includes('does not exist')
  );
}

function isMissingColumnError(error, columnName, tableName) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  const column = String(columnName || '').toLowerCase();
  const table = String(tableName || '').toLowerCase();
  return (
    message.includes(`could not find the '${column}' column`) &&
    (!table || message.includes(`'${table}'`) || message.includes(`"${table}"`))
  );
}

async function insertCommunityPostCompat(payload) {
  const fetchInsertedPost = async (postId) => {
    if (!postId) return { data: null, error: null };
    try {
      const response = await fetchCommunityPostById(postId);
      return { data: response || null, error: null };
    } catch (error) {
      return { data: null, error };
    }
  };

  const runInsert = async (insertPayload) => {
    try {
      const insertResult = await createComunidadePost(insertPayload);
      const fetched = await fetchInsertedPost(insertResult?.postId);
      return fetched.error
        ? {
            data: {
              ...insertPayload,
              id: insertResult?.postId || null,
              usuarios_biblioteca: { nome: 'Usuario' },
            },
            error: null,
          }
        : fetched;
    } catch (error) {
      return { data: null, error };
    }
  };

  let { data, error } = await runInsert(payload);

  if (error) {
    const missingColumns = ['escola_id', 'imagem_urls', 'audiobook_id', 'turma_publico', 'expires_at'];
    for (const column of missingColumns) {
      if (Object.hasOwn(payload, column) && isMissingColumnError(error, column, 'comunidade_posts')) {
        const { [column]: _ignored, ...fallbackPayload } = payload;
        ({ data, error } = await runInsert(fallbackPayload));
        if (!error) break;
      }
    }
  }

  return { data, error };
}
async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function dataUrlToFile(dataUrl, filename = 'compartilhamento.jpg') {
  const parts = String(dataUrl || '').split(',');
  if (parts.length < 2) throw new Error('Imagem invalida.');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(parts[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}

async function resolvePostMedia(post) {
  const safePost = post || {};
  const imagem_urls = await resolveR2MediaUrls(ensureArray(safePost.imagem_urls), `comunidade-${safePost.id || 'post'}`);
  const audio_url = await resolveR2MediaUrl(
    safePost?.audiobooks_biblioteca?.audio_url,
    `audiobook-${safePost?.audiobooks_biblioteca?.id || safePost.id || 'post'}.mp3`,
  );

  return {
    ...safePost,
    imagem_urls,
    audiobooks_biblioteca: safePost?.audiobooks_biblioteca
      ? { ...safePost.audiobooks_biblioteca, audio_url }
      : safePost?.audiobooks_biblioteca,
  };
}

async function fetchCommunityPostById(postId) {
  if (!postId) return null;
  const response = await fetchComunidadePostByIdService(postId);
  return resolvePostMedia(response?.post);
}

export default function ComunidadeAluno() {
  const { user, isProfessor, isGestor, isBibliotecaria, isSuperAdmin } = useAuth();
  const { toast } = useToast();
  const canPublicarComunicado = isProfessor || isGestor || isBibliotecaria || isSuperAdmin;

  const [alunoId, setAlunoId] = useState(null);
  const [escolaId, setEscolaId] = useState(null);
  const [alunoTurma, setAlunoTurma] = useState(null);
  const [professorTurmas, setProfessorTurmas] = useState([]);
  const [turmasPublicacao, setTurmasPublicacao] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [ariaLiveMessage, setAriaLiveMessage] = useState('');

  const [livros, setLivros] = useState([]);
  const [audiobooks, setAudiobooks] = useState([]);
  const [posts, setPosts] = useState([]);
  const [postsOffset, setPostsOffset] = useState(0);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const [likes, setLikes] = useState([]);
  const [enabled, setEnabled] = useState(ENABLE_OPTIONAL_STUDENT_FEATURES);

  const [postDialogOpen, setPostDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [postSearchTerm, setPostSearchTerm] = useState('');
  const [apenasMinhaEscola, setApenasMinhaEscola] = useState(false);
  const [apenasComImagens, setApenasComImagens] = useState(false);
  const [postPreviewOpen, setPostPreviewOpen] = useState(false);
  const [postPreviewItem, setPostPreviewItem] = useState(null);

  const [postTipo, setPostTipo] = useState('resenha');
  const [postLivroId, setPostLivroId] = useState('');
  const [postLivroNomeManual, setPostLivroNomeManual] = useState('');
  const [postAudiobookId, setPostAudiobookId] = useState('');
  const [postTitulo, setPostTitulo] = useState('');
  const [postConteudo, setPostConteudo] = useState('');
  const [postComIA, setPostComIA] = useState(false);
  const [postTurmaPublico, setPostTurmaPublico] = useState('');
  const [postExpiraEm, setPostExpiraEm] = useState('');
  const [imageDataUrls, setImageDataUrls] = useState([]);
  const [selectedImageUrl, setSelectedImageUrl] = useState('');
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [sharePost, setSharePost] = useState(null);
  const [shareTitulo, setShareTitulo] = useState('');
  const [shareImageDataUrl, setShareImageDataUrl] = useState('');
  const [sharing, setSharing] = useState(false);
  const postImagesInputRef = useRef(null);
  const [quizRespostasPorPost, setQuizRespostasPorPost] = useState({});
  const [quizResultadoPorPost, setQuizResultadoPorPost] = useState({});
  const [quizRankingByPost, setQuizRankingByPost] = useState({});
  const [quizHistoricoByPost, setQuizHistoricoByPost] = useState({});
  const [quizRankingPeriodo, setQuizRankingPeriodo] = useState('geral');
  const [quizRankingEscopo, setQuizRankingEscopo] = useState('escola');
  const [postEmEdicao, setPostEmEdicao] = useState(null);
  const [editTitulo, setEditTitulo] = useState('');
  const [editConteudo, setEditConteudo] = useState('');
  const [likingPostIds, setLikingPostIds] = useState(new Set());
  const [deleteConfirmPost, setDeleteConfirmPost] = useState(null);
  const minComunicadoDate = getTodayInputValue();

  const loadTurmasPublicacao = useCallback(
    async ({ perfilId, escolaIdAtual } = {}) => {
      if (!canPublicarComunicado || !escolaIdAtual) {
        setProfessorTurmas([]);
        setTurmasPublicacao([]);
        return;
      }
      const response = await fetchComunidadeAlunoData();
      const perfil = response?.perfil;

      if (String(perfil?.escola_id || '') !== String(escolaIdAtual || '')) {
        setProfessorTurmas([]);
        setTurmasPublicacao([]);
        return;
      }

      setProfessorTurmas(ensureArray(response?.professorTurmas));
      setTurmasPublicacao(ensureArray(response?.turmasPublicacao));
    },
    [canPublicarComunicado],
  );

  const quizRankingFromDate = useMemo(() => {
    if (quizRankingPeriodo === 'semana') {
      const from = new Date();
      from.setDate(from.getDate() - 7);
      return from.toISOString();
    }
    if (quizRankingPeriodo === 'mes') {
      const from = new Date();
      from.setMonth(from.getMonth() - 1);
      return from.toISOString();
    }
    return null;
  }, [quizRankingPeriodo]);

  const fetchPostsPage = useCallback(
    async ({ reset = false, useCache = true } = {}) => {
      if (!enabled) return;
      const offset = reset ? 0 : postsOffset;
      if (reset && useCache) {
        const cached = readCache(POSTS_CACHE_KEY);
        if (Array.isArray(cached)) {
          const validCached = cached.filter((item) => !isExpiredComunicado(item));
          setPosts(validCached);
          setPostsOffset(validCached.length);
          setPostsHasMore(validCached.length === POSTS_PAGE_SIZE);
          return validCached;
        }
      }
      setPostsLoadingMore(true);
      try {
        const response = await fetchComunidadeAlunoPostsPage({ offset, limit: POSTS_PAGE_SIZE });
        const items = await Promise.all(
          ensureArray(response?.posts)
            .filter((item) => !isExpiredComunicado(item))
            .map(resolvePostMedia),
        );
        setPosts((prev) => (reset ? items : mergeById(prev, items)));
        setPostsOffset(offset + items.length);
        setPostsHasMore(items.length === POSTS_PAGE_SIZE);
        if (reset) syncPostsCache(items);
        return items;
      } finally {
        setPostsLoadingMore(false);
      }
    },
    [enabled, postsOffset],
  );

  const loadQuizRankingForPosts = useCallback(
    async (postIds) => {
      const ids = ensureArray(postIds).filter(Boolean);
      if (ids.length === 0) return;
      try {
        const response = await fetchComunidadeQuizRanking({
          postIds: ids,
          fromDate: quizRankingFromDate,
          scope: quizRankingEscopo,
          turma: alunoTurma,
        });

        setQuizRankingByPost((prev) => ({ ...prev, ...(response?.rankingByPost || {}) }));
        setQuizHistoricoByPost((prev) => ({ ...prev, ...(response?.historicoByPost || {}) }));
      } catch (error) {
        if (error && !isMissingTableError(error)) {
          console.warn('Falha ao carregar ranking do quiz.', error);
        }
      }
    },
    [alunoTurma, quizRankingEscopo, quizRankingFromDate],
  );

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const response = await fetchComunidadeAlunoData();
      const perfil = response?.perfil;

      if (!perfil?.id) throw new Error('Perfil do aluno nao encontrado.');

      setAlunoId(perfil.id);
      setEscolaId(perfil.escola_id || null);
      setAlunoTurma(perfil.turma || null);
      setLivros(ensureArray(response?.livros));
      setLikes(ensureArray(response?.likes));
      setAudiobooks(ensureArray(response?.audiobooks));

      if (!enabled) {
        setPosts([]);
        setLikes([]);
        setAudiobooks([]);
        return;
      }

      const hydratedPosts = await Promise.all(
        ensureArray(response?.posts)
          .filter((item) => !isExpiredComunicado(item))
          .map(resolvePostMedia),
      );
      setPosts(hydratedPosts);
      setPostsOffset(hydratedPosts.length);
      setPostsHasMore(hydratedPosts.length === POSTS_PAGE_SIZE);
      syncPostsCache(hydratedPosts);

      if (canPublicarComunicado) {
        setProfessorTurmas(ensureArray(response?.professorTurmas));
        setTurmasPublicacao(ensureArray(response?.turmasPublicacao));
      } else {
        await loadTurmasPublicacao({ perfilId: perfil.id, escolaIdAtual: perfil.escola_id || null });
      }

      const quizPostIds = hydratedPosts
        .filter((post) => Boolean(extractQuizFromConteudo(post?.conteudo)))
        .map((post) => post.id);
      await loadQuizRankingForPosts(quizPostIds);
    } catch (error) {
      if (isMissingTableError(error)) {
        setEnabled(false);
        setPosts([]);
        setLikes([]);
        setAudiobooks([]);
        return;
      }
      toast({
        variant: 'destructive',
        title: 'Erro na comunidade',
        description: error?.message || 'Não foi possível carregar a comunidade.',
      });
    } finally {
      setLoading(false);
    }
  }, [canPublicarComunicado, enabled, loadQuizRankingForPosts, loadTurmasPublicacao, toast, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!user?.id || !enabled) return undefined;

    const interval = window.setInterval(() => {
      fetchData();
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, fetchData, user?.id]);

  useEffect(() => {
    if (!canPublicarComunicado || !alunoId || !escolaId) return;
    loadTurmasPublicacao({ perfilId: alunoId, escolaIdAtual: escolaId });
  }, [alunoId, canPublicarComunicado, escolaId, loadTurmasPublicacao]);

  useEffect(() => {
    const quizPostIds = posts
      .filter((post) => Boolean(extractQuizFromConteudo(post?.conteudo)))
      .map((post) => post.id);
    loadQuizRankingForPosts(quizPostIds);
  }, [loadQuizRankingForPosts, posts, quizRankingEscopo, quizRankingPeriodo]);

  const likedPostIds = useMemo(() => {
    if (!alunoId) return new Set();
    return new Set(ensureArray(likes).filter((l) => l?.usuario_id === alunoId).map((l) => l?.post_id).filter(Boolean));
  }, [alunoId, likes]);

  const likesByPost = useMemo(() => {
    const map = new Map();
    ensureArray(likes).forEach((l) => {
      if (!l?.post_id) return;
      map.set(l.post_id, (map.get(l.post_id) || 0) + 1);
    });
    return map;
  }, [likes]);

  const postsFiltrados = useMemo(() => {
    let list = ensureArray(posts).filter((post) => !isExpiredComunicado(post));
    if (!isGestor && !isBibliotecaria && !isSuperAdmin) {
      if (isProfessor) {
        const turmaSet = new Set(ensureArray(professorTurmas).map(normalizeTurmaKey).filter(Boolean));
        list = list.filter((post) => {
          const turmaPost = normalizeTurmaKey(post?.turma_publico);
          return !turmaPost || turmaSet.size === 0 || turmaSet.has(turmaPost);
        });
      } else {
        const turmaAluno = normalizeTurmaKey(alunoTurma);
        list = list.filter((post) => {
          const turmaPost = normalizeTurmaKey(post?.turma_publico);
          return !turmaPost || turmaPost === turmaAluno;
        });
      }
    }
    if (apenasMinhaEscola && escolaId) {
      list = list.filter((post) => post?.escola_id === escolaId);
    }
    if (apenasComImagens) {
      list = list.filter((post) => ensureArray(post?.imagem_urls).length > 0);
    }
    if (filtroTipo === 'ia') list = list.filter((post) => ensureArray(post?.tags).includes('ia'));
    else if (filtroTipo === 'quiz') list = list.filter((post) => Boolean(extractQuizFromConteudo(post?.conteudo)));
    else if (filtroTipo !== 'todos') list = list.filter((post) => post?.tipo === filtroTipo);

    const term = postSearchTerm.trim().toLowerCase();
    if (term) {
      list = list.filter((post) => {
        const titulo = safeText(post?.titulo, '').toLowerCase();
        const autorLivro = safeText(post?.livros?.autor, '').toLowerCase();
        const tituloLivro = safeText(post?.livros?.titulo, '').toLowerCase();
        const autorPost = safeNestedName(post?.usuarios_biblioteca, '').toLowerCase();
        return (
          titulo.includes(term) ||
          autorLivro.includes(term) ||
          tituloLivro.includes(term) ||
          autorPost.includes(term)
        );
      });
    }

    return list;
  }, [alunoTurma, apenasComImagens, apenasMinhaEscola, escolaId, filtroTipo, isBibliotecaria, isGestor, isProfessor, isSuperAdmin, postSearchTerm, posts, professorTurmas]);


  const handleSelectImages = async (files) => {
    const selected = Array.from(files || []).slice(0, 4);
    if (selected.length === 0) return;

    try {
      const converted = await Promise.all(selected.map(fileToDataUrl));
      setImageDataUrls((prev) => [...prev, ...converted].slice(0, 4));
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível processar as imagens.' });
    }
  };

  const clearPostForm = () => {
    setPostTipo('resenha');
    setPostLivroId('');
    setPostLivroNomeManual('');
    setPostAudiobookId('');
    setPostTitulo('');
    setPostConteudo('');
    setPostComIA(false);
    setPostTurmaPublico('');
    setPostExpiraEm('');
    setImageDataUrls([]);
  };

  const handleCriarPost = async () => {
    if (!enabled || !alunoId || !escolaId) {
      toast({
        variant: 'destructive',
        title: 'Comunidade indisponivel',
        description: 'Não foi possível publicar agora. Verifique se as tabelas/migrations estão atualizadas.',
      });
      return;
    }
    if (!postConteudo.trim() && imageDataUrls.length === 0 && !postAudiobookId) {
      toast({
        variant: 'destructive',
        title: 'Conteudo obrigatorio',
        description: 'Escreva algo ou anexe uma imagem/audiobook.',
      });
      return;
    }
    if ((isProfessor || (canPublicarComunicado && postTipo === 'comunicado')) && !postTurmaPublico) {
      toast({
        variant: 'destructive',
        title: postTipo === 'comunicado' ? 'Defina o publico do comunicado' : 'Selecione a turma',
        description: postTipo === 'comunicado'
          ? 'Escolha a turma que deve receber este comunicado.'
          : 'Escolha a turma da publicacao.',
      });
      return;
    }
    if (canPublicarComunicado && postTipo === 'comunicado' && postExpiraEm && postExpiraEm < minComunicadoDate) {
      toast({
        variant: 'destructive',
        title: 'Data invalida',
        description: 'A data final do comunicado deve ser hoje ou uma data futura.',
      });
      return;
    }

    setSaving(true);
    try {
      const turmaPublico = (isProfessor || (canPublicarComunicado && postTipo === 'comunicado'))
        ? (postTurmaPublico === ALL_TURMAS_OPTION ? null : postTurmaPublico || null)
        : null;
      const expiresAt = canPublicarComunicado && postTipo === 'comunicado' ? toEndOfDayIso(postExpiraEm) : null;

      const imagemUrls = imageDataUrls.length > 0
        ? await Promise.all(
            imageDataUrls.map(async (dataUrl, index) => {
              const upload = await uploadDataUrlToR2({
                dataUrl,
                escolaId,
                ownerId: alunoId,
                scope: 'comunidade-posts',
                fileName: `${Date.now()}-${index + 1}.jpg`,
              });
              return upload.objectKey;
            }),
          )
        : [];
      const livroManual = postLivroNomeManual.trim();
      const livroRelacionado = postLivroId
        ? livros.find((livro) => livro.id === postLivroId)
        : null;
      const conteudoBase =
        postConteudo.trim() || (postTipo === 'comunicado' ? 'Novo comunicado da escola.' : 'Compartilhamento de midia criado na comunidade.');
      const conteudoComLivroManual =
        !postLivroId && livroManual
          ? `Livro desejado: ${livroManual}\n\n${conteudoBase}`.trim()
          : conteudoBase;
      const tituloBase = postTitulo.trim();
      const tituloComLivroManual =
        tituloBase || (!postLivroId && livroManual ? `${postTipo === 'resenha' ? 'Resenha' : 'Publicação'} sobre ${livroManual}` : null);

      const { data: novoPost, error } = await insertCommunityPostCompat({
        autor_id: alunoId,
        escola_id: escolaId,
        turma_publico: turmaPublico,
        expires_at: expiresAt,
        livro_id: postLivroId || null,
        audiobook_id: postAudiobookId || null,
        tipo: postTipo,
        titulo: tituloComLivroManual,
        conteudo: conteudoComLivroManual,
        imagem_urls: imagemUrls,
        tags: Array.from(new Set([
          ...(postComIA ? ['ia'] : []),
          ...(postTipo === 'comunicado' ? [COMUNICADO_AUTO_TAG] : []),
          ...(livroManual && !livroRelacionado ? ['livro-manual'] : []),
        ])),
      });

      if (error) throw error;

      if (novoPost?.id) {
        const normalizedPost = await resolvePostMedia(novoPost);
        setPosts((prev) => {
          const nextList = [normalizedPost, ...ensureArray(prev)];
          syncPostsCache(nextList);
          return nextList;
        });
      }

      clearPostForm();
      setPostDialogOpen(false);
      toast({ title: postTipo === 'comunicado' ? 'Comunicado publicado!' : 'Publicacao criada!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: isMissingTableError(error)
          ? 'Comunidade indisponivel: aplique a migration do banco.'
          : error?.message || 'Falha ao publicar.',
      });
    } finally {
      setSaving(false);
    }
  };

  const openShareDialog = (post) => {
    setSharePost(post);
    setShareTitulo(post?.titulo || '');
    setShareImageDataUrl(ensureArray(post?.imagem_urls)[0] || '');
    setShareDialogOpen(true);
  };

  const abrirPreviewPost = (post) => {
    setPostPreviewItem(post);
    setPostPreviewOpen(true);
  };

  const handleSelectShareImage = async (files) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const converted = await fileToDataUrl(file);
      setShareImageDataUrl(converted);
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível processar a imagem.' });
    }
  };

  const handleCompartilharPost = async () => {
    if (!sharePost || !alunoId || !escolaId) return;

    setSharing(true);
    try {
      const imagemUrls = [];
      if (shareImageDataUrl) {
        const sharedUrl = await uploadDataUrlToR2(shareImageDataUrl, {
          dataUrl: shareImageDataUrl,
          escolaId,
          ownerId: alunoId,
          scope: 'comunidade-shared',
          fileName: `${Date.now()}-share.jpg`,
        });
        imagemUrls.push(sharedUrl.objectKey);
      }

      const sourceLabel = sharePost?.tipo === 'quiz' || extractQuizFromConteudo(sharePost?.conteudo) ? 'quiz' : sharePost?.tipo || 'post';
      const tituloCompartilhado = shareTitulo.trim() || `Compartilhamento de ${sourceLabel}`;
      const conteudoBase = safeText(sharePost?.conteudo, '').trim();
      const conteudoCompartilhado = [`Compartilhado da comunidade: ${safeText(sharePost?.titulo, 'Publicacao')}`, conteudoBase]
        .filter(Boolean)
        .join('\n\n');

      const { data: novoPost, error } = await insertCommunityPostCompat({
        autor_id: alunoId,
        escola_id: escolaId,
        livro_id: sharePost?.livro_id || null,
        audiobook_id: sharePost?.audiobook_id || null,
        tipo: sharePost?.tipo || 'resenha',
        titulo: tituloCompartilhado,
        conteudo: conteudoCompartilhado,
        imagem_urls: imagemUrls,
        tags: Array.from(new Set([...(ensureArray(sharePost?.tags)), 'compartilhado'])),
      });

      if (error) throw error;

      if (novoPost?.id) {
        const normalizedPost = await resolvePostMedia(novoPost);
        setPosts((prev) => {
          const nextList = [normalizedPost, ...ensureArray(prev)];
          syncPostsCache(nextList);
          return nextList;
        });
      }

      setShareDialogOpen(false);
      setSharePost(null);
      setShareTitulo('');
      setShareImageDataUrl('');
      toast({ title: 'Post compartilhado com sucesso!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao compartilhar',
        description: error?.message || 'Não foi possível compartilhar este post.',
      });
    } finally {
      setSharing(false);
    }
  };

  const responderQuiz = (postId, perguntaIndex, opcaoIndex) => {
    setQuizRespostasPorPost((prev) => ({
      ...prev,
      [postId]: {
        ...(prev[postId] || {}),
        [perguntaIndex]: opcaoIndex,
      },
    }));
  };

  const corrigirQuizPost = async (postId, quizData) => {
    const respostas = quizRespostasPorPost[postId] || {};
    const total = ensureArray(quizData?.perguntas).length;
    if (total === 0) return;

    let acertos = 0;
    quizData.perguntas.forEach((pergunta, index) => {
      if (Number(respostas[index]) === Number(pergunta.correta)) {
        acertos += 1;
      }
    });

    const resultado = { acertos, total };
    setQuizResultadoPorPost((prev) => ({ ...prev, [postId]: resultado }));

    if (!alunoId || !escolaId) return;

    try {
      await submitComunidadeQuizTentativa({
        post_id: postId,
        aluno_id: alunoId,
        escola_id: escolaId,
        acertos,
        total,
      });
      await loadQuizRankingForPosts([postId]);
      toast({
        title: 'Quiz corrigido!',
        description: `Você acertou ${acertos} de ${total} perguntas.`,
      });
    } catch (error) {
      if (!isMissingTableError(error)) {
        toast({
          variant: 'destructive',
          title: 'Não foi possível registrar sua tentativa',
          description: error?.message || 'Tente novamente em instantes.',
        });
      }
    }
  };

  const resetarQuizPost = (postId) => {
    setQuizRespostasPorPost((prev) => ({ ...prev, [postId]: {} }));
    setQuizResultadoPorPost((prev) => {
      const next = { ...prev };
      delete next[postId];
      return next;
    });
  };

  const toggleLikePost = async (postId) => {
    if (!enabled || !alunoId) {
      toast({
        variant: 'destructive',
        title: 'Comunidade indisponivel',
        description: 'Não foi possível curtir agora.',
      });
      return;
    }
    if (likingPostIds.has(postId)) return;

    setLikingPostIds((prev) => {
      const next = new Set(prev);
      next.add(postId);
      return next;
    });

    try {
      if (likedPostIds.has(postId)) {
        setLikes((prev) => ensureArray(prev).filter((item) => !(item.post_id === postId && item.usuario_id === alunoId)));
        await toggleComunidadeLike({ postId, usuarioId: alunoId, liked: true });
      } else {
        const hadLike = ensureArray(likes).some((item) => item.post_id === postId && item.usuario_id === alunoId);
        if (!hadLike) {
          setLikes((prev) => [...ensureArray(prev), { post_id: postId, usuario_id: alunoId }]);
        }

        await toggleComunidadeLike({ postId, usuarioId: alunoId, liked: false });
      }
    } catch (error) {
      const liked = likedPostIds.has(postId);
      if (liked) {
        setLikes((prev) => [...ensureArray(prev), { post_id: postId, usuario_id: alunoId }]);
      } else {
        setLikes((prev) => ensureArray(prev).filter((item) => !(item.post_id === postId && item.usuario_id === alunoId)));
      }
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error?.message || 'Não foi possível atualizar a curtida.',
      });
    } finally {
      setLikingPostIds((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  };

  const podeGerenciarPost = (post) => {
    if (!post?.id) return false;
    if (isGestor || isBibliotecaria || isSuperAdmin) return true;
    return post?.autor_id === alunoId;
  };

  const podeEditarPost = (post) => {
    if (!post?.id) return false;
    return post?.autor_id === alunoId;
  };

  const abrirEdicao = (post) => {
    setPostEmEdicao(post);
    setEditTitulo(post?.titulo || '');
    setEditConteudo(post?.conteudo || '');
    setEditDialogOpen(true);
  };

  const salvarEdicaoPost = async () => {
    if (!postEmEdicao?.id) return;

    const tituloLimpo = editTitulo.trim();
    const conteudoLimpo = editConteudo.trim();

    if (!conteudoLimpo) {
      toast({
        variant: 'destructive',
        title: 'Conteudo obrigatorio',
        description: 'Escreva algo antes de salvar.',
      });
      return;
    }

    setSaving(true);
    try {
      await updateComunidadePost(postEmEdicao.id, {
        titulo: tituloLimpo || null,
        conteudo: conteudoLimpo,
      });

      setPosts((prev) => {
        const nextList = ensureArray(prev).map((item) =>
          item.id === postEmEdicao.id ? { ...item, titulo: tituloLimpo || null, conteudo: conteudoLimpo } : item,
        );
        syncPostsCache(nextList);
        return nextList;
      });

      setEditDialogOpen(false);
      setPostEmEdicao(null);
      setEditTitulo('');
      setEditConteudo('');
      toast({ title: 'Post atualizado com sucesso.' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: error?.message || 'Não foi possível atualizar o post.',
      });
    } finally {
      setSaving(false);
    }
  };

  const apagarPost = async (post) => {
    if (!podeGerenciarPost(post)) return;

    setSaving(true);
    try {
      const response = await deleteComunidadePost(post.id, alunoId);
      if (response?.deleted === false) {
        throw new Error('Você so pode apagar publicacoes feitas por você.');
      }
      setPosts((prev) => {
        const nextList = ensureArray(prev).filter((item) => item.id !== post.id);
        syncPostsCache(nextList);
        return nextList;
      });
      setLikes((prev) => ensureArray(prev).filter((item) => item?.post_id !== post.id));
      toast({ title: 'Post apagado com sucesso.' });
      setDeleteConfirmPost(null);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao apagar',
        description: error?.message || 'Não foi possível apagar o post.',
      });
    } finally {
      setSaving(false);
    }
  };

  const isGestao = isGestor || isBibliotecaria || isSuperAdmin;

  return (
    <MainLayout title={isGestao ? 'Comunidade Escolar' : 'Comunidade do Aluno'}>
      <div className="sr-only" aria-live="polite">{ariaLiveMessage}</div>
      <div className="space-y-4 sm:space-y-6 pb-20">
        <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-primary/10 via-info/10 to-warning/10 p-4 sm:p-6">
          <div className="absolute right-4 top-4 opacity-30">
            <Sparkles className="w-10 h-10" />
          </div>
          <h2 className="text-xl sm:text-2xl font-bold">Comunidade de Leitura</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Compartilhe resenhas, dicas, sugestoes e recomendacoes de audiobooks.
            {isGestao ? ' Você também pode moderar publicacoes da comunidade.' : ''}
          </p>
        </div>

        {!enabled && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                Comunidade indisponivel neste ambiente. Para habilitar, ative `VITE_ENABLE_OPTIONAL_STUDENT_FEATURES=true`,
                aplique a migration e recarregue.
              </p>
            </CardContent>
          </Card>
        )}

        {isGestao && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Painel de moderacao</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={apenasMinhaEscola}
                    onChange={(e) => setApenasMinhaEscola(e.target.checked)}
                    className="h-4 w-4 rounded border border-input"
                  />
                  Somente minha escola
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={apenasComImagens}
                    onChange={(e) => setApenasComImagens(e.target.checked)}
                    className="h-4 w-4 rounded border border-input"
                  />
                  Somente com imagens
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Use os filtros e a busca para revisar e moderar publicacoes.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="relative">
          <Input
            placeholder="Buscar por titulo, autor do livro ou aluno..."
            value={postSearchTerm}
            onChange={(e) => setPostSearchTerm(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          <Badge variant="outline" className="gap-1 shrink-0">
            <Filter className="w-3 h-3" /> Filtrar
          </Badge>
          <Button size="sm" variant={filtroTipo === 'todos' ? 'default' : 'outline'} onClick={() => setFiltroTipo('todos')}>
            Todos
          </Button>
          <Button size="sm" variant={filtroTipo === 'resenha' ? 'default' : 'outline'} onClick={() => setFiltroTipo('resenha')}>
            Resenhas
          </Button>
          <Button size="sm" variant={filtroTipo === 'dica' ? 'default' : 'outline'} onClick={() => setFiltroTipo('dica')}>
            Dicas
          </Button>
          <Button size="sm" variant={filtroTipo === 'sugestão' ? 'default' : 'outline'} onClick={() => setFiltroTipo('sugestão')}>
            Sugestoes
          </Button>
          <Button size="sm" variant={filtroTipo === 'comunicado' ? 'default' : 'outline'} onClick={() => setFiltroTipo('comunicado')}>
            Comunicados
          </Button>
          <Button size="sm" variant={filtroTipo === 'quiz' ? 'default' : 'outline'} onClick={() => setFiltroTipo('quiz')}>
            Quizzes
          </Button>
          <Button size="sm" variant={filtroTipo === 'ia' ? 'default' : 'outline'} onClick={() => setFiltroTipo('ia')}>
            Com IA
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Feed da comunidade</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : postsFiltrados.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Sem posts para este filtro.</p>
            ) : (
              <div className="space-y-4">
                {postsFiltrados.map((post) => {
                  const quizData = extractQuizFromConteudo(post?.conteudo);
                  const respostasQuiz = quizRespostasPorPost[post.id] || {};
                  const resultadoQuiz = quizResultadoPorPost[post.id];
                  const conteudoVisivel = quizData?.descricao || safeText(post?.conteudo, 'Conteudo indisponivel');
                  const mostrarPreviewCompleto = conteudoVisivel.length > 200;
                  const ranking = ensureArray(quizRankingByPost[post.id]);
                  const historico = quizHistoricoByPost[post.id];

                  return (
                    <div key={post.id} className="p-4 rounded-xl border bg-card shadow-sm space-y-3 overflow-hidden">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-sm sm:text-base break-words">{safeText(post?.titulo, 'Post da comunidade')}</p>
                            {ensureArray(post?.tags).includes('ia') && <Badge variant="secondary">IA</Badge>}
                            {quizData && <Badge variant="secondary">Quiz</Badge>}
                            {post?.tipo === 'comunicado' && <Badge variant="destructive">Comunicado</Badge>}
                            {post?.turma_publico && <Badge variant="outline">Turma {post.turma_publico}</Badge>}
                            {post?.tipo === 'comunicado' && !post?.turma_publico && <Badge variant="outline">Todas as turmas</Badge>}
                          </div>
                          <p className="text-xs text-muted-foreground break-words">
                            {safeNestedName(post?.usuarios_biblioteca, 'Usuario')} • {quizData ? 'quiz' : safeText(post?.tipo, 'resenha')} • {formatDateBR(post?.created_at)}
                          </p>
                        </div>
                        <Badge variant="secondary" className="max-w-[38vw] sm:max-w-[220px] truncate shrink-0">
                          {safeText(post?.livros?.titulo, 'Geral')}
                        </Badge>
                      </div>

                      <div className="space-y-1">
                        <p className={`text-sm text-muted-foreground whitespace-pre-wrap ${mostrarPreviewCompleto ? 'line-clamp-3' : ''}`}>
                          {conteudoVisivel}
                        </p>
                        {mostrarPreviewCompleto && (
                          <Button type="button" variant="ghost" size="sm" onClick={() => abrirPreviewPost(post)}>
                            Ver completo
                          </Button>
                        )}
                      </div>

                      {quizData && (
                        <div className="space-y-3 rounded-lg border bg-muted/50 p-3">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <Sparkles className="w-4 h-4" /> Quiz da comunidade
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium">Ranking:</span>
                            <select
                              value={quizRankingPeriodo}
                              onChange={(e) => setQuizRankingPeriodo(e.target.value)}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                              aria-label="Periodo do ranking"
                              title="Periodo do ranking"
                            >
                              <option value="geral">Geral</option>
                              <option value="semana">Semana</option>
                              <option value="mes">Mes</option>
                            </select>
                            <select
                              value={quizRankingEscopo}
                              onChange={(e) => setQuizRankingEscopo(e.target.value)}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                              aria-label="Escopo do ranking"
                              title="Escopo do ranking"
                            >
                              {escolaId && <option value="escola">Minha escola</option>}
                              {alunoTurma && <option value="turma">Minha turma</option>}
                              <option value="todos">Todas</option>
                            </select>
                          </div>
                          <div className="space-y-3">
                            {quizData.perguntas.map((pergunta, idx) => (
                              <div key={idx} className="space-y-2">
                                <p className="text-sm font-medium">
                                  {idx + 1}) {pergunta.enunciado}
                                </p>
                                <div className="grid sm:grid-cols-2 gap-2">
                                  {pergunta.opcoes.map((opcao, opIdx) => {
                                    const selecionada = Number(respostasQuiz[idx]) === opIdx;
                                    const quizCorrigido = Boolean(resultadoQuiz);
                                    const isCorreta = Number(pergunta.correta) === opIdx;
                                    let variant = 'outline';
                                    if (quizCorrigido && isCorreta) variant = 'secondary';
                                    else if (quizCorrigido && selecionada && !isCorreta) variant = 'destructive';
                                    else if (selecionada) variant = 'default';

                                    return (
                                      <Button
                                        key={`${post.id}-${idx}-${opIdx}`}
                                        variant={variant}
                                        size="sm"
                                        className="justify-start text-left"
                                        onClick={() => responderQuiz(post.id, idx, opIdx)}
                                      >
                                        {String.fromCharCode(65 + opIdx)}. {opcao}
                                      </Button>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <Button size="sm" onClick={() => corrigirQuizPost(post.id, quizData)} disabled={quizData.perguntas.length === 0}>
                              Conferir
                            </Button>
                            {resultadoQuiz && (
                              <>
                                <Badge variant="secondary">
                                  {resultadoQuiz.acertos}/{resultadoQuiz.total} acertos
                                </Badge>
                                <Button size="sm" variant="ghost" onClick={() => resetarQuizPost(post.id)}>
                                  Refazer
                                </Button>
                              </>
                            )}
                          </div>
                          {(historico || ranking.length > 0) && (
                            <div className="text-xs text-muted-foreground space-y-1">
                              {historico && (
                                <p>
                                  Seu melhor: {historico.acertos}/{historico.total} acertos
                                </p>
                              )}
                              {ranking.length > 0 && (
                                <div>
                                  <p className="font-medium">Ranking</p>
                                  <div className="space-y-0.5">
                                    {ranking.map((item, index) => (
                                      <p key={item.id}>
                                        {index + 1}. {safeNestedName(item?.usuarios_biblioteca, 'Aluno')} - {item.acertos}/{item.total}
                                      </p>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {ensureArray(post?.imagem_urls).length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {ensureArray(post?.imagem_urls).slice(0, 4).map((img, index) => (
                            <button key={`${post.id}-${index}`} type="button" onClick={() => setSelectedImageUrl(img)} className="text-left">
                              <img src={img} alt={`Imagem ${index + 1}`} className="w-full h-40 sm:h-52 object-cover rounded-md border" />
                            </button>
                          ))}
                        </div>
                      )}

                      {post?.audiobooks_biblioteca && (
                        <div className="p-2 rounded-md bg-muted/70 text-xs space-y-2">
                          <p>
                            <span className="font-medium">Audiobook indicado:</span> {safeText(post?.audiobooks_biblioteca?.titulo, '-')}
                          </p>
                          {post?.audiobooks_biblioteca?.audio_url && (
                            <audio controls src={post.audiobooks_biblioteca.audio_url} className="w-full h-10" preload="metadata" />
                          )}
                        </div>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleLikePost(post.id)}
                          disabled={!enabled || likingPostIds.has(post.id)}
                        >
                          <Heart className={`w-4 h-4 mr-1 ${likedPostIds.has(post.id) ? 'fill-destructive text-destructive' : ''}`} />
                          {likesByPost.get(post.id) || 0}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => openShareDialog(post)} disabled={!enabled}>
                          Compartilhar
                        </Button>
                        {podeEditarPost(post) && (
                          <Button variant="ghost" size="sm" onClick={() => abrirEdicao(post)} disabled={!enabled || saving}>
                            <Pencil className="w-4 h-4 mr-1" />
                            Editar
                          </Button>
                        )}
                        {podeGerenciarPost(post) && (
                          <Button variant="ghost" size="sm" onClick={() => setDeleteConfirmPost(post)} disabled={!enabled || saving}>
                            <Trash2 className="w-4 h-4 mr-1 text-destructive" />
                            Apagar
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                {postsHasMore && (
                  <div className="flex justify-center">
                    <Button type="button" variant="outline" onClick={() => fetchPostsPage({ reset: false })} disabled={postsLoadingMore}>
                      {postsLoadingMore ? 'Carregando...' : 'Carregar mais'}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Button
        type="button"
        className="fixed bottom-6 right-6 z-40 h-14 w-14 rounded-full shadow-lg"
        onClick={() => setPostDialogOpen(true)}
        disabled={!enabled}
      >
        <Plus className="w-6 h-6" />
      </Button>

      <Dialog open={postDialogOpen} onOpenChange={setPostDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" /> Nova publicacao
            </DialogTitle>
            <DialogDescription>
              {canPublicarComunicado
                ? 'Compartilhe resenhas, dicas, sugestoes ou comunicados com a comunidade.'
                : 'Compartilhe uma resenha, dica ou sugestão com a comunidade.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label>Tipo</Label>
                <select
                  value={postTipo}
                  onChange={(e) => setPostTipo(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="resenha">Resenha</option>
                  <option value="dica">Dica</option>
                  <option value="sugestão">Sugestão</option>
                  {canPublicarComunicado && <option value="comunicado">Comunicado</option>}
                </select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Livro da biblioteca (opcional)</Label>
                <select
                  value={postLivroId || 'none'}
                  onChange={(e) => setPostLivroId(e.target.value === 'none' ? '' : e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="none">Sem livro especifico</option>
                  {livros.map((livro) => (
                    <option key={livro.id} value={livro.id}>
                      {livro.titulo}
                    </option>
                    ))}
                </select>
                <Input
                  value={postLivroNomeManual}
                  onChange={(e) => setPostLivroNomeManual(e.target.value)}
                  placeholder="Ou digite o nome do livro que você quer citar"
                />
                <p className="text-xs text-muted-foreground">
                  Você pode selecionar um livro da biblioteca ou escrever o nome manualmente.
                </p>
              </div>
              {(isProfessor || (canPublicarComunicado && postTipo === 'comunicado')) && (
                <div className="space-y-2 sm:col-span-3">
                  <Label>{postTipo === 'comunicado' ? 'Turma do comunicado' : 'Turma da publicacao'}</Label>
                  <select
                    value={postTurmaPublico || 'none'}
                    onChange={(e) => setPostTurmaPublico(e.target.value === 'none' ? '' : e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="none">{postTipo === 'comunicado' ? 'Selecione o destino' : 'Selecione a turma'}</option>
                    <option value={ALL_TURMAS_OPTION}>Todas as turmas</option>
                    {turmasPublicacao.map((turma) => (
                      <option key={turma} value={turma}>
                        {turma}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {canPublicarComunicado && postTipo === 'comunicado' && (
                <div className="space-y-2 sm:col-span-3">
                  <Label htmlFor="comunicado-expira-em">Data para remover o comunicado (opcional)</Label>
                  <Input
                    id="comunicado-expira-em"
                    type="date"
                    value={postExpiraEm}
                    min={minComunicadoDate}
                    onChange={(e) => setPostExpiraEm(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Se você definir uma data, o comunicado será apagado da comunidade e das notificações quando ela vencer.
                    Sem data, ele continuara visivel ate ser apagado manualmente.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Audiobook da biblioteca (opcional)</Label>
              <select
                value={postAudiobookId || 'none'}
                onChange={(e) => setPostAudiobookId(e.target.value === 'none' ? '' : e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="none">Não indicar audiobook</option>
                {audiobooks.map((audio) => (
                  <option key={audio.id} value={audio.id}>
                    {audio.titulo} {audio.autor ? `- ${audio.autor}` : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <Label>Titulo</Label>
              <Input value={postTitulo} onChange={(e) => setPostTitulo(e.target.value)} placeholder="Titulo da publicacao" />
            </div>

            <div className="space-y-2">
              <Label>Conteudo</Label>
              <Textarea
                rows={4}
                value={postConteudo}
                onChange={(e) => setPostConteudo(e.target.value)}
                placeholder="Escreva sua experiencia de leitura..."
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={postComIA}
                onChange={(e) => setPostComIA(e.target.checked)}
                className="h-4 w-4 rounded border border-input"
              />
              Conteudo criado com IA
            </label>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <ImagePlus className="w-4 h-4" /> Imagens (ate 4)
              </Label>
              <input
                ref={postImagesInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handleSelectImages(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => postImagesInputRef.current?.click()}
              >
                <ImagePlus className="w-4 h-4 mr-2" />
                Adicionar imagens
              </Button>
              {imageDataUrls.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {imageDataUrls.map((img, index) => (
                    <div key={index} className="relative">
                      <img src={img} alt={`Preview ${index + 1}`} className="w-full h-20 object-cover rounded-md border" />
                      <button
                        type="button"
                        onClick={() => setImageDataUrls((prev) => prev.filter((_, i) => i !== index))}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPostDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleCriarPost} disabled={saving || !enabled}>
                <Send className="w-4 h-4 mr-2" /> {saving ? 'Publicando...' : 'Publicar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) {
            setPostEmEdicao(null);
            setEditTitulo('');
            setEditConteudo('');
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4" /> Editar publicacao
            </DialogTitle>
            <DialogDescription>Atualize o conteudo do seu post.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Titulo</Label>
              <Input value={editTitulo} onChange={(e) => setEditTitulo(e.target.value)} placeholder="Titulo (opcional)" />
            </div>
            <div className="space-y-2">
              <Label>Conteudo</Label>
              <Textarea
                rows={5}
                value={editConteudo}
                onChange={(e) => setEditConteudo(e.target.value)}
                placeholder="Atualize sua publicacao..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={salvarEdicaoPost} disabled={saving}>
                <Send className="w-4 h-4 mr-2" />
                {saving ? 'Salvando...' : 'Salvar alteracoes'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteConfirmPost)}
        onOpenChange={(open) => {
          if (!open && !saving) setDeleteConfirmPost(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir publicacao</DialogTitle>
            <DialogDescription>
              Essa acao remove a publicacao da comunidade e nao pode ser desfeita.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-xl border bg-muted/30 p-4 space-y-2">
            <p className="text-sm font-semibold break-words">
              {safeText(deleteConfirmPost?.titulo, 'Post da comunidade')}
            </p>
            <p className="text-sm text-muted-foreground">
              Deseja realmente apagar esta publicacao?
            </p>
            {deleteConfirmPost?.tipo === 'comunicado' && (
              <p className="text-xs text-muted-foreground">
                O comunicado também deixará de aparecer nas notificações e na remoção programada.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteConfirmPost(null)} disabled={saving}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={() => apagarPost(deleteConfirmPost)} disabled={saving}>
              <Trash2 className="w-4 h-4 mr-2" />
              {saving ? 'Apagando...' : 'Confirmar exclusao'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={shareDialogOpen}
        onOpenChange={(open) => {
          setShareDialogOpen(open);
          if (!open) {
            setSharePost(null);
            setShareTitulo('');
            setShareImageDataUrl('');
          }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-4 h-4" /> Compartilhar post
            </DialogTitle>
            <DialogDescription>Adicione um titulo e uma foto antes de compartilhar.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Titulo</Label>
              <Input
                value={shareTitulo}
                onChange={(e) => setShareTitulo(e.target.value)}
                placeholder="Digite o titulo do compartilhamento"
              />
            </div>

            <div className="space-y-2">
              <Label>Foto (opcional)</Label>
              <Input type="file" accept="image/*" onChange={(e) => handleSelectShareImage(e.target.files)} />
              {shareImageDataUrl && (
                <div className="relative w-fit">
                  <img
                    src={shareImageDataUrl}
                    alt="Previa da foto do compartilhamento"
                    className="w-40 h-28 object-cover rounded-md border"
                  />
                  <button
                    type="button"
                    onClick={() => setShareImageDataUrl('')}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShareDialogOpen(false)} disabled={sharing}>
                Cancelar
              </Button>
              <Button onClick={handleCompartilharPost} disabled={sharing || !enabled || !sharePost}>
                <Send className="w-4 h-4 mr-2" /> {sharing ? 'Compartilhando...' : 'Compartilhar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={postPreviewOpen}
        onOpenChange={(open) => {
          setPostPreviewOpen(open);
          if (!open) setPostPreviewItem(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{safeText(postPreviewItem?.titulo, 'Publicacao')}</DialogTitle>
            <DialogDescription>
              {safeNestedName(postPreviewItem?.usuarios_biblioteca, 'Usuario')} • {formatDateBR(postPreviewItem?.created_at)}
            </DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm text-muted-foreground">
            {safeText(extractQuizFromConteudo(postPreviewItem?.conteudo)?.descricao || postPreviewItem?.conteudo, 'Conteudo indisponivel')}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedImageUrl)} onOpenChange={(open) => !open && setSelectedImageUrl('')}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Visualizacao da imagem</DialogTitle>
            <DialogDescription>Imagem ampliada do post selecionado.</DialogDescription>
          </DialogHeader>
          {selectedImageUrl && (
            <img src={selectedImageUrl} alt="Imagem ampliada" className="w-full max-h-[75vh] object-contain rounded-lg border" />
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}









