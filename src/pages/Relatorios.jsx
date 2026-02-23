import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart3, BookOpen, TrendingUp, Users, CalendarDays, AlertTriangle } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';

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
            .select('id, livro_id, created_at, data_emprestimo, data_devolucao_real, status, data_devolucao_prevista, livros(titulo)'),
          supabase
            .from('emprestimos')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'ativo')
            .lt('data_devolucao_prevista', new Date().toISOString()),
        ]);

        const allEmprestimos = emprestimosRes.data || [];
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

  return (
    <MainLayout title="Relatórios">
      <div className="space-y-4 sm:space-y-6">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
          {statCards.map((card) => (
            <Card key={card.title}>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[11px] sm:text-xs text-muted-foreground">{card.title}</p>
                    <p className="text-xl sm:text-2xl font-bold mt-0.5">{loading ? '...' : card.value}</p>
                  </div>
                  <card.icon className={`w-5 h-5 sm:w-6 sm:h-6 ${card.color}`} />
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
                <BarChart3 className="w-4 h-4" /> Empréstimos por mês (dados reais)
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
                      <XAxis dataKey="mes" tick={{ fontSize: 12 }} interval={0} />
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
                <TrendingUp className="w-4 h-4" /> Evolução (empréstimos vs devoluções)
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
                      <XAxis dataKey="mes" tick={{ fontSize: 12 }} interval={0} />
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
            <CardTitle className="text-base">Detalhe mensal (uso rápido no celular/tablet)</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground py-8 text-center">Carregando...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[520px]">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2">Mês</th>
                      <th className="text-right py-2">Empréstimos</th>
                      <th className="text-right py-2">Devoluções</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emprestimosPorMes.map((item) => (
                      <tr key={item.key} className="border-b last:border-b-0">
                        <td className="py-2">{item.mes}</td>
                        <td className="py-2 text-right font-medium">{item.emprestimos}</td>
                        <td className="py-2 text-right">{item.devolucoes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
