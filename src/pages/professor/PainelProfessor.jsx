import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle,
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
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

  return {
    id: String(rawQuestion?.id || `q_${index + 1}`),
    tipo,
    pergunta: String(rawQuestion?.pergunta || ''),
    opcoes: tipo === 'multipla_escolha' ? (opcoes.length >= 2 ? opcoes : ['', '']) : ['', ''],
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

export default function PainelProfessor() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
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

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
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
      setLoading(false);
    }
  }, [toast, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const interval = window.setInterval(fetchData, 30000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
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
  };

  const handleOpenAtividadeDialog = (atividade = null) => {
    if (!atividade) {
      resetAtividadeDialog();
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
        return { ...question, opcoes: nextOptions };
      }),
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
        return { ...question, opcoes: nextOptions.length >= 2 ? nextOptions : ['', ''] };
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
      setSelectedAluno('');
      setSelectedLivro('');
      setMensagem('');
      setIsSugestaoDialogOpen(false);
      toast({ title: 'Sugestão enviada!' });
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao enviar sugestão.' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAtividade = async () => {
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
        return question.opcoes.map((item) => String(item || '').trim()).filter(Boolean).length < 2;
      });

      if (perguntasInvalidas) {
        toast({
          variant: 'destructive',
          title: 'Formulário incompleto',
          description: 'Preencha todas as perguntas e deixe ao menos 2 opções nas questões de marcar.',
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

    try {
      if (deleteTarget.kind === 'atividade') {
        await deleteProfessorAtividade(deleteTarget.id);
      } else {
        await deleteProfessorSugestão(deleteTarget.id);
      }
      setDeleteTarget(null);
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao excluir item.' });
    }
  };

  return (
    <MainLayout title="Painel do Professor">
      <div className="space-y-6">
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
          <TabsList className="w-full justify-start overflow-x-auto whitespace-nowrap px-1 py-1">
            <TabsTrigger value="atividades">Atividades</TabsTrigger>
            <TabsTrigger value="entregas">Entregas</TabsTrigger>
            <TabsTrigger value="sugestoes">Sugestões</TabsTrigger>
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
                    <CardTitle className="text-2xl">Monte tarefas do seu jeito</CardTitle>
                    <p className="max-w-2xl text-sm text-muted-foreground">
                      Crie atividades com perguntas abertas ou de marcar, escolha uma turma específica, um aluno
                      ou envie para todas as turmas liberadas.
                    </p>
                  </div>
                  <Button
                    size="lg"
                    className="rounded-2xl px-5 shadow-[0_16px_35px_rgba(0,0,0,0.12)] transition-transform hover:-translate-y-0.5"
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
                        className="rounded-2xl border bg-card/80 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_16px_30px_rgba(0,0,0,0.06)] animate-in fade-in-0 slide-in-from-bottom-2"
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

                          <div className="flex items-center gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenAtividadeDialog(atividade)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
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
                      <div key={entrega.id} className="rounded-2xl border p-4 space-y-3">
                        <div>
                          <p className="font-medium">{entrega.atividades_leitura?.titulo || 'Atividade'}</p>
                          <p className="text-sm text-muted-foreground">
                            {entrega.usuarios_biblioteca?.nome || 'Aluno'} • {entrega.usuarios_biblioteca?.turma || '-'}
                          </p>
                        </div>

                        <div className="grid gap-3 md:grid-cols-3">
                          <div className="space-y-2">
                            <Label>Status</Label>
                            <Select
                              value={state.status}
                              onValueChange={(value) => setAvaliacaoForm((prev) => ({
                                ...prev,
                                [entrega.id]: { ...prev[entrega.id], status: value },
                              }))}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
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
                              rows={2}
                              value={state.feedback_professor || ''}
                              onChange={(e) => setAvaliacaoForm((prev) => ({
                                ...prev,
                                [entrega.id]: { ...prev[entrega.id], feedback_professor: e.target.value },
                              }))}
                            />
                          </div>
                        </div>

                        <Button onClick={() => handleAvaliarEntrega(entrega)} disabled={saving}>
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

        <Dialog open={isSugestaoDialogOpen} onOpenChange={setIsSugestaoDialogOpen}>
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
            if (!open) resetAtividadeDialog();
          }}
        >
          <DialogContent className="max-w-5xl overflow-hidden p-0">
            <div className="grid gap-0 lg:grid-cols-[minmax(0,1.35fr)_340px]">
              <div className="p-6 sm:p-7">
                <DialogHeader className="space-y-2 text-left">
                  <DialogTitle className="text-2xl">
                    {editingAtividade ? 'Editar atividade' : 'Criar atividade personalizada'}
                  </DialogTitle>
                  <DialogDescription>
                    Monte questões próprias, escolha o destino e envie tudo com uma interface mais guiada.
                  </DialogDescription>
                </DialogHeader>

                <div className="mt-6 space-y-6">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
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
                              <div className="flex items-center gap-2">
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
                                <div className="grid gap-2 sm:grid-cols-2">
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
                                  <Label>Opções</Label>
                                  {question.opcoes.map((option, optionIndex) => (
                                    <div key={`${question.id}-${optionIndex}`} className="flex items-center gap-2">
                                      <Input
                                        value={option}
                                        placeholder={`Opção ${optionIndex + 1}`}
                                        onChange={(e) => handleQuestionOptionChange(question.id, optionIndex, e.target.value)}
                                      />
                                      {question.opcoes.length > 2 && (
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          size="icon"
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

                  <div className="grid gap-4 md:grid-cols-2">
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

                    <div className="mt-4 grid gap-3 md:grid-cols-3">
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
                          <Select
                            value={atividadeForm.aluno_id || ''}
                            onValueChange={(value) => setAtividadeForm((prev) => ({ ...prev, aluno_id: value }))}
                          >
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

              <aside className="border-l bg-muted/30 p-6">
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

                  <div className="rounded-3xl border bg-background p-4">
                    <p className="text-sm font-medium">O que o aluno verá</p>
                    <div className="mt-3 space-y-2">
                      <div className="rounded-2xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm text-primary">
                        Uma atividade com instruções claras e botão de envio.
                      </div>
                      <div className="rounded-2xl border border-info/20 bg-info/5 px-3 py-2 text-sm text-info">
                        Questões abertas ou de marcar, conforme você definiu.
                      </div>
                      <div className="rounded-2xl border border-warning/20 bg-warning/5 px-3 py-2 text-sm text-warning">
                        Espaço para escrever, anexar imagens e receber feedback.
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 pt-2">
                    <Button onClick={handleSaveAtividade} disabled={saving} className="rounded-2xl">
                      {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingAtividade ? 'Salvar alterações' : 'Publicar atividade'}
                    </Button>
                    <Button variant="outline" onClick={() => setIsAtividadeDialogOpen(false)} className="rounded-2xl">
                      Cancelar
                    </Button>
                  </div>
                </div>
              </aside>
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
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={handleDeleteTarget} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}
