import { useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { BookOpen, Sparkles, User, Target, GraduationCap, Lightbulb, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

type PerfilTipo = 'ensino_medio' | 'ensino_tecnico' | 'eja' | null;

interface LivroRecomendado {
  id: string;
  titulo: string;
  autor: string;
  area: string;
  motivo: string;
  relevancia: number;
}

interface RecomendacaoResult {
  explicacao: string;
  livros: LivroRecomendado[];
}

const perfis = [
  {
    id: 'ensino_medio' as PerfilTipo,
    titulo: 'Ensino Médio Regular',
    descricao: 'Estudantes do ensino médio tradicional',
    icon: GraduationCap,
  },
  {
    id: 'ensino_tecnico' as PerfilTipo,
    titulo: 'Ensino Técnico',
    descricao: 'Estudantes de cursos técnicos integrados',
    icon: Target,
  },
  {
    id: 'eja' as PerfilTipo,
    titulo: 'EJA',
    descricao: 'Educação de Jovens e Adultos',
    icon: User,
  },
];

const areasInteresse = [
  'Matemática',
  'Português',
  'História',
  'Geografia',
  'Biologia',
  'Física',
  'Química',
  'Literatura',
  'Informática',
  'Filosofia',
  'Sociologia',
  'Artes',
];

const objetivos = [
  'Preparação para o ENEM',
  'Preparação para vestibulares',
  'Preparação para o mercado de trabalho',
  'Ampliação de conhecimentos gerais',
  'Reforço escolar',
  'Pesquisa acadêmica',
];

export default function Recomendacoes() {
  const [perfilSelecionado, setPerfilSelecionado] = useState<PerfilTipo>(null);
  const [areasSelecionadas, setAreasSelecionadas] = useState<string[]>([]);
  const [objetivosSelecionados, setObjetivosSelecionados] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<RecomendacaoResult | null>(null);
  const { toast } = useToast();

  const toggleArea = (area: string) => {
    setAreasSelecionadas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const toggleObjetivo = (objetivo: string) => {
    setObjetivosSelecionados((prev) =>
      prev.includes(objetivo) ? prev.filter((o) => o !== objetivo) : [...prev, objetivo]
    );
  };

  const gerarRecomendacoes = async () => {
    if (!perfilSelecionado) {
      toast({
        title: 'Selecione seu perfil',
        description: 'Escolha seu nível de ensino para continuar.',
        variant: 'destructive',
      });
      return;
    }

    if (areasSelecionadas.length === 0) {
      toast({
        title: 'Selecione áreas de interesse',
        description: 'Escolha pelo menos uma área de interesse.',
        variant: 'destructive',
      });
      return;
    }

    setLoading(true);
    setResultado(null);

    try {
      const { data, error } = await supabase.functions.invoke('ai-recomendacoes', {
        body: {
          perfil: perfilSelecionado,
          areas: areasSelecionadas,
          objetivos: objetivosSelecionados,
        },
      });

      if (error) {
        throw error;
      }

      if (data?.success) {
        setResultado(data.data);
      } else {
        throw new Error(data?.error || 'Erro ao gerar recomendações');
      }
    } catch (error) {
      console.error('Erro ao gerar recomendações:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível gerar as recomendações. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const resetar = () => {
    setPerfilSelecionado(null);
    setAreasSelecionadas([]);
    setObjetivosSelecionados([]);
    setResultado(null);
  };

  return (
    <MainLayout title="Recomendações de Livros">
      <div className="space-y-8 max-w-4xl mx-auto">
        {/* Hero Section */}
        <Card className="bg-primary text-primary-foreground border-none">
          <CardContent className="p-8">
            <div className="flex flex-col md:flex-row items-center gap-6">
              <div className="flex-1 space-y-4">
                <h1 className="text-2xl md:text-3xl font-bold">
                  Descubra Livros Perfeitos para Você
                </h1>
                <p className="text-primary-foreground/90">
                  O BibliotecAI utiliza inteligência artificial para recomendar livros que
                  combinam com seu perfil, interesses acadêmicos e objetivos de aprendizagem.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground border-none">
                    Ensino Médio
                  </Badge>
                  <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground border-none">
                    Ensino Técnico
                  </Badge>
                  <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground border-none">
                    EJA
                  </Badge>
                  <Badge variant="secondary" className="bg-primary-foreground/20 text-primary-foreground border-none">
                    Personalizado
                  </Badge>
                </div>
              </div>
              <div className="w-32 h-32 bg-primary-foreground/10 rounded-2xl flex items-center justify-center">
                <BookOpen className="w-16 h-16 text-primary-foreground/80" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* How it Works */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="text-center">
            <CardContent className="p-6 space-y-3">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto text-lg font-bold">
                1
              </div>
              <h3 className="font-semibold">Perfil do Estudante</h3>
              <p className="text-sm text-muted-foreground">
                O sistema coleta informações sobre seu nível de ensino, interesses e objetivos.
              </p>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="p-6 space-y-3">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto text-lg font-bold">
                2
              </div>
              <h3 className="font-semibold">Análise por IA</h3>
              <p className="text-sm text-muted-foreground">
                Nossa IA analisa seu perfil e o compara com o acervo disponível.
              </p>
            </CardContent>
          </Card>
          <Card className="text-center">
            <CardContent className="p-6 space-y-3">
              <div className="w-12 h-12 bg-primary text-primary-foreground rounded-full flex items-center justify-center mx-auto text-lg font-bold">
                3
              </div>
              <h3 className="font-semibold">Recomendações</h3>
              <p className="text-sm text-muted-foreground">
                Você recebe sugestões de livros alinhados aos seus interesses.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Form Section */}
        <Card className="bg-primary text-primary-foreground border-none">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5" />
              Experimente o Sistema de Recomendação
            </CardTitle>
            <CardDescription className="text-primary-foreground/80">
              Veja na prática como a inteligência artificial recomenda livros para você
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Perfil Selection */}
            <div className="space-y-3">
              <h4 className="font-medium">Selecione seu perfil:</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {perfis.map((perfil) => (
                  <button
                    key={perfil.id}
                    onClick={() => setPerfilSelecionado(perfil.id)}
                    className={cn(
                      'p-4 rounded-lg text-left transition-all border-2',
                      perfilSelecionado === perfil.id
                        ? 'bg-primary-foreground text-foreground border-primary-foreground'
                        : 'bg-primary-foreground/10 border-transparent hover:bg-primary-foreground/20'
                    )}
                  >
                    <perfil.icon
                      className={cn(
                        'w-6 h-6 mb-2',
                        perfilSelecionado === perfil.id ? 'text-primary' : 'text-primary-foreground'
                      )}
                    />
                    <p
                      className={cn(
                        'font-semibold',
                        perfilSelecionado === perfil.id ? 'text-foreground' : 'text-primary-foreground'
                      )}
                    >
                      {perfil.titulo}
                    </p>
                    <p
                      className={cn(
                        'text-sm',
                        perfilSelecionado === perfil.id
                          ? 'text-muted-foreground'
                          : 'text-primary-foreground/70'
                      )}
                    >
                      {perfil.descricao}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Areas de Interesse */}
            <div className="space-y-3">
              <h4 className="font-medium">Áreas de interesse:</h4>
              <div className="flex flex-wrap gap-2">
                {areasInteresse.map((area) => (
                  <button
                    key={area}
                    onClick={() => toggleArea(area)}
                    className={cn(
                      'px-4 py-2 rounded-full text-sm font-medium transition-all',
                      areasSelecionadas.includes(area)
                        ? 'bg-primary-foreground text-primary'
                        : 'bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20'
                    )}
                  >
                    {area}
                  </button>
                ))}
              </div>
            </div>

            {/* Objetivos */}
            <div className="space-y-3">
              <h4 className="font-medium">Objetivos de aprendizagem:</h4>
              <div className="flex flex-wrap gap-2">
                {objetivos.map((objetivo) => (
                  <button
                    key={objetivo}
                    onClick={() => toggleObjetivo(objetivo)}
                    className={cn(
                      'px-4 py-2 rounded-full text-sm font-medium transition-all',
                      objetivosSelecionados.includes(objetivo)
                        ? 'bg-primary-foreground text-primary'
                        : 'bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/20'
                    )}
                  >
                    {objetivo}
                  </button>
                ))}
              </div>
            </div>

            {/* Generate Button */}
            <Button
              onClick={gerarRecomendacoes}
              disabled={loading}
              className="w-full bg-primary-foreground text-primary hover:bg-primary-foreground/90"
              size="lg"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Gerando Recomendações...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Gerar Recomendações
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results Section */}
        {(loading || resultado) && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-primary" />
                Suas Recomendações Personalizadas
              </CardTitle>
              <CardDescription>
                Baseadas no seu perfil e interesses acadêmicos
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {loading ? (
                <div className="space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <div className="grid gap-4">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-32 w-full" />
                    ))}
                  </div>
                </div>
              ) : resultado ? (
                <>
                  {/* AI Explanation */}
                  <div className="bg-accent/50 rounded-lg p-4">
                    <h4 className="font-semibold text-accent-foreground mb-2">
                      Como a IA selecionou estes livros para você
                    </h4>
                    <p className="text-muted-foreground">{resultado.explicacao}</p>
                  </div>

                  {/* Recommended Books */}
                  <div className="space-y-4">
                    <h4 className="font-semibold">Livros Recomendados:</h4>
                    {resultado.livros.length === 0 ? (
                      <p className="text-muted-foreground text-center py-8">
                        Nenhum livro encontrado no acervo que corresponda ao seu perfil.
                        Tente selecionar outras áreas de interesse.
                      </p>
                    ) : (
                      <div className="grid gap-4">
                        {resultado.livros.map((livro) => (
                          <Card key={livro.id} className="border-l-4 border-l-primary">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between gap-4">
                                <div className="flex-1 space-y-1">
                                  <h5 className="font-semibold">{livro.titulo}</h5>
                                  <p className="text-sm text-muted-foreground">{livro.autor}</p>
                                  <Badge variant="outline" className="mt-2">
                                    {livro.area}
                                  </Badge>
                                </div>
                                <div className="text-right">
                                  <div className="text-2xl font-bold text-primary">
                                    {livro.relevancia}%
                                  </div>
                                  <p className="text-xs text-muted-foreground">relevância</p>
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground mt-3 pt-3 border-t">
                                <span className="font-medium text-foreground">Por que este livro:</span>{' '}
                                {livro.motivo}
                              </p>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Reset Button */}
                  <Button onClick={resetar} variant="outline" className="w-full">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Tentar com Outro Perfil
                  </Button>
                </>
              ) : null}
            </CardContent>
          </Card>
        )}
      </div>
    </MainLayout>
  );
}
