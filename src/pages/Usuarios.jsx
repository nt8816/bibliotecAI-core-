import { useEffect, useRef, useState, useCallback } from 'react';
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Users,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle,
  Loader2,
  Download,
  ArrowUpDown,
  KeyRound,
  Eye,
  EyeOff,
  Copy,
  RefreshCw,
} from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { useTenant } from '@/hooks/useTenant';
import { useToast } from '@/hooks/use-toast';
import { usePrivateTelemetry } from '@/hooks/usePrivateTelemetry';
import { ExportPeriodDialog } from '@/components/export/ExportPeriodDialog';
import {
  excluirUsuarios,
  fetchUsuariosModuleData,
  importUsuariosBatch,
  provisionarAlunoComMatricula,
  resetAlunoPassword,
  saveProfessorTurmas as saveProfessorTurmasService,
  saveUsuario,
} from '@/services/usuariosService';

const emptyUsuario = {
  nome: '',
  tipo: 'aluno',
  matricula: '',
  cpf: '',
  turma: '',
  telefone: '',
  email: '',
};

const MATRICULA_REGEX = /^[A-Za-z0-9._-]{6,32}$/;

const normalizeMatricula = (value) =>
  String(value || '')
    .trim()
    .replace(/\s+/g, '');
const normalizeHeader = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9/]+/g, '');
const normalizeTurmaKey = (value) =>
  String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const isValidMatricula = (value) => MATRICULA_REGEX.test(normalizeMatricula(value));
const isTempLoginEmail = (value) => /@temp\.bibliotecai\.com$/i.test(String(value || '').trim());
const getVisibleEmail = (nome, email) => (isTempLoginEmail(email) ? nome : (email || '-'));
const isMissingTableError = (error) => {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return (
    error?.code === '42P01'
    || error?.code === 'PGRST205'
    || message.includes('could not find the table')
    || message.includes('does not exist')
  );
};

const loadXlsx = async () => import('xlsx');
const loadPdf = async () => {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  return { jsPDF, autoTable };
};

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [turmaFilter, setTurmaFilter] = useState('all');
  const [sortField, setSortField] = useState('nome');
  const [sortDirection, setSortDirection] = useState('asc');
  const [selectedIds, setSelectedIds] = useState([]);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUsuario, setEditingUsuario] = useState(null);
  const [formData, setFormData] = useState(emptyUsuario);
  const [saving, setSaving] = useState(false);
  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [selectedAlunoForPassword, setSelectedAlunoForPassword] = useState(null);
  const [novaSenhaAluno, setNovaSenhaAluno] = useState('');
  const [senhaVisivel, setSenhaVisivel] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [senhaTemporariaGerada, setSenhaTemporariaGerada] = useState('');

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importUsuarios, setImportUsuarios] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [tipoUsuarioImport, setTipoUsuarioImport] = useState('aluno');
  const [turmasDisponiveis, setTurmasDisponiveis] = useState([]);
  const [professorTurmasMap, setProfessorTurmasMap] = useState({});
  const [professorTurmasSelecionadas, setProfessorTurmasSelecionadas] = useState([]);
  const [currentEscolaId, setCurrentEscolaId] = useState(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('xlsx');
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef(null);
  const handleCpfChange = (value) => {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    setFormData((prev) => ({ ...prev, cpf: digits }));
  };

  const { isGestor, isBibliotecaria, user } = useAuth();
  const { tenant } = useTenant();
  const { toast } = useToast();
  const { trackEvent } = usePrivateTelemetry();

  const canManageUsers = isGestor || isBibliotecaria;
  const canCreateGestor = isGestor;

  const userTypeOptions = canCreateGestor
    ? [
        { value: 'aluno', label: 'Aluno' },
        { value: 'professor', label: 'Professor' },
        { value: 'bibliotecaria', label: 'Bibliotecaria' },
        { value: 'gestor', label: 'Gestor' },
      ]
    : [
        { value: 'aluno', label: 'Aluno' },
        { value: 'professor', label: 'Professor' },
        { value: 'bibliotecaria', label: 'Bibliotecaria' },
      ];

  const fetchUsuarios = useCallback(async () => {
    if (!user?.id) {
      setUsuarios([]);
      setTurmasDisponiveis([]);
      setProfessorTurmasMap({});
      setCurrentEscolaId(null);
      setLoading(false);
      return;
    }
    try {
      const data = await fetchUsuariosModuleData({
        userId: user.id,
        tenantEscolaId: tenant?.escola_id || null,
      });
      setCurrentEscolaId(data?.currentEscolaId || null);
      setUsuarios(data?.usuarios || []);
      setTurmasDisponiveis(data?.turmasDisponiveis || []);
      setProfessorTurmasMap(data?.professorTurmasMap || {});
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível carregar os usuarios.' });
    } finally {
      setLoading(false);
    }
  }, [tenant?.escola_id, toast, user?.id]);
  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchUsuarios();
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchUsuarios();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchUsuarios]);

  const handleToggleProfessorTurma = (turma, checked) => {
    if (!turma) return;
    setProfessorTurmasSelecionadas((prev) => {
      if (checked) return [...new Set([...prev, turma])];
      return prev.filter((item) => item !== turma);
    });
  };

  const salvarTurmasProfessor = async (professor, turmas) => {
    const professorId = typeof professor === 'object' ? professor?.id : professor;
    const professorUserId = typeof professor === 'object' ? professor?.user_id : null;
    if (!isGestor || !professorId || !currentEscolaId) return;

    const turmasNormalizadas = [...new Set(
      (turmas || [])
        .map((turma) => String(turma || '').trim())
        .filter(Boolean),
    )];

    await saveProfessorTurmasService({
      professorId,
      professorUserId,
      currentEscolaId,
      turmas: turmasNormalizadas,
    });
  };

  const handleOpenDialog = (usuario) => {
    if (usuario && isBibliotecaria && !isGestor && usuario.tipo === 'gestor') {
      toast({
        variant: 'destructive',
        title: 'Sem permissao',
        description: 'Você nao pode editar informacoes do gestor.',
      });
      return;
    }

    if (usuario) {
      setEditingUsuario(usuario);
      setFormData({
        nome: usuario.nome,
        tipo: usuario.tipo,
        matricula: usuario.matricula || '',
        cpf: usuario.cpf || '',
        turma: usuario.turma || '',
        telefone: usuario.telefone || '',
        email: usuario.email,
      });
      setProfessorTurmasSelecionadas(
        usuario.tipo === 'professor'
          ? (professorTurmasMap[usuario.id] || [])
          : [],
      );
    } else {
      setEditingUsuario(null);
      setFormData(emptyUsuario);
      setProfessorTurmasSelecionadas([]);
    }

    setIsDialogOpen(true);
  };

  const provisionarAlunoViaServico = async (payload) => provisionarAlunoComMatricula(payload);

  const excluirUsuariosDoBanco = async (ids) => excluirUsuarios(ids);

  const handleSave = async () => {
    if (!formData.nome.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Nome e obrigatorio.' });
      return;
    }

    if (formData.tipo === 'aluno' && !formData.matricula.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Matricula e obrigatoria para aluno.' });
      return;
    }

    if (formData.tipo === 'aluno' && !isValidMatricula(formData.matricula)) {
      toast({
        variant: 'destructive',
        title: 'Matricula invalida',
        description: 'Use de 6 a 32 caracteres (letras, numeros, ponto, _ ou -).',
      });
      return;
    }

    if (formData.tipo !== 'aluno' && !formData.email.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Email e obrigatorio para este tipo de usuario.' });
      return;
    }

    if (!canCreateGestor && formData.tipo === 'gestor') {
      toast({
        variant: 'destructive',
        title: 'Sem permissao',
        description: 'A bibliotecaria nao pode cadastrar novos gestores.',
      });
      return;
    }

    if (!currentEscolaId) {
      toast({
        variant: 'destructive',
        title: 'Escola nao vinculada',
        description: 'Seu usuario nao esta vinculado a uma escola. Não é possível cadastrar usuarios.',
      });
      return;
    }

    setSaving(true);
    try {
      if (editingUsuario) {
        await saveUsuario(formData, editingUsuario.id);

        if (isGestor && formData.tipo === 'professor') {
          await salvarTurmasProfessor(editingUsuario, professorTurmasSelecionadas);
        } else if (isGestor && editingUsuario.tipo === 'professor' && formData.tipo !== 'professor') {
          await salvarTurmasProfessor(editingUsuario, []);
        }

        toast({ title: 'Sucesso', description: 'Usuario atualizado com sucesso.' });
        trackEvent('usuario_atualizado', { id: editingUsuario.id });
      } else {
        if (formData.tipo === 'aluno') {
          await provisionarAlunoViaServico({
            nome: formData.nome,
            matricula: normalizeMatricula(formData.matricula),
            turma: formData.turma,
            cpf: formData.cpf,
            telefone: formData.telefone,
          });
          toast({
            title: 'Aluno cadastrado',
            description: 'Login e senha iniciais do aluno sao a matricula.',
          });
        } else {
          const payload = {
            ...formData,
            escola_id: currentEscolaId,
          };
          const data = await saveUsuario(payload);

          if (isGestor && formData.tipo === 'professor' && data?.id) {
            await salvarTurmasProfessor(data, professorTurmasSelecionadas);
          }

          toast({ title: 'Sucesso', description: 'Usuario cadastrado com sucesso.' });
        }
        trackEvent('usuario_cadastrado', { tipo: formData.tipo });
      }

      setIsDialogOpen(false);
      fetchUsuarios();
    } catch (error) {
      const tableMessage = isMissingTableError(error)
        ? 'Tabela professor_turmas nao encontrada. Aplique as migrations do Supabase.'
        : null;
      toast({ variant: 'destructive', title: 'Erro', description: tableMessage || error.message || 'Não foi possível salvar o usuario.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Tem certeza que deseja excluir este usuario?')) return;

    setDeletingId(id);
    try {
      await excluirUsuariosDoBanco([id]);
      toast({ title: 'Sucesso', description: 'Usuario excluido com sucesso.' });
      trackEvent('usuario_excluido', { id });
      setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id));
      fetchUsuarios();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível excluir o usuario.' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedIds.length || !isGestor) return;
    if (!confirm(`Tem certeza que deseja excluir ${selectedIds.length} usuario(s)?`)) return;

    setBatchDeleting(true);
    try {
      await excluirUsuariosDoBanco(selectedIds);
      toast({ title: 'Sucesso', description: `${selectedIds.length} usuario(s) excluido(s).` });
      trackEvent('usuarios_exclusao_lote', { total: selectedIds.length });
      setSelectedIds([]);
      fetchUsuarios();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível excluir os usuarios selecionados.' });
    } finally {
      setBatchDeleting(false);
    }
  };

  const filtrarUsuariosPorPeriodo = (period) => {
    if (period.mode === 'total') return filteredUsuarios;
    const start = new Date(`${period.startDate}T00:00:00`);
    const end = new Date(`${period.endDate}T23:59:59`);
    return filteredUsuarios.filter((usuario) => {
      const refDate = usuario.created_at ? new Date(usuario.created_at) : null;
      if (!refDate || Number.isNaN(refDate.getTime())) return false;
      return refDate >= start && refDate <= end;
    });
  };

  const getPeriodLabel = (period) => {
    if (period.mode === 'total') return 'Periodo total';
    return `Periodo: ${period.startDate} a ${period.endDate}`;
  };

  const handleExportarUsuariosExcel = (usuariosSelecionados, periodLabel) => {
    return loadXlsx().then((XLSX) => {
    const headers = ['Nome', 'Email', 'Tipo', 'Matricula', 'CPF', 'Turma', 'Telefone'];
    const data = usuariosSelecionados.map((u) => [
      u.nome,
      getVisibleEmail(u.nome, u.email),
      getTipoLabel(u.tipo),
      u.matricula || '-',
      u.cpf || '-',
      u.turma || '-',
      u.telefone || '-',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
    XLSX.writeFile(wb, 'usuarios.xlsx');

    toast({ title: 'Exportado!', description: `Arquivo usuarios.xlsx baixado. ${periodLabel}` });
    }).catch(() => {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível exportar o arquivo Excel.' });
    });
  };

  const handleExportarUsuariosPDF = (usuariosSelecionados, periodLabel) => {
    return loadPdf().then(({ jsPDF, autoTable }) => {
      const doc = new jsPDF();
      doc.setFontSize(18);
      doc.text('BibliotecAI - Usuarios', 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Total: ${usuariosSelecionados.length} | ${periodLabel} | Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);

      const headers = ['Nome', 'Email', 'Tipo', 'Matricula', 'Turma', 'Telefone'];
      const data = usuariosSelecionados.map((u) => [u.nome, getVisibleEmail(u.nome, u.email), getTipoLabel(u.tipo), u.matricula || '-', u.turma || '-', u.telefone || '-']);

      autoTable(doc, { head: [headers], body: data, startY: 40, styles: { fontSize: 8 }, headStyles: { fillColor: [46, 125, 50] } });
      doc.save('usuarios.pdf');

      toast({ title: 'Exportado!', description: `Arquivo usuarios.pdf baixado. ${periodLabel}` });
    }).catch(() => {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível exportar o PDF.' });
    });
  };

  const handleOpenExportDialog = (format) => {
    setExportFormat(format);
    setExportDialogOpen(true);
  };

  const handleConfirmExport = async (period) => {
    const usuariosSelecionados = filtrarUsuariosPorPeriodo(period);
    if (usuariosSelecionados.length === 0) {
      toast({ variant: 'destructive', title: 'Sem dados', description: 'Não há usuarios no periodo selecionado.' });
      return;
    }

    setExporting(true);
    const periodLabel = getPeriodLabel(period);
    try {
      if (exportFormat === 'pdf') {
        await handleExportarUsuariosPDF(usuariosSelecionados, periodLabel);
      } else {
        await handleExportarUsuariosExcel(usuariosSelecionados, periodLabel);
      }
      setExportDialogOpen(false);
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    setImportUsuarios([]);

    try {
      const fileType = file.name.split('.').pop()?.toLowerCase();
      if (!['xlsx', 'xls', 'csv'].includes(fileType || '')) {
        toast({ title: 'Formato nao suportado', description: 'Use Excel (.xlsx, .xls) ou CSV.', variant: 'destructive' });
        return;
      }

      const XLSX = await loadXlsx();
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (jsonData.length < 2) {
        toast({ title: 'Arquivo vazio', description: 'O arquivo nao contem dados.', variant: 'destructive' });
        return;
      }

      const headers = jsonData[0].map((h) => normalizeHeader(h));
      const hasHeaderAlias = (header, aliases) => aliases.some((alias) => header === alias || header.includes(alias));
      const nomeIdx = headers.findIndex((h) => hasHeaderAlias(h, ['nome']));
      const matriculaIdx = headers.findIndex((h) => hasHeaderAlias(h, ['matricula/ra', 'matricula', 'ra']));
      const emailIdx = headers.findIndex((h) => hasHeaderAlias(h, ['email', 'e-mail']));
      const turmaIdx = headers.findIndex((h) => hasHeaderAlias(h, ['turma', 'sala', 'curso']));

      if (tipoUsuarioImport === 'aluno' && (nomeIdx === -1 || matriculaIdx === -1)) {
        toast({
          title: 'Colunas obrigatorias nao encontradas',
          description: 'Para alunos, a planilha deve conter: "Nome", "Matricula/RA" e opcionalmente "Turma".',
          variant: 'destructive',
        });
        return;
      }

      if (tipoUsuarioImport !== 'aluno' && (nomeIdx === -1 || emailIdx === -1)) {
        toast({
          title: 'Colunas obrigatorias nao encontradas',
          description: 'A planilha deve conter "Nome" e "Email".',
          variant: 'destructive',
        });
        return;
      }

      const imported = [];
      for (let i = 1; i < jsonData.length; i += 1) {
        const row = jsonData[i];
        const nome = row[nomeIdx] ? String(row[nomeIdx]).trim() : '';
        const matricula = matriculaIdx >= 0 && row[matriculaIdx] ? normalizeMatricula(row[matriculaIdx]) : '';
        const email = emailIdx >= 0 && row[emailIdx] ? String(row[emailIdx]).trim() : undefined;
        const turma = turmaIdx >= 0 && row[turmaIdx] ? String(row[turmaIdx]).trim() : undefined;

        if (tipoUsuarioImport === 'aluno') {
          if (!nome || !matricula) continue;
          imported.push({
            nome,
            matricula,
            turma,
            status: isValidMatricula(matricula) ? 'pendente' : 'erro',
            mensagem: isValidMatricula(matricula) ? undefined : 'Matricula/RA invalido (minimo 6 caracteres).',
          });
          continue;
        }

        if (!nome || !email) continue;
        imported.push({
          nome,
          matricula,
          email,
          turma,
          status: 'pendente',
        });
      }

      setImportUsuarios(imported);
      toast({ title: 'Arquivo processado', description: `${imported.length} usuarios encontrados.` });
    } catch {
      toast({ title: 'Erro ao processar', description: 'Verifique o formato do arquivo.', variant: 'destructive' });
    } finally {
      setImportLoading(false);
    }
  };

  const importarUsuarios = async () => {
    if (!user || importUsuarios.length === 0) return;
    setImporting(true);
    try {
      const response = await importUsuariosBatch({
        usuarios: importUsuarios,
        tipoUsuarioImport,
        currentEscolaId,
        userId: user.id,
      });
      const updated = response?.usuarios || [];
      setImportUsuarios(updated);
      const successCount = updated.filter((u) => u.status === 'sucesso').length;
      toast({ title: 'Importacao concluida', description: `${successCount} de ${updated.length} importados.` });
      fetchUsuarios();
    } catch {
      toast({ title: 'Erro na importacao', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const baixarModelo = () => {
    loadXlsx().then((XLSX) => {
      const isAlunoImport = tipoUsuarioImport === 'aluno';
      const ws = XLSX.utils.aoa_to_sheet(isAlunoImport
        ? [
            ['Nome', 'Matricula/RA', 'Turma'],
            ['Joao Silva', '2024001', '3o Ano A'],
            ['Maria Santos', '2024002', '3º Ano B'],
          ]
        : [
            ['Nome', 'Email', 'Matricula', 'Turma'],
            ['Ana Souza', 'ana@escola.com', 'PROF001', '3º Ano A'],
            ['Carlos Lima', 'carlos@escola.com', 'PROF002', '3º Ano B'],
          ]);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Usuarios');
      XLSX.writeFile(wb, 'modelo_importacao_usuarios.xlsx');
    }).catch(() => {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível baixar o modelo.' });
    });
  };

  const getTipoBadgeVariant = (tipo) => {
    if (tipo === 'gestor') return 'default';
    if (tipo === 'professor') return 'secondary';
    if (tipo === 'bibliotecaria') return 'secondary';
    return 'outline';
  };

  const getTipoLabel = (tipo) => {
    if (tipo === 'gestor') return 'Gestor';
    if (tipo === 'professor') return 'Professor';
    if (tipo === 'bibliotecaria') return 'Bibliotecaria';
    return 'Aluno';
  };

  const getImportStatusBadge = (status) => {
    if (status === 'sucesso') return <Badge className="bg-success"><CheckCircle className="w-3 h-3 mr-1" />Sucesso</Badge>;
    if (status === 'erro') return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Erro</Badge>;
    return <Badge variant="secondary">Pendente</Badge>;
  };

  const turmaFilterOptions = (() => {
    const oficiais = turmasDisponiveis
      .map((turma) => String(turma || '').trim())
      .filter(Boolean);
    const fallbackUsuarios = usuarios
      .map((usuario) => String(usuario?.turma || '').trim())
      .filter(Boolean);

    const canonicalMap = new Map();

    oficiais.forEach((turma) => {
      canonicalMap.set(normalizeTurmaKey(turma), turma);
    });

    fallbackUsuarios.forEach((turma) => {
      const key = normalizeTurmaKey(turma);
      if (!canonicalMap.has(key)) canonicalMap.set(key, turma);
    });

    return Array.from(canonicalMap.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  })();

  const filteredUsuarios = usuarios.filter((usuario) => {
    const matchesSearch =
      usuario.nome.toLowerCase().includes(searchTerm.toLowerCase())
      || String(usuario.email || '').toLowerCase().includes(searchTerm.toLowerCase())
      || (usuario.matricula || '').toLowerCase().includes(searchTerm.toLowerCase());

    const matchesTurma = turmaFilter === 'all' || String(usuario.turma || '').trim() === turmaFilter;

    return matchesSearch && matchesTurma;
  });

  const sortedUsuarios = [...filteredUsuarios].sort((a, b) => {
    const aValue = String(a?.[sortField] || '').toLowerCase();
    const bValue = String(b?.[sortField] || '').toLowerCase();

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  const allVisibleSelected = sortedUsuarios.length > 0 && sortedUsuarios.every((u) => selectedIds.includes(u.id));

  const handleToggleSelectAll = (checked) => {
    if (!checked) {
      setSelectedIds([]);
      return;
    }
    setSelectedIds(sortedUsuarios.map((u) => u.id));
  };

  const handleToggleUserSelection = (id, checked) => {
    if (checked) {
      setSelectedIds((prev) => [...new Set([...prev, id])]);
      return;
    }
    setSelectedIds((prev) => prev.filter((value) => value !== id));
  };

  const handleToggleSort = (field) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortField(field);
    setSortDirection('asc');
  };

  const gerarSenhaTemporaria = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let senha = '';
    for (let i = 0; i < 10; i += 1) {
      senha += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return senha;
  };

  const handleOpenPasswordDialog = (aluno) => {
    if (!isGestor) {
      toast({
        variant: 'destructive',
        title: 'Sem permissao',
        description: 'Apenas gestores podem redefinir senha de alunos.',
      });
      return;
    }

    if (aluno.tipo !== 'aluno') {
      toast({
        variant: 'destructive',
        title: 'Acao invalida',
        description: 'A redefinicao esta disponivel apenas para alunos.',
      });
      return;
    }

    setSelectedAlunoForPassword(aluno);
    setNovaSenhaAluno(gerarSenhaTemporaria());
    setSenhaTemporariaGerada('');
    setSenhaVisivel(false);
    setPasswordDialogOpen(true);
  };

  const handleResetAlunoPassword = async () => {
    if (!selectedAlunoForPassword?.id) return;
    const senha = novaSenhaAluno.trim();
    if (senha.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Senha invalida',
        description: 'A senha deve ter pelo menos 6 caracteres.',
      });
      return;
    }
    setResettingPassword(true);
    try {
      const data = await resetAlunoPassword(selectedAlunoForPassword.id, senha);
      setSenhaTemporariaGerada(data.senha_temporaria || senha);
      toast({
        title: 'Senha redefinida',
        description: `Senha temporaria de ${selectedAlunoForPassword.nome} atualizada com sucesso.`,
      });
      trackEvent('senha_aluno_redefinida', { usuario_id: selectedAlunoForPassword.id });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível redefinir a senha.',
      });
    } finally {
      setResettingPassword(false);
    }
  };

  const handleCopyPassword = async () => {
    if (!senhaTemporariaGerada) return;
    try {
      await navigator.clipboard.writeText(senhaTemporariaGerada);
      toast({ title: 'Senha copiada', description: 'A senha temporaria foi copiada para a area de transferencia.' });
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível copiar a senha.' });
    }
  };

  return (
    <MainLayout title="Usuarios">
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Users className="w-5 h-5" />
                Gerenciamento de Usuarios
              </CardTitle>

              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Buscar usuarios..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>

                <select
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm sm:w-56"
                  value={turmaFilter}
                  onChange={(e) => setTurmaFilter(e.target.value)}
                  aria-label="Filtrar por sala"
                >
                  <option value="all">Todas as salas</option>
                  {turmaFilterOptions.map((turma) => (
                    <option key={turma} value={turma}>{turma}</option>
                  ))}
                </select>

                <Button type="button" variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => handleToggleSort('nome')}>
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  Ordenar nome ({sortDirection === 'asc' ? 'A-Z' : 'Z-A'})
                </Button>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full sm:w-auto">
                      <Upload className="w-4 h-4 mr-2" />
                      Exportar dados
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-2" align="end">
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleOpenExportDialog('xlsx')}>Excel (.xlsx)</Button>
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleOpenExportDialog('pdf')}>PDF (.pdf)</Button>
                  </PopoverContent>
                </Popover>

                {canManageUsers && (
                  <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full sm:w-auto">
                        <Download className="w-4 h-4 mr-2" />
                        Importar em Massa
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[95vw] sm:max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Importar Usuarios em Massa</DialogTitle>
                        <DialogDescription>
                          {tipoUsuarioImport === 'aluno'
                            ? 'Para alunos, use as colunas: Nome, Matricula/RA e Turma.'
                            : 'Envie uma planilha para cadastrar varios usuarios de uma vez.'}
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-6 py-2">
                        <Alert>
                          <FileSpreadsheet className="w-4 h-4" />
                          <AlertDescription className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                            <span className="text-sm">Baixe o modelo de planilha para preencher os dados.</span>
                            <Button variant="outline" size="sm" onClick={baixarModelo} className="w-full sm:w-auto">
                              <Download className="w-4 h-4 mr-2" />
                              Baixar Modelo
                            </Button>
                          </AlertDescription>
                        </Alert>

                        <div className="flex flex-col sm:flex-row gap-4 items-start">
                          <div className="w-full space-y-2 sm:w-auto">
                            <Label>Tipo de Usuario</Label>
                            <select
                              value={tipoUsuarioImport}
                              onChange={(e) => setTipoUsuarioImport(e.target.value)}
                              className="h-10 w-full sm:w-[200px] rounded-md border border-input bg-background px-3 text-sm"
                            >
                              <option value="aluno">Alunos</option>
                              <option value="professor">Professores</option>
                            </select>
                          </div>

                          <div className="w-full sm:flex-1">
                            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importLoading} className="w-full sm:w-auto">
                              {importLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processando...</> : <><Download className="w-4 h-4 mr-2" />Selecionar Arquivo</>}
                            </Button>
                          </div>
                        </div>

                        {importUsuarios.length > 0 && (
                          <div className="space-y-4">
                            <Alert className="border-primary bg-primary/10">
                              <CheckCircle className="w-4 h-4 text-primary" />
                              <AlertDescription className="flex flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
                                <span className="font-medium">{importUsuarios.length} usuários encontrados.</span>
                                <Button onClick={importarUsuarios} disabled={importing} size="sm" className="w-full sm:ml-4 sm:w-auto">
                                  {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</> : <><Download className="w-4 h-4 mr-2" />Importar Todos</>}
                                </Button>
                              </AlertDescription>
                            </Alert>

                            <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                              <Table>
                                <TableHeader>
                                  <TableRow>
                                    <TableHead>Nome</TableHead>
                                    <TableHead>Matricula</TableHead>
                                    {tipoUsuarioImport !== 'aluno' && <TableHead>Email</TableHead>}
                                    <TableHead>Turma</TableHead>
                                    <TableHead>Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {importUsuarios.slice(0, 50).map((u, idx) => (
                                    <TableRow key={`${u.matricula}-${idx}`}>
                                      <TableCell className="font-medium">{u.nome}</TableCell>
                                      <TableCell>{u.matricula}</TableCell>
                                      {tipoUsuarioImport !== 'aluno' && <TableCell>{getVisibleEmail(u.nome, u.email)}</TableCell>}
                                      <TableCell>{u.turma || '-'}</TableCell>
                                      <TableCell>
                                        <div className="flex flex-col gap-1">
                                          {getImportStatusBadge(u.status)}
                                          {u.mensagem && <span className="text-xs text-destructive">{u.mensagem}</span>}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              {importUsuarios.length > 50 && <div className="p-3 text-center text-sm text-muted-foreground border-t">Mostrando 50 de {importUsuarios.length}</div>}
                            </div>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {canManageUsers && (
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={() => handleOpenDialog()} className="w-full sm:w-auto">
                        <Plus className="w-4 h-4 mr-2" />
                        Adicionar
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{editingUsuario ? 'Editar Usuario' : 'Novo Usuario'}</DialogTitle>
                        <DialogDescription>
                          Preencha os dados do usuario para cadastrar ou atualizar.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="nome">Nome *</Label>
                          <Input id="nome" value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="email">Email {formData.tipo === 'aluno' ? '(opcional)' : '*'}</Label>
                          <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="tipo">Tipo</Label>
                          <select
                            id="tipo"
                            value={formData.tipo}
                            onChange={(e) => {
                              const nextTipo = e.target.value;
                              setFormData({ ...formData, tipo: nextTipo });
                              if (nextTipo !== 'professor') setProfessorTurmasSelecionadas([]);
                            }}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          >
                            {userTypeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="matricula">Matricula</Label>
                          <Input id="matricula" value={formData.matricula} onChange={(e) => setFormData({ ...formData, matricula: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="cpf">CPF</Label>
                          <Input id="cpf" value={formData.cpf} onChange={(e) => handleCpfChange(e.target.value)} />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="turma">Turma</Label>
                          <Input
                            id="turma"
                            list="turmas-disponiveis"
                            value={formData.turma}
                            onChange={(e) => setFormData({ ...formData, turma: e.target.value })}
                            placeholder={turmaFilterOptions.length > 0 ? 'Selecione ou digite a turma' : 'Digite a turma'}
                          />
                          <datalist id="turmas-disponiveis">
                            {turmaFilterOptions.map((turma) => (
                              <option key={turma} value={turma} />
                            ))}
                          </datalist>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="telefone">Telefone</Label>
                          <Input id="telefone" value={formData.telefone} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} />
                        </div>

                        {isGestor && formData.tipo === 'professor' && (
                          <div className="space-y-2 md:col-span-2">
                            <Label>Turmas liberadas para o professor</Label>
                            {turmaFilterOptions.length === 0 ? (
                              <p className="text-sm text-muted-foreground">
                                Nenhuma turma cadastrada. Cadastre turmas em Configuracao da Escola.
                              </p>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-md border p-3">
                                {turmaFilterOptions.map((turma) => {
                                  const checked = professorTurmasSelecionadas.includes(turma);
                                  return (
                                    <label key={turma} className="flex items-center gap-2 text-sm">
                                      <Checkbox
                                        checked={checked}
                                        onCheckedChange={(value) => handleToggleProfessorTurma(turma, Boolean(value))}
                                      />
                                      <span>{turma}</span>
                                    </label>
                                  );
                                })}
                              </div>
                            )}
                            <p className="text-xs text-muted-foreground">
                              O professor vera apenas alunos e atividades das turmas selecionadas.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
                        <Button onClick={handleSave} disabled={saving} className="w-full sm:w-auto">{saving ? 'Salvando...' : 'Salvar'}</Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {isGestor && (
                  <Dialog
                    open={passwordDialogOpen}
                    onOpenChange={(open) => {
                      setPasswordDialogOpen(open);
                      if (!open) {
                        setSelectedAlunoForPassword(null);
                        setNovaSenhaAluno('');
                        setSenhaTemporariaGerada('');
                        setSenhaVisivel(false);
                      }
                    }}
                  >
                    <DialogContent className="max-w-[95vw] sm:max-w-lg">
                      <DialogHeader>
                        <DialogTitle>Redefinir senha do aluno</DialogTitle>
                        <DialogDescription>
                          Defina uma nova senha para o aluno selecionado. A senha atual nao pode ser visualizada.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4 py-2">
                        <div className="rounded-md border bg-muted/40 p-3 text-sm">
                          <p>
                            <strong>Aluno:</strong> {selectedAlunoForPassword?.nome || '-'}
                          </p>
                          <p className="text-muted-foreground mt-1 break-all">
                            {getVisibleEmail(selectedAlunoForPassword?.nome || 'Aluno', selectedAlunoForPassword?.email)}
                          </p>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="novaSenhaAluno">Nova senha</Label>
                          <div className="flex gap-2">
                            <Input
                              id="novaSenhaAluno"
                              type={senhaVisivel ? 'text' : 'password'}
                              value={novaSenhaAluno}
                              onChange={(e) => setNovaSenhaAluno(e.target.value)}
                              placeholder="Minimo 6 caracteres"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => setSenhaVisivel((prev) => !prev)}
                              aria-label={senhaVisivel ? 'Ocultar senha' : 'Mostrar senha'}
                            >
                              {senhaVisivel ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                            </Button>
                          </div>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          className="w-full"
                          onClick={() => {
                            setNovaSenhaAluno(gerarSenhaTemporaria());
                            setSenhaTemporariaGerada('');
                          }}
                        >
                          <RefreshCw className="w-4 h-4 mr-2" />
                          Gerar senha automatica
                        </Button>

                        {senhaTemporariaGerada && (
                          <Alert>
                            <AlertDescription className="space-y-2">
                              <p className="text-sm font-medium">
                                Senha temporaria definida: <code>{senhaTemporariaGerada}</code>
                              </p>
                              <Button type="button" size="sm" variant="outline" onClick={handleCopyPassword}>
                                <Copy className="w-4 h-4 mr-2" />
                                Copiar senha
                              </Button>
                            </AlertDescription>
                          </Alert>
                        )}
                      </div>

                      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                        <Button variant="outline" onClick={() => setPasswordDialogOpen(false)} className="w-full sm:w-auto">
                          Fechar
                        </Button>
                        <Button onClick={handleResetAlunoPassword} disabled={resettingPassword} className="w-full sm:w-auto">
                          {resettingPassword ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Redefinindo...</> : 'Salvar nova senha'}
                        </Button>
                      </div>
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : sortedUsuarios.length === 0 ? (
              <div className="py-10 text-center space-y-3">
                <p className="text-muted-foreground">{searchTerm || turmaFilter !== 'all' ? 'Nenhum usuario encontrado' : 'Nenhum usuario cadastrado'}</p>
                {canManageUsers && (
                  <Button onClick={() => handleOpenDialog()}>
                    <Plus className="w-4 h-4 mr-2" />
                    Cadastrar primeiro usuario
                  </Button>
                )}
              </div>
            ) : (
              <>
                {isGestor && selectedIds.length > 0 && (
                  <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border bg-muted/40 p-3">
                    <p className="text-sm font-medium">{selectedIds.length} usuario(s) selecionado(s)</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedIds([])}>Limpar selecao</Button>
                      <Button variant="destructive" size="sm" disabled={batchDeleting} onClick={handleDeleteSelected}>
                        {batchDeleting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Excluindo...</> : <>Excluir selecionados</>}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-3 md:hidden">
                  {sortedUsuarios.map((usuario) => (
                    <div key={usuario.id} className="rounded-lg border bg-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 gap-2">
                          {isGestor && (
                            <Checkbox
                              checked={selectedIds.includes(usuario.id)}
                              onCheckedChange={(checked) => handleToggleUserSelection(usuario.id, Boolean(checked))}
                              aria-label={`Selecionar ${usuario.nome}`}
                              className="mt-0.5"
                            />
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{usuario.nome}</p>
                            <p className="text-xs text-muted-foreground break-all">{getVisibleEmail(usuario.nome, usuario.email)}</p>
                          </div>
                        </div>
                        <Badge variant={getTipoBadgeVariant(usuario.tipo)}>{getTipoLabel(usuario.tipo)}</Badge>
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                        <p className="text-muted-foreground">Matricula</p>
                        <p className="text-right truncate">{usuario.matricula || '-'}</p>
                        <p className="text-muted-foreground">Turma</p>
                        <p className="text-right truncate">{usuario.turma || '-'}</p>
                        <p className="text-muted-foreground">Telefone</p>
                        <p className="text-right truncate">{usuario.telefone || '-'}</p>
                      </div>

                      {canManageUsers && (
                        <div className="mt-3 flex gap-2">
                          {!(isBibliotecaria && !isGestor && usuario.tipo === 'gestor') && (
                            <Button variant="outline" size="sm" className="flex-1" onClick={() => handleOpenDialog(usuario)}>
                              <Pencil className="w-4 h-4 mr-2" />
                              Editar
                            </Button>
                          )}
                          {isGestor && usuario.tipo === 'aluno' && (
                            <Button variant="outline" size="sm" className="flex-1" onClick={() => handleOpenPasswordDialog(usuario)}>
                              <KeyRound className="w-4 h-4 mr-2" />
                              Senha
                            </Button>
                          )}
                          {isGestor && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => handleDelete(usuario.id)}
                              disabled={deletingId === usuario.id}
                            >
                              {deletingId === usuario.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2 text-destructive" />}
                              Excluir
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="hidden md:block overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isGestor && (
                        <TableHead className="w-10">
                          <Checkbox
                            checked={allVisibleSelected}
                            onCheckedChange={(checked) => handleToggleSelectAll(Boolean(checked))}
                            aria-label="Selecionar todos os usuarios visiveis"
                          />
                        </TableHead>
                      )}
                      <TableHead>
                        <button type="button" className="inline-flex items-center gap-1" onClick={() => handleToggleSort('nome')}>
                          Nome
                          <ArrowUpDown className="h-3.5 w-3.5" />
                        </button>
                      </TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Matricula</TableHead>
                      <TableHead>Turma</TableHead>
                      <TableHead>Telefone</TableHead>
                      {canManageUsers && <TableHead className="text-right">Acoes</TableHead>}
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {sortedUsuarios.map((usuario) => (
                      <TableRow key={usuario.id}>
                        {isGestor && (
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.includes(usuario.id)}
                              onCheckedChange={(checked) => handleToggleUserSelection(usuario.id, Boolean(checked))}
                              aria-label={`Selecionar ${usuario.nome}`}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-medium">{usuario.nome}</TableCell>
                        <TableCell>{getVisibleEmail(usuario.nome, usuario.email)}</TableCell>
                        <TableCell><Badge variant={getTipoBadgeVariant(usuario.tipo)}>{getTipoLabel(usuario.tipo)}</Badge></TableCell>
                        <TableCell>{usuario.matricula}</TableCell>
                        <TableCell>{usuario.turma}</TableCell>
                        <TableCell>{usuario.telefone}</TableCell>
                        {canManageUsers && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {!(isBibliotecaria && !isGestor && usuario.tipo === 'gestor') && (
                                <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(usuario)} aria-label={`Editar ${usuario.nome}`}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              )}
                              {isGestor && usuario.tipo === 'aluno' && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleOpenPasswordDialog(usuario)}
                                  aria-label={`Redefinir senha de ${usuario.nome}`}
                                >
                                  <KeyRound className="w-4 h-4" />
                                </Button>
                              )}
                              {isGestor && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => handleDelete(usuario.id)}
                                  disabled={deletingId === usuario.id}
                                  aria-label={`Excluir ${usuario.nome}`}
                                >
                                  {deletingId === usuario.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4 text-destructive" />}
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <ExportPeriodDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        title="Exportar usuarios"
        description="Escolha o periodo para exportar os usuarios."
        loading={exporting}
        onConfirm={handleConfirmExport}
      />
    </MainLayout>
  );
}


