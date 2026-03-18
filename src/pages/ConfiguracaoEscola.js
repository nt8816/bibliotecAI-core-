import { useState, useEffect, useCallback } from 'react';
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
import { School, Plus, Trash2, GraduationCap, BookOpen, Loader2, Pencil } from 'lucide-react';

export default function ConfiguracaoEscola() {
  const [escola, setEscola] = useState(null);
  const [salas, setSalas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nomeEscola, setNomeEscola] = useState('');
  const [editingNome, setEditingNome] = useState(false);
  const [novaSala, setNovaSala] = useState('');
  const [tipoNovaSala, setTipoNovaSala] = useState('sala');
  const [dialogOpen, setDialogOpen] = useState(false);

  const { toast } = useToast();
  const { user } = useAuth();

  const fetchEscola = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const { data: perfil, error: perfilError } = await supabase
        .from('usuarios_biblioteca')
        .select('escola_id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (perfilError) throw perfilError;

      let escolaData = null;

      if (perfil?.escola_id) {
        const { data, error } = await supabase
          .from('escolas')
          .select('*')
          .eq('id', perfil.escola_id)
          .maybeSingle();

        if (error) throw error;
        escolaData = data || null;
      }

      if (!escolaData) {
        const { data, error } = await supabase
          .from('escolas')
          .select('*')
          .eq('gestor_id', user.id)
          .maybeSingle();

        if (error) throw error;
        escolaData = data || null;
      }

      setEscola(escolaData);
      setNomeEscola(escolaData?.nome || '');
      setEditingNome(false);

      if (!escolaData?.id) {
        setSalas([]);
        return;
      }

      const { data: salasData, error: salasError } = await supabase
        .from('salas_cursos')
        .select('*')
        .eq('escola_id', escolaData.id)
        .order('tipo')
        .order('nome');

      if (salasError) throw salasError;
      setSalas(salasData || []);
    } catch (error) {
      console.error('Error fetching escola:', error);
      toast({
        title: 'Erro',
        description: 'Nao foi possivel carregar os dados da escola.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, user?.id]);

  useEffect(() => {
    fetchEscola();
  }, [fetchEscola]);

  const salvarEscola = async () => {
    if (!user?.id || !nomeEscola.trim()) return;

    setSaving(true);
    try {
      if (escola?.id) {
        const { error } = await supabase
          .from('escolas')
          .update({ nome: nomeEscola.trim() })
          .eq('id', escola.id);

        if (error) throw error;

        const escolaAtualizada = { ...escola, nome: nomeEscola.trim() };
        setEscola(escolaAtualizada);
        setNomeEscola(escolaAtualizada.nome);
      } else {
        const { data, error } = await supabase
          .from('escolas')
          .insert({ nome: nomeEscola.trim(), gestor_id: user.id })
          .select()
          .single();

        if (error) throw error;
        setEscola(data);
        setNomeEscola(data.nome || '');
      }

      setEditingNome(false);
      toast({
        title: 'Salvo',
        description: 'As informacoes da escola foram atualizadas.',
      });
    } catch (error) {
      console.error('Error saving escola:', error);
      toast({
        title: 'Erro',
        description: 'Nao foi possivel salvar as informacoes da escola.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const adicionarSala = async () => {
    if (!escola?.id || !novaSala.trim()) return;

    try {
      const { data, error } = await supabase
        .from('salas_cursos')
        .insert({
          escola_id: escola.id,
          nome: novaSala.trim(),
          tipo: tipoNovaSala,
        })
        .select()
        .single();

      if (error) throw error;

      setSalas((prev) => [...prev, data].sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR')));
      setNovaSala('');
      setTipoNovaSala('sala');
      setDialogOpen(false);

      toast({
        title: 'Adicionado',
        description: `${tipoNovaSala === 'sala' ? 'Sala' : 'Curso'} adicionado com sucesso.`,
      });
    } catch (error) {
      console.error('Error adding sala:', error);
      toast({
        title: 'Erro',
        description: 'Nao foi possivel adicionar a sala ou curso.',
        variant: 'destructive',
      });
    }
  };

  const removerSala = async (id) => {
    try {
      const { error } = await supabase
        .from('salas_cursos')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setSalas((prev) => prev.filter((item) => item.id !== id));
      toast({
        title: 'Removido',
        description: 'Item removido com sucesso.',
      });
    } catch (error) {
      console.error('Error removing sala:', error);
      toast({
        title: 'Erro',
        description: 'Nao foi possivel remover o item.',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <MainLayout title="Configuracao da Escola">
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </MainLayout>
    );
  }

  return (
    <MainLayout title="Configuracao da Escola">
      <div className="space-y-6 max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <School className="w-5 h-5" />
              Informacoes da Escola
            </CardTitle>
            <CardDescription>
              O nome da escola atual e carregado automaticamente para edicao.
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
                disabled={!editingNome && Boolean(escola)}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              {escola && !editingNome ? (
                <Button type="button" variant="outline" onClick={() => setEditingNome(true)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Editar nome
                </Button>
              ) : (
                <Button onClick={salvarEscola} disabled={saving || !nomeEscola.trim()}>
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando...
                    </>
                  ) : (
                    'Salvar'
                  )}
                </Button>
              )}

              {escola && editingNome && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setNomeEscola(escola.nome || '');
                    setEditingNome(false);
                  }}
                >
                  Cancelar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="w-5 h-5" />
                Salas e Cursos
              </CardTitle>
              <CardDescription>
                As salas e cursos ja cadastrados da escola aparecem aqui automaticamente.
              </CardDescription>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button disabled={!escola?.id}>
                  <Plus className="w-4 h-4 mr-2" />
                  Adicionar
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Adicionar Sala ou Curso</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Tipo</Label>
                    <Select value={tipoNovaSala} onValueChange={setTipoNovaSala}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sala">Sala/Turma</SelectItem>
                        <SelectItem value="curso_tecnico">Curso Tecnico</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      value={novaSala}
                      onChange={(e) => setNovaSala(e.target.value)}
                      placeholder={tipoNovaSala === 'sala' ? 'Ex: 3 Ano A' : 'Ex: Tecnico em Informatica'}
                    />
                  </div>

                  <Button onClick={adicionarSala} className="w-full" disabled={!novaSala.trim()}>
                    Adicionar
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>

          <CardContent>
            {!escola ? (
              <p className="text-muted-foreground text-center py-8">
                Nenhuma escola vinculada foi encontrada para este gestor.
              </p>
            ) : salas.length === 0 ? (
              <div className="text-center py-8">
                <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Nenhuma sala ou curso cadastrado.</p>
                <p className="text-sm text-muted-foreground">Clique em adicionar para cadastrar novos itens.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {salas.map((sala) => (
                  <div key={sala.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      {sala.tipo === 'sala' ? (
                        <GraduationCap className="w-5 h-5 text-primary" />
                      ) : (
                        <BookOpen className="w-5 h-5 text-secondary" />
                      )}
                      <span className="font-medium">{sala.nome}</span>
                      <Badge variant="outline" className="text-xs">
                        {sala.tipo === 'sala' ? 'Sala' : 'Curso Tecnico'}
                      </Badge>
                    </div>

                    <Button variant="ghost" size="sm" onClick={() => removerSala(sala.id)}>
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
