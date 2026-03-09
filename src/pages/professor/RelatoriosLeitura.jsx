import { useEffect, useMemo, useState, useCallback } from 'react';
import { format, parseISO, isWithinInterval, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { BarChart3, BookOpen, TrendingUp, Filter, Calendar, GraduationCap } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useAuth } from '@/hooks/useAuth';

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function isMissingTableError(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return (
    error?.code === '42P01'
    || error?.code === 'PGRST205'
    || message.includes('could not find the table')
    || message.includes('does not exist')
  );
}

export default function RelatoriosLeitura() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [usuarios, setUsuarios] = useState([]);
  const [emprestimos, setEmprestimos] = useState([]);
  const [loading, setLoading] = useState(true);

  const [turmasPermitidas, setTurmasPermitidas] = useState([]);
  const [filterTurma, setFilterTurma] = useState('');
  const [periodoInicio, setPeriodoInicio] = useState(format(startOfMonth(subMonths(new Date(), 3)), 'yyyy-MM-dd'));
  const [periodoFim, setPeriodoFim] = useState(format(endOfMonth(new Date()), 'yyyy-MM-dd'));

  const fetchData = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const { data: professorData, error: professorError } = await supabase
        .from('usuarios_biblioteca')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (professorError || !professorData) throw professorError || new Error('Perfil de professor não encontrado.');

      const { data: turmasData, error: turmasError } = await supabase
        .from('professor_turmas')
        .select('turma')
        .eq('professor_id', professorData.id);
      if (turmasError) {
        if (isMissingTableError(turmasError)) {
          throw new Error('Tabela professor_turmas não encontrada. Aplique as migrations do Supabase.');
        }
        throw turmasError;
      }

      const turmas = [...new Set(ensureArray(turmasData).map((item) => String(item?.turma || '').trim()).filter(Boolean))].sort();
      setTurmasPermitidas(turmas);

      if (turmas.length === 0) {
        setUsuarios([]);
        setEmprestimos([]);
        return;
      }

      const [{ data: usuariosData, error: usuariosError }, { data: emprestimosData, error: emprestimosError }] = await Promise.all([
        supabase
          .from('usuarios_biblioteca')
          .select('id, nome, turma')
          .eq('tipo', 'aluno')
          .in('turma', turmas)
          .order('nome'),
        supabase
          .from('emprestimos')
          .select('id, usuario_id, data_emprestimo, data_devolucao_real, status, livros(titulo), usuarios_biblioteca(nome, turma)')
          .order('data_emprestimo', { ascending: false }),
      ]);

      if (usuariosError) throw usuariosError;
      if (emprestimosError) throw emprestimosError;

      const turmaSet = new Set(turmas);
      const emprestimosFiltrados = ensureArray(emprestimosData).filter((emp) =>
        turmaSet.has(String(emp?.usuarios_biblioteca?.turma || '').trim()),
      );

      setUsuarios(usuariosData || []);
      setEmprestimos(emprestimosFiltrados);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error?.message || 'Não foi possível carregar os dados.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRealtimeChange = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useRealtimeSubscription({ table: 'emprestimos', onChange: handleRealtimeChange });
  useRealtimeSubscription({ table: 'usuarios_biblioteca', onChange: handleRealtimeChange });
  useRealtimeSubscription({ table: 'professor_turmas', onChange: handleRealtimeChange });

  const filteredEmprestimos = useMemo(() => {
    const inicio = parseISO(periodoInicio);
    const fim = parseISO(periodoFim);
    return emprestimos.filter((emp) => {
      const dataEmprestimo = parseISO(emp.data_emprestimo);
      return isWithinInterval(dataEmprestimo, { start: inicio, end: fim });
    });
  }, [emprestimos, periodoFim, periodoInicio]);

  const alunoStats = useMemo(
    () => usuarios
      .filter((u) => !filterTurma || u.turma === filterTurma)
      .map((usuario) => {
        const emprestimosDoAluno = filteredEmprestimos.filter((e) => e.usuario_id === usuario.id);
        const livrosLidos = emprestimosDoAluno.filter((e) => e.status === 'devolvido').length;
        const emprestimosAtivos = emprestimosDoAluno.filter((e) => e.status === 'ativo').length;
        const ultimoEmprestimo = emprestimosDoAluno.length > 0 ? emprestimosDoAluno[0].data_emprestimo : null;

        return {
          id: usuario.id,
          nome: usuario.nome,
          turma: usuario.turma,
          livrosLidos,
          emprestimosAtivos,
          ultimoEmprestimo,
        };
      })
      .sort((a, b) => b.livrosLidos - a.livrosLidos),
    [filterTurma, filteredEmprestimos, usuarios],
  );

  const turmas = useMemo(
    () => [...new Set([...turmasPermitidas, ...usuarios.filter((u) => u.turma).map((u) => u.turma)])].sort(),
    [turmasPermitidas, usuarios],
  );

  const totalLivrosLidos = alunoStats.reduce((acc, a) => acc + a.livrosLidos, 0);
  const mediaLivrosPorAluno = alunoStats.length > 0 ? (totalLivrosLidos / alunoStats.length).toFixed(1) : '0';
  const maxLivros = Math.max(...alunoStats.map((a) => a.livrosLidos), 1);
  const alunosComLeitura = alunoStats.filter((a) => a.livrosLidos > 0).length;
  const topReaders = alunoStats.slice(0, 5);

  return (
    <MainLayout title="Relatórios de Leitura">
      <div className="space-y-6">
        {turmasPermitidas.length === 0 && (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
            <p className="text-sm text-warning">Nenhuma turma foi vinculada ao seu perfil. Solicite ao gestor a vinculação.</p>
          </div>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Filter className="w-5 h-5" />
              Filtros do Período
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label>Data Início</Label>
                <Input type="date" value={periodoInicio} onChange={(e) => setPeriodoInicio(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Data Fim</Label>
                <Input type="date" value={periodoFim} onChange={(e) => setPeriodoFim(e.target.value)} />
              </div>

              <div className="space-y-2">
                <Label>Turma</Label>
                <Select value={filterTurma || 'all'} onValueChange={(v) => setFilterTurma(v === 'all' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Todas as turmas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas as turmas</SelectItem>
                    {turmas.map((turma) => (
                      <SelectItem key={turma} value={turma}>{turma}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setPeriodoInicio(format(startOfMonth(subMonths(new Date(), 3)), 'yyyy-MM-dd'));
                    setPeriodoFim(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
                    setFilterTurma('');
                  }}
                >
                  Limpar Filtros
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total de Livros Lidos</p>
                  <p className="text-2xl font-bold">{totalLivrosLidos}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-info/10 flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-info" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Média por Aluno</p>
                  <p className="text-2xl font-bold">{mediaLivrosPorAluno}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Alunos Ativos</p>
                  <p className="text-2xl font-bold">{alunosComLeitura}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <Calendar className="w-6 h-6 text-secondary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Período</p>
                  <p className="text-sm font-medium">
                    {format(parseISO(periodoInicio), 'dd/MM')} - {format(parseISO(periodoFim), 'dd/MM/yyyy')}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {topReaders.length > 0 && topReaders[0].livrosLidos > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Top 5 Leitores do Período
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {topReaders.filter((r) => r.livrosLidos > 0).map((aluno, index) => (
                  <div key={aluno.id} className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">
                      {index + 1}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-medium">{aluno.nome}</span>
                        <span className="text-sm text-muted-foreground">
                          {aluno.livrosLidos} livro{aluno.livrosLidos !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <Progress value={(aluno.livrosLidos / maxLivros) * 100} className="h-2" />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Detalhamento por Aluno
            </CardTitle>
            <CardDescription>
              Quantidade de livros lidos por cada aluno no período selecionado
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : alunoStats.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">Nenhum aluno encontrado</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Posição</TableHead>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Turma</TableHead>
                      <TableHead className="text-center">Livros Lidos</TableHead>
                      <TableHead className="text-center">Em Andamento</TableHead>
                      <TableHead>Último Empréstimo</TableHead>
                      <TableHead>Engajamento</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {alunoStats.map((aluno, index) => (
                      <TableRow key={aluno.id}>
                        <TableCell className="font-medium">#{index + 1}</TableCell>
                        <TableCell className="font-medium">{aluno.nome}</TableCell>
                        <TableCell>{aluno.turma || '-'}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={aluno.livrosLidos > 0 ? 'default' : 'outline'}>{aluno.livrosLidos}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{aluno.emprestimosAtivos}</Badge>
                        </TableCell>
                        <TableCell>
                          {aluno.ultimoEmprestimo
                            ? format(parseISO(aluno.ultimoEmprestimo), 'dd/MM/yyyy', { locale: ptBR })
                            : 'Nunca'}
                        </TableCell>
                        <TableCell>
                          <div className="w-24">
                            <Progress
                              value={maxLivros > 0 ? (aluno.livrosLidos / maxLivros) * 100 : 0}
                              className="h-2"
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
