import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { getSupabaseRealtimeClient } from '@/integrations/supabase/client';
import {
  fetchSystemNotificationsData,
  markSystemNotificationAsRead,
  subscribeToReadNotifications,
} from '@/services/notificationsService';

const EMPTY_COUNTS = {
  atrasados: 0,
  solicitacoesPendentes: 0,
  comunicados: 0,
  reclamacoes: 0,
  reclamacoesAtrasadas: 0,
  seguranca: 0,
};

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function getSuperAdminReadStorageKeys(userId) {
  return {
    reclamacoes: `notificacoes:reclamacoes:lidas:${userId}`,
    seguranca: `notificacoes:seguranca-super-admin:lidas:${userId}`,
  };
}

function readStoredIds(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function persistStoredIds(storageKey, ids) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(Array.from(ids)));
  } catch {
    // Ignore localStorage write failures and keep the app usable.
  }
}

export function useSystemNotifications() {
  const { isGestor, isBibliotecaria, isAluno, isSuperAdmin, user } = useAuth();
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [notifications, setNotifications] = useState([]);
  const [profileId, setProfileId] = useState(null);
  const seenNotificationIdsRef = useRef(new Set());
  const notificationsReadyRef = useRef(false);
  const realtimeRefreshTimeoutRef = useRef(null);

  const canView = isGestor || isBibliotecaria || isAluno || isSuperAdmin;

  const fetchCounts = useCallback(async () => {
    if (!canView || !user?.id) {
      setCounts(EMPTY_COUNTS);
      setNotifications([]);
      setProfileId(null);
      return;
    }

    try {
      const payload = await fetchSystemNotificationsData({
        user,
        canView,
        isSuperAdmin,
        isAluno,
      });

      const nextNotifications = ensureArray(payload?.notifications);

      if (isSuperAdmin) {
        const storageKeys = getSuperAdminReadStorageKeys(user.id);
        const readComplaintIds = readStoredIds(storageKeys.reclamacoes);
        const readSecurityIds = readStoredIds(storageKeys.seguranca);

        const filteredNotifications = nextNotifications.filter((item) => {
          if (!item?.id) return false;
          if (item.tipo === 'seguranca') return !readSecurityIds.has(item.id);
          if (item.tipo === 'reclamacao' || item.tipo === 'reclamacao_alerta') {
            return !readComplaintIds.has(item.id);
          }
          return true;
        });

        const reclamacoesAtrasadas = filteredNotifications.filter((item) => item.tipo === 'reclamacao_alerta').length;
        const reclamacoes = filteredNotifications.filter((item) => item.tipo === 'reclamacao' || item.tipo === 'reclamacao_alerta').length;
        const seguranca = filteredNotifications.filter((item) => item.tipo === 'seguranca').length;

        setCounts({
          atrasados: 0,
          solicitacoesPendentes: 0,
          comunicados: 0,
          reclamacoes,
          reclamacoesAtrasadas,
          seguranca,
        });
        setNotifications(filteredNotifications);
        setProfileId(null);
        return;
      }

      setCounts({
        ...EMPTY_COUNTS,
        ...(payload?.counts || {}),
      });
      setNotifications(nextNotifications);
      setProfileId(payload?.profileId || null);
    } catch (error) {
      console.error('Falha ao carregar notificacoes do sistema:', error);
      setCounts(EMPTY_COUNTS);
      setNotifications([]);
      setProfileId(null);
    }
  }, [canView, isAluno, isSuperAdmin, user]);

  useEffect(() => {
    fetchCounts();
  }, [fetchCounts]);

  useEffect(() => {
    seenNotificationIdsRef.current = new Set();
    notificationsReadyRef.current = false;
  }, [user?.id]);

  const scheduleRealtimeRefresh = useCallback(() => {
    if (realtimeRefreshTimeoutRef.current) {
      window.clearTimeout(realtimeRefreshTimeoutRef.current);
    }

    realtimeRefreshTimeoutRef.current = window.setTimeout(() => {
      fetchCounts();
      realtimeRefreshTimeoutRef.current = null;
    }, 250);
  }, [fetchCounts]);

  useEffect(() => () => {
    if (realtimeRefreshTimeoutRef.current) {
      window.clearTimeout(realtimeRefreshTimeoutRef.current);
      realtimeRefreshTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!canView || !user?.id) return undefined;

    const intervalMs = isAluno ? 10000 : 30000;

    const interval = window.setInterval(() => {
      fetchCounts();
    }, intervalMs);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchCounts();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [canView, fetchCounts, isAluno, user?.id]);

  useEffect(() => {
    if (!canView || !user?.id) return undefined;

    const supabase = getSupabaseRealtimeClient();
    if (!supabase) return undefined;

    const watchedTables = isSuperAdmin
      ? ['reclamacoes_super_admin', 'system_logs']
      : isAluno
        ? ['emprestimos', 'solicitacoes_emprestimo', 'comunidade_posts', 'notificacoes_lidas']
        : ['emprestimos', 'solicitacoes_emprestimo', 'solicitacoes_emprestimo_mensagens', 'notificacoes_lidas'];

    const channel = supabase.channel(`system-notifications-${user.id}-${profileId || 'global'}`);

    watchedTables.forEach((table) => {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        () => {
          scheduleRealtimeRefresh();
        },
      );
    });

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canView, isAluno, isSuperAdmin, profileId, scheduleRealtimeRefresh, user?.id]);

  useEffect(() => {
    const nextIds = new Set(ensureArray(notifications).map((item) => item?.id).filter(Boolean));

    if (!notificationsReadyRef.current) {
      seenNotificationIdsRef.current = nextIds;
      notificationsReadyRef.current = true;
      return;
    }

    seenNotificationIdsRef.current = nextIds;
  }, [notifications]);

  useEffect(() => {
    if (!canView) return undefined;

    return subscribeToReadNotifications((notificationIds) => {
      const ids = new Set(ensureArray(notificationIds).filter(Boolean));
      if (ids.size === 0) return;

      setNotifications((current) => current.filter((item) => !ids.has(item?.id)));
      seenNotificationIdsRef.current = new Set(
        Array.from(seenNotificationIdsRef.current).filter((notificationId) => !ids.has(notificationId)),
      );
    });
  }, [canView]);

  const markNotificationRead = useCallback(async (notificationId) => {
    if (!notificationId) return;

    const currentNotification = notifications.find((item) => item.id === notificationId);
    if (!currentNotification) return;

    if (isSuperAdmin && user?.id) {
      const storageKeys = getSuperAdminReadStorageKeys(user.id);
      const targetKey = currentNotification.tipo === 'seguranca' ? storageKeys.seguranca : storageKeys.reclamacoes;
      const storedIds = readStoredIds(targetKey);
      storedIds.add(notificationId);
      persistStoredIds(targetKey, storedIds);

      setNotifications((current) => current.filter((item) => item.id !== notificationId));
      setCounts((current) => ({
        ...current,
        reclamacoes:
          currentNotification.tipo === 'reclamacao' || currentNotification.tipo === 'reclamacao_alerta'
            ? Math.max(0, current.reclamacoes - 1)
            : current.reclamacoes,
        reclamacoesAtrasadas:
          currentNotification.tipo === 'reclamacao_alerta'
            ? Math.max(0, current.reclamacoesAtrasadas - 1)
            : current.reclamacoesAtrasadas,
        seguranca:
          currentNotification.tipo === 'seguranca'
            ? Math.max(0, current.seguranca - 1)
            : current.seguranca,
      }));
      return;
    }

    if (!profileId) return;

    setNotifications((current) => current.filter((item) => item.id !== notificationId));
    setCounts((current) => ({
      ...current,
      comunicados: currentNotification.tipo === 'comunicado' ? Math.max(0, current.comunicados - 1) : current.comunicados,
    }));

    try {
      await markSystemNotificationAsRead({
        notificationId,
        profileId,
      });
    } catch (error) {
      console.error('Falha ao marcar notificacao como lida:', error);
      fetchCounts();
    }
  }, [fetchCounts, isSuperAdmin, notifications, profileId, user]);

  return {
    counts,
    notifications,
    canViewNotifications: canView,
    markNotificationRead,
  };
}
