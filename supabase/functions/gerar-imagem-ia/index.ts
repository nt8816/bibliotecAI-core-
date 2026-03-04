const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};

const DEFAULT_MODEL = 'gemini-2.0-flash-preview-image-generation';

const ensureArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const extractGeminiImageDataUrl = (payload: any): string | null => {
  const candidates = ensureArray(payload?.candidates);

  for (const candidate of candidates) {
    const parts = ensureArray(candidate?.content?.parts);
    for (const part of parts) {
      const inlineData = part?.inlineData || part?.inline_data;
      const base64Data = inlineData?.data;
      if (!base64Data) continue;

      const mimeType = inlineData?.mimeType || inlineData?.mime_type || 'image/png';
      return `data:${mimeType};base64,${base64Data}`;
    }
  }

  return null;
};

const extractImagenDataUrl = (payload: any): string | null => {
  const predictions = ensureArray(payload?.predictions);
  const first = predictions[0] as any;
  const base64Data = first?.bytesBase64Encoded || first?.bytes_base64_encoded;
  if (!base64Data) return null;

  const mimeType = first?.mimeType || first?.mime_type || 'image/png';
  return `data:${mimeType};base64,${base64Data}`;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Metodo nao permitido.' }), { status: 405, headers: corsHeaders });
    }

    const geminiApiKey = Deno.env.get('GEMINI_API_KEY')?.trim();
    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: 'Secret GEMINI_API_KEY nao configurado no Supabase.' }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const body = await req.json().catch(() => ({}));
    const prompt = String(body?.prompt || '').trim();
    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Informe o prompt para gerar a imagem.' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const preferredModel = Deno.env.get('GEMINI_IMAGE_MODEL')?.trim() || DEFAULT_MODEL;
    const modelsToTry = [
      preferredModel,
      'gemini-2.0-flash-preview-image-generation',
      'gemini-2.0-flash-exp-image-generation',
      'gemini-2.5-flash-image-preview',
      'imagen-3.0-generate-002',
      'gemini-1.5-flash',
    ].filter(Boolean);

    const uniqueModels = [...new Set(modelsToTry)];
    const errors: string[] = [];

    for (const model of uniqueModels) {
      const isImagenModel = model.startsWith('imagen-');
      const endpoint = isImagenModel
        ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predict?key=${encodeURIComponent(geminiApiKey)}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

      const payloadToSend = isImagenModel
        ? {
            instances: [{ prompt }],
            parameters: { sampleCount: 1, aspectRatio: '16:9' },
          }
        : {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ['TEXT', 'IMAGE'],
              imageConfig: { aspectRatio: '16:9' },
            },
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadToSend),
      });

      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        const imageDataUrl = isImagenModel ? extractImagenDataUrl(payload) : extractGeminiImageDataUrl(payload);
        if (imageDataUrl) {
          return new Response(JSON.stringify({ imageDataUrl, model }), { status: 200, headers: corsHeaders });
        }

        const finishReason = payload?.candidates?.[0]?.finishReason || payload?.predictions?.[0]?.safetyAttributes || 'SEM_IMAGEM';
        errors.push(`${model}: respondeu sem imagem (${JSON.stringify(finishReason)})`);
        continue;
      }

      const message = payload?.error?.message || `HTTP ${response.status}`;
      errors.push(`${model}: ${response.status} - ${message}`);

      const retryable = /(quota exceeded|resource_exhausted|rate limit|not found|unknown model)/i.test(String(message));
      if (retryable) continue;
      break;
    }

    return new Response(
      JSON.stringify({
        error: `Nao foi possivel gerar imagem. Tentativas: ${errors.join(' | ') || 'sem detalhes'}`,
      }),
      { status: 502, headers: corsHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
