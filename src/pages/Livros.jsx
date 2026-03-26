import { useDeferredValue, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { Plus, Pencil, Trash2, Search, BookOpen, Sparkles, Loader2, Info, Download, Upload, FileSpreadsheet, FileText, AlertCircle, CheckCircle, SlidersHorizontal, X, ChevronsUpDown, Check } from 'lucide-react';

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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { generateTextWithCloudflare } from '@/lib/cloudflareAiApi';
import { ExportPeriodDialog } from '@/components/export/ExportPeriodDialog';
import { canonicalizeBookArea } from '@/lib/bookAreas';
import { requestPlatformApi } from '@/lib/platformApi';
import {
  createLivroCategoria,
  deleteLivro,
  deleteLivroCategoria,
  fetchLivrosCatalogo,
  importLivrosBatch,
  saveLivro,
  updateLivroCategoria,
} from '@/services/livrosService';
import { createPainelAlunoLoanRequest } from '@/services/painelAlunoService';

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
const normalizeBookSearchText = (value) => String(value || '').trim().toLowerCase();
const normalizeTomboSearchValue = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return String(Number(digits));
};
const getLivroStatus = (livro) => {
  if (livro?.isEmprestado) return 'emprestado';
  if (livro?.disponivel) return 'disponivel';
  return 'indisponivel';
};
const getLivroStatusLabel = (livro) => {
  const status = getLivroStatus(livro);
  if (status === 'emprestado') return 'Emprestado';
  if (status === 'disponivel') return 'Disponível';
  return 'Indisponível';
};
const getLivroStatusVariant = (livro) => (getLivroStatus(livro) === 'disponivel' ? 'default' : 'secondary');
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

function normalizeResumoText(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return '';

  let text = raw
    .replace(/^\s*\{\s*"?texto"?\s*:\s*/i, '')
    .replace(/^\s*\{\s*"?resumo"?\s*:\s*/i, '')
    .replace(/\}\s*$/, '')
    .replace(/^["'`]+|["'`]+$/g, '')
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const bulletized = text
    .replace(/(\d+\.)\s*\*\*(.*?)\*\*\s*:\s*/g, '\n$1 $2\n')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\s*\n\s*/g, '\n')
    .trim();

  return bulletized;
}

function extractResumoTextoFromIAResponse(data) {
  const direct = String(data?.data?.texto || data?.data?.resumo || '').trim();
  if (direct) return normalizeResumoText(direct);

  const raw = String(data?.text || '').trim();
  if (!raw) return '';

  try {
    const parsed = JSON.parse(raw);
    return normalizeResumoText(String(parsed?.texto || parsed?.resumo || '').trim());
  } catch {
    return normalizeResumoText(raw);
  }
}

function splitResumoSections(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean);
}

function isResumoListSection(section) {
  const lines = section.split('\n').map((line) => line.trim()).filter(Boolean);
  return lines.length > 1 && lines.every((line) => /^\d+\.\s|^[-•]\s/.test(line));
}

function formatResumoListItem(line) {
  return line
    .replace(/^\d+\.\s*/, '')
    .replace(/^[-•]\s*/, '')
    .trim();
}

export default function Livros() {
  const [livros, setLivros] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [areaFilter, setAreaFilter] = useState('all');
  const [areaFilterOpen, setAreaFilterOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('all');
  const [autorFilter, setAutorFilter] = useState('all');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLivro, setEditingLivro] = useState(null);
  const [formData, setFormData] = useState(emptyLivro);
  const [saving, setSaving] = useState(false);
  const [buscandoSinopse, setBuscandoSinopse] = useState(false);
  const [sinopseExpandida, setSinopseExpandida] = useState(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestLivro, setRequestLivro] = useState(null);
  const [requestMsg, setRequestMsg] = useState('');
  const [requestingLoan, setRequestingLoan] = useState(false);
  const [resumoRapidoOpen, setResumoRapidoOpen] = useState(false);
  const [resumoRapidoData, setResumoRapidoData] = useState(null);
  const [resumoRapidoLoadingId, setResumoRapidoLoadingId] = useState('');

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importLivros, setImportLivros] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [activeTab, setActiveTab] = useState('acervo');
  const [preCategorias, setPreCategorias] = useState(DEFAULT_PRE_CATEGORIES);
  const [novaPreCategoria, setNovaPreCategoria] = useState('');
  const [preCategoriaSearch, setPreCategoriaSearch] = useState('');
  const [categoriaEmEdicao, setCategoriaEmEdicao] = useState('');
  const [categoriaEditada, setCategoriaEditada] = useState('');
  const [categoriaSalvando, setCategoriaSalvando] = useState('');
  const [escolaId, setEscolaId] = useState(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('xlsx');
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef(null);
  const deferredSearchTerm = useDeferredValue(searchTerm);

  const { isGestor, isBibliotecaria, isProfessor, user } = useAuth();
  const { toast } = useToast();

  const canManageBooks = isGestor || isBibliotecaria;
  const canViewCatalogOnly = isProfessor && !canManageBooks;
  const canManageAreas = canManageBooks;

  const fetchLivros = useCallback(async () => {
    if (!user?.id) {
      setLivros([]);
      setPreCategorias(DEFAULT_PRE_CATEGORIES);
      setEscolaId(null);
      setLoading(false);
      return;
    }
    try {
      const data = await fetchLivrosCatalogo({
        userId: user.id,
        preCategorias,
        canonicalizeBookArea,
        defaultPreCategories: DEFAULT_PRE_CATEGORIES,
      });
      setEscolaId(data?.escolaId || null);
      setPreCategorias((data?.preCategorias || DEFAULT_PRE_CATEGORIES).map((nome) => canonicalizeBookArea(nome)));
      setLivros(data?.livros || []);
    } catch (error) {
      console.error('Error fetching books:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'N??o foi poss??vel carregar os livros.' });
    } finally {
      setLoading(false);
    }
  }, [user?.id, preCategorias, toast]);
  useEffect(() => {
    fetchLivros();
  }, [fetchLivros]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchLivros();
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchLivros();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchLivros]);

  const handleOpenDialog = (livro) => {
    if (livro) {
      setEditingLivro(livro);
      setFormData({
        area: canonicalizeBookArea(livro.area, preCategorias),
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

  const handleAdicionarPreCategoria = async () => {
    const categoria = canonicalizeBookArea(novaPreCategoria, preCategorias);
    if (!categoria) return;
    const exists = preCategorias.some((item) => item.toLowerCase() === categoria.toLowerCase());
    if (exists) {
      setNovaPreCategoria('');
      return;
    }
    setPreCategorias((prev) => [...prev, categoria]);
    setNovaPreCategoria('');
    if (!escolaId) return;
    try {
      await createLivroCategoria({
        escola_id: escolaId,
        nome: categoria,
      });
      fetchLivros();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error?.message || 'Nao foi possivel salvar a area do acervo.',
      });
      fetchLivros();
    }
  };

  const handleSalvarPreCategoria = async (categoriaNome) => {
    const categoria = canonicalizeBookArea(categoriaNome, preCategorias);
    if (!categoria) return;
    const exists = preCategorias.some((item) => item.toLowerCase() === categoria.toLowerCase());
    if (exists) return;

    setPreCategorias((prev) => [...prev, categoria]);
    if (!escolaId) return;
    try {
      await createLivroCategoria({
        escola_id: escolaId,
        nome: categoria,
      });
      fetchLivros();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error?.message || 'Nao foi possivel salvar a area do acervo.',
      });
      fetchLivros();
    }
  };

  const handleRemoverPreCategoria = async (categoria) => {
    setPreCategorias((prev) => prev.filter((item) => item !== categoria));
    if (!escolaId) return;
    try {
      await deleteLivroCategoria(escolaId, categoria);
      fetchLivros();
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'N??o foi poss??vel remover a pr??-categoria.',
      });
      fetchLivros();
    }
  };

  const handleIniciarEdicaoPreCategoria = (categoria) => {
    setCategoriaEmEdicao(categoria);
    setCategoriaEditada(categoria);
  };

  const handleCancelarEdicaoPreCategoria = () => {
    setCategoriaEmEdicao('');
    setCategoriaEditada('');
    setCategoriaSalvando('');
  };

  const handleAtualizarPreCategoria = async (categoriaAtual) => {
    const categoriaOriginal = String(categoriaAtual || '').trim();
    const categoriaNova = canonicalizeBookArea(categoriaEditada, preCategorias);
    if (!categoriaOriginal || !categoriaNova) return;

    const categoriaOriginalKey = categoriaOriginal.toLowerCase();
    const categoriaNovaKey = categoriaNova.toLowerCase();
    const exists = preCategorias.some((item) => item.toLowerCase() === categoriaNovaKey && item.toLowerCase() !== categoriaOriginalKey);
    if (exists) {
      toast({
        variant: 'destructive',
        title: 'Categoria duplicada',
        description: 'Já existe uma área com esse nome.',
      });
      return;
    }

    setCategoriaSalvando(categoriaOriginal);
    try {
      await updateLivroCategoria({
        nome_atual: categoriaOriginal,
        nome_novo: categoriaNova,
      });

      setPreCategorias((prev) => prev.map((item) => (item === categoriaOriginal ? categoriaNova : item)));
      setFormData((prev) => ({
        ...prev,
        area: prev.area === categoriaOriginal ? categoriaNova : prev.area,
      }));
      setAreaFilter((prev) => (prev === categoriaOriginal ? categoriaNova : prev));
      toast({ title: 'Sucesso', description: 'Área atualizada com sucesso.' });
      handleCancelarEdicaoPreCategoria();
      fetchLivros();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível atualizar a área.',
      });
      setCategoriaSalvando('');
    }
  };

  const handleBuscarSinopse = async () => {
    if (!formData.titulo.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Digite o título do livro primeiro.' });
      return;
    }

    setBuscandoSinopse(true);
    try {
      const resultado = await buscarSinopseOpenLibrary(formData.titulo, formData.autor);
      const freeSinopse = String(resultado?.sinopse || '').trim();
      const freeAutor = String(resultado?.autoData?.autor || '').trim();
      const freeAno = String(resultado?.autoData?.ano || '').trim();
      const freeEditora = String(resultado?.autoData?.editora || '').trim();

      const precisaIA = !freeSinopse || (!formData.autor && !freeAutor) || (!formData.ano && !freeAno) || (!formData.editora && !freeEditora);

      let iaData = null;
      if (precisaIA) {
        try {
          const iaPayload = await generateTextWithCloudflare({
            task: 'sinopse_livro',
            input: {
              titulo: formData.titulo,
              autor: formData.autor,
              area: formData.area,
              sinopseBase: formData.sinopse,
            },
            fallbackErrorMessage: 'Não foi possível gerar sinopse por IA.',
          });
          iaData = iaPayload?.data || null;
        } catch {
          iaData = null;
        }
      }

      const iaSinopse = String(iaData?.sinopse || '').trim();
      const iaAutor = String(iaData?.autor || '').trim();
      const iaAno = String(iaData?.ano || '').trim();
      const iaEditora = String(iaData?.editora || '').trim();

      if (!freeSinopse && !iaSinopse && !freeAutor && !iaAutor && !freeAno && !iaAno && !freeEditora && !iaEditora) {
        toast({ title: 'Não encontrado', description: 'Não foi possível buscar ou gerar sinopse agora.' });
        return;
      }

      const updates = {};
      if (freeSinopse) updates.sinopse = freeSinopse;
      else if (iaSinopse) updates.sinopse = iaSinopse;

      if (!formData.autor && (freeAutor || iaAutor)) updates.autor = freeAutor || iaAutor;
      if (!formData.ano && (freeAno || iaAno)) updates.ano = freeAno || iaAno;
      if (!formData.editora && (freeEditora || iaEditora)) updates.editora = freeEditora || iaEditora;

      if (Object.keys(updates).length > 0) {
        setFormData((prev) => ({ ...prev, ...updates }));
        toast({
          title: 'Dados preenchidos',
          description: precisaIA
            ? 'Informações completadas com fallback de IA.'
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
      const normalizedFormData = {
        ...formData,
        area: canonicalizeBookArea(formData.area, preCategorias),
      };

      if (editingLivro) {
        await saveLivro(normalizedFormData, editingLivro.id);
        toast({ title: 'Sucesso', description: 'Livro atualizado com sucesso.' });
      } else {
        if (!escolaId) {
          throw new Error('Seu usuário não está vinculado a uma escola.');
        }

        await saveLivro({
          ...normalizedFormData,
          escola_id: escolaId,
        });
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
      await deleteLivro(id);
      toast({ title: 'Sucesso', description: 'Livro excluído com sucesso.' });
      setDeleteConfirmId(null);
      fetchLivros();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível excluir o livro.' });
    }
  };

  const handleRequestLoan = async () => {
    if (!requestLivro?.id) return;

    setRequestingLoan(true);
    try {
      await createPainelAlunoLoanRequest({
        livroId: requestLivro.id,
        mensagem: requestMsg || null,
      });
      toast({ title: 'Solicitação enviada!' });
      setRequestDialogOpen(false);
      setRequestLivro(null);
      setRequestMsg('');
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error?.message || 'Falha ao solicitar empréstimo.',
      });
    } finally {
      setRequestingLoan(false);
    }
  };

  const gerarResumoRapido = async (livro) => {
    if (!livro?.id) return;

    setResumoRapidoLoadingId(livro.id);
    try {
      const data = await generateTextWithCloudflare({
        task: 'resumo_estudo',
        input: {
          titulo: livro.titulo,
          autor: livro.autor,
          sinopse: livro.sinopse || '',
        },
        fallbackErrorMessage: 'Não foi possível gerar o resumo rápido agora.',
      });
      const texto = extractResumoTextoFromIAResponse(data);
      if (!texto) throw new Error('A IA respondeu sem resumo.');

      setResumoRapidoData({
        titulo: livro.titulo,
        autor: livro.autor,
        texto,
      });
      setResumoRapidoOpen(true);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao gerar resumo',
        description: error?.message || 'Não foi possível gerar o resumo rápido.',
      });
    } finally {
      setResumoRapidoLoadingId('');
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

  const parsePdfViaPlatformApi = async (file) => {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }

    const base64Data = btoa(binary);

    const data = await requestPlatformApi('/v1/livros/processar-arquivo', {
      method: 'POST',
      body: {
        base64Data,
        tipo: 'pdf_livros',
      },
    });

    if (!data?.success || !Array.isArray(data?.livros)) {
      throw new Error(data?.error || 'PDF não pôde ser convertido automaticamente.');
    }

    return data.livros
      .map((l) => ({
        ...emptyLivro,
        ...l,
        titulo: l.titulo || '',
        autor: l.autor || '',
        area: canonicalizeBookArea(l.area || '', preCategorias),
        disponivel: true,
        status: 'pendente',
      }))
      .filter((l) => l.titulo);
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
        imported = await parsePdfViaPlatformApi(file);
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
      toast({ variant: 'destructive', title: 'Escola n??o vinculada', description: 'N??o foi poss??vel identificar a escola para importa????o.' });
      return;
    }
    setImporting(true);
    try {
      const response = await importLivrosBatch(importLivros, escolaId, preCategorias, canonicalizeBookArea);
      const updated = response?.livros || [];
      setImportLivros(updated);
      const successCount = updated.filter((l) => l.status === 'sucesso').length;
      toast({ title: 'Importa????o conclu??da', description: `${successCount} de ${updated.length} livros importados.` });
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

  const processedLivros = useMemo(
    () =>
      livros.map((livro) => {
        const normalizedArea = canonicalizeBookArea(livro.area, preCategorias);
        const normalizedAutor = String(livro.autor || '').trim();
        const status = getLivroStatus(livro);
        const normalizedTombo = normalizeTomboSearchValue(livro.tombo);
        return {
          ...livro,
          normalizedArea,
          normalizedAutor,
          normalizedStatus: status,
          normalizedTombo,
          searchIndex: [
            livro.titulo,
            livro.autor,
            livro.tombo,
            normalizedTombo,
            normalizedArea,
          ].map(normalizeBookSearchText).join(' '),
        };
      }),
    [livros, preCategorias],
  );

  const areaOptions = useMemo(
    () =>
      [...new Set(processedLivros.map((livro) => livro.normalizedArea).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [processedLivros],
  );

  const areaUsageCount = useMemo(() => {
    const counts = new Map();
    processedLivros.forEach((livro) => {
      const area = String(livro.normalizedArea || '').trim();
      if (!area) return;
      counts.set(area.toLowerCase(), (counts.get(area.toLowerCase()) || 0) + 1);
    });
    return counts;
  }, [processedLivros]);

  const categoriasGerenciaveis = useMemo(() => {
    const term = preCategoriaSearch.trim().toLowerCase();
    return [...new Set([...preCategorias, ...areaOptions])]
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .filter((categoria) => !term || categoria.toLowerCase().includes(term))
      .map((categoria) => ({
        nome: categoria,
        saved: preCategorias.some((item) => item.toLowerCase() === categoria.toLowerCase()),
        inUse: areaOptions.some((item) => item.toLowerCase() === categoria.toLowerCase()),
        usageCount: areaUsageCount.get(categoria.toLowerCase()) || 0,
      }));
  }, [preCategorias, areaOptions, preCategoriaSearch, areaUsageCount]);

  const areaSuggestions = useMemo(() => {
    const term = String(formData.area || '').trim().toLowerCase();
    if (!term) return [];
    return [...new Set([...preCategorias, ...areaOptions])]
      .filter((categoria) => categoria.toLowerCase().includes(term))
      .filter((categoria) => categoria.toLowerCase() !== term)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
      .slice(0, 6);
  }, [formData.area, preCategorias, areaOptions]);

  const autorOptions = useMemo(
    () =>
      [...new Set(processedLivros.map((livro) => livro.normalizedAutor).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [processedLivros],
  );

  const filteredLivros = useMemo(() => {
    const term = normalizeBookSearchText(deferredSearchTerm);
    const normalizedTomboTerm = normalizeTomboSearchValue(deferredSearchTerm);
    return processedLivros.filter((livro) => {
      const searchMatches = !term
        || livro.searchIndex.includes(term)
        || (normalizedTomboTerm && livro.normalizedTombo.includes(normalizedTomboTerm));
      const areaMatches = areaFilter === 'all' || livro.normalizedArea === areaFilter;
      const statusMatches = statusFilter === 'all' || livro.normalizedStatus === statusFilter;
      const autorMatches = autorFilter === 'all' || livro.normalizedAutor === autorFilter;

      return searchMatches && areaMatches && statusMatches && autorMatches;
    });
  }, [processedLivros, deferredSearchTerm, areaFilter, statusFilter, autorFilter]);

  const totalLivros = processedLivros.length;
  const totalDisponiveis = useMemo(
    () => processedLivros.filter((livro) => livro.disponivel).length,
    [processedLivros],
  );
  const totalEmprestados = useMemo(
    () => processedLivros.filter((livro) => livro.isEmprestado).length,
    [processedLivros],
  );
  const hasActiveFilters = Boolean(searchTerm.trim()) || areaFilter !== 'all' || statusFilter !== 'all' || autorFilter !== 'all';

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
              {activeTab === 'acervo' && (
                <>
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
                <>
                  <Button onClick={() => handleOpenDialog()}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar
                  </Button>
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>

                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" translate="no">
                    <DialogHeader>
                      <DialogTitle>{editingLivro ? 'Editar Livro' : 'Novo Livro'}</DialogTitle>
                      <DialogDescription>
                        Preencha os campos do livro e salve no acervo.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="titulo">Título *</Label>
                        <Input id="titulo" value={formData.titulo} onChange={(e) => setFormData({ ...formData, titulo: e.target.value })} autoComplete="off" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="autor">Autor</Label>
                        <Input id="autor" value={formData.autor} onChange={(e) => setFormData({ ...formData, autor: e.target.value })} autoComplete="off" />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="area">Área</Label>
                        <Input id="area" value={formData.area} onChange={(e) => setFormData({ ...formData, area: e.target.value })} />
                        {areaSuggestions.length > 0 && (
                          <div className="rounded-md border bg-muted/20 p-2">
                            <p className="mb-2 text-xs text-muted-foreground">Categorias sugeridas</p>
                            <div className="flex flex-wrap gap-2">
                              {areaSuggestions.map((categoria) => (
                                <Button
                                  key={categoria}
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8"
                                  onClick={() => setFormData((prev) => ({ ...prev, area: categoria }))}
                                >
                                  {categoria}
                                </Button>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="space-y-2 pt-1">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs text-muted-foreground">Pré-categorias rápidas</p>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setIsDialogOpen(false);
                                setActiveTab('areas');
                              }}
                            >
                              Cadastro de Áreas
                            </Button>
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
                          <p className="text-xs text-muted-foreground">
                            Cadastre e edite áreas na subtela <strong>Cadastro de Áreas</strong>.
                          </p>
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
                        <Textarea
                          id="sinopse"
                          placeholder="Digite a sinopse ou use o botão acima..."
                          className="min-h-[120px] resize-y"
                          value={formData.sinopse || ''}
                          onChange={(e) => setFormData({ ...formData, sinopse: e.target.value })}
                          autoComplete="off"
                          autoCorrect="off"
                          spellCheck={false}
                          translate="no"
                          data-gramm="false"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                      <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
                </>
              )}
                </>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto whitespace-nowrap p-1">
              <TabsTrigger value="acervo">Acervo</TabsTrigger>
              {canManageAreas && <TabsTrigger value="areas">Cadastro de Áreas</TabsTrigger>}
            </TabsList>

            <TabsContent value="acervo" className="space-y-6">
          {canViewCatalogOnly ? (
            <>
              <div className="rounded-lg border bg-background p-4">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                  <div className="relative md:col-span-2">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      placeholder="Buscar por título, autor ou área..."
                      className="pl-9"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </div>

                  <Select value={areaFilter} onValueChange={setAreaFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todas as áreas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas as áreas</SelectItem>
                      {areaOptions.map((area) => (
                        <SelectItem key={area} value={area}>{area}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos os status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os status</SelectItem>
                      <SelectItem value="disponivel">Disponíveis</SelectItem>
                      <SelectItem value="emprestado">Emprestados</SelectItem>
                      <SelectItem value="indisponivel">Indisponíveis</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <Select value={autorFilter} onValueChange={setAutorFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos os autores" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os autores</SelectItem>
                      {autorOptions.map((autor) => (
                        <SelectItem key={autor} value={autor}>{autor}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1">
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      {filteredLivros.length} livros
                    </Badge>
                    {hasActiveFilters && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSearchTerm('');
                          setAreaFilter('all');
                          setStatusFilter('all');
                          setAutorFilter('all');
                        }}
                      >
                        Limpar filtros
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              {loading ? (
                <p className="py-8 text-center text-muted-foreground">Carregando catálogo...</p>
              ) : filteredLivros.length === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  {hasActiveFilters ? 'Nenhum livro encontrado com os filtros atuais.' : 'Nenhum livro disponível no catálogo.'}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredLivros.map((livro) => (
                    <Card key={livro.id} className="overflow-hidden rounded-3xl border-border/70 bg-gradient-to-br from-background via-background to-primary/5 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/25 hover:shadow-lg">
                      <CardContent className="flex h-full flex-col gap-4 p-5">
                        <div className="flex items-start justify-between gap-3">
                          <Badge variant="outline" className="rounded-full border-primary/20 bg-primary/5 px-3 py-1 text-primary">
                            {canonicalizeBookArea(livro.area, preCategorias) || 'Geral'}
                          </Badge>
                          <Badge
                            variant={getLivroStatusVariant(livro)}
                            className={livro.disponivel ? 'rounded-full bg-emerald-600 text-white hover:bg-emerald-600' : 'rounded-full'}
                          >
                            {getLivroStatusLabel(livro)}
                          </Badge>
                        </div>

                        <div className="space-y-1.5">
                          <p className="line-clamp-2 text-[1.35rem] font-semibold leading-7 text-foreground">{livro.titulo}</p>
                          <p className="text-base text-muted-foreground">{livro.autor || 'Autor desconhecido'}</p>
                          {(livro.editora || livro.ano) && (
                            <p className="text-xs font-medium text-muted-foreground/90">
                              {[livro.editora || null, livro.ano || null].filter(Boolean).join(' - ')}
                            </p>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <div className="rounded-xl border border-primary/10 bg-primary/5 px-3 py-2">Tombo: {livro.tombo || '-'}</div>
                          <div className="rounded-xl border border-secondary/20 bg-secondary/10 px-3 py-2">Volume: {livro.vol || '-'}</div>
                        </div>

                        <div className="mt-auto">
                          {livro.sinopse ? (
                            <button
                              type="button"
                              className="w-full rounded-2xl border border-border/70 bg-white/70 p-3 text-left transition-colors hover:border-primary/20 hover:bg-primary/5"
                              onClick={() => setSinopseExpandida(sinopseExpandida === livro.id ? null : livro.id)}
                            >
                              <p className="line-clamp-4 text-sm leading-6 text-muted-foreground" translate="no">{livro.sinopse}</p>
                              <p className="mt-2 text-xs font-medium text-primary">Ver sinopse completa</p>
                            </button>
                          ) : (
                            <div className="rounded-2xl border border-dashed border-border/80 bg-muted/20 p-3">
                              <p className="text-sm text-muted-foreground">Sem sinopse cadastrada.</p>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-11 justify-start gap-2 rounded-xl border-primary/20 bg-primary/5 px-3 text-xs hover:bg-primary/10"
                            disabled={resumoRapidoLoadingId === livro.id}
                            onClick={() => gerarResumoRapido(livro)}
                          >
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
                              {resumoRapidoLoadingId === livro.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                            </span>
                            <span className="flex flex-col items-start leading-none">
                              <span className="font-medium">{resumoRapidoLoadingId === livro.id ? 'Gerando...' : 'Resumo IA'}</span>
                              <span className="mt-1 text-[10px] text-muted-foreground">Leitura rapida</span>
                            </span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-11 justify-start gap-2 rounded-xl px-3 text-xs"
                            disabled={!livro.disponivel}
                            onClick={() => {
                              setRequestLivro(livro);
                              setRequestMsg('');
                              setRequestDialogOpen(true);
                            }}
                          >
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-foreground">
                              <BookOpen className="h-3.5 w-3.5" />
                            </span>
                            <span className="flex flex-col items-start leading-none">
                              <span className="font-medium">{livro.disponivel ? 'Solicitar' : 'Indisponivel'}</span>
                              <span className="mt-1 text-[10px] text-muted-foreground">
                                {livro.disponivel ? 'Pedir emprestimo' : 'Nao disponivel'}
                              </span>
                            </span>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          ) : (
          <>
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

                <Popover open={areaFilterOpen} onOpenChange={setAreaFilterOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={areaFilterOpen}
                      className="w-full justify-between sm:w-[220px]"
                    >
                      <span className="truncate">
                        {areaFilter === 'all' ? 'Todas as áreas' : areaFilter}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0 sm:w-[220px]" align="start">
                    <Command>
                      <CommandInput placeholder="Pesquisar área..." />
                      <CommandList>
                        <CommandEmpty>Nenhuma área encontrada.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="Todas as áreas"
                            onSelect={() => {
                              setAreaFilter('all');
                              setAreaFilterOpen(false);
                            }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${areaFilter === 'all' ? 'opacity-100' : 'opacity-0'}`} />
                            Todas as áreas
                          </CommandItem>
                          {areaOptions.map((area) => (
                            <CommandItem
                              key={area}
                              value={area}
                              onSelect={() => {
                                setAreaFilter(area);
                                setAreaFilterOpen(false);
                              }}
                            >
                              <Check className={`mr-2 h-4 w-4 ${areaFilter === area ? 'opacity-100' : 'opacity-0'}`} />
                              {area}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-full sm:w-[180px]">
                    <SelectValue placeholder="Filtrar por status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos os status</SelectItem>
                    <SelectItem value="disponivel">Disponíveis</SelectItem>
                    <SelectItem value="emprestado">Emprestados</SelectItem>
                    <SelectItem value="indisponivel">Indisponíveis</SelectItem>
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
                      setAutorFilter('all');
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
                              <TooltipContent side="left" className="max-w-xs" translate="no">
                                <p className="text-xs">{livro.sinopse.slice(0, 200)}{livro.sinopse.length > 200 ? '...' : ''}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={getLivroStatusVariant(livro)}>{getLivroStatusLabel(livro)}</Badge>
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
          </>
          )}
            </TabsContent>

            {canManageAreas && (
            <TabsContent value="areas" className="space-y-6">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,360px)_minmax(0,1fr)]">
                <Card>
                  <CardHeader>
                    <CardTitle>Cadastro de Áreas</CardTitle>
                    <CardDescription>
                      Cadastre novas áreas e edite os nomes já usados no acervo.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="nova-area">Nome da área</Label>
                      <Input
                        id="nova-area"
                        placeholder="Ex.: Literatura Brasileira"
                        value={novaPreCategoria}
                        onChange={(e) => setNovaPreCategoria(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAdicionarPreCategoria();
                          }
                        }}
                      />
                    </div>
                    <Button type="button" className="w-full" onClick={handleAdicionarPreCategoria}>
                      <Plus className="mr-2 h-4 w-4" />
                      Cadastrar área
                    </Button>
                    <p className="text-xs text-muted-foreground">
                      Todas as áreas devem ser criadas e editadas nesta subtela.
                    </p>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Áreas Cadastradas</CardTitle>
                    <CardDescription>
                      Gerencie as áreas disponíveis para vincular aos livros.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <Input
                      placeholder="Pesquisar área..."
                      value={preCategoriaSearch}
                      onChange={(e) => setPreCategoriaSearch(e.target.value)}
                    />

                    <div className="space-y-2">
                      {categoriasGerenciaveis.length === 0 ? (
                        <p className="rounded-md border px-3 py-6 text-center text-sm text-muted-foreground">
                          Nenhuma área encontrada.
                        </p>
                      ) : (
                        categoriasGerenciaveis.map((categoria) => (
                          <div key={categoria.nome} className="flex flex-col gap-3 rounded-md border px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                            <div className="min-w-0 flex-1">
                              {categoriaEmEdicao === categoria.nome ? (
                                <Input
                                  className="w-full"
                                  value={categoriaEditada}
                                  onChange={(e) => setCategoriaEditada(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault();
                                      handleAtualizarPreCategoria(categoria.nome);
                                    }
                                    if (e.key === 'Escape') {
                                      e.preventDefault();
                                      handleCancelarEdicaoPreCategoria();
                                    }
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <>
                                  <p className="break-words font-medium leading-snug">{categoria.nome}</p>
                                  <div className="mt-1 flex flex-wrap items-center gap-1">
                                    {categoria.saved && <Badge variant="secondary" className="text-[10px]">Cadastrada</Badge>}
                                    {categoria.inUse && <Badge variant="outline" className="text-[10px]">No acervo</Badge>}
                                    <Badge variant="outline" className="text-[10px]">{categoria.usageCount} livro(s)</Badge>
                                  </div>
                                </>
                              )}
                            </div>

                            {categoriaEmEdicao === categoria.nome ? (
                              <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="icon"
                                  className="h-9 w-9 shrink-0"
                                  disabled={categoriaSalvando === categoria.nome}
                                  onClick={() => handleAtualizarPreCategoria(categoria.nome)}
                                >
                                  {categoriaSalvando === categoria.nome ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 shrink-0"
                                  disabled={categoriaSalvando === categoria.nome}
                                  onClick={handleCancelarEdicaoPreCategoria}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-9 w-9 shrink-0"
                                  onClick={() => handleIniciarEdicaoPreCategoria(categoria.nome)}
                                >
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                {!categoria.saved ? (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="shrink-0"
                                    onClick={() => handleSalvarPreCategoria(categoria.nome)}
                                  >
                                    Salvar
                                  </Button>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-9 w-9 shrink-0"
                                    onClick={() => handleRemoverPreCategoria(categoria.nome)}
                                  >
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                )}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
            )}
          </Tabs>

          {sinopseExpandida && (
            <Dialog open={!!sinopseExpandida} onOpenChange={() => setSinopseExpandida(null)}>
              <DialogContent className="max-w-lg" translate="no">
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

          <Dialog open={requestDialogOpen} onOpenChange={setRequestDialogOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Solicitar empréstimo</DialogTitle>
                <DialogDescription>
                  Solicitar: {requestLivro?.titulo || 'Livro'}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Mensagem (opcional)</Label>
                  <Textarea
                    value={requestMsg}
                    onChange={(e) => setRequestMsg(e.target.value)}
                    placeholder="Motivo ou observações..."
                    rows={3}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setRequestDialogOpen(false)}>Cancelar</Button>
                <Button onClick={handleRequestLoan} disabled={requestingLoan}>
                  {requestingLoan ? 'Enviando...' : 'Enviar solicitação'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog
            open={resumoRapidoOpen}
            onOpenChange={(open) => {
              setResumoRapidoOpen(open);
              if (!open) setResumoRapidoData(null);
            }}
          >
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <div className="space-y-3">
                  <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary">
                    <Sparkles className="h-3.5 w-3.5" />
                    Resumo de leitura com IA
                  </div>
                  <div>
                    <DialogTitle>{resumoRapidoData?.titulo || 'Resumo rapido'}</DialogTitle>
                    {resumoRapidoData?.autor && (
                      <DialogDescription className="mt-1">{resumoRapidoData.autor}</DialogDescription>
                    )}
                  </div>
                </div>
              </DialogHeader>
              <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
                {resumoRapidoData?.texto ? (
                  <>
                    <div className="rounded-2xl border border-primary/15 bg-gradient-to-br from-primary/10 via-background to-background p-4">
                      <p className="text-sm leading-7 text-foreground/90">
                        Leia com calma, use este texto como apoio e adapte o conteudo ao contexto da turma quando necessario.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {splitResumoSections(resumoRapidoData.texto).map((section, index) => (
                        isResumoListSection(section) ? (
                          <div key={`section-${index}`} className="rounded-2xl border bg-background p-4 shadow-sm">
                            <ol className="space-y-3">
                              {section.split('\n').map((line) => line.trim()).filter(Boolean).map((line, itemIndex) => (
                                <li key={`item-${itemIndex}`} className="flex items-start gap-3 text-sm leading-6 text-foreground/90">
                                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                                    {itemIndex + 1}
                                  </span>
                                  <span>{formatResumoListItem(line)}</span>
                                </li>
                              ))}
                            </ol>
                          </div>
                        ) : (
                          <div key={`section-${index}`} className="rounded-2xl border bg-background p-4 shadow-sm">
                            <p className="whitespace-pre-wrap text-sm leading-7 text-foreground/90">{section}</p>
                          </div>
                        )
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="rounded-2xl border bg-background p-4 text-sm text-muted-foreground">
                    Resumo indisponivel.
                  </div>
                )}
              </div>
            </DialogContent>
          </Dialog>

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



