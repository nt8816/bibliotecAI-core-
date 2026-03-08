import { invokeEdgeFunction } from '@/lib/invokeEdgeFunction';

const DEFAULT_BASE_URL = 'https://api-bibliotecai.ntn3223.workers.dev';
const API_BASE_URL = String(import.meta.env.VITE_BIBLIOTECA_AI_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
const USE_PROXY = import.meta.env.VITE_BIBLIOTECA_AI_USE_PROXY !== 'false';

const ensureObject = (value) => (value && typeof value === 'object' ? value : {});

const toDataUrlFromBase64 = (base64, mimeType = 'application/octet-stream') => {
  if (!base64 || typeof base64 !== 'string') return null;
  return `data:${mimeType};base64,${base64}`;
};

const blobToDataUrl = async (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Falha ao converter arquivo para Data URL.'));
    reader.readAsDataURL(blob);
  });

const parseResponseBody = async (response) => {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('application/json')) {
    return { kind: 'json', payload: await response.json().catch(() => ({})) };
  }

  if (contentType.startsWith('audio/') || contentType.startsWith('image/')) {
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    return { kind: 'binary', payload: { dataUrl, contentType } };
  }

  const text = await response.text();
  return { kind: 'text', payload: text };
};

const extractErrorMessage = (parsed, fallback) => {
  const normalize = (value) => {
    const message = String(value || '').trim();
    if (!message) return fallback;
    if (message.includes("Cannot read properties of undefined (reading 'run')")) {
      return 'Worker Cloudflare sem binding/configuracao de modelo para /image. Revise wrangler.toml e o handler do endpoint.';
    }
    return message;
  };

  if (parsed.kind === 'json') {
    const payload = ensureObject(parsed.payload);
    return normalize(payload.error || payload.message || fallback);
  }
  if (parsed.kind === 'text') {
    return normalize(parsed.payload);
  }
  return fallback;
};

const callDirect = async (path, body, fallbackErrorMessage) => {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });

  const parsed = await parseResponseBody(response);
  if (!response.ok) throw new Error(extractErrorMessage(parsed, `${fallbackErrorMessage} (HTTP ${response.status})`));
  return parsed;
};

const callViaProxy = async (path, body, fallbackErrorMessage) => {
  const response = await invokeEdgeFunction('cloudflare-ai-proxy', {
    body: { path, body: body || {} },
    requireAuth: false,
    fallbackErrorMessage,
  });

  if (typeof response === 'string') return { kind: 'text', payload: response };

  // Binary payloads are returned by invokeEdgeFunction as Blob in browsers.
  if (response instanceof Blob) {
    const dataUrl = await blobToDataUrl(response);
    const contentType = String(response.type || '').toLowerCase();
    return { kind: 'binary', payload: { dataUrl, contentType } };
  }

  return { kind: 'json', payload: response || {} };
};

const callBibliotecaAi = async (path, body, fallbackErrorMessage) => {
  if (USE_PROXY) return callViaProxy(path, body, fallbackErrorMessage);

  try {
    return await callDirect(path, body, fallbackErrorMessage);
  } catch (error) {
    const isNetworkError = String(error?.message || '').toLowerCase().includes('failed to fetch');
    if (!isNetworkError) throw error;
    return callViaProxy(path, body, fallbackErrorMessage);
  }
};

export const generateTextWithCloudflare = async ({
  task,
  input,
  prompt,
  fallbackErrorMessage = 'Nao foi possivel gerar texto com IA no momento.',
} = {}) => {
  const parsed = await callBibliotecaAi('/text', { task, input, prompt }, fallbackErrorMessage);

  if (parsed.kind === 'text') {
    const text = String(parsed.payload || '').trim();
    return { data: null, text };
  }

  const payload = ensureObject(parsed.payload);
  const data = ensureObject(payload.data);
  const text =
    String(payload.text || data.text || payload.output || payload.response || '').trim();

  return { data, text, raw: payload };
};

export const generateImageWithCloudflare = async ({
  prompt,
  model,
  provider,
  parameters,
  fallbackErrorMessage = 'Nao foi possivel gerar imagem no momento.',
} = {}) => {
  const parsed = await callBibliotecaAi('/image', { prompt, model, provider, parameters }, fallbackErrorMessage);

  if (parsed.kind === 'binary') {
    const imageDataUrl = String(parsed.payload?.dataUrl || '');
    if (!imageDataUrl) throw new Error('A API respondeu sem imagem.');
    return { imageDataUrl };
  }

  if (parsed.kind === 'text') {
    throw new Error('A API respondeu em formato invalido para imagem.');
  }

  const payload = ensureObject(parsed.payload);
  const data = ensureObject(payload.data);
  const imageDataUrl =
    String(
      payload.imageDataUrl ||
        payload.image ||
        payload.url ||
        data.imageDataUrl ||
        data.image ||
        data.url ||
        '',
    ).trim();

  if (!imageDataUrl) throw new Error('A API respondeu sem imagem.');
  return { imageDataUrl };
};

export const generateAudioWithCloudflare = async ({
  text,
  voice,
  language = 'pt-BR',
  model,
  fallbackErrorMessage = 'Nao foi possivel gerar audio no momento.',
} = {}) => {
  const parsed = await callBibliotecaAi('/audio', { text, voice, language, model }, fallbackErrorMessage);

  if (parsed.kind === 'binary') {
    const audioDataUrl = String(parsed.payload?.dataUrl || '');
    if (!audioDataUrl) throw new Error('A API respondeu sem áudio.');
    return { audioDataUrl };
  }

  if (parsed.kind === 'text') {
    throw new Error('A API respondeu em formato invalido para áudio.');
  }

  const payload = ensureObject(parsed.payload);
  const data = ensureObject(payload.data);
  const mimeType = String(payload.mimeType || data.mimeType || 'audio/mpeg');

  const directAudio =
    String(
      payload.audioDataUrl ||
        payload.audio_url ||
        payload.audioUrl ||
        payload.url ||
        data.audioDataUrl ||
        data.audio_url ||
        data.audioUrl ||
        data.url ||
        '',
    ).trim();

  if (directAudio) return { audioDataUrl: directAudio };

  const audioBase64 =
    String(payload.audio_base64 || payload.audioBase64 || data.audio_base64 || data.audioBase64 || '').trim();

  const audioDataUrl = toDataUrlFromBase64(audioBase64, mimeType);
  if (!audioDataUrl) throw new Error('A API respondeu sem áudio.');

  return { audioDataUrl };
};
