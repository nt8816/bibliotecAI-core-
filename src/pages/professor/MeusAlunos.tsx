import { useEffect, useState } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Search, Users, GraduationCap } from 'lucide-react';
import { Database } from '@/integrations/supabase/types';

type AppRole = Database['public']['Enums']['app_role'];

interface Usuario {
  id: string;
  nome: string;
  tipo: AppRole;
  matricula: string | null;
  turma: string | null;
  email: string;
}

export default function MeusAlunos() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTurma, setFilterTurma] = useState('');
  
  const { toast } = useToast();

  useEffect(() => {
    fetchUsuarios();
  }, []);

  const fetchUsuarios = async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios_biblioteca')
        .select('id, nome, tipo, matricula, turma, email')
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

  const getTipoBadgeVariant = (tipo: AppRole) => {
    switch (tipo) {
      case 'gestor':
        return 'default';
      case 'professor':
        return 'secondary';
      case 'bibliotecaria':
        return 'outline';
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
      case 'bibliotecaria':
        return 'Bibliotecária';
      default:
        return 'Aluno';
    }
  };

  // Get unique turmas for filter
  const turmas = [...new Set(usuarios.filter(u => u.turma).map(u => u.turma!))].sort();

  const filteredUsuarios = usuarios.filter((usuario) => {
    const matchesSearch = usuario.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
      usuario.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      usuario.matricula?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTurma = !filterTurma || usuario.turma === filterTurma;
    
    return matchesSearch && matchesTurma;
  });

  // Count by type
  const alunosCount = usuarios.filter(u => u.tipo === 'aluno').length;
  const professoresCount = usuarios.filter(u => u.tipo === 'professor').length;

  return (
    <MainLayout title="Meus Alunos">
      <div className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total de Alunos</p>
                  <p className="text-2xl font-bold">{alunosCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-info/10 flex items-center justify-center">
                  <Users className="w-6 h-6 text-info" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Turmas</p>
                  <p className="text-2xl font-bold">{turmas.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-secondary/10 flex items-center justify-center">
                  <Users className="w-6 h-6 text-secondary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Professores</p>
                  <p className="text-2xl font-bold">{professoresCount}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Visualizar Usuários
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
                {turmas.length > 0 && (
                  <select
                    className="h-10 px-3 rounded-md border border-input bg-background text-sm"
                    value={filterTurma}
                    onChange={(e) => setFilterTurma(e.target.value)}
                  >
                    <option value="">Todas as turmas</option>
                    {turmas.map(turma => (
                      <option key={turma} value={turma}>{turma}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-muted-foreground py-8">Carregando...</p>
            ) : filteredUsuarios.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                {searchTerm || filterTurma ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}
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
                        <TableCell>{usuario.matricula || '-'}</TableCell>
                        <TableCell>{usuario.turma || '-'}</TableCell>
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
