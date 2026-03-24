import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle, ClipboardList, Lightbulb, Plus, Send, Star, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { avaliarProfessorEntrega, createProfessorSugestao, deleteProfessorAtividade, deleteProfessorSugestao, fetchProfessorPainelData, saveProfessorAtividade } from '@/services/professorService';

const emptyAtividade = { titulo: '', descricao: '', pontos_extras: 0, data_entrega: '', livro_id: '', aluno_id: '', target_mode: 'aluno', turma: '' };

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
  const [atividadeForm, setAtividadeForm] = useState(emptyAtividade);
  const [avaliacaoForm, setAvaliacaoForm] = useState({});

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
        initial[item.id] = { status: item.status || 'enviada', pontos_ganhos: Number(item.pontos_ganhos || 0), feedback_professor: item.feedback_professor || '' };
      });
      setAvaliacaoForm(initial);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao carregar dados.' });
    } finally {
      setLoading(false);
    }
  }, [toast, user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const interval = window.setInterval(fetchData, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') fetchData(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(interval); document.removeEventListener('visibilitychange', onVisible); };
  }, [fetchData]);

  const handleSendSugestao = async () => {
    if (!selectedAluno || !selectedLivro) return toast({ variant: 'destructive', title: 'Dados incompletos', description: 'Selecione aluno e livro.' });
    setSaving(true);
    try {
      await createProfessorSugestao({ aluno_id: selectedAluno, livro_id: selectedLivro, mensagem: mensagem || null });
      setSelectedAluno(''); setSelectedLivro(''); setMensagem(''); setIsSugestaoDialogOpen(false);
      toast({ title: 'Sugestao enviada!' });
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao enviar sugestao.' });
    } finally { setSaving(false); }
  };

  const handleSaveAtividade = async () => {
    if (!atividadeForm.titulo.trim()) return toast({ variant: 'destructive', title: 'Erro', description: 'Informe o titulo da atividade.' });
    if (atividadeForm.target_mode === 'aluno' && !atividadeForm.aluno_id) return toast({ variant: 'destructive', title: 'Erro', description: 'Selecione um aluno.' });
    if (atividadeForm.target_mode === 'turma' && !atividadeForm.turma) return toast({ variant: 'destructive', title: 'Erro', description: 'Selecione uma turma.' });
    setSaving(true);
    try {
      await saveProfessorAtividade({
        titulo: atividadeForm.titulo.trim(),
        descricao: atividadeForm.descricao || null,
        pontos_extras: Number(atividadeForm.pontos_extras || 0),
        data_entrega: atividadeForm.data_entrega ? new Date(atividadeForm.data_entrega).toISOString() : null,
        livro_id: atividadeForm.livro_id || null,
        aluno_id: atividadeForm.aluno_id || null,
        target_mode: atividadeForm.target_mode,
        turma: atividadeForm.turma || null,
      }, editingAtividade?.id || null);
      setIsAtividadeDialogOpen(false); setEditingAtividade(null); setAtividadeForm(emptyAtividade);
      toast({ title: editingAtividade ? 'Atividade atualizada' : 'Atividade criada' });
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao salvar atividade.' });
    } finally { setSaving(false); }
  };

  const handleAvaliarEntrega = async (entrega) => {
    const state = avaliacaoForm[entrega.id] || {};
    if (!professorProfileIds.includes(entrega?.atividades_leitura?.professor_id)) return;
    setSaving(true);
    try {
      await avaliarProfessorEntrega(entrega.id, { status: state.status, pontos_ganhos: Number(state.pontos_ganhos || 0), feedback_professor: state.feedback_professor || null });
      toast({ title: 'Avaliacao salva' });
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Falha ao avaliar entrega.' });
    } finally { setSaving(false); }
  };

  const entregasPendentes = useMemo(() => entregas.filter((e) => e.status !== 'aprovada').length, [entregas]);
  const pontosDistribuidos = useMemo(() => entregas.filter((e) => e.status === 'aprovada').reduce((acc, e) => acc + Number(e.pontos_ganhos || 0), 0), [entregas]);

  return (
    <MainLayout title="Painel do Professor">
      <div className="space-y-6">
        {professorTurmasPermitidas.length === 0 && <div className="rounded-md border border-warning/30 bg-warning/5 p-3"><p className="text-sm text-warning">Voce ainda nao possui turmas vinculadas.</p></div>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card><CardContent className="p-6"><div className="flex items-center gap-4"><Lightbulb className="w-6 h-6 text-primary" /><div><p className="text-sm text-muted-foreground">Sugestoes enviadas</p><p className="text-2xl font-bold">{sugestoes.length}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="flex items-center gap-4"><ClipboardList className="w-6 h-6 text-info" /><div><p className="text-sm text-muted-foreground">Atividades criadas</p><p className="text-2xl font-bold">{atividades.length}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="flex items-center gap-4"><CheckCircle className="w-6 h-6 text-warning" /><div><p className="text-sm text-muted-foreground">Entregas para avaliar</p><p className="text-2xl font-bold">{entregasPendentes}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="flex items-center gap-4"><Star className="w-6 h-6 text-success" /><div><p className="text-sm text-muted-foreground">Pontos liberados</p><p className="text-2xl font-bold">{pontosDistribuidos}</p></div></div></CardContent></Card>
        </div>

        <Tabs defaultValue="atividades">
          <TabsList className="w-full justify-start overflow-x-auto whitespace-nowrap px-1 py-1">
            <TabsTrigger value="atividades">Atividades</TabsTrigger>
            <TabsTrigger value="entregas">Entregas</TabsTrigger>
            <TabsTrigger value="sugestoes">Sugestoes</TabsTrigger>
          </TabsList>

          <TabsContent value="atividades">
            <Card>
              <CardHeader><div className="flex justify-between gap-4"><CardTitle>Atividades</CardTitle><Button onClick={() => { setEditingAtividade(null); setAtividadeForm(emptyAtividade); setIsAtividadeDialogOpen(true); }}><Plus className="w-4 h-4 mr-2" />Nova atividade</Button></div></CardHeader>
              <CardContent className="space-y-4">
                {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : atividades.map((atividade) => (
                  <div key={atividade.id} className="rounded-lg border p-4 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{atividade.titulo}</p>
                      <p className="text-sm text-muted-foreground">{atividade.usuarios_biblioteca?.nome || 'Aluno'} • {atividade.usuarios_biblioteca?.turma || '-'}</p>
                      <p className="text-sm text-muted-foreground">{atividade.livros?.titulo || 'Sem livro'} • {atividade.data_entrega ? format(new Date(atividade.data_entrega), 'dd/MM/yyyy', { locale: ptBR }) : '-'}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{atividade.status || 'pendente'}</Badge>
                      <Button variant="ghost" size="icon" onClick={() => { setEditingAtividade(atividade); setAtividadeForm({ titulo: atividade.titulo, descricao: atividade.descricao || '', pontos_extras: Number(atividade.pontos_extras || 0), data_entrega: atividade.data_entrega ? atividade.data_entrega.split('T')[0] : '', livro_id: atividade.livro_id || '', aluno_id: atividade.aluno_id || '', target_mode: 'aluno', turma: atividade.usuarios_biblioteca?.turma || '' }); setIsAtividadeDialogOpen(true); }}><Plus className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={async () => { if (!window.confirm('Excluir esta atividade?')) return; await deleteProfessorAtividade(atividade.id); await fetchData(); }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                    </div>
                  </div>
                ))}
                {!loading && atividades.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma atividade cadastrada.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="entregas">
            <Card>
              <CardHeader><CardTitle>Entregas dos alunos</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : entregas.map((entrega) => {
                  const state = avaliacaoForm[entrega.id] || { status: 'enviada', pontos_ganhos: 0, feedback_professor: '' };
                  return (
                    <div key={entrega.id} className="rounded-lg border p-4 space-y-3">
                      <div><p className="font-medium">{entrega.atividades_leitura?.titulo || 'Atividade'}</p><p className="text-sm text-muted-foreground">{entrega.usuarios_biblioteca?.nome || 'Aluno'} • {entrega.usuarios_biblioteca?.turma || '-'}</p></div>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="space-y-2"><Label>Status</Label><Select value={state.status} onValueChange={(value) => setAvaliacaoForm((prev) => ({ ...prev, [entrega.id]: { ...prev[entrega.id], status: value } }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="enviada">Enviada</SelectItem><SelectItem value="aprovada">Aprovada</SelectItem><SelectItem value="revisao">Revisao</SelectItem></SelectContent></Select></div>
                        <div className="space-y-2"><Label>Pontos</Label><Input type="number" min="0" value={state.pontos_ganhos} onChange={(e) => setAvaliacaoForm((prev) => ({ ...prev, [entrega.id]: { ...prev[entrega.id], pontos_ganhos: Number(e.target.value || 0) } }))} /></div>
                        <div className="space-y-2"><Label>Feedback</Label><Textarea rows={2} value={state.feedback_professor || ''} onChange={(e) => setAvaliacaoForm((prev) => ({ ...prev, [entrega.id]: { ...prev[entrega.id], feedback_professor: e.target.value } }))} /></div>
                      </div>
                      <Button onClick={() => handleAvaliarEntrega(entrega)} disabled={saving}>Salvar avaliacao</Button>
                    </div>
                  );
                })}
                {!loading && entregas.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma entrega para avaliar.</p>}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="sugestoes">
            <Card>
              <CardHeader><div className="flex justify-between gap-4"><CardTitle>Sugestoes</CardTitle><Button onClick={() => setIsSugestaoDialogOpen(true)}><Send className="w-4 h-4 mr-2" />Nova sugestao</Button></div></CardHeader>
              <CardContent className="space-y-4">
                {loading ? <p className="text-sm text-muted-foreground">Carregando...</p> : sugestoes.map((sugestao) => (
                  <div key={sugestao.id} className="rounded-lg border p-4 flex items-start justify-between gap-3">
                    <div><p className="font-medium">{sugestao.livros?.titulo || 'Livro'}</p><p className="text-sm text-muted-foreground">{sugestao.usuarios_biblioteca?.nome || 'Aluno'} • {sugestao.usuarios_biblioteca?.turma || '-'}</p>{sugestao.mensagem && <p className="mt-2 text-sm">{sugestao.mensagem}</p>}</div>
                    <Button variant="ghost" size="icon" onClick={async () => { if (!window.confirm('Excluir esta sugestao?')) return; await deleteProfessorSugestao(sugestao.id); await fetchData(); }}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                ))}
                {!loading && sugestoes.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma sugestao enviada.</p>}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={isSugestaoDialogOpen} onOpenChange={setIsSugestaoDialogOpen}>
          <DialogContent><DialogHeader><DialogTitle>Nova sugestao</DialogTitle><DialogDescription>Sugira um livro para um aluno.</DialogDescription></DialogHeader><div className="space-y-4 py-4"><div className="space-y-2"><Label>Aluno</Label><Select value={selectedAluno} onValueChange={setSelectedAluno}><SelectTrigger><SelectValue placeholder="Selecione um aluno" /></SelectTrigger><SelectContent>{usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome} {u.turma ? `(${u.turma})` : ''}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Livro</Label><Select value={selectedLivro} onValueChange={setSelectedLivro}><SelectTrigger><SelectValue placeholder="Selecione um livro" /></SelectTrigger><SelectContent>{livros.map((l) => <SelectItem key={l.id} value={l.id}>{l.titulo}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Mensagem</Label><Textarea rows={3} value={mensagem} onChange={(e) => setMensagem(e.target.value)} /></div></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setIsSugestaoDialogOpen(false)}>Cancelar</Button><Button onClick={handleSendSugestao} disabled={saving}>Enviar</Button></div></DialogContent>
        </Dialog>

        <Dialog open={isAtividadeDialogOpen} onOpenChange={setIsAtividadeDialogOpen}>
          <DialogContent><DialogHeader><DialogTitle>{editingAtividade ? 'Editar atividade' : 'Nova atividade'}</DialogTitle><DialogDescription>Defina a atividade e o destino.</DialogDescription></DialogHeader><div className="space-y-4 py-4"><div className="space-y-2"><Label>Titulo *</Label><Input value={atividadeForm.titulo} onChange={(e) => setAtividadeForm((prev) => ({ ...prev, titulo: e.target.value }))} /></div><div className="space-y-2"><Label>Descricao</Label><Textarea rows={3} value={atividadeForm.descricao} onChange={(e) => setAtividadeForm((prev) => ({ ...prev, descricao: e.target.value }))} /></div><div className="grid grid-cols-2 gap-4"><div className="space-y-2"><Label>Destino</Label><Select value={atividadeForm.target_mode} onValueChange={(value) => setAtividadeForm((prev) => ({ ...prev, target_mode: value }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="aluno">Aluno</SelectItem><SelectItem value="turma">Turma</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Pontos</Label><Input type="number" min="0" value={atividadeForm.pontos_extras} onChange={(e) => setAtividadeForm((prev) => ({ ...prev, pontos_extras: Number(e.target.value || 0) }))} /></div></div>{atividadeForm.target_mode === 'turma' ? <div className="space-y-2"><Label>Turma</Label><Select value={atividadeForm.turma || ''} onValueChange={(value) => setAtividadeForm((prev) => ({ ...prev, turma: value, aluno_id: '' }))}><SelectTrigger><SelectValue placeholder="Selecione uma turma" /></SelectTrigger><SelectContent>{professorTurmasPermitidas.map((turma) => <SelectItem key={turma} value={turma}>{turma}</SelectItem>)}</SelectContent></Select></div> : <div className="space-y-2"><Label>Aluno</Label><Select value={atividadeForm.aluno_id || ''} onValueChange={(value) => setAtividadeForm((prev) => ({ ...prev, aluno_id: value }))}><SelectTrigger><SelectValue placeholder="Selecione um aluno" /></SelectTrigger><SelectContent>{usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome} {u.turma ? `(${u.turma})` : ''}</SelectItem>)}</SelectContent></Select></div>}<div className="space-y-2"><Label>Livro</Label><Select value={atividadeForm.livro_id || 'none'} onValueChange={(value) => setAtividadeForm((prev) => ({ ...prev, livro_id: value === 'none' ? '' : value }))}><SelectTrigger><SelectValue placeholder="Selecione um livro" /></SelectTrigger><SelectContent><SelectItem value="none">Sem livro vinculado</SelectItem>{livros.map((l) => <SelectItem key={l.id} value={l.id}>{l.titulo}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label>Data de entrega</Label><Input type="date" value={atividadeForm.data_entrega} onChange={(e) => setAtividadeForm((prev) => ({ ...prev, data_entrega: e.target.value }))} /></div></div><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setIsAtividadeDialogOpen(false)}>Cancelar</Button><Button onClick={handleSaveAtividade} disabled={saving}>Salvar</Button></div></DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}
