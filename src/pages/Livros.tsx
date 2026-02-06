import { useEffect, useState } from 'react';
import { useCallback } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Search, BookOpen, Sparkles, Loader2, Info } from 'lucide-react';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

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
  sinopse: string | null;
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
  sinopse: '',
};

async function buscarSinopseOpenLibrary(titulo: string, autor: string): Promise<{ sinopse: string; autoData: Partial<typeof emptyLivro> } | null> {
  try {
    const query = encodeURIComponent(`${titulo} ${autor}`.trim());
    const res = await fetch(`https://openlibrary.org/search.json?q=${query}&limit=3&fields=key,title,author_name,first_publish_year,publisher,description,edition_count`);
    if (!res.ok) return null;

    const data = await res.json();
    if (!data.docs || data.docs.length === 0) return null;

    const book = data.docs[0];
    let sinopse = '';

    // Try to get description from work details
    if (book.key) {
      try {
        const workRes = await fetch(`https://openlibrary.org${book.key}.json`);
        if (workRes.ok) {
          const workData = await workRes.json();
          if (workData.description) {
            sinopse = typeof workData.description === 'string' ? workData.description : workData.description.value || '';
          }
        }
      } catch {
        // silently fail
      }
    }

    return {
      sinopse,
      autoData: {
        autor: book.author_name?.[0] || '',
        ano: book.first_publish_year?.toString() || '',
        editora: book.publisher?.[0] || '',
      },
    };
  } catch {
    return null;
  }
}

export default function Livros() {
  const [livros, setLivros] = useState<Livro[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLivro, setEditingLivro] = useState<Livro | null>(null);
  const [formData, setFormData] = useState(emptyLivro);
  const [saving, setSaving] = useState(false);
  const [buscandoSinopse, setBuscandoSinopse] = useState(false);
  const [sinopseExpandida, setSinopseExpandida] = useState<string | null>(null);

  const { isGestor, isBibliotecaria } = useAuth();
  const { toast } = useToast();

  const canManageBooks = isGestor || isBibliotecaria;

  useEffect(() => {
    fetchLivros();
  }, []);

  const handleRealtimeChange = useCallback(() => {
    fetchLivros();
  }, []);

  useRealtimeSubscription({
    table: 'livros',
    onChange: handleRealtimeChange,
  });

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
        sinopse: livro.sinopse || '',
      });
    } else {
      setEditingLivro(null);
      setFormData(emptyLivro);
    }
    setIsDialogOpen(true);
  };

  const handleBuscarSinopse = async () => {
    if (!formData.titulo.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'Digite o título do livro primeiro.' });
      return;
    }

    setBuscandoSinopse(true);
    try {
      const resultado = await buscarSinopseOpenLibrary(formData.titulo, formData.autor);

      if (resultado) {
        const updates: Partial<typeof emptyLivro> = {};

        if (resultado.sinopse) {
          updates.sinopse = resultado.sinopse;
        }
        // Only fill empty fields with auto data
        if (!formData.autor && resultado.autoData.autor) updates.autor = resultado.autoData.autor;
        if (!formData.ano && resultado.autoData.ano) updates.ano = resultado.autoData.ano;
        if (!formData.editora && resultado.autoData.editora) updates.editora = resultado.autoData.editora;

        if (Object.keys(updates).length > 0) {
          setFormData(prev => ({ ...prev, ...updates }));
          toast({
            title: 'Dados encontrados!',
            description: resultado.sinopse
              ? 'Sinopse e dados preenchidos automaticamente.'
              : 'Alguns dados foram preenchidos, mas a sinopse não foi encontrada. Você pode digitá-la manualmente.',
          });
        } else {
          toast({
            title: 'Sem resultados',
            description: 'Nenhuma informação adicional encontrada. Preencha a sinopse manualmente.',
          });
        }
      } else {
        toast({
          title: 'Não encontrado',
          description: 'Livro não encontrado na base. Preencha a sinopse manualmente.',
        });
      }
    } catch {
      toast({ variant: 'destructive', title: 'Erro', description: 'Falha na busca. Tente novamente.' });
    } finally {
      setBuscandoSinopse(false);
    }
  };

  const handleSave = async () => {
    if (!formData.titulo.trim()) {
      toast({ variant: 'destructive', title: 'Erro', description: 'O título é obrigatório.' });
      return;
    }

    setSaving(true);
    try {
      if (editingLivro) {
        const { error } = await supabase.from('livros').update(formData).eq('id', editingLivro.id);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Livro atualizado com sucesso.' });
      } else {
        const { error } = await supabase.from('livros').insert(formData);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Livro cadastrado com sucesso.' });
      }

      setIsDialogOpen(false);
      fetchLivros();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível salvar o livro.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este livro?')) return;

    try {
      const { error } = await supabase.from('livros').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Livro excluído com sucesso.' });
      fetchLivros();
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível excluir o livro.' });
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

                      {/* Sinopse section */}
                      <div className="space-y-2 md:col-span-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor="sinopse">Sinopse</Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={handleBuscarSinopse}
                            disabled={buscandoSinopse || !formData.titulo.trim()}
                            className="gap-1.5 text-xs"
                          >
                            {buscandoSinopse ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Sparkles className="w-3.5 h-3.5" />
                            )}
                            {buscandoSinopse ? 'Buscando...' : 'Buscar sinopse'}
                          </Button>
                        </div>
                        <Textarea
                          id="sinopse"
                          placeholder="Digite a sinopse do livro ou use o botão acima para buscar automaticamente..."
                          className="min-h-[120px] resize-y"
                          value={formData.sinopse || ''}
                          onChange={(e) => setFormData({ ...formData, sinopse: e.target.value })}
                        />
                        <p className="text-xs text-muted-foreground">
                          A busca usa a Open Library para encontrar sinopses automaticamente. Caso não encontre, preencha manualmente.
                        </p>
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
                    <TableHead>Sinopse</TableHead>
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
                      <TableCell className="max-w-[200px]">
                        {livro.sinopse ? (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  className="flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer"
                                  onClick={() => setSinopseExpandida(sinopseExpandida === livro.id ? null : livro.id)}
                                >
                                  <Info className="w-3.5 h-3.5" />
                                  Ver sinopse
                                </button>
                              </TooltipTrigger>
                              <TooltipContent side="left" className="max-w-xs">
                                <p className="text-xs">{livro.sinopse.slice(0, 200)}{livro.sinopse.length > 200 ? '...' : ''}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={livro.disponivel ? 'default' : 'secondary'}>
                          {livro.disponivel ? 'Disponível' : 'Emprestado'}
                        </Badge>
                      </TableCell>
                      {canManageBooks && (
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(livro)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleDelete(livro.id)}>
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

          {/* Sinopse expandida dialog */}
          {sinopseExpandida && (
            <Dialog open={!!sinopseExpandida} onOpenChange={() => setSinopseExpandida(null)}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Sinopse</DialogTitle>
                </DialogHeader>
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {livros.find(l => l.id === sinopseExpandida)?.sinopse || 'Sem sinopse.'}
                </p>
              </DialogContent>
            </Dialog>
          )}
        </CardContent>
      </Card>
    </MainLayout>
  );
}
