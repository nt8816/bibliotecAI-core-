import { useEffect } from 'react';

export function useRealtimeSubscription({ onStatus, table }) {
  useEffect(() => {
    if (!table) return undefined;
    if (onStatus) onStatus('DISABLED', table);
    return undefined;
  }, [onStatus, table]);
}
