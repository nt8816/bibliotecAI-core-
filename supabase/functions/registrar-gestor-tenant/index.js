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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { token, nome, email, senha } = await req.json();

    if (!token || !nome || !email || !senha) {
      return jsonResponse({ success: false, error: 'Dados incompletos' }, 400);
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
      .rpc('get_tenant_invite_context', { _token: token })
      .maybeSingle();

    if (inviteCtxError || !inviteCtx) {
      return jsonResponse({ success: false, error: 'Link inválido ou expirado' }, 400);
    }

    const normalizedEmail = email.toString().trim().toLowerCase();

    const { data: createdUser, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: normalizedEmail,
      password: senha,
      email_confirm: true,
      user_metadata: { nome },
    });

    if (createUserError) {
      return jsonResponse({ success: false, error: createUserError.message }, 400);
    }

    const userId = createdUser.user.id;

    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert({ user_id: userId, role: 'gestor' }, { onConflict: 'user_id,role' });

    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return jsonResponse({ success: false, error: 'Não foi possível definir o papel gestor' }, 500);
    }

    const profilePayload = {
      user_id: userId,
      nome,
      email: normalizedEmail,
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
      return jsonResponse({ success: false, error: 'Falha ao consultar perfil' }, 500);
    }

    if (existingProfile?.id) {
      const { error } = await supabaseAdmin
        .from('usuarios_biblioteca')
        .update(profilePayload)
        .eq('id', existingProfile.id);

      if (error) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return jsonResponse({ success: false, error: 'Falha ao atualizar perfil' }, 500);
      }
    } else {
      const { error } = await supabaseAdmin.from('usuarios_biblioteca').insert(profilePayload);
      if (error) {
        await supabaseAdmin.auth.admin.deleteUser(userId);
        return jsonResponse({ success: false, error: 'Falha ao criar perfil' }, 500);
      }
    }

    await supabaseAdmin
      .from('tenant_admin_invites')
      .update({ usado_em: new Date().toISOString(), usado_por: userId })
      .eq('token', token)
      .is('usado_em', null);

    await supabaseAdmin
      .from('escolas')
      .update({ gestor_id: userId })
      .eq('id', inviteCtx.escola_id)
      .is('gestor_id', null);

    return jsonResponse({
      success: true,
      email: normalizedEmail,
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
