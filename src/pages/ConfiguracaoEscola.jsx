import { useCallback, useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { School, Plus, Trash2, GraduationCap, BookOpen, Loader2, Pencil } from 'lucide-react';
import {
  createSchoolRoom,
  deleteSchoolRoom,
  fetchSchoolConfiguration,
  renameSchoolRoom,
  saveSchoolConfiguration,
} from '@/services/schoolConfigService';

export default function ConfiguracaoEscola() {
  const [escola, setEscola] = useState(null);
  const [salas, setSalas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nomeEscola, setNomeEscola] = useState('');
  const [editingNome, setEditingNome] = useState(false);
  const [editingSala, setEditingSala] = useState(null);
  const [novoNomeSala, setNovoNomeSala] = useState('');
  const [savingSala, setSavingSala] = useState(false);
  const [novaSala, setNovaSala] = useState('');
  const [tipoNovaSala, setTipoNovaSala] = useState('sala');
  const [dialogOpen, setDialogOpen] = useState(false);

  const { toast } = useToast();

  const fetchEscola = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await fetchSchoolConfiguration();
      setEscola(payload.escola);
      setNomeEscola(payload.escola?.nome || '');
      setSalas(payload.salas);
      setEditingNome(false);
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
  }, [toast]);

  useEffect(() => {
    fetchEscola();
  }, [fetchEscola]);

  const salvarEscola = async () => {
    if (!nomeEscola.trim()) return;

    setSaving(true);
    try {
      const escolaAtualizada = await saveSchoolConfiguration(nomeEscola.trim());
      setEscola(escolaAtualizada);
      setNomeEscola(escolaAtualizada?.nome || '');
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
      const data = await createSchoolRoom({
        nome: novaSala.trim(),
        tipo: tipoNovaSala,
      });

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

  const removerSala = async (sala) => {
    try {
      await deleteSchoolRoom({
        salaId: sala?.orphan ? null : sala?.id,
        salaNome: sala?.nome,
      });

      setSalas((prev) => prev.filter((item) => item.id !== sala.id));
      toast({
        title: 'Removido',
        description: 'Sala removida com os usuarios e vinculos associados.',
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

  const abrirEditarSala = (sala) => {
    setEditingSala(sala);
    setNovoNomeSala(String(sala?.nome || ''));
  };

  const salvarEdicaoSala = async () => {
    const sala = editingSala;
    const nomeNovo = String(novoNomeSala || '').trim();
    if (!sala?.id || !nomeNovo) return;

    setSavingSala(true);
    try {
      await renameSchoolRoom(sala.id, nomeNovo);
      setEditingSala(null);
      setNovoNomeSala('');
      await fetchEscola();
      toast({
        title: 'Turma atualizada',
        description: 'O novo nome foi aplicado na sala e nos usuarios vinculados.',
      });
    } catch (error) {
      console.error('Error renaming sala:', error);
      toast({
        title: 'Erro',
        description: 'Nao foi possivel editar a turma.',
        variant: 'destructive',
      });
    } finally {
      setSavingSala(false);
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

            <Dialog
              open={Boolean(editingSala)}
              onOpenChange={(open) => {
                if (!open) {
                  setEditingSala(null);
                  setNovoNomeSala('');
                }
              }}
            >
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Editar turma</DialogTitle>
                </DialogHeader>

                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label htmlFor="editar-sala-nome">Nome da turma</Label>
                    <Input
                      id="editar-sala-nome"
                      value={novoNomeSala}
                      onChange={(e) => setNovoNomeSala(e.target.value)}
                      placeholder="Ex: 3 Ano A"
                    />
                  </div>

                  <p className="text-xs text-muted-foreground">
                    A alteracao atualiza a turma na lista e no cadastro dos usuarios vinculados.
                  </p>

                  <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingSala(null);
                        setNovoNomeSala('');
                      }}
                    >
                      Cancelar
                    </Button>
                    <Button onClick={salvarEdicaoSala} disabled={savingSala || !novoNomeSala.trim()}>
                      {savingSala ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Salvando...
                        </>
                      ) : (
                        'Salvar nome'
                      )}
                    </Button>
                  </div>
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

                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => abrirEditarSala(sala)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removerSala(sala)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
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
