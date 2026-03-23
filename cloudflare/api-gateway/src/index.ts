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

async function getLoanModuleContext(request: Request, env: Env) {
  const caller = await fetchSupabaseUser(request, env);
  if (!caller?.id) {
    throw new Error('Nao autenticado.');
  }

  const profile = await getLatestUserProfile(caller.id, env);
  if (!profile?.id) {
    throw new Error('Perfil do usuario nao encontrado.');
  }

  if (!profile?.escola_id) {
    throw new Error('Nao foi possivel identificar a escola do usuario.');
  }

  const tipo = String(profile.tipo || '').trim().toLowerCase();
  const canManageLoans = tipo === 'bibliotecaria' || tipo === 'gestor';

  return {
    caller,
    profile,
    canManageLoans,
  };
}

const DEFAULT_BOOK_CATEGORIES = ['Literatura', 'Ciencias', 'Matematica', 'Historia', 'Geografia', 'Infantil'];

async function getBooksModuleContext(request: Request, env: Env) {
  const caller = await fetchSupabaseUser(request, env);
  if (!caller?.id) {
    throw new Error('Nao autenticado.');
  }

  const profile = await getLatestUserProfile(caller.id, env);
  if (!profile?.id) {
    throw new Error('Perfil do usuario nao encontrado.');
  }

  const tipo = String(profile.tipo || '').trim().toLowerCase();
  const canManageBooks = tipo === 'bibliotecaria' || tipo === 'gestor';

  return {
    caller,
    profile,
    canManageBooks,
  };
}

async function getUsersModuleContext(request: Request, env: Env) {
  const caller = await fetchSupabaseUser(request, env);
  if (!caller?.id) {
    throw new Error('Nao autenticado.');
  }

  const profile = await getLatestUserProfile(caller.id, env);
  if (!profile?.id) {
    throw new Error('Perfil do usuario nao encontrado.');
  }

  const tipo = String(profile.tipo || '').trim().toLowerCase();
  const canManageUsers = tipo === 'bibliotecaria' || tipo === 'gestor';
  const canCreateGestor = tipo === 'gestor';

  let currentEscolaId = String(profile.escola_id || '').trim();
  if (!currentEscolaId) {
    const [escola] = await supabaseAdminRequest(
      env,
      `/rest/v1/escolas?${new URLSearchParams({
        select: 'id',
        gestor_id: `eq.${caller.id}`,
        limit: '1',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;
    currentEscolaId = String(escola?.id || '').trim();
  }

  return {
    caller,
    profile,
    currentEscolaId: currentEscolaId || null,
    canManageUsers,
    canCreateGestor,
    isGestor: tipo === 'gestor',
    isBibliotecaria: tipo === 'bibliotecaria',
  };
}

async function getCommunityModuleContext(request: Request, env: Env) {
  const caller = await fetchSupabaseUser(request, env);
  if (!caller?.id) throw new Error('Nao autenticado.');

  const profile = await getLatestUserProfile(caller.id, env);
  if (!profile?.id) throw new Error('Perfil do usuario nao encontrado.');

  const tipo = String(profile.tipo || '').trim().toLowerCase();
  return {
    caller,
    profile,
    escolaId: String(profile.escola_id || '').trim() || null,
    alunoId: String(profile.id || '').trim() || null,
    alunoTurma: String(profile.turma || '').trim() || null,
    canPublicarComunicado: ['professor', 'gestor', 'bibliotecaria', 'super_admin'].includes(tipo),
    isProfessor: tipo === 'professor',
    isGestor: tipo === 'gestor',
    isBibliotecaria: tipo === 'bibliotecaria',
    isSuperAdmin: tipo === 'super_admin',
  };
}

function normalizeIdentifier(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

function normalizeEmail(value: unknown) {
  return normalizeIdentifier(value);
}

function normalizeDigits(value: unknown) {
  return String(value || '').replace(/\D/g, '');
}

function normalizeCpf(value: unknown) {
  return normalizeDigits(value);
}

function normalizeMatricula(value: unknown) {
  return String(value || '').replace(/[^A-Za-z0-9]/g, '').toLowerCase();
}

function isValidCpf(value: unknown) {
  const cpf = normalizeCpf(value);
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;

  let sum = 0;
  for (let index = 0; index < 9; index += 1) {
    sum += Number(cpf[index]) * (10 - index);
  }

  let checkDigit = (sum * 10) % 11;
  if (checkDigit === 10) checkDigit = 0;
  if (checkDigit !== Number(cpf[9])) return false;

  sum = 0;
  for (let index = 0; index < 10; index += 1) {
    sum += Number(cpf[index]) * (11 - index);
  }

  checkDigit = (sum * 10) % 11;
  if (checkDigit === 10) checkDigit = 0;
  return checkDigit === Number(cpf[10]);
}

function pickAuthName(user: Record<string, unknown> | null | undefined) {
  const metadata = (user?.user_metadata as Record<string, unknown> | undefined) || {};
  return String(metadata.nome || metadata.name || metadata.full_name || '').trim();
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

async function buildGestoresForEscola(escolaId: string, env: Env) {
  const escolaPayload = await supabaseAdminRequest(
    env,
    `/rest/v1/escolas?${new URLSearchParams({
      select: 'id,nome,gestor_id',
      id: `eq.${escolaId}`,
      limit: '1',
    }).toString()}`,
  );

  const escolaInfo = Array.isArray(escolaPayload) ? (escolaPayload[0] || null) : null;
  if (!escolaInfo?.id) {
    throw new Error('Escola nao encontrada');
  }

  const perfisPayload = await supabaseAdminRequest(
    env,
    `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
      select: 'id,nome,email,user_id,tipo',
      escola_id: `eq.${escolaId}`,
      order: 'nome.asc',
    }).toString()}`,
  );

  const perfisEscola = Array.isArray(perfisPayload) ? perfisPayload : [];
  const userIds = perfisEscola.map((item) => String(item?.user_id || '').trim()).filter(Boolean);

  const rolesPayload = userIds.length
    ? await supabaseAdminRequest(
      env,
      `/rest/v1/user_roles?${new URLSearchParams({
        select: 'user_id,role',
        user_id: `in.(${userIds.join(',')})`,
      }).toString()}`,
    )
    : [];

  const rolesByUserId = new Map<string, Set<string>>();
  (Array.isArray(rolesPayload) ? rolesPayload : []).forEach((item) => {
    const userId = String(item?.user_id || '').trim();
    const role = String(item?.role || '').trim().toLowerCase();
    if (!userId || !role) return;
    const current = rolesByUserId.get(userId) || new Set<string>();
    current.add(role);
    rolesByUserId.set(userId, current);
  });

  const gestores = perfisEscola
    .filter((perfil) => {
      const userId = String(perfil?.user_id || '').trim();
      const tipo = String(perfil?.tipo || '').trim().toLowerCase();
      const roles = rolesByUserId.get(userId);
      return tipo === 'gestor' || roles?.has('gestor') || userId === String(escolaInfo?.gestor_id || '').trim();
    })
    .map((perfil) => ({
      id: String(perfil?.id || perfil?.user_id || ''),
      nome: String(perfil?.nome || '').trim(),
      email: String(perfil?.email || '').trim(),
      user_id: String(perfil?.user_id || '').trim(),
    }))
    .filter((perfil) => perfil.id && perfil.user_id);

  const gestorPrincipalId = String(escolaInfo?.gestor_id || '').trim();
  const hasGestorPrincipal = gestorPrincipalId && gestores.some((item) => item.user_id === gestorPrincipalId || item.id === gestorPrincipalId);

  if (gestorPrincipalId && !hasGestorPrincipal) {
    const authUserData = await supabaseAdminAuthRequest(env, `/users/${gestorPrincipalId}`);
    const authUser = authUserData?.user || null;
    gestores.push({
      id: gestorPrincipalId,
      nome: pickAuthName(authUser) || `Gestor principal - ${escolaInfo?.nome || 'Escola'}`,
      email: String(authUser?.email || '').trim(),
      user_id: gestorPrincipalId,
    });
  }

  const unique = new Map<string, { id: string; nome: string; email: string; user_id: string }>();
  gestores.forEach((item) => {
    const key = item.user_id || item.id;
    if (!key) return;
    const previous = unique.get(key);
    if (!previous) {
      unique.set(key, item);
      return;
    }

    unique.set(key, {
      id: previous.id || item.id,
      user_id: previous.user_id || item.user_id,
      nome: previous.nome || item.nome,
      email: previous.email || item.email,
    });
  });

  return {
    escolaInfo,
    gestores: Array.from(unique.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
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

function estimateDataUrlBytes(value: unknown) {
  if (typeof value !== 'string' || !value || !value.startsWith('data:')) return 0;

  const [, payload = ''] = value.split(',', 2);
  const cleaned = payload.replace(/\s/g, '');
  const padding = cleaned.endsWith('==') ? 2 : cleaned.endsWith('=') ? 1 : 0;

  return Math.max(0, Math.floor((cleaned.length * 3) / 4) - padding);
}

function estimateUrlCollectionBytes(collection: unknown) {
  if (!Array.isArray(collection)) return 0;
  return collection.reduce((total, item) => total + estimateDataUrlBytes(item), 0);
}

function estimateArquivosBytes(arquivos: unknown) {
  if (!Array.isArray(arquivos)) return 0;

  return arquivos.reduce((total, arquivo) => {
    const tamanho = Number((arquivo as Record<string, unknown>)?.tamanho);
    if (Number.isFinite(tamanho) && tamanho > 0) return total + tamanho;
    return total + estimateDataUrlBytes((arquivo as Record<string, unknown>)?.url);
  }, 0);
}

function monthKey(dateValue: unknown) {
  const d = new Date(String(dateValue || ''));
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function buildLastMonths(size = 6) {
  const now = new Date();
  const keys: string[] = [];
  for (let i = size - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function normalizeTurmaKey(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function isExpiredComunicado(item: Record<string, unknown> | null | undefined) {
  if (!item?.expires_at) return false;
  const expiresAt = new Date(String(item.expires_at));
  return !Number.isNaN(expiresAt.getTime()) && expiresAt <= new Date();
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
        emprestimos: 'write_ready',
        livros: 'write_ready',
        usuarios: 'write_ready',
        comunidade_aluno: 'write_ready',
        painel_aluno: 'write_ready',
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
  'GET /v1/dashboard': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const roleRows = await supabaseAdminRequest(
      env,
      `/rest/v1/user_roles?${new URLSearchParams({
        select: 'role',
        user_id: `eq.${user.id}`,
      }).toString()}`,
    );
    const roles = Array.isArray(roleRows) ? [...new Set(roleRows.map((item) => String(item?.role || '')).filter(Boolean))] : [];
    const userRole = roles.includes('super_admin')
      ? 'super_admin'
      : roles.includes('gestor')
        ? 'gestor'
        : roles.includes('bibliotecaria')
          ? 'bibliotecaria'
          : roles[0] || null;

    const baseQueries = await Promise.all([
      supabaseAdminRequest(env, '/rest/v1/livros?select=id,disponivel'),
      supabaseAdminRequest(env, '/rest/v1/usuarios_biblioteca?select=id'),
      supabaseAdminRequest(env, '/rest/v1/emprestimos?select=id,data_emprestimo,data_devolucao_real,status,created_at,livro_id,livros(titulo),usuarios_biblioteca(nome)'),
      supabaseAdminRequest(env, '/rest/v1/tenants?select=id,nome,subdominio,ativo,escola_id'),
      supabaseAdminRequest(env, '/rest/v1/escolas?select=id,nome,gestor_id'),
    ]);

    const [livros, usuarios, emprestimos, tenants, escolas] = baseQueries.map((item) => (Array.isArray(item) ? item : []));

    const emprestimosAtivos = emprestimos.filter((item) => item?.status === 'ativo');
    const emprestimosAtrasados = emprestimosAtivos.filter((item) => {
      const prev = item?.data_devolucao_prevista;
      return prev ? new Date(prev).getTime() < Date.now() : false;
    });

    const atividades = [...emprestimos]
      .sort((a, b) => new Date(b?.created_at || 0).getTime() - new Date(a?.created_at || 0).getTime())
      .slice(0, 5)
      .map((emp) => ({
        id: emp.id,
        tipo: emp.data_devolucao_real ? 'devolucao' : 'emprestimo',
        descricao: emp.data_devolucao_real
          ? `${emp.usuarios_biblioteca?.nome || 'Usuario'} devolveu "${emp.livros?.titulo || 'Livro'}"`
          : `${emp.usuarios_biblioteca?.nome || 'Usuario'} emprestou "${emp.livros?.titulo || 'Livro'}"`,
        data: emp.data_devolucao_real || emp.data_emprestimo || emp.created_at,
      }));

    const monthlyKeys = buildLastMonths(6);
    const monthlyMap = new Map(
      monthlyKeys.map((key) => [key, { key, mes: key, emprestimos: 0 }]),
    );
    const livroCountMap = new Map<string, number>();

    emprestimos.forEach((emp) => {
      const loanDate = emp?.data_emprestimo || emp?.created_at;
      if (loanDate) {
        const key = monthKey(loanDate);
        if (monthlyMap.has(key)) {
          monthlyMap.get(key)!.emprestimos += 1;
        }
      }

      const livroNome = emp?.livros?.titulo || 'Livro sem titulo';
      livroCountMap.set(livroNome, (livroCountMap.get(livroNome) || 0) + 1);
    });

    const tenantByEscolaId = new Map(
      tenants.filter((tenant) => tenant?.escola_id).map((tenant) => [tenant.escola_id, tenant]),
    );

    const escolasCompletas = escolas.map((escola) => {
      const tenant = tenantByEscolaId.get(escola.id);
      return {
        id: tenant?.id || escola.id,
        escola_id: escola.id,
        nome: tenant?.nome || escola.nome,
        subdominio: tenant?.subdominio || null,
        ativo: tenant?.ativo ?? true,
        temTenant: Boolean(tenant),
        gestor_id: escola.gestor_id || null,
      };
    });

    const escolasSemBase = tenants
      .filter((tenant) => tenant?.escola_id && !escolas.some((escola) => escola.id === tenant.escola_id))
      .map((tenant) => ({
        id: tenant.id,
        escola_id: tenant.escola_id,
        nome: tenant.nome,
        subdominio: tenant.subdominio || null,
        ativo: tenant.ativo ?? true,
        temTenant: true,
        gestor_id: null,
      }));

    const escolasCadastradas = [...escolasCompletas, ...escolasSemBase].sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));

    let superAdminStats = null;
    if (userRole === 'super_admin') {
      const [superAdmins, reclamacoesFeed, arquivosAula, reclamacoesImagens, comunidadeImagens, laboratorioImagens, audiobooks] = await Promise.all([
        supabaseAdminRequest(env, '/rest/v1/super_admin_accounts?select=id,ativo,bloqueado,tentativas_falhas'),
        supabaseUserRpc(request, env, 'get_reclamacoes_super_admin_feed'),
        supabaseAdminRequest(env, '/rest/v1/arquivos_aula_posts?select=arquivos'),
        supabaseAdminRequest(env, '/rest/v1/reclamacoes_super_admin?select=image_urls'),
        supabaseAdminRequest(env, '/rest/v1/comunidade_posts?select=imagem_urls'),
        supabaseAdminRequest(env, '/rest/v1/laboratorio_criacoes?select=imagem_urls'),
        supabaseAdminRequest(env, '/rest/v1/audiobooks_biblioteca?select=audio_url'),
      ]);

      const armazenamentoConsumidoBytes =
        (Array.isArray(arquivosAula) ? arquivosAula : []).reduce((total, item) => total + estimateArquivosBytes(item?.arquivos), 0) +
        (Array.isArray(reclamacoesImagens) ? reclamacoesImagens : []).reduce((total, item) => total + estimateUrlCollectionBytes(item?.image_urls), 0) +
        (Array.isArray(comunidadeImagens) ? comunidadeImagens : []).reduce((total, item) => total + estimateUrlCollectionBytes(item?.imagem_urls), 0) +
        (Array.isArray(laboratorioImagens) ? laboratorioImagens : []).reduce((total, item) => total + estimateUrlCollectionBytes(item?.imagem_urls), 0) +
        (Array.isArray(audiobooks) ? audiobooks : []).reduce((total, item) => total + estimateDataUrlBytes(item?.audio_url), 0);

      superAdminStats = {
        totalEscolas: escolasCadastradas.length,
        tenantsAtivos: tenants.filter((tenant) => tenant?.ativo !== false).length,
        tenantsInativos: tenants.filter((tenant) => tenant?.ativo === false).length,
        escolasSemTenant: escolasCadastradas.filter((escola) => !escola.temTenant).length,
        superAdminsAtivos: (Array.isArray(superAdmins) ? superAdmins : []).filter((item) => item?.ativo !== false && item?.bloqueado !== true).length,
        superAdminsBloqueados: (Array.isArray(superAdmins) ? superAdmins : []).filter((item) => item?.bloqueado === true || item?.ativo === false).length,
        reclamacoesEmAnalise: (Array.isArray(reclamacoesFeed) ? reclamacoesFeed : []).filter((item) => item?.status === 'em_analise').length,
        reclamacoesAtrasadas: (Array.isArray(reclamacoesFeed) ? reclamacoesFeed : []).filter((item) => item?.alerta_prazo).length,
        armazenamentoConsumidoBytes,
      };
    }

    return jsonResponse({
      success: true,
      stats: {
        totalLivros: livros.length,
        livrosDisponiveis: livros.filter((item) => item?.disponivel !== false).length,
        totalUsuarios: usuarios.length,
        emprestimosAtivos: emprestimosAtivos.length,
        emprestimosAtrasados: emprestimosAtrasados.length,
      },
      atividades,
      emprestimosPorMes: Array.from(monthlyMap.values()),
      livrosMaisEmprestados: Array.from(livroCountMap.entries())
        .map(([titulo, emprestimos]) => ({ titulo, emprestimos }))
        .sort((a, b) => b.emprestimos - a.emprestimos)
        .slice(0, 5),
      escolasCadastradas,
      superAdminStats,
    });
  },
  'GET /v1/notifications/system': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const roleRows = await supabaseAdminRequest(
      env,
      `/rest/v1/user_roles?${new URLSearchParams({
        select: 'role',
        user_id: `eq.${user.id}`,
      }).toString()}`,
    );
    const roles = Array.isArray(roleRows) ? [...new Set(roleRows.map((item) => String(item?.role || '')).filter(Boolean))] : [];
    const isSuperAdmin = roles.includes('super_admin');
    const isAluno = roles.includes('aluno');
    const isGestor = roles.includes('gestor');
    const isBibliotecaria = roles.includes('bibliotecaria');

    if (!(isSuperAdmin || isAluno || isGestor || isBibliotecaria)) {
      return jsonResponse({
        success: true,
        counts: { atrasados: 0, solicitacoesPendentes: 0, comunicados: 0, reclamacoes: 0, reclamacoesAtrasadas: 0, seguranca: 0 },
        notifications: [],
        profileId: null,
      });
    }

    if (isSuperAdmin) {
      const [complaintsRes, securityRes] = await Promise.all([
        supabaseUserRpc(request, env, 'get_reclamacoes_super_admin_feed'),
        supabaseAdminRequest(
          env,
          `/rest/v1/system_logs?${new URLSearchParams({
            select: 'id,event,message,created_at',
            event: 'in.(super_admin_login_failed,super_admin_account_locked)',
            order: 'created_at.desc',
            limit: '20',
          }).toString()}`,
        ),
      ]);

      const reclamacoesEmAnalise = (Array.isArray(complaintsRes) ? complaintsRes : [])
        .filter((item) => item?.status === 'em_analise')
        .map((item) => ({
          id: `reclamacao-${item.id}`,
          tipo: 'reclamacao',
          titulo: item?.assunto || 'Reclamacao',
          descricao: `${item?.escola_nome || 'Escola nao identificada'} • ${item?.sender_nome || 'Usuario'}${String(item?.sender_role || '').trim().toLowerCase() === 'aluno' && item?.sender_turma ? ` • Turma ${item.sender_turma}` : ''}`,
          created_at: item?.created_at || null,
          path: '/reclamacoes',
          status: item?.status || 'em_analise',
          lida_em: item?.lida_em || null,
          alerta_prazo: Boolean(item?.alerta_prazo),
        }))
        .filter((item) => !item.lida_em);

      const reclamacoesAtrasadas = reclamacoesEmAnalise
        .filter((item) => item.alerta_prazo)
        .map((item) => ({
          id: `reclamacao-alerta-${item.id.replace(/^reclamacao-/, '')}`,
          tipo: 'reclamacao_alerta',
          titulo: 'Reclamacao parada ha mais de 4 dias',
          descricao: item.descricao,
          created_at: item.created_at,
          path: '/reclamacoes',
        }));

      const alertasSeguranca = (Array.isArray(securityRes) ? securityRes : []).map((item) => ({
        id: `seguranca-${item.id}`,
        tipo: 'seguranca',
        titulo: item?.event === 'super_admin_account_locked' ? 'Conta bloqueada' : 'Tentativa de invasao',
        descricao: item?.message || 'Alerta de seguranca para Super Admin.',
        created_at: item?.created_at || null,
        path: '/admin/logs',
      }));

      return jsonResponse({
        success: true,
        counts: {
          atrasados: 0,
          solicitacoesPendentes: 0,
          comunicados: 0,
          reclamacoes: reclamacoesEmAnalise.length + reclamacoesAtrasadas.length,
          reclamacoesAtrasadas: reclamacoesAtrasadas.length,
          seguranca: alertasSeguranca.length,
        },
        notifications: [...alertasSeguranca, ...reclamacoesAtrasadas, ...reclamacoesEmAnalise]
          .sort((a, b) => new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime()),
        profileId: null,
      });
    }

    const profile = await getLatestUserProfile(user.id, env);
    if (!profile?.id) {
      return jsonResponse({
        success: true,
        counts: { atrasados: 0, solicitacoesPendentes: 0, comunicados: 0, reclamacoes: 0, reclamacoesAtrasadas: 0, seguranca: 0 },
        notifications: [],
        profileId: null,
      });
    }

    if (isAluno) {
      const [atrasados, solicitacoes, comunicadosRes, notificacoesLidas] = await Promise.all([
        supabaseAdminRequest(
          env,
          `/rest/v1/emprestimos?${new URLSearchParams({
            select: 'id',
            usuario_id: `eq.${profile.id}`,
            status: 'eq.ativo',
            data_devolucao_prevista: `lt.${new Date().toISOString()}`,
          }).toString()}`,
        ),
        supabaseAdminRequest(
          env,
          `/rest/v1/solicitacoes_emprestimo?${new URLSearchParams({
            select: 'id',
            usuario_id: `eq.${profile.id}`,
            status: 'in.(pendente,em_andamento)',
          }).toString()}`,
        ),
        profile.escola_id
          ? supabaseAdminRequest(
            env,
            `/rest/v1/comunidade_posts?${new URLSearchParams({
              select: 'id,titulo,conteudo,turma_publico,created_at,expires_at',
              escola_id: `eq.${profile.escola_id}`,
              tipo: 'eq.comunicado',
              order: 'created_at.desc',
              limit: '20',
            }).toString()}`,
          )
          : [],
        supabaseAdminRequest(
          env,
          `/rest/v1/notificacoes_lidas?${new URLSearchParams({
            select: 'notification_id',
            usuario_id: `eq.${profile.id}`,
          }).toString()}`,
        ),
      ]);

      const lidas = new Set((Array.isArray(notificacoesLidas) ? notificacoesLidas : []).map((item) => item.notification_id));
      const turmaAluno = normalizeTurmaKey(profile.turma);
      const comunicados = (Array.isArray(comunicadosRes) ? comunicadosRes : [])
        .filter((item) => {
          if (isExpiredComunicado(item)) return false;
          const turmaComunicado = normalizeTurmaKey(item?.turma_publico);
          return !turmaComunicado || turmaComunicado === turmaAluno;
        })
        .map((item) => ({
          id: `comunicado-${item.id}`,
          tipo: 'comunicado',
          titulo: item?.titulo || 'Novo comunicado',
          descricao: item?.conteudo || 'Confira o comunicado da sua turma na comunidade.',
          created_at: item?.created_at || null,
          path: '/aluno/comunidade',
        }))
        .filter((item) => !lidas.has(item.id));

      return jsonResponse({
        success: true,
        counts: {
          atrasados: Array.isArray(atrasados) ? atrasados.length : 0,
          solicitacoesPendentes: Array.isArray(solicitacoes) ? solicitacoes.length : 0,
          comunicados: comunicados.length,
          reclamacoes: 0,
          reclamacoesAtrasadas: 0,
          seguranca: 0,
        },
        notifications: comunicados,
        profileId: profile.id,
      });
    }

    if (!profile.escola_id) {
      return jsonResponse({
        success: true,
        counts: { atrasados: 0, solicitacoesPendentes: 0, comunicados: 0, reclamacoes: 0, reclamacoesAtrasadas: 0, seguranca: 0 },
        notifications: [],
        profileId: profile.id,
      });
    }

    const [atrasados, solicitacoes] = await Promise.all([
      supabaseAdminRequest(
        env,
        `/rest/v1/emprestimos?select=id,usuarios_biblioteca!inner(escola_id)&status=eq.ativo&data_devolucao_prevista=lt.${encodeURIComponent(new Date().toISOString())}&usuarios_biblioteca.escola_id=eq.${profile.escola_id}`,
      ),
      supabaseAdminRequest(
        env,
        `/rest/v1/solicitacoes_emprestimo?select=id,usuarios_biblioteca!inner(escola_id)&status=in.(pendente,em_andamento)&usuarios_biblioteca.escola_id=eq.${profile.escola_id}`,
      ),
    ]);

    return jsonResponse({
      success: true,
      counts: {
        atrasados: Array.isArray(atrasados) ? atrasados.length : 0,
        solicitacoesPendentes: Array.isArray(solicitacoes) ? solicitacoes.length : 0,
        comunicados: 0,
        reclamacoes: 0,
        reclamacoesAtrasadas: 0,
        seguranca: 0,
      },
      notifications: [],
      profileId: profile.id,
    });
  },
  'POST /v1/notifications/read': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const profile = await getLatestUserProfile(user.id, env);
    if (!profile?.id) {
      return jsonResponse({ success: false, error: 'Perfil nao encontrado.' }, 404);
    }

    const body = await request.json().catch(() => ({}));
    const notificationId = String(body?.notification_id || '').trim();
    if (!notificationId) {
      return jsonResponse({ success: false, error: 'Notificacao nao informada.' }, 400);
    }

    await supabaseAdminRequest(env, '/rest/v1/notificacoes_lidas', {
      method: 'POST',
      body: [{ usuario_id: profile.id, notification_id: notificationId }],
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
    });

    return jsonResponse({ success: true });
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
    const nome = String(body?.nome || '').trim();
    const email = normalizeEmail(body?.email);
    const cpf = normalizeCpf(body?.cpf);
    const senha = String(body?.senha || '').trim();

    if (nome.length < 3) {
      return jsonResponse({ success: false, error: 'Nome invalido' }, 400);
    }

    if (!email || !email.includes('@')) {
      return jsonResponse({ success: false, error: 'Email invalido' }, 400);
    }

    if (cpf && !isValidCpf(cpf)) {
      return jsonResponse({ success: false, error: 'CPF invalido' }, 400);
    }

    if (senha.length < 6) {
      return jsonResponse({ success: false, error: 'Senha deve ter pelo menos 6 caracteres' }, 400);
    }

    const existingPayload = await supabaseAdminRequest(
      env,
      `/rest/v1/super_admin_accounts?select=id&or=${encodeURIComponent(`email.eq.${email}${cpf ? `,cpf.eq.${cpf}` : ''}`)}&limit=1`,
    );
    const existingAccount = Array.isArray(existingPayload) ? (existingPayload[0] || null) : null;

    if (existingAccount?.id) {
      return jsonResponse({ success: false, error: 'Ja existe uma conta de Super Admin com esse email ou CPF' }, 409);
    }

    const createdUserData = await supabaseAdminAuthRequest(env, '/users', {
      method: 'POST',
      body: {
        email,
        password: senha,
        email_confirm: true,
        user_metadata: { nome },
      },
    });

    const userId = String(createdUserData?.user?.id || '').trim();
    if (!userId) {
      return jsonResponse({ success: false, error: 'Nao foi possivel criar o usuario' }, 500);
    }

    try {
      await supabaseAdminRequest(env, '/rest/v1/user_roles', {
        method: 'POST',
        body: [{ user_id: userId, role: 'super_admin' }],
        headers: {
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
      });

      await supabaseAdminRequest(env, '/rest/v1/super_admin_accounts', {
        method: 'POST',
        body: [{
          auth_user_id: userId,
          nome,
          email,
          cpf: cpf || null,
          ativo: true,
          bloqueado: false,
          tentativas_falhas: 0,
          created_by: user.id,
        }],
        headers: {
          Prefer: 'return=minimal',
        },
      });
    } catch (error) {
      await supabaseAdminAuthRequest(env, `/users/${userId}`, { method: 'DELETE' }).catch(() => null);
      throw error;
    }

    await insertSystemLog(request, env, {
      user_id: user.id,
      level: 'info',
      event: 'super_admin_account_created',
      message: 'Novo Super Admin criado.',
      path: '/admin/super-admins',
      context: {
        created_super_admin_email: email,
        created_super_admin_nome: nome,
      },
    });

    return jsonResponse({
      success: true,
      super_admin: {
        user_id: userId,
        nome,
        email,
        cpf: cpf || null,
      },
    });
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

    const accountsPayload = await supabaseAdminRequest(
      env,
      `/rest/v1/super_admin_accounts?${new URLSearchParams({
        select: 'id,email,auth_user_id',
        id: `eq.${accountId}`,
        limit: '1',
      }).toString()}`,
    );
    const account = Array.isArray(accountsPayload) ? (accountsPayload[0] || null) : null;

    if (!account?.id) {
      return jsonResponse({ success: false, error: 'Conta de Super Admin nao encontrada' }, 404);
    }

    if (String(account.auth_user_id || '').trim() === user.id) {
      return jsonResponse({ success: false, error: 'Outro Super Admin deve realizar a liberacao desta conta' }, 400);
    }

    await supabaseAdminRequest(
      env,
      `/rest/v1/super_admin_accounts?${new URLSearchParams({ id: `eq.${accountId}` }).toString()}`,
      {
        method: 'PATCH',
        body: {
          tentativas_falhas: 0,
          bloqueado: false,
          ativo: true,
          bloqueado_em: null,
          desbloqueado_em: new Date().toISOString(),
          desbloqueado_por: user.id,
        },
        headers: {
          Prefer: 'return=minimal',
        },
      },
    );

    await insertSystemLog(request, env, {
      user_id: user.id,
      level: 'info',
      event: 'super_admin_account_unlocked',
      message: 'Conta de Super Admin liberada por outro administrador.',
      path: '/admin/super-admins',
      context: {
        account_id: account.id,
        email: account.email || null,
        unlocked_by: user.id,
      },
    });

    return jsonResponse({ success: true, account_id: account.id });
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

    const payload = await supabaseAdminRequest(
      env,
      '/rest/v1/rpc/delete_tenant_school',
      {
        method: 'POST',
        body: { _tenant_id: tenantId },
      },
    );

    const authUserIds = Array.isArray(payload?.auth_user_ids)
      ? payload.auth_user_ids.map((item: unknown) => String(item || '').trim()).filter(Boolean)
      : [];
    const authDeleteFailures: string[] = [];

    for (const authUserId of authUserIds.filter((id) => id !== user.id)) {
      try {
        await supabaseAdminAuthRequest(env, `/users/${authUserId}`, { method: 'DELETE' });
      } catch (error) {
        const message = String(error instanceof Error ? error.message : '').toLowerCase();
        if (!message.includes('user not found')) {
          authDeleteFailures.push(`${authUserId}: ${error instanceof Error ? error.message : 'Falha desconhecida'}`);
        }
      }
    }

    return jsonResponse({
      success: true,
      tenant_id: payload?.tenant_id || tenantId,
      escola_id: payload?.escola_id || null,
      escola_nome: payload?.escola_nome || null,
      schema_name: payload?.schema_name || null,
      auth_deleted: authUserIds.filter((id) => id !== user.id).length - authDeleteFailures.length,
      auth_skipped_current_user: authUserIds.includes(user.id),
      auth_delete_failures: authDeleteFailures,
    });
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

    const escolaPayload = await supabaseAdminRequest(
      env,
      `/rest/v1/escolas?${new URLSearchParams({
        select: 'id,nome',
        id: `eq.${escolaId}`,
        limit: '1',
      }).toString()}`,
    );
    const escola = Array.isArray(escolaPayload) ? (escolaPayload[0] || null) : null;

    if (!escola?.id) {
      return jsonResponse({ success: false, error: 'Escola nao encontrada.' }, 404);
    }

    const usersPayload = await supabaseAdminRequest(
      env,
      `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
        select: 'user_id',
        escola_id: `eq.${escolaId}`,
      }).toString()}`,
    );

    const authUserIds = Array.isArray(usersPayload)
      ? usersPayload.map((item) => String(item?.user_id || '').trim()).filter(Boolean)
      : [];

    const tablesByEscolaId = [
      'atividade_entregas',
      'atividades_leitura',
      'audiobooks_biblioteca',
      'arquivos_aula_posts',
      'categorias_livros',
      'comunidade_quiz_tentativas',
      'comunidade_posts',
      'emprestimos',
      'laboratorio_criacoes',
      'livros',
      'professor_turmas',
      'salas_cursos',
      'solicitacoes_emprestimo',
      'tenant_admin_invites',
      'tokens_convite',
      'usuarios_biblioteca',
    ];

    for (const tableName of tablesByEscolaId) {
      try {
        await supabaseAdminRequest(
          env,
          `/rest/v1/${tableName}?escola_id=eq.${escolaId}`,
          {
            method: 'DELETE',
            headers: {
              Prefer: 'return=minimal',
            },
          },
        );
      } catch (error) {
        const message = String(error instanceof Error ? error.message : '').toLowerCase();
        const isMissingTable =
          message.includes('relation') ||
          message.includes('does not exist') ||
          message.includes('schema cache') ||
          message.includes('could not find the table');

        if (!isMissingTable) {
          throw error;
        }
      }
    }

    await supabaseAdminRequest(
      env,
      `/rest/v1/tenants?escola_id=eq.${escolaId}`,
      {
        method: 'DELETE',
        headers: {
          Prefer: 'return=minimal',
        },
      },
    );

    await supabaseAdminRequest(
      env,
      `/rest/v1/escolas?id=eq.${escolaId}`,
      {
        method: 'DELETE',
        headers: {
          Prefer: 'return=minimal',
        },
      },
    );

    const authDeleteFailures: string[] = [];
    for (const authUserId of authUserIds.filter((id) => id !== user.id)) {
      try {
        await supabaseAdminAuthRequest(env, `/users/${authUserId}`, { method: 'DELETE' });
      } catch (error) {
        const message = String(error instanceof Error ? error.message : '').toLowerCase();
        if (!message.includes('user not found')) {
          authDeleteFailures.push(`${authUserId}: ${error instanceof Error ? error.message : 'Falha desconhecida'}`);
        }
      }
    }

    return jsonResponse({
      success: true,
      tenant_id: null,
      escola_id: escolaId,
      escola_nome: escola.nome || null,
      schema_name: null,
      auth_deleted: authUserIds.filter((id) => id !== user.id).length - authDeleteFailures.length,
      auth_skipped_current_user: authUserIds.includes(user.id),
      auth_delete_failures: authDeleteFailures,
    });
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

    const { gestores } = await buildGestoresForEscola(escolaId, env);
    return jsonResponse({ success: true, gestores });
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
    const escolaId = String(body?.escola_id || '').trim();
    const gestorId = String(body?.gestor_id || '').trim();
    const novaSenha = String(body?.nova_senha || '').trim();

    if (!escolaId) {
      return jsonResponse({ success: false, error: 'Escola nao informada' }, 400);
    }

    if (!/^[A-Za-z0-9!@#$%^&*()_+\-=.?]{6,64}$/.test(novaSenha)) {
      return jsonResponse(
        { success: false, error: 'Senha invalida. Use 6-64 caracteres (letras, numeros e simbolos comuns).' },
        400,
      );
    }

    const { gestores } = await buildGestoresForEscola(escolaId, env);
    const gestorSelecionado =
      gestores.find((item) => item.id === gestorId || item.user_id === gestorId) ||
      gestores[0] ||
      null;

    if (!gestorSelecionado?.user_id) {
      return jsonResponse({ success: false, error: 'Gestor nao encontrado para esta escola' }, 404);
    }

    await supabaseAdminAuthRequest(env, `/users/${gestorSelecionado.user_id}`, {
      method: 'PUT',
      body: { password: novaSenha },
    });

    return jsonResponse({
      success: true,
      gestor_id: gestorSelecionado.id,
      gestor_nome: gestorSelecionado.nome || 'Gestor',
      gestor_email: gestorSelecionado.email || '',
      senha_temporaria: novaSenha,
    });
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
    const requestedSchoolId = String(body?.escola_id || '').trim();
    const ids = body?.id ? [String(body.id).trim()] : [];
    const explicitUserIds = body?.user_id ? [String(body.user_id).trim()] : [];
    const requestedUserIds = [...new Set([...explicitUserIds, ...ids].filter(Boolean))];

    if (!requestedSchoolId) {
      return jsonResponse({ success: false, error: 'Escola nao informada' }, 400);
    }

    if (ids.length === 0 && requestedUserIds.length === 0) {
      return jsonResponse({ success: false, error: 'Nenhum usuario informado para exclusao' }, 400);
    }

    const foundProfilesByKey = new Map<string, { id: string; user_id: string | null; escola_id: string | null }>();

    if (ids.length > 0) {
      const profilesById = await supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
          select: 'id,user_id,escola_id',
          id: `in.(${ids.join(',')})`,
        }).toString()}`,
      );

      (Array.isArray(profilesById) ? profilesById : []).forEach((profile) => {
        foundProfilesByKey.set(String(profile.id), profile);
      });
    }

    if (requestedUserIds.length > 0) {
      const profilesByUserId = await supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
          select: 'id,user_id,escola_id',
          user_id: `in.(${requestedUserIds.join(',')})`,
        }).toString()}`,
      );

      (Array.isArray(profilesByUserId) ? profilesByUserId : []).forEach((profile) => {
        foundProfilesByKey.set(String(profile.id), profile);
      });
    }

    const foundProfiles = Array.from(foundProfilesByKey.values());
    const forbiddenProfile = foundProfiles.find((profile) => profile.escola_id !== requestedSchoolId);
    if (forbiddenProfile) {
      return jsonResponse({ success: false, error: 'Voce nao pode excluir usuarios de outra escola' }, 403);
    }

    const selfProfile = foundProfiles.find((profile) => profile.user_id === user.id);
    if (selfProfile) {
      return jsonResponse({ success: false, error: 'Voce nao pode excluir o proprio usuario por esta tela' }, 400);
    }

    const userIdsToDelete = foundProfiles
      .map((profile) => String(profile.user_id || '').trim())
      .filter(Boolean);

    const authOnlyUserIds = requestedUserIds.filter((userId) => !foundProfiles.some((profile) => String(profile.user_id || '').trim() === userId));
    if (requestedSchoolId && authOnlyUserIds.length > 0) {
      const schoolsWithTargetGestor = await supabaseAdminRequest(
        env,
        `/rest/v1/escolas?${new URLSearchParams({
          select: 'id,gestor_id',
          id: `eq.${requestedSchoolId}`,
          gestor_id: `in.(${authOnlyUserIds.join(',')})`,
        }).toString()}`,
      );

      (Array.isArray(schoolsWithTargetGestor) ? schoolsWithTargetGestor : []).forEach((school) => {
        const matchedUserId = String(school?.gestor_id || '').trim();
        if (matchedUserId && !userIdsToDelete.includes(matchedUserId)) {
          userIdsToDelete.push(matchedUserId);
        }
      });
    }

    if (foundProfiles.length === 0 && userIdsToDelete.length === 0) {
      return jsonResponse({ success: false, error: 'Nenhum usuario encontrado para exclusao' }, 404);
    }

    if (userIdsToDelete.length > 0) {
      await supabaseAdminRequest(
        env,
        `/rest/v1/escolas?gestor_id=in.(${userIdsToDelete.join(',')})`,
        {
          method: 'PATCH',
          body: { gestor_id: null },
          headers: {
            Prefer: 'return=minimal',
          },
        },
      );
    }

    const authDeleteFailures: string[] = [];
    for (const authUserId of [...new Set(userIdsToDelete)]) {
      const normalizedUserId = String(authUserId || '').trim();
      if (!normalizedUserId) continue;

      try {
        await supabaseAdminAuthRequest(env, `/users/${normalizedUserId}`, { method: 'DELETE' });
      } catch (error) {
        const message = String(error instanceof Error ? error.message : '').toLowerCase();
        if (!message.includes('user not found')) {
          authDeleteFailures.push(`${normalizedUserId}: ${error instanceof Error ? error.message : 'Falha desconhecida'}`);
        }
      }
    }

    if (authDeleteFailures.length > 0) {
      return jsonResponse({ success: false, error: `Falha ao excluir contas de autenticacao: ${authDeleteFailures.join(' | ')}` }, 500);
    }

    const profileIdsToDelete = foundProfiles
      .map((profile) => String(profile.id || '').trim())
      .filter(Boolean);

    if (profileIdsToDelete.length > 0) {
      await supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?id=in.(${profileIdsToDelete.join(',')})`,
        {
          method: 'DELETE',
          headers: {
            Prefer: 'return=minimal',
          },
        },
      );
    }

    return jsonResponse({
      success: true,
      deleted_count: foundProfiles.length,
      deleted_auth_only_count: Math.max(userIdsToDelete.length - foundProfiles.filter((profile) => profile.user_id).length, 0),
      deleted_ids: foundProfiles.map((profile) => profile.id),
      deleted_user_ids: [...new Set(userIdsToDelete)],
    });
  },

  'GET /v1/emprestimos': async (request, env) => {
    const { profile, canManageLoans } = await getLoanModuleContext(request, env);

    const [emprestimos, livros, usuarios, solicitacoes] = await Promise.all([
      supabaseAdminRequest(
        env,
        `/rest/v1/emprestimos?${new URLSearchParams({
          select: 'id,livro_id,usuario_id,data_emprestimo,data_devolucao_prevista,data_devolucao_real,status,created_at,livros(titulo,autor,escola_id),usuarios_biblioteca(nome,email,escola_id)',
          order: 'data_emprestimo.desc',
        }).toString()}`,
      ),
      supabaseAdminRequest(
        env,
        `/rest/v1/livros?${new URLSearchParams({
          select: 'id,titulo,autor,disponivel,escola_id',
          escola_id: `eq.${profile.escola_id}`,
          order: 'titulo.asc',
        }).toString()}`,
      ),
      supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
          select: 'id,nome,email,escola_id',
          escola_id: `eq.${profile.escola_id}`,
          order: 'nome.asc',
        }).toString()}`,
      ),
      canManageLoans
        ? supabaseAdminRequest(
            env,
            `/rest/v1/solicitacoes_emprestimo?${new URLSearchParams({
              select: 'id,livro_id,usuario_id,mensagem,resposta,status,created_at,livros(id,titulo,autor,disponivel,escola_id),usuarios_biblioteca(nome,email,escola_id)',
              order: 'created_at.desc',
            }).toString()}`,
          )
        : Promise.resolve([]),
    ]);

    const sameSchool = (candidateEscolaId: unknown) => String(candidateEscolaId || '') === String(profile.escola_id || '');

    const emprestimosFiltrados = Array.isArray(emprestimos)
      ? emprestimos.filter((item) => sameSchool(item?.livros?.escola_id) || sameSchool(item?.usuarios_biblioteca?.escola_id))
      : [];
    const solicitacoesFiltradas = Array.isArray(solicitacoes)
      ? solicitacoes.filter((item) => sameSchool(item?.livros?.escola_id) || sameSchool(item?.usuarios_biblioteca?.escola_id))
      : [];
    const livrosCatalogo = Array.isArray(livros) ? livros : [];
    const usuariosFiltrados = Array.isArray(usuarios) ? usuarios : [];

    return jsonResponse({
      success: true,
      escolaId: profile.escola_id,
      canManageLoans,
      emprestimos: emprestimosFiltrados,
      solicitacoes: solicitacoesFiltradas,
      livrosCatalogo,
      livrosDisponiveis: livrosCatalogo.filter((item) => item?.disponivel),
      usuarios: usuariosFiltrados,
    });
  },

  'POST /v1/emprestimos': async (request, env) => {
    const { profile, canManageLoans } = await getLoanModuleContext(request, env);
    if (!canManageLoans) {
      return jsonResponse({ success: false, error: 'Sem permissao para gerenciar emprestimos.' }, 403);
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const livroId = String(body?.livro_id || '').trim();
    const usuarioId = String(body?.usuario_id || '').trim();
    const dataDevolucaoPrevista = body?.data_devolucao_prevista ? String(body.data_devolucao_prevista) : null;

    if (!livroId || !usuarioId) {
      return jsonResponse({ success: false, error: 'Livro e usuario sao obrigatorios.' }, 400);
    }

    const [livro] = await supabaseAdminRequest(
      env,
      `/rest/v1/livros?${new URLSearchParams({
        select: 'id,disponivel,escola_id',
        id: `eq.${livroId}`,
        limit: '1',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;
    const [usuario] = await supabaseAdminRequest(
      env,
      `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
        select: 'id,escola_id',
        id: `eq.${usuarioId}`,
        limit: '1',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;

    if (!livro?.id || String(livro.escola_id || '') !== String(profile.escola_id || '')) {
      return jsonResponse({ success: false, error: 'Livro fora da escola do usuario.' }, 403);
    }
    if (!usuario?.id || String(usuario.escola_id || '') !== String(profile.escola_id || '')) {
      return jsonResponse({ success: false, error: 'Usuario fora da escola do usuario.' }, 403);
    }
    if (livro.disponivel === false) {
      return jsonResponse({ success: false, error: 'Este livro nao esta disponivel para emprestimo no momento.' }, 400);
    }

    await supabaseAdminRequest(env, '/rest/v1/emprestimos', {
      method: 'POST',
      body: [{
        livro_id: livroId,
        usuario_id: usuarioId,
        ...(dataDevolucaoPrevista ? { data_devolucao_prevista: dataDevolucaoPrevista } : {}),
      }],
      headers: { Prefer: 'return=minimal' },
    });

    await supabaseAdminRequest(env, `/rest/v1/livros?${new URLSearchParams({ id: `eq.${livroId}` }).toString()}`, {
      method: 'PATCH',
      body: { disponivel: false },
      headers: { Prefer: 'return=minimal' },
    });

    return jsonResponse({ success: true });
  },

  'POST /v1/emprestimos/:id/devolucao': async (request, env) => {
    const { profile, canManageLoans } = await getLoanModuleContext(request, env);
    if (!canManageLoans) {
      return jsonResponse({ success: false, error: 'Sem permissao para registrar devolucoes.' }, 403);
    }

    const emprestimoId = getPathParam(request, /^\/v1\/emprestimos\/([^/]+)\/devolucao$/i);
    const [emprestimo] = await supabaseAdminRequest(
      env,
      `/rest/v1/emprestimos?${new URLSearchParams({
        select: 'id,livro_id,usuarios_biblioteca(escola_id),livros(escola_id)',
        id: `eq.${emprestimoId}`,
        limit: '1',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;

    const sameSchool =
      String(emprestimo?.usuarios_biblioteca?.escola_id || '') === String(profile.escola_id || '') ||
      String(emprestimo?.livros?.escola_id || '') === String(profile.escola_id || '');
    if (!emprestimo?.id || !sameSchool) {
      return jsonResponse({ success: false, error: 'Emprestimo nao encontrado para esta escola.' }, 404);
    }

    await supabaseAdminRequest(env, `/rest/v1/emprestimos?${new URLSearchParams({ id: `eq.${emprestimoId}` }).toString()}`, {
      method: 'PATCH',
      body: { data_devolucao_real: new Date().toISOString(), status: 'devolvido' },
      headers: { Prefer: 'return=minimal' },
    });
    await supabaseAdminRequest(env, `/rest/v1/livros?${new URLSearchParams({ id: `eq.${String(emprestimo.livro_id || '')}` }).toString()}`, {
      method: 'PATCH',
      body: { disponivel: true },
      headers: { Prefer: 'return=minimal' },
    });

    return jsonResponse({ success: true });
  },

  'POST /v1/solicitacoes-emprestimo/:id/aprovar': async (request, env) => {
    const { profile, canManageLoans } = await getLoanModuleContext(request, env);
    if (!canManageLoans) {
      return jsonResponse({ success: false, error: 'Sem permissao para aprovar solicitacoes.' }, 403);
    }

    const solicitacaoId = getPathParam(request, /^\/v1\/solicitacoes-emprestimo\/([^/]+)\/aprovar$/i);
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const resposta = String(body?.resposta || 'Solicitacao aprovada pela biblioteca.').trim();

    const [solicitacao] = await supabaseAdminRequest(
      env,
      `/rest/v1/solicitacoes_emprestimo?${new URLSearchParams({
        select: 'id,livro_id,usuario_id,status,livros(disponivel,escola_id),usuarios_biblioteca(escola_id)',
        id: `eq.${solicitacaoId}`,
        limit: '1',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;

    const sameSchool =
      String(solicitacao?.usuarios_biblioteca?.escola_id || '') === String(profile.escola_id || '') ||
      String(solicitacao?.livros?.escola_id || '') === String(profile.escola_id || '');
    if (!solicitacao?.id || !sameSchool) {
      return jsonResponse({ success: false, error: 'Solicitacao nao encontrada para esta escola.' }, 404);
    }
    if (String(solicitacao.status || '') !== 'pendente') {
      return jsonResponse({ success: false, error: 'A solicitacao ja foi processada.' }, 400);
    }
    if (solicitacao?.livros?.disponivel === false) {
      return jsonResponse({ success: false, error: 'Este livro nao esta disponivel para emprestimo no momento.' }, 400);
    }

    const emprestimoCriado = await supabaseAdminRequest(env, '/rest/v1/emprestimos', {
      method: 'POST',
      body: [{ livro_id: solicitacao.livro_id, usuario_id: solicitacao.usuario_id }],
      headers: { Prefer: 'return=representation' },
    }) as Array<Record<string, unknown>>;

    const emprestimoCriadoId = String(emprestimoCriado?.[0]?.id || '').trim();
    try {
      await supabaseAdminRequest(env, `/rest/v1/livros?${new URLSearchParams({ id: `eq.${String(solicitacao.livro_id || '')}` }).toString()}`, {
        method: 'PATCH',
        body: { disponivel: false },
        headers: { Prefer: 'return=minimal' },
      });
      await supabaseAdminRequest(env, `/rest/v1/solicitacoes_emprestimo?${new URLSearchParams({ id: `eq.${solicitacaoId}` }).toString()}`, {
        method: 'PATCH',
        body: { status: 'aprovada', resposta },
        headers: { Prefer: 'return=minimal' },
      });
    } catch (error) {
      if (emprestimoCriadoId) {
        await supabaseAdminRequest(env, `/rest/v1/emprestimos?${new URLSearchParams({ id: `eq.${emprestimoCriadoId}` }).toString()}`, {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        });
      }
      throw error;
    }

    return jsonResponse({ success: true });
  },

  'POST /v1/solicitacoes-emprestimo/:id/recusar': async (request, env) => {
    const { profile, canManageLoans } = await getLoanModuleContext(request, env);
    if (!canManageLoans) {
      return jsonResponse({ success: false, error: 'Sem permissao para recusar solicitacoes.' }, 403);
    }

    const solicitacaoId = getPathParam(request, /^\/v1\/solicitacoes-emprestimo\/([^/]+)\/recusar$/i);
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const resposta = String(body?.resposta || 'Solicitacao recusada pela biblioteca.').trim();

    const [solicitacao] = await supabaseAdminRequest(
      env,
      `/rest/v1/solicitacoes_emprestimo?${new URLSearchParams({
        select: 'id,status,livros(escola_id),usuarios_biblioteca(escola_id)',
        id: `eq.${solicitacaoId}`,
        limit: '1',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;

    const sameSchool =
      String(solicitacao?.usuarios_biblioteca?.escola_id || '') === String(profile.escola_id || '') ||
      String(solicitacao?.livros?.escola_id || '') === String(profile.escola_id || '');
    if (!solicitacao?.id || !sameSchool) {
      return jsonResponse({ success: false, error: 'Solicitacao nao encontrada para esta escola.' }, 404);
    }

    await supabaseAdminRequest(env, `/rest/v1/solicitacoes_emprestimo?${new URLSearchParams({ id: `eq.${solicitacaoId}` }).toString()}`, {
      method: 'PATCH',
      body: { status: 'recusada', resposta },
      headers: { Prefer: 'return=minimal' },
    });

    return jsonResponse({ success: true });
  },

  'POST /v1/emprestimos/historico': async (request, env) => {
    const { profile, canManageLoans } = await getLoanModuleContext(request, env);
    if (!canManageLoans) {
      return jsonResponse({ success: false, error: 'Sem permissao para registrar historico.' }, 403);
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const livroId = String(body?.livro_id || '').trim();
    const usuarioId = String(body?.usuario_id || '').trim();
    const status = String(body?.status || 'devolvido').trim();

    const [livro] = await supabaseAdminRequest(
      env,
      `/rest/v1/livros?${new URLSearchParams({
        select: 'id,disponivel,escola_id',
        id: `eq.${livroId}`,
        limit: '1',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;
    const [usuario] = await supabaseAdminRequest(
      env,
      `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
        select: 'id,escola_id',
        id: `eq.${usuarioId}`,
        limit: '1',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;

    if (!livro?.id || String(livro.escola_id || '') !== String(profile.escola_id || '')) {
      return jsonResponse({ success: false, error: 'Livro fora da escola do usuario.' }, 403);
    }
    if (!usuario?.id || String(usuario.escola_id || '') !== String(profile.escola_id || '')) {
      return jsonResponse({ success: false, error: 'Usuario fora da escola do usuario.' }, 403);
    }
    if (status === 'ativo' && livro.disponivel === false) {
      return jsonResponse({ success: false, error: 'Esse livro ja esta marcado como indisponivel no acervo atual.' }, 400);
    }

    await supabaseAdminRequest(env, '/rest/v1/emprestimos', {
      method: 'POST',
      body: [{
        livro_id: livroId,
        usuario_id: usuarioId,
        status,
        data_emprestimo: body?.data_emprestimo || null,
        data_devolucao_prevista: body?.data_devolucao_prevista || null,
        data_devolucao_real: body?.data_devolucao_real || null,
      }],
      headers: { Prefer: 'return=minimal' },
    });

    if (status === 'ativo') {
      await supabaseAdminRequest(env, `/rest/v1/livros?${new URLSearchParams({ id: `eq.${livroId}` }).toString()}`, {
        method: 'PATCH',
        body: { disponivel: false },
        headers: { Prefer: 'return=minimal' },
      });
    }

    return jsonResponse({ success: true });
  },

  'POST /v1/emprestimos/:id/delete': async (request, env) => {
    const { profile, canManageLoans } = await getLoanModuleContext(request, env);
    if (!canManageLoans) {
      return jsonResponse({ success: false, error: 'Sem permissao para excluir historico.' }, 403);
    }

    const emprestimoId = getPathParam(request, /^\/v1\/emprestimos\/([^/]+)\/delete$/i);
    const [emprestimo] = await supabaseAdminRequest(
      env,
      `/rest/v1/emprestimos?${new URLSearchParams({
        select: 'id,status,usuarios_biblioteca(escola_id),livros(escola_id)',
        id: `eq.${emprestimoId}`,
        limit: '1',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;

    const sameSchool =
      String(emprestimo?.usuarios_biblioteca?.escola_id || '') === String(profile.escola_id || '') ||
      String(emprestimo?.livros?.escola_id || '') === String(profile.escola_id || '');
    if (!emprestimo?.id || !sameSchool) {
      return jsonResponse({ success: false, error: 'Emprestimo nao encontrado para esta escola.' }, 404);
    }
    if (String(emprestimo.status || '') !== 'devolvido') {
      return jsonResponse({ success: false, error: 'Apenas registros devolvidos podem ser excluidos.' }, 400);
    }

    await supabaseAdminRequest(env, `/rest/v1/emprestimos?${new URLSearchParams({ id: `eq.${emprestimoId}` }).toString()}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });

    return jsonResponse({ success: true });
  },

  'GET /v1/livros': async (request, env) => {
    const { profile } = await getBooksModuleContext(request, env);
    const escolaId = String(profile.escola_id || '').trim();

    const [escolaLivros, legacyLivros, categorias] = await Promise.all([
      escolaId
        ? supabaseAdminRequest(
            env,
            `/rest/v1/livros?${new URLSearchParams({
              select: '*',
              escola_id: `eq.${escolaId}`,
              order: 'titulo.asc',
            }).toString()}`,
          )
        : Promise.resolve([]),
      supabaseAdminRequest(
        env,
        `/rest/v1/livros?${new URLSearchParams({
          select: '*',
          escola_id: 'is.null',
          order: 'titulo.asc',
        }).toString()}`,
      ),
      escolaId
        ? supabaseAdminRequest(
            env,
            `/rest/v1/categorias_livros?${new URLSearchParams({
              select: 'nome',
              escola_id: `eq.${escolaId}`,
              order: 'nome.asc',
            }).toString()}`,
          )
        : Promise.resolve([]),
    ]);

    const byId = new Map<string, Record<string, unknown>>();
    [...(Array.isArray(escolaLivros) ? escolaLivros : []), ...(Array.isArray(legacyLivros) ? legacyLivros : [])].forEach((livro) => {
      const id = String(livro?.id || '').trim();
      if (id) byId.set(id, livro);
    });

    const preCategorias = Array.isArray(categorias) && categorias.length > 0
      ? Array.from(new Set(categorias.map((item) => String(item?.nome || '').trim()).filter(Boolean)))
      : DEFAULT_BOOK_CATEGORIES;

    return jsonResponse({
      success: true,
      escolaId: escolaId || null,
      livros: Array.from(byId.values()).sort((a, b) => String(a?.titulo || '').localeCompare(String(b?.titulo || ''), 'pt-BR')),
      preCategorias,
    });
  },

  'POST /v1/livros': async (request, env) => {
    const { profile, canManageBooks } = await getBooksModuleContext(request, env);
    if (!canManageBooks) {
      return jsonResponse({ success: false, error: 'Sem permissao para cadastrar livros.' }, 403);
    }

    const escolaId = String(profile.escola_id || '').trim();
    if (!escolaId) {
      return jsonResponse({ success: false, error: 'Nao foi possivel identificar a escola do usuario.' }, 400);
    }

    const body = await request.json().catch(() => ({}));
    const payload = {
      ...body,
      escola_id: escolaId,
    };

    await supabaseAdminRequest(env, '/rest/v1/livros', {
      method: 'POST',
      body: payload,
      headers: { Prefer: 'return=minimal' },
    });

    return jsonResponse({ success: true });
  },

  'PATCH /v1/livros/:id': async (request, env) => {
    const { profile, canManageBooks } = await getBooksModuleContext(request, env);
    if (!canManageBooks) {
      return jsonResponse({ success: false, error: 'Sem permissao para atualizar livros.' }, 403);
    }

    const livroId = getPathParam(request, /^\/v1\/livros\/([^/]+)$/i);
    const escolaId = String(profile.escola_id || '').trim();
    const [livro] = await supabaseAdminRequest(
      env,
      `/rest/v1/livros?${new URLSearchParams({
        select: 'id,escola_id',
        id: `eq.${livroId}`,
        limit: '1',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;

    const livroEscolaId = String(livro?.escola_id || '').trim();
    if (!livro?.id || (livroEscolaId && livroEscolaId !== escolaId)) {
      return jsonResponse({ success: false, error: 'Livro nao encontrado para esta escola.' }, 404);
    }

    const body = await request.json().catch(() => ({}));
    const payload = { ...body };
    delete (payload as Record<string, unknown>).escola_id;

    await supabaseAdminRequest(env, `/rest/v1/livros?${new URLSearchParams({ id: `eq.${livroId}` }).toString()}`, {
      method: 'PATCH',
      body: payload,
      headers: { Prefer: 'return=minimal' },
    });

    return jsonResponse({ success: true });
  },

  'POST /v1/livros/:id/delete': async (request, env) => {
    const { profile, canManageBooks } = await getBooksModuleContext(request, env);
    if (!canManageBooks) {
      return jsonResponse({ success: false, error: 'Sem permissao para excluir livros.' }, 403);
    }

    const livroId = getPathParam(request, /^\/v1\/livros\/([^/]+)\/delete$/i);
    const escolaId = String(profile.escola_id || '').trim();
    const [livro] = await supabaseAdminRequest(
      env,
      `/rest/v1/livros?${new URLSearchParams({
        select: 'id,escola_id',
        id: `eq.${livroId}`,
        limit: '1',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;

    const livroEscolaId = String(livro?.escola_id || '').trim();
    if (!livro?.id || (livroEscolaId && livroEscolaId !== escolaId)) {
      return jsonResponse({ success: false, error: 'Livro nao encontrado para esta escola.' }, 404);
    }

    await supabaseAdminRequest(env, `/rest/v1/livros?${new URLSearchParams({ id: `eq.${livroId}` }).toString()}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });

    return jsonResponse({ success: true });
  },

  'POST /v1/livros/categorias': async (request, env) => {
    const { profile, canManageBooks } = await getBooksModuleContext(request, env);
    if (!canManageBooks) {
      return jsonResponse({ success: false, error: 'Sem permissao para gerenciar categorias.' }, 403);
    }

    const escolaId = String(profile.escola_id || '').trim();
    if (!escolaId) {
      return jsonResponse({ success: false, error: 'Nao foi possivel identificar a escola do usuario.' }, 400);
    }

    const body = await request.json().catch(() => ({}));
    const payload = {
      escola_id: escolaId,
      nome: String(body?.nome || '').trim(),
      created_by: body?.created_by || profile.id || null,
    };

    if (!payload.nome) {
      return jsonResponse({ success: false, error: 'Nome da categoria obrigatorio.' }, 400);
    }

    await supabaseAdminRequest(env, '/rest/v1/categorias_livros', {
      method: 'POST',
      body: payload,
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
    });

    return jsonResponse({ success: true });
  },

  'POST /v1/livros/categorias/delete': async (request, env) => {
    const { profile, canManageBooks } = await getBooksModuleContext(request, env);
    if (!canManageBooks) {
      return jsonResponse({ success: false, error: 'Sem permissao para gerenciar categorias.' }, 403);
    }

    const escolaId = String(profile.escola_id || '').trim();
    const body = await request.json().catch(() => ({}));
    const nome = String(body?.nome || '').trim();
    if (!nome) {
      return jsonResponse({ success: false, error: 'Nome da categoria obrigatorio.' }, 400);
    }

    await supabaseAdminRequest(
      env,
      `/rest/v1/categorias_livros?${new URLSearchParams({
        escola_id: `eq.${escolaId}`,
        nome: `eq.${nome}`,
      }).toString()}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      },
    );

    return jsonResponse({ success: true });
  },

  'POST /v1/livros/import': async (request, env) => {
    const { profile, canManageBooks } = await getBooksModuleContext(request, env);
    if (!canManageBooks) {
      return jsonResponse({ success: false, error: 'Sem permissao para importar livros.' }, 403);
    }

    const escolaId = String(profile.escola_id || '').trim();
    if (!escolaId) {
      return jsonResponse({ success: false, error: 'Nao foi possivel identificar a escola do usuario.' }, 400);
    }

    const body = await request.json().catch(() => ({}));
    const livros = Array.isArray(body?.livros) ? body.livros : [];
    const resultados = [];

    for (const livro of livros) {
      const payload = {
        area: livro?.area || '',
        tombo: livro?.tombo || null,
        autor: livro?.autor || '',
        titulo: livro?.titulo || '',
        vol: livro?.vol || '',
        edicao: livro?.edicao || '',
        local: livro?.local || '',
        editora: livro?.editora || '',
        ano: livro?.ano || '',
        disponivel: true,
        sinopse: livro?.sinopse || '',
        escola_id: escolaId,
      };

      try {
        await supabaseAdminRequest(env, '/rest/v1/livros', {
          method: 'POST',
          body: payload,
          headers: { Prefer: 'return=minimal' },
        });
        resultados.push({ ...livro, status: 'sucesso' });
      } catch (error) {
        const message = String(error instanceof Error ? error.message : error || '');
        resultados.push({
          ...livro,
          status: 'erro',
          mensagem: message.includes('23505') || /duplicate key/i.test(message) ? 'Tombo ja cadastrado' : message,
        });
      }
    }

    return jsonResponse({ success: true, livros: resultados });
  },

  'GET /v1/usuarios': async (request, env) => {
    const { currentEscolaId } = await getUsersModuleContext(request, env);

    let usuariosPath = '/rest/v1/usuarios_biblioteca?select=*&order=nome.asc';
    let turmasPath = '/rest/v1/salas_cursos?select=nome,tipo,escola_id&order=nome.asc';
    let professorTurmasPath = '/rest/v1/professor_turmas?select=professor_id,turma&order=turma.asc';
    if (currentEscolaId) {
      usuariosPath = `/rest/v1/usuarios_biblioteca?${new URLSearchParams({ select: '*', escola_id: `eq.${currentEscolaId}`, order: 'nome.asc' }).toString()}`;
      turmasPath = `/rest/v1/salas_cursos?${new URLSearchParams({ select: 'nome,tipo,escola_id', escola_id: `eq.${currentEscolaId}`, order: 'nome.asc' }).toString()}`;
      professorTurmasPath = `/rest/v1/professor_turmas?${new URLSearchParams({ select: 'professor_id,turma', escola_id: `eq.${currentEscolaId}`, order: 'turma.asc' }).toString()}`;
    }

    const [usuarios, turmas, professorTurmas] = await Promise.all([
      supabaseAdminRequest(env, usuariosPath),
      supabaseAdminRequest(env, turmasPath),
      supabaseAdminRequest(env, professorTurmasPath).catch((error) => {
        const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
        if (message.includes('does not exist') || message.includes('could not find the table')) return [];
        throw error;
      }),
    ]);

    const professorTurmasMap: Record<string, string[]> = {};
    (Array.isArray(professorTurmas) ? professorTurmas : []).forEach((item) => {
      const professorId = String(item?.professor_id || '').trim();
      const turma = String(item?.turma || '').trim();
      if (!professorId || !turma) return;
      if (!professorTurmasMap[professorId]) professorTurmasMap[professorId] = [];
      if (!professorTurmasMap[professorId].includes(turma)) professorTurmasMap[professorId].push(turma);
    });

    return jsonResponse({
      success: true,
      currentEscolaId,
      usuarios: Array.isArray(usuarios) ? usuarios : [],
      turmasDisponiveis: [...new Set((Array.isArray(turmas) ? turmas : []).map((item) => String(item?.nome || '').trim()).filter(Boolean))],
      professorTurmasMap,
    });
  },

  'POST /v1/usuarios/professor-turmas': async (request, env) => {
    const { isGestor, currentEscolaId } = await getUsersModuleContext(request, env);
    if (!isGestor || !currentEscolaId) {
      return jsonResponse({ success: false, error: 'Sem permissao para gerenciar turmas de professor.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const professorId = String(body?.professorId || '').trim();
    const professorUserId = String(body?.professorUserId || '').trim();
    const turmasNormalizadas = [...new Set((Array.isArray(body?.turmas) ? body.turmas : []).map((turma) => String(turma || '').trim()).filter(Boolean))];

    let professorIds = [professorId];
    if (professorUserId) {
      const siblingProfiles = await supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
          select: 'id',
          user_id: `eq.${professorUserId}`,
          tipo: 'eq.professor',
          escola_id: `eq.${currentEscolaId}`,
        }).toString()}`,
      ) as Array<Record<string, unknown>>;
      professorIds = [...new Set([professorId, ...siblingProfiles.map((item) => String(item?.id || '').trim()).filter(Boolean)])];
    }

    await supabaseAdminRequest(
      env,
      `/rest/v1/professor_turmas?${new URLSearchParams({
        escola_id: `eq.${currentEscolaId}`,
        professor_id: `in.(${professorIds.join(',')})`,
      }).toString()}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      },
    );

    if (turmasNormalizadas.length > 0) {
      const payload = professorIds.flatMap((currentProfessorId) =>
        turmasNormalizadas.map((turma) => ({
          professor_id: currentProfessorId,
          escola_id: currentEscolaId,
          turma,
        })),
      );
      await supabaseAdminRequest(env, '/rest/v1/professor_turmas', {
        method: 'POST',
        body: payload,
        headers: { Prefer: 'return=minimal' },
      });
    }

    return jsonResponse({ success: true });
  },

  'POST /v1/usuarios/provisionar-aluno': async (request, env) => {
    const { canManageUsers } = await getUsersModuleContext(request, env);
    if (!canManageUsers) {
      return jsonResponse({ success: false, error: 'Sem permissao para cadastrar alunos.' }, 403);
    }
    const body = await request.json().catch(() => ({}));
    const payload = await callSupabaseFunction(request, env, 'provisionar-aluno-matricula', body);
    return jsonResponse(payload);
  },

  'POST /v1/usuarios': async (request, env) => {
    const { canManageUsers, canCreateGestor, currentEscolaId } = await getUsersModuleContext(request, env);
    if (!canManageUsers || !currentEscolaId) {
      return jsonResponse({ success: false, error: 'Sem permissao para cadastrar usuarios.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const tipo = String(body?.tipo || '').trim().toLowerCase();
    if (tipo === 'gestor' && !canCreateGestor) {
      return jsonResponse({ success: false, error: 'A bibliotecaria nao pode cadastrar novos gestores.' }, 403);
    }

    const created = await supabaseAdminRequest(env, '/rest/v1/usuarios_biblioteca?select=id', {
      method: 'POST',
      body: { ...body, escola_id: currentEscolaId },
      headers: { Prefer: 'return=representation' },
    }) as Array<Record<string, unknown>>;

    return jsonResponse({ success: true, id: created?.[0]?.id || null });
  },

  'PATCH /v1/usuarios/:id': async (request, env) => {
    const { canManageUsers, currentEscolaId } = await getUsersModuleContext(request, env);
    if (!canManageUsers || !currentEscolaId) {
      return jsonResponse({ success: false, error: 'Sem permissao para atualizar usuarios.' }, 403);
    }

    const usuarioId = getPathParam(request, /^\/v1\/usuarios\/([^/]+)$/i);
    const [usuario] = await supabaseAdminRequest(
      env,
      `/rest/v1/usuarios_biblioteca?${new URLSearchParams({ select: 'id,escola_id', id: `eq.${usuarioId}`, limit: '1' }).toString()}`,
    ) as Array<Record<string, unknown>>;
    if (!usuario?.id || String(usuario?.escola_id || '') !== String(currentEscolaId)) {
      return jsonResponse({ success: false, error: 'Usuario nao encontrado para esta escola.' }, 404);
    }

    const body = await request.json().catch(() => ({}));
    await supabaseAdminRequest(
      env,
      `/rest/v1/usuarios_biblioteca?${new URLSearchParams({ id: `eq.${usuarioId}` }).toString()}`,
      {
        method: 'PATCH',
        body,
        headers: { Prefer: 'return=minimal' },
      },
    );

    return jsonResponse({ success: true });
  },

  'POST /v1/usuarios/delete-batch': async (request, env) => {
    const { canManageUsers } = await getUsersModuleContext(request, env);
    if (!canManageUsers) {
      return jsonResponse({ success: false, error: 'Sem permissao para excluir usuarios.' }, 403);
    }
    const body = await request.json().catch(() => ({}));
    const payload = await callSupabaseFunction(request, env, 'excluir-usuarios-biblioteca', { ids: body?.ids || [] });
    return jsonResponse(payload);
  },

  'POST /v1/usuarios/import': async (request, env) => {
    const { canManageUsers, currentEscolaId } = await getUsersModuleContext(request, env);
    if (!canManageUsers) {
      return jsonResponse({ success: false, error: 'Sem permissao para importar usuarios.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const usuarios = Array.isArray(body?.usuarios) ? body.usuarios : [];
    const tipoUsuarioImport = String(body?.tipoUsuarioImport || 'aluno').trim().toLowerCase();
    const results = [];

    for (const usuario of usuarios) {
      try {
        if (tipoUsuarioImport === 'aluno') {
          const payload = await callSupabaseFunction(request, env, 'provisionar-aluno-matricula', {
            nome: usuario?.nome,
            matricula: usuario?.matricula,
            turma: usuario?.turma,
          });
          if (!payload?.success) {
            results.push({ ...usuario, status: 'erro', mensagem: payload?.error || 'Nao foi possivel provisionar o aluno.' });
          } else {
            results.push({ ...usuario, status: 'sucesso' });
          }
          continue;
        }

        await supabaseAdminRequest(env, '/rest/v1/usuarios_biblioteca', {
          method: 'POST',
          body: {
            nome: usuario?.nome,
            matricula: usuario?.matricula,
            email: usuario?.email || `${usuario?.matricula}@temp.bibliotecai.com`,
            turma: usuario?.turma,
            tipo: tipoUsuarioImport,
            escola_id: currentEscolaId,
          },
          headers: { Prefer: 'return=minimal' },
        });
        results.push({ ...usuario, status: 'sucesso' });
      } catch (error) {
        const message = String(error instanceof Error ? error.message : error || '');
        results.push({ ...usuario, status: 'erro', mensagem: /23505|duplicate/i.test(message) ? 'Ja existe' : message });
      }
    }

    return jsonResponse({ success: true, usuarios: results });
  },

  'POST /v1/usuarios/reset-aluno-password': async (request, env) => {
    const { isGestor } = await getUsersModuleContext(request, env);
    if (!isGestor) {
      return jsonResponse({ success: false, error: 'Apenas gestores podem redefinir senha de alunos.' }, 403);
    }
    const body = await request.json().catch(() => ({}));
    const payload = await callSupabaseFunction(request, env, 'redefinir-senha-aluno', body);
    return jsonResponse(payload);
  },

  'GET /v1/aluno/comunidade': async (request, env) => {
    const { profile, escolaId, alunoId, isProfessor, canPublicarComunicado } = await getCommunityModuleContext(request, env);

    const [
      livros,
      likes,
      audiobooks,
      posts,
      professorTurmas,
      salas,
      usuariosSala,
      professorTurmasEscola,
    ] = await Promise.all([
      supabaseAdminRequest(env, '/rest/v1/livros?select=id,titulo&order=titulo.asc'),
      supabaseAdminRequest(env, '/rest/v1/comunidade_curtidas?select=post_id,usuario_id'),
      supabaseAdminRequest(env, '/rest/v1/audiobooks_biblioteca?select=id,titulo,autor&order=titulo.asc').catch(() => []),
      supabaseAdminRequest(env, '/rest/v1/comunidade_posts?select=*,livros(titulo,autor),audiobooks_biblioteca(titulo,autor,audio_url),usuarios_biblioteca!comunidade_posts_autor_id_fkey(nome)&order=created_at.desc').catch(() => []),
      isProfessor && alunoId
        ? supabaseAdminRequest(env, `/rest/v1/professor_turmas?${new URLSearchParams({ select: 'turma', professor_id: `eq.${alunoId}` }).toString()}`).catch(() => [])
        : Promise.resolve([]),
      canPublicarComunicado && escolaId
        ? supabaseAdminRequest(env, `/rest/v1/salas_cursos?${new URLSearchParams({ select: 'nome', escola_id: `eq.${escolaId}`, order: 'nome.asc' }).toString()}`).catch(() => [])
        : Promise.resolve([]),
      canPublicarComunicado && escolaId
        ? supabaseAdminRequest(env, `/rest/v1/usuarios_biblioteca?${new URLSearchParams({ select: 'turma', escola_id: `eq.${escolaId}` }).toString()}`).catch(() => [])
        : Promise.resolve([]),
      canPublicarComunicado && escolaId
        ? supabaseAdminRequest(env, `/rest/v1/professor_turmas?${new URLSearchParams({ select: 'turma', escola_id: `eq.${escolaId}` }).toString()}`).catch(() => [])
        : Promise.resolve([]),
    ]);

    const oficiais = (Array.isArray(salas) ? salas : []).map((item) => String(item?.nome || '').trim()).filter(Boolean);
    const extras = new Map<string, string>();
    [...(Array.isArray(usuariosSala) ? usuariosSala : []), ...(Array.isArray(professorTurmasEscola) ? professorTurmasEscola : [])].forEach((item) => {
      const nome = String(item?.turma || '').trim();
      if (!nome) return;
      const key = normalizeTurmaKey(nome);
      const oficiaisKeys = new Set(oficiais.map((value) => normalizeTurmaKey(value)));
      if (oficiaisKeys.has(key) || extras.has(key)) return;
      extras.set(key, nome);
    });

    return jsonResponse({
      success: true,
      perfil: profile,
      livros: Array.isArray(livros) ? livros : [],
      likes: Array.isArray(likes) ? likes : [],
      audiobooks: Array.isArray(audiobooks) ? audiobooks : [],
      posts: Array.isArray(posts) ? posts : [],
      professorTurmas: [...new Set((Array.isArray(professorTurmas) ? professorTurmas : []).map((item) => String(item?.turma || '').trim()).filter(Boolean))].sort(),
      turmasPublicacao: [...oficiais, ...Array.from(extras.values())].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    });
  },

  'GET /v1/aluno/painel': async (request, env) => {
    const { profile, escolaId, alunoId, alunoTurma } = await getCommunityModuleContext(request, env);
    if (!profile?.id) {
      return jsonResponse({ success: false, error: 'Perfil do aluno nao encontrado.' }, 400);
    }

    await supabaseAdminRequest(env, '/rest/v1/rpc/cleanup_expired_comunicados', {
      method: 'POST',
      body: {},
    }).catch(() => null);

    const comunicados = escolaId
      ? await supabaseAdminRequest(
          env,
          `/rest/v1/comunidade_posts?${new URLSearchParams({
            select: 'id,titulo,conteudo,turma_publico,created_at,tipo,expires_at',
            escola_id: `eq.${escolaId}`,
            tipo: 'eq.comunicado',
            order: 'created_at.desc',
            limit: '20',
          }).toString()}`,
        ).catch(() => [])
      : [];

    const [
      emprestimos,
      avaliacoes,
      wishlist,
      sugestoes,
      solicitacoes,
      atividades,
      entregas,
      audiobookCatalogo,
      meusAudiobooks,
      criacoesLaboratorio,
      notificacoesLidas,
      preferenciasAluno,
    ] = await Promise.all([
      supabaseAdminRequest(env, `/rest/v1/emprestimos?${new URLSearchParams({ select: '*,livros(titulo,autor)', usuario_id: `eq.${profile.id}`, order: 'data_emprestimo.desc' }).toString()}`),
      supabaseAdminRequest(env, `/rest/v1/avaliacoes_livros?${new URLSearchParams({ select: '*,livros(titulo,autor)', usuario_id: `eq.${profile.id}`, order: 'created_at.desc' }).toString()}`),
      supabaseAdminRequest(env, `/rest/v1/lista_desejos?${new URLSearchParams({ select: 'livro_id', usuario_id: `eq.${profile.id}` }).toString()}`),
      supabaseAdminRequest(env, `/rest/v1/sugestoes_livros?${new URLSearchParams({ select: '*,livros(titulo,autor)', aluno_id: `eq.${profile.id}`, order: 'created_at.desc' }).toString()}`),
      supabaseAdminRequest(env, `/rest/v1/solicitacoes_emprestimo?${new URLSearchParams({ select: '*,livros(titulo,autor)', usuario_id: `eq.${profile.id}`, order: 'created_at.desc' }).toString()}`),
      supabaseAdminRequest(env, `/rest/v1/atividades_leitura?${new URLSearchParams({ select: '*,livros(titulo,autor),professor:usuarios_biblioteca!atividades_leitura_professor_id_fkey(nome)', aluno_id: `eq.${profile.id}`, order: 'created_at.desc' }).toString()}`),
      supabaseAdminRequest(env, `/rest/v1/atividades_entregas?${new URLSearchParams({ select: '*', aluno_id: `eq.${profile.id}`, order: 'updated_at.desc' }).toString()}`).catch(() => []),
      supabaseAdminRequest(env, '/rest/v1/audiobooks_biblioteca?select=*,livros(titulo,autor)&order=created_at.desc').catch(() => []),
      supabaseAdminRequest(env, `/rest/v1/aluno_audiobooks?${new URLSearchParams({ select: '*,audiobooks_biblioteca(*,livros(titulo,autor))', aluno_id: `eq.${profile.id}`, order: 'created_at.desc' }).toString()}`).catch(() => []),
      supabaseAdminRequest(env, `/rest/v1/laboratorio_criacoes?${new URLSearchParams({ select: '*', aluno_id: `eq.${profile.id}`, order: 'created_at.desc' }).toString()}`).catch(() => []),
      supabaseAdminRequest(env, `/rest/v1/notificacoes_lidas?${new URLSearchParams({ select: 'notification_id', usuario_id: `eq.${profile.id}` }).toString()}`).catch(() => []),
      supabaseAdminRequest(env, `/rest/v1/preferencias_aluno?${new URLSearchParams({ select: 'desafio_ia_ativo,desafio_ia_concluido_em,desafio_ia_gerado_em,desafio_ia_xp_bonus', usuario_id: `eq.${profile.id}`, limit: '1' }).toString()}`).then((rows) => Array.isArray(rows) ? (rows[0] || null) : null).catch(() => null),
    ]);

    const comunicadosFiltrados = (Array.isArray(comunicados) ? comunicados : []).filter((item) => {
      if (!item || isExpiredComunicado(item)) return false;
      const turmaDestino = normalizeTurmaKey(item?.turma_publico);
      return !turmaDestino || turmaDestino === normalizeTurmaKey(alunoTurma);
    });

    return jsonResponse({
      success: true,
      perfil: profile,
      emprestimos: Array.isArray(emprestimos) ? emprestimos : [],
      avaliacoes: Array.isArray(avaliacoes) ? avaliacoes : [],
      wishlist: Array.isArray(wishlist) ? wishlist : [],
      sugestoes: Array.isArray(sugestoes) ? sugestoes : [],
      solicitacoes: Array.isArray(solicitacoes) ? solicitacoes : [],
      atividades: Array.isArray(atividades) ? atividades : [],
      comunicados: comunicadosFiltrados,
      entregas: Array.isArray(entregas) ? entregas : [],
      audiobookCatalogo: Array.isArray(audiobookCatalogo) ? audiobookCatalogo : [],
      meusAudiobooks: Array.isArray(meusAudiobooks) ? meusAudiobooks : [],
      criacoesLaboratorio: Array.isArray(criacoesLaboratorio) ? criacoesLaboratorio : [],
      notificacoesLidas: Array.isArray(notificacoesLidas) ? notificacoesLidas : [],
      preferenciasAluno,
    });
  },

  'POST /v1/aluno/wishlist/toggle': async (request, env) => {
    const { alunoId } = await getCommunityModuleContext(request, env);
    if (!alunoId) {
      return jsonResponse({ success: false, error: 'Perfil do aluno nao encontrado.' }, 400);
    }
    const body = await request.json().catch(() => ({}));
    const livroId = String(body?.livroId || '').trim();
    const enabled = body?.enabled === true;

    if (!livroId) {
      return jsonResponse({ success: false, error: 'Livro invalido.' }, 400);
    }

    if (enabled) {
      await supabaseAdminRequest(env, '/rest/v1/lista_desejos', {
        method: 'POST',
        body: { livro_id: livroId, usuario_id: alunoId },
        headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
      });
    } else {
      await supabaseAdminRequest(env, `/rest/v1/lista_desejos?${new URLSearchParams({ livro_id: `eq.${livroId}`, usuario_id: `eq.${alunoId}` }).toString()}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
    }

    return jsonResponse({ success: true });
  },

  'POST /v1/aluno/solicitacoes-emprestimo': async (request, env) => {
    const { alunoId } = await getCommunityModuleContext(request, env);
    if (!alunoId) {
      return jsonResponse({ success: false, error: 'Perfil do aluno nao encontrado.' }, 400);
    }
    const body = await request.json().catch(() => ({}));
    const livroId = String(body?.livroId || '').trim();
    const mensagem = String(body?.mensagem || '').trim() || null;

    if (!livroId) {
      return jsonResponse({ success: false, error: 'Livro invalido.' }, 400);
    }

    await supabaseAdminRequest(env, '/rest/v1/solicitacoes_emprestimo', {
      method: 'POST',
      body: { livro_id: livroId, usuario_id: alunoId, mensagem },
      headers: { Prefer: 'return=minimal' },
    });

    return jsonResponse({ success: true });
  },

  'POST /v1/aluno/notificacoes/read-batch': async (request, env) => {
    const { profile } = await getCommunityModuleContext(request, env);
    if (!profile?.id) {
      return jsonResponse({ success: false, error: 'Perfil do aluno nao encontrado.' }, 400);
    }

    const body = await request.json().catch(() => ({}));
    const notificationIds = Array.isArray(body?.notification_ids)
      ? body.notification_ids.map((item) => String(item || '').trim()).filter(Boolean)
      : [];

    if (notificationIds.length === 0) {
      return jsonResponse({ success: true });
    }

    await supabaseAdminRequest(env, '/rest/v1/notificacoes_lidas', {
      method: 'POST',
      body: notificationIds.map((notificationId) => ({ usuario_id: profile.id, notification_id: notificationId })),
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
    });

    return jsonResponse({ success: true });
  },

  'POST /v1/aluno/preferencias/desafio': async (request, env) => {
    const { profile } = await getCommunityModuleContext(request, env);
    if (!profile?.id) {
      return jsonResponse({ success: false, error: 'Perfil do aluno nao encontrado.' }, 400);
    }

    const body = await request.json().catch(() => ({}));
    const desafio = body?.desafio && typeof body.desafio === 'object' ? body.desafio : null;
    const xpBonus = Math.max(0, Number(body?.xpBonus || 0));

    await supabaseAdminRequest(env, '/rest/v1/preferencias_aluno?on_conflict=usuario_id', {
      method: 'POST',
      body: [{
        usuario_id: profile.id,
        desafio_ia_ativo: desafio,
        desafio_ia_gerado_em: desafio?.gerado_em || null,
        desafio_ia_concluido_em: desafio?.concluido_em || null,
        desafio_ia_xp_bonus: xpBonus,
      }],
      headers: {
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
    });

    return jsonResponse({ success: true });
  },

  'GET /v1/aluno/comunidade/feed': async (request, env) => {
    await getCommunityModuleContext(request, env);
    const url = new URL(request.url);
    const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0);
    const limit = Math.min(50, Math.max(1, Number.parseInt(url.searchParams.get('limit') || '20', 10) || 20));
    const posts = await supabaseAdminRequest(
      env,
      `/rest/v1/comunidade_posts?${new URLSearchParams({
        select: '*,livros(titulo,autor),audiobooks_biblioteca(titulo,autor,audio_url),usuarios_biblioteca!comunidade_posts_autor_id_fkey(nome)',
        order: 'created_at.desc',
        offset: String(offset),
        limit: String(limit),
      }).toString()}`,
    ).catch(() => []);

    return jsonResponse({ success: true, posts: Array.isArray(posts) ? posts : [] });
  },

  'GET /v1/aluno/comunidade/posts/:id': async (request, env) => {
    await getCommunityModuleContext(request, env);
    const postId = getPathParam(request, /^\/v1\/aluno\/comunidade\/posts\/([^/]+)$/i);
    const [post] = await supabaseAdminRequest(
      env,
      `/rest/v1/comunidade_posts?${new URLSearchParams({
        select: '*,livros(titulo,autor),audiobooks_biblioteca(titulo,autor,audio_url),usuarios_biblioteca!comunidade_posts_autor_id_fkey(nome)',
        id: `eq.${postId}`,
        limit: '1',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;
    return jsonResponse({ success: true, post: post || null });
  },

  'POST /v1/aluno/comunidade/posts': async (request, env) => {
    const { alunoId, escolaId } = await getCommunityModuleContext(request, env);
    if (!alunoId || !escolaId) {
      return jsonResponse({ success: false, error: 'Perfil do aluno nao encontrado.' }, 400);
    }

    const body = await request.json().catch(() => ({}));
    const created = await supabaseAdminRequest(env, '/rest/v1/comunidade_posts?select=id', {
      method: 'POST',
      body: { ...body, autor_id: alunoId, escola_id: escolaId },
      headers: { Prefer: 'return=representation' },
    }) as Array<Record<string, unknown>>;

    return jsonResponse({ success: true, postId: created?.[0]?.id || null });
  },

  'POST /v1/aluno/comunidade/posts/:id/like': async (request, env) => {
    const { alunoId } = await getCommunityModuleContext(request, env);
    const postId = getPathParam(request, /^\/v1\/aluno\/comunidade\/posts\/([^/]+)\/like$/i);
    const body = await request.json().catch(() => ({}));
    const liked = Boolean(body?.liked);

    if (liked) {
      await supabaseAdminRequest(env, `/rest/v1/comunidade_curtidas?${new URLSearchParams({ post_id: `eq.${postId}`, usuario_id: `eq.${alunoId}` }).toString()}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
    } else {
      await supabaseAdminRequest(env, '/rest/v1/comunidade_curtidas', {
        method: 'POST',
        body: { post_id: postId, usuario_id: alunoId },
        headers: { Prefer: 'return=minimal' },
      });
    }

    return jsonResponse({ success: true });
  },

  'PATCH /v1/aluno/comunidade/posts/:id': async (request, env) => {
    const { alunoId } = await getCommunityModuleContext(request, env);
    const postId = getPathParam(request, /^\/v1\/aluno\/comunidade\/posts\/([^/]+)$/i);
    const [post] = await supabaseAdminRequest(
      env,
      `/rest/v1/comunidade_posts?${new URLSearchParams({ select: 'id,autor_id', id: `eq.${postId}`, limit: '1' }).toString()}`,
    ) as Array<Record<string, unknown>>;
    if (!post?.id || String(post?.autor_id || '') !== String(alunoId || '')) {
      return jsonResponse({ success: false, error: 'Voce so pode editar publicacoes feitas por voce.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    await supabaseAdminRequest(env, `/rest/v1/comunidade_posts?${new URLSearchParams({ id: `eq.${postId}` }).toString()}`, {
      method: 'PATCH',
      body,
      headers: { Prefer: 'return=minimal' },
    });

    return jsonResponse({ success: true });
  },

  'POST /v1/aluno/comunidade/posts/:id/delete': async (request, env) => {
    const { alunoId } = await getCommunityModuleContext(request, env);
    const postId = getPathParam(request, /^\/v1\/aluno\/comunidade\/posts\/([^/]+)\/delete$/i);
    const [deleted] = await supabaseAdminRequest(
      env,
      `/rest/v1/comunidade_posts?${new URLSearchParams({ select: 'id', id: `eq.${postId}`, autor_id: `eq.${alunoId}` }).toString()}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      },
    ) as Array<Record<string, unknown>>;

    return jsonResponse({ success: true, deleted: Boolean(deleted?.id) });
  },

  'POST /v1/aluno/comunidade/quiz-tentativas': async (request, env) => {
    await getCommunityModuleContext(request, env);
    const body = await request.json().catch(() => ({}));
    await supabaseAdminRequest(env, '/rest/v1/comunidade_quiz_tentativas', {
      method: 'POST',
      body,
      headers: { Prefer: 'return=minimal' },
    });
    return jsonResponse({ success: true });
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
    .replace(/\/v1\/admin\/super-admins\/[^/]+\/unlock$/, '/v1/admin/super-admins/:id/unlock')
    .replace(/\/v1\/emprestimos\/[^/]+\/devolucao$/, '/v1/emprestimos/:id/devolucao')
    .replace(/\/v1\/emprestimos\/[^/]+\/delete$/, '/v1/emprestimos/:id/delete')
    .replace(/\/v1\/solicitacoes-emprestimo\/[^/]+\/aprovar$/, '/v1/solicitacoes-emprestimo/:id/aprovar')
    .replace(/\/v1\/solicitacoes-emprestimo\/[^/]+\/recusar$/, '/v1/solicitacoes-emprestimo/:id/recusar')
    .replace(/\/v1\/aluno\/comunidade\/posts\/[^/]+\/like$/, '/v1/aluno/comunidade/posts/:id/like')
    .replace(/\/v1\/aluno\/comunidade\/posts\/[^/]+\/delete$/, '/v1/aluno/comunidade/posts/:id/delete')
    .replace(/\/v1\/aluno\/comunidade\/posts\/[^/]+$/, '/v1/aluno/comunidade/posts/:id')
    .replace(/\/v1\/livros\/[^/]+\/delete$/, '/v1/livros/:id/delete')
    .replace(/\/v1\/livros\/[^/]+$/, '/v1/livros/:id')
    .replace(/\/v1\/usuarios\/[^/]+$/, '/v1/usuarios/:id');
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
