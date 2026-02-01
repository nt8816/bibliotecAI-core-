import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { FileSpreadsheet, FileText, Download, Users, BookOpen, BookMarked, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type TipoRelatorio = 'usuarios' | 'livros' | 'emprestimos';

interface FiltrosRelatorio {
  incluirEmail: boolean;
  incluirMatricula: boolean;
  incluirTurma: boolean;
  incluirTelefone: boolean;
  apenasAtivos: boolean;
  apenasAtrasados: boolean;
}

export default function ExportarRelatorios() {
  const [tipoRelatorio, setTipoRelatorio] = useState<TipoRelatorio>('usuarios');
  const [formatoExport, setFormatoExport] = useState<'excel' | 'pdf'>('excel');
  const [loading, setLoading] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosRelatorio>({
    incluirEmail: true,
    incluirMatricula: true,
    incluirTurma: true,
    incluirTelefone: false,
    apenasAtivos: false,
    apenasAtrasados: false,
  });
  const { toast } = useToast();

  const exportarRelatorio = async () => {
    setLoading(true);

    try {
      let data: any[] = [];
      let headers: string[] = [];
      let fileName = '';

      switch (tipoRelatorio) {
        case 'usuarios':
          const { data: usuarios, error: usersError } = await supabase
            .from('usuarios_biblioteca')
            .select('*')
            .order('nome');

          if (usersError) throw usersError;

          headers = ['Nome'];
          if (filtros.incluirMatricula) headers.push('Matrícula');
          if (filtros.incluirEmail) headers.push('Email');
          if (filtros.incluirTurma) headers.push('Turma');
          if (filtros.incluirTelefone) headers.push('Telefone');
          headers.push('Tipo');

          data = (usuarios || []).map(u => {
            const row: any[] = [u.nome];
            if (filtros.incluirMatricula) row.push(u.matricula || '-');
            if (filtros.incluirEmail) row.push(u.email);
            if (filtros.incluirTurma) row.push(u.turma || '-');
            if (filtros.incluirTelefone) row.push(u.telefone || '-');
            row.push(u.tipo);
            return row;
          });
          fileName = 'relatorio_usuarios';
          break;

        case 'livros':
          const { data: livros, error: livrosError } = await supabase
            .from('livros')
            .select('*')
            .order('titulo');

          if (livrosError) throw livrosError;

          headers = ['Título', 'Autor', 'Área', 'Editora', 'Ano', 'Tombo', 'Disponível'];
          data = (livros || []).map(l => [
            l.titulo,
            l.autor,
            l.area,
            l.editora || '-',
            l.ano || '-',
            l.tombo || '-',
            l.disponivel ? 'Sim' : 'Não',
          ]);
          fileName = 'relatorio_livros';
          break;

        case 'emprestimos':
          let query = supabase
            .from('emprestimos')
            .select(`
              *,
              livros(titulo),
              usuarios_biblioteca(nome, matricula)
            `)
            .order('data_emprestimo', { ascending: false });

          if (filtros.apenasAtivos) {
            query = query.eq('status', 'ativo');
          }

          if (filtros.apenasAtrasados) {
            query = query
              .eq('status', 'ativo')
              .lt('data_devolucao_prevista', new Date().toISOString());
          }

          const { data: emprestimos, error: empError } = await query;

          if (empError) throw empError;

          headers = ['Usuário', 'Matrícula', 'Livro', 'Data Empréstimo', 'Data Prevista', 'Status'];
          data = (emprestimos || []).map((e: any) => [
            e.usuarios_biblioteca?.nome || '-',
            e.usuarios_biblioteca?.matricula || '-',
            e.livros?.titulo || '-',
            new Date(e.data_emprestimo).toLocaleDateString('pt-BR'),
            new Date(e.data_devolucao_prevista).toLocaleDateString('pt-BR'),
            e.status === 'ativo' 
              ? (new Date(e.data_devolucao_prevista) < new Date() ? 'Atrasado' : 'Ativo')
              : 'Devolvido',
          ]);
          fileName = 'relatorio_emprestimos';
          break;
      }

      if (formatoExport === 'excel') {
        exportToExcel(headers, data, fileName);
      } else {
        exportToPDF(headers, data, fileName);
      }

      toast({
        title: 'Relatório exportado!',
        description: `O arquivo ${fileName}.${formatoExport === 'excel' ? 'xlsx' : 'pdf'} foi baixado.`,
      });
    } catch (error) {
      console.error('Error exporting report:', error);
      toast({
        title: 'Erro na exportação',
        description: 'Não foi possível gerar o relatório.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = (headers: string[], data: any[][], fileName: string) => {
    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Relatório');
    
    // Auto-adjust column widths
    const colWidths = headers.map((h, i) => {
      const maxLength = Math.max(
        h.length,
        ...data.map(row => String(row[i] || '').length)
      );
      return { wch: maxLength + 2 };
    });
    ws['!cols'] = colWidths;

    XLSX.writeFile(wb, `${fileName}.xlsx`);
  };

  const exportToPDF = (headers: string[], data: any[][], fileName: string) => {
    const doc = new jsPDF();
    
    // Title
    doc.setFontSize(18);
    doc.text('BibliotecAI - Relatório', 14, 22);
    
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`, 14, 30);

    autoTable(doc, {
      head: [headers],
      body: data,
      startY: 40,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [88, 86, 214] },
    });

    doc.save(`${fileName}.pdf`);
  };

  const tiposRelatorio = [
    { value: 'usuarios', label: 'Usuários', icon: Users, description: 'Lista de todos os usuários cadastrados' },
    { value: 'livros', label: 'Livros', icon: BookOpen, description: 'Catálogo completo de livros' },
    { value: 'emprestimos', label: 'Empréstimos', icon: BookMarked, description: 'Histórico de empréstimos' },
  ];

  return (
    <MainLayout title="Exportar Relatórios">
      <div className="space-y-6 max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="w-5 h-5" />
              Gerar Relatório
            </CardTitle>
            <CardDescription>
              Exporte dados do sistema em formato Excel ou PDF
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Report Type Selection */}
            <div className="space-y-3">
              <Label>Tipo de Relatório</Label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {tiposRelatorio.map((tipo) => (
                  <button
                    key={tipo.value}
                    onClick={() => setTipoRelatorio(tipo.value as TipoRelatorio)}
                    className={`p-4 rounded-lg border-2 text-left transition-all ${
                      tipoRelatorio === tipo.value
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <tipo.icon className={`w-8 h-8 mb-2 ${
                      tipoRelatorio === tipo.value ? 'text-primary' : 'text-muted-foreground'
                    }`} />
                    <p className="font-semibold">{tipo.label}</p>
                    <p className="text-sm text-muted-foreground">{tipo.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Export Format */}
            <div className="space-y-3">
              <Label>Formato de Exportação</Label>
              <div className="flex gap-4">
                <button
                  onClick={() => setFormatoExport('excel')}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                    formatoExport === 'excel'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <FileSpreadsheet className={`w-8 h-8 ${
                    formatoExport === 'excel' ? 'text-primary' : 'text-muted-foreground'
                  }`} />
                  <div className="text-left">
                    <p className="font-semibold">Excel</p>
                    <p className="text-sm text-muted-foreground">.xlsx</p>
                  </div>
                </button>
                <button
                  onClick={() => setFormatoExport('pdf')}
                  className={`flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
                    formatoExport === 'pdf'
                      ? 'border-primary bg-primary/5'
                      : 'border-border hover:border-primary/50'
                  }`}
                >
                  <FileText className={`w-8 h-8 ${
                    formatoExport === 'pdf' ? 'text-primary' : 'text-muted-foreground'
                  }`} />
                  <div className="text-left">
                    <p className="font-semibold">PDF</p>
                    <p className="text-sm text-muted-foreground">.pdf</p>
                  </div>
                </button>
              </div>
            </div>

            {/* Filters based on report type */}
            {tipoRelatorio === 'usuarios' && (
              <div className="space-y-3">
                <Label>Colunas a incluir</Label>
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="incluirEmail"
                      checked={filtros.incluirEmail}
                      onCheckedChange={(c) => setFiltros({ ...filtros, incluirEmail: !!c })}
                    />
                    <label htmlFor="incluirEmail" className="text-sm">Email</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="incluirMatricula"
                      checked={filtros.incluirMatricula}
                      onCheckedChange={(c) => setFiltros({ ...filtros, incluirMatricula: !!c })}
                    />
                    <label htmlFor="incluirMatricula" className="text-sm">Matrícula</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="incluirTurma"
                      checked={filtros.incluirTurma}
                      onCheckedChange={(c) => setFiltros({ ...filtros, incluirTurma: !!c })}
                    />
                    <label htmlFor="incluirTurma" className="text-sm">Turma</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="incluirTelefone"
                      checked={filtros.incluirTelefone}
                      onCheckedChange={(c) => setFiltros({ ...filtros, incluirTelefone: !!c })}
                    />
                    <label htmlFor="incluirTelefone" className="text-sm">Telefone</label>
                  </div>
                </div>
              </div>
            )}

            {tipoRelatorio === 'emprestimos' && (
              <div className="space-y-3">
                <Label>Filtros</Label>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="apenasAtivos"
                      checked={filtros.apenasAtivos}
                      onCheckedChange={(c) => setFiltros({ ...filtros, apenasAtivos: !!c, apenasAtrasados: false })}
                    />
                    <label htmlFor="apenasAtivos" className="text-sm">Apenas empréstimos ativos</label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="apenasAtrasados"
                      checked={filtros.apenasAtrasados}
                      onCheckedChange={(c) => setFiltros({ ...filtros, apenasAtrasados: !!c, apenasAtivos: false })}
                    />
                    <label htmlFor="apenasAtrasados" className="text-sm">Apenas empréstimos atrasados</label>
                  </div>
                </div>
              </div>
            )}

            {/* Export Button */}
            <Button onClick={exportarRelatorio} disabled={loading} className="w-full" size="lg">
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Gerando relatório...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Exportar Relatório
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
