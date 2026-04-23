import { requestPlatformApi } from '@/lib/platformApi';

const SYSTEM_NOTIFICATIONS_READ_EVENT = 'system-notifications-read';

function emitReadNotifications(notificationIds) {
  if (typeof window === 'undefined') return;
  const ids = Array.isArray(notificationIds) ? notificationIds.filter(Boolean) : [];
  if (ids.length === 0) return;
  window.dispatchEvent(new CustomEvent(SYSTEM_NOTIFICATIONS_READ_EVENT, {
    detail: { notificationIds: ids },
  }));
}

export function subscribeToReadNotifications(callback) {
  if (typeof window === 'undefined' || typeof callback !== 'function') {
    return () => {};
  }

  const handler = (event) => {
    const ids = Array.isArray(event?.detail?.notificationIds) ? event.detail.notificationIds : [];
    callback(ids);
  };

  window.addEventListener(SYSTEM_NOTIFICATIONS_READ_EVENT, handler);
  return () => window.removeEventListener(SYSTEM_NOTIFICATIONS_READ_EVENT, handler);
}

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
  const response = await requestPlatformApi('/v1/notifications/read', {
    method: 'POST',
    body: { notification_id: notificationId },
  });
  emitReadNotifications([notificationId]);
  return response;
}

export async function markSystemNotificationsAsReadBatch(notificationIds) {
  const response = await requestPlatformApi('/v1/notifications/read-batch', {
    method: 'POST',
    body: { notification_ids: notificationIds },
  });
  emitReadNotifications(notificationIds);
  return response;
}

export async function registerPushDeviceToken(payload) {
  return requestPlatformApi('/v1/notifications/push/register', {
    method: 'POST',
    body: payload,
  });
}

export async function unregisterPushDeviceToken(payload) {
  return requestPlatformApi('/v1/notifications/push/unregister', {
    method: 'POST',
    body: payload,
  });
}
