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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

const emptyAtividade = {
  titulo: '',
  descricao: '',
  pontos_extras: 0,
  data_entrega: '',
  livro_id: '',
  aluno_id: '',
};

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

export default function PainelProfessor() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [livros, setLivros] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [sugestoes, setSugestoes] = useState([]);
  const [atividades, setAtividades] = useState([]);
  const [entregas, setEntregas] = useState([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [selectedAluno, setSelectedAluno] = useState('');
  const [selectedLivro, setSelectedLivro] = useState('');
  const [mensagem, setMensagem] = useState('');

  const [isSugestaoDialogOpen, setIsSugestaoDialogOpen] = useState(false);
  const [isAtividadeDialogOpen, setIsAtividadeDialogOpen] = useState(false);

  const [editingAtividade, setEditingAtividade] = useState(null);
  const [atividadeForm, setAtividadeForm] = useState(emptyAtividade);

  const [avaliacaoForm, setAvaliacaoForm] = useState({});
  const [submissionFeaturesEnabled, setSubmissionFeaturesEnabled] = useState(true);
  const warnedMissingFeaturesRef = useRef(false);

  const fetchData = useCallback(async () => {
    setLoading(true);

    try {
      const [livrosRes, usuariosRes, sugestoesRes, atividadesRes] = await Promise.all([
        supabase.from('livros').select('id, titulo, autor, area').order('titulo'),
        supabase.from('usuarios_biblioteca').select('id, nome, turma').eq('tipo', 'aluno').order('nome'),
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
              '*, atividades_leitura(titulo, pontos_extras, data_entrega, livro_id, livros(titulo, autor)), usuarios_biblioteca!atividades_entregas_aluno_id_fkey(nome, turma)',
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

      const entregasRes = entregasData || [];

      setLivros(livrosRes.data || []);
      setUsuarios(usuariosRes.data || []);
      setSugestoes(sugestoesRes.data || []);
      setAtividades(atividadesRes.data || []);
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
  }, [submissionFeaturesEnabled, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const onRealtimeChange = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useRealtimeSubscription({ table: 'sugestoes_livros', onChange: onRealtimeChange });
  useRealtimeSubscription({ table: 'atividades_leitura', onChange: onRealtimeChange });
  useRealtimeSubscription({ table: submissionFeaturesEnabled ? 'atividades_entregas' : null, onChange: onRealtimeChange });

  const getProfessorId = async () => {
    const { data, error } = await supabase
      .from('usuarios_biblioteca')
      .select('id')
      .eq('user_id', user?.id)
      .single();

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
      setEditingAtividade(atividade);
      setAtividadeForm({
        titulo: atividade.titulo,
        descricao: atividade.descricao || '',
        pontos_extras: Number(atividade.pontos_extras || 0),
        data_entrega: atividade.data_entrega ? atividade.data_entrega.split('T')[0] : '',
        livro_id: atividade.livro_id,
        aluno_id: atividade.aluno_id,
      });
    } else {
      setEditingAtividade(null);
      setAtividadeForm(emptyAtividade);
    }

    setIsAtividadeDialogOpen(true);
  };

  const handleSaveAtividade = async () => {
    if (!atividadeForm.titulo.trim() || !atividadeForm.aluno_id || !atividadeForm.livro_id) {
      toast({ variant: 'destructive', title: 'Campos obrigatórios', description: 'Preencha título, aluno e livro.' });
      return;
    }

    const professorId = await getProfessorId();
    if (!professorId) return;

    setSaving(true);
    try {
      const payload = {
        titulo: atividadeForm.titulo.trim(),
        descricao: atividadeForm.descricao || null,
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

  return (
    <MainLayout title="Painel do Professor">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Lightbulb className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sugestões enviadas</p>
                  <p className="text-2xl font-bold">{sugestoes.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-info/10 flex items-center justify-center">
                  <ClipboardList className="w-6 h-6 text-info" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Atividades criadas</p>
                  <p className="text-2xl font-bold">{atividades.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Entregas para avaliar</p>
                  <p className="text-2xl font-bold">{entregasPendentes}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
                  <Star className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pontos já liberados</p>
                  <p className="text-2xl font-bold">{pontosDistribuidos}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="atividades">
          <TabsList className="flex-wrap">
            <TabsTrigger value="atividades" className="gap-1">
              <ClipboardList className="w-4 h-4" /> Atividades
            </TabsTrigger>
            <TabsTrigger value="entregas" className="gap-1">
              <CheckCircle className="w-4 h-4" /> Entregas dos alunos
            </TabsTrigger>
            <TabsTrigger value="sugestoes" className="gap-1">
              <Lightbulb className="w-4 h-4" /> Sugestões
            </TabsTrigger>
          </TabsList>

          <TabsContent value="atividades">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <CardTitle className="text-base">Criar e gerenciar atividades</CardTitle>
                  <Dialog open={isAtividadeDialogOpen} onOpenChange={setIsAtividadeDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={() => handleOpenAtividadeDialog()}>
                        <Plus className="w-4 h-4 mr-2" /> Nova atividade
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
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

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>Aluno *</Label>
                            <Select
                              value={atividadeForm.aluno_id || 'none'}
                              onValueChange={(v) => setAtividadeForm((prev) => ({ ...prev, aluno_id: v === 'none' ? '' : v }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Selecione</SelectItem>
                                {usuarios.map((u) => (
                                  <SelectItem key={u.id} value={u.id}>
                                    {u.nome} {u.turma ? `(${u.turma})` : ''}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2">
                            <Label>Livro *</Label>
                            <Select
                              value={atividadeForm.livro_id || 'none'}
                              onValueChange={(v) => setAtividadeForm((prev) => ({ ...prev, livro_id: v === 'none' ? '' : v }))}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Selecione</SelectItem>
                                {livros.map((l) => (
                                  <SelectItem key={l.id} value={l.id}>
                                    {l.titulo}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
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
                  <div className="overflow-x-auto">
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
                      const form = avaliacaoForm[entrega.id] || {
                        status: entrega.status || 'enviada',
                        pontos_ganhos: Number(entrega.pontos_ganhos || 0),
                        feedback_professor: entrega.feedback_professor || '',
                      };

                      return (
                        <div key={entrega.id} className="p-4 border rounded-lg space-y-3">
                          <div className="flex flex-col md:flex-row md:justify-between gap-2">
                            <div>
                              <p className="font-semibold">{entrega.atividades_leitura?.titulo || 'Atividade'}</p>
                              <p className="text-xs text-muted-foreground">
                                {entrega.usuarios_biblioteca?.nome || 'Aluno'}
                                {entrega.usuarios_biblioteca?.turma ? ` (${entrega.usuarios_biblioteca.turma})` : ''}
                                {' • '}
                                {entrega.atividades_leitura?.livros?.titulo || '-'}
                              </p>
                            </div>
                            <div className="text-right">
                              <Badge variant="outline">Enviado: {formatDateBR(entrega.enviado_em)}</Badge>
                            </div>
                          </div>

                          <div className="p-3 bg-muted rounded-md">
                            <p className="text-xs text-muted-foreground mb-1">Resposta do aluno</p>
                            <p className="text-sm whitespace-pre-wrap">{entrega.texto_entrega}</p>
                          </div>

                          <div className="grid md:grid-cols-3 gap-3">
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
                    <DialogTrigger asChild>
                      <Button>
                        <Send className="w-4 h-4 mr-2" /> Nova sugestão
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Enviar sugestão</DialogTitle>
                        <DialogDescription>Indique um livro com mensagem personalizada.</DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Aluno *</Label>
                          <Select value={selectedAluno || 'none'} onValueChange={(v) => setSelectedAluno(v === 'none' ? '' : v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Selecione</SelectItem>
                              {usuarios.map((u) => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.nome} {u.turma ? `(${u.turma})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label>Livro *</Label>
                          <Select value={selectedLivro || 'none'} onValueChange={(v) => setSelectedLivro(v === 'none' ? '' : v)}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Selecione</SelectItem>
                              {livros.map((l) => (
                                <SelectItem key={l.id} value={l.id}>
                                  {l.titulo}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
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
