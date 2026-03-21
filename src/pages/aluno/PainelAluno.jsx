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
import { canonicalizeBookArea } from '@/lib/bookAreas';

const ENABLE_OPTIONAL_STUDENT_FEATURES = import.meta.env.VITE_ENABLE_OPTIONAL_STUDENT_FEATURES !== 'false';
const CACHE_TTL_MS = 5 * 60 * 1000;
const DESAFIO_IA_TTL_MS = 24 * 60 * 60 * 1000;

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

function upsertById(list, item, idKey = 'id') {
  const entries = ensureArray(list);
  const id = item?.[idKey];
  if (!id) return entries;
  const index = entries.findIndex((entry) => entry?.[idKey] === id);
  if (index >= 0) {
    const next = [...entries];
    next[index] = { ...entries[index], ...item };
    return next;
  }
  return [item, ...entries];
}

function removeById(list, id, idKey = 'id') {
  return ensureArray(list).filter((entry) => entry?.[idKey] !== id);
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

function normalizeCriacaoShareTipo(criacao) {
  const tipo = String(criacao?.tipo || '');
  if (tipo === 'quiz') return 'quiz';
  if (tipo === 'resenha') return 'resenha';
  if (tipo === 'resumo') return 'sugestao';
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
          rotulo: 'publicar 1 nova avaliacao',
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
        rotulo: 'publicar 1 nova avaliacao',
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
      rotulo: 'publicar 1 nova avaliaÃ§Ã£o',
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
  const tipo = ['livros_lidos', 'avaliacoes', 'atividades_aprovadas'].includes(String(criterio.tipo))
    ? String(criterio.tipo)
    : fallback.tipo;
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
  const tipo = ['livros_lidos', 'avaliacoes', 'atividades_aprovadas'].includes(String(criterio.tipo))
    ? String(criterio.tipo)
    : fallback.tipo;
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
  if (!result.error) return result;

  const missingColumns = ['escola_id', 'imagem_urls', 'audiobook_id'];
  for (const column of missingColumns) {
    if (Object.hasOwn(payload, column) && isMissingColumnError(result.error, column, 'comunidade_posts')) {
      const { [column]: _ignored, ...fallbackPayload } = payload;
      result = await runInsert(fallbackPayload);
      if (!result.error) return result;
    }
  }

  const message = `${result.error?.message || ''} ${result.error?.details || ''}`.toLowerCase();
  if (message.includes('comunidade_posts_tipo_check') && payload?.tipo === 'quiz') {
    const fallbackPayload = {
      ...payload,
      tipo: 'dica',
      tags: Array.from(new Set([...(payload.tags || []), 'quiz'])),
    };
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
    fallbackErrorMessage: 'NÃ£o foi possÃ­vel gerar imagem no momento.',
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
    fallbackErrorMessage: fallbackErrorMessage || 'NÃ£o foi possÃ­vel gerar texto com IA no momento.',
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
  const [bibliotecaView, setBibliotecaView] = useState('meus_livros');
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
  const [saving, setSaving] = useState(false);
  const [showAccessChoice, setShowAccessChoice] = useState(false);
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
  const audioPlayerRef = useRef(null);
  const speechRequestRef = useRef(0);
  const speakingLivroIdRef = useRef(null);
  const solicitacoesStatusRef = useRef(new Map());
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

  const buildLivrosQuery = useCallback(() => {
      let query = supabase
        .from('livros')
        .select('id, titulo, autor, area, vol, ano, disponivel, sinopse, created_at, escola_id')
        .order('titulo');
      if (escolaId) {
        query = query.eq('escola_id', escolaId);
      }
      const term = catalogoSearchTerm.trim();
      if (term) {
        const escaped = term.replace(/%/g, '\\%').replace(/_/g, '\\_');
        query = query.or(`titulo.ilike.%${escaped}%,autor.ilike.%${escaped}%,area.ilike.%${escaped}%`);
      }
      return query;
    }, [catalogoSearchTerm, escolaId]);

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
        const { data, error } = await buildLivrosQuery();
        if (error) throw error;
        let items = data || [];

        if (reset && escolaId) {
          let legacyQuery = supabase
            .from('livros')
            .select('id, titulo, autor, area, vol, ano, disponivel, sinopse, created_at, escola_id')
            .is('escola_id', null)
            .order('titulo');

          const term = catalogoSearchTerm.trim();
          if (term) {
            const escaped = term.replace(/%/g, '\\%').replace(/_/g, '\\_');
            legacyQuery = legacyQuery.or(`titulo.ilike.%${escaped}%,autor.ilike.%${escaped}%,area.ilike.%${escaped}%`);
          }

          const { data: legacyData, error: legacyError } = await legacyQuery;
          if (legacyError) throw legacyError;
          items = mergeById(items, legacyData || []);
        }

        setLivros((prev) => (reset ? sortByTitulo(items) : sortByTitulo(mergeById(prev, items))));
        setLivrosOffset(items.length);
        setLivrosHasMore(false);
        if (reset) writeCache(livrosCacheKey, items);
      } finally {
        setLivrosLoadingMore(false);
      }
    },
    [buildLivrosQuery, catalogoSearchTerm, escolaId, livrosCacheKey],
  );

  const persistirDesafioIA = useCallback(
    async ({ desafio, xpBonus }) => {
      if (!alunoId) {
        throw new Error('Aluno nÃ£o identificado para salvar o desafio.');
      }

      const { error } = await supabase.from('preferencias_aluno').upsert(
        {
          usuario_id: alunoId,
          desafio_ia_ativo: desafio,
          desafio_ia_gerado_em: desafio?.gerado_em || null,
          desafio_ia_concluido_em: desafio?.concluido_em || null,
          desafio_ia_xp_bonus: Math.max(0, Number(xpBonus || 0)),
        },
        { onConflict: 'usuario_id' },
      );

      if (error) throw error;
    },
    [alunoId],
  );

  const fetchData = useCallback(async () => {
    if (!user) return;
    if (fetchInFlightRef.current) return fetchInFlightRef.current;

    const request = (async () => {
      setLoading(true);
      try {
        await supabase.rpc('cleanup_expired_comunicados');

        const { data: perfil, error: perfilError } = await supabase
          .from('usuarios_biblioteca')
          .select('id, escola_id, turma')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (perfilError || !perfil) throw perfilError || new Error('Perfil do aluno nÃ£o encontrado.');
        setAlunoId(perfil.id);
        setEscolaId(perfil.escola_id || null);
        setAlunoTurma(perfil.turma || null);

        const livrosPromise = fetchLivrosPage({ reset: true });
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
        ] = await Promise.all([
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
            .select('*, livros(titulo, autor), professor:usuarios_biblioteca!atividades_leitura_professor_id_fkey(nome)')
            .eq('aluno_id', perfil.id)
            .order('created_at', { ascending: false }),
          comunicadosPromise,
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
        let notificacoesLidasOpt = { data: [], missing: false };
        let preferenciasAlunoOpt = { data: null, missing: false };

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

        notificacoesLidasOpt = await optionalQuery(
          supabase.from('notificacoes_lidas').select('notification_id').eq('usuario_id', perfil.id),
          [],
        );
        preferenciasAlunoOpt = await optionalQuery(
          supabase
            .from('preferencias_aluno')
            .select('desafio_ia_ativo, desafio_ia_concluido_em, desafio_ia_gerado_em, desafio_ia_xp_bonus')
            .eq('usuario_id', perfil.id)
            .maybeSingle(),
          null,
        );

        const missingAnyNewTable =
          entregasOpt.missing || audioCatalogoOpt.missing || meusAudiobooksOpt.missing || criacoesLaboratorioOpt.missing;

        if (missingAnyNewTable && !warnedMissingFeaturesRef.current) {
          warnedMissingFeaturesRef.current = true;
          toast({
            variant: 'destructive',
            title: 'Recursos do laboratÃ³rio incompletos',
            description: 'Algumas tabelas novas nÃ£o existem no banco. Aplique as migrations mais recentes do Supabase.',
          });
        }
        setLabCriacoesMissingTable(criacoesLaboratorioOpt.missing);

        await livrosPromise;

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

        setEmprestimos(emprestimosRes.data || []);
        setAvaliacoes(avaliacoesRes.data || []);
        setWishlist((wishlistRes.data || []).map((item) => item.livro_id));
        setSugestoes(sugestoesRes.data || []);
        const solicitacoesData = solicitacoesRes.data || [];
        setSolicitacoes(solicitacoesData);
        solicitacoesStatusRef.current = new Map(
          solicitacoesData.map((item) => [item.id, String(item.status || '').toLowerCase()]),
        );
        setAtividades(atividadesRes.data || []);
        setEntregas(entregasOpt.data);
        setAudiobookCatalogo(audioCatalogoOpt.data);
        setMeusAudiobooks(meusAudiobooksOpt.data);
        setCriacoesLaboratorio(criacoesLaboratorioOpt.data);
        setComunicados(
          ensureArray(comunicadosRes.data).filter((item) => {
            if (isExpiredComunicado(item)) return false;
            const turmaDestino = normalizeTurmaKey(item?.turma_publico);
            return !turmaDestino || turmaDestino === normalizeTurmaKey(perfil.turma);
          }),
        );
        setNotificacoesLidas(new Set((notificacoesLidasOpt.data || []).map((item) => item.notification_id)));
        setDesafioXpBonus(Math.max(0, Number(preferenciasAlunoOpt.data?.desafio_ia_xp_bonus || 0)));

        const metricasCarregadas = buildDesafioMetricas({
          livrosLidos: new Set(
            (emprestimosRes.data || [])
              .filter((item) => item.status === 'devolvido')
              .map((item) => item.livro_id)
              .filter(Boolean),
          ).size,
          avaliacoesCount: (avaliacoesRes.data || []).length,
          atividadesAprovadas: (entregasOpt.data || []).filter((item) => item.status === 'aprovada').length,
        });
        const pontosAprovadosCarregados = (entregasOpt.data || [])
          .filter((item) => item.status === 'aprovada')
          .reduce((acc, item) => acc + Number(item.pontos_ganhos || 0), 0);
        const xpBonusCarregado = Math.max(0, Number(preferenciasAlunoOpt.data?.desafio_ia_xp_bonus || 0));
        const livrosCatalogoCarregados = readCache(livrosCacheKey) || [];
        const livrosCatalogoMap = new Map(
          livrosCatalogoCarregados.map((item) => [item.id, item]),
        );
        const xpLeiturasCarregado = Array.from(
          new Set(
            (emprestimosRes.data || [])
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
          ...(preferenciasAlunoOpt.data?.desafio_ia_ativo || {}),
          gerado_em: preferenciasAlunoOpt.data?.desafio_ia_gerado_em || preferenciasAlunoOpt.data?.desafio_ia_ativo?.gerado_em,
          concluido_em: preferenciasAlunoOpt.data?.desafio_ia_concluido_em || preferenciasAlunoOpt.data?.desafio_ia_ativo?.concluido_em,
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
          ? 'Tabelas novas nÃ£o encontradas. Aplique a migration mais recente do Supabase.'
          : error?.message || 'NÃ£o foi possÃ­vel carregar seus dados.';
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
  }, [desafioCacheKey, fetchLivrosPage, livrosCacheKey, optionalFeaturesEnabled, toast, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!user?.id) return;

    if (alunoSenhaDefinida) {
      if (alunoOnboardingKey) {
        localStorage.setItem(alunoOnboardingKey, 'done');
      }
      setShowAccessChoice(false);
      return;
    }

    if (localStorage.getItem(alunoOnboardingKey) === 'done') return;

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
  }, [alunoOnboardingKey, alunoSenhaDefinida, toast, user?.id]);

  const finalizeAlunoOnboarding = () => {
    if (alunoOnboardingKey) {
      localStorage.setItem(alunoOnboardingKey, 'done');
    }
    setShowAccessChoice(false);
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
        description: 'A confirmacao da nova senha nao confere.',
        variant: 'destructive',
      });
      return;
    }

    setUpdatingPrimeiroAcessoPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({
        password: novaSenha,
        data: {
          ...(user?.user_metadata || {}),
          senha_definida: true,
          senha_alterada_em: new Date().toISOString(),
        },
      });
      if (error) throw error;

      if (alunoSenhaDefinidaKey) {
        localStorage.setItem(alunoSenhaDefinidaKey, 'true');
      }

      setPrimeiroAcessoPassword('');
      setPrimeiroAcessoConfirmPassword('');
      finalizeAlunoOnboarding();
      toast({
        title: 'Senha criada',
        description: 'Sua nova senha foi salva e a senha inicial nao funciona mais.',
      });
    } catch (error) {
      toast({
        title: 'Erro ao criar senha',
        description: error?.message || 'Nao foi possivel definir sua nova senha agora.',
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

  const fetchRowById = useCallback(async (table, id, select) => {
    if (!id) return null;
    try {
      const { data, error } = await supabase.from(table).select(select).eq('id', id).maybeSingle();
      if (error) {
        if (isMissingTableError(error)) return null;
        throw error;
      }
      return data || null;
    } catch {
      return null;
    }
  }, []);

  const handleRealtimeStatus = useCallback(
    (status) => {
      if (status !== 'CHANNEL_ERROR') return;
    },
    [],
  );


  const updateEntregaState = useCallback((entrega) => {
    if (!entrega?.atividade_id) return;
    const payload = parseEntregaPayload(entrega.texto_entrega);
    setAtividadeTexto((prev) => ({ ...prev, [entrega.atividade_id]: payload.texto }));
    setAtividadeImagens((prev) => ({ ...prev, [entrega.atividade_id]: payload.imagens }));
    setAtividadeRespostas((prev) => ({ ...prev, [entrega.atividade_id]: payload.respostas }));
  }, []);

  const handleEmprestimoUpsert = useCallback(
    async (payload) => {
      const row = payload?.new;
      const data = await fetchRowById('emprestimos', row?.id, '*, livros(titulo, autor)');
      if (!data || data.usuario_id !== alunoId) return;
      setEmprestimos((prev) => sortByDateDesc(upsertById(prev, data), 'data_emprestimo'));
    },
    [alunoId, fetchRowById],
  );

  const handleEmprestimoDelete = useCallback(
    (payload) => {
      const row = payload?.old;
      if (!row?.id || row?.usuario_id !== alunoId) return;
      setEmprestimos((prev) => removeById(prev, row.id));
    },
    [alunoId],
  );

  const handleAvaliacaoUpsert = useCallback(
    async (payload) => {
      const row = payload?.new;
      const data = await fetchRowById('avaliacoes_livros', row?.id, '*, livros(titulo, autor)');
      if (!data || data.usuario_id !== alunoId) return;
      setAvaliacoes((prev) => sortByDateDesc(upsertById(prev, data)));
    },
    [alunoId, fetchRowById],
  );

  const handleAvaliacaoDelete = useCallback(
    (payload) => {
      const row = payload?.old;
      if (!row?.id || row?.usuario_id !== alunoId) return;
      setAvaliacoes((prev) => removeById(prev, row.id));
    },
    [alunoId],
  );

  const handleWishlistInsert = useCallback(
    (payload) => {
      const row = payload?.new;
      if (!row?.livro_id || row?.usuario_id !== alunoId) return;
      setWishlist((prev) => Array.from(new Set([...ensureArray(prev), row.livro_id])));
    },
    [alunoId],
  );

  const handleWishlistDelete = useCallback(
    (payload) => {
      const row = payload?.old;
      if (!row?.livro_id || row?.usuario_id !== alunoId) return;
      setWishlist((prev) => ensureArray(prev).filter((id) => id !== row.livro_id));
    },
    [alunoId],
  );

  const handleSugestaoUpsert = useCallback(
    async (payload) => {
      const row = payload?.new;
      const data = await fetchRowById('sugestoes_livros', row?.id, '*, livros(titulo, autor)');
      if (!data || data.aluno_id !== alunoId) return;
      setSugestoes((prev) => sortByDateDesc(upsertById(prev, data)));
    },
    [alunoId, fetchRowById],
  );

  const handleSugestaoDelete = useCallback(
    (payload) => {
      const row = payload?.old;
      if (!row?.id || row?.aluno_id !== alunoId) return;
      setSugestoes((prev) => removeById(prev, row.id));
    },
    [alunoId],
  );

  const handleSolicitacaoUpsert = useCallback(
    async (payload) => {
      const row = payload?.new;
      const data = await fetchRowById('solicitacoes_emprestimo', row?.id, '*, livros(titulo, autor)');
      if (!data || data.usuario_id !== alunoId) return;
      const prevStatus = solicitacoesStatusRef.current.get(data.id);
      const nextStatus = String(data.status || '').toLowerCase();
      if (prevStatus && prevStatus !== nextStatus) {
        toast({
          title: 'Status da solicitaÃ§Ã£o atualizado',
          description: `${data.livros?.titulo || 'Livro'}: ${nextStatus}.`,
        });
      }
      solicitacoesStatusRef.current.set(data.id, nextStatus);
      setSolicitacoes((prev) => sortByDateDesc(upsertById(prev, data)));
    },
    [alunoId, fetchRowById, toast],
  );

  const handleSolicitacaoDelete = useCallback(
    (payload) => {
      const row = payload?.old;
      if (!row?.id || row?.usuario_id !== alunoId) return;
      setSolicitacoes((prev) => removeById(prev, row.id));
    },
    [alunoId],
  );

  const handleAtividadeUpsert = useCallback(
    async (payload) => {
      const row = payload?.new;
      const data = await fetchRowById(
        'atividades_leitura',
        row?.id,
        '*, livros(titulo, autor), professor:usuarios_biblioteca!atividades_leitura_professor_id_fkey(nome)',
      );
      if (!data || data.aluno_id !== alunoId) return;
      setAtividades((prev) => sortByDateDesc(upsertById(prev, data)));
    },
    [alunoId, fetchRowById],
  );

  const handleAtividadeDelete = useCallback(
    (payload) => {
      const row = payload?.old;
      if (!row?.id || row?.aluno_id !== alunoId) return;
      setAtividades((prev) => removeById(prev, row.id));
    },
    [alunoId],
  );

  const handleEntregaUpsert = useCallback(
    async (payload) => {
      const row = payload?.new;
      const data = await fetchRowById('atividades_entregas', row?.id, '*');
      if (!data || data.aluno_id !== alunoId) return;
      setEntregas((prev) => sortByDateDesc(upsertById(prev, data), 'updated_at'));
      updateEntregaState(data);
    },
    [alunoId, fetchRowById, updateEntregaState],
  );

  const handleEntregaDelete = useCallback(
    (payload) => {
      const row = payload?.old;
      if (!row?.id || row?.aluno_id !== alunoId) return;
      setEntregas((prev) => removeById(prev, row.id));
      setAtividadeTexto((prev) => {
        const next = { ...prev };
        delete next[row.atividade_id];
        return next;
      });
      setAtividadeImagens((prev) => {
        const next = { ...prev };
        delete next[row.atividade_id];
        return next;
      });
      setAtividadeRespostas((prev) => {
        const next = { ...prev };
        delete next[row.atividade_id];
        return next;
      });
    },
    [alunoId],
  );

  const handleAudiobookUpsert = useCallback(
    async (payload) => {
      const row = payload?.new;
      const data = await fetchRowById('audiobooks_biblioteca', row?.id, '*, livros(titulo, autor)');
      if (!data) return;
      setAudiobookCatalogo((prev) => sortByDateDesc(upsertById(prev, data)));
    },
    [fetchRowById],
  );

  const handleAudiobookDelete = useCallback((payload) => {
    const row = payload?.old;
    if (!row?.id) return;
    setAudiobookCatalogo((prev) => removeById(prev, row.id));
  }, []);

  const handleAlunoAudiobookUpsert = useCallback(
    async (payload) => {
      const row = payload?.new;
      const data = await fetchRowById('aluno_audiobooks', row?.id, '*, audiobooks_biblioteca(*, livros(titulo, autor))');
      if (!data || data.aluno_id !== alunoId) return;
      setMeusAudiobooks((prev) => sortByDateDesc(upsertById(prev, data)));
    },
    [alunoId, fetchRowById],
  );

  const handleAlunoAudiobookDelete = useCallback(
    (payload) => {
      const row = payload?.old;
      if (!row?.id || row?.aluno_id !== alunoId) return;
      setMeusAudiobooks((prev) => removeById(prev, row.id));
    },
    [alunoId],
  );

  const handleLabCriacaoUpsert = useCallback(
    async (payload) => {
      const row = payload?.new;
      const data = await fetchRowById('laboratorio_criacoes', row?.id, '*');
      if (!data || data.aluno_id !== alunoId) return;
      setCriacoesLaboratorio((prev) => sortByDateDesc(upsertById(prev, data)));
    },
    [alunoId, fetchRowById],
  );

  const handleLabCriacaoDelete = useCallback(
    (payload) => {
      const row = payload?.old;
      if (!row?.id || row?.aluno_id !== alunoId) return;
      setCriacoesLaboratorio((prev) => removeById(prev, row.id));
    },
    [alunoId],
  );

  const handleLivroUpsert = useCallback((payload) => {
    const row = payload?.new;
    if (!row?.id) return;

    removeCache(livrosCacheKey);

    const pertenceAoCatalogo =
      !row.escola_id ||
      !escolaId ||
      row.escola_id === escolaId;

    if (!pertenceAoCatalogo) {
      setLivros((prev) => removeById(prev, row.id));
      return;
    }

    setLivros((prev) => sortByTitulo(upsertById(prev, row)));
  }, [escolaId, livrosCacheKey]);

  const handleLivroDelete = useCallback((payload) => {
    const row = payload?.old;
    if (!row?.id) return;
    removeCache(livrosCacheKey);
    setLivros((prev) => removeById(prev, row.id));
  }, [livrosCacheKey]);

  const handleNotificacaoLidaInsert = useCallback(
    (payload) => {
      const row = payload?.new;
      if (!row?.notification_id || row?.usuario_id !== alunoId) return;
      setNotificacoesLidas((prev) => new Set([...prev, row.notification_id]));
    },
    [alunoId],
  );

  const handleNotificacaoLidaDelete = useCallback(
    (payload) => {
      const row = payload?.old;
      if (!row?.notification_id || row?.usuario_id !== alunoId) return;
      setNotificacoesLidas((prev) => {
        const next = new Set(prev);
        next.delete(row.notification_id);
        return next;
      });
    },
    [alunoId],
  );

  const handleComunicadoUpsert = useCallback(
    (payload) => {
      const row = payload?.new ?? payload;
      if (!row?.id || row?.tipo !== 'comunicado') return;
      if (isExpiredComunicado(row)) {
        setComunicados((prev) => removeById(prev, row.id));
        return;
      }
      if (escolaId && row?.escola_id && row.escola_id !== escolaId) return;

      const turmaDestino = normalizeTurmaKey(row?.turma_publico);
      const turmaAtual = normalizeTurmaKey(alunoTurma);
      const visivelParaAluno = !turmaDestino || turmaDestino === turmaAtual;

      setComunicados((prev) => {
        if (!visivelParaAluno) return removeById(prev, row.id);
        return sortByDateDesc(upsertById(prev, row));
      });
    },
    [alunoTurma, escolaId],
  );

  const handleComunicadoDelete = useCallback((payload) => {
    const row = payload?.old ?? payload;
    if (!row?.id) return;
    setComunicados((prev) => removeById(prev, row.id));
  }, []);

  useRealtimeSubscription({ table: 'emprestimos', onInsert: handleEmprestimoUpsert, onUpdate: handleEmprestimoUpsert, onDelete: handleEmprestimoDelete, onStatus: handleRealtimeStatus });
  useRealtimeSubscription({ table: 'avaliacoes_livros', onInsert: handleAvaliacaoUpsert, onUpdate: handleAvaliacaoUpsert, onDelete: handleAvaliacaoDelete, onStatus: handleRealtimeStatus });
  useRealtimeSubscription({ table: 'lista_desejos', onInsert: handleWishlistInsert, onDelete: handleWishlistDelete, onStatus: handleRealtimeStatus });
  useRealtimeSubscription({ table: 'sugestoes_livros', onInsert: handleSugestaoUpsert, onUpdate: handleSugestaoUpsert, onDelete: handleSugestaoDelete, onStatus: handleRealtimeStatus });
  useRealtimeSubscription({ table: 'solicitacoes_emprestimo', onInsert: handleSolicitacaoUpsert, onUpdate: handleSolicitacaoUpsert, onDelete: handleSolicitacaoDelete, onStatus: handleRealtimeStatus });
  useRealtimeSubscription({ table: 'comunidade_posts', onInsert: handleComunicadoUpsert, onUpdate: handleComunicadoUpsert, onDelete: handleComunicadoDelete, onStatus: handleRealtimeStatus });
  useRealtimeSubscription({ table: 'atividades_leitura', onInsert: handleAtividadeUpsert, onUpdate: handleAtividadeUpsert, onDelete: handleAtividadeDelete, onStatus: handleRealtimeStatus });
  useRealtimeSubscription({ table: optionalFeaturesEnabled ? 'atividades_entregas' : null, onInsert: handleEntregaUpsert, onUpdate: handleEntregaUpsert, onDelete: handleEntregaDelete, onStatus: handleRealtimeStatus });
  useRealtimeSubscription({ table: optionalFeaturesEnabled ? 'audiobooks_biblioteca' : null, onInsert: handleAudiobookUpsert, onUpdate: handleAudiobookUpsert, onDelete: handleAudiobookDelete, onStatus: handleRealtimeStatus });
  useRealtimeSubscription({ table: optionalFeaturesEnabled ? 'aluno_audiobooks' : null, onInsert: handleAlunoAudiobookUpsert, onUpdate: handleAlunoAudiobookUpsert, onDelete: handleAlunoAudiobookDelete, onStatus: handleRealtimeStatus });
  useRealtimeSubscription({ table: optionalFeaturesEnabled ? 'laboratorio_criacoes' : null, onInsert: handleLabCriacaoUpsert, onUpdate: handleLabCriacaoUpsert, onDelete: handleLabCriacaoDelete, onStatus: handleRealtimeStatus });
  useRealtimeSubscription({ table: 'livros', onInsert: handleLivroUpsert, onUpdate: handleLivroUpsert, onDelete: handleLivroDelete, onStatus: handleRealtimeStatus });
  useRealtimeSubscription({ table: 'notificacoes_lidas', onInsert: handleNotificacaoLidaInsert, onDelete: handleNotificacaoLidaDelete, onStatus: handleRealtimeStatus });

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
        descricao: 'Publicou sua primeira avaliacao.',
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

  const livrosSugeriveisDesafio = useMemo(
    () =>
      ensureArray(livros)
        .filter((livro) => livro?.titulo)
        .slice(0, 12)
        .map((livro) => ({
          titulo: livro.titulo,
          autor: livro.autor || '',
          area: canonicalizeBookArea(livro.area) || '',
          sinopse: livro.sinopse || '',
        })),
    [livros],
  );

  const meusLivros = useMemo(() => emprestimos.filter((e) => e.status === 'ativo'), [emprestimos]);

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
        });
      }
    });
    return Array.from(map.values());
  }, [livrosById, meusLivros]);

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
      if (emprestimo?.status === 'ativo') return 'aceitos';

      const status = String(solicitacao?.status || '').toLowerCase();
      if (status === 'aprovada' || status === 'aceita') return 'aceitos';
      if (status === 'recusada' || status === 'negada' || status === 'cancelada') return 'recusados';
      if (status === 'pendente' || status === 'solicitada' || status === 'em_andamento') return 'pendentes';
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

  const getSolicitacaoStatusInfo = useCallback(
    (solicitacao) => {
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
      return { label: 'Pendente', variant: 'secondary', icon: <Clock className="w-3 h-3 mr-1" /> };
    },
    [latestEmprestimoByLivro],
  );

  const buildSolicitacaoTimeline = useCallback(
    (solicitacao) => {
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
        titulo: 'Livro com devoluÃ§Ã£o em atraso',
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
        titulo: 'SolicitaÃ§Ãµes pendentes',
        descricao: `${solicitacoesPendentes} solicitaÃ§Ã£o(Ãµes) aguardando aprovaÃ§Ã£o.`,
      });
    }
    const filtradas = itens.filter((item) => !notificacoesLidas.has(item.id));
    return filtradas.slice(0, 8);
  }, [atrasos, atividadesComEntrega, comunicados, solicitacoes, classifySolicitacao, notificacoesLidas]);

  const markNotificationRead = useCallback(
    async (notificationId) => {
      if (!notificationId || !alunoId) return;
      setNotificacoesLidas((prev) => new Set([...prev, notificationId]));
      setAriaLiveMessage('NotificaÃ§Ã£o marcada como lida.');
      try {
        const { error } = await supabase
          .from('notificacoes_lidas')
          .upsert({ usuario_id: alunoId, notification_id: notificationId }, { onConflict: 'usuario_id,notification_id' });
        if (error && !isMissingTableError(error)) throw error;
      } catch {
        // fallback silencioso: mantÃ©m estado local
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
    setAriaLiveMessage('Todas as notificaÃ§Ãµes foram marcadas como lidas.');
    try {
      const { error } = await supabase
        .from('notificacoes_lidas')
        .upsert(payload, { onConflict: 'usuario_id,notification_id' });
      if (error && !isMissingTableError(error)) throw error;
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
        fallbackErrorMessage: 'NÃ£o foi possÃ­vel gerar Ã¡udio da sinopse no momento.',
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
      throw new Error('Tabela laboratorio_criacoes nÃ£o encontrada. Aplique as migrations do Supabase.');
    }

    const { error } = await supabase.from('laboratorio_criacoes').insert(payload);
    if (!error) return;

    if (isMissingTableError(error)) {
      setLabCriacoesMissingTable(true);
      throw new Error('Tabela laboratorio_criacoes nÃ£o encontrada. Aplique as migrations do Supabase.');
    }

    throw error;
  };

  const handleSaveReview = async () => {
    if (!alunoId || !reviewLivro || !escolaId) {
      toast({
        variant: 'destructive',
        title: 'Perfil incompleto',
        description: 'NÃ£o foi possÃ­vel identificar seu vÃ­nculo com a escola para salvar a resenha.',
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

      toast({ title: 'AvaliaÃ§Ã£o salva!' });
      setReviewDialog(false);
      setReviewLivro(null);
      setReviewTexto('');
      setShareReviewToCommunity(false);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'NÃ£o foi possÃ­vel salvar.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRequestLoan = async () => {
    if (!alunoId || !requestLivro) return;

    if (hasSolicitacaoEmAndamento(requestLivro.id)) {
      toast({
        variant: 'destructive',
        title: 'SolicitaÃ§Ã£o jÃ¡ enviada',
        description: 'Aguarde a aprovaÃ§Ã£o da bibliotecÃ¡ria antes de solicitar novamente este livro.',
      });
      return;
    }
    if (hasEmprestimoAtivo(requestLivro.id)) {
      toast({
        variant: 'destructive',
        title: 'Livro jÃ¡ emprestado',
        description: 'Este livro jÃ¡ estÃ¡ emprestado para vocÃª. Confira em â€œMeus livrosâ€.',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('solicitacoes_emprestimo').insert({
        livro_id: requestLivro.id,
        usuario_id: alunoId,
        mensagem: requestMsg || null,
      });
      if (error) throw error;

      toast({ title: 'SolicitaÃ§Ã£o enviada!' });
      setRequestDialog(false);
      setRequestLivro(null);
      setRequestMsg('');
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao solicitar emprÃ©stimo.' });
    } finally {
      setSaving(false);
    }
  };

  const handleEnviarAtividade = async (atividade) => {
    if (!alunoId) return;
    if (!optionalFeaturesEnabled) {
      toast({
        variant: 'destructive',
        title: 'Recurso indisponÃ­vel',
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
          ? 'Preencha o formulÃ¡rio, escreva uma resposta ou envie imagens.'
          : 'Escreva o conteÃºdo da entrega ou envie imagens.',
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

      toast({ title: 'Entrega enviada', description: 'Seu professor jÃ¡ pode avaliar e liberar pontos.' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: isMissingTableError(error)
          ? 'Entrega de atividade indisponÃ­vel: aplique a migration do banco.'
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
      toast({ variant: 'destructive', title: 'Erro', description: 'NÃ£o foi possÃ­vel processar as imagens da atividade.' });
    }
  };

  const handleCriarAudiobook = async () => {
    if (!alunoId || !escolaId) {
      toast({
        variant: 'destructive',
        title: 'Perfil incompleto',
        description: 'NÃ£o foi possÃ­vel identificar sua escola para criar audiobook.',
      });
      return;
    }
    if (!optionalFeaturesEnabled) {
      toast({
        variant: 'destructive',
        title: 'Recurso indisponÃ­vel',
        description: 'Audiobooks estÃ£o desativados neste ambiente.',
      });
      return;
    }

    const livro = livros.find((item) => item.id === audiobookForm.livro_id);
    if (!livro || !audiobookFileDataUrl) {
      toast({
        variant: 'destructive',
        title: 'Dados incompletos',
        description: 'Selecione um livro e envie um arquivo de Ã¡udio (atÃ© 50MB).',
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

      toast({ title: 'Audiobook adicionado ao catÃ¡logo!' });
      setAudiobookForm({ livro_id: '', titulo: '', autor: '', duracao_minutos: '' });
      setAudiobookFileDataUrl('');
      setAudiobookFileNome('');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: isMissingTableError(error)
          ? 'Audiobooks indisponÃ­veis: aplique a migration do banco.'
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
        title: 'Recurso indisponÃ­vel',
        description: 'Audiobooks estÃ£o desativados neste ambiente.',
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
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: isMissingTableError(error)
          ? 'Audiobooks indisponÃ­veis: aplique a migration do banco.'
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
        description: 'O limite para audiobook Ã© 50MB.',
      });
      return;
    }

    try {
      const dataUrl = await fileToDataUrl(file);
      setAudiobookFileDataUrl(dataUrl);
      setAudiobookFileNome(file.name);
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'NÃ£o foi possÃ­vel ler o arquivo.' });
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
      toast({ variant: 'destructive', title: 'Limite atingido', description: 'Use no mÃ¡ximo 8 imagens por animaÃ§Ã£o.' });
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
        description: error?.message || 'NÃ£o foi possÃ­vel gerar imagem no momento.',
      });
    } finally {
      setGerandoImagemIA(false);
    }
  };

  const handleAudioFundo = async (files) => {
    const file = files?.[0];
    if (!file) return;
    if (file.size > 50 * 1024 * 1024) {
      toast({ variant: 'destructive', title: 'Arquivo muito grande', description: 'O Ã¡udio de fundo aceita atÃ© 50MB.' });
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setStudioAudioFundoUrl(dataUrl);
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'NÃ£o foi possÃ­vel ler o Ã¡udio de fundo.' });
    }
  };

  const handlePublicarStudio = async () => {
    if (!optionalFeaturesEnabled || !alunoId || !escolaId) {
      toast({
        variant: 'destructive',
        title: 'LaboratÃ³rio indisponÃ­vel',
        description: 'NÃ£o foi possÃ­vel publicar agora. Verifique se as migrations do banco foram aplicadas.',
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
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error?.message || 'NÃ£o foi possÃ­vel compartilhar o projeto criativo.',
      });
    } finally {
      setSaving(false);
    }
  };

  const salvarProjetoStudioNoLaboratorio = async () => {
    if (!optionalFeaturesEnabled || !alunoId || !escolaId) {
      toast({
        variant: 'destructive',
        title: 'LaboratÃ³rio indisponÃ­vel',
        description: 'NÃ£o foi possÃ­vel salvar agora. Verifique as configuraÃ§Ãµes do banco.',
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
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'NÃ£o foi possÃ­vel salvar o projeto.' });
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
    const tema = quizTema.trim() || 'compreensÃ£o da leitura';

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
        'NÃ£o foi possÃ­vel gerar quiz com IA no momento.',
      );

      const perguntas = extractQuizPerguntasFromIAResponse(data);

      if (perguntas.length === 0) throw new Error('A IA respondeu sem perguntas vÃ¡lidas.');

      setQuiz(perguntas);
      setQuizRespostas({});
      setQuizResultado(null);
      toast({ title: 'Quiz gerado com IA!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar quiz',
        description: error?.message || 'NÃ£o foi possÃ­vel gerar quiz com IA.',
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
    if (quiz.length <= 3) return 'BÃ¡sico';
    if (quiz.length <= 5) return 'IntermediÃ¡rio';
    return 'AvanÃ§ado';
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
        title: 'LaboratÃ³rio indisponÃ­vel',
        description: 'NÃ£o foi possÃ­vel salvar o quiz agora. Verifique as migrations do banco.',
      });
      return;
    }
    if (quiz.length === 0) {
      toast({ variant: 'destructive', title: 'Sem quiz', description: 'Gere um quiz antes de salvar.' });
      return;
    }

    const livro = livrosById.get(quizLivroId);
    let postId = null;
    const titulo = livro?.titulo ? `Quiz IA: ${livro.titulo}` : 'Quiz IA do aluno';
    const descricao = quizTema.trim() || 'compreensÃ£o da leitura';

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
        description: error?.message || 'NÃ£o foi possÃ­vel salvar o quiz.',
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
      const tituloBase = String(customizacao.titulo || repairMojibakeText(criacao.titulo) || 'Criação do aluno').trim();
      const descricaoBase = String(customizacao.descricao || repairMojibakeText(criacao.descricao) || '').trim();
      const tipoPersonalizado = String(customizacao.tipo || normalizeCriacaoShareTipo(criacao)).trim();
      const conteudoJson = extractQuizFromCriacao(criacao) || {};
      let payload = null;

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
          imagem_urls: ensureArray(criacao.imagem_urls),
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
          imagem_urls: ensureArray(criacao.imagem_urls),
          tags: Array.from(new Set(ensureArray(criacao.tags))),
        };
      } else if (criacao.tipo === 'resumo') {
        payload = {
          autor_id: alunoId,
          escola_id: escolaId,
          livro_id: criacao.livro_id || null,
          tipo: ['dica', 'sugestao'].includes(tipoPersonalizado) ? tipoPersonalizado : 'sugestao',
          titulo: tituloBase,
          conteudo: descricaoBase || extractResumoTextoFromCriacao(criacao) || 'Resumo compartilhado pelo aluno.',
          imagem_urls: ensureArray(criacao.imagem_urls),
          tags: Array.from(new Set([...(ensureArray(criacao.tags)), 'resumo'])),
        };
      } else {
        payload = {
          autor_id: alunoId,
          escola_id: escolaId,
          livro_id: criacao.livro_id || null,
          audiobook_id: conteudoJson?.audiobook_id || null,
          tipo: ['dica', 'sugestao', 'resenha'].includes(tipoPersonalizado) ? tipoPersonalizado : 'dica',
          titulo: tituloBase,
          conteudo: descricaoBase || 'Projeto criativo compartilhado pelo aluno.',
          imagem_urls: ensureArray(criacao.imagem_urls),
          tags: Array.from(new Set(ensureArray(criacao.tags))),
        };
      }

      const { data: postCriado, error } = await insertCommunityPostCompat(payload, { expectSingleId: true });
      if (error) throw error;

      const { error: updateError } = await supabase
        .from('laboratorio_criacoes')
        .update({
          publicado_comunidade: true,
          comunidade_post_id: postCriado?.id || null,
        })
        .eq('id', criacao.id);

      if (updateError) throw updateError;

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
      if (criacao.comunidade_post_id) {
        await supabase.from('comunidade_posts').delete().eq('id', criacao.comunidade_post_id);
      }
      if (labCriacoesMissingTable) {
        throw new Error('Tabela laboratorio_criacoes nÃ£o encontrada. Aplique as migrations do Supabase.');
      }

      const { error } = await supabase.from('laboratorio_criacoes').delete().eq('id', criacao.id);
      if (error) {
        if (isMissingTableError(error)) {
          setLabCriacoesMissingTable(true);
          throw new Error('Tabela laboratorio_criacoes nÃ£o encontrada. Aplique as migrations do Supabase.');
        }
        throw error;
      }

      setDeleteCriacaoDialogOpen(false);
      setDeleteCriacaoItem(null);
      toast({ title: 'Criação removida.' });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro ao apagar', description: error?.message || 'NÃ£o foi possÃ­vel apagar.' });
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
    if (activeSection === 'laboratorio') return 'Laboratorio';
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
        description: 'NÃ£o foi possÃ­vel identificar sua escola para gerar o resumo.',
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
        'NÃ£o foi possÃ­vel gerar resumo com IA no momento.',
      );

      const texto = extractResumoTextoFromIAResponse(data);
      if (!texto) throw new Error('A IA respondeu sem texto.');
      setResumoTexto(texto);
      toast({ title: 'Resumo gerado com IA!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar resumo',
        description: error?.message || 'NÃ£o foi possÃ­vel gerar resumo com IA.',
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
        description: 'NÃ£o foi possÃ­vel identificar seu perfil para salvar o desafio.',
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
        'NÃ£o foi possÃ­vel gerar desafio de gamificaÃ§Ã£o no momento.',
      );
      const desafio = normalizeDesafioIA({
        ...(data?.data || {}),
        gerado_em: new Date().toISOString(),
        criterio: normalizarCriterioDesafioPorNivel(data?.data?.criterio, {
          ...desafioMetricas,
          [criterio.tipo]: criterio.valor_inicial,
        }, nivelAtual),
      });
      if (!desafio?.titulo || !desafio?.desafio) throw new Error('A IA respondeu sem desafio vÃ¡lido.');
      await persistirDesafioIA({ desafio, xpBonus: desafioXpBonus });
      setDesafioIA(desafio);
      if (desafioCacheKey) writeCache(desafioCacheKey, desafio);
      toast({ title: 'Desafio de gamificaÃ§Ã£o gerado!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro no desafio IA',
        description: error?.message || 'NÃ£o foi possÃ­vel gerar desafio agora.',
      });
    } finally {
      setGerandoDesafioIA(false);
    }
  };

  const concluirDesafioGamificacao = useCallback(async (origem = 'automatica') => {
    if (!desafioIA) return;
    if (desafioIA.concluido_em && origem === 'silenciosa') return;
    if (desafioIA.concluido_em) {
      toast({ title: 'Desafio jÃ¡ concluÃ­do', description: 'A recompensa deste desafio jÃ¡ foi adicionada ao seu perfil.' });
      return;
    }

    setSalvandoDesafioIA(true);
    try {
      const xpRecompensa = Math.max(0, Number(desafioIA.xp_recompensa || extractXpFromRewardText(desafioIA.recompensa)));
      const desafioConcluido = {
        ...desafioIA,
        xp_recompensa: xpRecompensa,
        concluido_em: new Date().toISOString(),
      };
      const proximoXpBonus = desafioXpBonus + xpRecompensa;

      await persistirDesafioIA({ desafio: desafioConcluido, xpBonus: proximoXpBonus });
      setDesafioIA(desafioConcluido);
      setDesafioXpBonus(proximoXpBonus);
      if (desafioCacheKey) writeCache(desafioCacheKey, desafioConcluido);

      toast({
        title: 'Desafio concluÃ­do',
        description: xpRecompensa > 0 ? `VocÃª recebeu ${xpRecompensa} XP pelo desafio do dia.` : 'Sua conclusÃ£o foi registrada.',
      });
      navigate('/aluno');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao concluir desafio',
        description: error?.message || 'NÃ£o foi possÃ­vel registrar a conclusÃ£o do desafio.',
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
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'NÃ£o foi possÃ­vel salvar o resumo.' });
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
        'NÃ£o foi possÃ­vel gerar o resumo rÃ¡pido agora.',
      );
      const texto = extractResumoTextoFromIAResponse(data);
      if (!texto) throw new Error('A IA respondeu sem resumo.');
      setResumoRapidoData({ titulo: livro.titulo, autor: livro.autor, texto });
      setResumoRapidoOpen(true);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar resumo',
        description: error?.message || 'NÃ£o foi possÃ­vel gerar o resumo rÃ¡pido.',
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
      toast({ variant: 'destructive', title: 'Quiz invÃ¡lido', description: 'NÃ£o foi possÃ­vel carregar este quiz.' });
      return;
    }
    setQuizLivroId(criacao.livro_id || '');
    setQuizTema(criacao.descricao || 'compreensÃ£o da leitura');
    setQuiz(perguntas);
    setQuizRespostas({});
    setQuizResultado(null);
    toast({ title: 'Quiz carregado', description: 'VocÃª pode jogar novamente.' });
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
                  Desafio IA do dia
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button type="button" variant="outline" onClick={gerarDesafioGamificacao} disabled={gerandoDesafioIA || Boolean(desafioIA)}>
                  <Sparkles className="w-4 h-4 mr-2" />
                  {gerandoDesafioIA ? 'Gerando desafio...' : 'Gerar desafio de gamificacao'}
                </Button>
                {desafioIA && (
                  <div className="rounded-lg border p-3 space-y-1">
                    <p className="text-sm font-semibold">{desafioIA.titulo}</p>
                    <p className="text-sm text-muted-foreground">{desafioIA.desafio}</p>
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
                        if (n.tipo === 'solicitacao') {
                          navigate('/aluno/biblioteca');
                          setBibliotecaView('minhas_solicitacoes');
                          setSolicitacoesView('pendentes');
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
                          navigate('/aluno/comunidade');
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
                              <p className="text-xs text-muted-foreground">{atividade.livros?.titulo || 'Livro nao informado'}</p>
                              <p className="text-xs text-muted-foreground">
                                Professor: {atividade.professor?.nome || 'Professor nao informado'}
                              </p>
                              {atividade.atividadeMeta?.descricaoLimpa && <p className="text-sm mt-1">{atividade.atividadeMeta.descricaoLimpa}</p>}
                            </div>
                            <div className="text-right">
                              <Badge variant="outline">Pontos possiveis: {Number(atividade.pontos_extras || 0)}</Badge>
                              <p className="text-xs text-muted-foreground mt-1">
                                Entrega: {formatDateBR(atividade.data_entrega)}
                              </p>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Minha entrega</Label>
                            <Textarea
                              rows={3}
                              placeholder="Escreva sua resposta, resumo ou reflexao..."
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
                              <p className="text-sm font-medium">Formulario da atividade</p>
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
                            <Label>Imagens da atividade (opcional, atÃ© 4)</Label>
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
                                <Badge variant="outline">Ainda nÃ£o enviado</Badge>
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
                  <CardTitle className="text-base">Sugestoes dos professores</CardTitle>
                </CardHeader>
                <CardContent>
                  {sugestoes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Nenhuma sugestao recebida.</p>
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
                        Livro: {livrosById.get(quizLivroId)?.titulo || '-'} - Tema: {quizTema.trim() || 'compreensao da leitura'}
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
                <CardTitle className="text-base">Resumo com IA</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-end">
                  <div className="space-y-1">
                    <Label htmlFor="resumo-livro">Livro</Label>
                    <select
                      id="resumo-livro"
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
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
                  <div className="space-y-1">
                    <Label className="opacity-0">Gerar</Label>
                    <Button type="button" variant="outline" onClick={gerarResumo} disabled={gerandoResumoIA} className="w-full">
                      <Sparkles className="w-4 h-4 mr-2" />
                      {gerandoResumoIA ? 'Gerando resumo...' : 'Gerar resumo IA'}
                    </Button>
                  </div>
                  <div className="space-y-1">
                    <Label className="opacity-0">Salvar</Label>
                    <Button type="button" onClick={salvarResumo} className="w-full">
                      Salvar resumo
                    </Button>
                  </div>
                </div>

                <Textarea
                  rows={8}
                  value={resumoTexto}
                  onChange={(e) => setResumoTexto(e.target.value)}
                  placeholder="O resumo gerado aparecera aqui..."
                />

                {resumosCriados.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">Resumos salvos</p>
                    {resumosCriados.slice(0, resumosLimit).map((resumo) => (
                      <div key={resumo.id} className="rounded-md border p-3">
                        <p className="text-xs text-muted-foreground">{resumo.livroTitulo}</p>
                        <p className="text-sm line-clamp-3">{resumo.texto}</p>
                        <div className="flex justify-end mt-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
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
                    {resumosCriados.length > resumosLimit && (
                      <div className="flex justify-center">
                        <Button type="button" variant="outline" size="sm" onClick={() => setResumosLimit((prev) => prev + 5)}>
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
                    Minhas solicitacoes
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
                      <p className="text-sm text-muted-foreground">Voce ainda nao tem livros aprovados/emprestados.</p>
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
                                EmprÃ©stimo: {formatDateBR(item.data_emprestimo)}
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
                                  className="w-full text-left"
                                  onClick={() => abrirSinopseCompleta(livro)}
                                >
                                  <p className="text-xs text-muted-foreground line-clamp-3 min-h-[48px]" translate="no">{livro.sinopse}</p>
                                  <p className="text-xs text-primary mt-1">Ver sinopse completa</p>
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
                                        : 'Solicitar emprestimo'
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
                        Aguardando aprovacao ({solicitacoesGroups.pendentes.length})
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
                        Historico ({solicitacoesGroups.historico.length})
                      </Button>
                    </div>
                    {solicitacoesExibidas.length === 0 ? (
                      <p className="text-center text-muted-foreground py-8">Voce ainda nao fez solicitacoes.</p>
                    ) : (
                      <div className="space-y-3">
                        {solicitacoesExibidas.slice(0, solicitacoesLimit).map((solicitacao) => {
                          const statusInfo = getSolicitacaoStatusInfo(solicitacao);
                          const timeline = buildSolicitacaoTimeline(solicitacao);
                          return (
                          <div key={solicitacao.id} className="p-3 border rounded-lg space-y-2">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="font-medium">{solicitacao.livros?.titulo || 'Livro'}</p>
                                <p className="text-xs text-muted-foreground">{solicitacao.livros?.autor || '-'}</p>
                              </div>
                              <Badge
                                variant={statusInfo.variant}
                              >
                                {statusInfo.icon}
                                {statusInfo.label}
                              </Badge>
                            </div>

                            <p className="text-xs text-muted-foreground">Solicitado em: {formatDateBR(solicitacao.created_at)}</p>

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

                            {solicitacao.resposta && (
                              <div className="rounded-md border bg-primary/5 p-2">
                                <p className="text-xs text-muted-foreground">Resposta da biblioteca</p>
                                <p className="text-sm">{solicitacao.resposta}</p>
                              </div>
                            )}
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
                  <p className="text-center text-muted-foreground py-8">Sua lista estÃ¡ vazia.</p>
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
                              {livro.disponivel ? 'DisponÃ­vel' : 'Emprestado'}
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
                <CardTitle className="text-base">Minhas avaliaÃ§Ãµes</CardTitle>
              </CardHeader>
              <CardContent>
                {avaliacoes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">VocÃª ainda nÃ£o avaliou nenhum livro.</p>
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
                  <p className="text-center text-muted-foreground py-8">Nenhuma sugestao recebida.</p>
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
            <DialogDescription>DÃª uma nota e escreva sua resenha.</DialogDescription>
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
                placeholder="O que vocÃª achou do livro?"
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
            <DialogTitle>Solicitar emprÃ©stimo</DialogTitle>
            <DialogDescription>Solicitar: {requestLivro?.titulo}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {requestLivro && hasSolicitacaoEmAndamento(requestLivro.id) && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                VocÃª jÃ¡ solicitou este livro. Aguarde a aprovaÃ§Ã£o da bibliotecÃ¡ria para solicitar novamente.
              </div>
            )}
            {requestLivro && hasEmprestimoAtivo(requestLivro.id) && (
              <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning">
                Este livro jÃ¡ estÃ¡ emprestado para vocÃª. Acompanhe em â€œMeus livrosâ€.
              </div>
            )}
            <div className="space-y-2">
              <Label>Mensagem (opcional)</Label>
              <Textarea
                value={requestMsg}
                onChange={(e) => setRequestMsg(e.target.value)}
                placeholder="Motivo ou observaÃ§Ãµes..."
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRequestDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleRequestLoan}
              disabled={
                saving
                || (requestLivro && (hasSolicitacaoEmAndamento(requestLivro.id) || hasEmprestimoAtivo(requestLivro.id)))
              }
            >
              {saving ? 'Enviando...' : 'Enviar solicitaÃ§Ã£o'}
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
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
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
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
        <DialogContent>
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
                  <option value="sugestao">Sugestão</option>
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

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShareCriacaoDialogOpen(false)}>
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
        <DialogContent className="max-w-md">
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

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteCriacaoDialogOpen(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => apagarCriacaoLaboratorio(deleteCriacaoItem)}
              disabled={saving || !deleteCriacaoItem}
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
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir imagem</DialogTitle>
            <DialogDescription>
              Confirme se deseja remover esta imagem do projeto atual.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-muted-foreground">
            Essa imagem será removida da montagem atual antes de salvar ou compartilhar.
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDeleteStudioSlideDialogOpen(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarExclusaoSlide} disabled={!deleteStudioSlideItem}>
              Remover imagem
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
          if (alunoSenhaDefinida) {
            setShowAccessChoice(open);
            return;
          }

          if (open) setShowAccessChoice(true);
        }}
      >
        <DialogContent
          onPointerDownOutside={(event) => event.preventDefault()}
          onEscapeKeyDown={(event) => event.preventDefault()}
          className="[&>button:last-child]:hidden"
        >
          <DialogHeader>
            <DialogTitle>Acesso do aluno</DialogTitle>
            <DialogDescription>
              No primeiro acesso, é obrigatório criar uma nova senha para continuar usando a conta.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
            Sua matricula continua como login. Assim que a nova senha for salva, a senha inicial deixa de funcionar.
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
            >
              {updatingPrimeiroAcessoPassword ? 'Salvando...' : 'Salvar nova senha'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
