import { useEffect, useState, useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { Lightbulb, Send, BookOpen, Sparkles, Trash2, ClipboardList, Plus, Pencil, CheckCircle, Clock, Star } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Livro {
  id: string;
  titulo: string;
  autor: string;
  area: string;
}

interface Usuario {
  id: string;
  nome: string;
  turma: string | null;
}

interface Sugestao {
  id: string;
  livro_id: string;
  aluno_id: string;
  professor_id: string;
  mensagem: string | null;
  lido: boolean;
  created_at: string;
  livros?: { titulo: string; autor: string };
  usuarios_biblioteca?: { nome: string; turma: string | null };
}

interface Atividade {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  pontos_extras: number | null;
  data_entrega: string | null;
  livro_id: string;
  aluno_id: string;
  professor_id: string;
  created_at: string;
  livros?: { titulo: string; autor: string };
  usuarios_biblioteca?: { nome: string; turma: string | null };
}

const emptyAtividade = {
  titulo: '',
  descricao: '',
  pontos_extras: 0,
  data_entrega: '',
  livro_id: '',
  aluno_id: '',
};

export default function PainelProfessor() {
  const [livros, setLivros] = useState<Livro[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Suggestion states
  const [isSugestaoDialogOpen, setIsSugestaoDialogOpen] = useState(false);
  const [isAutoDialogOpen, setIsAutoDialogOpen] = useState(false);
  const [selectedAluno, setSelectedAluno] = useState('');
  const [selectedLivro, setSelectedLivro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedTurma, setSelectedTurma] = useState('');

  // Activity states
  const [isAtividadeDialogOpen, setIsAtividadeDialogOpen] = useState(false);
  const [editingAtividade, setEditingAtividade] = useState<Atividade | null>(null);
  const [atividadeForm, setAtividadeForm] = useState(emptyAtividade);
  const [filterStatus, setFilterStatus] = useState('');

  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => { fetchData(); }, []);

  const handleRealtimeChange = useCallback(() => { fetchData(); }, []);
  useRealtimeSubscription({ table: 'sugestoes_livros', onChange: handleRealtimeChange });
  useRealtimeSubscription({ table: 'atividades_leitura', onChange: handleRealtimeChange });
  useRealtimeSubscription({ table: 'livros', onChange: handleRealtimeChange });
  useRealtimeSubscription({ table: 'usuarios_biblioteca', onChange: handleRealtimeChange });

  const fetchData = async () => {
    try {
      const [livrosRes, usuariosRes, sugestoesRes, atividadesRes] = await Promise.all([
        supabase.from('livros').select('id, titulo, autor, area').order('titulo'),
        supabase.from('usuarios_biblioteca').select('id, nome, turma').eq('tipo', 'aluno').order('nome'),
        supabase.from('sugestoes_livros').select(`*, livros(titulo, autor), usuarios_biblioteca!sugestoes_livros_aluno_id_fkey(nome, turma)`).order('created_at', { ascending: false }),
        supabase.from('atividades_leitura').select(`*, livros(titulo, autor), usuarios_biblioteca!atividades_leitura_aluno_id_fkey(nome, turma)`).order('created_at', { ascending: false }),
      ]);

      setLivros(livrosRes.data || []);
      setUsuarios(usuariosRes.data || []);
      setSugestoes(sugestoesRes.data || []);
      setAtividades(atividadesRes.data || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível carregar os dados.' });
    } finally {
      setLoading(false);
    }
  };

  const getProfessorId = async () => {
    const { data } = await supabase.from('usuarios_biblioteca').select('id').eq('user_id', user?.id).single();
    if (!data) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Perfil de professor não encontrado.' });
      return null;
    }
    return data.id;
  };

  // --- Suggestion handlers ---
  const handleSendSugestao = async () => {
    if (!selectedAluno || !selectedLivro) { toast({ variant: 'destructive', title: 'Erro', description: 'Selecione aluno e livro.' }); return; }
    const profId = await getProfessorId();
    if (!profId) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('sugestoes_livros').insert({
        aluno_id: selectedAluno, livro_id: selectedLivro, professor_id: profId, mensagem: mensagem || null,
      });
      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Sugestão enviada!' });
      setIsSugestaoDialogOpen(false);
      setSelectedAluno(''); setSelectedLivro(''); setMensagem('');
      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
    } finally { setSaving(false); }
  };

  const handleAutoSugestao = async () => {
    if (!selectedArea) { toast({ variant: 'destructive', title: 'Erro', description: 'Selecione uma área.' }); return; }
    const profId = await getProfessorId();
    if (!profId) return;

    setSaving(true);
    try {
      // Filtrar livros disponíveis da área (não emprestados)
      const livrosDaArea = livros.filter(l => l.area.toLowerCase() === selectedArea.toLowerCase());
      const livrosDisponiveis = livrosDaArea; // já temos todos, vamos checar disponibilidade abaixo

      if (livrosDaArea.length === 0) { toast({ variant: 'destructive', title: 'Erro', description: 'Sem livros nessa área.' }); setSaving(false); return; }

      let alunos = usuarios;
      if (selectedTurma) alunos = usuarios.filter(u => u.turma === selectedTurma);
      if (alunos.length === 0) { toast({ variant: 'destructive', title: 'Erro', description: 'Sem alunos.' }); setSaving(false); return; }

      // Buscar empréstimos ativos para evitar sugerir livros emprestados
      const { data: emprestimosAtivos } = await supabase.from('emprestimos').select('livro_id, usuario_id').eq('status', 'ativo');
      const livrosEmprestados = new Set((emprestimosAtivos || []).map(e => e.livro_id));

      // Buscar sugestões existentes para evitar duplicatas
      const { data: sugestoesExistentes } = await supabase.from('sugestoes_livros').select('aluno_id, livro_id');
      const sugestoesSet = new Set((sugestoesExistentes || []).map(s => `${s.aluno_id}-${s.livro_id}`));

      // Filtrar livros não emprestados
      const livrosLivres = livrosDaArea.filter(l => !livrosEmprestados.has(l.id));
      if (livrosLivres.length === 0) {
        toast({ variant: 'destructive', title: 'Aviso', description: 'Todos os livros desta área estão emprestados.' });
        setSaving(false);
        return;
      }

      // Distribuir livros sem duplicatas entre alunos
      const batch: { aluno_id: string; livro_id: string; professor_id: string; mensagem: string }[] = [];
      const livrosUsados = new Map<string, number>(); // livro_id -> count

      for (const aluno of alunos) {
        // Encontrar livro não sugerido para este aluno e menos usado
        const livroParaAluno = livrosLivres.find(l => {
          const key = `${aluno.id}-${l.id}`;
          if (sugestoesSet.has(key)) return false;
          const count = livrosUsados.get(l.id) || 0;
          // Evitar que o mesmo livro vá para muitos alunos (distribuir uniformemente)
          return count < Math.ceil(alunos.length / livrosLivres.length) + 1;
        });

        if (livroParaAluno) {
          batch.push({
            aluno_id: aluno.id, livro_id: livroParaAluno.id,
            professor_id: profId, mensagem: `Sugestão automática da área: ${selectedArea}`,
          });
          livrosUsados.set(livroParaAluno.id, (livrosUsados.get(livroParaAluno.id) || 0) + 1);
          sugestoesSet.add(`${aluno.id}-${livroParaAluno.id}`);
        }
      }

      if (batch.length === 0) {
        toast({ title: 'Aviso', description: 'Todos os alunos já receberam sugestões desta área.' });
        setSaving(false);
        return;
      }

      const { error } = await supabase.from('sugestoes_livros').insert(batch);
      if (error) throw error;
      toast({ title: 'Sucesso', description: `${batch.length} sugestões enviadas (sem duplicatas)!` });
      setIsAutoDialogOpen(false); setSelectedArea(''); setSelectedTurma('');
      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
    } finally { setSaving(false); }
  };

  const handleDeleteSugestao = async (id: string) => {
    if (!confirm('Excluir esta sugestão?')) return;
    try {
      const { error } = await supabase.from('sugestoes_livros').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Sugestão excluída.' });
      fetchData();
    } catch (error: any) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); }
  };

  // --- Activity handlers ---
  const handleOpenAtividadeDialog = (atividade?: Atividade) => {
    if (atividade) {
      setEditingAtividade(atividade);
      setAtividadeForm({
        titulo: atividade.titulo, descricao: atividade.descricao || '', pontos_extras: atividade.pontos_extras || 0,
        data_entrega: atividade.data_entrega ? atividade.data_entrega.split('T')[0] : '',
        livro_id: atividade.livro_id, aluno_id: atividade.aluno_id,
      });
    } else {
      setEditingAtividade(null);
      setAtividadeForm(emptyAtividade);
    }
    setIsAtividadeDialogOpen(true);
  };

  const handleSaveAtividade = async () => {
    if (!atividadeForm.titulo.trim() || !atividadeForm.aluno_id || !atividadeForm.livro_id) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Preencha todos os campos obrigatórios.' });
      return;
    }
    const profId = await getProfessorId();
    if (!profId) return;

    setSaving(true);
    try {
      const dataToSave = {
        titulo: atividadeForm.titulo, descricao: atividadeForm.descricao || null,
        pontos_extras: atividadeForm.pontos_extras || 0,
        data_entrega: atividadeForm.data_entrega ? new Date(atividadeForm.data_entrega).toISOString() : null,
        livro_id: atividadeForm.livro_id, aluno_id: atividadeForm.aluno_id, professor_id: profId,
      };

      if (editingAtividade) {
        const { error } = await supabase.from('atividades_leitura').update(dataToSave).eq('id', editingAtividade.id);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Atividade atualizada!' });
      } else {
        const { error } = await supabase.from('atividades_leitura').insert(dataToSave);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Atividade criada!' });
      }
      setIsAtividadeDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message });
    } finally { setSaving(false); }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase.from('atividades_leitura').update({ status: newStatus }).eq('id', id);
      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Status atualizado!' });
      fetchData();
    } catch (error: any) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); }
  };

  const handleDeleteAtividade = async (id: string) => {
    if (!confirm('Excluir esta atividade?')) return;
    try {
      const { error } = await supabase.from('atividades_leitura').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Atividade excluída.' });
      fetchData();
    } catch (error: any) { toast({ variant: 'destructive', title: 'Erro', description: error.message }); }
  };

  const areas = [...new Set(livros.filter(l => l.area).map(l => l.area))].sort();
  const turmas = [...new Set(usuarios.filter(u => u.turma).map(u => u.turma!))].sort();
  const filteredAtividades = filterStatus ? atividades.filter(a => a.status === filterStatus) : atividades;

  const totalPontos = atividades.reduce((acc, a) => acc + (a.pontos_extras || 0), 0);
  const concluidas = atividades.filter(a => a.status === 'concluido').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'concluido': return <Badge className="bg-success text-success-foreground">Concluído</Badge>;
      case 'em_andamento': return <Badge variant="secondary">Em Andamento</Badge>;
      default: return <Badge variant="outline">Pendente</Badge>;
    }
  };

  return (
    <MainLayout title="Sugestões e Atividades">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Lightbulb className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Sugestões</p>
                  <p className="text-xl font-bold">{sugestoes.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-secondary-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Atividades</p>
                  <p className="text-xl font-bold">{atividades.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-success/10 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-success" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Concluídas</p>
                  <p className="text-xl font-bold">{concluidas}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Star className="w-5 h-5 text-warning" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Pontos</p>
                  <p className="text-xl font-bold">{totalPontos}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="sugestoes">
          <TabsList>
            <TabsTrigger value="sugestoes" className="gap-2">
              <Lightbulb className="w-4 h-4" />
              Sugestões ({sugestoes.length})
            </TabsTrigger>
            <TabsTrigger value="atividades" className="gap-2">
              <ClipboardList className="w-4 h-4" />
              Atividades ({atividades.length})
            </TabsTrigger>
          </TabsList>

          {/* === SUGESTÕES TAB === */}
          <TabsContent value="sugestoes" className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <Dialog open={isSugestaoDialogOpen} onOpenChange={setIsSugestaoDialogOpen}>
                <DialogTrigger asChild>
                  <Button><Send className="w-4 h-4 mr-2" />Sugerir para Aluno</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Sugerir Livro para Aluno</DialogTitle>
                    <DialogDescription>Envie uma sugestão de leitura personalizada.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Aluno *</Label>
                      <Select value={selectedAluno} onValueChange={setSelectedAluno}>
                        <SelectTrigger><SelectValue placeholder="Selecione um aluno" /></SelectTrigger>
                        <SelectContent>
                          {usuarios.map(u => (
                            <SelectItem key={u.id} value={u.id}>{u.nome} {u.turma ? `(${u.turma})` : ''}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Livro *</Label>
                      <Select value={selectedLivro} onValueChange={setSelectedLivro}>
                        <SelectTrigger><SelectValue placeholder="Selecione um livro" /></SelectTrigger>
                        <SelectContent>
                          {livros.map(l => (
                            <SelectItem key={l.id} value={l.id}>{l.titulo} - {l.autor || '?'}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Mensagem (opcional)</Label>
                      <Textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Escreva uma mensagem..." rows={3} />
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsSugestaoDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSendSugestao} disabled={saving}>{saving ? 'Enviando...' : 'Enviar'}</Button>
                  </div>
                </DialogContent>
              </Dialog>

              <Dialog open={isAutoDialogOpen} onOpenChange={setIsAutoDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="secondary"><Sparkles className="w-4 h-4 mr-2" />Sugestão Automática</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Sugestão Automática</DialogTitle>
                    <DialogDescription>Selecione área e turma. Um livro diferente para cada aluno.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Área *</Label>
                      <Select value={selectedArea} onValueChange={setSelectedArea}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>
                          {areas.map(a => <SelectItem key={a} value={a}>{a} ({livros.filter(l => l.area === a).length})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Turma (opcional)</Label>
                      <Select value={selectedTurma || 'all'} onValueChange={(v) => setSelectedTurma(v === 'all' ? '' : v)}>
                        <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">Todas as turmas</SelectItem>
                          {turmas.map(t => <SelectItem key={t} value={t}>{t} ({usuarios.filter(u => u.turma === t).length})</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsAutoDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={handleAutoSugestao} disabled={saving}>{saving ? 'Enviando...' : 'Enviar'}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="w-4 h-4" />Histórico de Sugestões</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-8">Carregando...</p>
                ) : sugestoes.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhuma sugestão enviada</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Aluno</TableHead>
                          <TableHead>Turma</TableHead>
                          <TableHead>Livro</TableHead>
                          <TableHead>Mensagem</TableHead>
                          <TableHead>Data</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Ações</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sugestoes.map(s => (
                          <TableRow key={s.id}>
                            <TableCell className="font-medium">{s.usuarios_biblioteca?.nome || 'N/A'}</TableCell>
                            <TableCell>{s.usuarios_biblioteca?.turma || '-'}</TableCell>
                            <TableCell>{s.livros?.titulo || 'N/A'}</TableCell>
                            <TableCell className="max-w-[200px] truncate">{s.mensagem || '-'}</TableCell>
                            <TableCell>{format(new Date(s.created_at), "dd/MM/yyyy", { locale: ptBR })}</TableCell>
                            <TableCell><Badge variant={s.lido ? 'default' : 'secondary'}>{s.lido ? 'Lido' : 'Pendente'}</Badge></TableCell>
                            <TableCell className="text-right">
                              <Button variant="ghost" size="icon" onClick={() => handleDeleteSugestao(s.id)}>
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
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

          {/* === ATIVIDADES TAB === */}
          <TabsContent value="atividades" className="space-y-4">
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Filtrar" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="em_andamento">Em Andamento</SelectItem>
                  <SelectItem value="concluido">Concluído</SelectItem>
                </SelectContent>
              </Select>

              <Dialog open={isAtividadeDialogOpen} onOpenChange={setIsAtividadeDialogOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => handleOpenAtividadeDialog()}><Plus className="w-4 h-4 mr-2" />Nova Atividade</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>{editingAtividade ? 'Editar Atividade' : 'Nova Atividade'}</DialogTitle>
                    <DialogDescription>Crie uma atividade de leitura para um aluno</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Título *</Label>
                      <Input value={atividadeForm.titulo} onChange={(e) => setAtividadeForm({ ...atividadeForm, titulo: e.target.value })} placeholder="Ex: Resenha do livro" />
                    </div>
                    <div className="space-y-2">
                      <Label>Descrição</Label>
                      <Textarea value={atividadeForm.descricao} onChange={(e) => setAtividadeForm({ ...atividadeForm, descricao: e.target.value })} placeholder="Instruções..." rows={3} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Aluno *</Label>
                        <Select value={atividadeForm.aluno_id} onValueChange={(v) => setAtividadeForm({ ...atividadeForm, aluno_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {usuarios.map(u => <SelectItem key={u.id} value={u.id}>{u.nome} {u.turma ? `(${u.turma})` : ''}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>Livro *</Label>
                        <Select value={atividadeForm.livro_id} onValueChange={(v) => setAtividadeForm({ ...atividadeForm, livro_id: v })}>
                          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                          <SelectContent>
                            {livros.map(l => <SelectItem key={l.id} value={l.id}>{l.titulo}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Pontos Extras</Label>
                        <Input type="number" min="0" value={atividadeForm.pontos_extras} onChange={(e) => setAtividadeForm({ ...atividadeForm, pontos_extras: parseInt(e.target.value) || 0 })} />
                      </div>
                      <div className="space-y-2">
                        <Label>Data de Entrega</Label>
                        <Input type="date" value={atividadeForm.data_entrega} onChange={(e) => setAtividadeForm({ ...atividadeForm, data_entrega: e.target.value })} />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsAtividadeDialogOpen(false)}>Cancelar</Button>
                    <Button onClick={handleSaveAtividade} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base"><ClipboardList className="w-4 h-4" />Gerenciar Atividades</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-center text-muted-foreground py-8">Carregando...</p>
                ) : filteredAtividades.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhuma atividade encontrada</p>
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
                        {filteredAtividades.map(a => (
                          <TableRow key={a.id}>
                            <TableCell className="font-medium">{a.titulo}</TableCell>
                            <TableCell>{a.usuarios_biblioteca?.nome || 'N/A'}</TableCell>
                            <TableCell>{a.livros?.titulo || 'N/A'}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="gap-1"><Star className="w-3 h-3" />{a.pontos_extras || 0}</Badge>
                            </TableCell>
                            <TableCell>{a.data_entrega ? format(new Date(a.data_entrega), "dd/MM/yyyy", { locale: ptBR }) : '-'}</TableCell>
                            <TableCell>{getStatusBadge(a.status)}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                {a.status !== 'concluido' && (
                                  <Button variant="ghost" size="icon" title="Concluir" onClick={() => handleUpdateStatus(a.id, 'concluido')}>
                                    <CheckCircle className="w-4 h-4 text-success" />
                                  </Button>
                                )}
                                <Button variant="ghost" size="icon" onClick={() => handleOpenAtividadeDialog(a)}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteAtividade(a.id)}>
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
        </Tabs>
      </div>
    </MainLayout>
  );
}
