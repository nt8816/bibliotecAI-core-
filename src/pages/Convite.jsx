import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Library, Loader2, XCircle } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { signInWithPlatform } from '@/services/authService';
import { fetchConviteContext, registerViaConvite } from '@/services/inviteService';

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
      return 'Esta conta ja esta cadastrada. Verifique seus dados ou faca login.';
    }

    return message;
  };

  const verificarToken = useCallback(async () => {
    try {
      const payload = await fetchConviteContext(token);

      if (!payload?.success || !payload?.tokenInfo) {
        setInvalidToken(true);
      } else {
        setTokenInfo(payload.tokenInfo);
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
        toast({ title: 'Erro', description: 'Informe a matricula.', variant: 'destructive' });
        return;
      }

      if (matricula.trim().length < 6) {
        toast({
          title: 'Erro',
          description: 'A matricula deve ter pelo menos 6 caracteres para ser usada como senha.',
          variant: 'destructive',
        });
        return;
      }
    } else {
      if (senha !== confirmarSenha) {
        toast({ title: 'Erro', description: 'As senhas nao coincidem.', variant: 'destructive' });
        return;
      }

      if (senha.length < 6) {
        toast({ title: 'Erro', description: 'A senha deve ter pelo menos 6 caracteres.', variant: 'destructive' });
        return;
      }
    }

    setSubmitting(true);

    try {
      const data = await registerViaConvite({
        token,
        nome,
        email: isAlunoInvite ? undefined : email,
        senha: isAlunoInvite ? undefined : senha,
        matricula: isAlunoInvite ? matricula.trim() : undefined,
      });

      if (!data?.success) {
        throw new Error(mapSignupError(data?.error || 'Erro ao registrar'));
      }

      toast({
        title: 'Cadastro realizado!',
        description: `Sua conta foi criada com sucesso como ${getRoleLabel(data.role)}.`,
      });

      const authEmail = isAlunoInvite
        ? `${matricula.trim().replace(/\s+/g, '')}@temp.bibliotecai.com`
        : email.trim().toLowerCase();
      const authPassword = isAlunoInvite ? matricula.trim() : senha;

      const { error: signInError } = await signInWithPlatform(authEmail, authPassword);

      if (signInError) {
        toast({
          title: 'Conta criada com sucesso',
          description: isAlunoInvite
            ? 'Faca login com matricula no usuario e na senha.'
            : 'Faca login para continuar.',
        });

        navigate('/auth', { replace: true });
        return;
      }

      navigate(getRedirectPathByRole(data.role), { replace: true });
    } catch (error) {
      console.error('Error during signup:', error);
      toast({
        title: 'Erro no cadastro',
        description: mapSignupError(error?.message || ''),
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
      bibliotecaria: 'Bibliotecaria',
    };

    return labels[role] || role;
  };

  const getRedirectPathByRole = (role) => {
    if (role === 'aluno') return '/aluno/perfil';
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
            <h2 className="text-xl font-bold mb-2">Link invalido ou expirado</h2>
            <p className="text-muted-foreground mb-6">
              Este link de convite nao e mais valido. Entre em contato com o gestor da escola para solicitar um novo convite.
            </p>
            <Button onClick={() => navigate('/auth')} variant="outline">Ir para login</Button>
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
              <Label htmlFor="nome">Nome completo</Label>
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
                  <Label htmlFor="matricula">Matricula</Label>
                  <Input
                    id="matricula"
                    value={matricula}
                    onChange={(e) => setMatricula(e.target.value)}
                    placeholder="Ex: 202400123"
                    required
                  />
                </div>

                <p className="text-sm text-muted-foreground">
                  Para alunos, a matricula será usada como usuario e senha inicial.
                </p>
                <p className="text-xs text-muted-foreground">
                  Depois do primeiro acesso, você pode alterar sua senha em Configurações.
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
                    placeholder="Minimo 6 caracteres"
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmarSenha">Confirmar senha</Label>
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
                'Criar conta'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

