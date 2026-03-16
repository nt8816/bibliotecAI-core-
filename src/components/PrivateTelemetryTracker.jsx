import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { usePrivateTelemetry } from '@/hooks/usePrivateTelemetry';
import { logSystemEvent } from '@/lib/systemLogger';

export function PrivateTelemetryTracker() {
  const location = useLocation();
  const { trackEvent } = usePrivateTelemetry();
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      trackEvent('app_open');
      logSystemEvent({ level: 'info', event: 'page_view', input: { pathname: location.pathname, search: location.search } });
      trackEvent('page_view', {
        pathname: location.pathname,
        search: location.search,
      });
      return;
    }

    trackEvent('page_view', {
      pathname: location.pathname,
      search: location.search,
    });
    logSystemEvent({ level: 'info', event: 'page_view', input: { pathname: location.pathname, search: location.search } });
  }, [location.pathname, location.search, trackEvent]);

  return null;
}
