export interface Env {
  AI: Ai;
  APP_ENV?: string;
  APP_BASE_DOMAIN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_AI_API_TOKEN?: string;
}

// Models active on Cloudflare Workers AI (2026). Old @cf/meta/infire-llama-3.1-8b-instruct is deprecated.
const TEXT_MODEL_DEFAULT = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
const TEXT_MODEL_FAST = '@cf/meta/llama-3.1-8b-instruct-fast';
const IMAGE_MODEL_DEFAULT = '@cf/black-forest-labs/flux-1-schnell';
const AUDIO_MODEL_DEFAULT = '@cf/myshell-ai/melotts';

const ALLOWED_ORIGINS = [
  'https://bibliotecai.com.br',
  'https://app.bibliotecai.com.br',
  'https://www.bibliotecai.com.br',
  'https://bibliotecai.pages.dev',
];

const MAX_TEXT_PROMPT = 4000;
const MAX_IMAGE_PROMPT = 2000;
const MAX_AUDIO_PROMPT = 4000;

function isAllowedOrigin(origin: string): boolean {
  if (!origin) return false;
  if (origin === 'https://bibliotecai.pages.dev' || origin === 'http://localhost:5173' || origin === 'http://localhost:3000') {
    return true;
  }
  try {
    const host = new URL(origin).hostname.toLowerCase();
    if (host === 'bibliotecai.com.br' || host === 'app.bibliotecai.com.br' || host === 'www.bibliotecai.com.br') {
      return true;
    }
    // Multi-tenant school subdomains: escola.bibliotecai.com.br
    if (host.endsWith('.bibliotecai.com.br')) return true;
    if (host.endsWith('.bibliotecai.pages.dev')) return true;
  } catch {
    return false;
  }
  return ALLOWED_ORIGINS.includes(origin);
}

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const safeOrigin = isAllowedOrigin(origin) ? origin : (ALLOWED_ORIGINS[0] || '*');
  return {
    'Access-Control-Allow-Origin': safeOrigin,
    'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body: unknown, status = 200, request?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...(request ? corsHeaders(request) : corsHeaders(new Request('http://localhost'))),
      'Content-Type': 'application/json',
    },
  });
}

function sanitizeText(value: unknown, limit: number): string {
  let text = String(value ?? '');
  text = text.replace(/\u0000/g, '');
  if (text.length > limit) text = text.slice(0, limit);
  return text.trim();
}

function pickModel(body: Record<string, unknown>, fallback: string): string {
  const requested = String(body?.model || '').trim();
  // Reject deprecated models so callers cannot re-break the service.
  if (requested.includes('infire-llama') || requested.includes('llama-3.1-8b-instruct"') || requested === '@cf/meta/llama-3.1-8b-instruct') {
    return fallback;
  }
  return requested || fallback;
}

function textToMessages(prompt: string): Array<{ role: 'system' | 'user'; content: string }> {
  return [
    {
      role: 'system',
      content:
        'Voce e um assistente de biblioteca escolar brasileira. Responda em portugues do Brasil, de forma clara, curta e util para estudantes e professores. Quando pedirem JSON, responda SOMENTE com JSON valido.',
    },
    { role: 'user', content: prompt },
  ];
}

async function runText(env: Env, body: Record<string, unknown>, request: Request): Promise<Response> {
  const prompt = sanitizeText(body?.prompt || body?.text || '', MAX_TEXT_PROMPT);
  if (!prompt) return json({ error: 'Prompt invalido.' }, 400, request);

  const model = pickModel(body, TEXT_MODEL_DEFAULT);
  const maxTokens = Number(body?.parameters?.max_tokens || body?.max_tokens || 800);
  const temperature = Number(body?.parameters?.temperature ?? body?.temperature ?? 0.3);

  const input = {
    messages: textToMessages(prompt),
    max_tokens: Number.isFinite(maxTokens) ? Math.min(Math.max(maxTokens, 64), 2000) : 800,
    temperature: Number.isFinite(temperature) ? Math.min(Math.max(temperature, 0), 2) : 0.3,
  };

  try {
    if (env.AI?.run) {
      try {
        const result = (await env.AI.run(model as never, input as never)) as {
          result?: string;
          response?: string;
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = String(result?.result || result?.response || result?.choices?.[0]?.message?.content || '').trim();
        if (!text) return json({ error: 'Modelo nao retornou texto.' }, 502, request);
        return json({ text, model, success: true }, 200, request);
      } catch (primaryError) {
        const message = primaryError instanceof Error ? primaryError.message : String(primaryError);
        if (!message.includes('deprecated') && !message.includes('5028')) {
          // still try the fast active model before giving up
          console.error('primary text model failed', message);
        }
      }
    }
  } catch {
    // continue to fallback
  }

  // Fallback: still-active fast model via binding.
  try {
    const fallbackInput = { messages: textToMessages(prompt), max_tokens: input.max_tokens, temperature: input.temperature };
    const result = (await env.AI.run(TEXT_MODEL_FAST as never, fallbackInput as never)) as {
      result?: string;
      response?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = String(result?.result || result?.response || result?.choices?.[0]?.message?.content || '').trim();
    if (!text) return json({ error: 'Modelo nao retornou texto.' }, 502, request);
    return json({ text, model: TEXT_MODEL_FAST, success: true }, 200, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: `Falha ao gerar texto: ${message}` }, 502, request);
  }
}

function toBase64FromMaybeBinary(result: unknown): string {
  if (!result) return '';
  if (typeof result === 'string') {
    // raw base64 or data URL
    return result.startsWith('data:') ? result : result;
  }
  if (result instanceof ArrayBuffer) {
    let binary = '';
    const bytes = new Uint8Array(result);
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  if (ArrayBuffer.isView(result)) {
    const view = result as ArrayBufferView;
    const bytes = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }
  const obj = result as Record<string, unknown>;
  return String(obj.image || obj.audio || obj.b64_json || obj.audio_base64 || '').trim();
}

async function runImage(env: Env, body: Record<string, unknown>, request: Request): Promise<Response> {
  const prompt = sanitizeText(body?.prompt || '', MAX_IMAGE_PROMPT);
  if (!prompt) return json({ error: 'Prompt invalido.' }, 400, request);

  const model = pickModel(body, IMAGE_MODEL_DEFAULT);
  const stepsRaw = Number(body?.parameters?.steps ?? body?.parameters?.num_steps ?? body?.steps ?? body?.num_steps ?? 4);
  const steps = Number.isFinite(stepsRaw) ? Math.min(Math.max(stepsRaw, 1), 8) : 4;

  try {
    const result = (await env.AI.run(model as never, {
      prompt,
      steps,
    } as never)) as { image?: string; b64_json?: string };

    const b64 = String(result?.image || result?.b64_json || '').trim();
    if (!b64) return json({ error: 'Modelo nao retornou imagem.' }, 502, request);
    const dataUrl = b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
    return json({ imageDataUrl: dataUrl, model, success: true }, 200, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: `Falha ao gerar imagem: ${message}` }, 502, request);
  }
}

async function runAudio(env: Env, body: Record<string, unknown>, request: Request): Promise<Response> {
  const text = sanitizeText(body?.prompt || body?.text || '', MAX_AUDIO_PROMPT);
  if (!text) return json({ error: 'Texto invalido.' }, 400, request);

  const model = pickModel(body, AUDIO_MODEL_DEFAULT);
  const langRaw = String(body?.language || body?.lang || 'en').toLowerCase();
  // MeloTTS supports a limited language set; map pt-BR to en when needed.
  const lang = ['en', 'es', 'fr', 'ja', 'zh', 'kr', 'it', 'pt'].includes(langRaw)
    ? (langRaw === 'pt' || langRaw.startsWith('pt') ? 'en' : langRaw)
    : 'en';

  try {
    const result = await env.AI.run(model as never, {
      prompt: text,
      lang,
    } as never);

    const b64 = toBase64FromMaybeBinary(result);
    if (!b64) return json({ error: 'Modelo nao retornou audio.' }, 502, request);
    const dataUrl = b64.startsWith('data:') ? b64 : `data:audio/mpeg;base64,${b64}`;
    return json({ audioDataUrl: dataUrl, model, success: true, lang }, 200, request);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: `Falha ao gerar audio: ${message}` }, 502, request);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method !== 'POST') {
      return json({ error: 'Metodo nao permitido. Use POST.' }, 405, request);
    }

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;

    if (path === '/text' || path === '/v1/text') return runText(env, body, request);
    if (path === '/image' || path === '/v1/image') return runImage(env, body, request);
    if (path === '/audio' || path === '/v1/audio') return runAudio(env, body, request);

    if (path === '/' || path === '/health') {
      return json({ success: true, service: 'api-bibliotecai', models: { text: TEXT_MODEL_DEFAULT, image: IMAGE_MODEL_DEFAULT, audio: AUDIO_MODEL_DEFAULT } }, 200, request);
    }

    return json({ error: 'Caminho invalido. Use /text, /image ou /audio.' }, 400, request);
  },
};
