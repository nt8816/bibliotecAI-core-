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

type Payload = {
  operation?: 'create' | 'unlock';
  nome?: string;
  email?: string;
  cpf?: string;
  senha?: string;
  account_id?: string;
};

function normalizeEmail(value: string) {
  return String(value || '').trim().toLowerCase();
}

function normalizeCpf(value: string) {
  return String(value || '').replace(/\D/g, '');
}

function isValidCpf(value: string) {
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
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerUserData, error: callerUserError } = await callerClient.auth.getUser(userToken);
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

    if (isSuperAdmin) {
      const { data: saAccount } = await adminClient
        .from('super_admin_accounts')
        .select('id, ativo, bloqueado')
        .eq('auth_user_id', caller.id)
        .maybeSingle();
      if (!saAccount || saAccount.ativo === false || saAccount.bloqueado === true) {
        return jsonResponse({ success: false, error: 'Conta de super admin inativa ou bloqueada.' }, 403);
      }
    }

    if (!isSuperAdmin) {
      return jsonResponse({ success: false, error: 'Sem permissao para gerenciar Super Admins' }, 403);
    }

    let payload: Payload;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ success: false, error: 'JSON invalido no corpo da requisicao' }, 400);
    }

    const operation = payload?.operation || 'create';

    if (operation === 'unlock') {
      const accountId = String(payload?.account_id || '').trim();
      if (!accountId) {
        return jsonResponse({ success: false, error: 'Conta nao informada' }, 400);
      }

      const { data, error } = await callerClient.rpc('unlock_super_admin_account', { _account_id: accountId });
      if (error) {
        return jsonResponse({ success: false, error: error.message || 'Nao foi possivel liberar a conta' }, 400);
      }

      return jsonResponse({ success: true, data });
    }

    const nome = String(payload?.nome || '').trim();
    const email = normalizeEmail(String(payload?.email || ''));
    const cpf = normalizeCpf(String(payload?.cpf || ''));
    const senha = String(payload?.senha || '').trim();

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

    const { data: existingAccount } = await adminClient
      .from('super_admin_accounts')
      .select('id')
      .or(`email.eq.${email}${cpf ? `,cpf.eq.${cpf}` : ''}`)
      .maybeSingle();

    if (existingAccount?.id) {
      return jsonResponse({ success: false, error: 'Ja existe uma conta de Super Admin com esse email ou CPF' }, 409);
    }

    const { data: createdUserData, error: createUserError } = await adminClient.auth.admin.createUser({
      email,
      password: senha,
      email_confirm: true,
      user_metadata: {
        nome,
      },
    });

    if (createUserError || !createdUserData?.user?.id) {
      return jsonResponse({ success: false, error: 'Nao foi possivel criar o usuario' }, 500);
    }

    const userId = createdUserData.user.id;

    const { error: roleError } = await adminClient
      .from('user_roles')
      .upsert({ user_id: userId, role: 'super_admin' }, { onConflict: 'user_id,role' });

    if (roleError) {
      await adminClient.auth.admin.deleteUser(userId);
      return jsonResponse({ success: false, error: 'Nao foi possivel atribuir o papel de Super Admin' }, 500);
    }

    const { error: accountError } = await adminClient
      .from('super_admin_accounts')
      .insert({
        auth_user_id: userId,
        nome,
        email,
        cpf: cpf || null,
        ativo: true,
        bloqueado: false,
        tentativas_falhas: 0,
        created_by: caller.id,
      });

    if (accountError) {
      await adminClient.auth.admin.deleteUser(userId);
      return jsonResponse({ success: false, error: accountError.message || 'Nao foi possivel registrar a conta de Super Admin' }, 500);
    }

    await adminClient.from('system_logs').insert({
      user_id: caller.id,
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
  } catch (error) {
    console.error('gerenciar-super-admins error', error);
      return jsonResponse(
        { success: false, error: 'Erro interno do servidor.' },
      500,
    );
  }
});
