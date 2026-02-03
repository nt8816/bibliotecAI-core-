import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Plus, BookMarked, CheckCircle, AlertTriangle } from 'lucide-react';
import { format, isPast } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Emprestimo {
  id: string;
  livro_id: string;
  usuario_id: string;
  data_emprestimo: string;
  data_devolucao_prevista: string;
  data_devolucao_real: string | null;
  status: string;
  observacoes: string | null;
  livros: { titulo: string; autor: string } | null;
  usuarios_biblioteca: { nome: string; email: string } | null;
}

interface Livro {
  id: string;
  titulo: string;
  autor: string;
  disponivel: boolean;
}

interface Usuario {
  id: string;
  nome: string;
  email: string;
}

export default function Emprestimos() {
  const [emprestimos, setEmprestimos] = useState<Emprestimo[]>([]);
  const [livrosDisponiveis, setLivrosDisponiveis] = useState<Livro[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedLivro, setSelectedLivro] = useState('');
  const [selectedUsuario, setSelectedUsuario] = useState('');
  const [saving, setSaving] = useState(false);
  
  const { isGestor, isBibliotecaria } = useAuth();
  const { toast } = useToast();
  
  // Gestor ou Bibliotecária podem gerenciar empréstimos
  const canManageLoans = isGestor || isBibliotecaria;

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      // Fetch loans
      const { data: emprestimosData, error: emprestimosError } = await supabase
        .from('emprestimos')
        .select(`
          *,
          livros(titulo, autor),
          usuarios_biblioteca(nome, email)
        `)
        .order('data_emprestimo', { ascending: false });

      if (emprestimosError) throw emprestimosError;
      setEmprestimos(emprestimosData || []);

      // Fetch available books
      const { data: livrosData, error: livrosError } = await supabase
        .from('livros')
        .select('id, titulo, autor, disponivel')
        .eq('disponivel', true)
        .order('titulo');

      if (livrosError) throw livrosError;
      setLivrosDisponiveis(livrosData || []);

      // Fetch users
      const { data: usuariosData, error: usuariosError } = await supabase
        .from('usuarios_biblioteca')
        .select('id, nome, email')
        .order('nome');

      if (usuariosError) throw usuariosError;
      setUsuarios(usuariosData || []);

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

  const handleCreateEmprestimo = async () => {
    if (!selectedLivro || !selectedUsuario) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Selecione um livro e um usuário.',
      });
      return;
    }

    setSaving(true);
    try {
      // Create loan
      const { error: empError } = await supabase
        .from('emprestimos')
        .insert({
          livro_id: selectedLivro,
          usuario_id: selectedUsuario,
        });

      if (empError) throw empError;

      // Update book availability
      const { error: livroError } = await supabase
        .from('livros')
        .update({ disponivel: false })
        .eq('id', selectedLivro);

      if (livroError) throw livroError;

      toast({ title: 'Sucesso', description: 'Empréstimo registrado com sucesso.' });
      setIsDialogOpen(false);
      setSelectedLivro('');
      setSelectedUsuario('');
      fetchData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível registrar o empréstimo.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDevolucao = async (emprestimo: Emprestimo) => {
    try {
      // Update loan
      const { error: empError } = await supabase
        .from('emprestimos')
        .update({
          data_devolucao_real: new Date().toISOString(),
          status: 'devolvido',
        })
        .eq('id', emprestimo.id);

      if (empError) throw empError;

      // Update book availability
      const { error: livroError } = await supabase
        .from('livros')
        .update({ disponivel: true })
        .eq('id', emprestimo.livro_id);

      if (livroError) throw livroError;

      toast({ title: 'Sucesso', description: 'Devolução registrada com sucesso.' });
      fetchData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível registrar a devolução.',
      });
    }
  };

  const isAtrasado = (emprestimo: Emprestimo) => {
    return emprestimo.status === 'ativo' && isPast(new Date(emprestimo.data_devolucao_prevista));
  };

  const getStatusBadge = (emprestimo: Emprestimo) => {
    if (emprestimo.status === 'devolvido') {
      return <Badge variant="secondary">Devolvido</Badge>;
    }
    if (isAtrasado(emprestimo)) {
      return <Badge variant="destructive">Atrasado</Badge>;
    }
    return <Badge variant="default">Ativo</Badge>;
  };

  const emprestimosAtivos = emprestimos.filter((e) => e.status === 'ativo');
  const emprestimosHistorico = emprestimos.filter((e) => e.status === 'devolvido');

  const renderTable = (data: Emprestimo[], showDevolucao: boolean) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Livro</TableHead>
            <TableHead>Usuário</TableHead>
            <TableHead>Data Empréstimo</TableHead>
            <TableHead>Devolução Prevista</TableHead>
            {!showDevolucao && <TableHead>Devolução Real</TableHead>}
            <TableHead>Status</TableHead>
            {showDevolucao && canManageLoans && <TableHead className="text-right">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((emprestimo) => (
            <TableRow key={emprestimo.id} className={isAtrasado(emprestimo) ? 'bg-destructive/5' : ''}>
              <TableCell>
                <div>
                  <p className="font-medium">{emprestimo.livros?.titulo}</p>
                  <p className="text-sm text-muted-foreground">{emprestimo.livros?.autor}</p>
                </div>
              </TableCell>
              <TableCell>
                <div>
                  <p className="font-medium">{emprestimo.usuarios_biblioteca?.nome}</p>
                  <p className="text-sm text-muted-foreground">{emprestimo.usuarios_biblioteca?.email}</p>
                </div>
              </TableCell>
              <TableCell>
                {format(new Date(emprestimo.data_emprestimo), 'dd/MM/yyyy', { locale: ptBR })}
              </TableCell>
              <TableCell>
                {format(new Date(emprestimo.data_devolucao_prevista), 'dd/MM/yyyy', { locale: ptBR })}
              </TableCell>
              {!showDevolucao && (
                <TableCell>
                  {emprestimo.data_devolucao_real
                    ? format(new Date(emprestimo.data_devolucao_real), 'dd/MM/yyyy', { locale: ptBR })
                    : '-'}
                </TableCell>
              )}
              <TableCell>{getStatusBadge(emprestimo)}</TableCell>
              {showDevolucao && canManageLoans && (
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDevolucao(emprestimo)}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Devolver
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <MainLayout title="Empréstimos">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="flex items-center gap-2">
              <BookMarked className="w-5 h-5" />
              Gerenciamento de Empréstimos
            </CardTitle>
            {canManageLoans && (
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Empréstimo
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Novo Empréstimo</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Livro</Label>
                      <Select value={selectedLivro} onValueChange={setSelectedLivro}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um livro" />
                        </SelectTrigger>
                        <SelectContent>
                          {livrosDisponiveis.map((livro) => (
                            <SelectItem key={livro.id} value={livro.id}>
                              {livro.titulo} - {livro.autor}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Usuário</Label>
                      <Select value={selectedUsuario} onValueChange={setSelectedUsuario}>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione um usuário" />
                        </SelectTrigger>
                        <SelectContent>
                          {usuarios.map((usuario) => (
                            <SelectItem key={usuario.id} value={usuario.id}>
                              {usuario.nome} ({usuario.email})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      O prazo de devolução será de 14 dias a partir de hoje.
                    </p>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button onClick={handleCreateEmprestimo} disabled={saving}>
                      {saving ? 'Registrando...' : 'Registrar Empréstimo'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : emprestimos.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              Nenhum empréstimo registrado
            </p>
          ) : (
            <Tabs defaultValue="ativos">
              <TabsList className="mb-4">
                <TabsTrigger value="ativos" className="gap-2">
                  <AlertTriangle className="w-4 h-4" />
                  Ativos ({emprestimosAtivos.length})
                </TabsTrigger>
                <TabsTrigger value="historico" className="gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Histórico ({emprestimosHistorico.length})
                </TabsTrigger>
              </TabsList>
              <TabsContent value="ativos">
                {emprestimosAtivos.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum empréstimo ativo
                  </p>
                ) : (
                  renderTable(emprestimosAtivos, true)
                )}
              </TabsContent>
              <TabsContent value="historico">
                {emprestimosHistorico.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    Nenhum empréstimo no histórico
                  </p>
                ) : (
                  renderTable(emprestimosHistorico, false)
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
