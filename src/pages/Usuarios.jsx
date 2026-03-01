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
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { usePrivateTelemetry } from '@/hooks/usePrivateTelemetry';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import { ExportPeriodDialog } from '@/components/export/ExportPeriodDialog';

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

const isValidMatricula = (value) => MATRICULA_REGEX.test(normalizeMatricula(value));
const isTempLoginEmail = (value) => /@temp\.bibliotecai\.com$/i.test(String(value || '').trim());
const getVisibleEmail = (nome, email) => (isTempLoginEmail(email) ? nome : (email || '-'));

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
  const [currentEscolaId, setCurrentEscolaId] = useState(null);
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('xlsx');
  const [exporting, setExporting] = useState(false);
  const fileInputRef = useRef(null);

  const { isGestor, isBibliotecaria, user } = useAuth();
  const { toast } = useToast();
  const { trackEvent } = usePrivateTelemetry();

  const canManageUsers = isGestor || isBibliotecaria;
  const canCreateGestor = isGestor;

  const userTypeOptions = canCreateGestor
    ? [
        { value: 'aluno', label: 'Aluno' },
        { value: 'professor', label: 'Professor' },
        { value: 'bibliotecaria', label: 'Bibliotecária' },
        { value: 'gestor', label: 'Gestor' },
      ]
    : [
        { value: 'aluno', label: 'Aluno' },
        { value: 'professor', label: 'Professor' },
        { value: 'bibliotecaria', label: 'Bibliotecária' },
      ];

  const fetchUsuarios = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('usuarios_biblioteca').select('*').order('nome');
      if (error) throw error;
      setUsuarios(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível carregar os usuários.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchCurrentEscola = useCallback(async () => {
    if (!user?.id) return;
    try {
      const { data, error } = await supabase
        .from('usuarios_biblioteca')
        .select('escola_id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setCurrentEscolaId(data?.escola_id || null);
    } catch (error) {
      console.error('Error fetching current escola:', error);
    }
  }, [user?.id]);

  const fetchTurmas = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('salas_cursos').select('nome, tipo').order('nome');
      if (error) throw error;

      const turmas = [...new Set((data || [])
        .filter((item) => item?.nome && item?.tipo === 'sala')
        .map((item) => item.nome.trim())
        .filter(Boolean))];

      setTurmasDisponiveis(turmas);
    } catch (error) {
      console.error('Error fetching turmas:', error);
    }
  }, []);

  useEffect(() => {
    fetchUsuarios();
    fetchTurmas();
    fetchCurrentEscola();
  }, [fetchCurrentEscola, fetchUsuarios, fetchTurmas]);

  const handleRealtimeChange = useCallback(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  useRealtimeSubscription({ table: 'usuarios_biblioteca', onChange: handleRealtimeChange });
  useRealtimeSubscription({ table: 'salas_cursos', onChange: fetchTurmas });

  const handleOpenDialog = (usuario) => {
    if (usuario && isBibliotecaria && !isGestor && usuario.tipo === 'gestor') {
      toast({
        variant: 'destructive',
        title: 'Sem permissão',
        description: 'Você não pode editar informações do gestor.',
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
    } else {
      setEditingUsuario(null);
      setFormData(emptyUsuario);
    }

    setIsDialogOpen(true);
  };

  const provisionarAlunoComMatricula = async (payload) => {
    const data = await invokeEdgeFunction('provisionar-aluno-matricula', {
      body: payload,
      requireAuth: true,
      signOutOnAuthFailure: true,
      fallbackErrorMessage: 'Não foi possível provisionar login por matrícula.',
    });

    if (!data?.success) {
      throw new Error(data?.error || 'Não foi possível provisionar login por matrícula.');
    }

    return data;
  };

  const handleSave = async () => {
    if (!formData.nome.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Nome é obrigatório.' });
      return;
    }

    if (formData.tipo === 'aluno' && !formData.matricula.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Matrícula é obrigatória para aluno.' });
      return;
    }

    if (formData.tipo === 'aluno' && !isValidMatricula(formData.matricula)) {
      toast({
        variant: 'destructive',
        title: 'Matrícula inválida',
        description: 'Use de 6 a 32 caracteres (letras, números, ponto, _ ou -).',
      });
      return;
    }

    if (formData.tipo !== 'aluno' && !formData.email.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Email é obrigatório para este tipo de usuário.' });
      return;
    }

    if (!canCreateGestor && formData.tipo === 'gestor') {
      toast({
        variant: 'destructive',
        title: 'Sem permissão',
        description: 'A bibliotecária não pode cadastrar novos gestores.',
      });
      return;
    }

    if (!currentEscolaId) {
      toast({
        variant: 'destructive',
        title: 'Escola não vinculada',
        description: 'Seu usuário não está vinculado a uma escola. Não é possível cadastrar usuários.',
      });
      return;
    }

    setSaving(true);
    try {
      if (editingUsuario) {
        const { error } = await supabase.from('usuarios_biblioteca').update(formData).eq('id', editingUsuario.id);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Usuário atualizado com sucesso.' });
        trackEvent('usuario_atualizado', { id: editingUsuario.id });
      } else {
        if (formData.tipo === 'aluno') {
          await provisionarAlunoComMatricula({
            nome: formData.nome,
            matricula: normalizeMatricula(formData.matricula),
            turma: formData.turma,
            cpf: formData.cpf,
            telefone: formData.telefone,
          });
          toast({
            title: 'Aluno cadastrado',
            description: 'Login e senha iniciais do aluno são a matrícula.',
          });
        } else {
          const payload = {
            ...formData,
            escola_id: currentEscolaId,
          };
          const { error } = await supabase.from('usuarios_biblioteca').insert(payload);
          if (error) throw error;
          toast({ title: 'Sucesso', description: 'Usuário cadastrado com sucesso.' });
        }
        trackEvent('usuario_cadastrado', { tipo: formData.tipo });
      }

      setIsDialogOpen(false);
      fetchUsuarios();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível salvar o usuário.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;

    setDeletingId(id);
    try {
      const { error } = await supabase.from('usuarios_biblioteca').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Usuário excluído com sucesso.' });
      trackEvent('usuario_excluido', { id });
      setSelectedIds((prev) => prev.filter((selectedId) => selectedId !== id));
      fetchUsuarios();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível excluir o usuário.' });
    } finally {
      setDeletingId(null);
    }
  };

  const handleDeleteSelected = async () => {
    if (!selectedIds.length || !isGestor) return;
    if (!confirm(`Tem certeza que deseja excluir ${selectedIds.length} usuário(s)?`)) return;

    setBatchDeleting(true);
    try {
      const { error } = await supabase.from('usuarios_biblioteca').delete().in('id', selectedIds);
      if (error) throw error;
      toast({ title: 'Sucesso', description: `${selectedIds.length} usuário(s) excluído(s).` });
      trackEvent('usuarios_exclusao_lote', { total: selectedIds.length });
      setSelectedIds([]);
      fetchUsuarios();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível excluir os usuários selecionados.' });
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
    if (period.mode === 'total') return 'Período total';
    return `Período: ${period.startDate} a ${period.endDate}`;
  };

  const handleExportarUsuariosExcel = (usuariosSelecionados, periodLabel) => {
    return loadXlsx().then((XLSX) => {
    const headers = ['Nome', 'Email', 'Tipo', 'Matrícula', 'CPF', 'Turma', 'Telefone'];
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
    XLSX.utils.book_append_sheet(wb, ws, 'Usuários');
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
      doc.text('BibliotecAI - Usuários', 14, 22);
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text(`Total: ${usuariosSelecionados.length} | ${periodLabel} | Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);

      const headers = ['Nome', 'Email', 'Tipo', 'Matrícula', 'Turma', 'Telefone'];
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
      toast({ variant: 'destructive', title: 'Sem dados', description: 'Não há usuários no período selecionado.' });
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
        toast({ title: 'Formato não suportado', description: 'Use Excel (.xlsx, .xls) ou CSV.', variant: 'destructive' });
        return;
      }

      const XLSX = await loadXlsx();
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (jsonData.length < 2) {
        toast({ title: 'Arquivo vazio', description: 'O arquivo não contém dados.', variant: 'destructive' });
        return;
      }

      const headers = jsonData[0].map((h) => String(h).toLowerCase().trim());
      const nomeIdx = headers.findIndex((h) => h.includes('nome'));
      const matriculaIdx = headers.findIndex((h) => h.includes('matricula') || h.includes('matrícula'));
      const emailIdx = headers.findIndex((h) => h.includes('email') || h.includes('e-mail'));
      const turmaIdx = headers.findIndex((h) => h.includes('turma') || h.includes('sala') || h.includes('curso'));

      if (nomeIdx === -1 || matriculaIdx === -1) {
        toast({ title: 'Colunas obrigatórias não encontradas', description: 'O arquivo deve conter "Nome" e "Matrícula".', variant: 'destructive' });
        return;
      }

      const imported = [];
      for (let i = 1; i < jsonData.length; i += 1) {
        const row = jsonData[i];
        if (!row[nomeIdx] || !row[matriculaIdx]) continue;

        const matricula = normalizeMatricula(row[matriculaIdx]);

        imported.push({
          nome: String(row[nomeIdx]).trim(),
          matricula,
          email: emailIdx >= 0 && row[emailIdx] ? String(row[emailIdx]).trim() : undefined,
          turma: turmaIdx >= 0 && row[turmaIdx] ? String(row[turmaIdx]).trim() : undefined,
          status: isValidMatricula(matricula) ? 'pendente' : 'erro',
          mensagem: isValidMatricula(matricula) ? undefined : 'Matrícula inválida (mínimo 6 caracteres).',
        });
      }

      setImportUsuarios(imported);
      toast({ title: 'Arquivo processado', description: `${imported.length} usuários encontrados.` });
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
      const { data: escola } = await supabase.from('escolas').select('id').eq('gestor_id', user.id).maybeSingle();

      const updated = [...importUsuarios];

      for (let i = 0; i < updated.length; i += 1) {
        const u = updated[i];

        try {
          let error = null;

          if (tipoUsuarioImport === 'aluno') {
            if (!isValidMatricula(u.matricula)) {
              updated[i] = { ...u, status: 'erro', mensagem: 'Matrícula inválida (mínimo 6 caracteres).' };
              setImportUsuarios([...updated]);
              continue;
            }

            const result = await provisionarAlunoComMatricula({
              nome: u.nome,
              matricula: u.matricula,
              turma: u.turma,
            });

            if (!result?.success) {
              error = { message: result?.error || 'Não foi possível provisionar o aluno.' };
            }
          } else {
            const email = u.email || `${u.matricula}@temp.bibliotecai.com`;
            const response = await supabase.from('usuarios_biblioteca').insert({
              nome: u.nome,
              matricula: u.matricula,
              email,
              turma: u.turma,
              tipo: tipoUsuarioImport,
              escola_id: escola?.id,
            });
            error = response.error;
          }

          if (error) {
            updated[i] = { ...u, status: 'erro', mensagem: error.code === '23505' ? 'Já existe' : error.message };
          } else {
            updated[i] = { ...u, status: 'sucesso' };
          }
        } catch (err) {
          updated[i] = { ...u, status: 'erro', mensagem: err.message };
        }

        setImportUsuarios([...updated]);
      }

      const successCount = updated.filter((u) => u.status === 'sucesso').length;
      toast({ title: 'Importação concluída', description: `${successCount} de ${updated.length} importados.` });
      fetchUsuarios();
    } catch {
      toast({ title: 'Erro na importação', variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const baixarModelo = () => {
    loadXlsx().then((XLSX) => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['Nome', 'Matrícula', 'Email', 'Turma'],
        ['João Silva', '2024001', 'joao@email.com', '3º Ano A'],
        ['Maria Santos', '2024002', 'maria@email.com', '3º Ano B'],
      ]);

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Usuários');
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
    if (tipo === 'bibliotecaria') return 'Bibliotecária';
    return 'Aluno';
  };

  const getImportStatusBadge = (status) => {
    if (status === 'sucesso') return <Badge className="bg-success"><CheckCircle className="w-3 h-3 mr-1" />Sucesso</Badge>;
    if (status === 'erro') return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Erro</Badge>;
    return <Badge variant="secondary">Pendente</Badge>;
  };

  const filteredUsuarios = usuarios.filter((usuario) =>
    usuario.nome.toLowerCase().includes(searchTerm.toLowerCase())
    || String(usuario.email || '').toLowerCase().includes(searchTerm.toLowerCase())
    || (usuario.matricula || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

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
        title: 'Sem permissão',
        description: 'Apenas gestores podem redefinir senha de alunos.',
      });
      return;
    }

    if (aluno.tipo !== 'aluno') {
      toast({
        variant: 'destructive',
        title: 'Ação inválida',
        description: 'A redefinição está disponível apenas para alunos.',
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
        title: 'Senha inválida',
        description: 'A senha deve ter pelo menos 6 caracteres.',
      });
      return;
    }

    setResettingPassword(true);
    try {
      const data = await invokeEdgeFunction('redefinir-senha-aluno', {
        body: {
          aluno_id: selectedAlunoForPassword.id,
          nova_senha: senha,
        },
        requireAuth: true,
        signOutOnAuthFailure: true,
        fallbackErrorMessage: 'Não foi possível redefinir a senha.',
      });

      if (!data?.success) {
        throw new Error(data?.error || 'Não foi possível redefinir a senha.');
      }

      setSenhaTemporariaGerada(data.senha_temporaria || senha);
      toast({
        title: 'Senha redefinida',
        description: `Senha temporária de ${selectedAlunoForPassword.nome} atualizada com sucesso.`,
      });
      trackEvent('senha_aluno_redefinida', { usuario_id: selectedAlunoForPassword.id });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao redefinir senha',
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
      toast({ title: 'Senha copiada', description: 'A senha temporária foi copiada para a área de transferência.' });
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível copiar a senha.' });
    }
  };

  return (
    <MainLayout title="Usuários">
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardHeader className="p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                <Users className="w-5 h-5" />
                Gerenciamento de Usuários
              </CardTitle>

              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input placeholder="Buscar usuários..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>

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
                        <DialogTitle>Importar Usuários em Massa</DialogTitle>
                        <DialogDescription>
                          Envie uma planilha para cadastrar vários usuários de uma vez.
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
                            <Label>Tipo de Usuário</Label>
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
                                    <TableHead>Matrícula</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Turma</TableHead>
                                    <TableHead>Status</TableHead>
                                  </TableRow>
                                </TableHeader>
                                <TableBody>
                                  {importUsuarios.slice(0, 50).map((u, idx) => (
                                    <TableRow key={`${u.matricula}-${idx}`}>
                                      <TableCell className="font-medium">{u.nome}</TableCell>
                                      <TableCell>{u.matricula}</TableCell>
                                      <TableCell>{getVisibleEmail(u.nome, u.email)}</TableCell>
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
                        <DialogTitle>{editingUsuario ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
                        <DialogDescription>
                          Preencha os dados do usuário para cadastrar ou atualizar.
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
                            onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
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
                          <Label htmlFor="matricula">Matrícula</Label>
                          <Input id="matricula" value={formData.matricula} onChange={(e) => setFormData({ ...formData, matricula: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="cpf">CPF</Label>
                          <Input id="cpf" value={formData.cpf} onChange={(e) => setFormData({ ...formData, cpf: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="turma">Turma</Label>
                          <Input
                            id="turma"
                            list="turmas-disponiveis"
                            value={formData.turma}
                            onChange={(e) => setFormData({ ...formData, turma: e.target.value })}
                            placeholder={turmasDisponiveis.length > 0 ? 'Selecione ou digite a turma' : 'Digite a turma'}
                          />
                          <datalist id="turmas-disponiveis">
                            {turmasDisponiveis.map((turma) => (
                              <option key={turma} value={turma} />
                            ))}
                          </datalist>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="telefone">Telefone</Label>
                          <Input id="telefone" value={formData.telefone} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} />
                        </div>
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
                          Defina uma nova senha para o aluno selecionado. A senha atual não pode ser visualizada.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-4 py-2">
                        <div className="rounded-md border bg-muted/40 p-3 text-sm">
                          <p>
                            <strong>Aluno:</strong> {selectedAlunoForPassword?.nome || '—'}
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
                              placeholder="Mínimo 6 caracteres"
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
                          Gerar senha automática
                        </Button>

                        {senhaTemporariaGerada && (
                          <Alert>
                            <AlertDescription className="space-y-2">
                              <p className="text-sm font-medium">
                                Senha temporária definida: <code>{senhaTemporariaGerada}</code>
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
                <p className="text-muted-foreground">{searchTerm ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}</p>
                {canManageUsers && (
                  <Button onClick={() => handleOpenDialog()}>
                    <Plus className="w-4 h-4 mr-2" />
                    Cadastrar primeiro usuário
                  </Button>
                )}
              </div>
            ) : (
              <>
                {isGestor && selectedIds.length > 0 && (
                  <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-md border bg-muted/40 p-3">
                    <p className="text-sm font-medium">{selectedIds.length} usuário(s) selecionado(s)</p>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => setSelectedIds([])}>Limpar seleção</Button>
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
                        <p className="text-muted-foreground">Matrícula</p>
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
                            aria-label="Selecionar todos os usuários visíveis"
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
                      <TableHead>Matrícula</TableHead>
                      <TableHead>Turma</TableHead>
                      <TableHead>Telefone</TableHead>
                      {canManageUsers && <TableHead className="text-right">Ações</TableHead>}
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
        title="Exportar usuários"
        description="Escolha o período para exportar os usuários."
        loading={exporting}
        onConfirm={handleConfirmExport}
      />
    </MainLayout>
  );
}
