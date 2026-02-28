import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { Loader2, Moon, Settings, Shield, SlidersHorizontal, Sun, UserRound } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AccessibilityControls } from '@/components/accessibility/AccessibilityControls';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

const emptyProfile = {
  id: null,
  nome: '',
  telefone: '',
  cpf: '',
  turma: '',
  matricula: '',
};

const roleLabel = {
  super_admin: 'Super Admin',
  gestor: 'Gestor',
  bibliotecaria: 'Bibliotecária',
  professor: 'Professor',
  aluno: 'Aluno',
};

export default function Configuracoes() {
  const navigate = useNavigate();
  const { userRole, user, isGestor, isBibliotecaria } = useAuth();
  const { toast } = useToast();
  const { theme, setTheme } = useTheme();
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profile, setProfile] = useState(emptyProfile);

  const canManageSchool = isGestor || isBibliotecaria;

  const roleBadgeLabel = useMemo(() => roleLabel[userRole] || 'sem papel', [userRole]);

  const loadProfile = useCallback(async () => {
    if (!user?.id) {
      setProfile(emptyProfile);
      setLoadingProfile(false);
      return;
    }

    setLoadingProfile(true);
    try {
      const { data, error } = await supabase
        .from('usuarios_biblioteca')
        .select('id, nome, telefone, cpf, turma, matricula')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      setProfile({
        id: data?.id || null,
        nome: data?.nome || '',
        telefone: data?.telefone || '',
        cpf: data?.cpf || '',
        turma: data?.turma || '',
        matricula: data?.matricula || '',
      });
    } catch (error) {
      console.error('Erro ao carregar perfil:', error);
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível carregar seus dados.',
      });
    } finally {
      setLoadingProfile(false);
    }
  }, [toast, user?.id]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSaveProfile = async () => {
    if (!profile.nome.trim()) {
      toast({
        variant: 'destructive',
        title: 'Nome obrigatório',
        description: 'Informe seu nome para salvar as configurações.',
      });
      return;
    }

    if (!profile.id) {
      toast({
        variant: 'destructive',
        title: 'Perfil não encontrado',
        description: 'Não foi possível identificar seu cadastro para atualizar.',
      });
      return;
    }

    setSavingProfile(true);
    try {
      const payload = {
        nome: profile.nome.trim(),
        telefone: profile.telefone.trim() || null,
        cpf: profile.cpf.trim() || null,
        turma: profile.turma.trim() || null,
      };

      const { error } = await supabase.from('usuarios_biblioteca').update(payload).eq('id', profile.id);
      if (error) throw error;

      const { error: authError } = await supabase.auth.updateUser({
        data: { nome: payload.nome },
      });
      if (authError) {
        console.error('Falha ao atualizar user_metadata:', authError);
      }

      toast({
        title: 'Dados atualizados',
        description: 'Suas informações foram salvas com sucesso.',
      });
    } catch (error) {
      console.error('Erro ao salvar perfil:', error);
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: error?.message || 'Não foi possível salvar suas informações.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <MainLayout title="Configurações">
      <div className="space-y-4 sm:space-y-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <UserRound className="size-4 sm:size-5" />
              Meu Perfil
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="nome">Nome</Label>
                <Input
                  id="nome"
                  value={profile.nome}
                  disabled={loadingProfile || savingProfile}
                  onChange={(e) => setProfile((prev) => ({ ...prev, nome: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="telefone">Telefone</Label>
                <Input
                  id="telefone"
                  value={profile.telefone}
                  disabled={loadingProfile || savingProfile}
                  onChange={(e) => setProfile((prev) => ({ ...prev, telefone: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="cpf">CPF</Label>
                <Input
                  id="cpf"
                  value={profile.cpf}
                  disabled={loadingProfile || savingProfile}
                  onChange={(e) => setProfile((prev) => ({ ...prev, cpf: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="turma">Turma</Label>
                <Input
                  id="turma"
                  value={profile.turma}
                  disabled={loadingProfile || savingProfile}
                  onChange={(e) => setProfile((prev) => ({ ...prev, turma: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="matricula">Matrícula</Label>
                <Input id="matricula" value={profile.matricula} disabled />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleSaveProfile} disabled={loadingProfile || savingProfile}>
                {savingProfile ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
                Salvar informações
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Settings className="size-4 sm:size-5" />
              Preferências Gerais
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Acessibilidade</p>
                <p className="text-xs text-muted-foreground">Ajuste tamanho de fonte, contraste e movimento.</p>
              </div>
              <AccessibilityControls />
            </div>

            <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium">Tema do Sistema</p>
                <p className="text-xs text-muted-foreground">Escolha entre claro, escuro ou seguir o sistema.</p>
              </div>
              <div className="w-full sm:w-52">
                <Select value={theme || 'system'} onValueChange={setTheme}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tema" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="system">Sistema</SelectItem>
                    <SelectItem value="light">
                      <span className="inline-flex items-center gap-2"><Sun className="size-3.5" />Claro</span>
                    </SelectItem>
                    <SelectItem value="dark">
                      <span className="inline-flex items-center gap-2"><Moon className="size-3.5" />Escuro</span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-lg border p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <UserRound className="size-4" />
                Conta atual
              </div>
              <p className="text-sm text-muted-foreground break-all">{user?.email || '-'}</p>
              <div>
                <Badge variant="secondary">{roleBadgeLabel}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <SlidersHorizontal className="size-4 sm:size-5" />
              Atalhos de Configuração
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {canManageSchool && (
              <Button className="justify-start gap-2" variant="outline" onClick={() => navigate('/configuracao-escola')}>
                <Shield className="size-4" />
                Configuração da Escola
              </Button>
            )}
            {canManageSchool && (
              <Button className="justify-start gap-2" variant="outline" onClick={() => navigate('/tokens')}>
                <Shield className="size-4" />
                Tokens de Convite
              </Button>
            )}
            <Button className="justify-start gap-2" variant="outline" onClick={() => navigate('/dashboard')}>
              <Settings className="size-4" />
              Voltar ao Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
