import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Library, Loader2, XCircle } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

export default function Convite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [tokenInfo, setTokenInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [invalidToken, setInvalidToken] = useState(false);

  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [matricula, setMatricula] = useState('');

  const isAlunoInvite = tokenInfo?.role_destino === 'aluno';

  const mapSignupError = (message) => {
    if (!message) return 'Não foi possível criar sua conta.';

    if (
      message.includes('already been registered')
      || message.includes('already registered')
      || message.includes('User already registered')
    ) {
      return 'Esta conta já está cadastrada. Verifique seus dados ou faça login.';
    }

    return message;
  };

  const verificarToken = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('tokens_convite')
        .select('id, role_destino, escola_id, expira_em')
        .eq('token', token)
        .eq('ativo', true)
        .is('usado_por', null)
        .gt('expira_em', new Date().toISOString())
        .maybeSingle();

      if (error || !data) {
        setInvalidToken(true);
      } else {
        setTokenInfo(data);
      }
    } catch (error) {
      console.error('Error verifying token:', error);
      setInvalidToken(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      verificarToken();
    }
  }, [token, verificarToken]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!token) return;

    if (isAlunoInvite) {
      if (!matricula.trim()) {
        toast({ title: 'Erro', description: 'Informe a matrícula.', variant: 'destructive' });
        return;
      }

      if (matricula.trim().length < 6) {
        toast({
          title: 'Erro',
          description: 'A matrícula deve ter pelo menos 6 caracteres para ser usada como senha.',
          variant: 'destructive',
        });
        return;
      }
    } else {
      if (senha !== confirmarSenha) {
        toast({ title: 'Erro', description: 'As senhas não coincidem.', variant: 'destructive' });
        return;
      }

      if (senha.length < 6) {
        toast({ title: 'Erro', description: 'A senha deve ter pelo menos 6 caracteres.', variant: 'destructive' });
        return;
      }
    }

    setSubmitting(true);

    try {
      const { data, error } = await supabase.functions.invoke('registrar-via-convite', {
        body: {
          token,
          nome,
          email: isAlunoInvite ? undefined : email,
          senha: isAlunoInvite ? undefined : senha,
          matricula: isAlunoInvite ? matricula.trim() : undefined,
        },
      });

      if (error) {
        let backendMessage = error.message || 'Não foi possível criar sua conta.';

        try {
          const parsed = await error.context?.json?.();
          if (parsed?.error) {
            backendMessage = parsed.error;
          }
        } catch (_parseError) {
          // keep message from error object
        }

        throw new Error(mapSignupError(backendMessage));
      }

      if (!data?.success) {
        throw new Error(mapSignupError(data?.error || 'Erro ao registrar'));
      }

      toast({
        title: 'Cadastro realizado!',
        description: `Sua conta foi criada com sucesso como ${getRoleLabel(data.role)}.`,
      });

      const authEmail = data?.auth_email || email;
      const authPassword = data?.auth_password || senha;

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword,
      });

      if (signInError) {
        toast({
          title: 'Conta criada com sucesso',
          description: isAlunoInvite
            ? 'Faça login com matrícula no usuário e na senha.'
            : 'Faça login para continuar.',
        });

        navigate('/auth', { replace: true });
        return;
      }

      navigate(getRedirectPathByRole(data.role), { replace: true });
    } catch (error) {
      console.error('Error during signup:', error);
      toast({
        title: 'Erro no cadastro',
        description: mapSignupError(error.message),
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const getRoleLabel = (role) => {
    const labels = {
      aluno: 'Aluno',
      professor: 'Professor(a)',
      bibliotecaria: 'Bibliotecária',
    };

    return labels[role] || role;
  };

  const getRedirectPathByRole = (role) => {
    if (role === 'aluno') return '/aluno/painel';
    if (role === 'professor') return '/professor/painel';
    if (role === 'bibliotecaria') return '/dashboard';
    return '/dashboard';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (invalidToken) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <XCircle className="w-16 h-16 mx-auto text-destructive mb-4" />
            <h2 className="text-xl font-bold mb-2">Link Inválido ou Expirado</h2>
            <p className="text-muted-foreground mb-6">
              Este link de convite não é mais válido. Entre em contato com o gestor da escola para solicitar um novo convite.
            </p>
            <Button onClick={() => navigate('/auth')} variant="outline">Ir para Login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-primary flex items-center justify-center">
            <Library className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle>Bem-vindo ao BibliotecAI</CardTitle>
          <CardDescription>
            Você foi convidado como <strong>{getRoleLabel(tokenInfo?.role_destino || '')}</strong>. Complete seu cadastro abaixo.
          </CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="nome">Nome Completo</Label>
              <Input
                id="nome"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Seu nome completo"
                required
              />
            </div>

            {isAlunoInvite ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="matricula">Matrícula</Label>
                  <Input
                    id="matricula"
                    value={matricula}
                    onChange={(e) => setMatricula(e.target.value)}
                    placeholder="Ex: 202400123"
                    required
                  />
                </div>

                <p className="text-sm text-muted-foreground">
                  Para alunos, a matrícula será usada como usuário e senha inicial.
                </p>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="email">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seu@email.com"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="senha">Senha</Label>
                  <Input
                    id="senha"
                    type="password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmarSenha">Confirmar Senha</Label>
                  <Input
                    id="confirmarSenha"
                    type="password"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                    placeholder="Repita a senha"
                    required
                  />
                </div>
              </>
            )}

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando conta...
                </>
              ) : (
                'Criar Conta'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
