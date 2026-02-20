import { Fragment, useEffect, useState, useCallback, useRef } from 'react';
import { Plus, Pencil, Trash2, Search, BookOpen, Sparkles, Loader2, Info, Download, Upload, FileSpreadsheet, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const emptyLivro = {
  area: '',
  tombo: '',
  autor: '',
  titulo: '',
  vol: '',
  edicao: '',
  local: '',
  editora: '',
  ano: '',
  disponivel: true,
  sinopse: '',
};

async function buscarSinopseOpenLibrary(titulo, autor) {
  try {
    const query = encodeURIComponent(`${titulo} ${autor}`.trim());
    const res = await fetch(`https://openlibrary.org/search.json?q=${query}&limit=3&fields=key,title,author_name,first_publish_year,publisher,description`);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.docs?.length) return null;

    const book = data.docs[0];
    let sinopse = '';

    if (book.key) {
      try {
        const workRes = await fetch(`https://openlibrary.org${book.key}.json`);
        if (workRes.ok) {
          const workData = await workRes.json();
          if (workData.description) {
            sinopse = typeof workData.description === 'string' ? workData.description : (workData.description.value || '');
          }
        }
      } catch {
        // ignore
      }
    }

    return {
      sinopse,
      autoData: {
        autor: book.author_name?.[0] || '',
        ano: book.first_publish_year?.toString() || '',
        editora: book.publisher?.[0] || '',
      },
    };
  } catch {
    return null;
  }
}

export default function Livros() {
  const [livros, setLivros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLivro, setEditingLivro] = useState(null);
  const [formData, setFormData] = useState(emptyLivro);
  const [saving, setSaving] = useState(false);
  const [buscandoSinopse, setBuscandoSinopse] = useState(false);
  const [sinopseExpandida, setSinopseExpandida] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importLivros, setImportLivros] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const { isGestor, isBibliotecaria } = useAuth();
  const { toast } = useToast();

  const canManageBooks = isGestor || isBibliotecaria;

  const fetchLivros = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('livros').select('*').order('titulo');
      if (error) throw error;
      setLivros(data || []);
    } catch (error) {
      console.error('Error fetching books:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível carregar os livros.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchLivros();
  }, [fetchLivros]);

  const handleRealtimeChange = useCallback(() => {
    fetchLivros();
  }, [fetchLivros]);

  useRealtimeSubscription({ table: 'livros', onChange: handleRealtimeChange });

  const handleOpenDialog = (livro) => {
    if (livro) {
      setEditingLivro(livro);
      setFormData({
        area: livro.area,
        tombo: livro.tombo || '',
        autor: livro.autor,
        titulo: livro.titulo,
        vol: livro.vol || '',
        edicao: livro.edicao || '',
        local: livro.local || '',
        editora: livro.editora || '',
        ano: livro.ano || '',
        disponivel: livro.disponivel,
        sinopse: livro.sinopse || '',
      });
    } else {
      setEditingLivro(null);
      setFormData(emptyLivro);
    }

    setIsDialogOpen(true);
  };

  const handleBuscarSinopse = async () => {
    if (!formData.titulo.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Digite o título do livro primeiro.' });
      return;
    }

    setBuscandoSinopse(true);
    try {
      const resultado = await buscarSinopseOpenLibrary(formData.titulo, formData.autor);
      if (!resultado) {
        toast({ title: 'Não encontrado', description: 'Livro não encontrado na base. Preencha manualmente.' });
        return;
      }

      const updates = {};
      if (resultado.sinopse) updates.sinopse = resultado.sinopse;
      if (!formData.autor && resultado.autoData.autor) updates.autor = resultado.autoData.autor;
      if (!formData.ano && resultado.autoData.ano) updates.ano = resultado.autoData.ano;
      if (!formData.editora && resultado.autoData.editora) updates.editora = resultado.autoData.editora;

      if (Object.keys(updates).length > 0) {
        setFormData((prev) => ({ ...prev, ...updates }));
        toast({ title: 'Dados encontrados!', description: 'Informações preenchidas automaticamente.' });
      } else {
        toast({ title: 'Sem novos dados', description: 'Nenhuma informação adicional encontrada.' });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha na busca. Tente novamente.' });
    } finally {
      setBuscandoSinopse(false);
    }
  };

  const handleSave = async () => {
    if (!formData.titulo.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'O título é obrigatório.' });
      return;
    }

    setSaving(true);
    try {
      if (editingLivro) {
        const { error } = await supabase.from('livros').update(formData).eq('id', editingLivro.id);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Livro atualizado com sucesso.' });
      } else {
        const { error } = await supabase.from('livros').insert(formData);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Livro cadastrado com sucesso.' });
      }

      setIsDialogOpen(false);
      fetchLivros();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível salvar o livro.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    try {
      const { error } = await supabase.from('livros').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Livro excluído com sucesso.' });
      setDeleteConfirmId(null);
      fetchLivros();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível excluir o livro.' });
    }
  };

  const handleExportarExcel = () => {
    const headers = ['Título', 'Autor', 'Área', 'Tombo', 'Editora', 'Ano', 'Edição', 'Volume', 'Local', 'Disponível', 'Sinopse'];
    const data = livros.map((l) => [
      l.titulo,
      l.autor,
      l.area,
      l.tombo || '-',
      l.editora || '-',
      l.ano || '-',
      l.edicao || '-',
      l.vol || '-',
      l.local || '-',
      l.disponivel ? 'Sim' : 'Não',
      l.sinopse || '-',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Acervo');
    XLSX.writeFile(wb, 'acervo_livros.xlsx');

    toast({ title: 'Exportado!', description: 'Arquivo acervo_livros.xlsx baixado.' });
  };

  const handleExportarPDF = () => {
    const doc = new jsPDF('landscape');
    doc.setFontSize(18);
    doc.text('BibliotecAI - Acervo de Livros', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Total: ${livros.length} livros | Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);

    const headers = ['Título', 'Autor', 'Área', 'Tombo', 'Editora', 'Ano', 'Disponível'];
    const data = livros.map((l) => [l.titulo, l.autor, l.area, l.tombo || '-', l.editora || '-', l.ano || '-', l.disponivel ? 'Sim' : 'Não']);

    autoTable(doc, { head: [headers], body: data, startY: 40, styles: { fontSize: 8 }, headStyles: { fillColor: [46, 125, 50] } });
    doc.save('acervo_livros.pdf');

    toast({ title: 'Exportado!', description: 'Arquivo acervo_livros.pdf baixado.' });
  };

  const mapLivroFromRow = (row, headers) => {
    const get = (...keys) => {
      const idx = headers.findIndex((h) => keys.some((k) => h.includes(k)));
      return idx >= 0 && row[idx] != null ? String(row[idx]).trim() : '';
    };

    const titulo = get('titulo', 'título');
    if (!titulo) return null;

    return {
      titulo,
      autor: get('autor'),
      area: get('area', 'área'),
      tombo: get('tombo'),
      editora: get('editora'),
      ano: get('ano'),
      edicao: get('edicao', 'edição'),
      vol: get('vol', 'volume'),
      local: get('local'),
      sinopse: get('sinopse'),
      disponivel: true,
      status: 'pendente',
    };
  };

  const parseExcelOrCsv = async (file) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

    if (jsonData.length < 2) {
      throw new Error('Arquivo vazio ou sem linhas de dados.');
    }

    const headers = jsonData[0].map((h) => String(h).toLowerCase().trim());
    const imported = [];

    for (let i = 1; i < jsonData.length; i += 1) {
      const mapped = mapLivroFromRow(jsonData[i], headers);
      if (mapped) imported.push(mapped);
    }

    return imported;
  };

  const parsePdfViaEdgeFunction = async (file) => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    const base64Data = btoa(binary);

    const { data, error } = await supabase.functions.invoke('processar-arquivo', {
      body: {
        base64Data,
        tipo: 'pdf_livros',
      },
    });

    if (error) throw new Error(error.message || 'Erro ao processar PDF.');

    if (!data?.success || !Array.isArray(data?.livros)) {
      throw new Error(data?.error || 'PDF não pôde ser convertido automaticamente.');
    }

    return data.livros.map((l) => ({ ...emptyLivro, ...l, titulo: l.titulo || '', autor: l.autor || '', area: l.area || '', disponivel: true, status: 'pendente' })).filter((l) => l.titulo);
  };

  const handleImportFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    setImportLivros([]);

    try {
      const ext = (file.name.split('.').pop() || '').toLowerCase();
      let imported = [];

      if (['xlsx', 'xls', 'csv'].includes(ext)) {
        imported = await parseExcelOrCsv(file);
      } else if (ext === 'pdf') {
        imported = await parsePdfViaEdgeFunction(file);
      } else {
        throw new Error('Formato não suportado. Use Excel, CSV ou PDF.');
      }

      if (imported.length === 0) {
        throw new Error('Nenhum livro válido encontrado no arquivo.');
      }

      setImportLivros(imported);
      toast({ title: 'Arquivo processado', description: `${imported.length} livros encontrados.` });
    } catch (error) {
      toast({ variant: 'destructive', title: 'Falha na importação', description: error.message });
    } finally {
      setImportLoading(false);
    }
  };

  const importarLivros = async () => {
    if (importLivros.length === 0) return;

    setImporting(true);
    try {
      const updated = [...importLivros];

      for (let i = 0; i < updated.length; i += 1) {
        const l = updated[i];
        try {
          const payload = {
            area: l.area || '',
            tombo: l.tombo || null,
            autor: l.autor || '',
            titulo: l.titulo,
            vol: l.vol || '',
            edicao: l.edicao || '',
            local: l.local || '',
            editora: l.editora || '',
            ano: l.ano || '',
            disponivel: true,
            sinopse: l.sinopse || '',
          };

          const { error } = await supabase.from('livros').insert(payload);
          if (error) {
            updated[i] = { ...l, status: 'erro', mensagem: error.code === '23505' ? 'Tombo já cadastrado' : error.message };
          } else {
            updated[i] = { ...l, status: 'sucesso' };
          }
        } catch (err) {
          updated[i] = { ...l, status: 'erro', mensagem: err.message };
        }
        setImportLivros([...updated]);
      }

      const successCount = updated.filter((l) => l.status === 'sucesso').length;
      toast({ title: 'Importação concluída', description: `${successCount} de ${updated.length} livros importados.` });
      fetchLivros();
    } finally {
      setImporting(false);
    }
  };

  const baixarModeloImportacaoLivros = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Título', 'Autor', 'Área', 'Tombo', 'Editora', 'Ano', 'Edição', 'Volume', 'Local', 'Sinopse'],
      ['Dom Casmurro', 'Machado de Assis', 'Literatura', 'T-001', 'Garnier', '1899', '1', '1', 'Estante A', 'Clássico da literatura brasileira.'],
      ['Vidas Secas', 'Graciliano Ramos', 'Literatura', 'T-002', 'Record', '1938', '1', '1', 'Estante B', 'Romance regionalista.'],
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Livros');
    XLSX.writeFile(wb, 'modelo_importacao_livros.xlsx');
  };

  const getImportStatusBadge = (status) => {
    if (status === 'sucesso') return <Badge className="bg-success"><CheckCircle className="w-3 h-3 mr-1" />Sucesso</Badge>;
    if (status === 'erro') return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Erro</Badge>;
    return <Badge variant="secondary">Pendente</Badge>;
  };

  const filteredLivros = livros.filter(
    (livro) =>
      livro.titulo.toLowerCase().includes(searchTerm.toLowerCase())
      || livro.autor.toLowerCase().includes(searchTerm.toLowerCase())
      || (livro.tombo || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <MainLayout title="Livros">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Gerenciamento de Livros
            </CardTitle>

            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Buscar livros..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>

              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Exportar dados
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-2" align="end">
                  <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleExportarExcel}>Excel (.xlsx)</Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleExportarPDF}>PDF (.pdf)</Button>
                </PopoverContent>
              </Popover>

              {canManageBooks && (
                <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Upload className="w-4 h-4 mr-2" />
                      Importar em Massa
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Importar Livros em Massa</DialogTitle>
                      <DialogDescription>
                        Importe arquivos de tabela para cadastrar vários livros rapidamente.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-6 py-2">
                      <Alert>
                        <FileSpreadsheet className="w-4 h-4" />
                        <AlertDescription className="flex items-center justify-between">
                          <span>Importe tabelas de livros via Excel/CSV ou PDF e use o modelo para padronizar colunas.</span>
                          <Button variant="outline" size="sm" onClick={baixarModeloImportacaoLivros}>
                            <Download className="w-4 h-4 mr-2" />
                            Baixar Modelo
                          </Button>
                        </AlertDescription>
                      </Alert>

                      <div className="flex flex-wrap gap-2">
                        <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={handleImportFileChange} className="hidden" />
                        <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importLoading}>
                          {importLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processando...</> : <><Upload className="w-4 h-4 mr-2" />Selecionar Arquivo</>}
                        </Button>
                        <Badge variant="secondary" className="gap-1"><FileSpreadsheet className="w-3.5 h-3.5" />Excel/CSV</Badge>
                        <Badge variant="secondary" className="gap-1"><FileText className="w-3.5 h-3.5" />PDF</Badge>
                      </div>

                      {importLivros.length > 0 && (
                        <div className="space-y-4">
                          <Alert className="border-primary bg-primary/10">
                            <CheckCircle className="w-4 h-4 text-primary" />
                            <AlertDescription className="flex items-center justify-between">
                              <span className="font-medium">{importLivros.length} livros encontrados.</span>
                              <Button onClick={importarLivros} disabled={importing} size="sm" className="ml-4">
                                {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</> : <><Upload className="w-4 h-4 mr-2" />Importar Todos</>}
                              </Button>
                            </AlertDescription>
                          </Alert>

                          <div className="border rounded-lg overflow-hidden max-h-[320px] overflow-y-auto">
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Título</TableHead>
                                  <TableHead>Autor</TableHead>
                                  <TableHead>Área</TableHead>
                                  <TableHead>Tombo</TableHead>
                                  <TableHead>Status</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {importLivros.slice(0, 60).map((l, idx) => (
                                  <TableRow key={`${l.titulo}-${idx}`}>
                                    <TableCell className="font-medium">{l.titulo}</TableCell>
                                    <TableCell>{l.autor || '-'}</TableCell>
                                    <TableCell>{l.area || '-'}</TableCell>
                                    <TableCell>{l.tombo || '-'}</TableCell>
                                    <TableCell>
                                      <div className="flex flex-col gap-1">
                                        {getImportStatusBadge(l.status)}
                                        {l.mensagem && <span className="text-xs text-destructive">{l.mensagem}</span>}
                                      </div>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              )}

              {canManageBooks && (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => handleOpenDialog()}>
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{editingLivro ? 'Editar Livro' : 'Novo Livro'}</DialogTitle>
                      <DialogDescription>
                        Preencha os campos do livro e salve no acervo.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="titulo">Título *</Label>
                        <Input id="titulo" value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="autor">Autor</Label>
                        <Input id="autor" value={formData.autor} onChange={(e) => setFormData({ ...formData, autor: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="area">Área</Label>
                        <Input id="area" value={formData.area} onChange={(e) => setFormData({ ...formData, area: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tombo">Tombo</Label>
                        <Input id="tombo" value={formData.tombo || ''} onChange={(e) => setFormData({ ...formData, tombo: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="editora">Editora</Label>
                        <Input id="editora" value={formData.editora || ''} onChange={(e) => setFormData({ ...formData, editora: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ano">Ano</Label>
                        <Input id="ano" value={formData.ano || ''} onChange={(e) => setFormData({ ...formData, ano: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edicao">Edição</Label>
                        <Input id="edicao" value={formData.edicao || ''} onChange={(e) => setFormData({ ...formData, edicao: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="vol">Volume</Label>
                        <Input id="vol" value={formData.vol || ''} onChange={(e) => setFormData({ ...formData, vol: e.target.value })} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="local">Local</Label>
                        <Input id="local" value={formData.local || ''} onChange={(e) => setFormData({ ...formData, local: e.target.value })} />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="sinopse">Sinopse</Label>
                          <Button type="button" variant="outline" size="sm" onClick={handleBuscarSinopse} disabled={buscandoSinopse || !formData.titulo.trim()} className="gap-1.5 text-xs">
                            {buscandoSinopse ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            {buscandoSinopse ? 'Buscando...' : 'Buscar sinopse'}
                          </Button>
                        </div>
                        <Textarea id="sinopse" placeholder="Digite a sinopse ou use o botão acima..." className="min-h-[120px] resize-y" value={formData.sinopse || ''} onChange={(e) => setFormData({ ...formData, sinopse: e.target.value })} />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                      <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : filteredLivros.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{searchTerm ? 'Nenhum livro encontrado' : 'Nenhum livro cadastrado'}</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Autor</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead>Tombo</TableHead>
                    <TableHead>Editora</TableHead>
                    <TableHead>Ano</TableHead>
                    <TableHead>Sinopse</TableHead>
                    <TableHead>Status</TableHead>
                    {canManageBooks && <TableHead className="text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLivros.map((livro) => (
                    <TableRow key={livro.id}>
                      <TableCell className="font-medium">{livro.titulo}</TableCell>
                      <TableCell>{livro.autor}</TableCell>
                      <TableCell>{livro.area}</TableCell>
                      <TableCell>{livro.tombo}</TableCell>
                      <TableCell>{livro.editora}</TableCell>
                      <TableCell>{livro.ano}</TableCell>
                      <TableCell className="max-w-[200px]">
                        {livro.sinopse ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button className="flex items-center gap-1 text-xs text-primary hover:underline" onClick={() => setSinopseExpandida(sinopseExpandida === livro.id ? null : livro.id)}>
                                  <Info className="w-3.5 h-3.5" />
                                  Ver sinopse
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-xs">
                                <p className="text-xs">{livro.sinopse.slice(0, 200)}{livro.sinopse.length > 200 ? '...' : ''}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={livro.disponivel ? 'default' : 'secondary'}>{livro.disponivel ? 'Disponível' : 'Emprestado'}</Badge>
                      </TableCell>
                      {canManageBooks && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(livro)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteConfirmId(livro.id)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {sinopseExpandida && (
            <Dialog open={!!sinopseExpandida} onOpenChange={() => setSinopseExpandida(null)}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Sinopse</DialogTitle>
                  <DialogDescription>
                    Visualização completa da sinopse selecionada.
                  </DialogDescription>
                </DialogHeader>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{livros.find((l) => l.id === sinopseExpandida)?.sinopse || 'Sem sinopse.'}</p>
              </DialogContent>
            </Dialog>
          )}

          <AlertDialog open={!!deleteConfirmId} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Confirmar exclusão</AlertDialogTitle>
                <AlertDialogDescription>
                  Tem certeza que deseja excluir o livro &quot;{livros.find((l) => l.id === deleteConfirmId)?.titulo}&quot;? Esta ação não pode ser desfeita.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Excluir</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>
    </MainLayout>
  );
}
