import { useEffect, useRef, useCallback, useState } from 'react';
import { trackAnalyticsEvent, upsertAnalyticsSession } from '@/services/analyticsService';

const STORAGE_KEY = 'bibliotecai_analytics';
const SESSION_KEY = 'bibliotecai_session';
const APPWRITE_THROTTLE_MS = 2000;
const ANALYTICS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function getSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const session = {
    id: generateId(),
    start: Date.now(),
    pages: [],
  };
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  return session;
}

function getStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const store = JSON.parse(raw);
      // Expire old events (7 days)
      const cutoff = Date.now() - ANALYTICS_TTL_MS;
      if (store.events) {
        store.events = store.events.filter((e) => e.ts > cutoff);
      }
      return store;
    }
  } catch {}
  return { sessions: [], events: [], stats: {} };
}

function saveStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {}
}

function getDeviceInfo() {
  const w = window;
  return {
    screen: `${w.screen?.width}x${w.screen?.height}`,
    viewport: `${w.innerWidth}x${w.innerHeight}`,
    language: navigator.language,
    platform: navigator.platform,
    userAgent: navigator.userAgent.slice(0, 120),
  };
}

const _lastAppwriteWrite = {};

function canWriteToAppwrite(key) {
  const now = Date.now();
  if (_lastAppwriteWrite[key] && now - _lastAppwriteWrite[key] < APPWRITE_THROTTLE_MS) {
    return false;
  }
  _lastAppwriteWrite[key] = now;
  return true;
}

function persistToApi(event) {
  if (!canWriteToAppwrite(`${event.name}:${event.path}`)) return;
  const session = getSession();
  trackAnalyticsEvent({
    type: event.name,
    page: event.path,
    element: event.data?.element || '',
    sessionId: session.id,
    data: event.data,
    viewportW: window.innerWidth,
    screenW: window.screen?.width,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
  }).catch(() => {});
}

export function trackEvent(name, data = {}) {
  const store = getStore();
  const session = getSession();
  const event = {
    id: generateId(),
    name,
    data,
    ts: Date.now(),
    sid: session.id,
    path: window.location.pathname,
  };
  store.events.push(event);
  if (store.events.length > 2000) {
    store.events = store.events.slice(-1500);
  }
  saveStore(store);
  persistToApi(event);
  return event;
}

export function trackPageView(page) {
  const session = getSession();
  if (!session.pages.includes(page)) {
    session.pages.push(page);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  }
  trackEvent('page_view', { page, ...getDeviceInfo() });
  upsertAnalyticsSession({
    sessionId: session.id,
    scrollDepth: 0,
    platform: navigator.platform,
    userAgent: navigator.userAgent,
  }).catch(() => {});
}

export function trackClick(element, extra = {}) {
  trackEvent('click', { element, ...extra });
}

export function trackScroll(depth) {
  trackEvent('scroll_depth', { depth });
}

export function trackSection(section, action = 'view') {
  trackEvent('section_' + action, { section });
}

export function trackForm(action, data = {}) {
  trackEvent('form_' + action, data);
}

export function trackTimeOnPage(seconds) {
  trackEvent('time_on_page', { seconds });
}

export function getAnalytics() {
  return getStore();
}

export function clearAnalytics() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(SESSION_KEY);
}

export function getStats() {
  const store = getStore();
  const events = store.events || [];
  const clicks = events.filter(e => e.name === 'click');
  const sections = events.filter(e => e.name.startsWith('section_'));
  const forms = events.filter(e => e.name.startsWith('form_'));
  const pageViews = events.filter(e => e.name === 'page_view');
  const scrolls = events.filter(e => e.name === 'scroll_depth');

  const sectionCounts = {};
  sections.forEach(e => {
    const key = `${e.data.section}_${e.name.replace('section_', '')}`;
    sectionCounts[key] = (sectionCounts[key] || 0) + 1;
  });

  const clickCounts = {};
  clicks.forEach(e => {
    clickCounts[e.data.element] = (clickCounts[e.data.element] || 0) + 1;
  });

  const maxScroll = scrolls.length > 0 ? Math.max(...scrolls.filter(e => e?.data?.depth != null).map(e => e.data.depth)) : 0;

  return {
    totalEvents: events.length,
    pageViews: pageViews.length,
    uniqueSessions: [...new Set(pageViews.map(e => e.sid))].length,
    clicks: clickCounts,
    sections: sectionCounts,
    forms: forms.map(e => ({ action: e.data.action, ts: e.ts })),
    maxScrollDepth: maxScroll,
    recentEvents: events.slice(-50).reverse(),
  };
}

export function useScrollTracking() {
  const maxDepth = useRef(0);

  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (docHeight <= 0) return;
      const depth = Math.round((scrollTop / docHeight) * 100);
      if (depth > maxDepth.current) {
        const milestones = [25, 50, 75, 90, 100];
        milestones.forEach(m => {
          if (depth >= m && maxDepth.current < m) {
            trackScroll(m);
          }
        });
        maxDepth.current = depth;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
}

export function useTimeTracking() {
  useEffect(() => {
    const start = Date.now();
    const interval = setInterval(() => {
      const seconds = Math.floor((Date.now() - start) / 1000);
      if (seconds % 30 === 0 && seconds > 0) {
        trackTimeOnPage(seconds);
      }
    }, 1000);

    const handleUnload = () => {
      const seconds = Math.floor((Date.now() - start) / 1000);
      trackTimeOnPage(seconds);
    };

    window.addEventListener('beforeunload', handleUnload);
    return () => {
      clearInterval(interval);
      window.removeEventListener('beforeunload', handleUnload);
    };
  }, []);
}

export function useSectionTracking(ref, sectionName) {
  const hasTracked = useRef(false);

  useEffect(() => {
    const el = ref?.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !hasTracked.current) {
          hasTracked.current = true;
          trackSection(sectionName, 'view');
        }
      },
      { threshold: 0.3 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, sectionName]);
}

export function useAnalyticsDashboard() {
  const [stats, setStats] = useState(null);

  const refresh = useCallback(() => {
    setStats(getStats());
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [refresh]);

  return { stats, refresh, clear: clearAnalytics };
}
