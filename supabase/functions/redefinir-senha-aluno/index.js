import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  });

const PASSWORD_ALLOWED_REGEX = /^[A-Za-z0-9!@#$%^&*()_+\-=.?]{6,64}$/;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders, status: 204 });
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

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const {
      data: { user },
      error: userError,
    } = await callerClient.auth.getUser();

    if (userError || !user) {
      return jsonResponse({ success: false, error: 'Sessão inválida' }, 401);
    }

    const { data: callerRoles, error: roleError } = await callerClient
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
      senha_temporaria: novaSenha,
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
