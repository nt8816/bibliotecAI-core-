import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Check, CheckCircle, ChevronUp, ChevronsUpDown, ClipboardList, Clock, Download, ExternalLink, Link2, Paperclip, Pencil, Plus, Star, Trash2, Upload, X } from 'lucide-react';

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
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
import { deleteR2Object, getR2DownloadUrl, uploadFileToR2 } from '@/lib/r2Storage';
import { cn } from '@/lib/utils';
import { deleteProfessorAtividade, fetchProfessorPainelData, saveProfessorAtividade, updateProfessorAtividadeStatus } from '@/services/professorService';

const emptyAtividade = {
  titulo: '',
  descricao: '',
  pontos_extras: 0,
  data_entrega: '',
  livro_id: '',
  aluno_id: '',
  target_mode: 'aluno',
  turmas: [],
  materiais_apoio: [],
};

const MAX_MATERIAIS_BYTES = 1024 * 1024 * 1024;

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function formatBytes(value) {
  const size = Number(value || 0);
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function estimateMateriaisBytes(materiais) {
  return ensureArray(materiais).reduce((total, item) => {
    if (String(item?.tipo || '').toLowerCase() !== 'arquivo') return total;
    return total + Number(item?.tamanho || item?.size || 0);
  }, 0);
}

function normalizeLinkMaterial(value) {
  const titulo = String(value?.titulo || '').trim();
  const url = normalizeSupportUrl(value?.url);
  if (!url) return null;
  return {
    tipo: 'link',
    titulo: titulo || 'Link de apoio',
    url,
  };
}

function normalizeSupportUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/\//.test(raw)) return `https:${raw}`;

  const looksLikeDomain = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(?:[/:?#].*)?$/i.test(raw);
  if (looksLikeDomain && !/[\s<>]/.test(raw)) return `https://${raw}`;

  return '';
}

function formatMaterialLabel(material) {
  if (String(material?.tipo || '') === 'link') {
    return material?.titulo || material?.url || 'Link';
  }
  return material?.nome || 'Arquivo';
}

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
  const [turmasPermitidas, setTurmasPermitidas] = useState([]);
  const [escolaId, setEscolaId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAtividade, setEditingAtividade] = useState(null);
  const [formData, setFormData] = useState(emptyAtividade);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterTurma, setFilterTurma] = useState('all');
  const [deleteAtividade, setDeleteAtividade] = useState(null);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [selectedSupportFiles, setSelectedSupportFiles] = useState([]);
  const [supportLinkDraft, setSupportLinkDraft] = useState({ titulo: '', url: '' });

  const fetchData = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await fetchProfessorPainelData();
      setLivros(Array.isArray(data?.livros) ? data.livros : []);
      setUsuarios(Array.isArray(data?.usuarios) ? data.usuarios : []);
      setAtividades(Array.isArray(data?.atividades) ? data.atividades : []);
      setTurmasPermitidas(Array.isArray(data?.turmasPermitidas) ? data.turmasPermitidas : []);
      setEscolaId(String(data?.escolaId || '').trim());
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
        target_mode: 'aluno',
        turmas: ensureArray(atividade.turmas_alvo),
        materiais_apoio: ensureArray(atividade.materiais_apoio),
      });
    } else {
      setEditingAtividade(null);
      setFormData(emptyAtividade);
    }
    setSelectedSupportFiles([]);
    setSupportLinkDraft({ titulo: '', url: '' });
    setPreviewExpanded(!isMobile);
    setIsDialogOpen(true);
  };

  const toggleTurma = (turma, checked) => {
    setFormData((current) => ({
      ...current,
      turmas: checked
        ? [...new Set([...ensureArray(current.turmas), turma])]
        : ensureArray(current.turmas).filter((item) => item !== turma),
    }));
  };

  const handleSelectSupportFiles = (files) => {
    const incoming = Array.from(files || []);
    if (incoming.length === 0) return;

    setSelectedSupportFiles((prev) => {
      const knownKeys = new Set(prev.map((file) => `${file.name}-${file.size}-${file.lastModified}`));
      const dedupedIncoming = incoming.filter((file) => !knownKeys.has(`${file.name}-${file.size}-${file.lastModified}`));
      const nextFiles = [...prev, ...dedupedIncoming];
      const totalBytes = estimateMateriaisBytes(formData.materiais_apoio) + estimateMateriaisBytes(nextFiles);
      if (totalBytes > MAX_MATERIAIS_BYTES) {
        toast({
          variant: 'destructive',
          title: 'Limite excedido',
          description: 'Os materiais de apoio desta atividade nao podem ultrapassar 1 GB.',
        });
        return prev;
      }
      return nextFiles;
    });
  };

  const handleAddSupportLink = () => {
    const normalized = normalizeLinkMaterial(supportLinkDraft);
    if (!normalized) {
      toast({
        variant: 'destructive',
        title: 'Link invalido',
        description: 'Informe uma URL iniciando com http:// ou https://.',
      });
      return;
    }

    setFormData((current) => ({
      ...current,
      materiais_apoio: [...ensureArray(current.materiais_apoio), normalized],
    }));
    setSupportLinkDraft({ titulo: '', url: '' });
  };

  const handleRemoveMaterial = (indexToRemove) => {
    setFormData((current) => ({
      ...current,
      materiais_apoio: ensureArray(current.materiais_apoio).filter((_, index) => index !== indexToRemove),
    }));
  };

  const handleDownloadMaterial = async (material) => {
    try {
      if (String(material?.tipo || '') === 'link') {
        window.open(String(material?.url || ''), '_blank', 'noopener,noreferrer');
        return;
      }

      const objectKey = String(material?.object_key || material?.path || '').trim();
      if (!objectKey) throw new Error('Arquivo sem rota de download.');
      const downloadUrl = await getR2DownloadUrl(objectKey, String(material?.nome || 'arquivo'));
      window.open(downloadUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao abrir material',
        description: error?.message || 'Nao foi possivel acessar este material.',
      });
    }
  };

  const handleSave = async () => {
    if (isMobile && !previewExpanded) {
      setPreviewExpanded(true);
      return;
    }

    const requiresAluno = editingAtividade || formData.target_mode === 'aluno';
    if (!formData.titulo.trim() || !formData.livro_id || (requiresAluno && !formData.aluno_id)) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Preencha todos os campos obrigatorios.' });
      return;
    }
    if (!editingAtividade && formData.target_mode === 'turmas' && ensureArray(formData.turmas).length === 0) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Selecione ao menos uma turma.' });
      return;
    }
    if (!editingAtividade && formData.target_mode === 'todas_turmas' && turmasPermitidas.length === 0) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Nao ha turmas liberadas para publicar esta atividade.' });
      return;
    }

    const existingBytes = estimateMateriaisBytes(formData.materiais_apoio);
    const pendingBytes = estimateMateriaisBytes(selectedSupportFiles);
    if (existingBytes + pendingBytes > MAX_MATERIAIS_BYTES) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Os materiais de apoio nao podem ultrapassar 1 GB.' });
      return;
    }
    const linksInvalidos = ensureArray(formData.materiais_apoio)
      .filter((material) => String(material?.tipo || '').toLowerCase() === 'link')
      .filter((material) => !normalizeSupportUrl(material?.url || material?.public_url));
    if (linksInvalidos.length > 0) {
      toast({
        variant: 'destructive',
        title: 'Link invalido',
        description: 'Informe um link valido em Conteudos de apoio. Exemplo: https://youtube.com/...',
      });
      return;
    }
    if (selectedSupportFiles.length > 0 && (!escolaId || !user?.id)) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Nao foi possivel identificar o contexto do upload dos materiais.' });
      return;
    }

    setSaving(true);
    const uploadedMaterials = [];
    try {
      for (const file of selectedSupportFiles) {
        const upload = await uploadFileToR2({
          file,
          escolaId,
          ownerId: user?.id,
          scope: 'atividades-apoio',
        });
        uploadedMaterials.push({
          tipo: 'arquivo',
          nome: file.name,
          path: upload.objectKey,
          object_key: upload.objectKey,
          provider: upload.provider,
          public_url: upload.publicUrl,
          tamanho: file.size,
          mime_type: file.type || null,
          extensao: file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() || null : null,
        });
      }

      await saveProfessorAtividade({
        titulo: formData.titulo,
        descricao: formData.descricao || null,
        pontos_extras: formData.pontos_extras || 0,
        data_entrega: formData.data_entrega ? new Date(formData.data_entrega).toISOString() : null,
        livro_id: formData.livro_id,
        aluno_id: requiresAluno ? formData.aluno_id : null,
        target_mode: editingAtividade ? 'aluno' : formData.target_mode,
        turmas: editingAtividade ? [] : ensureArray(formData.turmas),
        materiais_apoio: [
          ...ensureArray(formData.materiais_apoio).map((material) => (
            String(material?.tipo || '').toLowerCase() === 'link'
              ? { ...material, url: normalizeSupportUrl(material?.url || material?.public_url) }
              : material
          )),
          ...uploadedMaterials,
        ],
      }, editingAtividade?.id || null);
      toast({ title: 'Sucesso', description: editingAtividade ? 'Atividade atualizada!' : 'Atividade criada!' });
      setIsDialogOpen(false);
      await fetchData();
    } catch (error) {
      await Promise.all(uploadedMaterials.map((material) => deleteR2Object(material.object_key).catch(() => null)));
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

  const filteredAtividades = atividades.filter((item) => {
    const matchesStatus = !filterStatus || item.status === filterStatus;
    const matchesTurma = filterTurma === 'all' || String(item?.usuarios_biblioteca?.turma || '').trim() === filterTurma;
    return matchesStatus && matchesTurma;
  });
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
  const materiaisApoioPreview = useMemo(
    () => [...ensureArray(formData.materiais_apoio), ...selectedSupportFiles.map((file) => ({ tipo: 'arquivo', nome: file.name, tamanho: file.size }))],
    [formData.materiais_apoio, selectedSupportFiles],
  );
  const selectedTurmasPreview = useMemo(() => {
    if (editingAtividade || formData.target_mode === 'aluno') {
      return alunoSelecionado?.turma ? [alunoSelecionado.turma] : [];
    }
    if (formData.target_mode === 'todas_turmas') return turmasPermitidas;
    return ensureArray(formData.turmas);
  }, [alunoSelecionado?.turma, editingAtividade, formData.target_mode, formData.turmas, turmasPermitidas]);
  const submitLabel = editingAtividade ? 'Salvar' : 'Publicar';

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
                <Select value={filterTurma} onValueChange={setFilterTurma}>
                  <SelectTrigger className="w-full sm:w-[180px]"><SelectValue placeholder="Filtrar sala" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as salas</SelectItem>
                    {turmasPermitidas.map((turma) => (
                      <SelectItem key={turma} value={turma}>{turma}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild><Button className="w-full sm:w-auto" onClick={() => handleOpenDialog()}><Plus className="w-4 h-4 mr-2" />Nova Atividade</Button></DialogTrigger>
                  <DialogContent className={cn(
                    'max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl overflow-y-auto rounded-2xl p-4 sm:p-6',
                    isMobile && !previewExpanded && 'pb-28',
                  )}>
                    <DialogHeader><DialogTitle>{editingAtividade ? 'Editar Atividade' : 'Nova Atividade'}</DialogTitle><DialogDescription>{editingAtividade ? 'Atualize a atividade selecionada.' : 'Crie uma atividade para um aluno, varias turmas ou todas as turmas liberadas.'}</DialogDescription></DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2"><Label>Titulo da Atividade *</Label><Input value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} /></div>
                      <div className="space-y-2"><Label>Descricao</Label><Textarea value={formData.descricao} onChange={(e) => setFormData({ ...formData, descricao: e.target.value })} rows={3} /></div>
                      {!editingAtividade && (
                        <div className="space-y-3 rounded-2xl border p-4">
                          <Label>Destino da atividade</Label>
                          <div className="grid gap-3 sm:grid-cols-3">
                            {[
                              { value: 'aluno', title: 'Aluno especifico', description: 'Escolha um aluno individualmente.' },
                              { value: 'turmas', title: 'Mais de uma turma', description: 'Publique em lote para varias salas.' },
                              { value: 'todas_turmas', title: 'Todas as turmas', description: 'Usa apenas as turmas liberadas para voce.' },
                            ].map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                onClick={() => setFormData((current) => ({ ...current, target_mode: option.value, aluno_id: option.value === 'aluno' ? current.aluno_id : '' }))}
                                className={cn(
                                  'rounded-2xl border p-4 text-left transition',
                                  formData.target_mode === option.value ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40',
                                )}
                              >
                                <p className="font-medium">{option.title}</p>
                                <p className="mt-1 text-xs text-muted-foreground">{option.description}</p>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        {(editingAtividade || formData.target_mode === 'aluno') ? (
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
                        ) : (
                          <div className="space-y-2 rounded-2xl border p-4">
                            <Label>Turmas liberadas</Label>
                            {turmasPermitidas.length === 0 ? (
                              <p className="text-sm text-muted-foreground">Nenhuma turma liberada para o seu perfil.</p>
                            ) : formData.target_mode === 'todas_turmas' ? (
                              <p className="text-sm text-muted-foreground">A atividade sera enviada para todas as {turmasPermitidas.length} turmas liberadas.</p>
                            ) : (
                              <div className="grid gap-2 sm:grid-cols-2">
                                {turmasPermitidas.map((turma) => {
                                  const checked = ensureArray(formData.turmas).includes(turma);
                                  return (
                                    <label key={turma} className="flex items-center gap-3 rounded-xl border px-3 py-2 text-sm">
                                      <Checkbox checked={checked} onCheckedChange={(value) => toggleTurma(turma, Boolean(value))} />
                                      <span>{turma}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}
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
                      <div className="space-y-4 rounded-2xl border p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <Label className="flex items-center gap-2"><Paperclip className="h-4 w-4" />Conteudos de apoio</Label>
                            <p className="text-xs text-muted-foreground">Arquivos, PDFs, planilhas e links. Limite total de 1 GB por atividade.</p>
                          </div>
                          <Badge variant="outline">{formatBytes(estimateMateriaisBytes(formData.materiais_apoio) + estimateMateriaisBytes(selectedSupportFiles))} / 1 GB</Badge>
                        </div>
                        <div className="space-y-2">
                          <Label>Links de apoio</Label>
                          <div className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
                            <Input
                              value={supportLinkDraft.titulo}
                              onChange={(e) => setSupportLinkDraft((current) => ({ ...current, titulo: e.target.value }))}
                              placeholder="Titulo do link"
                            />
                            <Input
                              value={supportLinkDraft.url}
                              onChange={(e) => setSupportLinkDraft((current) => ({ ...current, url: e.target.value }))}
                              placeholder="https://video-ou-material.com"
                            />
                            <Button type="button" variant="outline" onClick={handleAddSupportLink}>
                              <Link2 className="mr-2 h-4 w-4" />
                              Adicionar
                            </Button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <Label>Arquivos</Label>
                          <input
                            id="atividade-materiais-upload"
                            type="file"
                            multiple
                            className="hidden"
                            onChange={(e) => {
                              handleSelectSupportFiles(e.target.files);
                              e.target.value = '';
                            }}
                          />
                          <Button type="button" variant="outline" onClick={() => document.getElementById('atividade-materiais-upload')?.click()}>
                            <Upload className="mr-2 h-4 w-4" />
                            Selecionar arquivos
                          </Button>
                        </div>
                        {(ensureArray(formData.materiais_apoio).length > 0 || selectedSupportFiles.length > 0) && (
                          <div className="space-y-2">
                            {ensureArray(formData.materiais_apoio).map((material, index) => (
                              <div key={`material-salvo-${index}`} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{formatMaterialLabel(material)}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {material?.tipo === 'link' ? material?.url : formatBytes(material?.tamanho)}
                                  </p>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Button type="button" variant="ghost" size="icon" onClick={() => handleDownloadMaterial(material)}>
                                    {material?.tipo === 'link' ? <ExternalLink className="h-4 w-4" /> : <Download className="h-4 w-4" />}
                                  </Button>
                                  <Button type="button" variant="ghost" size="icon" onClick={() => handleRemoveMaterial(index)}>
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            ))}
                            {selectedSupportFiles.map((file, index) => (
                              <div key={`${file.name}-${file.lastModified}`} className="flex items-center justify-between gap-3 rounded-xl border border-dashed px-3 py-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{file.name}</p>
                                  <p className="text-xs text-muted-foreground">Upload pendente • {formatBytes(file.size)}</p>
                                </div>
                                <Button type="button" variant="ghost" size="icon" onClick={() => setSelectedSupportFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <Collapsible open={previewExpanded} onOpenChange={setPreviewExpanded}>
                        {(!isMobile || previewExpanded) && (
                          <div className="rounded-2xl border bg-muted/30 p-4">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold">Previa da atividade</p>
                                <p className="text-xs text-muted-foreground">
                                  Confira os detalhes antes de {editingAtividade ? 'salvar' : 'publicar'}.
                                </p>
                              </div>
                              <CollapsibleTrigger asChild>
                                <Button type="button" variant="ghost" size="sm" className="shrink-0">
                                  Retrair
                                  <ChevronUp className="ml-2 h-4 w-4" />
                                </Button>
                              </CollapsibleTrigger>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-5">
                              <div className="rounded-xl bg-background p-3">
                                <p className="font-medium text-foreground">Destino</p>
                                <p className="mt-1 line-clamp-2">
                                  {editingAtividade || formData.target_mode === 'aluno'
                                    ? (alunoSelecionado ? formatAlunoOptionLabel(alunoSelecionado) : 'Nao selecionado')
                                    : `${selectedTurmasPreview.length} turma(s)`}
                                </p>
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
                                <p className="font-medium text-foreground">Materiais</p>
                                <p className="mt-1">{materiaisApoioPreview.length}</p>
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
                                {selectedTurmasPreview.length > 0 && (
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {selectedTurmasPreview.map((turma) => (
                                      <Badge key={turma} variant="outline">Turma {turma}</Badge>
                                    ))}
                                  </div>
                                )}
                                {materiaisApoioPreview.length > 0 && (
                                  <div className="mt-3 space-y-2">
                                    {materiaisApoioPreview.map((material, index) => (
                                      <div key={`preview-material-${index}`} className="flex items-center justify-between rounded-xl border px-3 py-2 text-xs">
                                        <span className="truncate">{formatMaterialLabel(material)}</span>
                                        <span className="text-muted-foreground">
                                          {material?.tipo === 'link' ? 'Link' : formatBytes(material?.tamanho)}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </CollapsibleContent>
                          </div>
                        )}
                      </Collapsible>
                    </div>
                    <div className={cn(
                      'flex flex-col-reverse gap-2 sm:flex-row sm:justify-end',
                      isMobile && !previewExpanded && 'hidden sm:flex',
                    )}>
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                      <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : submitLabel}</Button>
                    </div>
                    {isMobile && !previewExpanded && (
                      <div className="sticky bottom-0 left-0 right-0 z-20 -mx-4 mt-2 border-t bg-background/95 px-4 pb-4 pt-3 backdrop-blur sm:hidden">
                        <div className="rounded-2xl border bg-card/95 p-3 shadow-[0_-10px_30px_rgba(15,23,42,0.12)]">
                          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-3">
                            <div className="min-w-0">
                              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Previa</p>
                              <p className="truncate text-sm font-semibold text-foreground">
                                {formData.titulo?.trim() || 'Nome da atividade'}
                              </p>
                            </div>
                            <CollapsibleTrigger asChild>
                              <Button type="button" variant="outline" size="icon" className="h-10 w-10 rounded-full text-lg font-semibold">
                                <span aria-hidden="true">&lt;</span>
                              </Button>
                            </CollapsibleTrigger>
                            <Button onClick={handleSave} disabled={saving} className="rounded-xl px-4">
                              {saving ? 'Salvando...' : 'Publicar'}
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
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
                          {ensureArray(atividade.materiais_apoio).length > 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">{ensureArray(atividade.materiais_apoio).length} material(is) de apoio</p>
                          )}
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
                          <TableCell className="font-medium">
                            <div>
                              <p>{atividade.titulo}</p>
                              {ensureArray(atividade.materiais_apoio).length > 0 && (
                                <p className="text-xs text-muted-foreground">{ensureArray(atividade.materiais_apoio).length} material(is)</p>
                              )}
                            </div>
                          </TableCell>
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
