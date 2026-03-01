import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

const TOKEN_REGEX = /^[a-f0-9]{32,128}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    let payload;
    try {
      payload = await req.json();
    } catch (_error) {
      return jsonResponse({ success: false, error: 'JSON inválido no corpo da requisição' }, 400);
    }

    const { token, nome, cpf, senha } = payload;
    const normalizedToken = (token || '').toString().trim().toLowerCase();
    const normalizedNome = (nome || '').toString().trim();
    const normalizedCpf = (cpf || '').toString().replace(/\D/g, '');

    if (!normalizedToken || !normalizedNome || !normalizedCpf || !senha) {
      return jsonResponse({ success: false, error: 'Dados incompletos' }, 400);
    }

    if (!TOKEN_REGEX.test(normalizedToken)) {
      return jsonResponse({ success: false, error: 'Token inválido' }, 400);
    }

    if (normalizedNome.length < 3 || normalizedNome.length > 120) {
      return jsonResponse({ success: false, error: 'Nome inválido' }, 400);
    }

    if (normalizedCpf.length !== 11) {
      return jsonResponse({ success: false, error: 'CPF inválido' }, 400);
    }

    if (senha.length < 6) {
      return jsonResponse({ success: false, error: 'A senha deve ter pelo menos 6 caracteres' }, 400);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Configuração incompleta no servidor' }, 500);
    }

    const authHeader = req.headers.get('Authorization') || '';

    const supabaseCaller = createClient(supabaseUrl, anonKey, {
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: inviteCtx, error: inviteCtxError } = await supabaseCaller
      .rpc('get_tenant_invite_context', { _token: normalizedToken })
      .maybeSingle();

    if (inviteCtxError || !inviteCtx) {
      return jsonResponse({ success: false, error: 'Link inválido ou expirado' }, 400);
    }

    if (inviteCtx.cpf && inviteCtx.cpf !== normalizedCpf) {
      return jsonResponse(
        { success: false, error: 'Este convite está vinculado a outro CPF' },
        403,
      );
    }

    const { data: reservedInvite, error: reserveInviteError } = await supabaseAdmin
      .from('tenant_admin_invites')
      .update({ usado_em: new Date().toISOString() })
      .eq('token', normalizedToken)
      .is('usado_em', null)
      .gt('expira_em', new Date().toISOString())
      .select('id')
      .maybeSingle();

    if (reserveInviteError || !reservedInvite) {
      return jsonResponse({ success: false, error: 'Link inválido ou já utilizado' }, 400);
    }

    const authEmail = `${normalizedCpf}@temp.bibliotecai.com`;
    const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: senha,
      email_confirm: true,
      user_metadata: { nome: normalizedNome },
    });

    if (createUserError) {
      await supabaseAdmin
        .from('tenant_admin_invites')
        .update({ usado_em: null, usado_por: null })
        .eq('id', reservedInvite.id)
        .is('usado_por', null);
      return jsonResponse({ success: false, error: createUserError.message }, 400);
    }

    const userId = createdUser.user.id;

    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert({ user_id: userId, role: 'gestor' }, { onConflict: 'user_id,role' });

    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      await supabaseAdmin
        .from('tenant_admin_invites')
        .update({ usado_em: null, usado_por: null })
        .eq('id', reservedInvite.id)
        .is('usado_por', null);
      return jsonResponse({ success: false, error: 'Não foi possível definir o papel gestor' }, 500);
    }

    const profilePayload = {
      user_id: userId,
      nome: normalizedNome,
      email: authEmail,
      cpf: normalizedCpf,
      tipo: 'gestor',
      escola_id: inviteCtx.escola_id,
      matricula: null,
    };

    const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
      .from('usuarios_biblioteca')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (existingProfileError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      await supabaseAdmin
        .from('tenant_admin_invites')
        .update({ usado_em: null, usado_por: null })
        .eq('id', reservedInvite.id)
        .is('usado_por', null);
      return jsonResponse({ success: false, error: 'Falha ao consultar perfil' }, 500);
    }

    if (existingProfile?.id) {
      const { error } = await supabaseAdmin
        .from('usuarios_biblioteca')
        .update(profilePayload)
        .eq('id', existingProfile.id);

      if (error) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        await supabaseAdmin
          .from('tenant_admin_invites')
          .update({ usado_em: null, usado_por: null })
          .eq('id', reservedInvite.id)
          .is('usado_por', null);
        return jsonResponse({ success: false, error: 'Falha ao atualizar perfil' }, 500);
      }
    } else {
      const { error } = await supabaseAdmin.from('usuarios_biblioteca').insert(profilePayload);
      if (error) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        await supabaseAdmin
          .from('tenant_admin_invites')
          .update({ usado_em: null, usado_por: null })
          .eq('id', reservedInvite.id)
          .is('usado_por', null);
        return jsonResponse({ success: false, error: 'Falha ao criar perfil' }, 500);
      }
    }

    await supabaseAdmin
      .from('tenant_admin_invites')
      .update({ usado_por: userId })
      .eq('id', reservedInvite.id);

    await supabaseAdmin
      .from('escolas')
      .update({ gestor_id: userId })
      .eq('id', inviteCtx.escola_id)
      .is('gestor_id', null);

    return jsonResponse({
      success: true,
      login: normalizedCpf,
      login_email: authEmail,
      role: 'gestor',
      tenant_subdomain: inviteCtx.subdominio,
    });
  } catch (error) {
    console.error('registrar-gestor-tenant error', error);
    return jsonResponse(
      { success: false, error: error instanceof Error ? error.message : 'Erro inesperado' },
      500,
    );
  }
});
