import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const isDev = !['production', 'prod'].includes(String(Deno.env.get('SUPABASE_ENV') || '').trim().toLowerCase());
const ALLOWED_ORIGINS = ['https://bibliotecai.com.br', 'https://app.bibliotecai.com.br', ...(isDev ? ['http://localhost:5173', 'http://localhost:3000'] : [])];

function getCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const safeOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': safeOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}

const jsonResponse = (body: Record<string, unknown>, status = 200, request?: Request) =>
  new Response(JSON.stringify(body), {
    headers: { ...getCorsHeaders(request || new Request('http://localhost')), 'Content-Type': 'application/json' },
    status,
  });

const MATRICULA_REGEX = /^[A-Za-z0-9._-]{6,32}$/;
const DUPLICATE_EMAIL_MARKERS = ['already been registered', 'already exists', 'already registered'];

async function findAuthUserByEmail(adminClient: ReturnType<typeof createClient>, email: string) {
  const { data, error } = await adminClient.auth.admin.listUsers({ filter: `email=eq.${email}` });
  if (error) throw error;
  return data?.users?.[0] || null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Configuracao incompleta do servidor' }, 500, req);
    }

    // Auth check — require gestor, bibliotecaria, or super_admin
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return jsonResponse({ success: false, error: 'Autenticacao necessaria' }, 401, req);
    }
    const authClient = createClient(supabaseUrl, anonKey || serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse({ success: false, error: 'Token invalido ou expirado' }, 401, req);
    }
    const { data: callerRoles } = await authClient.from('user_roles').select('role').eq('user_id', user.id);
    const allowedRoles = ['gestor', 'bibliotecaria', 'super_admin'];
    const hasAccess = (callerRoles || []).some((r) => allowedRoles.includes(r.role));
    if (!hasAccess) {
      return jsonResponse({ success: false, error: 'Sem permissao para ativar contas' }, 403, req);
    }

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch (_error) {
      return jsonResponse({ success: false, error: 'JSON invalido' }, 400);
    }

    const matriculaInput = (payload?.matricula || '').toString().trim();
    const senhaInput = (payload?.senha || '').toString();
    const matriculaCompacta = matriculaInput.replace(/\s+/g, '');
    const matriculaNormalizada = matriculaInput.replace(/[^A-Za-z0-9]/g, '');

    if (!MATRICULA_REGEX.test(matriculaCompacta)) {
      return jsonResponse({ success: false, error: 'Matricula invalida' }, 400);
    }

    if (senhaInput.length < 6) {
      return jsonResponse({ success: false, error: 'A senha deve ter pelo menos 6 caracteres' }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: aluno, error: alunoError } = await adminClient
      .from('usuarios_biblioteca')
      .select('id, nome, matricula, email, user_id, tipo, escola_id')
      .or(`matricula.eq.${matriculaCompacta},matricula.eq.${matriculaNormalizada}`)
      .eq('tipo', 'aluno')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (alunoError) {
      return jsonResponse({ success: false, error: 'Não foi possível consultar a matrícula' }, 500);
    }

    if (!aluno) {
      return jsonResponse({ success: false, error: 'Matricula nao encontrada' }, 404);
    }

    if (aluno.user_id) {
      const { data: activeProfile } = await adminClient
        .from('usuarios_biblioteca')
        .select('email')
        .eq('user_id', aluno.user_id)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return jsonResponse({
        success: true,
        already_active: true,
        email: activeProfile?.email || aluno.email,
      });
    }

    const authEmail = `${matriculaCompacta.toLowerCase()}@temp.bibliotecai.com`;

    let userId = '';
    let createdNewUser = false;

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: authEmail,
      password: senhaInput,
      email_confirm: true,
      user_metadata: { nome: aluno.nome || 'Aluno' },
    });

    if (authError) {
      const authErrorMessage = String(authError.message || '').toLowerCase();
      if (!DUPLICATE_EMAIL_MARKERS.some((marker) => authErrorMessage.includes(marker))) {
        return jsonResponse({
          success: false,
          error: 'Não foi possível ativar a conta',
        }, 400);
      }

      const existingAuthUser = await findAuthUserByEmail(adminClient, authEmail);
      if (!existingAuthUser?.id) {
        return jsonResponse({ success: false, error: 'A conta de autenticação já existe, mas não foi possível reutilizá-la.' }, 409);
      }

      const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(existingAuthUser.id, {
        password: senhaInput,
        email_confirm: true,
        user_metadata: { ...(existingAuthUser.user_metadata || {}), nome: aluno.nome || 'Aluno' },
      });

      if (updateAuthError) {
        return jsonResponse({ success: false, error: 'Não foi possível atualizar a conta existente' }, 400);
      }

      userId = existingAuthUser.id;
    } else if (authData?.user?.id) {
      userId = authData.user.id;
      createdNewUser = true;
    }

    if (!userId) {
      return jsonResponse({ success: false, error: 'Não foi possível preparar a conta do aluno' }, 400);
    }

    const { error: roleError } = await adminClient
      .from('user_roles')
      .upsert({ user_id: userId, role: 'aluno' }, { onConflict: 'user_id,role' });

    if (roleError) {
      if (createdNewUser) {
        await adminClient.auth.admin.deleteUser(userId).catch(() => {});
      }
      return jsonResponse({ success: false, error: 'Não foi possível definir permissão do aluno' }, 500);
    }

    const { error: profileError } = await adminClient
      .from('usuarios_biblioteca')
      .update({
        user_id: userId,
        email: authEmail,
      })
      .eq('id', aluno.id);

    if (profileError) {
      if (createdNewUser) {
        await adminClient.auth.admin.deleteUser(userId).catch(() => {});
      }
      return jsonResponse({ success: false, error: 'Não foi possível vincular o perfil do aluno' }, 500);
    }

    await adminClient
      .from('usuarios_biblioteca')
      .delete()
      .eq('user_id', userId)
      .neq('id', aluno.id);

    return jsonResponse({
      success: true,
      already_active: false,
      email: authEmail,
    });
  } catch (error) {
    return jsonResponse({ success: false, error: 'Erro interno do servidor.' }, 500);
  }
});
