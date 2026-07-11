import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';


const jsonResponse = (body, status = 200, request) =>
  new Response(JSON.stringify(body), {
    headers: { ...getCorsHeaders(request || new Request("http://localhost")), 'Content-Type': 'application/json' },
    status,
  });

const PASSWORD_ALLOWED_REGEX = /^[A-Za-z0-9!@#$%^&*()_+\-=.?]{6,64}$/;

function base64UrlEncode(input) {
  const bytes = typeof input === 'string'
    ? new TextEncoder().encode(input)
    : new Uint8Array(input);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function parseJwtHeader(token) {
  const parts = String(token || '').split('.');
  if (parts.length < 2) return null;

  try {
    const normalized = parts[0].replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
    return JSON.parse(atob(padded));
  } catch (_error) {
    return null;
  }
}

async function signHs256Jwt(secret, payload) {
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

async function getSupabaseAdminServiceToken(serviceRoleKey) {
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

async function getSupabaseAdminApiKey(serviceRoleKey) {
  const secretKey = String(
    Deno.env.get('SUPABASE_SECRET_KEY')
    || Deno.env.get('SUPABASE_SECRET_KEYS')
    || '',
  ).trim();

  if (secretKey) return secretKey;
  return getSupabaseAdminServiceToken(serviceRoleKey);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: getCorsHeaders(request || new Request("http://localhost")), status: 204 });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Configuração incompleta no servidor' }, 500);
    }

    const manualUserToken = req.headers.get('x-user-access-token') || '';
    const authHeader = req.headers.get('Authorization') || '';
    const userToken = String(manualUserToken || authHeader.replace(/^Bearer\s+/i, '')).trim();

    if (!userToken) {
      return jsonResponse({ success: false, error: 'Não autenticado' }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${userToken}` } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const adminApiKey = await getSupabaseAdminApiKey(serviceRoleKey);
    const adminClient = createClient(supabaseUrl, adminApiKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerUserData, error: callerUserError } = await callerClient.auth.getUser();
    const caller = callerUserData?.user;
    if (callerUserError || !caller) {
      return jsonResponse({ success: false, error: 'Sessão inválida' }, 401);
    }

    const { data: callerRoles, error: callerRolesError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id);

    if (callerRolesError) {
      return jsonResponse({ success: false, error: 'Não foi possível validar permissões' }, 403);
    }

    const isSuperAdmin = (callerRoles || []).some((item) => item.role === 'super_admin');
    if (!isSuperAdmin) {
      return jsonResponse({ success: false, error: 'Sem permissão para redefinir senha de gestor' }, 403);
    }

    let payload;
    try {
      payload = await req.json();
    } catch (_error) {
      return jsonResponse({ success: false, error: 'JSON inválido no corpo da requisição' }, 400);
    }

    const escolaId = (payload?.escola_id || '').toString().trim();
    const novaSenha = (payload?.nova_senha || '').toString().trim();

    if (!escolaId) {
      return jsonResponse({ success: false, error: 'Escola não informada' }, 400);
    }

    if (!novaSenha || !PASSWORD_ALLOWED_REGEX.test(novaSenha)) {
      return jsonResponse(
        { success: false, error: 'Senha inválida. Use 6-64 caracteres (letras, números e símbolos comuns).' },
        400,
      );
    }

    const { data: gestorProfile, error: gestorError } = await adminClient
      .from('usuarios_biblioteca')
      .select('id, nome, email, user_id, escola_id')
      .eq('escola_id', escolaId)
      .eq('tipo', 'gestor')
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (gestorError || !gestorProfile) {
      return jsonResponse({ success: false, error: 'Gestor não encontrado para esta escola' }, 404);
    }

    if (!gestorProfile.user_id) {
      return jsonResponse({ success: false, error: 'Este gestor ainda não ativou conta. Não há senha para redefinir.' }, 400);
    }

    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(gestorProfile.user_id, {
      password: novaSenha,
    });

    if (updateAuthError) {
      return jsonResponse({ success: false, error: updateAuthError.message || 'Não foi possível redefinir a senha do gestor' }, 500);
    }

    return jsonResponse({
      success: true,
      gestor_id: gestorProfile.id,
      gestor_nome: gestorProfile.nome,
      gestor_email: gestorProfile.email,
    });
  } catch (error) {
    console.error('redefinir-senha-gestor error', error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Erro inesperado' },
      500,
    );
  }
});
