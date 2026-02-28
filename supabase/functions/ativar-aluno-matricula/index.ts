import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

const MATRICULA_REGEX = /^[A-Za-z0-9._-]{6,32}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ success: false, error: 'Configuracao incompleta do servidor' }, 500);
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
      .or(
        `matricula.eq.${matriculaCompacta},matricula.eq.${matriculaNormalizada}`,
      )
      .eq('tipo', 'aluno')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (alunoError) {
      return jsonResponse({ success: false, error: 'Nao foi possivel consultar a matricula' }, 500);
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

    const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
      email: authEmail,
      password: senhaInput,
      email_confirm: true,
      user_metadata: { nome: aluno.nome || 'Aluno' },
    });

    if (authError || !authData?.user?.id) {
      return jsonResponse({
        success: false,
        error: authError?.message || 'Nao foi possivel ativar a conta',
      }, 400);
    }

    const userId = authData.user.id;

    const { error: roleError } = await adminClient
      .from('user_roles')
      .upsert({ user_id: userId, role: 'aluno' }, { onConflict: 'user_id,role' });

    if (roleError) {
      await adminClient.auth.admin.deleteUser(userId).catch(() => {});
      return jsonResponse({ success: false, error: 'Nao foi possivel definir permissao do aluno' }, 500);
    }

    const { error: profileError } = await adminClient
      .from('usuarios_biblioteca')
      .update({
        user_id: userId,
        email: authEmail,
      })
      .eq('id', aluno.id);

    if (profileError) {
      await adminClient.auth.admin.deleteUser(userId).catch(() => {});
      return jsonResponse({ success: false, error: 'Nao foi possivel vincular o perfil do aluno' }, 500);
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
    const message = error instanceof Error ? error.message : 'Erro desconhecido';
    return jsonResponse({ success: false, error: message }, 500);
  }
});
