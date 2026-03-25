import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Plus, Copy, Link as LinkIcon, Trash2 } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { createInviteToken, deleteInviteToken, fetchInviteTokens } from '@/services/inviteTokensService';

export default function GerenciarTokens() {
  const [tokens, setTokens] = useState([]);
  const [criadoresInfo, setCriadoresInfo] = useState({});
  const [utilizadoresInfo, setUtilizadoresInfo] = useState({});
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [roleDestino, setRoleDestino] = useState('professor');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTokenId, setDeleteTokenId] = useState(null);

  const { toast } = useToast();

  const refreshTokens = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await fetchInviteTokens();
      setTokens(payload.tokens);
      setCriadoresInfo(payload.criadoresInfo || {});
      setUtilizadoresInfo(payload.utilizadoresInfo || {});
    } catch (error) {
      console.error('Error fetching tokens:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os tokens.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    refreshTokens();
  }, [refreshTokens]);

  const gerarToken = async () => {
    setCreating(true);
    try {
      const data = await createInviteToken(roleDestino);
      setTokens((prev) => [data.token, ...prev]);
      setCriadoresInfo((prev) => ({ ...prev, ...(data.criadoresInfo || {}) }));
      setDialogOpen(false);
      toast({
        title: 'Token criado!',
        description: 'O link de convite foi gerado com sucesso.',
      });
    } catch (error) {
      console.error('Error creating token:', error);
      toast({
        title: 'Erro',
        description: error?.message || 'Não foi possível criar o token.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const copiarLink = async (token) => {
    const link = `${window.location.origin}/convite/${token}`;

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = link;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      toast({
        title: 'Link copiado!',
        description: 'O link de convite foi copiado para a area de transferencia.',
      });
    } catch (error) {
      console.error('Error copying invite link:', error);
      toast({
        title: 'Não foi possível copiar automaticamente',
        description: link,
        variant: 'destructive',
      });
    }
  };

  const apagarToken = async (id) => {
    try {
      await deleteInviteToken(id);
      setTokens((prev) => prev.filter((t) => t.id !== id));
      setDeleteTokenId(null);
      toast({
        title: 'Token apagado',
        description: 'O token de convite foi removido com sucesso.',
      });
    } catch (error) {
      console.error('Error deleting token:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível apagar o token.',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (token) => {
    if (token.usado_por) return <Badge className="bg-success">Usado</Badge>;
    if (!token.ativo) return <Badge variant="destructive">Desativado</Badge>;
    if (new Date(token.expira_em) < new Date()) return <Badge variant="secondary">Expirado</Badge>;
    return <Badge variant="outline" className="border-primary text-primary">Ativo</Badge>;
  };

  const getRoleBadge = (role) => {
    const colors = {
      professor: 'bg-info/10 text-info',
      bibliotecaria: 'bg-secondary/10 text-secondary',
      aluno: 'bg-primary/10 text-primary',
    };

    const labels = {
      professor: 'Professor',
      bibliotecaria: 'Bibliotecaria',
      aluno: 'Aluno',
    };

    return <Badge className={colors[role] || 'bg-muted'}>{labels[role] || role}</Badge>;
  };

  const getRoleLabel = (role) => {
    const labels = {
      gestor: 'Gestor',
      professor: 'Professor',
      bibliotecaria: 'Bibliotecaria',
      aluno: 'Aluno',
    };

    return labels[role] || role || 'N/A';
  };

  return (
    <MainLayout title="Gerenciar Tokens de Convite">
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Tokens de Convite</CardTitle>
              <CardDescription>
                Gere links de convite para professores, bibliotecarias e alunos se cadastrarem no sistema.
              </CardDescription>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Novo Token
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Gerar Novo Token de Convite</DialogTitle>
                  <DialogDescription>
                    Escolha o cargo do convite e gere um link unico para cadastro.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Tipo de Usuario</Label>
                    <Select value={roleDestino} onValueChange={(v) => setRoleDestino(v)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professor">Professor</SelectItem>
                        <SelectItem value="bibliotecaria">Bibliotecaria</SelectItem>
                        <SelectItem value="aluno">Aluno</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    O token será valido por 7 dias e pode ser usado apenas uma vez.
                  </p>

                  <Button onClick={gerarToken} disabled={creating} className="w-full">
                    {creating ? 'Gerando...' : 'Gerar Token'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>

          <CardContent>
            {loading ? (
              <p className="text-muted-foreground text-center py-8">Carregando...</p>
            ) : tokens.length === 0 ? (
              <div className="text-center py-12">
                <LinkIcon className="w-12 h-12 mx-auto text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">Nenhum token gerado ainda</p>
                <p className="text-sm text-muted-foreground">Clique em &quot;Novo Token&quot; para gerar um link de convite</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cargo (convite)</TableHead>
                    <TableHead>Criado por</TableHead>
                    <TableHead>Utilizado por</TableHead>
                    <TableHead>Categoria (utilizador)</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Expira em</TableHead>
                    <TableHead className="text-right">Acoes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokens.map((token) => (
                    <TableRow key={token.id}>
                      <TableCell>{getRoleBadge(token.role_destino)}</TableCell>
                      <TableCell>{criadoresInfo[token.criado_por]?.nome || '—'}</TableCell>
                      <TableCell>{token.usado_por ? (utilizadoresInfo[token.usado_por]?.nome || 'Usuario nao encontrado') : '—'}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {token.usado_por ? getRoleLabel(utilizadoresInfo[token.usado_por]?.role) : '—'}
                        </Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(token)}</TableCell>
                      <TableCell>{format(new Date(token.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</TableCell>
                      <TableCell>{format(new Date(token.expira_em), 'dd/MM/yyyy HH:mm', { locale: ptBR })}</TableCell>
                      <TableCell className="text-right space-x-2">
                        {token.ativo && !token.usado_por && new Date(token.expira_em) > new Date() && (
                          <Button variant="ghost" size="sm" onClick={() => copiarLink(token.token)}>
                            <Copy className="w-4 h-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => setDeleteTokenId(token.id)}>
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        <AlertDialog open={Boolean(deleteTokenId)} onOpenChange={(open) => !open && setDeleteTokenId(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar token de convite?</AlertDialogTitle>
              <AlertDialogDescription>
                Esse link de convite sera removido permanentemente e nao podera mais ser usado.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction onClick={() => deleteTokenId && apagarToken(deleteTokenId)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Apagar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MainLayout>
  );
}

