import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  CheckCircle,
  ClipboardList,
  Lightbulb,
  Pencil,
  Plus,
  Send,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { generateTextWithCloudflare } from '@/lib/cloudflareAiApi';

const emptyAtividade = {
  titulo: '',
  descricao: '',
  pontos_extras: 0,
  data_entrega: '',
  livro_id: '',
  aluno_id: '',
};

function getDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isDateTodayOrAfter(dateString) {
  if (!dateString) return true;

  const selectedDate = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(selectedDate.getTime())) return false;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return selectedDate >= today;
}

function formatDateBR(dateValue) {
  if (!dateValue) return '-';
  try {
    return format(new Date(dateValue), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return '-';
  }
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

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
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

function buildDescricaoWithForm(descricao, formulario) {
  const clean = String(descricao || '').trim();
  const perguntas = ensureArray(formulario?.perguntas);
  if (perguntas.length === 0) return clean;
  const encoded = encodeJsonBase64({ perguntas });
  return `${clean}\n\n[FORM_CONFIG_V1]${encoded}`.trim();
}

function parseAtividadeMeta(descricao) {
  const source = String(descricao || '');
  const marker = '[FORM_CONFIG_V1]';
  const idx = source.indexOf(marker);
  if (idx < 0) return { descricaoLimpa: source, formulario: null };
  const descricaoLimpa = source.slice(0, idx).trim();
  const encoded = source.slice(idx + marker.length).trim();
  const parsed = decodeJsonBase64(encoded);
  const perguntas = ensureArray(parsed?.perguntas);
  return {
    descricaoLimpa,
    formulario: perguntas.length > 0 ? { perguntas } : null,
  };
}

function parseEntregaPayload(rawText) {
  const source = String(rawText || '');
  const marker = '[ENTREGA_PAYLOAD_V1]';
  if (!source.startsWith(marker)) {
    return { texto: source, imagens: [], respostas: {} };
  }
  const parsed = decodeJsonBase64(source.slice(marker.length).trim()) || {};
  return {
    texto: String(parsed?.texto || ''),
    imagens: ensureArray(parsed?.imagens).filter((item) => typeof item === 'string'),
    respostas: parsed?.respostas && typeof parsed.respostas === 'object' ? parsed.respostas : {},
  };
}

function normalizeFormularioPerguntas(perguntasRaw) {
  return ensureArray(perguntasRaw)
    .map((item, idx) => {
      const pergunta = String(item?.pergunta || item?.enunciado || item?.question || '').trim();
      const tipoRaw = String(item?.tipo || '').trim().toLowerCase();
      const opcoesRaw = ensureArray(item?.opcoes?.length ? item.opcoes : item?.alternativas?.length ? item.alternativas : item?.options);
      const opcoes = opcoesRaw.map((op) => String(op || '').trim()).filter(Boolean).slice(0, 6);
      const tipo = tipoRaw === 'multipla_escolha' || tipoRaw === 'multipla' || opcoes.length > 0
        ? 'multipla_escolha'
        : 'texto';

      return {
        id: String(item?.id || `q_${idx + 1}`),
        pergunta,
        tipo,
        opcoes: tipo === 'multipla_escolha' ? opcoes : [],
      };
    })
    .filter((item) => item.pergunta)
    .slice(0, 8);
}

export default function PainelProfessor() {
  const { user } = useAuth();
  const { toast } = useToast();
  const minEntregaDate = useMemo(() => getDateInputValue(new Date()), []);

  const [livros, setLivros] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [sugestoes, setSugestoes] = useState([]);
  const [atividades, setAtividades] = useState([]);
  const [entregas, setEntregas] = useState([]);
  const [professorTurmasPermitidas, setProfessorTurmasPermitidas] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedAluno, setSelectedAluno] = useState('');
  const [selectedLivro, setSelectedLivro] = useState('');
  const [mensagem, setMensagem] = useState('');

  const [isSugestaoDialogOpen, setIsSugestaoDialogOpen] = useState(false);
  const [isAtividadeDialogOpen, setIsAtividadeDialogOpen] = useState(false);

  const [editingAtividade, setEditingAtividade] = useState(null);
  const [atividadeForm, setAtividadeForm] = useState(emptyAtividade);
  const [atividadeAlunoBusca, setAtividadeAlunoBusca] = useState('');
  const [atividadeLivroBusca, setAtividadeLivroBusca] = useState('');
  const [atividadeFormularioPerguntas, setAtividadeFormularioPerguntas] = useState([]);
  const [atividadeFormularioPrompt, setAtividadeFormularioPrompt] = useState('');
  const [gerandoFormularioIA, setGerandoFormularioIA] = useState(false);

  const [avaliacaoForm, setAvaliacaoForm] = useState({});
  const [submissionFeaturesEnabled, setSubmissionFeaturesEnabled] = useState(true);
  const warnedMissingFeaturesRef = useRef(false);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);

    try {
      const { data: professorData, error: professorError } = await supabase
        .from('usuarios_biblioteca')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (professorError || !professorData) throw professorError || new Error('Perfil de professor não encontrado.');

      const { data: turmasData, error: turmasError } = await supabase
        .from('professor_turmas')
        .select('turma')
        .eq('professor_id', professorData.id);
      if (turmasError) {
        if (isMissingTableError(turmasError)) {
          throw new Error('Tabela professor_turmas não encontrada. Aplique as migrations do Supabase.');
        }
        throw turmasError;
      }

      const turmasPermitidas = [...new Set(ensureArray(turmasData).map((item) => String(item?.turma || '').trim()).filter(Boolean))];
      setProfessorTurmasPermitidas(turmasPermitidas);

      if (turmasPermitidas.length === 0) {
        setUsuarios([]);
        setSugestoes([]);
        setAtividades([]);
        setEntregas([]);
        setAvaliacaoForm({});
        return;
      }

      const [livrosRes, usuariosRes, sugestoesRes, atividadesRes] = await Promise.all([
        supabase.from('livros').select('id, titulo, autor, area').order('titulo'),
        supabase
          .from('usuarios_biblioteca')
          .select('id, nome, turma')
          .eq('tipo', 'aluno')
          .in('turma', turmasPermitidas)
          .order('nome'),
        supabase
          .from('sugestoes_livros')
          .select('*, livros(titulo, autor), usuarios_biblioteca!sugestoes_livros_aluno_id_fkey(nome, turma)')
          .order('created_at', { ascending: false }),
        supabase
          .from('atividades_leitura')
          .select('*, livros(titulo, autor), usuarios_biblioteca!atividades_leitura_aluno_id_fkey(nome, turma)')
          .order('created_at', { ascending: false }),
      ]);

      const { data: entregasData, error: entregasError } = submissionFeaturesEnabled
        ? await supabase
            .from('atividades_entregas')
            .select(
              '*, atividades_leitura(titulo, descricao, pontos_extras, data_entrega, livro_id, livros(titulo, autor)), usuarios_biblioteca!atividades_entregas_aluno_id_fkey(nome, turma)',
            )
            .order('updated_at', { ascending: false })
        : { data: [], error: null };

      const firstError = [livrosRes.error, usuariosRes.error, sugestoesRes.error, atividadesRes.error].find(Boolean);
      if (firstError) throw firstError;

      if (entregasError && !isMissingTableError(entregasError)) throw entregasError;

      if (entregasError && isMissingTableError(entregasError) && !warnedMissingFeaturesRef.current) {
        warnedMissingFeaturesRef.current = true;
        setSubmissionFeaturesEnabled(false);
      }

      const turmaSet = new Set(turmasPermitidas);
      const entregasRes = (entregasData || []).filter((item) =>
        turmaSet.has(String(item?.usuarios_biblioteca?.turma || '').trim()),
      );
      const sugestoesFiltradas = (sugestoesRes.data || []).filter((item) =>
        turmaSet.has(String(item?.usuarios_biblioteca?.turma || '').trim()),
      );
      const atividadesFiltradas = (atividadesRes.data || []).filter((item) =>
        turmaSet.has(String(item?.usuarios_biblioteca?.turma || '').trim()),
      );

      setLivros(livrosRes.data || []);
      setUsuarios(usuariosRes.data || []);
      setSugestoes(sugestoesFiltradas);
      setAtividades(
        atividadesFiltradas.map((atividade) => {
          const meta = parseAtividadeMeta(atividade?.descricao);
          return {
            ...atividade,
            descricao: meta.descricaoLimpa,
            formulario: meta.formulario,
          };
        }),
      );
      setEntregas(entregasRes);

      const inicial = {};
      entregasRes.forEach((entrega) => {
        inicial[entrega.id] = {
          status: entrega.status || 'enviada',
          pontos_ganhos: Number(entrega.pontos_ganhos || 0),
          feedback_professor: entrega.feedback_professor || '',
        };
      });
      setAvaliacaoForm(inicial);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: isMissingTableError(error)
          ? 'Tabelas novas não encontradas. Aplique a migration do Supabase.'
          : error?.message || 'Falha ao carregar dados.',
      });
    } finally {
      setLoading(false);
    }
  }, [submissionFeaturesEnabled, toast, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRealtimeChange = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useRealtimeSubscription({ table: 'sugestoes_livros', onChange: onRealtimeChange });
  useRealtimeSubscription({ table: 'atividades_leitura', onChange: onRealtimeChange });
  useRealtimeSubscription({ table: submissionFeaturesEnabled ? 'atividades_entregas' : null, onChange: onRealtimeChange });
  useRealtimeSubscription({ table: 'professor_turmas', onChange: onRealtimeChange });

  const getProfessorId = async () => {
    const { data, error } = await supabase
      .from('usuarios_biblioteca')
      .select('id')
      .eq('user_id', user?.id)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Perfil de professor não encontrado.' });
      return null;
    }

    return data.id;
  };

  const handleSendSugestao = async () => {
    if (!selectedAluno || !selectedLivro) {
      toast({ variant: 'destructive', title: 'Dados incompletos', description: 'Selecione aluno e livro.' });
      return;
    }

    const professorId = await getProfessorId();
    if (!professorId) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('sugestoes_livros').insert({
        professor_id: professorId,
        aluno_id: selectedAluno,
        livro_id: selectedLivro,
        mensagem: mensagem || null,
      });
      if (error) throw error;

      toast({ title: 'Sugestão enviada!' });
      setSelectedAluno('');
      setSelectedLivro('');
      setMensagem('');
      setIsSugestaoDialogOpen(false);
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao enviar sugestão.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSugestao = async (id) => {
    if (!window.confirm('Excluir esta sugestão?')) return;

    try {
      const { error } = await supabase.from('sugestoes_livros').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Sugestão excluída.' });
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao excluir.' });
    }
  };

  const handleOpenAtividadeDialog = (atividade = null) => {
    if (atividade) {
      const meta = parseAtividadeMeta(atividade.descricao);
      setEditingAtividade(atividade);
      setAtividadeForm({
        titulo: atividade.titulo,
        descricao: meta.descricaoLimpa || '',
        pontos_extras: Number(atividade.pontos_extras || 0),
        data_entrega: atividade.data_entrega ? atividade.data_entrega.split('T')[0] : '',
        livro_id: atividade.livro_id,
        aluno_id: atividade.aluno_id,
      });
      setAtividadeFormularioPerguntas(ensureArray(meta.formulario?.perguntas));
    } else {
      setEditingAtividade(null);
      setAtividadeForm(emptyAtividade);
      setAtividadeFormularioPerguntas([]);
    }
    setAtividadeAlunoBusca('');
    setAtividadeLivroBusca('');
    setAtividadeFormularioPrompt('');

    setIsAtividadeDialogOpen(true);
  };

  const handleAdicionarPerguntaFormulario = () => {
    setAtividadeFormularioPerguntas((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        pergunta: '',
        tipo: 'texto',
        opcoes: [],
      },
    ]);
  };

  const handleGerarFormularioIA = async () => {
    if (!atividadeForm.titulo.trim()) {
      toast({
        variant: 'destructive',
        title: 'Informe o título',
        description: 'Preencha o título da atividade para gerar um formulário com IA.',
      });
      return;
    }

    setGerandoFormularioIA(true);
    try {
      const promptBase = atividadeFormularioPrompt.trim() || atividadeForm.descricao || atividadeForm.titulo;
      const ia = await generateTextWithCloudflare({
        prompt: [
          'Crie um formulário escolar em português para esta atividade.',
          'Responda SOMENTE com JSON válido no formato:',
          '{"perguntas":[{"id":"q1","pergunta":"...","tipo":"texto|multipla_escolha","opcoes":["..."]}]}',
          'Crie de 3 a 6 perguntas objetivas e úteis.',
          `Atividade: ${atividadeForm.titulo}`,
          `Contexto: ${promptBase}`,
        ].join('\n'),
        fallbackErrorMessage: 'Não foi possível gerar formulário com IA.',
      });

      const perguntasRaw = ensureArray(ia?.data?.perguntas);
      const perguntas = normalizeFormularioPerguntas(perguntasRaw);

      if (perguntas.length === 0) {
        throw new Error('A IA não retornou perguntas válidas.');
      }

      setAtividadeFormularioPerguntas(perguntas);
      toast({ title: 'Formulário gerado com IA!' });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar formulário',
        description: error?.message || 'Não foi possível gerar o formulário com IA.',
      });
    } finally {
      setGerandoFormularioIA(false);
    }
  };

  const handleSaveAtividade = async () => {
    if (!atividadeForm.titulo.trim() || !atividadeForm.aluno_id || !atividadeForm.livro_id) {
      toast({ variant: 'destructive', title: 'Campos obrigatórios', description: 'Preencha título, aluno e livro.' });
      return;
    }

    if (!isDateTodayOrAfter(atividadeForm.data_entrega)) {
      toast({
        variant: 'destructive',
        title: 'Data inválida',
        description: 'A data de entrega deve ser hoje ou uma data futura.',
      });
      return;
    }

    const perguntasNormalizadas = normalizeFormularioPerguntas(atividadeFormularioPerguntas);
    const perguntasInvalidas = perguntasNormalizadas.some(
      (item) => item.tipo === 'multipla_escolha' && ensureArray(item.opcoes).length < 2,
    );
    if (perguntasInvalidas) {
      toast({
        variant: 'destructive',
        title: 'Perguntas incompletas',
        description: 'Cada pergunta de múltipla escolha precisa ter pelo menos 2 opções.',
      });
      return;
    }

    const professorId = await getProfessorId();
    if (!professorId) return;

    setSaving(true);
    try {
      const payload = {
        titulo: atividadeForm.titulo.trim(),
        descricao:
          buildDescricaoWithForm(atividadeForm.descricao || null, { perguntas: perguntasNormalizadas }) || null,
        pontos_extras: Number(atividadeForm.pontos_extras || 0),
        data_entrega: atividadeForm.data_entrega ? new Date(atividadeForm.data_entrega).toISOString() : null,
        livro_id: atividadeForm.livro_id,
        aluno_id: atividadeForm.aluno_id,
        professor_id: professorId,
      };

      if (editingAtividade) {
        const { error } = await supabase.from('atividades_leitura').update(payload).eq('id', editingAtividade.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('atividades_leitura').insert(payload);
        if (error) throw error;
      }

      toast({ title: editingAtividade ? 'Atividade atualizada' : 'Atividade criada' });
      setIsAtividadeDialogOpen(false);
      setEditingAtividade(null);
      setAtividadeForm(emptyAtividade);
      setAtividadeFormularioPerguntas([]);
      setAtividadeFormularioPrompt('');
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao salvar atividade.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAtividade = async (id) => {
    if (!window.confirm('Excluir esta atividade?')) return;

    try {
      const { error } = await supabase.from('atividades_leitura').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Atividade excluída.' });
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao excluir atividade.' });
    }
  };

  const handleSalvarAvaliacaoEntrega = async (entrega) => {
    const data = avaliacaoForm[entrega.id] || {};

    setSaving(true);
    try {
      const payload = {
        status: data.status || 'enviada',
        pontos_ganhos: Number(data.pontos_ganhos || 0),
        feedback_professor: data.feedback_professor || null,
        avaliado_em: new Date().toISOString(),
      };

      const { error } = await supabase.from('atividades_entregas').update(payload).eq('id', entrega.id);
      if (error) throw error;

      const novoStatusAtividade = payload.status === 'aprovada' ? 'concluido' : 'em_andamento';
      await supabase.from('atividades_leitura').update({ status: novoStatusAtividade }).eq('id', entrega.atividade_id);

      toast({ title: 'Avaliação salva', description: 'Pontos e feedback atualizados para o aluno.' });
      await fetchData();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: isMissingTableError(error)
          ? 'Avaliação de entrega indisponível: aplique a migration do banco.'
          : error?.message || 'Falha ao avaliar entrega.',
      });
    } finally {
      setSaving(false);
    }
  };

  const entregasPendentes = useMemo(() => entregas.filter((e) => e.status !== 'aprovada').length, [entregas]);
  const pontosDistribuidos = useMemo(
    () => entregas.filter((e) => e.status === 'aprovada').reduce((acc, e) => acc + Number(e.pontos_ganhos || 0), 0),
    [entregas],
  );
  const alunosFiltradosAtividade = useMemo(() => {
    const termo = String(atividadeAlunoBusca || '').trim().toLowerCase();
    if (!termo) return usuarios;
    return usuarios.filter((u) => String(u?.nome || '').toLowerCase().includes(termo));
  }, [atividadeAlunoBusca, usuarios]);
  const livrosFiltradosAtividade = useMemo(() => {
    const termo = String(atividadeLivroBusca || '').trim().toLowerCase();
    if (!termo) return livros;
    return livros.filter((l) => String(l?.titulo || '').toLowerCase().includes(termo));
  }, [atividadeLivroBusca, livros]);

  return (
    <MainLayout title="Painel do Professor">
      <div className="space-y-4 sm:space-y-6">
        {professorTurmasPermitidas.length === 0 && (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
            <p className="text-sm text-warning">
              Você ainda não possui turmas vinculadas. Peça ao gestor para liberar suas turmas.
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4 sm:gap-4">
          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Lightbulb className="size-5 sm:size-6 text-primary" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Sugestões enviadas</p>
                  <p className="text-xl sm:text-2xl font-bold">{sugestoes.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-info/10 flex items-center justify-center">
                  <ClipboardList className="size-5 sm:size-6 text-info" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Atividades criadas</p>
                  <p className="text-xl sm:text-2xl font-bold">{atividades.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Sparkles className="size-5 sm:size-6 text-warning" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Entregas para avaliar</p>
                  <p className="text-xl sm:text-2xl font-bold">{entregasPendentes}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-6">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="h-10 w-10 sm:h-12 sm:w-12 rounded-lg bg-success/10 flex items-center justify-center">
                  <Star className="size-5 sm:size-6 text-success" />
                </div>
                <div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Pontos já liberados</p>
                  <p className="text-xl sm:text-2xl font-bold">{pontosDistribuidos}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="atividades">
          <TabsList className="w-full justify-start overflow-x-auto whitespace-nowrap px-1 py-1">
            <TabsTrigger value="atividades" className="gap-1.5 shrink-0">
              <ClipboardList className="w-4 h-4" /> <span className="hidden sm:inline">Atividades</span><span className="sm:hidden">Ativ.</span>
            </TabsTrigger>
            <TabsTrigger value="entregas" className="gap-1.5 shrink-0">
              <CheckCircle className="w-4 h-4" /> <span className="hidden sm:inline">Entregas dos alunos</span><span className="sm:hidden">Entregas</span>
            </TabsTrigger>
            <TabsTrigger value="sugestoes" className="gap-1.5 shrink-0">
              <Lightbulb className="w-4 h-4" /> Sugestões
            </TabsTrigger>
          </TabsList>

          <TabsContent value="atividades">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <CardTitle className="text-base">Criar e gerenciar atividades</CardTitle>
                  <Button onClick={() => handleOpenAtividadeDialog()}>
                    <Plus className="w-4 h-4 mr-2" /> Nova atividade
                  </Button>
                  <Dialog open={isAtividadeDialogOpen} onOpenChange={setIsAtividadeDialogOpen}>
                    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" translate="no">
                      <DialogHeader>
                        <DialogTitle>{editingAtividade ? 'Editar atividade' : 'Nova atividade'}</DialogTitle>
                        <DialogDescription>Defina tarefa, livro, prazo e pontuação.</DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Título *</Label>
                          <Input
                            value={atividadeForm.titulo}
                            onChange={(e) => setAtividadeForm((prev) => ({ ...prev, titulo: e.target.value }))}
                            placeholder="Ex: Resenha crítica do livro"
                          />
                        </div>

                        <div className="space-y-2">
                          <Label>Descrição</Label>
                          <Textarea
                            rows={3}
                            value={atividadeForm.descricao}
                            onChange={(e) => setAtividadeForm((prev) => ({ ...prev, descricao: e.target.value }))}
                            placeholder="Instruções para o aluno"
                          />
                        </div>

                        <div className="space-y-3 rounded-md border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <Label className="text-sm">Formulário da atividade (manual ou IA)</Label>
                            <Button type="button" size="sm" variant="outline" onClick={handleAdicionarPerguntaFormulario}>
                              <Plus className="w-3.5 h-3.5 mr-1" /> Pergunta
                            </Button>
                          </div>

                          <div className="flex flex-col sm:flex-row gap-2">
                            <Input
                              placeholder="Tema para IA (opcional): interpretação de texto, revisão do capítulo..."
                              value={atividadeFormularioPrompt}
                              onChange={(e) => setAtividadeFormularioPrompt(e.target.value)}
                            />
                            <Button type="button" variant="outline" onClick={handleGerarFormularioIA} disabled={gerandoFormularioIA}>
                              <Sparkles className="w-4 h-4 mr-1.5" />
                              {gerandoFormularioIA ? 'Gerando...' : 'Gerar com IA'}
                            </Button>
                          </div>

                          {atividadeFormularioPerguntas.length === 0 ? (
                            <p className="text-xs text-muted-foreground">Sem perguntas no formulário. Você pode manter atividade aberta (texto/imagem) ou adicionar perguntas.</p>
                          ) : (
                            <div className="space-y-2">
                              {atividadeFormularioPerguntas.map((pergunta, idx) => (
                                <div key={pergunta.id || idx} className="rounded-md border p-2 space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-medium">Pergunta {idx + 1}</p>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-7 w-7"
                                      onClick={() =>
                                        setAtividadeFormularioPerguntas((prev) => prev.filter((_, i) => i !== idx))
                                      }
                                    >
                                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                    </Button>
                                  </div>
                                  <Input
                                    placeholder="Digite a pergunta"
                                    value={String(pergunta.pergunta || '')}
                                    onChange={(e) =>
                                      setAtividadeFormularioPerguntas((prev) =>
                                        prev.map((item, i) => (i === idx ? { ...item, pergunta: e.target.value } : item)),
                                      )
                                    }
                                  />
                                  <select
                                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                    value={String(pergunta.tipo || 'texto')}
                                    onChange={(e) =>
                                      setAtividadeFormularioPerguntas((prev) =>
                                        prev.map((item, i) =>
                                          i === idx
                                            ? {
                                                ...item,
                                                tipo: e.target.value === 'multipla_escolha' ? 'multipla_escolha' : 'texto',
                                                opcoes: e.target.value === 'multipla_escolha' ? ensureArray(item.opcoes) : [],
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                  >
                                    <option value="texto">Resposta aberta</option>
                                    <option value="multipla_escolha">Múltipla escolha</option>
                                  </select>
                                  {String(pergunta.tipo) === 'multipla_escolha' && (
                                    <div className="space-y-2">
                                      {ensureArray(pergunta.opcoes).map((opcao, optionIdx) => (
                                        <div key={`${pergunta.id || idx}-${optionIdx}`} className="flex items-center gap-2">
                                          <Input
                                            placeholder={`Opção ${optionIdx + 1}`}
                                            value={String(opcao || '')}
                                            onChange={(e) =>
                                              setAtividadeFormularioPerguntas((prev) =>
                                                prev.map((item, i) => {
                                                  if (i !== idx) return item;
                                                  const nextOpcoes = ensureArray(item.opcoes).map((opt, oi) =>
                                                    oi === optionIdx ? e.target.value : opt,
                                                  );
                                                  return { ...item, opcoes: nextOpcoes };
                                                }),
                                              )
                                            }
                                          />
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-8 w-8"
                                            onClick={() =>
                                              setAtividadeFormularioPerguntas((prev) =>
                                                prev.map((item, i) =>
                                                  i === idx
                                                    ? {
                                                        ...item,
                                                        opcoes: ensureArray(item.opcoes).filter((_, oi) => oi !== optionIdx),
                                                      }
                                                    : item,
                                                ),
                                              )
                                            }
                                          >
                                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                                          </Button>
                                        </div>
                                      ))}
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="outline"
                                        onClick={() =>
                                          setAtividadeFormularioPerguntas((prev) =>
                                            prev.map((item, i) =>
                                              i === idx
                                                ? { ...item, opcoes: [...ensureArray(item.opcoes), ''].slice(0, 6) }
                                                : item,
                                            ),
                                          )
                                        }
                                        disabled={ensureArray(pergunta.opcoes).length >= 6}
                                      >
                                        <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar opção
                                      </Button>
                                      <p className="text-[11px] text-muted-foreground">
                                        Adicione de 2 a 6 opções para cada pergunta.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Aluno *</Label>
                            <Input
                              placeholder="Buscar aluno por nome"
                              value={atividadeAlunoBusca}
                              onChange={(e) => setAtividadeAlunoBusca(e.target.value)}
                            />
                            <select
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={atividadeForm.aluno_id || 'none'}
                              onChange={(e) =>
                                setAtividadeForm((prev) => ({
                                  ...prev,
                                  aluno_id: e.target.value === 'none' ? '' : e.target.value,
                                }))
                              }
                            >
                              <option value="none">Selecione</option>
                              {alunosFiltradosAtividade.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.nome} {u.turma ? `(${u.turma})` : ''}
                                </option>
                              ))}
                            </select>
                            {atividadeAlunoBusca && alunosFiltradosAtividade.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Nenhum aluno encontrado para essa busca.</p>
                            ) : null}
                          </div>

                          <div className="space-y-2">
                            <Label>Livro *</Label>
                            <Input
                              placeholder="Buscar livro por título"
                              value={atividadeLivroBusca}
                              onChange={(e) => setAtividadeLivroBusca(e.target.value)}
                            />
                            <select
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={atividadeForm.livro_id || 'none'}
                              onChange={(e) =>
                                setAtividadeForm((prev) => ({
                                  ...prev,
                                  livro_id: e.target.value === 'none' ? '' : e.target.value,
                                }))
                              }
                            >
                              <option value="none">Selecione</option>
                              {livrosFiltradosAtividade.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.titulo}
                                </option>
                              ))}
                            </select>
                            {atividadeLivroBusca && livrosFiltradosAtividade.length === 0 ? (
                              <p className="text-xs text-muted-foreground">Nenhum livro encontrado para essa busca.</p>
                            ) : null}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Pontos</Label>
                            <Input
                              type="number"
                              min="0"
                              value={atividadeForm.pontos_extras}
                              onChange={(e) =>
                                setAtividadeForm((prev) => ({
                                  ...prev,
                                  pontos_extras: Number(e.target.value || 0),
                                }))
                              }
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Data de entrega</Label>
                            <Input
                              type="date"
                              min={minEntregaDate}
                              value={atividadeForm.data_entrega}
                              onChange={(e) => setAtividadeForm((prev) => ({ ...prev, data_entrega: e.target.value }))}
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsAtividadeDialogOpen(false)}>
                          Cancelar
                        </Button>
                        <Button onClick={handleSaveAtividade} disabled={saving}>
                          {saving ? 'Salvando...' : 'Salvar'}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>

              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-8">Carregando...</p>
                ) : atividades.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhuma atividade cadastrada.</p>
                ) : (
                  <>
                    <div className="space-y-3 md:hidden">
                      {atividades.map((atividade) => (
                        <div key={atividade.id} className="rounded-lg border p-3 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-medium">{atividade.titulo}</p>
                              <p className="text-xs text-muted-foreground">{atividade.usuarios_biblioteca?.nome || '-'} • {atividade.livros?.titulo || '-'}</p>
                            </div>
                            <Badge
                              variant={
                                atividade.status === 'concluido'
                                  ? 'default'
                                  : atividade.status === 'em_andamento'
                                    ? 'secondary'
                                    : 'outline'
                              }
                            >
                              {atividade.status}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Pontos: {Number(atividade.pontos_extras || 0)} • Entrega: {formatDateBR(atividade.data_entrega)}
                          </div>
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenAtividadeDialog(atividade)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDeleteAtividade(atividade.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="hidden md:block overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Atividade</TableHead>
                          <TableHead>Aluno</TableHead>
                          <TableHead>Livro</TableHead>
                          <TableHead>Pontos</TableHead>
                          <TableHead>Entrega</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {atividades.map((atividade) => (
                          <TableRow key={atividade.id}>
                            <TableCell className="font-medium">{atividade.titulo}</TableCell>
                            <TableCell>{atividade.usuarios_biblioteca?.nome || '-'}</TableCell>
                            <TableCell>{atividade.livros?.titulo || '-'}</TableCell>
                            <TableCell>{Number(atividade.pontos_extras || 0)}</TableCell>
                            <TableCell>{formatDateBR(atividade.data_entrega)}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  atividade.status === 'concluido'
                                    ? 'default'
                                    : atividade.status === 'em_andamento'
                                      ? 'secondary'
                                      : 'outline'
                                }
                              >
                                {atividade.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" onClick={() => handleOpenAtividadeDialog(atividade)}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteAtividade(atividade.id)}>
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="entregas">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Revisar entregas dos alunos</CardTitle>
              </CardHeader>

              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-8">Carregando...</p>
                ) : entregas.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Ainda não há entregas enviadas.</p>
                ) : (
                  <div className="space-y-4">
                    {entregas.map((entrega) => {
                      const entregaPayload = parseEntregaPayload(entrega.texto_entrega);
                      const atividadeMetaEntrega = parseAtividadeMeta(entrega.atividades_leitura?.descricao);
                      const labelByPerguntaId = new Map(
                        ensureArray(atividadeMetaEntrega.formulario?.perguntas).map((pergunta, idx) => [
                          String(pergunta?.id || `q_${idx + 1}`),
                          String(pergunta?.pergunta || `Pergunta ${idx + 1}`),
                        ]),
                      );
                      const form = avaliacaoForm[entrega.id] || {
                        status: entrega.status || 'enviada',
                        pontos_ganhos: Number(entrega.pontos_ganhos || 0),
                        feedback_professor: entrega.feedback_professor || '',
                      };

                      return (
                        <div key={entrega.id} className="p-4 border rounded-lg space-y-3">
                          <div className="flex flex-col gap-2 sm:flex-row sm:justify-between sm:items-start">
                            <div>
                              <p className="font-semibold">{entrega.atividades_leitura?.titulo || 'Atividade'}</p>
                              <p className="text-xs text-muted-foreground">
                                {entrega.usuarios_biblioteca?.nome || 'Aluno'}
                                {entrega.usuarios_biblioteca?.turma ? ` (${entrega.usuarios_biblioteca.turma})` : ''}
                                {' • '}
                                {entrega.atividades_leitura?.livros?.titulo || '-'}
                              </p>
                            </div>
                            <div className="sm:text-right">
                              <Badge variant="outline">Enviado: {formatDateBR(entrega.enviado_em)}</Badge>
                            </div>
                          </div>

                          <div className="p-3 bg-muted rounded-md">
                            <p className="text-xs text-muted-foreground mb-1">Resposta do aluno</p>
                            <p className="text-sm whitespace-pre-wrap">{entregaPayload.texto || 'Sem texto.'}</p>
                          </div>

                          {Object.keys(entregaPayload.respostas || {}).length > 0 && (
                            <div className="rounded-md border p-3">
                              <p className="text-xs text-muted-foreground mb-1">Respostas do formulário</p>
                              <div className="space-y-1">
                                {Object.entries(entregaPayload.respostas).map(([perguntaId, resposta]) => (
                                  <p key={perguntaId} className="text-sm">
                                    <span className="font-medium">{labelByPerguntaId.get(perguntaId) || perguntaId}:</span> {String(resposta || '-')}
                                  </p>
                                ))}
                              </div>
                            </div>
                          )}

                          {entregaPayload.imagens.length > 0 && (
                            <div className="rounded-md border p-3">
                              <p className="text-xs text-muted-foreground mb-2">Imagens enviadas ({entregaPayload.imagens.length})</p>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {entregaPayload.imagens.map((img, idx) => (
                                  <a key={`${entrega.id}-img-${idx}`} href={img} target="_blank" rel="noreferrer">
                                    <img src={img} alt={`Entrega ${idx + 1}`} className="w-full h-24 object-cover rounded-md border" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div className="space-y-2">
                              <Label>Status</Label>
                              <Select
                                value={form.status}
                                onValueChange={(value) =>
                                  setAvaliacaoForm((prev) => ({
                                    ...prev,
                                    [entrega.id]: { ...form, status: value },
                                  }))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="enviada">Enviada</SelectItem>
                                  <SelectItem value="em_revisao">Em revisão</SelectItem>
                                  <SelectItem value="revisar">Pedir revisão</SelectItem>
                                  <SelectItem value="aprovada">Aprovada</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label>Pontos ganhos</Label>
                              <Input
                                type="number"
                                min="0"
                                max={Number(entrega.atividades_leitura?.pontos_extras || 0)}
                                value={form.pontos_ganhos}
                                onChange={(e) =>
                                  setAvaliacaoForm((prev) => ({
                                    ...prev,
                                    [entrega.id]: { ...form, pontos_ganhos: Number(e.target.value || 0) },
                                  }))
                                }
                              />
                            </div>

                            <div className="space-y-2">
                              <Label>Pontos máximos</Label>
                              <Input value={Number(entrega.atividades_leitura?.pontos_extras || 0)} disabled />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Feedback</Label>
                            <Textarea
                              rows={2}
                              value={form.feedback_professor}
                              onChange={(e) =>
                                setAvaliacaoForm((prev) => ({
                                  ...prev,
                                  [entrega.id]: { ...form, feedback_professor: e.target.value },
                                }))
                              }
                              placeholder="Comentário para orientar o aluno"
                            />
                          </div>

                          <div className="flex justify-end">
                            <Button onClick={() => handleSalvarAvaliacaoEntrega(entrega)} disabled={saving}>
                              <CheckCircle className="w-4 h-4 mr-2" /> Salvar avaliação
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

          <TabsContent value="sugestoes">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <CardTitle className="text-base">Sugestões de livros para alunos</CardTitle>

                  <Dialog open={isSugestaoDialogOpen} onOpenChange={setIsSugestaoDialogOpen}>
                    <DialogContent className="max-w-lg" translate="no">
                      <DialogHeader>
                        <DialogTitle>Enviar sugestão</DialogTitle>
                        <DialogDescription>Indique um livro com mensagem personalizada.</DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Aluno *</Label>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={selectedAluno || 'none'}
                            onChange={(e) => setSelectedAluno(e.target.value === 'none' ? '' : e.target.value)}
                          >
                            <option value="none">Selecione</option>
                            {usuarios.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.nome} {u.turma ? `(${u.turma})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label>Livro *</Label>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={selectedLivro || 'none'}
                            onChange={(e) => setSelectedLivro(e.target.value === 'none' ? '' : e.target.value)}
                          >
                            <option value="none">Selecione</option>
                            {livros.map((l) => (
                              <option key={l.id} value={l.id}>
                                {l.titulo}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label>Mensagem</Label>
                          <Textarea
                            rows={3}
                            value={mensagem}
                            onChange={(e) => setMensagem(e.target.value)}
                            placeholder="Ex: Foque no capítulo 2 para a atividade da semana"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsSugestaoDialogOpen(false)}>
                          Cancelar
                        </Button>
                        <Button onClick={handleSendSugestao} disabled={saving}>
                          {saving ? 'Enviando...' : 'Enviar'}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button onClick={() => setIsSugestaoDialogOpen(true)}>
                    <Send className="w-4 h-4 mr-2" /> Nova sugestão
                  </Button>
                </div>
              </CardHeader>

              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-8">Carregando...</p>
                ) : sugestoes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhuma sugestão enviada.</p>
                ) : (
                  <div className="space-y-3">
                    {sugestoes.map((s) => (
                      <div key={s.id} className="p-3 border rounded-lg flex items-start justify-between gap-3">
                        <div>
                          <p className="font-medium">{s.livros?.titulo || '-'}</p>
                          <p className="text-xs text-muted-foreground">
                            Para: {s.usuarios_biblioteca?.nome || '-'} {s.usuarios_biblioteca?.turma ? `(${s.usuarios_biblioteca.turma})` : ''}
                          </p>
                          {s.mensagem && <p className="text-sm mt-1 text-muted-foreground italic">"{s.mensagem}"</p>}
                          <p className="text-xs text-muted-foreground mt-1">{formatDateBR(s.created_at)}</p>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => handleDeleteSugestao(s.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </MainLayout>
  );
}
