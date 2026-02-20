import { useEffect, useState, useCallback, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import {
  Plus,
  BookMarked,
  CheckCircle,
  AlertTriangle,
  Search,
  Download,
  CalendarIcon,
  Inbox,
  XCircle,
} from 'lucide-react';
import { format, isPast, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

function formatDateBR(value) {
  if (!value) return '-';
  try {
    return format(new Date(value), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return '-';
  }
}

export default function Emprestimos() {
  const [emprestimos, setEmprestimos] = useState([]);
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [livrosDisponiveis, setLivrosDisponiveis] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedLivro, setSelectedLivro] = useState('');
  const [selectedUsuario, setSelectedUsuario] = useState('');
  const [dataDevolucao, setDataDevolucao] = useState(undefined);
  const [saving, setSaving] = useState(false);
  const [searchUsuario, setSearchUsuario] = useState('');
  const [searchLivro, setSearchLivro] = useState('');
  const [respostaPorSolicitacao, setRespostaPorSolicitacao] = useState({});

  const { isGestor, isBibliotecaria } = useAuth();
  const { toast } = useToast();
  const canManageLoans = isGestor || isBibliotecaria;

  const fetchData = useCallback(async () => {
    try {
      const [emprestimosRes, livrosRes, usuariosRes, solicitacoesRes] = await Promise.all([
        supabase
          .from('emprestimos')
          .select('*, livros(titulo, autor), usuarios_biblioteca(nome, email)')
          .order('data_emprestimo', { ascending: false }),
        supabase.from('livros').select('id, titulo, autor, disponivel').eq('disponivel', true).order('titulo'),
        supabase.from('usuarios_biblioteca').select('id, nome, email').order('nome'),
        canManageLoans
          ? supabase
              .from('solicitacoes_emprestimo')
              .select('*, livros(id, titulo, autor, disponivel), usuarios_biblioteca(nome, email)')
              .order('created_at', { ascending: false })
          : Promise.resolve({ data: [], error: null }),
      ]);

      const maybeError = [emprestimosRes.error, livrosRes.error, usuariosRes.error, solicitacoesRes.error].find(Boolean);
      if (maybeError) throw maybeError;

      setEmprestimos(emprestimosRes.data || []);
      setLivrosDisponiveis(livrosRes.data || []);
      setUsuarios(usuariosRes.data || []);
      setSolicitacoes(solicitacoesRes.data || []);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível carregar os dados.' });
    } finally {
      setLoading(false);
    }
  }, [canManageLoans, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRealtimeChange = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useRealtimeSubscription({ table: 'emprestimos', onChange: handleRealtimeChange });
  useRealtimeSubscription({ table: 'livros', onChange: handleRealtimeChange });
  useRealtimeSubscription({ table: 'usuarios_biblioteca', onChange: handleRealtimeChange });
  useRealtimeSubscription({ table: 'solicitacoes_emprestimo', onChange: handleRealtimeChange });

  const handleCreateEmprestimo = async () => {
    if (!selectedLivro || !selectedUsuario) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Selecione um livro e um usuário.' });
      return;
    }

    setSaving(true);
    try {
      const insertData = {
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
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível registrar o empréstimo.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDevolucao = async (emprestimo) => {
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
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível registrar a devolução.' });
    }
  };

  const handleAprovarSolicitacao = async (solicitacao) => {
    if (!canManageLoans || solicitacao.status !== 'pendente') return;

    setSaving(true);
    let emprestimoCriadoId = null;
    try {
      if (!solicitacao?.livros?.disponivel) {
        throw new Error('Este livro não está disponível para empréstimo no momento.');
      }

      const { data: novoEmprestimo, error: empError } = await supabase
        .from('emprestimos')
        .insert({ livro_id: solicitacao.livro_id, usuario_id: solicitacao.usuario_id })
        .select('id')
        .single();

      if (empError) throw empError;
      emprestimoCriadoId = novoEmprestimo?.id || null;

      const { error: livroError } = await supabase.from('livros').update({ disponivel: false }).eq('id', solicitacao.livro_id);
      if (livroError) throw livroError;

      const resposta = (respostaPorSolicitacao[solicitacao.id] || '').trim() || 'Solicitação aprovada pela biblioteca.';

      const { error: solicitacaoError } = await supabase
        .from('solicitacoes_emprestimo')
        .update({ status: 'aprovada', resposta })
        .eq('id', solicitacao.id);
      if (solicitacaoError) throw solicitacaoError;

      toast({ title: 'Solicitação aprovada', description: 'Empréstimo criado e aluno notificado.' });
      setRespostaPorSolicitacao((prev) => ({ ...prev, [solicitacao.id]: '' }));
      fetchData();
    } catch (error) {
      if (emprestimoCriadoId) {
        await supabase.from('emprestimos').delete().eq('id', emprestimoCriadoId);
      }
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível aprovar a solicitação.' });
    } finally {
      setSaving(false);
    }
  };

  const handleRecusarSolicitacao = async (solicitacao) => {
    if (!canManageLoans || solicitacao.status !== 'pendente') return;

    setSaving(true);
    try {
      const resposta = (respostaPorSolicitacao[solicitacao.id] || '').trim() || 'Solicitação recusada pela biblioteca.';

      const { error } = await supabase
        .from('solicitacoes_emprestimo')
        .update({ status: 'recusada', resposta })
        .eq('id', solicitacao.id);
      if (error) throw error;

      toast({ title: 'Solicitação recusada' });
      setRespostaPorSolicitacao((prev) => ({ ...prev, [solicitacao.id]: '' }));
      fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível recusar a solicitação.' });
    } finally {
      setSaving(false);
    }
  };

  const handleExportarExcel = () => {
    const headers = ['Livro', 'Autor', 'Usuário', 'Email', 'Data Empréstimo', 'Devolução Prevista', 'Devolução Real', 'Status'];
    const data = emprestimos.map((e) => [
      e.livros?.titulo || '-',
      e.livros?.autor || '-',
      e.usuarios_biblioteca?.nome || '-',
      e.usuarios_biblioteca?.email || '-',
      formatDateBR(e.data_emprestimo),
      formatDateBR(e.data_devolucao_prevista),
      e.data_devolucao_real ? formatDateBR(e.data_devolucao_real) : '-',
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
    const data = emprestimos.map((e) => [
      e.livros?.titulo || '-',
      e.usuarios_biblioteca?.nome || '-',
      formatDateBR(e.data_emprestimo),
      formatDateBR(e.data_devolucao_prevista),
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

  const isAtrasado = (emprestimo) => emprestimo.status === 'ativo' && isPast(new Date(emprestimo.data_devolucao_prevista));

  const getStatusBadge = (emprestimo) => {
    if (emprestimo.status === 'devolvido') return <Badge variant="secondary">Devolvido</Badge>;
    if (isAtrasado(emprestimo)) return <Badge variant="destructive">Atrasado</Badge>;
    return <Badge>Ativo</Badge>;
  };

  const getStatusSolicitacaoBadge = (status) => {
    if (status === 'aprovada') return <Badge>Aprovada</Badge>;
    if (status === 'recusada') return <Badge variant="destructive">Recusada</Badge>;
    return <Badge variant="secondary">Pendente</Badge>;
  };

  const emprestimosAtivos = emprestimos.filter((e) => e.status === 'ativo');
  const emprestimosHistorico = emprestimos.filter((e) => e.status === 'devolvido');
  const solicitacoesPendentes = useMemo(
    () => solicitacoes.filter((s) => s.status === 'pendente'),
    [solicitacoes],
  );

  const filteredUsuarios = usuarios.filter(
    (u) => u.nome.toLowerCase().includes(searchUsuario.toLowerCase()) || u.email.toLowerCase().includes(searchUsuario.toLowerCase()),
  );

  const filteredLivrosDialog = livrosDisponiveis.filter(
    (l) => l.titulo.toLowerCase().includes(searchLivro.toLowerCase()) || l.autor.toLowerCase().includes(searchLivro.toLowerCase()),
  );

  const today = new Date();
  const maxDate = addMonths(today, 1);

  const renderTable = (data, showDevolucao) => (
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
                <p className="font-medium">{emprestimo.livros?.titulo}</p>
                <p className="text-sm text-muted-foreground">{emprestimo.livros?.autor}</p>
              </TableCell>
              <TableCell>
                <p className="font-medium">{emprestimo.usuarios_biblioteca?.nome}</p>
                <p className="text-sm text-muted-foreground">{emprestimo.usuarios_biblioteca?.email}</p>
              </TableCell>
              <TableCell>{formatDateBR(emprestimo.data_emprestimo)}</TableCell>
              <TableCell>{formatDateBR(emprestimo.data_devolucao_prevista)}</TableCell>
              {!showDevolucao && <TableCell>{emprestimo.data_devolucao_real ? formatDateBR(emprestimo.data_devolucao_real) : '-'}</TableCell>}
              <TableCell>{getStatusBadge(emprestimo)}</TableCell>
              {showDevolucao && canManageLoans && (
                <TableCell className="text-right">
                  <Button size="sm" variant="outline" onClick={() => handleDevolucao(emprestimo)}>
                    <CheckCircle className="w-4 h-4 mr-2" /> Devolver
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
              <BookMarked className="w-5 h-5" /> Gerenciamento de Empréstimos
            </CardTitle>

            {canManageLoans && (
              <div className="flex flex-wrap gap-2">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" /> Exportar dados
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

                <Dialog
                  open={isDialogOpen}
                  onOpenChange={(open) => {
                    setIsDialogOpen(open);
                    if (!open) {
                      setSearchUsuario('');
                      setSearchLivro('');
                      setSelectedUsuario('');
                      setSelectedLivro('');
                      setDataDevolucao(undefined);
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="w-4 h-4 mr-2" /> Novo Empréstimo
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>Novo Empréstimo</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4 py-4">
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
                            <span className="text-sm font-medium">{usuarios.find((u) => u.id === selectedUsuario)?.nome}</span>
                            <Button variant="ghost" size="sm" onClick={() => { setSelectedUsuario(''); setSearchUsuario(''); }}>
                              Trocar
                            </Button>
                          </div>
                        ) : searchUsuario.length >= 2 ? (
                          <div className="max-h-40 overflow-y-auto border rounded-md">
                            {filteredUsuarios.length === 0 ? (
                              <p className="text-sm text-muted-foreground p-3">Nenhum usuário encontrado</p>
                            ) : (
                              filteredUsuarios.slice(0, 10).map((u) => (
                                <button
                                  key={u.id}
                                  className="w-full text-left px-3 py-2 hover:bg-accent text-sm transition-colors"
                                  onClick={() => {
                                    setSelectedUsuario(u.id);
                                    setSearchUsuario(u.nome);
                                  }}
                                >
                                  <p className="font-medium">{u.nome}</p>
                                  <p className="text-xs text-muted-foreground">{u.email}</p>
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>

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
                            <span className="text-sm font-medium">{livrosDisponiveis.find((l) => l.id === selectedLivro)?.titulo}</span>
                            <Button variant="ghost" size="sm" onClick={() => { setSelectedLivro(''); setSearchLivro(''); }}>
                              Trocar
                            </Button>
                          </div>
                        ) : searchLivro.length >= 2 ? (
                          <div className="max-h-40 overflow-y-auto border rounded-md">
                            {filteredLivrosDialog.length === 0 ? (
                              <p className="text-sm text-muted-foreground p-3">Nenhum livro disponível encontrado</p>
                            ) : (
                              filteredLivrosDialog.slice(0, 10).map((l) => (
                                <button
                                  key={l.id}
                                  className="w-full text-left px-3 py-2 hover:bg-accent text-sm transition-colors"
                                  onClick={() => {
                                    setSelectedLivro(l.id);
                                    setSearchLivro(l.titulo);
                                  }}
                                >
                                  <p className="font-medium">{l.titulo}</p>
                                  <p className="text-xs text-muted-foreground">{l.autor}</p>
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>

                      <div className="space-y-2">
                        <Label>Data de Devolução</Label>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              className={cn('w-full justify-start text-left font-normal', !dataDevolucao && 'text-muted-foreground')}
                            >
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {dataDevolucao ? format(dataDevolucao, 'dd/MM/yyyy', { locale: ptBR }) : 'Selecione a data (máx. 1 mês)'}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={dataDevolucao}
                              onSelect={setDataDevolucao}
                              disabled={(date) => date < today || date > maxDate}
                              initialFocus
                              className={cn('p-3 pointer-events-auto')}
                              locale={ptBR}
                            />
                          </PopoverContent>
                        </Popover>
                        <p className="text-xs text-muted-foreground">Máximo de 1 mês a partir de hoje. Se não selecionada, será 14 dias.</p>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                      <Button onClick={handleCreateEmprestimo} disabled={saving}>{saving ? 'Registrando...' : 'Registrar Empréstimo'}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : emprestimos.length === 0 && (!canManageLoans || solicitacoes.length === 0) ? (
            <p className="text-center text-muted-foreground py-8">Nenhum dado de empréstimo registrado</p>
          ) : (
            <Tabs defaultValue={canManageLoans ? 'solicitacoes' : 'ativos'}>
              <TabsList className="mb-4 flex flex-wrap h-auto gap-2">
                {canManageLoans && (
                  <TabsTrigger value="solicitacoes" className="gap-2">
                    <Inbox className="w-4 h-4" /> Solicitações ({solicitacoesPendentes.length})
                  </TabsTrigger>
                )}
                <TabsTrigger value="ativos" className="gap-2">
                  <AlertTriangle className="w-4 h-4" /> Ativos ({emprestimosAtivos.length})
                </TabsTrigger>
                <TabsTrigger value="historico" className="gap-2">
                  <CheckCircle className="w-4 h-4" /> Histórico ({emprestimosHistorico.length})
                </TabsTrigger>
              </TabsList>

              {canManageLoans && (
                <TabsContent value="solicitacoes">
                  {solicitacoes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Nenhuma solicitação de aluno no momento.</p>
                  ) : (
                    <div className="space-y-3">
                      {solicitacoes.map((solicitacao) => {
                        const isPendente = solicitacao.status === 'pendente';
                        return (
                          <div key={solicitacao.id} className="border rounded-lg p-4 space-y-3">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                              <div>
                                <p className="font-medium">{solicitacao.livros?.titulo || 'Livro'}</p>
                                <p className="text-sm text-muted-foreground">{solicitacao.livros?.autor || '-'}</p>
                                <p className="text-xs text-muted-foreground">
                                  Aluno: {solicitacao.usuarios_biblioteca?.nome || '-'} • {formatDateBR(solicitacao.created_at)}
                                </p>
                              </div>
                              <div>{getStatusSolicitacaoBadge(solicitacao.status)}</div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Mensagem do aluno</p>
                                <p className="text-sm rounded-md border p-2 min-h-[52px] bg-muted/30">{solicitacao.mensagem || 'Sem mensagem.'}</p>
                              </div>
                              <div>
                                <Label htmlFor={`resposta-${solicitacao.id}`}>Resposta da biblioteca</Label>
                                <Textarea
                                  id={`resposta-${solicitacao.id}`}
                                  rows={2}
                                  placeholder="Escreva uma resposta para o aluno..."
                                  value={respostaPorSolicitacao[solicitacao.id] ?? solicitacao.resposta ?? ''}
                                  onChange={(e) =>
                                    setRespostaPorSolicitacao((prev) => ({
                                      ...prev,
                                      [solicitacao.id]: e.target.value,
                                    }))
                                  }
                                  disabled={!isPendente || saving}
                                />
                              </div>
                            </div>

                            {isPendente ? (
                              <div className="flex flex-wrap justify-end gap-2">
                                <Button
                                  variant="outline"
                                  disabled={saving}
                                  onClick={() => handleRecusarSolicitacao(solicitacao)}
                                >
                                  <XCircle className="w-4 h-4 mr-2" /> Recusar
                                </Button>
                                <Button disabled={saving} onClick={() => handleAprovarSolicitacao(solicitacao)}>
                                  <CheckCircle className="w-4 h-4 mr-2" /> Aprovar e gerar empréstimo
                                </Button>
                              </div>
                            ) : (
                              <p className="text-xs text-muted-foreground">Solicitação finalizada.</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </TabsContent>
              )}

              <TabsContent value="ativos">
                {emprestimosAtivos.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum empréstimo ativo</p>
                ) : (
                  renderTable(emprestimosAtivos, true)
                )}
              </TabsContent>

              <TabsContent value="historico">
                {emprestimosHistorico.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum empréstimo no histórico</p>
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
