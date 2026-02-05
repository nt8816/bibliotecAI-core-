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
import { Lightbulb, Send, Users, BookOpen, Sparkles, Trash2 } from 'lucide-react';
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

export default function SugestoesLivros() {
  const [livros, setLivros] = useState<Livro[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [sugestoes, setSugestoes] = useState<Sugestao[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isAutoDialogOpen, setIsAutoDialogOpen] = useState(false);
  
  // Form states
  const [selectedAluno, setSelectedAluno] = useState('');
  const [selectedLivro, setSelectedLivro] = useState('');
  const [mensagem, setMensagem] = useState('');
  
  // Auto suggestion states
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedTurma, setSelectedTurma] = useState('');
  
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  // Realtime subscription para sincronização automática
  const handleRealtimeChange = useCallback(() => {
    fetchData();
  }, []);

  useRealtimeSubscription({
    table: 'sugestoes_livros',
    onChange: handleRealtimeChange,
  });

  useRealtimeSubscription({
    table: 'livros',
    onChange: handleRealtimeChange,
  });

  useRealtimeSubscription({
    table: 'usuarios_biblioteca',
    onChange: handleRealtimeChange,
  });

  const fetchData = async () => {
    try {
      // Fetch books
      const { data: livrosData } = await supabase
        .from('livros')
        .select('id, titulo, autor, area')
        .order('titulo');
      
      // Fetch students (alunos only)
      const { data: usuariosData } = await supabase
        .from('usuarios_biblioteca')
        .select('id, nome, turma')
        .eq('tipo', 'aluno')
        .order('nome');
      
      // Fetch existing suggestions
      const { data: sugestoesData } = await supabase
        .from('sugestoes_livros')
        .select(`
          *,
          livros(titulo, autor),
          usuarios_biblioteca!sugestoes_livros_aluno_id_fkey(nome, turma)
        `)
        .order('created_at', { ascending: false });

      setLivros(livrosData || []);
      setUsuarios(usuariosData || []);
      setSugestoes(sugestoesData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar os dados.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSendSugestao = async () => {
    if (!selectedAluno || !selectedLivro) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Selecione um aluno e um livro.',
      });
      return;
    }

    // Get professor's usuarios_biblioteca id
    const { data: professorData } = await supabase
      .from('usuarios_biblioteca')
      .select('id')
      .eq('user_id', user?.id)
      .single();

    if (!professorData) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Perfil de professor não encontrado.',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('sugestoes_livros')
        .insert({
          aluno_id: selectedAluno,
          livro_id: selectedLivro,
          professor_id: professorData.id,
          mensagem: mensagem || null,
        });

      if (error) throw error;

      toast({ title: 'Sucesso', description: 'Sugestão enviada com sucesso!' });
      setIsDialogOpen(false);
      setSelectedAluno('');
      setSelectedLivro('');
      setMensagem('');
      fetchData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível enviar a sugestão.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleAutoSugestao = async () => {
    if (!selectedArea) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Selecione uma área de livros.',
      });
      return;
    }

    // Get professor's usuarios_biblioteca id
    const { data: professorData } = await supabase
      .from('usuarios_biblioteca')
      .select('id')
      .eq('user_id', user?.id)
      .single();

    if (!professorData) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Perfil de professor não encontrado.',
      });
      return;
    }

    setSaving(true);
    try {
      // Get books from selected area
      const livrosDaArea = livros.filter(l => l.area.toLowerCase() === selectedArea.toLowerCase());
      
      if (livrosDaArea.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Não há livros cadastrados nessa área.',
        });
        setSaving(false);
        return;
      }

      // Get students to suggest to
      let alunosParaSugerir = usuarios;
      if (selectedTurma) {
        alunosParaSugerir = usuarios.filter(u => u.turma === selectedTurma);
      }

      if (alunosParaSugerir.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Erro',
          description: 'Não há alunos para sugerir.',
        });
        setSaving(false);
        return;
      }

      // Create suggestions - one different book for each student
      const sugestoesPendentes = [];
      for (let i = 0; i < alunosParaSugerir.length; i++) {
        const aluno = alunosParaSugerir[i];
        const livro = livrosDaArea[i % livrosDaArea.length]; // Cycle through books
        
        sugestoesPendentes.push({
          aluno_id: aluno.id,
          livro_id: livro.id,
          professor_id: professorData.id,
          mensagem: `Sugestão automática da área: ${selectedArea}`,
        });
      }

      const { error } = await supabase
        .from('sugestoes_livros')
        .insert(sugestoesPendentes);

      if (error) throw error;

      toast({ 
        title: 'Sucesso', 
        description: `${sugestoesPendentes.length} sugestões enviadas!` 
      });
      setIsAutoDialogOpen(false);
      setSelectedArea('');
      setSelectedTurma('');
      fetchData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível enviar as sugestões.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteSugestao = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta sugestão?')) return;

    try {
      const { error } = await supabase
        .from('sugestoes_livros')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Sugestão excluída.' });
      fetchData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível excluir.',
      });
    }
  };

  // Get unique areas from books
  const areas = [...new Set(livros.filter(l => l.area).map(l => l.area))].sort();
  const turmas = [...new Set(usuarios.filter(u => u.turma).map(u => u.turma!))].sort();

  return (
    <MainLayout title="Sugestões de Livros">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Lightbulb className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Sugestões Enviadas</p>
                  <p className="text-2xl font-bold">{sugestoes.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Lidas pelos Alunos</p>
                  <p className="text-2xl font-bold">{sugestoes.filter(s => s.lido).length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Send className="w-6 h-6 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pendentes</p>
                  <p className="text-2xl font-bold">{sugestoes.filter(s => !s.lido).length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-3">
          {/* Manual Suggestion Dialog */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Send className="w-4 h-4 mr-2" />
                Sugerir para Aluno
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Sugerir Livro para Aluno</DialogTitle>
                <DialogDescription>
                  Envie uma sugestão de leitura personalizada para um aluno.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Aluno *</Label>
                  <Select value={selectedAluno} onValueChange={setSelectedAluno}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um aluno" />
                    </SelectTrigger>
                    <SelectContent>
                      {usuarios.map(u => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.nome} {u.turma ? `(${u.turma})` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Livro *</Label>
                  <Select value={selectedLivro} onValueChange={setSelectedLivro}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um livro" />
                    </SelectTrigger>
                    <SelectContent>
                      {livros.map(l => (
                        <SelectItem key={l.id} value={l.id}>
                          {l.titulo} - {l.autor || 'Autor desconhecido'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Mensagem (opcional)</Label>
                  <Textarea
                    value={mensagem}
                    onChange={(e) => setMensagem(e.target.value)}
                    placeholder="Escreva uma mensagem para o aluno..."
                    rows={3}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleSendSugestao} disabled={saving}>
                  {saving ? 'Enviando...' : 'Enviar Sugestão'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* Auto Suggestion Dialog */}
          <Dialog open={isAutoDialogOpen} onOpenChange={setIsAutoDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary">
                <Sparkles className="w-4 h-4 mr-2" />
                Sugestão Automática por Turma
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Sugestão Automática</DialogTitle>
                <DialogDescription>
                  Selecione uma área e turma. O sistema irá sugerir um livro diferente para cada aluno.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Área do Livro *</Label>
                  <Select value={selectedArea} onValueChange={setSelectedArea}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione uma área" />
                    </SelectTrigger>
                    <SelectContent>
                      {areas.map(area => (
                        <SelectItem key={area} value={area}>
                          {area} ({livros.filter(l => l.area === area).length} livros)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Turma (opcional - deixe vazio para todos os alunos)</Label>
                  <Select value={selectedTurma} onValueChange={setSelectedTurma}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todas as turmas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Todas as turmas</SelectItem>
                      {turmas.map(turma => (
                        <SelectItem key={turma} value={turma}>
                          {turma} ({usuarios.filter(u => u.turma === turma).length} alunos)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {selectedArea && (
                  <p className="text-sm text-muted-foreground">
                    Serão enviadas sugestões para {selectedTurma 
                      ? usuarios.filter(u => u.turma === selectedTurma).length 
                      : usuarios.length} aluno(s).
                  </p>
                )}
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsAutoDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAutoSugestao} disabled={saving}>
                  {saving ? 'Enviando...' : 'Enviar Sugestões'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {/* Suggestions Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lightbulb className="w-5 h-5" />
              Histórico de Sugestões
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : sugestoes.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma sugestão enviada ainda
              </p>
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
                    {sugestoes.map((sugestao) => (
                      <TableRow key={sugestao.id}>
                        <TableCell className="font-medium">
                          {sugestao.usuarios_biblioteca?.nome || 'N/A'}
                        </TableCell>
                        <TableCell>
                          {sugestao.usuarios_biblioteca?.turma || '-'}
                        </TableCell>
                        <TableCell>{sugestao.livros?.titulo || 'N/A'}</TableCell>
                        <TableCell className="max-w-[200px] truncate">
                          {sugestao.mensagem || '-'}
                        </TableCell>
                        <TableCell>
                          {format(new Date(sugestao.created_at), "dd/MM/yyyy", { locale: ptBR })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={sugestao.lido ? 'default' : 'secondary'}>
                            {sugestao.lido ? 'Lido' : 'Pendente'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteSugestao(sugestao.id)}
                          >
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
      </div>
    </MainLayout>
  );
}
