export interface Env {
  APP_ENV?: string;
  API_BASE_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
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

function getUserToken(request: Request) {
  const manualToken = request.headers.get('x-user-access-token') || '';
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization') || '';
  return String(manualToken || authHeader.replace(/^Bearer\s+/i, '')).trim();
}

function getPathParam(request: Request, pattern: RegExp, groupIndex = 1) {
  const url = new URL(request.url);
  const match = url.pathname.match(pattern);
  return match?.[groupIndex] || '';
}

function getSupabaseConfig(env: Env) {
  const supabaseUrl = String(env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const publishableKey = String(env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  const serviceRoleKey = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

  if (!supabaseUrl || !publishableKey || !serviceRoleKey) {
    throw new Error('Variaveis do Supabase ausentes no Worker.');
  }

  return { supabaseUrl, publishableKey, serviceRoleKey };
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) return response.json();
  return response.text();
}

async function fetchSupabaseUser(request: Request, env: Env) {
  const token = getUserToken(request);
  if (!token) {
    return null;
  }

  const { supabaseUrl, publishableKey } = getSupabaseConfig(env);
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload = await parseResponse(response);
  return payload?.id ? payload : null;
}

async function supabaseAdminRequest(
  env: Env,
  path: string,
  { method = 'GET', body, headers }: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig(env);
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(headers || {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      (typeof payload === 'string' && payload.trim()) ||
      payload?.message ||
      payload?.error ||
      `Falha na consulta administrativa ao Supabase (HTTP ${response.status}).`,
    );
  }

  return payload;
}

async function supabaseUserRpc(request: Request, env: Env, functionName: string, body: unknown = {}) {
  const token = getUserToken(request);
  if (!token) {
    throw new Error('Token do usuario ausente.');
  }

  const { supabaseUrl, publishableKey } = getSupabaseConfig(env);
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      (typeof payload === 'string' && payload.trim()) ||
      payload?.message ||
      payload?.error ||
      `Falha ao executar RPC ${functionName} (HTTP ${response.status}).`,
    );
  }

  return payload;
}

async function isSuperAdmin(userId: string, env: Env) {
  const params = new URLSearchParams({
    select: 'role',
    user_id: `eq.${userId}`,
    role: 'eq.super_admin',
    limit: '1',
  });

  const payload = await supabaseAdminRequest(env, `/rest/v1/user_roles?${params.toString()}`);
  return Array.isArray(payload) && payload.length > 0;
}

async function getLatestUserProfile(userId: string, env: Env) {
  const params = new URLSearchParams({
    select: 'id,escola_id,nome,email,tipo',
    user_id: `eq.${userId}`,
    order: 'updated_at.desc.nullslast,created_at.desc',
    limit: '1',
  });

  const payload = await supabaseAdminRequest(env, `/rest/v1/usuarios_biblioteca?${params.toString()}`);
  return Array.isArray(payload) ? (payload[0] || null) : null;
}

async function callSupabaseFunction(
  request: Request,
  env: Env,
  functionName: string,
  body: unknown,
) {
  const userToken = getUserToken(request);
  if (!userToken) {
    throw new Error('Token do usuario ausente.');
  }

  const { supabaseUrl, publishableKey } = getSupabaseConfig(env);
  const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      'x-user-access-token': userToken,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      (typeof payload === 'string' && payload.trim()) ||
      payload?.message ||
      payload?.error ||
      `Falha ao chamar function ${functionName} (HTTP ${response.status}).`,
    );
  }

  return payload;
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
        reclamacoes: 'read_ready',
        super_admins: 'read_ready',
        media: 'planned',
      },
    }),

  'POST /v1/auth/login': async () => notImplemented('Login pela API propria'),
  'POST /v1/auth/logout': async () => notImplemented('Logout pela API propria'),
  'GET /v1/auth/session': async () => notImplemented('Sessao pela API propria'),

  'GET /v1/reclamacoes': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const items = await supabaseUserRpc(request, env, 'get_reclamacoes_super_admin_feed');
    return jsonResponse({ success: true, items: Array.isArray(items) ? items : [] });
  },
  'POST /v1/reclamacoes': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const profile = await getLatestUserProfile(user.id, env);
    const roleRows = await supabaseAdminRequest(
      env,
      `/rest/v1/user_roles?${new URLSearchParams({
        select: 'role',
        user_id: `eq.${user.id}`,
      }).toString()}`,
    );
    const roleList = Array.isArray(roleRows) ? roleRows.map((item) => String(item?.role || '')) : [];
    const senderRole = roleList.includes('super_admin')
      ? 'super_admin'
      : profile?.tipo || 'aluno';

    const assunto = String(body?.assunto || '').trim();
    const mensagem = String(body?.mensagem || '').trim();
    const imageUrls = Array.isArray(body?.image_urls)
      ? body.image_urls.filter((item: unknown) => typeof item === 'string')
      : [];

    if (assunto.length < 3 || mensagem.length < 10) {
      return jsonResponse({ success: false, error: 'Assunto ou mensagem invalidos.' }, 400);
    }

    await supabaseAdminRequest(env, '/rest/v1/reclamacoes_super_admin', {
      method: 'POST',
      body: {
        sender_user_id: user.id,
        sender_profile_id: profile?.id || null,
        sender_role: senderRole,
        sender_nome: profile?.nome || user.user_metadata?.nome || user.email || null,
        sender_email: profile?.email || user.email || null,
        escola_id: profile?.escola_id || null,
        assunto,
        mensagem,
        image_urls: imageUrls,
      },
      headers: {
        Prefer: 'return=minimal',
      },
    });

    return jsonResponse({ success: true });
  },
  'PATCH /v1/reclamacoes/:id': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const allowed = await isSuperAdmin(user.id, env);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Sem permissao para atualizar reclamacoes.' }, 403);
    }

    const reclamacaoId = getPathParam(request, /^\/v1\/reclamacoes\/([^/]+)$/);
    if (!reclamacaoId) {
      return jsonResponse({ success: false, error: 'ID da reclamacao ausente.' }, 400);
    }

    const body = await request.json().catch(() => ({}));
    await supabaseAdminRequest(
      env,
      `/rest/v1/reclamacoes_super_admin?${new URLSearchParams({ id: `eq.${reclamacaoId}` }).toString()}`,
      {
        method: 'PATCH',
        body: {
          status: body?.status,
          resposta: body?.resposta ?? null,
        },
        headers: {
          Prefer: 'return=minimal',
        },
      },
    );

    return jsonResponse({ success: true });
  },
  'POST /v1/reclamacoes/:id/read': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const reclamacaoId = getPathParam(request, /^\/v1\/reclamacoes\/([^/]+)\/read$/);
    if (!reclamacaoId) {
      return jsonResponse({ success: false, error: 'ID da reclamacao ausente.' }, 400);
    }

    await supabaseUserRpc(request, env, 'mark_reclamacao_super_admin_lida', {
      _reclamacao_id: reclamacaoId,
    });

    return jsonResponse({ success: true });
  },

  'GET /v1/admin/super-admins': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const allowed = await isSuperAdmin(user.id, env);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Sem permissao para acessar Super Admins.' }, 403);
    }

    const accountsParams = new URLSearchParams({
      select: 'id,nome,email,cpf,ativo,bloqueado,tentativas_falhas,ultima_tentativa_em,ultimo_login_em,bloqueado_em,created_at',
      order: 'created_at.asc',
    });

    const logsParams = new URLSearchParams({
      select: 'id,event,message,ip,created_at,context',
      event: 'in.(super_admin_login_failed,super_admin_account_locked)',
      order: 'created_at.desc',
      limit: '1',
    });

    const [items, alerts] = await Promise.all([
      supabaseAdminRequest(env, `/rest/v1/super_admin_accounts?${accountsParams.toString()}`),
      supabaseAdminRequest(env, `/rest/v1/system_logs?${logsParams.toString()}`),
    ]);

    return jsonResponse({
      success: true,
      items: Array.isArray(items) ? items : [],
      securityAlert: Array.isArray(alerts) ? (alerts[0] || null) : null,
    });
  },
  'POST /v1/admin/super-admins': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const allowed = await isSuperAdmin(user.id, env);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Sem permissao para criar Super Admin.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const payload = await callSupabaseFunction(request, env, 'gerenciar-super-admins', {
      operation: 'create',
      nome: body?.nome,
      email: body?.email,
      cpf: body?.cpf,
      senha: body?.senha,
    });

    return jsonResponse(payload);
  },
  'POST /v1/admin/super-admins/:id/unlock': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const allowed = await isSuperAdmin(user.id, env);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Sem permissao para liberar Super Admin.' }, 403);
    }

    const accountId = getPathParam(request, /^\/v1\/admin\/super-admins\/([^/]+)\/unlock$/);
    if (!accountId) {
      return jsonResponse({ success: false, error: 'ID da conta ausente.' }, 400);
    }

    const payload = await callSupabaseFunction(request, env, 'gerenciar-super-admins', {
      operation: 'unlock',
      account_id: accountId,
    });

    return jsonResponse(payload);
  },

  'GET /v1/admin/tenants': async () => notImplemented('Tenants pela API propria'),
  'POST /v1/admin/tenants': async () => notImplemented('Provisionamento de tenant pela API propria'),

  'POST /v1/media/sign-upload': async () => notImplemented('Assinatura de upload pela API propria'),
  'POST /v1/media/sign-download': async () => notImplemented('Assinatura de download pela API propria'),
};

function normalizeDynamicRoute(routeKey: string) {
  return routeKey
    .replace(/\/v1\/reclamacoes\/[^/]+\/read$/, '/v1/reclamacoes/:id/read')
    .replace(/\/v1\/reclamacoes\/[^/]+$/, '/v1/reclamacoes/:id')
    .replace(/\/v1\/admin\/super-admins\/[^/]+\/unlock$/, '/v1/admin/super-admins/:id/unlock');
}

function resolveRoute(request: Request) {
  const url = new URL(request.url);
  return normalizeDynamicRoute(`${request.method.toUpperCase()} ${url.pathname}`);
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
