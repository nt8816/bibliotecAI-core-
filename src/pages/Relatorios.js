import { useEffect, useState } from 'react';
import { BarChart3, BookOpen, TrendingUp, Users } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { fetchRelatoriosData } from '@/services/relatoriosService';

const COLORS = ['hsl(122, 46%, 34%)', 'hsl(122, 41%, 45%)', 'hsl(122, 30%, 55%)', 'hsl(122, 25%, 65%)', 'hsl(122, 20%, 75%)'];

export default function Relatorios() {
  const [stats, setStats] = useState({ totalLivros: 0, totalUsuarios: 0, totalEmprestimos: 0, livrosDisponiveis: 0 });
  const [livrosMaisEmprestados, setLivrosMaisEmprestados] = useState([]);
  const [emprestimosPorMes, setEmprestimosPorMes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await fetchRelatoriosData();
        setStats(data.stats || {});
        setLivrosMaisEmprestados(data.livrosMaisEmprestados || []);
        setEmprestimosPorMes(data.emprestimosPorMes || []);
      } catch (error) {
        console.error('Error fetching report data:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const statCards = [
    { title: 'Total de Livros', value: stats.totalLivros, icon: BookOpen, color: 'text-primary' },
    { title: 'Livros Disponiveis', value: stats.livrosDisponiveis, icon: BookOpen, color: 'text-secondary' },
    { title: 'Total de Usuarios', value: stats.totalUsuarios, icon: Users, color: 'text-info' },
    { title: 'Total de Emprestimos', value: stats.totalEmprestimos, icon: TrendingUp, color: 'text-warning' },
  ];

  const pieData = [
    { name: 'Disponiveis', value: stats.livrosDisponiveis },
    { name: 'Emprestados', value: stats.totalLivros - stats.livrosDisponiveis },
  ];

  return (
    <MainLayout title="Relatorios">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <Card key={card.title}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.title}</p>
                    <p className="text-3xl font-bold mt-1">{loading ? '...' : card.value}</p>
                  </div>
                  <card.icon className={`w-8 h-8 ${card.color}`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="w-5 h-5" />Emprestimos por Mes</CardTitle></CardHeader>
            <CardContent>
              {loading ? <p className="text-center text-muted-foreground py-8">Carregando...</p> : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={emprestimosPorMes}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="mes" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="emprestimos" fill="hsl(122, 46%, 34%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><BookOpen className="w-5 h-5" />Disponibilidade de Livros</CardTitle></CardHeader>
            <CardContent>
              {loading ? <p className="text-center text-muted-foreground py-8">Carregando...</p> : stats.totalLivros === 0 ? <p className="text-center text-muted-foreground py-8">Nenhum livro cadastrado</p> : (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2"><TrendingUp className="w-5 h-5" />Livros Mais Emprestados</CardTitle></CardHeader>
            <CardContent>
              {loading ? <p className="text-center text-muted-foreground py-8">Carregando...</p> : livrosMaisEmprestados.length === 0 ? <p className="text-center text-muted-foreground py-8">Nenhum emprestimo registrado</p> : (
                <div className="space-y-4">
                  {livrosMaisEmprestados.map((livro, index) => (
                    <div key={`${livro.titulo}-${index}`} className="flex items-center gap-4">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"><span className="text-sm font-bold text-primary">{index + 1}</span></div>
                      <div className="flex-1">
                        <p className="font-medium">{livro.titulo}</p>
                        <div className="w-full bg-muted rounded-full h-2 mt-1">
                          <div className="bg-primary h-2 rounded-full transition-all" style={{ width: `${(livro.emprestimos / (livrosMaisEmprestados[0]?.emprestimos || 1)) * 100}%` }} />
                        </div>
                      </div>
                      <span className="text-sm text-muted-foreground">{livro.emprestimos} {livro.emprestimos === 1 ? 'emprestimo' : 'emprestimos'}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </MainLayout>
  );
}
