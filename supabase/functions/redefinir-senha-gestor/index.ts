import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const isDev = !['production', 'prod'].includes(String(Deno.env.get('SUPABASE_ENV') || '').trim().toLowerCase());
const ALLOWED_ORIGINS = ["https://bibliotecai.com.br", "https://app.bibliotecai.com.br", ...(isDev ? ['http://localhost:5173', 'http://localhost:3000'] : [])];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const safeOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-access-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}


const jsonResponse = (body: unknown, status = 200, request?: Request) =>
  new Response(JSON.stringify(body), {
    headers: { ...getCorsHeaders(request || new Request("http://localhost")), 'Content-Type': 'application/json' },
    status,
  });

const PASSWORD_ALLOWED_REGEX = /^[A-Za-z0-9!@#$%^&*()_+\-=.?]{6,64}$/;

type GestorPayload = {
  operation?: 'list' | 'update';
  escola_id?: string;
  gestor_id?: string;
  nova_senha?: string;
};

type GestorItem = {
  id: string;
  nome: string;
  email: string;
  user_id: string;
};

function pickAuthName(user: any) {
  const metadata = user?.user_metadata || {};
  return String(metadata.nome || metadata.name || metadata.full_name || '').trim();
}

function base64UrlEncode(input: string | ArrayBuffer) {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function parseJwtHeader(token: string) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;

  try {
    const normalized = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

async function signHs256Jwt(secret: string, payload: Record<string, unknown>) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${base64UrlEncode(signature)}`;
}

async function getSupabaseAdminServiceToken(serviceRoleKey: string) {
  const jwtHeader = parseJwtHeader(serviceRoleKey);
  const algorithm = String(jwtHeader?.alg || '').toUpperCase();
  if (algorithm !== 'ES256') return serviceRoleKey;

  const jwtSecret = String(Deno.env.get('SUPABASE_JWT_SECRET') || '').trim();
  if (!jwtSecret) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY usa ES256. Configure SUPABASE_JWT_SECRET na function redefinir-senha-gestor.');
  }

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (60 * 60);
  return signHs256Jwt(jwtSecret, {
    aud: 'authenticated',
    exp: expiresAt,
    iat: now,
    iss: 'supabase',
    role: 'service_role',
    sub: 'service_role',
  });
}

async function getSupabaseAdminApiKey(serviceRoleKey: string) {
  const secretKey = String(
    Deno.env.get('SUPABASE_SECRET_KEY')
    || Deno.env.get('SUPABASE_SECRET_KEYS')
    || '',
  ).trim();

  if (secretKey) return secretKey;
  return getSupabaseAdminServiceToken(serviceRoleKey);
}

async function checkRateLimit(supabaseAdmin: any, key: string, limit = 10, windowSeconds = 60): Promise<boolean> {
  try {
    const { data } = await supabaseAdmin.rpc('check_ai_rate_limit', {
      _key: `ratelimit:${key}`,
      _limit: limit,
      _window_seconds: windowSeconds,
    }).single();
    return data === true;
  } catch {
    return true; // fail open if rate limit check fails
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(req), status: 204 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Configuracao incompleta no servidor' }, 500);
    }

    const manualUserToken = req.headers.get('x-user-access-token') || '';
    const authHeader = req.headers.get('Authorization') || '';
    const userToken = String(manualUserToken || authHeader.replace(/^Bearer\s+/i, '')).trim();

    if (!userToken) {
      return jsonResponse({ success: false, error: 'Nao autenticado' }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const adminApiKey = await getSupabaseAdminApiKey(serviceRoleKey);
    const adminClient = createClient(supabaseUrl, adminApiKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('cf-connecting-ip') || 'unknown';
    const rateKey = `${clientIp}:reset-gestor`;
    if (!(await checkRateLimit(adminClient, rateKey, 10, 60))) {
      return jsonResponse({ success: false, error: 'Limite de requisicoes atingido. Tente novamente em alguns minutos.' }, 429);
    }

    const { data: callerUserData, error: callerUserError } = await callerClient.auth.getUser();
    const caller = callerUserData?.user;
    if (callerUserError || !caller) {
      return jsonResponse({ success: false, error: 'Sessao invalida' }, 401);
    }

    const { data: callerRoles, error: callerRolesError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id);

    if (callerRolesError) {
      return jsonResponse({ success: false, error: 'Nao foi possivel validar permissoes' }, 403);
    }

    const isSuperAdmin = (callerRoles || []).some((item) => item.role === 'super_admin');
    if (!isSuperAdmin) {
      return jsonResponse({ success: false, error: 'Sem permissao para gerenciar senha de gestor' }, 403);
    }

    let payload: GestorPayload;
    try {
      payload = await req.json();
    } catch (_error) {
      return jsonResponse({ success: false, error: 'JSON invalido no corpo da requisicao' }, 400);
    }

    const operation = payload?.operation || 'update';
    const escolaId = String(payload?.escola_id || '').trim();
    const gestorId = String(payload?.gestor_id || '').trim();
    const novaSenha = String(payload?.nova_senha || '').trim();

    if (!escolaId) {
      return jsonResponse({ success: false, error: 'Escola nao informada' }, 400);
    }

    const { data: escolaInfo, error: escolaError } = await adminClient
      .from('escolas')
      .select('id, nome, gestor_id')
      .eq('id', escolaId)
      .maybeSingle();

    if (escolaError || !escolaInfo) {
      return jsonResponse({ success: false, error: 'Escola nao encontrada' }, 404);
    }

    const buildGestores = async (): Promise<GestorItem[]> => {
      const { data: perfis, error: perfisError } = await adminClient
        .from('usuarios_biblioteca')
        .select('id, nome, email, user_id, tipo')
        .eq('escola_id', escolaId)
        .order('nome', { ascending: true });

      if (perfisError) throw perfisError;

      const perfisEscola = Array.isArray(perfis) ? perfis : [];
      const userIds = perfisEscola.map((item: any) => String(item?.user_id || '').trim()).filter(Boolean);

      const { data: rolesData, error: rolesError } = userIds.length
        ? await adminClient.from('user_roles').select('user_id, role').in('user_id', userIds)
        : { data: [], error: null };

      if (rolesError) throw rolesError;

      const rolesByUserId = new Map<string, Set<string>>();
      (rolesData || []).forEach((item: any) => {
        const userId = String(item?.user_id || '').trim();
        const role = String(item?.role || '').trim().toLowerCase();
        if (!userId || !role) return;
        const current = rolesByUserId.get(userId) || new Set<string>();
        current.add(role);
        rolesByUserId.set(userId, current);
      });

      const gestores: GestorItem[] = perfisEscola
        .filter((perfil: any) => {
          const userId = String(perfil?.user_id || '').trim();
          const tipo = String(perfil?.tipo || '').trim().toLowerCase();
          const roles = rolesByUserId.get(userId);
          return tipo === 'gestor' || roles?.has('gestor') || userId === String(escolaInfo?.gestor_id || '').trim();
        })
        .map((perfil: any) => ({
          id: String(perfil?.id || perfil?.user_id || ''),
          nome: String(perfil?.nome || '').trim(),
          email: String(perfil?.email || '').trim(),
          user_id: String(perfil?.user_id || '').trim(),
        }))
        .filter((perfil) => perfil.id && perfil.user_id);

      const gestorPrincipalId = String(escolaInfo?.gestor_id || '').trim();
      const hasGestorPrincipal = gestorPrincipalId && gestores.some((item) => item.user_id === gestorPrincipalId || item.id === gestorPrincipalId);

      if (gestorPrincipalId && !hasGestorPrincipal) {
        const { data: authUserData } = await adminClient.auth.admin.getUserById(gestorPrincipalId);
        const authUser = authUserData?.user;
        gestores.push({
          id: gestorPrincipalId,
          nome: pickAuthName(authUser) || `Gestor principal - ${escolaInfo?.nome || 'Escola'}`,
          email: String(authUser?.email || '').trim(),
          user_id: gestorPrincipalId,
        });
      }

      const unique = new Map<string, GestorItem>();
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

      return Array.from(unique.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    };

    const gestores = await buildGestores();

    if (operation === 'list') {
      return jsonResponse({ success: true, gestores });
    }

    if (!novaSenha || !PASSWORD_ALLOWED_REGEX.test(novaSenha)) {
      return jsonResponse(
        { success: false, error: 'Senha invalida. Use 6-64 caracteres (letras, numeros e simbolos comuns).' },
        400,
      );
    }

    const gestorSelecionado =
      gestores.find((item) => item.id === gestorId || item.user_id === gestorId) ||
      gestores[0] ||
      null;

    if (!gestorSelecionado?.user_id) {
      return jsonResponse({ success: false, error: 'Gestor nao encontrado para esta escola' }, 404);
    }

    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(gestorSelecionado.user_id, {
      password: novaSenha,
    });

    if (updateAuthError) {
      return jsonResponse({ success: false, error: updateAuthError.message || 'Nao foi possivel redefinir a senha do gestor' }, 500);
    }

    return jsonResponse({
      success: true,
      gestor_id: gestorSelecionado.id,
      gestor_nome: gestorSelecionado.nome || 'Gestor',
      gestor_email: gestorSelecionado.email || '',
    });
  } catch (error) {
    console.error('redefinir-senha-gestor error', error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Erro inesperado' },
      500,
    );
  }
});
