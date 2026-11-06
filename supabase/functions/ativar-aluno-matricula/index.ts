import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { getCorsHeaders, jsonResponse } from '../_shared/cors.ts';

const MATRICULA_REGEX = /^[A-Za-z0-9._-]{6,32}$/;
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: getCorsHeaders(req) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(req, { success: false, error: 'Configuracao incompleta do servidor' }, 500);
    }

    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (!token) {
      return jsonResponse(req, { success: false, error: 'Autenticacao necessaria' }, 401);
    }
    const authClient = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);
    if (authError || !user) {
      return jsonResponse(req, { success: false, error: 'Token invalido ou expirado' }, 401);
    }
    const { data: callerRoles } = await authClient.from('user_roles').select('role').eq('user_id', user.id);
    const allowedRoles = ['gestor', 'bibliotecaria', 'super_admin'];
    const hasAccess = (callerRoles || []).some((r) => allowedRoles.includes(r.role));
    if (!hasAccess) {
      return jsonResponse(req, { success: false, error: 'Sem permissao para ativar contas' }, 403);
    }
    const isSuperAdmin = (callerRoles || []).some((r) => r.role === 'super_admin');
    const { data: callerProfile, error: callerProfileError } = await authClient
      .from('usuarios_biblioteca').select('escola_id').eq('user_id', user.id)
      .order('updated_at', { ascending: false, nullsFirst: false }).limit(1).maybeSingle();
    if (!isSuperAdmin && (callerProfileError || !callerProfile?.escola_id)) {
      return jsonResponse(req, { success: false, error: 'Escola do solicitante nao identificada' }, 403);
    }

    let payload: Record<string, unknown>;
    try {
      payload = await req.json();
    } catch {
      return jsonResponse(req, { success: false, error: 'JSON invalido' }, 400);
    }

    const matriculaInput = (payload?.matricula || '').toString().trim();
    const senhaInput = (payload?.senha || '').toString();
    const matriculaCompacta = matriculaInput.replace(/\s+/g, '');
    const matriculaNormalizada = matriculaInput.replace(/[^A-Za-z0-9]/g, '');

    if (!MATRICULA_REGEX.test(matriculaCompacta)) {
      return jsonResponse(req, { success: false, error: 'Matricula invalida' }, 400);
    }

    if (senhaInput.length < 6) {
      return jsonResponse(req, { success: false, error: 'A senha deve ter pelo menos 6 caracteres' }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    let alunoQuery = adminClient
      .from('usuarios_biblioteca')
      .select('id, nome, matricula, email, user_id, tipo, escola_id')
      .or(`matricula.eq.${matriculaCompacta},matricula.eq.${matriculaNormalizada}`)
      .eq('tipo', 'aluno');
    if (!isSuperAdmin) alunoQuery = alunoQuery.eq('escola_id', callerProfile.escola_id);
    const { data: aluno, error: alunoError } = await alunoQuery
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (alunoError) {
      return jsonResponse(req, { success: false, error: 'Nao foi possivel consultar a matricula' }, 500);
    }

    if (!aluno) {
      return jsonResponse(req, { success: false, error: 'Matricula nao encontrada' }, 404);
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

      return jsonResponse(req, {
        success: true,
        already_active: true,
        email: activeProfile?.email || aluno.email,
      });
    }

    const authEmail = `${matriculaCompacta.toLowerCase()}@temp.bibliotecai.com`;

    let userId = '';
    let createdNewUser = false;

    const { data: authData, error: createAuthError } = await adminClient.auth.admin.createUser({
      email: authEmail,
      password: senhaInput,
      email_confirm: true,
      user_metadata: { nome: aluno.nome || 'Aluno' },
    });

    if (createAuthError) {
      return jsonResponse(req, { success: false, error: 'Nao foi possivel criar a conta; verifique possivel conflito de matricula.' }, 409);
    } else if (authData?.user?.id) {
      userId = authData.user.id;
      createdNewUser = true;
    }

    if (!userId) {
      return jsonResponse(req, { success: false, error: 'Nao foi possivel preparar a conta do aluno' }, 400);
    }

    const { error: roleError } = await adminClient
      .from('user_roles')
      .upsert({ user_id: userId, role: 'aluno' }, { onConflict: 'user_id,role' });

    if (roleError) {
      if (createdNewUser) {
        await adminClient.auth.admin.deleteUser(userId).catch(() => {});
      }
      return jsonResponse(req, { success: false, error: 'Nao foi possivel definir permissao do aluno' }, 500);
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
      return jsonResponse(req, { success: false, error: 'Nao foi possivel vincular o perfil do aluno' }, 500);
    }

    await adminClient
      .from('usuarios_biblioteca')
      .delete()
      .eq('user_id', userId)
      .neq('id', aluno.id);

    return jsonResponse(req, {
      success: true,
      already_active: false,
      email: authEmail,
    });
  } catch (error) {
    return jsonResponse(req, { success: false, error: 'Erro interno do servidor.' }, 500);
  }
});
