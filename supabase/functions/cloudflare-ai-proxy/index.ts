import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = ["https://bibliotecai.com.br", "https://app.bibliotecai.com.br", "http://localhost:5173", "http://localhost:3000"];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const safeOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-access-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}


const jsonResponse = (body: unknown, status = 200, request?: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(request || new Request("http://localhost")), "Content-Type": "application/json" },
  });

const isAllowedPath = (path: string) => path === "/text" || path === "/image" || path === "/audio";

const MAX_TEXT_PROMPT = 4000;
const MAX_IMAGE_PROMPT = 2000;
const MAX_AUDIO_PROMPT = 4000;
const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_AUTH = 60;
const RATE_LIMIT_ANON = 20;

const SECRET_PATTERNS: RegExp[] = [
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /senha/i,
  /supabase/i,
  /database/i,
  /connection\s*string/i,
  /postgres/i,
  /private\s*key/i,
  /bearer\s+[a-z0-9\-_.]+/i,
  /sk-[a-z0-9]{10,}/i,
];

const SENSITIVE_KEYS = [
  'password',
  'senha',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'supabase',
  'database',
  'connection',
  'private_key',
];

const sanitizeText = (value: string, limit: number) => {
  let text = String(value || '');
  text = text.replace(/\u0000/g, '');
  if (text.length > limit) text = text.slice(0, limit);
  return text;
};

const hasSecretLikeContent = (value: string) => {
  const text = String(value || '');
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
};

const redactObject = (value: any): any => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(redactObject);
  const output: Record<string, any> = {};
  Object.entries(value).forEach(([key, val]) => {
    const lower = key.toLowerCase();
    if (SENSITIVE_KEYS.some((s) => lower.includes(s))) {
      output[key] = '[redacted]';
    } else {
      output[key] = redactObject(val);
    }
  });
  return output;
};

const buildAllowedBody = (path: string, body: any) => {
  const source = body && typeof body === 'object' ? body : {};
  if (path === '/text') {
    const prompt = sanitizeText(String(source.prompt || ''), MAX_TEXT_PROMPT);
    return {
      prompt,
      model: source.model,
      provider: source.provider,
      parameters: redactObject(source.parameters),
    };
  }
  if (path === '/image') {
    const prompt = sanitizeText(String(source.prompt || ''), MAX_IMAGE_PROMPT);
    return {
      prompt,
      model: source.model,
      provider: source.provider,
      parameters: redactObject(source.parameters),
    };
  }
  const prompt = sanitizeText(String(source.prompt || source.text || ''), MAX_AUDIO_PROMPT);
  return {
    prompt,
    text: sanitizeText(String(source.text || ''), MAX_AUDIO_PROMPT),
    voice: source.voice,
    language: source.language,
    lang: source.lang,
    model: source.model,
  };
};

const getClientIp = (req: Request) => {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  const first = forwarded.split(',')[0]?.trim();
  return first || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || '';
};

const getAuthToken = (req: Request) => {
  const auth = req.headers.get('authorization') || '';
  if (!auth) return '';
  return auth.replace(/bearer\s+/i, '').trim();
};

const logSecurityEvent = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: {
    level: 'info' | 'warn' | 'error';
    event: string;
    message?: string;
    escolaId?: string | null;
    userId?: string | null;
    context?: Record<string, unknown>;
  },
) => {
  try {
    await supabaseAdmin.from('system_logs').insert({
      level: payload.level,
      event: payload.event,
      message: payload.message || null,
      escola_id: payload.escolaId || null,
      user_id: payload.userId || null,
      context: payload.context || null,
      ip: payload.context?.ip || null,
      path: payload.context?.path || null,
      user_agent: payload.context?.user_agent || null,
    });
  } catch {
    // ignore logging failures
  }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: getCorsHeaders(req) });

  try {
    if (req.method !== 'POST') return jsonResponse({ error: 'Método não permitido.' }, 405);

    const payload = await req.json().catch(() => ({}));
    const path = String(payload?.path || '').trim();
    const body = payload?.body ?? {};

    if (!isAllowedPath(path)) {
      return jsonResponse({ error: 'Caminho inválido. Use /text, /image ou /audio.' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey || !anonKey) {
      return jsonResponse({ error: 'Configuração do servidor incompleta.' }, 500);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = getAuthToken(req);
    const userResult = token ? await supabaseAdmin.auth.getUser(token) : { data: { user: null } };
    const userId = userResult?.data?.user?.id || null;

    let escolaId: string | null = null;
    if (userId) {
      const { data: escolaData } = await supabaseAdmin.rpc('get_user_escola_id', { _user_id: userId }).single();
      escolaId = escolaData ?? null;
    }

    const ip = getClientIp(req);
    const userAgent = req.headers.get('user-agent') || '';

    const allowedBody = buildAllowedBody(path, body);
    const promptToCheck = String(allowedBody.prompt || allowedBody.text || '');

    if (!promptToCheck.trim()) {
      return jsonResponse({ error: 'Prompt inválido.' }, 400);
    }

    if (hasSecretLikeContent(promptToCheck)) {
      await logSecurityEvent(supabaseAdmin, {
        level: 'warn',
        event: 'ai_prompt_blocked',
        message: 'Conteúdo sensível detectado no prompt.',
        escolaId,
        userId,
        context: {
          path,
          ip,
          user_agent: userAgent,
          prompt_length: promptToCheck.length,
          reason: 'secret_pattern',
        },
      });
      return jsonResponse({ error: 'Conteúdo sensível detectado. Pedido bloqueado.' }, 400);
    }

    const rateKey = `${userId || 'anon'}:${ip || 'noip'}:${path}`;
    const rateLimit = userId ? RATE_LIMIT_AUTH : RATE_LIMIT_ANON;
    const { data: allowed } = await supabaseAdmin.rpc('check_ai_rate_limit', {
      _key: rateKey,
      _limit: rateLimit,
      _window_seconds: RATE_LIMIT_WINDOW_SECONDS,
    }).single();

    if (!allowed) {
      await logSecurityEvent(supabaseAdmin, {
        level: 'warn',
        event: 'ai_rate_limited',
        message: 'Limite de requisicoes de IA excedido.',
        escolaId,
        userId,
        context: {
          path,
          ip,
          user_agent: userAgent,
          window_seconds: RATE_LIMIT_WINDOW_SECONDS,
          limit: rateLimit,
        },
      });
      return jsonResponse({ error: 'Limite de requisicoes atingido. Tente novamente.' }, 429);
    }

    const baseUrl = String(
      Deno.env.get('CLOUDFLARE_AI_BASE_URL') || 'https://api-bibliotecai.ntn3223.workers.dev',
    ).replace(/\/+$/, '');

    const upstream = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(allowedBody),
    });

    const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();

    if (!upstream.ok) {
      await logSecurityEvent(supabaseAdmin, {
        level: 'error',
        event: 'ai_upstream_error',
        message: `Falha no upstream: ${upstream.status}`,
        escolaId,
        userId,
        context: {
          path,
          ip,
          user_agent: userAgent,
          status: upstream.status,
        },
      });

      if (contentType.includes('application/json')) {
        const err = await upstream.json().catch(() => ({}));
        return jsonResponse(err, upstream.status);
      }
      const text = await upstream.text().catch(() => '');
      return jsonResponse({ error: text || `Erro upstream HTTP ${upstream.status}` }, upstream.status);
    }

    if (contentType.includes('application/json')) {
      const data = await upstream.json().catch(() => ({}));
      return new Response(JSON.stringify(redactObject(data)), {
        status: 200,
        headers: { ...getCorsHeaders(request || new Request("http://localhost")), 'Content-Type': 'application/json' },
      });
    }

    const bytes = await upstream.arrayBuffer();
    return new Response(bytes, {
      status: 200,
      headers: {
        ...getCorsHeaders(req),
        'Content-Type': contentType || 'application/octet-stream',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return jsonResponse({ error: message }, 500);
  }
});
