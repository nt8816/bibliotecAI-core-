import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Search, BookOpen } from 'lucide-react';

interface Livro {
  id: string;
  area: string;
  tombo: string | null;
  autor: string;
  titulo: string;
  vol: string | null;
  edicao: string | null;
  local: string | null;
  editora: string | null;
  ano: string | null;
  disponivel: boolean;
}

const emptyLivro: Omit<Livro, 'id'> = {
  area: '',
  tombo: '',
  autor: '',
  titulo: '',
  vol: '',
  edicao: '',
  local: '',
  editora: '',
  ano: '',
  disponivel: true,
};

export default function Livros() {
  const [livros, setLivros] = useState<Livro[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLivro, setEditingLivro] = useState<Livro | null>(null);
  const [formData, setFormData] = useState(emptyLivro);
  const [saving, setSaving] = useState(false);
  
  const { isGestor, isBibliotecaria } = useAuth();
  const { toast } = useToast();
  
  // Gestor ou Bibliotecária podem gerenciar livros
  const canManageBooks = isGestor || isBibliotecaria;

  useEffect(() => {
    fetchLivros();
  }, []);

  const fetchLivros = async () => {
    try {
      const { data, error } = await supabase
        .from('livros')
        .select('*')
        .order('titulo');

      if (error) throw error;
      setLivros(data || []);
    } catch (error) {
      console.error('Error fetching books:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar os livros.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (livro?: Livro) => {
    if (livro) {
      setEditingLivro(livro);
      setFormData({
        area: livro.area,
        tombo: livro.tombo || '',
        autor: livro.autor,
        titulo: livro.titulo,
        vol: livro.vol || '',
        edicao: livro.edicao || '',
        local: livro.local || '',
        editora: livro.editora || '',
        ano: livro.ano || '',
        disponivel: livro.disponivel,
      });
    } else {
      setEditingLivro(null);
      setFormData(emptyLivro);
    }
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.titulo.trim()) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'O título é obrigatório.',
      });
      return;
    }

    setSaving(true);
    try {
      if (editingLivro) {
        const { error } = await supabase
          .from('livros')
          .update(formData)
          .eq('id', editingLivro.id);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Livro atualizado com sucesso.' });
      } else {
        const { error } = await supabase
          .from('livros')
          .insert(formData);

        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Livro cadastrado com sucesso.' });
      }

      setIsDialogOpen(false);
      fetchLivros();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível salvar o livro.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este livro?')) return;

    try {
      const { error } = await supabase
        .from('livros')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Livro excluído com sucesso.' });
      fetchLivros();
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error.message || 'Não foi possível excluir o livro.',
      });
    }
  };

  const filteredLivros = livros.filter((livro) =>
    livro.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
    livro.autor.toLowerCase().includes(searchTerm.toLowerCase()) ||
    livro.tombo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <MainLayout title="Livros">
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <CardTitle className="flex items-center gap-2">
              <BookOpen className="w-5 h-5" />
              Gerenciamento de Livros
            </CardTitle>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar livros..."
                  className="pl-9"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              {canManageBooks && (
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
                        {editingLivro ? 'Editar Livro' : 'Novo Livro'}
                      </DialogTitle>
                    </DialogHeader>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="titulo">Título *</Label>
                        <Input
                          id="titulo"
                          value={formData.titulo}
                          onChange={(e) => setFormData({ ...formData, titulo: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="autor">Autor</Label>
                        <Input
                          id="autor"
                          value={formData.autor}
                          onChange={(e) => setFormData({ ...formData, autor: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="area">Área</Label>
                        <Input
                          id="area"
                          value={formData.area}
                          onChange={(e) => setFormData({ ...formData, area: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="tombo">Tombo</Label>
                        <Input
                          id="tombo"
                          value={formData.tombo || ''}
                          onChange={(e) => setFormData({ ...formData, tombo: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="editora">Editora</Label>
                        <Input
                          id="editora"
                          value={formData.editora || ''}
                          onChange={(e) => setFormData({ ...formData, editora: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="ano">Ano</Label>
                        <Input
                          id="ano"
                          value={formData.ano || ''}
                          onChange={(e) => setFormData({ ...formData, ano: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="edicao">Edição</Label>
                        <Input
                          id="edicao"
                          value={formData.edicao || ''}
                          onChange={(e) => setFormData({ ...formData, edicao: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="vol">Volume</Label>
                        <Input
                          id="vol"
                          value={formData.vol || ''}
                          onChange={(e) => setFormData({ ...formData, vol: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="local">Local</Label>
                        <Input
                          id="local"
                          value={formData.local || ''}
                          onChange={(e) => setFormData({ ...formData, local: e.target.value })}
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
          ) : filteredLivros.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {searchTerm ? 'Nenhum livro encontrado' : 'Nenhum livro cadastrado'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Título</TableHead>
                    <TableHead>Autor</TableHead>
                    <TableHead>Área</TableHead>
                    <TableHead>Tombo</TableHead>
                    <TableHead>Editora</TableHead>
                    <TableHead>Ano</TableHead>
                    <TableHead>Status</TableHead>
                    {canManageBooks && <TableHead className="text-right">Ações</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLivros.map((livro) => (
                    <TableRow key={livro.id}>
                      <TableCell className="font-medium">{livro.titulo}</TableCell>
                      <TableCell>{livro.autor}</TableCell>
                      <TableCell>{livro.area}</TableCell>
                      <TableCell>{livro.tombo}</TableCell>
                      <TableCell>{livro.editora}</TableCell>
                      <TableCell>{livro.ano}</TableCell>
                      <TableCell>
                        <Badge variant={livro.disponivel ? 'default' : 'secondary'}>
                          {livro.disponivel ? 'Disponível' : 'Emprestado'}
                        </Badge>
                      </TableCell>
                      {canManageBooks && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOpenDialog(livro)}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDelete(livro.id)}
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
