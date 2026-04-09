import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Check, CheckCircle, ChevronDown, ChevronUp, ChevronsUpDown, ClipboardList, Clock, Pencil, Plus, Star, Trash2 } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { deleteProfessorAtividade, fetchProfessorPainelData, saveProfessorAtividade, updateProfessorAtividadeStatus } from '@/services/professorService';

const emptyAtividade = {
  titulo: '',
  descricao: '',
  pontos_extras: 0,
  data_entrega: '',
  livro_id: '',
  aluno_id: '',
};

function formatAlunoOptionLabel(aluno) {
  if (!aluno) return '';
  return aluno.turma ? `${aluno.nome} (${aluno.turma})` : aluno.nome;
}

function SearchableSelect({
  items,
  value,
  onChange,
  placeholder,
  searchPlaceholder,
  emptyMessage,
  getItemValue,
  renderItem,
  renderSelected,
}) {
  const [open, setOpen] = useState(false);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === value) || null,
    [items, value],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between rounded-xl px-3 py-2 font-normal"
        >
          <span className={cn('truncate text-left', !selectedItem && 'text-muted-foreground')}>
            {selectedItem ? renderSelected(selectedItem) : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
        <Command shouldFilter>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {items.map((item) => (
                <CommandItem
                  key={item.id}
                  value={getItemValue(item)}
                  onSelect={() => {
                    onChange(item.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn('mr-2 h-4 w-4 shrink-0', value === item.id ? 'opacity-100' : 'opacity-0')} />
                  {renderItem(item)}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default function AtividadesLeitura() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [livros, setLivros] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [atividades, setAtividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAtividade, setEditingAtividade] = useState(null);
  const [formData, setFormData] = useState(emptyAtividade);
  const [filterStatus, setFilterStatus] = useState('');
  const [deleteAtividade, setDeleteAtividade] = useState(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await fetchProfessorPainelData();
      setLivros(Array.isArray(data?.livros) ? data.livros : []);
      setUsuarios(Array.isArray(data?.usuarios) ? data.usuarios : []);
      setAtividades(Array.isArray(data?.atividades) ? data.atividades : []);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível carregar os dados.' });
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

  const handleOpenDialog = (atividade) => {
    if (atividade) {
      setEditingAtividade(atividade);
      setFormData({
        titulo: atividade.titulo,
        descricao: atividade.descricao || '',
        pontos_extras: atividade.pontos_extras || 0,
        data_entrega: atividade.data_entrega ? atividade.data_entrega.split('T')[0] : '',
        livro_id: atividade.livro_id || '',
        aluno_id: atividade.aluno_id || '',
      });
    } else {
      setEditingAtividade(null);
      setFormData(emptyAtividade);
    }
    setPreviewExpanded(!isMobile);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.titulo.trim() || !formData.aluno_id || !formData.livro_id) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Preencha todos os campos obrigatorios.' });
      return;
    }
    setSaving(true);
    try {
      await saveProfessorAtividade({
        titulo: formData.titulo,
        descricao: formData.descricao || null,
        pontos_extras: formData.pontos_extras || 0,
        data_entrega: formData.data_entrega ? new Date(formData.data_entrega).toISOString() : null,
        livro_id: formData.livro_id,
        aluno_id: formData.aluno_id,
      }, editingAtividade?.id || null);
      toast({ title: 'Sucesso', description: editingAtividade ? 'Atividade atualizada!' : 'Atividade criada!' });
      setIsDialogOpen(false);
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível salvar a atividade.' });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (id, newStatus) => {
    try {
      await updateProfessorAtividadeStatus(id, newStatus);
      toast({ title: 'Sucesso', description: 'Status atualizado!' });
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível atualizar o status.' });
    }
  };

  const handleDelete = async (id) => {
    setSaving(true);
    try {
      await deleteProfessorAtividade(id);
      setDeleteAtividade(null);
      toast({ title: 'Sucesso', description: 'Atividade excluida.' });
      await fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'Não foi possível excluir.' });
    } finally {
      setSaving(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'concluido':
        return <Badge className="bg-success text-success-foreground">Concluido</Badge>;
      case 'em_andamento':
        return <Badge variant="secondary">Em Andamento</Badge>;
      default:
        return <Badge variant="outline">Pendente</Badge>;
    }
  };

  const filteredAtividades = filterStatus ? atividades.filter((item) => item.status === filterStatus) : atividades;
  const totalPontos = atividades.reduce((acc, item) => acc + (item.pontos_extras || 0), 0);
  const concluidas = atividades.filter((item) => item.status === 'concluido').length;
  const pendentes = atividades.filter((item) => item.status === 'pendente').length;
  const alunoSelecionado = useMemo(
    () => usuarios.find((item) => item.id === formData.aluno_id) || null,
    [formData.aluno_id, usuarios],
  );
  const livroSelecionado = useMemo(
    () => livros.find((item) => item.id === formData.livro_id) || null,
    [formData.livro_id, livros],
  );

  return (
    <MainLayout title="Atividades de Leitura">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card><CardContent className="p-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center"><ClipboardList className="w-6 h-6 text-primary" /></div><div><p className="text-sm text-muted-foreground">Total de Atividades</p><p className="text-2xl font-bold">{atividades.length}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center"><CheckCircle className="w-6 h-6 text-success" /></div><div><p className="text-sm text-muted-foreground">Concluidas</p><p className="text-2xl font-bold">{concluidas}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center"><Clock className="w-6 h-6 text-warning" /></div><div><p className="text-sm text-muted-foreground">Pendentes</p><p className="text-2xl font-bold">{pendentes}</p></div></div></CardContent></Card>
          <Card><CardContent className="p-6"><div className="flex items-center gap-4"><div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center"><Star className="w-6 h-6 text-secondary" /></div><div><p className="text-sm text-muted-foreground">Pontos Distribuidos</p><p className="text-2xl font-bold">{totalPontos}</p></div></div></CardContent></Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5" />Gerenciar Atividades</CardTitle>
                <CardDescription>Crie atividades como resenhas, resumos e atribua pontos aos alunos</CardDescription>
              </div>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Select value={filterStatus || 'all'} onValueChange={(v) => setFilterStatus(v === 'all' ? '' : v)}>
                  <SelectTrigger className="w-full sm:w-[150px]"><SelectValue placeholder="Filtrar status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="concluido">Concluido</SelectItem>
                  </SelectContent>
                </Select>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild><Button className="w-full sm:w-auto" onClick={() => handleOpenDialog()}><Plus className="w-4 h-4 mr-2" />Nova Atividade</Button></DialogTrigger>
                  <DialogContent className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto rounded-2xl p-4 sm:p-6">
                    <DialogHeader><DialogTitle>{editingAtividade ? 'Editar Atividade' : 'Nova Atividade'}</DialogTitle><DialogDescription>Crie uma atividade de leitura para um aluno</DialogDescription></DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2"><Label>Titulo da Atividade *</Label><Input value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Descricao</Label><Textarea value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} rows={3} /></div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label>Aluno *</Label>
                          <SearchableSelect
                            items={usuarios}
                            value={formData.aluno_id}
                            onChange={(aluno_id) => setFormData({ ...formData, aluno_id })}
                            placeholder="Selecione um aluno"
                            searchPlaceholder="Pesquisar aluno por nome ou turma..."
                            emptyMessage="Nenhum aluno encontrado."
                            getItemValue={(item) => `${item.nome || ''} ${item.turma || ''}`.trim()}
                            renderSelected={(item) => formatAlunoOptionLabel(item)}
                            renderItem={(item) => (
                              <div className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate">{item.nome || 'Aluno sem nome'}</span>
                                {item.turma ? <span className="text-xs text-muted-foreground">Turma {item.turma}</span> : null}
                              </div>
                            )}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Livro *</Label>
                          <SearchableSelect
                            items={livros}
                            value={formData.livro_id}
                            onChange={(livro_id) => setFormData({ ...formData, livro_id })}
                            placeholder="Selecione um livro"
                            searchPlaceholder="Pesquisar livro por titulo ou autor..."
                            emptyMessage="Nenhum livro encontrado."
                            getItemValue={(item) => `${item.titulo || ''} ${item.autor || ''}`.trim()}
                            renderSelected={(item) => item.titulo || 'Livro sem titulo'}
                            renderItem={(item) => (
                              <div className="flex min-w-0 flex-1 flex-col">
                                <span className="truncate">{item.titulo || 'Livro sem titulo'}</span>
                                {item.autor ? <span className="text-xs text-muted-foreground">{item.autor}</span> : null}
                              </div>
                            )}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="space-y-2"><Label>Pontos Extras</Label><Input type="number" min="0" value={formData.pontos_extras} onChange={(e) => setFormData({ ...formData, pontos_extras: parseInt(e.target.value, 10) || 0 })} /></div>
                        <div className="space-y-2"><Label>Data de Entrega</Label><Input type="date" value={formData.data_entrega} onChange={(e) => setFormData({ ...formData, data_entrega: e.target.value })} /></div>
                      </div>
                      <Collapsible open={previewExpanded} onOpenChange={setPreviewExpanded}>
                        <div className="rounded-2xl border bg-muted/30 p-4">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold">Previa da atividade</p>
                              <p className="text-xs text-muted-foreground">
                                {previewExpanded ? 'Confira os detalhes antes de salvar.' : 'Toque para expandir a visualizacao.'}
                              </p>
                            </div>
                            <CollapsibleTrigger asChild>
                              <Button type="button" variant="ghost" size="sm" className="shrink-0">
                                {previewExpanded ? 'Retrair' : 'Expandir'}
                                {previewExpanded ? <ChevronUp className="ml-2 h-4 w-4" /> : <ChevronDown className="ml-2 h-4 w-4" />}
                              </Button>
                            </CollapsibleTrigger>
                          </div>
                          <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
                            <div className="rounded-xl bg-background p-3">
                              <p className="font-medium text-foreground">Aluno</p>
                              <p className="mt-1 line-clamp-2">{alunoSelecionado ? formatAlunoOptionLabel(alunoSelecionado) : 'Nao selecionado'}</p>
                            </div>
                            <div className="rounded-xl bg-background p-3">
                              <p className="font-medium text-foreground">Livro</p>
                              <p className="mt-1 line-clamp-2">{livroSelecionado?.titulo || 'Nao selecionado'}</p>
                            </div>
                            <div className="rounded-xl bg-background p-3">
                              <p className="font-medium text-foreground">Entrega</p>
                              <p className="mt-1">{formData.data_entrega ? format(new Date(`${formData.data_entrega}T12:00:00`), 'dd/MM/yyyy', { locale: ptBR }) : 'Sem data'}</p>
                            </div>
                            <div className="rounded-xl bg-background p-3">
                              <p className="font-medium text-foreground">Pontos</p>
                              <p className="mt-1">{formData.pontos_extras || 0} extra</p>
                            </div>
                          </div>
                          <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
                            <div className="mt-3 rounded-xl bg-background p-4">
                              <p className="text-sm font-semibold text-foreground">
                                {formData.titulo?.trim() || 'Titulo da atividade'}
                              </p>
                              <p className="mt-2 text-sm text-muted-foreground whitespace-pre-wrap">
                                {formData.descricao?.trim() || 'A descricao da atividade vai aparecer aqui para facilitar a revisao antes de salvar.'}
                              </p>
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    </div>
                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                      <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : filteredAtividades.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhuma atividade encontrada</p>
            ) : (
              isMobile ? (
                <div className="space-y-3">
                  {filteredAtividades.map((atividade) => (
                    <div key={atividade.id} className="rounded-2xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">{atividade.titulo}</p>
                          <p className="text-sm text-muted-foreground">{atividade.usuarios_biblioteca?.nome || 'N/A'}</p>
                        </div>
                        {getStatusBadge(atividade.status)}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                        <div className="rounded-xl bg-muted/40 p-3">
                          <p className="font-medium text-foreground">Turma</p>
                          <p className="mt-1">{atividade.usuarios_biblioteca?.turma || '-'}</p>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-3">
                          <p className="font-medium text-foreground">Livro</p>
                          <p className="mt-1 line-clamp-2">{atividade.livros?.titulo || 'N/A'}</p>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-3">
                          <p className="font-medium text-foreground">Pontos</p>
                          <p className="mt-1">{atividade.pontos_extras || 0}</p>
                        </div>
                        <div className="rounded-xl bg-muted/40 p-3">
                          <p className="font-medium text-foreground">Entrega</p>
                          <p className="mt-1">{atividade.data_entrega ? format(new Date(atividade.data_entrega), 'dd/MM/yyyy', { locale: ptBR }) : '-'}</p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        {atividade.status !== 'concluido' && (
                          <Button variant="outline" size="sm" onClick={() => handleUpdateStatus(atividade.id, 'concluido')}>
                            <CheckCircle className="mr-2 h-4 w-4 text-success" />
                            Concluir
                          </Button>
                        )}
                        <Button variant="outline" size="sm" onClick={() => handleOpenDialog(atividade)}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Editar
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => setDeleteAtividade(atividade)}>
                          <Trash2 className="mr-2 h-4 w-4 text-destructive" />
                          Excluir
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Atividade</TableHead>
                        <TableHead>Aluno</TableHead>
                        <TableHead>Turma</TableHead>
                        <TableHead>Livro</TableHead>
                        <TableHead>Pontos</TableHead>
                        <TableHead>Entrega</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Acoes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredAtividades.map((atividade) => (
                        <TableRow key={atividade.id}>
                          <TableCell className="font-medium">{atividade.titulo}</TableCell>
                          <TableCell>{atividade.usuarios_biblioteca?.nome || 'N/A'}</TableCell>
                          <TableCell>{atividade.usuarios_biblioteca?.turma || '-'}</TableCell>
                          <TableCell>{atividade.livros?.titulo || 'N/A'}</TableCell>
                          <TableCell><Badge variant="outline" className="gap-1"><Star className="w-3 h-3" />{atividade.pontos_extras || 0}</Badge></TableCell>
                          <TableCell>{atividade.data_entrega ? format(new Date(atividade.data_entrega), 'dd/MM/yyyy', { locale: ptBR }) : '-'}</TableCell>
                          <TableCell>{getStatusBadge(atividade.status)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              {atividade.status !== 'concluido' && <Button variant="ghost" size="icon" title="Marcar como concluido" onClick={() => handleUpdateStatus(atividade.id, 'concluido')}><CheckCircle className="w-4 h-4 text-success" /></Button>}
                              <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(atividade)}><Pencil className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" onClick={() => setDeleteAtividade(atividade)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )
            )}
          </CardContent>
        </Card>
        <AlertDialog open={Boolean(deleteAtividade)} onOpenChange={(open) => !open && setDeleteAtividade(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Excluir atividade?</AlertDialogTitle>
              <AlertDialogDescription>
                {deleteAtividade ? `A atividade "${deleteAtividade.titulo}" sera removida permanentemente.` : 'Esta atividade sera removida permanentemente.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
              <AlertDialogAction disabled={saving} onClick={() => deleteAtividade?.id && handleDelete(deleteAtividade.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {saving ? 'Excluindo...' : 'Excluir'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}
