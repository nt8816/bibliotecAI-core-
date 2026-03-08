import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Plus, Pencil, Trash2, Search, BookOpen, Sparkles, Loader2, Info, Download, Upload, FileSpreadsheet, FileText, AlertCircle, CheckCircle, SlidersHorizontal, X } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import { generateTextWithCloudflare } from '@/lib/cloudflareAiApi';
import { ExportPeriodDialog } from '@/components/export/ExportPeriodDialog';

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

const DEFAULT_PRE_CATEGORIES = ['Literatura', 'Ciências', 'Matemática', 'História', 'Geografia', 'Infantil'];
const loadXlsx = async () => import('xlsx');
const loadPdf = async () => {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  return { jsPDF, autoTable };
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
  const [areaFilter, setAreaFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

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
  const [preCategoriasDialogOpen, setPreCategoriasDialogOpen] = useState(false);
  const [preCategorias, setPreCategorias] = useState(DEFAULT_PRE_CATEGORIES);
  const [novaPreCategoria, setNovaPreCategoria] = useState('');
  const [escolaId, setEscolaId] = useState(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('xlsx');
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef(null);

  const { isGestor, isBibliotecaria, user } = useAuth();
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

  const fetchPreCategorias = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data: profile, error: profileError } = await supabase
        .from('usuarios_biblioteca')
        .select('escola_id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (profileError) throw profileError;
      if (!profile?.escola_id) {
        setEscolaId(null);
        setPreCategorias(DEFAULT_PRE_CATEGORIES);
        return;
      }

      setEscolaId(profile.escola_id);
      const { data: categorias, error: categoriasError } = await supabase
        .from('categorias_livros')
        .select('nome')
        .eq('escola_id', profile.escola_id)
        .order('nome');

      if (categoriasError) throw categoriasError;

      const nomes = [...new Set((categorias || []).map((c) => String(c.nome || '').trim()).filter(Boolean))];
      setPreCategorias(nomes.length > 0 ? nomes : DEFAULT_PRE_CATEGORIES);
    } catch (error) {
      console.error('Error fetching categorias_livros:', error);
      setPreCategorias(DEFAULT_PRE_CATEGORIES);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchPreCategorias();
  }, [fetchPreCategorias]);

  const handleRealtimeChange = useCallback(() => {
    fetchLivros();
  }, [fetchLivros]);

  useRealtimeSubscription({ table: 'livros', onChange: handleRealtimeChange });
  useRealtimeSubscription({ table: 'categorias_livros', onChange: fetchPreCategorias });

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

  const handleAdicionarPreCategoria = () => {
    const categoria = novaPreCategoria.trim().replace(/\s+/g, ' ');
    if (!categoria) return;
    const exists = preCategorias.some((item) => item.toLowerCase() === categoria.toLowerCase());
    if (exists) {
      setNovaPreCategoria('');
      return;
    }
    setPreCategorias((prev) => [...prev, categoria]);
    setNovaPreCategoria('');

    if (!escolaId) return;
    supabase
      .from('categorias_livros')
      .upsert(
        {
          escola_id: escolaId,
          nome: categoria,
          created_by: user?.id || null,
        },
        { onConflict: 'escola_id,nome' },
      )
      .then(({ error }) => {
        if (error) {
          toast({
            variant: 'destructive',
            title: 'Erro',
            description: 'Não foi possível salvar a pré-categoria.',
          });
          fetchPreCategorias();
        }
      });
  };

  const handleRemoverPreCategoria = (categoria) => {
    setPreCategorias((prev) => prev.filter((item) => item !== categoria));
    if (!escolaId) return;

    supabase
      .from('categorias_livros')
      .delete()
      .eq('escola_id', escolaId)
      .eq('nome', categoria)
      .then(({ error }) => {
        if (error) {
          toast({
            variant: 'destructive',
            title: 'Erro',
            description: 'Não foi possível remover a pré-categoria.',
          });
          fetchPreCategorias();
        }
      });
  };

  const handleBuscarSinopse = async () => {
    if (!formData.titulo.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Digite o título do livro primeiro.' });
      return;
    }

    setBuscandoSinopse(true);
    try {
      const [iaResult, openLibraryResult] = await Promise.allSettled([
        generateTextWithCloudflare({
          task: 'sinopse_livro',
          input: {
            titulo: formData.titulo,
            autor: formData.autor,
            area: formData.area,
            sinopseBase: formData.sinopse,
          },
          fallbackErrorMessage: 'Não foi possível gerar sinopse por IA.',
        }),
        buscarSinopseOpenLibrary(formData.titulo, formData.autor),
      ]);

      const iaPayload = iaResult.status === 'fulfilled' ? iaResult.value : null;
      const iaSinopse = String(iaPayload?.data?.sinopse || iaPayload?.text || '').trim();
      const resultado = openLibraryResult.status === 'fulfilled' ? openLibraryResult.value : null;

      if (!iaSinopse && !resultado) {
        toast({ title: 'Não encontrado', description: 'Não foi possível buscar ou gerar sinopse agora.' });
        return;
      }

      const updates = {};
      if (iaSinopse) updates.sinopse = iaSinopse;
      else if (resultado?.sinopse) updates.sinopse = resultado.sinopse;

      if (!formData.autor && resultado?.autoData?.autor) updates.autor = resultado.autoData.autor;
      if (!formData.ano && resultado?.autoData?.ano) updates.ano = resultado.autoData.ano;
      if (!formData.editora && resultado?.autoData?.editora) updates.editora = resultado.autoData.editora;

      if (Object.keys(updates).length > 0) {
        setFormData((prev) => ({ ...prev, ...updates }));
        toast({
          title: 'Dados preenchidos',
          description: iaSinopse
            ? 'Sinopse gerada por IA e dados complementados automaticamente.'
            : 'Informações preenchidas automaticamente.',
        });
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
        if (!escolaId) {
          throw new Error('Seu usuário não está vinculado a uma escola.');
        }

        const { error } = await supabase.from('livros').insert({
          ...formData,
          escola_id: escolaId,
        });
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

  const filtrarLivrosPorPeriodo = (period) => {
    if (period.mode === 'total') return livros;

    const start = new Date(`${period.startDate}T00:00:00`);
    const end = new Date(`${period.endDate}T23:59:59`);
    return livros.filter((livro) => {
      const refDate = livro.created_at ? new Date(livro.created_at) : null;
      if (!refDate || Number.isNaN(refDate.getTime())) return false;
      return refDate >= start && refDate <= end;
    });
  };

  const getPeriodLabel = (period) => {
    if (period.mode === 'total') return 'Período total';
    return `Período: ${period.startDate} a ${period.endDate}`;
  };

  const handleExportarExcel = (livrosSelecionados, periodLabel) => {
    return loadXlsx().then((XLSX) => {
      const headers = ['Título', 'Autor', 'Área', 'Tombo', 'Editora', 'Ano', 'Edição', 'Volume', 'Local', 'Disponível', 'Sinopse'];
      const data = livrosSelecionados.map((l) => [
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

      toast({ title: 'Exportado!', description: `Arquivo acervo_livros.xlsx baixado. ${periodLabel}` });
    }).catch(() => {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível exportar o Excel.' });
    });
  };

  const handleExportarPDF = (livrosSelecionados, periodLabel) => {
    return loadPdf().then(({ jsPDF, autoTable }) => {
      const doc = new jsPDF('landscape');
      doc.setFontSize(18);
      doc.text('BibliotecAI - Acervo de Livros', 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Total: ${livrosSelecionados.length} livros | ${periodLabel} | Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);

      const headers = ['Título', 'Autor', 'Área', 'Tombo', 'Editora', 'Ano', 'Disponível'];
      const data = livrosSelecionados.map((l) => [l.titulo, l.autor, l.area, l.tombo || '-', l.editora || '-', l.ano || '-', l.disponivel ? 'Sim' : 'Não']);

      autoTable(doc, { head: [headers], body: data, startY: 40, styles: { fontSize: 8 }, headStyles: { fillColor: [46, 125, 50] } });
      doc.save('acervo_livros.pdf');

      toast({ title: 'Exportado!', description: `Arquivo acervo_livros.pdf baixado. ${periodLabel}` });
    }).catch(() => {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível exportar o PDF.' });
    });
  };

  const handleOpenExportDialog = (format) => {
    setExportFormat(format);
    setExportDialogOpen(true);
  };

  const handleConfirmExport = async (period) => {
    const livrosSelecionados = filtrarLivrosPorPeriodo(period);
    if (livrosSelecionados.length === 0) {
      toast({ variant: 'destructive', title: 'Sem dados', description: 'Não há livros no período selecionado.' });
      return;
    }

    setExporting(true);
    const periodLabel = getPeriodLabel(period);
    try {
      if (exportFormat === 'pdf') {
        await handleExportarPDF(livrosSelecionados, periodLabel);
      } else {
        await handleExportarExcel(livrosSelecionados, periodLabel);
      }
      setExportDialogOpen(false);
    } finally {
      setExporting(false);
    }
  };

  const normalizeText = (value) =>
    String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();

  const findColumnIndex = (headers, aliases) => headers.findIndex((header) => aliases.some((alias) => header === alias || header.includes(alias)));

  const parseEmbeddedHtmlTable = (rows) => {
    const htmlCell = rows
      .flat()
      .find((cell) => typeof cell === 'string' && cell.toLowerCase().includes('<table'));

    if (!htmlCell || typeof DOMParser === 'undefined') return null;

    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlCell, 'text/html');
    const tableRows = [...doc.querySelectorAll('tr')]
      .map((tr) => [...tr.querySelectorAll('th,td')].map((cell) => cell.textContent?.trim() || ''))
      .filter((row) => row.some((cell) => cell));

    return tableRows.length > 1 ? tableRows : null;
  };

  const detectHeaderRowIndex = (rows) =>
    rows.findIndex((row) => {
      const normalized = row.map(normalizeText);
      const hasTitle = normalized.some((h) => h.includes('titulo') || h.includes('livro') || h.includes('obra') || h.includes('nome'));
      const hasAuthor = normalized.some((h) => h.includes('autor'));
      const hasAnyMetadata = normalized.some((h) => h.includes('isbn') || h.includes('tombo') || h.includes('editora') || h.includes('categoria') || h.includes('ano'));
      return hasTitle && (hasAuthor || hasAnyMetadata);
    });

  const normalizeYear = (rawAno, rawTitulo) => {
    const colYear = String(rawAno || '').match(/\b(18|19|20)\d{2}\b/);
    if (colYear) return colYear[0];
    const titleYear = String(rawTitulo || '').match(/\b(18|19|20)\d{2}\b/);
    return titleYear ? titleYear[0] : '';
  };

  const normalizeTitulo = (raw) =>
    String(raw || '')
      .replace(/\s*-\s*ano:\s*\d{4}\s*/gi, ' ')
      .replace(/\s*-\s*vol:\s*[^-]+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  const hasBookData = (livro) => [livro.titulo, livro.autor, livro.area, livro.tombo, livro.editora, livro.ano, livro.sinopse].some((value) => String(value || '').trim());

  const mapLivroFromRow = (row, headers) => {
    const indices = {
      titulo: findColumnIndex(headers, ['titulo', 'livro', 'obra', 'nome']),
      autor: findColumnIndex(headers, ['autor', 'autores']),
      area: findColumnIndex(headers, ['area', 'categoria', 'assunto', 'genero', 'setor', 'tipo']),
      tombo: findColumnIndex(headers, ['tombo', 'isbn', 'codigo', 'cod', 'id acervo', 'id livro', 'id']),
      editora: findColumnIndex(headers, ['editora']),
      ano: findColumnIndex(headers, ['ano', 'ano publicacao', 'publicacao']),
      edicao: findColumnIndex(headers, ['edicao', 'edicao', 'edi']),
      vol: findColumnIndex(headers, ['vol', 'volume']),
      local: findColumnIndex(headers, ['local', 'estante', 'prateleira', 'sala']),
      sinopse: findColumnIndex(headers, ['sinopse', 'descricao', 'resumo']),
      estante: findColumnIndex(headers, ['estante']),
      prateleira: findColumnIndex(headers, ['prateleira']),
    };

    const getByIndex = (idx) => (idx >= 0 && row[idx] != null ? String(row[idx]).trim() : '');

    const rawTitulo = getByIndex(indices.titulo);
    const titulo = normalizeTitulo(rawTitulo);
    const volumeFromTitle = rawTitulo.match(/\bvol[:\s]*([0-9]+)/i)?.[1] || '';

    const estante = getByIndex(indices.estante);
    const prateleira = getByIndex(indices.prateleira);
    const localBase = getByIndex(indices.local);
    const local = [localBase, estante && !localBase.includes(estante) ? `Estante ${estante}` : '', prateleira ? `Prateleira ${prateleira}` : '']
      .filter(Boolean)
      .join(' | ');

    return {
      titulo,
      autor: getByIndex(indices.autor),
      area: getByIndex(indices.area),
      tombo: getByIndex(indices.tombo),
      editora: getByIndex(indices.editora),
      ano: normalizeYear(getByIndex(indices.ano), rawTitulo),
      edicao: getByIndex(indices.edicao),
      vol: getByIndex(indices.vol) || volumeFromTitle,
      local,
      sinopse: getByIndex(indices.sinopse),
      disponivel: true,
      status: 'pendente',
    };
  };

  const parseExcelOrCsv = async (file) => {
    const XLSX = await loadXlsx();
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    const rows = parseEmbeddedHtmlTable(rawRows) || rawRows;

    if (rows.length < 2) {
      throw new Error('Arquivo vazio ou sem linhas de dados.');
    }

    const headerRowIndex = detectHeaderRowIndex(rows);
    if (headerRowIndex < 0) {
      throw new Error('Não foi possível identificar o cabeçalho automaticamente.');
    }

    const headers = rows[headerRowIndex].map((h) => normalizeText(h));
    const imported = [];

    for (let i = headerRowIndex + 1; i < rows.length; i += 1) {
      const mapped = mapLivroFromRow(rows[i], headers);
      if (hasBookData(mapped)) imported.push(mapped);
    }

    if (imported.length === 0) {
      throw new Error('Nenhum livro com dados válidos foi identificado.');
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

    const data = await invokeEdgeFunction('processar-arquivo', {
      body: {
        base64Data,
        tipo: 'pdf_livros',
      },
      requireAuth: true,
      fallbackErrorMessage: 'Erro ao processar PDF.',
    });

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
    if (!escolaId) {
      toast({ variant: 'destructive', title: 'Escola não vinculada', description: 'Não foi possível identificar a escola para importação.' });
      return;
    }

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
            escola_id: escolaId,
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
    loadXlsx().then((XLSX) => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['Título', 'Autor', 'Área', 'Tombo', 'Editora', 'Ano', 'Edição', 'Volume', 'Local', 'Sinopse'],
        ['Dom Casmurro', 'Machado de Assis', 'Literatura', 'T-001', 'Garnier', '1899', '1', '1', 'Estante A', 'Clássico da literatura brasileira.'],
        ['Vidas Secas', 'Graciliano Ramos', 'Literatura', 'T-002', 'Record', '1938', '1', '1', 'Estante B', 'Romance regionalista.'],
      ]);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Livros');
      XLSX.writeFile(wb, 'modelo_importacao_livros.xlsx');
    }).catch(() => {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível baixar o modelo.' });
    });
  };

  const getImportStatusBadge = (status) => {
    if (status === 'sucesso') return <Badge className="bg-success"><CheckCircle className="w-3 h-3 mr-1" />Sucesso</Badge>;
    if (status === 'erro') return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Erro</Badge>;
    return <Badge variant="secondary">Pendente</Badge>;
  };

  const areaOptions = useMemo(
    () =>
      [...new Set(livros.map((livro) => String(livro.area || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [livros],
  );

  const filteredLivros = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return livros.filter((livro) => {
      const searchMatches = !term
        || livro.titulo.toLowerCase().includes(term)
        || livro.autor.toLowerCase().includes(term)
        || (livro.tombo || '').toLowerCase().includes(term)
        || (livro.area || '').toLowerCase().includes(term);

      const areaMatches = areaFilter === 'all' || (livro.area || '').trim() === areaFilter;
      const statusMatches = statusFilter === 'all'
        || (statusFilter === 'disponivel' && livro.disponivel)
        || (statusFilter === 'emprestado' && !livro.disponivel);

      return searchMatches && areaMatches && statusMatches;
    });
  }, [livros, searchTerm, areaFilter, statusFilter]);

  const totalLivros = livros.length;
  const totalDisponiveis = livros.filter((livro) => livro.disponivel).length;
  const totalEmprestados = totalLivros - totalDisponiveis;
  const hasActiveFilters = Boolean(searchTerm.trim()) || areaFilter !== 'all' || statusFilter !== 'all';

  return (
    <MainLayout title="Livros">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-primary" />
                Acervo da Biblioteca
              </CardTitle>
              <CardDescription className="mt-1">
                Organize livros, acompanhe disponibilidade e mantenha o catálogo em dia.
              </CardDescription>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Upload className="w-4 h-4 mr-2" />
                    Exportar dados
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-40 p-2" align="end">
                  <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleOpenExportDialog('xlsx')}>Excel (.xlsx)</Button>
                  <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleOpenExportDialog('pdf')}>PDF (.pdf)</Button>
                </PopoverContent>
              </Popover>

              {canManageBooks && (
                <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Download className="w-4 h-4 mr-2" />
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
                          {importLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processando...</> : <><Download className="w-4 h-4 mr-2" />Selecionar Arquivo</>}
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
                                {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</> : <><Download className="w-4 h-4 mr-2" />Importar Todos</>}
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
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">Pré-categorias rápidas</p>
                            <Dialog open={preCategoriasDialogOpen} onOpenChange={setPreCategoriasDialogOpen}>
                              <DialogTrigger asChild>
                                <Button type="button" size="sm" variant="outline">
                                  Gerenciar
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-md">
                                <DialogHeader>
                                  <DialogTitle>Gerenciar pré-categorias</DialogTitle>
                                  <DialogDescription>Adicione ou remova categorias para facilitar o cadastro de livros.</DialogDescription>
                                </DialogHeader>

                                <div className="space-y-3 py-1">
                                  <div className="flex flex-col gap-2 sm:flex-row">
                                    <Input
                                      placeholder="Nova pré-categoria"
                                      value={novaPreCategoria}
                                      onChange={(e) => setNovaPreCategoria(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleAdicionarPreCategoria();
                                        }
                                      }}
                                    />
                                    <Button type="button" variant="outline" onClick={handleAdicionarPreCategoria}>
                                      <Plus className="w-4 h-4 mr-1" />
                                      Adicionar
                                    </Button>
                                  </div>

                                  <div className="max-h-64 overflow-y-auto rounded-md border p-2">
                                    <div className="space-y-1.5">
                                      {preCategorias.map((categoria) => (
                                        <div key={categoria} className="flex items-center justify-between rounded-md border px-2.5 py-2 text-sm">
                                          <span className="truncate pr-2">{categoria}</span>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="icon"
                                            className="h-7 w-7"
                                            onClick={() => handleRemoverPreCategoria(categoria)}
                                            aria-label={`Remover categoria ${categoria}`}
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                          <div className="max-h-28 overflow-y-auto rounded-md border p-2">
                            <div className="flex flex-wrap gap-2">
                              {preCategorias.map((categoria) => (
                                <button
                                  type="button"
                                  key={categoria}
                                  className={`inline-flex items-center rounded-full border pr-1 ${
                                    formData.area === categoria ? 'border-primary bg-primary/10' : 'border-border bg-background'
                                  }`}
                                  onClick={() => setFormData((prev) => ({ ...prev, area: categoria }))}
                                >
                                  <span className="px-2.5 py-1 text-xs font-medium">{categoria}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
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
                        <Textarea id="sinopse" placeholder="Digite a sinopse ou use o botão acima..." className="min-h-[120px] resize-y" value={formData.sinopse || ''} onChange={(e) => setFormData({ ...formData, sinopse: e.target.value })} translate="yes" />
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

        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p>
              <p className="mt-1 text-2xl font-semibold">{totalLivros}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Disponíveis</p>
              <p className="mt-1 text-2xl font-semibold text-green-700">{totalDisponiveis}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Emprestados</p>
              <p className="mt-1 text-2xl font-semibold text-amber-700">{totalEmprestados}</p>
            </div>
            <div className="rounded-lg border bg-muted/20 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Áreas</p>
              <p className="mt-1 text-2xl font-semibold">{areaOptions.length}</p>
            </div>
          </div>

          <div className="rounded-lg border bg-background p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar por título, autor, tombo ou área..."
                    className="pl-9"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>

                <Select value={areaFilter} onValueChange={setAreaFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filtrar por área" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as áreas</SelectItem>
                    {areaOptions.map((area) => (
                      <SelectItem key={area} value={area}>{area}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="disponivel">Disponíveis</SelectItem>
                    <SelectItem value="emprestado">Emprestados</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <Badge variant="secondary" className="gap-1">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  {filteredLivros.length} exibidos
                </Badge>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1"
                    onClick={() => {
                      setSearchTerm('');
                      setAreaFilter('all');
                      setStatusFilter('all');
                    }}
                  >
                    <X className="w-3.5 h-3.5" />
                    Limpar filtros
                  </Button>
                )}
              </div>
            </div>
          </div>

          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : filteredLivros.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">{hasActiveFilters ? 'Nenhum livro encontrado com os filtros atuais.' : 'Nenhum livro cadastrado'}</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
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
                    <TableRow key={livro.id} className="align-top">
                      <TableCell className="font-medium">{livro.titulo}</TableCell>
                      <TableCell>{livro.autor || '—'}</TableCell>
                      <TableCell>{livro.area ? <Badge variant="outline">{livro.area}</Badge> : '—'}</TableCell>
                      <TableCell>{livro.tombo || '—'}</TableCell>
                      <TableCell>{livro.editora || '—'}</TableCell>
                      <TableCell>{livro.ano || '—'}</TableCell>
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
                                <p className="text-xs" translate="yes">{livro.sinopse.slice(0, 200)}{livro.sinopse.length > 200 ? '...' : ''}</p>
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
                <p className="text-sm leading-relaxed whitespace-pre-wrap" translate="yes">{livros.find((l) => l.id === sinopseExpandida)?.sinopse || 'Sem sinopse.'}</p>
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

      <ExportPeriodDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        title="Exportar acervo"
        description="Escolha o período para exportar os livros."
        loading={exporting}
        onConfirm={handleConfirmExport}
      />
    </MainLayout>
  );
}
