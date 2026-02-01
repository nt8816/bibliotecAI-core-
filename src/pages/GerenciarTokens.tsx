import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Copy, Link as LinkIcon, Trash2, Clock, CheckCircle, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type RoleDestino = 'professor' | 'bibliotecaria';

interface TokenConvite {
  id: string;
  token: string;
  role_destino: RoleDestino;
  criado_por: string;
  usado_por: string | null;
  usado_em: string | null;
  expira_em: string;
  ativo: boolean;
  created_at: string;
  escola_id: string;
}

export default function GerenciarTokens() {
  const [tokens, setTokens] = useState<TokenConvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [roleDestino, setRoleDestino] = useState<RoleDestino>('professor');
  const [dialogOpen, setDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  useEffect(() => {
    fetchTokens();
  }, []);

  const fetchTokens = async () => {
    try {
      const { data, error } = await supabase
        .from('tokens_convite')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTokens((data || []) as TokenConvite[]);
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
  };

  const gerarToken = async () => {
    if (!user) return;

    setCreating(true);
    try {
      // First get or create escola for this gestor
      let { data: escola } = await supabase
        .from('escolas')
        .select('id')
        .eq('gestor_id', user.id)
        .maybeSingle();

      if (!escola) {
        // Create escola for this gestor
        const { data: newEscola, error: escolaError } = await supabase
          .from('escolas')
          .insert({ nome: 'Minha Escola', gestor_id: user.id })
          .select('id')
          .single();

        if (escolaError) throw escolaError;
        escola = newEscola;
      }

      const { data, error } = await supabase
        .from('tokens_convite')
        .insert({
          escola_id: escola.id,
          role_destino: roleDestino,
          criado_por: user.id,
        })
        .select()
        .single();

      if (error) throw error;

      setTokens([data as TokenConvite, ...tokens]);
      setDialogOpen(false);
      toast({
        title: 'Token criado!',
        description: 'O link de convite foi gerado com sucesso.',
      });
    } catch (error) {
      console.error('Error creating token:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível criar o token.',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const copiarLink = (token: string) => {
    const link = `${window.location.origin}/convite/${token}`;
    navigator.clipboard.writeText(link);
    toast({
      title: 'Link copiado!',
      description: 'O link de convite foi copiado para a área de transferência.',
    });
  };

  const desativarToken = async (id: string) => {
    try {
      const { error } = await supabase
        .from('tokens_convite')
        .update({ ativo: false })
        .eq('id', id);

      if (error) throw error;

      setTokens(tokens.map(t => t.id === id ? { ...t, ativo: false } : t));
      toast({
        title: 'Token desativado',
        description: 'O token de convite foi desativado.',
      });
    } catch (error) {
      console.error('Error deactivating token:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível desativar o token.',
        variant: 'destructive',
      });
    }
  };

  const getStatusBadge = (token: TokenConvite) => {
    if (token.usado_por) {
      return <Badge variant="default" className="bg-success">Usado</Badge>;
    }
    if (!token.ativo) {
      return <Badge variant="destructive">Desativado</Badge>;
    }
    if (new Date(token.expira_em) < new Date()) {
      return <Badge variant="secondary">Expirado</Badge>;
    }
    return <Badge variant="outline" className="border-primary text-primary">Ativo</Badge>;
  };

  const getRoleBadge = (role: RoleDestino) => {
    const colors = {
      professor: 'bg-info/10 text-info',
      bibliotecaria: 'bg-secondary/10 text-secondary',
    };
    const labels = {
      professor: 'Professor',
      bibliotecaria: 'Bibliotecária',
    };
    return <Badge className={colors[role]}>{labels[role]}</Badge>;
  };

  return (
    <MainLayout title="Gerenciar Tokens de Convite">
      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Tokens de Convite</CardTitle>
              <CardDescription>
                Gere links de convite para professores e bibliotecárias se cadastrarem no sistema
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
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  <div className="space-y-2">
                    <Label>Tipo de Usuário</Label>
                    <Select value={roleDestino} onValueChange={(v) => setRoleDestino(v as RoleDestino)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="professor">Professor</SelectItem>
                        <SelectItem value="bibliotecaria">Bibliotecária</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    O token será válido por 7 dias e pode ser usado apenas uma vez.
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
                <p className="text-sm text-muted-foreground">
                  Clique em "Novo Token" para gerar um link de convite
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cargo</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Criado em</TableHead>
                    <TableHead>Expira em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tokens.map((token) => (
                    <TableRow key={token.id}>
                      <TableCell>{getRoleBadge(token.role_destino)}</TableCell>
                      <TableCell>{getStatusBadge(token)}</TableCell>
                      <TableCell>
                        {format(new Date(token.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell>
                        {format(new Date(token.expira_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        {token.ativo && !token.usado_por && new Date(token.expira_em) > new Date() && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => copiarLink(token.token)}
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => desativarToken(token.id)}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
