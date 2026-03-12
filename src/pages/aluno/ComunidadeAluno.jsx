import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

const ENABLE_OPTIONAL_STUDENT_FEATURES = import.meta.env.VITE_ENABLE_OPTIONAL_STUDENT_FEATURES !== 'false';
const POSTS_PAGE_SIZE = 20;

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

function mergeById(list, incoming, idKey = 'id') {
  const map = new Map(ensureArray(list).map((item) => [item?.[idKey], item]));
  ensureArray(incoming).forEach((item) => {
    if (item?.[idKey]) map.set(item[idKey], item);
  });
  return Array.from(map.values());
}

function safeText(value, fallback = '-') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function safeNestedName(value, fallback = 'Usuário') {
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
  const selectFields =
    '*, livros(titulo), audiobooks_biblioteca(titulo, autor, audio_url), usuarios_biblioteca!comunidade_posts_autor_id_fkey(nome)';

  const runInsert = async (insertPayload) =>
    supabase.from('comunidade_posts').insert(insertPayload).select(selectFields).single();

  let { data, error } = await runInsert(payload);

  if (error && Object.hasOwn(payload, 'escola_id') && isMissingColumnError(error, 'escola_id', 'comunidade_posts')) {
    const { escola_id: _ignored, ...fallbackPayload } = payload;
    ({ data, error } = await runInsert(fallbackPayload));
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
  if (parts.length < 2) throw new Error('Imagem inválida.');
  const mimeMatch = parts[0].match(/:(.*?);/);
  const mime = mimeMatch?.[1] || 'image/jpeg';
  const binary = atob(parts[1]);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mime });
}

export default function ComunidadeAluno() {
  const { user, isGestor, isBibliotecaria, isSuperAdmin } = useAuth();
  const { toast } = useToast();

  const [alunoId, setAlunoId] = useState(null);
  const [escolaId, setEscolaId] = useState(null);
  const [alunoTurma, setAlunoTurma] = useState(null);
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

  const [postTipo, setPostTipo] = useState('resenha');
  const [postLivroId, setPostLivroId] = useState('');
  const [postAudiobookId, setPostAudiobookId] = useState('');
  const [postTitulo, setPostTitulo] = useState('');
  const [postConteudo, setPostConteudo] = useState('');
  const [postComIA, setPostComIA] = useState(false);
  const [imageDataUrls, setImageDataUrls] = useState([]);
  const [selectedImageUrl, setSelectedImageUrl] = useState('');
  const [shareDialogOpen, setShareDialogOpen] = useState(false);
  const [sharePost, setSharePost] = useState(null);
  const [shareTitulo, setShareTitulo] = useState('');
  const [shareImageDataUrl, setShareImageDataUrl] = useState('');
  const [sharing, setSharing] = useState(false);
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
    async ({ reset = false } = {}) => {
      if (!enabled) return;
      const offset = reset ? 0 : postsOffset;
      setPostsLoadingMore(true);
      try {
        const { data, error } = await supabase
          .from('comunidade_posts')
          .select('*, livros(titulo), audiobooks_biblioteca(titulo, autor, audio_url), usuarios_biblioteca!comunidade_posts_autor_id_fkey(nome)')
          .order('created_at', { ascending: false })
          .range(offset, offset + POSTS_PAGE_SIZE - 1);
        if (error) throw error;
        const items = data || [];
        setPosts((prev) => (reset ? items : mergeById(prev, items)));
        setPostsOffset(offset + items.length);
        setPostsHasMore(items.length === POSTS_PAGE_SIZE);
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
        const selectFields = quizRankingEscopo === 'turma'
          ? 'id, post_id, aluno_id, acertos, total, created_at, usuarios_biblioteca!inner(nome, turma)'
          : 'id, post_id, aluno_id, acertos, total, created_at, usuarios_biblioteca(nome, turma)';
        let query = supabase
          .from('comunidade_quiz_tentativas')
          .select(selectFields)
          .in('post_id', ids)
          .order('acertos', { ascending: false })
          .order('created_at', { ascending: true });
        if (quizRankingFromDate) {
          query = query.gte('created_at', quizRankingFromDate);
        }
        if (quizRankingEscopo === 'escola' && escolaId) {
          query = query.eq('escola_id', escolaId);
        }
        if (quizRankingEscopo === 'turma' && alunoTurma) {
          query = query.eq('escola_id', escolaId).eq('usuarios_biblioteca.turma', alunoTurma);
        }
        const { data, error } = await query;

        if (error) {
          if (isMissingTableError(error)) return;
          throw error;
        }

        const rankingMap = {};
        const historicoMap = {};

        (data || []).forEach((tentativa) => {
          if (!tentativa?.post_id) return;
          const list = rankingMap[tentativa.post_id] || [];
          if (list.length < 5) {
            list.push(tentativa);
            rankingMap[tentativa.post_id] = list;
          }
          if (alunoId && tentativa.aluno_id === alunoId) {
            const prev = historicoMap[tentativa.post_id];
            if (!prev || tentativa.acertos > prev.acertos) {
              historicoMap[tentativa.post_id] = tentativa;
            }
          }
        });

        setQuizRankingByPost((prev) => ({ ...prev, ...rankingMap }));
        setQuizHistoricoByPost((prev) => ({ ...prev, ...historicoMap }));
      } catch (error) {
        if (error && !isMissingTableError(error)) {
          console.warn('Falha ao carregar ranking do quiz.', error);
        }
      }
    },
    [alunoId, alunoTurma, escolaId, quizRankingEscopo, quizRankingFromDate],
  );

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data: perfil, error: perfilError } = await supabase
        .from('usuarios_biblioteca')
        .select('id, escola_id, turma')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (perfilError || !perfil) throw perfilError || new Error('Perfil do aluno não encontrado.');
      setAlunoId(perfil.id);
      setEscolaId(perfil.escola_id || null);
      setAlunoTurma(perfil.turma || null);

      const { data: livrosData, error: livrosError } = await supabase.from('livros').select('id, titulo').order('titulo');
      if (livrosError) throw livrosError;
      setLivros(livrosData || []);

      if (!enabled) {
        setPosts([]);
        setLikes([]);
        setAudiobooks([]);
        return;
      }

      const probeRes = await supabase.from('comunidade_posts').select('id').limit(1);
      if (probeRes.error) {
        if (isMissingTableError(probeRes.error)) {
          setEnabled(false);
          setPosts([]);
          setLikes([]);
          setAudiobooks([]);
          return;
        }
        throw probeRes.error;
      }

      const postsPromise = fetchPostsPage({ reset: true });
      const [likesRes, audioRes] = await Promise.all([
        supabase.from('comunidade_curtidas').select('post_id, usuario_id'),
        supabase.from('audiobooks_biblioteca').select('id, titulo, autor').order('titulo'),
      ]);

      const maybeError = [likesRes.error].find(Boolean);
      if (maybeError) throw maybeError;
      if (audioRes.error && !isMissingTableError(audioRes.error)) throw audioRes.error;

      const postsData = (await postsPromise) || [];
      setLikes(likesRes.data || []);
      setAudiobooks(audioRes.error ? [] : audioRes.data || []);

      const quizPostIds = postsData
        .filter((post) => Boolean(extractQuizFromConteudo(post?.conteudo)))
        .map((post) => post.id);
      await loadQuizRankingForPosts(quizPostIds);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro na comunidade',
        description: error?.message || 'Não foi possível carregar a comunidade.',
      });
    } finally {
      setLoading(false);
    }
  }, [enabled, fetchPostsPage, loadQuizRankingForPosts, toast, user]);

  const handleRealtimeStatus = useCallback(
    (status) => {
      if (status !== 'CHANNEL_ERROR') return;
    },
    [],
  );


  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const quizPostIds = posts
      .filter((post) => Boolean(extractQuizFromConteudo(post?.conteudo)))
      .map((post) => post.id);
    loadQuizRankingForPosts(quizPostIds);
  }, [loadQuizRankingForPosts, posts, quizRankingEscopo, quizRankingPeriodo]);

  const onPostInsert = useCallback((payload) => {
    const nextPost = payload?.new;
    if (!nextPost?.id) return;

    setPosts((prev) => {
      const list = ensureArray(prev);
      const exists = list.some((item) => item.id === nextPost.id);
      if (exists) return list;
      return [nextPost, ...list];
    });
    setAriaLiveMessage('Novo post adicionado na comunidade.');
  }, []);

  const onPostUpdate = useCallback((payload) => {
    const nextPost = payload?.new;
    if (!nextPost?.id) return;

    setPosts((prev) =>
      ensureArray(prev).map((item) => (item.id === nextPost.id ? { ...item, ...nextPost } : item)),
    );
  }, []);

  const onPostDelete = useCallback((payload) => {
    const removedPost = payload?.old;
    if (!removedPost?.id) return;

    setPosts((prev) => ensureArray(prev).filter((item) => item.id !== removedPost.id));
    setLikes((prev) => ensureArray(prev).filter((item) => item.post_id !== removedPost.id));
  }, []);

  const onLikeInsert = useCallback((payload) => {
    const nextLike = payload?.new;
    if (!nextLike?.post_id || !nextLike?.usuario_id) return;

    setLikes((prev) => {
      const list = ensureArray(prev);
      const exists = list.some((item) => item.post_id === nextLike.post_id && item.usuario_id === nextLike.usuario_id);
      if (exists) return list;
      return [...list, { post_id: nextLike.post_id, usuario_id: nextLike.usuario_id }];
    });
  }, []);

  const onLikeDelete = useCallback((payload) => {
    const removedLike = payload?.old;
    if (!removedLike?.post_id || !removedLike?.usuario_id) return;

    setLikes((prev) =>
      ensureArray(prev).filter(
        (item) => !(item.post_id === removedLike.post_id && item.usuario_id === removedLike.usuario_id),
      ),
    );
  }, []);

  const onQuizTentativaChange = useCallback(
    (payload) => {
      const postId = payload?.new?.post_id || payload?.old?.post_id;
      if (!postId) return;
      loadQuizRankingForPosts([postId]);
    },
    [loadQuizRankingForPosts],
  );

  useRealtimeSubscription({
    table: enabled ? 'comunidade_posts' : null,
    onInsert: onPostInsert,
    onUpdate: onPostUpdate,
    onDelete: onPostDelete,
    onStatus: handleRealtimeStatus,
  });
  useRealtimeSubscription({
    table: enabled ? 'comunidade_curtidas' : null,
    onInsert: onLikeInsert,
    onDelete: onLikeDelete,
    onStatus: handleRealtimeStatus,
  });
  useRealtimeSubscription({
    table: enabled ? 'comunidade_quiz_tentativas' : null,
    onInsert: onQuizTentativaChange,
    onUpdate: onQuizTentativaChange,
    onDelete: onQuizTentativaChange,
    onStatus: handleRealtimeStatus,
  });

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
    if (filtroTipo === 'todos') return ensureArray(posts);
    if (filtroTipo === 'ia') return ensureArray(posts).filter((post) => ensureArray(post?.tags).includes('ia'));
    if (filtroTipo === 'quiz')
      return ensureArray(posts).filter((post) => Boolean(extractQuizFromConteudo(post?.conteudo)));
    return ensureArray(posts).filter((post) => post?.tipo === filtroTipo);
  }, [filtroTipo, posts]);


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
    setPostAudiobookId('');
    setPostTitulo('');
    setPostConteudo('');
    setPostComIA(false);
    setImageDataUrls([]);
  };

  const handleCriarPost = async () => {
    if (!enabled || !alunoId || !escolaId) {
      toast({
        variant: 'destructive',
        title: 'Comunidade indisponível',
        description: 'Não foi possível publicar agora. Verifique se as tabelas/migrations estão atualizadas.',
      });
      return;
    }
    if (!postConteudo.trim() && imageDataUrls.length === 0 && !postAudiobookId) {
      toast({
        variant: 'destructive',
        title: 'Preencha o conteúdo',
        description: 'Adicione texto, imagem ou audiobook para publicar.',
      });
      return;
    }

    setSaving(true);
    try {
      const { data: novoPost, error } = await insertCommunityPostCompat({
        autor_id: alunoId,
        escola_id: escolaId,
        livro_id: postLivroId || null,
        audiobook_id: postAudiobookId || null,
        tipo: postTipo,
        titulo: postTitulo.trim() || null,
        conteudo: postConteudo.trim() || 'Compartilhamento de mídia criado na comunidade.',
        imagem_urls: imageDataUrls,
        tags: postComIA ? ['ia'] : [],
      });

      if (error) throw error;

      if (novoPost?.id) {
        setPosts((prev) => [novoPost, ...ensureArray(prev)]);
      }

      clearPostForm();
      setPostDialogOpen(false);
      toast({ title: 'Publicação criada!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: isMissingTableError(error)
          ? 'Comunidade indisponível: aplique a migration do banco.'
          : error?.message || 'Falha ao publicar.',
      });
    } finally {
      setSaving(false);
    }
  };

  const openShareDialog = (post) => {
    if (!post?.id) return;
    setSharePost(post);
    setShareTitulo(safeText(post?.titulo, 'Post da comunidade'));
    setShareImageDataUrl(ensureArray(post?.imagem_urls)[0] || '');
    setShareDialogOpen(true);
  };

  const handleSelectShareImage = async (files) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      setShareImageDataUrl(dataUrl);
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível processar a imagem.' });
    }
  };

  const handleCompartilharPost = async () => {
    if (!sharePost?.id) return;

    const titulo = shareTitulo.trim() || safeText(sharePost?.titulo, 'Post da comunidade');
    const conteudo = safeText(sharePost?.conteudo, '');
    const textoCompartilhamento = `${titulo}${conteudo ? ` - ${conteudo}` : ''}`;
    const imageUrl = shareImageDataUrl || ensureArray(sharePost?.imagem_urls)[0] || '';

    setSharing(true);
    try {
      if (navigator.share) {
        const payload = {
          title: titulo || 'Comunidade de leitura',
          text: textoCompartilhamento,
        };
        if (imageUrl && navigator.canShare) {
          const shareFile = dataUrlToFile(imageUrl, 'compartilhamento-comunidade.jpg');
          if (navigator.canShare({ files: [shareFile] })) {
            payload.files = [shareFile];
          }
        }
        await navigator.share(payload);
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(textoCompartilhamento);
        toast({ title: 'Conteúdo copiado', description: 'Texto copiado para compartilhar.' });
      } else {
        throw new Error('Compartilhamento indisponível neste dispositivo.');
      }
      setShareDialogOpen(false);
    } catch (error) {
      if (error?.name !== 'AbortError') {
        toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível compartilhar este conteúdo.' });
      }
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
    if (!quizData) return;
    const respostas = quizRespostasPorPost[postId] || {};
    const acertos = quizData.perguntas.reduce(
      (acc, pergunta, idx) => (Number(respostas[idx]) === Number(pergunta.correta) ? acc + 1 : acc),
      0,
    );
    setQuizResultadoPorPost((prev) => ({
      ...prev,
      [postId]: { acertos, total: quizData.perguntas.length },
    }));
    setAriaLiveMessage(`Quiz corrigido: ${acertos} de ${quizData.perguntas.length} acertos.`);

    if (!alunoId || !escolaId) return;
    try {
      const { error } = await supabase.from('comunidade_quiz_tentativas').insert({
        post_id: postId,
        aluno_id: alunoId,
        escola_id: escolaId,
        acertos,
        total: quizData.perguntas.length,
      });
      if (error) {
        if (isMissingTableError(error)) return;
        throw error;
      }
      loadQuizRankingForPosts([postId]);
      setQuizHistoricoByPost((prev) => {
        const current = prev[postId];
        if (!current || acertos > current.acertos) {
          return { ...prev, [postId]: { acertos, total: quizData.perguntas.length } };
        }
        return prev;
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao registrar quiz',
        description: error?.message || 'Não foi possível registrar sua tentativa.',
      });
    }
  };

  const resetarQuizPost = (postId) => {
    setQuizRespostasPorPost((prev) => {
      const next = { ...prev };
      delete next[postId];
      return next;
    });
    setQuizResultadoPorPost((prev) => {
      const next = { ...prev };
      delete next[postId];
      return next;
    });
    setAriaLiveMessage('Quiz reiniciado.');
  };

  const toggleLikePost = async (postId) => {
    if (!enabled || !alunoId) {
      toast({
        variant: 'destructive',
        title: 'Comunidade indisponível',
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
        const { error } = await supabase.from('comunidade_curtidas').delete().eq('post_id', postId).eq('usuario_id', alunoId);
        if (error) {
          setLikes((prev) => [...ensureArray(prev), { post_id: postId, usuario_id: alunoId }]);
          throw error;
        }
      } else {
        const hadLike = ensureArray(likes).some((item) => item.post_id === postId && item.usuario_id === alunoId);
        if (!hadLike) {
          setLikes((prev) => [...ensureArray(prev), { post_id: postId, usuario_id: alunoId }]);
        }

        const { error } = await supabase.from('comunidade_curtidas').insert({ post_id: postId, usuario_id: alunoId });
        if (error) {
          setLikes((prev) => ensureArray(prev).filter((item) => !(item.post_id === postId && item.usuario_id === alunoId)));
          throw error;
        }
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: isMissingTableError(error)
          ? 'Comunidade indisponível: aplique a migration do banco.'
          : error?.message || 'Falha ao curtir/descurtir.',
      });
    } finally {
      setLikingPostIds((prev) => {
        const next = new Set(prev);
        next.delete(postId);
        return next;
      });
    }
  };

  const podeGerenciarPost = useCallback(
    (post) => isGestor || isBibliotecaria || isSuperAdmin || post?.autor_id === alunoId,
    [alunoId, isBibliotecaria, isGestor, isSuperAdmin],
  );

  const podeEditarPost = useCallback((post) => post?.autor_id === alunoId, [alunoId]);

  const abrirEdicao = (post) => {
    if (!podeEditarPost(post)) return;
    setPostEmEdicao(post);
    setEditTitulo(safeText(post?.titulo, ''));
    setEditConteudo(safeText(post?.conteudo, ''));
    setEditDialogOpen(true);
  };

  const salvarEdicaoPost = async () => {
    if (!postEmEdicao?.id) return;

    const tituloLimpo = editTitulo.trim();
    const conteudoLimpo = editConteudo.trim();

    if (!conteudoLimpo) {
      toast({
        variant: 'destructive',
        title: 'Conteúdo obrigatório',
        description: 'Escreva algo antes de salvar.',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('comunidade_posts')
        .update({
          titulo: tituloLimpo || null,
          conteudo: conteudoLimpo,
        })
        .eq('id', postEmEdicao.id);

      if (error) throw error;

      setPosts((prev) =>
        ensureArray(prev).map((item) =>
          item.id === postEmEdicao.id ? { ...item, titulo: tituloLimpo || null, conteudo: conteudoLimpo } : item,
        ),
      );

      setEditDialogOpen(false);
      setPostEmEdicao(null);
      setEditTitulo('');
      setEditConteudo('');
      toast({ title: 'Post atualizado com sucesso.' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao editar',
        description: error?.message || 'Não foi possível editar o post.',
      });
    } finally {
      setSaving(false);
    }
  };

  const apagarPost = async (post) => {
    if (!podeGerenciarPost(post)) return;

    const ok = window.confirm('Deseja apagar este post da comunidade?');
    if (!ok) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('comunidade_posts').delete().eq('id', post.id);
      if (error) throw error;

      setPosts((prev) => ensureArray(prev).filter((item) => item.id !== post.id));
      setLikes((prev) => ensureArray(prev).filter((item) => item?.post_id !== post.id));

      toast({ title: 'Post apagado com sucesso.' });
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
            Compartilhe resenhas, dicas, sugestões e recomendações de audiobooks.
            {isGestao ? ' Você também pode moderar publicações da comunidade.' : ''}
          </p>
        </div>

        {!enabled && (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                Comunidade indisponível neste ambiente. Para habilitar, ative `VITE_ENABLE_OPTIONAL_STUDENT_FEATURES=true`,
                aplique a migration e recarregue.
              </p>
            </CardContent>
          </Card>
        )}

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
          <Button size="sm" variant={filtroTipo === 'sugestao' ? 'default' : 'outline'} onClick={() => setFiltroTipo('sugestao')}>
            Sugestões
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
                  const conteudoVisivel = quizData?.descricao || safeText(post?.conteudo, 'Conteúdo indisponível');
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
                          </div>
                          <p className="text-xs text-muted-foreground break-words">
                            {safeNestedName(post?.usuarios_biblioteca, 'Usuário')} • {safeText(post?.tipo, 'resenha')} • {formatDateBR(post?.created_at)}
                          </p>
                        </div>
                        <Badge variant="secondary" className="max-w-[38vw] sm:max-w-[220px] truncate shrink-0">
                          {safeText(post?.livros?.titulo, 'Geral')}
                        </Badge>
                      </div>

                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{conteudoVisivel}</p>

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
                            >
                              <option value="geral">Geral</option>
                              <option value="semana">Semana</option>
                              <option value="mes">Mês</option>
                            </select>
                            <select
                              value={quizRankingEscopo}
                              onChange={(e) => setQuizRankingEscopo(e.target.value)}
                              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
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
                                        {index + 1}. {safeNestedName(item?.usuarios_biblioteca, 'Aluno')} — {item.acertos}/{item.total}
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
                          <Button variant="ghost" size="sm" onClick={() => apagarPost(post)} disabled={!enabled || saving}>
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
              <MessageSquare className="w-4 h-4" /> Nova publicação
            </DialogTitle>
            <DialogDescription>Compartilhe uma resenha, dica ou sugestão com a comunidade.</DialogDescription>
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
                  <option value="sugestao">Sugestão</option>
                </select>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Livro da biblioteca (opcional)</Label>
                <select
                  value={postLivroId || 'none'}
                  onChange={(e) => setPostLivroId(e.target.value === 'none' ? '' : e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="none">Sem livro específico</option>
                  {livros.map((livro) => (
                    <option key={livro.id} value={livro.id}>
                      {livro.titulo}
                    </option>
                  ))}
                </select>
              </div>
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
              <Label>Título</Label>
              <Input value={postTitulo} onChange={(e) => setPostTitulo(e.target.value)} placeholder="Título da publicação" />
            </div>

            <div className="space-y-2">
              <Label>Conteúdo</Label>
              <Textarea
                rows={4}
                value={postConteudo}
                onChange={(e) => setPostConteudo(e.target.value)}
                placeholder="Escreva sua experiência de leitura..."
              />
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={postComIA}
                onChange={(e) => setPostComIA(e.target.checked)}
                className="h-4 w-4 rounded border border-input"
              />
              Conteúdo criado com IA
            </label>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <ImagePlus className="w-4 h-4" /> Imagens (até 4)
              </Label>
              <Input type="file" accept="image/*" multiple onChange={(e) => handleSelectImages(e.target.files)} />
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
              <Pencil className="w-4 h-4" /> Editar publicação
            </DialogTitle>
            <DialogDescription>Atualize o conteúdo do seu post.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input value={editTitulo} onChange={(e) => setEditTitulo(e.target.value)} placeholder="Título (opcional)" />
            </div>
            <div className="space-y-2">
              <Label>Conteúdo</Label>
              <Textarea
                rows={5}
                value={editConteudo}
                onChange={(e) => setEditConteudo(e.target.value)}
                placeholder="Atualize sua publicação..."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={salvarEdicaoPost} disabled={saving}>
                <Send className="w-4 h-4 mr-2" />
                {saving ? 'Salvando...' : 'Salvar alterações'}
              </Button>
            </div>
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
            <DialogDescription>Adicione um título e uma foto antes de compartilhar.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={shareTitulo}
                onChange={(e) => setShareTitulo(e.target.value)}
                placeholder="Digite o título do compartilhamento"
              />
            </div>

            <div className="space-y-2">
              <Label>Foto (opcional)</Label>
              <Input type="file" accept="image/*" onChange={(e) => handleSelectShareImage(e.target.files)} />
              {shareImageDataUrl && (
                <div className="relative w-fit">
                  <img
                    src={shareImageDataUrl}
                    alt="Prévia da foto do compartilhamento"
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

      <Dialog open={Boolean(selectedImageUrl)} onOpenChange={(open) => !open && setSelectedImageUrl('')}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Visualização da imagem</DialogTitle>
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
