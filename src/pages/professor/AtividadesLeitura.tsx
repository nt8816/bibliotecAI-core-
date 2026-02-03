import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { ClipboardList, Plus, Pencil, Trash2, CheckCircle, Clock, Star } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Livro {
  id: string;
  titulo: string;
  autor: string;
}

interface Usuario {
  id: string;
  nome: string;
  turma: string | null;
}

interface Atividade {
  id: string;
  titulo: string;
  descricao: string | null;
  status: string;
  pontos_extras: number | null;
  data_entrega: string | null;
  livro_id: string;
  aluno_id: string;
  professor_id: string;
  created_at: string;
  livros?: { titulo: string; autor: string };
  usuarios_biblioteca?: { nome: string; turma: string | null };
}

const emptyAtividade = {
  titulo: '',
  descricao: '',
  pontos_extras: 0,
  data_entrega: '',
  livro_id: '',
  aluno_id: '',
};

export default function AtividadesLeitura() {
  const [livros, setLivros] = useState<Livro[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [atividades, setAtividades] = useState<Atividade[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingAtividade, setEditingAtividade] = useState<Atividade | null>(null);
  const [formData, setFormData] = useState(emptyAtividade);
  const [filterStatus, setFilterStatus] = useState('');
  
  const { user } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const { data: livrosData } = await supabase
        .from('livros')
        .select('id, titulo, autor')
        .order('titulo');
      
      const { data: usuariosData } = await supabase
        .from('usuarios_biblioteca')
        .select('id, nome, turma')
        .eq('tipo', 'aluno')
        .order('nome');
      
      const { data: atividadesData } = await supabase
        .from('atividades_leitura')
        .select(`
          *,
          livros(titulo, autor),
          usuarios_biblioteca!atividades_leitura_aluno_id_fkey(nome, turma)
        `)
        .order('created_at', { ascending: false });

      setLivros(livrosData || []);
      setUsuarios(usuariosData || []);
      setAtividades(atividadesData || []);
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar os dados.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (atividade?: Atividade) => {
    if (atividade) {
      setEditingAtividade(atividade);
      setFormData({
        titulo: atividade.titulo,
        descricao: atividade.descricao || '',
        pontos_extras: atividade.pontos_extras || 0,
        data_entrega: atividade.data_entrega ? atividade.data_entrega.split('T')[0] : '',
        livro_id: atividade.livro_id,
        aluno_id: atividade.aluno_id,
      });
    } else {
      setEditingAtividade(null);
      setFormData(emptyAtividade);
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.titulo.trim() || !formData.aluno_id || !formData.livro_id) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Preencha todos os campos obrigatórios.',
      });
      return;
    }

    const { data: professorData } = await supabase
      .from('usuarios_biblioteca')
      .select('id')
      .eq('user_id', user?.id)
      .single();

    if (!professorData) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Perfil de professor não encontrado.',
      });
      return;
    }

    setSaving(true);
    try {
      const dataToSave = {
        titulo: formData.titulo,
        descricao: formData.descricao || null,
        pontos_extras: formData.pontos_extras || 0,
        data_entrega: formData.data_entrega ? new Date(formData.data_entrega).toISOString() : null,
        livro_id: formData.livro_id,
        aluno_id: formData.aluno_id,
        professor_id: professorData.id,
      };

      if (editingAtividade) {
        const { error } = await supabase
          .from('atividades_leitura')
          .update(dataToSave)
          .eq('id', editingAtividade.id);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Atividade atualizada!' });
      } else {
        const { error } = await supabase
          .from('atividades_leitura')
          .insert(dataToSave);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Atividade criada!' });
      }

      setIsDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível salvar a atividade.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('atividades_leitura')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Status atualizado!' });
      fetchData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível atualizar o status.',
      });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta atividade?')) return;

    try {
      const { error } = await supabase
        .from('atividades_leitura')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Atividade excluída.' });
      fetchData();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível excluir.',
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'concluido':
        return <Badge className="bg-success text-success-foreground">Concluído</Badge>;
      case 'em_andamento':
        return <Badge variant="secondary">Em Andamento</Badge>;
      default:
        return <Badge variant="outline">Pendente</Badge>;
    }
  };

  const filteredAtividades = filterStatus 
    ? atividades.filter(a => a.status === filterStatus)
    : atividades;

  // Stats
  const totalPontos = atividades.reduce((acc, a) => acc + (a.pontos_extras || 0), 0);
  const concluidas = atividades.filter(a => a.status === 'concluido').length;
  const pendentes = atividades.filter(a => a.status === 'pendente').length;

  return (
    <MainLayout title="Atividades de Leitura">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <ClipboardList className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total de Atividades</p>
                  <p className="text-2xl font-bold">{atividades.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-success/10 flex items-center justify-center">
                  <CheckCircle className="w-6 h-6 text-success" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Concluídas</p>
                  <p className="text-2xl font-bold">{concluidas}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-warning/10 flex items-center justify-center">
                  <Clock className="w-6 h-6 text-warning" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pendentes</p>
                  <p className="text-2xl font-bold">{pendentes}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <Star className="w-6 h-6 text-secondary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Pontos Distribuídos</p>
                  <p className="text-2xl font-bold">{totalPontos}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <ClipboardList className="w-5 h-5" />
                  Gerenciar Atividades
                </CardTitle>
                <CardDescription>
                  Crie atividades como resenhas, resumos e atribua pontos aos alunos
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Filtrar status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Todos</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                    <SelectItem value="em_andamento">Em Andamento</SelectItem>
                    <SelectItem value="concluido">Concluído</SelectItem>
                  </SelectContent>
                </Select>
                
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => handleOpenDialog()}>
                      <Plus className="w-4 h-4 mr-2" />
                      Nova Atividade
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg">
                    <DialogHeader>
                      <DialogTitle>
                        {editingAtividade ? 'Editar Atividade' : 'Nova Atividade'}
                      </DialogTitle>
                      <DialogDescription>
                        Crie uma atividade de leitura para um aluno
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Título da Atividade *</Label>
                        <Input
                          value={formData.titulo}
                          onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                          placeholder="Ex: Resenha do livro Dom Casmurro"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Descrição</Label>
                        <Textarea
                          value={formData.descricao}
                          onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                          placeholder="Instruções para o aluno..."
                          rows={3}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Aluno *</Label>
                          <Select 
                            value={formData.aluno_id} 
                            onValueChange={(v) => setFormData({ ...formData, aluno_id: v })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {usuarios.map(u => (
                                <SelectItem key={u.id} value={u.id}>
                                  {u.nome} {u.turma ? `(${u.turma})` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Livro *</Label>
                          <Select 
                            value={formData.livro_id} 
                            onValueChange={(v) => setFormData({ ...formData, livro_id: v })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              {livros.map(l => (
                                <SelectItem key={l.id} value={l.id}>
                                  {l.titulo}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Pontos Extras</Label>
                          <Input
                            type="number"
                            min="0"
                            value={formData.pontos_extras}
                            onChange={(e) => setFormData({ ...formData, pontos_extras: parseInt(e.target.value) || 0 })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Data de Entrega</Label>
                          <Input
                            type="date"
                            value={formData.data_entrega}
                            onChange={(e) => setFormData({ ...formData, data_entrega: e.target.value })}
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSave} disabled={saving}>
                        {saving ? 'Salvando...' : 'Salvar'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : filteredAtividades.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhuma atividade encontrada
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Atividade</TableHead>
                      <TableHead>Aluno</TableHead>
                      <TableHead>Turma</TableHead>
                      <TableHead>Livro</TableHead>
                      <TableHead>Pontos</TableHead>
                      <TableHead>Entrega</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAtividades.map((atividade) => (
                      <TableRow key={atividade.id}>
                        <TableCell className="font-medium">{atividade.titulo}</TableCell>
                        <TableCell>{atividade.usuarios_biblioteca?.nome || 'N/A'}</TableCell>
                        <TableCell>{atividade.usuarios_biblioteca?.turma || '-'}</TableCell>
                        <TableCell>{atividade.livros?.titulo || 'N/A'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="gap-1">
                            <Star className="w-3 h-3" />
                            {atividade.pontos_extras || 0}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {atividade.data_entrega 
                            ? format(new Date(atividade.data_entrega), "dd/MM/yyyy", { locale: ptBR })
                            : '-'}
                        </TableCell>
                        <TableCell>{getStatusBadge(atividade.status)}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            {atividade.status !== 'concluido' && (
                              <Button
                                variant="ghost"
                                size="icon"
                                title="Marcar como concluído"
                                onClick={() => handleUpdateStatus(atividade.id, 'concluido')}
                              >
                                <CheckCircle className="w-4 h-4 text-success" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(atividade)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(atividade.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
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
