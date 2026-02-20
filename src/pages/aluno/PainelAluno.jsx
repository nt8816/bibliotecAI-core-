import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  BellRing,
  BookMarked,
  BookOpen,
  CheckCircle2,
  Clock,
  Headphones,
  Heart,
  ImagePlus,
  PlayCircle,
  PlusCircle,
  Search,
  Send,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

const ENABLE_OPTIONAL_STUDENT_FEATURES = import.meta.env.VITE_ENABLE_OPTIONAL_STUDENT_FEATURES !== 'false';

function formatDateBR(dateValue) {
  if (!dateValue) return '-';
  try {
    return format(new Date(dateValue), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return '-';
  }
}

function renderStars(nota, onClick) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onClick?.(n)}
          className={onClick ? 'cursor-pointer' : 'cursor-default'}
          type="button"
        >
          <Star className={`w-4 h-4 ${n <= nota ? 'fill-warning text-warning' : 'text-muted-foreground'}`} />
        </button>
      ))}
    </div>
  );
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeText(value, fallback = '-') {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
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

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function createAiImageDataUrl(prompt) {
  const normalized = safeText(prompt, 'Criacao IA').slice(0, 60);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#0ea5e9" />
        <stop offset="50%" stop-color="#2563eb" />
        <stop offset="100%" stop-color="#22c55e" />
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#g)" />
    <circle cx="1050" cy="120" r="180" fill="rgba(255,255,255,0.14)" />
    <circle cx="180" cy="640" r="220" fill="rgba(255,255,255,0.12)" />
    <text x="80" y="340" font-size="54" font-family="Arial, sans-serif" fill="white">Imagem IA</text>
    <text x="80" y="420" font-size="34" font-family="Arial, sans-serif" fill="white">${normalized.replace(/[<&>"]/g, '')}</text>
  </svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function PainelAluno() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [alunoId, setAlunoId] = useState(null);
  const [loading, setLoading] = useState(true);

  const [livros, setLivros] = useState([]);
  const [emprestimos, setEmprestimos] = useState([]);
  const [avaliacoes, setAvaliacoes] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [sugestoes, setSugestoes] = useState([]);
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [atividades, setAtividades] = useState([]);
  const [entregas, setEntregas] = useState([]);
  const [audiobookCatalogo, setAudiobookCatalogo] = useState([]);
  const [meusAudiobooks, setMeusAudiobooks] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [speaking, setSpeaking] = useState(false);

  const [reviewDialog, setReviewDialog] = useState(false);
  const [reviewLivro, setReviewLivro] = useState(null);
  const [reviewNota, setReviewNota] = useState(5);
  const [reviewTexto, setReviewTexto] = useState('');

  const [requestDialog, setRequestDialog] = useState(false);
  const [requestLivro, setRequestLivro] = useState(null);
  const [requestMsg, setRequestMsg] = useState('');

  const [audiobookForm, setAudiobookForm] = useState({
    livro_id: '',
    titulo: '',
    autor: '',
    duracao_minutos: '',
  });
  const [audiobookFileDataUrl, setAudiobookFileDataUrl] = useState('');
  const [audiobookFileNome, setAudiobookFileNome] = useState('');

  const [studioTitulo, setStudioTitulo] = useState('');
  const [studioDescricao, setStudioDescricao] = useState('');
  const [studioPrompt, setStudioPrompt] = useState('');
  const [studioAudiobookId, setStudioAudiobookId] = useState('');
  const [studioSlides, setStudioSlides] = useState([]);
  const [studioAudioFundoUrl, setStudioAudioFundoUrl] = useState('');
  const [studioPreviewIndex, setStudioPreviewIndex] = useState(0);
  const [quizLivroId, setQuizLivroId] = useState('');
  const [quizTema, setQuizTema] = useState('');
  const [quiz, setQuiz] = useState([]);
  const [quizRespostas, setQuizRespostas] = useState({});
  const [quizResultado, setQuizResultado] = useState(null);

  const [atividadeTexto, setAtividadeTexto] = useState({});
  const [saving, setSaving] = useState(false);
  const [optionalFeaturesEnabled, setOptionalFeaturesEnabled] = useState(ENABLE_OPTIONAL_STUDENT_FEATURES);
  const warnedMissingFeaturesRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!user) return;

    setLoading(true);
    try {
      const { data: perfil, error: perfilError } = await supabase
        .from('usuarios_biblioteca')
        .select('id')
        .eq('user_id', user.id)
        .single();

      if (perfilError || !perfil) throw perfilError || new Error('Perfil do aluno não encontrado.');
      setAlunoId(perfil.id);

      const [
        livrosRes,
        emprestimosRes,
        avaliacoesRes,
        wishlistRes,
        sugestoesRes,
        solicitacoesRes,
        atividadesRes,
      ] = await Promise.all([
        supabase.from('livros').select('*').order('titulo'),
        supabase
          .from('emprestimos')
          .select('*, livros(titulo, autor)')
          .eq('usuario_id', perfil.id)
          .order('data_emprestimo', { ascending: false }),
        supabase
          .from('avaliacoes_livros')
          .select('*, livros(titulo, autor)')
          .eq('usuario_id', perfil.id)
          .order('created_at', { ascending: false }),
        supabase.from('lista_desejos').select('livro_id').eq('usuario_id', perfil.id),
        supabase
          .from('sugestoes_livros')
          .select('*, livros(titulo, autor)')
          .eq('aluno_id', perfil.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('solicitacoes_emprestimo')
          .select('*, livros(titulo, autor)')
          .eq('usuario_id', perfil.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('atividades_leitura')
          .select('*, livros(titulo, autor)')
          .eq('aluno_id', perfil.id)
          .order('created_at', { ascending: false }),
      ]);

      const optionalQuery = async (queryBuilder, fallback = []) => {
        const { data, error } = await queryBuilder;
        if (error) {
          if (isMissingTableError(error)) return { data: fallback, missing: true };
          throw error;
        }
        return { data: data || fallback, missing: false };
      };
      let entregasOpt = { data: [], missing: false };
      let audioCatalogoOpt = { data: [], missing: false };
      let meusAudiobooksOpt = { data: [], missing: false };

      if (optionalFeaturesEnabled) {
        // Probe only one new table first to avoid multiple 404 calls when migration is missing.
        entregasOpt = await optionalQuery(
          supabase.from('atividades_entregas').select('*').eq('aluno_id', perfil.id).order('updated_at', { ascending: false }),
        );

        if (!entregasOpt.missing) {
          [audioCatalogoOpt, meusAudiobooksOpt] = await Promise.all([
            optionalQuery(
              supabase
                .from('audiobooks_biblioteca')
                .select('*, livros(titulo, autor)')
                .order('created_at', { ascending: false }),
            ),
            optionalQuery(
              supabase
                .from('aluno_audiobooks')
                .select('*, audiobooks_biblioteca(*, livros(titulo, autor))')
                .eq('aluno_id', perfil.id)
                .order('created_at', { ascending: false }),
            ),
          ]);
        }
      }

      const missingAnyNewTable =
        entregasOpt.missing || audioCatalogoOpt.missing || meusAudiobooksOpt.missing;

      if (missingAnyNewTable && !warnedMissingFeaturesRef.current) {
        warnedMissingFeaturesRef.current = true;
        setOptionalFeaturesEnabled(false);
      }

      const maybeError = [
        livrosRes.error,
        emprestimosRes.error,
        avaliacoesRes.error,
        wishlistRes.error,
        sugestoesRes.error,
        solicitacoesRes.error,
        atividadesRes.error,
      ].find(Boolean);

      if (maybeError) throw maybeError;

      setLivros(livrosRes.data || []);
      setEmprestimos(emprestimosRes.data || []);
      setAvaliacoes(avaliacoesRes.data || []);
      setWishlist((wishlistRes.data || []).map((item) => item.livro_id));
      setSugestoes(sugestoesRes.data || []);
      setSolicitacoes(solicitacoesRes.data || []);
      setAtividades(atividadesRes.data || []);
      setEntregas(entregasOpt.data);
      setAudiobookCatalogo(audioCatalogoOpt.data);
      setMeusAudiobooks(meusAudiobooksOpt.data);

      const entregaInicial = {};
      entregasOpt.data.forEach((entrega) => {
        entregaInicial[entrega.atividade_id] = entrega.texto_entrega;
      });
      setAtividadeTexto(entregaInicial);
    } catch (error) {
      const description = isMissingTableError(error)
        ? 'Tabelas novas não encontradas. Aplique a migration mais recente do Supabase.'
        : error?.message || 'Não foi possível carregar seus dados.';
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar painel',
        description,
      });
    } finally {
      setLoading(false);
    }
  }, [optionalFeaturesEnabled, toast, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (studioSlides.length < 2) return;
    const timer = setInterval(() => {
      setStudioPreviewIndex((prev) => (prev + 1) % studioSlides.length);
    }, 2200);
    return () => clearInterval(timer);
  }, [studioSlides]);

  const onRealtimeChange = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useRealtimeSubscription({ table: 'emprestimos', onChange: onRealtimeChange });
  useRealtimeSubscription({ table: 'avaliacoes_livros', onChange: onRealtimeChange });
  useRealtimeSubscription({ table: 'lista_desejos', onChange: onRealtimeChange });
  useRealtimeSubscription({ table: 'sugestoes_livros', onChange: onRealtimeChange });
  useRealtimeSubscription({ table: 'solicitacoes_emprestimo', onChange: onRealtimeChange });
  useRealtimeSubscription({ table: 'atividades_leitura', onChange: onRealtimeChange });
  useRealtimeSubscription({ table: optionalFeaturesEnabled ? 'atividades_entregas' : null, onChange: onRealtimeChange });
  useRealtimeSubscription({ table: optionalFeaturesEnabled ? 'audiobooks_biblioteca' : null, onChange: onRealtimeChange });
  useRealtimeSubscription({ table: optionalFeaturesEnabled ? 'aluno_audiobooks' : null, onChange: onRealtimeChange });

  const atividadesComEntrega = useMemo(() => {
    const entregaByAtividade = new Map(entregas.map((e) => [e.atividade_id, e]));
    return atividades.map((atividade) => ({
      ...atividade,
      entrega: entregaByAtividade.get(atividade.id) || null,
    }));
  }, [atividades, entregas]);

  const livrosLidos = useMemo(() => {
    const devolvidos = emprestimos
      .filter((e) => e.status === 'devolvido')
      .map((e) => e.livro_id)
      .filter(Boolean);
    return new Set(devolvidos).size;
  }, [emprestimos]);

  const pontosGanhos = useMemo(
    () => entregas.filter((e) => e.status === 'aprovada').reduce((acc, e) => acc + Number(e.pontos_ganhos || 0), 0),
    [entregas],
  );

  const atividadesPendentes = useMemo(
    () => atividadesComEntrega.filter((a) => !a.entrega || a.entrega.status !== 'aprovada').length,
    [atividadesComEntrega],
  );

  const atrasos = useMemo(
    () =>
      emprestimos.filter(
        (e) => e.status === 'ativo' && e.data_devolucao_prevista && new Date(e.data_devolucao_prevista) < new Date(),
      ),
    [emprestimos],
  );

  const novidades = useMemo(() => {
    return [...livros]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 8);
  }, [livros]);

  const notificacoes = useMemo(() => {
    const itens = [];

    atrasos.forEach((emp) => {
      itens.push({
        id: `atraso-${emp.id}`,
        tipo: 'atraso',
        titulo: 'Livro com devolução em atraso',
        descricao: `${emp.livros?.titulo || 'Livro'} deveria ter sido devolvido em ${formatDateBR(emp.data_devolucao_prevista)}.`,
      });
    });

    atividadesComEntrega
      .filter((a) => a.data_entrega && (!a.entrega || a.entrega.status !== 'aprovada'))
      .sort((a, b) => new Date(a.data_entrega).getTime() - new Date(b.data_entrega).getTime())
      .slice(0, 3)
      .forEach((a) => {
        itens.push({
          id: `atividade-${a.id}`,
          tipo: 'atividade',
          titulo: 'Atividade para entregar',
          descricao: `${a.titulo} - prazo ${formatDateBR(a.data_entrega)}.`,
        });
      });

    novidades.slice(0, 3).forEach((livro) => {
      itens.push({
        id: `novidade-${livro.id}`,
        tipo: 'novidade',
        titulo: 'Novidade no catálogo',
        descricao: `${livro.titulo} - ${livro.autor}.`,
      });
    });

    return itens.slice(0, 8);
  }, [atrasos, atividadesComEntrega, novidades]);

  const filteredLivros = useMemo(
    () =>
      livros.filter((livro) => {
        const t = searchTerm.toLowerCase();
        return (
          livro.titulo?.toLowerCase().includes(t) ||
          livro.autor?.toLowerCase().includes(t) ||
          livro.area?.toLowerCase().includes(t)
        );
      }),
    [livros, searchTerm],
  );

  const speakText = (text) => {
    if (speaking) {
      speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text || '');
    utterance.lang = 'pt-BR';
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    setSpeaking(true);
    speechSynthesis.speak(utterance);
  };

  const toggleWishlist = async (livroId) => {
    if (!alunoId) return;

    try {
      if (wishlist.includes(livroId)) {
        const { error } = await supabase
          .from('lista_desejos')
          .delete()
          .eq('livro_id', livroId)
          .eq('usuario_id', alunoId);

        if (error) throw error;
        setWishlist((prev) => prev.filter((id) => id !== livroId));
      } else {
        const { error } = await supabase.from('lista_desejos').insert({ livro_id: livroId, usuario_id: alunoId });
        if (error) throw error;
        setWishlist((prev) => [...prev, livroId]);
      }
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao atualizar desejos.' });
    }
  };

  const handleSaveReview = async () => {
    if (!alunoId || !reviewLivro) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('avaliacoes_livros')
        .upsert(
          {
            livro_id: reviewLivro.id,
            usuario_id: alunoId,
            nota: reviewNota,
            resenha: reviewTexto || null,
          },
          { onConflict: 'livro_id,usuario_id' },
        );

      if (error) throw error;

      toast({ title: 'Avaliação salva!' });
      setReviewDialog(false);
      setReviewLivro(null);
      setReviewTexto('');
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível salvar.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRequestLoan = async () => {
    if (!alunoId || !requestLivro) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('solicitacoes_emprestimo').insert({
        livro_id: requestLivro.id,
        usuario_id: alunoId,
        mensagem: requestMsg || null,
      });
      if (error) throw error;

      toast({ title: 'Solicitação enviada!' });
      setRequestDialog(false);
      setRequestLivro(null);
      setRequestMsg('');
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao solicitar empréstimo.' });
    } finally {
      setSaving(false);
    }
  };

  const handleEnviarAtividade = async (atividade) => {
    if (!alunoId) return;
    if (!optionalFeaturesEnabled) return;

    const texto = (atividadeTexto[atividade.id] || '').trim();
    if (!texto) {
      toast({ variant: 'destructive', title: 'Informe sua resposta', description: 'Escreva o conteúdo da entrega.' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        atividade_id: atividade.id,
        aluno_id: alunoId,
        texto_entrega: texto,
        status: 'enviada',
        enviado_em: new Date().toISOString(),
      };

      const { error } = await supabase.from('atividades_entregas').upsert(payload, { onConflict: 'atividade_id,aluno_id' });
      if (error) throw error;

      toast({ title: 'Entrega enviada', description: 'Seu professor já pode avaliar e liberar pontos.' });
      await fetchData();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: isMissingTableError(error)
          ? 'Entrega de atividade indisponível: aplique a migration do banco.'
          : error?.message || 'Falha ao enviar atividade.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCriarAudiobook = async () => {
    if (!alunoId) return;
    if (!optionalFeaturesEnabled) return;

    const livro = livros.find((item) => item.id === audiobookForm.livro_id);
    if (!livro || !audiobookFileDataUrl) {
      toast({
        variant: 'destructive',
        title: 'Dados incompletos',
        description: 'Selecione um livro e envie um arquivo de áudio (até 50MB).',
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        livro_id: livro.id,
        titulo: audiobookForm.titulo.trim() || livro.titulo,
        autor: audiobookForm.autor.trim() || livro.autor,
        duracao_minutos: audiobookForm.duracao_minutos ? Number(audiobookForm.duracao_minutos) : null,
        audio_url: audiobookFileDataUrl,
        criado_por: alunoId,
      };

      const { error } = await supabase.from('audiobooks_biblioteca').insert(payload);
      if (error) throw error;

      toast({ title: 'Audiobook adicionado ao catálogo!' });
      setAudiobookForm({ livro_id: '', titulo: '', autor: '', duracao_minutos: '' });
      setAudiobookFileDataUrl('');
      setAudiobookFileNome('');
      await fetchData();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: isMissingTableError(error)
          ? 'Audiobooks indisponíveis: aplique a migration do banco.'
          : error?.message || 'Falha ao criar audiobook.',
      });
    } finally {
      setSaving(false);
    }
  };

  const toggleMeuAudiobook = async (audiobookId) => {
    if (!alunoId) return;
    if (!optionalFeaturesEnabled) return;

    const existente = meusAudiobooks.find((item) => item.audiobook_id === audiobookId);

    try {
      if (existente) {
        const { error } = await supabase.from('aluno_audiobooks').delete().eq('id', existente.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('aluno_audiobooks')
          .insert({ aluno_id: alunoId, audiobook_id: audiobookId, progresso_segundos: 0 });
        if (error) throw error;
      }
      await fetchData();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: isMissingTableError(error)
          ? 'Audiobooks indisponíveis: aplique a migration do banco.'
          : error?.message || 'Falha ao atualizar seus audiobooks.',
      });
    }
  };

  const handleSelectAudiobookFile = async (files) => {
    const file = files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Arquivo muito grande',
        description: 'O limite para audiobook é 50MB.',
      });
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setAudiobookFileDataUrl(dataUrl);
      setAudiobookFileNome(file.name);
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível ler o arquivo.' });
    }
  };

  const handleAdicionarSlides = async (files) => {
    const selecionados = Array.from(files || []).slice(0, Math.max(0, 8 - studioSlides.length));
    if (selecionados.length === 0) return;

    try {
      const imagens = await Promise.all(
        selecionados.map(async (file) => ({
          id: crypto.randomUUID(),
          url: await fileToDataUrl(file),
          origem: 'upload',
          legenda: file.name,
        })),
      );
      setStudioSlides((prev) => [...prev, ...imagens].slice(0, 8));
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha ao processar imagens.' });
    }
  };

  const handleGerarImagemIA = () => {
    if (!studioPrompt.trim()) {
      toast({ variant: 'destructive', title: 'Informe o prompt', description: 'Descreva a imagem para gerar com IA.' });
      return;
    }
    if (studioSlides.length >= 8) {
      toast({ variant: 'destructive', title: 'Limite atingido', description: 'Use no máximo 8 imagens por animação.' });
      return;
    }

    setStudioSlides((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        url: createAiImageDataUrl(studioPrompt),
        origem: 'ia',
        legenda: studioPrompt.trim().slice(0, 80),
      },
    ]);
  };

  const handleAudioFundo = async (files) => {
    const file = files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Arquivo muito grande', description: 'O áudio de fundo aceita até 50MB.' });
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setStudioAudioFundoUrl(dataUrl);
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível ler o áudio de fundo.' });
    }
  };

  const handlePublicarStudio = async () => {
    if (!optionalFeaturesEnabled || !alunoId) return;
    if (studioSlides.length === 0) {
      toast({ variant: 'destructive', title: 'Sem imagens', description: 'Adicione pelo menos uma imagem para compartilhar.' });
      return;
    }

    setSaving(true);
    try {
      const tags = [];
      if (studioSlides.some((slide) => slide.origem === 'ia')) tags.push('ia');
      if (studioAudioFundoUrl) tags.push('audio-fundo');

      const { error } = await supabase.from('comunidade_posts').insert({
        autor_id: alunoId,
        livro_id: null,
        audiobook_id: studioAudiobookId || null,
        tipo: 'dica',
        titulo: studioTitulo.trim() || 'Projeto criativo do aluno',
        conteudo:
          studioDescricao.trim() ||
          'Criação de mídia com imagens em sequência e áudio de fundo feita no estúdio do aluno.',
        imagem_urls: studioSlides.map((slide) => slide.url),
        tags,
      });
      if (error) throw error;

      toast({ title: 'Projeto compartilhado na comunidade!' });
      setStudioTitulo('');
      setStudioDescricao('');
      setStudioPrompt('');
      setStudioAudiobookId('');
      setStudioSlides([]);
      setStudioAudioFundoUrl('');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error?.message || 'Não foi possível compartilhar o projeto criativo.',
      });
    } finally {
      setSaving(false);
    }
  };

  const gerarQuizComIA = () => {
    const livro = livros.find((item) => item.id === quizLivroId);
    if (!livro) {
      toast({ variant: 'destructive', title: 'Selecione um livro', description: 'Escolha um livro para gerar o quiz.' });
      return;
    }
    const tema = quizTema.trim() || 'compreensão da leitura';
    const perguntas = [
      {
        enunciado: `Qual é o foco principal do tema "${tema}" no livro "${livro.titulo}"?`,
        opcoes: ['Personagens e conflitos', 'Resumo sem contexto', 'Apenas a capa', 'Dados aleatórios'],
        correta: 0,
      },
      {
        enunciado: `Qual estratégia melhora o aprendizado após ler "${livro.titulo}"?`,
        opcoes: ['Criar resumo e discutir', 'Não revisar nada', 'Ignorar personagens', 'Pular capítulos'],
        correta: 0,
      },
      {
        enunciado: `Qual atitude demonstra leitura crítica sobre "${livro.titulo}"?`,
        opcoes: ['Relacionar com a vida real', 'Memorizar sem entender', 'Copiar respostas', 'Ler só o título'],
        correta: 0,
      },
    ];
    setQuiz(perguntas);
    setQuizRespostas({});
    setQuizResultado(null);
  };

  const corrigirQuiz = () => {
    if (quiz.length === 0) return;
    const acertos = quiz.reduce((acc, pergunta, index) => (Number(quizRespostas[index]) === pergunta.correta ? acc + 1 : acc), 0);
    setQuizResultado({ acertos, total: quiz.length });
  };

  if (loading) {
    return (
      <MainLayout title="Meu Painel">
        <p className="text-center text-muted-foreground py-8">Carregando...</p>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Meu Painel">
      <div className="space-y-4 sm:space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Livros já lidos</p>
                  <p className="text-xl font-bold">{livrosLidos}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Trophy className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pontos conquistados</p>
                  <p className="text-xl font-bold">{pontosGanhos}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-info" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Atividades pendentes</p>
                  <p className="text-xl font-bold">{atividadesPendentes}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center">
                  <BellRing className="w-5 h-5 text-destructive" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Notificações</p>
                  <p className="text-xl font-bold">{notificacoes.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <BellRing className="w-4 h-4" />
              Avisos importantes
            </CardTitle>
          </CardHeader>
          <CardContent>
            {notificacoes.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem alertas no momento.</p>
            ) : (
              <div className="space-y-2">
                {notificacoes.map((n) => (
                  <div key={n.id} className="p-3 border rounded-lg flex items-start gap-3">
                    {n.tipo === 'atraso' ? (
                      <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
                    ) : n.tipo === 'atividade' ? (
                      <Clock className="w-4 h-4 text-warning mt-0.5" />
                    ) : (
                      <Sparkles className="w-4 h-4 text-primary mt-0.5" />
                    )}
                    <div>
                      <p className="text-sm font-medium">{n.titulo}</p>
                      <p className="text-xs text-muted-foreground">{n.descricao}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Tabs defaultValue="atividades">
          <TabsList className="w-full overflow-x-auto whitespace-nowrap justify-start gap-1 sm:gap-2">
            <TabsTrigger value="atividades" className="gap-1 shrink-0">
              <CheckCircle2 className="w-4 h-4" /> Atividades e Pontos
            </TabsTrigger>
            <TabsTrigger value="audiobooks" className="gap-1 shrink-0">
              <Headphones className="w-4 h-4" /> Audiobooks
            </TabsTrigger>
            <TabsTrigger value="criacao" className="gap-1 shrink-0">
              <ImagePlus className="w-4 h-4" /> Criação IA
            </TabsTrigger>
            <TabsTrigger value="jogos" className="gap-1 shrink-0">
              <Trophy className="w-4 h-4" /> Jogos
            </TabsTrigger>
            <TabsTrigger value="catalogo" className="gap-1 shrink-0">
              <BookOpen className="w-4 h-4" /> Catálogo
            </TabsTrigger>
            <TabsTrigger value="desejos" className="gap-1 shrink-0">
              <Heart className="w-4 h-4" /> Desejos ({wishlist.length})
            </TabsTrigger>
            <TabsTrigger value="avaliacoes" className="gap-1 shrink-0">
              <Star className="w-4 h-4" /> Avaliações
            </TabsTrigger>
            <TabsTrigger value="sugestoes" className="gap-1 shrink-0">
              <Sparkles className="w-4 h-4" /> Sugestões
            </TabsTrigger>
            <TabsTrigger value="solicitacoes" className="gap-1 shrink-0">
              <BookMarked className="w-4 h-4" /> Solicitações ({solicitacoes.filter((s) => s.status === 'pendente').length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="atividades">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Atividades enviadas pelo professor</CardTitle>
              </CardHeader>
              <CardContent>
                {atividadesComEntrega.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhuma atividade recebida.</p>
                ) : (
                  <div className="space-y-4">
                    {atividadesComEntrega.map((atividade) => (
                      <div key={atividade.id} className="p-4 border rounded-lg space-y-3">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                          <div>
                            <p className="font-semibold">{atividade.titulo}</p>
                            <p className="text-xs text-muted-foreground">{atividade.livros?.titulo || 'Livro não informado'}</p>
                            {atividade.descricao && <p className="text-sm mt-1">{atividade.descricao}</p>}
                          </div>
                          <div className="text-right">
                            <Badge variant="outline">Pontos possíveis: {Number(atividade.pontos_extras || 0)}</Badge>
                            <p className="text-xs text-muted-foreground mt-1">
                              Entrega: {formatDateBR(atividade.data_entrega)}
                            </p>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <Label>Minha entrega</Label>
                          <Textarea
                            rows={3}
                            placeholder="Escreva sua resposta, resumo ou reflexão..."
                            value={atividadeTexto[atividade.id] ?? atividade.entrega?.texto_entrega ?? ''}
                            onChange={(e) =>
                              setAtividadeTexto((prev) => ({
                                ...prev,
                                [atividade.id]: e.target.value,
                              }))
                            }
                          />
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2 text-sm">
                            {atividade.entrega ? (
                              <>
                                <Badge
                                  variant={
                                    atividade.entrega.status === 'aprovada'
                                      ? 'default'
                                      : atividade.entrega.status === 'revisar'
                                        ? 'destructive'
                                        : 'secondary'
                                  }
                                >
                                  {atividade.entrega.status}
                                </Badge>
                                <span className="text-muted-foreground">
                                  Pontos recebidos: {Number(atividade.entrega.pontos_ganhos || 0)}
                                </span>
                              </>
                            ) : (
                              <Badge variant="outline">Ainda não enviado</Badge>
                            )}
                          </div>

                          <Button onClick={() => handleEnviarAtividade(atividade)} disabled={saving}>
                            <Send className="w-4 h-4 mr-2" />
                            {atividade.entrega ? 'Atualizar entrega' : 'Enviar atividade'}
                          </Button>
                        </div>

                        {atividade.entrega?.feedback_professor && (
                          <div className="p-3 bg-muted rounded-md">
                            <p className="text-xs text-muted-foreground">Feedback do professor</p>
                            <p className="text-sm">{atividade.entrega.feedback_professor}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="audiobooks" className="space-y-4">
            {!optionalFeaturesEnabled && (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">
                    Audiobooks indisponíveis neste ambiente. Para habilitar, ative `VITE_ENABLE_OPTIONAL_STUDENT_FEATURES=true`
                    e aplique a migration no Supabase.
                  </p>
                </CardContent>
              </Card>
            )}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Adicionar audiobook da biblioteca</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Livro</Label>
                    <select
                      value={audiobookForm.livro_id || 'none'}
                      onChange={(e) => {
                        const v = e.target.value;
                        const livroId = v === 'none' ? '' : v;
                        const livro = livros.find((item) => item.id === livroId);
                        setAudiobookForm((prev) => ({
                          ...prev,
                          livro_id: livroId,
                          titulo: livro ? livro.titulo : prev.titulo,
                          autor: livro ? livro.autor : prev.autor,
                        }));
                      }}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="none">Selecione</option>
                      {livros
                        .filter((l) => l.disponivel)
                        .map((livro) => (
                          <option key={livro.id} value={livro.id}>
                            {livro.titulo}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <Label>Duração (min)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={audiobookForm.duracao_minutos}
                      onChange={(e) => setAudiobookForm((prev) => ({ ...prev, duracao_minutos: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Título do audiobook</Label>
                    <Input
                      value={audiobookForm.titulo}
                      onChange={(e) => setAudiobookForm((prev) => ({ ...prev, titulo: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Autor</Label>
                    <Input
                      value={audiobookForm.autor}
                      onChange={(e) => setAudiobookForm((prev) => ({ ...prev, autor: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Arquivo de áudio (até 50MB)</Label>
                  <Input type="file" accept="audio/*" onChange={(e) => handleSelectAudiobookFile(e.target.files)} />
                  {audiobookFileNome && <p className="text-xs text-muted-foreground">Arquivo selecionado: {audiobookFileNome}</p>}
                </div>

                <div className="flex justify-end">
                  <Button onClick={handleCriarAudiobook} disabled={saving || !optionalFeaturesEnabled}>
                    <PlusCircle className="w-4 h-4 mr-2" /> Adicionar ao catálogo
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Catálogo de audiobooks</CardTitle>
              </CardHeader>
              <CardContent>
                {audiobookCatalogo.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum audiobook cadastrado.</p>
                ) : (
                  <div className="space-y-3">
                    {audiobookCatalogo.map((audio) => {
                      const estaNaMinhaLista = meusAudiobooks.some((item) => item.audiobook_id === audio.id);
                      return (
                        <div key={audio.id} className="p-3 border rounded-lg flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                          <div>
                            <p className="font-medium">{audio.titulo}</p>
                            <p className="text-xs text-muted-foreground">
                              {audio.autor || audio.livros?.autor || '-'}
                              {audio.duracao_minutos ? ` • ${audio.duracao_minutos} min` : ''}
                            </p>
                            <p className="text-xs text-muted-foreground">Livro base: {audio.livros?.titulo || '-'}</p>
                          </div>

                          <div className="flex items-center gap-2 flex-wrap">
                            <div className="min-w-[220px]">
                              <audio controls src={audio.audio_url} className="h-9 w-full" preload="metadata" />
                            </div>
                            <Button
                              size="sm"
                              variant={estaNaMinhaLista ? 'secondary' : 'default'}
                              onClick={() => toggleMeuAudiobook(audio.id)}
                              disabled={!optionalFeaturesEnabled}
                            >
                              <Headphones className="w-4 h-4 mr-1" />
                              {estaNaMinhaLista ? 'Remover da minha lista' : 'Adicionar à minha lista'}
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Minha lista de audiobooks</CardTitle>
              </CardHeader>
              <CardContent>
                {meusAudiobooks.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Você ainda não adicionou audiobooks.</p>
                ) : (
                  <div className="space-y-3">
                    {meusAudiobooks.map((item) => (
                      <div key={item.id} className="p-3 border rounded-lg flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">{item.audiobooks_biblioteca?.titulo || 'Audiobook'}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.audiobooks_biblioteca?.autor || item.audiobooks_biblioteca?.livros?.autor || '-'}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => toggleMeuAudiobook(item.audiobook_id)} disabled={!optionalFeaturesEnabled}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="criacao" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Estúdio Criativo (imagens + IA + animação)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Título do projeto</Label>
                    <Input value={studioTitulo} onChange={(e) => setStudioTitulo(e.target.value)} placeholder="Ex.: Minha história visual" />
                  </div>
                  <div className="space-y-2">
                    <Label>Audiobook para anexar (opcional)</Label>
                    <select
                      value={studioAudiobookId || 'none'}
                      onChange={(e) => setStudioAudiobookId(e.target.value === 'none' ? '' : e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="none">Não anexar audiobook</option>
                      {audiobookCatalogo.map((audio) => (
                        <option key={audio.id} value={audio.id}>
                          {audio.titulo}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Descrição</Label>
                  <Textarea
                    rows={3}
                    value={studioDescricao}
                    onChange={(e) => setStudioDescricao(e.target.value)}
                    placeholder="Descreva seu projeto para compartilhar na comunidade."
                  />
                </div>

                <div className="grid md:grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Adicionar imagens do dispositivo</Label>
                    <Input type="file" accept="image/*" multiple onChange={(e) => handleAdicionarSlides(e.target.files)} />
                  </div>
                  <div className="space-y-2">
                    <Label>Gerar imagem com IA (integrada)</Label>
                    <div className="flex gap-2">
                      <Input value={studioPrompt} onChange={(e) => setStudioPrompt(e.target.value)} placeholder="Ex.: castelo encantado" />
                      <Button type="button" variant="outline" onClick={handleGerarImagemIA}>
                        <Sparkles className="w-4 h-4 mr-1" /> Gerar
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Áudio de fundo para animação (até 50MB)</Label>
                  <Input type="file" accept="audio/*" onChange={(e) => handleAudioFundo(e.target.files)} />
                  {studioAudioFundoUrl && <audio controls src={studioAudioFundoUrl} className="w-full h-10" preload="metadata" />}
                </div>

                <div className="space-y-2">
                  <Label>Prévia da animação básica</Label>
                  <div className="relative rounded-lg border bg-muted/20 overflow-hidden aspect-video">
                    {studioSlides.length === 0 ? (
                      <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                        Adicione imagens para iniciar a animação.
                      </div>
                    ) : (
                      <img
                        src={studioSlides[studioPreviewIndex % studioSlides.length]?.url}
                        alt="Prévia"
                        className="h-full w-full object-cover transition-all duration-700"
                      />
                    )}
                  </div>
                </div>

                {studioSlides.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {studioSlides.map((slide, index) => (
                      <div key={slide.id} className="relative">
                        <img src={slide.url} alt={`Slide ${index + 1}`} className="h-24 w-full object-cover rounded-md border" />
                        <Badge variant="secondary" className="absolute left-1 top-1 text-[10px]">
                          {slide.origem === 'ia' ? 'IA' : 'Upload'}
                        </Badge>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          className="absolute right-1 top-1 h-6 w-6 p-0"
                          onClick={() => setStudioSlides((prev) => prev.filter((item) => item.id !== slide.id))}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end">
                  <Button onClick={handlePublicarStudio} disabled={!optionalFeaturesEnabled || saving}>
                    <ImagePlus className="w-4 h-4 mr-2" /> Compartilhar na comunidade
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="jogos" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Criador de Jogos com IA (quiz de leitura)</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-3 gap-3">
                  <div className="space-y-2">
                    <Label>Livro</Label>
                    <select
                      value={quizLivroId || 'none'}
                      onChange={(e) => setQuizLivroId(e.target.value === 'none' ? '' : e.target.value)}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="none">Selecione</option>
                      {livros.map((livro) => (
                        <option key={livro.id} value={livro.id}>
                          {livro.titulo}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label>Tema do quiz</Label>
                    <div className="flex gap-2">
                      <Input
                        value={quizTema}
                        onChange={(e) => setQuizTema(e.target.value)}
                        placeholder="Ex.: personagens, mensagens do livro, interpretação"
                      />
                      <Button type="button" onClick={gerarQuizComIA}>
                        <Sparkles className="w-4 h-4 mr-1" /> Gerar
                      </Button>
                    </div>
                  </div>
                </div>

                {quiz.length > 0 && (
                  <div className="space-y-4">
                    {quiz.map((pergunta, index) => (
                      <div key={index} className="p-3 rounded-lg border space-y-2">
                        <p className="font-medium text-sm">
                          {index + 1}. {pergunta.enunciado}
                        </p>
                        <div className="grid gap-2">
                          {pergunta.opcoes.map((opcao, opcaoIndex) => (
                            <button
                              key={opcaoIndex}
                              type="button"
                              onClick={() => setQuizRespostas((prev) => ({ ...prev, [index]: opcaoIndex }))}
                              className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                                Number(quizRespostas[index]) === opcaoIndex ? 'border-primary bg-primary/10' : 'hover:bg-muted/50'
                              }`}
                            >
                              {opcao}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}

                    <div className="flex items-center gap-2">
                      <Button type="button" onClick={corrigirQuiz}>
                        Corrigir quiz
                      </Button>
                      {quizResultado && (
                        <Badge variant="secondary">
                          Resultado: {quizResultado.acertos}/{quizResultado.total}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Minigames rápidos</CardTitle>
              </CardHeader>
              <CardContent className="grid md:grid-cols-3 gap-3">
                <div className="rounded-lg border p-3">
                  <p className="font-medium">Desafio relâmpago</p>
                  <p className="text-sm text-muted-foreground">Responda 3 perguntas em 60 segundos para ganhar pontos.</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="font-medium">Verdadeiro ou falso</p>
                  <p className="text-sm text-muted-foreground">Afirmações sobre o livro para revisar compreensão.</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="font-medium">Sequência da história</p>
                  <p className="text-sm text-muted-foreground">Organize eventos na ordem correta e treine memória.</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="catalogo" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar livros..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredLivros.slice(0, 40).map((livro) => (
                <Card key={livro.id} className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{livro.titulo}</p>
                      <p className="text-sm text-muted-foreground">{livro.autor}</p>
                      <div className="flex gap-1 mt-1">
                        <Badge variant="outline" className="text-xs">
                          {livro.area || 'Geral'}
                        </Badge>
                        <Badge variant={livro.disponivel ? 'default' : 'secondary'} className="text-xs">
                          {livro.disponivel ? 'Disponível' : 'Emprestado'}
                        </Badge>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => toggleWishlist(livro.id)}>
                      <Heart className={`w-4 h-4 ${wishlist.includes(livro.id) ? 'fill-destructive text-destructive' : ''}`} />
                    </Button>
                  </div>

                  {livro.sinopse && (
                    <div className="mt-2">
                      <p className="text-xs text-muted-foreground line-clamp-2">{livro.sinopse}</p>
                      <Button size="sm" variant="ghost" className="h-6 px-1 text-xs mt-1" onClick={() => speakText(livro.sinopse || '')}>
                        {speaking ? <VolumeX className="w-3 h-3 mr-1" /> : <Volume2 className="w-3 h-3 mr-1" />}
                        {speaking ? 'Parar' : 'Ouvir sinopse'}
                      </Button>
                    </div>
                  )}

                  <div className="flex gap-1 mt-2">
                    {livro.disponivel && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs h-7"
                        onClick={() => {
                          setRequestLivro(livro);
                          setRequestDialog(true);
                        }}
                      >
                        <Send className="w-3 h-3 mr-1" /> Solicitar
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => {
                        setReviewLivro(livro);
                        setReviewNota(5);
                        setReviewTexto('');
                        setReviewDialog(true);
                      }}
                    >
                      <Star className="w-3 h-3 mr-1" /> Avaliar
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="desejos">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Minha lista de desejos</CardTitle>
              </CardHeader>
              <CardContent>
                {wishlist.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Sua lista está vazia.</p>
                ) : (
                  <div className="space-y-3">
                    {wishlist.map((livroId) => {
                      const livro = livros.find((l) => l.id === livroId);
                      if (!livro) return null;

                      return (
                        <div key={livroId} className="flex justify-between items-center p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{livro.titulo}</p>
                            <p className="text-xs text-muted-foreground">{livro.autor}</p>
                            <Badge variant={livro.disponivel ? 'default' : 'secondary'} className="mt-1 text-xs">
                              {livro.disponivel ? 'Disponível' : 'Emprestado'}
                            </Badge>
                          </div>
                          <div className="flex gap-1">
                            {livro.disponivel && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setRequestLivro(livro);
                                  setRequestDialog(true);
                                }}
                              >
                                <Send className="w-3 h-3 mr-1" /> Solicitar
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => toggleWishlist(livroId)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="avaliacoes">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Minhas avaliações</CardTitle>
              </CardHeader>
              <CardContent>
                {avaliacoes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Você ainda não avaliou nenhum livro.</p>
                ) : (
                  <div className="space-y-3">
                    {avaliacoes.map((a) => (
                      <div key={a.id} className="p-3 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">{a.livros?.titulo}</p>
                            <p className="text-xs text-muted-foreground">{a.livros?.autor}</p>
                          </div>
                          {renderStars(a.nota)}
                        </div>
                        {a.resenha && <p className="text-sm mt-2 text-muted-foreground">{a.resenha}</p>}
                        <p className="text-xs text-muted-foreground mt-1">{formatDateBR(a.created_at)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sugestoes">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sugestões dos professores</CardTitle>
              </CardHeader>
              <CardContent>
                {sugestoes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhuma sugestão recebida.</p>
                ) : (
                  <div className="space-y-3">
                    {sugestoes.map((s) => (
                      <div key={s.id} className="p-3 border rounded-lg">
                        <p className="font-medium">{s.livros?.titulo}</p>
                        <p className="text-xs text-muted-foreground">{s.livros?.autor}</p>
                        {s.mensagem && <p className="text-sm mt-1 text-muted-foreground italic">"{s.mensagem}"</p>}
                        <p className="text-xs text-muted-foreground mt-1">{formatDateBR(s.created_at)}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="solicitacoes">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Minhas solicitações de empréstimo</CardTitle>
              </CardHeader>
              <CardContent>
                {solicitacoes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Você ainda não fez solicitações.</p>
                ) : (
                  <div className="space-y-3">
                    {solicitacoes.map((solicitacao) => (
                      <div key={solicitacao.id} className="p-3 border rounded-lg space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">{solicitacao.livros?.titulo || 'Livro'}</p>
                            <p className="text-xs text-muted-foreground">{solicitacao.livros?.autor || '-'}</p>
                          </div>
                          <Badge
                            variant={
                              solicitacao.status === 'aprovada'
                                ? 'default'
                                : solicitacao.status === 'recusada'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                          >
                            {solicitacao.status}
                          </Badge>
                        </div>

                        <p className="text-xs text-muted-foreground">Solicitado em: {formatDateBR(solicitacao.created_at)}</p>

                        {solicitacao.mensagem && (
                          <div className="rounded-md border bg-muted/30 p-2">
                            <p className="text-xs text-muted-foreground">Sua mensagem</p>
                            <p className="text-sm">{solicitacao.mensagem}</p>
                          </div>
                        )}

                        {solicitacao.resposta && (
                          <div className="rounded-md border bg-primary/5 p-2">
                            <p className="text-xs text-muted-foreground">Resposta da biblioteca</p>
                            <p className="text-sm">{solicitacao.resposta}</p>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={reviewDialog} onOpenChange={setReviewDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Avaliar: {reviewLivro?.titulo}</DialogTitle>
            <DialogDescription>Dê uma nota e escreva sua resenha.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Nota</Label>
              {renderStars(reviewNota, setReviewNota)}
            </div>
            <div className="space-y-2">
              <Label>Resenha (opcional)</Label>
              <Textarea
                value={reviewTexto}
                onChange={(e) => setReviewTexto(e.target.value)}
                placeholder="O que você achou do livro?"
                rows={4}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReviewDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveReview} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={requestDialog} onOpenChange={setRequestDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Solicitar empréstimo</DialogTitle>
            <DialogDescription>Solicitar: {requestLivro?.titulo}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Mensagem (opcional)</Label>
              <Textarea
                value={requestMsg}
                onChange={(e) => setRequestMsg(e.target.value)}
                placeholder="Motivo ou observações..."
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRequestDialog(false)}>
              Cancelar
            </Button>
            <Button onClick={handleRequestLoan} disabled={saving}>
              {saving ? 'Enviando...' : 'Enviar solicitação'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
