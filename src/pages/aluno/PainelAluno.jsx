import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
  Medal,
  Flame,
  Gift,
  Crown,
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
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

const ENABLE_OPTIONAL_STUDENT_FEATURES = import.meta.env.VITE_ENABLE_OPTIONAL_STUDENT_FEATURES !== 'false';
const GEMINI_IMAGE_MODEL = import.meta.env.VITE_GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image-preview';
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';

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

function extractGeminiImageDataUrl(payload) {
  const candidates = ensureArray(payload?.candidates);

  for (const candidate of candidates) {
    const parts = ensureArray(candidate?.content?.parts);
    for (const part of parts) {
      const inlineData = part?.inlineData || part?.inline_data;
      const base64Data = inlineData?.data;
      if (!base64Data) continue;

      const mimeType = inlineData?.mimeType || inlineData?.mime_type || 'image/png';
      return `data:${mimeType};base64,${base64Data}`;
    }
  }

  return null;
}

async function generateImageWithGemini(prompt) {
  if (!GEMINI_API_KEY) {
    throw new Error('Configure VITE_GEMINI_API_KEY para usar a geracao de imagem com Gemini.');
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_IMAGE_MODEL)}:generateContent`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': GEMINI_API_KEY,
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['Image'],
        imageConfig: { aspectRatio: '16:9' },
      },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const apiMessage = payload?.error?.message || `Falha na API Gemini (HTTP ${response.status}).`;
    throw new Error(apiMessage);
  }

  const imageDataUrl = extractGeminiImageDataUrl(payload);
  if (!imageDataUrl) {
    throw new Error('A API Gemini nao retornou imagem para este prompt.');
  }

  return imageDataUrl;
}

export default function PainelAluno() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

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
  const [gerandoImagemIA, setGerandoImagemIA] = useState(false);
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
  const [showAccessChoice, setShowAccessChoice] = useState(false);
  const [optionalFeaturesEnabled, setOptionalFeaturesEnabled] = useState(ENABLE_OPTIONAL_STUDENT_FEATURES);
  const [resumoLivroId, setResumoLivroId] = useState('');
  const [resumoTexto, setResumoTexto] = useState('');
  const [resumosCriados, setResumosCriados] = useState([]);
  const warnedMissingFeaturesRef = useRef(false);
  const fetchInFlightRef = useRef(null);
  const realtimeDebounceRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    if (fetchInFlightRef.current) return fetchInFlightRef.current;

    const request = (async () => {
      setLoading(true);
      try {
        const { data: perfil, error: perfilError } = await supabase
          .from('usuarios_biblioteca')
          .select('id')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

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
          supabase
            .from('livros')
            .select('id, titulo, autor, area, disponivel, sinopse, created_at')
            .order('titulo'),
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
    })();
    fetchInFlightRef.current = request;
    request.finally(() => {
      if (fetchInFlightRef.current === request) {
        fetchInFlightRef.current = null;
      }
    });
    return request;
  }, [optionalFeaturesEnabled, toast, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!user?.id) return;

    const key = `onboarding:aluno:${user.id}`;
    if (localStorage.getItem(key) === 'done') return;

    setShowAccessChoice(true);
    setTimeout(() => {
      toast({
        title: 'Bem-vindo ao BibliotecAI',
        description: 'Você receberá dicas rápidas para aprender o sistema.',
      });
    }, 250);
    setTimeout(() => {
      toast({
        title: 'Passo 1 de 3',
        description: 'Use o Catálogo para solicitar livros e montar sua lista de desejos.',
      });
    }, 2100);
    setTimeout(() => {
      toast({
        title: 'Passo 2 de 3',
        description: 'No painel você acompanha sugestões, atividades e solicitações.',
      });
    }, 4200);
  }, [toast, user?.id]);

  const finalizeAlunoOnboarding = () => {
    if (user?.id) {
      localStorage.setItem(`onboarding:aluno:${user.id}`, 'done');
    }
    setShowAccessChoice(false);
  };

  useEffect(() => {
    if (studioSlides.length < 2) return;
    const timer = setInterval(() => {
      setStudioPreviewIndex((prev) => (prev + 1) % studioSlides.length);
    }, 2200);
    return () => clearInterval(timer);
  }, [studioSlides]);

  const onRealtimeChange = useCallback(() => {
    if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    realtimeDebounceRef.current = setTimeout(() => {
      fetchData();
    }, 400);
  }, [fetchData]);

  useEffect(() => {
    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    };
  }, []);

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

  const leiturasRecentes = useMemo(() => {
    const seteDiasAtras = new Date();
    seteDiasAtras.setDate(seteDiasAtras.getDate() - 6);
    return emprestimos.filter((e) => {
      if (e.status !== 'devolvido') return false;
      const dataRef = e.data_devolucao_real || e.updated_at || e.created_at;
      return dataRef && new Date(dataRef) >= seteDiasAtras;
    }).length;
  }, [emprestimos]);

  const pontosExperiencia = useMemo(() => {
    const baseLeituras = livrosLidos * 35;
    const baseAvaliacoes = avaliacoes.length * 15;
    const baseAtividades = entregas.filter((e) => e.status === 'aprovada').length * 25;
    return baseLeituras + baseAvaliacoes + baseAtividades + Number(pontosGanhos || 0);
  }, [avaliacoes.length, entregas, livrosLidos, pontosGanhos]);

  const nivelAtual = useMemo(() => Math.max(1, Math.floor(pontosExperiencia / 150) + 1), [pontosExperiencia]);

  const xpNivelAtual = useMemo(() => (nivelAtual - 1) * 150, [nivelAtual]);
  const xpProximoNivel = useMemo(() => nivelAtual * 150, [nivelAtual]);
  const progressoNivel = useMemo(() => {
    const progresso = ((pontosExperiencia - xpNivelAtual) / (xpProximoNivel - xpNivelAtual)) * 100;
    return Math.max(0, Math.min(100, progresso));
  }, [pontosExperiencia, xpNivelAtual, xpProximoNivel]);

  const selos = useMemo(
    () => [
      {
        id: 'primeiro-livro',
        nome: 'Primeiro Livro',
        descricao: 'Concluiu sua primeira leitura.',
        desbloqueado: livrosLidos >= 1,
        icon: BookOpen,
      },
      {
        id: 'leitor-bronze',
        nome: 'Leitor Bronze',
        descricao: 'Leu pelo menos 5 livros.',
        desbloqueado: livrosLidos >= 5,
        icon: Medal,
      },
      {
        id: 'maratona',
        nome: 'Maratona da Semana',
        descricao: 'Leu 3+ livros nos últimos 7 dias.',
        desbloqueado: leiturasRecentes >= 3,
        icon: Flame,
      },
      {
        id: 'autor-da-comunidade',
        nome: 'Autor da Comunidade',
        descricao: 'Publicou sua primeira avaliação.',
        desbloqueado: avaliacoes.length >= 1,
        icon: Sparkles,
      },
      {
        id: 'top-atividades',
        nome: 'Top das Atividades',
        descricao: 'Aprovou 5 atividades.',
        desbloqueado: entregas.filter((e) => e.status === 'aprovada').length >= 5,
        icon: Trophy,
      },
    ],
    [avaliacoes.length, entregas, leiturasRecentes, livrosLidos],
  );

  const selosConquistados = useMemo(() => selos.filter((s) => s.desbloqueado), [selos]);

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

  const meusLivros = useMemo(
    () => emprestimos.filter((e) => e.status === 'ativo' || e.status === 'devolvido'),
    [emprestimos],
  );

  const audiobooksLiberados = useMemo(() => {
    const livrosComEmprestimo = new Set(meusLivros.map((item) => item.livro_id).filter(Boolean));
    return audiobookCatalogo.filter((audio) => livrosComEmprestimo.has(audio.livro_id));
  }, [audiobookCatalogo, meusLivros]);

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

  const handleGerarImagemIA = async () => {
    const prompt = studioPrompt.trim();
    if (!prompt) {
      toast({ variant: 'destructive', title: 'Informe o prompt', description: 'Descreva a imagem para gerar com IA.' });
      return;
    }
    if (studioSlides.length >= 8) {
      toast({ variant: 'destructive', title: 'Limite atingido', description: 'Use no maximo 8 imagens por animacao.' });
      return;
    }

    setGerandoImagemIA(true);
    try {
      const imageDataUrl = await generateImageWithGemini(prompt);
      setStudioSlides((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          url: imageDataUrl,
          origem: 'ia',
          legenda: prompt.slice(0, 80),
        },
      ]);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Falha ao gerar imagem',
        description: error?.message || 'Nao foi possivel gerar imagem com Gemini.',
      });
    } finally {
      setGerandoImagemIA(false);
    }
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

  const activeSection = useMemo(() => {
    if (location.pathname === '/aluno/biblioteca') return 'biblioteca';
    if (location.pathname === '/aluno/laboratorio') return 'laboratorio';
    if (location.pathname === '/aluno/atividades') return 'atividades';
    return 'perfil';
  }, [location.pathname]);

  const pageTitle = useMemo(() => {
    if (activeSection === 'biblioteca') return 'Biblioteca';
    if (activeSection === 'laboratorio') return 'Laboratório';
    if (activeSection === 'atividades') return 'Atividades';
    return 'Meu Perfil';
  }, [activeSection]);

  const gerarResumo = () => {
    const livro = livros.find((item) => item.id === resumoLivroId);
    if (!livro) {
      toast({ variant: 'destructive', title: 'Selecione um livro', description: 'Escolha um livro para gerar o resumo.' });
      return;
    }
    const base = livro.sinopse ? `Sinopse base: ${livro.sinopse}` : 'Sinopse não cadastrada no momento.';
    setResumoTexto(
      `Resumo de "${livro.titulo}"\n\nTema principal:\n- \n\nPersonagens ou pontos-chave:\n- \n\nMinha reflexão:\n- \n\n${base}`,
    );
  };

  const salvarResumo = () => {
    const livro = livros.find((item) => item.id === resumoLivroId);
    if (!livro || !resumoTexto.trim()) {
      toast({
        variant: 'destructive',
        title: 'Resumo incompleto',
        description: 'Selecione um livro e escreva o resumo antes de salvar.',
      });
      return;
    }

    setResumosCriados((prev) => [
      {
        id: crypto.randomUUID(),
        livroId: livro.id,
        livroTitulo: livro.titulo,
        texto: resumoTexto.trim(),
        criadoEm: new Date().toISOString(),
      },
      ...prev,
    ]);
    toast({ title: 'Resumo salvo no laboratório' });
    setResumoTexto('');
  };

  if (loading) {
    return (
      <MainLayout title={pageTitle}>
        <p className="text-center text-muted-foreground py-8">Carregando...</p>
      </MainLayout>
    );
  }

  return (
    <MainLayout title={pageTitle}>
      <div className="space-y-4 sm:space-y-6">
        {activeSection === 'perfil' && (
          <>
            <Card className="relative overflow-hidden student-gamify-hero border-primary/20">
          <div className="student-gamify-orb student-gamify-orb-a" />
          <div className="student-gamify-orb student-gamify-orb-b" />
          <CardContent className="relative p-4 sm:p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-primary/80">Jornada de leitura</p>
                <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
                  <Crown className="w-5 h-5 text-warning" /> Nível {nivelAtual}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {pontosExperiencia} XP acumulado • faltam {Math.max(0, xpProximoNivel - pontosExperiencia)} XP para o próximo nível
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 px-3 py-2 text-sm flex items-center gap-2 student-achievement-chip">
                <Gift className="w-4 h-4 text-primary" />
                <span>{selosConquistados.length >= 3 ? 'Presente liberado!' : 'Conquiste 3 selos para liberar presente'}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Progress value={progressoNivel} className="h-3" />
              <p className="text-xs text-muted-foreground">{Math.round(progressoNivel)}% do nível atual</p>
            </div>
          </CardContent>
            </Card>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"
                      onClick={() => navigate('/aluno/biblioteca')}
                      aria-label="Ir para Biblioteca"
                    >
                      <BookOpen className="w-5 h-5 text-primary" />
                    </button>
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
                    <button
                      type="button"
                      className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center"
                      onClick={() => navigate('/aluno/atividades')}
                      aria-label="Ir para Atividades"
                    >
                      <Trophy className="w-5 h-5 text-warning" />
                    </button>
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
                    <button
                      type="button"
                      className="w-10 h-10 rounded-lg bg-info/10 flex items-center justify-center"
                      onClick={() => navigate('/aluno/atividades')}
                      aria-label="Ir para Atividades pendentes"
                    >
                      <CheckCircle2 className="w-5 h-5 text-info" />
                    </button>
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
                    <button
                      type="button"
                      className="w-10 h-10 rounded-lg bg-destructive/10 flex items-center justify-center"
                      onClick={() => navigate('/aluno/atividades')}
                      aria-label="Ir para avisos"
                    >
                      <BellRing className="w-5 h-5 text-destructive" />
                    </button>
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
                  <Medal className="w-4 h-4" />
                  Selos e conquistas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {selos.map((selo) => (
                    <div
                      key={selo.id}
                      className={`rounded-xl border p-3 transition-all ${
                        selo.desbloqueado ? 'bg-primary/5 border-primary/30 student-badge-unlocked' : 'bg-muted/40'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${selo.desbloqueado ? 'bg-primary/15' : 'bg-muted'}`}>
                          <selo.icon className={`w-5 h-5 ${selo.desbloqueado ? 'text-primary' : 'text-muted-foreground'}`} />
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{selo.nome}</p>
                          <p className="text-xs text-muted-foreground">{selo.descricao}</p>
                          <Badge variant={selo.desbloqueado ? 'outline' : 'secondary'} className="mt-2">
                            {selo.desbloqueado ? 'Desbloqueado' : 'Em progresso'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

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
          </>
        )}

        {activeSection !== 'perfil' && (
          <Tabs value={activeSection}>
            <TabsContent value="atividades" className="space-y-4">
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

          <TabsContent value="laboratorio" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Gerar imagens</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input value={studioPrompt} onChange={(e) => setStudioPrompt(e.target.value)} placeholder="Descreva a imagem" />
                  <Button type="button" variant="outline" onClick={handleGerarImagemIA} disabled={gerandoImagemIA}>
                    <Sparkles className="w-4 h-4 mr-1" /> {gerandoImagemIA ? 'Gerando...' : 'Gerar'}
                  </Button>
                </div>
                {studioSlides.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {studioSlides.map((slide, index) => (
                      <div key={slide.id} className="relative">
                        <img src={slide.url} alt={`Imagem ${index + 1}`} className="h-24 w-full object-cover rounded-md border" />
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
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="biblioteca" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar livros..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Meus livros</CardTitle>
              </CardHeader>
              <CardContent>
                {meusLivros.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Você ainda não tem livros aprovados/emprestados.</p>
                ) : (
                  <div className="space-y-2">
                    {meusLivros.map((item) => (
                      <div key={item.id} className="flex items-center justify-between rounded-md border p-3">
                        <div>
                          <p className="text-sm font-medium">{item.livros?.titulo || 'Livro'}</p>
                          <p className="text-xs text-muted-foreground">{item.livros?.autor || '-'}</p>
                        </div>
                        <Badge variant={item.status === 'ativo' ? 'default' : 'secondary'}>
                          {item.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Audiobooks liberados</CardTitle>
              </CardHeader>
              <CardContent>
                {audiobooksLiberados.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Para ouvir audiobooks, solicite o livro e aguarde aprovação da bibliotecária.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {audiobooksLiberados.map((audio) => (
                      <div key={audio.id} className="rounded-md border p-3 space-y-2">
                        <p className="font-medium">{audio.titulo}</p>
                        <p className="text-xs text-muted-foreground">{audio.autor || audio.livros?.autor || '-'}</p>
                        <audio controls src={audio.audio_url} className="w-full h-10" preload="metadata" />
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

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
                      <p className="text-xs text-muted-foreground line-clamp-2" translate="yes">{livro.sinopse}</p>
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

          <TabsContent value="biblioteca">
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
        )}
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

      <Dialog
        open={showAccessChoice}
        onOpenChange={(open) => {
          setShowAccessChoice(open);
          if (!open) finalizeAlunoOnboarding();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Acesso do aluno</DialogTitle>
            <DialogDescription>
              Seu acesso inicial usa matrícula como login e senha. Você pode manter agora ou criar uma nova senha.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            Lembrete: você pode alterar sua senha quando quiser em Configurações.
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                finalizeAlunoOnboarding();
                toast({
                  title: 'Acesso mantido',
                  description: 'Você pode alterar a senha depois em Configurações.',
                });
              }}
            >
              Manter matrícula por enquanto
            </Button>
            <Button
              onClick={() => {
                finalizeAlunoOnboarding();
                navigate('/configuracoes');
              }}
            >
              Criar nova senha agora
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
