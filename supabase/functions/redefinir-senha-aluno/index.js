import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const isDev = !['production', 'prod'].includes(String(Deno.env.get('SUPABASE_ENV') || '').trim().toLowerCase());
const ALLOWED_ORIGINS = ["https://bibliotecai.com.br", "https://app.bibliotecai.com.br", ...(isDev ? ['http://localhost:5173', 'http://localhost:3000'] : [])];

function getCorsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const safeOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": safeOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-access-token",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
}


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
    throw new Error('SUPABASE_SERVICE_ROLE_KEY usa ES256. Configure SUPABASE_JWT_SECRET na function redefinir-senha-aluno.');
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

    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonResponse({ success: false, error: 'Não autenticado' }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const adminApiKey = await getSupabaseAdminApiKey(serviceRoleKey);
    const adminClient = createClient(supabaseUrl, adminApiKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ success: false, error: 'Sessão inválida' }, 401);
    }

    const { data: callerRoles, error: roleError } = await adminClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (roleError) {
      return jsonResponse({ success: false, error: 'Não foi possível validar permissões' }, 403);
    }

    const isGestor = (callerRoles || []).some((r) => r.role === 'gestor');
    if (!isGestor) {
      return jsonResponse({ success: false, error: 'Apenas gestores podem redefinir senha de alunos' }, 403);
    }

    let payload;
    try {
      payload = await req.json();
    } catch (_error) {
      return jsonResponse({ success: false, error: 'JSON inválido no corpo da requisição' }, 400);
    }

    const alunoId = (payload?.aluno_id || '').toString().trim();
    const novaSenha = (payload?.nova_senha || '').toString().trim();

    if (!alunoId) {
      return jsonResponse({ success: false, error: 'Aluno não informado' }, 400);
    }

    if (!novaSenha || !PASSWORD_ALLOWED_REGEX.test(novaSenha)) {
      return jsonResponse(
        {
          success: false,
          error: 'Senha inválida. Use 6-64 caracteres (letras, números e símbolos comuns).',
        },
        400,
      );
    }

    const { data: gestorProfile, error: gestorProfileError } = await adminClient
      .from('usuarios_biblioteca')
      .select('escola_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (gestorProfileError || !gestorProfile?.escola_id) {
      return jsonResponse({ success: false, error: 'Não foi possível validar a escola do gestor' }, 403);
    }

    const { data: alunoProfile, error: alunoError } = await adminClient
      .from('usuarios_biblioteca')
      .select('id, nome, tipo, user_id, escola_id')
      .eq('id', alunoId)
      .eq('tipo', 'aluno')
      .maybeSingle();

    if (alunoError || !alunoProfile) {
      return jsonResponse({ success: false, error: 'Aluno não encontrado' }, 404);
    }

    if (alunoProfile.escola_id !== gestorProfile.escola_id) {
      return jsonResponse({ success: false, error: 'Você não pode alterar senha de aluno de outra escola' }, 403);
    }

    if (!alunoProfile.user_id) {
      return jsonResponse(
        { success: false, error: 'Este aluno ainda não ativou conta. Não há senha para redefinir.' },
        400,
      );
    }

    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(alunoProfile.user_id, {
      password: novaSenha,
    });

    if (updateAuthError) {
      return jsonResponse({ success: false, error: 'Não foi possível redefinir a senha do aluno' }, 500);
    }

    return jsonResponse({
      success: true,
      aluno_id: alunoProfile.id,
      aluno_nome: alunoProfile.nome,
      message: 'Senha redefinida com sucesso',
    });
  } catch (error) {
    console.error('redefinir-senha-aluno error', error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Erro inesperado' },
      500,
    );
  }
});
