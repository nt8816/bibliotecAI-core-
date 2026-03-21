import { useEffect, useState, useCallback, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { BookOpen, Users, BookMarked, AlertTriangle, Clock, BarChart3, TrendingUp } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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

const PIE_COLORS = ['hsl(122, 46%, 34%)', 'hsl(43, 96%, 56%)'];

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

function buildLastMonths(size = 6) {
  const now = new Date();
  const keys = [];
  for (let i = size - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function formatPercentLabel(percent) {
  const value = percent * 100;

  if (Number.isNaN(value)) return '0%';
  if (value === 0 || value === 100) return `${value.toFixed(0)}%`;
  if (value < 1 || value > 99) return `${value.toFixed(1)}%`;

  return `${value.toFixed(0)}%`;
}

export default function Dashboard() {
  const { userRole, user, isBibliotecaria } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
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

  const fetchInFlightRef = useRef(null);
  const realtimeDebounceRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (fetchInFlightRef.current) return fetchInFlightRef.current;

    const request = (async () => {
      const [
        livrosResult,
        livrosDisponiveisResult,
        usuariosResult,
        emprestimosAtivosResult,
        atrasadosResult,
        emprestimosRecentesResult,
        emprestimosDetalhadosResult,
        escolasResult,
        escolasBaseResult,
      ] = await Promise.allSettled([
        supabase.from('livros').select('*', { count: 'exact', head: true }),
        supabase.from('livros').select('*', { count: 'exact', head: true }).eq('disponivel', true),
        supabase.from('usuarios_biblioteca').select('*', { count: 'exact', head: true }),
        supabase.from('emprestimos').select('*', { count: 'exact', head: true }).eq('status', 'ativo'),
        supabase
          .from('emprestimos')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'ativo')
          .lt('data_devolucao_prevista', new Date().toISOString()),
        supabase
          .from('emprestimos')
          .select('id, data_emprestimo, data_devolucao_real, status, livros(titulo), usuarios_biblioteca(nome)')
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('emprestimos')
          .select('id, livro_id, created_at, data_emprestimo, status, livros(titulo)')
          .order('created_at', { ascending: false }),
        supabase.from('tenants').select('id, nome, subdominio, ativo').order('nome'),
        supabase.from('escolas').select('id, nome, gestor_id').order('nome'),
      ]);

      setStats({
        totalLivros: livrosResult.status === 'fulfilled' ? (livrosResult.value.count || 0) : 0,
        livrosDisponiveis: livrosDisponiveisResult.status === 'fulfilled' ? (livrosDisponiveisResult.value.count || 0) : 0,
        totalUsuarios: usuariosResult.status === 'fulfilled' ? (usuariosResult.value.count || 0) : 0,
        emprestimosAtivos: emprestimosAtivosResult.status === 'fulfilled' ? (emprestimosAtivosResult.value.count || 0) : 0,
        emprestimosAtrasados: atrasadosResult.status === 'fulfilled' ? (atrasadosResult.value.count || 0) : 0,
      });

      if (emprestimosRecentesResult.status === 'fulfilled' && emprestimosRecentesResult.value.data) {
        const atividadesFormatadas = emprestimosRecentesResult.value.data.map((emp) => ({
          id: emp.id,
          tipo: emp.data_devolucao_real ? 'devolucao' : 'emprestimo',
          descricao: emp.data_devolucao_real
            ? `${emp.usuarios_biblioteca?.nome || 'Usuário'} devolveu "${emp.livros?.titulo || 'Livro'}"`
            : `${emp.usuarios_biblioteca?.nome || 'Usuário'} emprestou "${emp.livros?.titulo || 'Livro'}"`,
          data: emp.data_devolucao_real || emp.data_emprestimo,
        }));

        setAtividades(atividadesFormatadas);
      }

      if (emprestimosDetalhadosResult.status === 'fulfilled' && emprestimosDetalhadosResult.value.data) {
        const monthlyKeys = buildLastMonths(6);
        const monthlyMap = new Map(
          monthlyKeys.map((key) => [key, { key, mes: monthLabel(key), emprestimos: 0 }]),
        );
        const livroCountMap = new Map();
        const livrosEmprestadosAtivos = new Set();

        emprestimosDetalhadosResult.value.data.forEach((emp) => {
          const loanDate = emp.data_emprestimo || emp.created_at;
          if (loanDate) {
            const key = monthKey(loanDate);
            if (monthlyMap.has(key)) {
              monthlyMap.get(key).emprestimos += 1;
            }
          }

          if (emp?.status === 'ativo' && emp?.livro_id) {
            livrosEmprestadosAtivos.add(emp.livro_id);
          }

          const livroNome = emp?.livros?.titulo || 'Livro sem título';
          const current = livroCountMap.get(livroNome) || 0;
          livroCountMap.set(livroNome, current + 1);
        });

        setEmprestimosPorMes(Array.from(monthlyMap.values()));
        setLivrosMaisEmprestados(
          Array.from(livroCountMap.entries())
            .map(([titulo, emprestimos]) => ({ titulo, emprestimos }))
            .sort((a, b) => b.emprestimos - a.emprestimos)
            .slice(0, 5),
        );
        setStats((prev) => ({
          ...prev,
          livrosDisponiveis: Math.max(0, Number(prev.totalLivros || 0) - livrosEmprestadosAtivos.size),
        }));
      }

      if (escolasResult.status === 'fulfilled' || escolasBaseResult.status === 'fulfilled') {
        const tenantsData = escolasResult.status === 'fulfilled' ? (escolasResult.value.data || []) : [];
        const escolasBase = escolasBaseResult.status === 'fulfilled' ? (escolasBaseResult.value.data || []) : [];

        const tenantByEscolaId = new Map(
          tenantsData
            .filter((tenant) => tenant?.escola_id)
            .map((tenant) => [tenant.escola_id, tenant]),
        );

        const escolasCompletas = escolasBase.map((escola) => {
          const tenant = tenantByEscolaId.get(escola.id);
          return {
            id: tenant?.id || escola.id,
            escola_id: escola.id,
            nome: tenant?.nome || escola.nome,
            subdominio: tenant?.subdominio || null,
            ativo: tenant?.ativo ?? true,
            temTenant: Boolean(tenant),
            gestor_id: escola.gestor_id || null,
          };
        });

        const escolasSemBase = tenantsData
          .filter((tenant) => tenant?.escola_id && !escolasBase.some((escola) => escola.id === tenant.escola_id))
          .map((tenant) => ({
            id: tenant.id,
            escola_id: tenant.escola_id,
            nome: tenant.nome,
            subdominio: tenant.subdominio || null,
            ativo: tenant.ativo ?? true,
            temTenant: true,
            gestor_id: null,
          }));

        setEscolasCadastradas(
          [...escolasCompletas, ...escolasSemBase].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')),
        );
      }

      setLoading(false);
    })();

    fetchInFlightRef.current = request;
    request.finally(() => {
      if (fetchInFlightRef.current === request) {
        fetchInFlightRef.current = null;
      }
    });

    return request;
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRealtimeChange = useCallback(() => {
    if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    realtimeDebounceRef.current = setTimeout(() => {
      fetchData();
    }, 300);
  }, [fetchData]);

  useEffect(() => {
    return () => {
      if (realtimeDebounceRef.current) clearTimeout(realtimeDebounceRef.current);
    };
  }, []);

  useRealtimeSubscription({ table: 'livros', onChange: handleRealtimeChange });
  useRealtimeSubscription({ table: 'usuarios_biblioteca', onChange: handleRealtimeChange });
  useRealtimeSubscription({ table: 'emprestimos', onChange: handleRealtimeChange });

  const livrosEmprestados = Math.min(stats.emprestimosAtivos, stats.totalLivros);
  const livrosDisponiveis = Math.max(0, stats.totalLivros - livrosEmprestados);

  const pieData = [
    { name: 'Disponíveis', value: livrosDisponiveis },
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
      title: 'Total de Usuários',
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

  if (userRole === 'aluno') {
    return <Navigate to="/aluno/perfil" replace />;
  }

  const handleStatCardKeyDown = (event, path) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      navigate(path);
    }
  };

  return (
    <MainLayout title="Dashboard">
      <div className="space-y-6">
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

        {userRole === 'super_admin' && (
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
                        <p className="text-xs text-muted-foreground">{escola.subdominio || 'Sem subdomínio cadastrado'}</p>
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
        )}

        {(userRole === 'gestor' || userRole === 'bibliotecaria') && (
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Empréstimos dos últimos meses
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
                  <p className="py-8 text-center text-muted-foreground">Nenhum empréstimo registrado.</p>
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
                          <span className="text-sm text-muted-foreground">{livro.emprestimos} empréstimos</span>
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Atividades Recentes
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
                        {format(new Date(atividade.data), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

    </MainLayout>
  );
}
