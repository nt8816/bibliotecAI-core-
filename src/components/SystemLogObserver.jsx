import { useEffect, useRef } from 'react';
import { installGlobalErrorLogging, installNetworkLogging, logSystemEvent } from '@/lib/systemLogger';

export function SystemLogObserver() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    installNetworkLogging();
    const cleanup = installGlobalErrorLogging();

    logSystemEvent({
      level: 'info',
      event: 'app_open',
      context: {
        user_agent: navigator.userAgent,
        language: navigator.language,
      },
    });

    return cleanup;
  }, []);

  return null;
}
