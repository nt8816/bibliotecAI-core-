import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { KeyRound, ShieldPlus, UnlockKeyhole } from 'lucide-react';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';

function formatDate(value) {
  if (!value) return '-';
  try {
    return format(new Date(value), 'dd/MM/yyyy HH:mm', { locale: ptBR });
  } catch {
    return '-';
  }
}

const emptyForm = {
  nome: '',
  email: '',
  cpf: '',
  senha: '',
};

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function isValidCpf(value) {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(cpf[index]) * (10 - index);
  }

  let checkDigit = (sum * 10) % 11;
  if (checkDigit === 10) checkDigit = 0;
  if (checkDigit !== Number(cpf[9])) return false;

  sum = 0;
  for (let index = 0; index < 10; index += 1) {
    sum += Number(cpf[index]) * (11 - index);
  }

  checkDigit = (sum * 10) % 11;
  if (checkDigit === 10) checkDigit = 0;
  return checkDigit === Number(cpf[10]);
}

export default function SuperAdmins() {
  const { toast } = useToast();
  const [items, setItems] = useState([]);
  const [securityAlert, setSecurityAlert] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unlockingId, setUnlockingId] = useState('');
  const [form, setForm] = useState(emptyForm);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const [accountsRes, alertsRes] = await Promise.all([
        supabase
          .from('super_admin_accounts')
          .select('id, nome, email, cpf, ativo, bloqueado, tentativas_falhas, ultima_tentativa_em, ultimo_login_em, bloqueado_em, created_at')
          .order('created_at', { ascending: true }),
        supabase
          .from('system_logs')
          .select('id, event, message, ip, created_at, context')
          .in('event', ['super_admin_login_failed', 'super_admin_account_locked'])
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      if (accountsRes.error) throw accountsRes.error;
      if (alertsRes.error) throw alertsRes.error;

      setItems(accountsRes.data || []);
      setSecurityAlert((alertsRes.data || [])[0] || null);
    } catch (error) {
      toast({
        title: 'Erro ao carregar Super Admins',
        description: error?.message || 'Nao foi possivel carregar as contas.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const getUserAccessToken = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    const accessToken = data?.session?.access_token;
    if (!accessToken) {
      throw new Error('Sessao invalida. Faca login novamente.');
    }
    return accessToken;
  };

  const handleCreate = async () => {
    const cpf = normalizeCpf(form.cpf);

    if (form.nome.trim().length < 3 || !form.email.includes('@') || form.senha.trim().length < 6) {
      toast({
        title: 'Dados invalidos',
        description: 'Preencha nome, email valido e senha com pelo menos 6 caracteres.',
        variant: 'destructive',
      });
      return;
    }

    if (cpf && !isValidCpf(cpf)) {
      toast({
        title: 'CPF invalido',
        description: 'Informe um CPF valido para o Super Admin.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const accessToken = await getUserAccessToken();
      await invokeEdgeFunction('gerenciar-super-admins', {
        body: {
          operation: 'create',
          nome: form.nome.trim(),
          email: form.email.trim(),
          cpf,
          senha: form.senha,
        },
        requireAuth: false,
        headers: {
          'x-user-access-token': accessToken,
        },
        transport: 'http',
        fallbackErrorMessage: 'Nao foi possivel criar o Super Admin.',
      });

      setForm(emptyForm);
      toast({
        title: 'Super Admin criado',
        description: 'A nova conta de Super Admin foi criada com sucesso.',
      });
      await fetchItems();
    } catch (error) {
      toast({
        title: 'Erro ao criar Super Admin',
        description: error?.message || 'Nao foi possivel criar a conta.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUnlock = async (accountId) => {
    setUnlockingId(accountId);
    try {
      const accessToken = await getUserAccessToken();
      await invokeEdgeFunction('gerenciar-super-admins', {
        body: {
          operation: 'unlock',
          account_id: accountId,
        },
        requireAuth: false,
        headers: {
          'x-user-access-token': accessToken,
        },
        transport: 'http',
        fallbackErrorMessage: 'Nao foi possivel liberar a conta.',
      });

      toast({
        title: 'Conta liberada',
        description: 'O Super Admin bloqueado foi liberado.',
      });
      await fetchItems();
    } catch (error) {
      toast({
        title: 'Erro ao liberar conta',
        description: error?.message || 'Nao foi possivel desbloquear a conta.',
        variant: 'destructive',
      });
    } finally {
      setUnlockingId('');
    }
  };

  return (
    <MainLayout title="Super Admins">
      <div className="space-y-4">
        {securityAlert && (
          <Card className="border-destructive bg-destructive/10 shadow-[0_0_0_1px_rgba(220,38,38,0.4)]">
            <CardContent className="flex flex-col gap-2 p-5">
              <p className="text-lg font-black tracking-wide text-destructive">TENTATIVA DE INVASAO !!!</p>
              <p className="text-sm text-destructive/90">{securityAlert.message || 'Tentativa suspeita detectada em conta de Super Admin.'}</p>
              <p className="text-xs text-destructive/80">
                IP: {securityAlert.ip || '-'} • Cidade: {securityAlert?.context?.city || securityAlert?.context?.locality || '-'} • Data: {formatDate(securityAlert.created_at)}
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldPlus className="h-5 w-5" />
              Adicionar Super Admin
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-4">
            <div className="md:col-span-4 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-foreground/80">
              Toda conta cadastrada como Super Admin recebe acesso total ao painel global, logs, reclamações, tenants e gestão de outras contas Super Admin.
            </div>
            <div className="space-y-1">
              <Label htmlFor="super-admin-nome">Nome</Label>
              <Input
                id="super-admin-nome"
                value={form.nome}
                onChange={(e) => setForm((prev) => ({ ...prev, nome: e.target.value }))}
                placeholder="Nome completo"
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="super-admin-email">Email</Label>
              <Input
                id="super-admin-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
                placeholder="email@dominio.com"
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="super-admin-cpf">CPF</Label>
              <Input
                id="super-admin-cpf"
                value={form.cpf}
                onChange={(e) => setForm((prev) => ({ ...prev, cpf: normalizeCpf(e.target.value) }))}
                placeholder="Opcional"
                disabled={saving}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="super-admin-senha">Senha inicial</Label>
              <Input
                id="super-admin-senha"
                type="password"
                value={form.senha}
                onChange={(e) => setForm((prev) => ({ ...prev, senha: e.target.value }))}
                placeholder="Minimo 6 caracteres"
                disabled={saving}
              />
            </div>
            <div className="md:col-span-4 flex justify-end">
              <Button type="button" onClick={handleCreate} disabled={saving}>
                <KeyRound className="mr-2 h-4 w-4" />
                {saving ? 'Criando...' : 'Criar Super Admin'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contas cadastradas</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando Super Admins...</p>
            ) : items.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma conta de Super Admin cadastrada.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Permissoes</TableHead>
                      <TableHead>Tentativas</TableHead>
                      <TableHead>Ultimo login</TableHead>
                      <TableHead>Bloqueado em</TableHead>
                      <TableHead className="text-right">Acao</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.nome || '-'}</TableCell>
                        <TableCell>{item.email}</TableCell>
                        <TableCell>
                          <Badge variant={item.bloqueado ? 'destructive' : item.ativo ? 'outline' : 'secondary'}>
                            {item.bloqueado ? 'Bloqueado' : item.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className="bg-primary/15 text-primary hover:bg-primary/15">
                            Acesso total
                          </Badge>
                        </TableCell>
                        <TableCell>{item.tentativas_falhas || 0}</TableCell>
                        <TableCell>{formatDate(item.ultimo_login_em)}</TableCell>
                        <TableCell>{formatDate(item.bloqueado_em)}</TableCell>
                        <TableCell className="text-right">
                          {item.bloqueado ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() => handleUnlock(item.id)}
                              disabled={unlockingId === item.id}
                            >
                              <UnlockKeyhole className="mr-2 h-4 w-4" />
                              {unlockingId === item.id ? 'Liberando...' : 'Liberar'}
                            </Button>
                          ) : (
                            <span className="text-sm text-muted-foreground">Gestao liberada</span>
                          )}
                        </TableCell>
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
