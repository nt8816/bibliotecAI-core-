import { useState, useRef } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Upload, FileSpreadsheet, FileText, AlertCircle, CheckCircle, Loader2, Download } from 'lucide-react';
import * as XLSX from 'xlsx';

interface UsuarioImport {
  nome: string;
  matricula: string;
  email?: string;
  turma?: string;
  status: 'pendente' | 'sucesso' | 'erro';
  mensagem?: string;
}

export default function ImportarUsuarios() {
  const [usuarios, setUsuarios] = useState<UsuarioImport[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [tipoUsuario, setTipoUsuario] = useState<'aluno' | 'professor'>('aluno');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { user } = useAuth();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setUsuarios([]);

    try {
      const fileType = file.name.split('.').pop()?.toLowerCase();

      if (fileType === 'xlsx' || fileType === 'xls' || fileType === 'csv') {
        await processExcelCSV(file);
      } else if (fileType === 'pdf') {
        toast({
          title: 'PDF detectado',
          description: 'A extração de dados de PDF requer processamento manual. Por favor, use Excel ou CSV.',
          variant: 'destructive',
        });
      } else {
        toast({
          title: 'Formato não suportado',
          description: 'Por favor, use arquivos Excel (.xlsx, .xls), CSV ou PDF.',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        title: 'Erro ao processar arquivo',
        description: 'Verifique o formato do arquivo e tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const processExcelCSV = async (file: File) => {
    const data = await file.arrayBuffer();
    const workbook = XLSX.read(data);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

    if (jsonData.length < 2) {
      toast({
        title: 'Arquivo vazio',
        description: 'O arquivo não contém dados para importar.',
        variant: 'destructive',
      });
      return;
    }

    // Find column indices
    const headers = jsonData[0].map((h: any) => String(h).toLowerCase().trim());
    const nomeIdx = headers.findIndex((h: string) => h.includes('nome'));
    const matriculaIdx = headers.findIndex((h: string) => h.includes('matricula') || h.includes('matrícula'));
    const emailIdx = headers.findIndex((h: string) => h.includes('email') || h.includes('e-mail'));
    const turmaIdx = headers.findIndex((h: string) => h.includes('turma') || h.includes('sala') || h.includes('curso'));

    if (nomeIdx === -1 || matriculaIdx === -1) {
      toast({
        title: 'Colunas obrigatórias não encontradas',
        description: 'O arquivo deve conter colunas "Nome" e "Matrícula".',
        variant: 'destructive',
      });
      return;
    }

    const importedUsers: UsuarioImport[] = [];
    for (let i = 1; i < jsonData.length; i++) {
      const row = jsonData[i];
      if (!row[nomeIdx] || !row[matriculaIdx]) continue;

      importedUsers.push({
        nome: String(row[nomeIdx]).trim(),
        matricula: String(row[matriculaIdx]).trim(),
        email: emailIdx >= 0 && row[emailIdx] ? String(row[emailIdx]).trim() : undefined,
        turma: turmaIdx >= 0 && row[turmaIdx] ? String(row[turmaIdx]).trim() : undefined,
        status: 'pendente',
      });
    }

    setUsuarios(importedUsers);
    toast({
      title: 'Arquivo processado',
      description: `${importedUsers.length} usuários encontrados.`,
    });
  };

  const importarUsuarios = async () => {
    if (!user || usuarios.length === 0) return;

    setImporting(true);

    try {
      // Get escola_id for current gestor
      const { data: escola } = await supabase
        .from('escolas')
        .select('id')
        .eq('gestor_id', user.id)
        .maybeSingle();

      const updatedUsers = [...usuarios];

      for (let i = 0; i < updatedUsers.length; i++) {
        const usuario = updatedUsers[i];
        
        try {
          // Generate email if not provided
          const email = usuario.email || `${usuario.matricula}@temp.bibliotecai.com`;

          const { error } = await supabase
            .from('usuarios_biblioteca')
            .insert({
              nome: usuario.nome,
              matricula: usuario.matricula,
              email: email,
              turma: usuario.turma,
              tipo: tipoUsuario,
              escola_id: escola?.id,
            });

          if (error) {
            if (error.code === '23505') {
              updatedUsers[i] = { ...usuario, status: 'erro', mensagem: 'Usuário já existe' };
            } else {
              throw error;
            }
          } else {
            updatedUsers[i] = { ...usuario, status: 'sucesso' };
          }
        } catch (error: any) {
          updatedUsers[i] = { ...usuario, status: 'erro', mensagem: error.message };
        }

        setUsuarios([...updatedUsers]);
      }

      const successCount = updatedUsers.filter(u => u.status === 'sucesso').length;
      toast({
        title: 'Importação concluída',
        description: `${successCount} de ${updatedUsers.length} usuários importados com sucesso.`,
      });
    } catch (error) {
      console.error('Error importing users:', error);
      toast({
        title: 'Erro na importação',
        description: 'Ocorreu um erro durante a importação.',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  };

  const baixarModelo = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Nome', 'Matrícula', 'Email', 'Turma'],
      ['João Silva', '2024001', 'joao@email.com', '3º Ano A'],
      ['Maria Santos', '2024002', 'maria@email.com', '3º Ano B'],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usuários');
    XLSX.writeFile(wb, 'modelo_importacao_usuarios.xlsx');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'sucesso':
        return <Badge className="bg-success"><CheckCircle className="w-3 h-3 mr-1" />Sucesso</Badge>;
      case 'erro':
        return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Erro</Badge>;
      default:
        return <Badge variant="secondary">Pendente</Badge>;
    }
  };

  return (
    <MainLayout title="Importar Usuários em Massa">
      <div className="space-y-6 max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              Importar Usuários
            </CardTitle>
            <CardDescription>
              Importe usuários em massa usando arquivos Excel (.xlsx), CSV ou PDF contendo nome e matrícula
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Download Template */}
            <Alert>
              <FileSpreadsheet className="w-4 h-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>Baixe o modelo de planilha para preencher os dados corretamente.</span>
                <Button variant="outline" size="sm" onClick={baixarModelo}>
                  <Download className="w-4 h-4 mr-2" />
                  Baixar Modelo
                </Button>
              </AlertDescription>
            </Alert>

            {/* User Type Selection */}
            <div className="space-y-2">
              <Label>Tipo de Usuário</Label>
              <Select value={tipoUsuario} onValueChange={(v) => setTipoUsuario(v as 'aluno' | 'professor')}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="aluno">Alunos</SelectItem>
                  <SelectItem value="professor">Professores</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* File Upload */}
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="space-y-4">
                <div className="flex justify-center gap-4">
                  <FileSpreadsheet className="w-12 h-12 text-muted-foreground" />
                  <FileText className="w-12 h-12 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-lg font-medium">Arraste um arquivo ou clique para selecionar</p>
                  <p className="text-sm text-muted-foreground">
                    Formatos aceitos: Excel (.xlsx, .xls), CSV, PDF
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Selecionar Arquivo
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Preview Table */}
            {usuarios.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">
                    {usuarios.length} usuários encontrados
                  </h3>
                  <Button onClick={importarUsuarios} disabled={importing}>
                    {importing ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4 mr-2" />
                        Importar Todos
                      </>
                    )}
                  </Button>
                </div>
                
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nome</TableHead>
                        <TableHead>Matrícula</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Turma</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {usuarios.slice(0, 50).map((usuario, idx) => (
                        <TableRow key={idx}>
                          <TableCell className="font-medium">{usuario.nome}</TableCell>
                          <TableCell>{usuario.matricula}</TableCell>
                          <TableCell>{usuario.email || '-'}</TableCell>
                          <TableCell>{usuario.turma || '-'}</TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              {getStatusBadge(usuario.status)}
                              {usuario.mensagem && (
                                <span className="text-xs text-destructive">{usuario.mensagem}</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  {usuarios.length > 50 && (
                    <div className="p-4 text-center text-sm text-muted-foreground border-t">
                      Mostrando 50 de {usuarios.length} usuários
                    </div>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
