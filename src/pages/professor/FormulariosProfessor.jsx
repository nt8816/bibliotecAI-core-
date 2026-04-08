import { useCallback, useEffect, useMemo, useState } from 'react';
import { FileQuestion, Loader2, Plus, Send, Users } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fetchProfessorPainelData } from '@/services/professorService';
import { useToast } from '@/hooks/use-toast';

const FORM_MARKER = '[FORM_CONFIG_V1]';

function decodeJsonBase64(value) {
  try {
    const decoded = decodeURIComponent(escape(atob(String(value || ''))));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function extractAtividadeFormConfig(descricao) {
  const source = String(descricao || '');
  const idx = source.indexOf(FORM_MARKER);

  if (idx < 0) {
    return { descricaoLimpa: source, perguntas: [] };
  }

  const descricaoLimpa = source.slice(0, idx).trim();
  const encoded = source.slice(idx + FORM_MARKER.length).trim();
  const parsed = decodeJsonBase64(encoded);
  const perguntas = Array.isArray(parsed?.perguntas) ? parsed.perguntas : [];

  return { descricaoLimpa, perguntas };
}

function formatDateLabel(value) {
  if (!value) return 'Sem prazo';
  try {
    return format(new Date(value), 'dd/MM/yyyy', { locale: ptBR });
  } catch {
    return 'Sem prazo';
  }
}

function getTargetSummary(atividade) {
  const turma = atividade?.usuarios_biblioteca?.turma;
  const aluno = atividade?.usuarios_biblioteca?.nome;
  return aluno ? `${aluno}${turma ? ` • ${turma}` : ''}` : (turma || 'Destino individual');
}

export default function FormulariosProfessor() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [atividades, setAtividades] = useState([]);
  const [entregas, setEntregas] = useState([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchProfessorPainelData();
      setAtividades(Array.isArray(data?.atividades) ? data.atividades : []);
      setEntregas(Array.isArray(data?.entregas) ? data.entregas : []);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error?.message || 'Falha ao carregar os formulários.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const formularios = useMemo(() => atividades
    .map((atividade) => {
      const meta = extractAtividadeFormConfig(atividade?.descricao);
      const respostas = entregas.filter((entrega) => entrega?.atividade_id === atividade?.id);
      return {
        ...atividade,
        meta,
        respostas,
      };
    })
    .filter((atividade) => atividade.meta.perguntas.length > 0), [atividades, entregas]);

  const totalPerguntas = useMemo(
    () => formularios.reduce((acc, item) => acc + item.meta.perguntas.length, 0),
    [formularios],
  );

  const totalRespostas = useMemo(
    () => formularios.reduce((acc, item) => acc + item.respostas.length, 0),
    [formularios],
  );

  return (
    <MainLayout title="Formulários">
      <div className="space-y-6">
        <Card className="border-0 shadow-none">
          <CardHeader className="rounded-3xl border bg-gradient-to-br from-primary/10 via-background to-info/10">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-background/80 px-3 py-1 text-xs font-medium text-primary backdrop-blur">
                  <FileQuestion className="h-3.5 w-3.5" />
                  Área de formulários
                </div>
                <CardTitle className="text-2xl">Questionários enviados aos alunos</CardTitle>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  Aqui ficam apenas as atividades com formulário ativo, separadas do restante para o professor acompanhar melhor.
                </p>
              </div>
              <Button
                size="lg"
                className="rounded-2xl px-5 shadow-[0_16px_35px_rgba(0,0,0,0.12)] transition-transform hover:-translate-y-0.5"
                onClick={() => navigate('/professor/painel')}
              >
                <Plus className="mr-2 h-4 w-4" />
                Novo formulário
              </Button>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-primary/20 bg-gradient-to-br from-background to-primary/5">
            <CardContent className="flex items-center gap-4 p-6">
              <FileQuestion className="h-6 w-6 text-primary" />
              <div>
                <p className="text-sm text-muted-foreground">Formulários enviados</p>
                <p className="text-2xl font-bold">{formularios.length}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-info/20 bg-gradient-to-br from-background to-info/5">
            <CardContent className="flex items-center gap-4 p-6">
              <Send className="h-6 w-6 text-info" />
              <div>
                <p className="text-sm text-muted-foreground">Questões publicadas</p>
                <p className="text-2xl font-bold">{totalPerguntas}</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-secondary/20 bg-gradient-to-br from-background to-secondary/5">
            <CardContent className="flex items-center gap-4 p-6">
              <Users className="h-6 w-6 text-secondary" />
              <div>
                <p className="text-sm text-muted-foreground">Respostas recebidas</p>
                <p className="text-2xl font-bold">{totalRespostas}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lista de formulários</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Carregando formulários...
              </div>
            ) : formularios.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-muted/30 p-8 text-center">
                <p className="font-medium">Nenhum formulário enviado ainda.</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Crie uma atividade com perguntas no painel do professor para ela aparecer aqui.
                </p>
                <Button className="mt-4 rounded-2xl" onClick={() => navigate('/professor/painel')}>
                  Ir para Sugestões e Atividades
                </Button>
              </div>
            ) : (
              formularios.map((atividade) => (
                <div
                  key={atividade.id}
                  className="rounded-2xl border bg-card/80 p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_16px_30px_rgba(0,0,0,0.06)]"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-foreground">{atividade.titulo || 'Formulário sem título'}</p>
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/10">
                          {atividade.meta.perguntas.length} questões
                        </Badge>
                        <Badge variant="outline">
                          {atividade.respostas.length} respostas
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{getTargetSummary(atividade)}</p>
                      <p className="text-sm text-muted-foreground">
                        {atividade.livros?.titulo || 'Sem livro vinculado'} • entrega em {formatDateLabel(atividade.data_entrega)}
                      </p>
                      {atividade.meta.descricaoLimpa && (
                        <p className="text-sm leading-6 text-foreground/80">{atividade.meta.descricaoLimpa}</p>
                      )}
                    </div>

                    <Button
                      variant="outline"
                      className="rounded-2xl"
                      onClick={() => navigate('/professor/painel')}
                    >
                      Ver no painel
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
