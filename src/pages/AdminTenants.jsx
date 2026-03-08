import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Copy, Building2, Link as LinkIcon, Power, KeyRound, ExternalLink, Sparkles, Volume2 } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';
import { generateAudioWithCloudflare } from '@/lib/cloudflareAiApi';

const DEFAULT_BASE_DOMAIN = import.meta.env.VITE_APP_BASE_DOMAIN || 'bibliotec-ai-core.vercel.app';

function isMissingProvisionTenantSignature(error) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  return (
    error?.code === 'PGRST202'
    || error?.status === 404
    || message.includes('could not find the function public.provision_tenant')
  );
}

function supportsWildcardSubdomain(baseDomain) {
  const normalized = String(baseDomain || '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.endsWith('.vercel.app')) return false;
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return false;
  return true;
}

export default function AdminTenants() {
  const { toast } = useToast();

  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingInviteTenantId, setCreatingInviteTenantId] = useState(null);
  const [togglingTenantId, setTogglingTenantId] = useState(null);
  const [resettingGestorTenantId, setResettingGestorTenantId] = useState(null);
  const [lastResetPassword, setLastResetPassword] = useState(null);
  const [latestInvite, setLatestInvite] = useState(null);
  const [massTenantId, setMassTenantId] = useState('');
  const [massLimit, setMassLimit] = useState(8);
  const [massRunning, setMassRunning] = useState(false);
  const [massProgress, setMassProgress] = useState({ done: 0, total: 0 });
  const [massSummary, setMassSummary] = useState(null);

  const [nomeEscola, setNomeEscola] = useState('');
  const [subdominio, setSubdominio] = useState('');
  const [plano, setPlano] = useState('trial');
  const [inviteCpf, setInviteCpf] = useState('');

  const baseDomain = useMemo(() => DEFAULT_BASE_DOMAIN.trim(), []);
  const wildcardEnabled = useMemo(() => supportsWildcardSubdomain(baseDomain), [baseDomain]);
  const latestInviteUrl = useMemo(() => {
    const raw = String(latestInvite?.onboarding_url || '').trim();
    if (!raw) return '';
    try {
      return new URL(raw, window.location.origin).toString();
    } catch {
      return raw;
    }
  }, [latestInvite?.onboarding_url]);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, escola_id, nome, subdominio, schema_name, plano, ativo, created_at')
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
      let { data, error } = await supabase.rpc('provision_tenant', {
        _escola_nome: nomeEscola,
        _subdominio: subdominio,
        _plano: plano,
        _base_domain: wildcardEnabled ? baseDomain : null,
        _invite_cpf: inviteCpf || null,
        _invite_expires_hours: 72,
      });

      // Compatibilidade com bancos que ainda têm a assinatura antiga (_invite_email).
      if (error && isMissingProvisionTenantSignature(error)) {
        ({ data, error } = await supabase.rpc('provision_tenant', {
          _escola_nome: nomeEscola,
          _subdominio: subdominio,
          _plano: plano,
          _base_domain: wildcardEnabled ? baseDomain : null,
          _invite_email: null,
          _invite_expires_hours: 72,
        }));
      }

      if (error) throw error;

      setLatestInvite(data);
      setNomeEscola('');
      setSubdominio('');
      setPlano('trial');
      setInviteCpf('');

      toast({ title: 'Tenant criado', description: `Escola ${data.escola_nome} provisionada com sucesso.` });
      fetchTenants();
    } catch (error) {
      console.error(error);
      toast({
        title: 'Falha ao provisionar tenant',
        description: isMissingProvisionTenantSignature(error)
          ? 'A função provision_tenant no Supabase está desatualizada. Aplique as migrations mais recentes e tente novamente.'
          : (error.message || 'Erro inesperado'),
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  const createInviteForTenant = async (tenant) => {
    if (!tenant?.id) return;

    setCreatingInviteTenantId(tenant.id);
    try {
      const { data, error } = await supabase.rpc('create_tenant_admin_invite', {
        _tenant_id: tenant.id,
        _invite_cpf: null,
        _base_domain: wildcardEnabled ? baseDomain : null,
        _invite_expires_hours: 72,
      });

      if (error) throw error;

      setLatestInvite(data);
      toast({ title: 'Novo link gerado', description: `Link temporário da escola ${tenant.nome} atualizado.` });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Falha ao gerar novo link',
        description: error?.message || 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setCreatingInviteTenantId(null);
    }
  };

  const getTenantAccessUrl = useCallback((tenant) => {
    if (!tenant?.subdominio) return '';
    if (wildcardEnabled) return `https://${tenant.subdominio}.${baseDomain}`;
    return `${window.location.origin}/?tenant=${tenant.subdominio}`;
  }, [baseDomain, wildcardEnabled]);

  const resetGestorPassword = async (tenant) => {
    if (!tenant?.escola_id) {
      toast({ title: 'Escola inválida', description: 'Tenant sem escola vinculada.', variant: 'destructive' });
      return;
    }

    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let senha = '';
    for (let i = 0; i < 10; i += 1) senha += chars.charAt(Math.floor(Math.random() * chars.length));

    setResettingGestorTenantId(tenant.id);
    try {
      const data = await invokeEdgeFunction('redefinir-senha-gestor', {
        body: { escola_id: tenant.escola_id, nova_senha: senha },
        requireAuth: true,
        signOutOnAuthFailure: true,
        fallbackErrorMessage: 'Não foi possível redefinir a senha do gestor.',
      });

      if (!data?.success) throw new Error(data?.error || 'Não foi possível redefinir a senha do gestor.');

      setLastResetPassword({
        tenantNome: tenant.nome,
        gestorNome: data?.gestor_nome || 'Gestor',
        gestorEmail: data?.gestor_email || '-',
        senha: data?.senha_temporaria || senha,
      });
      toast({ title: 'Senha redefinida', description: `Nova senha temporária do gestor de ${tenant.nome} gerada.` });
    } catch (error) {
      toast({ title: 'Falha ao redefinir senha', description: error?.message || 'Erro inesperado', variant: 'destructive' });
    } finally {
      setResettingGestorTenantId(null);
    }
  };

  const toggleTenantStatus = async (tenant) => {
    if (!tenant?.id) return;
    const nextStatus = !tenant.ativo;

    setTogglingTenantId(tenant.id);
    try {
      const { error } = await supabase
        .from('tenants')
        .update({ ativo: nextStatus })
        .eq('id', tenant.id);

      if (error) throw error;

      setTenants((prev) => prev.map((item) => (item.id === tenant.id ? { ...item, ativo: nextStatus } : item)));
      toast({
        title: nextStatus ? 'Tenant ativado' : 'Tenant inativado',
        description: `${tenant.nome} agora está ${nextStatus ? 'ativo' : 'inativo'}.`,
      });
    } catch (error) {
      console.error(error);
      toast({
        title: 'Falha ao atualizar status',
        description: error?.message || 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setTogglingTenantId(null);
    }
  };

  const gerarAudiosEmMassa = async () => {
    const tenant = tenants.find((item) => item.id === massTenantId);
    if (!tenant?.escola_id) {
      toast({ title: 'Selecione uma escola', description: 'Escolha um tenant com escola vinculada.', variant: 'destructive' });
      return;
    }

    const limite = Math.min(30, Math.max(1, Number(massLimit) || 1));
    setMassRunning(true);
    setMassProgress({ done: 0, total: 0 });
    setMassSummary(null);

    try {
      const { data: livros, error: livrosError } = await supabase
        .from('livros')
        .select('id, titulo, autor, sinopse, escola_id')
        .eq('escola_id', tenant.escola_id)
        .order('titulo', { ascending: true })
        .limit(limite);
      if (livrosError) throw livrosError;

      const acervo = livros || [];
      if (acervo.length === 0) {
        toast({ title: 'Acervo vazio', description: 'Não há livros nessa escola para gerar áudio.' });
        return;
      }

      const { data: autoresPost, error: autoresError } = await supabase
        .from('usuarios_biblioteca')
        .select('id')
        .eq('escola_id', tenant.escola_id)
        .order('created_at', { ascending: true })
        .limit(1);
      if (autoresError) throw autoresError;
      const autorComunidadeId = autoresPost?.[0]?.id || null;

      const success = [];
      const failed = [];
      setMassProgress({ done: 0, total: acervo.length });

      for (let index = 0; index < acervo.length; index += 1) {
        const livro = acervo[index];
        try {
          const roteiro = [
            `Título: ${livro.titulo}`,
            livro.autor ? `Autor: ${livro.autor}` : '',
            livro.sinopse
              ? `Narração sugerida: ${livro.sinopse}`
              : 'Narração sugerida: Este áudio apresenta o livro, seus temas principais e incentiva a leitura.',
          ]
            .filter(Boolean)
            .join('\n');

          const { audioDataUrl } = await generateAudioWithCloudflare({
            text: roteiro,
            fallbackErrorMessage: `Falha ao gerar áudio do livro "${livro.titulo}".`,
          });

          const { data: audioCriado, error: insertAudioError } = await supabase
            .from('audiobooks_biblioteca')
            .insert({
              livro_id: livro.id,
              escola_id: tenant.escola_id,
              titulo: `${livro.titulo} (Audiobook IA)`,
              autor: livro.autor || null,
              audio_url: audioDataUrl,
              criado_por: autorComunidadeId,
            })
            .select('id')
            .single();
          if (insertAudioError) throw insertAudioError;

          if (autorComunidadeId) {
            const { error: postError } = await supabase.from('comunidade_posts').insert({
              autor_id: autorComunidadeId,
              escola_id: tenant.escola_id,
              livro_id: livro.id,
              audiobook_id: audioCriado?.id || null,
              tipo: 'dica',
              titulo: `Novo audiobook do acervo: ${livro.titulo}`,
              conteudo: 'Audiobook gerado em massa pelo Super Admin para esta escola.',
              imagem_urls: [],
              tags: ['audiobook', 'ia', 'super-admin'],
            });
            if (postError) throw postError;
          }

          success.push(livro.titulo);
        } catch (error) {
          failed.push(`${livro.titulo}: ${error?.message || 'Erro desconhecido'}`);
        } finally {
          setMassProgress((prev) => ({ ...prev, done: prev.done + 1 }));
        }
      }

      setMassSummary({
        tenantNome: tenant.nome,
        total: acervo.length,
        success,
        failed,
      });

      toast({
        title: 'Geração em massa concluída',
        description: `${success.length} de ${acervo.length} audiobooks gerados para ${tenant.nome}.`,
      });
    } catch (error) {
      toast({
        title: 'Falha na geração em massa',
        description: error?.message || 'Não foi possível gerar os audiobooks.',
        variant: 'destructive',
      });
    } finally {
      setMassRunning(false);
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
              Primeiro crie a escola. Em seguida o sistema gera o link de acesso inicial da gestão por CPF.
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
                <Label htmlFor="inviteCpf">CPF do gestor (opcional)</Label>
                <Input
                  id="inviteCpf"
                  inputMode="numeric"
                  value={inviteCpf}
                  onChange={(e) => setInviteCpf(e.target.value)}
                  placeholder="Somente números"
                />
              </div>

              <div className="md:col-span-2 flex items-center justify-between rounded-md border p-3 text-sm">
                <span>Domínio base usado no link:</span>
                <Badge variant="outline">
                  {wildcardEnabled ? baseDomain : 'fallback local (?tenant=...)'}
                </Badge>
              </div>

              {!wildcardEnabled && (
                <div className="md:col-span-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-muted-foreground">
                  `vercel.app` não suporta wildcard de subdomínio para onboarding de tenant.
                  O sistema vai gerar link compatível no domínio atual com `?tenant=...`.
                </div>
              )}

              <div className="md:col-span-2">
                <Button type="submit" disabled={creating} className="w-full">
                  <Plus className="w-4 h-4 mr-2" />
                  {creating ? 'Provisionando...' : 'Criar Escola / Apartamento'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {latestInviteUrl && (
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
              <div className="rounded-md border p-3 text-sm break-all">{latestInviteUrl}</div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => copyText(latestInviteUrl, 'Link copiado')}>
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

        {lastResetPassword && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="w-5 h-5" />
                Nova senha temporária do gestor
              </CardTitle>
              <CardDescription>
                Compartilhe esta senha com o gestor de forma segura e peça para alterar no primeiro acesso.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border p-3 text-sm">
                <p><span className="font-medium">Escola:</span> {lastResetPassword.tenantNome}</p>
                <p><span className="font-medium">Gestor:</span> {lastResetPassword.gestorNome}</p>
                <p><span className="font-medium">Email:</span> {lastResetPassword.gestorEmail}</p>
                <p className="mt-2"><span className="font-medium">Senha temporária:</span> <code>{lastResetPassword.senha}</code></p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => copyText(lastResetPassword.senha, 'Senha copiada')}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copiar senha
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
                    <TableHead className="text-right">Ações</TableHead>
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
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(getTenantAccessUrl(tenant), '_blank', 'noopener,noreferrer')}
                            disabled={!tenant.ativo}
                          >
                            <ExternalLink className="w-4 h-4 mr-1" />
                            Abrir escola
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => resetGestorPassword(tenant)}
                            disabled={!tenant.ativo || resettingGestorTenantId === tenant.id}
                          >
                            <KeyRound className="w-4 h-4 mr-1" />
                            {resettingGestorTenantId === tenant.id ? 'Gerando senha...' : 'Nova senha gestor'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => createInviteForTenant(tenant)}
                            disabled={creatingInviteTenantId === tenant.id || !tenant.ativo}
                          >
                            {creatingInviteTenantId === tenant.id ? 'Gerando...' : 'Gerar novo link'}
                          </Button>
                          <Button
                            variant={tenant.ativo ? 'destructive' : 'outline'}
                            size="sm"
                            onClick={() => toggleTenantStatus(tenant)}
                            disabled={togglingTenantId === tenant.id}
                          >
                            <Power className="w-4 h-4 mr-1" />
                            {togglingTenantId === tenant.id
                              ? 'Salvando...'
                              : tenant.ativo ? 'Inativar' : 'Ativar'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="w-5 h-5" />
              Geração em Massa de Áudios
            </CardTitle>
            <CardDescription>
              Gere audiobooks automaticamente usando o acervo da escola selecionada e publique na comunidade escolar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="massTenant">Escola (tenant)</Label>
                <select
                  id="massTenant"
                  className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                  value={massTenantId}
                  onChange={(e) => setMassTenantId(e.target.value)}
                  disabled={massRunning}
                >
                  <option value="">Selecione uma escola</option>
                  {tenants.filter((t) => t.ativo).map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.nome} ({tenant.subdominio})
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="massLimit">Qtd. de livros</Label>
                <Input
                  id="massLimit"
                  type="number"
                  min={1}
                  max={30}
                  value={massLimit}
                  onChange={(e) => setMassLimit(e.target.value)}
                  disabled={massRunning}
                />
              </div>
            </div>

            <Button type="button" onClick={gerarAudiosEmMassa} disabled={massRunning || !massTenantId}>
              <Sparkles className="w-4 h-4 mr-2" />
              {massRunning ? `Gerando... ${massProgress.done}/${massProgress.total || 0}` : 'Gerar áudios em massa'}
            </Button>

            {massSummary && (
              <div className="rounded-md border p-3 space-y-2 text-sm">
                <p><span className="font-medium">Escola:</span> {massSummary.tenantNome}</p>
                <p><span className="font-medium">Processados:</span> {massSummary.total}</p>
                <p><span className="font-medium">Sucessos:</span> {massSummary.success.length}</p>
                <p><span className="font-medium">Falhas:</span> {massSummary.failed.length}</p>
                {massSummary.failed.length > 0 && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2">
                    {massSummary.failed.slice(0, 5).map((item) => (
                      <p key={item} className="text-xs text-destructive">{item}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
