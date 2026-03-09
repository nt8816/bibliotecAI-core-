import { useEffect, useState, useCallback, useMemo } from 'react';
import { Search, Users, GraduationCap } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useAuth } from '@/hooks/useAuth';

const isTempLoginEmail = (value) => /@temp\.bibliotecai\.com$/i.test(String(value || '').trim());
const getVisibleEmail = (nome, email) => (isTempLoginEmail(email) ? nome : (email || '-'));

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function isMissingTableError(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return (
    error?.code === '42P01'
    || error?.code === 'PGRST205'
    || message.includes('could not find the table')
    || message.includes('does not exist')
  );
}

export default function MeusAlunos() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTurma, setFilterTurma] = useState('');
  const [turmasPermitidas, setTurmasPermitidas] = useState([]);

  const fetchData = useCallback(async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      const { data: professorData, error: professorError } = await supabase
        .from('usuarios_biblioteca')
        .select('id')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (professorError || !professorData) throw professorError || new Error('Perfil de professor não encontrado.');

      const { data: turmasData, error: turmasError } = await supabase
        .from('professor_turmas')
        .select('turma')
        .eq('professor_id', professorData.id);
      if (turmasError) {
        if (isMissingTableError(turmasError)) {
          throw new Error('Tabela professor_turmas não encontrada. Aplique as migrations do Supabase.');
        }
        throw turmasError;
      }

      const turmas = [...new Set(ensureArray(turmasData).map((item) => String(item?.turma || '').trim()).filter(Boolean))].sort();
      setTurmasPermitidas(turmas);

      if (turmas.length === 0) {
        setUsuarios([]);
        return;
      }

      const { data, error } = await supabase
        .from('usuarios_biblioteca')
        .select('id, nome, tipo, matricula, turma, email')
        .eq('tipo', 'aluno')
        .in('turma', turmas)
        .order('nome');

      if (error) throw error;
      setUsuarios(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error?.message || 'Não foi possível carregar os usuários.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRealtimeChange = useCallback(() => {
    fetchData();
  }, [fetchData]);

  useRealtimeSubscription({ table: 'usuarios_biblioteca', onChange: handleRealtimeChange });
  useRealtimeSubscription({ table: 'professor_turmas', onChange: handleRealtimeChange });

  const turmas = useMemo(
    () => [...new Set([...turmasPermitidas, ...usuarios.filter((u) => u.turma).map((u) => u.turma)])].sort(),
    [turmasPermitidas, usuarios],
  );

  const filteredUsuarios = usuarios.filter((usuario) => {
    const matchesSearch = usuario.nome.toLowerCase().includes(searchTerm.toLowerCase())
      || String(usuario.email || '').toLowerCase().includes(searchTerm.toLowerCase())
      || String(usuario.matricula || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTurma = !filterTurma || usuario.turma === filterTurma;
    return matchesSearch && matchesTurma;
  });

  return (
    <MainLayout title="Meus Alunos">
      <div className="space-y-6">
        {turmasPermitidas.length === 0 && (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
            <p className="text-sm text-warning">Nenhuma turma foi vinculada ao seu perfil. Solicite ao gestor a vinculação.</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <GraduationCap className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total de Alunos</p>
                  <p className="text-2xl font-bold">{usuarios.length}</p>
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
                  <p className="text-sm text-muted-foreground">Turmas vinculadas</p>
                  <p className="text-2xl font-bold">{turmasPermitidas.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Alunos das minhas turmas
              </CardTitle>

              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    placeholder="Buscar alunos..."
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
                    {turmas.map((turma) => (
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
                {searchTerm || filterTurma ? 'Nenhum aluno encontrado' : 'Nenhum aluno disponível nas turmas vinculadas'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Matrícula</TableHead>
                      <TableHead>Turma</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsuarios.map((usuario) => (
                      <TableRow key={usuario.id}>
                        <TableCell className="font-medium">{usuario.nome}</TableCell>
                        <TableCell>{getVisibleEmail(usuario.nome, usuario.email)}</TableCell>
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
