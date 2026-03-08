const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json",
};

const HF_DEFAULT_MODEL = "black-forest-labs/FLUX.1-dev";
const HF_DEFAULT_PROVIDER = "fal-ai";
const HF_DEFAULT_STEPS = 5;

const DEFAULT_MODELS = [
  "gemini-2.0-flash-exp-image-generation",
  "gemini-2.0-flash-preview-image-generation",
  "gemini-2.5-flash-image-preview",
  "imagen-3.0-generate-002",
];

const ensureArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const stripModelPrefix = (name: string): string => String(name || "").replace(/^models\//, "").trim();

const uint8ToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunk));
  }
  return btoa(binary);
};

const blobToDataUrl = async (blob: Blob): Promise<string> => {
  const mime = blob.type || "image/png";
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return `data:${mime};base64,${uint8ToBase64(bytes)}`;
};

const extractHfDataUrl = (payload: any): string | null => {
  const data = ensureArray(payload?.data);
  const first = data[0] as any;
  if (first?.b64_json) return `data:image/png;base64,${first.b64_json}`;
  if (first?.url && typeof first.url === "string" && first.url.startsWith("data:image/")) return first.url;
  if (typeof payload?.image === "string" && payload.image.startsWith("data:image/")) return payload.image;
  if (typeof payload?.image_base64 === "string") return `data:image/png;base64,${payload.image_base64}`;
  return null;
};

const toFiniteInt = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
};

const generateWithHuggingFace = async (
  token: string,
  prompt: string,
  model: string,
  provider: string,
  numInferenceSteps: number,
): Promise<{ imageDataUrl: string; model: string; provider: string }> => {
  const routerEndpoint = `https://router.huggingface.co/${encodeURIComponent(provider)}/v1/images/generations`;
  const routerResponse = await fetch(routerEndpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      response_format: "b64_json",
      parameters: { num_inference_steps: numInferenceSteps },
    }),
  });

  if (routerResponse.ok) {
    const contentType = String(routerResponse.headers.get("content-type") || "").toLowerCase();
    if (contentType.startsWith("image/")) {
      return {
        imageDataUrl: await blobToDataUrl(await routerResponse.blob()),
        model,
        provider,
      };
    }

    const payload = await routerResponse.json().catch(() => ({}));
    const imageDataUrl = extractHfDataUrl(payload);
    if (imageDataUrl) return { imageDataUrl, model, provider };
  }
  const errorPayload = await routerResponse.json().catch(() => ({}));
  const message = String(errorPayload?.error || errorPayload?.message || `HTTP ${routerResponse.status}`);
  throw new Error(`Hugging Face falhou (${provider}/${model}): ${routerResponse.status} - ${message}`);
};

const extractGeminiImageDataUrl = (payload: any): string | null => {
  const candidates = ensureArray(payload?.candidates);
  for (const candidate of candidates) {
    const parts = ensureArray(candidate?.content?.parts);
    for (const part of parts) {
      const inlineData = part?.inlineData || part?.inline_data;
      const base64Data = inlineData?.data;
      if (!base64Data) continue;
      const mimeType = inlineData?.mimeType || inlineData?.mime_type || "image/png";
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
  const mimeType = first?.mimeType || first?.mime_type || "image/png";
  return `data:${mimeType};base64,${base64Data}`;
};

const isRetryableError = (status: number, message: string): boolean => {
  if (status === 404 || status === 429 || status >= 500) return true;
  return /(quota exceeded|resource_exhausted|rate limit|unknown model|not found)/i.test(message);
};

const loadSupportedModels = async (apiKey: string): Promise<string[]> => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`,
    { headers: { "Content-Type": "application/json" } },
  );

  if (!response.ok) return [];
  const payload = await response.json().catch(() => ({}));
  const models = ensureArray(payload?.models) as any[];

  const names = models
    .filter((model) => {
      const name = stripModelPrefix(model?.name || "");
      const methods = ensureArray(model?.supportedGenerationMethods).map((m) => String(m || ""));
      const canGenerate = methods.includes("generateContent") || methods.includes("predict");
      return (
        canGenerate &&
        (name.includes("image") || name.includes("imagen") || name.includes("flash-exp"))
      );
    })
    .map((model) => stripModelPrefix(model?.name || ""))
    .filter(Boolean);

  return [...new Set(names)];
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Metodo nao permitido." }), { status: 405, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const prompt = String(body?.prompt || body?.inputs || "").trim();
    if (!prompt) {
      return new Response(JSON.stringify({ error: "Informe o prompt para gerar a imagem." }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const requestedModel = String(body?.model || "").trim();
    const requestedProvider = String(body?.provider || "").trim();
    const wantsHuggingFace =
      Boolean(requestedProvider) ||
      requestedModel.includes("/") ||
      requestedModel.toLowerCase().includes("flux");

    const hfToken = Deno.env.get("HF_TOKEN")?.trim();
    let hfErrorMessage = "";
    if (wantsHuggingFace && hfToken) {
      const model = String(body?.model || Deno.env.get("HF_IMAGE_MODEL") || HF_DEFAULT_MODEL).trim();
      const provider = String(body?.provider || Deno.env.get("HF_IMAGE_PROVIDER") || HF_DEFAULT_PROVIDER).trim();
      const numInferenceSteps = toFiniteInt(body?.parameters?.num_inference_steps, HF_DEFAULT_STEPS);

      try {
        const result = await generateWithHuggingFace(hfToken, prompt, model, provider, numInferenceSteps);
        return new Response(JSON.stringify(result), { status: 200, headers: corsHeaders });
      } catch (hfError) {
        hfErrorMessage = hfError instanceof Error ? hfError.message : "Erro desconhecido no Hugging Face";
      }
    } else if (wantsHuggingFace && !hfToken) {
      hfErrorMessage = "HF_TOKEN nao configurado para a solicitacao Hugging Face.";
    }

    const configuredModels = String(Deno.env.get("GEMINI_IMAGE_MODEL") || "")
      .split(",")
      .map(stripModelPrefix)
      .filter(Boolean);

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    if (!geminiApiKey) {
      return new Response(JSON.stringify({ error: hfErrorMessage || "Secret HF_TOKEN ou GEMINI_API_KEY nao configurado." }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const listedModels = await loadSupportedModels(geminiApiKey);
    const modelsToTry = [...new Set([...configuredModels, ...listedModels, ...DEFAULT_MODELS.map(stripModelPrefix)])];

    const errors: string[] = [];
    for (const model of modelsToTry) {
      const isImagenModel = model.startsWith("imagen-");
      const endpoint = isImagenModel
        ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predict?key=${encodeURIComponent(geminiApiKey)}`
        : `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`;

      const payloadToSend = isImagenModel
        ? { instances: [{ prompt }], parameters: { sampleCount: 1, aspectRatio: "16:9" } }
        : {
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseModalities: ["TEXT", "IMAGE"],
              imageConfig: { aspectRatio: "16:9" },
            },
          };

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadToSend),
      });

      const payload = await response.json().catch(() => ({}));
      if (response.ok) {
        const imageDataUrl = isImagenModel ? extractImagenDataUrl(payload) : extractGeminiImageDataUrl(payload);
        if (imageDataUrl) {
          return new Response(JSON.stringify({ imageDataUrl, model }), { status: 200, headers: corsHeaders });
        }

        errors.push(`${model}: respondeu sem imagem`);
        continue;
      }

      const message = String(payload?.error?.message || `HTTP ${response.status}`);
      errors.push(`${model}: ${response.status}`);

      if (!isRetryableError(response.status, message)) break;
    }

    if (errors.some((e) => e.includes(": 429"))) {
      return new Response(
        JSON.stringify({ error: "Limite de cota da API de imagens atingido. Verifique faturamento/limites no Google AI Studio." }),
        { status: 429, headers: corsHeaders },
      );
    }

    if (hfErrorMessage && errors.length === 0) {
      return new Response(JSON.stringify({ error: hfErrorMessage }), { status: 502, headers: corsHeaders });
    }

    return new Response(
      JSON.stringify({ error: `Nao foi possivel gerar imagem. Tentativas: ${[hfErrorMessage, ...errors].filter(Boolean).join(" | ") || "sem detalhes"}` }),
      { status: 502, headers: corsHeaders },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: message }), { status: 500, headers: corsHeaders });
  }
});
