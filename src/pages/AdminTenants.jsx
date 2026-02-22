import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Copy, Building2, Link as LinkIcon } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const DEFAULT_BASE_DOMAIN = import.meta.env.VITE_APP_BASE_DOMAIN || 'bibliotec-ai-core.vercel.app';

export default function AdminTenants() {
  const { toast } = useToast();

  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [latestInvite, setLatestInvite] = useState(null);

  const [nomeEscola, setNomeEscola] = useState('');
  const [subdominio, setSubdominio] = useState('');
  const [plano, setPlano] = useState('trial');
  const [inviteEmail, setInviteEmail] = useState('');

  const baseDomain = useMemo(() => DEFAULT_BASE_DOMAIN.trim(), []);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, nome, subdominio, schema_name, plano, ativo, created_at')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTenants(data || []);
    } catch (error) {
      console.error(error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os tenants.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchTenants();
  }, [fetchTenants]);

  const copyText = async (value, successMessage = 'Copiado!') => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: successMessage, description: value });
    } catch (_error) {
      toast({ title: 'Falha ao copiar', description: value, variant: 'destructive' });
    }
  };

  const createTenant = async (e) => {
    e.preventDefault();

    if (!nomeEscola.trim() || !subdominio.trim()) {
      toast({ title: 'Campos obrigatórios', description: 'Informe nome e subdomínio.', variant: 'destructive' });
      return;
    }

    setCreating(true);

    try {
      const { data, error } = await supabase.rpc('provision_tenant', {
        _escola_nome: nomeEscola,
        _subdominio: subdominio,
        _plano: plano,
        _base_domain: baseDomain,
        _invite_email: inviteEmail || null,
        _invite_expires_hours: 72,
      });

      if (error) throw error;

      setLatestInvite(data);
      setNomeEscola('');
      setSubdominio('');
      setPlano('trial');
      setInviteEmail('');

      toast({ title: 'Tenant criado', description: `Escola ${data.escola_nome} provisionada com sucesso.` });
      fetchTenants();
    } catch (error) {
      console.error(error);
      toast({
        title: 'Falha ao provisionar tenant',
        description: error.message || 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  return (
    <MainLayout title="Admin de Inquilinos">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="w-5 h-5" />
              Provisionar Nova Escola
            </CardTitle>
            <CardDescription>
              Cria tenant, schema dedicado e link temporário para o gestor finalizar cadastro.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={createTenant} className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="nome">Nome da escola</Label>
                <Input id="nome" value={nomeEscola} onChange={(e) => setNomeEscola(e.target.value)} required />
              </div>

              <div className="space-y-2">
                <Label htmlFor="subdominio">Subdomínio</Label>
                <Input
                  id="subdominio"
                  value={subdominio}
                  onChange={(e) => setSubdominio(e.target.value.toLowerCase())}
                  placeholder="colegio-x"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="plano">Plano</Label>
                <Input id="plano" value={plano} onChange={(e) => setPlano(e.target.value)} placeholder="trial" />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="inviteEmail">Email do gestor (opcional)</Label>
                <Input
                  id="inviteEmail"
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="gestor@escola.com"
                />
              </div>

              <div className="md:col-span-2 flex items-center justify-between rounded-md border p-3 text-sm">
                <span>Domínio base usado no link:</span>
                <Badge variant="outline">{baseDomain}</Badge>
              </div>

              <div className="md:col-span-2">
                <Button type="submit" disabled={creating} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  {creating ? 'Provisionando...' : 'Criar Escola / Apartamento'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {latestInvite?.onboarding_url && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LinkIcon className="w-5 h-5" />
                Link Temporário do Gestor
              </CardTitle>
              <CardDescription>
                Envie esse link para o gestor criar a conta inicial da escola.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border p-3 text-sm break-all">{latestInvite.onboarding_url}</div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => copyText(latestInvite.onboarding_url, 'Link copiado')}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar link
                </Button>
                <Button variant="outline" onClick={() => copyText(latestInvite.invite_token, 'Token copiado')}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar token
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Tenants provisionados</CardTitle>
            <CardDescription>Lista de escolas com schema dedicado.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Carregando...</p>
            ) : tenants.length === 0 ? (
              <p className="text-muted-foreground">Nenhuma escola provisionada ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Escola</TableHead>
                    <TableHead>Subdomínio</TableHead>
                    <TableHead>Schema</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tenants.map((tenant) => (
                    <TableRow key={tenant.id}>
                      <TableCell>{tenant.nome}</TableCell>
                      <TableCell>{tenant.subdominio}</TableCell>
                      <TableCell>{tenant.schema_name}</TableCell>
                      <TableCell>{tenant.plano}</TableCell>
                      <TableCell>
                        <Badge variant={tenant.ativo ? 'outline' : 'destructive'}>
                          {tenant.ativo ? 'ativo' : 'inativo'}
                        </Badge>
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
