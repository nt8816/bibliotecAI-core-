import { useEffect, useState, useCallback, useMemo } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { usePrivateTelemetry } from '@/hooks/usePrivateTelemetry';
import {
  Plus,
  BookMarked,
  CheckCircle,
  AlertTriangle,
  Search,
  Download,
  Upload,
  CalendarIcon,
  Inbox,
  XCircle,
  ArrowUpDown,
  Loader2,
  Trash2,
} from 'lucide-react';
import { format, isPast, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { ExportPeriodDialog } from '@/components/export/ExportPeriodDialog';
import {
  approveSolicitacaoEmprestimo,
  createEmprestimo,
  createHistoricEmprestimo,
  deleteHistoricEmprestimo,
  fetchEmprestimosData,
  markSolicitacaoLivroIndisponivel,
  registerEmprestimoDevolucao,
  rejectSolicitacaoEmprestimo,
} from '@/services/emprestimosService';
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

function toIsoDateTime(dateValue, fallbackHour = '12:00') {
  if (!dateValue) return null;
  return new Date(`${dateValue}T${fallbackHour}:00`).toISOString();
}

function addOneMonthToDateInput(dateValue) {
  if (!dateValue) return '';
  return format(addMonths(new Date(`${dateValue}T12:00:00`), 1), 'yyyy-MM-dd');
}

function isTempLoginEmail(value) {
  return /@temp\.bibliotecai\.com$/i.test(String(value || '').trim());
}

function getVisibleEmail(nome, email) {
  return isTempLoginEmail(email) ? (nome || '-') : (email || '-');
}

export default function Emprestimos() {
  const [searchParams] = useSearchParams();
  const [emprestimos, setEmprestimos] = useState([]);
  const [solicitacoes, setSolicitacoes] = useState([]);
  const [livrosDisponiveis, setLivrosDisponiveis] = useState([]);
  const [livrosCatalogo, setLivrosCatalogo] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [escolaAtualId, setEscolaAtualId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isOldLoanDialogOpen, setIsOldLoanDialogOpen] = useState(false);
  const [selectedLivro, setSelectedLivro] = useState('');
  const [selectedUsuario, setSelectedUsuario] = useState('');
  const [dataDevolucao, setDataDevolucao] = useState(undefined);
  const [oldLoanLivro, setOldLoanLivro] = useState('');
  const [oldLoanUsuario, setOldLoanUsuario] = useState('');
  const [oldLoanStatus, setOldLoanStatus] = useState('devolvido');
  const [oldLoanDataEmprestimo, setOldLoanDataEmprestimo] = useState('');
  const [oldLoanDataPrevista, setOldLoanDataPrevista] = useState('');
  const [oldLoanDataDevolucao, setOldLoanDataDevolucao] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchUsuario, setSearchUsuario] = useState('');
  const [searchLivro, setSearchLivro] = useState('');
  const [oldSearchUsuario, setOldSearchUsuario] = useState('');
  const [oldSearchLivro, setOldSearchLivro] = useState('');
  const [respostaPorSolicitacao, setRespostaPorSolicitacao] = useState({});
  const [sortDirection, setSortDirection] = useState('desc');
  const [activeTab, setActiveTab] = useState('ativos');
  const [actionLoading, setActionLoading] = useState({ devolucaoId: null, solicitacaoId: null, tipo: null });
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('xlsx');
  const [exporting, setExporting] = useState(false);
  const [deleteConfirmEmprestimo, setDeleteConfirmEmprestimo] = useState(null);

  const { isBibliotecaria, user } = useAuth();
  const { toast } = useToast();
  const { trackEvent } = usePrivateTelemetry();
  const canManageLoans = isBibliotecaria;
  const requestedTab = searchParams.get('tab');
  const requestedStatus = searchParams.get('status');

  const fetchData = useCallback(async () => {
    try {
      const payload = await fetchEmprestimosData({ userId: user.id, canManageLoans });
      setEscolaAtualId(payload?.escolaId || null);
      setEmprestimos(Array.isArray(payload?.emprestimos) ? payload.emprestimos : []);
      setLivrosCatalogo(Array.isArray(payload?.livrosCatalogo) ? payload.livrosCatalogo : []);
      setLivrosDisponiveis(Array.isArray(payload?.livrosDisponiveis) ? payload.livrosDisponiveis : []);
      setUsuarios(Array.isArray(payload?.usuarios) ? payload.usuarios : []);
      setSolicitacoes(Array.isArray(payload?.solicitacoes) ? payload.solicitacoes : []);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'N??o foi poss??vel carregar os dados.' });
    } finally {
      setLoading(false);
    }
  }, [canManageLoans, toast, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      fetchData();
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData]);

  const handleCreateEmprestimo = async () => {
    if (!selectedLivro || !selectedUsuario) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Selecione um livro e um usu??rio.' });
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
      await createEmprestimo(insertData);
      toast({ title: 'Sucesso', description: 'Empr??stimo registrado com sucesso.' });
      trackEvent('emprestimo_criado', { livroId: selectedLivro, usuarioId: selectedUsuario });
      setIsDialogOpen(false);
      setSelectedLivro('');
      setSelectedUsuario('');
      setDataDevolucao(undefined);
      setSearchUsuario('');
      setSearchLivro('');
      fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'N??o foi poss??vel registrar o empr??stimo.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDevolucao = async (emprestimo) => {
    setActionLoading({ devolucaoId: emprestimo.id, solicitacaoId: null, tipo: 'devolucao' });
    try {
      await registerEmprestimoDevolucao(emprestimo.id);
      toast({ title: 'Sucesso', description: 'Devolu????o registrada com sucesso.' });
      trackEvent('emprestimo_devolvido', { id: emprestimo.id });
      fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'N??o foi poss??vel registrar a devolu????o.' });
    } finally {
      setActionLoading({ devolucaoId: null, solicitacaoId: null, tipo: null });
    }
  };

  const handleAprovarSolicitacao = async (solicitacao) => {
    if (!canManageLoans || solicitacao.status !== 'pendente') return;
    setSaving(true);
    setActionLoading({ devolucaoId: null, solicitacaoId: solicitacao.id, tipo: 'aprovar' });
    try {
      if (solicitacao?.livros?.disponivel === false && solicitacao.status !== 'indisponivel_em_analise') {
        throw new Error('Este livro n??o est?? dispon??vel para empr??stimo no momento.');
      }
      const resposta = (respostaPorSolicitacao[solicitacao.id] || '').trim() || 'Solicita????o aprovada pela biblioteca.';
      await approveSolicitacaoEmprestimo(solicitacao.id, resposta);
      toast({ title: 'Solicita????o aprovada', description: 'Empr??stimo criado e aluno notificado.' });
      trackEvent('solicitacao_aprovada', { id: solicitacao.id });
      setRespostaPorSolicitacao((prev) => ({ ...prev, [solicitacao.id]: '' }));
      fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'N??o foi poss??vel aprovar a solicita????o.' });
    } finally {
      setSaving(false);
      setActionLoading({ devolucaoId: null, solicitacaoId: null, tipo: null });
    }
  };

  const handleRecusarSolicitacao = async (solicitacao) => {
    if (!canManageLoans || solicitacao.status !== 'pendente') return;
    setSaving(true);
    setActionLoading({ devolucaoId: null, solicitacaoId: solicitacao.id, tipo: 'recusar' });
    try {
      const resposta = (respostaPorSolicitacao[solicitacao.id] || '').trim() || 'Solicita????o recusada pela biblioteca.';
      await rejectSolicitacaoEmprestimo(solicitacao.id, resposta);
      toast({ title: 'Solicita????o recusada' });
      trackEvent('solicitacao_recusada', { id: solicitacao.id });
      setRespostaPorSolicitacao((prev) => ({ ...prev, [solicitacao.id]: '' }));
      fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'N??o foi poss??vel recusar a solicita????o.' });
    } finally {
      setSaving(false);
      setActionLoading({ devolucaoId: null, solicitacaoId: null, tipo: null });
    }
  };

  const handleMarcarSolicitacaoIndisponivel = async (solicitacao) => {
    if (!canManageLoans || solicitacao.status !== 'pendente') return;
    setSaving(true);
    setActionLoading({ devolucaoId: null, solicitacaoId: solicitacao.id, tipo: 'indisponivel' });
    try {
      const resposta = (respostaPorSolicitacao[solicitacao.id] || '').trim() || 'Livro marcado como indisponivel e em analise pela biblioteca.';
      await markSolicitacaoLivroIndisponivel(solicitacao.id, resposta);
      toast({
        title: 'Livro marcado como indisponÃ­vel',
        description: 'O livro foi reservado no acervo para anÃ¡lise da biblioteca.',
      });
      trackEvent('solicitacao_livro_indisponivel', { id: solicitacao.id });
      setRespostaPorSolicitacao((prev) => ({ ...prev, [solicitacao.id]: '' }));
      fetchData();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error?.message || 'NÃ£o foi possÃ­vel marcar o livro como indisponÃ­vel.',
      });
    } finally {
      setSaving(false);
      setActionLoading({ devolucaoId: null, solicitacaoId: null, tipo: null });
    }
  };

  const resetOldLoanForm = useCallback(() => {
    setOldLoanLivro('');
    setOldLoanUsuario('');
    setOldLoanStatus('devolvido');
    setOldLoanDataEmprestimo('');
    setOldLoanDataPrevista('');
    setOldLoanDataDevolucao('');
    setOldSearchUsuario('');
    setOldSearchLivro('');
  }, []);

  const handleCreateOldEmprestimo = async () => {
    if (!oldLoanLivro || !oldLoanUsuario || !oldLoanDataEmprestimo) {
      toast({
        variant: 'destructive',
        title: 'Campos obrigat??rios',
        description: 'Selecione o aluno, o livro e a data do empr??stimo.',
      });
      return;
    }
    if (oldLoanStatus === 'devolvido' && !oldLoanDataDevolucao) {
      toast({
        variant: 'destructive',
        title: 'Data obrigat??ria',
        description: 'Informe a data de devolu????o para registrar um empr??stimo j?? devolvido.',
      });
      return;
    }
    const defaultOldLoanDataPrevista = addOneMonthToDateInput(oldLoanDataEmprestimo);
    const effectiveOldLoanDataPrevista = oldLoanDataPrevista || defaultOldLoanDataPrevista;
    if (effectiveOldLoanDataPrevista && effectiveOldLoanDataPrevista < oldLoanDataEmprestimo) {
      toast({
        variant: 'destructive',
        title: 'Per??odo inv??lido',
        description: 'A devolução prevista não pode ser anterior à data do empréstimo.',
      });
      return;
    }
    if (effectiveOldLoanDataPrevista && effectiveOldLoanDataPrevista > defaultOldLoanDataPrevista) {
      toast({
        variant: 'destructive',
        title: 'Prazo inv??lido',
        description: 'A devolu????o prevista pode ser de no m??ximo 1 m??s ap??s a data do empr??stimo.',
      });
      return;
    }
    if (oldLoanDataDevolucao && oldLoanDataDevolucao < oldLoanDataEmprestimo) {
      toast({
        variant: 'destructive',
        title: 'Per??odo inv??lido',
        description: 'A devolu????o real n??o pode ser anterior ?? data do empr??stimo.',
      });
      return;
    }
    const livroSelecionado = livrosCatalogo.find((livro) => livro.id === oldLoanLivro);
    if (oldLoanStatus === 'ativo' && livroSelecionado && !livroSelecionado.disponivel) {
      toast({
        variant: 'destructive',
        title: 'Livro indispon??vel',
        description: 'Esse livro j?? est?? marcado como indispon??vel no acervo atual.',
      });
      return;
    }
    setSaving(true);
    try {
      const insertData = {
        livro_id: oldLoanLivro,
        usuario_id: oldLoanUsuario,
        status: oldLoanStatus,
        data_emprestimo: toIsoDateTime(oldLoanDataEmprestimo),
        data_devolucao_prevista: toIsoDateTime(effectiveOldLoanDataPrevista),
        data_devolucao_real: oldLoanStatus === 'devolvido' ? toIsoDateTime(oldLoanDataDevolucao) : null,
      };
      await createHistoricEmprestimo(insertData);
      toast({
        title: 'Empr??stimo antigo registrado',
        description: 'O hist??rico foi salvo com sucesso.',
      });
      setIsOldLoanDialogOpen(false);
      resetOldLoanForm();
      fetchData();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error?.message || 'N??o foi poss??vel registrar este empr??stimo antigo.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleExcluirHistorico = async (emprestimo) => {
    if (!canManageLoans || !emprestimo?.id || emprestimo?.status !== 'devolvido') return;
    setActionLoading({ devolucaoId: null, solicitacaoId: emprestimo.id, tipo: 'excluir_historico' });
    try {
      await deleteHistoricEmprestimo(emprestimo.id);
      toast({ title: 'Hist??rico exclu??do', description: 'O registro foi removido com sucesso.' });
      setDeleteConfirmEmprestimo(null);
      fetchData();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error?.message || 'N??o foi poss??vel excluir este empr??stimo.' });
    } finally {
      setActionLoading({ devolucaoId: null, solicitacaoId: null, tipo: null });
    }
  };

  const filtrarEmprestimosPorPeriodo = (period) => {
    if (period.mode === 'total') return emprestimos;
    const start = new Date(`${period.startDate}T00:00:00`);
    const end = new Date(`${period.endDate}T23:59:59`);
    return emprestimos.filter((emprestimo) => {
      const refDate = emprestimo.data_emprestimo ? new Date(emprestimo.data_emprestimo) : null;
      if (!refDate || Number.isNaN(refDate.getTime())) return false;
      return refDate >= start && refDate <= end;
    });
  };

  const getPeriodLabel = (period) => {
    if (period.mode === 'total') return 'Período total';
    return `Período: ${period.startDate} a ${period.endDate}`;
  };

  const handleExportarExcel = (emprestimosSelecionados, periodLabel) => {
    const headers = ['Livro', 'Autor', 'Usuário', 'Email', 'Data Empréstimo', 'Devolução Prevista', 'Devolução Real', 'Status'];
    const data = emprestimosSelecionados.map((e) => [
      e.livros?.titulo || '-',
      e.livros?.autor || '-',
      e.usuarios_biblioteca?.nome || '-',
      getVisibleEmail(e.usuarios_biblioteca?.nome, e.usuarios_biblioteca?.email),
      formatDateBR(e.data_emprestimo),
      formatDateBR(e.data_devolucao_prevista),
      e.data_devolucao_real ? formatDateBR(e.data_devolucao_real) : '-',
      e.status === 'ativo' ? (isPast(new Date(e.data_devolucao_prevista)) ? 'Atrasado' : 'Ativo') : 'Devolvido',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Empréstimos');
    XLSX.writeFile(wb, 'emprestimos.xlsx');
    toast({ title: 'Exportado!', description: `Arquivo emprestimos.xlsx baixado. ${periodLabel}` });
  };

  const handleExportarPDF = (emprestimosSelecionados, periodLabel) => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('BibliotecAI - Empréstimos', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`${periodLabel} | Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);

    const headers = ['Livro', 'Usuário', 'Empréstimo', 'Prev. Devolução', 'Status'];
    const data = emprestimosSelecionados.map((e) => [
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
    toast({ title: 'Exportado!', description: `Arquivo emprestimos.pdf baixado. ${periodLabel}` });
  };

  const handleOpenExportDialog = (format) => {
    setExportFormat(format);
    setExportDialogOpen(true);
  };

  const handleConfirmExport = async (period) => {
    const emprestimosSelecionados = filtrarEmprestimosPorPeriodo(period);
    if (emprestimosSelecionados.length === 0) {
      toast({ variant: 'destructive', title: 'Sem dados', description: 'Não há empréstimos no período selecionado.' });
      return;
    }

    setExporting(true);
    const periodLabel = getPeriodLabel(period);
    try {
      if (exportFormat === 'pdf') {
        handleExportarPDF(emprestimosSelecionados, periodLabel);
      } else {
        handleExportarExcel(emprestimosSelecionados, periodLabel);
      }
      setExportDialogOpen(false);
    } finally {
      setExporting(false);
    }
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
    if (status === 'indisponivel_em_analise') return <Badge variant="outline">Sob AnÃ¡lise</Badge>;
    if (status === 'indisponivel_em_analise') return <Badge variant="outline">IndisponÃ­vel em anÃ¡lise</Badge>;
    return <Badge variant="secondary">Pendente</Badge>;
  };

  const renderSolicitacaoCard = (solicitacao, { readOnly = false } = {}) => {
      const isPendente = solicitacao.status === 'pendente';
      const isEmAnalise = solicitacao.status === 'indisponivel_em_analise';
      const isProcessavel = isPendente || isEmAnalise;
      const isExtension = String(solicitacao?.tipo || 'emprestimo') === 'prorrogacao';
      const livroDisponivel = solicitacao?.livros?.disponivel !== false;

    return (
      <div
        key={solicitacao.id}
        className={cn('border rounded-lg p-4 space-y-3', readOnly && 'bg-destructive/5')}
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
          <div>
            <p className="font-medium">{solicitacao.livros?.titulo || 'Livro'}</p>
            <p className="text-sm text-muted-foreground">{solicitacao.livros?.autor || '-'}</p>
            <p className="text-xs text-muted-foreground">
              Aluno: {solicitacao.usuarios_biblioteca?.nome || '-'} • {formatDateBR(solicitacao.created_at)}
            </p>
            <p className="text-xs text-muted-foreground">
              {isExtension ? 'Tipo: pedido de prorrogação' : 'Tipo: solicitação de empréstimo'}
            </p>
          </div>
          <div>{getStatusSolicitacaoBadge(solicitacao.status)}</div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <p className="text-xs text-muted-foreground mb-1">Mensagem do aluno</p>
            <p className="text-sm rounded-md border p-2 min-h-[52px] bg-muted/30">{solicitacao.mensagem || 'Sem mensagem.'}</p>
            {isExtension && (
              <div className="mt-2 rounded-md border bg-background p-2 text-xs text-muted-foreground">
                <p>Data atual: {formatDateBR(solicitacao.data_devolucao_atual)}</p>
                <p>Nova data pedida: {formatDateBR(solicitacao.nova_data_devolucao_solicitada)}</p>
              </div>
            )}
          </div>
          <div>
            {readOnly ? (
              <>
                <p className="text-xs text-muted-foreground mb-1">Resposta da biblioteca</p>
                <p className="text-sm rounded-md border p-2 min-h-[52px] bg-background">
                  {solicitacao.resposta || respostaPorSolicitacao[solicitacao.id] || 'Sem resposta registrada.'}
                </p>
              </>
            ) : (
              <>
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
                  disabled={!isProcessavel || saving}
                />
              </>
            )}
          </div>
        </div>

          {!readOnly && isProcessavel ? (
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-end gap-2">
              <Button
                variant="secondary"
                className="w-full sm:w-auto"
                disabled={saving || !isPendente || !livroDisponivel || (actionLoading.solicitacaoId === solicitacao.id && actionLoading.tipo !== 'indisponivel')}
                onClick={() => handleMarcarSolicitacaoIndisponivel(solicitacao)}
              >
                {actionLoading.solicitacaoId === solicitacao.id && actionLoading.tipo === 'indisponivel' ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <AlertTriangle className="w-4 h-4 mr-2" />
                )}
                {livroDisponivel ? 'Marcar indisponÃ­vel' : 'JÃ¡ indisponÃ­vel'}
              </Button>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled={saving || (actionLoading.solicitacaoId === solicitacao.id && actionLoading.tipo === 'aprovar')}
              onClick={() => handleRecusarSolicitacao(solicitacao)}
            >
              {actionLoading.solicitacaoId === solicitacao.id && actionLoading.tipo === 'recusar' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="w-4 h-4 mr-2" />
              )}
              Recusar
            </Button>
            <Button
              className="w-full sm:w-auto"
              disabled={saving || (actionLoading.solicitacaoId === solicitacao.id && actionLoading.tipo === 'recusar')}
              onClick={() => handleAprovarSolicitacao(solicitacao)}
            >
              {actionLoading.solicitacaoId === solicitacao.id && actionLoading.tipo === 'aprovar' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="w-4 h-4 mr-2" />
              )}
              {isExtension ? 'Aprovar prorrogação' : 'Aprovar e gerar empréstimo'}
            </Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {readOnly ? 'Solicitação movida para a área de recusadas.' : 'Solicitação finalizada.'}
          </p>
        )}
      </div>
    );
  };

  const sortEmprestimos = (list) =>
    [...list].sort((a, b) => {
      const dateA = new Date(a?.data_emprestimo || a?.created_at || 0).getTime();
      const dateB = new Date(b?.data_emprestimo || b?.created_at || 0).getTime();
      return sortDirection === 'asc' ? dateA - dateB : dateB - dateA;
    });

  const emprestimosAtivos = sortEmprestimos(emprestimos.filter((e) => e.status === 'ativo'));
  const emprestimosHistorico = sortEmprestimos(emprestimos.filter((e) => e.status === 'devolvido'));
  const emprestimosAtivosFiltrados = requestedStatus === 'atrasados'
    ? emprestimosAtivos.filter((emprestimo) => isAtrasado(emprestimo))
    : emprestimosAtivos;
  const solicitacoesPendentes = useMemo(
    () => solicitacoes.filter((s) => ['pendente', 'indisponivel_em_analise'].includes(String(s?.status || '').toLowerCase())),
    [solicitacoes],
  );
  const solicitacoesRecusadas = useMemo(
    () => solicitacoes.filter((s) => ['recusada', 'negada', 'cancelada'].includes(String(s?.status || '').toLowerCase())),
    [solicitacoes],
  );

  useEffect(() => {
    const defaultTab = canManageLoans ? 'solicitacoes' : 'ativos';
    const nextTab = requestedTab || defaultTab;
    const isValidTab = ['ativos', 'historico', ...(canManageLoans ? ['solicitacoes', 'recusadas'] : [])].includes(nextTab);
    setActiveTab(isValidTab ? nextTab : defaultTab);
  }, [canManageLoans, requestedTab]);

  if (!isBibliotecaria) {
    return <Navigate to="/dashboard" replace />;
  }

  const filteredUsuarios = usuarios.filter(
    (u) => u.nome.toLowerCase().includes(searchUsuario.toLowerCase()) || String(u.email || '').toLowerCase().includes(searchUsuario.toLowerCase()),
  );

  const filteredLivrosDialog = livrosDisponiveis.filter(
    (l) => l.titulo.toLowerCase().includes(searchLivro.toLowerCase()) || l.autor.toLowerCase().includes(searchLivro.toLowerCase()),
  );

  const oldLoanLivrosBase = oldLoanStatus === 'ativo' ? livrosDisponiveis : livrosCatalogo;
  const filteredOldUsuarios = usuarios.filter(
    (u) =>
      u.nome.toLowerCase().includes(oldSearchUsuario.toLowerCase()) ||
      String(u.email || '').toLowerCase().includes(oldSearchUsuario.toLowerCase()),
  );
  const filteredOldLivrosDialog = oldLoanLivrosBase.filter(
    (l) =>
      l.titulo.toLowerCase().includes(oldSearchLivro.toLowerCase()) ||
      l.autor.toLowerCase().includes(oldSearchLivro.toLowerCase()),
  );

  const today = new Date();
  const maxDate = addMonths(today, 1);

  const renderTable = (data, showDevolucao) => (
    <>
      <div className="space-y-3 md:hidden">
        {data.map((emprestimo) => (
          <div key={emprestimo.id} className={`rounded-lg border p-4 ${isAtrasado(emprestimo) ? 'bg-destructive/5 border-destructive/30' : 'bg-card'}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">{emprestimo.livros?.titulo || '-'}</p>
                <p className="text-xs text-muted-foreground truncate">{emprestimo.livros?.autor || '-'}</p>
              </div>
              <div className="shrink-0">{getStatusBadge(emprestimo)}</div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <p className="text-muted-foreground">Usuário</p>
              <p className="text-right truncate">{emprestimo.usuarios_biblioteca?.nome || '-'}</p>
              <p className="text-muted-foreground">E-mail</p>
              <p className="text-right truncate">{getVisibleEmail(emprestimo.usuarios_biblioteca?.nome, emprestimo.usuarios_biblioteca?.email)}</p>
              <p className="text-muted-foreground">Empréstimo</p>
              <p className="text-right">{formatDateBR(emprestimo.data_emprestimo)}</p>
              <p className="text-muted-foreground">Devolução prevista</p>
              <p className="text-right">{formatDateBR(emprestimo.data_devolucao_prevista)}</p>
              {!showDevolucao && (
                <>
                  <p className="text-muted-foreground">Devolução real</p>
                  <p className="text-right">{emprestimo.data_devolucao_real ? formatDateBR(emprestimo.data_devolucao_real) : '-'}</p>
                </>
              )}
            </div>

            {canManageLoans && (
              <>
                {showDevolucao ? (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full"
                    onClick={() => handleDevolucao(emprestimo)}
                    disabled={actionLoading.devolucaoId === emprestimo.id}
                  >
                    {actionLoading.devolucaoId === emprestimo.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                    Devolver
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="destructive"
                    className="mt-3 w-full"
                    onClick={() => setDeleteConfirmEmprestimo(emprestimo)}
                    disabled={actionLoading.solicitacaoId === emprestimo.id && actionLoading.tipo === 'excluir_historico'}
                  >
                    {actionLoading.solicitacaoId === emprestimo.id && actionLoading.tipo === 'excluir_historico' ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Excluir histórico
                  </Button>
                )}
              </>
            )}
          </div>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto">
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
                  <p className="text-sm text-muted-foreground">{getVisibleEmail(emprestimo.usuarios_biblioteca?.nome, emprestimo.usuarios_biblioteca?.email)}</p>
                </TableCell>
                <TableCell>{formatDateBR(emprestimo.data_emprestimo)}</TableCell>
                <TableCell>{formatDateBR(emprestimo.data_devolucao_prevista)}</TableCell>
                {!showDevolucao && <TableCell>{emprestimo.data_devolucao_real ? formatDateBR(emprestimo.data_devolucao_real) : '-'}</TableCell>}
                <TableCell>{getStatusBadge(emprestimo)}</TableCell>
                {showDevolucao && canManageLoans && (
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" onClick={() => handleDevolucao(emprestimo)} disabled={actionLoading.devolucaoId === emprestimo.id}>
                      {actionLoading.devolucaoId === emprestimo.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-2" />}
                      Devolver
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );

  const renderHistoricoTable = (data) => (
    <>
      <div className="space-y-3 md:hidden">
        {data.map((emprestimo) => (
          <div key={emprestimo.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">{emprestimo.livros?.titulo || '-'}</p>
                <p className="text-xs text-muted-foreground truncate">{emprestimo.livros?.autor || '-'}</p>
              </div>
              <div className="shrink-0">{getStatusBadge(emprestimo)}</div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <p className="text-muted-foreground">Usuário</p>
              <p className="text-right truncate">{emprestimo.usuarios_biblioteca?.nome || '-'}</p>
              <p className="text-muted-foreground">E-mail</p>
              <p className="text-right truncate">{getVisibleEmail(emprestimo.usuarios_biblioteca?.nome, emprestimo.usuarios_biblioteca?.email)}</p>
              <p className="text-muted-foreground">Empréstimo</p>
              <p className="text-right">{formatDateBR(emprestimo.data_emprestimo)}</p>
              <p className="text-muted-foreground">Devolução real</p>
              <p className="text-right">{emprestimo.data_devolucao_real ? formatDateBR(emprestimo.data_devolucao_real) : '-'}</p>
            </div>

            <Button
              size="sm"
              variant="destructive"
              className="mt-3 w-full"
              onClick={() => setDeleteConfirmEmprestimo(emprestimo)}
              disabled={actionLoading.solicitacaoId === emprestimo.id && actionLoading.tipo === 'excluir_historico'}
            >
              {actionLoading.solicitacaoId === emprestimo.id && actionLoading.tipo === 'excluir_historico' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Excluir histórico
            </Button>
          </div>
        ))}
      </div>

      <div className="hidden md:block overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Livro</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Data Empréstimo</TableHead>
              <TableHead>Devolução Prevista</TableHead>
              <TableHead>Devolução Real</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((emprestimo) => (
              <TableRow key={emprestimo.id}>
                <TableCell>
                  <p className="font-medium">{emprestimo.livros?.titulo || '-'}</p>
                  <p className="text-sm text-muted-foreground">{emprestimo.livros?.autor || '-'}</p>
                </TableCell>
                <TableCell>
                  <p className="font-medium">{emprestimo.usuarios_biblioteca?.nome || '-'}</p>
                  <p className="text-sm text-muted-foreground">{getVisibleEmail(emprestimo.usuarios_biblioteca?.nome, emprestimo.usuarios_biblioteca?.email)}</p>
                </TableCell>
                <TableCell>{formatDateBR(emprestimo.data_emprestimo)}</TableCell>
                <TableCell>{formatDateBR(emprestimo.data_devolucao_prevista)}</TableCell>
                <TableCell>{emprestimo.data_devolucao_real ? formatDateBR(emprestimo.data_devolucao_real) : '-'}</TableCell>
                <TableCell>{getStatusBadge(emprestimo)}</TableCell>
                <TableCell className="text-right">
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => setDeleteConfirmEmprestimo(emprestimo)}
                    disabled={actionLoading.solicitacaoId === emprestimo.id && actionLoading.tipo === 'excluir_historico'}
                  >
                    {actionLoading.solicitacaoId === emprestimo.id && actionLoading.tipo === 'excluir_historico' ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4 mr-2" />
                    )}
                    Excluir
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );

  return (
    <MainLayout title="Empréstimos">
      <Card>
        <CardHeader className="p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <BookMarked className="w-5 h-5" /> Gerenciamento de Empréstimos
            </CardTitle>

            {canManageLoans && (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-end">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="w-full sm:w-auto">
                      <Upload className="w-4 h-4 mr-2" /> Exportar dados
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-2" align="end">
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleOpenExportDialog('xlsx')}>
                      Excel (.xlsx)
                    </Button>
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => handleOpenExportDialog('pdf')}>
                      PDF (.pdf)
                    </Button>
                  </PopoverContent>
                </Popover>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full sm:w-auto"
                  onClick={() => setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
                >
                  <ArrowUpDown className="w-4 h-4 mr-2" />
                  Data ({sortDirection === 'desc' ? 'mais novas' : 'mais antigas'})
                </Button>

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
                    <Button className="w-full sm:w-auto">
                      <Plus className="w-4 h-4 mr-2" /> Novo Empréstimo
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="max-w-[95vw] sm:max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Novo Empréstimo</DialogTitle>
                      <DialogDescription>
                        Selecione o usuário, o livro e a data prevista de devolução para registrar o empréstimo.
                      </DialogDescription>
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
                                  <p className="text-xs text-muted-foreground">{getVisibleEmail(u.nome, u.email)}</p>
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

                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="w-full sm:w-auto">Cancelar</Button>
                      <Button onClick={handleCreateEmprestimo} disabled={saving} className="w-full sm:w-auto">{saving ? 'Registrando...' : 'Registrar Empréstimo'}</Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog
                  open={isOldLoanDialogOpen}
                  onOpenChange={(open) => {
                    setIsOldLoanDialogOpen(open);
                    if (!open) {
                      resetOldLoanForm();
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" className="w-full sm:w-auto">
                      <Plus className="w-4 h-4 mr-2" /> Registrar empréstimo antigo
                    </Button>
                  </DialogTrigger>

                  <DialogContent className="max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Registrar empréstimo antigo</DialogTitle>
                      <DialogDescription>
                        Use este formulário para lançar empréstimos anteriores no histórico da biblioteca.
                      </DialogDescription>
                    </DialogHeader>

                    <div className="grid gap-4 py-4 sm:grid-cols-2">
                      <div className="space-y-2 sm:col-span-2">
                        <Label>Status do registro</Label>
                        <Select value={oldLoanStatus} onValueChange={setOldLoanStatus}>
                          <SelectTrigger>
                            <SelectValue placeholder="Selecione o status" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="devolvido">Já devolvido</SelectItem>
                            <SelectItem value="ativo">Ainda emprestado</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label>Aluno / Usuário</Label>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                          <Input
                            placeholder="Pesquisar por nome ou email..."
                            className="pl-9"
                            value={oldSearchUsuario}
                            onChange={(e) => {
                              setOldSearchUsuario(e.target.value);
                              setOldLoanUsuario('');
                            }}
                          />
                        </div>

                        {oldLoanUsuario ? (
                          <div className="flex items-center justify-between rounded-md border bg-primary/10 p-2">
                            <span className="text-sm font-medium">{usuarios.find((u) => u.id === oldLoanUsuario)?.nome}</span>
                            <Button variant="ghost" size="sm" onClick={() => { setOldLoanUsuario(''); setOldSearchUsuario(''); }}>
                              Trocar
                            </Button>
                          </div>
                        ) : oldSearchUsuario.length >= 2 ? (
                          <div className="max-h-40 overflow-y-auto rounded-md border">
                            {filteredOldUsuarios.length === 0 ? (
                              <p className="p-3 text-sm text-muted-foreground">Nenhum usuário encontrado</p>
                            ) : (
                              filteredOldUsuarios.slice(0, 10).map((u) => (
                                <button
                                  key={u.id}
                                  className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                                  onClick={() => {
                                    setOldLoanUsuario(u.id);
                                    setOldSearchUsuario(u.nome);
                                  }}
                                >
                                  <p className="font-medium">{u.nome}</p>
                                  <p className="text-xs text-muted-foreground">{getVisibleEmail(u.nome, u.email)}</p>
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
                            placeholder={oldLoanStatus === 'ativo' ? 'Pesquisar livro disponível...' : 'Pesquisar livro...'}
                            className="pl-9"
                            value={oldSearchLivro}
                            onChange={(e) => {
                              setOldSearchLivro(e.target.value);
                              setOldLoanLivro('');
                            }}
                          />
                        </div>

                        {oldLoanLivro ? (
                          <div className="flex items-center justify-between rounded-md border bg-primary/10 p-2">
                            <span className="text-sm font-medium">{oldLoanLivrosBase.find((l) => l.id === oldLoanLivro)?.titulo}</span>
                            <Button variant="ghost" size="sm" onClick={() => { setOldLoanLivro(''); setOldSearchLivro(''); }}>
                              Trocar
                            </Button>
                          </div>
                        ) : oldSearchLivro.length >= 2 ? (
                          <div className="max-h-40 overflow-y-auto rounded-md border">
                            {filteredOldLivrosDialog.length === 0 ? (
                              <p className="p-3 text-sm text-muted-foreground">
                                {oldLoanStatus === 'ativo' ? 'Nenhum livro disponível encontrado' : 'Nenhum livro encontrado'}
                              </p>
                            ) : (
                              filteredOldLivrosDialog.slice(0, 10).map((l) => (
                                <button
                                  key={l.id}
                                  className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                                  onClick={() => {
                                    setOldLoanLivro(l.id);
                                    setOldSearchLivro(l.titulo);
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
                        <Label htmlFor="oldLoanDataEmprestimo">Data do empréstimo</Label>
                        <Input
                          id="oldLoanDataEmprestimo"
                          type="date"
                          value={oldLoanDataEmprestimo}
                          max={format(new Date(), 'yyyy-MM-dd')}
                          onChange={(e) => setOldLoanDataEmprestimo(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="oldLoanDataPrevista">Devolução prevista</Label>
                        <Input
                          id="oldLoanDataPrevista"
                          type="date"
                          value={oldLoanDataPrevista}
                          min={oldLoanDataEmprestimo || undefined}
                          max={oldLoanDataEmprestimo ? addOneMonthToDateInput(oldLoanDataEmprestimo) : undefined}
                          onChange={(e) => setOldLoanDataPrevista(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                          Se ficar vazia, o sistema usa automaticamente até 1 mês após a data do empréstimo.
                        </p>
                      </div>

                      {oldLoanStatus === 'devolvido' && (
                        <div className="space-y-2 sm:col-span-2">
                          <Label htmlFor="oldLoanDataDevolucao">Data da devolução</Label>
                          <Input
                            id="oldLoanDataDevolucao"
                            type="date"
                            value={oldLoanDataDevolucao}
                            max={format(new Date(), 'yyyy-MM-dd')}
                            onChange={(e) => setOldLoanDataDevolucao(e.target.value)}
                          />
                        </div>
                      )}

                      <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground sm:col-span-2">
                        Registros marcados como <strong>{oldLoanStatus === 'ativo' ? 'ainda emprestados' : 'já devolvidos'}</strong>{' '}
                        entram no histórico real do sistema. Livros ativos ficam indisponíveis no acervo atual.
                      </div>
                    </div>

                    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                      <Button variant="outline" onClick={() => setIsOldLoanDialogOpen(false)} className="w-full sm:w-auto">
                        Cancelar
                      </Button>
                      <Button onClick={handleCreateOldEmprestimo} disabled={saving} className="w-full sm:w-auto">
                        {saving ? 'Salvando...' : 'Registrar no histórico'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : emprestimos.length === 0 && (!canManageLoans || solicitacoes.length === 0) ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-muted-foreground">Nenhum dado de empréstimo registrado</p>
              {canManageLoans && (
                <Button onClick={() => setIsDialogOpen(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Criar primeiro empréstimo
                </Button>
              )}
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4 h-auto w-full justify-start gap-1 overflow-x-auto whitespace-nowrap pb-1 sm:gap-2">
                {canManageLoans && (
                  <TabsTrigger value="solicitacoes" className="gap-2 shrink-0">
                    <Inbox className="w-4 h-4" /> Solicitações ({solicitacoesPendentes.length})
                  </TabsTrigger>
                )}
                {canManageLoans && (
                  <TabsTrigger value="recusadas" className="gap-2 shrink-0">
                    <XCircle className="w-4 h-4" /> Recusadas ({solicitacoesRecusadas.length})
                  </TabsTrigger>
                )}
                <TabsTrigger value="ativos" className="gap-2 shrink-0">
                  <AlertTriangle className="w-4 h-4" /> Ativos ({emprestimosAtivos.length})
                </TabsTrigger>
                <TabsTrigger value="historico" className="gap-2 shrink-0">
                  <CheckCircle className="w-4 h-4" /> Histórico ({emprestimosHistorico.length})
                </TabsTrigger>
              </TabsList>

              {canManageLoans && (
                <TabsContent value="solicitacoes">
                  {solicitacoesPendentes.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Nenhuma solicitação de aluno no momento.</p>
                  ) : (
                    <div className="space-y-3">
                      {solicitacoesPendentes.map((solicitacao) => renderSolicitacaoCard(solicitacao))}
                      {false && solicitacoesPendentes.map((solicitacao) => {
                        const isPendente = solicitacao.status === 'pendente';
                        const isExtension = String(solicitacao?.tipo || 'emprestimo') === 'prorrogacao';
                        return (
                          <div key={solicitacao.id} className="border rounded-lg p-4 space-y-3">
                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                              <div>
                                <p className="font-medium">{solicitacao.livros?.titulo || 'Livro'}</p>
                                <p className="text-sm text-muted-foreground">{solicitacao.livros?.autor || '-'}</p>
                                <p className="text-xs text-muted-foreground">
                                  Aluno: {solicitacao.usuarios_biblioteca?.nome || '-'} • {formatDateBR(solicitacao.created_at)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {isExtension ? 'Tipo: pedido de prorrogação' : 'Tipo: solicitação de empréstimo'}
                                </p>
                              </div>
                              <div>{getStatusSolicitacaoBadge(solicitacao.status)}</div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <p className="text-xs text-muted-foreground mb-1">Mensagem do aluno</p>
                                <p className="text-sm rounded-md border p-2 min-h-[52px] bg-muted/30">{solicitacao.mensagem || 'Sem mensagem.'}</p>
                                {isExtension && (
                                  <div className="mt-2 rounded-md border bg-background p-2 text-xs text-muted-foreground">
                                    <p>Data atual: {formatDateBR(solicitacao.data_devolucao_atual)}</p>
                                    <p>Nova data pedida: {formatDateBR(solicitacao.nova_data_devolucao_solicitada)}</p>
                                  </div>
                                )}
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
                              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:justify-end gap-2">
                                <Button
                                  variant="outline"
                                  className="w-full sm:w-auto"
                                  disabled={saving || (actionLoading.solicitacaoId === solicitacao.id && actionLoading.tipo === 'aprovar')}
                                  onClick={() => handleRecusarSolicitacao(solicitacao)}
                                >
                                  {actionLoading.solicitacaoId === solicitacao.id && actionLoading.tipo === 'recusar' ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : (
                                    <XCircle className="w-4 h-4 mr-2" />
                                  )}
                                  Recusar
                                </Button>
                                <Button
                                  className="w-full sm:w-auto"
                                  disabled={saving || (actionLoading.solicitacaoId === solicitacao.id && actionLoading.tipo === 'recusar')}
                                  onClick={() => handleAprovarSolicitacao(solicitacao)}
                                >
                                  {actionLoading.solicitacaoId === solicitacao.id && actionLoading.tipo === 'aprovar' ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                  ) : (
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                  )}
                                  {isExtension ? 'Aprovar prorrogação' : 'Aprovar e gerar empréstimo'}
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

              {canManageLoans && (
                <TabsContent value="recusadas">
                  {solicitacoesRecusadas.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8">Nenhuma solicitaÃ§Ã£o recusada.</p>
                  ) : (
                    <div className="space-y-3">
                      {solicitacoesRecusadas.map((solicitacao) =>
                        renderSolicitacaoCard(solicitacao, { readOnly: true }),
                      )}
                    </div>
                  )}
                </TabsContent>
              )}

              <TabsContent value="ativos">
                {emprestimosAtivosFiltrados.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum empréstimo ativo</p>
                ) : (
                  renderTable(emprestimosAtivosFiltrados, true)
                )}
              </TabsContent>

              <TabsContent value="historico">
                {emprestimosHistorico.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Nenhum empréstimo no histórico</p>
                ) : (
                  renderHistoricoTable(emprestimosHistorico)
                )}
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>

      <ExportPeriodDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        title="Exportar empréstimos"
        description="Escolha o período para exportar os dados de empréstimos."
        loading={exporting}
        onConfirm={handleConfirmExport}
      />
      <Dialog
        open={Boolean(deleteConfirmEmprestimo)}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmEmprestimo(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Excluir empréstimo do histórico</DialogTitle>
            <DialogDescription>
              Essa ação remove permanentemente este registro do histórico.
            </DialogDescription>
          </DialogHeader>

          {deleteConfirmEmprestimo && (
            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <p className="font-medium">{deleteConfirmEmprestimo.livros?.titulo || 'Livro'}</p>
              <p className="text-muted-foreground">
                Usuário: {deleteConfirmEmprestimo.usuarios_biblioteca?.nome || '-'}
              </p>
              <p className="text-muted-foreground">
                Devolvido em: {formatDateBR(deleteConfirmEmprestimo.data_devolucao_real)}
              </p>
            </div>
          )}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => setDeleteConfirmEmprestimo(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleExcluirHistorico(deleteConfirmEmprestimo)}
              disabled={!deleteConfirmEmprestimo || (actionLoading.solicitacaoId === deleteConfirmEmprestimo?.id && actionLoading.tipo === 'excluir_historico')}
            >
              {actionLoading.solicitacaoId === deleteConfirmEmprestimo?.id && actionLoading.tipo === 'excluir_historico' ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Trash2 className="w-4 h-4 mr-2" />
              )}
              Confirmar exclusão
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
