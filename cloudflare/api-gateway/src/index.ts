export interface Env {
  APP_ENV?: string;
  API_BASE_URL?: string;
}

type RouteHandler = (request: Request, env: Env) => Promise<Response> | Response;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-user-access-token',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders,
    },
  });
}

async function notImplemented(feature: string) {
  return jsonResponse(
    {
      success: false,
      error: `${feature} ainda nao foi conectado ao backend definitivo.`,
    },
    501,
  );
}

const routes: Record<string, RouteHandler> = {
  'GET /health': async (_request, env) =>
    jsonResponse({
      success: true,
      service: 'bibliotecai-api-gateway',
      env: env.APP_ENV || 'unknown',
      timestamp: new Date().toISOString(),
    }),

  'GET /v1/manifest': async () =>
    jsonResponse({
      success: true,
      modules: {
        auth: 'planned',
        tenants: 'planned',
        reclamacoes: 'planned',
        super_admins: 'planned',
        media: 'planned',
      },
    }),

  'POST /v1/auth/login': async () => notImplemented('Login pela API propria'),
  'POST /v1/auth/logout': async () => notImplemented('Logout pela API propria'),
  'GET /v1/auth/session': async () => notImplemented('Sessao pela API propria'),

  'GET /v1/reclamacoes': async () => notImplemented('Reclamacoes pela API propria'),
  'POST /v1/reclamacoes': async () => notImplemented('Criacao de reclamacoes pela API propria'),

  'GET /v1/admin/super-admins': async () => notImplemented('Gestao de Super Admins pela API propria'),
  'POST /v1/admin/super-admins': async () => notImplemented('Criacao de Super Admin pela API propria'),

  'GET /v1/admin/tenants': async () => notImplemented('Tenants pela API propria'),
  'POST /v1/admin/tenants': async () => notImplemented('Provisionamento de tenant pela API propria'),

  'POST /v1/media/sign-upload': async () => notImplemented('Assinatura de upload pela API propria'),
  'POST /v1/media/sign-download': async () => notImplemented('Assinatura de download pela API propria'),
};

function resolveRoute(request: Request) {
  const url = new URL(request.url);
  return `${request.method.toUpperCase()} ${url.pathname}`;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const routeKey = resolveRoute(request);
    const handler = routes[routeKey];

    if (!handler) {
      return jsonResponse(
        {
          success: false,
          error: 'Rota nao encontrada.',
          route: routeKey,
        },
        404,
      );
    }

    try {
      return await handler(request, env);
    } catch (error) {
      return jsonResponse(
        {
          success: false,
          error: error instanceof Error ? error.message : 'Falha inesperada no worker.',
        },
        500,
      );
    }
  },
};
