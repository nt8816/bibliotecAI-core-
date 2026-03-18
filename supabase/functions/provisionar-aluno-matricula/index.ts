import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-access-token',
};

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

const MATRICULA_REGEX = /^[A-Za-z0-9._-]{6,32}$/;
const DUPLICATE_EMAIL_MARKERS = ['already been registered', 'already exists', 'already registered'];

async function findAuthUserByEmail(adminClient, email) {
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data?.users || [];
    const found = users.find((item) => String(item.email || '').toLowerCase() === String(email || '').toLowerCase());
    if (found) return found;
    if (users.length < perPage) return null;
    page += 1;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Configuração do servidor incompleta' }, 500);
    }

    const userAccessToken = req.headers.get('x-user-access-token') || req.headers.get('Authorization');
    const normalizedAuthHeader = userAccessToken?.toLowerCase().startsWith('bearer ')
      ? userAccessToken
      : `Bearer ${userAccessToken || ''}`;
    if (!userAccessToken) {
      return jsonResponse({ success: false, error: 'Não autenticado' }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: { Authorization: normalizedAuthHeader } },
    });

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: callerUserData, error: callerUserError } = await callerClient.auth.getUser();
    const callerId = callerUserData?.user?.id;

    if (callerUserError || !callerId) {
      return jsonResponse({ success: false, error: 'Sessão inválida' }, 401);
    }

    const { data: callerProfile, error: callerProfileError } = await adminClient
      .from('usuarios_biblioteca')
      .select('id, tipo, escola_id')
      .eq('user_id', callerId)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (callerProfileError || !callerProfile) {
      return jsonResponse({ success: false, error: 'Perfil do solicitante não encontrado' }, 403);
    }

    if (callerProfile.tipo !== 'gestor' && callerProfile.tipo !== 'bibliotecaria') {
      return jsonResponse({ success: false, error: 'Sem permissão para criar aluno' }, 403);
    }

    let payload;
    try {
      payload = await req.json();
    } catch (_error) {
      return jsonResponse({ success: false, error: 'JSON inválido' }, 400);
    }

    const nome = (payload?.nome || '').toString().trim();
    const matricula = (payload?.matricula || '').toString().trim();
    const turma = (payload?.turma || '').toString().trim() || null;
    const cpf = (payload?.cpf || '').toString().trim() || null;
    const telefone = (payload?.telefone || '').toString().trim() || null;

    if (!nome || nome.length < 3) {
      return jsonResponse({ success: false, error: 'Nome inválido' }, 400);
    }

    if (!MATRICULA_REGEX.test(matricula)) {
      return jsonResponse({ success: false, error: 'Matrícula inválida (mínimo 6; use letras, números, ponto, _ ou -)' }, 400);
    }

    const authEmail = `${matricula.replace(/\s+/g, '')}@temp.bibliotecai.com`.toLowerCase();
    const authPassword = matricula;

    const { data: existingByMatricula, error: existingError } = await adminClient
      .from('usuarios_biblioteca')
      .select('id, user_id, escola_id')
      .eq('matricula', matricula)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingError) {
      return jsonResponse({ success: false, error: 'Não foi possível verificar matrícula' }, 500);
    }

    if (existingByMatricula?.user_id) {
      return jsonResponse({ success: false, error: 'Esta matrícula já está vinculada a uma conta ativa' }, 409);
    }

    let userId = '';
    let createdNewUser = false;

    const { data: authData, error: createAuthError } = await adminClient.auth.admin.createUser({
      email: authEmail,
      password: authPassword,
      email_confirm: true,
      user_metadata: { nome },
    });

    if (createAuthError) {
      const createAuthMessage = String(createAuthError.message || '').toLowerCase();
      if (!DUPLICATE_EMAIL_MARKERS.some((marker) => createAuthMessage.includes(marker))) {
        return jsonResponse({ success: false, error: createAuthError.message || 'Não foi possível criar credenciais do aluno' }, 400);
      }

      const existingAuthUser = await findAuthUserByEmail(adminClient, authEmail);
      if (!existingAuthUser?.id) {
        return jsonResponse({ success: false, error: 'A conta de autenticação já existe, mas não foi possível reutilizá-la.' }, 409);
      }

      const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(existingAuthUser.id, {
        password: authPassword,
        email_confirm: true,
        user_metadata: { ...(existingAuthUser.user_metadata || {}), nome },
      });

      if (updateAuthError) {
        return jsonResponse({ success: false, error: updateAuthError.message || 'Não foi possível atualizar a conta existente do aluno' }, 400);
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
      return jsonResponse({ success: false, error: 'Não foi possível definir o papel do aluno' }, 500);
    }

    const profilePayload = {
      user_id: userId,
      nome,
      tipo: 'aluno',
      matricula,
      email: authEmail,
      turma,
      cpf,
      telefone,
      escola_id: existingByMatricula?.escola_id || callerProfile.escola_id || null,
    };

    let profileError = null;
    let targetProfileId = existingByMatricula?.id || null;

    if (!targetProfileId) {
      const { data: byUserProfile } = await adminClient
        .from('usuarios_biblioteca')
        .select('id')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      targetProfileId = byUserProfile?.id || null;
    }

    if (targetProfileId) {
      const { error } = await adminClient
        .from('usuarios_biblioteca')
        .update(profilePayload)
        .eq('id', targetProfileId);
      profileError = error;
    } else {
      const { data: insertedProfile, error } = await adminClient
        .from('usuarios_biblioteca')
        .insert(profilePayload)
        .select('id')
        .maybeSingle();
      profileError = error;
      targetProfileId = insertedProfile?.id || null;
    }

    if (profileError) {
      if (createdNewUser) {
        await adminClient.auth.admin.deleteUser(userId).catch(() => {});
      }
      return jsonResponse({ success: false, error: 'Não foi possível salvar o perfil do aluno' }, 500);
    }

    if (targetProfileId) {
      await adminClient
        .from('usuarios_biblioteca')
        .delete()
        .eq('user_id', userId)
        .neq('id', targetProfileId);
    }

    return jsonResponse({
      success: true,
      aluno: {
        user_id: userId,
        email: authEmail,
        matricula,
      },
      credenciais_iniciais: {
        login: matricula,
        senha: matricula,
      },
    });
  } catch (error) {
    console.error('provisionar-aluno-matricula error', error);
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return jsonResponse({ success: false, error: message }, 500);
  }
});
