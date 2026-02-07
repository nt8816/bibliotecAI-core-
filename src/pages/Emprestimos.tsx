import { useEffect, useState } from 'react';
import { useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Plus, BookMarked, CheckCircle, AlertTriangle, Search, Download, CalendarIcon } from 'lucide-react';
import { format, isPast, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

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
  const [dataDevolucao, setDataDevolucao] = useState<Date | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [searchUsuario, setSearchUsuario] = useState('');
  const [searchLivro, setSearchLivro] = useState('');
  
  const { isGestor, isBibliotecaria } = useAuth();
  const { toast } = useToast();
  
  const canManageLoans = isGestor || isBibliotecaria;

  useEffect(() => {
    fetchData();
  }, []);

  const handleRealtimeChange = useCallback(() => {
    fetchData();
  }, []);

  useRealtimeSubscription({ table: 'emprestimos', onChange: handleRealtimeChange });
  useRealtimeSubscription({ table: 'livros', onChange: handleRealtimeChange });

  const fetchData = async () => {
    try {
      const { data: emprestimosData, error: emprestimosError } = await supabase
        .from('emprestimos')
        .select(`*, livros(titulo, autor), usuarios_biblioteca(nome, email)`)
        .order('data_emprestimo', { ascending: false });

      if (emprestimosError) throw emprestimosError;
      setEmprestimos(emprestimosData || []);

      const { data: livrosData, error: livrosError } = await supabase
        .from('livros')
        .select('id, titulo, autor, disponivel')
        .eq('disponivel', true)
        .order('titulo');

      if (livrosError) throw livrosError;
      setLivrosDisponiveis(livrosData || []);

      const { data: usuariosData, error: usuariosError } = await supabase
        .from('usuarios_biblioteca')
        .select('id, nome, email')
        .order('nome');

      if (usuariosError) throw usuariosError;
      setUsuarios(usuariosData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível carregar os dados.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateEmprestimo = async () => {
    if (!selectedLivro || !selectedUsuario) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Selecione um livro e um usuário.' });
      return;
    }

    setSaving(true);
    try {
      const insertData: any = {
        livro_id: selectedLivro,
        usuario_id: selectedUsuario,
      };

      if (dataDevolucao) {
        insertData.data_devolucao_prevista = dataDevolucao.toISOString();
      }

      const { error: empError } = await supabase.from('emprestimos').insert(insertData);
      if (empError) throw empError;

      const { error: livroError } = await supabase.from('livros').update({ disponivel: false }).eq('id', selectedLivro);
      if (livroError) throw livroError;

      toast({ title: 'Sucesso', description: 'Empréstimo registrado com sucesso.' });
      setIsDialogOpen(false);
      setSelectedLivro('');
      setSelectedUsuario('');
      setDataDevolucao(undefined);
      setSearchUsuario('');
      setSearchLivro('');
      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível registrar o empréstimo.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDevolucao = async (emprestimo: Emprestimo) => {
    try {
      const { error: empError } = await supabase
        .from('emprestimos')
        .update({ data_devolucao_real: new Date().toISOString(), status: 'devolvido' })
        .eq('id', emprestimo.id);
      if (empError) throw empError;

      const { error: livroError } = await supabase.from('livros').update({ disponivel: true }).eq('id', emprestimo.livro_id);
      if (livroError) throw livroError;

      toast({ title: 'Sucesso', description: 'Devolução registrada com sucesso.' });
      fetchData();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível registrar a devolução.' });
    }
  };

  const handleExportarExcel = () => {
    const headers = ['Livro', 'Autor', 'Usuário', 'Email', 'Data Empréstimo', 'Devolução Prevista', 'Devolução Real', 'Status'];
    const data = emprestimos.map(e => [
      e.livros?.titulo || '-',
      e.livros?.autor || '-',
      e.usuarios_biblioteca?.nome || '-',
      e.usuarios_biblioteca?.email || '-',
      format(new Date(e.data_emprestimo), 'dd/MM/yyyy'),
      format(new Date(e.data_devolucao_prevista), 'dd/MM/yyyy'),
      e.data_devolucao_real ? format(new Date(e.data_devolucao_real), 'dd/MM/yyyy') : '-',
      e.status === 'ativo' ? (isPast(new Date(e.data_devolucao_prevista)) ? 'Atrasado' : 'Ativo') : 'Devolvido',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Empréstimos');
    XLSX.writeFile(wb, 'emprestimos.xlsx');
    toast({ title: 'Exportado!', description: 'Arquivo emprestimos.xlsx baixado.' });
  };

  const handleExportarPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('BibliotecAI - Empréstimos', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);

    const headers = ['Livro', 'Usuário', 'Empréstimo', 'Prev. Devolução', 'Status'];
    const data = emprestimos.map(e => [
      e.livros?.titulo || '-',
      e.usuarios_biblioteca?.nome || '-',
      format(new Date(e.data_emprestimo), 'dd/MM/yyyy'),
      format(new Date(e.data_devolucao_prevista), 'dd/MM/yyyy'),
      e.status === 'ativo' ? (isPast(new Date(e.data_devolucao_prevista)) ? 'Atrasado' : 'Ativo') : 'Devolvido',
    ]);

    autoTable(doc, {
      head: [headers],
      body: data,
      startY: 40,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [88, 86, 214] },
    });

    doc.save('emprestimos.pdf');
    toast({ title: 'Exportado!', description: 'Arquivo emprestimos.pdf baixado.' });
  };

  const isAtrasado = (emprestimo: Emprestimo) => {
    return emprestimo.status === 'ativo' && isPast(new Date(emprestimo.data_devolucao_prevista));
  };

  const getStatusBadge = (emprestimo: Emprestimo) => {
    if (emprestimo.status === 'devolvido') return <Badge variant="secondary">Devolvido</Badge>;
    if (isAtrasado(emprestimo)) return <Badge variant="destructive">Atrasado</Badge>;
    return <Badge variant="default">Ativo</Badge>;
  };

  const emprestimosAtivos = emprestimos.filter((e) => e.status === 'ativo');
  const emprestimosHistorico = emprestimos.filter((e) => e.status === 'devolvido');

  // Filtered lists for the dialog
  const filteredUsuarios = usuarios.filter(u =>
    u.nome.toLowerCase().includes(searchUsuario.toLowerCase()) ||
    u.email.toLowerCase().includes(searchUsuario.toLowerCase())
  );

  const filteredLivrosDialog = livrosDisponiveis.filter(l =>
    l.titulo.toLowerCase().includes(searchLivro.toLowerCase()) ||
    l.autor.toLowerCase().includes(searchLivro.toLowerCase())
  );

  const today = new Date();
  const maxDate = addMonths(today, 1);

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
                  <Button size="sm" variant="outline" onClick={() => handleDevolucao(emprestimo)}>
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
            <div className="flex flex-wrap gap-2">
              {canManageLoans && (
                <>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Download className="w-4 h-4 mr-2" />
                        Exportar
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-40 p-2" align="end">
                      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleExportarExcel}>
                        Excel (.xlsx)
                      </Button>
                      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleExportarPDF}>
                        PDF (.pdf)
                      </Button>
                    </PopoverContent>
                  </Popover>
                  <Dialog open={isDialogOpen} onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) {
                      setSearchUsuario('');
                      setSearchLivro('');
                      setSelectedUsuario('');
                      setSelectedLivro('');
                      setDataDevolucao(undefined);
                    }
                  }}>
                    <DialogTrigger asChild>
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        Novo Empréstimo
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Novo Empréstimo</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        {/* Student search */}
                        <div className="space-y-2">
                          <Label>Aluno / Usuário</Label>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              placeholder="Pesquisar por nome ou email..."
                              className="pl-9"
                              value={searchUsuario}
                              onChange={(e) => {
                                setSearchUsuario(e.target.value);
                                setSelectedUsuario('');
                              }}
                            />
                          </div>
                          {selectedUsuario ? (
                            <div className="flex items-center justify-between p-2 rounded-md bg-primary/10 border">
                              <span className="text-sm font-medium">
                                {usuarios.find(u => u.id === selectedUsuario)?.nome}
                              </span>
                              <Button variant="ghost" size="sm" onClick={() => { setSelectedUsuario(''); setSearchUsuario(''); }}>
                                Trocar
                              </Button>
                            </div>
                          ) : searchUsuario.length >= 2 ? (
                            <div className="max-h-40 overflow-y-auto border rounded-md">
                              {filteredUsuarios.length === 0 ? (
                                <p className="text-sm text-muted-foreground p-3">Nenhum usuário encontrado</p>
                              ) : (
                                filteredUsuarios.slice(0, 10).map(u => (
                                  <button
                                    key={u.id}
                                    className="w-full text-left px-3 py-2 hover:bg-accent text-sm transition-colors"
                                    onClick={() => { setSelectedUsuario(u.id); setSearchUsuario(u.nome); }}
                                  >
                                    <p className="font-medium">{u.nome}</p>
                                    <p className="text-xs text-muted-foreground">{u.email}</p>
                                  </button>
                                ))
                              )}
                            </div>
                          ) : null}
                        </div>

                        {/* Book selection */}
                        <div className="space-y-2">
                          <Label>Livro</Label>
                          <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                              placeholder="Pesquisar livro..."
                              className="pl-9"
                              value={searchLivro}
                              onChange={(e) => {
                                setSearchLivro(e.target.value);
                                setSelectedLivro('');
                              }}
                            />
                          </div>
                          {selectedLivro ? (
                            <div className="flex items-center justify-between p-2 rounded-md bg-primary/10 border">
                              <span className="text-sm font-medium">
                                {livrosDisponiveis.find(l => l.id === selectedLivro)?.titulo}
                              </span>
                              <Button variant="ghost" size="sm" onClick={() => { setSelectedLivro(''); setSearchLivro(''); }}>
                                Trocar
                              </Button>
                            </div>
                          ) : searchLivro.length >= 2 ? (
                            <div className="max-h-40 overflow-y-auto border rounded-md">
                              {filteredLivrosDialog.length === 0 ? (
                                <p className="text-sm text-muted-foreground p-3">Nenhum livro disponível encontrado</p>
                              ) : (
                                filteredLivrosDialog.slice(0, 10).map(l => (
                                  <button
                                    key={l.id}
                                    className="w-full text-left px-3 py-2 hover:bg-accent text-sm transition-colors"
                                    onClick={() => { setSelectedLivro(l.id); setSearchLivro(l.titulo); }}
                                  >
                                    <p className="font-medium">{l.titulo}</p>
                                    <p className="text-xs text-muted-foreground">{l.autor}</p>
                                  </button>
                                ))
                              )}
                            </div>
                          ) : null}
                        </div>

                        {/* Return date */}
                        <div className="space-y-2">
                          <Label>Data de Devolução</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                className={cn(
                                  "w-full justify-start text-left font-normal",
                                  !dataDevolucao && "text-muted-foreground"
                                )}
                              >
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {dataDevolucao ? format(dataDevolucao, "dd/MM/yyyy", { locale: ptBR }) : "Selecione a data (máx. 1 mês)"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0" align="start">
                              <Calendar
                                mode="single"
                                selected={dataDevolucao}
                                onSelect={setDataDevolucao}
                                disabled={(date) => date < today || date > maxDate}
                                initialFocus
                                className={cn("p-3 pointer-events-auto")}
                                locale={ptBR}
                              />
                            </PopoverContent>
                          </Popover>
                          <p className="text-xs text-muted-foreground">
                            Máximo de 1 mês a partir de hoje. Se não selecionada, será 14 dias.
                          </p>
                        </div>
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
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : emprestimos.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nenhum empréstimo registrado</p>
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
                  <p className="text-center text-muted-foreground py-8">Nenhum empréstimo ativo</p>
                ) : renderTable(emprestimosAtivos, true)}
              </TabsContent>
              <TabsContent value="historico">
                {emprestimosHistorico.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum empréstimo no histórico</p>
                ) : renderTable(emprestimosHistorico, false)}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
