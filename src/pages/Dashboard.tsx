import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { BookOpen, Users, BookMarked, AlertTriangle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Stats {
  totalLivros: number;
  totalUsuarios: number;
  emprestimosAtivos: number;
  emprestimosAtrasados: number;
}

interface AtividadeRecente {
  id: string;
  tipo: 'emprestimo' | 'devolucao';
  descricao: string;
  data: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalLivros: 0,
    totalUsuarios: 0,
    emprestimosAtivos: 0,
    emprestimosAtrasados: 0,
  });
  const [atividades, setAtividades] = useState<AtividadeRecente[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    // Run all queries in parallel, handle individual failures gracefully
    const [livrosResult, usuariosResult, emprestimosAtivosResult, atrasadosResult, emprestimosRecentesResult] = await Promise.allSettled([
      supabase.from('livros').select('*', { count: 'exact', head: true }),
      supabase.from('usuarios_biblioteca').select('*', { count: 'exact', head: true }),
      supabase.from('emprestimos').select('*', { count: 'exact', head: true }).eq('status', 'ativo'),
      supabase.from('emprestimos').select('*', { count: 'exact', head: true }).eq('status', 'ativo').lt('data_devolucao_prevista', new Date().toISOString()),
      supabase.from('emprestimos').select(`id, data_emprestimo, data_devolucao_real, status, livros(titulo), usuarios_biblioteca(nome)`).order('created_at', { ascending: false }).limit(5),
    ]);

    setStats({
      totalLivros: livrosResult.status === 'fulfilled' ? (livrosResult.value.count || 0) : 0,
      totalUsuarios: usuariosResult.status === 'fulfilled' ? (usuariosResult.value.count || 0) : 0,
      emprestimosAtivos: emprestimosAtivosResult.status === 'fulfilled' ? (emprestimosAtivosResult.value.count || 0) : 0,
      emprestimosAtrasados: atrasadosResult.status === 'fulfilled' ? (atrasadosResult.value.count || 0) : 0,
    });

    if (emprestimosRecentesResult.status === 'fulfilled' && emprestimosRecentesResult.value.data) {
      const atividadesFormatadas = emprestimosRecentesResult.value.data.map((emp: any) => ({
        id: emp.id,
        tipo: emp.data_devolucao_real ? 'devolucao' : 'emprestimo',
        descricao: emp.data_devolucao_real
          ? `${emp.usuarios_biblioteca?.nome || 'Usuário'} devolveu "${emp.livros?.titulo || 'Livro'}"`
          : `${emp.usuarios_biblioteca?.nome || 'Usuário'} emprestou "${emp.livros?.titulo || 'Livro'}"`,
        data: emp.data_devolucao_real || emp.data_emprestimo,
      })) as AtividadeRecente[];
      setAtividades(atividadesFormatadas);
    }

    setLoading(false);
  };

  const statCards = [
    {
      title: 'Total de Livros',
      value: stats.totalLivros,
      icon: BookOpen,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
    },
    {
      title: 'Total de Usuários',
      value: stats.totalUsuarios,
      icon: Users,
      color: 'text-info',
      bgColor: 'bg-info/10',
    },
    {
      title: 'Leituras Ativas',
      value: stats.emprestimosAtivos,
      icon: BookMarked,
      color: 'text-secondary',
      bgColor: 'bg-secondary/10',
    },
    {
      title: 'Alertas de Atraso',
      value: stats.emprestimosAtrasados,
      icon: AlertTriangle,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
    },
  ];

  return (
    <MainLayout title="Dashboard">
      <div className="space-y-6">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statCards.map((card) => (
            <Card key={card.title} className="stat-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.title}</p>
                    <p className="text-3xl font-bold mt-1">
                      {loading ? '...' : card.value}
                    </p>
                  </div>
                  <div className={`w-12 h-12 rounded-lg ${card.bgColor} flex items-center justify-center`}>
                    <card.icon className={`w-6 h-6 ${card.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Recent Activities */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
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
                  <div
                    key={atividade.id}
                    className="flex items-center gap-4 p-3 rounded-lg bg-muted/50"
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      atividade.tipo === 'emprestimo' ? 'bg-primary/10' : 'bg-success/10'
                    }`}>
                      <BookMarked className={`w-5 h-5 ${
                        atividade.tipo === 'emprestimo' ? 'text-primary' : 'text-success'
                      }`} />
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
