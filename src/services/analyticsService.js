import { requestPlatformApi } from '@/lib/platformApi';

export async function trackAnalyticsEvent(event) {
  try {
    await requestPlatformApi('/v1/analytics/events', {
      method: 'POST',
      body: {
        event_type: String(event.type || 'unknown').slice(0, 50),
        page_url: String(event.page || window.location.pathname).slice(0, 500),
        element_id: String(event.element || '').slice(0, 200),
        session_id: String(event.sessionId || '').slice(0, 100),
        user_id: String(event.userId || '').slice(0, 100),
        data: event.data || {},
        viewport_w: Number(event.viewportW || window.innerWidth),
        screen_w: Number(event.screenW || window.screen?.width || 0),
        platform: String(event.platform || navigator?.platform || '').slice(0, 50),
        user_agent: String(event.userAgent || navigator?.userAgent || '').slice(0, 120),
      },
      auth: false,
    });
  } catch {
    // silent fail - analytics should never block the app
  }
}

export async function upsertAnalyticsSession(session) {
  try {
    await requestPlatformApi('/v1/analytics/sessions', {
      method: 'POST',
      body: {
        session_id: String(session.sessionId || '').slice(0, 100),
        user_id: String(session.userId || '').slice(0, 100),
        scrollDepth: session.scrollDepth || 0,
        platform: String(session.platform || navigator?.platform || '').slice(0, 50),
        userAgent: String(session.userAgent || navigator?.userAgent || '').slice(0, 120),
      },
      auth: false,
    });
  } catch {
    // silent fail
  }
}

export async function fetchAnalyticsEvents({ limit = 100, eventType, pageUrl, startDate, endDate } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(Math.min(limit, 500)));
  if (eventType) params.set('event_type', eventType);
  if (pageUrl) params.set('page_url', pageUrl);
  if (startDate) params.set('start_date', startDate);
  if (endDate) params.set('end_date', endDate);

  const result = await requestPlatformApi(`/v1/analytics/events?${params}`, { auth: true });
  return result?.data || [];
}

export async function fetchAnalyticsSummary({ days = 30 } = {}) {
  const result = await requestPlatformApi(`/v1/analytics/summary?days=${days}`, { auth: true });
  return result?.data || {
    totalEvents: 0,
    totalSessions: 0,
    totalPageViews: 0,
    avgScrollDepth: 0,
    pageViews: [],
    eventTypes: [],
    recentEvents: [],
    recentSessions: [],
  };
}
