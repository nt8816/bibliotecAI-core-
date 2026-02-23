import { useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';

const MAX_EVENTS = 300;

function buildStorageKey(userId) {
  return `bibliotecai:private-telemetry:${userId || 'anonymous'}`;
}

function readEvents(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEvents(key, events) {
  try {
    localStorage.setItem(key, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // no-op when storage is unavailable
  }
}

export function usePrivateTelemetry() {
  const { user } = useAuth();
  const storageKey = buildStorageKey(user?.id);

  const trackEvent = useCallback(
    (eventName, payload = {}) => {
      const now = new Date();
      const events = readEvents(storageKey);

      events.push({
        eventName,
        payload,
        route: window.location.pathname,
        at: now.toISOString(),
        localDate: now.toLocaleString('pt-BR'),
      });

      writeEvents(storageKey, events);
    },
    [storageKey],
  );

  const getEvents = useCallback(() => readEvents(storageKey), [storageKey]);
  const clearEvents = useCallback(() => writeEvents(storageKey, []), [storageKey]);

  return { trackEvent, getEvents, clearEvents, storageKey };
}
