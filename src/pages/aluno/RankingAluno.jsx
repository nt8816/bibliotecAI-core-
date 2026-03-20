import { useEffect, useMemo, useState } from 'react';
import { Trophy, Medal, Crown, Loader2, GraduationCap, School } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

function normalizeTurmaKey(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLivroCategoria(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function getLivroXpPorCategoria(area) {
  const categoria = normalizeLivroCategoria(area);

  if (!categoria) return 18;

  if (
    categoria.includes('quadrinho') ||
    categoria.includes('hq') ||
    categoria.includes('gibi') ||
    categoria.includes('manga') ||
    categoria.includes('comic')
  ) {
    return 5;
  }

  if (
    categoria.includes('infantil') ||
    categoria.includes('ilustrado') ||
    categoria.includes('figur') ||
    categoria.includes('visual')
  ) {
    return 8;
  }

  if (
    categoria.includes('poesia') ||
    categoria.includes('poema') ||
    categoria.includes('conto') ||
    categoria.includes('cronica')
  ) {
    return 12;
  }

  if (
    categoria.includes('arte') ||
    categoria.includes('teatro') ||
    categoria.includes('musica') ||
    categoria.includes('cultura')
  ) {
    return 14;
  }

  if (
    categoria.includes('literatura') ||
    categoria.includes('romance') ||
    categoria.includes('portugues') ||
    categoria.includes('gramatica') ||
    categoria.includes('historia') ||
    categoria.includes('geografia') ||
    categoria.includes('biografia') ||
    categoria.includes('filosofia') ||
    categoria.includes('sociologia')
  ) {
    return 20;
  }

  if (
    categoria.includes('matematica') ||
    categoria.includes('fisica') ||
    categoria.includes('quimica') ||
    categoria.includes('biologia') ||
    categoria.includes('ciencia') ||
    categoria.includes('tecnico') ||
    categoria.includes('programacao') ||
    categoria.includes('informatica') ||
    categoria.includes('desenvolvimento')
  ) {
    return 25;
  }

  return 18;
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
                    <p className="font-semibold">{aluno.nome || 'Aluno sem nome'}</p>
                    {isCurrentStudent && <Badge variant="default">Voce</Badge>}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <span>Turma: {aluno.turma || 'Sem turma'}</span>
                    <span>Nivel {aluno.nivel}</span>
                    <span>{aluno.livrosLidos} livros lidos</span>
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

  useEffect(() => {
    if (!user?.id || userRole !== 'aluno') {
      setLoading(false);
      return;
    }

    let active = true;

    const loadRanking = async () => {
      setLoading(true);
      try {
        const { data: perfil, error: perfilError } = await supabase
          .from('usuarios_biblioteca')
          .select('id, escola_id, turma')
          .eq('user_id', user.id)
          .order('updated_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (perfilError || !perfil) throw perfilError || new Error('Perfil do aluno nao encontrado.');

        const { data: alunos, error: alunosError } = await supabase
          .from('usuarios_biblioteca')
          .select('id, nome, turma')
          .eq('escola_id', perfil.escola_id)
          .eq('tipo', 'aluno');

        if (alunosError) throw alunosError;

        const alunoIds = (alunos || []).map((item) => item.id).filter(Boolean);

        const emptyResult = { data: [], error: null };
        const [
          livrosRes,
          emprestimosRes,
          avaliacoesRes,
          entregasRes,
          preferenciasRes,
        ] = await Promise.all([
          supabase.from('livros').select('id, area').eq('escola_id', perfil.escola_id),
          alunoIds.length > 0
            ? supabase.from('emprestimos').select('usuario_id, livro_id, status').in('usuario_id', alunoIds)
            : Promise.resolve(emptyResult),
          alunoIds.length > 0
            ? supabase.from('avaliacoes_livros').select('usuario_id').in('usuario_id', alunoIds)
            : Promise.resolve(emptyResult),
          alunoIds.length > 0
            ? supabase.from('atividades_entregas').select('aluno_id, status, pontos_ganhos').in('aluno_id', alunoIds)
            : Promise.resolve(emptyResult),
          alunoIds.length > 0
            ? supabase.from('preferencias_aluno').select('usuario_id, desafio_ia_xp_bonus').in('usuario_id', alunoIds)
            : Promise.resolve(emptyResult),
        ]);

        const maybeError = [
          livrosRes.error,
          emprestimosRes.error,
          avaliacoesRes.error,
          entregasRes.error,
          preferenciasRes.error,
        ].find(Boolean);

        if (maybeError) throw maybeError;

        const livrosById = new Map((livrosRes.data || []).map((livro) => [livro.id, livro]));
        const livroIdsLidosPorAluno = new Map();
        const avaliacoesPorAluno = new Map();
        const atividadesAprovadasPorAluno = new Map();
        const pontosGanhosPorAluno = new Map();
        const bonusDesafioPorAluno = new Map();

        (emprestimosRes.data || []).forEach((item) => {
          if (item.status !== 'devolvido' || !item.usuario_id || !item.livro_id) return;
          const current = livroIdsLidosPorAluno.get(item.usuario_id) || new Set();
          current.add(item.livro_id);
          livroIdsLidosPorAluno.set(item.usuario_id, current);
        });

        (avaliacoesRes.data || []).forEach((item) => {
          if (!item.usuario_id) return;
          avaliacoesPorAluno.set(item.usuario_id, (avaliacoesPorAluno.get(item.usuario_id) || 0) + 1);
        });

        (entregasRes.data || []).forEach((item) => {
          if (!item.aluno_id || item.status !== 'aprovada') return;
          atividadesAprovadasPorAluno.set(item.aluno_id, (atividadesAprovadasPorAluno.get(item.aluno_id) || 0) + 1);
          pontosGanhosPorAluno.set(
            item.aluno_id,
            (pontosGanhosPorAluno.get(item.aluno_id) || 0) + Number(item.pontos_ganhos || 0),
          );
        });

        (preferenciasRes.data || []).forEach((item) => {
          if (!item.usuario_id) return;
          bonusDesafioPorAluno.set(item.usuario_id, Number(item.desafio_ia_xp_bonus || 0));
        });

        const rankingCalculado = (alunos || [])
          .map((aluno) => {
            const livrosLidosSet = livroIdsLidosPorAluno.get(aluno.id) || new Set();
            const xpLeituras = Array.from(livrosLidosSet).reduce((acc, livroId) => {
              const livro = livrosById.get(livroId);
              return acc + getLivroXpPorCategoria(livro?.area);
            }, 0);
            const avaliacoesCount = avaliacoesPorAluno.get(aluno.id) || 0;
            const atividadesAprovadas = atividadesAprovadasPorAluno.get(aluno.id) || 0;
            const pontosGanhos = pontosGanhosPorAluno.get(aluno.id) || 0;
            const bonusDesafio = bonusDesafioPorAluno.get(aluno.id) || 0;
            const xpTotal = xpLeituras + (avaliacoesCount * 15) + (atividadesAprovadas * 25) + pontosGanhos + bonusDesafio;

            return {
              ...aluno,
              livrosLidos: livrosLidosSet.size,
              xpTotal,
              nivel: getNivelFromXp(xpTotal),
            };
          })
          .sort((a, b) => {
            if (b.xpTotal !== a.xpTotal) return b.xpTotal - a.xpTotal;
            if (b.nivel !== a.nivel) return b.nivel - a.nivel;
            return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
          });

        if (!active) return;
        setCurrentStudentId(perfil.id);
        setCurrentTurma(perfil.turma || null);
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
  }, [toast, user?.id, userRole]);

  const rankingSala = useMemo(() => {
    const turmaKey = normalizeTurmaKey(currentTurma);
    return rankingEscola.filter((aluno) => normalizeTurmaKey(aluno.turma) === turmaKey);
  }, [currentTurma, rankingEscola]);

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
              <p>Posicao atual: <span className="font-semibold text-foreground">#{minhaPosicaoSala || '-'}</span></p>
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
              <p>Posicao atual: <span className="font-semibold text-foreground">#{minhaPosicaoEscola || '-'}</span></p>
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
