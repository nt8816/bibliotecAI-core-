import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
const SUPABASE_SERVICE_ROLE_KEY = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY para restaurar os super admins.');
  process.exit(1);
}

const defaultTargets = [
  {
    email: 'nt@gmail.com',
    name: 'Natan Araújo lopes',
    password: String(process.env.NT_SUPER_ADMIN_PASSWORD || '').trim() || null,
  },
  {
    email: 'franciscorai1358@gmail.com',
    name: 'Francisco Rai Silva Santos',
    password: String(process.env.FRANCISCO_SUPER_ADMIN_PASSWORD || '').trim() || null,
  },
];

function parseTargets() {
  const raw = String(process.env.SUPER_ADMIN_RECOVERY_TARGETS || '').trim();
  if (!raw) return defaultTargets;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('SUPER_ADMIN_RECOVERY_TARGETS deve ser uma lista JSON.');
    }

    return parsed.map((item) => ({
      email: String(item?.email || '').trim().toLowerCase(),
      name: String(item?.name || '').trim() || String(item?.nome || '').trim() || 'Super Admin',
      password: String(item?.password || '').trim() || null,
    })).filter((item) => item.email);
  } catch (error) {
    console.error(`Falha ao interpretar SUPER_ADMIN_RECOVERY_TARGETS: ${error.message}`);
    process.exit(1);
  }
}

const targets = parseTargets();
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

async function findAuthUserByEmail(email) {
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = Array.isArray(data?.users) ? data.users : [];
    const match = users.find((item) => String(item?.email || '').trim().toLowerCase() === email);
    if (match) return match;
    if (users.length < perPage) return null;
    page += 1;
  }
}

async function ensureAuthUser(target) {
  const existing = await findAuthUserByEmail(target.email);
  if (existing?.id) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      email_confirm: true,
      user_metadata: {
        ...(existing.user_metadata || {}),
        nome: target.name,
      },
    });
    if (error) throw error;
    return data.user;
  }

  if (!target.password) {
    throw new Error(`Usuario auth ausente para ${target.email} e nenhuma senha foi informada para recriacao.`);
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email: target.email,
    password: target.password,
    email_confirm: true,
    user_metadata: {
      nome: target.name,
    },
  });

  if (error) throw error;
  if (!data?.user?.id) {
    throw new Error(`Nao foi possivel criar o usuario auth para ${target.email}.`);
  }

  return data.user;
}

async function ensureSuperAdminRole(userId) {
  const { error } = await supabase
    .from('user_roles')
    .upsert([{ user_id: userId, role: 'super_admin' }], {
      onConflict: 'user_id,role',
      ignoreDuplicates: false,
    });

  if (error) throw error;
}

async function ensureSuperAdminAccount(target, authUserId) {
  const payload = {
    auth_user_id: authUserId,
    nome: target.name,
    email: target.email,
    ativo: true,
    bloqueado: false,
    tentativas_falhas: 0,
    bloqueado_em: null,
  };

  const { data: existingByEmail, error: findError } = await supabase
    .from('super_admin_accounts')
    .select('id')
    .eq('email', target.email)
    .maybeSingle();

  if (findError) throw findError;

  if (existingByEmail?.id) {
    const { error } = await supabase
      .from('super_admin_accounts')
      .update(payload)
      .eq('id', existingByEmail.id);

    if (error) throw error;
    return existingByEmail.id;
  }

  const { data, error } = await supabase
    .from('super_admin_accounts')
    .insert([payload])
    .select('id')
    .single();

  if (error) throw error;
  return data?.id || null;
}

async function main() {
  const results = [];

  for (const target of targets) {
    const authUser = await ensureAuthUser(target);
    await ensureSuperAdminRole(authUser.id);
    const accountId = await ensureSuperAdminAccount(target, authUser.id);

    results.push({
      email: target.email,
      auth_user_id: authUser.id,
      super_admin_account_id: accountId,
      restored: true,
    });
  }

  console.log(JSON.stringify({ success: true, results }, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    success: false,
    error: error instanceof Error ? error.message : String(error),
  }, null, 2));
  process.exit(1);
});
