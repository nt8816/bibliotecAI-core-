import { useEffect, useMemo, useState } from 'react';
import {
  Trophy,
  Medal,
  Crown,
  Loader2,
  GraduationCap,
  School,
  Filter,
} from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { fetchRankingData } from '@/services/rankingService';

function repairMojibakeText(value) {
  const text = String(value || '');
  if (!text || !/[ÃƒÆ’Ãƒâ€š]/.test(text)) return text;
  try {
    return decodeURIComponent(escape(text));
  } catch {
    return text;
  }
}

function normalizeTurmaKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getNivelFromXp(xp) {
  return Math.max(1, Math.floor(Number(xp || 0) / 150) + 1);
}

function getRankAccent(position) {
  if (position === 1) return 'border-warning/40 bg-warning/10';
  if (position === 2) return 'border-slate-300/30 bg-slate-300/10';
  if (position === 3) return 'border-amber-700/30 bg-amber-700/10';
  return 'border-border bg-card';
}

function getRankIcon(position) {
  if (position === 1) return Crown;
  if (position <= 3) return Medal;
  return Trophy;
}

function RankingList({ items, currentStudentId }) {
  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-sm text-muted-foreground">
          Nenhum aluno disponivel neste ranking.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((aluno, index) => {
        const position = index + 1;
        const Icon = getRankIcon(position);
        const isCurrentStudent = aluno.id === currentStudentId;

        return (
          <Card
            key={aluno.id}
            className={`${getRankAccent(position)} ${isCurrentStudent ? 'ring-1 ring-primary/60 shadow-[0_0_0_1px_rgba(34,197,94,0.18)]' : ''}`}
          >
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-background/80 text-foreground">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-muted-foreground">#{position}</span>
                    <p className="font-semibold">{repairMojibakeText(aluno.nome) || 'Aluno sem nome'}</p>
                    {isCurrentStudent && <Badge variant="default">Voce</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>Turma: {repairMojibakeText(aluno.turma) || 'Sem turma'}</span>
                    <span>Nivel {aluno.nivel}</span>
                    <span>{aluno.livrosLidos} livros com XP</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="text-sm">
                  {aluno.xpTotal} XP
                </Badge>
                <Badge variant="secondary" className="text-sm">
                  Nivel {aluno.nivel}
                </Badge>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default function RankingAluno() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [currentStudentId, setCurrentStudentId] = useState(null);
  const [currentTurma, setCurrentTurma] = useState(null);
  const [rankingEscola, setRankingEscola] = useState([]);
  const [turmaFiltro, setTurmaFiltro] = useState('all');

  const isAluno = userRole === 'aluno';
  const canUseSchoolRanking = ['aluno', 'professor', 'gestor', 'bibliotecaria'].includes(userRole || '');

  useEffect(() => {
    if (!user?.id || !canUseSchoolRanking) {
      setLoading(false);
      return;
    }

    let active = true;

    const loadRanking = async () => {
      setLoading(true);
      try {
        const payload = await fetchRankingData();
        const rankingCalculado = (payload?.ranking || []).map((aluno) => ({
          ...aluno,
          nome: repairMojibakeText(aluno.nome),
          turma: repairMojibakeText(aluno.turma),
          xpTotal: Number(aluno.xp_total || aluno.xpTotal || 0),
          nivel: Number(aluno.nivel || getNivelFromXp(aluno.xp_total || aluno.xpTotal || 0)),
          livrosLidos: Number(aluno.livros_lidos || aluno.livrosLidos || 0),
        }));

        if (!active) return;
        setCurrentStudentId(isAluno ? payload?.currentStudentId || null : null);
        setCurrentTurma(payload?.currentTurma || null);
        setRankingEscola(rankingCalculado);
      } catch (error) {
        if (!active) return;
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar ranking',
          description: error?.message || 'Nao foi possivel montar o ranking agora.',
        });
      } finally {
        if (active) setLoading(false);
      }
    };

    loadRanking();
    return () => {
      active = false;
    };
  }, [canUseSchoolRanking, isAluno, toast, user?.id]);

  const rankingSala = useMemo(() => {
    const turmaKey = normalizeTurmaKey(currentTurma);
    return rankingEscola.filter((aluno) => normalizeTurmaKey(aluno.turma) === turmaKey);
  }, [currentTurma, rankingEscola]);

  const turmaOptions = useMemo(() => {
    const uniqueTurmas = Array.from(
      new Map(
        rankingEscola
          .filter((aluno) => aluno.turma)
          .map((aluno) => [normalizeTurmaKey(aluno.turma), repairMojibakeText(aluno.turma)]),
      ).values(),
    );

    return uniqueTurmas.sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [rankingEscola]);

  const rankingFiltradoPorTurma = useMemo(() => {
    if (turmaFiltro === 'all') return rankingEscola;
    const turmaKey = normalizeTurmaKey(turmaFiltro);
    return rankingEscola.filter((aluno) => normalizeTurmaKey(aluno.turma) === turmaKey);
  }, [rankingEscola, turmaFiltro]);

  const minhaPosicaoSala = useMemo(
    () => rankingSala.findIndex((aluno) => aluno.id === currentStudentId) + 1 || 0,
    [currentStudentId, rankingSala],
  );

  const minhaPosicaoEscola = useMemo(
    () => rankingEscola.findIndex((aluno) => aluno.id === currentStudentId) + 1 || 0,
    [currentStudentId, rankingEscola],
  );

  if (loading) {
    return (
      <MainLayout title="Ranking">
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </MainLayout>
    );
  }

  if (!canUseSchoolRanking) {
    return (
      <MainLayout title="Ranking">
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">
            Esta area esta disponivel apenas para alunos, professores, gestao e bibliotecaria.
          </CardContent>
        </Card>
      </MainLayout>
    );
  }

  if (isAluno) {
    return (
      <MainLayout title="Ranking">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <GraduationCap className="h-5 w-5" />
                  Ranking da Sala
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Posicao atual: <span className="font-semibold text-foreground">#{minhaPosicaoSala || '-'}</span>
                </p>
                <p>Comparacao com os alunos da sua turma usando XP total e nivel.</p>
              </CardContent>
            </Card>

            <Card className="border-primary/20 bg-gradient-to-br from-secondary/10 via-card to-card">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <School className="h-5 w-5" />
                  Ranking da Escola
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Posicao atual: <span className="font-semibold text-foreground">#{minhaPosicaoEscola || '-'}</span>
                </p>
                <p>Comparacao geral entre todos os alunos da escola.</p>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="sala" className="space-y-4">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="sala">Ranking da sala</TabsTrigger>
              <TabsTrigger value="escola">Ranking da escola</TabsTrigger>
            </TabsList>

            <TabsContent value="sala" className="space-y-4">
              <RankingList items={rankingSala} currentStudentId={currentStudentId} />
            </TabsContent>

            <TabsContent value="escola" className="space-y-4">
              <RankingList items={rankingEscola} currentStudentId={currentStudentId} />
            </TabsContent>
          </Tabs>
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Ranking">
      <div className="space-y-6">
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-primary/20 bg-gradient-to-br from-secondary/10 via-card to-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <School className="h-5 w-5" />
                Ranking Escolar
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                Total de alunos no ranking: <span className="font-semibold text-foreground">{rankingEscola.length}</span>
              </p>
              <p>O ranking usa XP total e nivel real dos alunos da escola.</p>
            </CardContent>
          </Card>

          <Card className="border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Filter className="h-5 w-5" />
                Filtro por Turma
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select value={turmaFiltro} onValueChange={setTurmaFiltro}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a turma" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as turmas</SelectItem>
                  {turmaOptions.map((turma) => (
                    <SelectItem key={turma} value={turma}>
                      {turma}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Professores, gestao e bibliotecaria visualizam o ranking escolar e podem filtrar por turma.
              </p>
            </CardContent>
          </Card>
        </div>

        <RankingList items={rankingFiltradoPorTurma} currentStudentId={null} />
      </div>
    </MainLayout>
  );
}
