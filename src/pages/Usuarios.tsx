import { useEffect, useState } from 'react';
import { useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Search, Users } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

type AppRole = Database['public']['Enums']['app_role'];

interface Usuario {
  id: string;
  nome: string;
  tipo: AppRole;
  matricula: string | null;
  cpf: string | null;
  turma: string | null;
  telefone: string | null;
  email: string;
}

const emptyUsuario = {
  nome: '',
  tipo: 'aluno' as AppRole,
  matricula: '',
  cpf: '',
  turma: '',
  telefone: '',
  email: '',
};

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUsuario, setEditingUsuario] = useState<Usuario | null>(null);
  const [formData, setFormData] = useState(emptyUsuario);
  const [saving, setSaving] = useState(false);
  
  const { isGestor } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    fetchUsuarios();
  }, []);

  // Realtime subscription para sincronização automática
  const handleRealtimeChange = useCallback(() => {
    fetchUsuarios();
  }, []);

  useRealtimeSubscription({
    table: 'usuarios_biblioteca',
    onChange: handleRealtimeChange,
  });

  const fetchUsuarios = async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios_biblioteca')
        .select('*')
        .order('nome');

      if (error) throw error;
      setUsuarios(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar os usuários.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (usuario?: Usuario) => {
    if (usuario) {
      setEditingUsuario(usuario);
      setFormData({
        nome: usuario.nome,
        tipo: usuario.tipo,
        matricula: usuario.matricula || '',
        cpf: usuario.cpf || '',
        turma: usuario.turma || '',
        telefone: usuario.telefone || '',
        email: usuario.email,
      });
    } else {
      setEditingUsuario(null);
      setFormData(emptyUsuario);
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.nome.trim() || !formData.email.trim()) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Nome e email são obrigatórios.',
      });
      return;
    }

    setSaving(true);
    try {
      if (editingUsuario) {
        const { error } = await supabase
          .from('usuarios_biblioteca')
          .update(formData)
          .eq('id', editingUsuario.id);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Usuário atualizado com sucesso.' });
      } else {
        const { error } = await supabase
          .from('usuarios_biblioteca')
          .insert(formData);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Usuário cadastrado com sucesso.' });
      }

      setIsDialogOpen(false);
      fetchUsuarios();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível salvar o usuário.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;

    try {
      const { error } = await supabase
        .from('usuarios_biblioteca')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Usuário excluído com sucesso.' });
      fetchUsuarios();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível excluir o usuário.',
      });
    }
  };

  const getTipoBadgeVariant = (tipo: AppRole) => {
    switch (tipo) {
      case 'gestor':
        return 'default';
      case 'professor':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  const getTipoLabel = (tipo: AppRole) => {
    switch (tipo) {
      case 'gestor':
        return 'Gestor';
      case 'professor':
        return 'Professor';
      default:
        return 'Aluno';
    }
  };

  const filteredUsuarios = usuarios.filter((usuario) =>
    usuario.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    usuario.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    usuario.matricula?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <MainLayout title="Usuários">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-5 h-5" />
              Gerenciamento de Usuários
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar usuários..."
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {isGestor && (
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                  <DialogTrigger asChild>
                    <Button onClick={() => handleOpenDialog()}>
                      <Plus className="w-4 h-4 mr-2" />
                      Adicionar
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>
                        {editingUsuario ? 'Editar Usuário' : 'Novo Usuário'}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="nome">Nome *</Label>
                        <Input
                          id="nome"
                          value={formData.nome}
                          onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email *</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tipo">Tipo</Label>
                        <Select
                          value={formData.tipo}
                          onValueChange={(value: AppRole) => setFormData({ ...formData, tipo: value })}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="aluno">Aluno</SelectItem>
                            <SelectItem value="professor">Professor</SelectItem>
                            <SelectItem value="gestor">Gestor</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="matricula">Matrícula</Label>
                        <Input
                          id="matricula"
                          value={formData.matricula}
                          onChange={(e) => setFormData({ ...formData, matricula: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="cpf">CPF</Label>
                        <Input
                          id="cpf"
                          value={formData.cpf}
                          onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="turma">Turma</Label>
                        <Input
                          id="turma"
                          value={formData.turma}
                          onChange={(e) => setFormData({ ...formData, turma: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="telefone">Telefone</Label>
                        <Input
                          id="telefone"
                          value={formData.telefone}
                          onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                        />
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
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-center text-muted-foreground py-8">Carregando...</p>
          ) : filteredUsuarios.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchTerm ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Matrícula</TableHead>
                    <TableHead>Turma</TableHead>
                    <TableHead>Telefone</TableHead>
                    {isGestor && <TableHead className="text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsuarios.map((usuario) => (
                    <TableRow key={usuario.id}>
                      <TableCell className="font-medium">{usuario.nome}</TableCell>
                      <TableCell>{usuario.email}</TableCell>
                      <TableCell>
                        <Badge variant={getTipoBadgeVariant(usuario.tipo)}>
                          {getTipoLabel(usuario.tipo)}
                        </Badge>
                      </TableCell>
                      <TableCell>{usuario.matricula}</TableCell>
                      <TableCell>{usuario.turma}</TableCell>
                      <TableCell>{usuario.telefone}</TableCell>
                      {isGestor && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(usuario)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(usuario.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
