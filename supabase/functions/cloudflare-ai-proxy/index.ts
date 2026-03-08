const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const isAllowedPath = (path: string) => path === "/text" || path === "/image" || path === "/audio";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  try {
    if (req.method !== "POST") return jsonResponse({ error: "Método não permitido." }, 405);

    const payload = await req.json().catch(() => ({}));
    const path = String(payload?.path || "").trim();
    const body = payload?.body ?? {};

    if (!isAllowedPath(path)) {
      return jsonResponse({ error: "Caminho inválido. Use /text, /image ou /audio." }, 400);
    }

    const baseUrl = String(
      Deno.env.get("CLOUDFLARE_AI_BASE_URL") || "https://api-bibliotecai.ntn3223.workers.dev",
    ).replace(/\/+$/, "");

    const upstream = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const contentType = String(upstream.headers.get("content-type") || "").toLowerCase();

    if (!upstream.ok) {
      if (contentType.includes("application/json")) {
        const err = await upstream.json().catch(() => ({}));
        return jsonResponse(err, upstream.status);
      }
      const text = await upstream.text().catch(() => "");
      return jsonResponse({ error: text || `Erro upstream HTTP ${upstream.status}` }, upstream.status);
    }

    if (contentType.includes("application/json")) {
      const data = await upstream.json().catch(() => ({}));
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bytes = await upstream.arrayBuffer();
    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": contentType || "application/octet-stream",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return jsonResponse({ error: message }, 500);
  }
});
