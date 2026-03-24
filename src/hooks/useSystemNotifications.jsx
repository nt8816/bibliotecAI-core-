import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { fetchSystemNotificationsData, markSystemNotificationAsRead } from '@/services/notificationsService';

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
    if (!canView || !user?.id) return undefined;

    const interval = window.setInterval(() => {
      fetchCounts();
    }, 30000);

    return () => {
      window.clearInterval(interval);
    };
  }, [canView, fetchCounts, user?.id]);

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

