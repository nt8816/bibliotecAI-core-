import { requestPlatformApi } from '@/lib/platformApi';

export async function fetchSystemNotificationsData({ user, canView }) {
  if (!canView || !user?.id) {
    return {
      counts: { atrasados: 0, solicitacoesPendentes: 0, comunicados: 0, reclamacoes: 0, reclamacoesAtrasadas: 0, seguranca: 0 },
      notifications: [],
      profileId: null,
    };
  }

  const payload = await requestPlatformApi('/v1/notifications/system');
  return {
    counts: payload?.counts || { atrasados: 0, solicitacoesPendentes: 0, comunicados: 0, reclamacoes: 0, reclamacoesAtrasadas: 0, seguranca: 0 },
    notifications: Array.isArray(payload?.notifications) ? payload.notifications : [],
    profileId: payload?.profileId || null,
  };
}

export async function markSystemNotificationAsRead({ notificationId }) {
  return requestPlatformApi('/v1/notifications/read', {
    method: 'POST',
    body: { notification_id: notificationId },
  });
}

