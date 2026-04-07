import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { z } from 'zod';
import { Loader2, Eye, EyeOff, QrCode, ShieldCheck, Smartphone, MonitorSmartphone, MailCheck } from 'lucide-react';

import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import {
  activateStudentMatricula,
  approveSuperAdminDesktopAccess,
  beginSuperAdminLogin,
  beginSuperAdminPasskeyAuthentication,
  beginSuperAdminPasskeyRegistration,
  fetchPlatformCurrentRoles,
  fetchSuperAdminDesktopApprovalStatus,
  fetchSuperAdminSecurityProfile,
  finalizePlatformSession,
  finishSuperAdminPasskeyAuthentication,
  finishSuperAdminPasskeyRegistration,
  registerPlatformSuperAdminLoginSuccess,
  sendSuperAdminEmailCode,
  startSuperAdminDesktopApproval,
  verifySuperAdminEmailCode,
} from '@/services/authService';
import {
  createPlatformPasskey,
  getPlatformPasskeyAssertion,
  isLocalPlatformAuthenticatorAvailable,
  isPlatformPasskeySupported,
} from '@/lib/webauthn';
import {
  getBrowserNotificationPermission,
  requestBrowserNotificationPermission,
  supportsBrowserNotifications,
} from '@/lib/browserNotifications';

const SUPER_ADMIN_DESKTOP_RESUME_KEY = 'super_admin_desktop_resume';

const loginSchema = z.object({
  login: z.string().trim().min(2, 'Informe seu CPF ou matrícula'),
  password: z.string().min(6, 'Senha deve ter pelo menos 6 caracteres'),
});

function isMobileDevice() {
  return /android|iphone|ipad|ipod|mobile/i.test(String(navigator?.userAgent || '').toLowerCase());
}

function isAndroidDevice() {
  return String(navigator?.userAgent || '').toLowerCase().includes('android');
}

function isAndroidChromeFamily() {
  const userAgent = String(navigator?.userAgent || '').toLowerCase();
  const isAndroid = userAgent.includes('android');
  const isChromeFamily = userAgent.includes('chrome') || userAgent.includes('crios');
  return isAndroid && isChromeFamily;
}

function buildSecurityContext() {
  return {
    app_origin: window?.location?.origin || null,
    user_agent: navigator?.userAgent || null,
    language: navigator?.language || null,
  };
}

function maskIdentifier(value) {
  return String(value || '').replace(/(^.).*(@.*$)/, '$1***$2');
}

function getDesktopApprovalToken() {
  return new URLSearchParams(window.location.search).get('desktopApproval') || '';
}

function saveDesktopResumeState(value) {
  try {
    if (!value) {
      window.sessionStorage.removeItem(SUPER_ADMIN_DESKTOP_RESUME_KEY);
      return;
    }
    window.sessionStorage.setItem(SUPER_ADMIN_DESKTOP_RESUME_KEY, JSON.stringify(value));
  } catch {
    // Ignore storage errors.
  }
}

function readDesktopResumeState() {
  try {
    const raw = window.sessionStorage.getItem(SUPER_ADMIN_DESKTOP_RESUME_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const expiresAt = String(parsed?.desktopExpiresAt || '').trim();
    if (expiresAt && !Number.isNaN(Date.parse(expiresAt)) && new Date(expiresAt).getTime() <= Date.now()) {
      window.sessionStorage.removeItem(SUPER_ADMIN_DESKTOP_RESUME_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export default function Auth() {
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [authAlert, setAuthAlert] = useState(null);
  const [securityStep, setSecurityStep] = useState('login');
  const [formData, setFormData] = useState({ login: '', password: '' });
  const [errors, setErrors] = useState({});
  const [pendingSecurity, setPendingSecurity] = useState(null);
  const [otpCode, setOtpCode] = useState('');
  const [otpMeta, setOtpMeta] = useState(null);
  const [desktopStatus, setDesktopStatus] = useState(null);
  const [finalizingDesktop, setFinalizingDesktop] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState(getBrowserNotificationPermission);

  const desktopApprovalTokenRef = useRef(getDesktopApprovalToken());
  const { signIn, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user || pendingSecurity) return;
    const stored = readDesktopResumeState();
    if (!stored?.desktopToken || !stored?.pendingSession) return;
    setPendingSecurity(stored);
    setSecurityStep(stored?.approved ? 'desktop_resuming' : 'desktop_waiting');
  }, [pendingSecurity, user]);

  useEffect(() => {
    if (user && pendingSecurity) {
      saveDesktopResumeState(null);
      setPendingSecurity(null);
      setSecurityStep('login');
    }
  }, [pendingSecurity, user]);

  useEffect(() => {
    if (user && !pendingSecurity) {
      fetchPlatformCurrentRoles()
        .then((roles) => {
          if (roles.includes('super_admin')) {
            navigate('/admin/tenants', { replace: true });
            return;
          }
          navigate('/dashboard', { replace: true });
        })
        .catch(() => {
          navigate('/dashboard', { replace: true });
        });
    }
  }, [navigate, pendingSecurity, user]);

  useEffect(() => {
    if (!pendingSecurity?.desktopToken || !pendingSecurity?.pendingSession) return;
    saveDesktopResumeState({
      ...pendingSecurity,
      securityStep,
    });
  }, [pendingSecurity, securityStep]);

  useEffect(() => {
    setNotificationPermission(getBrowserNotificationPermission());
  }, []);

  useEffect(() => {
    if (!pendingSecurity?.desktopToken || !pendingSecurity?.approved || securityStep !== 'desktop_resuming' || finalizingDesktop) {
      return undefined;
    }

    let active = true;
    const resumeLogin = async () => {
      try {
        setFinalizingDesktop(true);
        await finalizePlatformSession(pendingSecurity.pendingSession);
        if (!active) return;
        saveDesktopResumeState(null);
        setPendingSecurity(null);
        setSecurityStep('login');
        await registerPlatformSuperAdminLoginSuccess(pendingSecurity.email, {
          desktopChallengeToken: pendingSecurity.desktopToken,
          context: pendingSecurity.context,
        }).catch(() => null);
        toast({
          title: 'Acesso liberado',
          description: 'O computador retomou o login apos a aprovacao no celular.',
        });
        navigate('/admin/tenants', { replace: true });
      } catch (error) {
        if (!active) return;
        setFinalizingDesktop(false);
        const currentMessage = String(error?.message || '').toLowerCase();
        const sessionInvalid =
          currentMessage.includes('sessao temporaria invalida')
          || currentMessage.includes('jwt')
          || currentMessage.includes('token')
          || currentMessage.includes('refresh');
        if (sessionInvalid) {
          saveDesktopResumeState(null);
          setPendingSecurity(null);
          setSecurityStep('login');
        } else {
          saveDesktopResumeState({
            ...pendingSecurity,
            approved: false,
          });
          setSecurityStep('desktop_waiting');
        }
        setAuthAlert({
          title: 'ERRO AO RETOMAR O LOGIN',
          description: sessionInvalid
            ? 'A aprovacao expirou ou a sessao temporaria nao e mais valida. Entre novamente para gerar uma nova liberacao.'
            : (error?.message || 'Não foi possível concluir o login do computador após a aprovação no celular.'),
        });
      }
    };

    resumeLogin();
    return () => {
      active = false;
    };
  }, [finalizingDesktop, navigate, pendingSecurity, securityStep, toast]);

  useEffect(() => {
    if (!pendingSecurity?.desktopToken || securityStep !== 'desktop_waiting') return undefined;

    let active = true;
    const poll = async () => {
      try {
        const expiresAt = String(pendingSecurity?.desktopExpiresAt || '').trim();
        if (expiresAt && !Number.isNaN(Date.parse(expiresAt)) && new Date(expiresAt).getTime() <= Date.now()) {
          saveDesktopResumeState(null);
          setPendingSecurity(null);
          setSecurityStep('login');
          setDesktopStatus(null);
          setAuthAlert({
            title: 'APROVACAO EXPIRADA',
            description: 'O QR Code expirou. Faça login novamente para gerar uma nova aprovacao no celular.',
          });
          return;
        }

        const status = await fetchSuperAdminDesktopApprovalStatus(pendingSecurity.desktopToken);
        if (!active) return;
        setDesktopStatus(status);

        if (status?.approved && !finalizingDesktop) {
          saveDesktopResumeState({
            ...pendingSecurity,
            approved: true,
          });
          window.location.reload();
          return;
        }
      } catch (error) {
        if (!active) return;
        const message = String(error?.message || '').toLowerCase();
        const expired =
          message.includes('expir')
          || message.includes('challenge')
          || message.includes('not found')
          || message.includes('404');
        if (expired) {
          saveDesktopResumeState(null);
          setPendingSecurity(null);
          setSecurityStep('login');
          setDesktopStatus(null);
          setAuthAlert({
            title: 'APROVACAO INDISPONIVEL',
            description: 'Essa aprovacao do computador nao esta mais disponivel. Faça login novamente para gerar outra.',
          });
          return;
        }
        setAuthAlert({
          title: 'ERRO NA LIBERACAO DO COMPUTADOR',
          description: error?.message || 'Não foi possível consultar o status da aprovacao.',
        });
      }
    };

    poll();
    const interval = window.setInterval(poll, 3000);
    const handleFocus = () => {
      poll();
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleFocus);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleFocus);
    };
  }, [finalizingDesktop, pendingSecurity, securityStep]);

  const finishSuperAdminLogin = async ({ pendingSession, email, context, mfaChallengeId, desktopChallengeToken }) => {
    await finalizePlatformSession(pendingSession);
    saveDesktopResumeState(null);
    await registerPlatformSuperAdminLoginSuccess(email, {
      context,
      mfaChallengeId,
      desktopChallengeToken,
    }).catch(() => null);
    setPendingSecurity(null);
    setSecurityStep('login');
    toast({
      title: 'Acesso super admin autorizado',
      description: 'Camadas extras de seguranca confirmadas com sucesso.',
    });
    navigate('/admin/tenants', { replace: true });
  };

  const triggerEmailVerification = async (nextPending, challengeId) => {
    const response = await sendSuperAdminEmailCode(nextPending.pendingAccessToken, challengeId);
    setOtpMeta({
      challengeId,
      maskedEmail: response?.maskedEmail || maskIdentifier(nextPending.email),
      expiresAt: response?.expiresAt || null,
    });
    setPendingSecurity(nextPending);
    setSecurityStep('email_verification');
    toast({
      title: 'Codigo enviado',
      description: `Enviamos um codigo adicional para ${response?.maskedEmail || maskIdentifier(nextPending.email)}.`,
    });
  };

  const runPasskeyAuthentication = async (nextPending, overrideContext) => {
    const authOptions = await beginSuperAdminPasskeyAuthentication(nextPending.pendingAccessToken, overrideContext || nextPending.context);
    const assertion = await getPlatformPasskeyAssertion(authOptions.publicKey);
    const verification = await finishSuperAdminPasskeyAuthentication(nextPending.pendingAccessToken, {
      challenge: authOptions.publicKey.challenge,
      credential: assertion,
    });

    const updatedPending = {
      ...nextPending,
      mfaChallengeId: verification.challengeId,
      requiresEmailVerification: verification.requiresEmailVerification === true,
    };

    if (desktopApprovalTokenRef.current) {
      await approveSuperAdminDesktopAccess(
        updatedPending.pendingAccessToken,
        desktopApprovalTokenRef.current,
        verification.challengeId,
      );
      saveDesktopResumeState(null);
      setPendingSecurity(null);
      setSecurityStep('mobile_approved');
      toast({
        title: 'Computador liberado',
        description: 'A aprovacao biometrica foi enviada para o computador com sucesso.',
      });
      return;
    }

    if (verification.requiresEmailVerification) {
      await triggerEmailVerification(updatedPending, verification.challengeId);
      return;
    }

    await finishSuperAdminLogin({
      pendingSession: updatedPending.pendingSession,
      email: updatedPending.email,
      context: updatedPending.context,
      mfaChallengeId: verification.challengeId,
    });
  };

  const enrollPasskey = async (nextPending) => {
    if (!isPlatformPasskeySupported()) {
      throw new Error('Este dispositivo nao suporta passkey biometrica. Use um celular com Android/iPhone e bloqueio biometrico ativo.');
    }

    if (isAndroidDevice() && !isAndroidChromeFamily()) {
      throw new Error(
        'No Android, a passkey biometrica local deve ser aberta pelo Chrome com o Gerenciador de senhas do Google. Neste navegador o celular pode oferecer apenas chave USB ou outro dispositivo.',
      );
    }

    const localAuthenticatorAvailable = await isLocalPlatformAuthenticatorAvailable();
    if (!localAuthenticatorAvailable) {
      throw new Error(
        isAndroidChromeFamily()
          ? 'O Android não liberou a biometria local deste aparelho para a passkey. Verifique se o bloqueio de tela e a digital estão ativos e se o Gerenciador de senhas do Google está habilitado no Chrome.'
          : 'Este navegador não liberou a biometria local do aparelho para a passkey. Tente no Chrome do celular com bloqueio de tela e digital ativos.',
      );
    }

    const registerOptions = await beginSuperAdminPasskeyRegistration(nextPending.pendingAccessToken, nextPending.context);
    const credential = await createPlatformPasskey(registerOptions.publicKey);
    await finishSuperAdminPasskeyRegistration(nextPending.pendingAccessToken, {
      challenge: registerOptions.publicKey.challenge,
      credential,
      deviceLabel: isMobileDevice() ? 'Celular biometrico do Super Admin' : 'Dispositivo biometrico do Super Admin',
    });

    toast({
      title: 'Passkey cadastrada',
      description: 'Agora vamos validar sua biometria para concluir o acesso.',
    });

    await runPasskeyAuthentication(nextPending);
  };

  const loginWithIdentifier = async (login, password) => {
    const normalized = login.trim();

    if (normalized.includes('@')) {
      return signIn(normalized.toLowerCase(), password);
    }

    try {
      const superAdminStart = await beginSuperAdminLogin(normalized, password, {
        ...buildSecurityContext(),
        device_type: isMobileDevice() ? 'mobile' : 'desktop',
        desktop_approval_token: desktopApprovalTokenRef.current || null,
      });

      if (superAdminStart?.matched) {
        const nextPending = {
          account: superAdminStart?.account || null,
          context: {
            ...buildSecurityContext(),
            device_type: isMobileDevice() ? 'mobile' : 'desktop',
            desktop_approval_token: desktopApprovalTokenRef.current || null,
          },
          email: String(superAdminStart?.email || '').trim().toLowerCase(),
          pendingAccessToken: superAdminStart?.session?.access_token || '',
          pendingSession: superAdminStart?.session || null,
          needsPasskeyEnrollment: superAdminStart?.needsPasskeyEnrollment === true,
          requiresEmailVerification: superAdminStart?.requiresEmailVerification === true,
          deviceType: superAdminStart?.deviceType || (isMobileDevice() ? 'mobile' : 'desktop'),
        };

        if (!nextPending.pendingAccessToken || !nextPending.pendingSession) {
          return {
            error: {
              message: 'Sessao temporaria invalida para o Super Admin.',
            },
          };
        }

        setPendingSecurity(nextPending);

        if (desktopApprovalTokenRef.current) {
          setSecurityStep(nextPending.needsPasskeyEnrollment ? 'passkey_enrollment' : 'mobile_biometric');
          return { success: true };
        }

        if (nextPending.deviceType === 'desktop') {
          const desktopChallenge = await startSuperAdminDesktopApproval(nextPending.pendingAccessToken, nextPending.context);
          setPendingSecurity({
            ...nextPending,
            desktopToken: desktopChallenge.token,
            desktopQrCodeUrl: desktopChallenge.qrCodeUrl,
            desktopApprovalUrl: desktopChallenge.approvalUrl,
            desktopExpiresAt: desktopChallenge.expiresAt,
            approved: false,
          });
          setDesktopStatus(null);
          setSecurityStep('desktop_waiting');
          return { success: true };
        }

        setSecurityStep(nextPending.needsPasskeyEnrollment ? 'passkey_enrollment' : 'mobile_biometric');
        return { success: true };
      }
    } catch (error) {
      const errorMessage = String(error?.message || '');
      if (error?.status === 403 || errorMessage.includes('liberacao') || errorMessage.includes('bloquead')) {
        return {
          error: {
            message: errorMessage || 'Conta de Super Admin bloqueada. Outro Super Admin precisa fazer a liberacao.',
            blocked: true,
          },
        };
      }

      if (error?.status && error.status !== 401 && error.status !== 404) {
        return {
          error: {
            message: errorMessage || 'Falha inesperada no fluxo de seguranca do Super Admin.',
          },
        };
      }
    }

    const cpfDigits = normalized.replace(/\D/g, '');
    const cpfCandidate = cpfDigits.length === 11 ? `${cpfDigits}@temp.bibliotecai.com` : null;
    const matriculaCompacta = normalized.replace(/\s+/g, '');
    const matriculaSomenteAlfanumerica = normalized.replace(/[^A-Za-z0-9]/g, '');
    const matriculaCandidates = [...new Set([matriculaCompacta, matriculaSomenteAlfanumerica].filter(Boolean))];
    const candidates = [...matriculaCandidates.map((matricula) => `${matricula}@temp.bibliotecai.com`)];
    if (cpfCandidate) candidates.unshift(cpfCandidate);

    let lastError = null;

    for (const candidate of [...new Set(candidates)]) {
      const result = await signIn(candidate, password);

      if (!result.error) {
        return result;
      }

      lastError = result.error;
      if (result.error.message !== 'Invalid login credentials') {
        break;
      }
    }

    if (!cpfCandidate && matriculaCandidates.length > 0) {
      try {
        const activationData = await activateStudentMatricula(matriculaCompacta || normalized, password);
        if (activationData?.email) {
          const activatedResult = await signIn(String(activationData.email).toLowerCase(), password);
          if (!activatedResult?.error) {
            return activatedResult;
          }
          lastError = activatedResult.error;
        }
      } catch (activationInvokeError) {
        const activationMessage = String(activationInvokeError?.message || '');
        const shouldIgnoreActivationError =
          activationMessage.includes('Matricula nao encontrada')
          || activationMessage.includes('Matricula invalida')
          || activationMessage.includes('Invalid login credentials');

        if (!shouldIgnoreActivationError) {
          return {
            error: {
              message: activationMessage || 'Não foi possível ativar sua conta por matrícula.',
            },
          };
        }
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
          if (err.path[0]) fieldErrors[err.path[0]] = err.message;
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
        }

        toast({
          variant: 'destructive',
          title: 'Erro ao entrar',
          description: error.message === 'Invalid login credentials' ? 'CPF/matrícula ou senha incorretos' : error.message,
        });
        return;
      }

      if (supportsBrowserNotifications() && getBrowserNotificationPermission() === 'default') {
        const nextPermission = await requestBrowserNotificationPermission().catch(() => 'default');
        setNotificationPermission(nextPermission || getBrowserNotificationPermission());
      }

      if (securityStep === 'login') {
        toast({
          title: 'Bem-vindo!',
          description: 'Login realizado com sucesso.',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: error?.message || 'Ocorreu um erro inesperado. Tente novamente.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleBiometricStep = async () => {
    if (!pendingSecurity) return;
    setLoading(true);
    try {
      if (isAndroidDevice() && !isAndroidChromeFamily()) {
        throw new Error(
          'O navegador atual do Android nao esta oferecendo a biometria local. Abra o login no Chrome do celular para que ele use a digital, o PIN ou a senha do proprio aparelho.',
        );
      }

      const localAuthenticatorAvailable = await isLocalPlatformAuthenticatorAvailable();
      if (!localAuthenticatorAvailable && isMobileDevice()) {
        throw new Error(
          isAndroidChromeFamily()
            ? 'O celular não disponibilizou o autenticador interno. Ative bloqueio de tela, digital e o Gerenciador de senhas do Google no Chrome para usar a biometria do próprio aparelho.'
            : 'O navegador atual não disponibilizou a biometria local do aparelho. Use o Chrome no celular com biometria e bloqueio de tela ativos.',
        );
      }

      if (securityStep === 'passkey_enrollment') {
        await enrollPasskey(pendingSecurity);
      } else {
        await runPasskeyAuthentication(pendingSecurity);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Falha na biometria',
        description: error?.message || 'Não foi possível validar a passkey biometrica.',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyEmailCode = async () => {
    if (!pendingSecurity || !otpMeta?.challengeId || otpCode.trim().length < 6) return;
    setLoading(true);
    try {
      await verifySuperAdminEmailCode(pendingSecurity.pendingAccessToken, otpMeta.challengeId, otpCode.trim());
      await finishSuperAdminLogin({
        pendingSession: pendingSecurity.pendingSession,
        email: pendingSecurity.email,
        context: pendingSecurity.context,
        mfaChallengeId: otpMeta.challengeId,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Codigo invalido',
        description: error?.message || 'Não foi possível concluir a verificacao adicional.',
      });
    } finally {
      setLoading(false);
    }
  };

  const renderSecurityPanel = () => {
    if (securityStep === 'desktop_resuming' && pendingSecurity) {
      return (
        <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Loader2 className="mt-0.5 h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-semibold">Retomando o login do computador</p>
              <p className="text-sm text-muted-foreground">
                A aprovação no celular foi detectada. Estamos concluindo a entrada do Super Admin neste computador.
              </p>
            </div>
          </div>
        </div>
      );
    }

    if (securityStep === 'desktop_waiting' && pendingSecurity) {
      return (
        <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <QrCode className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Aguardando aprovação no celular</p>
              <p className="text-sm text-muted-foreground">
                Depois da senha, o acesso do Super Admin em computador so e liberado apos escanear o QR, repetir as credenciais no celular e confirmar a biometria digital.
              </p>
            </div>
          </div>
          {pendingSecurity.desktopQrCodeUrl && (
            <div className="mx-auto flex w-fit flex-col items-center gap-3 rounded-xl bg-white p-3 shadow-sm">
              <img src={pendingSecurity.desktopQrCodeUrl} alt="QR Code de aprovacao do Super Admin" className="h-56 w-56 rounded-lg" />
              <p className="max-w-[260px] text-center text-xs text-muted-foreground">
                O QR carrega apenas um token temporario de aprovacao. Expira em poucos minutos e precisa de senha + biometria no celular.
              </p>
            </div>
          )}
          <div className="rounded-lg border bg-background/80 p-3 text-xs text-muted-foreground">
            <p>Status atual: {desktopStatus?.approved ? 'Aprovado no celular' : 'Aguardando confirmacao biometrica'}</p>
            <p>Link de emergencia: {pendingSecurity.desktopApprovalUrl}</p>
          </div>
        </div>
      );
    }

    if (securityStep === 'passkey_enrollment' || securityStep === 'mobile_biometric') {
      const enrolling = securityStep === 'passkey_enrollment';
      return (
        <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Smartphone className="mt-0.5 h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">{enrolling ? 'Cadastre a passkey biometrica' : 'Confirme sua biometria digital'}</p>
              <p className="text-sm text-muted-foreground">
                {enrolling
                  ? 'O primeiro acesso do Super Admin no celular exige o cadastro da chave biometrica do aparelho.'
                  : 'A senha ja foi validada. Agora so a biometria libera o painel global.'}
              </p>
            </div>
          </div>
          <Button type="button" onClick={handleBiometricStep} disabled={loading} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {enrolling ? 'Cadastrar passkey e validar biometria' : 'Validar biometria agora'}
          </Button>
        </div>
      );
    }

    if (securityStep === 'email_verification') {
      return (
        <div className="space-y-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <MailCheck className="mt-0.5 h-5 w-5 text-amber-700" />
            <div>
              <p className="text-sm font-semibold">Verificacao extra fora do Nordeste</p>
              <p className="text-sm text-muted-foreground">
                Detectamos um acesso fora da regiao Nordeste. Para reduzir o risco de invasao, enviamos um codigo para {otpMeta?.maskedEmail || 'o email cadastrado'}.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="otp-code">Codigo do email</Label>
            <Input
              id="otp-code"
              inputMode="numeric"
              maxLength={6}
              value={otpCode}
              onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="Digite os 6 numeros"
            />
          </div>
          <Button type="button" onClick={handleVerifyEmailCode} disabled={loading || otpCode.length < 6} className="w-full">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar codigo e concluir acesso
          </Button>
        </div>
      );
    }

    if (securityStep === 'mobile_approved') {
      return (
        <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-700" />
            <div>
              <p className="text-sm font-semibold">Aprovacao enviada para o computador</p>
              <p className="text-sm text-muted-foreground">
                A senha e a biometria do super admin foram confirmadas no celular. O computador agora pode concluir a entrada.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  const handleEnableNotifications = async () => {
    const nextPermission = await requestBrowserNotificationPermission().catch(() => 'default');
    setNotificationPermission(nextPermission || getBrowserNotificationPermission());

    if (nextPermission === 'granted') {
      toast({
        title: 'Notificações ativadas',
        description: 'Agora a plataforma pode avisar você sobre novidades e mensagens.',
      });
      return;
    }

    if (nextPermission === 'denied') {
      toast({
        variant: 'destructive',
        title: 'Notificações bloqueadas',
        description: 'Libere as notificações nas permissões do navegador para receber os avisos da plataforma.',
      });
    }
  };

  return (
    <div className="auth-login-page min-h-screen flex items-center justify-center p-3 sm:p-4 overflow-hidden">
      <div className="auth-bg-gradient" aria-hidden="true" />
      <div className="auth-bg-grid" aria-hidden="true" />
      <div className="auth-bg-rings" aria-hidden="true" />
      <div className="auth-orb auth-orb-1" aria-hidden="true" />
      <div className="auth-orb auth-orb-2" aria-hidden="true" />
      <div className="auth-orb auth-orb-3" aria-hidden="true" />
      <div className="auth-orb auth-orb-4" aria-hidden="true" />

      <Card className="auth-login-card w-full max-w-[560px] border-border/70 shadow-2xl" translate="no">
        <CardHeader className="text-center space-y-3 px-4 pt-5 pb-3 sm:px-6 sm:pt-6 sm:pb-3">
          <div className="auth-logo-wrap mx-auto flex h-16 w-16 items-center justify-center overflow-hidden rounded-[1.5rem] bg-primary/10 p-1 shadow-[0_14px_30px_hsl(var(--primary)/0.22)] ring-1 ring-primary/15">
            <img src="/app-logo.png" alt="BibliotecAI" className="h-full w-full rounded-[1.25rem] object-cover" />
          </div>
          <CardTitle className="text-2xl font-bold">BibliotecAI</CardTitle>
          <CardDescription>
            Professores e diretores entram com CPF. Alunos entram com matrícula.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 px-4 pb-5 pt-0 sm:px-6 sm:pb-6">
          {notificationPermission !== 'granted' && notificationPermission !== 'unsupported' && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-left">
              <div className="space-y-3">
                <div>
                  <p className="text-sm font-semibold">Ative as notificações</p>
                  <p className="text-sm text-muted-foreground">
                    Permita as notificações para receber avisos de mensagens, empréstimos e atualizações da plataforma.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={handleEnableNotifications} disabled={loading}>
                  Permitir notificações
                </Button>
              </div>
            </div>
          )}

          {authAlert && (
            <div className="rounded-lg border border-destructive/60 bg-destructive/10 px-4 py-3 text-left">
              <p className="text-sm font-bold text-destructive">{authAlert.title}</p>
              <p className="text-sm text-destructive/90">{authAlert.description}</p>
            </div>
          )}

          {desktopApprovalTokenRef.current && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-left">
              <div className="flex items-start gap-3">
                <MonitorSmartphone className="mt-0.5 h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold">Modo aprovacao de computador</p>
                  <p className="text-sm text-muted-foreground">
                    Este celular vai validar as credenciais e a biometria para liberar um acesso pendente no computador.
                  </p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 auth-login-form w-full">
            <div className="space-y-2 auth-field auth-field-1">
              <Label htmlFor="login">CPF ou matrícula</Label>
              <Input
                id="login"
                type="text"
                autoComplete="username"
                placeholder="CPF (somente números) ou matrícula"
                value={formData.login}
                onChange={(e) => setFormData({ ...formData, login: e.target.value })}
                disabled={loading || securityStep !== 'login'}
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
                  disabled={loading || securityStep !== 'login'}
                  className="auth-input pr-11 transition-all duration-300 focus-visible:ring-2 focus-visible:ring-primary/60"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="auth-password-toggle absolute right-0 top-0 h-full px-3 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4 text-muted-foreground" /> : <Eye className="h-4 w-4 text-muted-foreground" />}
                </Button>
              </div>
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>

            {securityStep === 'login' && (
              <Button type="submit" className="w-full auth-login-button auth-field auth-field-3" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Entrar
              </Button>
            )}
          </form>

          <div className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3 text-left">
            <p className="text-sm text-muted-foreground">
              Ao fazer login, você aceita os{' '}
              <a
                href="/privacy-policy.html"
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline underline-offset-4"
              >
                termos de privacidade
              </a>
              .
            </p>
          </div>

          {renderSecurityPanel()}
        </CardContent>
      </Card>
    </div>
  );
}

