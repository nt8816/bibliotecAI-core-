import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Library, Loader2, Eye, EyeOff } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  activateStudentMatricula,
  registerPlatformSuperAdminFailedAttempt,
  registerPlatformSuperAdminLoginSuccess,
  resolvePlatformLoginIdentifier,
} from '@/services/authService';

const loginSchema = z.object({
  login: z.string().trim().min(2, 'Informe seu CPF ou matrícula'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

const EXACT_LOCATION_MAX_ACCURACY_METERS = 100;
const DESKTOP_LOCATION_MAX_ACCURACY_METERS = 10000;

function getCurrentPosition() {
  if (!navigator?.geolocation?.getCurrentPosition) {
    return Promise.reject(new Error('Geolocalizacao nao suportada'));
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 0,
    });
  });
}

async function reverseGeocodeCity(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    localityLanguage: 'pt',
  });

  const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Falha ao resolver cidade (${response.status})`);
  }

  const data = await response.json();
  return {
    city: data.city || data.locality || data.principalSubdivision || null,
    principalSubdivision: data.principalSubdivision || null,
    countryName: data.countryName || null,
    locality: data.locality || null,
  };
}

async function captureSecurityLocationContext() {
  const baseContext = {
    user_agent: navigator?.userAgent || null,
    language: navigator?.language || null,
    requested_high_accuracy: true,
  };

  try {
    const position = await getCurrentPosition();
    const latitude = Number(position.coords?.latitude);
    const longitude = Number(position.coords?.longitude);
    const accuracy = Number(position.coords?.accuracy);

    let cityData = {
      city: null,
      principalSubdivision: null,
      countryName: null,
      locality: null,
      error: null,
    };

    try {
      cityData = {
        ...(await reverseGeocodeCity(latitude, longitude)),
        error: null,
      };
    } catch (error) {
      cityData = {
        ...cityData,
        error: error?.message || 'Falha ao resolver cidade',
      };
    }

    return {
      ...baseContext,
      geolocation_status: 'captured',
      city: cityData.city,
      locality: cityData.locality,
      state: cityData.principalSubdivision,
      country: cityData.countryName,
      reverse_geocode_error: cityData.error,
      coordinates: {
        latitude: Number.isFinite(latitude) ? latitude : null,
        longitude: Number.isFinite(longitude) ? longitude : null,
        accuracy_meters: Number.isFinite(accuracy) ? accuracy : null,
      },
    };
  } catch (error) {
    return {
      ...baseContext,
      geolocation_status: 'unavailable',
      geolocation_error: error?.message || 'Falha ao capturar geolocalizacao',
    };
  }
}

function hasExactLocation(context) {
  const accuracy = Number(context?.coordinates?.accuracy_meters);
  const userAgent = String(navigator?.userAgent || '').toLowerCase();
  const isDesktop = !/android|iphone|ipad|ipod|mobile/i.test(userAgent);
  const maxAccuracy = isDesktop ? DESKTOP_LOCATION_MAX_ACCURACY_METERS : EXACT_LOCATION_MAX_ACCURACY_METERS;

  return context?.geolocation_status === 'captured'
    && Number.isFinite(accuracy)
    && accuracy > 0
    && accuracy <= maxAccuracy;
}

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authAlert, setAuthAlert] = useState(null);
  const [formData, setFormData] = useState({
    login: '',
    password: '',
  });
  const [errors, setErrors] = useState({});

  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const loginWithIdentifier = async (login, password) => {
    const normalized = login.trim();
    const loginResolution = await resolvePlatformLoginIdentifier(normalized);
    const superAdminMatch = loginResolution?.superAdminMatch;

    if (superAdminMatch?.matched) {
      if (superAdminMatch?.bloqueado || superAdminMatch?.ativo === false) {
        return {
          error: {
            message: 'Conta de Super Admin bloqueada. Outro Super Admin precisa fazer a liberacao.',
          },
        };
      }

      const locationContext = await captureSecurityLocationContext();
      if (!hasExactLocation(locationContext)) {
        return {
          error: {
            message: 'O Super Admin precisa compartilhar a localizacao do dispositivo para entrar. Em celular, use localizacao precisa. Em computador, permita a localizacao do navegador.',
            exactLocationRequired: true,
          },
        };
      }

      const superAdminEmail = String(superAdminMatch?.email || '').trim().toLowerCase();
      const result = await signIn(superAdminEmail, password);

      if (!result.error) {
        await registerPlatformSuperAdminLoginSuccess(superAdminEmail);
        return result;
      }

      if (result.error.message === 'Invalid login credentials') {
        const securityContext = await captureSecurityLocationContext();
        const failedAttemptData = await registerPlatformSuperAdminFailedAttempt(normalized, securityContext);

        if (failedAttemptData?.blocked) {
          return {
            error: {
              message: 'Usuario bloqueado. Fale com seu parceiro ou superior para solicitar a liberacao.',
              blocked: true,
            },
          };
        }

        return {
          error: {
            message: `Senha incorreta para Super Admin. Tentativas restantes: ${failedAttemptData?.remaining ?? 0}.`,
          },
        };
      }

      return result;
    }

    if (normalized.includes('@')) {
      return signIn(normalized.toLowerCase(), password);
    }

    const cpfDigits = normalized.replace(/\D/g, '');
    const cpfCandidate = cpfDigits.length === 11 ? `${cpfDigits}@temp.bibliotecai.com` : null;
    const matriculaCompacta = normalized.replace(/\s+/g, '');
    const matriculaSomenteAlfanumerica = normalized.replace(/[^A-Za-z0-9]/g, '');
    const matriculaCandidates = [...new Set([matriculaCompacta, matriculaSomenteAlfanumerica].filter(Boolean))];
    const candidates = [...matriculaCandidates.map((matricula) => `${matricula}@temp.bibliotecai.com`)];
    if (cpfCandidate) candidates.unshift(cpfCandidate);

    if (loginResolution?.cpfEmail) {
      candidates.unshift(String(loginResolution.cpfEmail).toLowerCase());
    }

    if (loginResolution?.matriculaActivated === false) {
      let activationData;
      try {
        activationData = await activateStudentMatricula(matriculaCompacta || normalized, password);
      } catch (activationInvokeError) {
        return {
          error: {
            message: activationInvokeError.message || 'Não foi possível ativar sua conta por matrícula.',
          },
        };
      }

      if (!activationData?.success) {
        return {
          error: {
            message: activationData?.error || 'Não foi possível ativar sua conta por matrícula.',
          },
        };
      }

      if (activationData?.email) {
        candidates.unshift(String(activationData.email).toLowerCase());
      }
    }

    if (loginResolution?.matriculaEmail) {
      candidates.unshift(String(loginResolution.matriculaEmail).toLowerCase());
    }

    let lastError = null;

    for (const candidate of [...new Set(candidates)]) {
      const result = await signIn(candidate, password);

      if (!result.error) {
        return result;
      }

      lastError = result.error;

      // Stop fallback chain for non-auth errors.
      if (result.error.message !== 'Invalid login credentials') {
        break;
      }
    }

    return { error: lastError };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrors({});
    setAuthAlert(null);
    setLoading(true);

    try {
      const result = loginSchema.safeParse(formData);

      if (!result.success) {
        const fieldErrors = {};

        result.error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0]] = err.message;
          }
        });

        setErrors(fieldErrors);
        setLoading(false);
        return;
      }

      const { error } = await loginWithIdentifier(formData.login, formData.password);

      if (error) {
        if (error.blocked) {
          setAuthAlert({
            title: 'USUARIO BLOQUEADO',
            description: 'Fale com seu parceiro ou superior para solicitar a liberacao da conta.',
          });
        } else if (error.exactLocationRequired) {
          setAuthAlert({
            title: 'LOCALIZACAO EXATA OBRIGATORIA',
            description: 'Para proteger a plataforma, o acesso de Super Admin exige localizacao precisa do dispositivo.',
          });
        }

        toast({
          variant: 'destructive',
          title: 'Erro ao entrar',
          description:
            error.message === 'Invalid login credentials'
              ? 'CPF/matrícula ou senha incorretos'
              : error.message,
        });

        return;
      }

      toast({
        title: 'Bem-vindo!',
        description: 'Login realizado com sucesso.',
      });
    } catch (_error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Ocorreu um erro inesperado. Tente novamente.',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-login-page min-h-screen flex items-center justify-center p-3 sm:p-4 overflow-hidden">
      <div className="auth-bg-grid" aria-hidden="true" />
      <div className="auth-orb auth-orb-1" aria-hidden="true" />
      <div className="auth-orb auth-orb-2" aria-hidden="true" />
      <div className="auth-orb auth-orb-3" aria-hidden="true" />

      <Card className="auth-login-card w-full max-w-[560px] sm:max-w-md border-border/70 shadow-2xl" translate="no">
        <CardHeader className="text-center space-y-3 px-4 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-3">
          <div className="auth-logo-wrap mx-auto w-16 h-16 rounded-full bg-primary flex items-center justify-center">
            <Library className="w-8 h-8 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl font-bold">BibliotecAI</CardTitle>
          <CardDescription>Entre com CPF (gestor) ou matrícula (aluno). Para aluno, use a matrícula também na senha inicial.</CardDescription>
        </CardHeader>

        <CardContent className="px-4 pb-5 sm:px-6 sm:pb-6 pt-0">
          <form onSubmit={handleSubmit} className="space-y-4 auth-login-form w-full">
            {authAlert && (
              <div className="rounded-lg border border-destructive/60 bg-destructive/10 px-4 py-3 text-left">
                <p className="text-sm font-bold text-destructive">{authAlert.title}</p>
                <p className="text-sm text-destructive/90">{authAlert.description}</p>
              </div>
            )}
            <div className="space-y-2 auth-field auth-field-1">
              <Label htmlFor="login">CPF ou matrícula</Label>
              <Input
                id="login"
                type="text"
                autoComplete="username"
                placeholder="CPF (somente números) ou matrícula"
                value={formData.login}
                onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                disabled={loading}
                className="auth-input transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary/60"
              />
              {errors.login && <p className="text-sm text-destructive">{errors.login}</p>}
            </div>

            <div className="space-y-2 auth-field auth-field-2">
              <Label htmlFor="password">Senha</Label>
              <div className="relative auth-password-wrap">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  disabled={loading}
                  className="auth-input pr-11 transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary/60"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="auth-password-toggle absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  )}
                </Button>
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>

            <Button type="submit" className="w-full auth-login-button auth-field auth-field-3" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Entrar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
