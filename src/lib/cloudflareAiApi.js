const DEFAULT_BASE_URL = 'https://api-bibliotecai.ntn3223.workers.dev';
const API_BASE_URL = String(import.meta.env.VITE_BIBLIOTECA_AI_API_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

const ensureObject = (value) => (value && typeof value === 'object' ? value : {});

const SECRET_PATTERNS = [
  /api[_-]?key/i,
  /secret/i,
  /token/i,
  /password/i,
  /senha/i,
  /backend/i,
  /database/i,
  /connection\s*string/i,
  /postgres/i,
  /private\s*key/i,
  /bearer\s+[a-z0-9\-_.]+/i,
  /sk-[a-z0-9]{10,}/i,
];

const sanitizeText = (value, limit = 4000) => {
  let text = String(value || '');
  text = text.replace(/\u0000/g, '');
  if (text.length > limit) text = text.slice(0, limit);
  return text;
};

const hasSecretLikeContent = (value) => {
  const text = String(value || '');
  return SECRET_PATTERNS.some((pattern) => pattern.test(text));
};

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

const buildTextPromptFromTask = (task, input) => {
  const safeTask = String(task || '').trim().toLowerCase();
  const safeInput = ensureObject(input);
  const titulo = sanitizeText(safeInput.titulo, 200);
  const autor = sanitizeText(safeInput.autor, 200);
  const area = sanitizeText(safeInput.area, 120);
  const sinopse = sanitizeText(safeInput.sinopse || safeInput.sinopseBase, 2000);
  const tema = sanitizeText(safeInput.tema, 200);

  if (safeTask === 'sinopse_livro') {
    return [
      'Gere uma sinopse curta e clara em portugues do Brasil para uso escolar.',
      'Se possivel, tambem complete metadados bibliograficos basicos.',
      'Responda SOMENTE com JSON valido no formato: {"sinopse":"...","autor":"...","ano":"...","editora":"..."}',
      'Quando nao souber um campo, use string vazia.',
      `Titulo: ${titulo || 'nao informado'}`,
      `Autor: ${autor || 'nao informado'}`,
      `Area: ${area || 'nao informada'}`,
      `Contexto disponivel: ${sinopse || 'sem contexto adicional'}`,
    ].join('\n');
  }

  if (safeTask === 'quiz_leitura') {
    return [
      'Crie um quiz de leitura em portugues do Brasil.',
      'Responda SOMENTE com JSON valido no formato:',
      '{"livro":"...","quantidade":3,"alternativas":4,"perguntas":[{"enunciado":"...","opcoes":["A","B","C","D"],"correta":0}]}',
      'Use indice de resposta correta entre 0 e alternativas-1.',
      'Use o nome do livro fornecido no contexto.',
      `Livro: ${titulo || 'nao informado'}`,
      `Autor: ${autor || 'nao informado'}`,
      `Tema: ${tema || 'compreensao da leitura'}`,
      `Sinopse/base: ${sinopse || 'nao informada'}`,
    ].join('\n');
  }

  if (safeTask === 'resumo_estudo') {
    return [
      'Crie um resumo de estudo em portugues do Brasil para aluno.',
      'Responda SOMENTE com JSON valido no formato: {"texto":"..."}',
      `Livro: ${titulo || 'nao informado'}`,
      `Autor: ${autor || 'nao informado'}`,
      `Sinopse/base: ${sinopse || 'nao informada'}`,
    ].join('\n');
  }

  if (safeTask === 'gamificacao_desafio') {
    return [
      'Crie um desafio curto de gamificacao educacional para aluno.',
      'Responda SOMENTE com JSON valido no formato:',
      '{"titulo":"...","desafio":"...","recompensa":"...","xp_recompensa":50,"criterio":{"tipo":"livros_lidos|avaliacoes|atividades_aprovadas","alvo_total":2,"valor_inicial":1,"rotulo":"..."},"livro_diferenciado":{"titulo":"...","autor":"...","motivo":"..."}}',
      'O criterio precisa ser verificavel automaticamente pela plataforma.',
      'Use o nivel do aluno para definir o desafio.',
      'Se o aluno for iniciante, priorize leitura de 1 livro diferenciado escolhido pela IA.',
      'Quando houver lista em livros_sugeridos, prefira escolher um livro dessa lista.',
      `Aluno: ${sanitizeText(safeInput.nome || 'Aluno', 80)}`,
      `Nivel atual: ${Number(safeInput.nivel) || 1}`,
      `Perfil de nivel: ${sanitizeText(safeInput.perfil_descricao || safeInput.perfil_nivel || '', 80) || 'iniciante'}`,
      `XP atual: ${Number(safeInput.xp) || 0}`,
      `Livros lidos: ${Number(safeInput.livrosLidos) || 0}`,
      `Avaliacoes publicadas: ${Number(safeInput.avaliacoes || 0)}`,
      `Atividades aprovadas: ${Number(safeInput.atividadesAprovadas || 0)}`,
      `Criterio sugerido: ${sanitizeText(safeInput.criterio_tipo || '', 80) || 'livros_lidos'}`,
      `Meta sugerida total: ${Number(safeInput.criterio_alvo_total) || 1}`,
      `Valor inicial do criterio: ${Number(safeInput.criterio_valor_inicial) || 0}`,
      `Rotulo sugerido: ${sanitizeText(safeInput.criterio_rotulo || '', 120) || 'concluir 1 nova leitura'}`,
      `Livros sugeridos do catalogo: ${sanitizeText(JSON.stringify(safeInput.livros_sugeridos || []), 2000) || '[]'}`,
    ].join('\n');
  }

  return [
    'Responda em portugues do Brasil.',
    'Quando apropriado, responda com JSON valido.',
    `Tarefa: ${safeTask || 'geral'}`,
    `Entrada: ${sanitizeText(safeInput.prompt || '', 2000)}`,
  ].join('\n');
};

const extractJsonFromText = (text) => {
  const source = String(text || '').trim();
  if (!source) return null;

  try {
    return JSON.parse(source);
  } catch {
    // ignore
  }

  const fenced = source.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) {
    try {
      return JSON.parse(fenced[1]);
    } catch {
      // ignore
    }
  }

  const firstBrace = source.indexOf('{');
  const lastBrace = source.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(source.slice(firstBrace, lastBrace + 1));
    } catch {
      // ignore
    }
  }

  const firstBracket = source.indexOf('[');
  const lastBracket = source.lastIndexOf(']');
  if (firstBracket >= 0 && lastBracket > firstBracket) {
    try {
      return JSON.parse(source.slice(firstBracket, lastBracket + 1));
    } catch {
      // ignore
    }
  }

  return null;
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

const callBibliotecaAi = async (path, body, fallbackErrorMessage) => callDirect(path, body, fallbackErrorMessage);

export const generateTextWithCloudflare = async ({
  task,
  input,
  prompt,
  fallbackErrorMessage = 'Nao foi possivel gerar texto com IA no momento.',
} = {}) => {
  const finalPrompt = sanitizeText(String(prompt || '').trim(), 4000) || buildTextPromptFromTask(task, input);
  if (hasSecretLikeContent(finalPrompt)) {
    throw new Error('Conteudo sensivel detectado. Pedido bloqueado.');
  }

  const parsed = await callBibliotecaAi('/text', { prompt: finalPrompt }, fallbackErrorMessage);

  if (parsed.kind === 'text') {
    const text = String(parsed.payload || '').trim();
    const json = extractJsonFromText(text);
    return { data: ensureObject(json), text };
  }

  const payload = ensureObject(parsed.payload);
  const rawText = String(payload.text || payload.output || payload.response || '').trim();
  const responseJson = typeof payload.response === 'object' ? ensureObject(payload.response) : null;
  const textJson = extractJsonFromText(rawText);
  const data = ensureObject(payload.data || responseJson || textJson);
  const text = String(payload.text || data.text || rawText || '').trim();

  return { data, text, raw: payload, prompt: finalPrompt };
};

export const generateImageWithCloudflare = async ({
  prompt,
  model,
  provider,
  parameters,
  fallbackErrorMessage = 'Nao foi possivel gerar imagem no momento.',
} = {}) => {
  const safePrompt = sanitizeText(prompt, 2000);
  if (hasSecretLikeContent(safePrompt)) {
    throw new Error('Conteudo sensivel detectado. Pedido bloqueado.');
  }

  const parsed = await callBibliotecaAi('/image', { prompt: safePrompt, model, provider, parameters }, fallbackErrorMessage);

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
  const imageDataUrl = String(
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
  prompt,
  fallbackErrorMessage = 'Nao foi possivel gerar audio no momento.',
} = {}) => {
  const textPrompt = sanitizeText(String(prompt || text || '').trim(), 4000);
  if (hasSecretLikeContent(textPrompt)) {
    throw new Error('Conteudo sensivel detectado. Pedido bloqueado.');
  }

  const parsed = await callBibliotecaAi(
    '/audio',
    { prompt: textPrompt, text, voice, language, lang: language, model },
    fallbackErrorMessage,
  );

  if (parsed.kind === 'binary') {
    const audioDataUrl = String(parsed.payload?.dataUrl || '');
    if (!audioDataUrl) throw new Error('A API respondeu sem audio.');
    return { audioDataUrl };
  }

  if (parsed.kind === 'text') {
    throw new Error('A API respondeu em formato invalido para audio.');
  }

  const payload = ensureObject(parsed.payload);
  const data = ensureObject(payload.data);
  const mimeType = String(payload.mimeType || data.mimeType || 'audio/mpeg');

  const directAudio = String(
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

  const audioBase64 = String(
    payload.audio_base64 || payload.audioBase64 || data.audio_base64 || data.audioBase64 || '',
  ).trim();

  const audioDataUrl = toDataUrlFromBase64(audioBase64, mimeType);
  if (!audioDataUrl) throw new Error('A API respondeu sem audio.');

  return { audioDataUrl };
};
