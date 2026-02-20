import { Fragment, useEffect, useRef, useState, useCallback } from 'react';
import { Plus, Pencil, Trash2, Search, Users, Upload, FileSpreadsheet, AlertCircle, CheckCircle, Loader2, Download } from 'lucide-react';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const emptyUsuario = {
  nome: '',
  tipo: 'aluno',
  matricula: '',
  cpf: '',
  turma: '',
  telefone: '',
  email: '',
};

export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingUsuario, setEditingUsuario] = useState(null);
  const [formData, setFormData] = useState(emptyUsuario);
  const [saving, setSaving] = useState(false);

  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importUsuarios, setImportUsuarios] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [tipoUsuarioImport, setTipoUsuarioImport] = useState('aluno');
  const fileInputRef = useRef(null);

  const { isGestor, isBibliotecaria, user } = useAuth();
  const { toast } = useToast();

  const canManageUsers = isGestor || isBibliotecaria;

  const fetchUsuarios = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('usuarios_biblioteca').select('*').order('nome');
      if (error) throw error;
      setUsuarios(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível carregar os usuários.' });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  const handleRealtimeChange = useCallback(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  useRealtimeSubscription({ table: 'usuarios_biblioteca', onChange: handleRealtimeChange });

  const handleOpenDialog = (usuario) => {
    if (usuario && isBibliotecaria && !isGestor && usuario.tipo === 'gestor') {
      toast({
        variant: 'destructive',
        title: 'Sem permissão',
        description: 'Você não pode editar informações do gestor.',
      });
      return;
    }

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
      toast({ variant: 'destructive', title: 'Erro', description: 'Nome e email são obrigatórios.' });
      return;
    }

    setSaving(true);
    try {
      if (editingUsuario) {
        const { error } = await supabase.from('usuarios_biblioteca').update(formData).eq('id', editingUsuario.id);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Usuário atualizado com sucesso.' });
      } else {
        const { error } = await supabase.from('usuarios_biblioteca').insert(formData);
        if (error) throw error;
        toast({ title: 'Sucesso', description: 'Usuário cadastrado com sucesso.' });
      }

      setIsDialogOpen(false);
      fetchUsuarios();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível salvar o usuário.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Tem certeza que deseja excluir este usuário?')) return;

    try {
      const { error } = await supabase.from('usuarios_biblioteca').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Sucesso', description: 'Usuário excluído com sucesso.' });
      fetchUsuarios();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Erro', description: error.message || 'Não foi possível excluir o usuário.' });
    }
  };

  const handleExportarUsuariosExcel = () => {
    const headers = ['Nome', 'Email', 'Tipo', 'Matrícula', 'CPF', 'Turma', 'Telefone'];
    const data = filteredUsuarios.map((u) => [
      u.nome,
      u.email,
      getTipoLabel(u.tipo),
      u.matricula || '-',
      u.cpf || '-',
      u.turma || '-',
      u.telefone || '-',
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Usuários');
    XLSX.writeFile(wb, 'usuarios.xlsx');

    toast({ title: 'Exportado!', description: 'Arquivo usuarios.xlsx baixado.' });
  };

  const handleExportarUsuariosPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('BibliotecAI - Usuários', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Total: ${filteredUsuarios.length} | Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 30);

    const headers = ['Nome', 'Email', 'Tipo', 'Matrícula', 'Turma', 'Telefone'];
    const data = filteredUsuarios.map((u) => [u.nome, u.email, getTipoLabel(u.tipo), u.matricula || '-', u.turma || '-', u.telefone || '-']);

    autoTable(doc, { head: [headers], body: data, startY: 40, styles: { fontSize: 8 }, headStyles: { fillColor: [46, 125, 50] } });
    doc.save('usuarios.pdf');

    toast({ title: 'Exportado!', description: 'Arquivo usuarios.pdf baixado.' });
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportLoading(true);
    setImportUsuarios([]);

    try {
      const fileType = file.name.split('.').pop()?.toLowerCase();
      if (!['xlsx', 'xls', 'csv'].includes(fileType || '')) {
        toast({ title: 'Formato não suportado', description: 'Use Excel (.xlsx, .xls) ou CSV.', variant: 'destructive' });
        return;
      }

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

      if (jsonData.length < 2) {
        toast({ title: 'Arquivo vazio', description: 'O arquivo não contém dados.', variant: 'destructive' });
        return;
      }

      const headers = jsonData[0].map((h) => String(h).toLowerCase().trim());
      const nomeIdx = headers.findIndex((h) => h.includes('nome'));
      const matriculaIdx = headers.findIndex((h) => h.includes('matricula') || h.includes('matrícula'));
      const emailIdx = headers.findIndex((h) => h.includes('email') || h.includes('e-mail'));
      const turmaIdx = headers.findIndex((h) => h.includes('turma') || h.includes('sala') || h.includes('curso'));

      if (nomeIdx === -1 || matriculaIdx === -1) {
        toast({ title: 'Colunas obrigatórias não encontradas', description: 'O arquivo deve conter "Nome" e "Matrícula".', variant: 'destructive' });
        return;
      }

      const imported = [];
      for (let i = 1; i < jsonData.length; i += 1) {
        const row = jsonData[i];
        if (!row[nomeIdx] || !row[matriculaIdx]) continue;

        imported.push({
          nome: String(row[nomeIdx]).trim(),
          matricula: String(row[matriculaIdx]).trim(),
          email: emailIdx >= 0 && row[emailIdx] ? String(row[emailIdx]).trim() : undefined,
          turma: turmaIdx >= 0 && row[turmaIdx] ? String(row[turmaIdx]).trim() : undefined,
          status: 'pendente',
        });
      }

      setImportUsuarios(imported);
      toast({ title: 'Arquivo processado', description: `${imported.length} usuários encontrados.` });
    } catch {
      toast({ title: 'Erro ao processar', description: 'Verifique o formato do arquivo.', variant: 'destructive' });
    } finally {
      setImportLoading(false);
    }
  };

  const importarUsuarios = async () => {
    if (!user || importUsuarios.length === 0) return;

    setImporting(true);

    try {
      const { data: escola } = await supabase.from('escolas').select('id').eq('gestor_id', user.id).maybeSingle();

      const updated = [...importUsuarios];

      for (let i = 0; i < updated.length; i += 1) {
        const u = updated[i];

        try {
          const email = u.email || `${u.matricula}@temp.bibliotecai.com`;
          const { error } = await supabase.from('usuarios_biblioteca').insert({
            nome: u.nome,
            matricula: u.matricula,
            email,
            turma: u.turma,
            tipo: tipoUsuarioImport,
            escola_id: escola?.id,
          });

          if (error) {
            updated[i] = { ...u, status: 'erro', mensagem: error.code === '23505' ? 'Já existe' : error.message };
          } else {
            updated[i] = { ...u, status: 'sucesso' };
          }
        } catch (err) {
          updated[i] = { ...u, status: 'erro', mensagem: err.message };
        }

        setImportUsuarios([...updated]);
      }

      const successCount = updated.filter((u) => u.status === 'sucesso').length;
      toast({ title: 'Importação concluída', description: `${successCount} de ${updated.length} importados.` });
      fetchUsuarios();
    } catch {
      toast({ title: 'Erro na importação', variant: 'destructive' });
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

  const getTipoBadgeVariant = (tipo) => {
    if (tipo === 'gestor') return 'default';
    if (tipo === 'professor') return 'secondary';
    if (tipo === 'bibliotecaria') return 'secondary';
    return 'outline';
  };

  const getTipoLabel = (tipo) => {
    if (tipo === 'gestor') return 'Gestor';
    if (tipo === 'professor') return 'Professor';
    if (tipo === 'bibliotecaria') return 'Bibliotecária';
    return 'Aluno';
  };

  const getImportStatusBadge = (status) => {
    if (status === 'sucesso') return <Badge className="bg-success"><CheckCircle className="w-3 h-3 mr-1" />Sucesso</Badge>;
    if (status === 'erro') return <Badge variant="destructive"><AlertCircle className="w-3 h-3 mr-1" />Erro</Badge>;
    return <Badge variant="secondary">Pendente</Badge>;
  };

  const filteredUsuarios = usuarios.filter((usuario) =>
    usuario.nome.toLowerCase().includes(searchTerm.toLowerCase())
    || usuario.email.toLowerCase().includes(searchTerm.toLowerCase())
    || (usuario.matricula || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <MainLayout title="Usuários">
      <div className="space-y-6">
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
                  <Input placeholder="Buscar usuários..." className="pl-9" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>

                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm">
                      <Download className="w-4 h-4 mr-2" />
                      Exportar dados
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-40 p-2" align="end">
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleExportarUsuariosExcel}>Excel (.xlsx)</Button>
                    <Button variant="ghost" size="sm" className="w-full justify-start" onClick={handleExportarUsuariosPDF}>PDF (.pdf)</Button>
                  </PopoverContent>
                </Popover>

                {canManageUsers && (
                  <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline">
                        <Upload className="w-4 h-4 mr-2" />
                        Importar em Massa
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Importar Usuários em Massa</DialogTitle>
                        <DialogDescription>
                          Envie uma planilha para cadastrar vários usuários de uma vez.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-6 py-2">
                        <Alert>
                          <FileSpreadsheet className="w-4 h-4" />
                          <AlertDescription className="flex items-center justify-between">
                            <span>Baixe o modelo de planilha para preencher os dados.</span>
                            <Button variant="outline" size="sm" onClick={baixarModelo}>
                              <Download className="w-4 h-4 mr-2" />
                              Baixar Modelo
                            </Button>
                          </AlertDescription>
                        </Alert>

                        <div className="flex flex-col sm:flex-row gap-4 items-start">
                          <div className="space-y-2">
                            <Label>Tipo de Usuário</Label>
                            <select
                              value={tipoUsuarioImport}
                              onChange={(e) => setTipoUsuarioImport(e.target.value)}
                              className="h-10 w-[200px] rounded-md border border-input bg-background px-3 text-sm"
                            >
                              <option value="aluno">Alunos</option>
                              <option value="professor">Professores</option>
                            </select>
                          </div>

                          <div className="flex-1">
                            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" />
                            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={importLoading}>
                              {importLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Processando...</> : <><Upload className="w-4 h-4 mr-2" />Selecionar Arquivo</>}
                            </Button>
                          </div>
                        </div>

                        {importUsuarios.length > 0 && (
                          <div className="space-y-4">
                            <Alert className="border-primary bg-primary/10">
                              <CheckCircle className="w-4 h-4 text-primary" />
                              <AlertDescription className="flex items-center justify-between">
                                <span className="font-medium">{importUsuarios.length} usuários encontrados.</span>
                                <Button onClick={importarUsuarios} disabled={importing} size="sm" className="ml-4">
                                  {importing ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importando...</> : <><Upload className="w-4 h-4 mr-2" />Importar Todos</>}
                                </Button>
                              </AlertDescription>
                            </Alert>

                            <div className="border rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
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
                                  {importUsuarios.slice(0, 50).map((u, idx) => (
                                    <TableRow key={`${u.matricula}-${idx}`}>
                                      <TableCell className="font-medium">{u.nome}</TableCell>
                                      <TableCell>{u.matricula}</TableCell>
                                      <TableCell>{u.email || '-'}</TableCell>
                                      <TableCell>{u.turma || '-'}</TableCell>
                                      <TableCell>
                                        <div className="flex flex-col gap-1">
                                          {getImportStatusBadge(u.status)}
                                          {u.mensagem && <span className="text-xs text-destructive">{u.mensagem}</span>}
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                              {importUsuarios.length > 50 && <div className="p-3 text-center text-sm text-muted-foreground border-t">Mostrando 50 de {importUsuarios.length}</div>}
                            </div>
                          </div>
                        )}
                      </div>
                    </DialogContent>
                  </Dialog>
                )}

                {canManageUsers && (
                  <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogTrigger asChild>
                      <Button onClick={() => handleOpenDialog()}>
                        <Plus className="w-4 h-4 mr-2" />
                        Adicionar
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{editingUsuario ? 'Editar Usuário' : 'Novo Usuário'}</DialogTitle>
                        <DialogDescription>
                          Preencha os dados do usuário para cadastrar ou atualizar.
                        </DialogDescription>
                      </DialogHeader>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                        <div className="space-y-2 md:col-span-2">
                          <Label htmlFor="nome">Nome *</Label>
                          <Input id="nome" value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="email">Email *</Label>
                          <Input id="email" type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="tipo">Tipo</Label>
                          <select
                            id="tipo"
                            value={formData.tipo}
                            onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          >
                            <option value="aluno">Aluno</option>
                            <option value="professor">Professor</option>
                            <option value="bibliotecaria">Bibliotecária</option>
                            <option value="gestor">Gestor</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="matricula">Matrícula</Label>
                          <Input id="matricula" value={formData.matricula} onChange={(e) => setFormData({ ...formData, matricula: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="cpf">CPF</Label>
                          <Input id="cpf" value={formData.cpf} onChange={(e) => setFormData({ ...formData, cpf: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="turma">Turma</Label>
                          <Input id="turma" value={formData.turma} onChange={(e) => setFormData({ ...formData, turma: e.target.value })} />
                        </div>

                        <div className="space-y-2">
                          <Label htmlFor="telefone">Telefone</Label>
                          <Input id="telefone" value={formData.telefone} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleSave} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
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
              <p className="text-center text-muted-foreground py-8">{searchTerm ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}</p>
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
                      {canManageUsers && <TableHead className="text-right">Ações</TableHead>}
                    </TableRow>
                  </TableHeader>

                  <TableBody>
                    {filteredUsuarios.map((usuario) => (
                      <TableRow key={usuario.id}>
                        <TableCell className="font-medium">{usuario.nome}</TableCell>
                        <TableCell>{usuario.email}</TableCell>
                        <TableCell><Badge variant={getTipoBadgeVariant(usuario.tipo)}>{getTipoLabel(usuario.tipo)}</Badge></TableCell>
                        <TableCell>{usuario.matricula}</TableCell>
                        <TableCell>{usuario.turma}</TableCell>
                        <TableCell>{usuario.telefone}</TableCell>
                        {canManageUsers && (
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {!(isBibliotecaria && !isGestor && usuario.tipo === 'gestor') && (
                                <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(usuario)}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              )}
                              {isGestor && (
                                <Button variant="ghost" size="icon" onClick={() => handleDelete(usuario.id)}>
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                              )}
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
      </div>
    </MainLayout>
  );
}
