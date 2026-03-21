import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, Copy, Building2, Link as LinkIcon, Power, KeyRound, ExternalLink, Sparkles, Volume2, Trash2 } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
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

function isMissingColumnError(error, columnName, tableName) {
  const message = `${error?.message || ''} ${error?.details || ''}`.toLowerCase();
  const column = String(columnName || '').toLowerCase();
  const table = String(tableName || '').toLowerCase();
  return (
    message.includes(`could not find the '${column}' column`) &&
    (!table || message.includes(`'${table}'`) || message.includes(`"${table}"`))
  );
}

async function insertCommunityPostCompat(payload) {
  const { error } = await supabase.from('comunidade_posts').insert(payload);

  if (error && Object.hasOwn(payload, 'escola_id') && isMissingColumnError(error, 'escola_id', 'comunidade_posts')) {
    const { escola_id: _ignored, ...fallbackPayload } = payload;
    return await supabase.from('comunidade_posts').insert(fallbackPayload);
  }

  return { error };
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
  const [escolasSemTenant, setEscolasSemTenant] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [creatingInviteTenantId, setCreatingInviteTenantId] = useState(null);
  const [togglingTenantId, setTogglingTenantId] = useState(null);
  const [resettingGestorTenantId, setResettingGestorTenantId] = useState(null);
  const [manualPasswordTenant, setManualPasswordTenant] = useState(null);
  const [manualGestorPassword, setManualGestorPassword] = useState('');
  const [manualPasswordMode, setManualPasswordMode] = useState('manual');
  const [tenantGestores, setTenantGestores] = useState([]);
  const [selectedGestorId, setSelectedGestorId] = useState('');
  const [loadingGestoresTenantId, setLoadingGestoresTenantId] = useState(null);
  const [managingGestoresTenant, setManagingGestoresTenant] = useState(null);
  const [gestorPendingDelete, setGestorPendingDelete] = useState(null);
  const [deletingGestorId, setDeletingGestorId] = useState(null);
  const [deletingTenantId, setDeletingTenantId] = useState(null);
  const [tenantPendingDelete, setTenantPendingDelete] = useState(null);
  const [deletingEscolaId, setDeletingEscolaId] = useState(null);
  const [escolaSemTenantPendingDelete, setEscolaSemTenantPendingDelete] = useState(null);
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
  const handleInviteCpfChange = (value) => {
    const digits = String(value || '').replace(/\D/g, '').slice(0, 11);
    setInviteCpf(digits);
  };

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
      const [tenantsRes, escolasRes] = await Promise.all([
        supabase
          .from('tenants')
          .select('id, escola_id, nome, subdominio, schema_name, plano, ativo, created_at')
          .order('created_at', { ascending: false }),
        supabase
          .from('escolas')
          .select('id, nome, gestor_id')
          .order('nome', { ascending: true }),
      ]);

      if (tenantsRes.error) throw tenantsRes.error;
      if (escolasRes.error) throw escolasRes.error;

      const tenantsData = tenantsRes.data || [];
      const escolasData = escolasRes.data || [];
      const escolaIdsComTenant = new Set(tenantsData.map((tenant) => tenant.escola_id).filter(Boolean));

      setTenants(tenantsData);
      setEscolasSemTenant(escolasData.filter((escola) => !escolaIdsComTenant.has(escola.id)));
    } catch (error) {
      console.error(error);
      toast({
        title: 'Erro',
        description: 'NÃ£o foi possÃ­vel carregar os tenants.',
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
      toast({ title: 'Campos obrigatÃ³rios', description: 'Informe nome e subdomÃ­nio.', variant: 'destructive' });
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

      // Compatibilidade com bancos que ainda tÃªm a assinatura antiga (_invite_email).
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
          ? 'A funÃ§Ã£o provision_tenant no Supabase estÃ¡ desatualizada. Aplique as migrations mais recentes e tente novamente.'
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
      toast({ title: 'Novo link gerado', description: `Link temporÃ¡rio da escola ${tenant.nome} atualizado.` });
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

  const loadGestoresForTenant = async (tenant) => {
    if (!tenant?.escola_id) {
      toast({ title: 'Escola inválida', description: 'Tenant sem escola vinculada.', variant: 'destructive' });
      return [];
    }

    setTenantGestores([]);
    setSelectedGestorId('');
    setLoadingGestoresTenantId(tenant.id);

    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error('Sessão inválida. Faça login novamente.');
      }

      const response = await invokeEdgeFunction('redefinir-senha-gestor', {
        body: { operation: 'list', escola_id: tenant.escola_id },
        requireAuth: false,
        headers: {
          'x-user-access-token': accessToken,
        },
        fallbackErrorMessage: 'Não foi possível carregar os gestores da escola.',
      });

      const gestoresUnicos = Array.isArray(response?.gestores) ? response.gestores : [];

      setTenantGestores(gestoresUnicos);
      setSelectedGestorId(gestoresUnicos[0]?.id || '');

      if (gestoresUnicos.length === 0) {
        toast({
          title: 'Nenhum gestor encontrado',
          description: 'Essa escola não tem gestores cadastrados para redefinir senha.',
          variant: 'destructive',
        });
      }

      return gestoresUnicos;
    } catch (error) {
      toast({
        title: 'Falha ao carregar gestores',
        description: error?.message || 'Erro inesperado',
        variant: 'destructive',
      });
      return [];
    } finally {
      setLoadingGestoresTenantId(null);
    }
  };

  const openGestorPasswordDialog = async (tenant, mode = 'manual') => {
    setManualPasswordTenant(tenant);
    setManualPasswordMode(mode);
    setManualGestorPassword('');
    await loadGestoresForTenant(tenant);
  };

  const openManageGestoresDialog = async (tenant) => {
    setManagingGestoresTenant(tenant);
    await loadGestoresForTenant(tenant);
  };

  const submitGestorPassword = async (tenant, gestorId, senha, successDescription) => {
    if (!tenant?.escola_id) {
      toast({ title: 'Escola inválida', description: 'Tenant sem escola vinculada.', variant: 'destructive' });
      return;
    }

    if (!gestorId) {
      toast({ title: 'Selecione um gestor', description: 'Escolha qual gestor terá a senha alterada.', variant: 'destructive' });
      return;
    }

    setResettingGestorTenantId(tenant.id);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error('Sessão inválida. Faça login novamente.');
      }

      const data = await invokeEdgeFunction('redefinir-senha-gestor', {
        body: { escola_id: tenant.escola_id, gestor_id: gestorId, nova_senha: senha },
        requireAuth: false,
        headers: {
          'x-user-access-token': accessToken,
        },
        fallbackErrorMessage: 'Não foi possível redefinir a senha do gestor.',
      });

      if (!data?.success) throw new Error(data?.error || 'Não foi possível redefinir a senha do gestor.');

      setLastResetPassword({
        tenantNome: tenant.nome,
        gestorNome: data?.gestor_nome || 'Gestor',
        gestorEmail: data?.gestor_email || '-',
        senha: data?.senha_temporaria || senha,
      });
      toast({ title: 'Senha redefinida', description: successDescription });
    } catch (error) {
      toast({ title: 'Falha ao redefinir senha', description: error?.message || 'Erro inesperado', variant: 'destructive' });
    } finally {
      setResettingGestorTenantId(null);
    }
  };

  const resetGestorPassword = async (tenant) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    let senha = '';
    for (let i = 0; i < 10; i += 1) senha += chars.charAt(Math.floor(Math.random() * chars.length));

    await submitGestorPassword(tenant, selectedGestorId, senha, `Nova senha temporária do gestor de ${tenant.nome} gerada.`);
    setManualPasswordTenant(null);
    setSelectedGestorId('');
    setTenantGestores([]);
  };

  const defineGestorPassword = async () => {
    const tenant = manualPasswordTenant;
    const senha = manualGestorPassword.trim();

    if (!tenant?.id) return;

    if (senha.length < 6) {
      toast({
        title: 'Senha inválida',
        description: 'Defina uma senha com pelo menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    await submitGestorPassword(tenant, selectedGestorId, senha, `Senha do gestor de ${tenant.nome} atualizada com sucesso.`);
    setManualGestorPassword('');
    setManualPasswordTenant(null);
    setSelectedGestorId('');
    setTenantGestores([]);
  };

  const deleteGestor = async () => {
    const tenant = managingGestoresTenant;
    const gestor = gestorPendingDelete;

    if (!tenant?.escola_id || !gestor?.id) return;

    setDeletingGestorId(gestor.id);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error('Sessão inválida. Faça login novamente.');
      }

      const data = await invokeEdgeFunction('excluir-usuarios-biblioteca', {
        body: { id: gestor.id },
        requireAuth: false,
        headers: {
          'x-user-access-token': accessToken,
        },
        fallbackErrorMessage: 'Não foi possível excluir o gestor.',
      });

      if (!data?.success) {
        throw new Error(data?.error || 'Não foi possível excluir o gestor.');
      }

      const gestoresRestantes = tenantGestores.filter((item) => item.id !== gestor.id);
      setTenantGestores(gestoresRestantes);
      setSelectedGestorId((current) => (current === gestor.id ? (gestoresRestantes[0]?.id || '') : current));
      setGestorPendingDelete(null);

      toast({
        title: 'Gestor excluído',
        description: `${gestor.nome || 'Gestor'} foi removido do banco de dados.`,
      });
    } catch (error) {
      toast({
        title: 'Falha ao excluir gestor',
        description: error?.message || 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setDeletingGestorId(null);
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
        description: `${tenant.nome} agora estÃ¡ ${nextStatus ? 'ativo' : 'inativo'}.`,
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

  const deleteTenantSchool = async () => {
    const tenant = tenantPendingDelete;
    if (!tenant?.id) return;

    setDeletingTenantId(tenant.id);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error('SessÃ£o invÃ¡lida. FaÃ§a login novamente.');
      }

      const data = await invokeEdgeFunction('excluir-escola-tenant', {
        body: { tenant_id: tenant.id },
        requireAuth: false,
        headers: {
          'x-user-access-token': accessToken,
        },
        fallbackErrorMessage: 'NÃ£o foi possÃ­vel excluir a escola.',
      });

      setTenants((prev) => prev.filter((item) => item.id !== tenant.id));
      setTenantPendingDelete(null);
      if (massTenantId === tenant.id) setMassTenantId('');
      if (lastResetPassword?.tenantNome === tenant.nome) setLastResetPassword(null);

      const authFailures = Array.isArray(data?.auth_delete_failures) ? data.auth_delete_failures : [];
      toast({
        title: authFailures.length === 0 ? 'Escola excluÃ­da' : 'Escola excluÃ­da com alertas',
        description: authFailures.length === 0
          ? `Todos os dados da escola ${tenant.nome} foram removidos.`
          : `A escola foi removida, mas ${authFailures.length} usuário(s) de autenticação exigem revisão manual.`,
        variant: authFailures.length === 0 ? 'default' : 'destructive',
      });
    } catch (error) {
      toast({
        title: 'Falha ao excluir escola',
        description: error?.message || 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setDeletingTenantId(null);
    }
  };

  const deleteOrphanSchool = async () => {
    const escola = escolaSemTenantPendingDelete;
    if (!escola?.id) return;

    setDeletingEscolaId(escola.id);
    try {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;

      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error('SessÃ£o invÃ¡lida. FaÃ§a login novamente.');
      }

      const data = await invokeEdgeFunction('excluir-escola-tenant', {
        body: { escola_id: escola.id },
        requireAuth: false,
        headers: {
          'x-user-access-token': accessToken,
        },
        fallbackErrorMessage: 'NÃ£o foi possÃ­vel excluir a escola.',
      });

      setEscolasSemTenant((prev) => prev.filter((item) => item.id !== escola.id));
      setEscolaSemTenantPendingDelete(null);

      const authFailures = Array.isArray(data?.auth_delete_failures) ? data.auth_delete_failures : [];
      toast({
        title: authFailures.length === 0 ? 'Escola excluÃ­da' : 'Escola excluÃ­da com alertas',
        description: authFailures.length === 0
          ? `Todos os dados da escola ${escola.nome} foram removidos do banco.`
          : `A escola foi removida, mas ${authFailures.length} usuário(s) de autenticação exigem revisão manual.`,
        variant: authFailures.length === 0 ? 'default' : 'destructive',
      });
    } catch (error) {
      toast({
        title: 'Falha ao excluir escola',
        description: error?.message || 'Erro inesperado',
        variant: 'destructive',
      });
    } finally {
      setDeletingEscolaId(null);
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
        toast({ title: 'Acervo vazio', description: 'NÃ£o hÃ¡ livros nessa escola para gerar Ã¡udio.' });
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
            `TÃ­tulo: ${livro.titulo}`,
            livro.autor ? `Autor: ${livro.autor}` : '',
            livro.sinopse
              ? `Narração sugerida: ${livro.sinopse}`
              : 'Narração sugerida: Este áudio apresenta o livro, seus temas principais e incentiva a leitura.',
          ]
            .filter(Boolean)
            .join('\n');

          const { audioDataUrl } = await generateAudioWithCloudflare({
            text: roteiro,
            fallbackErrorMessage: `Falha ao gerar Ã¡udio do livro "${livro.titulo}".`,
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
            const { error: postError } = await insertCommunityPostCompat({
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
        description: error?.message || 'NÃ£o foi possÃ­vel gerar os audiobooks.',
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
              Primeiro crie a escola. Em seguida o sistema gera o link de acesso inicial da gestÃ£o por CPF.
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
                  onChange={(e) => handleInviteCpfChange(e.target.value)}
                  placeholder="Somente nÃºmeros"
                />
              </div>

              <div className="md:col-span-2 flex items-center justify-between rounded-md border p-3 text-sm">
                <span>DomÃ­nio base usado no link:</span>
                <Badge variant="outline">
                  {wildcardEnabled ? baseDomain : 'fallback local (?tenant=...)'}
                </Badge>
              </div>

              {!wildcardEnabled && (
                <div className="md:col-span-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-xs text-muted-foreground">
                  `vercel.app` nÃ£o suporta wildcard de subdomÃ­nio para onboarding de tenant.
                  O sistema vai gerar link compatÃ­vel no domÃ­nio atual com `?tenant=...`.
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
                Link TemporÃ¡rio do Gestor
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
                Nova senha temporÃ¡ria do gestor
              </CardTitle>
              <CardDescription>
                Compartilhe esta senha com o gestor de forma segura e peÃ§a para alterar no primeiro acesso.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="rounded-md border p-3 text-sm">
                <p><span className="font-medium">Escola:</span> {lastResetPassword.tenantNome}</p>
                <p><span className="font-medium">Gestor:</span> {lastResetPassword.gestorNome}</p>
                <p><span className="font-medium">Email:</span> {lastResetPassword.gestorEmail}</p>
                <p className="mt-2"><span className="font-medium">Senha temporÃ¡ria:</span> <code>{lastResetPassword.senha}</code></p>
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
              <div className="overflow-x-auto">
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
                              onClick={() => openGestorPasswordDialog(tenant, 'auto')}
                              disabled={!tenant.ativo || resettingGestorTenantId === tenant.id}
                            >
                              <KeyRound className="w-4 h-4 mr-1" />
                              {resettingGestorTenantId === tenant.id ? 'Gerando senha...' : 'Nova senha gestor'}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                openGestorPasswordDialog(tenant, 'manual');
                              }}
                              disabled={!tenant.ativo || resettingGestorTenantId === tenant.id}
                            >
                              <KeyRound className="w-4 h-4 mr-1" />
                              Definir senha
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openManageGestoresDialog(tenant)}
                              disabled={!tenant.ativo || Boolean(loadingGestoresTenantId)}
                            >
                              <KeyRound className="w-4 h-4 mr-1" />
                              Gerenciar gestores
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
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => setTenantPendingDelete(tenant)}
                              disabled={deletingTenantId === tenant.id}
                            >
                              <Trash2 className="w-4 h-4 mr-1" />
                              {deletingTenantId === tenant.id ? 'Excluindo...' : 'Apagar escola'}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {escolasSemTenant.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Escolas sem tenant vinculado</CardTitle>
              <CardDescription>
                Essas escolas existem no banco, mas ainda não foram vinculadas a um tenant isolado.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {escolasSemTenant.map((escola) => (
                  <div key={escola.id} className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <p className="font-medium">{escola.nome}</p>
                      <p className="text-xs text-muted-foreground">{escola.id}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">Sem tenant</Badge>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setEscolaSemTenantPendingDelete(escola)}
                        disabled={deletingEscolaId === escola.id}
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        {deletingEscolaId === escola.id ? 'Excluindo...' : 'Apagar escola'}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

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
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.nome} ({tenant.subdominio}){tenant.ativo ? '' : ' - inativa'}
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

        <AlertDialog
          open={Boolean(gestorPendingDelete)}
          onOpenChange={(open) => {
            if (!open && !deletingGestorId) setGestorPendingDelete(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar gestor permanentemente?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação remove o gestor <strong>{gestorPendingDelete?.nome || '-'}</strong> do banco de dados e da autenticação.
                Depois disso, ele perderá o acesso ao sistema.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={Boolean(deletingGestorId)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteGestor}
                disabled={Boolean(deletingGestorId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletingGestorId ? 'Excluindo...' : 'Apagar gestor'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={Boolean(tenantPendingDelete)}
          onOpenChange={(open) => {
            if (!open && !deletingTenantId) setTenantPendingDelete(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar escola permanentemente?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação remove a escola <strong>{tenantPendingDelete?.nome || '-'}</strong>, o tenant, os dados relacionados no banco e o schema dedicado. Os usuários vinculados também serão removidos da autenticação.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={Boolean(deletingTenantId)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteTenantSchool}
                disabled={Boolean(deletingTenantId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletingTenantId ? 'Excluindo...' : 'Apagar definitivamente'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={Boolean(escolaSemTenantPendingDelete)}
          onOpenChange={(open) => {
            if (!open && !deletingEscolaId) setEscolaSemTenantPendingDelete(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Apagar escola permanentemente?</AlertDialogTitle>
              <AlertDialogDescription>
                Esta ação remove a escola <strong>{escolaSemTenantPendingDelete?.nome || '-'}</strong> diretamente do banco de dados,
                incluindo os registros vinculados a ela. Use isso apenas quando a escola não deve mais existir no ambiente.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={Boolean(deletingEscolaId)}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={deleteOrphanSchool}
                disabled={Boolean(deletingEscolaId)}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deletingEscolaId ? 'Excluindo...' : 'Apagar definitivamente'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog
          open={Boolean(managingGestoresTenant)}
          onOpenChange={(open) => {
            if (!open && !deletingGestorId) {
              setManagingGestoresTenant(null);
              setGestorPendingDelete(null);
              setTenantGestores([]);
              setSelectedGestorId('');
            }
          }}
        >
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Gerenciar gestores</DialogTitle>
              <DialogDescription>
                Escolha um gestor da escola {managingGestoresTenant?.nome || '-'} para remover do sistema.
              </DialogDescription>
            </DialogHeader>

            {loadingGestoresTenantId ? (
              <p className="text-sm text-muted-foreground">Carregando gestores da escola...</p>
            ) : tenantGestores.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum gestor disponível para essa escola.</p>
            ) : (
              <div className="space-y-2">
                {tenantGestores.map((gestor) => (
                  <div key={gestor.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
                    <div className="min-w-0">
                      <p className="font-medium">{gestor.nome || 'Gestor'}</p>
                      <p className="text-sm text-muted-foreground">{gestor.email || 'Sem email cadastrado'}</p>
                    </div>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => setGestorPendingDelete(gestor)}
                      disabled={deletingGestorId === gestor.id}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      {deletingGestorId === gestor.id ? 'Excluindo...' : 'Apagar'}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setManagingGestoresTenant(null);
                  setGestorPendingDelete(null);
                  setTenantGestores([]);
                  setSelectedGestorId('');
                }}
                disabled={Boolean(deletingGestorId)}
              >
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={Boolean(manualPasswordTenant)}
          onOpenChange={(open) => {
            if (!open && !resettingGestorTenantId) {
              setManualPasswordTenant(null);
              setManualGestorPassword('');
              setSelectedGestorId('');
              setTenantGestores([]);
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{manualPasswordMode === 'auto' ? 'Gerar nova senha do gestor' : 'Definir senha do gestor'}</DialogTitle>
              <DialogDescription>
                Escolha qual gestor da escola {manualPasswordTenant?.nome || '-'} terá a senha alterada.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="selectedGestor">Gestor da escola</Label>
              <select
                id="selectedGestor"
                className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                value={selectedGestorId}
                onChange={(e) => setSelectedGestorId(e.target.value)}
                disabled={Boolean(resettingGestorTenantId) || Boolean(loadingGestoresTenantId)}
              >
                <option value="">Selecione o gestor</option>
                {tenantGestores.map((gestor) => (
                  <option key={gestor.id} value={gestor.id}>
                    {gestor.nome} ({gestor.email || 'sem email'})
                  </option>
                ))}
              </select>
            </div>

            {manualPasswordMode === 'manual' ? (
              <div className="space-y-2">
                <Label htmlFor="manualGestorPassword">Nova senha</Label>
                <Input
                  id="manualGestorPassword"
                  type="text"
                  value={manualGestorPassword}
                  onChange={(e) => setManualGestorPassword(e.target.value)}
                  placeholder="Digite a senha do gestor"
                  disabled={Boolean(resettingGestorTenantId)}
                />
                <p className="text-xs text-muted-foreground">
                  Use pelo menos 6 caracteres. Letras, números e símbolos comuns são aceitos.
                </p>
              </div>
            ) : (
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                O sistema vai gerar uma nova senha temporária para o gestor selecionado.
              </div>
            )}

            {loadingGestoresTenantId && (
              <p className="text-sm text-muted-foreground">Carregando gestores da escola...</p>
            )}

            {!loadingGestoresTenantId && tenantGestores.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum gestor disponível para essa escola.</p>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setManualPasswordTenant(null);
                  setManualGestorPassword('');
                  setSelectedGestorId('');
                  setTenantGestores([]);
                }}
                disabled={Boolean(resettingGestorTenantId)}
              >
                Cancelar
              </Button>
              <Button
                onClick={manualPasswordMode === 'auto' ? () => resetGestorPassword(manualPasswordTenant) : defineGestorPassword}
                disabled={Boolean(resettingGestorTenantId) || Boolean(loadingGestoresTenantId) || !selectedGestorId}
              >
                {resettingGestorTenantId
                  ? 'Salvando...'
                  : manualPasswordMode === 'auto'
                    ? 'Gerar nova senha'
                    : 'Salvar nova senha'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </MainLayout>
  );
}

