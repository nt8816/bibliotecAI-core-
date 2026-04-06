import {
  base64UrlEncode,
  base64UrlDecode,
  buildRiskContext,
  detectDeviceType,
  getRequestOrigin,
  getRpId,
  randomDigits,
  randomToken,
  sendSecurityEmail,
  sha256Base64Url,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from './superAdminSecurity';

export interface Env {
  APP_ENV?: string;
  API_BASE_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  FIREBASE_PROJECT_ID?: string;
  FIREBASE_CLIENT_EMAIL?: string;
  FIREBASE_PRIVATE_KEY?: string;
  SECURITY_EMAIL_FROM?: string;
  SECURITY_EMAIL_FROM_NAME?: string;
  SECURITY_EMAIL_REPLY_TO?: string;
  MAILCHANNELS_ENDPOINT?: string;
}

type RouteHandler = (request: Request, env: Env) => Promise<Response> | Response;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, x-user-access-token, x-profile-role-hint',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

let firebaseAccessTokenCache: { token: string; expiresAt: number } | null = null;

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

function shouldAutoPaginateSupabaseGet(
  path: string,
  method: string,
  headers?: Record<string, string>,
) {
  if (String(method || 'GET').toUpperCase() !== 'GET') return false;
  if (!String(path || '').startsWith('/rest/v1/')) return false;

  const normalizedHeaders = Object.fromEntries(
    Object.entries(headers || {}).map(([key, value]) => [key.toLowerCase(), value]),
  );
  if (normalizedHeaders.range || normalizedHeaders['range-unit']) return false;

  const queryString = String(path || '').split('?')[1] || '';
  const params = new URLSearchParams(queryString);
  return !params.has('limit') && !params.has('offset');
}

async function fetchSupabaseUser(request: Request, env: Env) {
  const token = getUserToken(request);
  if (!token) {
    return null;
  }

  return fetchSupabaseUserByToken(token, env);
}

async function fetchSupabaseUserByToken(token: string, env: Env) {
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

async function authenticateWithSupabasePassword(email: string, password: string, env: Env) {
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
  return { authResponse, authPayload };
}

async function supabaseAdminRequest(
  env: Env,
  path: string,
  { method = 'GET', body, headers }: { method?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const { supabaseUrl, serviceRoleKey } = getSupabaseConfig(env);
  const baseHeaders = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    ...(headers || {}),
  };

  const executeRequest = async (requestHeaders?: Record<string, string>) => {
    const response = await fetch(`${supabaseUrl}${path}`, {
      method,
      headers: requestHeaders || baseHeaders,
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
  };

  const payload = await executeRequest();
  if (!shouldAutoPaginateSupabaseGet(path, method, headers) || !Array.isArray(payload) || payload.length < 1000) {
    return payload;
  }

  const pageSize = 1000;
  const allRows = [...payload];
  let start = pageSize;

  // PostgREST applies a default row cap, so we continue fetching in explicit ranges.
    while (true) {
      const page = await executeRequest({
        ...baseHeaders,
        'Range-Unit': 'items',
        Range: `${start}-${start + pageSize - 1}`,
      });

    if (!Array.isArray(page) || page.length === 0) break;
    allRows.push(...page);
    if (page.length < pageSize) break;
    start += pageSize;
  }

  return allRows;
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
  const payload = await supabaseAdminRequest(env, `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
    select: 'id,user_id,escola_id,nome,email,telefone,cpf,turma,matricula,tipo',
    user_id: `eq.${userId}`,
    order: 'updated_at.desc.nullslast,created_at.desc',
    limit: '10',
  }).toString()}`);

  return Array.isArray(payload) ? (payload[0] || null) : null;
}

function normalizeProfileRoleHint(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['aluno', 'professor', 'gestor', 'bibliotecaria', 'super_admin'].includes(normalized)
    ? normalized
    : '';
}

async function getUserProfileForRequest(
  request: Request,
  env: Env,
  {
    preferredTypes = [],
  }: {
    preferredTypes?: string[];
  } = {},
) {
  const caller = await fetchSupabaseUser(request, env);
  if (!caller?.id) {
    throw new Error('Nao autenticado.');
  }

  const params = new URLSearchParams({
    select: 'id,user_id,escola_id,nome,email,telefone,cpf,turma,matricula,tipo',
    user_id: `eq.${caller.id}`,
    order: 'updated_at.desc.nullslast,created_at.desc',
    limit: '10',
  });

  const payload = await supabaseAdminRequest(env, `/rest/v1/usuarios_biblioteca?${params.toString()}`);
  const profiles = Array.isArray(payload) ? payload : [];
  const roleHint = normalizeProfileRoleHint(request.headers.get('x-profile-role-hint'));
  const preferred = [roleHint, ...preferredTypes.map((item) => normalizeProfileRoleHint(item))].filter(Boolean);

  const profile = preferred
    .map((tipo) => profiles.find((item) => String(item?.tipo || '').trim().toLowerCase() === tipo))
    .find(Boolean)
    || profiles[0]
    || null;

  return {
    caller,
    profile,
  };
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

function normalizeBookCategoryKey(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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
  const { caller, profile } = await getUserProfileForRequest(request, env);
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

const ALLOWED_PUSH_CHANNELS = ['comunicados', 'mensagens', 'atividades'] as const;

function normalizePushChannels(value: unknown) {
  const selected = Array.isArray(value) ? value : [];
  const unique = new Set<string>();

  selected.forEach((item) => {
    const channel = String(item || '').trim().toLowerCase();
    if ((ALLOWED_PUSH_CHANNELS as readonly string[]).includes(channel)) {
      unique.add(channel);
    }
  });

  return Array.from(unique);
}

async function upsertPushDeviceToken(
  env: Env,
  {
    callerId,
    profile,
    token,
    provider,
    platform,
    deviceLabel,
    appVersion,
    channels,
  }: {
    callerId: string;
    profile: Record<string, unknown>;
    token: string;
    provider: string;
    platform: string;
    deviceLabel: string | null;
    appVersion: string | null;
    channels: string[];
  },
) {
  await supabaseAdminRequest(env, '/rest/v1/push_device_tokens?on_conflict=token', {
    method: 'POST',
    body: [{
      user_id: callerId,
      profile_id: String(profile?.id || '').trim() || null,
      escola_id: String(profile?.escola_id || '').trim() || null,
      role: String(profile?.tipo || '').trim() || null,
      token,
      provider,
      platform,
      device_label: deviceLabel,
      app_version: appVersion,
      channels,
      active: true,
      last_seen_at: new Date().toISOString(),
    }],
    headers: {
      Prefer: 'return=minimal,resolution=merge-duplicates',
    },
  });
}

function getFirebaseConfig(env: Env) {
  const projectId = String(env.FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = String(env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = String(env.FIREBASE_PRIVATE_KEY || '')
    .replace(/\\n/g, '\n')
    .trim();

  if (!projectId || !clientEmail || !privateKey) {
    return null;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
    tokenUri: 'https://oauth2.googleapis.com/token',
  };
}

function pemToArrayBuffer(pem: string) {
  const normalized = String(pem || '')
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');

  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}

async function signFirebaseJwt(privateKeyPem: string, header: Record<string, unknown>, payload: Record<string, unknown>) {
  const encodedHeader = base64UrlEncode(new TextEncoder().encode(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    cryptoKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function getFirebaseAccessToken(env: Env) {
  const config = getFirebaseConfig(env);
  if (!config) {
    throw new Error('Firebase push nao configurado no Worker.');
  }

  if (firebaseAccessTokenCache && firebaseAccessTokenCache.expiresAt > Date.now() + 60_000) {
    return firebaseAccessTokenCache.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const jwt = await signFirebaseJwt(
    config.privateKey,
    { alg: 'RS256', typ: 'JWT' },
    {
      iss: config.clientEmail,
      sub: config.clientEmail,
      aud: config.tokenUri,
      iat: now,
      exp: now + 3600,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
    },
  );

  const response = await fetch(config.tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }).toString(),
  });

  const payload = await parseResponse(response);
  if (!response.ok) {
    throw new Error(
      (typeof payload === 'string' && payload.trim()) ||
      payload?.error_description ||
      payload?.error ||
      `Falha ao autenticar no Firebase (HTTP ${response.status}).`,
    );
  }

  const token = String(payload?.access_token || '').trim();
  const expiresIn = Math.max(300, Number(payload?.expires_in || 3600));
  if (!token) {
    throw new Error('Firebase nao retornou access token.');
  }

  firebaseAccessTokenCache = {
    token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
  return token;
}

function chunkValues<T>(items: T[], size = 100) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchActivePushRowsByProfileIds(env: Env, profileIds: string[]) {
  const uniqueIds = [...new Set(profileIds.map((item) => String(item || '').trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return [] as Array<Record<string, unknown>>;

  const chunks = chunkValues(uniqueIds, 100);
  const responses = await Promise.all(chunks.map((chunk) => supabaseAdminRequest(
    env,
    `/rest/v1/push_device_tokens?${new URLSearchParams({
      select: 'id,token,channels,profile_id',
      active: 'eq.true',
      profile_id: `in.(${chunk.join(',')})`,
    }).toString()}`,
  )));

  return responses.flatMap((payload) => Array.isArray(payload) ? payload : []);
}

async function fetchSchoolAudienceProfiles(
  env: Env,
  escolaId: string,
  turmaPublico?: string | null,
  excludeProfileId?: string | null,
) {
  const params = new URLSearchParams({
    select: 'id,nome',
    escola_id: `eq.${escolaId}`,
  });
  if (turmaPublico) {
    params.set('turma', `eq.${turmaPublico}`);
  }

  const payload = await supabaseAdminRequest(env, `/rest/v1/usuarios_biblioteca?${params.toString()}`);
  const excludedId = String(excludeProfileId || '').trim();
  const rows = Array.isArray(payload) ? payload : [];
  return rows
    .map((item) => ({
      id: String(item?.id || '').trim(),
      nome: String(item?.nome || '').trim(),
    }))
    .filter((item) => item.id && item.id !== excludedId);
}

async function fetchProfileDisplayName(env: Env, profileId?: string | null) {
  const normalizedId = String(profileId || '').trim();
  if (!normalizedId) return '';

  const [profile] = await supabaseAdminRequest(
    env,
    `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
      select: 'nome',
      id: `eq.${normalizedId}`,
      limit: '1',
    }).toString()}`,
  ) as Array<Record<string, unknown>>;

  return String(profile?.nome || '').trim();
}

async function fetchSchoolDisplayName(env: Env, escolaId?: string | null) {
  const normalizedId = String(escolaId || '').trim();
  if (!normalizedId) return '';

  const [school] = await supabaseAdminRequest(
    env,
    `/rest/v1/escolas?${new URLSearchParams({
      select: 'nome',
      id: `eq.${normalizedId}`,
      limit: '1',
    }).toString()}`,
  ) as Array<Record<string, unknown>>;

  return String(school?.nome || '').trim();
}

function buildComunicadoPushCopy({
  recipientName,
  authorName,
  schoolName,
  turmaPublico,
}: {
  recipientName?: string | null;
  authorName?: string | null;
  schoolName?: string | null;
  turmaPublico?: string | null;
}) {
  const normalizedRecipient = String(recipientName || '').trim();
  const normalizedAuthor = String(authorName || '').trim();
  const normalizedSchool = String(schoolName || '').trim();
  const isTurma = Boolean(String(turmaPublico || '').trim());

  const title = isTurma ? 'Comunicado da sua sala' : 'Comunicado da escola';
  const greeting = normalizedRecipient ? `${normalizedRecipient}, ` : '';
  const sender = normalizedAuthor || (isTurma ? 'Sua escola' : 'A escola');

  if (isTurma) {
    return {
      title,
      body: `${greeting}${sender} enviou um comunicado para a sua sala. Va verificar!`,
    };
  }

  const destination = normalizedSchool || 'a escola';
  return {
    title,
    body: `${greeting}${sender} enviou um comunicado para ${destination}. Va verificar!`,
  };
}

async function markPushTokensInactive(env: Env, tokenIds: string[]) {
  const uniqueIds = [...new Set(tokenIds.map((item) => String(item || '').trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return;

  const chunks = chunkValues(uniqueIds, 100);
  await Promise.all(chunks.map((chunk) => supabaseAdminRequest(
    env,
    `/rest/v1/push_device_tokens?${new URLSearchParams({ id: `in.(${chunk.join(',')})` }).toString()}`,
    {
      method: 'PATCH',
      body: { active: false },
      headers: { Prefer: 'return=minimal' },
    },
  )));
}

async function sendFirebasePushWithAccessToken(
  env: Env,
  accessToken: string,
  rows: Array<Record<string, unknown>>,
  {
    title,
    body,
    channelId,
    path,
    extraData,
  }: {
    title: string;
    body: string;
    channelId: 'comunicados' | 'mensagens' | 'atividades';
    path: string;
    extraData?: Record<string, string>;
  },
) {
  const config = getFirebaseConfig(env);
  if (!config || !accessToken) return;

  const filteredRows = rows.filter((row) => {
    const token = String(row?.token || '').trim();
    const channels = Array.isArray(row?.channels) ? row.channels.map((item) => String(item || '').trim().toLowerCase()) : [];
    return token && (channels.length === 0 || channels.includes(channelId));
  });
  if (filteredRows.length === 0) return;
  const inactiveTokenIds: string[] = [];

  await Promise.all(filteredRows.map(async (row) => {
    const token = String(row?.token || '').trim();
    const rowId = String(row?.id || '').trim();
    if (!token) return;

    const response = await fetch(`https://fcm.googleapis.com/v1/projects/${config.projectId}/messages:send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: {
            title,
            body,
          },
          data: {
            category: channelId,
            channel: channelId,
            path,
            ...(extraData || {}),
          },
          android: {
            priority: 'high',
            notification: {
              channel_id: channelId,
              click_action: 'FCM_PLUGIN_ACTIVITY',
              sound: 'default',
            },
          },
        },
      }),
    });

    if (response.ok) return;

    const payload = await parseResponse(response);
    const errorCode = String(payload?.error?.details?.[0]?.errorCode || payload?.error?.status || '').trim().toUpperCase();
    if (rowId && (errorCode.includes('UNREGISTERED') || errorCode.includes('INVALID_ARGUMENT') || response.status === 404)) {
      inactiveTokenIds.push(rowId);
      return;
    }

    console.error('Falha ao enviar push Firebase:', payload);
  }));

  if (inactiveTokenIds.length > 0) {
    await markPushTokensInactive(env, inactiveTokenIds);
  }
}

async function sendFirebasePushToTokens(
  env: Env,
  rows: Array<Record<string, unknown>>,
  notification: {
    title: string;
    body: string;
    channelId: 'comunicados' | 'mensagens' | 'atividades';
    path: string;
    extraData?: Record<string, string>;
  },
) {
  const config = getFirebaseConfig(env);
  if (!config) return;

  const accessToken = await getFirebaseAccessToken(env);
  await sendFirebasePushWithAccessToken(env, accessToken, rows, notification);
}

async function notifyComunicadoAudience(
  env: Env,
  {
    escolaId,
    autorProfileId,
    turmaPublico,
    titulo,
    conteudo,
  }: {
    escolaId: string;
    autorProfileId?: string | null;
    turmaPublico?: string | null;
    titulo: string;
    conteudo: string;
  },
) {
  const audienceProfiles = await fetchSchoolAudienceProfiles(env, escolaId, turmaPublico, autorProfileId);
  const profileIds = audienceProfiles.map((item) => item.id);
  if (profileIds.length === 0) return;

  const [pushRows, authorName, schoolName] = await Promise.all([
    fetchActivePushRowsByProfileIds(env, profileIds),
    fetchProfileDisplayName(env, autorProfileId),
    fetchSchoolDisplayName(env, escolaId),
  ]);

  if (!Array.isArray(pushRows) || pushRows.length === 0) return;

  const pushRowsByProfileId = new Map<string, Array<Record<string, unknown>>>();
  pushRows.forEach((row) => {
    const profileId = String(row?.profile_id || '').trim();
    if (!profileId) return;
    const current = pushRowsByProfileId.get(profileId) || [];
    current.push(row);
    pushRowsByProfileId.set(profileId, current);
  });

  const config = getFirebaseConfig(env);
  if (!config) return;
  const accessToken = await getFirebaseAccessToken(env);

  await Promise.all(audienceProfiles.map(async (recipient) => {
    const rows = pushRowsByProfileId.get(recipient.id) || [];
    if (rows.length === 0) return;

    const copy = buildComunicadoPushCopy({
      recipientName: recipient.nome,
      authorName,
      schoolName,
      turmaPublico,
    });

    await sendFirebasePushWithAccessToken(env, accessToken, rows, {
      title: copy.title,
      body: copy.body,
      channelId: 'comunicados',
      path: '/comunicados',
      extraData: turmaPublico ? { turma_publico: turmaPublico } : undefined,
    });
  }));
}

async function notifyProfileIds(
  env: Env,
  profileIds: string[],
  notification: {
    title: string;
    body: string;
    channelId: 'comunicados' | 'mensagens' | 'atividades';
    path: string;
    extraData?: Record<string, string>;
  },
) {
  const pushRows = await fetchActivePushRowsByProfileIds(env, profileIds);
  await sendFirebasePushToTokens(env, pushRows, notification);
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

function formatSuperAdminDeviceType(deviceType: string, usedDesktopApproval: boolean) {
  if (usedDesktopApproval) return 'desktop/mobile';
  if (deviceType === 'mobile') return 'mobile';
  return 'desktop';
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

async function listAllAuthUsers(env: Env) {
  const users: Array<Record<string, unknown>> = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const payload = await supabaseAdminAuthRequest(
      env,
      `/users?${new URLSearchParams({
        page: String(page),
        per_page: String(perPage),
      }).toString()}`,
    );

    const pageUsers = Array.isArray(payload?.users) ? payload.users : [];
    users.push(...pageUsers);

    if (pageUsers.length < perPage) break;
    page += 1;
  }

  return users;
}

function uniqueStrings(values: unknown[]) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))];
}

function extractAuthAdminUserId(payload: unknown) {
  const candidates = [
    (payload as Record<string, unknown>)?.id,
    (payload as Record<string, unknown>)?.user && typeof (payload as Record<string, unknown>)?.user === 'object'
      ? ((payload as Record<string, unknown>).user as Record<string, unknown>)?.id
      : null,
  ];

  return candidates
    .map((value) => String(value || '').trim())
    .find((value) => UUID_PATTERN.test(value)) || '';
}

async function buildGhostAccounts(env: Env) {
  const [authUsersPayload, profilesPayload, rolesPayload, schoolsPayload, superAdminAccountsPayload] = await Promise.all([
    listAllAuthUsers(env),
    supabaseAdminRequest(
      env,
      `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
        select: 'id,user_id,escola_id,nome,email,tipo,cpf,matricula,created_at,updated_at',
        order: 'updated_at.desc.nullslast,created_at.desc',
      }).toString()}`,
    ),
    supabaseAdminRequest(
      env,
      `/rest/v1/user_roles?${new URLSearchParams({
        select: 'user_id,role',
      }).toString()}`,
    ),
    supabaseAdminRequest(
      env,
      `/rest/v1/escolas?${new URLSearchParams({
        select: 'id,nome',
        order: 'nome.asc',
        }).toString()}`,
    ),
    supabaseAdminRequest(
      env,
      `/rest/v1/super_admin_accounts?${new URLSearchParams({
        select: 'id,auth_user_id,email,cpf,nome',
      }).toString()}`,
    ),
  ]);

  const authUsers = Array.isArray(authUsersPayload) ? authUsersPayload : [];
  const profiles = Array.isArray(profilesPayload) ? profilesPayload : [];
  const roles = Array.isArray(rolesPayload) ? rolesPayload : [];
  const schools = Array.isArray(schoolsPayload) ? schoolsPayload : [];
  const superAdminAccounts = Array.isArray(superAdminAccountsPayload) ? superAdminAccountsPayload : [];

  const authUserById = new Map<string, Record<string, unknown>>();
  authUsers.forEach((user) => {
    const userId = String(user?.id || '').trim();
    if (userId) authUserById.set(userId, user);
  });

  const profilesByUserId = new Map<string, Array<Record<string, unknown>>>();
  profiles.forEach((profile) => {
    const userId = String(profile?.user_id || '').trim();
    if (!userId) return;
    const bucket = profilesByUserId.get(userId) || [];
    bucket.push(profile);
    profilesByUserId.set(userId, bucket);
  });

  const rolesByUserId = new Map<string, Set<string>>();
  roles.forEach((roleItem) => {
    const userId = String(roleItem?.user_id || '').trim();
    const role = String(roleItem?.role || '').trim();
    if (!userId || !role) return;
    const bucket = rolesByUserId.get(userId) || new Set<string>();
    bucket.add(role);
    rolesByUserId.set(userId, bucket);
  });

  const schoolNameById = new Map<string, string>();
  schools.forEach((school) => {
    const schoolId = String(school?.id || '').trim();
    if (!schoolId) return;
    schoolNameById.set(schoolId, String(school?.nome || '').trim());
  });

  const protectedRoles = new Set(['super_admin']);
  const superAdminByUserId = new Map<string, Record<string, unknown>>();
  const superAdminByEmail = new Map<string, Record<string, unknown>>();
  const superAdminByCpf = new Map<string, Record<string, unknown>>();

  superAdminAccounts.forEach((account) => {
    const authUserId = String(account?.auth_user_id || '').trim();
    const email = normalizeIdentifier(String(account?.email || ''));
    const cpf = normalizeDigits(String(account?.cpf || ''));
    if (authUserId) superAdminByUserId.set(authUserId, account);
    if (email) superAdminByEmail.set(email, account);
    if (cpf) superAdminByCpf.set(cpf, account);
  });

  const resolveAdminAccount = ({
    userId,
    email,
    cpf,
  }: {
    userId?: unknown;
    email?: unknown;
    cpf?: unknown;
  }) => {
    const normalizedUserId = String(userId || '').trim();
    const normalizedEmail = normalizeIdentifier(String(email || ''));
    const normalizedCpf = normalizeDigits(String(cpf || ''));
    return (
      (normalizedUserId ? superAdminByUserId.get(normalizedUserId) : null)
      || (normalizedEmail ? superAdminByEmail.get(normalizedEmail) : null)
      || (normalizedCpf ? superAdminByCpf.get(normalizedCpf) : null)
      || null
    );
  };

  const describeGhostType = (roleList: string[], fallbackType: unknown, adminAccount: Record<string, unknown> | null) => {
    if (adminAccount || roleList.includes('super_admin')) return 'SuperAdmin';
    if (roleList.includes('gestor') || String(fallbackType || '').trim() === 'gestor') return 'Gestor';
    if (roleList.includes('bibliotecaria') || String(fallbackType || '').trim() === 'bibliotecaria') return 'Bibliotecaria';
    if (roleList.includes('professor') || String(fallbackType || '').trim() === 'professor') return 'Professor';
    if (roleList.includes('aluno') || String(fallbackType || '').trim() === 'aluno') return 'Aluno';
    return String(fallbackType || roleList[0] || '').trim() || null;
  };

  const ghostByCanonicalKey = new Map<string, Record<string, unknown>>();
  const queueGhost = (ghost: Record<string, unknown>) => {
    const adminAccountId = String(ghost.admin_account_id || '').trim();
    const normalizedLogin = normalizeIdentifier(String(ghost.login || ''));
    const normalizedCpf = normalizeDigits(String(ghost.cpf || ''));
    const canonicalKey = [
      adminAccountId ? `super-admin:${adminAccountId}` : '',
      ghost.tipo === 'SuperAdmin' && normalizedLogin ? `super-admin-login:${normalizedLogin}` : '',
      ghost.tipo === 'SuperAdmin' && normalizedCpf ? `super-admin-cpf:${normalizedCpf}` : '',
      String(ghost.user_id || '').trim(),
      normalizedLogin,
      normalizedCpf,
      String(ghost.profile_id || '').trim(),
    ].find(Boolean) || String(ghost.ghost_key || '').trim();

    const existing = ghostByCanonicalKey.get(canonicalKey);
    if (!existing) {
      ghostByCanonicalKey.set(canonicalKey, {
        ...ghost,
        issues: Array.isArray(ghost.issues) ? [...new Set(ghost.issues as string[])] : [],
        roles: Array.isArray(ghost.roles) ? [...new Set(ghost.roles as string[])] : [],
      });
      return;
    }

    const mergedIssues = [
      ...(Array.isArray(existing.issues) ? existing.issues as string[] : []),
      ...(Array.isArray(ghost.issues) ? ghost.issues as string[] : []),
    ];
    const mergedRoles = [
      ...(Array.isArray(existing.roles) ? existing.roles as string[] : []),
      ...(Array.isArray(ghost.roles) ? ghost.roles as string[] : []),
    ];
    const existingCreated = String(existing.created_at || '');
    const incomingCreated = String(ghost.created_at || '');
    const keepNewest = incomingCreated.localeCompare(existingCreated) > 0;

    ghostByCanonicalKey.set(canonicalKey, {
      ...existing,
      ...(keepNewest ? ghost : {}),
      ghost_key: String(existing.ghost_key || ghost.ghost_key || '').trim(),
      source: existing.source === ghost.source ? existing.source : 'mixed',
      user_id: existing.user_id || ghost.user_id || null,
      profile_id: existing.profile_id || ghost.profile_id || null,
      nome: existing.nome || ghost.nome || 'Conta sem nome',
      login: existing.login || ghost.login || null,
      cpf: existing.cpf || ghost.cpf || null,
      matricula: existing.matricula || ghost.matricula || null,
      escola_id: existing.escola_id || ghost.escola_id || null,
      escola_nome: existing.escola_nome || ghost.escola_nome || null,
      admin_account_id: existing.admin_account_id || ghost.admin_account_id || null,
      is_admin: existing.is_admin === true || ghost.is_admin === true,
      issues: [...new Set(mergedIssues)],
      roles: [...new Set(mergedRoles)],
      can_delete: existing.can_delete !== false && ghost.can_delete !== false,
      protected_reason: existing.protected_reason || ghost.protected_reason || null,
      created_at: keepNewest ? ghost.created_at : existing.created_at,
    });
  };

  authUsers.forEach((authUser) => {
    const userId = String(authUser?.id || '').trim();
    if (!userId) return;

    const profileList = profilesByUserId.get(userId) || [];
    const roleList = [...(rolesByUserId.get(userId) || new Set<string>())];
    const schoolIds = uniqueStrings(profileList.map((profile) => profile?.escola_id));
    const issues: string[] = [];
    const primaryProfile = profileList[0] || null;
    const adminAccount = resolveAdminAccount({
      userId,
      email: authUser?.email || primaryProfile?.email,
      cpf: primaryProfile?.cpf,
    });
    const normalizedRoles = [...new Set([
      ...roleList,
      ...(adminAccount ? ['super_admin'] : []),
    ])];
    const isProtectedAdmin = Boolean(adminAccount) || normalizedRoles.some((role) => protectedRoles.has(role));

    if (profileList.length === 0) issues.push('Sem perfil em usuarios_biblioteca');
    if (normalizedRoles.length === 0) issues.push('Sem role em user_roles');
    if (profileList.length > 1) issues.push('Multiplos perfis para a mesma conta');
    if (schoolIds.length > 1) issues.push('Vinculada a mais de uma escola');
    if (profileList.some((profile) => !String(profile?.escola_id || '').trim())) issues.push('Perfil sem escola');

    if (issues.length === 0) return;

    const schoolId = String(primaryProfile?.escola_id || schoolIds[0] || '').trim();

    queueGhost({
      ghost_key: `auth:${userId}`,
      source: 'auth',
      user_id: userId,
      profile_id: String(primaryProfile?.id || '').trim() || null,
      nome: String(primaryProfile?.nome || adminAccount?.nome || pickAuthName(authUser) || '').trim() || 'Conta sem nome',
      login: String(authUser?.email || primaryProfile?.email || '').trim() || null,
      tipo: describeGhostType(normalizedRoles, primaryProfile?.tipo, adminAccount),
      cpf: String(primaryProfile?.cpf || '').trim() || null,
      matricula: String(primaryProfile?.matricula || '').trim() || null,
      escola_id: schoolId || null,
      escola_nome: schoolId ? schoolNameById.get(schoolId) || null : null,
      admin_account_id: String(adminAccount?.id || '').trim() || null,
      is_admin: Boolean(adminAccount) || normalizedRoles.includes('super_admin'),
      roles: normalizedRoles,
      can_delete: !isProtectedAdmin,
      protected_reason: isProtectedAdmin ? 'Conta SuperAdmin deve ser removida por um fluxo dedicado.' : null,
      issues,
      created_at: authUser?.created_at || primaryProfile?.created_at || null,
    });
  });

  profiles.forEach((profile) => {
    const profileId = String(profile?.id || '').trim();
    const userId = String(profile?.user_id || '').trim();
    if (!profileId) return;

    const issues: string[] = [];
    const adminAccount = resolveAdminAccount({
      userId,
      email: profile?.email,
      cpf: profile?.cpf,
    });
    const normalizedRoles = [...new Set([
      String(profile?.tipo || '').trim(),
      ...(adminAccount ? ['super_admin'] : []),
      ...(userId ? [...(rolesByUserId.get(userId) || new Set<string>())] : []),
    ].filter(Boolean))];
    const profileType = String(profile?.tipo || '').trim();
    const isProtectedAdmin = Boolean(adminAccount) || normalizedRoles.some((role) => protectedRoles.has(role));

    if (!userId) {
      issues.push('Perfil sem user_id');
    } else if (!authUserById.has(userId)) {
      issues.push('Perfil sem conta no Auth');
    }

    if (!String(profile?.escola_id || '').trim()) {
      issues.push('Perfil sem escola');
    }

    if (issues.length === 0) return;

    queueGhost({
      ghost_key: `profile:${profileId}`,
      source: 'profile',
      user_id: userId || null,
      profile_id: profileId,
      nome: String(profile?.nome || adminAccount?.nome || '').trim() || 'Perfil sem nome',
      login: String(profile?.email || '').trim() || null,
      tipo: describeGhostType(normalizedRoles, profileType, adminAccount),
      cpf: String(profile?.cpf || '').trim() || null,
      matricula: String(profile?.matricula || '').trim() || null,
      escola_id: String(profile?.escola_id || '').trim() || null,
      escola_nome: schoolNameById.get(String(profile?.escola_id || '').trim()) || null,
      admin_account_id: String(adminAccount?.id || '').trim() || null,
      is_admin: Boolean(adminAccount) || normalizedRoles.includes('super_admin'),
      roles: normalizedRoles,
      can_delete: !isProtectedAdmin,
      protected_reason: isProtectedAdmin ? 'Conta SuperAdmin deve ser removida por um fluxo dedicado.' : null,
      issues,
      created_at: profile?.created_at || null,
    });
  });

  const ghosts = Array.from(ghostByCanonicalKey.values());

  ghosts.sort((left, right) => {
    const leftAdmin = left?.is_admin === true ? 1 : 0;
    const rightAdmin = right?.is_admin === true ? 1 : 0;
    if (rightAdmin !== leftAdmin) return rightAdmin - leftAdmin;

    const leftScore = Array.isArray(left?.issues) ? left.issues.length : 0;
    const rightScore = Array.isArray(right?.issues) ? right.issues.length : 0;
    if (rightScore !== leftScore) return rightScore - leftScore;

    const leftCreated = String(left?.created_at || '');
    const rightCreated = String(right?.created_at || '');
    return rightCreated.localeCompare(leftCreated);
  });

  return ghosts;
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

async function registerSuperAdminFailedAttemptInternal(
  request: Request,
  env: Env,
  identifier: string,
  path: string,
  extraContext?: Record<string, unknown> | null,
) {
  const match = await resolveSuperAdminMatch(identifier, env);

  if (!match?.matched || !match?.account_id) {
    return { matched: false, blocked: false, attempts: 0, remaining: 0 };
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
      ...(extraContext && typeof extraContext === 'object' ? extraContext : {}),
    },
  });

  return {
    matched: true,
    blocked,
    attempts,
    remaining: Math.max(0, 4 - attempts),
  };
}

async function getSuperAdminAccountById(accountId: string, env: Env) {
  const payload = await supabaseAdminRequest(
    env,
    `/rest/v1/super_admin_accounts?${new URLSearchParams({
      select: 'id,nome,email,ativo,bloqueado,passkey_required,passkey_enrolled_at,ultimo_dispositivo,ultimo_mfa_em,ultimo_email_verificado_em,created_at',
      id: `eq.${accountId}`,
      limit: '1',
    }).toString()}`,
  );

  return Array.isArray(payload) ? (payload[0] || null) : null;
}

async function getSuperAdminAccountByAuthUserId(userId: string, env: Env) {
  const payload = await supabaseAdminRequest(
    env,
    `/rest/v1/super_admin_accounts?${new URLSearchParams({
      select: 'id,nome,email,ativo,bloqueado,passkey_required,passkey_enrolled_at,ultimo_dispositivo,ultimo_mfa_em,ultimo_email_verificado_em,created_at',
      auth_user_id: `eq.${userId}`,
      limit: '1',
    }).toString()}`,
  );

  return Array.isArray(payload) ? (payload[0] || null) : null;
}

async function fetchSuperAdminSecurityProfileByToken(
  request: Request,
  token: string,
  env: Env,
  context: Record<string, unknown> | null = null,
) {
  const user = await fetchSupabaseUserByToken(token, env);
  if (!user?.id) {
    throw new Error('Nao autenticado.');
  }

  const account =
    await getSuperAdminAccountByAuthUserId(user.id, env) ||
    await resolveSuperAdminMatch(user.email || '', env).then((match) => (match?.account_id ? getSuperAdminAccountById(match.account_id, env) : null));

  if (!account?.id) {
    throw new Error('Conta de Super Admin nao encontrada.');
  }

  const passkeys = await listActivePasskeys(String(account.id), env);
  const risk = buildRiskContext(request, context);

  return {
    account: {
      id: account.id,
      nome: account.nome || null,
      email: account.email || user.email || null,
      passkey_required: account.passkey_required !== false,
      passkey_enrolled_at: account.passkey_enrolled_at || null,
    },
    passkeysCount: passkeys.length,
    needsPasskeyEnrollment: passkeys.length === 0,
    requiresEmailVerification: false,
    deviceType: risk.deviceType,
    risk,
  };
}

async function listActivePasskeys(accountId: string, env: Env) {
  const payload = await supabaseAdminRequest(
    env,
    `/rest/v1/super_admin_passkeys?${new URLSearchParams({
      select: 'id,credential_id,credential_public_key_jwk,counter,transports,device_label,created_at,last_used_at,revoked_at',
      account_id: `eq.${accountId}`,
      revoked_at: 'is.null',
      order: 'created_at.asc',
    }).toString()}`,
  );

  return Array.isArray(payload) ? payload : [];
}

async function getActivePasskeyByCredential(accountId: string, credentialId: string, env: Env) {
  const payload = await supabaseAdminRequest(
    env,
    `/rest/v1/super_admin_passkeys?${new URLSearchParams({
      select: 'id,credential_id,credential_public_key_jwk,counter,transports,device_label,created_at,last_used_at,revoked_at',
      account_id: `eq.${accountId}`,
      credential_id: `eq.${credentialId}`,
      revoked_at: 'is.null',
      limit: '1',
    }).toString()}`,
  );

  return Array.isArray(payload) ? (payload[0] || null) : null;
}

async function createSuperAdminChallenge(
  env: Env,
  payload: Record<string, unknown>,
) {
  const created = await supabaseAdminRequest(env, '/rest/v1/super_admin_access_challenges', {
    method: 'POST',
    body: payload,
    headers: {
      Prefer: 'return=representation',
    },
  });

  return Array.isArray(created) ? (created[0] || null) : created;
}

async function getSuperAdminChallengeByToken(token: string, env: Env) {
  const tokenHash = await sha256Base64Url(token);
  const payload = await supabaseAdminRequest(
    env,
    `/rest/v1/super_admin_access_challenges?${new URLSearchParams({
      select: 'id,account_id,kind,challenge_hash,token_hash,device_type,origin_ip,user_agent,requires_email_verification,email_code_hash,email_code_expires_at,email_verified_at,approved_at,approved_by_account_id,consumed_at,expires_at,metadata,created_at',
      token_hash: `eq.${tokenHash}`,
      limit: '1',
    }).toString()}`,
  );

  return Array.isArray(payload) ? (payload[0] || null) : null;
}

async function getSuperAdminChallengeByHash(accountId: string, kind: string, challengeHash: string, env: Env) {
  const payload = await supabaseAdminRequest(
    env,
    `/rest/v1/super_admin_access_challenges?${new URLSearchParams({
      select: 'id,account_id,kind,challenge_hash,token_hash,device_type,origin_ip,user_agent,requires_email_verification,email_code_hash,email_code_expires_at,email_verified_at,approved_at,approved_by_account_id,consumed_at,expires_at,metadata,created_at',
      account_id: `eq.${accountId}`,
      kind: `eq.${kind}`,
      challenge_hash: `eq.${challengeHash}`,
      order: 'created_at.desc',
      limit: '1',
    }).toString()}`,
  );

  return Array.isArray(payload) ? (payload[0] || null) : null;
}

async function getSuperAdminChallengeById(challengeId: string, env: Env) {
  const payload = await supabaseAdminRequest(
    env,
    `/rest/v1/super_admin_access_challenges?${new URLSearchParams({
      select: 'id,account_id,kind,challenge_hash,token_hash,device_type,origin_ip,user_agent,requires_email_verification,email_code_hash,email_code_expires_at,email_verified_at,approved_at,approved_by_account_id,consumed_at,expires_at,metadata,created_at',
      id: `eq.${challengeId}`,
      limit: '1',
    }).toString()}`,
  );

  return Array.isArray(payload) ? (payload[0] || null) : null;
}

async function patchSuperAdminChallenge(challengeId: string, env: Env, body: Record<string, unknown>) {
  await supabaseAdminRequest(
    env,
    `/rest/v1/super_admin_access_challenges?${new URLSearchParams({ id: `eq.${challengeId}` }).toString()}`,
    {
      method: 'PATCH',
      body,
      headers: {
        Prefer: 'return=minimal',
      },
    },
  );
}

function isChallengeExpired(challenge: Record<string, unknown> | null | undefined) {
  const expiresAt = String(challenge?.expires_at || '').trim();
  return !expiresAt || Number.isNaN(Date.parse(expiresAt)) || new Date(expiresAt).getTime() <= Date.now();
}

function isPendingChallenge(challenge: Record<string, unknown> | null | undefined) {
  return Boolean(
    challenge?.id &&
    !challenge?.consumed_at &&
    !isChallengeExpired(challenge),
  );
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

function isMissingTableMessage(error: unknown) {
  const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
  return (
    message.includes('could not find the table') ||
    message.includes('does not exist') ||
    message.includes('42p01') ||
    message.includes('pgrst205')
  );
}

async function releasePublicInviteReservation(env: Env, tokenId: string) {
  if (!tokenId) return;
  await supabaseAdminRequest(env, `/rest/v1/tokens_convite?${new URLSearchParams({ id: `eq.${tokenId}` }).toString()}`, {
    method: 'PATCH',
    body: { ativo: true },
    headers: { Prefer: 'return=minimal' },
  }).catch(() => null);
}

async function fetchPublicInviteTokenContext(token: string, env: Env) {
  const normalizedToken = String(token || '').trim().toLowerCase();
  if (!normalizedToken) return null;

  const payload = await supabaseAdminRequest(
    env,
    `/rest/v1/tokens_convite?${new URLSearchParams({
      select: 'id,role_destino,escola_id,expira_em',
      token: `eq.${normalizedToken}`,
      ativo: 'eq.true',
      usado_por: 'is.null',
      expira_em: `gt.${new Date().toISOString()}`,
      limit: '1',
    }).toString()}`,
  );

  return Array.isArray(payload) ? (payload[0] || null) : null;
}

async function fetchTenantAdminInviteContext(token: string, env: Env) {
  const normalizedToken = String(token || '').trim().toLowerCase();
  if (!normalizedToken) return null;

  const payload = await supabaseAdminRequest(
    env,
    `/rest/v1/tenant_admin_invites?${new URLSearchParams({
      select: 'id,tenant_id,escola_id,cpf,email,expira_em,usado_em',
      token: `eq.${normalizedToken}`,
      usado_em: 'is.null',
      expira_em: `gt.${new Date().toISOString()}`,
      limit: '1',
    }).toString()}`,
  );

  const invite = Array.isArray(payload) ? (payload[0] || null) : null;
  if (!invite?.id) return null;

  const [escola, tenant] = await Promise.all([
    supabaseAdminRequest(env, `/rest/v1/escolas?${new URLSearchParams({
      select: 'id,nome',
      id: `eq.${invite.escola_id}`,
      limit: '1',
    }).toString()}`).then((rows) => Array.isArray(rows) ? (rows[0] || null) : null).catch(() => null),
    supabaseAdminRequest(env, `/rest/v1/tenants?${new URLSearchParams({
      select: 'id,subdominio',
      id: `eq.${invite.tenant_id}`,
      limit: '1',
    }).toString()}`).then((rows) => Array.isArray(rows) ? (rows[0] || null) : null).catch(() => null),
  ]);

  return {
    ...invite,
    escola_nome: escola?.nome || null,
    subdominio: tenant?.subdominio || null,
  };
}

async function getArquivosAulaModuleContext(request: Request, env: Env) {
  const { caller, profile } = await getUserProfileForRequest(request, env, { preferredTypes: ['professor'] });
  if (!profile?.id) throw new Error('Perfil nao encontrado.');

  const tipo = String(profile.tipo || '').trim().toLowerCase();
  const escolaId = String(profile.escola_id || '').trim();
  const perfilId = String(profile.id || '').trim();

  const professorTurmas = tipo === 'professor' && perfilId
    ? await supabaseAdminRequest(env, `/rest/v1/professor_turmas?${new URLSearchParams({
      select: 'turma',
      professor_id: `eq.${perfilId}`,
    }).toString()}`).catch(() => [])
    : [];

  let professoresPermitidos: Array<{ id: string; nome: string }> = [];
  if (tipo !== 'professor' && escolaId && profile.turma) {
    const turmasRows = await supabaseAdminRequest(env, `/rest/v1/professor_turmas?${new URLSearchParams({
      select: 'professor_id',
      escola_id: `eq.${escolaId}`,
      turma: `eq.${String(profile.turma).trim()}`,
    }).toString()}`).catch(() => []);

    const professorIds = [...new Set((Array.isArray(turmasRows) ? turmasRows : []).map((item) => String(item?.professor_id || '').trim()).filter(Boolean))];
    if (professorIds.length > 0) {
      const professoresRows = await supabaseAdminRequest(env, `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
        select: 'id,nome',
        id: `in.(${professorIds.join(',')})`,
      }).toString()}`).catch(() => []);

      professoresPermitidos = Array.isArray(professoresRows) ? professoresRows : [];
    }
  }

  return {
    caller,
    profile,
    tipo,
    escolaId: escolaId || null,
    perfilId: perfilId || null,
    professorTurmas: [...new Set((Array.isArray(professorTurmas) ? professorTurmas : []).map((item) => String(item?.turma || '').trim()).filter(Boolean))].sort(),
    professoresPermitidos: [...new Set(professoresPermitidos.map((item) => String(item?.nome || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
  };
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

function ensureArray<T = unknown>(value: unknown) {
  return Array.isArray(value) ? (value as T[]) : [];
}

async function getProfessorModuleData(request: Request, env: Env) {
  const caller = await fetchSupabaseUser(request, env);
  if (!caller?.id) {
    throw new Error('Nao autenticado.');
  }
  const userId = String(caller.id || '').trim();

  const professorProfiles = await supabaseAdminRequest(
    env,
    `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
      select: 'id,escola_id,nome,email,tipo,turma',
      user_id: `eq.${userId}`,
      tipo: 'eq.professor',
      order: 'updated_at.desc.nullslast,created_at.desc',
      limit: '10',
    }).toString()}`,
  );

  const profiles = ensureArray<Record<string, unknown>>(professorProfiles);
  const professorData = profiles[0] || null;
  const professorProfileIds = profiles.map((item) => String(item?.id || '').trim()).filter(Boolean);
  const escolaId = String(professorData?.escola_id || '').trim();

  if (!professorData || !professorProfileIds.length || !escolaId) {
    throw new Error('Perfil de professor nao encontrado.');
  }

  let turmasRows: Array<Record<string, unknown>> = [];
  try {
    const payload = await supabaseAdminRequest(
      env,
      `/rest/v1/professor_turmas?${new URLSearchParams({
        select: 'turma',
        professor_id: `in.(${professorProfileIds.join(',')})`,
      }).toString()}`,
    );
    turmasRows = ensureArray<Record<string, unknown>>(payload);
  } catch (error) {
    if (isMissingTableMessage(error)) {
      throw new Error('Tabela professor_turmas nao encontrada. Aplique as migrations do banco.');
    }
    throw error;
  }

  const turmasPermitidas = [...new Set(turmasRows.map((item) => String(item?.turma || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const [livrosEscolaPayload, livrosLegacyPayload, usuariosPayload, sugestoesPayload, atividadesPayload] = await Promise.all([
    supabaseAdminRequest(
      env,
      `/rest/v1/livros?${new URLSearchParams({
        select: 'id,titulo,autor,area,escola_id',
        escola_id: `eq.${escolaId}`,
        order: 'titulo.asc',
      }).toString()}`,
    ),
    supabaseAdminRequest(
      env,
      `/rest/v1/livros?${new URLSearchParams({
        select: 'id,titulo,autor,area,escola_id',
        escola_id: 'is.null',
        order: 'titulo.asc',
      }).toString()}`,
    ),
    supabaseAdminRequest(
      env,
      `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
        select: 'id,nome,turma,email,matricula,escola_id,tipo',
        tipo: 'eq.aluno',
        escola_id: `eq.${escolaId}`,
        order: 'nome.asc',
      }).toString()}`,
    ),
    supabaseAdminRequest(
      env,
      `/rest/v1/sugestoes_livros?${new URLSearchParams({
        select: '*',
        professor_id: `in.(${professorProfileIds.join(',')})`,
        order: 'created_at.desc',
      }).toString()}`,
    ),
    supabaseAdminRequest(
      env,
      `/rest/v1/atividades_leitura?${new URLSearchParams({
        select: '*',
        professor_id: `in.(${professorProfileIds.join(',')})`,
        order: 'created_at.desc',
      }).toString()}`,
    ),
  ]);

  const livrosById = new Map<string, Record<string, unknown>>();
  [...ensureArray<Record<string, unknown>>(livrosEscolaPayload), ...ensureArray<Record<string, unknown>>(livrosLegacyPayload)].forEach((livro) => {
    const livroId = String(livro?.id || '').trim();
    if (!livroId) return;
    livrosById.set(livroId, livro);
  });

  const livros = Array.from(livrosById.values()).sort((a, b) => String(a?.titulo || '').localeCompare(String(b?.titulo || ''), 'pt-BR'));
  const usuariosEscola = ensureArray<Record<string, unknown>>(usuariosPayload)
    .sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR'));
  const usuariosEscolaById = new Map(usuariosEscola.map((item) => [String(item?.id || '').trim(), item]));

  const sugestoesRaw = ensureArray<Record<string, unknown>>(sugestoesPayload)
    .map((item) => ({
      ...item,
      livros: livrosById.get(String(item?.livro_id || '').trim()) || null,
      usuarios_biblioteca: usuariosEscolaById.get(String(item?.aluno_id || '').trim()) || null,
    }));

  const atividadesRaw = ensureArray<Record<string, unknown>>(atividadesPayload)
    .map((item) => ({
      ...item,
      livros: livrosById.get(String(item?.livro_id || '').trim()) || null,
      usuarios_biblioteca: usuariosEscolaById.get(String(item?.aluno_id || '').trim()) || null,
    }));

  const atividadeIds = atividadesRaw.map((item) => String(item?.id || '').trim()).filter(Boolean);
  const atividadesById = new Map(atividadesRaw.map((item) => [String(item?.id || '').trim(), item]));

  let submissionFeaturesEnabled = true;
  let entregasRaw: Array<Record<string, unknown>> = [];

  if (atividadeIds.length > 0) {
    try {
      const entregasPayload = await supabaseAdminRequest(
        env,
        `/rest/v1/atividades_entregas?${new URLSearchParams({
          select: '*',
          atividade_id: `in.(${atividadeIds.join(',')})`,
          order: 'updated_at.desc',
        }).toString()}`,
      );

      entregasRaw = ensureArray<Record<string, unknown>>(entregasPayload)
        .map((item) => ({
          ...item,
          atividades_leitura: atividadesById.get(String(item?.atividade_id || '').trim()) || null,
          usuarios_biblioteca: usuariosEscolaById.get(String(item?.aluno_id || '').trim()) || null,
        }));
    } catch (error) {
      if (isMissingTableMessage(error)) {
        submissionFeaturesEnabled = false;
      } else {
        throw error;
      }
    }
  }

  const turmaNames = new Set<string>(turmasPermitidas);
  const addTurmaName = (value: unknown) => {
    const turma = String(value || '').trim();
    if (turma) turmaNames.add(turma);
  };

  addTurmaName(professorData?.turma);
  sugestoesRaw.forEach((item) => addTurmaName(item?.usuarios_biblioteca?.turma));
  atividadesRaw.forEach((item) => addTurmaName(item?.usuarios_biblioteca?.turma));
  entregasRaw.forEach((item) => addTurmaName(item?.usuarios_biblioteca?.turma));

  const turmasVisiveis = [...turmaNames].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  const turmaSet = new Set(turmasVisiveis.map(normalizeTurmaKey).filter(Boolean));

  const userIdsPermitidos = new Set<string>();
  const addAllowedUserId = (value: unknown) => {
    const userId = String(value || '').trim();
    if (userId) userIdsPermitidos.add(userId);
  };

  sugestoesRaw.forEach((item) => addAllowedUserId(item?.aluno_id));
  atividadesRaw.forEach((item) => addAllowedUserId(item?.aluno_id));
  entregasRaw.forEach((item) => addAllowedUserId(item?.aluno_id));

  const isAlunoPermitido = (item: Record<string, unknown> | null | undefined) => {
    const userId = String(item?.id || '').trim();
    if (userId && userIdsPermitidos.has(userId)) return true;
    const turmaNormalizada = normalizeTurmaKey(item?.turma);
    if (!turmaNormalizada) return userIdsPermitidos.size > 0 && userIdsPermitidos.has(userId);
    return turmaSet.has(turmaNormalizada);
  };

  const usuarios = usuariosEscola.filter((item) => isAlunoPermitido(item));
  const usuariosById = new Map(usuarios.map((item) => [String(item?.id || '').trim(), item]));
  const isRegistroPermitido = (item: Record<string, unknown> | null | undefined) => {
    const alunoId = String(item?.aluno_id || item?.usuarios_biblioteca?.id || '').trim();
    if (alunoId && usuariosById.has(alunoId)) return true;
    const turmaNormalizada = normalizeTurmaKey(item?.usuarios_biblioteca?.turma);
    if (!turmaNormalizada) return false;
    return turmaSet.has(turmaNormalizada);
  };

  const sugestoes = sugestoesRaw
    .map((item) => ({
      ...item,
      usuarios_biblioteca: usuariosById.get(String(item?.aluno_id || '').trim()) || item?.usuarios_biblioteca || null,
    }))
    .filter((item) => isRegistroPermitido(item));

  const atividades = atividadesRaw
    .map((item) => ({
      ...item,
      usuarios_biblioteca: usuariosById.get(String(item?.aluno_id || '').trim()) || item?.usuarios_biblioteca || null,
    }))
    .filter((item) => isRegistroPermitido(item));

  const entregas = entregasRaw
    .map((item) => ({
      ...item,
      atividades_leitura: atividadesById.get(String(item?.atividade_id || '').trim()) || item?.atividades_leitura || null,
      usuarios_biblioteca: usuariosById.get(String(item?.aluno_id || '').trim()) || item?.usuarios_biblioteca || null,
    }))
    .filter((item) => isRegistroPermitido(item));

  const usuarioIds = usuarios.map((item) => String(item?.id || '').trim()).filter(Boolean);

  const emprestimos = usuarioIds.length > 0
    ? ensureArray<Record<string, unknown>>(await supabaseAdminRequest(
      env,
      `/rest/v1/emprestimos?${new URLSearchParams({
        select: 'id,usuario_id,livro_id,data_emprestimo,data_devolucao_real,status',
        usuario_id: `in.(${usuarioIds.join(',')})`,
        order: 'data_emprestimo.desc',
      }).toString()}`,
    )).map((item) => ({
      ...item,
      livros: livrosById.get(String(item?.livro_id || '').trim()) || null,
      usuarios_biblioteca: usuariosById.get(String(item?.usuario_id || '').trim()) || null,
    }))
    : [];

  return {
    caller,
    escolaId,
    professorProfileIds,
    turmasPermitidas: turmasVisiveis,
    livros,
    usuarios,
    sugestoes,
    atividades,
    entregas,
    emprestimos,
    submissionFeaturesEnabled,
  };
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
        arquivos_aula: 'write_ready',
        convites_publicos: 'write_ready',
        professor: 'write_ready',
        media: 'write_ready',
      },
    }),
  'POST /v1/system-logs': async (request, env) => {
    const body = await request.json().catch(() => ({}));
    await insertSystemLog(request, env, {
      user_id: String(body?.user_id || '').trim() || undefined,
      level: String(body?.level || 'info'),
      event: String(body?.event || 'system_event'),
      message: body?.message ? String(body.message) : null,
      path: body?.path ? String(body.path) : undefined,
      context: body?.context && typeof body.context === 'object' ? body.context : null,
      input: body?.input ?? null,
      output: body?.output ?? null,
      escola_id: body?.escolaId ? String(body.escolaId) : null,
    });
    return jsonResponse({ success: true });
  },
  'POST /v1/media/r2-storage': async (request, env) => {
    try {
      const body = await request.json().catch(() => ({}));
      const payload = await callSupabaseFunction(request, env, 'r2-storage', body);
      return jsonResponse(payload);
    } catch (error) {
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Falha ao acessar o R2.' }, 400);
    }
  },
  'POST /v1/livros/processar-arquivo': async (request, env) => {
    try {
      const body = await request.json().catch(() => ({}));
      const payload = await callSupabaseFunction(request, env, 'processar-arquivo', body);
      return jsonResponse(payload);
    } catch (error) {
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Falha ao processar arquivo.' }, 400);
    }
  },
  'GET /v1/public/tenant': async (request, env) => {
    const url = new URL(request.url);
    const subdomain = String(url.searchParams.get('subdomain') || '').trim().toLowerCase();
    if (!subdomain) return jsonResponse({ success: true, tenant: null });
    try {
      const payload = await supabaseAdminRequest(
        env,
        `/rest/v1/tenants?${new URLSearchParams({
          select: 'nome,subdominio,plano,ativo',
          subdominio: `eq.${subdomain}`,
          ativo: 'eq.true',
          limit: '1',
        }).toString()}`,
      );
      return jsonResponse({ success: true, tenant: ensureArray(payload)[0] || null });
    } catch (error) {
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Falha ao resolver tenant.' }, 400);
    }
  },
  'GET /v1/relatorios': async (request, env) => {
    try {
      const { profile, canManageLoans } = await getLoanModuleContext(request, env);
      if (!canManageLoans) {
        return jsonResponse({ success: false, error: 'Sem permissao para acessar relatorios.' }, 403);
      }

      const [livros, usuarios, emprestimos] = await Promise.all([
        supabaseAdminRequest(
          env,
          `/rest/v1/livros?${new URLSearchParams({
            select: 'id,titulo,autor,disponivel,escola_id',
            escola_id: `eq.${profile.escola_id}`,
            order: 'titulo.asc',
            limit: '5000',
          }).toString()}`,
        ),
        supabaseAdminRequest(
          env,
          `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
            select: 'id,nome,email,turma,tipo,escola_id',
            escola_id: `eq.${profile.escola_id}`,
            order: 'nome.asc',
            limit: '5000',
          }).toString()}`,
        ),
        supabaseAdminRequest(
          env,
          `/rest/v1/emprestimos?${new URLSearchParams({
            select: 'id,livro_id,usuario_id,data_emprestimo,data_devolucao_prevista,data_devolucao_real,status,created_at,livros(id,titulo,autor,escola_id),usuarios_biblioteca(id,nome,email,turma,tipo,escola_id)',
            order: 'data_emprestimo.desc',
            limit: '5000',
          }).toString()}`,
        ),
      ]);

      const sameSchool = (candidateEscolaId: unknown) => String(candidateEscolaId || '') === String(profile.escola_id || '');
      const livrosArray = ensureArray<Record<string, unknown>>(livros);
      const usuariosArray = ensureArray<Record<string, unknown>>(usuarios);
      const emprestimosArray = ensureArray<Record<string, unknown>>(emprestimos).filter(
        (item) => sameSchool(item?.livros?.escola_id) || sameSchool(item?.usuarios_biblioteca?.escola_id),
      );

      const livrosDisponiveisArray = livrosArray.filter((item) => Boolean(item?.disponivel));
      const livroTituloById = new Map(livrosArray.map((item) => [String(item?.id || '').trim(), String(item?.titulo || 'Desconhecido')]));
      const livroCount: Record<string, { titulo: string; count: number }> = {};
      const now = new Date();
      const currentMonth = now.getMonth();
      const currentYear = now.getFullYear();
      const previousMonthDate = new Date(currentYear, currentMonth - 1, 1);
      const previousMonth = previousMonthDate.getMonth();
      const previousYear = previousMonthDate.getFullYear();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

      let emprestimosMesAtual = 0;
      let emprestimosMesAnterior = 0;
      let atrasadosAtuais = 0;
      const monthlyMap = new Map<string, { mes: string; emprestimos: number; devolucoes: number; sortKey: string }>();

      emprestimosArray.forEach((emp) => {
        const livroId = String(emp?.livro_id || '').trim();
        const titulo = livroTituloById.get(livroId) || 'Desconhecido';
        if (!livroCount[livroId]) livroCount[livroId] = { titulo, count: 0 };
        livroCount[livroId].count += 1;

        const emprestimoDate = new Date(String(emp?.data_emprestimo || emp?.created_at || ''));
        if (!Number.isNaN(emprestimoDate.getTime())) {
          const month = emprestimoDate.getMonth();
          const year = emprestimoDate.getFullYear();
          if (month === currentMonth && year === currentYear) emprestimosMesAtual += 1;
          if (month === previousMonth && year === previousYear) emprestimosMesAnterior += 1;

          const key = `${year}-${String(month + 1).padStart(2, '0')}`;
          const current = monthlyMap.get(key) || {
            mes: emprestimoDate.toLocaleDateString('pt-BR', { month: 'short' }),
            emprestimos: 0,
            devolucoes: 0,
            sortKey: key,
          };
          current.emprestimos += 1;
          monthlyMap.set(key, current);
        }

        const devolucaoRealDate = emp?.data_devolucao_real ? new Date(String(emp.data_devolucao_real)) : null;
        if (devolucaoRealDate && !Number.isNaN(devolucaoRealDate.getTime())) {
          const key = `${devolucaoRealDate.getFullYear()}-${String(devolucaoRealDate.getMonth() + 1).padStart(2, '0')}`;
          const current = monthlyMap.get(key) || {
            mes: devolucaoRealDate.toLocaleDateString('pt-BR', { month: 'short' }),
            emprestimos: 0,
            devolucoes: 0,
            sortKey: key,
          };
          current.devolucoes += 1;
          monthlyMap.set(key, current);
        }

        const dueDate = emp?.data_devolucao_prevista ? new Date(String(emp.data_devolucao_prevista)) : null;
        const status = String(emp?.status || '').trim().toLowerCase();
        const isReturned = Boolean(emp?.data_devolucao_real) || status === 'devolvido';
        if (dueDate && !Number.isNaN(dueDate.getTime()) && !isReturned && dueDate < todayStart) {
          atrasadosAtuais += 1;
        }
      });

      const livrosMaisEmprestados = Object.values(livroCount)
        .sort((a, b) => b.count - a.count)
        .slice(0, 5)
        .map((item) => ({ titulo: item.titulo, emprestimos: item.count }));

      const emprestimosPorMes = Array.from(monthlyMap.values())
        .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
        .slice(-6)
        .map(({ sortKey: _sortKey, ...item }) => item);

      return jsonResponse({
        success: true,
        escolaId: profile.escola_id,
        stats: {
          totalLivros: livrosArray.length,
          livrosDisponiveis: livrosDisponiveisArray.length,
          totalUsuarios: usuariosArray.length,
          totalEmprestimos: emprestimosArray.length,
          emprestimosMesAtual,
          emprestimosMesAnterior,
          atrasadosAtuais,
        },
        livrosMaisEmprestados,
        emprestimosPorMes,
        emprestimosDetalhados: emprestimosArray,
      });
    } catch (error) {
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Falha ao carregar relatorios.' }, 400);
    }
  },
  'GET /v1/professor/painel': async (request, env) => {
    try {
      const data = await getProfessorModuleData(request, env);
      return jsonResponse({ success: true, ...data });
    } catch (error) {
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Falha ao carregar painel do professor.' }, 400);
    }
  },
  'POST /v1/professor/sugestoes': async (request, env) => {
    try {
      const context = await getProfessorModuleData(request, env);
      const body = await request.json().catch(() => ({}));
      const alunoId = String(body?.aluno_id || '').trim();
      const livroId = String(body?.livro_id || '').trim();
      const mensagem = String(body?.mensagem || '').trim() || null;

      if (!alunoId || !livroId) {
        return jsonResponse({ success: false, error: 'Aluno e livro sao obrigatorios.' }, 400);
      }

      if (!context.usuarios.some((item) => String(item?.id || '').trim() === alunoId)) {
        return jsonResponse({ success: false, error: 'Aluno nao permitido para este professor.' }, 403);
      }

      await supabaseAdminRequest(env, '/rest/v1/sugestoes_livros', {
        method: 'POST',
        body: {
          professor_id: context.professorProfileIds[0],
          aluno_id: alunoId,
          livro_id: livroId,
          mensagem,
        },
        headers: { Prefer: 'return=minimal' },
      });

      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Falha ao salvar sugestao.' }, 400);
    }
  },
  'POST /v1/professor/sugestoes/:id/delete': async (request, env) => {
    try {
      const context = await getProfessorModuleData(request, env);
      const id = getPathParam(request, /^\/v1\/professor\/sugestoes\/([^/]+)\/delete$/i);
      const suggestion = await supabaseAdminRequest(env, `/rest/v1/sugestoes_livros?${new URLSearchParams({ select: 'id,professor_id', id: `eq.${id}`, limit: '1' }).toString()}`);
      const record = ensureArray<Record<string, unknown>>(suggestion)[0] || null;
      if (!record?.id || !context.professorProfileIds.includes(String(record?.professor_id || '').trim())) {
        return jsonResponse({ success: false, error: 'Sugestao nao encontrada.' }, 404);
      }
      const deleted = await supabaseAdminRequest(env, `/rest/v1/sugestoes_livros?${new URLSearchParams({ select: 'id', id: `eq.${id}` }).toString()}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      }) as Array<Record<string, unknown>>;
      if (!Array.isArray(deleted) || !deleted[0]?.id) {
        return jsonResponse({ success: false, error: 'Sugestao nao encontrada para exclusao.' }, 404);
      }
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Falha ao excluir sugestao.' }, 400);
    }
  },
  'POST /v1/professor/atividades': async (request, env) => {
    try {
      const context = await getProfessorModuleData(request, env);
      const body = await request.json().catch(() => ({}));
      const titulo = String(body?.titulo || '').trim();
      const descricao = body?.descricao ? String(body.descricao) : null;
      const alunoId = String(body?.aluno_id || '').trim();
      const livroId = String(body?.livro_id || '').trim();
      const targetMode = String(body?.target_mode || 'aluno').trim();
      const turma = String(body?.turma || '').trim();
      const dataBase = {
        titulo,
        descricao,
        pontos_extras: Number(body?.pontos_extras || 0),
        data_entrega: body?.data_entrega ? String(body.data_entrega) : null,
        livro_id: livroId || null,
        professor_id: context.professorProfileIds[0],
      };

      if (!titulo) {
        return jsonResponse({ success: false, error: 'Titulo obrigatorio.' }, 400);
      }

      if (targetMode === 'turma' || targetMode === 'todas_turmas') {
        const alunosAlvo = targetMode === 'todas_turmas'
          ? context.usuarios
          : context.usuarios.filter((item) => String(item?.turma || '').trim() === turma);
        if (!alunosAlvo.length) {
          return jsonResponse({
            success: false,
            error: targetMode === 'todas_turmas'
              ? 'Nenhum aluno encontrado nas turmas vinculadas ao professor.'
              : 'Nenhum aluno encontrado para a turma selecionada.',
          }, 400);
        }
        await supabaseAdminRequest(env, '/rest/v1/atividades_leitura', {
          method: 'POST',
          body: alunosAlvo.map((item) => ({
            ...dataBase,
            aluno_id: String(item?.id || '').trim(),
          })),
          headers: { Prefer: 'return=minimal' },
        });

        await notifyProfileIds(
          env,
          alunosAlvo.map((item) => String(item?.id || '').trim()),
          {
            title: 'Nova atividade de leitura',
            body: titulo,
            channelId: 'atividades',
            path: '/aluno/atividades',
            extraData: {
              turma: targetMode === 'todas_turmas' ? 'todas' : (turma || ''),
              targetMode,
            },
          },
        ).catch((error) => {
          console.error('Falha ao enviar push de atividade em lote:', error);
        });

        return jsonResponse({
          success: true,
          count: alunosAlvo.length,
          targetMode,
        });
      }

      if (!alunoId) {
        return jsonResponse({ success: false, error: 'Aluno obrigatorio.' }, 400);
      }

      if (!context.usuarios.some((item) => String(item?.id || '').trim() === alunoId)) {
        return jsonResponse({ success: false, error: 'Aluno nao permitido para este professor.' }, 403);
      }

      await supabaseAdminRequest(env, '/rest/v1/atividades_leitura', {
        method: 'POST',
        body: {
          ...dataBase,
          aluno_id: alunoId,
        },
        headers: { Prefer: 'return=minimal' },
      });

      await notifyProfileIds(env, [alunoId], {
        title: 'Nova atividade de leitura',
        body: titulo,
        channelId: 'atividades',
        path: '/aluno/atividades',
      }).catch((error) => {
        console.error('Falha ao enviar push de atividade individual:', error);
      });

      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Falha ao criar atividade.' }, 400);
    }
  },
  'PATCH /v1/professor/atividades/:id': async (request, env) => {
    try {
      const context = await getProfessorModuleData(request, env);
      const id = getPathParam(request, /^\/v1\/professor\/atividades\/([^/]+)$/i);
      const body = await request.json().catch(() => ({}));
      const livroId = String(body?.livro_id || '').trim();
      const record = await supabaseAdminRequest(env, `/rest/v1/atividades_leitura?${new URLSearchParams({ select: 'id,professor_id', id: `eq.${id}`, limit: '1' }).toString()}`);
      const atividade = ensureArray<Record<string, unknown>>(record)[0] || null;
      if (!atividade?.id || !context.professorProfileIds.includes(String(atividade?.professor_id || '').trim())) {
        return jsonResponse({ success: false, error: 'Atividade nao encontrada.' }, 404);
      }
      const alunoId = body?.aluno_id ? String(body.aluno_id).trim() : '';
      if (alunoId && !context.usuarios.some((item) => String(item?.id || '').trim() === alunoId)) {
        return jsonResponse({ success: false, error: 'Aluno nao permitido para este professor.' }, 403);
      }
      await supabaseAdminRequest(env, `/rest/v1/atividades_leitura?${new URLSearchParams({ id: `eq.${id}` }).toString()}`, {
        method: 'PATCH',
        body: {
          titulo: String(body?.titulo || '').trim(),
          descricao: body?.descricao ? String(body.descricao) : null,
          pontos_extras: Number(body?.pontos_extras || 0),
          data_entrega: body?.data_entrega ? String(body.data_entrega) : null,
          livro_id: livroId || null,
          aluno_id: alunoId || null,
        },
        headers: { Prefer: 'return=minimal' },
      });
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Falha ao atualizar atividade.' }, 400);
    }
  },
  'POST /v1/professor/atividades/:id/delete': async (request, env) => {
    try {
      const context = await getProfessorModuleData(request, env);
      const id = getPathParam(request, /^\/v1\/professor\/atividades\/([^/]+)\/delete$/i);
      const record = await supabaseAdminRequest(env, `/rest/v1/atividades_leitura?${new URLSearchParams({ select: 'id,professor_id', id: `eq.${id}`, limit: '1' }).toString()}`);
      const atividade = ensureArray<Record<string, unknown>>(record)[0] || null;
      if (!atividade?.id || !context.professorProfileIds.includes(String(atividade?.professor_id || '').trim())) {
        return jsonResponse({ success: false, error: 'Atividade nao encontrada.' }, 404);
      }
      const deleted = await supabaseAdminRequest(env, `/rest/v1/atividades_leitura?${new URLSearchParams({ select: 'id', id: `eq.${id}` }).toString()}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      }) as Array<Record<string, unknown>>;
      if (!Array.isArray(deleted) || !deleted[0]?.id) {
        return jsonResponse({ success: false, error: 'Atividade nao encontrada para exclusao.' }, 404);
      }
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Falha ao excluir atividade.' }, 400);
    }
  },
  'POST /v1/professor/atividades/:id/status': async (request, env) => {
    try {
      const context = await getProfessorModuleData(request, env);
      const id = getPathParam(request, /^\/v1\/professor\/atividades\/([^/]+)\/status$/i);
      const body = await request.json().catch(() => ({}));
      const record = await supabaseAdminRequest(env, `/rest/v1/atividades_leitura?${new URLSearchParams({ select: 'id,professor_id', id: `eq.${id}`, limit: '1' }).toString()}`);
      const atividade = ensureArray<Record<string, unknown>>(record)[0] || null;
      if (!atividade?.id || !context.professorProfileIds.includes(String(atividade?.professor_id || '').trim())) {
        return jsonResponse({ success: false, error: 'Atividade nao encontrada.' }, 404);
      }
      await supabaseAdminRequest(env, `/rest/v1/atividades_leitura?${new URLSearchParams({ id: `eq.${id}` }).toString()}`, {
        method: 'PATCH',
        body: { status: String(body?.status || 'pendente') },
        headers: { Prefer: 'return=minimal' },
      });
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Falha ao atualizar status da atividade.' }, 400);
    }
  },
  'POST /v1/professor/entregas/:id/avaliar': async (request, env) => {
    try {
      const context = await getProfessorModuleData(request, env);
      const id = getPathParam(request, /^\/v1\/professor\/entregas\/([^/]+)\/avaliar$/i);
      const body = await request.json().catch(() => ({}));
      const entregaPayload = await supabaseAdminRequest(env, `/rest/v1/atividades_entregas?${new URLSearchParams({ select: 'id,atividade_id', id: `eq.${id}`, limit: '1' }).toString()}`);
      const entrega = ensureArray<Record<string, unknown>>(entregaPayload)[0] || null;
      if (!entrega?.id) {
        return jsonResponse({ success: false, error: 'Entrega nao encontrada.' }, 404);
      }
      const atividadePayload = await supabaseAdminRequest(env, `/rest/v1/atividades_leitura?${new URLSearchParams({ select: 'id,professor_id', id: `eq.${String(entrega?.atividade_id || '')}`, limit: '1' }).toString()}`);
      const atividade = ensureArray<Record<string, unknown>>(atividadePayload)[0] || null;
      if (!atividade?.id || !context.professorProfileIds.includes(String(atividade?.professor_id || '').trim())) {
        return jsonResponse({ success: false, error: 'Entrega nao permitida para este professor.' }, 403);
      }
      const status = String(body?.status || 'enviada');
      await supabaseAdminRequest(env, `/rest/v1/atividades_entregas?${new URLSearchParams({ id: `eq.${id}` }).toString()}`, {
        method: 'PATCH',
        body: {
          status,
          pontos_ganhos: Number(body?.pontos_ganhos || 0),
          feedback_professor: body?.feedback_professor ? String(body.feedback_professor) : null,
          avaliado_em: new Date().toISOString(),
        },
        headers: { Prefer: 'return=minimal' },
      });
      await supabaseAdminRequest(env, `/rest/v1/atividades_leitura?${new URLSearchParams({ id: `eq.${String(atividade?.id || '')}` }).toString()}`, {
        method: 'PATCH',
        body: { status: status === 'aprovada' ? 'concluido' : 'em_andamento' },
        headers: { Prefer: 'return=minimal' },
      });
      return jsonResponse({ success: true });
    } catch (error) {
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Falha ao avaliar entrega.' }, 400);
    }
  },

  'POST /v1/auth/login': async (request, env) => {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');

    if (!email || !password) {
      return jsonResponse({ success: false, error: 'Email e senha sao obrigatorios.' }, 400);
    }

    const { authResponse, authPayload } = await authenticateWithSupabasePassword(email, password, env);
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
  'POST /v1/auth/super-admin/begin': async (request, env) => {
    const body = await request.json().catch(() => ({}));
    const identifier = String(body?.identifier || '').trim();
    const password = String(body?.password || '');
    const context = body?.context && typeof body.context === 'object' ? body.context : null;

    if (!identifier || !password) {
      return jsonResponse({ success: false, error: 'Identificador e senha sao obrigatorios.' }, 400);
    }

    const match = await resolveSuperAdminMatch(identifier, env);
    if (!match?.matched || !match?.email || !match?.account_id) {
      return jsonResponse({ success: false, error: 'Credenciais invalidas.' }, 401);
    }

    const { authResponse, authPayload } = await authenticateWithSupabasePassword(String(match.email), password, env);
    if (!authResponse.ok) {
      const failedAttempt = await registerSuperAdminFailedAttemptInternal(
        request,
        env,
        identifier,
        '/auth',
        context && typeof context === 'object' ? context as Record<string, unknown> : null,
      );

      return jsonResponse(
        {
          success: false,
          error: failedAttempt?.blocked
            ? 'Usuario bloqueado. Fale com seu parceiro ou superior para solicitar a liberacao.'
            : `Senha incorreta para Super Admin. Tentativas restantes: ${failedAttempt?.remaining ?? 0}.`,
          blocked: failedAttempt?.blocked === true,
        },
        failedAttempt?.blocked ? 403 : 401,
      );
    }

    if (match.bloqueado || match.ativo === false) {
      return jsonResponse(
        {
          success: false,
          error: 'Conta de Super Admin bloqueada. Outro Super Admin precisa fazer a liberacao.',
          blocked: true,
        },
        403,
      );
    }

    const pendingAccessToken = authPayload?.access_token;
    if (!pendingAccessToken) {
      return jsonResponse({ success: false, error: 'Sessao temporaria invalida para o Super Admin.' }, 400);
    }

    const profile = await fetchSuperAdminSecurityProfileByToken(request, pendingAccessToken, env, context);
    const resolvedDeviceType = String(profile?.deviceType || detectDeviceType(request)).trim() || 'desktop';

    return jsonResponse({
      success: true,
      matched: true,
      email: String(match.email).trim().toLowerCase(),
      session: authPayload,
      account: profile?.account || null,
      needsPasskeyEnrollment: profile?.needsPasskeyEnrollment === true,
      requiresEmailVerification: profile?.requiresEmailVerification === true,
      deviceType: resolvedDeviceType,
    });
  },
  'POST /v1/auth/signup': async (request, env) => {
    const body = await request.json().catch(() => ({}));
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const nome = String(body?.nome || '').trim();
    const redirectUrl = String(body?.redirectUrl || '').trim() || undefined;

    if (!email || !password) {
      return jsonResponse({ success: false, error: 'Email e senha sao obrigatorios.' }, 400);
    }

    const { supabaseUrl, publishableKey } = getSupabaseConfig(env);
    const signupResponse = await fetch(`${supabaseUrl}/auth/v1/signup`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        options: {
          ...(redirectUrl ? { emailRedirectTo: redirectUrl } : {}),
          data: nome ? { nome } : {},
        },
      }),
    });

    const signupPayload = await parseResponse(signupResponse);
    if (!signupResponse.ok) {
      return jsonResponse(
        {
          success: false,
          error:
            (typeof signupPayload === 'string' && signupPayload.trim()) ||
            signupPayload?.msg ||
            signupPayload?.error_description ||
            signupPayload?.error ||
            'Falha ao criar a conta.',
        },
        signupResponse.status,
      );
    }

    return jsonResponse({
      success: true,
      session: signupPayload,
      user: signupPayload?.user || null,
    });
  },
  'POST /v1/public/convites/context': async (request, env) => {
    const body = await request.json().catch(() => ({}));
    const token = String(body?.token || '').trim();
    const tokenInfo = await fetchPublicInviteTokenContext(token, env);

    if (!tokenInfo?.id) {
      return jsonResponse({ success: false, error: 'Token invalido ou expirado.' }, 404);
    }

    return jsonResponse({ success: true, tokenInfo });
  },
  'POST /v1/public/convites/register': async (request, env) => {
    const body = await request.json().catch(() => ({}));
    const token = String(body?.token || '').trim().toLowerCase();
    const nome = String(body?.nome || '').trim();
    const email = normalizeEmail(body?.email);
    const cpf = normalizeCpf(body?.cpf);
    const senha = String(body?.senha || '');
    const matricula = String(body?.matricula || '').trim();

    if (!token || !nome) {
      return jsonResponse({ success: false, error: 'Dados incompletos.' }, 400);
    }

    const reserved = await supabaseAdminRequest(
      env,
      `/rest/v1/tokens_convite?${new URLSearchParams({
        select: 'id,role_destino,escola_id',
        token: `eq.${token}`,
        ativo: 'eq.true',
        usado_por: 'is.null',
        expira_em: `gt.${new Date().toISOString()}`,
      }).toString()}`,
      {
        method: 'PATCH',
        body: { ativo: false },
        headers: { Prefer: 'return=representation' },
      },
    );
    const tokenInfo = Array.isArray(reserved) ? (reserved[0] || null) : null;
    if (!tokenInfo?.id) {
      return jsonResponse({ success: false, error: 'Token invalido ou expirado.' }, 400);
    }

    const isAluno = String(tokenInfo.role_destino || '') === 'aluno';
    const usesCpfAsLogin = String(tokenInfo.role_destino || '') === 'professor';
    const normalizedMatricula = String(matricula || '').trim();
    const authEmail = isAluno
      ? `${normalizedMatricula.replace(/\s+/g, '')}@temp.bibliotecai.com`
      : usesCpfAsLogin
        ? `${cpf}@temp.bibliotecai.com`
        : email;
    const authPassword = isAluno ? normalizedMatricula : senha;

    if ((usesCpfAsLogin && (!cpf || !isValidCpf(cpf))) || !authEmail || !authPassword || authPassword.length < 6) {
      await releasePublicInviteReservation(env, String(tokenInfo.id));
      return jsonResponse({ success: false, error: 'Dados invalidos para criacao da conta.' }, 400);
    }

    let userId = '';
    const duplicateEmailMarkers = ['already been registered', 'already exists', 'already registered'];
    const existingProfileLookup = isAluno
      ? await supabaseAdminRequest(
          env,
          `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
            select: 'id,user_id,escola_id,tipo,cpf,matricula,email',
            matricula: `eq.${normalizedMatricula}`,
            limit: '1',
          }).toString()}`,
        )
      : usesCpfAsLogin
        ? await supabaseAdminRequest(
            env,
            `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
              select: 'id,user_id,escola_id,tipo,cpf,matricula,email',
              escola_id: `eq.${tokenInfo.escola_id}`,
              tipo: `eq.${tokenInfo.role_destino}`,
              cpf: `eq.${cpf}`,
              limit: '1',
            }).toString()}`,
          )
        : await supabaseAdminRequest(
            env,
            `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
              select: 'id,user_id,escola_id,tipo,cpf,matricula,email',
              escola_id: `eq.${tokenInfo.escola_id}`,
              tipo: `eq.${tokenInfo.role_destino}`,
              email: `eq.${authEmail}`,
              limit: '1',
            }).toString()}`,
          );
    const existingProfile = Array.isArray(existingProfileLookup) ? (existingProfileLookup[0] || null) : null;
    let targetProfile = existingProfile;
    let duplicateProfileIdsToDelete: string[] = [];

    try {
      const authData = await supabaseAdminAuthRequest(env, '/users', {
        method: 'POST',
        body: {
          email: authEmail,
          password: authPassword,
          email_confirm: true,
          user_metadata: { nome },
        },
      });
      userId = extractAuthAdminUserId(authData);
      if (!userId) {
        await releasePublicInviteReservation(env, String(tokenInfo.id));
        return jsonResponse({ success: false, error: 'Falha ao identificar a conta criada no Auth.' }, 500);
      }
    } catch (error) {
      const authErrorMessage = String(error instanceof Error ? error.message : '').toLowerCase();
      if (!duplicateEmailMarkers.some((marker) => authErrorMessage.includes(marker))) {
        await releasePublicInviteReservation(env, String(tokenInfo.id));
        return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Falha ao criar usuario.' }, 400);
      }

      const existingAuthUser = await findAuthUserByEmail(env, authEmail);
      if (!existingAuthUser?.id) {
        await releasePublicInviteReservation(env, String(tokenInfo.id));
        return jsonResponse({ success: false, error: 'Esta conta ja esta cadastrada. Verifique seus dados ou faca login.' }, 409);
      }

      const linkedProfilesPayload = await supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
          select: 'id,user_id,escola_id,tipo,cpf,matricula,email',
          user_id: `eq.${existingAuthUser.id}`,
          limit: '5',
        }).toString()}`,
      ).catch(() => []);
      const linkedProfiles = Array.isArray(linkedProfilesPayload) ? linkedProfilesPayload : [];
      const linkedRolesPayload = await supabaseAdminRequest(
        env,
        `/rest/v1/user_roles?${new URLSearchParams({
          select: 'role',
          user_id: `eq.${existingAuthUser.id}`,
        }).toString()}`,
      ).catch(() => []);
      const linkedRoles = Array.isArray(linkedRolesPayload) ? linkedRolesPayload : [];
      const hasProtectedRole = linkedRoles.some((item) => String(item?.role || '').trim() === 'super_admin');

      if (hasProtectedRole) {
        await releasePublicInviteReservation(env, String(tokenInfo.id));
        return jsonResponse({ success: false, error: 'Esta conta esta protegida e nao pode ser reaproveitada por este convite.' }, 409);
      }

      const reusableLinkedProfiles = linkedProfiles.filter((profile) => {
        const tipo = String(profile?.tipo || '').trim().toLowerCase();
        const escolaId = String(profile?.escola_id || '').trim();
        const profileCpf = normalizeCpf(profile?.cpf);
        const profileMatricula = String(profile?.matricula || '').trim();
        const profileEmail = normalizeIdentifier(profile?.email);

        if (tipo === 'gestor') {
          return false;
        }

        if (isAluno) {
          return profileMatricula === normalizedMatricula;
        }

        if (usesCpfAsLogin) {
          if (escolaId && escolaId !== String(tokenInfo.escola_id || '').trim()) return false;
          if (profileCpf && profileCpf !== cpf) return false;
          return true;
        }

        if (escolaId && escolaId !== String(tokenInfo.escola_id || '').trim()) return false;
        if (profileEmail && profileEmail !== normalizeIdentifier(authEmail)) return false;
        return true;
      });
      const conflictingLinkedProfile = linkedProfiles.find((profile) => !reusableLinkedProfiles.includes(profile));

      if (existingProfile?.user_id && String(existingProfile.user_id) !== String(existingAuthUser.id)) {
        await releasePublicInviteReservation(env, String(tokenInfo.id));
        return jsonResponse({ success: false, error: 'Este cadastro ja esta vinculado a outra conta. Faca login ou solicite suporte.' }, 409);
      }

      if (conflictingLinkedProfile) {
        await releasePublicInviteReservation(env, String(tokenInfo.id));
        return jsonResponse({ success: false, error: 'Esta conta ja esta cadastrada. Verifique seus dados ou faca login.' }, 409);
      }

      await supabaseAdminAuthRequest(env, `/users/${existingAuthUser.id}`, {
        method: 'PUT',
        body: {
          password: authPassword,
          email_confirm: true,
          user_metadata: {
            ...(existingAuthUser.user_metadata && typeof existingAuthUser.user_metadata === 'object' ? existingAuthUser.user_metadata : {}),
            nome,
          },
        },
      });

      const profileToReuse = existingProfile?.id ? existingProfile : (reusableLinkedProfiles[0] || null);
      if (!existingProfile?.id && profileToReuse?.id) {
        targetProfile = profileToReuse;
      }
      duplicateProfileIdsToDelete = reusableLinkedProfiles
        .map((profile) => String(profile?.id || '').trim())
        .filter((id, index, list) => id && id !== String(targetProfile?.id || '').trim() && list.indexOf(id) === index);
      userId = String(existingAuthUser.id);
    }

    try {
      const profilesByUserIdPayload = userId
        ? await supabaseAdminRequest(
          env,
          `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
            select: 'id,user_id,escola_id,tipo,cpf,matricula,email',
            user_id: `eq.${userId}`,
            limit: '5',
          }).toString()}`,
        ).catch(() => [])
        : [];
      const profilesByUserId = Array.isArray(profilesByUserIdPayload) ? profilesByUserIdPayload : [];
      const compatibleProfileByUserId = profilesByUserId.find((profile) => {
        const tipo = String(profile?.tipo || '').trim().toLowerCase();
        const escolaId = String(profile?.escola_id || '').trim();
        const profileCpf = normalizeCpf(profile?.cpf);
        const profileMatricula = String(profile?.matricula || '').trim();
        const profileEmail = normalizeIdentifier(profile?.email);

        if (tipo === 'gestor') return false;

        if (isAluno) {
          return profileMatricula === normalizedMatricula;
        }

        if (usesCpfAsLogin) {
          if (escolaId && escolaId !== String(tokenInfo.escola_id || '').trim()) return false;
          if (profileCpf && profileCpf !== cpf) return false;
          return true;
        }

        if (escolaId && escolaId !== String(tokenInfo.escola_id || '').trim()) return false;
        if (profileEmail && profileEmail !== normalizeIdentifier(authEmail)) return false;
        return true;
      }) || null;
      const conflictingProfileByUserId = profilesByUserId.find((profile) => {
        const profileId = String(profile?.id || '').trim();
        return profileId && profileId !== String(compatibleProfileByUserId?.id || '').trim();
      }) || null;

      if (conflictingProfileByUserId) {
        await releasePublicInviteReservation(env, String(tokenInfo.id));
        return jsonResponse({ success: false, error: 'Esta conta ja esta vinculada a outro perfil. Faca login ou solicite suporte.' }, 409);
      }

      if (!targetProfile?.id && compatibleProfileByUserId?.id) {
        targetProfile = compatibleProfileByUserId;
      }

      if (usesCpfAsLogin) {
        await supabaseAdminRequest(
          env,
          `/rest/v1/user_roles?${new URLSearchParams({
            user_id: `eq.${userId}`,
            role: 'in.(aluno,bibliotecaria)',
          }).toString()}`,
          {
            method: 'DELETE',
            headers: { Prefer: 'return=minimal' },
          },
        ).catch(() => null);
      }

      await supabaseAdminRequest(env, `/rest/v1/user_roles?on_conflict=user_id,role`, {
        method: 'POST',
        body: [{ user_id: userId, role: tokenInfo.role_destino }],
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      });

      const profilePayload: Record<string, unknown> = {
        user_id: userId,
        nome,
        email: authEmail,
        cpf: usesCpfAsLogin ? cpf : null,
        tipo: tokenInfo.role_destino,
        escola_id: tokenInfo.escola_id,
        matricula: isAluno ? normalizedMatricula : null,
      };

      if (targetProfile?.id) {
        await supabaseAdminRequest(env, `/rest/v1/usuarios_biblioteca?${new URLSearchParams({ id: `eq.${targetProfile.id}` }).toString()}`, {
          method: 'PATCH',
          body: profilePayload,
          headers: { Prefer: 'return=minimal' },
        });
      } else {
        await supabaseAdminRequest(env, '/rest/v1/usuarios_biblioteca', {
          method: 'POST',
          body: profilePayload,
          headers: { Prefer: 'return=minimal' },
        });
      }

      if (duplicateProfileIdsToDelete.length > 0) {
        await supabaseAdminRequest(
          env,
          `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
            id: `in.(${duplicateProfileIdsToDelete.join(',')})`,
          }).toString()}`,
          {
            method: 'DELETE',
            headers: { Prefer: 'return=minimal' },
          },
        ).catch(() => null);
      }

      await supabaseAdminRequest(env, `/rest/v1/tokens_convite?${new URLSearchParams({ id: `eq.${tokenInfo.id}` }).toString()}`, {
        method: 'PATCH',
        body: {
          usado_por: userId,
          usado_em: new Date().toISOString(),
        },
        headers: { Prefer: 'return=minimal' },
      });
    } catch (error) {
      await supabaseAdminAuthRequest(env, `/users/${userId}`, { method: 'DELETE' }).catch(() => null);
      await releasePublicInviteReservation(env, String(tokenInfo.id));
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Falha ao concluir registro.' }, 500);
    }

    return jsonResponse({
      success: true,
      role: tokenInfo.role_destino,
      message: 'Usuario registrado com sucesso.',
    });
  },
  'POST /v1/public/tenant-invites/context': async (request, env) => {
    const body = await request.json().catch(() => ({}));
    const token = String(body?.token || '').trim();
    const invite = await fetchTenantAdminInviteContext(token, env);

    if (!invite?.id) {
      return jsonResponse({ success: false, error: 'Link invalido ou expirado.' }, 404);
    }

    return jsonResponse({ success: true, invite });
  },
  'POST /v1/public/tenant-invites/register': async (request, env) => {
    const body = await request.json().catch(() => ({}));
    const token = decodeURIComponent(String(body?.token || '')).trim().toLowerCase();
    const nome = String(body?.nome || '').trim();
    const cpf = normalizeCpf(body?.cpf);
    const senha = String(body?.senha || '');

    if (!token || !nome || cpf.length !== 11 || senha.length < 6) {
      return jsonResponse({ success: false, error: 'Dados invalidos.' }, 400);
    }

    const invite = await fetchTenantAdminInviteContext(token, env);
    if (!invite?.id) {
      return jsonResponse({ success: false, error: 'Link invalido ou expirado.' }, 400);
    }
    if (invite.cpf && String(invite.cpf) !== cpf) {
      return jsonResponse({ success: false, error: 'Este convite esta vinculado a outro CPF.' }, 403);
    }

    const inviteTenantId = String(invite?.tenant_id || '').trim();
    const inviteEscolaId = String(invite?.escola_id || '').trim();
    if (!UUID_PATTERN.test(inviteTenantId) || !UUID_PATTERN.test(inviteEscolaId)) {
      return jsonResponse({ success: false, error: 'Convite inconsistente. Gere um novo link de onboarding.' }, 400);
    }

    const reserved = await supabaseAdminRequest(
      env,
      `/rest/v1/tenant_admin_invites?${new URLSearchParams({
        select: 'id',
        token: `eq.${token}`,
        usado_em: 'is.null',
        expira_em: `gt.${new Date().toISOString()}`,
      }).toString()}`,
      {
        method: 'PATCH',
        body: { usado_em: new Date().toISOString() },
        headers: { Prefer: 'return=representation' },
      },
    );
    const reservedInvite = Array.isArray(reserved) ? (reserved[0] || null) : null;
    if (!reservedInvite?.id) {
      return jsonResponse({ success: false, error: 'Link invalido ou ja utilizado.' }, 400);
    }

    const authEmail = `${cpf}@temp.bibliotecai.com`;
    let userId = '';
    const duplicateEmailMarkers = ['already been registered', 'already exists', 'already registered'];
    const existingProfileLookup = await supabaseAdminRequest(
      env,
      `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
        select: 'id,user_id,escola_id,tipo,cpf',
        escola_id: `eq.${inviteEscolaId}`,
        tipo: 'eq.gestor',
        cpf: `eq.${cpf}`,
        limit: '1',
      }).toString()}`,
    );
    const existingProfile = Array.isArray(existingProfileLookup) ? (existingProfileLookup[0] || null) : null;
    let targetProfile = existingProfile;
    let duplicateProfileIdsToDelete: string[] = [];

    try {
      const authData = await supabaseAdminAuthRequest(env, '/users', {
        method: 'POST',
        body: {
          email: authEmail,
          password: senha,
          email_confirm: true,
          user_metadata: { nome },
        },
      });
      userId = extractAuthAdminUserId(authData);
      if (!userId) {
        await supabaseAdminRequest(env, `/rest/v1/tenant_admin_invites?${new URLSearchParams({ id: `eq.${reservedInvite.id}` }).toString()}`, {
          method: 'PATCH',
          body: { usado_em: null, usado_por: null },
          headers: { Prefer: 'return=minimal' },
        }).catch(() => null);
        return jsonResponse({ success: false, error: 'Falha ao identificar a conta criada no Auth.' }, 500);
      }
    } catch (error) {
      const authErrorMessage = String(error instanceof Error ? error.message : '').toLowerCase();
      if (!duplicateEmailMarkers.some((marker) => authErrorMessage.includes(marker))) {
        await supabaseAdminRequest(env, `/rest/v1/tenant_admin_invites?${new URLSearchParams({ id: `eq.${reservedInvite.id}` }).toString()}`, {
          method: 'PATCH',
          body: { usado_em: null, usado_por: null },
          headers: { Prefer: 'return=minimal' },
        }).catch(() => null);
        return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Falha ao criar gestor.' }, 400);
      }

      const existingAuthUser = await findAuthUserByEmail(env, authEmail);
      if (!existingAuthUser?.id) {
        await supabaseAdminRequest(env, `/rest/v1/tenant_admin_invites?${new URLSearchParams({ id: `eq.${reservedInvite.id}` }).toString()}`, {
          method: 'PATCH',
          body: { usado_em: null, usado_por: null },
          headers: { Prefer: 'return=minimal' },
        }).catch(() => null);
        return jsonResponse({ success: false, error: 'Esta conta ja esta cadastrada. Verifique seus dados ou faca login.' }, 409);
      }

      const linkedProfilesPayload = await supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
          select: 'id,user_id,escola_id,tipo,cpf',
          user_id: `eq.${existingAuthUser.id}`,
          limit: '5',
        }).toString()}`,
      ).catch(() => []);
      const linkedProfiles = Array.isArray(linkedProfilesPayload) ? linkedProfilesPayload : [];
      const linkedRolesPayload = await supabaseAdminRequest(
        env,
        `/rest/v1/user_roles?${new URLSearchParams({
          select: 'role',
          user_id: `eq.${existingAuthUser.id}`,
        }).toString()}`,
      ).catch(() => []);
      const linkedRoles = Array.isArray(linkedRolesPayload) ? linkedRolesPayload : [];
      const hasProtectedRole = linkedRoles.some((item) => String(item?.role || '').trim() === 'super_admin');
      const reusableLinkedProfiles = linkedProfiles.filter((profile) => {
        const escolaId = String(profile?.escola_id || '').trim();
        const profileCpf = normalizeCpf(profile?.cpf);

        if (escolaId && escolaId !== inviteEscolaId) {
          return false;
        }

        if (profileCpf && profileCpf !== cpf) {
          return false;
        }

        return true;
      });
      const conflictingLinkedProfile = linkedProfiles.find((profile) => !reusableLinkedProfiles.includes(profile));
      const profileToReuse = existingProfile?.id ? existingProfile : (reusableLinkedProfiles[0] || null);

      if (hasProtectedRole) {
        await supabaseAdminRequest(env, `/rest/v1/tenant_admin_invites?${new URLSearchParams({ id: `eq.${reservedInvite.id}` }).toString()}`, {
          method: 'PATCH',
          body: { usado_em: null, usado_por: null },
          headers: { Prefer: 'return=minimal' },
        }).catch(() => null);
        return jsonResponse({ success: false, error: 'Esta conta esta protegida e nao pode ser reaproveitada pelo onboarding.' }, 409);
      }

      if (existingProfile?.user_id && String(existingProfile.user_id) !== String(existingAuthUser.id)) {
        await supabaseAdminRequest(env, `/rest/v1/tenant_admin_invites?${new URLSearchParams({ id: `eq.${reservedInvite.id}` }).toString()}`, {
          method: 'PATCH',
          body: { usado_em: null, usado_por: null },
          headers: { Prefer: 'return=minimal' },
        }).catch(() => null);
        return jsonResponse({ success: false, error: 'Este cadastro ja esta vinculado a outra conta. Faca login ou solicite suporte.' }, 409);
      }

      if (conflictingLinkedProfile) {
        await supabaseAdminRequest(env, `/rest/v1/tenant_admin_invites?${new URLSearchParams({ id: `eq.${reservedInvite.id}` }).toString()}`, {
          method: 'PATCH',
          body: { usado_em: null, usado_por: null },
          headers: { Prefer: 'return=minimal' },
        }).catch(() => null);
        return jsonResponse({ success: false, error: 'Esta conta ja esta cadastrada. Verifique seus dados ou faca login.' }, 409);
      }

      await supabaseAdminAuthRequest(env, `/users/${existingAuthUser.id}`, {
        method: 'PUT',
        body: {
          password: senha,
          email_confirm: true,
          user_metadata: {
            ...(existingAuthUser.user_metadata && typeof existingAuthUser.user_metadata === 'object' ? existingAuthUser.user_metadata : {}),
            nome,
          },
        },
      });

      if (!existingProfile?.id && profileToReuse?.id) {
        targetProfile = profileToReuse;
      }
      duplicateProfileIdsToDelete = reusableLinkedProfiles
        .map((profile) => String(profile?.id || '').trim())
        .filter((id, index, list) => id && id !== String(targetProfile?.id || '').trim() && list.indexOf(id) === index);
      userId = String(existingAuthUser.id);
    }

    try {
      const profilesByUserIdPayload = userId
        ? await supabaseAdminRequest(
          env,
          `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
            select: 'id,user_id,escola_id,tipo,cpf',
            user_id: `eq.${userId}`,
            limit: '5',
          }).toString()}`,
        ).catch(() => [])
        : [];
      const profilesByUserId = Array.isArray(profilesByUserIdPayload) ? profilesByUserIdPayload : [];
      const compatibleProfileByUserId = profilesByUserId.find((profile) => {
        const escolaId = String(profile?.escola_id || '').trim();
        const profileCpf = normalizeCpf(profile?.cpf);

        if (escolaId && escolaId !== inviteEscolaId) return false;
        if (profileCpf && profileCpf !== cpf) return false;
        return true;
      }) || null;
      const conflictingProfileByUserId = profilesByUserId.find((profile) => {
        const profileId = String(profile?.id || '').trim();
        return profileId && profileId !== String(compatibleProfileByUserId?.id || '').trim();
      }) || null;

      if (conflictingProfileByUserId) {
        await supabaseAdminRequest(env, `/rest/v1/tenant_admin_invites?${new URLSearchParams({ id: `eq.${reservedInvite.id}` }).toString()}`, {
          method: 'PATCH',
          body: { usado_em: null, usado_por: null },
          headers: { Prefer: 'return=minimal' },
        }).catch(() => null);
        return jsonResponse({ success: false, error: 'Esta conta ja esta vinculada a outro perfil. Faca login ou solicite suporte.' }, 409);
      }

      if (!targetProfile?.id && compatibleProfileByUserId?.id) {
        targetProfile = compatibleProfileByUserId;
      }

      await supabaseAdminRequest(
        env,
        `/rest/v1/user_roles?${new URLSearchParams({
          user_id: `eq.${userId}`,
          role: 'in.(aluno,professor,bibliotecaria)',
        }).toString()}`,
        {
          method: 'DELETE',
          headers: { Prefer: 'return=minimal' },
        },
      ).catch(() => null);

      await supabaseAdminRequest(env, `/rest/v1/user_roles?on_conflict=user_id,role`, {
        method: 'POST',
        body: [{ user_id: userId, role: 'gestor' }],
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      });

      const profilePayload = {
        user_id: userId,
        nome,
        email: authEmail,
        cpf,
        tipo: 'gestor',
        escola_id: inviteEscolaId,
        matricula: null,
      };

      if (targetProfile?.id) {
        await supabaseAdminRequest(env, `/rest/v1/usuarios_biblioteca?${new URLSearchParams({ id: `eq.${targetProfile.id}` }).toString()}`, {
          method: 'PATCH',
          body: profilePayload,
          headers: { Prefer: 'return=minimal' },
        });
      } else {
        await supabaseAdminRequest(env, '/rest/v1/usuarios_biblioteca', {
          method: 'POST',
          body: profilePayload,
          headers: { Prefer: 'return=minimal' },
        });
      }

      if (duplicateProfileIdsToDelete.length > 0) {
        await supabaseAdminRequest(
          env,
          `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
            id: `in.(${duplicateProfileIdsToDelete.join(',')})`,
          }).toString()}`,
          {
            method: 'DELETE',
            headers: { Prefer: 'return=minimal' },
          },
        ).catch(() => null);
      }

      await supabaseAdminRequest(env, `/rest/v1/tenant_admin_invites?${new URLSearchParams({ id: `eq.${reservedInvite.id}` }).toString()}`, {
        method: 'PATCH',
        body: { usado_por: userId },
        headers: { Prefer: 'return=minimal' },
      });

      await supabaseAdminRequest(env, `/rest/v1/escolas?${new URLSearchParams({ id: `eq.${inviteEscolaId}`, gestor_id: 'is.null' }).toString()}`, {
        method: 'PATCH',
        body: { gestor_id: userId },
        headers: { Prefer: 'return=minimal' },
      }).catch(() => null);
    } catch (error) {
      await supabaseAdminAuthRequest(env, `/users/${userId}`, { method: 'DELETE' }).catch(() => null);
      await supabaseAdminRequest(env, `/rest/v1/tenant_admin_invites?${new URLSearchParams({ id: `eq.${reservedInvite.id}` }).toString()}`, {
        method: 'PATCH',
        body: { usado_em: null, usado_por: null },
        headers: { Prefer: 'return=minimal' },
      }).catch(() => null);
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : 'Falha ao concluir cadastro.' }, 500);
    }

    return jsonResponse({
      success: true,
      role: 'gestor',
      login_email: authEmail,
      tenant_subdomain: invite.subdominio || null,
    });
  },
  'POST /v1/auth/super-admin/security-profile': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const account =
      await getSuperAdminAccountByAuthUserId(user.id, env) ||
      await resolveSuperAdminMatch(user.email || '', env).then((match) => (match?.account_id ? getSuperAdminAccountById(match.account_id, env) : null));

    if (!account?.id) {
      return jsonResponse({ success: false, error: 'Conta de Super Admin nao encontrada.' }, 404);
    }

    const passkeys = await listActivePasskeys(String(account.id), env);
    const body = await request.json().catch(() => ({}));
    const risk = buildRiskContext(request, body?.context && typeof body.context === 'object' ? body.context : null);

    return jsonResponse({
      success: true,
      account: {
        id: account.id,
        nome: account.nome || null,
        email: account.email || user.email || null,
        passkey_required: account.passkey_required !== false,
        passkey_enrolled_at: account.passkey_enrolled_at || null,
      },
      passkeysCount: passkeys.length,
      needsPasskeyEnrollment: passkeys.length === 0,
      requiresEmailVerification: false,
      deviceType: risk.deviceType,
      risk,
    });
  },
  'POST /v1/auth/super-admin/passkeys/register/options': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const account = await getSuperAdminAccountByAuthUserId(user.id, env);
    if (!account?.id) {
      return jsonResponse({ success: false, error: 'Conta de Super Admin nao encontrada.' }, 404);
    }

    const existingPasskeys = await listActivePasskeys(String(account.id), env);
    const body = await request.json().catch(() => ({}));
    const requestContext = body?.context && typeof body.context === 'object' ? body.context : null;
    const risk = buildRiskContext(request, requestContext);
    const challenge = randomToken(32);
    const origin = getRequestOrigin(request, env, requestContext);
    const rpId = getRpId(origin);

    const challengeRow = await createSuperAdminChallenge(env, {
      account_id: account.id,
      kind: 'passkey_registration',
      challenge_hash: await sha256Base64Url(challenge),
      device_type: risk.deviceType,
      origin_ip: risk.ip,
      user_agent: risk.userAgent,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      metadata: {
        origin,
        rpId,
      },
    });

    return jsonResponse({
      success: true,
      challengeId: challengeRow?.id || null,
      publicKey: {
        challenge,
        rp: {
          name: 'BibliotecAI Super Admin',
          id: rpId,
        },
        user: {
          id: base64UrlEncode(new TextEncoder().encode(String(account.id))),
          name: String(account.email || user.email || '').trim().toLowerCase(),
          displayName: String(account.nome || account.email || 'Super Admin'),
        },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        timeout: 60000,
        attestation: 'none',
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'required',
          userVerification: 'required',
        },
        hints: ['client-device'],
        excludeCredentials: existingPasskeys.map((item) => ({
          id: item.credential_id,
          type: 'public-key',
        })),
      },
    });
  },
  'POST /v1/auth/super-admin/passkeys/register/verify': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const account = await getSuperAdminAccountByAuthUserId(user.id, env);
    if (!account?.id) {
      return jsonResponse({ success: false, error: 'Conta de Super Admin nao encontrada.' }, 404);
    }

    const body = await request.json().catch(() => ({}));
    const challenge = String(body?.challenge || '').trim();
    const credential = body?.credential;
    const deviceLabel = String(body?.deviceLabel || '').trim() || 'Passkey biometrica';
    if (!challenge || !credential) {
      return jsonResponse({ success: false, error: 'Challenge e credencial sao obrigatorios.' }, 400);
    }

    const challengeRow = await getSuperAdminChallengeByHash(String(account.id), 'passkey_registration', await sha256Base64Url(challenge), env);
    if (!isPendingChallenge(challengeRow)) {
      return jsonResponse({ success: false, error: 'Challenge de cadastro expirado ou invalido.' }, 410);
    }

    const verification = await verifyRegistrationResponse({
      credential,
      expectedChallenge: challenge,
      expectedOrigin: String(challengeRow?.metadata?.origin || getRequestOrigin(request, env, body?.context && typeof body.context === 'object' ? body.context : null)),
      rpId: String(challengeRow?.metadata?.rpId || getRpId(getRequestOrigin(request, env, body?.context && typeof body.context === 'object' ? body.context : null))),
    });

    const alreadyExists = await getActivePasskeyByCredential(String(account.id), verification.credentialId, env);
    if (alreadyExists?.id) {
      return jsonResponse({ success: true, alreadyRegistered: true });
    }

    await supabaseAdminRequest(env, '/rest/v1/super_admin_passkeys', {
      method: 'POST',
      body: {
        account_id: account.id,
        credential_id: verification.credentialId,
        credential_public_key_jwk: verification.publicKeyJwk,
        counter: verification.counter,
        transports: verification.transports,
        device_label: deviceLabel,
        backed_up: verification.backedUp,
        metadata: {
          authenticator_attachment: credential?.authenticatorAttachment || null,
        },
      },
      headers: {
        Prefer: 'return=minimal',
      },
    });

    await supabaseAdminRequest(
      env,
      `/rest/v1/super_admin_accounts?${new URLSearchParams({ id: `eq.${account.id}` }).toString()}`,
      {
        method: 'PATCH',
        body: {
          passkey_enrolled_at: new Date().toISOString(),
        },
        headers: { Prefer: 'return=minimal' },
      },
    );

    await patchSuperAdminChallenge(String(challengeRow.id), env, {
      consumed_at: new Date().toISOString(),
      approved_at: new Date().toISOString(),
    });

    return jsonResponse({ success: true });
  },
  'POST /v1/auth/super-admin/passkeys/authenticate/options': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const account = await getSuperAdminAccountByAuthUserId(user.id, env);
    if (!account?.id) {
      return jsonResponse({ success: false, error: 'Conta de Super Admin nao encontrada.' }, 404);
    }

    const passkeys = await listActivePasskeys(String(account.id), env);
    if (passkeys.length === 0) {
      return jsonResponse({ success: false, error: 'Nenhuma passkey cadastrada para este Super Admin.' }, 409);
    }

    const body = await request.json().catch(() => ({}));
    const requestContext = body?.context && typeof body.context === 'object' ? body.context : null;
    const risk = buildRiskContext(request, requestContext);
    const challenge = randomToken(32);
    const origin = getRequestOrigin(request, env, requestContext);
    const rpId = getRpId(origin);

    const challengeRow = await createSuperAdminChallenge(env, {
      account_id: account.id,
      kind: 'passkey_authentication',
      challenge_hash: await sha256Base64Url(challenge),
      device_type: risk.deviceType,
      origin_ip: risk.ip,
      user_agent: risk.userAgent,
      requires_email_verification: false,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      metadata: {
        origin,
        rpId,
      },
    });

    return jsonResponse({
      success: true,
      challengeId: challengeRow?.id || null,
      requiresEmailVerification: false,
      publicKey: {
        challenge,
        rpId,
        timeout: 60000,
        userVerification: 'required',
        hints: ['client-device'],
        allowCredentials: passkeys.map((item) => ({
          id: item.credential_id,
          type: 'public-key',
        })),
      },
    });
  },
  'POST /v1/auth/super-admin/passkeys/authenticate/verify': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const account = await getSuperAdminAccountByAuthUserId(user.id, env);
    if (!account?.id) {
      return jsonResponse({ success: false, error: 'Conta de Super Admin nao encontrada.' }, 404);
    }

    const body = await request.json().catch(() => ({}));
    const challenge = String(body?.challenge || '').trim();
    const credential = body?.credential;
    if (!challenge || !credential?.id) {
      return jsonResponse({ success: false, error: 'Credencial biometrica obrigatoria.' }, 400);
    }

    const passkey = await getActivePasskeyByCredential(String(account.id), String(credential.id), env);
    if (!passkey?.id) {
      return jsonResponse({ success: false, error: 'Passkey nao reconhecida para este Super Admin.' }, 404);
    }

    const challengeRow = await getSuperAdminChallengeByHash(String(account.id), 'passkey_authentication', await sha256Base64Url(challenge), env);
    if (!isPendingChallenge(challengeRow)) {
      return jsonResponse({ success: false, error: 'Challenge biometrico expirado ou invalido.' }, 410);
    }

    const verification = await verifyAuthenticationResponse({
      credential,
      expectedChallenge: challenge,
      expectedOrigin: String(challengeRow?.metadata?.origin || getRequestOrigin(request, env, body?.context && typeof body.context === 'object' ? body.context : null)),
      rpId: String(challengeRow?.metadata?.rpId || getRpId(getRequestOrigin(request, env, body?.context && typeof body.context === 'object' ? body.context : null))),
      storedCredentialId: String(passkey.credential_id),
      publicKeyJwk: passkey.credential_public_key_jwk,
      previousCounter: Number(passkey.counter || 0),
    });

    await supabaseAdminRequest(
      env,
      `/rest/v1/super_admin_passkeys?${new URLSearchParams({ id: `eq.${passkey.id}` }).toString()}`,
      {
        method: 'PATCH',
        body: {
          counter: verification.counter,
          last_used_at: new Date().toISOString(),
        },
        headers: { Prefer: 'return=minimal' },
      },
    );

    await patchSuperAdminChallenge(String(challengeRow.id), env, {
      approved_at: new Date().toISOString(),
    });

    return jsonResponse({
      success: true,
      challengeId: challengeRow.id,
      requiresEmailVerification: challengeRow.requires_email_verification === true,
    });
  },
  'POST /v1/auth/super-admin/email/send-code': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const account = await getSuperAdminAccountByAuthUserId(user.id, env);
    if (!account?.id || !account.email) {
      return jsonResponse({ success: false, error: 'Conta de Super Admin nao encontrada.' }, 404);
    }

    const body = await request.json().catch(() => ({}));
    const challengeId = String(body?.challengeId || '').trim();
    const challenge = await getSuperAdminChallengeById(challengeId, env);
    if (!challenge?.id || String(challenge.account_id) !== String(account.id) || !isPendingChallenge(challenge)) {
      return jsonResponse({ success: false, error: 'Desafio de email invalido.' }, 404);
    }

    const code = randomDigits(6);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await patchSuperAdminChallenge(String(challenge.id), env, {
      requires_email_verification: true,
      email_code_hash: await sha256Base64Url(code),
      email_code_expires_at: expiresAt,
    });

    await sendSecurityEmail(
      env,
      String(account.email),
      'Codigo de verificacao de Super Admin',
      `<p>Seu codigo de verificacao da BibliotecAI e <strong>${code}</strong>.</p><p>Ele expira em 10 minutos.</p>`,
      `Seu codigo de verificacao da BibliotecAI e ${code}. Ele expira em 10 minutos.`,
    );

    return jsonResponse({
      success: true,
      maskedEmail: String(account.email).replace(/(^.).*(@.*$)/, '$1***$2'),
      expiresAt,
    });
  },
  'POST /v1/auth/super-admin/email/verify-code': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const account = await getSuperAdminAccountByAuthUserId(user.id, env);
    if (!account?.id) {
      return jsonResponse({ success: false, error: 'Conta de Super Admin nao encontrada.' }, 404);
    }

    const body = await request.json().catch(() => ({}));
    const challengeId = String(body?.challengeId || '').trim();
    const code = String(body?.code || '').trim();
    const challenge = await getSuperAdminChallengeById(challengeId, env);
    if (!challenge?.id || String(challenge.account_id) !== String(account.id) || !isPendingChallenge(challenge)) {
      return jsonResponse({ success: false, error: 'Desafio de email invalido.' }, 404);
    }

    if (!code || !challenge.email_code_hash || !challenge.email_code_expires_at || new Date(String(challenge.email_code_expires_at)).getTime() <= Date.now()) {
      return jsonResponse({ success: false, error: 'Codigo expirado ou nao enviado.' }, 410);
    }

    if (await sha256Base64Url(code) !== String(challenge.email_code_hash)) {
      return jsonResponse({ success: false, error: 'Codigo de verificacao invalido.' }, 400);
    }

    const nowIso = new Date().toISOString();
    await patchSuperAdminChallenge(String(challenge.id), env, {
      email_verified_at: nowIso,
    });

    await supabaseAdminRequest(
      env,
      `/rest/v1/super_admin_accounts?${new URLSearchParams({ id: `eq.${account.id}` }).toString()}`,
      {
        method: 'PATCH',
        body: {
          ultimo_email_verificado_em: nowIso,
        },
        headers: { Prefer: 'return=minimal' },
      },
    );

    return jsonResponse({ success: true });
  },
  'POST /v1/auth/super-admin/desktop/start': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const account = await getSuperAdminAccountByAuthUserId(user.id, env);
    if (!account?.id) {
      return jsonResponse({ success: false, error: 'Conta de Super Admin nao encontrada.' }, 404);
    }

    const body = await request.json().catch(() => ({}));
    const requestContext = body?.context && typeof body.context === 'object' ? body.context : null;
    const risk = buildRiskContext(request, requestContext);
    const token = randomToken(24);
    const origin = getRequestOrigin(request, env, requestContext);
    const challenge = await createSuperAdminChallenge(env, {
      account_id: account.id,
      kind: 'desktop_access',
      challenge_hash: await sha256Base64Url(randomToken(32)),
      token_hash: await sha256Base64Url(token),
      device_type: 'desktop',
      origin_ip: risk.ip,
      user_agent: risk.userAgent,
      requires_email_verification: false,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      metadata: {
        origin,
        desktopRisk: risk,
      },
    });

    const approvalUrl = `${origin}/admin/acesso?desktopApproval=${encodeURIComponent(token)}`;

    return jsonResponse({
      success: true,
      token,
      challengeId: challenge?.id || null,
      approvalUrl,
      qrCodeUrl: `https://quickchart.io/qr?text=${encodeURIComponent(approvalUrl)}&size=260`,
      expiresAt: challenge?.expires_at || null,
      requiresEmailVerification: false,
    });
  },
  'GET /v1/auth/super-admin/desktop/challenges/:token': async (request, env) => {
    const token = getPathParam(request, /^\/v1\/auth\/super-admin\/desktop\/challenges\/([^/]+)$/);
    const challenge = await getSuperAdminChallengeByToken(token, env);
    if (!challenge?.id) {
      return jsonResponse({ success: false, error: 'Desafio desktop nao encontrado.' }, 404);
    }

    return jsonResponse({
      success: true,
      approved: Boolean(challenge.approved_at),
      consumed: Boolean(challenge.consumed_at),
      expired: isChallengeExpired(challenge),
      approvedAt: challenge.approved_at || null,
      expiresAt: challenge.expires_at || null,
    });
  },
  'POST /v1/auth/super-admin/desktop/approve': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const account = await getSuperAdminAccountByAuthUserId(user.id, env);
    if (!account?.id) {
      return jsonResponse({ success: false, error: 'Conta de Super Admin nao encontrada.' }, 404);
    }

    const body = await request.json().catch(() => ({}));
    const token = String(body?.token || '').trim();
    const authChallengeId = String(body?.authChallengeId || '').trim();
    const desktopChallenge = await getSuperAdminChallengeByToken(token, env);
    const authChallenge = await getSuperAdminChallengeById(authChallengeId, env);

    if (!desktopChallenge?.id || !isPendingChallenge(desktopChallenge)) {
      return jsonResponse({ success: false, error: 'Desafio do computador expirado ou invalido.' }, 410);
    }

    if (!authChallenge?.id || String(authChallenge.account_id) !== String(account.id) || String(authChallenge.kind) !== 'passkey_authentication' || !authChallenge.approved_at) {
      return jsonResponse({ success: false, error: 'Autenticacao biometrica do celular nao foi confirmada.' }, 400);
    }

    if (authChallenge.requires_email_verification === true && !authChallenge.email_verified_at) {
      return jsonResponse({ success: false, error: 'A verificacao adicional por email ainda nao foi concluida.' }, 400);
    }

    const nowIso = new Date().toISOString();
    await patchSuperAdminChallenge(String(desktopChallenge.id), env, {
      approved_at: nowIso,
      approved_by_account_id: account.id,
      metadata: {
        ...(desktopChallenge.metadata && typeof desktopChallenge.metadata === 'object' ? desktopChallenge.metadata : {}),
        mobile_auth_challenge_id: authChallenge.id,
        approved_from_mobile_at: nowIso,
      },
    });

    return jsonResponse({ success: true });
  },
  'POST /v1/auth/resolve-login': async (request, env) => {
    const body = await request.json().catch(() => ({}));
    const identifier = String(body?.identifier || '').trim();
    if (!identifier) {
      return jsonResponse({ success: false, error: 'Identificador nao informado.' }, 400);
    }

    return jsonResponse({
      success: true,
      superAdminMatch: null,
      cpfEmail: null,
      matriculaEmail: null,
      matriculaActivated: null,
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
  'POST /v1/auth/refresh': async (request, env) => {
    const body = await request.json().catch(() => ({}));
    const refreshToken = String(body?.refreshToken || '').trim();

    if (!refreshToken) {
      return jsonResponse({ success: false, error: 'Refresh token ausente.' }, 400);
    }

    const { supabaseUrl, publishableKey } = getSupabaseConfig(env);
    const refreshResponse = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    const refreshPayload = await parseResponse(refreshResponse);
    if (!refreshResponse.ok) {
      return jsonResponse(
        {
          success: false,
          error:
            (typeof refreshPayload === 'string' && refreshPayload.trim()) ||
            refreshPayload?.msg ||
            refreshPayload?.error_description ||
            refreshPayload?.error ||
            'Falha ao renovar a sessao.',
        },
        refreshResponse.status,
      );
    }

    return jsonResponse({
      success: true,
      session: refreshPayload,
      user: refreshPayload?.user || null,
    });
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
    const mfaChallengeId = String(body?.mfaChallengeId || '').trim();
    const desktopChallengeToken = String(body?.desktopChallengeToken || '').trim();
    const securityContext = body?.context && typeof body.context === 'object' ? body.context : null;

    if (!match?.matched || !match?.account_id) {
      return jsonResponse({ success: true, successMatched: false, matched: false });
    }

    if (!mfaChallengeId && !desktopChallengeToken) {
      return jsonResponse({ success: false, error: 'Confirmacao biometrica obrigatoria para Super Admin.' }, 403);
    }

    let emailVerified = false;
    if (desktopChallengeToken) {
      const desktopChallenge = await getSuperAdminChallengeByToken(desktopChallengeToken, env);
      if (!desktopChallenge?.id || String(desktopChallenge.account_id) !== String(match.account_id) || !desktopChallenge.approved_at || desktopChallenge.consumed_at || isChallengeExpired(desktopChallenge)) {
        return jsonResponse({ success: false, error: 'Aprovacao do computador ainda nao foi validada.' }, 403);
      }
      emailVerified = desktopChallenge.requires_email_verification === true;
      await patchSuperAdminChallenge(String(desktopChallenge.id), env, {
        consumed_at: new Date().toISOString(),
      });
    } else {
      const mfaChallenge = await getSuperAdminChallengeById(mfaChallengeId, env);
      if (!mfaChallenge?.id || String(mfaChallenge.account_id) !== String(match.account_id) || String(mfaChallenge.kind) !== 'passkey_authentication' || !mfaChallenge.approved_at || mfaChallenge.consumed_at || isChallengeExpired(mfaChallenge)) {
        return jsonResponse({ success: false, error: 'Autenticacao biometrica ainda nao foi validada.' }, 403);
      }
      if (mfaChallenge.requires_email_verification === true && !mfaChallenge.email_verified_at) {
        return jsonResponse({ success: false, error: 'A verificacao adicional por email e obrigatoria para este acesso.' }, 403);
      }
      emailVerified = Boolean(mfaChallenge.email_verified_at);
      await patchSuperAdminChallenge(String(mfaChallenge.id), env, {
        consumed_at: new Date().toISOString(),
      });
    }

    const risk = buildRiskContext(request, securityContext);
    const nowIso = new Date().toISOString();
    const resolvedDeviceType = formatSuperAdminDeviceType(risk.deviceType, Boolean(desktopChallengeToken));

    await supabaseAdminRequest(
      env,
      `/rest/v1/super_admin_accounts?${new URLSearchParams({ id: `eq.${match.account_id}` }).toString()}`,
      {
        method: 'PATCH',
        body: {
          auth_user_id: user.id,
          tentativas_falhas: 0,
          ultima_tentativa_em: nowIso,
          ultimo_login_em: nowIso,
          ativo: true,
          bloqueado: false,
          bloqueado_em: null,
          ultimo_dispositivo: resolvedDeviceType,
          ultimo_mfa_em: nowIso,
          ultimo_email_verificado_em: emailVerified ? nowIso : null,
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
        city: risk.city,
        region: risk.region,
        country: risk.country,
        device_type: resolvedDeviceType,
        email_verified: emailVerified,
      },
    });

    return jsonResponse({ success: true, matched: true, account_id: match.account_id });
  },
  'POST /v1/auth/super-admin/failed-attempt': async (request, env) => {
    const body = await request.json().catch(() => ({}));
    const identifier = String(body?.identifier || '').trim();
    const path = String(body?.path || '/auth');
    const result = await registerSuperAdminFailedAttemptInternal(
      request,
      env,
      identifier,
      path,
      body?.context && typeof body.context === 'object' ? body.context as Record<string, unknown> : null,
    );

    return jsonResponse(result?.matched ? result : { matched: false });
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

      const createdUserId = extractAuthAdminUserId(authData);
      if (createdUserId) {
        userId = createdUserId;
        createdNewUser = true;
      } else {
        return jsonResponse({
          success: false,
          error: 'Nao foi possivel identificar a conta criada no Auth.',
        }, 500);
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
  'GET /v1/me/profile': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const profile = await getLatestUserProfile(user.id, env);
    return jsonResponse({
      success: true,
      profile: profile || {
        id: null,
        nome: pickAuthName(user) || '',
        email: String(user?.email || '').trim() || null,
        telefone: null,
        cpf: null,
        turma: null,
        matricula: null,
      },
    });
  },
  'PATCH /v1/me/profile': async (request, env) => {
    const token = getUserToken(request);
    const user = await fetchSupabaseUser(request, env);
    if (!token || !user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const profile = await getLatestUserProfile(user.id, env);
    if (String(profile?.tipo || '').trim() === 'aluno') {
      return jsonResponse({ success: false, error: 'Alunos nao podem alterar as proprias informacoes cadastrais.' }, 403);
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const nextNome = String(body?.nome || '').trim();
    const payload = {
      nome: nextNome || null,
      telefone: String(body?.telefone || '').trim() || null,
      cpf: normalizeDigits(body?.cpf) || null,
      turma: String(body?.turma || '').trim() || null,
    };

    if (profile?.id) {
      await supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?${new URLSearchParams({ id: `eq.${profile.id}` }).toString()}`,
        {
          method: 'PATCH',
          body: payload,
          headers: {
            Prefer: 'return=minimal',
          },
        },
      );
    }

    const { supabaseUrl, publishableKey } = getSupabaseConfig(env);
    const authUpdateResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: {
          ...(user?.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {}),
          ...(nextNome ? { nome: nextNome } : {}),
        },
      }),
    });

    const authUpdatePayload = await parseResponse(authUpdateResponse);
    if (!authUpdateResponse.ok) {
      return jsonResponse(
        {
          success: false,
          error:
            (typeof authUpdatePayload === 'string' && authUpdatePayload.trim()) ||
            authUpdatePayload?.msg ||
            authUpdatePayload?.error_description ||
            authUpdatePayload?.error ||
            'Falha ao atualizar o perfil.',
        },
        authUpdateResponse.status,
      );
    }

    const updatedProfile = profile?.id ? await getLatestUserProfile(user.id, env) : null;
    return jsonResponse({
      success: true,
      profile: updatedProfile || {
        id: null,
        nome: nextNome || pickAuthName(authUpdatePayload) || '',
        email: String(authUpdatePayload?.email || user?.email || '').trim() || null,
        telefone: payload.telefone,
        cpf: payload.cpf,
        turma: payload.turma,
        matricula: null,
      },
      user: authUpdatePayload,
    });
  },
  'POST /v1/auth/password': async (request, env) => {
    const token = getUserToken(request);
    if (!token) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const password = String(body?.password || '').trim();
    const metadata = body?.metadata && typeof body.metadata === 'object' ? body.metadata : {};

    if (password.length < 6) {
      return jsonResponse({ success: false, error: 'Senha deve ter pelo menos 6 caracteres.' }, 400);
    }

    const { supabaseUrl, publishableKey } = getSupabaseConfig(env);
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'PUT',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        password,
        data: metadata,
      }),
    });

    const payload = await parseResponse(response);
    if (!response.ok) {
      return jsonResponse(
        {
          success: false,
          error:
            (typeof payload === 'string' && payload.trim()) ||
            payload?.msg ||
            payload?.message ||
            payload?.error_description ||
            payload?.error ||
            'Nao foi possivel atualizar a senha.',
        },
        response.status,
      );
    }

    return jsonResponse({ success: true, user: payload || null });
  },
  'GET /v1/rankings': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const profile = await getLatestUserProfile(user.id, env);
    if (!profile?.id) {
      return jsonResponse({ success: false, error: 'Perfil do usuario nao encontrado.' }, 404);
    }

    const tipo = String(profile.tipo || '').trim().toLowerCase();
    if (!['aluno', 'professor', 'gestor', 'bibliotecaria'].includes(tipo)) {
      return jsonResponse({ success: false, error: 'Perfil sem acesso ao ranking.' }, 403);
    }

    const ranking = await supabaseUserRpc(
      request,
      env,
      tipo === 'aluno' ? 'get_aluno_rankings' : 'get_school_rankings',
    );

    return jsonResponse({
      success: true,
      currentStudentId: tipo === 'aluno' ? String(profile.id || '') : null,
      currentTurma: String(profile.turma || '').trim() || null,
      ranking: Array.isArray(ranking) ? ranking : [],
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

    const profile = userRole === 'super_admin'
      ? null
      : await getLatestUserProfile(user.id, env).catch(() => null);
    const escolaId = String(profile?.escola_id || '').trim();
    const isSchoolScopedDashboard = Boolean(userRole && userRole !== 'super_admin' && escolaId);

    const baseQueries = await Promise.all([
      supabaseAdminRequest(
        env,
        isSchoolScopedDashboard
          ? `/rest/v1/livros?${new URLSearchParams({
            select: 'id,disponivel,escola_id',
            escola_id: `eq.${escolaId}`,
          }).toString()}`
          : '/rest/v1/livros?select=id,disponivel,escola_id',
      ),
      supabaseAdminRequest(
        env,
        isSchoolScopedDashboard
          ? `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
            select: 'id,escola_id',
            escola_id: `eq.${escolaId}`,
          }).toString()}`
          : '/rest/v1/usuarios_biblioteca?select=id,escola_id',
      ),
      supabaseAdminRequest(
        env,
        isSchoolScopedDashboard
          ? `/rest/v1/emprestimos?${new URLSearchParams({
            select: 'id,data_emprestimo,data_devolucao_prevista,data_devolucao_real,status,created_at,livro_id,livros(titulo,escola_id),usuarios_biblioteca(nome,escola_id)',
          }).toString()}`
          : '/rest/v1/emprestimos?select=id,data_emprestimo,data_devolucao_prevista,data_devolucao_real,status,created_at,livro_id,livros(titulo,escola_id),usuarios_biblioteca(nome,escola_id)',
      ),
      supabaseAdminRequest(env, '/rest/v1/tenants?select=id,nome,subdominio,ativo,escola_id'),
      supabaseAdminRequest(env, '/rest/v1/escolas?select=id,nome,gestor_id'),
    ]);

    const [livros, usuarios, emprestimos, tenants, escolas] = baseQueries.map((item) => (Array.isArray(item) ? item : []));

    const sameSchool = (candidateEscolaId: unknown) => String(candidateEscolaId || '').trim() === escolaId;
    const livrosBase = isSchoolScopedDashboard
      ? livros.filter((item) => sameSchool(item?.escola_id))
      : livros;
    const usuariosBase = isSchoolScopedDashboard
      ? usuarios.filter((item) => sameSchool(item?.escola_id))
      : usuarios;
    const emprestimosBase = isSchoolScopedDashboard
      ? emprestimos.filter((item) => sameSchool(item?.livros?.escola_id) || sameSchool(item?.usuarios_biblioteca?.escola_id))
      : emprestimos;

    const emprestimosAtivos = emprestimosBase.filter((item) => item?.status === 'ativo');
    const emprestimosAtrasados = emprestimosAtivos.filter((item) => {
      const prev = item?.data_devolucao_prevista;
      return prev ? new Date(prev).getTime() < Date.now() : false;
    });

    const atividades = [...emprestimosBase]
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

    emprestimosBase.forEach((emp) => {
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
        totalLivros: livrosBase.length,
        livrosDisponiveis: livrosBase.filter((item) => item?.disponivel !== false).length,
        totalUsuarios: usuariosBase.length,
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
  'POST /v1/admin/comunidade/posts': async (request, env) => {
    const caller = await fetchSupabaseUser(request, env);
    if (!caller?.id || !(await isSuperAdmin(caller.id, env))) {
      return jsonResponse({ success: false, error: 'Sem permissao para publicar comunicado global.' }, 403);
    }
    const body = await request.json().catch(() => ({}));
    try {
      await supabaseAdminRequest(env, '/rest/v1/comunidade_posts', {
        method: 'POST',
        body,
        headers: { Prefer: 'return=minimal' },
      });
    } catch (error) {
      const message = String(error instanceof Error ? error.message : error || '').toLowerCase();
      if (Object.prototype.hasOwnProperty.call(body || {}, 'escola_id') && message.includes("could not find the 'escola_id' column")) {
        const { escola_id: _ignored, ...fallbackBody } = body as Record<string, unknown>;
        await supabaseAdminRequest(env, '/rest/v1/comunidade_posts', {
          method: 'POST',
          body: fallbackBody,
          headers: { Prefer: 'return=minimal' },
        });
      } else {
        throw error;
      }
    }
    return jsonResponse({ success: true });
  },
  'POST /v1/notifications/push/register': async (request, env) => {
    const caller = await fetchSupabaseUser(request, env);
    if (!caller?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const profile = await getLatestUserProfile(caller.id, env);
    if (!profile?.id) {
      return jsonResponse({ success: false, error: 'Perfil do usuario nao encontrado.' }, 400);
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const token = String(body?.token || '').trim();
    const provider = String(body?.provider || 'fcm').trim().toLowerCase();
    const platform = String(body?.platform || 'android').trim().toLowerCase();
    const deviceLabel = String(body?.device_label || '').trim() || null;
    const appVersion = String(body?.app_version || '').trim() || null;
    const channels = normalizePushChannels(body?.channels);

    if (!token) {
      return jsonResponse({ success: false, error: 'Token push obrigatorio.' }, 400);
    }

    await upsertPushDeviceToken(env, {
      callerId: caller.id,
      profile,
      token,
      provider,
      platform,
      deviceLabel,
      appVersion,
      channels,
    });

    return jsonResponse({ success: true });
  },
  'POST /v1/notifications/push/unregister': async (request, env) => {
    const caller = await fetchSupabaseUser(request, env);
    if (!caller?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const token = String(body?.token || '').trim();
    if (!token) {
      return jsonResponse({ success: false, error: 'Token push obrigatorio.' }, 400);
    }

    await supabaseAdminRequest(
      env,
      `/rest/v1/push_device_tokens?${new URLSearchParams({
        token: `eq.${token}`,
        user_id: `eq.${caller.id}`,
      }).toString()}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      },
    );

    return jsonResponse({ success: true });
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
        path: '/admin/super-admins',
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
          path: '/comunicados',
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

    const [atrasados, solicitacoes, notificacoesLidas, solicitacoesChat] = await Promise.all([
      supabaseAdminRequest(
        env,
        `/rest/v1/emprestimos?select=id,usuarios_biblioteca!inner(escola_id)&status=eq.ativo&data_devolucao_prevista=lt.${encodeURIComponent(new Date().toISOString())}&usuarios_biblioteca.escola_id=eq.${profile.escola_id}`,
      ),
      supabaseAdminRequest(
        env,
        `/rest/v1/solicitacoes_emprestimo?select=id,usuarios_biblioteca!inner(escola_id)&status=in.(pendente,em_andamento)&usuarios_biblioteca.escola_id=eq.${profile.escola_id}`,
      ),
      supabaseAdminRequest(
        env,
        `/rest/v1/notificacoes_lidas?${new URLSearchParams({
          select: 'notification_id',
          usuario_id: `eq.${profile.id}`,
        }).toString()}`,
      ),
      supabaseAdminRequest(
        env,
        `/rest/v1/solicitacoes_emprestimo?${new URLSearchParams({
          select: 'id,status,updated_at,created_at,livros(titulo),usuarios_biblioteca!inner(nome,escola_id),solicitacoes_emprestimo_mensagens(id,mensagem,autor_tipo,created_at)',
          order: 'updated_at.desc',
          'usuarios_biblioteca.escola_id': `eq.${profile.escola_id}`,
          limit: '30',
        }).toString()}`,
      ),
    ]);

    const lidas = new Set((Array.isArray(notificacoesLidas) ? notificacoesLidas : []).map((item) => item.notification_id));
    const chatNotifications = (Array.isArray(solicitacoesChat) ? solicitacoesChat : [])
      .flatMap((item) => {
        const mensagens = Array.isArray(item?.solicitacoes_emprestimo_mensagens) ? item.solicitacoes_emprestimo_mensagens : [];
        return mensagens
          .filter((mensagem) => String(mensagem?.autor_tipo || '').toLowerCase() === 'aluno')
          .map((mensagem) => ({
            id: `solicitacao-chat-${item.id}-${mensagem.id}`,
            tipo: 'solicitacao_chat',
            titulo: 'Nova mensagem em solicitação de empréstimo',
            descricao: `${item?.usuarios_biblioteca?.nome || 'Aluno'} enviou uma mensagem sobre ${item?.livros?.titulo || 'um livro'}.`,
            created_at: mensagem?.created_at || item?.updated_at || item?.created_at || null,
            path: '/emprestimos?tab=solicitacoes',
          }));
      })
      .filter((item) => !lidas.has(item.id))
      .sort((a, b) => new Date(String(b.created_at || 0)).getTime() - new Date(String(a.created_at || 0)).getTime());

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
      notifications: chatNotifications,
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
      select: 'id,nome,email,cpf,ativo,bloqueado,tentativas_falhas,ultima_tentativa_em,ultimo_login_em,bloqueado_em,passkey_enrolled_at,ultimo_mfa_em,ultimo_dispositivo,created_at',
      order: 'created_at.asc',
    });

    const items = await supabaseAdminRequest(env, `/rest/v1/super_admin_accounts?${accountsParams.toString()}`);

    return jsonResponse({
      success: true,
      items: Array.isArray(items) ? items : [],
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

    const [tenants, schools, ghostAccounts] = await Promise.all([
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
      buildGhostAccounts(env),
    ]);

    const tenantItems = Array.isArray(tenants) ? tenants : [];
    const schoolItems = Array.isArray(schools) ? schools : [];
    const schoolIdsWithTenant = new Set(tenantItems.map((tenant) => tenant?.escola_id).filter(Boolean));

    return jsonResponse({
      success: true,
      tenants: tenantItems,
      schoolsWithoutTenant: schoolItems.filter((school) => !schoolIdsWithTenant.has(school.id)),
      ghostAccounts: Array.isArray(ghostAccounts) ? ghostAccounts : [],
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
  'POST /v1/admin/tenants/:id/mass-audio-seed': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const allowed = await isSuperAdmin(user.id, env);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Sem permissao para gerar audios em massa.' }, 403);
    }

    const tenantId = getPathParam(request, /^\/v1\/admin\/tenants\/([^/]+)\/mass-audio-seed$/);
    if (!tenantId) {
      return jsonResponse({ success: false, error: 'ID do tenant ausente.' }, 400);
    }

    const body = await request.json().catch(() => ({}));
    const limit = Math.min(30, Math.max(1, Number(body?.limit || 8) || 8));

    const tenantPayload = await supabaseAdminRequest(
      env,
      `/rest/v1/tenants?${new URLSearchParams({
        select: 'id,escola_id,nome',
        id: `eq.${tenantId}`,
        limit: '1',
      }).toString()}`,
    );
    const tenant = Array.isArray(tenantPayload) ? (tenantPayload[0] || null) : null;

    if (!tenant?.id || !tenant?.escola_id) {
      return jsonResponse({ success: false, error: 'Tenant com escola vinculada nao encontrado.' }, 404);
    }

    const [livros, autores] = await Promise.all([
      supabaseAdminRequest(
        env,
        `/rest/v1/livros?${new URLSearchParams({
          select: 'id,titulo,autor,sinopse,escola_id',
          escola_id: `eq.${String(tenant.escola_id)}`,
          order: 'titulo.asc',
          limit: String(limit),
        }).toString()}`,
      ),
      supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
          select: 'id',
          escola_id: `eq.${String(tenant.escola_id)}`,
          order: 'created_at.asc',
          limit: '1',
        }).toString()}`,
      ),
    ]);

    return jsonResponse({
      success: true,
      tenant: {
        id: tenant.id,
        nome: tenant.nome || null,
        escola_id: tenant.escola_id,
      },
      autorComunidadeId: Array.isArray(autores) ? autores?.[0]?.id || null : null,
      livros: Array.isArray(livros) ? livros : [],
    });
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
  'POST /v1/admin/audiobooks': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const allowed = await isSuperAdmin(user.id, env);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Sem permissao para criar audiobook administrativo.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const created = await supabaseAdminRequest(env, '/rest/v1/audiobooks_biblioteca?select=id', {
      method: 'POST',
      body,
      headers: { Prefer: 'return=representation' },
    }) as Array<Record<string, unknown>>;

    return jsonResponse({ success: true, id: created?.[0]?.id || null });
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

    const relatedUserIds = [...new Set(
      [
        ...requestedUserIds,
        ...Array.from(foundProfilesByKey.values())
          .map((profile) => String(profile.user_id || '').trim())
          .filter(Boolean),
      ],
    )];

    if (relatedUserIds.length > 0) {
      const siblingProfiles = await supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
          select: 'id,user_id,escola_id',
          user_id: `in.(${relatedUserIds.join(',')})`,
        }).toString()}`,
      );

      (Array.isArray(siblingProfiles) ? siblingProfiles : []).forEach((profile) => {
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
  'POST /v1/admin/ghost-accounts/delete': async (request, env) => {
    const user = await fetchSupabaseUser(request, env);
    if (!user?.id) {
      return jsonResponse({ success: false, error: 'Nao autenticado.' }, 401);
    }

    const allowed = await isSuperAdmin(user.id, env);
    if (!allowed) {
      return jsonResponse({ success: false, error: 'Sem permissao para excluir contas fantasmas.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const profileId = String(body?.profile_id || '').trim();
    const userId = String(body?.user_id || '').trim();
    const escolaId = String(body?.escola_id || '').trim();

    if (!profileId && !userId) {
      return jsonResponse({ success: false, error: 'Informe a conta fantasma a ser excluida.' }, 400);
    }

    if (userId && userId === user.id) {
      return jsonResponse({ success: false, error: 'Voce nao pode excluir a propria conta por esta tela.' }, 400);
    }

    const payload = await callSupabaseFunction(request, env, 'excluir-usuarios-biblioteca', {
      ...(profileId ? { id: profileId } : {}),
      ...(userId ? { user_id: userId } : {}),
      ...(escolaId ? { escola_id: escolaId } : {}),
    });

    return jsonResponse({
      success: true,
      deleted_count: Number(payload?.deleted_count || 0),
      deleted_auth_only_count: Number(payload?.deleted_auth_only_count || 0),
      deleted_ids: Array.isArray(payload?.deleted_ids) ? payload.deleted_ids : [],
      deleted_user_ids: Array.isArray(payload?.deleted_user_ids) ? payload.deleted_user_ids : [],
      missing_ids: Array.isArray(payload?.missing_ids) ? payload.missing_ids : [],
    });
  },

  'GET /v1/emprestimos': async (request, env) => {
    const { profile, canManageLoans } = await getLoanModuleContext(request, env);

    const [emprestimos, livros, usuarios, solicitacoes] = await Promise.all([
      supabaseAdminRequest(
        env,
        `/rest/v1/emprestimos?${new URLSearchParams({
          select: 'id,livro_id,usuario_id,data_emprestimo,data_devolucao_prevista,data_devolucao_real,status,created_at,livros(titulo,autor,escola_id),usuarios_biblioteca(nome,email,turma,tipo,escola_id)',
          order: 'data_emprestimo.desc',
        }).toString()}`,
      ),
      supabaseAdminRequest(
        env,
        `/rest/v1/livros?${new URLSearchParams({
          select: 'id,titulo,autor,tombo,disponivel,escola_id',
          escola_id: `eq.${profile.escola_id}`,
          order: 'titulo.asc',
        }).toString()}`,
      ),
      supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
          select: 'id,nome,email,turma,tipo,escola_id',
          escola_id: `eq.${profile.escola_id}`,
          order: 'nome.asc',
        }).toString()}`,
      ),
      canManageLoans
        ? supabaseAdminRequest(
            env,
            `/rest/v1/solicitacoes_emprestimo?${new URLSearchParams({
              select: 'id,livro_id,usuario_id,mensagem,resposta,status,created_at,livros(id,titulo,autor,disponivel,escola_id),usuarios_biblioteca(nome,email,turma,tipo,escola_id),solicitacoes_emprestimo_mensagens(id,mensagem,autor_tipo,created_at)',
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
      if (!['pendente', 'indisponivel_em_analise'].includes(String(solicitacao.status || ''))) {
        return jsonResponse({ success: false, error: 'A solicitacao ja foi processada.' }, 400);
      }
      if (solicitacao?.livros?.disponivel === false && String(solicitacao.status || '') !== 'indisponivel_em_analise') {
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
        select: 'id,status,livro_id,livros(escola_id),usuarios_biblioteca(escola_id)',
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

      if (!['pendente', 'indisponivel_em_analise'].includes(String(solicitacao.status || ''))) {
        return jsonResponse({ success: false, error: 'A solicitacao ja foi processada.' }, 400);
      }

      await supabaseAdminRequest(env, `/rest/v1/solicitacoes_emprestimo?${new URLSearchParams({ id: `eq.${solicitacaoId}` }).toString()}`, {
        method: 'PATCH',
        body: { status: 'recusada', resposta },
        headers: { Prefer: 'return=minimal' },
      });

      if (String(solicitacao.status || '') === 'indisponivel_em_analise' && String(solicitacao.livro_id || '').trim()) {
        await supabaseAdminRequest(
          env,
          `/rest/v1/livros?${new URLSearchParams({ id: `eq.${String(solicitacao.livro_id || '').trim()}` }).toString()}`,
          {
            method: 'PATCH',
            body: { disponivel: true },
            headers: { Prefer: 'return=minimal' },
          },
        );
      }

    return jsonResponse({ success: true });
  },

  'POST /v1/solicitacoes-emprestimo/:id/indisponivel': async (request, env) => {
    const { profile, canManageLoans } = await getLoanModuleContext(request, env);
    if (!canManageLoans) {
      return jsonResponse({ success: false, error: 'Sem permissao para atualizar a disponibilidade.' }, 403);
    }

      const solicitacaoId = getPathParam(request, /^\/v1\/solicitacoes-emprestimo\/([^/]+)\/indisponivel$/i);
      const body = await request.json().catch(() => ({} as Record<string, unknown>));
      const resposta = String(body?.resposta || 'Livro marcado como indisponivel e em analise pela biblioteca.').trim();
      const [solicitacao] = await supabaseAdminRequest(
        env,
        `/rest/v1/solicitacoes_emprestimo?${new URLSearchParams({
          select: 'id,status,livro_id,livros(disponivel,escola_id),usuarios_biblioteca(escola_id)',
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
      return jsonResponse({ success: false, error: 'Apenas solicitacoes pendentes podem reservar o livro.' }, 400);
    }
    if (solicitacao?.livros?.disponivel === false) {
      return jsonResponse({ success: false, error: 'Este livro ja esta indisponivel.' }, 400);
    }

    await supabaseAdminRequest(
      env,
      `/rest/v1/livros?${new URLSearchParams({ id: `eq.${String(solicitacao.livro_id || '')}` }).toString()}`,
      {
        method: 'PATCH',
        body: { disponivel: false },
        headers: { Prefer: 'return=minimal' },
      },
    );

    await supabaseAdminRequest(env, `/rest/v1/solicitacoes_emprestimo?${new URLSearchParams({ id: `eq.${solicitacaoId}` }).toString()}`, {
      method: 'PATCH',
      body: { status: 'indisponivel_em_analise', resposta },
      headers: { Prefer: 'return=minimal' },
    });

    return jsonResponse({ success: true });
  },

  'POST /v1/solicitacoes-emprestimo/:id/chat': async (request, env) => {
    const { profile, canManageLoans } = await getLoanModuleContext(request, env);
    if (!canManageLoans) {
      return jsonResponse({ success: false, error: 'Sem permissao para responder solicitacoes.' }, 403);
    }

    const solicitacaoId = getPathParam(request, /^\/v1\/solicitacoes-emprestimo\/([^/]+)\/chat$/i);
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const mensagem = String(body?.mensagem || '').trim();
    if (!mensagem) {
      return jsonResponse({ success: false, error: 'Mensagem obrigatoria.' }, 400);
    }

    const [solicitacao] = await supabaseAdminRequest(
      env,
      `/rest/v1/solicitacoes_emprestimo?${new URLSearchParams({
        select: 'id,status,livro_id,usuario_id,livros(disponivel,escola_id),usuarios_biblioteca(escola_id)',
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
    if (['recusada', 'negada', 'cancelada', 'aprovada'].includes(String(solicitacao.status || '').toLowerCase())) {
      return jsonResponse({ success: false, error: 'Essa solicitacao ja foi finalizada.' }, 400);
    }

    await supabaseAdminRequest(env, '/rest/v1/solicitacoes_emprestimo_mensagens', {
      method: 'POST',
      body: [{
        solicitacao_id: solicitacaoId,
        autor_usuario_id: profile.id,
        autor_tipo: 'bibliotecaria',
        mensagem,
      }],
      headers: { Prefer: 'return=minimal' },
    });

    const nextStatus = String(solicitacao.status || '') === 'pendente' ? 'indisponivel_em_analise' : String(solicitacao.status || '');

    if (String(solicitacao.status || '') === 'pendente' && solicitacao?.livros?.disponivel !== false) {
      await supabaseAdminRequest(
        env,
        `/rest/v1/livros?${new URLSearchParams({ id: `eq.${String(solicitacao.livro_id || '')}` }).toString()}`,
        {
          method: 'PATCH',
          body: { disponivel: false },
          headers: { Prefer: 'return=minimal' },
        },
      );
    }

    await supabaseAdminRequest(env, `/rest/v1/solicitacoes_emprestimo?${new URLSearchParams({ id: `eq.${solicitacaoId}` }).toString()}`, {
      method: 'PATCH',
      body: { status: nextStatus, resposta: mensagem },
      headers: { Prefer: 'return=minimal' },
    });

    await notifyProfileIds(env, [String(solicitacao?.usuario_id || '').trim()], {
      title: 'Nova mensagem da biblioteca',
      body: mensagem,
      channelId: 'mensagens',
      path: '/emprestimos?tab=solicitacoes',
      extraData: {
        solicitacao_id: solicitacaoId,
      },
    }).catch((error) => {
      console.error('Falha ao enviar push de mensagem da bibliotecaria:', error);
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

    const deleted = await supabaseAdminRequest(env, `/rest/v1/emprestimos?${new URLSearchParams({ select: 'id', id: `eq.${emprestimoId}` }).toString()}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    }) as Array<Record<string, unknown>>;
    if (!Array.isArray(deleted) || !deleted[0]?.id) {
      return jsonResponse({ success: false, error: 'Emprestimo nao encontrado para exclusao.' }, 404);
    }

    return jsonResponse({ success: true });
  },

  'GET /v1/livros': async (request, env) => {
    const { profile } = await getBooksModuleContext(request, env);
    const escolaId = String(profile.escola_id || '').trim();

    const [escolaLivros, legacyLivros, categorias, emprestimosAtivos] = await Promise.all([
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
      escolaId
        ? supabaseAdminRequest(
            env,
            `/rest/v1/emprestimos?${new URLSearchParams({
              select: 'id,livro_id,livros!inner(escola_id)',
              status: 'eq.ativo',
              data_devolucao_real: 'is.null',
              'livros.escola_id': `eq.${escolaId}`,
              limit: '5000',
            }).toString()}`,
          ).catch(() => [])
        : Promise.resolve([]),
    ]);

    const byId = new Map<string, Record<string, unknown>>();
    [...(Array.isArray(escolaLivros) ? escolaLivros : []), ...(Array.isArray(legacyLivros) ? legacyLivros : [])].forEach((livro) => {
      const id = String(livro?.id || '').trim();
      if (id) byId.set(id, livro);
    });
    const activeLoanBookIds = Array.from(
      new Set(
        (Array.isArray(emprestimosAtivos) ? emprestimosAtivos : [])
          .map((item) => String(item?.livro_id || '').trim())
          .filter(Boolean),
      ),
    );
    const activeLoanBookIdSet = new Set(activeLoanBookIds);

    const preCategorias = Array.isArray(categorias) && categorias.length > 0
      ? Array.from(new Set(categorias.map((item) => String(item?.nome || '').trim()).filter(Boolean)))
      : DEFAULT_BOOK_CATEGORIES;

    return jsonResponse({
      success: true,
      escolaId: escolaId || null,
      livros: Array.from(byId.values()).sort((a, b) => String(a?.titulo || '').localeCompare(String(b?.titulo || ''), 'pt-BR')),
      preCategorias,
      activeLoanBookIds,
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

    const deleted = await supabaseAdminRequest(env, `/rest/v1/livros?${new URLSearchParams({ select: 'id', id: `eq.${livroId}` }).toString()}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    }) as Array<Record<string, unknown>>;
    if (!Array.isArray(deleted) || !deleted[0]?.id) {
      return jsonResponse({ success: false, error: 'Livro nao encontrado para exclusao.' }, 404);
    }

    return jsonResponse({ success: true });
  },

  'POST /v1/livros/categorias': async (request, env) => {
    const { caller, profile, canManageBooks } = await getBooksModuleContext(request, env);
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
      created_by: caller.id || null,
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

  'POST /v1/livros/categorias/update': async (request, env) => {
    const { caller, profile, canManageBooks } = await getBooksModuleContext(request, env);
    if (!canManageBooks) {
      return jsonResponse({ success: false, error: 'Sem permissao para gerenciar categorias.' }, 403);
    }

    const escolaId = String(profile.escola_id || '').trim();
    if (!escolaId) {
      return jsonResponse({ success: false, error: 'Nao foi possivel identificar a escola do usuario.' }, 400);
    }

    const body = await request.json().catch(() => ({}));
    const nomeAtual = String(body?.nome_atual || '').trim();
    const nomeNovo = String(body?.nome_novo || '').trim();
    if (!nomeAtual || !nomeNovo) {
      return jsonResponse({ success: false, error: 'Nome atual e novo nome da categoria sao obrigatorios.' }, 400);
    }

    const nomeAtualKey = normalizeBookCategoryKey(nomeAtual);
    const nomeNovoKey = normalizeBookCategoryKey(nomeNovo);
    if (!nomeAtualKey || !nomeNovoKey) {
      return jsonResponse({ success: false, error: 'Os nomes informados sao invalidos.' }, 400);
    }

    const categorias = await supabaseAdminRequest(
      env,
      `/rest/v1/categorias_livros?${new URLSearchParams({
        select: 'id,nome',
        escola_id: `eq.${escolaId}`,
        order: 'nome.asc',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;

    const categoriaAtual = (Array.isArray(categorias) ? categorias : []).find((item) => {
      const nomeCategoria = String(item?.nome || '').trim();
      return nomeCategoria === nomeAtual || normalizeBookCategoryKey(nomeCategoria) === nomeAtualKey;
    });

    const conflito = (Array.isArray(categorias) ? categorias : []).find((item) => {
      const nomeCategoria = String(item?.nome || '').trim();
      if (!nomeCategoria) return false;
      if (String(item?.id || '') === String(categoriaAtual?.id || '')) return false;
      return normalizeBookCategoryKey(nomeCategoria) === nomeNovoKey;
    });
    if (conflito) {
      return jsonResponse({ success: false, error: 'Ja existe uma categoria com esse nome.' }, 409);
    }

    const livrosDaEscola = await supabaseAdminRequest(
      env,
      `/rest/v1/livros?${new URLSearchParams({
        select: 'id,area',
        escola_id: `eq.${escolaId}`,
        limit: '5000',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;

    const livrosParaAtualizar = (Array.isArray(livrosDaEscola) ? livrosDaEscola : []).filter((livro) => {
      const areaLivro = String(livro?.area || '').trim();
      return normalizeBookCategoryKey(areaLivro) === nomeAtualKey;
    });

    if (!categoriaAtual?.id && livrosParaAtualizar.length === 0) {
      return jsonResponse({ success: false, error: 'Categoria nao encontrada para atualizacao.' }, 404);
    }

    if (categoriaAtual?.id) {
      await supabaseAdminRequest(
        env,
        `/rest/v1/categorias_livros?${new URLSearchParams({ id: `eq.${String(categoriaAtual.id)}` }).toString()}`,
        {
          method: 'PATCH',
          body: { nome: nomeNovo },
          headers: { Prefer: 'return=minimal' },
        },
      );
    } else {
      await supabaseAdminRequest(env, '/rest/v1/categorias_livros', {
        method: 'POST',
        body: {
          escola_id: escolaId,
          nome: nomeNovo,
          created_by: caller.id || null,
        },
        headers: {
          Prefer: 'resolution=merge-duplicates,return=minimal',
        },
      });
    }

    await Promise.all(
      livrosParaAtualizar.map((livro) =>
        supabaseAdminRequest(
          env,
          `/rest/v1/livros?${new URLSearchParams({ id: `eq.${String(livro.id || '')}` }).toString()}`,
          {
            method: 'PATCH',
            body: { area: nomeNovo },
            headers: { Prefer: 'return=minimal' },
          },
        ),
      ),
    );

    return jsonResponse({ success: true, updatedBooks: livrosParaAtualizar.length });
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

    const deleted = await supabaseAdminRequest(
      env,
      `/rest/v1/categorias_livros?${new URLSearchParams({
        select: 'id',
        escola_id: `eq.${escolaId}`,
        nome: `eq.${nome}`,
      }).toString()}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      },
    ) as Array<Record<string, unknown>>;
    if (!Array.isArray(deleted) || deleted.length === 0) {
      return jsonResponse({ success: false, error: 'Categoria nao encontrada para exclusao.' }, 404);
    }

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

  'GET /v1/tokens-convite': async (request, env) => {
    const { canManageUsers, currentEscolaId } = await getUsersModuleContext(request, env);
    if (!canManageUsers || !currentEscolaId) {
      return jsonResponse({ success: false, error: 'Sem permissao para listar tokens de convite.' }, 403);
    }

    const tokens = await supabaseAdminRequest(
      env,
      `/rest/v1/tokens_convite?${new URLSearchParams({
        select: 'id,token,role_destino,criado_por,usado_por,ativo,created_at,expira_em,escola_id',
        escola_id: `eq.${currentEscolaId}`,
        order: 'created_at.desc',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;

    const profileIds = [...new Set(
      (Array.isArray(tokens) ? tokens : [])
        .flatMap((item) => [String(item?.criado_por || '').trim(), String(item?.usado_por || '').trim()])
        .filter(Boolean),
    )];

    let profilesById: Record<string, { nome: string; role: string }> = {};
    if (profileIds.length > 0) {
      const profiles = await supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
          select: 'id,user_id,nome,tipo',
          user_id: `in.(${profileIds.join(',')})`,
        }).toString()}`,
      ) as Array<Record<string, unknown>>;

      profilesById = (Array.isArray(profiles) ? profiles : []).reduce((acc, item) => {
        const userId = String(item?.user_id || '').trim();
        if (!userId) return acc;
        acc[userId] = {
          nome: String(item?.nome || '').trim() || 'Usuario',
          role: String(item?.tipo || '').trim() || '',
        };
        return acc;
      }, {} as Record<string, { nome: string; role: string }>);
    }

    return jsonResponse({
      success: true,
      tokens: Array.isArray(tokens) ? tokens : [],
      criadoresInfo: Object.fromEntries(
        Object.entries(profilesById).map(([id, item]) => [id, { nome: item.nome }]),
      ),
      utilizadoresInfo: profilesById,
    });
  },

  'POST /v1/tokens-convite': async (request, env) => {
    const { canManageUsers, currentEscolaId, profile, caller } = await getUsersModuleContext(request, env);
    if (!canManageUsers || !currentEscolaId || !caller?.id) {
      return jsonResponse({ success: false, error: 'Sem permissao para gerar token de convite.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const roleDestino = String(body?.roleDestino || '').trim().toLowerCase();
    const allowedRoles = ['professor', 'bibliotecaria', 'aluno'];
    if (!allowedRoles.includes(roleDestino)) {
      return jsonResponse({ success: false, error: 'Cargo de convite invalido.' }, 400);
    }

    const expiresAt = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000)).toISOString();
    const created = await supabaseAdminRequest(env, '/rest/v1/tokens_convite?select=*', {
      method: 'POST',
      body: [{
        role_destino: roleDestino,
        criado_por: caller.id,
        escola_id: currentEscolaId,
        ativo: true,
        expira_em: expiresAt,
      }],
      headers: { Prefer: 'return=representation' },
    }) as Array<Record<string, unknown>>;

    return jsonResponse({
      success: true,
      token: created?.[0] || null,
      criadoresInfo: caller?.id ? { [String(caller.id)]: { nome: String(profile?.nome || 'Usuario') } } : {},
    });
  },

  'POST /v1/tokens-convite/:id/delete': async (request, env) => {
    const { canManageUsers, currentEscolaId } = await getUsersModuleContext(request, env);
    if (!canManageUsers || !currentEscolaId) {
      return jsonResponse({ success: false, error: 'Sem permissao para apagar token de convite.' }, 403);
    }

    const tokenId = getPathParam(request, /^\/v1\/tokens-convite\/([^/]+)\/delete$/i);
    if (!tokenId) {
      return jsonResponse({ success: false, error: 'Token nao informado.' }, 400);
    }

    const deleted = await supabaseAdminRequest(
      env,
      `/rest/v1/tokens_convite?${new URLSearchParams({
        select: 'id',
        id: `eq.${tokenId}`,
        escola_id: `eq.${currentEscolaId}`,
      }).toString()}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      },
    ) as Array<Record<string, unknown>>;
    if (!Array.isArray(deleted) || !deleted[0]?.id) {
      return jsonResponse({ success: false, error: 'Token nao encontrado para exclusao.' }, 404);
    }

    return jsonResponse({ success: true });
  },

  'GET /v1/escola/config': async (request, env) => {
    const { isGestor, currentEscolaId } = await getUsersModuleContext(request, env);
    if (!isGestor || !currentEscolaId) {
      return jsonResponse({ success: false, error: 'Sem permissao para carregar a configuracao da escola.' }, 403);
    }

    const [escola] = await supabaseAdminRequest(
      env,
      `/rest/v1/escolas?${new URLSearchParams({
        select: 'id,nome,gestor_id',
        id: `eq.${currentEscolaId}`,
        limit: '1',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;

    const [salas, usuariosSala, professorTurmasEscola] = await Promise.all([
      supabaseAdminRequest(
        env,
        `/rest/v1/salas_cursos?${new URLSearchParams({
          select: 'id,nome,tipo,escola_id',
          escola_id: `eq.${currentEscolaId}`,
          order: 'nome.asc',
        }).toString()}`,
      ).catch(() => []),
      supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
          select: 'turma',
          escola_id: `eq.${currentEscolaId}`,
        }).toString()}`,
      ).catch(() => []),
      supabaseAdminRequest(
        env,
        `/rest/v1/professor_turmas?${new URLSearchParams({
          select: 'turma',
          escola_id: `eq.${currentEscolaId}`,
        }).toString()}`,
      ).catch(() => []),
    ]) as Array<Array<Record<string, unknown>>>;

    const salasOficiais = Array.isArray(salas) ? salas : [];
    const oficiaisKeys = new Set(
      salasOficiais
        .map((item) => normalizeTurmaKey(item?.nome))
        .filter(Boolean),
    );
    const extras = new Map<string, Record<string, unknown>>();

    [...(Array.isArray(usuariosSala) ? usuariosSala : []), ...(Array.isArray(professorTurmasEscola) ? professorTurmasEscola : [])].forEach((item) => {
      const nome = String(item?.turma || '').trim();
      if (!nome) return;
      const key = normalizeTurmaKey(nome);
      if (!key || oficiaisKeys.has(key) || extras.has(key)) return;
      extras.set(key, {
        id: `orphan-${key}`,
        nome,
        tipo: 'sala',
        escola_id: currentEscolaId,
        orphan: true,
      });
    });

    return jsonResponse({
      success: true,
      escola: escola || null,
      salas: [...salasOficiais, ...Array.from(extras.values())]
        .sort((a, b) => String(a?.nome || '').localeCompare(String(b?.nome || ''), 'pt-BR')),
    });
  },

  'POST /v1/escola/config': async (request, env) => {
    const { isGestor, currentEscolaId } = await getUsersModuleContext(request, env);
    if (!isGestor || !currentEscolaId) {
      return jsonResponse({ success: false, error: 'Sem permissao para editar a escola.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const nome = String(body?.nome || '').trim();
    if (!nome) {
      return jsonResponse({ success: false, error: 'Nome da escola obrigatorio.' }, 400);
    }

    const updated = await supabaseAdminRequest(
      env,
      `/rest/v1/escolas?${new URLSearchParams({ id: `eq.${currentEscolaId}`, select: 'id,nome,gestor_id' }).toString()}`,
      {
        method: 'PATCH',
        body: { nome },
        headers: { Prefer: 'return=representation' },
      },
    ) as Array<Record<string, unknown>>;

    return jsonResponse({ success: true, escola: updated?.[0] || null });
  },

  'POST /v1/escola/salas': async (request, env) => {
    const { isGestor, currentEscolaId } = await getUsersModuleContext(request, env);
    if (!isGestor || !currentEscolaId) {
      return jsonResponse({ success: false, error: 'Sem permissao para criar salas ou cursos.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const nome = String(body?.nome || '').trim();
    const tipo = String(body?.tipo || 'sala').trim().toLowerCase();
    if (!nome) {
      return jsonResponse({ success: false, error: 'Nome obrigatorio.' }, 400);
    }

    const created = await supabaseAdminRequest(env, '/rest/v1/salas_cursos?select=id,nome,tipo,escola_id', {
      method: 'POST',
      body: [{ nome, tipo, escola_id: currentEscolaId }],
      headers: { Prefer: 'return=representation' },
    }) as Array<Record<string, unknown>>;

    return jsonResponse({ success: true, sala: created?.[0] || null });
  },

  'PATCH /v1/escola/salas/:id': async (request, env) => {
    const { isGestor, currentEscolaId } = await getUsersModuleContext(request, env);
    if (!isGestor || !currentEscolaId) {
      return jsonResponse({ success: false, error: 'Sem permissao para editar salas.' }, 403);
    }

    const salaId = getPathParam(request, /^\/v1\/escola\/salas\/([^/]+)$/i);
    const body = await request.json().catch(() => ({}));
    const nome = String(body?.nome || '').trim();
    if (!salaId || !nome) {
      return jsonResponse({ success: false, error: 'Sala e nome sao obrigatorios.' }, 400);
    }

    const [salaAtual] = await supabaseAdminRequest(
      env,
      `/rest/v1/salas_cursos?${new URLSearchParams({
        select: 'id,nome,tipo,escola_id',
        id: `eq.${salaId}`,
        escola_id: `eq.${currentEscolaId}`,
        limit: '1',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;

    if (!salaAtual?.id) {
      return jsonResponse({ success: false, error: 'Sala nao encontrada para esta escola.' }, 404);
    }

    await supabaseAdminRequest(
      env,
      `/rest/v1/salas_cursos?${new URLSearchParams({ id: `eq.${salaId}` }).toString()}`,
      {
        method: 'PATCH',
        body: { nome },
        headers: { Prefer: 'return=minimal' },
      },
    );

    const nomeAnterior = String(salaAtual?.nome || '').trim();
    if (nomeAnterior && nomeAnterior !== nome) {
      await supabaseAdminRequest(
        env,
        `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
          escola_id: `eq.${currentEscolaId}`,
          turma: `eq.${nomeAnterior}`,
        }).toString()}`,
        {
          method: 'PATCH',
          body: { turma: nome },
          headers: { Prefer: 'return=minimal' },
        },
      ).catch(() => null);

      await supabaseAdminRequest(
        env,
        `/rest/v1/professor_turmas?${new URLSearchParams({
          escola_id: `eq.${currentEscolaId}`,
          turma: `eq.${nomeAnterior}`,
        }).toString()}`,
        {
          method: 'PATCH',
          body: { turma: nome },
          headers: { Prefer: 'return=minimal' },
        },
      ).catch(() => null);
    }

    return jsonResponse({ success: true });
  },

  'POST /v1/escola/salas/delete': async (request, env) => {
    const { isGestor, currentEscolaId } = await getUsersModuleContext(request, env);
    if (!isGestor || !currentEscolaId) {
      return jsonResponse({ success: false, error: 'Sem permissao para excluir salas.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const salaId = String(body?.salaId || '').trim();
    const salaNome = String(body?.salaNome || '').trim();

    let targetSalaNome = salaNome;
    if (salaId) {
      const [sala] = await supabaseAdminRequest(
        env,
        `/rest/v1/salas_cursos?${new URLSearchParams({
          select: 'id,nome',
          id: `eq.${salaId}`,
          escola_id: `eq.${currentEscolaId}`,
          limit: '1',
        }).toString()}`,
      ) as Array<Record<string, unknown>>;

      if (!sala?.id) {
        return jsonResponse({ success: false, error: 'Sala nao encontrada para esta escola.' }, 404);
      }

      targetSalaNome = String(sala?.nome || '').trim();
    }

    if (!targetSalaNome) {
      return jsonResponse({ success: false, error: 'Sala nao informada.' }, 400);
    }

    const usuariosDaSala = await supabaseAdminRequest(
      env,
      `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
        select: 'id',
        escola_id: `eq.${currentEscolaId}`,
        turma: `eq.${targetSalaNome}`,
      }).toString()}`,
    ).catch(() => []) as Array<Record<string, unknown>>;

    const usuarioIds = (Array.isArray(usuariosDaSala) ? usuariosDaSala : [])
      .map((item) => String(item?.id || '').trim())
      .filter(Boolean);

    if (usuarioIds.length > 0) {
      await callSupabaseFunction(request, env, 'excluir-usuarios-biblioteca', { ids: usuarioIds, escola_id: currentEscolaId });
    }

    await supabaseAdminRequest(
      env,
      `/rest/v1/professor_turmas?${new URLSearchParams({
        escola_id: `eq.${currentEscolaId}`,
        turma: `eq.${targetSalaNome}`,
      }).toString()}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      },
    ).catch(() => null);

    if (salaId) {
      const deletedSala = await supabaseAdminRequest(
        env,
        `/rest/v1/salas_cursos?${new URLSearchParams({
          select: 'id',
          id: `eq.${salaId}`,
          escola_id: `eq.${currentEscolaId}`,
        }).toString()}`,
        {
          method: 'DELETE',
          headers: { Prefer: 'return=representation' },
        },
      ) as Array<Record<string, unknown>>;
      if (!Array.isArray(deletedSala) || !deletedSala[0]?.id) {
        return jsonResponse({ success: false, error: 'Sala nao encontrada para exclusao.' }, 404);
      }
    }

    return jsonResponse({ success: true });
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

  'POST /v1/usuarios/:id/delete': async (request, env) => {
    const { canManageUsers } = await getUsersModuleContext(request, env);
    if (!canManageUsers) {
      return jsonResponse({ success: false, error: 'Sem permissao para excluir usuarios.' }, 403);
    }

    const usuarioId = getPathParam(request, /^\/v1\/usuarios\/([^/]+)\/delete$/i);
    const payload = await callSupabaseFunction(request, env, 'excluir-usuarios-biblioteca', {
      ids: usuarioId ? [usuarioId] : [],
    });
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

  'GET /v1/arquivos-aula': async (request, env) => {
    const context = await getArquivosAulaModuleContext(request, env);

    let posts: Array<Record<string, unknown>> = [];
    let enabled = true;
    try {
      if (!context.escolaId) {
        return jsonResponse({
          success: true,
          enabled,
          perfilId: context.perfilId,
          perfilNome: context.profile?.nome || null,
          escolaId: context.escolaId,
          alunoTurma: context.profile?.turma || null,
          professorTurmas: context.professorTurmas,
          professoresPermitidos: context.professoresPermitidos,
          posts: [],
        });
      }

      const rawPosts = await supabaseAdminRequest(
        env,
        `/rest/v1/arquivos_aula_posts?${new URLSearchParams({
          select: '*',
          escola_id: `eq.${context.escolaId}`,
          order: 'created_at.desc',
        }).toString()}`,
      );
      posts = Array.isArray(rawPosts) ? rawPosts : [];
    } catch (error) {
      if (isMissingTableMessage(error)) {
        enabled = false;
      } else {
        throw error;
      }
    }

    if (enabled && posts.length > 0) {
      const authorIds = [...new Set(posts.map((item) => String(item?.autor_id || '').trim()).filter(Boolean))];
      if (authorIds.length > 0) {
        const authors = await supabaseAdminRequest(
          env,
          `/rest/v1/usuarios_biblioteca?${new URLSearchParams({
            select: 'id,nome',
            id: `in.(${authorIds.join(',')})`,
          }).toString()}`,
        ).catch(() => []);
        const authorMap = new Map((Array.isArray(authors) ? authors : []).map((item) => [String(item?.id || ''), String(item?.nome || '')]));
        posts = posts.map((item) => ({
          ...item,
          autor_nome: String(item?.autor_nome || '').trim() || authorMap.get(String(item?.autor_id || '')) || null,
        }));
      }
    }

    const turmasProfessor = new Set(context.professorTurmas.map((item) => normalizeTurmaKey(item)).filter(Boolean));
    const turmaAluno = normalizeTurmaKey(context.profile?.turma);
    const perfilId = String(context.perfilId || '').trim();
    posts = posts.filter((item) => {
      const turmaPost = normalizeTurmaKey(item?.turma_publico);
      if (context.tipo === 'aluno') {
        return !turmaPost || turmaPost === turmaAluno;
      }
      if (context.tipo === 'professor') {
        const autorId = String(item?.autor_id || '').trim();
        return autorId === perfilId || !turmaPost || turmasProfessor.has(turmaPost);
      }
      return true;
    });

    return jsonResponse({
      success: true,
      enabled,
      perfilId: context.perfilId,
      perfilNome: context.profile?.nome || null,
      escolaId: context.escolaId,
      alunoTurma: context.profile?.turma || null,
      professorTurmas: context.professorTurmas,
      professoresPermitidos: context.professoresPermitidos,
      posts,
    });
  },

  'POST /v1/arquivos-aula': async (request, env) => {
    const context = await getArquivosAulaModuleContext(request, env);
    if (context.tipo !== 'professor' || !context.perfilId || !context.escolaId) {
      return jsonResponse({ success: false, error: 'Apenas professores podem publicar materiais.' }, 403);
    }

    const body = await request.json().catch(() => ({}));
    const mensagem = String(body?.mensagem || '').trim();
    const turmaPublico = body?.turma_publico ? String(body.turma_publico).trim() : null;
    const arquivos = Array.isArray(body?.arquivos) ? body.arquivos : [];

    if (!mensagem || arquivos.length === 0) {
      return jsonResponse({ success: false, error: 'Mensagem e arquivos sao obrigatorios.' }, 400);
    }

    if (!context.professorTurmas.length) {
      return jsonResponse({ success: false, error: 'Professor sem turmas liberadas para publicar arquivos.' }, 403);
    }

    if (turmaPublico && !context.professorTurmas.includes(turmaPublico)) {
      return jsonResponse({ success: false, error: 'Turma nao permitida para este professor.' }, 403);
    }

    await supabaseAdminRequest(env, '/rest/v1/arquivos_aula_posts', {
      method: 'POST',
      body: {
        autor_id: context.perfilId,
        autor_nome: context.profile?.nome || null,
        escola_id: context.escolaId,
        turma_publico: turmaPublico,
        mensagem,
        arquivos,
      },
      headers: { Prefer: 'return=minimal' },
    });

    return jsonResponse({ success: true });
  },

  'PATCH /v1/arquivos-aula/:id/arquivos': async (request, env) => {
    const context = await getArquivosAulaModuleContext(request, env);
    if (context.tipo !== 'professor' || !context.perfilId) {
      return jsonResponse({ success: false, error: 'Apenas professores podem editar arquivos publicados.' }, 403);
    }
    const postId = getPathParam(request, /^\/v1\/arquivos-aula\/([^/]+)\/arquivos$/i);
    const body = await request.json().catch(() => ({}));
    const arquivos = Array.isArray(body?.arquivos) ? body.arquivos : [];

    const existingRows = await supabaseAdminRequest(
      env,
      `/rest/v1/arquivos_aula_posts?${new URLSearchParams({
        select: 'id,autor_id',
        id: `eq.${postId}`,
        limit: '1',
      }).toString()}`,
    );
    const post = Array.isArray(existingRows) ? (existingRows[0] || null) : null;
    if (!post?.id) {
      return jsonResponse({ success: false, error: 'Publicacao nao encontrada.' }, 404);
    }
    if (String(post?.autor_id || '') !== String(context.perfilId || '')) {
      return jsonResponse({ success: false, error: 'Voce so pode editar arquivos publicados por voce.' }, 403);
    }

    await supabaseAdminRequest(
      env,
      `/rest/v1/arquivos_aula_posts?${new URLSearchParams({ id: `eq.${postId}` }).toString()}`,
      {
        method: 'PATCH',
        body: { arquivos },
        headers: { Prefer: 'return=minimal' },
      },
    );

    return jsonResponse({ success: true });
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
      escolaId
        ? supabaseAdminRequest(env, `/rest/v1/comunidade_posts?${new URLSearchParams({
          select: '*,livros(titulo,autor),audiobooks_biblioteca(titulo,autor,audio_url),usuarios_biblioteca!comunidade_posts_autor_id_fkey(nome)',
          escola_id: `eq.${escolaId}`,
          order: 'created_at.desc',
        }).toString()}`).catch(() => [])
        : Promise.resolve([]),
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
            select: 'id,titulo,conteudo,turma_publico,created_at,tipo,expires_at,audio_url,audio_duration_seconds',
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
        supabaseAdminRequest(env, `/rest/v1/solicitacoes_emprestimo?${new URLSearchParams({ select: '*,livros(titulo,autor),solicitacoes_emprestimo_mensagens(id,mensagem,autor_tipo,created_at)', usuario_id: `eq.${profile.id}`, order: 'created_at.desc' }).toString()}`),
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

    const created = await supabaseAdminRequest(env, '/rest/v1/solicitacoes_emprestimo', {
      method: 'POST',
      body: { livro_id: livroId, usuario_id: alunoId, mensagem },
      headers: { Prefer: 'return=representation' },
    });

    const solicitacaoId = Array.isArray(created) ? String(created?.[0]?.id || '').trim() : '';
    if (solicitacaoId && mensagem) {
      await supabaseAdminRequest(env, '/rest/v1/solicitacoes_emprestimo_mensagens', {
        method: 'POST',
        body: [{
          solicitacao_id: solicitacaoId,
          autor_usuario_id: alunoId,
          autor_tipo: 'aluno',
          mensagem,
        }],
        headers: { Prefer: 'return=minimal' },
      });
    }

    return jsonResponse({ success: true });
  },

  'POST /v1/arquivos-aula/:id/delete': async (request, env) => {
    const context = await getArquivosAulaModuleContext(request, env);
    const postId = getPathParam(request, /^\/v1\/arquivos-aula\/([^/]+)\/delete$/i);

    const existingRows = await supabaseAdminRequest(
      env,
      `/rest/v1/arquivos_aula_posts?${new URLSearchParams({
        select: 'id,autor_id',
        id: `eq.${postId}`,
        limit: '1',
      }).toString()}`,
    );
    const post = Array.isArray(existingRows) ? (existingRows[0] || null) : null;
    if (!post?.id) {
      return jsonResponse({ success: false, error: 'Publicacao nao encontrada.' }, 404);
    }
    if (String(post?.autor_id || '') !== String(context.perfilId || '')) {
      return jsonResponse({ success: false, error: 'Voce so pode excluir publicacoes feitas por voce.' }, 403);
    }

    const deleted = await supabaseAdminRequest(
      env,
      `/rest/v1/arquivos_aula_posts?${new URLSearchParams({
        select: 'id',
        id: `eq.${postId}`,
      }).toString()}`,
      {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      },
    ) as Array<Record<string, unknown>>;

    if (!Array.isArray(deleted) || !deleted[0]?.id) {
      return jsonResponse({ success: false, error: 'Publicacao nao encontrada para exclusao.' }, 404);
    }

    return jsonResponse({ success: true });
  },
  'POST /v1/aluno/solicitacoes-emprestimo/prorrogacao': async (request, env) => {
    const { alunoId } = await getCommunityModuleContext(request, env);
    if (!alunoId) {
      return jsonResponse({ success: false, error: 'Perfil do aluno nao encontrado.' }, 400);
    }

    const body = await request.json().catch(() => ({}));
    const livroId = String(body?.livroId || '').trim();
    const emprestimoId = String(body?.emprestimoId || '').trim();
    const mensagem = String(body?.mensagem || '').trim() || 'Pedido de extensao de prazo para devolucao.';
    const dataDevolucaoAtual = body?.dataDevolucaoAtual ? String(body.dataDevolucaoAtual) : null;
    const novaData = body?.novaDataDevolucaoSolicitada ? String(body.novaDataDevolucaoSolicitada) : null;

    if (!livroId || !emprestimoId || !novaData) {
      return jsonResponse({ success: false, error: 'Dados insuficientes para solicitar prorrogacao.' }, 400);
    }

    const created = await supabaseAdminRequest(env, '/rest/v1/solicitacoes_emprestimo', {
      method: 'POST',
      body: {
        livro_id: livroId,
        usuario_id: alunoId,
        emprestimo_id: emprestimoId,
        tipo: 'prorrogacao',
        mensagem,
        data_devolucao_atual: dataDevolucaoAtual,
        nova_data_devolucao_solicitada: novaData,
      },
      headers: { Prefer: 'return=representation' },
    });

    const solicitacaoId = Array.isArray(created) ? String(created?.[0]?.id || '').trim() : '';
    if (solicitacaoId && mensagem) {
      await supabaseAdminRequest(env, '/rest/v1/solicitacoes_emprestimo_mensagens', {
        method: 'POST',
        body: [{
          solicitacao_id: solicitacaoId,
          autor_usuario_id: alunoId,
          autor_tipo: 'aluno',
          mensagem,
        }],
        headers: { Prefer: 'return=minimal' },
      });
    }

    return jsonResponse({ success: true });
  },

  'POST /v1/aluno/solicitacoes-emprestimo/:id/chat': async (request, env) => {
    const { alunoId } = await getCommunityModuleContext(request, env);
    if (!alunoId) {
      return jsonResponse({ success: false, error: 'Perfil do aluno nao encontrado.' }, 400);
    }

    const solicitacaoId = getPathParam(request, /^\/v1\/aluno\/solicitacoes-emprestimo\/([^/]+)\/chat$/i);
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
    const mensagem = String(body?.mensagem || '').trim();
    if (!mensagem) {
      return jsonResponse({ success: false, error: 'Mensagem obrigatoria.' }, 400);
    }

    const [solicitacao] = await supabaseAdminRequest(
      env,
      `/rest/v1/solicitacoes_emprestimo?${new URLSearchParams({
        select: 'id,usuario_id,status',
        id: `eq.${solicitacaoId}`,
        limit: '1',
      }).toString()}`,
    ) as Array<Record<string, unknown>>;

    if (!solicitacao?.id || String(solicitacao.usuario_id || '') !== String(alunoId || '')) {
      return jsonResponse({ success: false, error: 'Solicitacao nao encontrada.' }, 404);
    }
    if (['recusada', 'negada', 'cancelada', 'aprovada'].includes(String(solicitacao.status || '').toLowerCase())) {
      return jsonResponse({ success: false, error: 'Essa solicitacao ja foi finalizada.' }, 400);
    }

    await supabaseAdminRequest(env, '/rest/v1/solicitacoes_emprestimo_mensagens', {
      method: 'POST',
      body: [{
        solicitacao_id: solicitacaoId,
        autor_usuario_id: alunoId,
        autor_tipo: 'aluno',
        mensagem,
      }],
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

  'POST /v1/aluno/avaliacoes': async (request, env) => {
    const { profile } = await getCommunityModuleContext(request, env);
    if (!profile?.id) {
      return jsonResponse({ success: false, error: 'Perfil do aluno nao encontrado.' }, 400);
    }
    const body = await request.json().catch(() => ({}));
    const livroId = String(body?.livroId || '').trim();
    const nota = Number(body?.nota || 0);
    const resenha = String(body?.resenha || '').trim() || null;
    if (!livroId) {
      return jsonResponse({ success: false, error: 'Livro invalido.' }, 400);
    }
    await supabaseAdminRequest(env, '/rest/v1/avaliacoes_livros?on_conflict=livro_id,usuario_id', {
      method: 'POST',
      body: [{ livro_id: livroId, usuario_id: profile.id, nota, resenha }],
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    return jsonResponse({ success: true });
  },

  'POST /v1/aluno/atividades/entregas': async (request, env) => {
    const { profile } = await getCommunityModuleContext(request, env);
    if (!profile?.id) {
      return jsonResponse({ success: false, error: 'Perfil do aluno nao encontrado.' }, 400);
    }
    const body = await request.json().catch(() => ({}));
    const atividadeId = String(body?.atividadeId || '').trim();
    if (!atividadeId) {
      return jsonResponse({ success: false, error: 'Atividade invalida.' }, 400);
    }
    await supabaseAdminRequest(env, '/rest/v1/atividades_entregas?on_conflict=atividade_id,aluno_id', {
      method: 'POST',
      body: [{
        atividade_id: atividadeId,
        aluno_id: profile.id,
        texto_entrega: String(body?.textoEntrega || ''),
        status: String(body?.status || 'enviada'),
        enviado_em: body?.enviadoEm || new Date().toISOString(),
      }],
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    return jsonResponse({ success: true });
  },

  'POST /v1/aluno/audiobooks': async (request, env) => {
    const { profile, escolaId } = await getCommunityModuleContext(request, env);
    if (!profile?.id || !escolaId) {
      return jsonResponse({ success: false, error: 'Perfil do aluno nao encontrado.' }, 400);
    }
    const body = await request.json().catch(() => ({}));
    await supabaseAdminRequest(env, '/rest/v1/audiobooks_biblioteca', {
      method: 'POST',
      body: {
        ...body,
        escola_id: escolaId,
        criado_por: profile.id,
      },
      headers: { Prefer: 'return=minimal' },
    });
    return jsonResponse({ success: true });
  },

  'POST /v1/aluno/meus-audiobooks/toggle': async (request, env) => {
    const { profile } = await getCommunityModuleContext(request, env);
    if (!profile?.id) {
      return jsonResponse({ success: false, error: 'Perfil do aluno nao encontrado.' }, 400);
    }
    const body = await request.json().catch(() => ({}));
    const audiobookId = String(body?.audiobookId || '').trim();
    const enabled = body?.enabled === true;
    if (!audiobookId) {
      return jsonResponse({ success: false, error: 'Audiobook invalido.' }, 400);
    }
    if (enabled) {
      await supabaseAdminRequest(env, '/rest/v1/aluno_audiobooks', {
        method: 'POST',
        body: { aluno_id: profile.id, audiobook_id: audiobookId, progresso_segundos: 0 },
        headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
      });
    } else {
      await supabaseAdminRequest(env, `/rest/v1/aluno_audiobooks?${new URLSearchParams({
        aluno_id: `eq.${profile.id}`,
        audiobook_id: `eq.${audiobookId}`,
      }).toString()}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=minimal' },
      });
    }
    return jsonResponse({ success: true });
  },

  'POST /v1/aluno/laboratorio/criacoes': async (request, env) => {
    const { profile, escolaId } = await getCommunityModuleContext(request, env);
    if (!profile?.id || !escolaId) {
      return jsonResponse({ success: false, error: 'Perfil do aluno nao encontrado.' }, 400);
    }
    const body = await request.json().catch(() => ({}));
    await supabaseAdminRequest(env, '/rest/v1/laboratorio_criacoes', {
      method: 'POST',
      body: { ...body, aluno_id: profile.id, escola_id: escolaId },
      headers: { Prefer: 'return=minimal' },
    });
    return jsonResponse({ success: true });
  },

  'PATCH /v1/aluno/laboratorio/criacoes/:id': async (request, env) => {
    const { profile } = await getCommunityModuleContext(request, env);
    const criacaoId = getPathParam(request, /^\/v1\/aluno\/laboratorio\/criacoes\/([^/]+)$/i);
    const [criacao] = await supabaseAdminRequest(
      env,
      `/rest/v1/laboratorio_criacoes?${new URLSearchParams({ select: 'id,aluno_id', id: `eq.${criacaoId}`, limit: '1' }).toString()}`,
    ) as Array<Record<string, unknown>>;
    if (!criacao?.id || String(criacao?.aluno_id || '') !== String(profile?.id || '')) {
      return jsonResponse({ success: false, error: 'Criacao nao encontrada para este aluno.' }, 404);
    }
    const body = await request.json().catch(() => ({}));
    await supabaseAdminRequest(env, `/rest/v1/laboratorio_criacoes?${new URLSearchParams({ id: `eq.${criacaoId}` }).toString()}`, {
      method: 'PATCH',
      body,
      headers: { Prefer: 'return=minimal' },
    });
    return jsonResponse({ success: true });
  },

  'POST /v1/aluno/laboratorio/criacoes/:id/delete': async (request, env) => {
    const { profile } = await getCommunityModuleContext(request, env);
    const criacaoId = getPathParam(request, /^\/v1\/aluno\/laboratorio\/criacoes\/([^/]+)\/delete$/i);
    const body = await request.json().catch(() => ({}));
    const comunidadePostId = String(body?.comunidadePostId || '').trim();
    const [criacao] = await supabaseAdminRequest(
      env,
      `/rest/v1/laboratorio_criacoes?${new URLSearchParams({ select: 'id,aluno_id,comunidade_post_id', id: `eq.${criacaoId}`, limit: '1' }).toString()}`,
    ) as Array<Record<string, unknown>>;
    if (!criacao?.id || String(criacao?.aluno_id || '') !== String(profile?.id || '')) {
      return jsonResponse({ success: false, error: 'Criacao nao encontrada para este aluno.' }, 404);
    }
    const postIdToDelete = comunidadePostId || String(criacao?.comunidade_post_id || '').trim();
    if (postIdToDelete) {
      await supabaseAdminRequest(env, `/rest/v1/comunidade_posts?${new URLSearchParams({ select: 'id', id: `eq.${postIdToDelete}` }).toString()}`, {
        method: 'DELETE',
        headers: { Prefer: 'return=representation' },
      }).catch(() => null);
    }
    const deleted = await supabaseAdminRequest(env, `/rest/v1/laboratorio_criacoes?${new URLSearchParams({ select: 'id', id: `eq.${criacaoId}` }).toString()}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=representation' },
    }) as Array<Record<string, unknown>>;
    if (!Array.isArray(deleted) || !deleted[0]?.id) {
      return jsonResponse({ success: false, error: 'Criacao nao encontrada para exclusao.' }, 404);
    }
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
    const { profile, alunoId, escolaId, canPublicarComunicado, isProfessor, isGestor, isBibliotecaria } = await getCommunityModuleContext(request, env);
    if (!alunoId || !escolaId) {
      return jsonResponse({ success: false, error: 'Perfil do aluno nao encontrado.' }, 400);
    }

    const body = await request.json().catch(() => ({}));
    const tipoPost = String(body?.tipo || '').trim().toLowerCase();
    const turmaPublico = body?.turma_publico ? String(body.turma_publico).trim() : null;

    if (tipoPost === 'comunicado') {
      if (!canPublicarComunicado) {
        return jsonResponse({ success: false, error: 'Sem permissao para publicar comunicados.' }, 403);
      }

      if (isProfessor) {
        const professorTurmas = await supabaseAdminRequest(env, `/rest/v1/professor_turmas?${new URLSearchParams({
          select: 'turma',
          professor_id: `eq.${alunoId}`,
        }).toString()}`).catch(() => []);
        const turmasPermitidas = [...new Set(ensureArray<Record<string, unknown>>(professorTurmas).map((item) => String(item?.turma || '').trim()).filter(Boolean))];

        if (!turmasPermitidas.length) {
          return jsonResponse({ success: false, error: 'Professor sem turmas liberadas para publicar comunicados.' }, 403);
        }

        if (turmaPublico && !turmasPermitidas.includes(turmaPublico)) {
          return jsonResponse({ success: false, error: 'Turma nao permitida para este professor.' }, 403);
        }
      }

      if ((isGestor || isBibliotecaria) && turmaPublico) {
        const [salas, usuariosSala, professorTurmasEscola] = await Promise.all([
          supabaseAdminRequest(env, `/rest/v1/salas_cursos?${new URLSearchParams({ select: 'nome', escola_id: `eq.${escolaId}` }).toString()}`).catch(() => []),
          supabaseAdminRequest(env, `/rest/v1/usuarios_biblioteca?${new URLSearchParams({ select: 'turma', escola_id: `eq.${escolaId}` }).toString()}`).catch(() => []),
          supabaseAdminRequest(env, `/rest/v1/professor_turmas?${new URLSearchParams({ select: 'turma', escola_id: `eq.${escolaId}` }).toString()}`).catch(() => []),
        ]);

        const turmasEscola = new Set<string>();
        ensureArray<Record<string, unknown>>(salas).forEach((item) => {
          const nome = String(item?.nome || '').trim();
          if (nome) turmasEscola.add(nome);
        });
        [...ensureArray<Record<string, unknown>>(usuariosSala), ...ensureArray<Record<string, unknown>>(professorTurmasEscola)].forEach((item) => {
          const nome = String(item?.turma || '').trim();
          if (nome) turmasEscola.add(nome);
        });

        if (!turmasEscola.has(turmaPublico)) {
          return jsonResponse({ success: false, error: 'Turma nao encontrada para esta escola.' }, 404);
        }
      }
    }

    const created = await supabaseAdminRequest(env, '/rest/v1/comunidade_posts?select=id', {
      method: 'POST',
      body: { ...body, autor_id: alunoId, escola_id: escolaId, turma_publico: turmaPublico },
      headers: { Prefer: 'return=representation' },
    }) as Array<Record<string, unknown>>;

    if (tipoPost === 'comunicado') {
      await notifyComunicadoAudience(env, {
        escolaId,
        autorProfileId: String(profile?.id || '').trim() || alunoId,
        turmaPublico,
        titulo: String(body?.titulo || '').trim() || 'Novo comunicado',
        conteudo: String(body?.conteudo || '').trim() || 'Confira o novo comunicado na comunidade.',
      }).catch((error) => {
        console.error('Falha ao enviar push de comunicado:', error);
      });
    }

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
  'POST /v1/aluno/comunidade/quiz-ranking': async (request, env) => {
    const { alunoId, escolaId } = await getCommunityModuleContext(request, env);
    const body = await request.json().catch(() => ({}));
    const postIds = ensureArray<string>(body?.postIds).map((item) => String(item || '').trim()).filter(Boolean);
    const scope = String(body?.scope || 'escola').trim().toLowerCase();
    const turma = normalizeTurmaKey(body?.turma);
    const fromDate = body?.fromDate ? String(body.fromDate) : null;

    if (postIds.length === 0) {
      return jsonResponse({ success: true, rankingByPost: {}, historicoByPost: {} });
    }

    const params = new URLSearchParams();
    params.set('select', 'id,post_id,aluno_id,acertos,total,created_at,escola_id,usuarios_biblioteca(nome,turma)');
    params.set('post_id', `in.(${postIds.join(',')})`);
    if (escolaId) params.set('escola_id', `eq.${escolaId}`);
    if (fromDate) params.set('created_at', `gte.${fromDate}`);
    params.append('order', 'acertos.desc');
    params.append('order', 'created_at.asc');

    const rows = await supabaseAdminRequest(
      env,
      `/rest/v1/comunidade_quiz_tentativas?${params.toString()}`,
    ).catch(() => []);

    const rankingByPost: Record<string, unknown[]> = {};
    const historicoByPost: Record<string, unknown> = {};

    ensureArray<Record<string, unknown>>(rows)
      .filter((tentativa) => {
        if (scope !== 'turma') return true;
        const dadosAluno = tentativa?.usuarios_biblioteca as Record<string, unknown> | null;
        const nomeTurma = normalizeTurmaKey(dadosAluno?.turma);
        return !turma || nomeTurma === turma;
      })
      .forEach((tentativa) => {
        const postId = String(tentativa?.post_id || '').trim();
        if (!postId) return;

        const currentRanking = ensureArray(rankingByPost[postId]);
        if (currentRanking.length < 5) {
          rankingByPost[postId] = [...currentRanking, tentativa];
        }

        if (alunoId && String(tentativa?.aluno_id || '') === String(alunoId)) {
          const previous = historicoByPost[postId] as Record<string, unknown> | undefined;
          if (!previous || Number(tentativa?.acertos || 0) > Number(previous?.acertos || 0)) {
            historicoByPost[postId] = tentativa;
          }
        }
      });

    return jsonResponse({ success: true, rankingByPost, historicoByPost });
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
    .replace(/\/v1\/admin\/tenants\/[^/]+\/mass-audio-seed$/, '/v1/admin/tenants/:id/mass-audio-seed')
    .replace(/\/v1\/admin\/schools\/[^/]+\/delete$/, '/v1/admin/schools/:id/delete')
    .replace(/\/v1\/admin\/super-admins\/[^/]+\/unlock$/, '/v1/admin/super-admins/:id/unlock')
    .replace(/\/v1\/tokens-convite\/[^/]+\/delete$/, '/v1/tokens-convite/:id/delete')
    .replace(/\/v1\/escola\/salas\/[^/]+$/, '/v1/escola/salas/:id')
    .replace(/\/v1\/emprestimos\/[^/]+\/devolucao$/, '/v1/emprestimos/:id/devolucao')
    .replace(/\/v1\/emprestimos\/[^/]+\/delete$/, '/v1/emprestimos/:id/delete')
    .replace(/\/v1\/solicitacoes-emprestimo\/[^/]+\/aprovar$/, '/v1/solicitacoes-emprestimo/:id/aprovar')
    .replace(/\/v1\/solicitacoes-emprestimo\/[^/]+\/recusar$/, '/v1/solicitacoes-emprestimo/:id/recusar')
    .replace(/\/v1\/solicitacoes-emprestimo\/[^/]+\/indisponivel$/, '/v1/solicitacoes-emprestimo/:id/indisponivel')
    .replace(/\/v1\/solicitacoes-emprestimo\/[^/]+\/chat$/, '/v1/solicitacoes-emprestimo/:id/chat')
    .replace(/\/v1\/auth\/super-admin\/desktop\/challenges\/[^/]+$/, '/v1/auth/super-admin/desktop/challenges/:token')
    .replace(/\/v1\/aluno\/comunidade\/posts\/[^/]+\/like$/, '/v1/aluno/comunidade/posts/:id/like')
    .replace(/\/v1\/aluno\/comunidade\/posts\/[^/]+\/delete$/, '/v1/aluno/comunidade/posts/:id/delete')
    .replace(/\/v1\/aluno\/comunidade\/posts\/[^/]+$/, '/v1/aluno/comunidade/posts/:id')
    .replace(/\/v1\/aluno\/solicitacoes-emprestimo\/[^/]+\/chat$/, '/v1/aluno/solicitacoes-emprestimo/:id/chat')
    .replace(/\/v1\/aluno\/laboratorio\/criacoes\/[^/]+\/delete$/, '/v1/aluno/laboratorio/criacoes/:id/delete')
    .replace(/\/v1\/aluno\/laboratorio\/criacoes\/[^/]+$/, '/v1/aluno/laboratorio/criacoes/:id')
    .replace(/\/v1\/professor\/sugestoes\/[^/]+\/delete$/, '/v1/professor/sugestoes/:id/delete')
    .replace(/\/v1\/professor\/atividades\/[^/]+\/delete$/, '/v1/professor/atividades/:id/delete')
    .replace(/\/v1\/professor\/atividades\/[^/]+\/status$/, '/v1/professor/atividades/:id/status')
    .replace(/\/v1\/professor\/atividades\/[^/]+$/, '/v1/professor/atividades/:id')
    .replace(/\/v1\/professor\/entregas\/[^/]+\/avaliar$/, '/v1/professor/entregas/:id/avaliar')
    .replace(/\/v1\/arquivos-aula\/[^/]+\/delete$/, '/v1/arquivos-aula/:id/delete')
    .replace(/\/v1\/arquivos-aula\/[^/]+\/arquivos$/, '/v1/arquivos-aula/:id/arquivos')
    .replace(/\/v1\/livros\/categorias\/update$/, '/v1/livros/categorias/update')
    .replace(/\/v1\/livros\/categorias\/delete$/, '/v1/livros/categorias/delete')
    .replace(/\/v1\/livros\/categorias$/, '/v1/livros/categorias')
    .replace(/\/v1\/livros\/(?!categorias(?:\/|$))[^/]+\/delete$/, '/v1/livros/:id/delete')
    .replace(/\/v1\/usuarios\/[^/]+\/delete$/, '/v1/usuarios/:id/delete')
    .replace(/\/v1\/livros\/(?!categorias(?:\/|$))[^/]+$/, '/v1/livros/:id')
    .replace(/\/v1\/usuarios\/[^/]+$/, '/v1/usuarios/:id');
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
