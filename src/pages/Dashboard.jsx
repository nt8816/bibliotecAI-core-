import { useEffect, useState, useCallback, useRef } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { BookOpen, Users, BookMarked, AlertTriangle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Dashboard() {
  const { userRole, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [stats, setStats] = useState({
    totalLivros: 0,
    totalUsuarios: 0,
    emprestimosAtivos: 0,
    emprestimosAtrasados: 0,
  });
  const [atividades, setAtividades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showGestorWelcome, setShowGestorWelcome] = useState(false);

  const fetchInFlightRef = useRef(null);
  const realtimeDebounceRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (fetchInFlightRef.current) return fetchInFlightRef.current;

    const request = (async () => {
      const [livrosResult, usuariosResult, emprestimosAtivosResult, atrasadosResult, emprestimosRecentesResult] = await Promise.allSettled([
        supabase.from('livros').select('*', { count: 'exact', head: true }),
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
      ]);

      setStats({
        totalLivros: livrosResult.status === 'fulfilled' ? (livrosResult.value.count || 0) : 0,
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

  useEffect(() => {
    if (userRole !== 'gestor' || !user?.id) return;

    const key = `onboarding:gestor:${user.id}`;
    if (localStorage.getItem(key) === 'done') return;

    setShowGestorWelcome(true);
    setTimeout(() => {
      toast({
        title: 'Bem-vindo ao painel da escola',
        description: 'Vamos te guiar com mensagens rápidas para configurar tudo.',
      });
    }, 300);
    setTimeout(() => {
      toast({
        title: 'Passo 1 de 3',
        description: 'Cadastre as turmas/salas para organizar os alunos por classe.',
      });
    }, 2200);
    setTimeout(() => {
      toast({
        title: 'Passo 2 de 3',
        description: 'Depois, convide equipe e alunos usando os Tokens de Convite.',
      });
    }, 4300);
  }, [toast, user?.id, userRole]);

  const markGestorOnboardingDone = () => {
    if (user?.id) {
      localStorage.setItem(`onboarding:gestor:${user.id}`, 'done');
    }
    setShowGestorWelcome(false);
  };

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

  if (userRole === 'aluno') {
    return <Navigate to="/aluno/painel" replace />;
  }

  if (userRole === 'professor') {
    return <Navigate to="/professor/painel" replace />;
  }

  return (
    <MainLayout title="Dashboard">
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => (
            <Card key={card.title} className="stat-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.title}</p>
                    <p className="mt-1 text-3xl font-bold">{loading ? '...' : card.value}</p>
                  </div>
                  <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${card.bgColor}`}>
                    <card.icon className={`h-6 w-6 ${card.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

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

      <Dialog
        open={showGestorWelcome}
        onOpenChange={(open) => {
          setShowGestorWelcome(open);
          if (!open) markGestorOnboardingDone();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Primeiro acesso do gestor</DialogTitle>
            <DialogDescription>
              A escola já está criada. Deseja cadastrar as turmas agora ou continuar depois?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                markGestorOnboardingDone();
              }}
            >
              Fazer depois
            </Button>
            <Button
              onClick={() => {
                markGestorOnboardingDone();
                navigate('/configuracao-escola');
              }}
            >
              Cadastrar turmas agora
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </MainLayout>
  );
}
