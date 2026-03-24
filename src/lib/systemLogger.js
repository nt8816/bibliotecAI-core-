import { requestPlatformApi } from '@/lib/platformApi';

const MAX_QUEUE = 200;
const MAX_FIELD_SIZE = 2000;
const queue = [];
let flushing = false;
let fetchWrapped = false;

const SENSITIVE_KEYS = [
  'password',
  'senha',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'backend',
  'database',
  'connection',
  'private_key',
];

const SECRET_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /senha/i,
  /backend/i,
  /database/i,
  /connection\\s*string/i,
  /postgres/i,
  /private\\s*key/i,
  /bearer\\s+[a-z0-9\\-_.]+/i,
  /sk-[a-z0-9]{10,}/i,
];

const sanitizeText = (value) => {
  let text = String(value || '');
  if (text.length > MAX_FIELD_SIZE) text = text.slice(0, MAX_FIELD_SIZE);
  return text;
};

const redactValue = (value) => {
  if (typeof value === 'string') {
    let text = sanitizeText(value);
    SECRET_PATTERNS.forEach((pattern) => {
      text = text.replace(pattern, '[redacted]');
    });
    return text;
  }
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === 'object') {
    const output = {};
    Object.entries(value).forEach(([key, val]) => {
      const lower = key.toLowerCase();
      if (SENSITIVE_KEYS.some((s) => lower.includes(s))) output[key] = '[redacted]';
      else output[key] = redactValue(val);
    });
    return output;
  }
  return value;
};

function enqueue(entry) {
  queue.push({
    ...entry,
    message: entry.message ? sanitizeText(entry.message) : undefined,
    input: redactValue(entry.input),
    output: redactValue(entry.output),
    context: redactValue(entry.context),
  });
  if (queue.length > MAX_QUEUE) queue.shift();
  void flushQueue();
}

async function flushQueue() {
  if (flushing) return;
  flushing = true;
  while (queue.length > 0) {
    const entry = queue.shift();
    try {
      await requestPlatformApi('/v1/system-logs', {
        method: 'POST',
        auth: false,
        body: {
          event: entry.event,
          level: entry.level,
          message: entry.message || null,
          path: entry.path || window.location.pathname,
          input: entry.input ?? null,
          output: entry.output ?? null,
          context: entry.context ?? null,
          escolaId: entry.escolaId || null,
        },
      });
    } catch {
      // swallow to avoid cascading errors
    }
  }
  flushing = false;
}

function shouldSkipFetchLog(url) {
  if (!url) return false;
  const value = String(url);
  return value.includes('/v1/system-logs') || value.includes('/rest/v1/system_logs');
}

export function logSystemEvent({
  level = 'info',
  event,
  message,
  input,
  output,
  context,
  escolaId,
  path,
} = {}) {
  if (!event) return;
  enqueue({ level, event, message, input, output, context, escolaId, path });
}

export function installNetworkLogging() {
  if (fetchWrapped || typeof window === 'undefined' || typeof window.fetch !== 'function') return;
  fetchWrapped = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (...args) => {
    const [input, init] = args;
    const url = typeof input === 'string' ? input : input?.url;
    if (shouldSkipFetchLog(url)) {
      return originalFetch(...args);
    }

    const method = (init?.method || (typeof input !== 'string' ? input?.method : null) || 'GET').toUpperCase();
    const hasBody = Boolean(init?.body);
    const startedAt = performance.now();

    logSystemEvent({
      level: 'info',
      event: 'http_request',
      input: { url, method, has_body: hasBody },
    });

    try {
      const response = await originalFetch(...args);
      const durationMs = Math.round(performance.now() - startedAt);
      logSystemEvent({
        level: response.ok ? 'info' : 'error',
        event: 'http_response',
        input: { url, method, has_body: hasBody },
        output: { status: response.status, ok: response.ok, duration_ms: durationMs },
      });
      return response;
    } catch (error) {
      const durationMs = Math.round(performance.now() - startedAt);
      logSystemEvent({
        level: 'error',
        event: 'http_error',
        message: error?.message || 'Fetch error',
        input: { url, method, has_body: hasBody },
        output: { duration_ms: durationMs },
        context: { stack: error?.stack },
      });
      throw error;
    }
  };
}

export function installGlobalErrorLogging() {
  if (typeof window === 'undefined') return () => {};

  const handleError = (event) => {
    const err = event?.error;
    logSystemEvent({
      level: 'error',
      event: 'window_error',
      message: err?.message || event?.message || 'Erro inesperado',
      context: {
        stack: err?.stack,
        filename: event?.filename,
        lineno: event?.lineno,
        colno: event?.colno,
      },
    });
  };

  const handleRejection = (event) => {
    const reason = event?.reason;
    logSystemEvent({
      level: 'error',
      event: 'unhandled_rejection',
      message: reason?.message || String(reason || 'Rejeicao sem motivo'),
      context: {
        stack: reason?.stack,
      },
    });
  };

  const originalConsoleError = console.error;
  console.error = (...args) => {
    try {
      const error = args.find((item) => item instanceof Error);
      logSystemEvent({
        level: 'error',
        event: 'console_error',
        message: error?.message || args.map((item) => String(item)).join(' '),
        context: {
          stack: error?.stack,
        },
      });
    } catch {
      // ignore
    }
    originalConsoleError(...args);
  };

  window.addEventListener('error', handleError);
  window.addEventListener('unhandledrejection', handleRejection);

  return () => {
    window.removeEventListener('error', handleError);
    window.removeEventListener('unhandledrejection', handleRejection);
    console.error = originalConsoleError;
  };
}
