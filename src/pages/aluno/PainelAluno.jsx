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
  Expand,
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
import {
  generateAudioWithCloudflare,
  generateImageWithCloudflare,
  generateTextWithCloudflare,
} from '@/lib/cloudflareAiApi';

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

async function insertCommunityPostCompat(payload, options = {}) {
  const expectSingleId = options.expectSingleId === true;

  const runInsert = async (insertPayload) => {
    let query = supabase.from('comunidade_posts').insert(insertPayload);
    if (expectSingleId) {
      query = query.select('id').single();
    }
    return await query;
  };

  let result = await runInsert(payload);
  if (
    result.error
    && Object.hasOwn(payload, 'escola_id')
    && isMissingColumnError(result.error, 'escola_id', 'comunidade_posts')
  ) {
    const { escola_id: _ignored, ...fallbackPayload } = payload;
    result = await runInsert(fallbackPayload);
  }

  return result;
}

function encodeJsonBase64(value) {
  try {
    return btoa(unescape(encodeURIComponent(JSON.stringify(value || {}))));
  } catch {
    return '';
  }
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

function serializeQuizParaComunidade(payload) {
  return `${QUIZ_MARKER}${encodeJsonBase64(payload)}`;
}

function extractAtividadeFormConfig(descricao) {
  const source = String(descricao || '');
  const marker = '[FORM_CONFIG_V1]';
  const idx = source.indexOf(marker);
  if (idx < 0) return { descricaoLimpa: source, formulario: null };

  const descricaoLimpa = source.slice(0, idx).trim();
  const encoded = source.slice(idx + marker.length).trim();
  const parsed = decodeJsonBase64(encoded);
  const perguntas = Array.isArray(parsed?.perguntas) ? parsed.perguntas : [];

  return {
    descricaoLimpa,
    formulario: perguntas.length > 0 ? { perguntas } : null,
  };
}

function serializeEntregaPayload(payload) {
  return `[ENTREGA_PAYLOAD_V1]${encodeJsonBase64(payload || {})}`;
}

function parseEntregaPayload(rawText) {
  const source = String(rawText || '');
  const marker = '[ENTREGA_PAYLOAD_V1]';
  if (!source.startsWith(marker)) {
    return {
      texto: source,
      imagens: [],
      respostas: {},
    };
  }

  const parsed = decodeJsonBase64(source.slice(marker.length).trim()) || {};
  return {
    texto: String(parsed?.texto || ''),
    imagens: Array.isArray(parsed?.imagens) ? parsed.imagens.filter((item) => typeof item === 'string') : [],
    respostas: parsed?.respostas && typeof parsed.respostas === 'object' ? parsed.respostas : {},
  };
}

async function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function generateImageWithIA(prompt) {
  const data = await generateImageWithCloudflare({
    prompt,
    fallbackErrorMessage: 'Não foi possível gerar imagem no momento.',
  });

  const imageDataUrl = data?.imageDataUrl;
  if (!imageDataUrl || typeof imageDataUrl !== 'string') {
    throw new Error('A API respondeu sem imagem.');
  }

  return imageDataUrl;
}

async function generateTextWithIA(task, input, fallbackErrorMessage) {
  const data = await generateTextWithCloudflare({
    task,
    input,
    fallbackErrorMessage: fallbackErrorMessage || 'Não foi possível gerar texto com IA no momento.',
  });

  return data;
}

function extractResumoTextoFromIAResponse(data) {
  const direct = String(data?.data?.texto || data?.data?.resumo || '').trim();
  if (direct) return direct;

  const raw = String(data?.text || '').trim();
  if (!raw) return '';

  const parseJsonPayload = (value) => {
    try {
      const parsed = JSON.parse(value);
      const texto = String(parsed?.texto || parsed?.resumo || '').trim();
      return texto || '';
    } catch {
      return '';
    }
  };

  const parsedRaw = parseJsonPayload(raw);
  if (parsedRaw) return parsedRaw;

  if (raw.startsWith('{') && !raw.endsWith('}')) {
    const parsedClosed = parseJsonPayload(`${raw}}`);
    if (parsedClosed) return parsedClosed;
  }

  const keyMatch = raw.match(/"(?:texto|resumo)"\s*:\s*"([\s\S]*?)"\s*\}?$/i);
  if (keyMatch?.[1]) {
    return String(keyMatch[1])
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\')
      .trim();
  }

  return raw
    .replace(/^\{\s*/, '')
    .replace(/\s*\}$/, '')
    .replace(/^"(?:texto|resumo)"\s*:\s*/i, '')
    .replace(/^"+|"+$/g, '')
    .trim();
}

function extractJsonFromIAPlainText(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    // ignore
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // ignore
    }
  }

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      // ignore
    }
  }

  const firstBracket = raw.indexOf('[');
  const lastBracket = raw.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    try {
      return JSON.parse(raw.slice(firstBracket, lastBracket + 1));
    } catch {
      // ignore
    }
  }

  return null;
}

function normalizeQuizOptionText(value) {
  return String(value || '')
    .replace(/^[A-Da-d][\)\].:\-\s]+/, '')
    .trim();
}

function normalizeQuizOptions(rawOptions) {
  const objectLike = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions);
  const asArray = Array.isArray(rawOptions)
    ? rawOptions
    : objectLike
      ? Object.entries(rawOptions)
          .sort(([a], [b]) => String(a).localeCompare(String(b), 'pt-BR'))
          .map(([, value]) => value)
      : [];

  return ensureArray(asArray)
    .map((item) => {
      if (typeof item === 'string') return normalizeQuizOptionText(item);
      if (item && typeof item === 'object') {
        return normalizeQuizOptionText(item.texto || item.text || item.opcao || item.alternativa || item.label);
      }
      return '';
    })
    .filter(Boolean)
    .slice(0, 4);
}

function normalizeQuizCorrectIndex(rawCorrect, options) {
  if (Number.isInteger(rawCorrect)) {
    if (rawCorrect >= 0 && rawCorrect <= 3) return rawCorrect;
    if (rawCorrect >= 1 && rawCorrect <= 4) return rawCorrect - 1;
  }

  const text = String(rawCorrect || '').trim();
  if (!text) return -1;

  const asNumber = Number(text);
  if (Number.isInteger(asNumber)) {
    if (asNumber >= 0 && asNumber <= 3) return asNumber;
    if (asNumber >= 1 && asNumber <= 4) return asNumber - 1;
  }

  const letterMatch = text.match(/\b([A-D])\b/i);
  if (letterMatch?.[1]) return letterMatch[1].toUpperCase().charCodeAt(0) - 65;

  const cleaned = normalizeQuizOptionText(text).toLowerCase();
  if (!cleaned) return -1;
  const optionIndex = options.findIndex((option) => normalizeQuizOptionText(option).toLowerCase() === cleaned);
  return optionIndex;
}

function extractQuizPerguntasFromIAResponse(response) {
  const data = response?.data && typeof response.data === 'object' ? response.data : {};
  const textJson = extractJsonFromIAPlainText(response?.text);

  const rawPerguntas = [
    data?.perguntas,
    data?.questoes,
    data?.questions,
    textJson?.perguntas,
    textJson?.questoes,
    textJson?.questions,
    Array.isArray(textJson) ? textJson : null,
  ].find((item) => Array.isArray(item));

  return ensureArray(rawPerguntas)
    .map((item) => {
      const enunciado = String(item?.enunciado || item?.pergunta || item?.question || '').trim();
      const opcoes = normalizeQuizOptions(item?.opcoes || item?.alternativas || item?.options || item?.respostas);
      const correta = normalizeQuizCorrectIndex(
        item?.correta ?? item?.resposta_correta ?? item?.correct_answer ?? item?.answer ?? item?.indice_correto,
        opcoes,
      );

      return { enunciado, opcoes, correta };
    })
    .filter((item) => item.enunciado && item.opcoes.length === 4 && Number.isInteger(item.correta) && item.correta >= 0 && item.correta <= 3)
    .slice(0, 5);
}

export default function PainelAluno() {

  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [alunoId, setAlunoId] = useState(null);
  const [escolaId, setEscolaId] = useState(null);
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
  const [bibliotecaView, setBibliotecaView] = useState('meus_livros');
  const [solicitacoesView, setSolicitacoesView] = useState('em_andamento');
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
  const [selectedStudioImageUrl, setSelectedStudioImageUrl] = useState('');
  const [quizLivroId, setQuizLivroId] = useState('');
  const [quizTema, setQuizTema] = useState('');
  const [quiz, setQuiz] = useState([]);
  const [quizRespostas, setQuizRespostas] = useState({});
  const [quizResultado, setQuizResultado] = useState(null);
  const [gerandoQuizIA, setGerandoQuizIA] = useState(false);

  const [atividadeTexto, setAtividadeTexto] = useState({});
  const [atividadeImagens, setAtividadeImagens] = useState({});
  const [atividadeRespostas, setAtividadeRespostas] = useState({});
  const [saving, setSaving] = useState(false);
  const [showAccessChoice, setShowAccessChoice] = useState(false);
  const [optionalFeaturesEnabled, setOptionalFeaturesEnabled] = useState(ENABLE_OPTIONAL_STUDENT_FEATURES);
  const [resumoLivroId, setResumoLivroId] = useState('');
  const [resumoTexto, setResumoTexto] = useState('');
  const [resumosCriados, setResumosCriados] = useState([]);
  const [criacoesLaboratorio, setCriacoesLaboratorio] = useState([]);
  const [filtroCriacoesLaboratorio, setFiltroCriacoesLaboratorio] = useState('todas');
  const [labCriacoesMissingTable, setLabCriacoesMissingTable] = useState(false);
  const [shareReviewToCommunity, setShareReviewToCommunity] = useState(false);
  const [gerandoResumoIA, setGerandoResumoIA] = useState(false);
  const [desafioIA, setDesafioIA] = useState(null);
  const [gerandoDesafioIA, setGerandoDesafioIA] = useState(false);
  const warnedMissingFeaturesRef = useRef(false);
  const fetchInFlightRef = useRef(null);
  const realtimeDebounceRef = useRef(null);
  const audioPlayerRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!user) return;
    if (fetchInFlightRef.current) return fetchInFlightRef.current;

    const request = (async () => {
      setLoading(true);
      try {
        const { data: perfil, error: perfilError } = await supabase
          .from('usuarios_biblioteca')
          .select('id, escola_id')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (perfilError || !perfil) throw perfilError || new Error('Perfil do aluno não encontrado.');
        setAlunoId(perfil.id);
        setEscolaId(perfil.escola_id || null);

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
        let criacoesLaboratorioOpt = { data: [], missing: false };

        if (optionalFeaturesEnabled) {
          // Probe only one new table first to avoid multiple 404 calls when migration is missing.
          entregasOpt = await optionalQuery(
            supabase.from('atividades_entregas').select('*').eq('aluno_id', perfil.id).order('updated_at', { ascending: false }),
          );

          if (!entregasOpt.missing) {
            [audioCatalogoOpt, meusAudiobooksOpt, criacoesLaboratorioOpt] = await Promise.all([
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
              optionalQuery(
                supabase
                  .from('laboratorio_criacoes')
                  .select('*')
                  .eq('aluno_id', perfil.id)
                  .order('created_at', { ascending: false }),
              ),
            ]);
          }
        }

        const missingAnyNewTable =
          entregasOpt.missing || audioCatalogoOpt.missing || meusAudiobooksOpt.missing || criacoesLaboratorioOpt.missing;

        if (missingAnyNewTable && !warnedMissingFeaturesRef.current) {
          warnedMissingFeaturesRef.current = true;
          toast({
            variant: 'destructive',
            title: 'Recursos do laboratório incompletos',
            description: 'Algumas tabelas novas não existem no banco. Aplique as migrations mais recentes do Supabase.',
          });
        }
        setLabCriacoesMissingTable(criacoesLaboratorioOpt.missing);

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
        setCriacoesLaboratorio(criacoesLaboratorioOpt.data);

        const entregaInicial = {};
        const entregaImagensInicial = {};
        const entregaRespostasInicial = {};
        entregasOpt.data.forEach((entrega) => {
          const payload = parseEntregaPayload(entrega.texto_entrega);
          entregaInicial[entrega.atividade_id] = payload.texto;
          entregaImagensInicial[entrega.atividade_id] = payload.imagens;
          entregaRespostasInicial[entrega.atividade_id] = payload.respostas;
        });
        setAtividadeTexto(entregaInicial);
        setAtividadeImagens(entregaImagensInicial);
        setAtividadeRespostas(entregaRespostasInicial);
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
  useRealtimeSubscription({ table: optionalFeaturesEnabled ? 'laboratorio_criacoes' : null, onChange: onRealtimeChange });

  const atividadesComEntrega = useMemo(() => {
    const entregaByAtividade = new Map(entregas.map((e) => [e.atividade_id, e]));
    return atividades.map((atividade) => ({
      ...atividade,
      atividadeMeta: extractAtividadeFormConfig(atividade.descricao),
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

  const meusLivros = useMemo(() => emprestimos.filter((e) => e.status === 'ativo'), [emprestimos]);

  const filteredMeusLivros = useMemo(
    () =>
      meusLivros.filter((item) => {
        const t = searchTerm.toLowerCase();
        const titulo = String(item?.livros?.titulo || '').toLowerCase();
        const autor = String(item?.livros?.autor || '').toLowerCase();
        return titulo.includes(t) || autor.includes(t);
      }),
    [meusLivros, searchTerm],
  );

  const filteredSolicitacoes = useMemo(
    () =>
      solicitacoes.filter((item) => {
        const t = searchTerm.toLowerCase();
        const titulo = String(item?.livros?.titulo || '').toLowerCase();
        const autor = String(item?.livros?.autor || '').toLowerCase();
        return titulo.includes(t) || autor.includes(t);
      }),
    [solicitacoes, searchTerm],
  );

  const latestEmprestimoByLivro = useMemo(() => {
    const map = new Map();
    emprestimos.forEach((item) => {
      if (!item?.livro_id) return;
      const prev = map.get(item.livro_id);
      if (!prev) {
        map.set(item.livro_id, item);
        return;
      }
      const prevDate = new Date(prev.updated_at || prev.created_at || 0).getTime();
      const currDate = new Date(item.updated_at || item.created_at || 0).getTime();
      if (currDate >= prevDate) map.set(item.livro_id, item);
    });
    return map;
  }, [emprestimos]);

  const classifySolicitacao = useCallback(
    (solicitacao) => {
      const emprestimo = latestEmprestimoByLivro.get(solicitacao?.livro_id);
      if (emprestimo?.status === 'devolvido') return 'historico';
      if (emprestimo?.status === 'ativo') return 'em_andamento';

      const status = String(solicitacao?.status || '').toLowerCase();
      if (status === 'aprovada' || status === 'aceita') return 'aceitos';
      if (status === 'recusada' || status === 'negada' || status === 'cancelada') return 'historico';
      return 'em_andamento';
    },
    [latestEmprestimoByLivro],
  );

  const solicitacoesGroups = useMemo(() => {
    const grouped = {
      em_andamento: [],
      aceitos: [],
      historico: [],
    };
    filteredSolicitacoes.forEach((item) => {
      grouped[classifySolicitacao(item)].push(item);
    });
    return grouped;
  }, [classifySolicitacao, filteredSolicitacoes]);

  const solicitacoesExibidas = useMemo(
    () => solicitacoesGroups[solicitacoesView] || [],
    [solicitacoesGroups, solicitacoesView],
  );

  const speakText = async (text) => {
    const stopPlayback = () => {
      try {
        speechSynthesis.cancel();
      } catch {
        // ignore
      }

      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
          audioPlayerRef.current.currentTime = 0;
        } catch {
          // ignore
        }
        audioPlayerRef.current = null;
      }
      setSpeaking(false);
    };

    const playWithBrowserTTS = (value) => {
      try {
        speechSynthesis.cancel();
      } catch {
        // ignore
      }
      const utterance = new SpeechSynthesisUtterance(value || '');
      utterance.lang = 'pt-BR';
      utterance.rate = 0.9;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      speechSynthesis.speak(utterance);
    };

    if (speaking) {
      stopPlayback();
      return;
    }

    const normalizedText = String(text || '').trim();
    if (!normalizedText) return;

    setSpeaking(true);
    try {
      const { audioDataUrl } = await generateAudioWithCloudflare({
        text: normalizedText,
        language: 'pt-BR',
        fallbackErrorMessage: 'Não foi possível gerar áudio da sinopse no momento.',
      });

      const audio = new Audio(audioDataUrl);
      audioPlayerRef.current = audio;
      audio.onended = () => {
        audioPlayerRef.current = null;
        setSpeaking(false);
      };
      audio.onerror = () => {
        audioPlayerRef.current = null;
        playWithBrowserTTS(normalizedText);
      };

      await audio.play();
    } catch {
      playWithBrowserTTS(normalizedText);
    }
  };

  useEffect(
    () => () => {
      try {
        speechSynthesis.cancel();
      } catch {
        // ignore
      }
      if (audioPlayerRef.current) {
        try {
          audioPlayerRef.current.pause();
        } catch {
          // ignore
        }
      }
    },
    [],
  );

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

  const salvarCriacaoLaboratorio = async (payload) => {
    if (labCriacoesMissingTable) {
      throw new Error('Tabela laboratorio_criacoes não encontrada. Aplique as migrations do Supabase.');
    }

    const { error } = await supabase.from('laboratorio_criacoes').insert(payload);
    if (!error) return;

    if (isMissingTableError(error)) {
      setLabCriacoesMissingTable(true);
      throw new Error('Tabela laboratorio_criacoes não encontrada. Aplique as migrations do Supabase.');
    }

    throw error;
  };

  const handleSaveReview = async () => {
    if (!alunoId || !reviewLivro || !escolaId) {
      toast({
        variant: 'destructive',
        title: 'Perfil incompleto',
        description: 'Não foi possível identificar seu vínculo com a escola para salvar a resenha.',
      });
      return;
    }

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

      let comunidadePostId = null;
      if (shareReviewToCommunity && reviewTexto.trim()) {
        const { data: postData, error: postError } = await insertCommunityPostCompat(
          {
            autor_id: alunoId,
            escola_id: escolaId,
            livro_id: reviewLivro.id,
            tipo: 'resenha',
            titulo: `Resenha: ${reviewLivro.titulo}`,
            conteudo: reviewTexto.trim(),
            imagem_urls: [],
            tags: ['resenha'],
          },
          { expectSingleId: true },
        );
        if (postError) throw postError;
        comunidadePostId = postData?.id || null;
      }

      await salvarCriacaoLaboratorio({
        aluno_id: alunoId,
        escola_id: escolaId,
        livro_id: reviewLivro.id,
        tipo: 'resenha',
        titulo: `Resenha: ${reviewLivro.titulo}`,
        descricao: reviewTexto.trim() || null,
        conteudo_json: {
          nota: reviewNota,
          resenha: reviewTexto.trim() || null,
        },
        tags: ['resenha'],
        publicado_comunidade: Boolean(comunidadePostId),
        comunidade_post_id: comunidadePostId,
      });

      toast({ title: 'Avaliação salva!' });
      setReviewDialog(false);
      setReviewLivro(null);
      setReviewTexto('');
      setShareReviewToCommunity(false);
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
    if (!optionalFeaturesEnabled) {
      toast({
        variant: 'destructive',
        title: 'Recurso indisponível',
        description: 'Entrega de atividades desativada neste ambiente.',
      });
      return;
    }

    const texto = (atividadeTexto[atividade.id] || '').trim();
    const imagens = ensureArray(atividadeImagens[atividade.id]);
    const respostas = atividadeRespostas[atividade.id] && typeof atividadeRespostas[atividade.id] === 'object'
      ? atividadeRespostas[atividade.id]
      : {};

    const temFormulario = Array.isArray(atividade?.atividadeMeta?.formulario?.perguntas)
      && atividade.atividadeMeta.formulario.perguntas.length > 0;
    const respostasPreenchidas = Object.values(respostas).some((value) => String(value || '').trim());

    if (!texto && imagens.length === 0 && !respostasPreenchidas) {
      toast({
        variant: 'destructive',
        title: 'Informe sua resposta',
        description: temFormulario
          ? 'Preencha o formulário, escreva uma resposta ou envie imagens.'
          : 'Escreva o conteúdo da entrega ou envie imagens.',
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        atividade_id: atividade.id,
        aluno_id: alunoId,
        texto_entrega: serializeEntregaPayload({
          texto,
          imagens,
          respostas,
        }),
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

  const handleSelectActivityImages = async (atividadeId, files) => {
    const selected = Array.from(files || []).slice(0, 4);
    if (selected.length === 0) return;
    try {
      const converted = await Promise.all(selected.map(fileToDataUrl));
      setAtividadeImagens((prev) => ({
        ...prev,
        [atividadeId]: [...ensureArray(prev[atividadeId]), ...converted].slice(0, 4),
      }));
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível processar as imagens da atividade.' });
    }
  };

  const handleCriarAudiobook = async () => {
    if (!alunoId || !escolaId) {
      toast({
        variant: 'destructive',
        title: 'Perfil incompleto',
        description: 'Não foi possível identificar sua escola para criar audiobook.',
      });
      return;
    }
    if (!optionalFeaturesEnabled) {
      toast({
        variant: 'destructive',
        title: 'Recurso indisponível',
        description: 'Audiobooks estão desativados neste ambiente.',
      });
      return;
    }

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
        escola_id: escolaId,
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
    if (!optionalFeaturesEnabled) {
      toast({
        variant: 'destructive',
        title: 'Recurso indisponível',
        description: 'Audiobooks estão desativados neste ambiente.',
      });
      return;
    }

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
      toast({ variant: 'destructive', title: 'Informe o prompt', description: 'Descreva a imagem para gerar.' });
      return;
    }
    if (studioSlides.length >= 8) {
      toast({ variant: 'destructive', title: 'Limite atingido', description: 'Use no máximo 8 imagens por animação.' });
      return;
    }

    setGerandoImagemIA(true);
    try {
      const imageDataUrl = await generateImageWithIA(prompt);
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
        description: error?.message || 'Não foi possível gerar imagem no momento.',
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
    if (!optionalFeaturesEnabled || !alunoId || !escolaId) {
      toast({
        variant: 'destructive',
        title: 'Laboratório indisponível',
        description: 'Não foi possível publicar agora. Verifique se as migrations do banco foram aplicadas.',
      });
      return;
    }
    if (studioSlides.length === 0) {
      toast({ variant: 'destructive', title: 'Sem imagens', description: 'Adicione pelo menos uma imagem para compartilhar.' });
      return;
    }

    setSaving(true);
    try {
      const tags = [];
      if (studioSlides.some((slide) => slide.origem === 'ia')) tags.push('ia');
      if (studioAudioFundoUrl) tags.push('audio-fundo');

      const titulo = studioTitulo.trim() || 'Projeto criativo do aluno';
      const conteudo =
        studioDescricao.trim() ||
        'Criação de mídia com imagens em sequência e áudio de fundo feita no estúdio do aluno.';
      const imagemUrls = studioSlides.map((slide) => slide.url);

      const { data: postCriado, error } = await insertCommunityPostCompat(
        {
          autor_id: alunoId,
          escola_id: escolaId,
          livro_id: null,
          audiobook_id: studioAudiobookId || null,
          tipo: 'dica',
          titulo,
          conteudo,
          imagem_urls: imagemUrls,
          tags,
        },
        { expectSingleId: true },
      );
      if (error) throw error;

      await salvarCriacaoLaboratorio({
        aluno_id: alunoId,
        escola_id: escolaId,
        tipo: 'imagem',
        titulo,
        descricao: conteudo,
        conteudo_json: {
          prompt: studioPrompt.trim() || null,
          audiobook_id: studioAudiobookId || null,
        },
        imagem_urls: imagemUrls,
        tags,
        publicado_comunidade: true,
        comunidade_post_id: postCriado?.id || null,
      });

      toast({ title: 'Projeto compartilhado na comunidade!' });
      setStudioTitulo('');
      setStudioDescricao('');
      setStudioPrompt('');
      setStudioAudiobookId('');
      setStudioSlides([]);
      setStudioAudioFundoUrl('');
      setSelectedStudioImageUrl('');
      await fetchData();
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

  const salvarProjetoStudioNoLaboratorio = async () => {
    if (!optionalFeaturesEnabled || !alunoId || !escolaId) {
      toast({
        variant: 'destructive',
        title: 'Laboratório indisponível',
        description: 'Não foi possível salvar agora. Verifique as configurações do banco.',
      });
      return;
    }
    if (studioSlides.length === 0) {
      toast({ variant: 'destructive', title: 'Sem imagens', description: 'Adicione pelo menos uma imagem para salvar.' });
      return;
    }

    setSaving(true);
    try {
      const tags = [];
      if (studioSlides.some((slide) => slide.origem === 'ia')) tags.push('ia');
      if (studioAudioFundoUrl) tags.push('audio-fundo');

      await salvarCriacaoLaboratorio({
        aluno_id: alunoId,
        escola_id: escolaId,
        tipo: 'imagem',
        titulo: studioTitulo.trim() || 'Projeto criativo do aluno',
        descricao:
          studioDescricao.trim() || 'Projeto salvo no laboratório do aluno para edição/compartilhamento posterior.',
        conteudo_json: {
          prompt: studioPrompt.trim() || null,
          audiobook_id: studioAudiobookId || null,
        },
        imagem_urls: studioSlides.map((slide) => slide.url),
        tags,
      });

      toast({ title: 'Projeto salvo no laboratório!' });
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível salvar o projeto.' });
    } finally {
      setSaving(false);
    }
  };

  const gerarQuizComIA = async () => {
    const livro = livros.find((item) => item.id === quizLivroId);
    if (!livro) {
      toast({ variant: 'destructive', title: 'Selecione um livro', description: 'Escolha um livro para gerar o quiz.' });
      return;
    }
    const tema = quizTema.trim() || 'compreensão da leitura';

    setGerandoQuizIA(true);
    try {
      const data = await generateTextWithIA(
        'quiz_leitura',
        {
          titulo: livro.titulo,
          autor: livro.autor,
          sinopse: livro.sinopse || '',
          tema,
          quantidade: 3,
        },
        'Não foi possível gerar quiz com IA no momento.',
      );

      const perguntas = extractQuizPerguntasFromIAResponse(data);

      if (perguntas.length === 0) throw new Error('A IA respondeu sem perguntas válidas.');

      setQuiz(perguntas);
      setQuizRespostas({});
      setQuizResultado(null);
      toast({ title: 'Quiz gerado com IA!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar quiz',
        description: error?.message || 'Não foi possível gerar quiz com IA.',
      });
    } finally {
      setGerandoQuizIA(false);
    }
  };

  const corrigirQuiz = () => {
    if (quiz.length === 0) return;
    const acertos = quiz.reduce((acc, pergunta, index) => (Number(quizRespostas[index]) === pergunta.correta ? acc + 1 : acc), 0);
    setQuizResultado({ acertos, total: quiz.length });
  };

  const salvarQuizNoLaboratorio = async (publicarNaComunidade = false) => {
    if (!optionalFeaturesEnabled || !alunoId || !escolaId) {
      toast({
        variant: 'destructive',
        title: 'Laboratório indisponível',
        description: 'Não foi possível salvar o quiz agora. Verifique as migrations do banco.',
      });
      return;
    }
    if (quiz.length === 0) {
      toast({ variant: 'destructive', title: 'Sem quiz', description: 'Gere um quiz antes de salvar.' });
      return;
    }

    const livro = livros.find((item) => item.id === quizLivroId);
    let postId = null;
    const titulo = livro?.titulo ? `Quiz IA: ${livro.titulo}` : 'Quiz IA do aluno';
    const descricao = quizTema.trim() || 'compreensão da leitura';

    setSaving(true);
    try {
      if (publicarNaComunidade) {
        const resumoQuestoes = quiz.map((pergunta, index) => `${index + 1}) ${pergunta.enunciado}`).join('\n');
        const quizPayload = {
          perguntas: quiz,
          tema: descricao,
          livro_id: livro?.id || null,
          criado_em: new Date().toISOString(),
        };
        const conteudoQuiz = [`Quiz interativo (${descricao})`, resumoQuestoes, serializeQuizParaComunidade(quizPayload)]
          .filter(Boolean)
          .join('\n');

        const { data: postCriado, error: postError } = await insertCommunityPostCompat(
          {
            autor_id: alunoId,
            escola_id: escolaId,
            livro_id: livro?.id || null,
            tipo: 'quiz',
            titulo,
            conteudo: conteudoQuiz,
            imagem_urls: [],
            tags: ['quiz', 'ia'],
          },
          { expectSingleId: true },
        );
        if (postError) throw postError;
        postId = postCriado?.id || null;
      }

      await salvarCriacaoLaboratorio({
        aluno_id: alunoId,
        escola_id: escolaId,
        livro_id: livro?.id || null,
        tipo: 'quiz',
        titulo,
        descricao,
        conteudo_json: {
          perguntas: quiz,
          respostas: quizRespostas,
          resultado: quizResultado,
        },
        tags: ['quiz', 'ia'],
        publicado_comunidade: Boolean(postId),
        comunidade_post_id: postId,
      });

      toast({ title: publicarNaComunidade ? 'Quiz salvo e compartilhado!' : 'Quiz salvo no laboratório!' });
      await fetchData();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar quiz',
        description: error?.message || 'Não foi possível salvar o quiz.',
      });
    } finally {
      setSaving(false);
    }
  };

  const apagarCriacaoLaboratorio = async (criacao) => {
    if (!criacao?.id) return;
    const ok = window.confirm('Deseja apagar esta criação do laboratório?');
    if (!ok) return;

    setSaving(true);
    try {
      if (criacao.comunidade_post_id) {
        await supabase.from('comunidade_posts').delete().eq('id', criacao.comunidade_post_id);
      }
      if (labCriacoesMissingTable) {
        throw new Error('Tabela laboratorio_criacoes não encontrada. Aplique as migrations do Supabase.');
      }

      const { error } = await supabase.from('laboratorio_criacoes').delete().eq('id', criacao.id);
      if (error) {
        if (isMissingTableError(error)) {
          setLabCriacoesMissingTable(true);
          throw new Error('Tabela laboratorio_criacoes não encontrada. Aplique as migrations do Supabase.');
        }
        throw error;
      }

      toast({ title: 'Criação removida.' });
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro ao apagar', description: error?.message || 'Não foi possível apagar.' });
    } finally {
      setSaving(false);
    }
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
  const criacoesLaboratorioFiltradas = useMemo(() => {
    if (filtroCriacoesLaboratorio === 'todas') return criacoesLaboratorio;
    return criacoesLaboratorio.filter((criacao) => String(criacao?.tipo || '') === filtroCriacoesLaboratorio);
  }, [criacoesLaboratorio, filtroCriacoesLaboratorio]);

  const gerarResumo = async () => {
    if (!alunoId || !escolaId) {
      toast({
        variant: 'destructive',
        title: 'Perfil incompleto',
        description: 'Não foi possível identificar sua escola para gerar o resumo.',
      });
      return;
    }
    const livro = livros.find((item) => item.id === resumoLivroId);
    if (!livro) {
      toast({ variant: 'destructive', title: 'Selecione um livro', description: 'Escolha um livro para gerar o resumo.' });
      return;
    }

    setGerandoResumoIA(true);
    try {
      const data = await generateTextWithIA(
        'resumo_estudo',
        {
          titulo: livro.titulo,
          autor: livro.autor,
          sinopse: livro.sinopse || '',
        },
        'Não foi possível gerar resumo com IA no momento.',
      );

      const texto = extractResumoTextoFromIAResponse(data);
      if (!texto) throw new Error('A IA respondeu sem texto.');
      setResumoTexto(texto);
      toast({ title: 'Resumo gerado com IA!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar resumo',
        description: error?.message || 'Não foi possível gerar resumo com IA.',
      });
    } finally {
      setGerandoResumoIA(false);
    }
  };

  const gerarDesafioGamificacao = async () => {
    setGerandoDesafioIA(true);
    try {
      const data = await generateTextWithIA(
        'gamificacao_desafio',
        {
          nome: user?.user_metadata?.nome || user?.email || 'Aluno',
          nivel: nivelAtual,
          xp: pontosExperiencia,
          livrosLidos,
        },
        'Não foi possível gerar desafio de gamificação no momento.',
      );
      const desafio = data?.data;
      if (!desafio?.titulo || !desafio?.desafio) throw new Error('A IA respondeu sem desafio válido.');
      setDesafioIA(desafio);
      toast({ title: 'Desafio de gamificação gerado!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro no desafio IA',
        description: error?.message || 'Não foi possível gerar desafio agora.',
      });
    } finally {
      setGerandoDesafioIA(false);
    }
  };

  const salvarResumo = async () => {
    const livro = livros.find((item) => item.id === resumoLivroId);
    if (!livro || !resumoTexto.trim()) {
      toast({
        variant: 'destructive',
        title: 'Resumo incompleto',
        description: 'Selecione um livro e escreva o resumo antes de salvar.',
      });
      return;
    }

    try {
      const payload = {
        aluno_id: alunoId,
        escola_id: escolaId,
        livro_id: livro.id,
        tipo: 'resumo',
        titulo: `Resumo: ${livro.titulo}`,
        descricao: resumoTexto.trim().slice(0, 260),
        conteudo_json: {
          texto: resumoTexto.trim(),
        },
        tags: ['resumo', 'ia'],
      };
      await salvarCriacaoLaboratorio(payload);

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
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível salvar o resumo.' });
    }
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

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Flame className="w-4 h-4" />
                  Desafio IA do dia
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button type="button" variant="outline" onClick={gerarDesafioGamificacao} disabled={gerandoDesafioIA}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {gerandoDesafioIA ? 'Gerando desafio...' : 'Gerar desafio de gamificação'}
                </Button>
                {desafioIA && (
                  <div className="rounded-lg border p-3 space-y-1">
                    <p className="text-sm font-semibold">{desafioIA.titulo}</p>
                    <p className="text-sm text-muted-foreground">{desafioIA.desafio}</p>
                    {desafioIA.recompensa && (
                      <Badge variant="outline" className="mt-1">
                        Recompensa: {desafioIA.recompensa}
                      </Badge>
                    )}
                  </div>
                )}
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
                              {atividade.atividadeMeta?.descricaoLimpa && <p className="text-sm mt-1">{atividade.atividadeMeta.descricaoLimpa}</p>}
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
                              value={atividadeTexto[atividade.id] ?? parseEntregaPayload(atividade.entrega?.texto_entrega).texto ?? ''}
                              onChange={(e) =>
                                setAtividadeTexto((prev) => ({
                                  ...prev,
                                  [atividade.id]: e.target.value,
                                }))
                              }
                            />
                          </div>

                          {Array.isArray(atividade.atividadeMeta?.formulario?.perguntas)
                            && atividade.atividadeMeta.formulario.perguntas.length > 0 && (
                            <div className="space-y-3 rounded-md border p-3">
                              <p className="text-sm font-medium">Formulário da atividade</p>
                              {atividade.atividadeMeta.formulario.perguntas.map((pergunta, idx) => {
                                const perguntaId = String(pergunta?.id || `q_${idx + 1}`);
                                const respostaAtual = String(atividadeRespostas[atividade.id]?.[perguntaId] || '');
                                const opcoes = ensureArray(pergunta?.opcoes);
                                const tipo = String(pergunta?.tipo || 'texto');
                                return (
                                  <div key={perguntaId} className="space-y-1.5">
                                    <Label className="text-xs">
                                      {idx + 1}. {String(pergunta?.pergunta || 'Pergunta')}
                                    </Label>
                                    {tipo === 'multipla_escolha' && opcoes.length > 0 ? (
                                      <select
                                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                        value={respostaAtual || 'none'}
                                        onChange={(e) =>
                                          setAtividadeRespostas((prev) => ({
                                            ...prev,
                                            [atividade.id]: {
                                              ...(prev[atividade.id] || {}),
                                              [perguntaId]: e.target.value === 'none' ? '' : e.target.value,
                                            },
                                          }))
                                        }
                                      >
                                        <option value="none">Selecione</option>
                                        {opcoes.map((opcao, optionIndex) => (
                                          <option key={`${perguntaId}-${optionIndex}`} value={String(opcao)}>
                                            {String(opcao)}
                                          </option>
                                        ))}
                                      </select>
                                    ) : (
                                      <Textarea
                                        rows={2}
                                        placeholder="Digite sua resposta..."
                                        value={respostaAtual}
                                        onChange={(e) =>
                                          setAtividadeRespostas((prev) => ({
                                            ...prev,
                                            [atividade.id]: {
                                              ...(prev[atividade.id] || {}),
                                              [perguntaId]: e.target.value,
                                            },
                                          }))
                                        }
                                      />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="space-y-2">
                            <Label>Imagens da atividade (opcional, até 4)</Label>
                            <Input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={(e) => handleSelectActivityImages(atividade.id, e.target.files)}
                            />
                            {ensureArray(atividadeImagens[atividade.id]).length > 0 && (
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {ensureArray(atividadeImagens[atividade.id]).map((img, imageIndex) => (
                                  <div key={`${atividade.id}-img-${imageIndex}`} className="relative">
                                    <img src={img} alt={`Atividade ${imageIndex + 1}`} className="w-full h-20 object-cover rounded-md border" />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setAtividadeImagens((prev) => ({
                                          ...prev,
                                          [atividade.id]: ensureArray(prev[atividade.id]).filter((_, i) => i !== imageIndex),
                                        }))
                                      }
                                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
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
                <div className="space-y-2">
                  <Label>Prompt da imagem</Label>
                  <div className="flex gap-2">
                    <Input value={studioPrompt} onChange={(e) => setStudioPrompt(e.target.value)} placeholder="Descreva a imagem" />
                    <Button type="button" variant="outline" onClick={handleGerarImagemIA} disabled={gerandoImagemIA}>
                      <Sparkles className="w-4 h-4 mr-1" /> {gerandoImagemIA ? 'Gerando...' : 'Gerar'}
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Adicionar imagens do computador (até 8)</Label>
                  <Input type="file" accept="image/*" multiple onChange={(e) => handleAdicionarSlides(e.target.files)} />
                </div>
                {studioSlides.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {studioSlides.map((slide, index) => (
                      <div key={slide.id} className="relative">
                        <button
                          type="button"
                          className="w-full"
                          onClick={() => setSelectedStudioImageUrl(slide.url)}
                          title="Ampliar imagem"
                        >
                          <img
                            src={slide.url}
                            alt={`Imagem ${index + 1}`}
                            className="h-24 w-full object-cover rounded-md border cursor-zoom-in"
                          />
                        </button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="absolute left-1 top-1 h-6 w-6 p-0"
                          onClick={() => setSelectedStudioImageUrl(slide.url)}
                        >
                          <Expand className="w-3 h-3" />
                        </Button>
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
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={salvarProjetoStudioNoLaboratorio} disabled={saving || studioSlides.length === 0}>
                    Salvar projeto
                  </Button>
                  <Button type="button" onClick={handlePublicarStudio} disabled={saving || studioSlides.length === 0}>
                    Compartilhar na comunidade
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quiz com IA</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={quizLivroId}
                    onChange={(e) => setQuizLivroId(e.target.value)}
                  >
                    <option value="">Selecione um livro</option>
                    {livros.map((livro) => (
                      <option key={livro.id} value={livro.id}>
                        {livro.titulo}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={quizTema}
                    onChange={(e) => setQuizTema(e.target.value)}
                    placeholder="Tema do quiz (ex.: interpretação)"
                  />
                  <Button type="button" variant="outline" onClick={gerarQuizComIA} disabled={gerandoQuizIA}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    {gerandoQuizIA ? 'Gerando quiz...' : 'Gerar quiz IA'}
                  </Button>
                </div>

                {quiz.length > 0 && (
                  <div className="space-y-3">
                    {quiz.map((pergunta, index) => (
                      <div key={`${pergunta.enunciado}-${index}`} className="rounded-md border p-3 space-y-2">
                        <p className="text-sm font-medium">{index + 1}. {pergunta.enunciado}</p>
                        <div className="space-y-1">
                          {pergunta.opcoes.map((opcao, opcaoIndex) => (
                            <label key={`${index}-${opcaoIndex}`} className="flex items-center gap-2 text-sm">
                              <input
                                type="radio"
                                name={`quiz-${index}`}
                                checked={Number(quizRespostas[index]) === opcaoIndex}
                                onChange={() =>
                                  setQuizRespostas((prev) => ({
                                    ...prev,
                                    [index]: opcaoIndex,
                                  }))
                                }
                              />
                              <span>{opcao}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    ))}

                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" onClick={corrigirQuiz}>
                        Corrigir quiz
                      </Button>
                      <Button type="button" variant="outline" onClick={() => salvarQuizNoLaboratorio(false)} disabled={saving}>
                        Salvar quiz
                      </Button>
                      <Button type="button" variant="outline" onClick={() => salvarQuizNoLaboratorio(true)} disabled={saving}>
                        Compartilhar quiz
                      </Button>
                      {quizResultado && (
                        <Badge variant="outline">
                          Acertos: {quizResultado.acertos}/{quizResultado.total}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Resumo com IA</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <select
                    className="h-10 rounded-md border bg-background px-3 text-sm"
                    value={resumoLivroId}
                    onChange={(e) => setResumoLivroId(e.target.value)}
                  >
                    <option value="">Selecione um livro</option>
                    {livros.map((livro) => (
                      <option key={livro.id} value={livro.id}>
                        {livro.titulo}
                      </option>
                    ))}
                  </select>
                  <Button type="button" variant="outline" onClick={gerarResumo} disabled={gerandoResumoIA}>
                    <Sparkles className="w-4 h-4 mr-2" />
                    {gerandoResumoIA ? 'Gerando resumo...' : 'Gerar resumo IA'}
                  </Button>
                  <Button type="button" onClick={salvarResumo}>
                    Salvar resumo
                  </Button>
                </div>

                <Textarea
                  rows={8}
                  value={resumoTexto}
                  onChange={(e) => setResumoTexto(e.target.value)}
                  placeholder="O resumo gerado aparecerá aqui..."
                />

                {resumosCriados.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Resumos salvos</p>
                    {resumosCriados.slice(0, 5).map((resumo) => (
                      <div key={resumo.id} className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">{resumo.livroTitulo}</p>
                        <p className="text-sm line-clamp-3">{resumo.texto}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Criações salvas no laboratório</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex flex-wrap gap-2 rounded-lg border p-1 bg-muted/20">
                  <Button
                    type="button"
                    size="sm"
                    variant={filtroCriacoesLaboratorio === 'todas' ? 'default' : 'ghost'}
                    onClick={() => setFiltroCriacoesLaboratorio('todas')}
                  >
                    Todas
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={filtroCriacoesLaboratorio === 'imagem' ? 'default' : 'ghost'}
                    onClick={() => setFiltroCriacoesLaboratorio('imagem')}
                  >
                    Imagens
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={filtroCriacoesLaboratorio === 'resumo' ? 'default' : 'ghost'}
                    onClick={() => setFiltroCriacoesLaboratorio('resumo')}
                  >
                    Resumos
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={filtroCriacoesLaboratorio === 'quiz' ? 'default' : 'ghost'}
                    onClick={() => setFiltroCriacoesLaboratorio('quiz')}
                  >
                    Quiz
                  </Button>
                </div>

                {criacoesLaboratorioFiltradas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma criação salva ainda.</p>
                ) : (
                  <div className="space-y-3">
                    {criacoesLaboratorioFiltradas.slice(0, 20).map((criacao) => (
                      <div key={criacao.id} className="rounded-md border p-3 space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">{criacao.titulo || 'Criação sem título'}</p>
                            <p className="text-xs text-muted-foreground">
                              {criacao.tipo} • {formatDateBR(criacao.created_at)}
                            </p>
                          </div>
                          <Button type="button" size="sm" variant="destructive" onClick={() => apagarCriacaoLaboratorio(criacao)} disabled={saving}>
                            <Trash2 className="w-3 h-3 mr-1" />
                            Apagar
                          </Button>
                        </div>
                        {ensureArray(criacao.imagem_urls).length > 0 && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {ensureArray(criacao.imagem_urls).slice(0, 4).map((img, index) => (
                              <button type="button" key={`${criacao.id}-${index}`} onClick={() => setSelectedStudioImageUrl(img)}>
                                <img src={img} alt={`Criação ${index + 1}`} className="h-20 w-full rounded-md border object-cover cursor-zoom-in" />
                              </button>
                            ))}
                          </div>
                        )}
                        {criacao.descricao && <p className="text-sm text-muted-foreground">{criacao.descricao}</p>}
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
              <CardContent className="pt-6 space-y-4">
                <div className="flex flex-wrap gap-2 rounded-lg border p-1 bg-muted/20">
                  <Button
                    type="button"
                    size="sm"
                    variant={bibliotecaView === 'meus_livros' ? 'default' : 'ghost'}
                    onClick={() => setBibliotecaView('meus_livros')}
                  >
                    Meus livros
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={bibliotecaView === 'minhas_solicitacoes' ? 'default' : 'ghost'}
                    onClick={() => setBibliotecaView('minhas_solicitacoes')}
                  >
                    Minhas solicitações
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={bibliotecaView === 'biblioteca' ? 'default' : 'ghost'}
                    onClick={() => setBibliotecaView('biblioteca')}
                  >
                    Biblioteca
                  </Button>
                </div>

                {bibliotecaView === 'meus_livros' && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">Meus livros</p>
                    {filteredMeusLivros.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Você ainda não tem livros aprovados/emprestados.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {filteredMeusLivros.map((item) => (
                          <div key={item.id} className="rounded-xl border overflow-hidden bg-card">
                            <div className="h-24 bg-gradient-to-br from-primary/25 via-primary/10 to-transparent p-3 flex items-start justify-end">
                              <Badge variant={item.status === 'ativo' ? 'default' : 'secondary'}>
                                {item.status}
                              </Badge>
                            </div>
                            <div className="p-3 space-y-1.5">
                              <p className="text-sm font-semibold line-clamp-2">{item.livros?.titulo || 'Livro'}</p>
                              <p className="text-xs text-muted-foreground line-clamp-1">{item.livros?.autor || '-'}</p>
                              <p className="text-xs text-muted-foreground">
                                Empréstimo: {formatDateBR(item.data_emprestimo)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {bibliotecaView === 'biblioteca' && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">Biblioteca</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {filteredLivros.slice(0, 80).map((livro) => (
                        <div key={livro.id} className="rounded-xl border overflow-hidden bg-card">
                          <div className="h-24 bg-gradient-to-br from-secondary/30 via-secondary/10 to-transparent p-3 flex items-start justify-between gap-2">
                            <Badge variant="outline" className="text-xs">{livro.area || 'Geral'}</Badge>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => toggleWishlist(livro.id)}>
                              <Heart className={`w-4 h-4 ${wishlist.includes(livro.id) ? 'fill-destructive text-destructive' : ''}`} />
                            </Button>
                          </div>
                          <div className="p-3 space-y-2">
                            <p className="font-semibold line-clamp-2">{livro.titulo}</p>
                            <p className="text-sm text-muted-foreground line-clamp-1">{livro.autor}</p>
                            <Badge variant={livro.disponivel ? 'default' : 'secondary'} className="text-xs">
                              {livro.disponivel ? 'Disponível' : 'Emprestado'}
                            </Badge>

                            {livro.sinopse && (
                              <div>
                                <p className="text-xs text-muted-foreground line-clamp-2" translate="no">{livro.sinopse}</p>
                                <Button size="sm" variant="ghost" className="h-6 px-1 text-xs mt-1" onClick={() => speakText(livro.sinopse || '')}>
                                  {speaking ? <VolumeX className="w-3 h-3 mr-1" /> : <Volume2 className="w-3 h-3 mr-1" />}
                                  {speaking ? 'Parar' : 'Ouvir sinopse'}
                                </Button>
                              </div>
                            )}

                            <div className="flex gap-1 pt-1">
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
                                  setShareReviewToCommunity(false);
                                  setReviewDialog(true);
                                }}
                              >
                                <Star className="w-3 h-3 mr-1" /> Avaliar
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {bibliotecaView === 'minhas_solicitacoes' && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">Minhas solicitações de empréstimo</p>
                    <div className="flex flex-wrap gap-2 rounded-lg border p-1 bg-muted/20">
                      <Button
                        type="button"
                        size="sm"
                        variant={solicitacoesView === 'em_andamento' ? 'default' : 'ghost'}
                        onClick={() => setSolicitacoesView('em_andamento')}
                      >
                        Em andamento ({solicitacoesGroups.em_andamento.length})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={solicitacoesView === 'aceitos' ? 'default' : 'ghost'}
                        onClick={() => setSolicitacoesView('aceitos')}
                      >
                        Aceitos ({solicitacoesGroups.aceitos.length})
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={solicitacoesView === 'historico' ? 'default' : 'ghost'}
                        onClick={() => setSolicitacoesView('historico')}
                      >
                        Histórico ({solicitacoesGroups.historico.length})
                      </Button>
                    </div>
                    {solicitacoesExibidas.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">Você ainda não fez solicitações.</p>
                    ) : (
                      <div className="space-y-3">
                        {solicitacoesExibidas.map((solicitacao) => (
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
                  </div>
                )}
              </CardContent>
            </Card>
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
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={shareReviewToCommunity}
                onChange={(e) => setShareReviewToCommunity(e.target.checked)}
                className="h-4 w-4 rounded border border-input"
              />
              Compartilhar esta resenha na comunidade da escola
            </label>
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

      <Dialog open={Boolean(selectedStudioImageUrl)} onOpenChange={(open) => !open && setSelectedStudioImageUrl('')}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>Visualização ampliada</DialogTitle>
            <DialogDescription>Clique fora para fechar. Use a imagem em tamanho maior para analisar detalhes.</DialogDescription>
          </DialogHeader>
          {selectedStudioImageUrl && (
            <img
              src={selectedStudioImageUrl}
              alt="Imagem ampliada do laboratório"
              className="w-full max-h-[75vh] object-contain rounded-md border"
            />
          )}
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
