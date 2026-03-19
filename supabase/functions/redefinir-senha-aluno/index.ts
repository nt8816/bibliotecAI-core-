import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-auth',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const jsonResponse = (body: unknown, status = 200) =>
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
      return jsonResponse({ success: false, error: 'Configuracao incompleta no servidor' }, 500);
    }

    const authHeader =
      req.headers.get('x-supabase-auth')
      || req.headers.get('X-Supabase-Auth')
      || req.headers.get('Authorization')
      || '';
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader : `Bearer ${authHeader}`;
    if (!bearerToken.startsWith('Bearer ') || !bearerToken.replace(/^Bearer\s+/i, '').trim()) {
      return jsonResponse({ success: false, error: 'Nao autenticado' }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: bearerToken } },
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
      return jsonResponse({ success: false, error: 'Sessao invalida' }, 401);
    }

    const { data: callerRoles, error: roleError } = await callerClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (roleError) {
      return jsonResponse({ success: false, error: 'Nao foi possivel validar permissoes' }, 403);
    }

    const isGestor = (callerRoles || []).some((r) => r.role === 'gestor');
    if (!isGestor) {
      return jsonResponse({ success: false, error: 'Apenas gestores podem redefinir senha de alunos' }, 403);
    }

    let payload: { aluno_id?: string; nova_senha?: string };
    try {
      payload = await req.json();
    } catch {
      return jsonResponse({ success: false, error: 'JSON invalido no corpo da requisicao' }, 400);
    }

    const alunoId = (payload?.aluno_id || '').toString().trim();
    const novaSenha = (payload?.nova_senha || '').toString().trim();

    if (!alunoId) {
      return jsonResponse({ success: false, error: 'Aluno nao informado' }, 400);
    }

    if (!novaSenha || !PASSWORD_ALLOWED_REGEX.test(novaSenha)) {
      return jsonResponse(
        {
          success: false,
          error: 'Senha invalida. Use 6-64 caracteres (letras, numeros e simbolos comuns).',
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
      return jsonResponse({ success: false, error: 'Nao foi possivel validar a escola do gestor' }, 403);
    }

    const { data: alunoProfile, error: alunoError } = await adminClient
      .from('usuarios_biblioteca')
      .select('id, nome, tipo, user_id, escola_id')
      .eq('id', alunoId)
      .eq('tipo', 'aluno')
      .maybeSingle();

    if (alunoError || !alunoProfile) {
      return jsonResponse({ success: false, error: 'Aluno nao encontrado' }, 404);
    }

    if (alunoProfile.escola_id !== gestorProfile.escola_id) {
      return jsonResponse({ success: false, error: 'Voce nao pode alterar senha de aluno de outra escola' }, 403);
    }

    if (!alunoProfile.user_id) {
      return jsonResponse(
        { success: false, error: 'Este aluno ainda nao ativou conta. Nao ha senha para redefinir.' },
        400,
      );
    }

    const { error: updateAuthError } = await adminClient.auth.admin.updateUserById(alunoProfile.user_id, {
      password: novaSenha,
    });

    if (updateAuthError) {
      return jsonResponse({ success: false, error: 'Nao foi possivel redefinir a senha do aluno' }, 500);
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
