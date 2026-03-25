import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, Lightbulb, Send, Sparkles, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { createProfessorSugestão, deleteProfessorSugestão, fetchProfessorPainelData } from '@/services/professorService';

export default function SugestoesLivros() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [livros, setLivros] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [sugestoes, setSugestoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAutoDialogOpen, setIsAutoDialogOpen] = useState(false);
  const [selectedAluno, setSelectedAluno] = useState('');
  const [selectedLivro, setSelectedLivro] = useState('');
  const [mensagem, setMensagem] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedTurma, setSelectedTurma] = useState('');
  const [deleteSugestao, setDeleteSugestao] = useState(null);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await fetchProfessorPainelData();
      setLivros(Array.isArray(data?.livros) ? data.livros : []);
      setUsuarios(Array.isArray(data?.usuarios) ? data.usuarios : []);
      setSugestoes(Array.isArray(data?.sugestoes) ? data.sugestoes : []);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível carregar as sugestoes.' });
    } finally {
      setLoading(false);
    }
  }, [toast, user?.id]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const interval = window.setInterval(fetchData, 30000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData]);

  const handleSendSugestão = async () => {
    if (!selectedAluno || !selectedLivro) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Selecione um aluno e um livro.' });
      return;
    }
    setSaving(true);
    try {
      await createProfessorSugestão({ aluno_id: selectedAluno, livro_id: selectedLivro, mensagem });
      toast({ title: 'Sucesso', description: 'Sugestão enviada com sucesso!' });
      setIsDialogOpen(false);
      setSelectedAluno('');
      setSelectedLivro('');
      setMensagem('');
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível enviar a sugestão.' });
    } finally {
      setSaving(false);
    }
  };

  const handleAutoSugestão = async () => {
    if (!selectedArea) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Selecione uma area de livros.' });
      return;
    }

    const livrosDaArea = livros.filter((item) => String(item?.area || '').toLowerCase() === selectedArea.toLowerCase());
    let alunos = usuarios;
    if (selectedTurma) alunos = usuarios.filter((item) => item.turma === selectedTurma);

    if (!livrosDaArea.length || !alunos.length) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não há livros ou alunos suficientes para gerar as sugestoes.' });
      return;
    }

    setSaving(true);
    try {
      for (let index = 0; index < alunos.length; index += 1) {
        const aluno = alunos[index];
        const livro = livrosDaArea[index % livrosDaArea.length];
        await createProfessorSugestão({
          aluno_id: aluno.id,
          livro_id: livro.id,
          mensagem: `Sugestão automatica da area: ${selectedArea}`,
        });
      }
      toast({ title: 'Sucesso', description: `${alunos.length} sugestoes enviadas!` });
      setIsAutoDialogOpen(false);
      setSelectedArea('');
      setSelectedTurma('');
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível enviar as sugestoes.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSugestão = async (id) => {
    try {
      await deleteProfessorSugestão(id);
      setDeleteSugestao(null);
      toast({ title: 'Sucesso', description: 'Sugestão excluida.' });
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível excluir.' });
    }
  };

  const areas = useMemo(() => [...new Set(livros.filter((item) => item.area).map((item) => item.area))].sort(), [livros]);
  const turmas = useMemo(() => [...new Set(usuarios.filter((item) => item.turma).map((item) => item.turma))].sort(), [usuarios]);

  return (
    <MainLayout title="Sugestoes de Livros">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardContent className="p-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center"><Lightbulb className="w-6 h-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">Sugestoes Enviadas</p><p className="text-2xl font-bold">{sugestoes.length}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center"><BookOpen className="w-6 h-6 text-success" /></div><div><p className="text-sm text-muted-foreground">Lidas pelos Alunos</p><p className="text-2xl font-bold">{sugestoes.filter((item) => item.lido).length}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center"><Send className="w-6 h-6 text-warning" /></div><div><p className="text-sm text-muted-foreground">Pendentes</p><p className="text-2xl font-bold">{sugestoes.filter((item) => !item.lido).length}</p></div></div></CardContent></Card>
        </div>

        <div className="flex flex-wrap gap-3">
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button><Send className="w-4 h-4 mr-2" />Sugerir para Aluno</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Sugerir Livro para Aluno</DialogTitle><DialogDescription>Envie uma sugestão de leitura personalizada para um aluno.</DialogDescription></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Aluno *</Label>
                  <Select value={selectedAluno} onValueChange={setSelectedAluno}>
                    <SelectTrigger><SelectValue placeholder="Selecione um aluno" /></SelectTrigger>
                    <SelectContent>{usuarios.map((u) => <SelectItem key={u.id} value={u.id}>{u.nome} {u.turma ? `(${u.turma})` : ''}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Livro *</Label>
                  <Select value={selectedLivro} onValueChange={setSelectedLivro}>
                    <SelectTrigger><SelectValue placeholder="Selecione um livro" /></SelectTrigger>
                    <SelectContent>{livros.map((l) => <SelectItem key={l.id} value={l.id}>{l.titulo} - {l.autor || 'Autor desconhecido'}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Mensagem (opcional)</Label>
                  <Textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={3} />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleSendSugestão} disabled={saving}>{saving ? 'Enviando...' : 'Enviar Sugestão'}</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isAutoDialogOpen} onOpenChange={setIsAutoDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary"><Sparkles className="w-4 h-4 mr-2" />Sugestão Automatica por Turma</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Sugestão Automatica</DialogTitle><DialogDescription>Selecione uma area e turma. O sistema sugerira um livro diferente para cada aluno.</DialogDescription></DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Area do Livro *</Label>
                  <Select value={selectedArea} onValueChange={setSelectedArea}>
                    <SelectTrigger><SelectValue placeholder="Selecione uma area" /></SelectTrigger>
                    <SelectContent>{areas.map((area) => <SelectItem key={area} value={area}>{area} ({livros.filter((l) => l.area === area).length} livros)</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Turma (opcional)</Label>
                  <Select value={selectedTurma || 'all'} onValueChange={(value) => setSelectedTurma(value === 'all' ? '' : value)}>
                    <SelectTrigger><SelectValue placeholder="Todas as turmas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as turmas</SelectItem>
                      {turmas.map((turma) => <SelectItem key={turma} value={turma}>{turma} ({usuarios.filter((u) => u.turma === turma).length} alunos)</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsAutoDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleAutoSugestão} disabled={saving}>{saving ? 'Enviando...' : 'Enviar Sugestoes'}</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Lightbulb className="w-5 h-5" />Histórico de Sugestoes</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : sugestoes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhuma sugestão enviada ainda</p>
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
                      <TableHead className="text-right">Acoes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sugestoes.map((sugestão) => (
                      <TableRow key={sugestão.id}>
                        <TableCell className="font-medium">{sugestão.usuarios_biblioteca?.nome || 'N/A'}</TableCell>
                        <TableCell>{sugestão.usuarios_biblioteca?.turma || '-'}</TableCell>
                        <TableCell>{sugestão.livros?.titulo || 'N/A'}</TableCell>
                        <TableCell className="max-w-[200px] truncate">{sugestão.mensagem || '-'}</TableCell>
                        <TableCell>{format(new Date(sugestão.created_at), 'dd/MM/yyyy', { locale: ptBR })}</TableCell>
                        <TableCell><Badge variant={sugestão.lido ? 'default' : 'secondary'}>{sugestão.lido ? 'Lido' : 'Pendente'}</Badge></TableCell>
                        <TableCell className="text-right"><Button variant="ghost" size="icon" onClick={() => setDeleteSugestao(sugestão)}><Trash2 className="w-4 h-4 text-destructive" /></Button></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
        <AlertDialog open={Boolean(deleteSugestao)} onOpenChange={(open) => !open && setDeleteSugestao(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir sugestao?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteSugestao ? `A sugestao do livro "${deleteSugestao.livros?.titulo || 'Livro'}" sera removida permanentemente.` : 'Esta sugestao sera removida permanentemente.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteSugestao?.id && handleDeleteSugestão(deleteSugestao.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Excluir
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}


