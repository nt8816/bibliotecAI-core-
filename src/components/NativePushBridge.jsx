import { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { PushNotifications } from '@capacitor/push-notifications';

import { useAuth } from '@/hooks/useAuth';
import { registerPushDeviceToken, unregisterPushDeviceToken } from '@/services/notificationsService';

const APP_VERSION = '1.0.0';
const PUSH_CHANNELS = [
  {
    id: 'comunicados',
    name: 'Comunicados',
    description: 'Comunicados e avisos gerais da biblioteca e da escola.',
  },
  {
    id: 'mensagens',
    name: 'Mensagens da Bibliotecaria',
    description: 'Mensagens e respostas da biblioteca nas solicitacoes de emprestimo.',
  },
  {
    id: 'atividades',
    name: 'Atividades',
    description: 'Atividades e lembretes enviados pelos professores.',
  },
];

function isNativeAndroidApp() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
}

function buildNotificationRoute(notification) {
  const data = notification?.data && typeof notification.data === 'object' ? notification.data : {};
  const explicitPath = String(data?.path || '').trim();
  if (explicitPath.startsWith('/')) return explicitPath;

  const category = String(data?.category || data?.canal || '').trim().toLowerCase();
  if (category === 'atividades') return '/aluno/atividades';
  if (category === 'comunicados') return '/aluno/comunidade';
  if (category === 'mensagens') return '/emprestimos?tab=solicitacoes';

  return '/dashboard';
}

async function ensureAndroidPushChannels() {
  await Promise.all(
    PUSH_CHANNELS.map((channel) => PushNotifications.createChannel({
      id: channel.id,
      name: channel.name,
      description: channel.description,
      importance: 5,
      visibility: 1,
      sound: 'default',
    })),
  );
}

export function NativePushBridge() {
  const navigate = useNavigate();
  const { user, session } = useAuth();
  const registeredTokenRef = useRef('');
  const unregisteringTokenRef = useRef('');

  const isNativePushAvailable = useMemo(() => isNativeAndroidApp(), []);

  useEffect(() => {
    if (!isNativePushAvailable) return undefined;

    let cancelled = false;
    let registrationListener = null;
    let registrationErrorListener = null;
    let receivedListener = null;
    let actionPerformedListener = null;

    const syncPushRegistration = async () => {
      try {
        await ensureAndroidPushChannels();

        const permissions = await PushNotifications.checkPermissions();
        let receiveStatus = permissions.receive;

        if (receiveStatus === 'prompt') {
          const requested = await PushNotifications.requestPermissions();
          receiveStatus = requested.receive;
        }

        if (receiveStatus !== 'granted') {
          console.info('Permissao de notificacao nativa nao concedida no Android.');
          return;
        }

        registrationListener = await PushNotifications.addListener('registration', async ({ value }) => {
          const token = String(value || '').trim();
          if (!token || cancelled || !user?.id || !session?.access_token) return;
          if (registeredTokenRef.current === token) return;

          try {
            await registerPushDeviceToken({
              token,
              provider: 'fcm',
              platform: 'android',
              device_label: 'BibliotecAi Android',
              app_version: APP_VERSION,
              channels: PUSH_CHANNELS.map((channel) => channel.id),
            });
            registeredTokenRef.current = token;
          } catch (error) {
            console.error('Falha ao registrar token push do dispositivo:', error);
          }
        });

        registrationErrorListener = await PushNotifications.addListener('registrationError', (error) => {
          console.error('Falha ao registrar push nativo no Android:', error);
        });

        receivedListener = await PushNotifications.addListener('pushNotificationReceived', (notification) => {
          console.info('Push recebido no app ativo:', notification);
        });

        actionPerformedListener = await PushNotifications.addListener('pushNotificationActionPerformed', (event) => {
          navigate(buildNotificationRoute(event?.notification), { replace: false });
        });

        await PushNotifications.register();
      } catch (error) {
        console.error(
          'Push nativo ainda nao ativado. Coloque o google-services.json e as credenciais do Firebase para concluir.',
          error,
        );
      }
    };

    syncPushRegistration();

    return () => {
      cancelled = true;
      registrationListener?.remove();
      registrationErrorListener?.remove();
      receivedListener?.remove();
      actionPerformedListener?.remove();
    };
  }, [isNativePushAvailable, navigate, session?.access_token, user?.id]);

  useEffect(() => {
    if (!isNativePushAvailable) return undefined;
    if (user?.id) return undefined;

    const lastToken = String(registeredTokenRef.current || '').trim();
    if (!lastToken || unregisteringTokenRef.current === lastToken) return undefined;

    unregisteringTokenRef.current = lastToken;

    unregisterPushDeviceToken({ token: lastToken })
      .catch((error) => {
        console.error('Falha ao remover token push do dispositivo:', error);
      })
      .finally(() => {
        if (registeredTokenRef.current === lastToken) {
          registeredTokenRef.current = '';
        }
        unregisteringTokenRef.current = '';
      });

    return undefined;
  }, [isNativePushAvailable, user?.id]);

  return null;
}

export default NativePushBridge;
