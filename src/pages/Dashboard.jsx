import { useEffect, useState, useCallback, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  AlertTriangle,
  BarChart3,
  BookMarked,
  BookOpen,
  Building2,
  Clock,
  HardDrive,
  MessageSquareWarning,
  School,
  ShieldAlert,
  ShieldCheck,
  Shield,
  TrendingUp,
  Users,
} from 'lucide-react';
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
} from 'recharts';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { fetchDashboardData } from '@/services/dashboardService';

const PIE_COLORS = ['hsl(122, 46%, 34%)', 'hsl(43, 96%, 56%)'];

function formatPercentLabel(percent) {
  const value = percent * 100;

  if (Number.isNaN(value)) return '0%';
  if (value === 0 || value === 100) return `${value.toFixed(0)}%`;
  if (value < 1 || value > 99) return `${value.toFixed(1)}%`;

  return `${value.toFixed(0)}%`;
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;

  if (value <= 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const scaled = value / (1024 ** index);
  const decimals = scaled >= 100 || index === 0 ? 0 : 1;

  return `${scaled.toFixed(decimals)} ${units[index]}`;
}

function estimateDataUrlBytes(value) {
  if (typeof value !== 'string' || !value || !value.startsWith('data:')) return 0;

  const [, payload = ''] = value.split(',', 2);
  const cleaned = payload.replace(/\s/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;

  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
}

function estimateUrlCollectionBytes(collection) {
  if (!Array.isArray(collection)) return 0;
  return collection.reduce((total, item) => total + estimateDataUrlBytes(item), 0);
}

function estimateArquivosBytes(arquivos) {
  if (!Array.isArray(arquivos)) return 0;

  return arquivos.reduce((total, arquivo) => {
    const tamanho = Number(arquivo?.tamanho);
    if (Number.isFinite(tamanho) && tamanho > 0) return total + tamanho;
    return total + estimateDataUrlBytes(arquivo?.url);
  }, 0);
}

export default function Dashboard() {
  const { userRole, isBibliotecaria } = useAuth();
  const navigate = useNavigate();
  const isSuperAdmin = userRole === 'super_admin';

  const [stats, setStats] = useState({
    totalLivros: 0,
    livrosDisponiveis: 0,
    totalUsuarios: 0,
    emprestimosAtivos: 0,
    emprestimosAtrasados: 0,
  });
  const [atividades, setAtividades] = useState([]);
  const [emprestimosPorMes, setEmprestimosPorMes] = useState([]);
  const [livrosMaisEmprestados, setLivrosMaisEmprestados] = useState([]);
  const [loading, setLoading] = useState(true);
  const [escolasCadastradas, setEscolasCadastradas] = useState([]);
  const [superAdminStats, setSuperAdminStats] = useState({
    totalEscolas: 0,
    tenantsAtivos: 0,
    tenantsInativos: 0,
    escolasSemTenant: 0,
    superAdminsAtivos: 0,
    superAdminsBloqueados: 0,
    reclamacoesEmAnalise: 0,
    reclamacoesAtrasadas: 0,
    armazenamentoConsumidoBytes: 0,
  });

  const fetchInFlightRef = useRef(null);
  const mountedRef = useRef(true);
  const fetchData = useCallback(async () => {
    if (fetchInFlightRef.current) return fetchInFlightRef.current;

    const request = (async () => {
      try {
        const payload = await fetchDashboardData(userRole);
        setStats((prev) => ({ ...prev, ...(payload?.stats || {}) }));
        setAtividades(Array.isArray(payload?.atividades) ? payload.atividades : []);
        setEmprestimosPorMes(Array.isArray(payload?.emprestimosPorMes) ? payload.emprestimosPorMes : []);
        setLivrosMaisEmprestados(Array.isArray(payload?.livrosMaisEmprestados) ? payload.livrosMaisEmprestados : []);
        setEscolasCadastradas(Array.isArray(payload?.escolasCadastradas) ? payload.escolasCadastradas : []);

        if (isSuperAdmin && payload?.superAdminStats) {
          setSuperAdminStats(payload.superAdminStats);
        }
      } catch (error) {
        console.error('Erro ao carregar dados do dashboard:', error);
      } finally {
        setLoading(false);
      }
    })();

    fetchInFlightRef.current = request;
    request.finally(() => {
      if (fetchInFlightRef.current === request) {
        fetchInFlightRef.current = null;
      }
    });

    return request;
  }, [isSuperAdmin, userRole]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    mountedRef.current = true;
    const interval = window.setInterval(() => {
      if (mountedRef.current) fetchData();
    }, 30000);

    const handleVisibilityChange = () => {
      if (mountedRef.current && document.visibilityState === 'visible') {
        fetchData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      mountedRef.current = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData]);

  if (userRole === 'aluno') {
    return <Navigate to="/aluno/perfil" replace />;
  }

  const livrosDisponiveis = Math.max(0, Math.min(stats.livrosDisponiveis, stats.totalLivros));
  const livrosEmprestados = Math.max(0, stats.totalLivros - livrosDisponiveis);

  const pieData = [
    { name: 'Disponiveis', value: livrosDisponiveis },
    { name: 'Emprestados', value: livrosEmprestados },
  ];

  const statCards = [
    {
      title: 'Total de Livros',
      value: stats.totalLivros,
      icon: BookOpen,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      path: '/livros',
    },
    {
      title: 'Total de Usuarios',
      value: stats.totalUsuarios,
      icon: Users,
      color: 'text-info',
      bgColor: 'bg-info/10',
      path: '/usuarios',
    },
    {
      title: 'Leituras Ativas',
      value: stats.emprestimosAtivos,
      icon: BookMarked,
      color: 'text-secondary',
      bgColor: 'bg-secondary/10',
      path: isBibliotecaria ? '/emprestimos' : '/relatorios',
    },
    {
      title: 'Alertas de Atraso',
      value: stats.emprestimosAtrasados,
      icon: AlertTriangle,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
      path: isBibliotecaria ? '/emprestimos?tab=ativos&status=atrasados' : '/relatorios',
    },
  ];

  const superAdminHighlights = [
    {
      title: 'Escolas cadastradas',
      value: superAdminStats.totalEscolas,
      description: `${superAdminStats.escolasSemTenant} sem tenant vinculado`,
      icon: Building2,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Tenants ativos',
      value: superAdminStats.tenantsAtivos,
      description: `${superAdminStats.tenantsInativos} inativos`,
      icon: BarChart3,
      color: 'text-info',
      bgColor: 'bg-info/10',
    },
    {
      title: 'Armazenamento estimado',
      value: formatBytes(superAdminStats.armazenamentoConsumidoBytes),
      description: 'Arquivos, imagens e audios da plataforma',
      icon: HardDrive,
      color: 'text-secondary',
      bgColor: 'bg-secondary/10',
    },
    {
      title: 'Super Admins ativos',
      value: superAdminStats.superAdminsAtivos,
      description: `${superAdminStats.superAdminsBloqueados} bloqueados`,
      icon: ShieldCheck,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-500/10',
    },
  ];

  const superAdminAttentionItems = [
    {
      title: 'Reclamacoes em analise',
      value: superAdminStats.reclamacoesEmAnalise,
      hint: superAdminStats.reclamacoesAtrasadas > 0
        ? `${superAdminStats.reclamacoesAtrasadas} passaram de 4 dias`
        : 'Nenhuma reclamacao esta atrasada',
      tone: superAdminStats.reclamacoesAtrasadas > 0 ? 'text-amber-600' : 'text-muted-foreground',
      action: '/reclamacoes',
      actionLabel: 'Abrir reclamações',
      icon: AlertTriangle,
    },
    {
      title: 'Escolas sem tenant',
      value: superAdminStats.escolasSemTenant,
      hint: superAdminStats.escolasSemTenant > 0
        ? 'Essas escolas precisam ser vinculadas para operar isoladamente'
        : 'Todas as escolas ja estão vinculadas',
      tone: superAdminStats.escolasSemTenant > 0 ? 'text-amber-600' : 'text-muted-foreground',
      action: '/admin/tenants',
      actionLabel: 'Gerenciar tenants',
      icon: Building2,
    },
    {
      title: 'Contas bloqueadas',
      value: superAdminStats.superAdminsBloqueados,
      hint: superAdminStats.superAdminsBloqueados > 0
        ? 'Revise bloqueios e libere contas quando necessario'
        : 'Nenhum Super Admin bloqueado',
      tone: superAdminStats.superAdminsBloqueados > 0 ? 'text-destructive' : 'text-muted-foreground',
      action: '/admin/super-admins',
      actionLabel: 'Ver Super Admins',
      icon: ShieldAlert,
    },
  ];

  const superAdminQuickActions = [
    {
      title: 'Gerenciar tenants',
      description: 'Ativar, inativar, provisionar e revisar escolas com isolamento dedicado.',
      action: '/admin/tenants',
      actionLabel: 'Abrir tenants',
      icon: School,
    },
    {
      title: 'Contas Super Admin',
      description: 'Criar contas, revisar bloqueios e acompanhar os ultimos acessos.',
      action: '/admin/super-admins',
      actionLabel: 'Abrir Super Admins',
      icon: Shield,
    },
    {
      title: 'Reclamacoes criticas',
      description: 'Acompanhar filas, tempos de resposta e tratativas que exigem decisao global.',
      action: '/reclamacoes',
      actionLabel: 'Abrir reclamacoes',
      icon: MessageSquareWarning,
    },
  ];

  const handleStatCardKeyDown = (event, path) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigate(path);
    }
  };

  return (
    <MainLayout title="Dashboard">
      <div className="space-y-6">
        {!isSuperAdmin && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {statCards.map((card) => (
              <Card
                key={card.title}
                className="stat-card cursor-pointer transition-shadow hover:shadow-md"
                role="button"
                tabIndex={0}
                onClick={() => navigate(card.path)}
                onKeyDown={(event) => handleStatCardKeyDown(event, card.path)}
              >
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{card.title}</p>
                      <p className="mt-1 text-3xl font-bold">{loading ? '...' : card.value}</p>
                    </div>
                    <button
                      type="button"
                      className={`flex h-12 w-12 items-center justify-center rounded-lg ${card.bgColor}`}
                      onClick={() => navigate(card.path)}
                      aria-label={`Abrir ${card.title}`}
                    >
                      <card.icon className={`h-6 w-6 ${card.color}`} />
                    </button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {isSuperAdmin && (
          <div className="space-y-6">
            <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-background to-secondary/5">
              <CardHeader>
                <CardTitle>Painel global do Super Admin</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                  {superAdminHighlights.map((item) => (
                    <div key={item.title} className="rounded-xl border bg-background/80 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm text-muted-foreground">{item.title}</p>
                          <p className="mt-2 text-3xl font-bold">{loading ? '...' : item.value}</p>
                          <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                        </div>
                        <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${item.bgColor}`}>
                          <item.icon className={`h-6 w-6 ${item.color}`} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  {superAdminAttentionItems.map((item) => (
                    <div key={item.title} className="rounded-xl border p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm text-muted-foreground">{item.title}</p>
                          <p className="mt-2 text-3xl font-bold">{loading ? '...' : item.value}</p>
                          <p className={`mt-2 text-sm ${item.tone}`}>{item.hint}</p>
                        </div>
                        <item.icon className="mt-1 h-5 w-5 text-muted-foreground" />
                      </div>
                      <Button className="mt-4" variant="outline" onClick={() => navigate(item.action)}>
                        {item.actionLabel}
                      </Button>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
              {superAdminQuickActions.map((item) => (
                <Card key={item.title} className="border-border/70">
                  <CardContent className="flex h-full flex-col justify-between gap-5 p-5">
                    <div className="space-y-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                        <item.icon className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-base font-semibold">{item.title}</p>
                        <p className="mt-2 text-sm text-muted-foreground">{item.description}</p>
                      </div>
                    </div>
                    <Button variant="outline" onClick={() => navigate(item.action)}>
                      {item.actionLabel}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Todas as escolas cadastradas</CardTitle>
              </CardHeader>
              <CardContent>
                {escolasCadastradas.length === 0 ? (
                  <p className="text-muted-foreground">Nenhuma escola cadastrada no momento.</p>
                ) : (
                  <div className="space-y-2">
                    {escolasCadastradas.map((escola) => (
                      <div key={escola.id} className="flex items-center justify-between rounded-md border p-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium">{escola.nome}</p>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                escola.ativo
                                  ? 'bg-emerald-500/10 text-emerald-600'
                                  : 'bg-muted text-muted-foreground'
                              }`}
                            >
                              {escola.ativo ? 'Ativa' : 'Inativa'}
                            </span>
                            {!escola.temTenant && (
                              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600">
                                Sem tenant vinculado
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{escola.subdominio || 'Sem subdominio cadastrado'}</p>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => navigate('/admin/tenants')}>
                          Ver detalhes
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {(userRole === 'gestor' || userRole === 'bibliotecaria') && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Emprestimos dos ultimos meses
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="py-8 text-center text-muted-foreground">Carregando...</p>
                ) : (
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={emprestimosPorMes} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="mes" tick={{ fontSize: 11 }} minTickGap={16} interval="preserveStartEnd" />
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
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="h-5 w-5" />
                  Disponibilidade do acervo
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="py-8 text-center text-muted-foreground">Carregando...</p>
                ) : stats.totalLivros === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">Nenhum livro cadastrado.</p>
                ) : (
                  <div className="h-[280px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={58}
                          outerRadius={96}
                          paddingAngle={5}
                          dataKey="value"
                          label={({ name, percent }) => `${name}: ${formatPercentLabel(percent)}`}
                        >
                          {pieData.map((_, index) => (
                            <Cell key={`dashboard-pie-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="xl:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Livros mais emprestados
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="py-8 text-center text-muted-foreground">Carregando...</p>
                ) : livrosMaisEmprestados.length === 0 ? (
                  <p className="py-8 text-center text-muted-foreground">Nenhum emprestimo registrado.</p>
                ) : (
                  <div className="space-y-3">
                    {livrosMaisEmprestados.map((livro, index) => (
                      <div key={`${livro.titulo}-${index}`} className="rounded-lg border p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                              {index + 1}
                            </div>
                            <p className="font-medium">{livro.titulo}</p>
                          </div>
                          <span className="text-sm text-muted-foreground">{livro.emprestimos} emprestimos</span>
                        </div>
                        <div className="mt-2 h-2 w-full rounded-full bg-muted">
                          <div
                            className="h-2 rounded-full bg-primary transition-all"
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
        )}

        {!isSuperAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Atividades recentes
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground">Carregando...</p>
              ) : atividades.length === 0 ? (
                <p className="text-muted-foreground">Nenhuma atividade recente</p>
              ) : (
                <div className="space-y-4">
                  {atividades.map((atividade) => (
                    <div key={atividade.id} className="flex items-center gap-4 rounded-lg bg-muted/50 p-3">
                      <div
                        className={`flex h-10 w-10 items-center justify-center rounded-full ${
                          atividade.tipo === 'emprestimo' ? 'bg-primary/10' : 'bg-success/10'
                        }`}
                      >
                        <BookMarked
                          className={`h-5 w-5 ${atividade.tipo === 'emprestimo' ? 'text-primary' : 'text-success'}`}
                        />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium">{atividade.descricao}</p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(atividade.data), "dd 'de' MMMM 'as' HH:mm", { locale: ptBR })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}

