import { getAppwriteDatabases, Query, ID } from '@/integrations/appwrite/client';
import { DATABASE_ID, COLLECTIONS } from '@/integrations/appwrite/collections';

function getEventsCollectionId() {
  return `${DATABASE_ID}.${COLLECTIONS.ANALYTICS_EVENTS}`;
}

function getSessionsCollectionId() {
  return `${DATABASE_ID}.${COLLECTIONS.ANALYTICS_SESSIONS}`;
}

function hashIp(ip) {
  if (!ip) return '';
  let hash = 0;
  for (let i = 0; i < ip.length; i++) {
    const char = ip.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return 'h_' + Math.abs(hash).toString(36);
}

export async function trackAnalyticsEvent(event) {
  try {
    const databases = getAppwriteDatabases();
    await databases.createDocument(
      DATABASE_ID,
      COLLECTIONS.ANALYTICS_EVENTS,
      ID.unique(),
      {
        event_type: String(event.type || 'unknown').slice(0, 50),
        page_url: String(event.page || window.location.pathname).slice(0, 500),
        element_id: String(event.element || '').slice(0, 200),
        session_id: String(event.sessionId || '').slice(0, 100),
        user_id: String(event.userId || '').slice(0, 100),
        data: JSON.stringify(event.data || {}).slice(0, 2000),
        viewport_w: Number(event.viewportW || window.innerWidth),
        screen_w: Number(event.screenW || window.screen?.width || 0),
        platform: String(event.platform || navigator?.platform || '').slice(0, 50),
        user_agent: String(event.userAgent || navigator?.userAgent || '').slice(0, 120),
        created_at: new Date().toISOString(),
      },
    );
  } catch {
    // silent fail - analytics should never block the app
  }
}

export async function upsertAnalyticsSession(session) {
  try {
    const databases = getAppwriteDatabases();
    const now = new Date().toISOString();

    const existing = await databases.listDocuments(
      DATABASE_ID,
      COLLECTIONS.ANALYTICS_SESSIONS,
      [Query.equal('session_id', session.sessionId)],
    );

    if (existing.documents.length > 0) {
      const doc = existing.documents[0];
      await databases.updateDocument(
        DATABASE_ID,
        COLLECTIONS.ANALYTICS_SESSIONS,
        doc.$id,
        {
          last_active_at: now,
          page_views: (doc.page_views || 0) + 1,
          max_scroll_depth: Math.max(doc.max_scroll_depth || 0, session.scrollDepth || 0),
        },
      );
    } else {
      await databases.createDocument(
        DATABASE_ID,
        COLLECTIONS.ANALYTICS_SESSIONS,
        ID.unique(),
        {
          session_id: String(session.sessionId || '').slice(0, 100),
          user_id: String(session.userId || '').slice(0, 100),
          started_at: now,
          last_active_at: now,
          page_views: 1,
          max_scroll_depth: session.scrollDepth || 0,
          platform: String(session.platform || navigator?.platform || '').slice(0, 50),
          user_agent: String(session.userAgent || navigator?.userAgent || '').slice(0, 120),
          ip_hash: hashIp(session.ip || ''),
        },
      );
    }
  } catch {
    // silent fail
  }
}

export async function fetchAnalyticsEvents({ limit = 100, eventType, pageUrl, startDate, endDate } = {}) {
  const databases = getAppwriteDatabases();
  const queries = [];

  if (eventType) queries.push(Query.equal('event_type', eventType));
  if (pageUrl) queries.push(Query.equal('page_url', pageUrl));
  if (startDate) queries.push(Query.greaterThanEqual('created_at', startDate));
  if (endDate) queries.push(Query.lessThanEqual('created_at', endDate));

  queries.push(Query.orderDesc('created_at'));
  queries.push(Query.limit(Math.min(limit, 100)));

  const result = await databases.listDocuments(
    DATABASE_ID,
    COLLECTIONS.ANALYTICS_EVENTS,
    queries,
  );

  return result.documents;
}

export async function fetchAnalyticsSessions({ limit = 50, startDate, endDate } = {}) {
  const databases = getAppwriteDatabases();
  const queries = [];

  if (startDate) queries.push(Query.greaterThanEqual('started_at', startDate));
  if (endDate) queries.push(Query.lessThanEqual('started_at', endDate));

  queries.push(Query.orderDesc('started_at'));
  queries.push(Query.limit(Math.min(limit, 100)));

  const result = await databases.listDocuments(
    DATABASE_ID,
    COLLECTIONS.ANALYTICS_SESSIONS,
    queries,
  );

  return result.documents;
}

export async function fetchAnalyticsSummary({ days = 30 } = {}) {
  const startDate = new Date(Date.now() - days * 86400000).toISOString();

  const [events, sessions] = await Promise.all([
    fetchAnalyticsEvents({ limit: 1000, startDate }),
    fetchAnalyticsSessions({ limit: 500, startDate }),
  ]);

  const pageViews = {};
  const eventTypes = {};
  let totalScrollDepth = 0;
  let scrollCount = 0;

  events.forEach((e) => {
    const url = e.page_url || '/';
    pageViews[url] = (pageViews[url] || 0) + 1;

    const type = e.event_type || 'unknown';
    eventTypes[type] = (eventTypes[type] || 0) + 1;

    if (e.event_type === 'scroll_depth') {
      try {
        const data = JSON.parse(e.data || '{}');
        if (data.depth) {
          totalScrollDepth += data.depth;
          scrollCount++;
        }
      } catch { /* ignore */ }
    }
  });

  const pageViewsList = Object.entries(pageViews)
    .map(([url, views]) => ({ url, views }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 20);

  const eventTypesList = Object.entries(eventTypes)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalEvents: events.length,
    totalSessions: sessions.length,
    totalPageViews: events.filter((e) => e.event_type === 'page_view').length,
    avgScrollDepth: scrollCount > 0 ? Math.round(totalScrollDepth / scrollCount) : 0,
    pageViews: pageViewsList,
    eventTypes: eventTypesList,
    recentEvents: events.slice(0, 50),
    recentSessions: sessions.slice(0, 20),
  };
}
