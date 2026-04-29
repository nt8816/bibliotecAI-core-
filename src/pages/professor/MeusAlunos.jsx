import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, GraduationCap, Search, Users } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { fetchProfessorPainelData } from '@/services/professorService';

const isTempLoginEmail = (value) => /@temp\.bibliotecai\.com$/i.test(String(value || '').trim());
const getVisibleEmail = (nome, email) => (isTempLoginEmail(email) ? nome : (email || '-'));
const loadPdf = async () => {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  return { jsPDF, autoTable };
};

const loadImageDataUrl = (src) => new Promise((resolve, reject) => {
  const image = new Image();
  image.crossOrigin = 'anonymous';
  image.onload = () => {
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    context.drawImage(image, 0, 0);
    resolve(canvas.toDataURL('image/png'));
  };
  image.onerror = reject;
  image.src = src;
});

const sanitizeFilePart = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-zA-Z0-9_-]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase();

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
      const data = await fetchProfessorPainelData();
      setUsuarios(Array.isArray(data?.usuarios) ? data.usuarios : []);
      setTurmasPermitidas(Array.isArray(data?.turmasPermitidas) ? data.turmasPermitidas : []);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error?.message || 'Não foi possível carregar os alunos.',
      });
    } finally {
      setLoading(false);
    }
  }, [toast, user?.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const interval = window.setInterval(fetchData, 30000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [fetchData]);

  const turmas = useMemo(
    () => [...new Set([...turmasPermitidas, ...usuarios.filter((u) => u.turma).map((u) => u.turma)])].sort(),
    [turmasPermitidas, usuarios],
  );

  const filteredUsuarios = useMemo(
    () => usuarios.filter((usuario) => {
      const search = searchTerm.toLowerCase();
      const matchesSearch = String(usuario.nome || '').toLowerCase().includes(search)
        || String(usuario.email || '').toLowerCase().includes(search)
        || String(usuario.matricula || '').toLowerCase().includes(search);
      const matchesTurma = !filterTurma || usuario.turma === filterTurma;
      return matchesSearch && matchesTurma;
    }),
    [filterTurma, searchTerm, usuarios],
  );

  const handleExportAlunos = useCallback(async () => {
    if (filteredUsuarios.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Nenhum aluno para exportar',
        description: 'Selecione outra sala ou aguarde o carregamento da lista.',
      });
      return;
    }

    try {
      const { jsPDF, autoTable } = await loadPdf();
      const doc = new jsPDF();
      const logoDataUrl = await loadImageDataUrl('/app-logo.png');
      const salaLabel = filterTurma || 'Todas as salas';
      const fileSala = filterTurma ? `-${sanitizeFilePart(filterTurma)}` : '';

      doc.setGState(new doc.GState({ opacity: 0.16 }));
      doc.addImage(logoDataUrl, 'PNG', 12, 8, 28, 28);
      doc.setGState(new doc.GState({ opacity: 1 }));

      doc.setFontSize(16);
      doc.text('Alunos das minhas salas', 45, 18);
      doc.setFontSize(10);
      doc.text(`Sala: ${salaLabel}`, 45, 26);
      doc.text(`Total: ${filteredUsuarios.length}`, 45, 32);

      autoTable(doc, {
        head: [['Nome', 'Matricula']],
        body: filteredUsuarios.map((usuario) => [
          usuario.nome || '-',
          usuario.matricula || '-',
        ]),
        startY: 44,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [46, 125, 50] },
        didDrawPage: () => {
          doc.setGState(new doc.GState({ opacity: 0.16 }));
          doc.addImage(logoDataUrl, 'PNG', 12, 8, 28, 28);
          doc.setGState(new doc.GState({ opacity: 1 }));
        },
      });

      doc.save(`alunos${fileSala}.pdf`);

      toast({
        title: 'Exportacao concluida',
        description: `${filteredUsuarios.length} aluno${filteredUsuarios.length === 1 ? '' : 's'} exportado${filteredUsuarios.length === 1 ? '' : 's'} em PDF com nome e matricula.`,
      });
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível exportar o PDF dos alunos.',
      });
    }
  }, [filterTurma, filteredUsuarios, toast]);

  return (
    <MainLayout title="Meus Alunos">
      <div className="space-y-6">
        {turmasPermitidas.length === 0 && (
          <div className="rounded-md border border-warning/30 bg-warning/5 p-3">
            <p className="text-sm text-warning">Nenhuma turma foi vinculada ao seu perfil. Solicite ao gestor a vinculacao.</p>
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
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleExportAlunos}
                  disabled={loading || filteredUsuarios.length === 0}
                  className="w-full sm:w-auto"
                >
                  <Download className="w-4 h-4" />
                  Exportar PDF
                </Button>

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
                    <option value="">Todas as salas</option>
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
                {searchTerm || filterTurma ? 'Nenhum aluno encontrado' : 'Nenhum aluno disponivel nas turmas vinculadas'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Matricula</TableHead>
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

