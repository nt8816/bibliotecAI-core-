import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart3, BookOpen, TrendingUp, Users, CalendarDays, AlertTriangle, Download } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { ExportPeriodDialog } from '@/components/export/ExportPeriodDialog';
import { useToast } from '@/hooks/use-toast';

const PIE_COLORS = ['hsl(122, 46%, 34%)', 'hsl(43, 96%, 56%)'];
const loadXlsx = async () => import('xlsx');
const loadPdf = async () => {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  return { jsPDF, autoTable };
};

function monthKey(dateValue) {
  const d = new Date(dateValue);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return format(new Date(y, (m || 1) - 1, 1), 'MMM/yy', { locale: ptBR });
}

function buildLastMonths(size = 12) {
  const now = new Date();
  const keys = [];
  for (let i = size - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

export default function Relatorios() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalLivros: 0,
    livrosDisponiveis: 0,
    totalUsuarios: 0,
    totalEmprestimos: 0,
    emprestimosMesAtual: 0,
    emprestimosMesAnterior: 0,
    atrasadosAtuais: 0,
  });
  const [livrosMaisEmprestados, setLivrosMaisEmprestados] = useState([]);
  const [emprestimosPorMes, setEmprestimosPorMes] = useState([]);
  const [emprestimosDetalhados, setEmprestimosDetalhados] = useState([]);
  const [rankingMes, setRankingMes] = useState(String(new Date().getMonth() + 1));
  const [rankingAno, setRankingAno] = useState(String(new Date().getFullYear()));
  const [rankingMode, setRankingMode] = useState('month');
  const [rankingStartDate, setRankingStartDate] = useState('');
  const [rankingEndDate, setRankingEndDate] = useState('');
  const [exportDialogOpen, setExportDialogOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState('xlsx');
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [
          livrosCountRes,
          livrosDisponiveisRes,
          usuariosCountRes,
          emprestimosCountRes,
          emprestimosRes,
          atrasadosRes,
        ] = await Promise.all([
          supabase.from('livros').select('*', { count: 'exact', head: true }),
          supabase.from('livros').select('*', { count: 'exact', head: true }).eq('disponivel', true),
          supabase.from('usuarios_biblioteca').select('*', { count: 'exact', head: true }),
          supabase.from('emprestimos').select('*', { count: 'exact', head: true }),
          supabase
            .from('emprestimos')
            .select('id, livro_id, usuario_id, created_at, data_emprestimo, data_devolucao_real, status, data_devolucao_prevista, livros(titulo), usuarios_biblioteca(nome, turma, tipo)'),
          supabase
            .from('emprestimos')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'ativo')
            .lt('data_devolucao_prevista', new Date().toISOString()),
        ]);

        const allEmprestimos = emprestimosRes.data || [];
        setEmprestimosDetalhados(allEmprestimos);
        const monthlyKeys = buildLastMonths(12);
        const monthlyMap = new Map(
          monthlyKeys.map((key) => [key, { key, mes: monthLabel(key), emprestimos: 0, devolucoes: 0 }]),
        );

        const livroCountMap = new Map();

        allEmprestimos.forEach((emp) => {
          const loanDate = emp.data_emprestimo || emp.created_at;
          if (loanDate) {
            const key = monthKey(loanDate);
            if (monthlyMap.has(key)) {
              monthlyMap.get(key).emprestimos += 1;
            }
          }

          if (emp.data_devolucao_real) {
            const key = monthKey(emp.data_devolucao_real);
            if (monthlyMap.has(key)) {
              monthlyMap.get(key).devolucoes += 1;
            }
          }

          const livroNome = emp?.livros?.titulo || 'Livro sem título';
          const current = livroCountMap.get(livroNome) || 0;
          livroCountMap.set(livroNome, current + 1);
        });

        const monthlyData = Array.from(monthlyMap.values());
        setEmprestimosPorMes(monthlyData);

        const rankedBooks = Array.from(livroCountMap.entries())
          .map(([titulo, emprestimos]) => ({ titulo, emprestimos }))
          .sort((a, b) => b.emprestimos - a.emprestimos)
          .slice(0, 8);

        setLivrosMaisEmprestados(rankedBooks);

        const mesAtual = monthlyData[monthlyData.length - 1]?.emprestimos || 0;
        const mesAnterior = monthlyData[monthlyData.length - 2]?.emprestimos || 0;

        setStats({
          totalLivros: livrosCountRes.count || 0,
          livrosDisponiveis: livrosDisponiveisRes.count || 0,
          totalUsuarios: usuariosCountRes.count || 0,
          totalEmprestimos: emprestimosCountRes.count || 0,
          emprestimosMesAtual: mesAtual,
          emprestimosMesAnterior: mesAnterior,
          atrasadosAtuais: atrasadosRes.count || 0,
        });
      } catch (error) {
        console.error('Erro ao carregar relatórios:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const variacaoMes = useMemo(() => {
    const anterior = stats.emprestimosMesAnterior;
    if (!anterior) return stats.emprestimosMesAtual > 0 ? 100 : 0;
    return ((stats.emprestimosMesAtual - anterior) / anterior) * 100;
  }, [stats.emprestimosMesAtual, stats.emprestimosMesAnterior]);

  const pieData = useMemo(
    () => [
      { name: 'Disponíveis', value: stats.livrosDisponiveis },
      { name: 'Emprestados', value: Math.max(0, stats.totalLivros - stats.livrosDisponiveis) },
    ],
    [stats.livrosDisponiveis, stats.totalLivros],
  );

  const statCards = [
    { title: 'Total de Livros', value: stats.totalLivros, icon: BookOpen, color: 'text-primary' },
    { title: 'Total de Usuários', value: stats.totalUsuarios, icon: Users, color: 'text-info' },
    { title: 'Empréstimos no Mês', value: stats.emprestimosMesAtual, icon: CalendarDays, color: 'text-secondary' },
    { title: 'Atrasados Atuais', value: stats.atrasadosAtuais, icon: AlertTriangle, color: 'text-warning' },
  ];

  const anosDisponiveis = useMemo(() => {
    const years = new Set();
    emprestimosDetalhados.forEach((emp) => {
      const dateRef = emp?.data_devolucao_real || emp?.data_emprestimo || emp?.created_at;
      if (!dateRef) return;
      const year = new Date(dateRef).getFullYear();
      if (!Number.isNaN(year)) years.add(String(year));
    });
    years.add(String(new Date().getFullYear()));
    return Array.from(years).sort((a, b) => Number(b) - Number(a));
  }, [emprestimosDetalhados]);

  const rankingAlunos = useMemo(() => {
    const monthNumber = Number(rankingMes);
    const yearNumber = Number(rankingAno);
    const startDate = rankingStartDate ? new Date(`${rankingStartDate}T00:00:00`) : null;
    const endDate = rankingEndDate ? new Date(`${rankingEndDate}T23:59:59`) : null;
    const map = new Map();

    emprestimosDetalhados.forEach((emp) => {
      if (emp.status !== 'devolvido') return;
      const userId = emp.usuario_id;
      const nome = emp?.usuarios_biblioteca?.nome;
      if (!userId || !nome) return;
      if (emp?.usuarios_biblioteca?.tipo && emp.usuarios_biblioteca.tipo !== 'aluno') return;

      const dateRef = emp.data_devolucao_real || emp.data_emprestimo || emp.created_at;
      if (!dateRef) return;
      const date = new Date(dateRef);
      if (Number.isNaN(date.getTime())) return;
      if (rankingMode === 'period') {
        if (!startDate || !endDate) return;
        if (date < startDate || date > endDate) return;
      } else {
        if (date.getFullYear() !== yearNumber) return;
        if (monthNumber >= 1 && monthNumber <= 12 && date.getMonth() + 1 !== monthNumber) return;
      }

      const current = map.get(userId) || { id: userId, nome, turma: emp?.usuarios_biblioteca?.turma || '-', leituras: 0 };
      current.leituras += 1;
      map.set(userId, current);
    });

    return Array.from(map.values()).sort((a, b) => b.leituras - a.leituras).slice(0, 10);
  }, [emprestimosDetalhados, rankingAno, rankingMes, rankingMode, rankingStartDate, rankingEndDate]);

  const getPeriodLabel = (period) => {
    if (period.mode === 'total') return 'Período total';
    return `Período: ${period.startDate} a ${period.endDate}`;
  };

  const filtrarEmprestimosPorPeriodo = (period) => {
    if (period.mode === 'total') return emprestimosDetalhados;
    const start = new Date(`${period.startDate}T00:00:00`);
    const end = new Date(`${period.endDate}T23:59:59`);
    return emprestimosDetalhados.filter((item) => {
      const ref = item?.data_emprestimo || item?.created_at;
      if (!ref) return false;
      const d = new Date(ref);
      if (Number.isNaN(d.getTime())) return false;
      return d >= start && d <= end;
    });
  };

  const exportarRelatoriosExcel = async (dataRows, periodLabel) => {
    const XLSX = await loadXlsx();
    const headers = ['Data', 'Aluno', 'Turma', 'Livro', 'Status'];
    const rows = dataRows.map((item) => [
      item?.data_emprestimo ? format(new Date(item.data_emprestimo), 'dd/MM/yyyy') : '-',
      item?.usuarios_biblioteca?.nome || '-',
      item?.usuarios_biblioteca?.turma || '-',
      item?.livros?.titulo || '-',
      item?.status || '-',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatorios');
    XLSX.writeFile(wb, 'relatorios_gerais.xlsx');
    return periodLabel;
  };

  const exportarRelatoriosPdf = async (dataRows, periodLabel) => {
    const { jsPDF, autoTable } = await loadPdf();
    const doc = new jsPDF('landscape');
    doc.setFontSize(14);
    doc.text('Relatórios Gerais - Biblioteca', 14, 16);
    doc.setFontSize(10);
    doc.text(periodLabel, 14, 23);

    const headers = [['Data', 'Aluno', 'Turma', 'Livro', 'Status']];
    const rows = dataRows.map((item) => [
      item?.data_emprestimo ? format(new Date(item.data_emprestimo), 'dd/MM/yyyy') : '-',
      item?.usuarios_biblioteca?.nome || '-',
      item?.usuarios_biblioteca?.turma || '-',
      item?.livros?.titulo || '-',
      item?.status || '-',
    ]);

    autoTable(doc, {
      head: headers,
      body: rows,
      startY: 30,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [46, 125, 50] },
    });
    doc.save('relatorios_gerais.pdf');
    return periodLabel;
  };

  const handleOpenExportDialog = (formatName) => {
    setExportFormat(formatName);
    setExportDialogOpen(true);
  };

  const handleConfirmExport = async (period) => {
    const filtered = filtrarEmprestimosPorPeriodo(period);
    if (!filtered.length) {
      toast({
        variant: 'destructive',
        title: 'Sem dados',
        description: 'Não há registros no período selecionado para exportar.',
      });
      return;
    }

    setExporting(true);
    try {
      const periodLabel = getPeriodLabel(period);
      if (exportFormat === 'pdf') {
        await exportarRelatoriosPdf(filtered, periodLabel);
      } else {
        await exportarRelatoriosExcel(filtered, periodLabel);
      }
      setExportDialogOpen(false);
      toast({ title: 'Exportado!', description: `Arquivo gerado com sucesso. ${periodLabel}` });
    } catch (error) {
      console.error('Erro ao exportar relatórios:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível exportar os relatórios.',
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <MainLayout title="Relatórios">
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Exportar relatórios</p>
                <p className="text-xs text-muted-foreground">Escolha formato e período (total ou específico).</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleOpenExportDialog('xlsx')}>
                  <Download className="w-4 h-4 mr-2" />
                  Excel (.xlsx)
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleOpenExportDialog('pdf')}>
                  <Download className="w-4 h-4 mr-2" />
                  PDF (.pdf)
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {statCards.map((card) => (
            <Card key={card.title}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] sm:text-xs text-muted-foreground">{card.title}</p>
                    <p className="text-xl sm:text-2xl font-bold mt-0.5">{loading ? '...' : card.value}</p>
                  </div>
                  <card.icon className={`w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 ${card.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">Variação de empréstimos (mês atual vs anterior)</p>
                <p className="text-xs text-muted-foreground">
                  {stats.emprestimosMesAtual} no mês atual e {stats.emprestimosMesAnterior} no anterior
                </p>
              </div>
              <Badge variant={variacaoMes >= 0 ? 'outline' : 'destructive'}>
                {variacaoMes >= 0 ? '+' : ''}
                {variacaoMes.toFixed(1)}%
              </Badge>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="w-4 h-4 sm:w-5 sm:h-5" /> Empréstimos por mês
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
              ) : (
                <div className="w-full h-[260px] sm:h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={emprestimosPorMes} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} minTickGap={18} interval="preserveStartEnd" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="emprestimos" fill="hsl(122, 46%, 34%)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5" /> Evolução (empréstimos vs devoluções)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
              ) : (
                <div className="w-full h-[260px] sm:h-[320px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={emprestimosPorMes} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="mes" tick={{ fontSize: 11 }} minTickGap={18} interval="preserveStartEnd" />
                      <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="emprestimos" stroke="hsl(122, 46%, 34%)" strokeWidth={2.5} dot={false} />
                      <Line type="monotone" dataKey="devolucoes" stroke="hsl(199, 89%, 48%)" strokeWidth={2.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Disponibilidade do acervo</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
              ) : stats.totalLivros === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Nenhum livro cadastrado.</p>
              ) : (
                <div className="w-full h-[240px] sm:h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={95}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Livros mais emprestados</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
              ) : livrosMaisEmprestados.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">Sem empréstimos registrados.</p>
              ) : (
                <div className="space-y-2">
                  {livrosMaisEmprestados.map((livro, index) => (
                    <div key={`${livro.titulo}-${index}`} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium line-clamp-2">{livro.titulo}</p>
                        <Badge variant="secondary">{livro.emprestimos}</Badge>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 mt-2">
                        <div
                          className="bg-primary h-2 rounded-full transition-all"
                          style={{ width: `${(livro.emprestimos / (livrosMaisEmprestados[0]?.emprestimos || 1)) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <CardTitle className="text-base">Ranking de Leitura dos Alunos</CardTitle>
              <div className="space-y-2 w-full sm:w-auto">
                <div className="space-y-1">
                  <Label htmlFor="ranking-mode">Modo</Label>
                  <select
                    id="ranking-mode"
                    value={rankingMode}
                    onChange={(e) => setRankingMode(e.target.value)}
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="month">Mês/Ano</option>
                    <option value="period">Período específico</option>
                  </select>
                </div>
                {rankingMode === 'period' ? (
                  <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                    <div className="space-y-1">
                      <Label htmlFor="ranking-start">Início</Label>
                      <input
                        id="ranking-start"
                        type="date"
                        value={rankingStartDate}
                        onChange={(e) => setRankingStartDate(e.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ranking-end">Fim</Label>
                      <input
                        id="ranking-end"
                        type="date"
                        value={rankingEndDate}
                        onChange={(e) => setRankingEndDate(e.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                    <div className="space-y-1">
                      <Label htmlFor="ranking-mes">Mês</Label>
                      <select
                        id="ranking-mes"
                        value={rankingMes}
                        onChange={(e) => setRankingMes(e.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {Array.from({ length: 12 }).map((_, index) => (
                          <option key={index + 1} value={String(index + 1)}>
                            {String(index + 1).padStart(2, '0')}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="ranking-ano">Ano</Label>
                      <select
                        id="ranking-ano"
                        value={rankingAno}
                        onChange={(e) => setRankingAno(e.target.value)}
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      >
                        {anosDisponiveis.map((ano) => (
                          <option key={ano} value={ano}>{ano}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
            ) : rankingAlunos.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Sem leituras concluídas para o mês/ano selecionado.</p>
            ) : (
              <div className="space-y-2">
                {rankingAlunos.map((aluno, index) => (
                  <div key={aluno.id} className="rounded-lg border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">
                        {index + 1}. {aluno.nome} <span className="text-muted-foreground">({aluno.turma || '-'})</span>
                      </p>
                      <Badge variant="secondary">{aluno.leituras} leituras</Badge>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2 mt-2">
                      <div
                        className="bg-primary h-2 rounded-full transition-all"
                        style={{ width: `${(aluno.leituras / (rankingAlunos[0]?.leituras || 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

      </div>
      <ExportPeriodDialog
        open={exportDialogOpen}
        onOpenChange={setExportDialogOpen}
        title="Exportar relatórios"
        description="Escolha o período para exportar os dados consolidados de empréstimos."
        loading={exporting}
        onConfirm={handleConfirmExport}
      />
    </MainLayout>
  );
}
