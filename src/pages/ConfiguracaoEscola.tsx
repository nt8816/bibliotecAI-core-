import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { School, Plus, Trash2, GraduationCap, BookOpen, Loader2 } from 'lucide-react';

interface Escola {
  id: string;
  nome: string;
  created_at: string;
}

interface SalaCurso {
  id: string;
  nome: string;
  tipo: 'sala' | 'curso_tecnico';
  escola_id: string;
}

export default function ConfiguracaoEscola() {
  const [escola, setEscola] = useState<Escola | null>(null);
  const [salas, setSalas] = useState<SalaCurso[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nomeEscola, setNomeEscola] = useState('');
  const [novaSala, setNovaSala] = useState('');
  const [tipoNovaSala, setTipoNovaSala] = useState<'sala' | 'curso_tecnico'>('sala');
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchEscola();
  }, [user]);

  const fetchEscola = async () => {
    if (!user) return;

    try {
      // Fetch escola
      const { data: escolaData, error: escolaError } = await supabase
        .from('escolas')
        .select('*')
        .eq('gestor_id', user.id)
        .maybeSingle();

      if (escolaError) throw escolaError;

      if (escolaData) {
        setEscola(escolaData as Escola);
        setNomeEscola(escolaData.nome);

        // Fetch salas/cursos
        const { data: salasData, error: salasError } = await supabase
          .from('salas_cursos')
          .select('*')
          .eq('escola_id', escolaData.id)
          .order('nome');

        if (salasError) throw salasError;
        setSalas((salasData || []) as SalaCurso[]);
      }
    } catch (error) {
      console.error('Error fetching escola:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os dados da escola.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const salvarEscola = async () => {
    if (!user || !nomeEscola.trim()) return;

    setSaving(true);
    try {
      if (escola) {
        // Update existing escola
        const { error } = await supabase
          .from('escolas')
          .update({ nome: nomeEscola })
          .eq('id', escola.id);

        if (error) throw error;
        setEscola({ ...escola, nome: nomeEscola });
      } else {
        // Create new escola
        const { data, error } = await supabase
          .from('escolas')
          .insert({ nome: nomeEscola, gestor_id: user.id })
          .select()
          .single();

        if (error) throw error;
        setEscola(data as Escola);
      }

      toast({
        title: 'Salvo!',
        description: 'As informações da escola foram atualizadas.',
      });
    } catch (error) {
      console.error('Error saving escola:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar as informações.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const adicionarSala = async () => {
    if (!escola || !novaSala.trim()) return;

    try {
      const { data, error } = await supabase
        .from('salas_cursos')
        .insert({
          escola_id: escola.id,
          nome: novaSala,
          tipo: tipoNovaSala,
        })
        .select()
        .single();

      if (error) throw error;

      setSalas([...salas, data as SalaCurso]);
      setNovaSala('');
      setDialogOpen(false);
      toast({
        title: 'Adicionado!',
        description: `${tipoNovaSala === 'sala' ? 'Sala' : 'Curso'} adicionado com sucesso.`,
      });
    } catch (error) {
      console.error('Error adding sala:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível adicionar.',
        variant: 'destructive',
      });
    }
  };

  const removerSala = async (id: string) => {
    try {
      const { error } = await supabase
        .from('salas_cursos')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setSalas(salas.filter(s => s.id !== id));
      toast({
        title: 'Removido!',
        description: 'Item removido com sucesso.',
      });
    } catch (error) {
      console.error('Error removing sala:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível remover.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <MainLayout title="Configuração da Escola">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Configuração da Escola">
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* School Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <School className="w-5 h-5" />
              Informações da Escola
            </CardTitle>
            <CardDescription>
              Configure o nome e informações básicas da sua escola
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nomeEscola">Nome da Escola</Label>
              <Input
                id="nomeEscola"
                value={nomeEscola}
                onChange={(e) => setNomeEscola(e.target.value)}
                placeholder="Ex: Escola Estadual ABC"
              />
            </div>
            <Button onClick={salvarEscola} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar'
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Salas e Cursos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5" />
                Salas e Cursos
              </CardTitle>
              <CardDescription>
                Adicione as turmas/salas ou cursos técnicos da escola
              </CardDescription>
            </div>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={!escola}>
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar Sala/Curso</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={tipoNovaSala} onValueChange={(v) => setTipoNovaSala(v as 'sala' | 'curso_tecnico')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sala">Sala/Turma</SelectItem>
                        <SelectItem value="curso_tecnico">Curso Técnico</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={novaSala}
                      onChange={(e) => setNovaSala(e.target.value)}
                      placeholder={tipoNovaSala === 'sala' ? 'Ex: 3º Ano A' : 'Ex: Técnico em Informática'}
                    />
                  </div>
                  <Button onClick={adicionarSala} className="w-full">
                    Adicionar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {!escola ? (
              <p className="text-muted-foreground text-center py-8">
                Salve as informações da escola primeiro para adicionar salas e cursos.
              </p>
            ) : salas.length === 0 ? (
              <div className="text-center py-8">
                <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Nenhuma sala ou curso cadastrado</p>
                <p className="text-sm text-muted-foreground">
                  Clique em "Adicionar" para começar
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {salas.map((sala) => (
                  <div
                    key={sala.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      {sala.tipo === 'sala' ? (
                        <GraduationCap className="w-5 h-5 text-primary" />
                      ) : (
                        <BookOpen className="w-5 h-5 text-secondary" />
                      )}
                      <span className="font-medium">{sala.nome}</span>
                      <Badge variant="outline" className="text-xs">
                        {sala.tipo === 'sala' ? 'Sala' : 'Curso Técnico'}
                      </Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removerSala(sala.id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
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
