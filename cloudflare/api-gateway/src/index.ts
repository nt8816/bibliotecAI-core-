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

async function supabaseAdminAuthRequest(
  env: Env,
  path: string,
  { method = 'GET', body, headers }: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig(env);
  const response = await fetch(`${supabaseUrl}/auth/v1/admin${path}`, {
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
      payload?.msg ||
      payload?.message ||
      payload?.error_description ||
      payload?.error ||
      `Falha na consulta administrativa ao Auth do Supabase (HTTP ${response.status}).`,
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

async function supabaseUserRequest(
  request: Request,
  env: Env,
  path: string,
  { method = 'GET', body, headers }: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const token = getUserToken(request);
  if (!token) {
    throw new Error('Token do usuario ausente.');
  }

  const { supabaseUrl, publishableKey } = getSupabaseConfig(env);
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${token}`,
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
      `Falha na requisicao autenticada ao Supabase (HTTP ${response.status}).`,
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

function normalizeIdentifier(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeMatricula(value: unknown) {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function escapeLike(value: string) {
  return value.replace(/[%_]/g, '');
}

function getRequestIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for') || '';
  const firstForwarded = forwarded.split(',')[0]?.trim();
  return firstForwarded || request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || null;
}

function getRequestUserAgent(request: Request) {
  return request.headers.get('user-agent') || null;
}

async function insertSystemLog(
  request: Request,
  env: Env,
  payload: Record<string, unknown>,
) {
  try {
    await supabaseAdminRequest(env, '/rest/v1/system_logs', {
      method: 'POST',
      body: {
        ip: getRequestIp(request),
        user_agent: getRequestUserAgent(request),
        ...payload,
      },
      headers: {
        Prefer: 'return=minimal',
      },
    });
  } catch {
    // Logging must never break the primary flow.
  }
}

async function findAuthUserByEmail(env: Env, email: string) {
  let page = 1;
  const perPage = 1000;
  const expected = normalizeIdentifier(email);

  while (true) {
    const payload = await supabaseAdminAuthRequest(
      env,
      `/users?${new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
      }).toString()}`,
    );

    const users = Array.isArray(payload?.users) ? payload.users : [];
    const found = users.find((item: Record<string, unknown>) => normalizeIdentifier(item?.email) === expected);
    if (found?.id) return found;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function resolveSuperAdminMatch(identifier: string, env: Env) {
  const normalized = normalizeIdentifier(identifier);
  const digits = normalizeDigits(identifier);
  const payload = await supabaseAdminRequest(
    env,
    `/rest/v1/super_admin_accounts?${new URLSearchParams({
      select: 'id,nome,email,cpf,ativo,bloqueado,tentativas_falhas,bloqueado_em,created_at',
      order: 'created_at.asc',
      limit: '200',
    }).toString()}`,
  );

  const items = Array.isArray(payload) ? payload : [];
  const account = items.find((item) => normalizeIdentifier(item?.email) === normalized || (digits && String(item?.cpf || '') === digits));

  if (!account?.id) {
    return { matched: false };
  }

  return {
    matched: true,
    account_id: account.id,
    email: normalizeIdentifier(account.email),
    nome: account.nome || null,
    ativo: account.ativo !== false,
    bloqueado: account.bloqueado === true,
    tentativas_falhas: Number(account.tentativas_falhas || 0),
  };
}

async function fetchLatestProfileEmailByCpf(identifier: string, env: Env) {
  const digits = normalizeDigits(identifier);
  if (!digits) return null;

  const payload = await supabaseAdminRequest(
    env,
    `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
      select: 'email',
      cpf: `eq.${digits}`,
      user_id: 'not.is.null',
      order: 'updated_at.desc.nullslast,created_at.desc',
      limit: '1',
    }).toString()}`,
  );

  return Array.isArray(payload) ? (payload[0]?.email || null) : null;
}

async function fetchMatriculaProfile(identifier: string, env: Env) {
  const compact = String(identifier || '').replace(/\s+/g, '');
  const normalized = normalizeMatricula(identifier);
  if (!compact && !normalized) return null;

  const candidates = [...new Set([compact, normalized].filter(Boolean))];
  if (!candidates.length) return null;

  const orExpression = candidates.map((item) => `matricula.eq.${item}`).join(',');
  const payload = await supabaseAdminRequest(
    env,
    `/rest/v1/usuarios_biblioteca?select=email,user_id,matricula,tipo,updated_at,created_at&tipo=eq.aluno&or=(${orExpression})&order=updated_at.desc.nullslast,created_at.desc&limit=1`,
  );

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
        auth: 'write_ready',
        tenants: 'write_ready',
        reclamacoes: 'read_ready',
        super_admins: 'read_ready',
        media: 'planned',
      },
    }),

  'POST /v1/auth/login': async (request, env) => {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!email || !password) {
      return jsonResponse({ success: false, error: 'Email e senha sao obrigatorios.' }, 400);
    }

    const { supabaseUrl, publishableKey } = getSupabaseConfig(env);
    const authResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const authPayload = await parseResponse(authResponse);
    if (!authResponse.ok) {
      return jsonResponse(
        {
          success: false,
          error:
            (typeof authPayload === 'string' && authPayload.trim()) ||
            authPayload?.msg ||
            authPayload?.error_description ||
            authPayload?.error ||
            'Falha ao autenticar.',
        },
        authResponse.status,
      );
    }

    return jsonResponse({
      success: true,
      session: authPayload,
      user: authPayload?.user || null,
    });
  },
  'POST /v1/auth/resolve-login': async (request, env) => {
    const body = await request.json().catch(() => ({}));
    const identifier = String(body?.identifier || '').trim();
    const digits = normalizeDigits(identifier);

    if (!identifier) {
      return jsonResponse({ success: false, error: 'Identificador nao informado.' }, 400);
    }

    const [superAdminMatch, cpfEmail, matriculaEmail, matriculaActivated] = await Promise.all([
      resolveSuperAdminMatch(identifier, env),
      fetchLatestProfileEmailByCpf(digits || identifier, env),
      fetchMatriculaProfile(identifier, env),
    ]);

    return jsonResponse({
      success: true,
      superAdminMatch: superAdminMatch || null,
      cpfEmail: cpfEmail || null,
      matriculaEmail: matriculaEmail?.email || null,
      matriculaActivated: matriculaEmail ? Boolean(matriculaEmail.user_id) : null,
    });
  },
  'POST /v1/auth/logout': async (request, env) => {
    const token = getUserToken(request);
    if (!token) {
      return jsonResponse({ success: true });
    }

    const { supabaseUrl, publishableKey } = getSupabaseConfig(env);
    const logoutResponse = await fetch(`${supabaseUrl}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!logoutResponse.ok) {
      const payload = await parseResponse(logoutResponse);
      return jsonResponse(
        {
          success: false,
          error:
            (typeof payload === 'string' && payload.trim()) ||
            payload?.message ||
            payload?.error ||
            'Falha ao encerrar sessao.',
        },
        logoutResponse.status,
      );
    }

    return jsonResponse({ success: true });
  },
  'POST /v1/auth/super-admin/login-success': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const jwtEmail = normalizeIdentifier(user?.email);
    const requestedEmail = normalizeIdentifier(body?.email);
    const match = await resolveSuperAdminMatch(requestedEmail || jwtEmail, env);

    if (!match?.matched || !match?.account_id) {
      return jsonResponse({ success: true, successMatched: false, matched: false });
    }

    await supabaseAdminRequest(
      env,
      `/rest/v1/super_admin_accounts?${new URLSearchParams({ id: `eq.${match.account_id}` }).toString()}`,
      {
        method: 'PATCH',
        body: {
          auth_user_id: user.id,
          tentativas_falhas: 0,
          ultima_tentativa_em: new Date().toISOString(),
          ultimo_login_em: new Date().toISOString(),
          ativo: true,
          bloqueado: false,
          bloqueado_em: null,
        },
        headers: {
          Prefer: 'return=minimal',
        },
      },
    );

    await insertSystemLog(request, env, {
      user_id: user.id,
      level: 'info',
      event: 'super_admin_login_success',
      message: 'Login de Super Admin realizado com sucesso.',
      path: String(body?.path || '/auth'),
      context: {
        account_id: match.account_id,
        email: match.email || requestedEmail || jwtEmail || null,
      },
    });

    return jsonResponse({ success: true, matched: true, account_id: match.account_id });
  },
  'POST /v1/auth/super-admin/failed-attempt': async (request, env) => {
    const body = await request.json().catch(() => ({}));
    const identifier = String(body?.identifier || '').trim();
    const path = String(body?.path || '/auth');
    const match = await resolveSuperAdminMatch(identifier, env);

    if (!match?.matched || !match?.account_id) {
      return jsonResponse({ matched: false });
    }

    const attempts = Number(match.tentativas_falhas || 0) + 1;
    const blocked = attempts >= 4;

    await supabaseAdminRequest(
      env,
      `/rest/v1/super_admin_accounts?${new URLSearchParams({ id: `eq.${match.account_id}` }).toString()}`,
      {
        method: 'PATCH',
        body: {
          tentativas_falhas: attempts,
          ultima_tentativa_em: new Date().toISOString(),
          bloqueado: blocked,
          ativo: blocked ? false : match.ativo !== false,
          bloqueado_em: blocked ? new Date().toISOString() : null,
        },
        headers: {
          Prefer: 'return=minimal',
        },
      },
    );

    await insertSystemLog(request, env, {
      level: blocked ? 'error' : 'warn',
      event: blocked ? 'super_admin_account_locked' : 'super_admin_login_failed',
      message: blocked
        ? 'Conta de Super Admin bloqueada apos 4 tentativas falhas.'
        : 'Tentativa invalida de login em conta de Super Admin.',
      path,
      context: {
        identifier,
        email: match.email || null,
        account_id: match.account_id,
        attempts,
        blocked,
        ...(body?.context && typeof body.context === 'object' ? body.context : {}),
      },
    });

    return jsonResponse({
      matched: true,
      blocked,
      attempts,
      remaining: Math.max(0, 4 - attempts),
    });
  },
  'POST /v1/auth/activate-matricula': async (request, env) => {
    const body = await request.json().catch(() => ({}));
    const matriculaInput = String(body?.matricula || '').trim();
    const senhaInput = String(body?.senha || '');
    const matriculaCompacta = matriculaInput.replace(/\s+/g, '');
    const matriculaNormalizada = matriculaInput.replace(/[^A-Za-z0-9]/g, '');
    const duplicateEmailMarkers = ['already been registered', 'already exists', 'already registered'];

    if (!/^[A-Za-z0-9._-]{6,32}$/.test(matriculaCompacta)) {
      return jsonResponse({ success: false, error: 'Matricula invalida' }, 400);
    }

    if (senhaInput.length < 6) {
      return jsonResponse({ success: false, error: 'A senha deve ter pelo menos 6 caracteres' }, 400);
    }

    const alunoPayload = await supabaseAdminRequest(
      env,
      `/rest/v1/usuarios_biblioteca?select=id,nome,matricula,email,user_id,tipo,escola_id&tipo=eq.aluno&or=(${[
        `matricula.eq.${matriculaCompacta}`,
        `matricula.eq.${matriculaNormalizada}`,
      ].join(',')})&order=updated_at.desc.nullslast&limit=1`,
    );

    const aluno = Array.isArray(alunoPayload) ? (alunoPayload[0] || null) : null;
    if (!aluno) {
      return jsonResponse({ success: false, error: 'Matricula nao encontrada' }, 404);
    }

    if (aluno.user_id) {
      const activeProfilePayload = await supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
          select: 'email',
          user_id: `eq.${aluno.user_id}`,
          order: 'updated_at.desc.nullslast,created_at.desc',
          limit: '1',
        }).toString()}`,
      );

      const activeProfile = Array.isArray(activeProfilePayload) ? (activeProfilePayload[0] || null) : null;
      return jsonResponse({
        success: true,
        already_active: true,
        email: activeProfile?.email || aluno.email || null,
      });
    }

    const authEmail = `${matriculaCompacta.toLowerCase()}@temp.bibliotecai.com`;
    let userId = '';
    let createdNewUser = false;

    try {
      const authData = await supabaseAdminAuthRequest(env, '/users', {
        method: 'POST',
        body: {
          email: authEmail,
          password: senhaInput,
          email_confirm: true,
          user_metadata: { nome: aluno.nome || 'Aluno' },
        },
      });

      if (authData?.user?.id) {
        userId = String(authData.user.id);
        createdNewUser = true;
      }
    } catch (error) {
      const authErrorMessage = String(error instanceof Error ? error.message : '').toLowerCase();
      if (!duplicateEmailMarkers.some((marker) => authErrorMessage.includes(marker))) {
        return jsonResponse({
          success: false,
          error: authErrorMessage || 'Nao foi possivel ativar a conta',
        }, 400);
      }

      const existingAuthUser = await findAuthUserByEmail(env, authEmail);
      if (!existingAuthUser?.id) {
        return jsonResponse({
          success: false,
          error: 'A conta de autenticacao ja existe, mas nao foi possivel reutiliza-la.',
        }, 409);
      }

      await supabaseAdminAuthRequest(env, `/users/${existingAuthUser.id}`, {
        method: 'PUT',
        body: {
          password: senhaInput,
          email_confirm: true,
          user_metadata: {
            ...(existingAuthUser.user_metadata || {}),
            nome: aluno.nome || 'Aluno',
          },
        },
      });

      userId = String(existingAuthUser.id);
    }

    if (!userId) {
      return jsonResponse({ success: false, error: 'Nao foi possivel preparar a conta do aluno' }, 400);
    }

    try {
      await supabaseAdminRequest(env, '/rest/v1/user_roles', {
        method: 'POST',
        body: [{ user_id: userId, role: 'aluno' }],
        headers: {
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
      });

      await supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?${new URLSearchParams({ id: `eq.${aluno.id}` }).toString()}`,
        {
          method: 'PATCH',
          body: {
            user_id: userId,
            email: authEmail,
          },
          headers: {
            Prefer: 'return=minimal',
          },
        },
      );

      await supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?user_id=eq.${userId}&id=neq.${aluno.id}`,
        {
          method: 'DELETE',
          headers: {
            Prefer: 'return=minimal',
          },
        },
      );
    } catch (error) {
      if (createdNewUser && userId) {
        await supabaseAdminAuthRequest(env, `/users/${userId}`, { method: 'DELETE' }).catch(() => null);
      }

      throw error;
    }

    return jsonResponse({
      success: true,
      already_active: false,
      email: authEmail,
    });
  },
  'GET /v1/auth/session': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: true, session: null, user: null, roles: [] });
    }

    const roleRows = await supabaseAdminRequest(
      env,
      `/rest/v1/user_roles?${new URLSearchParams({
        select: 'role',
        user_id: `eq.${user.id}`,
      }).toString()}`,
    );

    return jsonResponse({
      success: true,
      session: { access_token_present: true },
      user,
      roles: Array.isArray(roleRows) ? [...new Set(roleRows.map((item) => String(item?.role || '')).filter(Boolean))] : [],
    });
  },

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
    const assunto = String(body?.assunto || '').trim();
    const mensagem = String(body?.mensagem || '').trim();
    const imageUrls = Array.isArray(body?.image_urls)
      ? body.image_urls.filter((item: unknown) => typeof item === 'string')
      : [];

    if (assunto.length < 3 || mensagem.length < 10) {
      return jsonResponse({ success: false, error: 'Assunto ou mensagem invalidos.' }, 400);
    }

    await supabaseUserRequest(request, env, '/rest/v1/reclamacoes_super_admin', {
      method: 'POST',
      body: {
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

  'GET /v1/admin/tenants': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const allowed = await isSuperAdmin(user.id, env);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Sem permissao para acessar tenants.' }, 403);
    }

    const [tenants, schools] = await Promise.all([
      supabaseAdminRequest(
        env,
        `/rest/v1/tenants?${new URLSearchParams({
          select: 'id,escola_id,nome,subdominio,schema_name,plano,ativo,created_at',
          order: 'created_at.desc',
        }).toString()}`,
      ),
      supabaseAdminRequest(
        env,
        `/rest/v1/escolas?${new URLSearchParams({
          select: 'id,nome,gestor_id',
          order: 'nome.asc',
        }).toString()}`,
      ),
    ]);

    const tenantItems = Array.isArray(tenants) ? tenants : [];
    const schoolItems = Array.isArray(schools) ? schools : [];
    const schoolIdsWithTenant = new Set(tenantItems.map((tenant) => tenant?.escola_id).filter(Boolean));

    return jsonResponse({
      success: true,
      tenants: tenantItems,
      schoolsWithoutTenant: schoolItems.filter((school) => !schoolIdsWithTenant.has(school.id)),
    });
  },
  'POST /v1/admin/tenants': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const allowed = await isSuperAdmin(user.id, env);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Sem permissao para provisionar tenant.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const escolaNome = String(body?.escolaNome || '').trim();
    const subdominio = String(body?.subdominio || '').trim();
    const plano = String(body?.plano || 'trial').trim() || 'trial';
    const baseDomain = body?.baseDomain ? String(body.baseDomain).trim() : null;
    const inviteCpf = body?.inviteCpf ? String(body.inviteCpf).trim() : null;
    const inviteExpiresHours = Number(body?.inviteExpiresHours || 72);

    if (!escolaNome || !subdominio) {
      return jsonResponse({ success: false, error: 'Informe nome da escola e subdominio.' }, 400);
    }

    try {
      const payload = await supabaseUserRpc(request, env, 'provision_tenant', {
        _escola_nome: escolaNome,
        _subdominio: subdominio,
        _plano: plano,
        _base_domain: baseDomain,
        _invite_cpf: inviteCpf,
        _invite_expires_hours: inviteExpiresHours,
      });

      return jsonResponse(payload);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const normalized = message.toLowerCase();

      if (
        normalized.includes('could not find the function public.provision_tenant')
        || normalized.includes('http 404')
      ) {
        const payload = await supabaseUserRpc(request, env, 'provision_tenant', {
          _escola_nome: escolaNome,
          _subdominio: subdominio,
          _plano: plano,
          _base_domain: baseDomain,
          _invite_email: null,
          _invite_expires_hours: inviteExpiresHours,
        });

        return jsonResponse(payload);
      }

      throw error;
    }
  },
  'PATCH /v1/admin/tenants/:id/status': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const allowed = await isSuperAdmin(user.id, env);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Sem permissao para alterar status do tenant.' }, 403);
    }

    const tenantId = getPathParam(request, /^\/v1\/admin\/tenants\/([^/]+)\/status$/);
    if (!tenantId) {
      return jsonResponse({ success: false, error: 'ID do tenant ausente.' }, 400);
    }

    const body = await request.json().catch(() => ({}));
    const ativo = Boolean(body?.ativo);

    await supabaseAdminRequest(
      env,
      `/rest/v1/tenants?${new URLSearchParams({ id: `eq.${tenantId}` }).toString()}`,
      {
        method: 'PATCH',
        body: { ativo },
        headers: {
          Prefer: 'return=minimal',
        },
      },
    );

    return jsonResponse({ success: true, tenantId, ativo });
  },
  'POST /v1/admin/tenants/:id/invite': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const allowed = await isSuperAdmin(user.id, env);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Sem permissao para gerar convite do tenant.' }, 403);
    }

    const tenantId = getPathParam(request, /^\/v1\/admin\/tenants\/([^/]+)\/invite$/);
    if (!tenantId) {
      return jsonResponse({ success: false, error: 'ID do tenant ausente.' }, 400);
    }

    const body = await request.json().catch(() => ({}));
    const payload = await supabaseUserRpc(request, env, 'create_tenant_admin_invite', {
      _tenant_id: tenantId,
      _invite_cpf: body?.inviteCpf ? String(body.inviteCpf).trim() : null,
      _base_domain: body?.baseDomain ? String(body.baseDomain).trim() : null,
      _invite_expires_hours: Number(body?.inviteExpiresHours || 72),
    });

    return jsonResponse(payload);
  },
  'POST /v1/admin/tenants/:id/delete': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const allowed = await isSuperAdmin(user.id, env);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Sem permissao para excluir tenant.' }, 403);
    }

    const tenantId = getPathParam(request, /^\/v1\/admin\/tenants\/([^/]+)\/delete$/);
    if (!tenantId) {
      return jsonResponse({ success: false, error: 'ID do tenant ausente.' }, 400);
    }

    const payload = await callSupabaseFunction(request, env, 'excluir-escola-tenant', {
      tenant_id: tenantId,
    });

    return jsonResponse(payload);
  },
  'POST /v1/admin/schools/:id/delete': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const allowed = await isSuperAdmin(user.id, env);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Sem permissao para excluir escola.' }, 403);
    }

    const escolaId = getPathParam(request, /^\/v1\/admin\/schools\/([^/]+)\/delete$/);
    if (!escolaId) {
      return jsonResponse({ success: false, error: 'ID da escola ausente.' }, 400);
    }

    const payload = await callSupabaseFunction(request, env, 'excluir-escola-tenant', {
      escola_id: escolaId,
    });

    return jsonResponse(payload);
  },
  'POST /v1/admin/gestores/list': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const allowed = await isSuperAdmin(user.id, env);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Sem permissao para listar gestores.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const escolaId = String(body?.escola_id || '').trim();
    if (!escolaId) {
      return jsonResponse({ success: false, error: 'Escola nao informada.' }, 400);
    }

    const payload = await callSupabaseFunction(request, env, 'redefinir-senha-gestor', {
      operation: 'list',
      escola_id: escolaId,
    });

    return jsonResponse(payload);
  },
  'POST /v1/admin/gestores/reset-password': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const allowed = await isSuperAdmin(user.id, env);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Sem permissao para redefinir senha de gestor.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const payload = await callSupabaseFunction(request, env, 'redefinir-senha-gestor', {
      escola_id: body?.escola_id,
      gestor_id: body?.gestor_id,
      nova_senha: body?.nova_senha,
    });

    return jsonResponse(payload);
  },
  'POST /v1/admin/gestores/delete': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const allowed = await isSuperAdmin(user.id, env);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Sem permissao para excluir gestor.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const payload = await callSupabaseFunction(request, env, 'excluir-usuarios-biblioteca', {
      id: body?.id,
      user_id: body?.user_id,
      escola_id: body?.escola_id,
    });

    return jsonResponse(payload);
  },

  'POST /v1/media/sign-upload': async () => notImplemented('Assinatura de upload pela API propria'),
  'POST /v1/media/sign-download': async () => notImplemented('Assinatura de download pela API propria'),
};

function normalizeDynamicRoute(routeKey: string) {
  return routeKey
    .replace(/\/v1\/reclamacoes\/[^/]+\/read$/, '/v1/reclamacoes/:id/read')
    .replace(/\/v1\/reclamacoes\/[^/]+$/, '/v1/reclamacoes/:id')
    .replace(/\/v1\/admin\/tenants\/[^/]+\/invite$/, '/v1/admin/tenants/:id/invite')
    .replace(/\/v1\/admin\/tenants\/[^/]+\/delete$/, '/v1/admin/tenants/:id/delete')
    .replace(/\/v1\/admin\/tenants\/[^/]+\/status$/, '/v1/admin/tenants/:id/status')
    .replace(/\/v1\/admin\/schools\/[^/]+\/delete$/, '/v1/admin/schools/:id/delete')
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
