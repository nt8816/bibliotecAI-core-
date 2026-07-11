const ALLOWED_ORIGINS = ['https://bibliotecai.com.br', 'https://app.bibliotecai.com.br', 'http://localhost:5173', 'http://localhost:3000'];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const safeOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Content-Type": "application/json",
  };
}

const DEFAULT_TEXT_MODEL = "gemini-2.0-flash";
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const ensureArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const stripModelPrefix = (name: string): string => String(name || "").replace(/^models\//, "").trim();

const extractTextFromGemini = (payload: any): string => {
  const candidates = ensureArray(payload?.candidates);
  const chunks: string[] = [];

  for (const candidate of candidates) {
    const parts = ensureArray(candidate?.content?.parts);
    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.trim()) chunks.push(part.text);
    }
  }

  return chunks.join("\n").trim();
};

const parseJsonSafely = (text: string): any | null => {
  const normalized = String(text || "").trim();
  if (!normalized) return null;

  const direct = (() => {
    try {
      return JSON.parse(normalized);
    } catch {
      return null;
    }
  })();
  if (direct) return direct;

  const fenced = normalized.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1] || "";
  if (fenced) {
    try {
      return JSON.parse(fenced);
    } catch {
      return null;
    }
  }

  return null;
};

type PromptConfig = {
  systemInstruction: string;
  userPrompt: string;
  expectJson: boolean;
};

const buildPrompt = (task: string, input: any): PromptConfig => {
  if (task === "sinopse_livro") {
    const titulo = String(input?.titulo || "").trim();
    const autor = String(input?.autor || "").trim();
    const area = String(input?.area || "").trim();
    const base = String(input?.sinopseBase || "").trim();

    return {
      systemInstruction:
        "Você é assistente de biblioteca escolar. Produza texto em português brasileiro claro, apropriado para estudantes.",
      userPrompt: [
        "Gere uma sinopse curta e objetiva para cadastro de livro.",
        `Título: ${titulo || "não informado"}`,
        `Autor: ${autor || "não informado"}`,
        `Área: ${area || "não informada"}`,
        `Contexto disponível: ${base || "sem contexto adicional"}`,
        "Responda em JSON no formato exato:",
        '{"sinopse":"..."}',
        "A sinopse deve ter entre 80 e 160 palavras.",
      ].join("\n"),
      expectJson: true,
    };
  }

  if (task === "quiz_leitura") {
    const titulo = String(input?.titulo || "").trim();
    const autor = String(input?.autor || "").trim();
    const tema = String(input?.tema || "compreensão da leitura").trim();
    const sinopse = String(input?.sinopse || "").trim();
    const quantidade = Math.min(5, Math.max(3, Number(input?.quantidade) || 3));

    return {
      systemInstruction:
        "Você cria quizzes educacionais em português brasileiro para alunos do ensino básico, com foco em leitura crítica.",
      userPrompt: [
        "Crie um quiz de múltipla escolha com alternativas claras.",
        `Livro: ${titulo || "não informado"}`,
        `Autor: ${autor || "não informado"}`,
        `Tema: ${tema}`,
        `Sinopse/base: ${sinopse || "não informada"}`,
        `Quantidade de perguntas: ${quantidade}`,
        "Responda em JSON no formato exato:",
        '{"perguntas":[{"enunciado":"...","opcoes":["A","B","C","D"],"correta":0}]}',
        "Regras: exatamente 4 opções por pergunta; correta é índice 0-3; apenas uma correta.",
      ].join("\n"),
      expectJson: true,
    };
  }

  if (task === "resumo_estudo") {
    const titulo = String(input?.titulo || "").trim();
    const autor = String(input?.autor || "").trim();
    const sinopse = String(input?.sinopse || "").trim();

    return {
      systemInstruction:
        "Você cria resumos educacionais para estudantes em português brasileiro, com estrutura didática, leitura leve e linguagem simples.",
      userPrompt: [
        "Gere um resumo guiado para estudo de leitura.",
        `Livro: ${titulo || "não informado"}`,
        `Autor: ${autor || "não informado"}`,
        `Sinopse/base: ${sinopse || "não informada"}`,
        "Responda em JSON no formato exato:",
        '{"texto":"..."}',
        'Dentro de "texto", use blocos curtos separados por linha em branco.',
        "Siga esta estrutura: 1. Visão geral; 2. Ideias principais; 3. Personagens ou elementos centrais; 4. O que esse livro ensina; 5. Pergunta para pensar.",
        "Use linguagem simples, tom acolhedor e frases naturais.",
        "Se faltar informação, deixe isso claro sem inventar fatos.",
        "Tamanho entre 130 e 220 palavras.",
      ].join("\n"),
      expectJson: true,
    };
  }

  if (task === "gamificacao_desafio") {
    const nome = String(input?.nome || "Aluno").trim();
    const nivel = Number(input?.nivel) || 1;
    const xp = Number(input?.xp) || 0;
    const livrosLidos = Number(input?.livrosLidos) || 0;

    return {
      systemInstruction:
        "Você cria desafios de gamificação para leitura escolar em português brasileiro, com tom encorajador e objetivo.",
      userPrompt: [
        "Crie um desafio diário curto para motivar leitura.",
        `Aluno: ${nome}`,
        `Nível atual: ${nivel}`,
        `XP atual: ${xp}`,
        `Livros lidos: ${livrosLidos}`,
        "Responda em JSON no formato exato:",
        '{"titulo":"...","desafio":"...","recompensa":"..."}',
        "Cada campo deve ter no máximo 20 palavras.",
      ].join("\n"),
      expectJson: true,
    };
  }

  const livrePrompt = String(input?.prompt || "").trim();
  return {
    systemInstruction: "Você responde em português brasileiro com clareza e objetividade.",
    userPrompt: livrePrompt,
    expectJson: false,
  };
};

const callGemini = async (
  apiKey: string,
  model: string,
  config: PromptConfig,
): Promise<{ text: string; parsed: any | null }> => {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const payloadToSend: any = {
    systemInstruction: {
      role: "system",
      parts: [{ text: config.systemInstruction }],
    },
    contents: [{ role: "user", parts: [{ text: config.userPrompt }] }],
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 900,
    },
  };

  if (config.expectJson) {
    payloadToSend.generationConfig.responseMimeType = "application/json";
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payloadToSend),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload?.error?.message || `HTTP ${response.status}`);
    if (response.status === 429) {
      throw new HttpError(
        429,
        "Limite/cota da API Gemini atingido para este projeto. Ative faturamento/cota no Google AI Studio e tente novamente.",
      );
    }
    throw new HttpError(response.status, `Google AI Studio falhou: ${response.status} - ${message}`);
  }

  const text = extractTextFromGemini(payload);
  if (!text) throw new Error("Google AI Studio respondeu sem texto.");

  const parsed = config.expectJson ? parseJsonSafely(text) : null;
  return { text, parsed };
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Método não permitido." }), { status: 405, headers: getCorsHeaders(req) });
    }

    // Auth check — require valid JWT
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Autenticacao necessaria." }), { status: 401, headers: getCorsHeaders(req) });
    }
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const authClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token invalido ou expirado." }), { status: 401, headers: getCorsHeaders(req) });
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY")?.trim();
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Secret GEMINI_API_KEY nao configurado." }), {
        status: 500,
        headers: getCorsHeaders(req),
      });
    }

    const body = await req.json().catch(() => ({}));
    const task = String(body?.task || "livre").trim();
    const input = body?.input || {};

    const config = buildPrompt(task, input);
    if (!config.userPrompt) {
      return new Response(JSON.stringify({ error: "Entrada invalida para gerar texto." }), {
        status: 400,
        headers: getCorsHeaders(req),
      });
    }

    const model = stripModelPrefix(String(body?.model || Deno.env.get("GEMINI_TEXT_MODEL") || DEFAULT_TEXT_MODEL));
    const { text, parsed } = await callGemini(apiKey, model, config);

    return new Response(
      JSON.stringify({
        task,
        model,
        text,
        data: parsed,
      }),
      { status: 200, headers: getCorsHeaders(req) },
    );
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(JSON.stringify({ error: message }), { status, headers: getCorsHeaders(req) });
  }
});
