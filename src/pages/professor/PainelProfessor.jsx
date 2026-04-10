import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle,
  ChevronsUpDown,
  ClipboardList,
  FileQuestion,
  Lightbulb,
  Loader2,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Star,
  Trash2,
  Users,
  Wand2,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { generateTextWithCloudflare } from '@/lib/cloudflareAiApi';
import { cn } from '@/lib/utils';
import {
  avaliarProfessorEntrega,
  createProfessorSugestão,
  deleteProfessorAtividade,
  deleteProfessorSugestão,
  fetchProfessorPainelData,
  saveProfessorAtividade,
} from '@/services/professorService';

const FORM_MARKER = '[FORM_CONFIG_V1]';

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

function createQuestionId() {
  return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyQuestion() {
  return {
    id: createQuestionId(),
    tipo: 'texto',
    pergunta: '',
    opcoes: ['', ''],
    correta: null,
  };
}

function createEmptyAtividade() {
  return {
    titulo: '',
    descricao: '',
    pontos_extras: 0,
    data_entrega: '',
    livro_id: '',
    aluno_id: '',
    target_mode: 'aluno',
    turma: '',
    perguntas: [],
    formulario_ativo: false,
  };
}

function formatAlunoOptionLabel(aluno) {
  if (!aluno) return '';
  return aluno.turma ? `${aluno.nome} (${aluno.turma})` : aluno.nome;
}

function AlunoCombobox({
  alunos,
  value,
  onChange,
  placeholder = 'Selecione um aluno',
  emptyMessage = 'Nenhum aluno encontrado.',
}) {
  const [open, setOpen] = useState(false);

  const alunoSelecionado = useMemo(
    () => alunos.find((item) => item.id === value) || null,
    [alunos, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between rounded-2xl border-input px-3 font-normal"
        >
          <span className={cn('truncate', !alunoSelecionado && 'text-muted-foreground')}>
            {alunoSelecionado ? formatAlunoOptionLabel(alunoSelecionado) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder="Pesquisar aluno por nome ou turma..." />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {alunos.map((item) => (
                <CommandItem
                  key={item.id}
                  value={`${item.nome || ''} ${item.turma || ''}`.trim()}
                  onSelect={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4', value === item.id ? 'opacity-100' : 'opacity-0')} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate">{item.nome || 'Aluno sem nome'}</span>
                    {item.turma ? (
                      <span className="text-xs text-muted-foreground">Turma {item.turma}</span>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function extractAtividadeFormConfig(descricao) {
  const source = String(descricao || '');
  const idx = source.indexOf(FORM_MARKER);

  if (idx < 0) {
    return { descricaoLimpa: source, perguntas: [] };
  }

  const descricaoLimpa = source.slice(0, idx).trim();
  const encoded = source.slice(idx + FORM_MARKER.length).trim();
  const parsed = decodeJsonBase64(encoded);
  const perguntas = Array.isArray(parsed?.perguntas) ? parsed.perguntas : [];

  return { descricaoLimpa, perguntas };
}

function normalizeQuestion(rawQuestion, index) {
  const tipo = rawQuestion?.tipo === 'multipla_escolha' ? 'multipla_escolha' : 'texto';
  const opcoes = Array.isArray(rawQuestion?.opcoes)
    ? rawQuestion.opcoes.map((item) => String(item || '')).filter(Boolean)
    : [];
  const correta = Number.isInteger(rawQuestion?.correta)
    ? rawQuestion.correta
    : Number.isInteger(rawQuestion?.correta_indice)
      ? rawQuestion.correta_indice
      : Number.isInteger(rawQuestion?.indice_correto)
        ? rawQuestion.indice_correto
        : Number.isInteger(rawQuestion?.resposta_correta)
          ? rawQuestion.resposta_correta
          : null;

  return {
    id: String(rawQuestion?.id || `q_${index + 1}`),
    tipo,
    pergunta: String(rawQuestion?.pergunta || ''),
    opcoes: tipo === 'multipla_escolha' ? (opcoes.length >= 2 ? opcoes : ['', '']) : ['', ''],
    correta: tipo === 'multipla_escolha' && Number.isInteger(correta) && correta >= 0 && correta < (opcoes.length >= 2 ? opcoes.length : 2)
      ? correta
      : null,
  };
}

function serializeAtividadeDescricao(descricao, perguntas) {
  const descricaoLimpa = String(descricao || '').trim();
  const perguntasNormalizadas = (Array.isArray(perguntas) ? perguntas : [])
    .map((pergunta, index) => normalizeQuestion(pergunta, index))
    .map((pergunta) => ({
      id: pergunta.id,
      tipo: pergunta.tipo,
      pergunta: String(pergunta.pergunta || '').trim(),
      opcoes: pergunta.tipo === 'multipla_escolha'
        ? pergunta.opcoes.map((item) => String(item || '').trim()).filter(Boolean)
        : [],
      correta: pergunta.tipo === 'multipla_escolha' && Number.isInteger(pergunta.correta)
        ? pergunta.correta
        : null,
    }))
    .filter((pergunta) => pergunta.pergunta);

  if (perguntasNormalizadas.length === 0) {
    return descricaoLimpa || null;
  }

  const encoded = encodeJsonBase64({ perguntas: perguntasNormalizadas });
  return `${descricaoLimpa}${descricaoLimpa ? '\n\n' : ''}${FORM_MARKER}${encoded}`;
}

function formatDateLabel(value) {
  if (!value) return 'Sem prazo';
  try {
    return format(new Date(value), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return 'Sem prazo';
  }
}

function getTargetSummary(atividade) {
  const turma = atividade?.usuarios_biblioteca?.turma;
  const aluno = atividade?.usuarios_biblioteca?.nome;
  return aluno ? `${aluno}${turma ? ` • ${turma}` : ''}` : (turma || 'Destino individual');
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

  return null;
}

function normalizeAiLookup(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function findSuggestedBookFromAI(livros, draft) {
  const suggestedId = String(draft?.livro_sugerido_id || draft?.livro_id || '').trim();
  if (suggestedId) {
    const byId = livros.find((item) => String(item?.id || '').trim() === suggestedId);
    if (byId) return byId;
  }

  const suggestedTitle = normalizeAiLookup(
    draft?.livro_sugerido_titulo || draft?.livro?.titulo || draft?.titulo_livro,
  );
  if (!suggestedTitle) return null;

  return livros.find((item) => normalizeAiLookup(item?.titulo) === suggestedTitle)
    || livros.find((item) => normalizeAiLookup(item?.titulo).includes(suggestedTitle))
    || livros.find((item) => suggestedTitle.includes(normalizeAiLookup(item?.titulo)));
}

function buildActivityDraftFromPlainText(rawValue) {
  const raw = String(rawValue || '')
    .replace(/```(?:json)?/gi, '')
    .trim();

  if (!raw) {
    return {
      titulo: '',
      descricao: '',
      pontos_extras: Number.NaN,
      perguntas: [],
      livro_sugerido_titulo: '',
      livro_sugerido_id: '',
    };
  }

  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const firstLongLine = lines.find((line) => line.length >= 6) || '';
  const normalizedFirstLine = firstLongLine.replace(/^[-*#\d.\s]+/, '').trim();
  const guessedTitle = normalizedFirstLine.length <= 90
    ? normalizedFirstLine
    : 'Atividade gerada com IA';

  return {
    titulo: guessedTitle,
    descricao: raw,
    pontos_extras: Number.NaN,
    perguntas: [],
    livro_sugerido_titulo: '',
    livro_sugerido_id: '',
  };
}

function decodePossiblyEscapedText(value) {
  return String(value || '')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .trim();
}

function extractQuotedJsonField(raw, fieldName) {
  const match = String(raw || '').match(new RegExp(`"${fieldName}"\\s*:\\s*"([\\s\\S]*?)(?<!\\\\)"`, 'i'));
  return decodePossiblyEscapedText(match?.[1] || '');
}

function extractNumericJsonField(raw, fieldName) {
  const match = String(raw || '').match(new RegExp(`"${fieldName}"\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`, 'i'));
  return match?.[1] ? Number(match[1]) : Number.NaN;
}

function extractQuestionsFromBrokenJson(raw) {
  const source = String(raw || '');
  const questionsMatch = source.match(/"perguntas"\s*:\s*\[([\s\S]*)$/i);
  if (!questionsMatch?.[1]) return [];

  const block = questionsMatch[1];
  const objectMatches = block.match(/\{[\s\S]*?(?=\}\s*,|\}\s*$|$)/g) || [];

  return objectMatches.map((item) => {
    const tipo = extractQuotedJsonField(item, 'tipo') === 'multipla_escolha' ? 'multipla_escolha' : 'texto';
    const pergunta = extractQuotedJsonField(item, 'pergunta') || extractQuotedJsonField(item, 'enunciado');
    const optionsBlock = item.match(/"opcoes"\s*:\s*\[([\s\S]*?)(?:\]|\}|$)/i)?.[1] || '';
    const opcoes = [...optionsBlock.matchAll(/"((?:\\.|[^"\\])*)"/g)]
      .map((match) => decodePossiblyEscapedText(match[1]))
      .filter(Boolean);
    const correta = extractNumericJsonField(item, 'correta');
    const indice_correto = extractNumericJsonField(item, 'indice_correto');
    const resposta_correta = extractNumericJsonField(item, 'resposta_correta');

    return {
      tipo,
      pergunta,
      opcoes,
      correta: Number.isInteger(correta)
        ? correta
        : Number.isInteger(indice_correto)
          ? indice_correto
          : Number.isInteger(resposta_correta)
            ? resposta_correta
            : null,
    };
  }).filter((item) => item.pergunta);
}

function recoverActivityDraftFromBrokenJson(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw || (!raw.includes('"titulo"') && !raw.includes('"perguntas"'))) return null;

  const titulo = extractQuotedJsonField(raw, 'titulo');
  const descricao = extractQuotedJsonField(raw, 'descricao');
  const livro_sugerido_titulo = extractQuotedJsonField(raw, 'livro_sugerido_titulo');
  const pontos_extras = extractNumericJsonField(raw, 'pontos_extras');
  const perguntas = extractQuestionsFromBrokenJson(raw);

  if (!titulo && !descricao && !perguntas.length) return null;

  return {
    titulo,
    descricao,
    pontos_extras,
    perguntas,
    livro_sugerido_titulo,
    livro_sugerido_id: '',
  };
}

function extractActivityDraftFromIAResponse(response) {
  const rawText = String(
    response?.text
      || response?.raw?.text
      || response?.raw?.output
      || response?.raw?.response
      || '',
  ).trim();

  const textJson = extractJsonFromIAPlainText(
    rawText,
  );
  const recoveredJsonDraft = recoverActivityDraftFromBrokenJson(rawText);

  const candidates = [
    response?.data,
    response?.data?.atividade,
    response?.data?.resultado,
    response?.data?.result,
    response?.raw,
    response?.raw?.data,
    response?.raw?.response,
    response?.raw?.atividade,
    response?.raw?.result,
    textJson,
    textJson?.data,
    textJson?.atividade,
    textJson?.resultado,
    textJson?.result,
    recoveredJsonDraft,
  ].filter((item) => item && typeof item === 'object' && !Array.isArray(item));

  const draft = candidates.find((item) => (
    item?.titulo
      || item?.descricao
      || item?.orientacao
      || item?.perguntas
      || item?.questoes
      || item?.questions
      || item?.livro_sugerido_titulo
  )) || {};

  return {
    titulo: String(draft?.titulo || draft?.nome || '').trim(),
    descricao: String(draft?.descricao || draft?.orientacao || draft?.instrucoes || '').trim(),
    pontos_extras: Number(draft?.pontos_extras ?? draft?.pontos ?? draft?.pontuacao ?? Number.NaN),
    perguntas: draft?.perguntas || draft?.questoes || draft?.questions || [],
    livro_sugerido_titulo: String(
      draft?.livro_sugerido_titulo || draft?.livro?.titulo || draft?.titulo_livro || '',
    ).trim(),
    livro_sugerido_id: String(draft?.livro_sugerido_id || draft?.livro_id || '').trim(),
  };
}

function buildQuestionsFromAI(rawQuestions) {
  if (!Array.isArray(rawQuestions)) return [];

  return rawQuestions
    .map((item, index) => normalizeQuestion({
      id: item?.id || `ia_${index + 1}`,
      tipo: item?.tipo === 'multipla_escolha' ? 'multipla_escolha' : 'texto',
      pergunta: String(item?.pergunta || item?.enunciado || '').trim(),
      opcoes: Array.isArray(item?.opcoes) ? item.opcoes : [],
      correta: item?.correta ?? item?.correta_indice ?? item?.indice_correto ?? item?.resposta_correta ?? null,
    }, index))
    .filter((item) => item.pergunta);
}

function parseRequestedQuestionConstraints(promptValue) {
  const text = normalizeAiLookup(promptValue);
  const totalMatch = text.match(/(\d+)\s+(?:questoes|questao|perguntas|pergunta)\b/);

  const extractFirstNumber = (patterns) => {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match?.[1]) return Number(match[1]);
    }
    return null;
  };

  const openCount = extractFirstNumber([
    /(\d+)\s+(?:questoes|questao|perguntas|pergunta)\s+(?:abertas|aberta)\b/,
    /(\d+)\s+(?:abertas|aberta)\b/,
    /(\d+)\s+(?:de\s+)?(?:texto|resposta\s+aberta)\b/,
  ]);

  const choiceCount = extractFirstNumber([
    /(\d+)\s+(?:questoes|questao|perguntas|pergunta)\s+(?:de\s+)?(?:marcar|multipla\s+escolha)\b/,
    /(\d+)\s+(?:de\s+)?(?:marcar|multipla\s+escolha)\b/,
  ]);

  let total = totalMatch?.[1] ? Number(totalMatch[1]) : null;
  if (!Number.isInteger(total) && Number.isInteger(openCount) && Number.isInteger(choiceCount)) {
    total = openCount + choiceCount;
  }

  return {
    total: Number.isInteger(total) ? Math.max(0, Math.min(30, total)) : null,
    openCount: Number.isInteger(openCount) ? Math.max(0, Math.min(30, openCount)) : null,
    choiceCount: Number.isInteger(choiceCount) ? Math.max(0, Math.min(30, choiceCount)) : null,
  };
}

function adjustQuestionsToRequestedConstraints(questions, constraints) {
  const source = Array.isArray(questions) ? questions : [];
  const total = Number.isInteger(constraints?.total) ? constraints.total : null;
  const choiceTarget = Number.isInteger(constraints?.choiceCount) ? constraints.choiceCount : null;
  const openTarget = Number.isInteger(constraints?.openCount) ? constraints.openCount : null;

  if (!Number.isInteger(total) && !Number.isInteger(choiceTarget) && !Number.isInteger(openTarget)) {
    return source;
  }

  const textQuestions = source.filter((item) => item?.tipo !== 'multipla_escolha');
  const choiceQuestions = source.filter((item) => item?.tipo === 'multipla_escolha');

  let desiredChoice = choiceTarget;
  let desiredText = openTarget;

  if (Number.isInteger(total)) {
    if (desiredChoice === null && desiredText === null) {
      return source.slice(0, total);
    }
    if (desiredChoice === null) desiredChoice = Math.max(0, total - (desiredText || 0));
    if (desiredText === null) desiredText = Math.max(0, total - (desiredChoice || 0));
  }

  if (!Number.isInteger(desiredChoice)) desiredChoice = choiceQuestions.length;
  if (!Number.isInteger(desiredText)) desiredText = textQuestions.length;

  const nextChoice = choiceQuestions.slice(0, desiredChoice);
  const nextText = textQuestions.slice(0, desiredText);

  const merged = [...nextChoice, ...nextText];
  return merged.slice(0, Number.isInteger(total) ? total : merged.length);
}

function parseOptionalPositiveInteger(value, max = 30) {
  const normalized = String(value || '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isInteger(parsed)) return null;
  return Math.max(0, Math.min(max, parsed));
}

function buildBatchConstraints(constraints, maxBatchSize = 4) {
  const total = Number.isInteger(constraints?.total) ? Math.max(0, constraints.total) : null;
  const choiceCount = Number.isInteger(constraints?.choiceCount) ? Math.max(0, constraints.choiceCount) : null;
  const openCount = Number.isInteger(constraints?.openCount) ? Math.max(0, constraints.openCount) : null;

  if (!Number.isInteger(total)) {
    return {
      total: maxBatchSize,
      choiceCount: Number.isInteger(choiceCount) ? Math.min(choiceCount, maxBatchSize) : null,
      openCount: Number.isInteger(openCount) ? Math.min(openCount, maxBatchSize) : null,
    };
  }

  const batchTotal = Math.min(maxBatchSize, total);
  let batchChoice = null;
  let batchOpen = null;

  if (Number.isInteger(choiceCount) && Number.isInteger(openCount)) {
    batchChoice = Math.min(choiceCount, batchTotal);
    batchOpen = Math.min(openCount, Math.max(0, batchTotal - batchChoice));
    if ((batchChoice + batchOpen) < batchTotal) {
      if (choiceCount - batchChoice > openCount - batchOpen) batchChoice += batchTotal - (batchChoice + batchOpen);
      else batchOpen += batchTotal - (batchChoice + batchOpen);
    }
  } else if (Number.isInteger(choiceCount)) {
    batchChoice = Math.min(choiceCount, batchTotal);
  } else if (Number.isInteger(openCount)) {
    batchOpen = Math.min(openCount, batchTotal);
  }

  return {
    total: batchTotal,
    choiceCount: batchChoice,
    openCount: batchOpen,
  };
}

function getAutoBatchSizes(total) {
  if (!Number.isInteger(total) || total <= 0) return [6, 4, 2, 1];
  if (total <= 4) return [total, 2, 1].filter((value, index, source) => value > 0 && source.indexOf(value) === index);
  if (total <= 8) return [4, 3, 2, 1];
  if (total <= 16) return [6, 4, 3, 2, 1];
  return [8, 6, 4, 3, 2, 1];
}

function buildParallelBatchPlan(constraints, maxChunkSize = 6) {
  const total = Number.isInteger(constraints?.total) ? Math.max(0, constraints.total) : 0;
  const choiceCount = Number.isInteger(constraints?.choiceCount) ? Math.max(0, constraints.choiceCount) : null;
  const openCount = Number.isInteger(constraints?.openCount) ? Math.max(0, constraints.openCount) : null;
  const chunks = [];

  if (!total) return chunks;

  let remainingTotal = total;
  let remainingChoice = choiceCount;
  let remainingOpen = openCount;

  while (remainingTotal > 0) {
    const chunkTotal = Math.min(maxChunkSize, remainingTotal);
    let chunkChoice = null;
    let chunkOpen = null;

    if (Number.isInteger(remainingChoice) && Number.isInteger(remainingOpen)) {
      chunkChoice = Math.min(remainingChoice, chunkTotal);
      chunkOpen = Math.min(remainingOpen, Math.max(0, chunkTotal - chunkChoice));

      if ((chunkChoice + chunkOpen) < chunkTotal) {
        const missing = chunkTotal - (chunkChoice + chunkOpen);
        if ((remainingChoice - chunkChoice) >= (remainingOpen - chunkOpen)) chunkChoice += missing;
        else chunkOpen += missing;
      }

      remainingChoice -= chunkChoice;
      remainingOpen -= chunkOpen;
    } else if (Number.isInteger(remainingChoice)) {
      chunkChoice = Math.min(remainingChoice, chunkTotal);
      remainingChoice -= chunkChoice;
    } else if (Number.isInteger(remainingOpen)) {
      chunkOpen = Math.min(remainingOpen, chunkTotal);
      remainingOpen -= chunkOpen;
    }

    chunks.push({
      total: chunkTotal,
      choiceCount: chunkChoice,
      openCount: chunkOpen,
    });

    remainingTotal -= chunkTotal;
  }

  return chunks;
}

function buildActivityGenerationPrompt({
  teacherPrompt,
  constraints,
  livrosDisponiveis,
  professorTurmasPermitidas,
  continuation = false,
  remainingQuestions = 0,
  existingQuestions = [],
  overallConstraints = null,
  batchLabel = '',
}) {
  const effectiveConstraints = constraints || {};
  const referenceConstraints = overallConstraints || effectiveConstraints;
  const lines = [
    'Voce e um assistente para criacao de atividades escolares.',
    'Crie uma atividade em portugues do Brasil a partir do pedido do professor.',
    'Responda SOMENTE com JSON valido.',
    continuation
      ? 'Formato esperado: {"perguntas":[{"tipo":"texto","pergunta":"..."},{"tipo":"multipla_escolha","pergunta":"...","opcoes":["...","...","..."],"correta":0}]}'
      : 'Formato esperado: {"titulo":"...","descricao":"...","pontos_extras":10,"perguntas":[{"tipo":"texto","pergunta":"..."},{"tipo":"multipla_escolha","pergunta":"...","opcoes":["...","...","..."],"correta":0}],"livro_sugerido_titulo":"..."}',
    'Regras:',
    Number.isInteger(effectiveConstraints?.total)
      ? `- gere exatamente ${effectiveConstraints.total} perguntas`
      : '- gere entre 0 e 5 perguntas',
    Number.isInteger(effectiveConstraints?.choiceCount)
      ? `- gere exatamente ${effectiveConstraints.choiceCount} questoes de multipla escolha`
      : '- use tipo "multipla_escolha" para questoes de marcar',
    Number.isInteger(effectiveConstraints?.openCount)
      ? `- gere exatamente ${effectiveConstraints.openCount} questoes abertas`
      : '- use tipo "texto" para respostas abertas',
    '- em questoes de marcar, inclua ao menos 3 opcoes curtas',
    '- em toda questao de multipla escolha, informe o indice da alternativa correta no campo "correta" começando em 0',
    '- nao inclua explicacoes fora do JSON',
    '- respeite exatamente a quantidade pedida pelo professor quando ela for informada',
    '- nao confunda quantidade de perguntas com pontos_extras',
    '- mantenha pontos_extras independente do numero de perguntas',
  ];

  if (continuation) {
    lines.push(`- gere somente as ${remainingQuestions} perguntas faltantes`);
    lines.push('- nao repita perguntas ja criadas');
    lines.push('- nao devolva titulo, descricao ou pontos_extras novamente');
    if (batchLabel) lines.push(`- este lote interno e identificado como ${batchLabel}; entregue perguntas diferentes das demais`);
    lines.push(`Perguntas ja criadas: ${JSON.stringify(existingQuestions)}`);
  }

  if (Number.isInteger(referenceConstraints?.total) && referenceConstraints.total !== effectiveConstraints?.total) {
    lines.push(`- no total final, a atividade precisa ter ${referenceConstraints.total} perguntas`);
  }
  if (Number.isInteger(referenceConstraints?.choiceCount) && referenceConstraints.choiceCount !== effectiveConstraints?.choiceCount) {
    lines.push(`- no total final, a atividade precisa ter ${referenceConstraints.choiceCount} questoes de multipla escolha`);
  }
  if (Number.isInteger(referenceConstraints?.openCount) && referenceConstraints.openCount !== effectiveConstraints?.openCount) {
    lines.push(`- no total final, a atividade precisa ter ${referenceConstraints.openCount} questoes abertas`);
  }

  lines.push(`Pedido do professor: ${teacherPrompt.trim()}`);
  lines.push(`Turmas disponiveis: ${professorTurmasPermitidas.join(', ') || 'nao informado'}`);
  lines.push(`Livros disponiveis: ${JSON.stringify(livrosDisponiveis)}`);

  return lines.join('\n');
}

async function completeQuestionsWithAI({
  teacherPrompt,
  requestedConstraints,
  livrosDisponiveis,
  professorTurmasPermitidas,
  perguntasIniciais,
}) {
  let perguntas = Array.isArray(perguntasIniciais) ? [...perguntasIniciais] : [];
  const countChoice = () => perguntas.filter((item) => item.tipo === 'multipla_escolha').length;
  const countOpen = () => perguntas.filter((item) => item.tipo !== 'multipla_escolha').length;
  const requestedTotal = Number.isInteger(requestedConstraints?.total) ? requestedConstraints.total : null;
  const appendUniqueQuestions = (nextQuestions) => {
    const uniqueQuestions = nextQuestions.filter((candidate) => (
      candidate.pergunta
      && !perguntas.some((existing) => normalizeAiLookup(existing.pergunta) === normalizeAiLookup(candidate.pergunta))
    ));

    if (uniqueQuestions.length > 0) {
      perguntas = [...perguntas, ...uniqueQuestions];
    }

    return uniqueQuestions.length;
  };

  if (Number.isInteger(requestedTotal)) {
    let stalledRounds = 0;

    while (perguntas.length < requestedTotal && stalledRounds < 3) {
      const faltantes = requestedTotal - perguntas.length;
      const remainingConstraints = {
        total: faltantes,
        choiceCount: Number.isInteger(requestedConstraints.choiceCount)
          ? Math.max(0, requestedConstraints.choiceCount - countChoice())
          : null,
        openCount: Number.isInteger(requestedConstraints.openCount)
          ? Math.max(0, requestedConstraints.openCount - countOpen())
          : null,
      };

      const maxChunkSize = faltantes > 10 ? 6 : faltantes > 6 ? 4 : 3;
      const parallelChunks = buildParallelBatchPlan(remainingConstraints, maxChunkSize).slice(0, 3);
      if (parallelChunks.length === 0) break;

      const existingQuestions = perguntas.map((item) => ({
        tipo: item.tipo,
        pergunta: item.pergunta,
      }));

      const generatedBatches = await Promise.all(parallelChunks.map(async (chunk, index) => {
        const continuationPrompt = buildActivityGenerationPrompt({
          teacherPrompt,
          constraints: chunk,
          livrosDisponiveis,
          professorTurmasPermitidas,
          continuation: true,
          remainingQuestions: chunk.total || faltantes,
          existingQuestions,
          overallConstraints: requestedConstraints,
          batchLabel: `lote_${index + 1}`,
        });

        return generateTextWithCloudflare({
          prompt: continuationPrompt,
          skipCache: true,
          fallbackErrorMessage: 'Nao foi possivel completar todas as questoes com IA agora.',
        });
      }));

      let addedThisRound = 0;
      generatedBatches.forEach((generatedBatch) => {
        const continuationDraft = extractActivityDraftFromIAResponse(generatedBatch);
        const continuationQuestions = buildQuestionsFromAI(continuationDraft.perguntas);
        addedThisRound += appendUniqueQuestions(continuationQuestions);
      });

      if (addedThisRound === 0) stalledRounds += 1;
      else stalledRounds = 0;
    }
  }

  if (Number.isInteger(requestedTotal) && perguntas.length < requestedTotal) {
    let stalledAttempts = 0;

    while (perguntas.length < requestedTotal && stalledAttempts < 6) {
      const remainingChoice = Number.isInteger(requestedConstraints.choiceCount)
        ? Math.max(0, requestedConstraints.choiceCount - countChoice())
        : null;
      const remainingOpen = Number.isInteger(requestedConstraints.openCount)
        ? Math.max(0, requestedConstraints.openCount - countOpen())
        : null;

      const singleConstraints = {
        total: 1,
        choiceCount: Number.isInteger(remainingChoice) && remainingChoice > 0 ? 1 : 0,
        openCount: Number.isInteger(remainingOpen) && remainingOpen > 0 ? 1 : 0,
      };

      if (!Number.isInteger(requestedConstraints.choiceCount) && !Number.isInteger(requestedConstraints.openCount)) {
        singleConstraints.choiceCount = null;
        singleConstraints.openCount = null;
      }

      const singlePrompt = buildActivityGenerationPrompt({
        teacherPrompt,
        constraints: singleConstraints,
        livrosDisponiveis,
        professorTurmasPermitidas,
        continuation: true,
        remainingQuestions: 1,
        existingQuestions: perguntas.map((item) => ({
          tipo: item.tipo,
          pergunta: item.pergunta,
        })),
        overallConstraints: requestedConstraints,
      });

      const singleGenerated = await generateTextWithCloudflare({
        prompt: singlePrompt,
        skipCache: true,
        fallbackErrorMessage: 'Nao foi possivel completar uma das questoes restantes com IA agora.',
      });

      const singleDraft = extractActivityDraftFromIAResponse(singleGenerated);
      const singleQuestions = buildQuestionsFromAI(singleDraft.perguntas);
      const uniqueSingle = singleQuestions.filter((candidate) => candidate.pergunta);

      if (appendUniqueQuestions(uniqueSingle) === 0) {
        stalledAttempts += 1;
        continue;
      }
      stalledAttempts = 0;
    }
  }

  return adjustQuestionsToRequestedConstraints(perguntas, requestedConstraints);
}

export default function PainelProfessor() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [livros, setLivros] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [sugestoes, setSugestoes] = useState([]);
  const [atividades, setAtividades] = useState([]);
  const [entregas, setEntregas] = useState([]);
  const [professorTurmasPermitidas, setProfessorTurmasPermitidas] = useState([]);
  const [professorProfileIds, setProfessorProfileIds] = useState([]);
  const [selectedAluno, setSelectedAluno] = useState('');
  const [selectedLivro, setSelectedLivro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [isSugestaoDialogOpen, setIsSugestaoDialogOpen] = useState(false);
  const [isAtividadeDialogOpen, setIsAtividadeDialogOpen] = useState(false);
  const [editingAtividade, setEditingAtividade] = useState(null);
  const [atividadeForm, setAtividadeForm] = useState(createEmptyAtividade);
  const [avaliacaoForm, setAvaliacaoForm] = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiQuestionCount, setAiQuestionCount] = useState('');
  const [aiChoiceCount, setAiChoiceCount] = useState('');
  const [aiOpenCount, setAiOpenCount] = useState('');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiPendingCompletion, setAiPendingCompletion] = useState(null);
  const [mobilePreviewExpanded, setMobilePreviewExpanded] = useState(false);

  const fetchData = useCallback(async ({ silent = false } = {}) => {
    if (!user?.id) return;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    try {
      const data = await fetchProfessorPainelData();
      setLivros(Array.isArray(data?.livros) ? data.livros : []);
      setUsuarios(Array.isArray(data?.usuarios) ? data.usuarios : []);
      setSugestoes(Array.isArray(data?.sugestoes) ? data.sugestoes : []);
      setAtividades(Array.isArray(data?.atividades) ? data.atividades : []);
      setEntregas(Array.isArray(data?.entregas) ? data.entregas : []);
      setProfessorTurmasPermitidas(Array.isArray(data?.turmasPermitidas) ? data.turmasPermitidas : []);
      setProfessorProfileIds(Array.isArray(data?.professorProfileIds) ? data.professorProfileIds : []);

      const initial = {};
      (Array.isArray(data?.entregas) ? data.entregas : []).forEach((item) => {
        initial[item.id] = {
          status: item.status || 'enviada',
          pontos_ganhos: Number(item.pontos_ganhos || 0),
          feedback_professor: item.feedback_professor || '',
        };
      });
      setAvaliacaoForm(initial);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao carregar dados.' });
    } finally {
      if (silent) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [toast, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchData({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchData]);

  const turmaStats = useMemo(
    () => professorTurmasPermitidas.map((turma) => ({
      turma,
      totalAlunos: usuarios.filter((item) => item.turma === turma).length,
    })),
    [professorTurmasPermitidas, usuarios],
  );

  const destinoResumo = useMemo(() => {
    if (atividadeForm.target_mode === 'aluno') {
      return atividadeForm.aluno_id ? 1 : 0;
    }

    if (atividadeForm.target_mode === 'todas_turmas') {
      return usuarios.length;
    }

    return usuarios.filter((item) => item.turma === atividadeForm.turma).length;
  }, [atividadeForm.aluno_id, atividadeForm.target_mode, atividadeForm.turma, usuarios]);

  const entregasPendentes = useMemo(
    () => entregas.filter((item) => item.status !== 'aprovada').length,
    [entregas],
  );

  const canPublishActivity = useMemo(() => {
    if (!atividadeForm.titulo.trim()) return false;
    if (atividadeForm.target_mode === 'aluno') return Boolean(atividadeForm.aluno_id);
    if (atividadeForm.target_mode === 'turma') return Boolean(atividadeForm.turma);
    return destinoResumo > 0;
  }, [
    atividadeForm.aluno_id,
    atividadeForm.target_mode,
    atividadeForm.titulo,
    atividadeForm.turma,
    destinoResumo,
  ]);

  const pontosDistribuidos = useMemo(
    () => entregas
      .filter((item) => item.status === 'aprovada')
      .reduce((acc, item) => acc + Number(item.pontos_ganhos || 0), 0),
    [entregas],
  );

  const atividadesComMeta = useMemo(
    () => atividades.map((atividade) => {
      const meta = extractAtividadeFormConfig(atividade.descricao);
      return {
        ...atividade,
        meta,
      };
    }),
    [atividades],
  );

  const resetAtividadeDialog = () => {
    setEditingAtividade(null);
    setAtividadeForm(createEmptyAtividade());
    setAiPrompt('');
    setAiQuestionCount('');
    setAiChoiceCount('');
    setAiOpenCount('');
    setAiPendingCompletion(null);
    setMobilePreviewExpanded(false);
  };

  const resetSugestaoDialog = () => {
    setSelectedAluno('');
    setSelectedLivro('');
    setMensagem('');
  };

  const handleOpenAtividadeDialog = (atividade = null) => {
    if (!atividade) {
      resetAtividadeDialog();
      setMobilePreviewExpanded(false);
      setIsAtividadeDialogOpen(true);
      return;
    }

    const meta = extractAtividadeFormConfig(atividade.descricao);
    setEditingAtividade(atividade);
    setAtividadeForm({
      titulo: atividade.titulo || '',
      descricao: meta.descricaoLimpa || '',
      pontos_extras: Number(atividade.pontos_extras || 0),
      data_entrega: atividade.data_entrega ? atividade.data_entrega.split('T')[0] : '',
      livro_id: atividade.livro_id || '',
      aluno_id: atividade.aluno_id || '',
      target_mode: 'aluno',
      turma: atividade.usuarios_biblioteca?.turma || '',
      formulario_ativo: meta.perguntas.length > 0,
      perguntas: meta.perguntas.map((item, index) => normalizeQuestion(item, index)),
    });
    setMobilePreviewExpanded(false);
    setIsAtividadeDialogOpen(true);
  };

  const handleAddQuestion = () => {
    setAtividadeForm((prev) => ({
      ...prev,
      formulario_ativo: true,
      perguntas: [...prev.perguntas, createEmptyQuestion()],
    }));
  };

  const handleQuestionChange = (questionId, field, value) => {
    setAtividadeForm((prev) => ({
      ...prev,
      perguntas: prev.perguntas.map((question) => (
        question.id === questionId
          ? { ...question, [field]: value }
          : question
      )),
    }));
  };

  const handleQuestionTypeChange = (questionId, tipo) => {
    setAtividadeForm((prev) => ({
      ...prev,
      perguntas: prev.perguntas.map((question) => {
        if (question.id !== questionId) return question;
        return {
          ...question,
          tipo,
          opcoes: tipo === 'multipla_escolha'
            ? (question.opcoes?.length >= 2 ? question.opcoes : ['', ''])
            : ['', ''],
          correta: tipo === 'multipla_escolha' ? question.correta : null,
        };
      }),
    }));
  };

  const handleQuestionOptionChange = (questionId, optionIndex, value) => {
    setAtividadeForm((prev) => ({
      ...prev,
      perguntas: prev.perguntas.map((question) => {
        if (question.id !== questionId) return question;
        const nextOptions = [...question.opcoes];
        nextOptions[optionIndex] = value;
        const validOptionsCount = nextOptions.map((item) => String(item || '').trim()).filter(Boolean).length;
        return {
          ...question,
          opcoes: nextOptions,
          correta: Number.isInteger(question.correta) && question.correta < validOptionsCount
            ? question.correta
            : question.correta,
        };
      }),
    }));
  };

  const handleCorrectOptionChange = (questionId, optionIndex) => {
    setAtividadeForm((prev) => ({
      ...prev,
      perguntas: prev.perguntas.map((question) => (
        question.id === questionId
          ? { ...question, correta: optionIndex }
          : question
      )),
    }));
  };

  const handleAddQuestionOption = (questionId) => {
    setAtividadeForm((prev) => ({
      ...prev,
      perguntas: prev.perguntas.map((question) => (
        question.id === questionId
          ? { ...question, opcoes: [...question.opcoes, ''] }
          : question
      )),
    }));
  };

  const handleRemoveQuestionOption = (questionId, optionIndex) => {
    setAtividadeForm((prev) => ({
      ...prev,
      perguntas: prev.perguntas.map((question) => {
        if (question.id !== questionId) return question;
        const nextOptions = question.opcoes.filter((_, index) => index !== optionIndex);
        const normalizedOptions = nextOptions.length >= 2 ? nextOptions : ['', ''];
        let nextCorrect = question.correta;
        if (question.correta === optionIndex) nextCorrect = null;
        else if (Number.isInteger(question.correta) && question.correta > optionIndex) nextCorrect = question.correta - 1;
        if (Number.isInteger(nextCorrect) && nextCorrect >= normalizedOptions.length) nextCorrect = null;
        return { ...question, opcoes: normalizedOptions, correta: nextCorrect };
      }),
    }));
  };

  const handleRemoveQuestion = (questionId) => {
    setAtividadeForm((prev) => {
      const perguntas = prev.perguntas.filter((question) => question.id !== questionId);
      return {
        ...prev,
        perguntas,
        formulario_ativo: perguntas.length > 0 ? prev.formulario_ativo : false,
      };
    });
  };

  const handleSendSugestao = async () => {
    if (!selectedAluno || !selectedLivro) {
      toast({
        variant: 'destructive',
        title: 'Dados incompletos',
        description: 'Selecione um aluno e um livro.',
      });
      return;
    }

    setSaving(true);
    try {
      await createProfessorSugestão({
        aluno_id: selectedAluno,
        livro_id: selectedLivro,
        mensagem: mensagem || null,
      });
      resetSugestaoDialog();
      setIsSugestaoDialogOpen(false);
      toast({ title: 'Sugestão enviada!' });
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao enviar sugestão.' });
    } finally {
      setSaving(false);
    }
  };

  const handleGenerateActivityWithAI = async () => {
    if (!aiPrompt.trim()) {
      toast({
        variant: 'destructive',
        title: 'Prompt vazio',
        description: 'Escreva um pedido para a IA montar a atividade.',
      });
      return;
    }

    setAiGenerating(true);
    try {
      const promptConstraints = parseRequestedQuestionConstraints(aiPrompt);
      const visualTotal = parseOptionalPositiveInteger(aiQuestionCount);
      const visualChoice = parseOptionalPositiveInteger(aiChoiceCount);
      const visualOpen = parseOptionalPositiveInteger(aiOpenCount);
      const requestedConstraints = {
        total: Number.isInteger(visualTotal) ? visualTotal : promptConstraints.total,
        choiceCount: Number.isInteger(visualChoice) ? visualChoice : promptConstraints.choiceCount,
        openCount: Number.isInteger(visualOpen) ? visualOpen : promptConstraints.openCount,
      };
      const initialBatchSize = getAutoBatchSizes(requestedConstraints.total)[0] || 4;

      if (
        Number.isInteger(requestedConstraints.total)
        && Number.isInteger(requestedConstraints.choiceCount)
        && Number.isInteger(requestedConstraints.openCount)
        && (requestedConstraints.choiceCount + requestedConstraints.openCount) > requestedConstraints.total
      ) {
        throw new Error('A soma de questoes abertas e de multipla escolha nao pode passar do total informado.');
      }

      const livrosDisponiveis = livros
        .slice(0, 12)
        .map((item) => ({ id: item.id, titulo: item.titulo, autor: item.autor }))
        .filter((item) => item.id && item.titulo);

      const initialBatchConstraints = buildBatchConstraints(requestedConstraints, initialBatchSize);
      const prompt = buildActivityGenerationPrompt({
        teacherPrompt: aiPrompt,
        constraints: initialBatchConstraints,
        livrosDisponiveis,
        professorTurmasPermitidas,
        overallConstraints: requestedConstraints,
      });

      const generated = await generateTextWithCloudflare({
        prompt,
        skipCache: true,
        fallbackErrorMessage: 'Nao foi possivel gerar a atividade com IA agora.',
      });

      const draft = extractActivityDraftFromIAResponse(generated);
      const plainTextDraft = buildActivityDraftFromPlainText(generated?.text);
      const finalDraft = (draft.titulo || draft.descricao || Array.isArray(draft.perguntas) && draft.perguntas.length > 0)
        ? draft
        : plainTextDraft;
      const suggestedBook = findSuggestedBookFromAI(livros, finalDraft);
      const perguntas = await completeQuestionsWithAI({
        teacherPrompt: aiPrompt,
        requestedConstraints,
        livrosDisponiveis,
        professorTurmasPermitidas,
        perguntasIniciais: buildQuestionsFromAI(finalDraft.perguntas),
      });
      const hasMeaningfulContent = Boolean(finalDraft.titulo || finalDraft.descricao || perguntas.length > 0);

      if (!hasMeaningfulContent) {
        throw new Error('A IA respondeu em formato invalido. Tente um pedido mais direto e curto.');
      }

      const totalOk = !Number.isInteger(requestedConstraints.total) || perguntas.length === requestedConstraints.total;
      const choiceOk = !Number.isInteger(requestedConstraints.choiceCount)
        || perguntas.filter((item) => item.tipo === 'multipla_escolha').length === requestedConstraints.choiceCount;
      const openOk = !Number.isInteger(requestedConstraints.openCount)
        || perguntas.filter((item) => item.tipo !== 'multipla_escolha').length === requestedConstraints.openCount;

      setAtividadeForm((prev) => ({
        ...prev,
        titulo: String(finalDraft.titulo || prev.titulo || '').trim(),
        descricao: String(finalDraft.descricao || prev.descricao || '').trim(),
        pontos_extras: Number.isFinite(finalDraft.pontos_extras)
          ? finalDraft.pontos_extras
          : prev.pontos_extras,
        perguntas,
        formulario_ativo: perguntas.length > 0,
        livro_id: suggestedBook?.id || prev.livro_id,
      }));

      if (!totalOk || !choiceOk || !openOk) {
        setAiPendingCompletion({
          requestedConstraints,
          livrosDisponiveis,
          titulo: String(finalDraft.titulo || '').trim(),
          descricao: String(finalDraft.descricao || '').trim(),
          pontos_extras: Number.isFinite(finalDraft.pontos_extras) ? finalDraft.pontos_extras : null,
          livro_id: suggestedBook?.id || '',
        });
        toast({
          variant: 'destructive',
          title: 'Geracao incompleta',
          description: 'A IA ainda nao entregou o total exato de questoes. Tente gerar novamente para buscar uma resposta melhor.',
        });
        return;
      }

      setAiPendingCompletion(null);

      toast({
        title: 'Rascunho gerado pela IA',
        description: perguntas.length > 0
          ? `A IA montou ${perguntas.length} questoes para voce revisar.`
          : 'A IA preencheu o titulo e a orientacao. Revise antes de publicar.',
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar com IA',
        description: error?.message || 'Nao foi possivel montar a atividade automaticamente.',
      });
    } finally {
      setAiGenerating(false);
    }
  };

  const handleCompleteRemainingQuestionsWithAI = async () => {
    if (!aiPendingCompletion) return;

    setAiGenerating(true);
    try {
      const perguntas = await completeQuestionsWithAI({
        teacherPrompt: aiPrompt,
        requestedConstraints: aiPendingCompletion.requestedConstraints,
        livrosDisponiveis: aiPendingCompletion.livrosDisponiveis,
        professorTurmasPermitidas,
        perguntasIniciais: atividadeForm.perguntas,
      });

      const totalOk = !Number.isInteger(aiPendingCompletion.requestedConstraints?.total)
        || perguntas.length === aiPendingCompletion.requestedConstraints.total;
      const choiceOk = !Number.isInteger(aiPendingCompletion.requestedConstraints?.choiceCount)
        || perguntas.filter((item) => item.tipo === 'multipla_escolha').length === aiPendingCompletion.requestedConstraints.choiceCount;
      const openOk = !Number.isInteger(aiPendingCompletion.requestedConstraints?.openCount)
        || perguntas.filter((item) => item.tipo !== 'multipla_escolha').length === aiPendingCompletion.requestedConstraints.openCount;

      setAtividadeForm((prev) => ({
        ...prev,
        perguntas,
        formulario_ativo: perguntas.length > 0,
      }));

      if (!totalOk || !choiceOk || !openOk) {
        throw new Error('A IA ainda nao conseguiu completar todas as questoes restantes.');
      }

      setAiPendingCompletion(null);
      toast({
        title: 'Questoes completadas',
        description: `A IA finalizou as ${perguntas.length} questoes solicitadas.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Nao foi possivel completar',
        description: error?.message || 'A IA ainda nao conseguiu completar as questoes restantes.',
      });
    } finally {
      setAiGenerating(false);
    }
  };

  const handleSaveAtividade = async () => {
    if (isMobile && !mobilePreviewExpanded) {
      setMobilePreviewExpanded(true);
      return;
    }

    if (!atividadeForm.titulo.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Informe o título da atividade.' });
      return;
    }

    if (atividadeForm.target_mode === 'aluno' && !atividadeForm.aluno_id) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Selecione um aluno.' });
      return;
    }

    if (atividadeForm.target_mode === 'turma' && !atividadeForm.turma) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Selecione uma turma.' });
      return;
    }

    if (atividadeForm.target_mode !== 'aluno' && destinoResumo === 0) {
      toast({
        variant: 'destructive',
        title: 'Sem alunos disponíveis',
        description: 'Não há alunos no destino selecionado.',
      });
      return;
    }

    if (atividadeForm.formulario_ativo) {
      const perguntasInvalidas = atividadeForm.perguntas.some((question) => {
        if (!String(question.pergunta || '').trim()) return true;
        if (question.tipo !== 'multipla_escolha') return false;
        const validOptions = question.opcoes.map((item) => String(item || '').trim()).filter(Boolean);
        return validOptions.length < 2 || !Number.isInteger(question.correta) || question.correta < 0 || question.correta >= validOptions.length;
      });

      if (perguntasInvalidas) {
        toast({
          variant: 'destructive',
          title: 'Formulario incompleto',
          description: 'Preencha todas as perguntas, deixe ao menos 2 opcoes e marque a alternativa correta nas questoes de marcar.',
        });
        return;
      }
    }

    setSaving(true);
    try {
      const response = await saveProfessorAtividade({
        titulo: atividadeForm.titulo.trim(),
        descricao: serializeAtividadeDescricao(
          atividadeForm.descricao,
          atividadeForm.formulario_ativo ? atividadeForm.perguntas : [],
        ),
        pontos_extras: Number(atividadeForm.pontos_extras || 0),
        data_entrega: atividadeForm.data_entrega ? new Date(atividadeForm.data_entrega).toISOString() : null,
        livro_id: atividadeForm.livro_id || null,
        aluno_id: atividadeForm.target_mode === 'aluno' ? atividadeForm.aluno_id || null : null,
        target_mode: atividadeForm.target_mode,
        turma: atividadeForm.target_mode === 'turma' ? atividadeForm.turma || null : null,
      }, editingAtividade?.id || null);

      setIsAtividadeDialogOpen(false);
      resetAtividadeDialog();

      const count = Number(response?.count || 0);
      const description = editingAtividade
        ? 'Atividade atualizada com sucesso.'
        : atividadeForm.target_mode === 'aluno'
          ? 'Atividade enviada para 1 aluno.'
          : `Atividade enviada para ${count || destinoResumo} alunos.`;

      toast({
        title: editingAtividade ? 'Atividade atualizada' : 'Atividade criada',
        description,
      });
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao salvar atividade.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAvaliarEntrega = async (entrega) => {
    const state = avaliacaoForm[entrega.id] || {};
    if (!professorProfileIds.includes(entrega?.atividades_leitura?.professor_id)) return;

    setSaving(true);
    try {
      await avaliarProfessorEntrega(entrega.id, {
        status: state.status,
        pontos_ganhos: Number(state.pontos_ganhos || 0),
        feedback_professor: state.feedback_professor || null,
      });
      toast({ title: 'Avaliação salva' });
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao avaliar entrega.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTarget = async () => {
    if (!deleteTarget?.id || !deleteTarget?.kind) return;

    setSaving(true);
    try {
      if (deleteTarget.kind === 'atividade') {
        await deleteProfessorAtividade(deleteTarget.id);
      } else {
        await deleteProfessorSugestão(deleteTarget.id);
      }
      setDeleteTarget(null);
      toast({ title: deleteTarget.kind === 'atividade' ? 'Atividade excluida' : 'Sugestao excluida' });
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao excluir item.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <MainLayout title="Painel do Professor">
      <div className="space-y-6">
        {refreshing && !loading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Atualizando dados em segundo plano...
          </div>
        )}

        {professorTurmasPermitidas.length === 0 && (
          <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 animate-in fade-in-0 slide-in-from-top-2">
            <p className="text-sm text-warning">
              Você ainda não possui turmas vinculadas. Peça ao gestor para liberar suas turmas antes de enviar atividades em lote.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-primary/20 bg-gradient-to-br from-background to-primary/5">
            <CardContent className="flex items-center gap-4 p-6">
              <Lightbulb className="h-6 w-6 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Sugestões enviadas</p>
                <p className="text-2xl font-bold">{sugestoes.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-info/20 bg-gradient-to-br from-background to-info/5">
            <CardContent className="flex items-center gap-4 p-6">
              <ClipboardList className="h-6 w-6 text-info" />
              <div>
                <p className="text-sm text-muted-foreground">Atividades criadas</p>
                <p className="text-2xl font-bold">{atividades.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-warning/20 bg-gradient-to-br from-background to-warning/5">
            <CardContent className="flex items-center gap-4 p-6">
              <CheckCircle className="h-6 w-6 text-warning" />
              <div>
                <p className="text-sm text-muted-foreground">Entregas para avaliar</p>
                <p className="text-2xl font-bold">{entregasPendentes}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-success/20 bg-gradient-to-br from-background to-success/5">
            <CardContent className="flex items-center gap-4 p-6">
              <Star className="h-6 w-6 text-success" />
              <div>
                <p className="text-sm text-muted-foreground">Pontos liberados</p>
                <p className="text-2xl font-bold">{pontosDistribuidos}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="atividades">
          <TabsList className="grid h-auto w-full grid-cols-1 gap-2 rounded-2xl bg-muted/40 p-2 sm:flex sm:justify-start sm:overflow-x-auto sm:whitespace-nowrap sm:px-1 sm:py-1">
            <TabsTrigger value="atividades" className="min-h-[50px] whitespace-normal rounded-2xl px-3 py-3 text-left text-sm leading-5 sm:min-h-0 sm:text-center">Atividades</TabsTrigger>
            <TabsTrigger value="entregas" className="min-h-[50px] whitespace-normal rounded-2xl px-3 py-3 text-left text-sm leading-5 sm:min-h-0 sm:text-center">Entregas</TabsTrigger>
            <TabsTrigger value="sugestoes" className="min-h-[50px] whitespace-normal rounded-2xl px-3 py-3 text-left text-sm leading-5 sm:min-h-0 sm:text-center">Sugestões</TabsTrigger>
          </TabsList>

          <TabsContent value="atividades" className="space-y-4">
            <Card className="border-0 shadow-none">
              <CardHeader className="rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-info/10">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div className="space-y-2">
                    <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/80 px-3 py-1 text-xs font-medium text-primary backdrop-blur">
                      <Sparkles className="h-3.5 w-3.5" />
                      Atividades personalizadas
                    </div>
                    <CardTitle className="text-xl sm:text-2xl">Monte tarefas do seu jeito</CardTitle>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      Crie atividades com perguntas abertas ou de marcar, escolha uma turma específica, um aluno
                      ou envie para todas as turmas liberadas.
                    </p>
                  </div>
                  <Button
                    size="lg"
                    className="w-full rounded-2xl px-5 shadow-[0_16px_35px_rgba(0,0,0,0.12)] transition-transform hover:-translate-y-0.5 sm:w-auto"
                    onClick={() => handleOpenAtividadeDialog()}
                  >
                    <Wand2 className="mr-2 h-4 w-4" />
                    Nova atividade
                  </Button>
                </div>
              </CardHeader>
            </Card>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(280px,0.9fr)]">
              <Card className="animate-in fade-in-0 slide-in-from-bottom-3">
                <CardHeader>
                  <CardTitle className="text-lg">Atividades enviadas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Carregando atividades...
                    </div>
                  ) : atividadesComMeta.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma atividade cadastrada ainda.</p>
                  ) : (
                    atividadesComMeta.map((atividade, index) => (
                      <div
                        key={atividade.id}
                        className="rounded-2xl border bg-card/80 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_16px_30px_rgba(0,0,0,0.06)] animate-in fade-in-0 slide-in-from-bottom-2 sm:p-5"
                        style={{ animationDelay: `${index * 40}ms` }}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-foreground">{atividade.titulo}</p>
                              <Badge variant="outline">{atividade.status || 'pendente'}</Badge>
                              {atividade.meta.perguntas.length > 0 && (
                                <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                                  {atividade.meta.perguntas.length} questões
                                </Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground">{getTargetSummary(atividade)}</p>
                            <p className="text-sm text-muted-foreground">
                              {atividade.livros?.titulo || 'Sem livro vinculado'} • entrega em {formatDateLabel(atividade.data_entrega)}
                            </p>
                            {atividade.meta.descricaoLimpa && (
                              <p className="text-sm leading-6 text-foreground/80">{atividade.meta.descricaoLimpa}</p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 self-start sm:self-auto">
                            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-2xl" onClick={() => handleOpenAtividadeDialog(atividade)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-10 w-10 rounded-2xl"
                              onClick={() => setDeleteTarget({ kind: 'atividade', id: atividade.id, label: atividade.titulo || 'atividade' })}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              <Card className="animate-in fade-in-0 slide-in-from-bottom-4">
                <CardHeader>
                  <CardTitle className="text-lg">Turmas liberadas</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {turmaStats.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Nenhuma turma vinculada ao seu perfil.</p>
                  ) : (
                    turmaStats.map((item) => (
                      <div key={item.turma} className="rounded-2xl border bg-muted/30 p-3 transition-colors hover:border-primary/30">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">{item.turma}</p>
                            <p className="text-xs text-muted-foreground">{item.totalAlunos} alunos disponíveis</p>
                          </div>
                          <Users className="h-4 w-4 text-primary" />
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="entregas">
            <Card>
              <CardHeader>
                <CardTitle>Entregas dos alunos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando entregas...
                  </div>
                ) : entregas.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma entrega para avaliar.</p>
                ) : (
                  entregas.map((entrega) => {
                    const state = avaliacaoForm[entrega.id] || {
                      status: 'enviada',
                      pontos_ganhos: 0,
                      feedback_professor: '',
                    };

                    return (
                      <div key={entrega.id} className="space-y-4 rounded-3xl border p-4 sm:p-5">
                        <div className="space-y-1">
                          <p className="font-medium">{entrega.atividades_leitura?.titulo || 'Atividade'}</p>
                          <p className="text-sm text-muted-foreground">
                            {entrega.usuarios_biblioteca?.nome || 'Aluno'} • {entrega.usuarios_biblioteca?.turma || '-'}
                          </p>
                        </div>

                        <div className="grid gap-4 lg:grid-cols-3">
                          <div className="space-y-2">
                            <Label>Status</Label>
                            <Select
                              value={state.status}
                              onValueChange={(value) => setAvaliacaoForm((prev) => ({
                                ...prev,
                                [entrega.id]: { ...prev[entrega.id], status: value },
                              }))}
                            >
                              <SelectTrigger className="min-h-[46px] rounded-2xl"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="enviada">Enviada</SelectItem>
                                <SelectItem value="aprovada">Aprovada</SelectItem>
                                <SelectItem value="revisao">Revisão</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-2">
                            <Label>Pontos</Label>
                            <Input
                              type="number"
                              min="0"
                              className="min-h-[46px] rounded-2xl"
                              value={state.pontos_ganhos}
                              onChange={(e) => setAvaliacaoForm((prev) => ({
                                ...prev,
                                [entrega.id]: { ...prev[entrega.id], pontos_ganhos: Number(e.target.value || 0) },
                              }))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Feedback</Label>
                            <Textarea
                              rows={4}
                              value={state.feedback_professor || ''}
                              onChange={(e) => setAvaliacaoForm((prev) => ({
                                ...prev,
                                [entrega.id]: { ...prev[entrega.id], feedback_professor: e.target.value },
                              }))}
                            />
                          </div>
                        </div>

                        <Button onClick={() => handleAvaliarEntrega(entrega)} disabled={saving} className="h-11 w-full rounded-2xl sm:w-auto">
                          Salvar avaliação
                        </Button>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sugestoes">
            <Card>
              <CardHeader>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <CardTitle>Sugestões</CardTitle>
                  <Button onClick={() => setIsSugestaoDialogOpen(true)}>
                    <Send className="mr-2 h-4 w-4" />
                    Nova sugestão
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Carregando sugestões...
                  </div>
                ) : sugestoes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhuma sugestão enviada.</p>
                ) : (
                  sugestoes.map((sugestao) => (
                    <div key={sugestao.id} className="rounded-2xl border p-4 flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{sugestao.livros?.titulo || 'Livro'}</p>
                        <p className="text-sm text-muted-foreground">
                          {sugestao.usuarios_biblioteca?.nome || 'Aluno'} • {sugestao.usuarios_biblioteca?.turma || '-'}
                        </p>
                        {sugestao.mensagem && <p className="mt-2 text-sm">{sugestao.mensagem}</p>}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleteTarget({ kind: 'sugestao', id: sugestao.id, label: sugestao.livros?.titulo || 'sugestão' })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog
          open={isSugestaoDialogOpen}
          onOpenChange={(open) => {
            setIsSugestaoDialogOpen(open);
            if (!open) resetSugestaoDialog();
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova sugestão</DialogTitle>
              <DialogDescription>Sugira um livro para um aluno.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Aluno</Label>
                <Select value={selectedAluno} onValueChange={setSelectedAluno}>
                  <SelectTrigger><SelectValue placeholder="Selecione um aluno" /></SelectTrigger>
                  <SelectContent>
                    {usuarios.map((item) => (
                      <SelectItem key={item.id} value={item.id}>
                        {item.nome} {item.turma ? `(${item.turma})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Livro</Label>
                <Select value={selectedLivro} onValueChange={setSelectedLivro}>
                  <SelectTrigger><SelectValue placeholder="Selecione um livro" /></SelectTrigger>
                  <SelectContent>
                    {livros.map((livro) => (
                      <SelectItem key={livro.id} value={livro.id}>{livro.titulo}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Mensagem</Label>
                <Textarea rows={3} value={mensagem} onChange={(e) => setMensagem(e.target.value)} />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsSugestaoDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSendSugestao} disabled={saving}>Enviar</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isAtividadeDialogOpen}
          onOpenChange={(open) => {
            setIsAtividadeDialogOpen(open);
            if (!open) {
              resetAtividadeDialog();
            } else if (!isMobile) {
              setMobilePreviewExpanded(true);
            }
          }}
        >
          <DialogContent className={cn(
            'h-[100dvh] w-screen max-w-none overflow-hidden rounded-none border-0 p-0 sm:h-auto sm:max-h-[92vh] sm:w-[calc(100vw-2rem)] sm:max-w-6xl sm:rounded-3xl sm:border',
            isMobile && !mobilePreviewExpanded && 'pb-32',
          )}>
            <div className="grid h-full max-h-[100dvh] gap-0 xl:max-h-[92vh] xl:grid-cols-[minmax(0,1.15fr)_340px]">
              <div className={cn(
                'overflow-y-auto p-4 sm:p-6 lg:p-7',
                isMobile ? 'pb-36' : 'pb-28 sm:pb-32 lg:pb-10',
              )}>
                <DialogHeader className="space-y-2 text-left">
                  <DialogTitle className="text-xl sm:text-2xl">
                    {editingAtividade ? 'Editar atividade' : 'Criar atividade personalizada'}
                  </DialogTitle>
                  <DialogDescription>
                    Monte questões próprias, escolha o destino e envie tudo com uma interface mais guiada.
                  </DialogDescription>
                </DialogHeader>

                <div className="mt-6 space-y-6">
                  <div className="rounded-3xl border bg-gradient-to-br from-info/10 via-background to-primary/10 p-4 sm:p-5">
                    <div className="flex flex-col gap-4">
                      <div>
                        <p className="font-semibold">Gerar atividade com IA</p>
                        <p className="text-sm text-muted-foreground">
                          Descreva o que voce quer e a IA monta um rascunho com titulo, orientacao e questoes.
                        </p>
                      </div>
                      <Textarea
                        rows={3}
                        placeholder="Ex.: Crie uma atividade sobre fotossintese para o 7 ano com 3 perguntas, sendo 2 de marcar e 1 aberta."
                        value={aiPrompt}
                        onChange={(e) => setAiPrompt(e.target.value)}
                      />
                      <div className="grid gap-4 lg:grid-cols-3">
                        <div className="space-y-2">
                          <Label htmlFor="ai-question-count">Total de questoes</Label>
                          <Input
                            id="ai-question-count"
                            type="number"
                            min="0"
                            max="30"
                            placeholder="Ex.: 14"
                            value={aiQuestionCount}
                            onChange={(e) => setAiQuestionCount(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ai-choice-count">De marcar</Label>
                          <Input
                            id="ai-choice-count"
                            type="number"
                            min="0"
                            max="30"
                            placeholder="Ex.: 8"
                            value={aiChoiceCount}
                            onChange={(e) => setAiChoiceCount(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="ai-open-count">Abertas</Label>
                          <Input
                            id="ai-open-count"
                            type="number"
                            min="0"
                            max="30"
                            placeholder="Ex.: 6"
                            value={aiOpenCount}
                            onChange={(e) => setAiOpenCount(e.target.value)}
                          />
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs text-muted-foreground">
                          Se voce preencher os campos acima, eles tem prioridade sobre o texto do prompt.
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {aiPendingCompletion && (
                            <Button type="button" variant="secondary" onClick={handleCompleteRemainingQuestionsWithAI} disabled={aiGenerating}>
                              {aiGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Tentar completar restantes
                            </Button>
                          )}
                          <Button type="button" variant="outline" onClick={handleGenerateActivityWithAI} disabled={aiGenerating}>
                            {aiGenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            <Sparkles className="mr-2 h-4 w-4" />
                            Gerar com IA
                          </Button>
                        </div>
                      </div>
                      {aiPendingCompletion && (
                        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                          A IA montou um rascunho parcial. Use o botao para completar apenas as questoes restantes sem perder o que ja veio certo.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                    <div className="space-y-2">
                      <Label>Título *</Label>
                      <Input
                        value={atividadeForm.titulo}
                        placeholder="Ex.: Interpretação do capítulo 4"
                        onChange={(e) => setAtividadeForm((prev) => ({ ...prev, titulo: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Pontos</Label>
                      <Input
                        type="number"
                        min="0"
                        value={atividadeForm.pontos_extras}
                        onChange={(e) => setAtividadeForm((prev) => ({ ...prev, pontos_extras: Number(e.target.value || 0) }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Orientação da atividade</Label>
                    <Textarea
                      rows={4}
                      placeholder="Explique o contexto, objetivo ou instruções gerais da atividade."
                      value={atividadeForm.descricao}
                      onChange={(e) => setAtividadeForm((prev) => ({ ...prev, descricao: e.target.value }))}
                    />
                  </div>

                  <div className="rounded-3xl border bg-gradient-to-br from-muted/60 to-background p-4 sm:p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="font-semibold">Formulário personalizado</p>
                        <p className="text-sm text-muted-foreground">
                          Ative para adicionar perguntas de responder ou marcar.
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <Label htmlFor="atividade-formulario" className="text-sm">Ativar</Label>
                        <Switch
                          id="atividade-formulario"
                          checked={atividadeForm.formulario_ativo}
                          onCheckedChange={(checked) => setAtividadeForm((prev) => ({
                            ...prev,
                            formulario_ativo: checked,
                            perguntas: checked
                              ? (prev.perguntas.length > 0 ? prev.perguntas : [createEmptyQuestion()])
                              : [],
                          }))}
                        />
                      </div>
                    </div>

                    {atividadeForm.formulario_ativo && (
                      <div className="mt-5 space-y-4">
                        {atividadeForm.perguntas.map((question, index) => (
                          <div
                            key={question.id}
                            className="rounded-2xl border bg-background p-4 shadow-sm transition-all duration-300 animate-in fade-in-0 slide-in-from-bottom-2"
                          >
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                                  <FileQuestion className="h-4 w-4" />
                                </div>
                                <div>
                                  <p className="font-medium">Questão {index + 1}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {question.tipo === 'multipla_escolha' ? 'Pergunta de marcar' : 'Pergunta de responder'}
                                  </p>
                                </div>
                              </div>

                              <Button variant="ghost" size="icon" onClick={() => handleRemoveQuestion(question.id)}>
                                <Trash2 className="h-4 w-4 text-destructive" />
                              </Button>
                            </div>

                            <div className="mt-4 space-y-4">
                              <div className="space-y-2">
                                <Label>Pergunta</Label>
                                <Input
                                  value={question.pergunta}
                                  placeholder="Digite a pergunta para o aluno."
                                  onChange={(e) => handleQuestionChange(question.id, 'pergunta', e.target.value)}
                                />
                              </div>

                              <div className="space-y-2">
                                <Label>Tipo de resposta</Label>
                                <div className="grid gap-2 lg:grid-cols-2">
                                  <button
                                    type="button"
                                    className={cn(
                                      'rounded-2xl border px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5',
                                      question.tipo === 'texto'
                                        ? 'border-primary bg-primary/10 text-primary shadow-sm'
                                        : 'border-border bg-background text-foreground',
                                    )}
                                    onClick={() => handleQuestionTypeChange(question.id, 'texto')}
                                  >
                                    <p className="font-medium">Responder</p>
                                    <p className="text-xs text-muted-foreground">O aluno escreve livremente.</p>
                                  </button>
                                  <button
                                    type="button"
                                    className={cn(
                                      'rounded-2xl border px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5',
                                      question.tipo === 'multipla_escolha'
                                        ? 'border-primary bg-primary/10 text-primary shadow-sm'
                                        : 'border-border bg-background text-foreground',
                                    )}
                                    onClick={() => handleQuestionTypeChange(question.id, 'multipla_escolha')}
                                  >
                                    <p className="font-medium">Marcar</p>
                                    <p className="text-xs text-muted-foreground">O aluno escolhe uma opção.</p>
                                  </button>
                                </div>
                              </div>

                              {question.tipo === 'multipla_escolha' && (
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between gap-3">
                                    <Label>Opcoes</Label>
                                    <p className="text-xs text-muted-foreground">Marque a correta para facilitar a correcao.</p>
                                  </div>
                                  {question.opcoes.map((option, optionIndex) => (
                                    <div key={`${question.id}-${optionIndex}`} className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                      <Button
                                        type="button"
                                        variant={question.correta === optionIndex ? 'default' : 'outline'}
                                        size="icon"
                                        className="h-11 w-full shrink-0 rounded-xl sm:h-10 sm:w-10"
                                        onClick={() => handleCorrectOptionChange(question.id, optionIndex)}
                                        title={question.correta === optionIndex ? 'Alternativa correta' : 'Marcar como correta'}
                                      >
                                        <CheckCircle className="h-4 w-4" />
                                      </Button>
                                      <Input
                                        value={option}
                                        placeholder={`Opcao ${optionIndex + 1}`}
                                        onChange={(e) => handleQuestionOptionChange(question.id, optionIndex, e.target.value)}
                                      />
                                      {question.opcoes.length > 2 && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
                                          className="h-11 w-full rounded-xl sm:h-10 sm:w-10"
                                          onClick={() => handleRemoveQuestionOption(question.id, optionIndex)}
                                        >
                                          <Trash2 className="h-4 w-4 text-destructive" />
                                        </Button>
                                      )}
                                    </div>
                                  ))}

                                  <Button type="button" variant="outline" onClick={() => handleAddQuestionOption(question.id)}>
                                    <Plus className="mr-2 h-4 w-4" />
                                    Adicionar opção
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}

                        <Button type="button" variant="outline" className="rounded-2xl" onClick={handleAddQuestion}>
                          <Plus className="mr-2 h-4 w-4" />
                          Nova questão
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="grid gap-4 lg:grid-cols-2">
                    <div className="space-y-2">
                      <Label>Livro</Label>
                      <Select
                        value={atividadeForm.livro_id || 'none'}
                        onValueChange={(value) => setAtividadeForm((prev) => ({
                          ...prev,
                          livro_id: value === 'none' ? '' : value,
                        }))}
                      >
                        <SelectTrigger><SelectValue placeholder="Selecione um livro" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem livro vinculado</SelectItem>
                          {livros.map((livro) => (
                            <SelectItem key={livro.id} value={livro.id}>{livro.titulo}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label>Data de entrega</Label>
                      <Input
                        type="date"
                        value={atividadeForm.data_entrega}
                        onChange={(e) => setAtividadeForm((prev) => ({ ...prev, data_entrega: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="rounded-3xl border p-4 sm:p-5">
                    <div className="space-y-2">
                      <Label>Destino da atividade</Label>
                      <p className="text-sm text-muted-foreground">
                        Escolha se a atividade vai para um aluno, uma turma específica ou todas as turmas liberadas.
                      </p>
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-3">
                      {[
                        { value: 'aluno', title: 'Aluno', description: 'Entrega individual para um aluno.' },
                        { value: 'turma', title: 'Turma', description: 'Envio em lote para uma turma.' },
                        { value: 'todas_turmas', title: 'Todas as turmas', description: 'Envia para todos os alunos vinculados.' },
                      ].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={cn(
                            'rounded-2xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5',
                            atividadeForm.target_mode === option.value
                              ? 'border-primary bg-primary/10 shadow-sm'
                              : 'border-border bg-background',
                          )}
                          onClick={() => setAtividadeForm((prev) => ({
                            ...prev,
                            target_mode: option.value,
                            turma: option.value === 'turma' ? prev.turma : '',
                            aluno_id: option.value === 'aluno' ? prev.aluno_id : '',
                          }))}
                        >
                          <p className="font-medium">{option.title}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                        </button>
                      ))}
                    </div>

                    <div className="mt-4">
                      {atividadeForm.target_mode === 'aluno' ? (
                        <div className="space-y-2">
                          <Label>Aluno</Label>
                          <AlunoCombobox
                            alunos={usuarios}
                            value={atividadeForm.aluno_id || ''}
                            onChange={(value) => setAtividadeForm((prev) => ({ ...prev, aluno_id: value }))}
                          />
                        </div>
                      ) : atividadeForm.target_mode === 'turma' ? (
                        <div className="space-y-2">
                          <Label>Turma</Label>
                          <Select
                            value={atividadeForm.turma || ''}
                            onValueChange={(value) => setAtividadeForm((prev) => ({ ...prev, turma: value }))}
                          >
                            <SelectTrigger><SelectValue placeholder="Selecione uma turma" /></SelectTrigger>
                            <SelectContent>
                              {turmaStats.map((item) => (
                                <SelectItem key={item.turma} value={item.turma}>
                                  {item.turma} ({item.totalAlunos} alunos)
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
                          A atividade será enviada para <span className="font-medium text-foreground">{usuarios.length}</span> alunos
                          distribuídos nas turmas liberadas ao seu perfil.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <aside className="hidden border-t bg-muted/30 p-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] sm:block sm:p-6 xl:overflow-y-auto xl:border-l xl:border-t-0">
                <div className="flex min-h-full flex-col">
                  <div className="space-y-5">
                  <div className="rounded-3xl border bg-background p-4">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Prévia</p>
                    <p className="mt-2 text-lg font-semibold">{atividadeForm.titulo || 'Sua atividade aparecerá aqui'}</p>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {atividadeForm.descricao || 'Adicione uma orientação curta para o aluno entender o objetivo da tarefa.'}
                    </p>
                  </div>

                  <div className="rounded-3xl border bg-background p-4">
                    <p className="text-sm font-medium">Resumo do envio</p>
                    <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                      <div className="flex items-center justify-between gap-3">
                        <span>Destino</span>
                        <span className="font-medium text-foreground">
                          {atividadeForm.target_mode === 'aluno'
                            ? 'Aluno'
                            : atividadeForm.target_mode === 'turma'
                              ? 'Turma'
                              : 'Todas as turmas'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Alunos alcançados</span>
                        <span className="font-medium text-foreground">{destinoResumo}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Questões</span>
                        <span className="font-medium text-foreground">{atividadeForm.formulario_ativo ? atividadeForm.perguntas.length : 0}</span>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <span>Prazo</span>
                        <span className="font-medium text-foreground">{atividadeForm.data_entrega ? formatDateLabel(atividadeForm.data_entrega) : 'Livre'}</span>
                      </div>
                    </div>
                  </div>

                  </div>

                  <div className="sticky bottom-0 mt-5 flex flex-col gap-2 border-t bg-muted/95 pt-4 backdrop-blur supports-[backdrop-filter]:bg-muted/80 xl:mt-auto">
                    {canPublishActivity && (
                      <p className="text-center text-xs font-medium text-primary">
                        A atividade está pronta para publicar.
                      </p>
                    )}
                    <Button
                      onClick={handleSaveAtividade}
                      disabled={saving}
                      className={`h-12 rounded-2xl transition-all ${canPublishActivity ? 'bg-primary shadow-lg shadow-primary/25 ring-2 ring-primary/20 hover:bg-primary/90' : ''}`}
                    >
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingAtividade ? 'Salvar alterações' : 'Publicar atividade'}
                    </Button>
                    <Button variant="outline" onClick={() => setIsAtividadeDialogOpen(false)} className="h-12 rounded-2xl">
                      Cancelar
                    </Button>
                  </div>
                </div>
              </aside>

              <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] sm:hidden">
                <div className="pointer-events-auto mx-auto max-w-xl rounded-[28px] border border-border/60 bg-background/96 shadow-[0_-14px_40px_rgba(15,23,42,0.18)] backdrop-blur supports-[backdrop-filter]:bg-background/88">
                  <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">Prévia</p>
                      <p className="truncate text-sm font-semibold text-foreground">
                        {atividadeForm.titulo?.trim() || 'Nome da atividade'}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-10 w-10 rounded-full text-lg font-semibold"
                      onClick={() => setMobilePreviewExpanded((prev) => !prev)}
                      aria-label={mobilePreviewExpanded ? 'Recolher prévia' : 'Expandir prévia'}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'block transition-transform duration-200',
                          mobilePreviewExpanded && 'rotate-90',
                        )}
                      >
                        &lt;
                      </span>
                    </Button>
                    <Button onClick={handleSaveAtividade} disabled={saving} className="rounded-2xl px-4">
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Publicar
                    </Button>
                  </div>

                  {mobilePreviewExpanded && (
                    <div className="border-t border-border/60 px-4 pb-4 pt-3 animate-in slide-in-from-bottom-4 duration-200">
                      <div className="space-y-4">
                        <div className="rounded-3xl border bg-muted/30 p-4">
                          <p className="text-lg font-semibold">{atividadeForm.titulo || 'Sua atividade aparecerá aqui'}</p>
                          <p className="mt-2 text-sm text-muted-foreground">
                            {atividadeForm.descricao || 'Adicione uma orientação curta para o aluno entender o objetivo da tarefa.'}
                          </p>
                        </div>

                        <div className="rounded-3xl border bg-muted/20 p-4">
                          <p className="text-sm font-medium">Resumo do envio</p>
                          <div className="mt-3 space-y-2 text-sm text-muted-foreground">
                            <div className="flex items-center justify-between gap-3">
                              <span>Destino</span>
                              <span className="font-medium text-foreground">
                                {atividadeForm.target_mode === 'aluno'
                                  ? 'Aluno'
                                  : atividadeForm.target_mode === 'turma'
                                    ? 'Turma'
                                    : 'Todas as turmas'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>Alunos alcançados</span>
                              <span className="font-medium text-foreground">{destinoResumo}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>Questões</span>
                              <span className="font-medium text-foreground">{atividadeForm.formulario_ativo ? atividadeForm.perguntas.length : 0}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span>Prazo</span>
                              <span className="font-medium text-foreground">{atividadeForm.data_entrega ? formatDateLabel(atividadeForm.data_entrega) : 'Livre'}</span>
                            </div>
                          </div>
                        </div>

                        {canPublishActivity && (
                          <p className="text-center text-xs font-medium text-primary">
                            A atividade está pronta para publicar.
                          </p>
                        )}

                        <Button variant="outline" onClick={() => setIsAtividadeDialogOpen(false)} className="h-12 w-full rounded-2xl">
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{deleteTarget?.kind === 'atividade' ? 'Excluir atividade?' : 'Excluir sugestão?'}</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteTarget
                  ? `O item "${deleteTarget.label}" será removido permanentemente.`
                  : 'Este item será removido permanentemente.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
              <AlertDialogAction disabled={saving} onClick={handleDeleteTarget} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {saving ? 'Excluindo...' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}
