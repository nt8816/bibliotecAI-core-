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
  Loader2,
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
import { Checkbox } from '@/components/ui/checkbox';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  createPainelAlunoAudiobook,
  createPainelAlunoLabCreation,
  createPainelAlunoLoanExtensionRequest,
  createPainelAlunoLoanRequest,
  deletePainelAlunoActivitiesBatch,
  deletePainelAlunoLabCreation,
  fetchPainelAlunoBooks,
  fetchPainelAlunoData,
  markPainelAlunoNotificationRead,
  markPainelAlunoNotificationsReadBatch,
  savePainelAlunoReview,
  savePainelAlunoChallenge,
  sendPainelAlunoSolicitacaoChatMessage,
  submitPainelAlunoActivity,
  togglePainelAlunoWishlist,
  togglePainelAlunoAudiobook,
  updatePainelAlunoPassword,
  updatePainelAlunoLabCreation,
} from '@/services/painelAlunoService';
import { getSupabaseRealtimeClient } from '@/integrations/supabase/client';
import { getBrowserNotificationPermission, showBrowserNotification } from '@/lib/browserNotifications';
import { createComunidadePost } from '@/services/comunidadeAlunoService';
import {
  generateAudioWithCloudflare,
  generateImageWithCloudflare,
  generateTextWithCloudflare,
} from '@/lib/cloudflareAiApi';
import { canonicalizeBookArea } from '@/lib/bookAreas';
import { uploadDataUrlToR2 } from '@/lib/r2Storage';
import { resolveR2MediaUrl, resolveR2MediaUrls } from '@/lib/resolveR2Media';

const ENABLE_OPTIONAL_STUDENT_FEATURES = import.meta.env.VITE_ENABLE_OPTIONAL_STUDENT_FEATURES !== 'false';
const CACHE_TTL_MS = 5 * 60 * 1000;
const DESAFIO_IA_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function formatDateBR(dateValue) {
  if (!dateValue) return '-';
  try {
    return format(new Date(dateValue), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return '-';
  }
}

function formatDateInputValue(dateValue) {
  if (!dateValue) return '';
  try {
    return format(new Date(dateValue), 'yyyy-MM-dd');
  } catch {
    return '';
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

function normalizeTurmaKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isExpiredComunicado(item) {
  if (!item?.expires_at) return false;
  const expiresAt = new Date(item.expires_at);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date();
}

function sortByDateDesc(list, field = 'created_at') {
  return [...ensureArray(list)].sort(
    (a, b) => new Date(b?.[field] || 0).getTime() - new Date(a?.[field] || 0).getTime(),
  );
}

function sortByTitulo(list) {
  return [...ensureArray(list)].sort((a, b) => String(a?.titulo || '').localeCompare(String(b?.titulo || ''), 'pt-BR'));
}

function repairMojibakeText(value) {
  const text = String(value || '');
  if (!text || !/[ÃÂ]/.test(text)) return text;
  try {
    return decodeURIComponent(escape(text));
  } catch {
    return text;
  }
}

const ALUNO_ONBOARDING_CARDS = [
  {
    title: 'Bem-vindo ao BibliotecAI',
    description: 'Você vai ver um resumo rápido de como usar a plataforma.',
  },
  {
    title: 'Catálogo e empréstimos',
    description: 'Use a Biblioteca para solicitar livros e acompanhe seus empréstimos em Meus livros.',
  },
  {
    title: 'Laboratório e comunidade',
    description: 'Quizzes, resumos e publicações só podem usar livros que já estejam nos seus empréstimos ativos.',
  },
];

function normalizeCriacaoShareTipo(criacao) {
  const tipo = String(criacao?.tipo || '');
  if (tipo === 'quiz') return 'quiz';
  if (tipo === 'resenha') return 'resenha';
  if (tipo === 'resumo') return 'sugestão';
  return 'dica';
}

function normalizeLivroCategoria(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getLivroXpPorCategoria(area) {
  const categoria = normalizeLivroCategoria(area);

  if (!categoria) return 18;

  if (
    categoria.includes('quadrinho') ||
    categoria.includes('hq') ||
    categoria.includes('gibi') ||
    categoria.includes('manga') ||
    categoria.includes('comic')
  ) {
    return 5;
  }

  if (
    categoria.includes('infantil') ||
    categoria.includes('ilustrado') ||
    categoria.includes('figur') ||
    categoria.includes('visual')
  ) {
    return 8;
  }

  if (
    categoria.includes('poesia') ||
    categoria.includes('poema') ||
    categoria.includes('conto') ||
    categoria.includes('cronica')
  ) {
    return 12;
  }

  if (
    categoria.includes('arte') ||
    categoria.includes('teatro') ||
    categoria.includes('musica') ||
    categoria.includes('cultura')
  ) {
    return 14;
  }

  if (
    categoria.includes('literatura') ||
    categoria.includes('romance') ||
    categoria.includes('portugues') ||
    categoria.includes('gramatica') ||
    categoria.includes('historia') ||
    categoria.includes('geografia') ||
    categoria.includes('biografia') ||
    categoria.includes('filosofia') ||
    categoria.includes('sociologia')
  ) {
    return 20;
  }

  if (
    categoria.includes('matematica') ||
    categoria.includes('fisica') ||
    categoria.includes('quimica') ||
    categoria.includes('biologia') ||
    categoria.includes('ciencia') ||
    categoria.includes('tecnico') ||
    categoria.includes('programacao') ||
    categoria.includes('informatica') ||
    categoria.includes('desenvolvimento')
  ) {
    return 25;
  }

  return 18;
}

function getLivroXpDescricao(area) {
  const categoria = normalizeLivroCategoria(area);

  if (
    categoria.includes('quadrinho') ||
    categoria.includes('hq') ||
    categoria.includes('gibi') ||
    categoria.includes('manga') ||
    categoria.includes('comic')
  ) {
    return 'XP minimo por ser uma leitura predominantemente visual';
  }

  if (
    categoria.includes('infantil') ||
    categoria.includes('ilustrado') ||
    categoria.includes('figur') ||
    categoria.includes('visual')
  ) {
    return 'XP reduzido por ter forte apoio visual';
  }

  if (
    categoria.includes('matematica') ||
    categoria.includes('fisica') ||
    categoria.includes('quimica') ||
    categoria.includes('biologia') ||
    categoria.includes('ciencia') ||
    categoria.includes('tecnico') ||
    categoria.includes('programacao') ||
    categoria.includes('informatica') ||
    categoria.includes('desenvolvimento')
  ) {
    return 'XP elevado por exigir leitura mais densa';
  }

  return 'XP definido pela categoria do livro';
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

function removeCache(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore cache failures
  }
}

function extractXpFromRewardText(value) {
  const match = String(value || '').match(/(\d+)\s*xp/i);
  return match ? Number(match[1]) : 0;
}

function normalizeDesafioCriterionType(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');

  if (normalized === 'livros_lidos') return 'livros_lidos';
  if (normalized === 'avaliacoes' || normalized === 'avaliacao' || normalized === 'avaliacoes_publicadas') return 'avaliacoes';
  if (normalized === 'atividades_aprovadas' || normalized === 'atividade_aprovada') return 'atividades_aprovadas';
  return '';
}

function normalizeDesafioIA(rawValue) {
  const raw = rawValue && typeof rawValue === 'object' ? rawValue : null;
  if (!raw?.titulo || !raw?.desafio) return null;

  const geradoEm = raw.gerado_em || raw.geradoEm || new Date().toISOString();
  const expiraEm = raw.expira_em || raw.expiraEm || new Date(new Date(geradoEm).getTime() + DESAFIO_IA_TTL_MS).toISOString();

  if (Number.isNaN(new Date(expiraEm).getTime()) || new Date(expiraEm).getTime() <= Date.now()) {
    return null;
  }

  return {
    ...raw,
    gerado_em: geradoEm,
    expira_em: expiraEm,
    concluido_em: raw.concluido_em || raw.concluidoEm || null,
    xp_recompensa: Math.max(0, Number(raw.xp_recompensa ?? extractXpFromRewardText(raw.recompensa))),
  };
}

function buildDesafioMetricas({ livrosLidos, avaliacoesCount, atividadesAprovadas }) {
  return {
    livros_lidos: Math.max(0, Number(livrosLidos || 0)),
    avaliacoes: Math.max(0, Number(avaliacoesCount || 0)),
    atividades_aprovadas: Math.max(0, Number(atividadesAprovadas || 0)),
  };
}

function getDesafioPerfilPorNivel(nivel) {
  const safeNivel = Math.max(1, Number(nivel) || 1);

  if (safeNivel <= 2) {
    return {
      chave: 'iniciante',
      descricao: 'iniciante',
      candidatos: [
        {
          tipo: 'livros_lidos',
          incremento: 1,
          rotulo: 'ler 1 livro diferenciado indicado pela IA',
        },
      ],
    };
  }

  if (safeNivel <= 4) {
    return {
      chave: 'intermediario',
      descricao: 'intermediario',
      candidatos: [
        {
          tipo: 'livros_lidos',
          incremento: 1,
          rotulo: 'concluir 1 nova leitura',
        },
        {
          tipo: 'avaliacoes',
          incremento: 1,
          rotulo: 'publicar 1 nova avaliação',
        },
      ],
    };
  }

  return {
    chave: 'avancado',
    descricao: 'avancado',
    candidatos: [
      {
        tipo: 'avaliacoes',
        incremento: 1,
        rotulo: 'publicar 1 nova avaliação',
      },
      {
        tipo: 'atividades_aprovadas',
        incremento: 1,
        rotulo: 'ter 1 atividade aprovada',
      },
      {
        tipo: 'livros_lidos',
        incremento: 1,
        rotulo: 'concluir 1 nova leitura mais desafiadora',
      },
    ],
  };
}

function getBookReadingBandForLevel(nivel) {
  const safeNivel = Math.max(1, Number(nivel) || 1);
  if (safeNivel <= 2) {
    return {
      chave: 'curto_facil',
      descricao: 'livros curtos, linguagem simples e entrada acolhedora para ganhar ritmo de leitura',
      maxSynopsisChars: 220,
      preferredAreas: ['infantil', 'literatura', 'contos', 'fabula', 'poesia'],
    };
  }

  if (safeNivel <= 4) {
    return {
      chave: 'curto_medio',
      descricao: 'livros curtos ou medianos, com vocabulário um pouco mais rico e temas levemente mais densos',
      maxSynopsisChars: 420,
      preferredAreas: ['literatura', 'aventura', 'contos', 'cronica', 'fantasia'],
    };
  }

  if (safeNivel <= 7) {
    return {
      chave: 'medio',
      descricao: 'livros de tamanho médio, com mais interpretação, personagens e construção temática',
      maxSynopsisChars: 700,
      preferredAreas: ['literatura', 'aventura', 'fantasia', 'misterio', 'biografia', 'historia'],
    };
  }

  return {
    chave: 'medio_longo_desafiador',
    descricao: 'livros mais densos ou desafiadores, com leitura sustentada e reflexão mais profunda',
    maxSynopsisChars: 1200,
    preferredAreas: ['literatura', 'historia', 'biografia', 'ciencias', 'filosofia', 'romance'],
  };
}

function estimateBookComplexityForLevel(livro, nivel) {
  const area = canonicalizeBookArea(livro?.area) || '';
  const synopsisLength = String(livro?.sinopse || '').trim().length;
  const titleLength = String(livro?.titulo || '').trim().length;
  const readingBand = getBookReadingBandForLevel(nivel);
  let score = 0;

  if (readingBand.preferredAreas.includes(area)) score += 4;
  if (synopsisLength > 0 && synopsisLength <= readingBand.maxSynopsisChars) score += 3;
  else if (synopsisLength === 0) score += 1;
  else if (synopsisLength <= readingBand.maxSynopsisChars * 1.5) score += 1;
  else score -= 2;

  if (titleLength > 0 && titleLength <= 28) score += 1;

  const complexityBand =
    synopsisLength <= 220 ? 'curto' :
    synopsisLength <= 500 ? 'medio' :
    'mais_denso';

  return {
    score,
    area,
    complexityBand,
    readingBand,
  };
}

function escolherCriterioDesafioLegacy(metricas) {
  const candidatos = [
    {
      tipo: 'livros_lidos',
      incremento: 1,
      rotulo: 'concluir 1 nova leitura',
    },
    {
      tipo: 'avaliacoes',
      incremento: 1,
      rotulo: 'publicar 1 nova avaliação',
    },
    {
      tipo: 'atividades_aprovadas',
      incremento: 1,
      rotulo: 'ter 1 atividade aprovada',
    },
  ];

  const indice = new Date().getDate() % candidatos.length;
  const criterioBase = candidatos[indice];
  const valorAtual = Math.max(0, Number(metricas?.[criterioBase.tipo] || 0));

  return {
    tipo: criterioBase.tipo,
    valor_inicial: valorAtual,
    alvo_total: valorAtual + criterioBase.incremento,
    incremento: criterioBase.incremento,
    rotulo: criterioBase.rotulo,
  };
}

function normalizarCriterioDesafioLegacy(rawCriterio, metricasAtuais) {
  const fallback = escolherCriterioDesafioLegacy(metricasAtuais);
  const criterio = rawCriterio && typeof rawCriterio === 'object' ? rawCriterio : {};
  const tipo = normalizeDesafioCriterionType(criterio.tipo) || fallback.tipo;
  const valorInicial = Math.max(
    0,
    Number(criterio.valor_inicial ?? criterio.valorInicial ?? metricasAtuais?.[tipo] ?? fallback.valor_inicial),
  );
  const alvoTotal = Math.max(
    valorInicial + 1,
    Number(criterio.alvo_total ?? criterio.alvoTotal ?? valorInicial + Number(criterio.incremento ?? fallback.incremento ?? 1)),
  );

  return {
    tipo,
    valor_inicial: valorInicial,
    alvo_total: alvoTotal,
    incremento: Math.max(1, alvoTotal - valorInicial),
    rotulo: String(criterio.rotulo || fallback.rotulo || '').trim() || fallback.rotulo,
  };
}

function escolherCriterioDesafio(metricas, nivel = 1) {
  const perfil = getDesafioPerfilPorNivel(nivel);
  const candidatos = Array.isArray(perfil?.candidatos) && perfil.candidatos.length > 0
    ? perfil.candidatos
    : [
        {
          tipo: 'livros_lidos',
          incremento: 1,
          rotulo: 'concluir 1 nova leitura',
        },
      ];

  const indice = new Date().getDate() % candidatos.length;
  const criterioBase = candidatos[indice];
  const valorAtual = Math.max(0, Number(metricas?.[criterioBase.tipo] || 0));

  return {
    perfil_nivel: perfil?.chave || 'iniciante',
    tipo: criterioBase.tipo,
    valor_inicial: valorAtual,
    alvo_total: valorAtual + criterioBase.incremento,
    incremento: criterioBase.incremento,
    rotulo: criterioBase.rotulo,
  };
}

function normalizarCriterioDesafioPorNivel(rawCriterio, metricasAtuais, nivel = 1) {
  const fallback = escolherCriterioDesafio(metricasAtuais, nivel);
  const criterio = rawCriterio && typeof rawCriterio === 'object' ? rawCriterio : {};
  const tipo = normalizeDesafioCriterionType(criterio.tipo) || fallback.tipo;
  const valorInicial = Math.max(
    0,
    Number(criterio.valor_inicial ?? criterio.valorInicial ?? metricasAtuais?.[tipo] ?? fallback.valor_inicial),
  );
  const alvoTotal = Math.max(
    valorInicial + 1,
    Number(criterio.alvo_total ?? criterio.alvoTotal ?? valorInicial + Number(criterio.incremento ?? fallback.incremento ?? 1)),
  );

  return {
    tipo,
    valor_inicial: valorInicial,
    alvo_total: alvoTotal,
    incremento: Math.max(1, alvoTotal - valorInicial),
    rotulo: String(criterio.rotulo || fallback.rotulo || '').trim() || fallback.rotulo,
  };
}

function desafioFoiConcluidoPelaPlataforma(desafio, metricas) {
  const criterio = desafio?.criterio;
  if (!criterio?.tipo) return false;
  const valorAtual = Math.max(0, Number(metricas?.[criterio.tipo] || 0));
  return valorAtual >= Math.max(1, Number(criterio.alvo_total || 0));
}

function extractResumoTextoFromCriacao(criacao) {
  if (!criacao) return '';
  if (criacao.texto) return String(criacao.texto);
  const raw = criacao.conteudo_json;
  if (!raw) return '';
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return String(parsed?.texto || '');
    } catch {
      return String(raw);
    }
  }
  if (typeof raw === 'object') {
    return String(raw?.texto || '');
  }
  return '';
}

function extractQuizFromCriacao(criacao) {
  if (!criacao) return null;
  const raw = criacao.conteudo_json;
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') return raw;
  return null;
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

async function insertCommunityPostCompat(payload, options = {}) {
  try {
    const result = await createComunidadePost(payload);
    if (options.expectSingleId) {
      return { data: { id: result?.postId || null }, error: null };
    }
    return { data: result || null, error: null };
  } catch (error) {
    return { data: null, error };
  }
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

function isDataUrl(value) {
  return typeof value === 'string' && value.startsWith('data:');
}

function ResolvedMediaImage({ value, alt, className, linkClassName = '' }) {
  const [src, setSrc] = useState(() => (typeof value === 'string' ? value : ''));

  useEffect(() => {
    let active = true;

    (async () => {
      const resolved = await resolveR2MediaUrl(value, alt || 'imagem');
      if (active) {
        setSrc(typeof resolved === 'string' ? resolved : '');
      }
    })();

    return () => {
      active = false;
    };
  }, [alt, value]);

  if (!src) {
    return <div className={`${className} bg-muted`} />;
  }

  const image = <img src={src} alt={alt} className={className} />;

  if (linkClassName) {
    return (
      <a href={src} target="_blank" rel="noreferrer" className={linkClassName}>
        {image}
      </a>
    );
  }

  return image;
}

async function persistStudioSlidesToR2({ slides, escolaId, alunoId }) {
  const currentSlides = Array.isArray(slides) ? slides : [];

  return Promise.all(currentSlides.map(async (slide, index) => {
    const currentUrl = String(slide?.url || '');
    if (!currentUrl) return null;
    if (!currentUrl.startsWith('data:')) return currentUrl;

    const extension = currentUrl.includes('image/png') ? 'png' : currentUrl.includes('image/webp') ? 'webp' : 'jpg';
    const upload = await uploadDataUrlToR2({
      dataUrl: currentUrl,
      escolaId,
      ownerId: alunoId,
      scope: 'laboratorio',
      fileName: `slide-${index + 1}.${extension}`,
    });

    return upload.objectKey;
  }));
}

async function resolveAudiobookRecord(record) {
  if (!record) return record;
  return {
    ...record,
    audio_url: await resolveR2MediaUrl(record.audio_url, `${record.id || 'audiobook'}.mp3`),
  };
}

async function resolveAlunoAudiobookRecord(record) {
  if (!record) return record;
  return {
    ...record,
    audiobooks_biblioteca: record.audiobooks_biblioteca
      ? await resolveAudiobookRecord(record.audiobooks_biblioteca)
      : record.audiobooks_biblioteca,
  };
}

async function resolveLabCriacaoRecord(record) {
  if (!record) return record;
  return {
    ...record,
    imagem_urls_r2_keys: ensureArray(record.imagem_urls),
    imagem_urls: await resolveR2MediaUrls(ensureArray(record.imagem_urls), `laboratorio-${record.id || 'criacao'}`),
  };
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
  if (typeof rawOptions === 'string') {
    const raw = rawOptions.trim();
    if (!raw) return [];

    const letterSplit = raw
      .split(/(?:^|\n|\r)\s*[A-D][\)\].:\-]\s*/i)
      .map((part) => normalizeQuizOptionText(part))
      .filter(Boolean);
    if (letterSplit.length >= 2) return letterSplit;

    const lineSplit = raw
      .split(/\n|\\n|;|\|/g)
      .map((part) => normalizeQuizOptionText(part))
      .filter(Boolean);
    if (lineSplit.length >= 2) return lineSplit;

    const commaSplit = raw
      .split(/\s*,\s*/)
      .map((part) => normalizeQuizOptionText(part))
      .filter(Boolean);
    if (commaSplit.length >= 2) return commaSplit;
  }

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
    .slice(0, 6);
}

function normalizeQuizCorrectIndex(rawCorrect, options) {
  if (Number.isInteger(rawCorrect)) {
    if (rawCorrect >= 0 && rawCorrect < options.length) return rawCorrect;
    if (rawCorrect >= 1 && rawCorrect <= options.length) return rawCorrect - 1;
  }

  const text = String(rawCorrect || '').trim();
  if (!text) return -1;

  const asNumber = Number(text);
  if (Number.isInteger(asNumber)) {
    if (asNumber >= 0 && asNumber < options.length) return asNumber;
    if (asNumber >= 1 && asNumber <= options.length) return asNumber - 1;
  }

  const letterMatch = text.match(/\b([A-Z])\b/i);
  if (letterMatch?.[1]) {
    const idx = letterMatch[1].toUpperCase().charCodeAt(0) - 65;
    if (idx >= 0 && idx < options.length) return idx;
  }

  const cleaned = normalizeQuizOptionText(text).toLowerCase();
  if (!cleaned) return -1;
  const optionIndex = options.findIndex((option) => normalizeQuizOptionText(option).toLowerCase() === cleaned);
  return optionIndex;
}

function extractQuizPerguntasFromIAResponse(response) {
  const data = response?.data && typeof response.data === 'object' ? response.data : {};
  const textJson = extractJsonFromIAPlainText(response?.text);

  let rawPerguntas = [
    data?.perguntas,
    data?.questoes,
    data?.questions,
    data?.quiz?.perguntas,
    data?.quiz?.questoes,
    data?.quiz?.questions,
    textJson?.perguntas,
    textJson?.questoes,
    textJson?.questions,
    textJson?.quiz?.perguntas,
    textJson?.quiz?.questoes,
    textJson?.quiz?.questions,
    Array.isArray(textJson) ? textJson : null,
  ].find((item) => Array.isArray(item));

  if (!rawPerguntas) {
    rawPerguntas = extractQuizPerguntasFromPlainText(response?.text);
  }

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
    .filter((item) => item.enunciado && item.opcoes.length >= 2 && Number.isInteger(item.correta) && item.correta >= 0 && item.correta < item.opcoes.length)
    .slice(0, 10);
}

function extractDesafioIAFromResponse(response) {
  const data = response?.data && typeof response.data === 'object' ? response.data : {};
  const textJson = extractJsonFromIAPlainText(response?.text);

  const desafio = [
    data,
    data?.desafio_ia,
    data?.desafio,
    data?.challenge,
    textJson,
    textJson?.desafio_ia,
    textJson?.desafio,
    textJson?.challenge,
  ].find((item) => item && typeof item === 'object' && !Array.isArray(item));

  return desafio && typeof desafio === 'object' ? desafio : {};
}

function extractQuizPerguntasFromPlainText(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return [];

  const blocks = [...text.matchAll(/(?:^|\n)\s*\d+\)\s*([\s\S]*?)(?=\n\s*\d+\)|$)/g)]
    .map((match) => match[1]?.trim())
    .filter(Boolean);

  return blocks.map((block) => {
    const optionMatches = [...block.matchAll(/(?:^|\n)\s*([A-Z])[\)\].:\-]\s*(.+)/g)];
    const firstOptionIndex = optionMatches[0]?.index ?? -1;
    const enunciado = (firstOptionIndex >= 0 ? block.slice(0, firstOptionIndex) : block).trim();
    const opcoes = optionMatches.map((match) => normalizeQuizOptionText(match[2]));

    const respostaMatch = block.match(/resposta\s*[:\-]\s*([A-Z0-9])/i);
    const correta = normalizeQuizCorrectIndex(respostaMatch?.[1], opcoes);

    return { enunciado, opcoes, correta };
  });
}

export default function PainelAluno() {

  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const [alunoId, setAlunoId] = useState(null);
  const [escolaId, setEscolaId] = useState(null);
  const [alunoTurma, setAlunoTurma] = useState(null);
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
  const [comunicados, setComunicados] = useState([]);

  const [searchTerm, setSearchTerm] = useState('');
  const [catalogoSearchTerm, setCatalogoSearchTerm] = useState('');
  const [catalogoAreaFilter, setCatalogoAreaFilter] = useState('all');
  const [catalogoDisponibilidadeFilter, setCatalogoDisponibilidadeFilter] = useState('all');
  const [catalogoAutorFilter, setCatalogoAutorFilter] = useState('all');
  const [livrosOffset, setLivrosOffset] = useState(0);
  const [livrosHasMore, setLivrosHasMore] = useState(false);
  const [livrosLoadingMore, setLivrosLoadingMore] = useState(false);
  const [bibliotecaView, setBibliotecaView] = useState('biblioteca');
  const [solicitacoesView, setSolicitacoesView] = useState('pendentes');
  const [speakingLivroId, setSpeakingLivroId] = useState(null);
  const [speakingPhase, setSpeakingPhase] = useState('idle');
  const [ariaLiveMessage, setAriaLiveMessage] = useState('');
  const [notificacoesLidas, setNotificacoesLidas] = useState(new Set());

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
  const [shareCriacaoDialogOpen, setShareCriacaoDialogOpen] = useState(false);
  const [shareCriacaoItem, setShareCriacaoItem] = useState(null);
  const [shareCriacaoTitulo, setShareCriacaoTitulo] = useState('');
  const [shareCriacaoDescricao, setShareCriacaoDescricao] = useState('');
  const [shareCriacaoTipo, setShareCriacaoTipo] = useState('dica');
  const [deleteStudioSlideDialogOpen, setDeleteStudioSlideDialogOpen] = useState(false);
  const [deleteStudioSlideItem, setDeleteStudioSlideItem] = useState(null);
  const [deleteCriacaoDialogOpen, setDeleteCriacaoDialogOpen] = useState(false);
  const [deleteCriacaoItem, setDeleteCriacaoItem] = useState(null);
  const [quizLivroId, setQuizLivroId] = useState('');
  const [quizTema, setQuizTema] = useState('');
  const [quiz, setQuiz] = useState([]);
  const [quizRespostas, setQuizRespostas] = useState({});
  const [quizResultado, setQuizResultado] = useState(null);
  const [gerandoQuizIA, setGerandoQuizIA] = useState(false);

  const [atividadeTexto, setAtividadeTexto] = useState({});
  const [atividadeImagens, setAtividadeImagens] = useState({});
  const [atividadeRespostas, setAtividadeRespostas] = useState({});
  const [atividadeView, setAtividadeView] = useState('pendentes');
  const [selectedAtividadeIds, setSelectedAtividadeIds] = useState([]);
  const [deleteAtividadesDialogOpen, setDeleteAtividadesDialogOpen] = useState(false);
  const [mensagemSolicitacaoPorId, setMensagemSolicitacaoPorId] = useState({});
  const [saving, setSaving] = useState(false);
  const [showAccessChoice, setShowAccessChoice] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [extensionDialogOpen, setExtensionDialogOpen] = useState(false);
  const [extensionEmprestimo, setExtensionEmprestimo] = useState(null);
  const [extensionRequestedDate, setExtensionRequestedDate] = useState('');
  const [extensionMessage, setExtensionMessage] = useState('');
  const [primeiroAcessoPassword, setPrimeiroAcessoPassword] = useState('');
  const [primeiroAcessoConfirmPassword, setPrimeiroAcessoConfirmPassword] = useState('');
  const [updatingPrimeiroAcessoPassword, setUpdatingPrimeiroAcessoPassword] = useState(false);
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
  const [desafioXpBonus, setDesafioXpBonus] = useState(0);
  const [salvandoDesafioIA, setSalvandoDesafioIA] = useState(false);
  const [resumoDialogOpen, setResumoDialogOpen] = useState(false);
  const [resumoSelecionado, setResumoSelecionado] = useState(null);
  const [sinopseDialogOpen, setSinopseDialogOpen] = useState(false);
  const [sinopseLivroSelecionado, setSinopseLivroSelecionado] = useState(null);
  const [resumoRapidoOpen, setResumoRapidoOpen] = useState(false);
  const [resumoRapidoData, setResumoRapidoData] = useState(null);
  const [resumoRapidoLoadingId, setResumoRapidoLoadingId] = useState('');
  const [solicitacoesLimit, setSolicitacoesLimit] = useState(10);
  const [criacoesLimit, setCriacoesLimit] = useState(10);
  const [resumosLimit, setResumosLimit] = useState(5);
  const warnedMissingFeaturesRef = useRef(false);
  const fetchInFlightRef = useRef(null);
  const catalogoInicialCarregadoRef = useRef(false);
  const audioPlayerRef = useRef(null);
  const speechRequestRef = useRef(0);
  const speakingLivroIdRef = useRef(null);
  const seenAlunoNotificationIdsRef = useRef(new Set());
  const alunoNotificationsReadyRef = useRef(false);
  const activityImageInputRefs = useRef({});
  const desafioCacheKey = useMemo(
    () => (user?.id ? `aluno:desafio-ia:${user.id}` : ''),
    [user?.id],
  );
  const alunoOnboardingKey = useMemo(() => (user?.id ? `onboarding:aluno:${user.id}` : ''), [user?.id]);
  const alunoSenhaDefinidaKey = useMemo(() => (user?.id ? `aluno:senha-definida:${user.id}` : ''), [user?.id]);
  const alunoSenhaDefinida = useMemo(
    () => user?.user_metadata?.senha_definida === true || localStorage.getItem(alunoSenhaDefinidaKey) === 'true',
    [alunoSenhaDefinidaKey, user?.user_metadata?.senha_definida],
  );
  const livrosCacheKey = useMemo(() => {
    const termKey = catalogoSearchTerm.trim().toLowerCase();
    const escolaCacheKey = escolaId || 'sem-escola';
    return `aluno:livros:${escolaCacheKey}:${termKey}:page0`;
  }, [catalogoSearchTerm, escolaId]);

  useEffect(() => {
    if (!desafioCacheKey) {
      setDesafioIA(null);
      return;
    }

    const cachedDesafio = normalizeDesafioIA(readCache(desafioCacheKey, DESAFIO_IA_TTL_MS));
    if (cachedDesafio) {
      setDesafioIA(cachedDesafio);
      return;
    }

    removeCache(desafioCacheKey);
    setDesafioIA(null);
  }, [desafioCacheKey]);

  const fetchLivrosPage = useCallback(
    async ({ reset = false, useCache = true } = {}) => {
      if (reset && useCache) {
        const cached = readCache(livrosCacheKey);
        if (Array.isArray(cached)) {
          setLivros(cached);
          setLivrosOffset(cached.length);
          setLivrosHasMore(false);
          return;
        }
      }

      setLivrosLoadingMore(true);
      try {
        const payload = await fetchPainelAlunoBooks({
          escolaId,
          searchTerm: catalogoSearchTerm,
        });
        const items = Array.isArray(payload?.livros) ? payload.livros : [];

        setLivros((prev) => (reset ? sortByTitulo(items) : sortByTitulo(mergeById(prev, items))));
        setLivrosOffset(items.length);
        setLivrosHasMore(false);
        if (reset) writeCache(livrosCacheKey, items);
      } finally {
        setLivrosLoadingMore(false);
      }
    },
    [catalogoSearchTerm, escolaId, livrosCacheKey],
  );

  const persistirDesafioIA = useCallback(
    async ({ desafio, xpBonus }) => {
      if (!alunoId) {
        throw new Error('Aluno não identificado para salvar o desafio.');
      }
      await savePainelAlunoChallenge({ desafio, xpBonus });
    },
    [alunoId],
  );

  const fetchData = useCallback(async ({ silent = false } = {}) => {
    if (!user) return;
    if (fetchInFlightRef.current) return fetchInFlightRef.current;

    const request = (async () => {
      if (!silent) {
        setLoading(true);
      }
      try {
        const painelData = await fetchPainelAlunoData();
        const perfil = painelData?.perfil;

        if (!perfil?.id) throw new Error('Perfil do aluno não encontrado.');
        setAlunoId(perfil.id);
        setEscolaId(perfil.escola_id || null);
        setAlunoTurma(perfil.turma || null);

        if (!catalogoInicialCarregadoRef.current) {
          await fetchLivrosPage({ reset: true });
          catalogoInicialCarregadoRef.current = true;
        }

        setEmprestimos(painelData?.emprestimos || []);
        setAvaliacoes(painelData?.avaliacoes || []);
        setWishlist((painelData?.wishlist || []).map((item) => item.livro_id));
        setSugestoes(painelData?.sugestoes || []);
        setSolicitacoes(painelData?.solicitacoes || []);
        setAtividades(painelData?.atividades || []);
        setEntregas(painelData?.entregas || []);
        setAudiobookCatalogo(await Promise.all((painelData?.audiobookCatalogo || []).map(resolveAudiobookRecord)));
        setMeusAudiobooks(await Promise.all((painelData?.meusAudiobooks || []).map(resolveAlunoAudiobookRecord)));
        setCriacoesLaboratorio(await Promise.all((painelData?.criacoesLaboratorio || []).map(resolveLabCriacaoRecord)));
        setLabCriacoesMissingTable(false);
        setComunicados(
          ensureArray(painelData?.comunicados).filter((item) => {
            if (isExpiredComunicado(item)) return false;
            const turmaDestino = normalizeTurmaKey(item?.turma_publico);
            return !turmaDestino || turmaDestino === normalizeTurmaKey(perfil.turma);
          }),
        );
        setNotificacoesLidas(new Set((painelData?.notificacoesLidas || []).map((item) => item.notification_id)));
        setDesafioXpBonus(Math.max(0, Number(painelData?.preferenciasAluno?.desafio_ia_xp_bonus || 0)));

        const metricasCarregadas = buildDesafioMetricas({
          livrosLidos: new Set(
            (painelData?.emprestimos || [])
              .filter((item) => item.status === 'devolvido')
              .map((item) => item.livro_id)
              .filter(Boolean),
          ).size,
          avaliacoesCount: (painelData?.avaliacoes || []).length,
          atividadesAprovadas: (painelData?.entregas || []).filter((item) => item.status === 'aprovada').length,
        });
        const pontosAprovadosCarregados = (painelData?.entregas || [])
          .filter((item) => item.status === 'aprovada')
          .reduce((acc, item) => acc + Number(item.pontos_ganhos || 0), 0);
        const xpBonusCarregado = Math.max(0, Number(painelData?.preferenciasAluno?.desafio_ia_xp_bonus || 0));
        const livrosCatalogoCarregados = readCache(livrosCacheKey) || [];
        const livrosCatalogoMap = new Map(
          livrosCatalogoCarregados.map((item) => [item.id, item]),
        );
        const xpLeiturasCarregado = Array.from(
          new Set(
            (painelData?.emprestimos || [])
              .filter((item) => item.status === 'devolvido')
              .map((item) => item.livro_id)
              .filter(Boolean),
          ),
        ).reduce((acc, livroId) => {
          const livro = livrosCatalogoMap.get(livroId);
          return acc + getLivroXpPorCategoria(livro?.area);
        }, 0);
        const pontosExperienciaCarregados =
          xpLeiturasCarregado +
          metricasCarregadas.avaliacoes * 15 +
          metricasCarregadas.atividades_aprovadas * 25 +
          pontosAprovadosCarregados +
          xpBonusCarregado;
        const nivelAtualCarregado = Math.max(1, Math.floor(pontosExperienciaCarregados / 150) + 1);

        const desafioPersistido = normalizeDesafioIA({
          ...(painelData?.preferenciasAluno?.desafio_ia_ativo || {}),
          gerado_em: painelData?.preferenciasAluno?.desafio_ia_gerado_em || painelData?.preferenciasAluno?.desafio_ia_ativo?.gerado_em,
          concluido_em: painelData?.preferenciasAluno?.desafio_ia_concluido_em || painelData?.preferenciasAluno?.desafio_ia_ativo?.concluido_em,
        });
        if (desafioPersistido) {
          const desafioNormalizado = {
            ...desafioPersistido,
            criterio: normalizarCriterioDesafioPorNivel(desafioPersistido.criterio, metricasCarregadas, nivelAtualCarregado),
          };
          setDesafioIA(desafioNormalizado);
          if (desafioCacheKey) writeCache(desafioCacheKey, desafioNormalizado);
        } else {
          setDesafioIA(null);
          if (desafioCacheKey) removeCache(desafioCacheKey);
        }

        const entregaInicial = {};
        const entregaImagensInicial = {};
        const entregaRespostasInicial = {};
        (painelData?.entregas || []).forEach((entrega) => {
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
        if (!silent) {
          setLoading(false);
        }
      }
    })();
    fetchInFlightRef.current = request;
    request.finally(() => {
      if (fetchInFlightRef.current === request) {
        fetchInFlightRef.current = null;
      }
    });
    return request;
  }, [desafioCacheKey, fetchLivrosPage, livrosCacheKey, toast, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!user?.id) return;

    if (alunoOnboardingKey && localStorage.getItem(alunoOnboardingKey) === 'done') {
      setShowAccessChoice(false);
      return;
    }

    setShowAccessChoice(true);
    setOnboardingStep(alunoSenhaDefinida ? 1 : 0);
  }, [alunoOnboardingKey, alunoSenhaDefinida, user?.id]);

  const finalizeAlunoOnboarding = () => {
    if (alunoOnboardingKey) {
      localStorage.setItem(alunoOnboardingKey, 'done');
    }
    setShowAccessChoice(false);
    setOnboardingStep(0);
  };

  const handlePrimeiroAcessoPassword = async () => {
    const novaSenha = primeiroAcessoPassword.trim();
    const confirmarSenha = primeiroAcessoConfirmPassword.trim();

    if (novaSenha.length < 6) {
      toast({
        title: 'Senha invalida',
        description: 'Use uma senha com pelo menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    if (novaSenha !== confirmarSenha) {
      toast({
        title: 'Confirmacao invalida',
        description: 'A confirmacao da nova senha não confere.',
        variant: 'destructive',
      });
      return;
    }

    setUpdatingPrimeiroAcessoPassword(true);
    try {
      await updatePainelAlunoPassword({
        password: novaSenha,
        metadata: {
          ...(user?.user_metadata || {}),
          senha_definida: true,
          senha_alterada_em: new Date().toISOString(),
        },
      });

      if (alunoSenhaDefinidaKey) {
        localStorage.setItem(alunoSenhaDefinidaKey, 'true');
      }

      setPrimeiroAcessoPassword('');
      setPrimeiroAcessoConfirmPassword('');
      setOnboardingStep(1);
      toast({
        title: 'Senha criada',
        description: 'Sua nova senha foi salva e a senha inicial não funciona mais.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao criar senha',
        description: error?.message || 'Não foi possível definir sua nova senha agora.',
        variant: 'destructive',
      });
    } finally {
      setUpdatingPrimeiroAcessoPassword(false);
    }
  };

  useEffect(() => {
    if (studioSlides.length < 2) return;
    const timer = setInterval(() => {
      setStudioPreviewIndex((prev) => (prev + 1) % studioSlides.length);
    }, 2200);
    return () => clearInterval(timer);
  }, [studioSlides]);

  useEffect(() => {
    if (bibliotecaView === 'biblioteca') {
      fetchLivrosPage({ reset: true });
    }
  }, [bibliotecaView, catalogoSearchTerm, fetchLivrosPage]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchData({ silent: true });
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData, user?.id]);

  useEffect(() => {
    if (!user?.id) return undefined;

    const supabase = getSupabaseRealtimeClient();
    if (!supabase) return undefined;

    let refreshTimeout = null;
    const scheduleRefresh = () => {
      if (refreshTimeout) {
        window.clearTimeout(refreshTimeout);
      }
      refreshTimeout = window.setTimeout(() => {
        fetchData({ silent: true });
        refreshTimeout = null;
      }, 250);
    };

    const channel = supabase.channel(`painel-aluno-conversas-${user.id}`);

    ['emprestimos', 'solicitacoes_emprestimo', 'solicitacoes_emprestimo_mensagens'].forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        scheduleRefresh,
      );
    });

    channel.subscribe();

    return () => {
      if (refreshTimeout) {
        window.clearTimeout(refreshTimeout);
      }
      supabase.removeChannel(channel);
    };
  }, [fetchData, user?.id]);

  const atividadesComEntrega = useMemo(() => {
    const entregaByAtividade = new Map(entregas.map((e) => [e.atividade_id, e]));
    return atividades.map((atividade) => ({
      ...atividade,
      atividadeMeta: extractAtividadeFormConfig(atividade.descricao),
      entrega: entregaByAtividade.get(atividade.id) || null,
    }));
  }, [atividades, entregas]);

  const livrosById = useMemo(() => {
    const map = new Map();
    ensureArray(livros).forEach((livro) => {
      if (livro?.id) map.set(livro.id, livro);
    });
    return map;
  }, [livros]);

  const livrosLidos = useMemo(() => {
    const devolvidos = emprestimos
      .filter((e) => e.status === 'devolvido')
      .map((e) => e.livro_id)
      .filter(Boolean);
    return new Set(devolvidos).size;
  }, [emprestimos]);

  const xpLeituras = useMemo(() => {
    const livrosDevolvidosUnicos = Array.from(
      new Set(
        emprestimos
          .filter((e) => e.status === 'devolvido')
          .map((e) => e.livro_id)
          .filter(Boolean),
      ),
    );

    return livrosDevolvidosUnicos.reduce((acc, livroId) => {
      const livro = livrosById.get(livroId);
      return acc + getLivroXpPorCategoria(livro?.area);
    }, 0);
  }, [emprestimos, livrosById]);

  const pontosGanhos = useMemo(
    () => entregas.filter((e) => e.status === 'aprovada').reduce((acc, e) => acc + Number(e.pontos_ganhos || 0), 0),
    [entregas],
  );

  const atividadesAprovadas = useMemo(
    () => entregas.filter((e) => e.status === 'aprovada').length,
    [entregas],
  );

  const atividadesPendentes = useMemo(
    () => atividadesComEntrega.filter((a) => !a.entrega || a.entrega.status !== 'aprovada').length,
    [atividadesComEntrega],
  );

  const atividadesPendentesLista = useMemo(
    () => atividadesComEntrega.filter((atividade) => {
      if (atividade?.entrega) return false;
      const prazo = atividade?.data_entrega ? new Date(atividade.data_entrega) : null;
      return !prazo || Number.isNaN(prazo.getTime()) || prazo >= new Date();
    }),
    [atividadesComEntrega],
  );

  const atividadesEnviadasLista = useMemo(
    () => atividadesComEntrega.filter((atividade) => Boolean(atividade?.entrega)),
    [atividadesComEntrega],
  );

  const atividadesForaDoPrazoLista = useMemo(
    () => atividadesComEntrega.filter((atividade) => {
      if (atividade?.entrega) return false;
      const prazo = atividade?.data_entrega ? new Date(atividade.data_entrega) : null;
      return Boolean(prazo && !Number.isNaN(prazo.getTime()) && prazo < new Date());
    }),
    [atividadesComEntrega],
  );

  const atividadesVisiveis = useMemo(() => {
    if (atividadeView === 'enviadas') return atividadesEnviadasLista;
    if (atividadeView === 'fora_prazo') return atividadesForaDoPrazoLista;
    return atividadesPendentesLista;
  }, [atividadeView, atividadesEnviadasLista, atividadesForaDoPrazoLista, atividadesPendentesLista]);

  const selectedAtividadeIdsSet = useMemo(
    () => new Set(selectedAtividadeIds.map((item) => String(item))),
    [selectedAtividadeIds],
  );

  const allAtividadesEnviadasSelected = useMemo(
    () => atividadesEnviadasLista.length > 0
      && atividadesEnviadasLista.every((atividade) => selectedAtividadeIdsSet.has(String(atividade.id))),
    [atividadesEnviadasLista, selectedAtividadeIdsSet],
  );

  const someAtividadesEnviadasSelected = useMemo(
    () => atividadesEnviadasLista.some((atividade) => selectedAtividadeIdsSet.has(String(atividade.id))),
    [atividadesEnviadasLista, selectedAtividadeIdsSet],
  );

  const atividadeEmptyMessage = useMemo(() => {
    if (atividadeView === 'enviadas') return 'Nenhuma atividade enviada ainda.';
    if (atividadeView === 'fora_prazo') return 'Nenhuma atividade fora do prazo.';
    return 'Nenhuma atividade pendente no momento.';
  }, [atividadeView]);

  useEffect(() => {
    const availableIds = new Set(atividadesEnviadasLista.map((atividade) => String(atividade.id)));
    setSelectedAtividadeIds((prev) => prev.filter((id) => availableIds.has(String(id))));
  }, [atividadesEnviadasLista]);

  useEffect(() => {
    if (atividadeView !== 'enviadas') {
      setSelectedAtividadeIds([]);
    }
  }, [atividadeView]);

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
    const baseLeituras = xpLeituras;
    const baseAvaliacoes = avaliacoes.length * 15;
    const baseAtividades = atividadesAprovadas * 25;
    return baseLeituras + baseAvaliacoes + baseAtividades + Number(pontosGanhos || 0) + Number(desafioXpBonus || 0);
  }, [atividadesAprovadas, avaliacoes.length, desafioXpBonus, pontosGanhos, xpLeituras]);

  const nivelAtual = useMemo(() => Math.max(1, Math.floor(pontosExperiencia / 150) + 1), [pontosExperiencia]);

  const xpNivelAtual = useMemo(() => (nivelAtual - 1) * 150, [nivelAtual]);
  const xpProximoNivel = useMemo(() => nivelAtual * 150, [nivelAtual]);
  const progressoNivel = useMemo(() => {
    const progresso = ((pontosExperiencia - xpNivelAtual) / (xpProximoNivel - xpNivelAtual)) * 100;
    return Math.max(0, Math.min(100, progresso));
  }, [pontosExperiencia, xpNivelAtual, xpProximoNivel]);

  const desafioMetricas = useMemo(
    () =>
      buildDesafioMetricas({
        livrosLidos,
        avaliacoesCount: avaliacoes.length,
        atividadesAprovadas,
      }),
    [atividadesAprovadas, avaliacoes.length, livrosLidos],
  );

  const desafioProgressoAtual = useMemo(() => {
    if (!desafioIA?.criterio?.tipo) return null;
    return Math.max(0, Number(desafioMetricas[desafioIA.criterio.tipo] || 0));
  }, [desafioIA, desafioMetricas]);

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
        descricao: 'Leu 3+ livros nos ultimos 7 dias.',
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
          canonicalizeBookArea(livro.area).toLowerCase().includes(t)
        );
      }),
    [livros, searchTerm],
  );

  const catalogoAreas = useMemo(() => {
    const set = new Set(ensureArray(livros).map((livro) => canonicalizeBookArea(livro?.area)).filter(Boolean));
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  }, [livros]);

  const catalogoAutores = useMemo(() => {
    const set = new Set(ensureArray(livros).map((livro) => livro?.autor).filter(Boolean));
    return Array.from(set).sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
  }, [livros]);

  const filteredCatalogo = useMemo(() => {
    return filteredLivros.filter((livro) => {
      if (catalogoAreaFilter !== 'all' && canonicalizeBookArea(livro.area) !== catalogoAreaFilter) return false;
      if (catalogoDisponibilidadeFilter === 'disponivel' && !livro.disponivel) return false;
      if (catalogoDisponibilidadeFilter === 'emprestado' && livro.disponivel) return false;
      if (catalogoAutorFilter !== 'all' && livro.autor !== catalogoAutorFilter) return false;
      return true;
    });
  }, [catalogoAreaFilter, catalogoAutorFilter, catalogoDisponibilidadeFilter, filteredLivros]);

  const livrosSugeriveisDesafio = useMemo(() => {
    const readingBand = getBookReadingBandForLevel(nivelAtual);

    return ensureArray(livros)
      .filter((livro) => livro?.titulo)
      .map((livro) => {
        const complexity = estimateBookComplexityForLevel(livro, nivelAtual);
        return {
          titulo: livro.titulo,
          autor: livro.autor || '',
          area: complexity.area || '',
          sinopse: livro.sinopse || '',
          faixa_indicada: readingBand.chave,
          motivo_indicacao: complexity.readingBand.descricao,
          porte_estimado: complexity.complexityBand,
          prioridade_nivel: complexity.score,
        };
      })
      .sort((a, b) => Number(b.prioridade_nivel || 0) - Number(a.prioridade_nivel || 0))
      .slice(0, 12);
  }, [livros, nivelAtual]);

  const meusLivros = useMemo(() => emprestimos.filter((e) => e.status === 'ativo'), [emprestimos]);

  const meusLivrosIds = useMemo(
    () => new Set(meusLivros.map((item) => item?.livro_id).filter(Boolean)),
    [meusLivros],
  );

  const meusLivrosOptions = useMemo(() => {
    const map = new Map();
    meusLivros.forEach((item) => {
      if (!item?.livro_id) return;
      const livro = livrosById.get(item.livro_id) || item.livros;
      if (!livro?.titulo) return;
      if (!map.has(item.livro_id)) {
        map.set(item.livro_id, {
          id: item.livro_id,
          titulo: livro.titulo,
          autor: livro.autor || '',
          dataDevolucaoPrevista: item.data_devolucao_prevista || null,
        });
      }
    });
    return Array.from(map.values());
  }, [livrosById, meusLivros]);

  const alunoPodeUsarLivroEmprestado = useCallback(
    (livroId, acao = 'usar este livro') => {
      if (livroId && meusLivrosIds.has(livroId)) return true;
      toast({
        variant: 'destructive',
        title: 'Livro não permitido',
        description: `Para ${acao}, escolha apenas um livro que esteja em "Meus livros".`,
      });
      return false;
    },
    [meusLivrosIds, toast],
  );

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

  const pendingExtensionRequestsByLoanId = useMemo(() => {
    const map = new Map();
    solicitacoes.forEach((item) => {
      if (String(item?.tipo || 'emprestimo') !== 'prorrogacao') return;
      if (!item?.emprestimo_id) return;
      const status = String(item?.status || '').toLowerCase();
      if (status === 'pendente' || status === 'em_andamento') {
        map.set(item.emprestimo_id, item);
      }
    });
    return map;
  }, [solicitacoes]);

  const canRequestLoanExtension = useCallback(
    (emprestimo) => {
      if (!emprestimo?.id || emprestimo?.status !== 'ativo' || !emprestimo?.data_devolucao_prevista) return false;
      if (pendingExtensionRequestsByLoanId.has(emprestimo.id)) return false;
      const diffMs = new Date(emprestimo.data_devolucao_prevista).getTime() - Date.now();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      return diffDays <= 3;
    },
    [pendingExtensionRequestsByLoanId],
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
      const isExtension = String(solicitacao?.tipo || 'emprestimo') === 'prorrogacao';
      if (isExtension) {
        const statusExt = String(solicitacao?.status || '').toLowerCase();
        if (statusExt === 'aprovada' || statusExt === 'aceita') return 'aceitos';
        if (statusExt === 'recusada' || statusExt === 'negada' || statusExt === 'cancelada') return 'recusados';
        return 'pendentes';
      }
      const emprestimo = latestEmprestimoByLivro.get(solicitacao?.livro_id);
      if (emprestimo?.status === 'devolvido') return 'historico';
      if (emprestimo?.status === 'ativo') return 'aceitos';

      const status = String(solicitacao?.status || '').toLowerCase();
      if (status === 'aprovada' || status === 'aceita') return 'aceitos';
      if (status === 'recusada' || status === 'negada' || status === 'cancelada') return 'recusados';
      if (status === 'pendente' || status === 'solicitada' || status === 'em_andamento' || status === 'indisponivel_em_analise') return 'pendentes';
      return 'pendentes';
    },
    [latestEmprestimoByLivro],
  );

  const solicitacoesGroups = useMemo(() => {
    const grouped = {
      pendentes: [],
      aceitos: [],
      recusados: [],
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
  const conversasSolicitacoes = useMemo(
    () => [...ensureArray(solicitacoes)].sort((a, b) => {
      const chatA = ensureArray(a?.solicitacoes_emprestimo_mensagens).at(-1)?.created_at;
      const chatB = ensureArray(b?.solicitacoes_emprestimo_mensagens).at(-1)?.created_at;
      const lastA = chatA || a?.updated_at || a?.created_at || 0;
      const lastB = chatB || b?.updated_at || b?.created_at || 0;
      return new Date(lastB).getTime() - new Date(lastA).getTime();
    }),
    [solicitacoes],
  );

  const getSolicitacaoStatusInfo = useCallback(
    (solicitacao) => {
      const isExtension = String(solicitacao?.tipo || 'emprestimo') === 'prorrogacao';
      if (isExtension) {
        const statusExt = String(solicitacao?.status || '').toLowerCase();
        if (statusExt === 'aprovada' || statusExt === 'aceita') {
          return { label: 'Prorrogação aprovada', variant: 'default', icon: <CheckCircle2 className="w-3 h-3 mr-1" /> };
        }
        if (statusExt === 'recusada' || statusExt === 'negada' || statusExt === 'cancelada') {
          return { label: 'Prorrogação recusada', variant: 'destructive', icon: <AlertTriangle className="w-3 h-3 mr-1" /> };
        }
        return { label: 'Prorrogação pendente', variant: 'secondary', icon: <Clock className="w-3 h-3 mr-1" /> };
      }
      const emprestimo = latestEmprestimoByLivro.get(solicitacao?.livro_id);
      if (emprestimo?.status === 'devolvido') {
        return { label: 'Devolvido', variant: 'secondary', icon: <CheckCircle2 className="w-3 h-3 mr-1" /> };
      }
      if (emprestimo?.status === 'ativo') {
        return { label: 'Aceito', variant: 'default', icon: <CheckCircle2 className="w-3 h-3 mr-1" /> };
      }
      const status = String(solicitacao?.status || '').toLowerCase();
      if (status === 'aprovada' || status === 'aceita') {
        return { label: 'Aceito', variant: 'default', icon: <CheckCircle2 className="w-3 h-3 mr-1" /> };
      }
      if (status === 'recusada' || status === 'negada' || status === 'cancelada') {
        return { label: 'Recusado', variant: 'destructive', icon: <AlertTriangle className="w-3 h-3 mr-1" /> };
      }
      if (status === 'indisponivel_em_analise') {
        return { label: 'Sob Análise', variant: 'outline', icon: <Clock className="w-3 h-3 mr-1" /> };
      }
      return { label: 'Pendente', variant: 'secondary', icon: <Clock className="w-3 h-3 mr-1" /> };
    },
    [latestEmprestimoByLivro],
  );

  const handleEnviarMensagemSolicitacao = useCallback(
    async (solicitacaoId) => {
      const mensagem = String(mensagemSolicitacaoPorId[solicitacaoId] || '').trim();
      if (!mensagem) {
        toast({
          variant: 'destructive',
          title: 'Mensagem obrigatória',
          description: 'Escreva uma mensagem para conversar com a biblioteca.',
        });
        return;
      }

      setSaving(true);
      try {
        await sendPainelAlunoSolicitacaoChatMessage({ solicitacaoId, mensagem });
        toast({
          title: 'Mensagem enviada',
          description: 'A biblioteca recebeu sua mensagem.',
        });
        setMensagemSolicitacaoPorId((prev) => ({ ...prev, [solicitacaoId]: '' }));
        await fetchData();
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: error?.message || 'Não foi possível enviar sua mensagem.',
        });
      } finally {
        setSaving(false);
      }
    },
    [fetchData, mensagemSolicitacaoPorId, toast],
  );

  const buildSolicitacaoTimeline = useCallback(
    (solicitacao) => {
      const isExtension = String(solicitacao?.tipo || 'emprestimo') === 'prorrogacao';
      if (isExtension) {
        const timeline = [{ label: 'Prorrogação solicitada', date: solicitacao?.created_at }];
        const statusExt = String(solicitacao?.status || '').toLowerCase();
        if (statusExt !== 'pendente') {
          timeline.push({
            label: statusExt === 'recusada' || statusExt === 'negada' ? 'Prorrogação recusada' : 'Prorrogação aprovada',
            date: solicitacao?.respondido_em || solicitacao?.updated_at,
          });
        }
        return timeline.filter((item) => item.date);
      }

      const emprestimo = latestEmprestimoByLivro.get(solicitacao?.livro_id);
      const timeline = [
        { label: 'Solicitado', date: solicitacao?.created_at },
      ];

      const status = String(solicitacao?.status || '').toLowerCase();
      if (status !== 'pendente') {
        timeline.push({ label: status === 'recusada' || status === 'negada' ? 'Recusado' : 'Respondido', date: solicitacao?.updated_at });
      }

      if (emprestimo?.status === 'ativo') {
        timeline.push({ label: 'Emprestado', date: emprestimo?.data_emprestimo || emprestimo?.created_at });
      }
      if (emprestimo?.status === 'devolvido') {
        timeline.push({ label: 'Devolvido', date: emprestimo?.data_devolucao || emprestimo?.updated_at });
      }

      return timeline.filter((item) => item.date);
    },
    [latestEmprestimoByLivro],
  );

  const notificacoes = useMemo(() => {
    const itens = [];
    const solicitacoesPendentes = solicitacoes.filter((s) => classifySolicitacao(s) === 'pendentes').length;

    ensureArray(comunicados)
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
      .slice(0, 5)
      .forEach((item) => {
        itens.push({
          id: `comunicado-${item.id}`,
          tipo: 'comunicado',
          titulo: item.titulo || 'Novo comunicado',
          descricao: item.conteudo || 'Confira o comunicado da sua turma na comunidade.',
          created_at: item.created_at,
        });
      });

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

    if (solicitacoesPendentes > 0) {
      itens.push({
        id: 'solicitacoes-pendentes',
        tipo: 'solicitacao',
        titulo: 'Solicitações pendentes',
        descricao: `${solicitacoesPendentes} solicitação(ões) aguardando aprovação.`,
      });
    }

    solicitacoes
      .flatMap((solicitacao) => {
        const mensagens = ensureArray(solicitacao?.solicitacoes_emprestimo_mensagens)
          .filter((mensagem) => String(mensagem?.autor_tipo || '').toLowerCase() === 'bibliotecaria');

        return mensagens.map((mensagem) => ({
          id: `solicitacao-chat-${solicitacao.id}-${mensagem.id}`,
          tipo: 'solicitacao_chat',
          titulo: 'Nova mensagem da biblioteca',
          descricao: `A biblioteca respondeu sobre ${solicitacao?.livros?.titulo || 'sua solicitação'}.`,
          created_at: mensagem?.created_at || solicitacao?.updated_at || solicitacao?.created_at || null,
        }));
      })
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
      .slice(0, 6)
      .forEach((item) => {
        itens.push(item);
      });

    const filtradas = itens.filter((item) => !notificacoesLidas.has(item.id));
    return filtradas.slice(0, 8);
  }, [atrasos, atividadesComEntrega, comunicados, solicitacoes, classifySolicitacao, notificacoesLidas]);

  useEffect(() => {
    const nextIds = new Set(ensureArray(notificacoes).map((item) => item?.id).filter(Boolean));
    if (!alunoNotificationsReadyRef.current) {
      seenAlunoNotificationIdsRef.current = nextIds;
      alunoNotificationsReadyRef.current = true;
      return;
    }
    if (getBrowserNotificationPermission() === 'granted') {
      ensureArray(notificacoes)
        .filter((item) => item?.id && !seenAlunoNotificationIdsRef.current.has(item.id))
        .filter((item) => item.tipo === 'solicitacao_chat')
        .forEach((item) => {
          showBrowserNotification({
            title: item.titulo || 'Nova mensagem da biblioteca',
            body: item.descricao || 'A biblioteca enviou uma nova mensagem.',
            tag: item.id,
            path: '/aluno/atividades',
          });
        });
    }
    seenAlunoNotificationIdsRef.current = nextIds;
  }, [notificacoes]);
  const markNotificationRead = useCallback(
    async (notificationId) => {
      if (!notificationId || !alunoId) return;
      setNotificacoesLidas((prev) => new Set([...prev, notificationId]));
      setAriaLiveMessage('Notificação marcada como lida.');
      try {
        await markPainelAlunoNotificationRead(notificationId);
      } catch {
        // fallback silencioso: mantém estado local
      }
    },
    [alunoId],
  );

  const markAllNotificationsRead = useCallback(async () => {
    if (!alunoId || notificacoes.length === 0) return;
    const payload = notificacoes.map((item) => ({ usuario_id: alunoId, notification_id: item.id }));
    setNotificacoesLidas((prev) => {
      const next = new Set(prev);
      payload.forEach((item) => next.add(item.notification_id));
      return next;
    });
    setAriaLiveMessage('Todas as notificacoes foram marcadas como lidas.');
    try {
      await markPainelAlunoNotificationsReadBatch(payload.map((item) => item.notification_id));
    } catch {
      // fallback silencioso
    }
  }, [alunoId, notificacoes]);

  const hasSolicitacaoEmAndamento = useCallback(
    (livroId) =>
      solicitacoes.some((item) => item?.livro_id === livroId && classifySolicitacao(item) === 'pendentes'),
    [classifySolicitacao, solicitacoes],
  );

  const hasEmprestimoAtivo = useCallback(
    (livroId) => emprestimos.some((item) => item?.livro_id === livroId && item?.status === 'ativo'),
    [emprestimos],
  );

  const speakText = async (livroId, text) => {
    const setSpeakingState = (nextId, nextPhase) => {
      speakingLivroIdRef.current = nextId;
      setSpeakingLivroId(nextId);
      setSpeakingPhase(nextPhase);
    };

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
      setSpeakingState(null, 'idle');
      speechRequestRef.current += 1;
    };

    const playWithBrowserTTS = (value, requestId) => {
      try {
        speechSynthesis.cancel();
      } catch {
        // ignore
      }
      const utterance = new SpeechSynthesisUtterance(value || '');
      utterance.lang = 'pt-BR';
      utterance.rate = 0.9;
      utterance.onend = () => {
        if (requestId !== speechRequestRef.current) return;
        if (speakingLivroIdRef.current === livroId) setSpeakingState(null, 'idle');
      };
      utterance.onerror = () => {
        if (requestId !== speechRequestRef.current) return;
        if (speakingLivroIdRef.current === livroId) setSpeakingState(null, 'idle');
      };
      speechSynthesis.speak(utterance);
    };

    const isSameLivro = speakingLivroIdRef.current && speakingLivroIdRef.current === livroId;
    if (speakingPhase !== 'idle') {
      stopPlayback();
      if (isSameLivro) return;
    }

    const normalizedText = String(text || '').trim();
    if (!normalizedText) return;

    setSpeakingState(livroId, 'loading');
    const requestId = (speechRequestRef.current += 1);
    try {
      const { audioDataUrl } = await generateAudioWithCloudflare({
        text: normalizedText,
        language: 'pt-BR',
        fallbackErrorMessage: 'Não foi possível gerar áudio da sinopse no momento.',
      });
      if (requestId !== speechRequestRef.current) return;

      const audio = new Audio(audioDataUrl);
      audioPlayerRef.current = audio;
      audio.onended = () => {
        if (requestId !== speechRequestRef.current) return;
        audioPlayerRef.current = null;
        if (speakingLivroIdRef.current === livroId) setSpeakingState(null, 'idle');
      };
      audio.onerror = () => {
        if (requestId !== speechRequestRef.current) return;
        audioPlayerRef.current = null;
        if (speakingLivroIdRef.current === livroId) setSpeakingState(livroId, 'playing');
        playWithBrowserTTS(normalizedText, requestId);
      };

      setSpeakingState(livroId, 'playing');
      await audio.play();
    } catch {
      if (requestId !== speechRequestRef.current) return;
      setSpeakingState(livroId, 'playing');
      playWithBrowserTTS(normalizedText, requestId);
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
        await togglePainelAlunoWishlist({ livroId, alunoId, enabled: false });
        setWishlist((prev) => prev.filter((id) => id !== livroId));
      } else {
        await togglePainelAlunoWishlist({ livroId, alunoId, enabled: true });
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

    try {
      await createPainelAlunoLabCreation(payload);
      return;
    } catch (error) {
      if (isMissingTableError(error)) {
        setLabCriacoesMissingTable(true);
        throw new Error('Tabela laboratorio_criacoes não encontrada. Aplique as migrations do Supabase.');
      }

      throw error;
    }
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
      await savePainelAlunoReview({
        livroId: reviewLivro.id,
        nota: reviewNota,
        resenha: reviewTexto || null,
      });

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
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível salvar.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRequestLoan = async () => {
    if (!alunoId || !requestLivro) return;

    if (hasSolicitacaoEmAndamento(requestLivro.id)) {
      toast({
        variant: 'destructive',
        title: 'Solicitação já enviada',
        description: 'Aguarde a aprovação da bibliotecária antes de solicitar novamente este livro.',
      });
      return;
    }
    if (hasEmprestimoAtivo(requestLivro.id)) {
      toast({
        variant: 'destructive',
        title: 'Livro já emprestado',
        description: 'Este livro já está emprestado para você. Confira em "Meus livros".',
      });
      return;
    }

    setSaving(true);
    try {
      await createPainelAlunoLoanRequest({
        livroId: requestLivro.id,
        mensagem: requestMsg || null,
      });

      toast({ title: 'Solicitação enviada!' });
      setRequestDialog(false);
      setRequestLivro(null);
      setRequestMsg('');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao solicitar empréstimo.' });
    } finally {
      setSaving(false);
    }
  };

  const openLoanExtensionDialog = (emprestimo) => {
    if (!emprestimo?.id) return;
    setExtensionEmprestimo(emprestimo);
    setExtensionRequestedDate(formatDateInputValue(emprestimo.data_devolucao_prevista));
    setExtensionMessage('');
    setExtensionDialogOpen(true);
  };

  const handleRequestLoanExtension = async () => {
    if (!alunoId || !extensionEmprestimo?.id || !extensionEmprestimo?.livro_id) return;
    if (!extensionRequestedDate) {
      toast({
        variant: 'destructive',
        title: 'Nova data obrigatória',
        description: 'Escolha a nova data desejada para devolução.',
      });
      return;
    }

    const currentDate = formatDateInputValue(extensionEmprestimo.data_devolucao_prevista);
    if (!currentDate || extensionRequestedDate <= currentDate) {
      toast({
        variant: 'destructive',
        title: 'Data inválida',
        description: 'A nova data precisa ser posterior à data de devolução atual.',
      });
      return;
    }

    setSaving(true);
    try {
      await createPainelAlunoLoanExtensionRequest({
        livroId: extensionEmprestimo.livro_id,
        emprestimoId: extensionEmprestimo.id,
        mensagem: extensionMessage?.trim() || 'Pedido de extensão de prazo para devolução.',
        dataDevolucaoAtual: extensionEmprestimo.data_devolucao_prevista,
        novaDataDevolucaoSolicitada: new Date(`${extensionRequestedDate}T12:00:00`).toISOString(),
      });

      toast({
        title: 'Pedido enviado',
        description: 'A bibliotecária vai analisar a prorrogação da data de devolução.',
      });
      setExtensionDialogOpen(false);
      setExtensionEmprestimo(null);
      setExtensionRequestedDate('');
      setExtensionMessage('');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao pedir extensão',
        description: error?.message || 'Não foi possível enviar o pedido de extensão agora.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleEnviarAtividade = async (atividade) => {
    if (!alunoId || !escolaId) return;
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
      const imagensMigradas = await Promise.all(
        imagens.map(async (imagem, index) => {
          if (!isDataUrl(imagem)) return imagem;

          const upload = await uploadDataUrlToR2({
            dataUrl: imagem,
            escolaId,
            ownerId: alunoId,
            scope: 'atividades-entregas',
            fileName: `atividade-${atividade.id || 'entrega'}-${index + 1}.jpg`,
          });

          return upload.objectKey;
        }),
      );

      const payload = {
        atividade_id: atividade.id,
        aluno_id: alunoId,
        texto_entrega: serializeEntregaPayload({
          texto,
          imagens: imagensMigradas,
          respostas,
        }),
        status: 'enviada',
        enviado_em: new Date().toISOString(),
      };

      await submitPainelAlunoActivity({
        atividadeId: atividade.id,
        textoEntrega: payload.texto_entrega,
        status: payload.status,
        enviadoEm: payload.enviado_em,
      });

      setEntregas((prev) => {
        const nextItem = {
          ...(prev.find((item) => String(item?.atividade_id) === String(atividade.id)) || {}),
          atividade_id: atividade.id,
          aluno_id: alunoId,
          texto_entrega: payload.texto_entrega,
          status: payload.status,
          enviado_em: payload.enviado_em,
          pontos_ganhos: 0,
        };
        const filtered = prev.filter((item) => String(item?.atividade_id) !== String(atividade.id));
        return [nextItem, ...filtered];
      });
      setAtividadeTexto((prev) => ({ ...prev, [atividade.id]: '' }));
      setAtividadeImagens((prev) => ({ ...prev, [atividade.id]: [] }));
      setAtividadeRespostas((prev) => ({ ...prev, [atividade.id]: {} }));
      setAtividadeView('enviadas');

      toast({ title: 'Entrega enviada', description: 'Seu professor já pode avaliar e liberar pontos.' });
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

  const handleActivityFileInputChange = async (atividadeId, event) => {
    const { files } = event.target;
    await handleSelectActivityImages(atividadeId, files);
    event.target.value = '';
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
      const uploadedAudio = await uploadDataUrlToR2({
        dataUrl: audiobookFileDataUrl,
        escolaId,
        ownerId: alunoId,
        scope: 'audiobooks',
        fileName: audiobookFileNome || `${livro.titulo}.mp3`,
      });

      const payload = {
        livro_id: livro.id,
        escola_id: escolaId,
        titulo: audiobookForm.titulo.trim() || livro.titulo,
        autor: audiobookForm.autor.trim() || livro.autor,
        duracao_minutos: audiobookForm.duracao_minutos ? Number(audiobookForm.duracao_minutos) : null,
        audio_url: uploadedAudio.objectKey,
        criado_por: alunoId,
      };

      await createPainelAlunoAudiobook(payload);

      toast({ title: 'Audiobook adicionado ao catálogo!' });
      setAudiobookForm({ livro_id: '', titulo: '', autor: '', duracao_minutos: '' });
      setAudiobookFileDataUrl('');
      setAudiobookFileNome('');
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
      await togglePainelAlunoAudiobook({
        audiobookId,
        enabled: !existente,
      });
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

  const toggleAtividadeSelection = useCallback((atividadeId, checked) => {
    const normalizedId = String(atividadeId || '').trim();
    if (!normalizedId) return;

    setSelectedAtividadeIds((prev) => {
      const current = new Set(prev.map((item) => String(item)));
      if (checked) {
        current.add(normalizedId);
      } else {
        current.delete(normalizedId);
      }
      return Array.from(current);
    });
  }, []);

  const toggleSelectAllAtividadesEnviadas = useCallback((checked) => {
    if (checked) {
      setSelectedAtividadeIds(atividadesEnviadasLista.map((atividade) => String(atividade.id)));
      return;
    }
    setSelectedAtividadeIds([]);
  }, [atividadesEnviadasLista]);

  const handleDeleteSelectedAtividades = async () => {
    if (selectedAtividadeIds.length === 0) return;

    setSaving(true);
    try {
      const selectedIdsSet = new Set(selectedAtividadeIds.map((item) => String(item)));
      await deletePainelAlunoActivitiesBatch({ atividadeIds: selectedAtividadeIds });

      setEntregas((prev) => prev.filter((item) => !selectedIdsSet.has(String(item?.atividade_id))));
      setAtividadeTexto((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !selectedIdsSet.has(String(key)))));
      setAtividadeImagens((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !selectedIdsSet.has(String(key)))));
      setAtividadeRespostas((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => !selectedIdsSet.has(String(key)))));
      setSelectedAtividadeIds([]);
      setDeleteAtividadesDialogOpen(false);

      toast({
        title: selectedIdsSet.size === 1 ? 'Atividade apagada' : 'Atividades apagadas',
        description: selectedIdsSet.size === 1
          ? 'A entrega selecionada foi removida.'
          : `${selectedIdsSet.size} entregas foram removidas.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao apagar atividades',
        description: error?.message || 'Nao foi possivel apagar as atividades selecionadas.',
      });
    } finally {
      setSaving(false);
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

  const abrirConfirmacaoExclusaoSlide = (slide) => {
    if (!slide?.id) return;
    setDeleteStudioSlideItem(slide);
    setDeleteStudioSlideDialogOpen(true);
  };

  const confirmarExclusaoSlide = () => {
    if (!deleteStudioSlideItem?.id) return;
    setStudioSlides((prev) => prev.filter((item) => item.id !== deleteStudioSlideItem.id));
    setDeleteStudioSlideDialogOpen(false);
    setDeleteStudioSlideItem(null);
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
      const imagemUrls = await persistStudioSlidesToR2({
        slides: studioSlides,
        escolaId,
        alunoId,
      });

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
      const imagemUrls = await persistStudioSlidesToR2({
        slides: studioSlides,
        escolaId,
        alunoId,
      });

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
        imagem_urls: imagemUrls,
        tags,
      });

      toast({ title: 'Projeto salvo no laboratório!' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível salvar o projeto.' });
    } finally {
      setSaving(false);
    }
  };

  const gerarQuizComIA = async () => {
    const livro = livrosById.get(quizLivroId);
    if (!livro) {
      toast({ variant: 'destructive', title: 'Selecione um livro', description: 'Escolha um livro para gerar o quiz.' });
      return;
    }
    if (!alunoPodeUsarLivroEmprestado(quizLivroId, 'gerar o quiz')) return;
    const tema = quizTema.trim() || 'compreensão da leitura';

    setGerandoQuizIA(true);
    try {
      const criterio = escolherCriterioDesafio(desafioMetricas);
      const data = await generateTextWithIA(
        'quiz_leitura',
        {
          livro: livro.titulo,
          titulo: livro.titulo,
          autor: livro.autor,
          sinopse: livro.sinopse || '',
          tema,
          quantidade: 3,
          alternativas: 4,
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
    registrarResultadoQuiz({ acertos, total: quiz.length });
  };

  const resetarQuizAtual = () => {
    setQuizRespostas({});
    setQuizResultado(null);
    setAriaLiveMessage('Quiz reiniciado.');
  };

  const quizHistoryKey = useMemo(
    () => (alunoId ? `aluno:quiz:history:${alunoId}` : 'aluno:quiz:history:anon'),
    [alunoId],
  );

  const [quizHistory, setQuizHistory] = useState({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem(quizHistoryKey);
      if (!raw) {
        setQuizHistory({});
        return;
      }
      const parsed = JSON.parse(raw);
      setQuizHistory(parsed && typeof parsed === 'object' ? parsed : {});
    } catch {
      setQuizHistory({});
    }
  }, [quizHistoryKey]);

  const registrarResultadoQuiz = useCallback(
    ({ acertos, total }) => {
      if (!quizLivroId) return;
      const tema = (quizTema || 'geral').trim().toLowerCase();
      const key = `${quizLivroId}::${tema}`;
      const prev = quizHistory?.[key] || {};
      const best = !prev?.best || acertos > prev.best.acertos ? { acertos, total } : prev.best;
      const next = {
        ...quizHistory,
        [key]: {
          livroId: quizLivroId,
          tema,
          best,
          last: { acertos, total },
          updatedAt: new Date().toISOString(),
        },
      };
      setQuizHistory(next);
      try {
        localStorage.setItem(quizHistoryKey, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
    },
    [quizHistory, quizHistoryKey, quizLivroId, quizTema],
  );

  const quizNivel = useMemo(() => {
    if (quiz.length <= 3) return 'Básico';
    if (quiz.length <= 5) return 'Intermediário';
    return 'Avançado';
  }, [quiz.length]);

  const quizHistoryKeyAtual = useMemo(() => {
    if (!quizLivroId) return '';
    return `${quizLivroId}::${(quizTema || 'geral').trim().toLowerCase()}`;
  }, [quizLivroId, quizTema]);

  const quizHistoricoAtual = quizHistoryKeyAtual ? quizHistory?.[quizHistoryKeyAtual] : null;

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

    const livro = livrosById.get(quizLivroId);
    if (!alunoPodeUsarLivroEmprestado(quizLivroId, publicarNaComunidade ? 'publicar este quiz' : 'salvar este quiz')) return;
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

  const abrirCompartilhamentoCriacao = (criacao) => {
    if (!criacao?.id) return;
    if (criacao.publicado_comunidade || criacao.comunidade_post_id) {
      toast({ title: 'Criação já compartilhada', description: 'Essa criação já foi enviada para a comunidade.' });
      return;
    }
    setShareCriacaoItem(criacao);
    setShareCriacaoTitulo(repairMojibakeText(criacao.titulo) || 'Criação do aluno');
    setShareCriacaoDescricao(
      repairMojibakeText(
        criacao.tipo === 'resumo'
          ? extractResumoTextoFromCriacao(criacao) || criacao.descricao
          : criacao.descricao,
      ) || '',
    );
    setShareCriacaoTipo(normalizeCriacaoShareTipo(criacao));
    setShareCriacaoDialogOpen(true);
  };

  const compartilharCriacaoSalvaNaComunidade = async (criacao, customizacao = {}) => {
    if (!optionalFeaturesEnabled || !alunoId || !escolaId) {
      toast({
        variant: 'destructive',
        title: 'Laboratório indisponível',
        description: 'Não foi possível compartilhar agora. Verifique se as migrations do banco foram aplicadas.',
      });
      return;
    }
    if (!criacao?.id) return;
    if (criacao.publicado_comunidade || criacao.comunidade_post_id) {
      toast({ title: 'Criação já compartilhada', description: 'Essa criação já foi enviada para a comunidade.' });
      return;
    }

    setSaving(true);
    try {
      const criacaoImagemUrls = ensureArray(criacao.imagem_urls_r2_keys || criacao.imagem_urls);
      const tituloBase = String(customizacao.titulo || repairMojibakeText(criacao.titulo) || 'Criação do aluno').trim();
      const descricaoBase = String(customizacao.descricao || repairMojibakeText(criacao.descricao) || '').trim();
      const tipoPersonalizado = String(customizacao.tipo || normalizeCriacaoShareTipo(criacao)).trim();
      const conteudoJson = extractQuizFromCriacao(criacao) || {};
      let payload = null;

      if (criacao.livro_id && !alunoPodeUsarLivroEmprestado(criacao.livro_id, 'publicar esta criação')) {
        throw new Error('Somente livros presentes em "Meus livros" podem ser usados em publicações.');
      }

      if (criacao.tipo === 'quiz') {
        const perguntas = ensureArray(conteudoJson?.perguntas);
        if (perguntas.length === 0) {
          throw new Error('Não foi possível compartilhar este quiz porque ele não tem perguntas válidas.');
        }
        const descricaoQuiz = repairMojibakeText(criacao.descricao) || 'compreensão da leitura';
        const resumoQuestoes = perguntas.map((pergunta, index) => `${index + 1}) ${pergunta.enunciado}`).join('\n');
        const quizPayload = {
          perguntas,
          tema: descricaoQuiz,
          livro_id: criacao.livro_id || null,
          criado_em: criacao.created_at || new Date().toISOString(),
        };
        payload = {
          autor_id: alunoId,
          escola_id: escolaId,
          livro_id: criacao.livro_id || null,
          tipo: 'quiz',
          titulo: tituloBase,
          conteudo: [`Quiz interativo (${descricaoQuiz})`, resumoQuestoes, serializeQuizParaComunidade(quizPayload)]
            .filter(Boolean)
            .join('\n'),
          imagem_urls: criacaoImagemUrls,
          tags: Array.from(new Set([...(ensureArray(criacao.tags)), 'quiz'])),
        };
      } else if (criacao.tipo === 'resenha') {
        payload = {
          autor_id: alunoId,
          escola_id: escolaId,
          livro_id: criacao.livro_id || null,
          tipo: 'resenha',
          titulo: tituloBase,
          conteudo: descricaoBase || 'Nova resenha compartilhada pelo aluno.',
          imagem_urls: criacaoImagemUrls,
          tags: Array.from(new Set(ensureArray(criacao.tags))),
        };
      } else if (criacao.tipo === 'resumo') {
        payload = {
          autor_id: alunoId,
          escola_id: escolaId,
          livro_id: criacao.livro_id || null,
          tipo: ['dica', 'sugestão'].includes(tipoPersonalizado) ? tipoPersonalizado : 'sugestão',
          titulo: tituloBase,
          conteudo: descricaoBase || extractResumoTextoFromCriacao(criacao) || 'Resumo compartilhado pelo aluno.',
          imagem_urls: criacaoImagemUrls,
          tags: Array.from(new Set([...(ensureArray(criacao.tags)), 'resumo'])),
        };
      } else {
        payload = {
          autor_id: alunoId,
          escola_id: escolaId,
          livro_id: criacao.livro_id || null,
          audiobook_id: conteudoJson?.audiobook_id || null,
          tipo: ['dica', 'sugestão', 'resenha'].includes(tipoPersonalizado) ? tipoPersonalizado : 'dica',
          titulo: tituloBase,
          conteudo: descricaoBase || 'Projeto criativo compartilhado pelo aluno.',
          imagem_urls: criacaoImagemUrls,
          tags: Array.from(new Set(ensureArray(criacao.tags))),
        };
      }

      const { data: postCriado, error } = await insertCommunityPostCompat(payload, { expectSingleId: true });
      if (error) throw error;

      await updatePainelAlunoLabCreation(criacao.id, {
        publicado_comunidade: true,
        comunidade_post_id: postCriado?.id || null,
      });

      setCriacoesLaboratorio((prev) =>
        ensureArray(prev).map((item) =>
          item.id === criacao.id
            ? { ...item, publicado_comunidade: true, comunidade_post_id: postCriado?.id || null }
            : item,
        ),
      );

      setShareCriacaoDialogOpen(false);
      setShareCriacaoItem(null);
      toast({ title: 'Criação compartilhada na comunidade!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error?.message || 'Não foi possível compartilhar a criação salva.',
      });
    } finally {
      setSaving(false);
    }
  };

  const abrirConfirmacaoExclusaoCriacao = (criacao) => {
    if (!criacao?.id) return;
    setDeleteCriacaoItem(criacao);
    setDeleteCriacaoDialogOpen(true);
  };

  const apagarCriacaoLaboratorio = async (criacao) => {
    if (!criacao?.id) return;

    setSaving(true);
    try {
      if (labCriacoesMissingTable) {
        throw new Error('Tabela laboratorio_criacoes não encontrada. Aplique as migrations do Supabase.');
      }

      try {
        await deletePainelAlunoLabCreation({
          id: criacao.id,
          comunidadePostId: criacao.comunidade_post_id || null,
        });
      } catch (error) {
        if (isMissingTableError(error)) {
          setLabCriacoesMissingTable(true);
          throw new Error('Tabela laboratorio_criacoes não encontrada. Aplique as migrations do Supabase.');
        }
        throw error;
      }

      setDeleteCriacaoDialogOpen(false);
      setDeleteCriacaoItem(null);
      toast({ title: 'Criação removida.' });
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
    if (location.pathname === '/aluno/mensagens' || location.pathname === '/aluno/conversas') return 'conversas';
    return 'perfil';
  }, [location.pathname]);

  const pageTitle = useMemo(() => {
    if (activeSection === 'biblioteca') return 'Biblioteca';
    if (activeSection === 'laboratorio') return 'Laboratorio';
    if (activeSection === 'atividades') return 'Atividades';
    if (activeSection === 'conversas') return 'Conversas';
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
    const livro = livrosById.get(resumoLivroId);
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
    if (!alunoId) {
      toast({
        variant: 'destructive',
        title: 'Perfil incompleto',
        description: 'Não foi possível identificar seu perfil para salvar o desafio.',
      });
      return;
    }

    setGerandoDesafioIA(true);
    try {
      const criterio = escolherCriterioDesafio(desafioMetricas, nivelAtual);
      const perfilDesafio = getDesafioPerfilPorNivel(nivelAtual);
      const data = await generateTextWithIA(
        'gamificacao_desafio',
        {
          nome: user?.user_metadata?.nome || user?.email || 'Aluno',
          nivel: nivelAtual,
          perfil_nivel: perfilDesafio.chave,
          perfil_descricao: perfilDesafio.descricao,
          xp: pontosExperiencia,
          livrosLidos,
          avaliacoes: avaliacoes.length,
          atividadesAprovadas,
          criterio_tipo: criterio.tipo,
          criterio_alvo_total: criterio.alvo_total,
          criterio_valor_inicial: criterio.valor_inicial,
          criterio_rotulo: criterio.rotulo,
          livros_sugeridos: livrosSugeriveisDesafio,
        },
        'Não foi possível gerar desafio de gamificação no momento.',
      );
      const desafioPayload = extractDesafioIAFromResponse(data);
      const desafio = normalizeDesafioIA({
        ...desafioPayload,
        gerado_em: new Date().toISOString(),
        criterio: normalizarCriterioDesafioPorNivel(desafioPayload?.criterio, {
          ...desafioMetricas,
          [criterio.tipo]: criterio.valor_inicial,
        }, nivelAtual),
      });
      if (!desafio?.titulo || !desafio?.desafio) throw new Error('A IA respondeu sem desafio válido.');
      await persistirDesafioIA({ desafio, xpBonus: desafioXpBonus });
      setDesafioIA(desafio);
      if (desafioCacheKey) writeCache(desafioCacheKey, desafio);
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

  const concluirDesafioGamificacao = useCallback(async (origem = 'automatica') => {
    if (!desafioIA) return;
    if (desafioIA.concluido_em && origem === 'silenciosa') return;
    if (desafioIA.concluido_em) {
      toast({ title: 'Desafio já concluído', description: 'A recompensa deste desafio já foi adicionada ao seu perfil.' });
      return;
    }

    setSalvandoDesafioIA(true);
    try {
      const xpRecompensa = Math.max(0, Number(desafioIA.xp_recompensa || extractXpFromRewardText(desafioIA.recompensa)));
      const concluidoEm = new Date().toISOString();
      const proximoXpBonus = desafioXpBonus + xpRecompensa;

      await persistirDesafioIA({ desafio: null, xpBonus: proximoXpBonus, concluidoEm });
      setDesafioIA(null);
      setDesafioXpBonus(proximoXpBonus);
      if (desafioCacheKey) removeCache(desafioCacheKey);

      toast({
        title: 'Desafio concluído',
        description: xpRecompensa > 0 ? `Você recebeu ${xpRecompensa} XP pelo desafio semanal.` : 'Sua conclusão foi registrada.',
      });
      navigate('/aluno');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao concluir desafio',
        description: error?.message || 'Não foi possível registrar a conclusão do desafio.',
      });
    } finally {
      setSalvandoDesafioIA(false);
    }
  }, [desafioCacheKey, desafioIA, desafioXpBonus, navigate, persistirDesafioIA, toast]);

  useEffect(() => {
    if (!desafioIA || desafioIA.concluido_em || salvandoDesafioIA) return;
    if (!desafioFoiConcluidoPelaPlataforma(desafioIA, desafioMetricas)) return;
    concluirDesafioGamificacao('automatica');
  }, [concluirDesafioGamificacao, desafioIA, desafioMetricas, salvandoDesafioIA]);

  const salvarResumo = async () => {
    const livro = livrosById.get(resumoLivroId);
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
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível salvar o resumo.' });
    }
  };

  const abrirResumoCompleto = (resumo) => {
    if (!resumo) return;
    setResumoSelecionado(resumo);
    setResumoDialogOpen(true);
  };

  const abrirSinopseCompleta = (livro) => {
    if (!livro?.sinopse) return;
    setSinopseLivroSelecionado(livro);
    setSinopseDialogOpen(true);
  };

  const gerarResumoRapido = async (livro) => {
    if (!livro) return;
    setResumoRapidoLoadingId(livro.id);
    try {
      const data = await generateTextWithIA(
        'resumo_estudo',
        {
          titulo: livro.titulo,
          autor: livro.autor,
          sinopse: livro.sinopse || '',
        },
        'Não foi possível gerar o resumo rápido agora.',
      );
      const texto = extractResumoTextoFromIAResponse(data);
      if (!texto) throw new Error('A IA respondeu sem resumo.');
      setResumoRapidoData({ titulo: livro.titulo, autor: livro.autor, texto });
      setResumoRapidoOpen(true);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar resumo',
        description: error?.message || 'Não foi possível gerar o resumo rápido.',
      });
    } finally {
      setResumoRapidoLoadingId('');
    }
  };

  const carregarQuizSalvo = (criacao) => {
    if (!criacao) return;
    const payload = extractQuizFromCriacao(criacao);
    const perguntas = ensureArray(payload?.perguntas);
    if (perguntas.length === 0) {
      toast({ variant: 'destructive', title: 'Quiz inválido', description: 'Não foi possível carregar este quiz.' });
      return;
    }
    setQuizLivroId(criacao.livro_id || '');
    setQuizTema(criacao.descricao || 'compreensão da leitura');
    setQuiz(perguntas);
    setQuizRespostas({});
    setQuizResultado(null);
    toast({ title: 'Quiz carregado', description: 'Você pode jogar novamente.' });
  };

  if (loading) {
    return (
      <MainLayout title={pageTitle}>
        <div className="sr-only" aria-live="polite">{ariaLiveMessage}</div>
        <p className="text-center text-muted-foreground py-8">Carregando...</p>
      </MainLayout>
    );
  }

  return (
    <MainLayout title={pageTitle}>
      <div className="sr-only" aria-live="polite">{ariaLiveMessage}</div>
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
                  <Crown className="w-5 h-5 text-warning" /> Nivel {nivelAtual}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {pontosExperiencia} XP acumulado - faltam {Math.max(0, xpProximoNivel - pontosExperiencia)} XP para o proximo nivel
                </p>
              </div>
              <div className="rounded-xl border bg-background/80 px-3 py-2 text-sm flex items-center gap-2 student-achievement-chip">
                <Gift className="w-4 h-4 text-primary" />
                <span>{selosConquistados.length >= 3 ? 'Presente liberado!' : 'Conquiste 3 selos para liberar presente'}</span>
              </div>
            </div>
            <div className="space-y-1">
              <Progress value={progressoNivel} className="h-3" />
              <p className="text-xs text-muted-foreground">{Math.round(progressoNivel)}% do nivel atual</p>
            </div>
          </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Flame className="w-4 h-4" />
                  Desafio IA da semana
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button type="button" variant="outline" onClick={gerarDesafioGamificacao} disabled={gerandoDesafioIA || Boolean(desafioIA)}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {gerandoDesafioIA ? 'Gerando desafio semanal...' : 'Gerar desafio semanal'}
                </Button>
                <p className="text-xs text-muted-foreground">
                  O desafio semanal so some quando a meta for cumprida na plataforma ou depois de 7 dias. Ao concluir, o XP entra automaticamente no seu total.
                </p>
                {desafioIA && (
                  <div className="rounded-lg border p-3 space-y-1">
                    <p className="text-sm font-semibold">{desafioIA.titulo}</p>
                    <p className="text-sm text-muted-foreground">{desafioIA.desafio}</p>
                    {desafioIA.expira_em && !desafioIA.concluido_em && (
                      <p className="text-xs text-muted-foreground">
                        Disponivel ate {formatDateBR(desafioIA.expira_em)}
                      </p>
                    )}
                    {(desafioIA.livro_diferenciado?.titulo || desafioIA.livro_recomendado?.titulo) && (
                      <p className="text-xs text-muted-foreground">
                        Livro sugerido pela IA:{' '}
                        <span className="font-medium text-foreground">
                          {desafioIA.livro_diferenciado?.titulo || desafioIA.livro_recomendado?.titulo}
                        </span>
                        {(desafioIA.livro_diferenciado?.autor || desafioIA.livro_recomendado?.autor) &&
                          `, por ${desafioIA.livro_diferenciado?.autor || desafioIA.livro_recomendado?.autor}`}
                      </p>
                    )}
                    {(desafioIA.livro_diferenciado?.motivo || desafioIA.livro_recomendado?.motivo) && (
                      <p className="text-xs text-muted-foreground">
                        Motivo da escolha: {desafioIA.livro_diferenciado?.motivo || desafioIA.livro_recomendado?.motivo}
                      </p>
                    )}
                    {desafioIA.recompensa && (
                      <Badge variant="outline" className="mt-1">
                        Recompensa: {desafioIA.recompensa}
                      </Badge>
                    )}
                    {Number(desafioIA.xp_recompensa || extractXpFromRewardText(desafioIA.recompensa)) > 0 && (
                      <p className="text-xs text-muted-foreground">
                        XP previsto: {Number(desafioIA.xp_recompensa || extractXpFromRewardText(desafioIA.recompensa))} XP
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-2">
                      {desafioIA.concluido_em ? (
                        <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
                          Concluido em {formatDateBR(desafioIA.concluido_em)}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">
                          Validacao automatica pela plataforma
                        </Badge>
                      )}
                    </div>
                    {desafioIA.criterio?.tipo && !desafioIA.concluido_em && (
                      <p className="text-xs text-muted-foreground">
                        Progresso: {desafioProgressoAtual}/{desafioIA.criterio.alvo_total} {desafioIA.criterio.rotulo}
                      </p>
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
                      <p className="text-xs text-muted-foreground">Livros ja lidos</p>
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
                      <p className="text-xs text-muted-foreground">Notificacoes</p>
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
                    <div className="flex justify-end">
                      <Button size="sm" variant="ghost" onClick={markAllNotificationsRead}>
                        Marcar todas como lidas
                      </Button>
                    </div>
                    {notificacoes.map((n) => {
                      const content = (
                        <>
                          {n.tipo === 'atraso' ? (
                            <AlertTriangle className="w-4 h-4 text-destructive mt-0.5" />
                          ) : n.tipo === 'atividade' ? (
                            <Clock className="w-4 h-4 text-warning mt-0.5" />
                          ) : n.tipo === 'solicitacao' ? (
                            <BellRing className="w-4 h-4 text-info mt-0.5" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-primary mt-0.5" />
                          )}
                          <div>
                            <p className="text-sm font-medium">{n.titulo}</p>
                            <p className="text-xs text-muted-foreground">{n.descricao}</p>
                          </div>
                        </>
                      );
                      const handleClick = () => {
                        if (n.tipo === 'solicitacao' || n.tipo === 'solicitacao_chat') {
                          navigate('/aluno/mensagens');
                          return;
                        }
                        if (n.tipo === 'atividade') {
                          navigate('/aluno/atividades');
                          return;
                        }
                        if (n.tipo === 'atraso') {
                          navigate('/aluno/biblioteca');
                          setBibliotecaView('meus_livros');
                          return;
                        }
                        if (n.tipo === 'novidade') {
                          navigate('/aluno/biblioteca');
                          setBibliotecaView('biblioteca');
                          return;
                        }
                        if (n.tipo === 'comunicado') {
                          navigate('/aluno/comunicados');
                        }
                      };

                      return (
                        <div key={n.id} className="flex items-start gap-2">
                          <button
                            type="button"
                            className="flex-1 p-3 border rounded-lg flex items-start gap-3 text-left hover:border-info/60 hover:bg-info/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info/50"
                            onClick={handleClick}
                          >
                            {content}
                          </button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => markNotificationRead(n.id)}
                          >
                            Lida
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {activeSection !== 'perfil' && (
          <Tabs value={activeSection}>
            <TabsContent value="conversas" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Conversa com a biblioteca</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {conversasSolicitacoes.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                      Você ainda não iniciou nenhuma conversa com a biblioteca.
                    </div>
                  ) : (
                    conversasSolicitacoes.map((solicitacao) => {
                      const statusInfo = getSolicitacaoStatusInfo(solicitacao);
                      const isExtension = String(solicitacao?.tipo || 'emprestimo') === 'prorrogacao';
                      const podeConversar = !['aprovada', 'aceita', 'recusada', 'negada', 'cancelada'].includes(
                        String(solicitacao?.status || '').toLowerCase(),
                      );
                      const chatMensagens = [...ensureArray(solicitacao?.solicitacoes_emprestimo_mensagens)].sort(
                        (a, b) => new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime(),
                      );

                      return (
                        <div key={solicitacao.id} className="space-y-3 rounded-2xl border p-4">
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <p className="font-medium">{solicitacao.livros?.titulo || 'Livro'}</p>
                              <p className="text-xs text-muted-foreground">{solicitacao.livros?.autor || '-'}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {isExtension ? 'Pedido de prorrogação' : 'Solicitação de empréstimo'} • criada em {formatDateBR(solicitacao.created_at)}
                              </p>
                            </div>
                            <Badge variant={statusInfo.variant}>
                              {statusInfo.icon}
                              {statusInfo.label}
                            </Badge>
                          </div>

                          {isExtension && (
                            <div className="rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground">
                              <p>Data atual: {formatDateBR(solicitacao.data_devolucao_atual)}</p>
                              <p>Nova data pedida: {formatDateBR(solicitacao.nova_data_devolucao_solicitada)}</p>
                            </div>
                          )}

                          <div className="space-y-2 rounded-xl border bg-muted/20 p-3">
                            <p className="text-xs text-muted-foreground">Mensagens da conversa</p>

                            {solicitacao.mensagem && (
                              <div className="mr-6 rounded-md border bg-background px-3 py-2 text-sm">
                                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                  <span>Você</span>
                                  <span>{formatDateBR(solicitacao.created_at)}</span>
                                </div>
                                <p className="mt-1 whitespace-pre-wrap">{solicitacao.mensagem}</p>
                              </div>
                            )}

                            {solicitacao.resposta && (
                              <div className="ml-6 rounded-md border border-primary/20 bg-primary/10 px-3 py-2 text-sm">
                                <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                  <span>Biblioteca</span>
                                  <span>{formatDateBR(solicitacao.updated_at || solicitacao.created_at)}</span>
                                </div>
                                <p className="mt-1 whitespace-pre-wrap">{solicitacao.resposta}</p>
                              </div>
                            )}

                            {chatMensagens.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Nenhuma mensagem adicional registrada ainda.</p>
                            ) : (
                              <div className="max-h-72 space-y-2 overflow-y-auto">
                                {chatMensagens.map((mensagem) => {
                                  const isBiblioteca = mensagem?.autor_tipo === 'bibliotecaria';
                                  return (
                                    <div
                                      key={mensagem.id}
                                      className={`rounded-md border px-3 py-2 text-sm ${
                                        isBiblioteca ? 'ml-6 border-primary/20 bg-primary/10' : 'mr-6 bg-background'
                                      }`}
                                    >
                                      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                                        <span>{isBiblioteca ? 'Biblioteca' : 'Você'}</span>
                                        <span>{formatDateBR(mensagem.created_at)}</span>
                                      </div>
                                      <p className="mt-1 whitespace-pre-wrap">{mensagem.mensagem}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>

                          {podeConversar ? (
                            <div className="space-y-2">
                              <Textarea
                                rows={3}
                                placeholder="Escreva sua mensagem para a biblioteca..."
                                value={mensagemSolicitacaoPorId[solicitacao.id] || ''}
                                onChange={(e) =>
                                  setMensagemSolicitacaoPorId((prev) => ({
                                    ...prev,
                                    [solicitacao.id]: e.target.value,
                                  }))
                                }
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleEnviarMensagemSolicitacao(solicitacao.id);
                                  }
                                }}
                                disabled={saving}
                              />
                              <div className="flex justify-end">
                                <Button type="button" onClick={() => handleEnviarMensagemSolicitacao(solicitacao.id)} disabled={saving}>
                                  <Send className="mr-2 h-4 w-4" />
                                  Enviar mensagem
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">Esta conversa foi finalizada e está disponível apenas para consulta.</p>
                          )}
                        </div>
                      );
                    })
                  )}
                </CardContent>
              </Card>
            </TabsContent>

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
                      <Tabs value={atividadeView} onValueChange={setAtividadeView}>
                        <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-2xl bg-muted/50 p-2 sm:grid-cols-3">
                          <TabsTrigger value="pendentes" className="min-h-[52px] whitespace-normal rounded-2xl px-3 py-3 text-left text-xs leading-5 sm:text-center sm:text-sm">
                            Atividades pendentes ({atividadesPendentesLista.length})
                          </TabsTrigger>
                          <TabsTrigger value="enviadas" className="min-h-[52px] whitespace-normal rounded-2xl px-3 py-3 text-left text-xs leading-5 sm:text-center sm:text-sm">
                            Atividades enviadas ({atividadesEnviadasLista.length})
                          </TabsTrigger>
                          <TabsTrigger value="fora_prazo" className="min-h-[52px] whitespace-normal rounded-2xl px-3 py-3 text-left text-xs leading-5 sm:text-center sm:text-sm">
                            Fora do prazo ({atividadesForaDoPrazoLista.length})
                          </TabsTrigger>
                        </TabsList>
                      </Tabs>

                      {atividadeView === 'enviadas' && atividadesEnviadasLista.length > 0 && (
                        <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                          <label className="flex items-center gap-3 text-sm font-medium">
                            <Checkbox
                              checked={allAtividadesEnviadasSelected ? true : (someAtividadesEnviadasSelected ? 'indeterminate' : false)}
                              onCheckedChange={(checked) => toggleSelectAllAtividadesEnviadas(Boolean(checked))}
                              aria-label="Selecionar todas as atividades enviadas"
                            />
                            Selecionar todas
                          </label>

                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <span className="text-sm text-muted-foreground">
                              {selectedAtividadeIds.length} selecionada(s)
                            </span>
                            <Button
                              type="button"
                              variant="destructive"
                              disabled={saving || selectedAtividadeIds.length === 0}
                              onClick={() => setDeleteAtividadesDialogOpen(true)}
                              className="h-10 rounded-xl"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Apagar selecionadas
                            </Button>
                          </div>
                        </div>
                      )}

                      {atividadesVisiveis.length === 0 ? (
                        <p className="text-center text-muted-foreground py-8">{atividadeEmptyMessage}</p>
                      ) : atividadesVisiveis.map((atividade) => (
                        <div
                          key={atividade.id}
                          className="space-y-4 rounded-3xl border border-border/80 bg-gradient-to-br from-background via-background to-primary/5 p-4 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_18px_40px_rgba(0,0,0,0.08)] sm:p-5"
                        >
                          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                            <div className="space-y-2">
                              {atividadeView === 'enviadas' && atividade.entrega && (
                                <label className="flex w-fit items-center gap-3 rounded-full border border-border/70 bg-background/90 px-3 py-2 text-xs font-medium text-muted-foreground">
                                  <Checkbox
                                    checked={selectedAtividadeIdsSet.has(String(atividade.id))}
                                    onCheckedChange={(checked) => toggleAtividadeSelection(atividade.id, Boolean(checked))}
                                    aria-label={`Selecionar atividade ${atividade.titulo}`}
                                  />
                                  Selecionar para apagar
                                </label>
                              )}
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="font-semibold">{atividade.titulo}</p>
                                {Array.isArray(atividade.atividadeMeta?.formulario?.perguntas)
                                  && atividade.atividadeMeta.formulario.perguntas.length > 0 && (
                                  <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                                    {atividade.atividadeMeta.formulario.perguntas.length} questões
                                  </Badge>
                                )}
                              </div>
                              <p className="text-xs text-muted-foreground">{atividade.livros?.titulo || 'Livro nao informado'}</p>
                              <p className="text-xs text-muted-foreground">
                                Professor: {atividade.professor?.nome || 'Professor nao informado'}
                              </p>
                              {atividade.atividadeMeta?.descricaoLimpa && (
                                <p className="rounded-2xl border border-primary/10 bg-primary/5 px-3 py-2 text-sm leading-6">
                                  {atividade.atividadeMeta.descricaoLimpa}
                                </p>
                              )}
                            </div>
                            <div className="grid gap-2 text-left sm:max-w-xs sm:grid-cols-2 md:block md:text-right">
                              <Badge variant="outline" className="w-fit rounded-full px-3 py-1 md:ml-auto">
                                Pontos possiveis: {Number(atividade.pontos_extras || 0)}
                              </Badge>
                              <p className="text-xs leading-5 text-muted-foreground">
                                Entrega: {formatDateBR(atividade.data_entrega)}
                              </p>
                              {!atividade.entrega && atividadeView === 'fora_prazo' && (
                                <Badge variant="destructive" className="w-fit rounded-full px-3 py-1 md:ml-auto">
                                  Prazo encerrado
                                </Badge>
                              )}
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Minha entrega</Label>
                            <Textarea
                              rows={4}
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
                            <div className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                                <p className="text-sm font-medium">Formulario da atividade</p>
                                <span className="text-xs text-primary">Responda com calma</span>
                              </div>
                              {atividade.atividadeMeta.formulario.perguntas.map((pergunta, idx) => {
                                const perguntaId = String(pergunta?.id || `q_${idx + 1}`);
                                const respostaAtual = String(atividadeRespostas[atividade.id]?.[perguntaId] || '');
                                const opcoes = ensureArray(pergunta?.opcoes);
                                const tipo = String(pergunta?.tipo || 'texto');
                                return (
                                  <div key={perguntaId} className="space-y-3 rounded-2xl border bg-background/95 p-4 shadow-sm animate-in fade-in-0 slide-in-from-bottom-2">
                                    <Label className="text-xs uppercase tracking-[0.18em] text-primary">
                                      {idx + 1}. {String(pergunta?.pergunta || 'Pergunta')}
                                    </Label>
                                    {tipo === 'multipla_escolha' && opcoes.length > 0 ? (
                                      <div className="grid gap-2 sm:grid-cols-2">
                                        {opcoes.map((opcao, optionIndex) => {
                                          const selected = respostaAtual === String(opcao);
                                          return (
                                            <button
                                              key={`${perguntaId}-${optionIndex}`}
                                              type="button"
                                              className={`rounded-2xl border px-4 py-3 text-left text-sm leading-5 transition-all duration-200 hover:-translate-y-0.5 ${
                                                selected
                                                  ? 'border-primary bg-primary text-primary-foreground shadow-[0_12px_24px_rgba(0,0,0,0.12)]'
                                                  : 'border-border bg-background hover:border-primary/40'
                                              }`}
                                              onClick={() =>
                                                setAtividadeRespostas((prev) => ({
                                                  ...prev,
                                                  [atividade.id]: {
                                                    ...(prev[atividade.id] || {}),
                                                    [perguntaId]: selected ? '' : String(opcao),
                                                  },
                                                }))
                                              }
                                            >
                                              {String(opcao)}
                                            </button>
                                          );
                                        })}
                                      </div>
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
                            <input
                              ref={(node) => {
                                if (node) {
                                  activityImageInputRefs.current[atividade.id] = node;
                                } else {
                                  delete activityImageInputRefs.current[atividade.id];
                                }
                              }}
                              id={`atividade-imagens-${atividade.id}`}
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => handleActivityFileInputChange(atividade.id, e)}
                            />
                            <div className="flex flex-col gap-2 rounded-2xl border border-border/70 bg-background/80 p-3 sm:flex-row sm:items-center sm:justify-between">
                              <Button
                                type="button"
                                variant="outline"
                                className="w-full sm:w-auto"
                                onClick={() => activityImageInputRefs.current[atividade.id]?.click()}
                              >
                                Escolher arquivos
                              </Button>
                              <p className="text-sm text-muted-foreground">
                                {ensureArray(atividadeImagens[atividade.id]).length > 0
                                  ? `${ensureArray(atividadeImagens[atividade.id]).length} imagem(ns) selecionada(s)`
                                  : 'Nenhum arquivo escolhido'}
                              </p>
                            </div>
                            {ensureArray(atividadeImagens[atividade.id]).length > 0 && (
                              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                                {ensureArray(atividadeImagens[atividade.id]).map((img, imageIndex) => (
                                  <div key={`${atividade.id}-img-${imageIndex}`} className="relative">
                                    <ResolvedMediaImage
                                      value={img}
                                      alt={`Atividade ${imageIndex + 1}`}
                                      className="h-24 w-full rounded-xl border object-cover"
                                    />
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setAtividadeImagens((prev) => ({
                                          ...prev,
                                          [atividade.id]: ensureArray(prev[atividade.id]).filter((_, i) => i !== imageIndex),
                                        }))
                                      }
                                      className="absolute -top-2 -right-2 rounded-full bg-destructive p-1 text-destructive-foreground"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/80 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap items-center gap-2 text-sm">
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
                                    className="rounded-full px-3"
                                  >
                                    {atividade.entrega.status}
                                  </Badge>
                                  <span className="text-muted-foreground">
                                    Pontos recebidos: {Number(atividade.entrega.pontos_ganhos || 0)}
                                  </span>
                                </>
                              ) : (
                                <Badge variant="outline" className="rounded-full px-3">Ainda não enviado</Badge>
                              )}
                            </div>

                            <Button onClick={() => handleEnviarAtividade(atividade)} disabled={saving} className="h-11 w-full rounded-2xl sm:w-auto">
                              <Send className="w-4 h-4 mr-2" />
                              {atividade.entrega ? 'Atualizar entrega' : 'Enviar atividade'}
                            </Button>
                          </div>

                          {atividade.entrega?.feedback_professor && (
                            <div className="rounded-2xl bg-muted p-3 sm:p-4">
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
                  <CardTitle className="text-base">Sugestoes dos professores</CardTitle>
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
                  <Label>Adicionar imagens do computador (ate 8)</Label>
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
                          onClick={() => abrirConfirmacaoExclusaoSlide(slide)}
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
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                  <div className="space-y-1">
                    <Label htmlFor="quiz-livro">Livro</Label>
                    <select
                      id="quiz-livro"
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      value={quizLivroId}
                      onChange={(e) => setQuizLivroId(e.target.value)}
                    >
                      <option value="">Selecione um livro</option>
                      {meusLivrosOptions.map((livro) => (
                        <option key={livro.id} value={livro.id}>
                          {livro.titulo}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="quiz-tema" className="opacity-0">
                      Tema
                    </Label>
                    <Input
                      id="quiz-tema"
                      value={quizTema}
                      onChange={(e) => setQuizTema(e.target.value)}
                      placeholder="Tema do quiz (ex.: interpretacao)"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="opacity-0">Gerar</Label>
                    <Button type="button" variant="outline" onClick={gerarQuizComIA} disabled={gerandoQuizIA} className="w-full">
                      <Sparkles className="w-4 h-4 mr-2" />
                      {gerandoQuizIA ? 'Gerando quiz...' : 'Gerar quiz IA'}
                    </Button>
                  </div>
                </div>

                {quiz.length > 0 && (
                  <div className="space-y-3">
                    <div className="rounded-md border bg-muted/20 p-3 text-sm">
                      <p className="font-medium">Fonte do quiz</p>
                      <p className="text-xs text-muted-foreground">
                        Livro: {livrosById.get(quizLivroId)?.titulo || '-'} - Tema: {quizTema.trim() || 'compreensão da leitura'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Questoes: {quiz.length} - Nivel: {quizNivel}
                      </p>
                      {quizHistoricoAtual && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Ultimo: {quizHistoricoAtual.last?.acertos}/{quizHistoricoAtual.last?.total} - Melhor: {quizHistoricoAtual.best?.acertos}/{quizHistoricoAtual.best?.total}
                        </p>
                      )}
                    </div>
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
                      <Button type="button" variant="ghost" onClick={resetarQuizAtual}>
                        Jogar novamente
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
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                      <Sparkles className="h-3.5 w-3.5" />
                      Ferramenta de estudo com IA
                    </div>
                    <div>
                      <CardTitle className="text-base">Resumo com IA</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Gere um resumo inicial, refine com suas ideias e salve suas melhores versoes no laboratorio.
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 sm:w-auto">
                    <div className="rounded-xl border bg-muted/30 px-3 py-2 text-center">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Livros</p>
                      <p className="text-lg font-semibold">{meusLivrosOptions.length}</p>
                    </div>
                    <div className="rounded-xl border bg-muted/30 px-3 py-2 text-center">
                      <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Salvos</p>
                      <p className="text-lg font-semibold">{resumosCriados.length}</p>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-background to-warning/10 p-4">
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(280px,0.9fr)]">
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
                        <div className="space-y-2">
                          <Label htmlFor="resumo-livro">Livro</Label>
                          <select
                            id="resumo-livro"
                            className="h-11 w-full rounded-xl border border-border/70 bg-background/95 px-3 text-sm shadow-sm transition-colors focus:border-primary focus:outline-none"
                            value={resumoLivroId}
                            onChange={(e) => setResumoLivroId(e.target.value)}
                          >
                            <option value="">Selecione um livro</option>
                            {meusLivrosOptions.map((livro) => (
                              <option key={livro.id} value={livro.id}>
                                {livro.titulo}
                              </option>
                            ))}
                          </select>
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={gerarResumo}
                          disabled={gerandoResumoIA}
                          className="h-11 rounded-xl border-primary/30 bg-background/90 px-4"
                        >
                          <Sparkles className="mr-2 h-4 w-4" />
                          {gerandoResumoIA ? 'Gerando resumo...' : 'Gerar resumo IA'}
                        </Button>
                        <Button type="button" onClick={salvarResumo} className="h-11 rounded-xl px-4 shadow-sm">
                          Salvar resumo
                        </Button>
                      </div>

                      <Textarea
                        rows={9}
                        value={resumoTexto}
                        onChange={(e) => setResumoTexto(e.target.value)}
                        placeholder="O resumo gerado aparecera aqui..."
                        className="min-h-[220px] rounded-2xl border-border/70 bg-background/95 shadow-sm"
                      />
                    </div>

                    <div className="space-y-3 rounded-2xl border bg-background/80 p-4 shadow-sm">
                      <div className="flex items-center gap-2">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10">
                          <BookOpen className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Dicas para um resumo melhor</p>
                          <p className="text-xs text-muted-foreground">Use a IA como ponto de partida, nao como versao final.</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="rounded-xl border bg-muted/30 p-3">
                          <p className="text-sm font-medium">1. Gere a base</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Escolha o livro e peça um resumo para organizar os principais acontecimentos.
                          </p>
                        </div>
                        <div className="rounded-xl border bg-muted/30 p-3">
                          <p className="text-sm font-medium">2. Personalize o texto</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Ajuste o tom, acrescente sua interpretacao e deixe o texto com a sua voz.
                          </p>
                        </div>
                        <div className="rounded-xl border bg-muted/30 p-3">
                          <p className="text-sm font-medium">3. Salve o que ficou bom</p>
                          <p className="mt-1 text-xs leading-5 text-muted-foreground">
                            Guarde as melhores versoes para revisar depois ou publicar no laboratorio.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {resumosCriados.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-semibold">Resumos salvos</p>
                        <p className="text-xs text-muted-foreground">Continue de onde parou e abra qualquer resumo completo quando quiser.</p>
                      </div>
                      <Badge variant="outline" className="w-fit rounded-full px-3 py-1">
                        {resumosCriados.length} salvo{resumosCriados.length !== 1 ? 's' : ''}
                      </Badge>
                    </div>
                    <div className="grid gap-3 md:grid-cols-2">
                      {resumosCriados.slice(0, resumosLimit).map((resumo) => (
                        <div key={resumo.id} className="rounded-2xl border bg-background p-4 shadow-sm transition-colors hover:border-primary/30">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold">{resumo.livroTitulo}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {resumo.criadoEm ? `Salvo em ${formatDateBR(resumo.criadoEm)}` : 'Salvo no laboratorio'}
                              </p>
                            </div>
                            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                              <Sparkles className="h-4 w-4 text-primary" />
                            </div>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-foreground/90 line-clamp-4">{resumo.texto}</p>
                          <div className="mt-4 flex justify-end">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="rounded-full px-4"
                            onClick={() =>
                              abrirResumoCompleto({
                                titulo: resumo.livroTitulo,
                                texto: resumo.texto,
                                criadoEm: resumo.criadoEm,
                              })
                            }
                          >
                            Ver completo
                          </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                    {resumosCriados.length > resumosLimit && (
                      <div className="flex justify-center">
                        <Button type="button" variant="outline" size="sm" className="rounded-full px-5" onClick={() => setResumosLimit((prev) => prev + 5)}>
                          Carregar mais
                        </Button>
                      </div>
                    )}
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
                    {criacoesLaboratorioFiltradas.slice(0, criacoesLimit).map((criacao) => {
                      const resumoTextoCompleto = criacao.tipo === 'resumo' ? extractResumoTextoFromCriacao(criacao) : '';
                      return (
                        <div key={criacao.id} className="rounded-md border p-3 space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">{repairMojibakeText(criacao.titulo) || 'Criação sem título'}</p>
                              <p className="text-xs text-muted-foreground">
                                {criacao.tipo} • {formatDateBR(criacao.created_at)}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant={criacao.publicado_comunidade || criacao.comunidade_post_id ? 'secondary' : 'outline'}
                                onClick={() => abrirCompartilhamentoCriacao(criacao)}
                                disabled={saving || criacao.publicado_comunidade || Boolean(criacao.comunidade_post_id)}
                              >
                                <Send className="w-3 h-3 mr-1" />
                                {criacao.publicado_comunidade || criacao.comunidade_post_id ? 'Compartilhado' : 'Compartilhar'}
                              </Button>
                              <Button type="button" size="sm" variant="destructive" onClick={() => abrirConfirmacaoExclusaoCriacao(criacao)} disabled={saving}>
                                <Trash2 className="w-3 h-3 mr-1" />
                                Apagar
                              </Button>
                            </div>
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
                          {criacao.descricao && <p className="text-sm text-muted-foreground">{repairMojibakeText(criacao.descricao)}</p>}
                          {criacao.tipo === 'quiz' && (
                            <div className="flex justify-end">
                              <Button type="button" size="sm" variant="outline" onClick={() => carregarQuizSalvo(criacao)}>
                                Jogar novamente
                              </Button>
                            </div>
                          )}
                          {criacao.tipo === 'resumo' && resumoTextoCompleto && (
                            <div className="flex justify-end">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={() =>
                                  abrirResumoCompleto({
                                    titulo: criacao.titulo || 'Resumo salvo',
                                    texto: resumoTextoCompleto,
                                    criadoEm: criacao.created_at,
                                  })
                                }
                              >
                                Ver completo
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {criacoesLaboratorioFiltradas.length > criacoesLimit && (
                      <div className="flex justify-center">
                        <Button type="button" variant="outline" size="sm" onClick={() => setCriacoesLimit((prev) => prev + 10)}>
                          Carregar mais
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="biblioteca" className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Buscar livros... (Enter para pesquisar no catalogo)"
                className="pl-9"
                value={searchTerm}
                onChange={(e) => {
                  const value = e.target.value;
                  setSearchTerm(value);
                  if (!value.trim()) {
                    setCatalogoSearchTerm('');
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setCatalogoSearchTerm(searchTerm);
                  }
                }}
              />
            </div>

            <Card>
              <CardContent className="pt-6 space-y-4">
                <div className="flex flex-wrap gap-2 rounded-lg border p-1 bg-muted/20">
                  <Button
                    type="button"
                    size="sm"
                    variant={bibliotecaView === 'biblioteca' ? 'default' : 'ghost'}
                    onClick={() => setBibliotecaView('biblioteca')}
                  >
                    Biblioteca
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={bibliotecaView === 'minhas_solicitacoes' ? 'default' : 'ghost'}
                    onClick={() => setBibliotecaView('minhas_solicitacoes')}
                  >
                    Minhas solicitacoes
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={bibliotecaView === 'meus_livros' ? 'default' : 'ghost'}
                    onClick={() => setBibliotecaView('meus_livros')}
                  >
                    Meus livros
                  </Button>
                </div>

                {bibliotecaView === 'meus_livros' && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">Meus livros</p>
                    {filteredMeusLivros.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Você ainda nao tem livros aprovados/emprestados.</p>
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
                              <p className="text-xs text-muted-foreground">
                                Devolução prevista: {item.data_devolucao_prevista ? formatDateBR(item.data_devolucao_prevista) : 'Não informada'}
                              </p>
                              {pendingExtensionRequestsByLoanId.has(item.id) ? (
                                <div className="pt-1">
                                  <Badge variant="secondary">Prorrogação em análise</Badge>
                                </div>
                              ) : canRequestLoanExtension(item) ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="mt-2 w-full"
                                  onClick={() => openLoanExtensionDialog(item)}
                                >
                                  Pedir extensão de prazo
                                </Button>
                              ) : null}
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
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                      <div className="space-y-1">
                        <Label htmlFor="catalogo-area">Area</Label>
                        <select
                          id="catalogo-area"
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                          value={catalogoAreaFilter}
                          onChange={(e) => setCatalogoAreaFilter(e.target.value)}
                        >
                          <option value="all">Todas as areas</option>
                          {catalogoAreas.map((area) => (
                            <option key={area} value={area}>{area}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="catalogo-disponibilidade">Disponibilidade</Label>
                        <select
                          id="catalogo-disponibilidade"
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                          value={catalogoDisponibilidadeFilter}
                          onChange={(e) => setCatalogoDisponibilidadeFilter(e.target.value)}
                        >
                          <option value="all">Todas</option>
                          <option value="disponivel">Disponiveis</option>
                          <option value="emprestado">Emprestados</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="catalogo-autor">Autor</Label>
                        <select
                          id="catalogo-autor"
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                          value={catalogoAutorFilter}
                          onChange={(e) => setCatalogoAutorFilter(e.target.value)}
                        >
                          <option value="all">Todos os autores</option>
                          {catalogoAutores.map((autor) => (
                            <option key={autor} value={autor}>{autor}</option>
                          ))}
                        </select>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setCatalogoAreaFilter('all');
                          setCatalogoDisponibilidadeFilter('all');
                          setCatalogoAutorFilter('all');
                        }}
                      >
                        Limpar filtros
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch">
                      {filteredCatalogo.map((livro) => {
                        const isSpeakingThis = speakingLivroId === livro.id;
                        const isLoadingThis = isSpeakingThis && speakingPhase === 'loading';
                        const isPlayingThis = isSpeakingThis && speakingPhase === 'playing';
                        const xpLivro = getLivroXpPorCategoria(livro.area);
                        const xpLivroDescricao = getLivroXpDescricao(livro.area);
                        const livroArea = canonicalizeBookArea(livro.area) || 'Geral';
                        return (
                        <div key={livro.id} className="rounded-2xl border bg-card flex flex-col min-h-[360px] overflow-hidden">
                          <div className="min-h-[92px] bg-gradient-to-br from-secondary/30 via-secondary/10 to-transparent p-3 flex items-start justify-between gap-2">
                            <Badge variant="outline" className="text-[11px] px-2 py-0.5">{livroArea}</Badge>
                            <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => toggleWishlist(livro.id)}>
                              <Heart className={`w-4 h-4 ${wishlist.includes(livro.id) ? 'fill-destructive text-destructive' : ''}`} />
                            </Button>
                          </div>
                          <div className="p-3 flex flex-col gap-2 flex-1">
                            <div className="space-y-1">
                              <p className="font-semibold text-sm leading-5 line-clamp-2 min-h-[40px]">{livro.titulo}</p>
                              <p className="text-xs text-muted-foreground line-clamp-1">{livro.autor}</p>
                              {(livro.vol || livro.ano) && (
                                <p className="text-xs text-muted-foreground line-clamp-1">
                                  {[livro.vol ? `Vol. ${livro.vol}` : null, livro.ano ? `Ano ${livro.ano}` : null].filter(Boolean).join(' - ')}
                                </p>
                              )}
                              <div className="flex flex-wrap items-center gap-2 pt-1">
                                <Badge variant="outline" className="text-[11px] border-primary/40 text-primary">
                                  {xpLivro} XP
                                </Badge>
                                <span className="text-[11px] text-muted-foreground">{xpLivroDescricao}</span>
                              </div>
                              <Badge variant={livro.disponivel ? 'default' : 'secondary'} className="text-[11px]">
                                {livro.disponivel ? 'Disponivel' : 'Emprestado'}
                              </Badge>
                            </div>

                            {livro.sinopse && (
                              <div>
                                <button
                                  type="button"
                                  className="w-full rounded-2xl border border-border/70 bg-muted/35 p-3 text-left shadow-[inset_0_1px_0_hsl(var(--background)/0.35)] transition-colors hover:border-primary/30 hover:bg-muted/55"
                                  onClick={() => abrirSinopseCompleta(livro)}
                                >
                                  <p className="line-clamp-3 min-h-[60px] text-xs leading-5 text-foreground/88" translate="no">{livro.sinopse}</p>
                                  <p className="mt-2 text-xs font-semibold text-primary">Ver sinopse completa</p>
                                </button>
                                <Button size="sm" variant="ghost" className="h-6 px-1 text-xs mt-1" onClick={() => speakText(livro.id, livro.sinopse || '')}>
                                  {isLoadingThis ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : isPlayingThis ? <VolumeX className="w-3 h-3 mr-1" /> : <Volume2 className="w-3 h-3 mr-1" />}
                                  {isLoadingThis ? 'Carregando...' : isPlayingThis ? 'Parar' : 'Ouvir sinopse'}
                                </Button>
                              </div>
                            )}

                            <div className="mt-auto grid grid-cols-2 gap-2 pt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-8"
                                onClick={() => gerarResumoRapido(livro)}
                                disabled={resumoRapidoLoadingId === livro.id}
                              >
                                <Sparkles className="w-3 h-3 mr-1" />
                                {resumoRapidoLoadingId === livro.id ? 'Gerando...' : 'Resumo'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-8"
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
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-8 col-span-2"
                                disabled={hasSolicitacaoEmAndamento(livro.id) || hasEmprestimoAtivo(livro.id) || !livro.disponivel}
                                title={
                                  !livro.disponivel
                                    ? 'Livro emprestado'
                                    : hasEmprestimoAtivo(livro.id)
                                      ? 'Livro ja emprestado'
                                      : hasSolicitacaoEmAndamento(livro.id)
                                        ? 'Solicitacao ja enviada'
                                        : 'Solicitar empréstimo'
                                }
                                onClick={() => {
                                  setRequestLivro(livro);
                                  setRequestDialog(true);
                                }}
                              >
                                <Send className="w-3 h-3 mr-1" />
                                {hasEmprestimoAtivo(livro.id)
                                  ? 'Emprestado'
                                  : hasSolicitacaoEmAndamento(livro.id)
                                     ? 'Ja solicitado'
                                    : livro.disponivel
                                      ? 'Solicitar'
                                       : 'Indisponivel'
                                }
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    </div>
                    {livrosHasMore && (
                      <div className="flex justify-center pt-4">
                        <Button type="button" variant="outline" onClick={() => fetchLivrosPage({ reset: false })} disabled={livrosLoadingMore}>
                          {livrosLoadingMore ? 'Carregando...' : 'Carregar mais'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {bibliotecaView === 'minhas_solicitacoes' && (
                  <div className="space-y-3">
                    <p className="text-sm font-semibold">Minhas solicitacoes de emprestimo</p>
                    <div className="flex flex-wrap gap-2 rounded-lg border p-1 bg-muted/20">
                      <Button
                        type="button"
                        size="sm"
                        variant={solicitacoesView === 'pendentes' ? 'default' : 'ghost'}
                        onClick={() => setSolicitacoesView('pendentes')}
                      >
                        Aguardando aprovação ({solicitacoesGroups.pendentes.length})
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
                        variant={solicitacoesView === 'recusados' ? 'default' : 'ghost'}
                        onClick={() => setSolicitacoesView('recusados')}
                      >
                        Recusados ({solicitacoesGroups.recusados.length})
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
                      <p className="text-center text-muted-foreground py-8">Você ainda não fez solicitacoes.</p>
                    ) : (
                      <div className="space-y-3">
                        {solicitacoesExibidas.slice(0, solicitacoesLimit).map((solicitacao) => {
                          const statusInfo = getSolicitacaoStatusInfo(solicitacao);
                          const timeline = buildSolicitacaoTimeline(solicitacao);
                          const isExtension = String(solicitacao?.tipo || 'emprestimo') === 'prorrogacao';
                          const podeConversar = !['aprovada', 'aceita', 'recusada', 'negada', 'cancelada'].includes(
                            String(solicitacao?.status || '').toLowerCase(),
                          );
                          const chatMensagens = [...ensureArray(solicitacao?.solicitacoes_emprestimo_mensagens)].sort(
                            (a, b) => new Date(a?.created_at || 0).getTime() - new Date(b?.created_at || 0).getTime(),
                          );
                          return (
                          <div key={solicitacao.id} className="p-3 border rounded-lg space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium">{solicitacao.livros?.titulo || 'Livro'}</p>
                                <p className="text-xs text-muted-foreground">{solicitacao.livros?.autor || '-'}</p>
                                <p className="text-xs text-muted-foreground">
                                  {isExtension ? 'Tipo: pedido de prorrogação' : 'Tipo: solicitação de empréstimo'}
                                </p>
                              </div>
                              <Badge
                                variant={statusInfo.variant}
                              >
                                {statusInfo.icon}
                                {statusInfo.label}
                              </Badge>
                            </div>

                            <p className="text-xs text-muted-foreground">Solicitado em: {formatDateBR(solicitacao.created_at)}</p>

                            {isExtension && (
                              <div className="rounded-md border bg-muted/20 p-2 text-xs">
                                <p>Data atual: {formatDateBR(solicitacao.data_devolucao_atual)}</p>
                                <p>Nova data pedida: {formatDateBR(solicitacao.nova_data_devolucao_solicitada)}</p>
                              </div>
                            )}

                            {timeline.length > 1 && (
                              <div className="rounded-md border bg-muted/20 p-2">
                                <p className="text-xs text-muted-foreground">Linha do tempo</p>
                                <div className="mt-1 space-y-1">
                                  {timeline.map((item) => (
                                    <p key={`${solicitacao.id}-${item.label}`} className="text-xs">
                                      <span className="font-medium">{item.label}:</span> {formatDateBR(item.date)}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            )}

                            {solicitacao.mensagem && (
                              <div className="rounded-md border bg-muted/30 p-2">
                                <p className="text-xs text-muted-foreground">Sua mensagem</p>
                                <p className="text-sm">{solicitacao.mensagem}</p>
                              </div>
                            )}

                            <div className="rounded-md border bg-muted/20 p-3 text-sm text-muted-foreground">
                              <p>
                                {chatMensagens.length > 0
                                  ? `Esta solicitação já tem ${chatMensagens.length} mensagem(ns) na aba Mensagens.`
                                  : 'As mensagens desta solicitação agora ficam na aba Mensagens.'}
                              </p>
                              <div className="mt-3 flex justify-end">
                                <Button type="button" size="sm" variant={podeConversar ? 'default' : 'outline'} onClick={() => navigate('/aluno/mensagens')}>
                                  <Send className="w-4 h-4 mr-2" />
                                  {podeConversar ? 'Abrir mensagens' : 'Ver histórico das mensagens'}
                                </Button>
                              </div>
                            </div>
                          </div>
                        );
                        })}
                        {solicitacoesExibidas.length > solicitacoesLimit && (
                          <div className="flex justify-center">
                            <Button type="button" variant="outline" size="sm" onClick={() => setSolicitacoesLimit((prev) => prev + 10)}>
                              Carregar mais
                            </Button>
                          </div>
                        )}
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
                <CardTitle className="text-base">Minhas avaliacoes</CardTitle>
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
                <CardTitle className="text-base">Sugestoes dos professores</CardTitle>
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

      <Dialog
        open={deleteAtividadesDialogOpen}
        onOpenChange={(open) => {
          setDeleteAtividadesDialogOpen(open);
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Apagar atividades enviadas</DialogTitle>
            <DialogDescription>
              Essa ação remove as entregas selecionadas e permite enviar novamente depois.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground">
            {selectedAtividadeIds.length === 1
              ? 'Deseja apagar a atividade selecionada?'
              : `Deseja apagar as ${selectedAtividadeIds.length} atividades selecionadas?`}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteAtividadesDialogOpen(false)} disabled={saving} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteSelectedAtividades}
              disabled={saving || selectedAtividadeIds.length === 0}
              className="w-full sm:w-auto"
            >
              {saving ? 'Apagando...' : 'Confirmar exclusão'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={reviewDialog} onOpenChange={setReviewDialog}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg rounded-2xl p-4 sm:p-6">
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

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setReviewDialog(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button onClick={handleSaveReview} disabled={saving} className="w-full sm:w-auto">
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={requestDialog} onOpenChange={setRequestDialog}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Solicitar empréstimo</DialogTitle>
            <DialogDescription>Solicitar: {requestLivro?.titulo}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {requestLivro && hasSolicitacaoEmAndamento(requestLivro.id) && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                Você já solicitou este livro. Aguarde a aprovação da bibliotecária para solicitar novamente.
              </div>
            )}
            {requestLivro && hasEmprestimoAtivo(requestLivro.id) && (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                Este livro já está emprestado para você. Acompanhe em "Meus livros".
              </div>
            )}
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

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setRequestDialog(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button
              onClick={handleRequestLoan}
              disabled={
                saving
                || (requestLivro && (hasSolicitacaoEmAndamento(requestLivro.id) || hasEmprestimoAtivo(requestLivro.id)))
              }
              className="w-full sm:w-auto"
            >
              {saving ? 'Enviando...' : 'Enviar solicitação'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={extensionDialogOpen}
        onOpenChange={(open) => {
          setExtensionDialogOpen(open);
          if (!open) {
            setExtensionEmprestimo(null);
            setExtensionRequestedDate('');
            setExtensionMessage('');
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-lg rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Pedir extensão de prazo</DialogTitle>
            <DialogDescription>
              {extensionEmprestimo?.livros?.titulo || 'Livro'}: solicite uma nova data para a bibliotecária avaliar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              Data atual de devolução: {formatDateBR(extensionEmprestimo?.data_devolucao_prevista)}
            </div>
            <div className="space-y-2">
              <Label htmlFor="extensionRequestedDate">Nova data desejada</Label>
              <Input
                id="extensionRequestedDate"
                type="date"
                value={extensionRequestedDate}
                min={formatDateInputValue(extensionEmprestimo?.data_devolucao_prevista)}
                onChange={(e) => setExtensionRequestedDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="extensionMessage">Mensagem para a biblioteca</Label>
              <Textarea
                id="extensionMessage"
                rows={3}
                value={extensionMessage}
                onChange={(e) => setExtensionMessage(e.target.value)}
                placeholder="Explique por que você precisa de mais prazo."
              />
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setExtensionDialogOpen(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button onClick={handleRequestLoanExtension} disabled={saving} className="w-full sm:w-auto">
              {saving ? 'Enviando...' : 'Enviar pedido'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resumoDialogOpen}
        onOpenChange={(open) => {
          setResumoDialogOpen(open);
          if (!open) setResumoSelecionado(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{resumoSelecionado?.titulo || 'Resumo completo'}</DialogTitle>
            {resumoSelecionado?.criadoEm && (
              <DialogDescription>Salvo em {formatDateBR(resumoSelecionado.criadoEm)}</DialogDescription>
            )}
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm text-muted-foreground">
            {resumoSelecionado?.texto || 'Resumo indisponivel.'}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={sinopseDialogOpen}
        onOpenChange={(open) => {
          setSinopseDialogOpen(open);
          if (!open) setSinopseLivroSelecionado(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{sinopseLivroSelecionado?.titulo || 'Sinopse completa'}</DialogTitle>
            {sinopseLivroSelecionado?.autor && (
              <DialogDescription>{sinopseLivroSelecionado.autor}</DialogDescription>
            )}
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm text-muted-foreground">
            {sinopseLivroSelecionado?.sinopse || 'Sinopse indisponivel.'}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={resumoRapidoOpen}
        onOpenChange={(open) => {
          setResumoRapidoOpen(open);
          if (!open) setResumoRapidoData(null);
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>{resumoRapidoData?.titulo || 'Resumo rapido'}</DialogTitle>
            {resumoRapidoData?.autor && (
              <DialogDescription>{resumoRapidoData.autor}</DialogDescription>
            )}
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm text-muted-foreground">
            {resumoRapidoData?.texto || 'Resumo indisponivel.'}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={shareCriacaoDialogOpen}
        onOpenChange={(open) => {
          setShareCriacaoDialogOpen(open);
          if (!open) {
            setShareCriacaoItem(null);
            setShareCriacaoTitulo('');
            setShareCriacaoDescricao('');
            setShareCriacaoTipo('dica');
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-xl rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Compartilhar criação na comunidade</DialogTitle>
            <DialogDescription>
              Personalize o título, a descrição e o tipo da postagem antes de publicar.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={shareCriacaoTitulo}
                onChange={(e) => setShareCriacaoTitulo(e.target.value)}
                placeholder="Título da publicação"
              />
            </div>

            {shareCriacaoItem?.tipo !== 'quiz' && shareCriacaoItem?.tipo !== 'resenha' && (
              <div className="space-y-2">
                <Label>Tipo da publicação</Label>
                <select
                  value={shareCriacaoTipo}
                  onChange={(e) => setShareCriacaoTipo(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="dica">Dica</option>
                  <option value="sugestão">Sugestão</option>
                  {shareCriacaoItem?.tipo === 'imagem' && <option value="resenha">Resenha</option>}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label>{shareCriacaoItem?.tipo === 'quiz' ? 'Resumo do quiz' : 'Descrição'}</Label>
              <Textarea
                value={shareCriacaoDescricao}
                onChange={(e) => setShareCriacaoDescricao(e.target.value)}
                placeholder="Escreva o texto que será publicado"
                rows={5}
              />
            </div>

            {ensureArray(shareCriacaoItem?.imagem_urls).length > 0 && (
              <div className="grid grid-cols-2 gap-2 rounded-md border p-2">
                {ensureArray(shareCriacaoItem?.imagem_urls)
                  .slice(0, 4)
                  .map((img, index) => (
                    <img key={`${shareCriacaoItem?.id || 'share'}-${index}`} src={img} alt={`Prévia ${index + 1}`} className="h-24 w-full rounded-md object-cover border" />
                  ))}
              </div>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setShareCriacaoDialogOpen(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button
              onClick={() =>
                compartilharCriacaoSalvaNaComunidade(shareCriacaoItem, {
                  titulo: shareCriacaoTitulo,
                  descricao: shareCriacaoDescricao,
                  tipo: shareCriacaoTipo,
                })
              }
              disabled={saving || !shareCriacaoItem}
              className="w-full sm:w-auto"
            >
              {saving ? 'Compartilhando...' : 'Publicar na comunidade'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteCriacaoDialogOpen}
        onOpenChange={(open) => {
          setDeleteCriacaoDialogOpen(open);
          if (!open) {
            setDeleteCriacaoItem(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Excluir criação salva</DialogTitle>
            <DialogDescription>
              Esta ação remove a criação do laboratório
              {deleteCriacaoItem?.comunidade_post_id ? ' e também a publicação vinculada na comunidade' : ''}.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              {repairMojibakeText(deleteCriacaoItem?.titulo) || 'Criação sem título'}
            </p>
            <p className="mt-1">
              Deseja apagar esta criação do laboratório? Essa ação não poderá ser desfeita.
            </p>
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteCriacaoDialogOpen(false)} disabled={saving} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => apagarCriacaoLaboratorio(deleteCriacaoItem)}
              disabled={saving || !deleteCriacaoItem}
              className="w-full sm:w-auto"
            >
              {saving ? 'Apagando...' : 'Confirmar exclusão'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteStudioSlideDialogOpen}
        onOpenChange={(open) => {
          setDeleteStudioSlideDialogOpen(open);
          if (!open) {
            setDeleteStudioSlideItem(null);
          }
        }}
      >
        <DialogContent className="w-[calc(100vw-1rem)] max-w-md rounded-2xl p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Excluir imagem</DialogTitle>
            <DialogDescription>
              Confirme se deseja remover esta imagem do projeto atual.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground">
            Essa imagem será removida da montagem atual antes de salvar ou compartilhar.
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteStudioSlideDialogOpen(false)} className="w-full sm:w-auto">
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarExclusaoSlide} disabled={!deleteStudioSlideItem} className="w-full sm:w-auto">
              Remover imagem
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(selectedStudioImageUrl)} onOpenChange={(open) => !open && setSelectedStudioImageUrl('')}>
        <DialogContent className="w-[calc(100vw-1rem)] max-w-5xl rounded-2xl p-4 sm:p-6">
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
          if (open) setShowAccessChoice(true);
        }}
      >
        <DialogContent
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
          className="w-[calc(100vw-1rem)] max-w-lg rounded-2xl p-4 sm:p-6 [&>button:last-child]:hidden"
        >
          {onboardingStep === 0 && !alunoSenhaDefinida ? (
            <>
              <DialogHeader>
                <DialogTitle>Acesso do aluno</DialogTitle>
                <DialogDescription>
                  No primeiro acesso, é obrigatório criar uma nova senha para continuar usando a conta.
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                Sua matrícula continua como login. Assim que a nova senha for salva, a senha inicial deixa de funcionar.
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="primeiroAcessoPassword">Nova senha</Label>
                  <Input
                    id="primeiroAcessoPassword"
                    type="password"
                    value={primeiroAcessoPassword}
                    onChange={(e) => setPrimeiroAcessoPassword(e.target.value)}
                    disabled={updatingPrimeiroAcessoPassword}
                    placeholder="Digite sua nova senha"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="primeiroAcessoConfirmPassword">Confirmar nova senha</Label>
                  <Input
                    id="primeiroAcessoConfirmPassword"
                    type="password"
                    value={primeiroAcessoConfirmPassword}
                    onChange={(e) => setPrimeiroAcessoConfirmPassword(e.target.value)}
                    disabled={updatingPrimeiroAcessoPassword}
                    placeholder="Repita a nova senha"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  onClick={handlePrimeiroAcessoPassword}
                  disabled={updatingPrimeiroAcessoPassword}
                  className="w-full sm:w-auto"
                >
                  {updatingPrimeiroAcessoPassword ? 'Salvando...' : 'Salvar e continuar'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>{ALUNO_ONBOARDING_CARDS[onboardingStep - 1]?.title || 'Primeiros passos'}</DialogTitle>
                <DialogDescription>
                  {ALUNO_ONBOARDING_CARDS[onboardingStep - 1]?.description || 'Conclua este passo para continuar.'}
                </DialogDescription>
              </DialogHeader>
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                Passo {onboardingStep} de {ALUNO_ONBOARDING_CARDS.length}. Este guia aparece apenas no primeiro acesso.
              </div>
              <div className="flex justify-end gap-2">
                {onboardingStep < ALUNO_ONBOARDING_CARDS.length ? (
                  <Button type="button" onClick={() => setOnboardingStep((prev) => prev + 1)} className="w-full sm:w-auto">
                    Próximo
                  </Button>
                ) : (
                  <Button type="button" onClick={finalizeAlunoOnboarding} className="w-full sm:w-auto">
                    Finalizar
                  </Button>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
