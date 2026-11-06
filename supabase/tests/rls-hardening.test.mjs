import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';

const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const database = new PGlite();
const migration = await readFile(new URL('../migrations/20261106120000_harden_rls_school_boundaries.sql', import.meta.url), 'utf8');
const schoolA = '00000000-0000-0000-0000-000000000001';
const schoolB = '00000000-0000-0000-0000-000000000002';
const student = '00000000-0000-0000-0000-000000000011';
const librarian = '00000000-0000-0000-0000-000000000012';
const manager = '00000000-0000-0000-0000-000000000013';
const administrator = '00000000-0000-0000-0000-000000000014';

async function asUser(userId, action, role = 'authenticated') {
  await database.exec('BEGIN');
  try {
    await database.exec(`SET LOCAL ROLE ${role}`);
    await database.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
    return await action();
  } finally {
    await database.exec('ROLLBACK');
  }
}

async function denied(statement) {
  await assert.rejects(database.exec(statement), error => error.code === '42501');
}

before(async () => {
  await database.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE SCHEMA tenant_existing;
    CREATE TYPE public.app_role AS ENUM ('aluno', 'professor', 'bibliotecaria', 'gestor', 'super_admin');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    CREATE TABLE public.usuarios_biblioteca (user_id uuid PRIMARY KEY, escola_id uuid, tipo public.app_role, nome text);
    CREATE TABLE public.user_roles (user_id uuid, role public.app_role);
    CREATE TABLE public.livros (id integer PRIMARY KEY, escola_id uuid, titulo text);
    CREATE TABLE public.tokens_convite (id integer, escola_id uuid, role_destino public.app_role);
    CREATE TABLE public.ai_rate_limits (key text);
    CREATE TABLE public.auth_session_handoffs (id integer);
    CREATE TABLE public.analytics_events (id integer);
    CREATE TABLE public.analytics_sessions (id integer);
    CREATE TABLE tenant_existing.livros (id integer);
    CREATE FUNCTION public.check_ai_rate_limit(text, integer, integer) RETURNS boolean
      LANGUAGE sql SECURITY DEFINER AS $$ SELECT true $$;
    CREATE FUNCTION public.is_super_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'super_admin')
    $$;
    CREATE FUNCTION public.is_gestor() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'gestor')
    $$;
    CREATE FUNCTION public.is_bibliotecaria() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'bibliotecaria')
    $$;
    CREATE FUNCTION public.is_same_escola(school_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS (SELECT 1 FROM public.usuarios_biblioteca WHERE user_id = auth.uid() AND escola_id = school_id)
    $$;
    CREATE FUNCTION public.is_same_user_escola(target_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
      SELECT EXISTS (SELECT 1 FROM public.usuarios_biblioteca WHERE user_id = target_user_id AND public.is_same_escola(escola_id))
    $$;
    GRANT USAGE ON SCHEMA public, auth, tenant_existing TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public, tenant_existing TO PUBLIC, anon, authenticated, service_role;
    CREATE POLICY legacy_books ON public.livros FOR ALL USING (true) WITH CHECK (true);
    CREATE POLICY legacy_profiles ON public.usuarios_biblioteca FOR ALL
      USING (user_id = auth.uid() OR public.is_gestor() OR public.is_bibliotecaria() OR public.is_super_admin())
      WITH CHECK (user_id = auth.uid() OR public.is_gestor() OR public.is_bibliotecaria() OR public.is_super_admin());
    CREATE POLICY legacy_roles ON public.user_roles FOR ALL
      USING (user_id = auth.uid() OR public.is_gestor() OR public.is_super_admin())
      WITH CHECK (public.is_gestor() OR public.is_super_admin());
    CREATE POLICY staff_tokens ON public.tokens_convite FOR ALL
      USING (public.is_gestor() OR public.is_bibliotecaria() OR public.is_super_admin())
      WITH CHECK (public.is_gestor() OR public.is_bibliotecaria() OR public.is_super_admin());
    CREATE POLICY "Anyone can view valid token by token value" ON public.tokens_convite FOR SELECT USING (true);
    INSERT INTO public.usuarios_biblioteca VALUES
      ('${student}', '${schoolA}', 'aluno', 'Aluno'),
      ('${librarian}', '${schoolA}', 'bibliotecaria', 'Bibliotecária'),
      ('${manager}', '${schoolA}', 'gestor', 'Gestor'),
      ('${administrator}', '${schoolB}', 'super_admin', 'Administrador');
    INSERT INTO public.user_roles SELECT user_id, tipo FROM public.usuarios_biblioteca;
    INSERT INTO public.livros VALUES (1, '${schoolA}', 'A'), (2, '${schoolB}', 'B');
    INSERT INTO public.tokens_convite VALUES (1, '${schoolA}', 'professor'), (2, '${schoolB}', 'professor');
    INSERT INTO tenant_existing.livros VALUES (1);
  `);
  await database.exec(migration);
});

after(async () => database.close());

test('migration can be reapplied and enables RLS on existing application tables', async () => {
  await database.exec(migration);
  const result = await database.query("SELECT tablename FROM pg_tables WHERE (schemaname = 'public' OR starts_with(schemaname, 'tenant_')) AND NOT rowsecurity");
  assert.equal(result.rows.length, 0);
});

test('school boundary overrides permissive policies for reading and writing', async () => {
  await asUser(student, async () => {
    assert.deepEqual((await database.query('SELECT id FROM public.livros')).rows, [{ id: 1 }]);
    assert.equal((await database.query("UPDATE public.livros SET titulo = 'changed' WHERE id = 2 RETURNING id")).rows.length, 0);
    assert.equal((await database.query('DELETE FROM public.livros WHERE id = 2 RETURNING id')).rows.length, 0);
  });
  await asUser(student, () => denied(`INSERT INTO public.livros VALUES (3, '${schoolB}', 'blocked')`));
  await asUser(student, () => denied(`UPDATE public.livros SET escola_id = '${schoolB}' WHERE id = 1`));
});

test('anonymous access and TRUNCATE are denied even with inherited PUBLIC grants', async () => {
  await asUser('', () => denied('SELECT * FROM public.livros'), 'anon');
  await asUser(student, () => denied('TRUNCATE public.livros'));
});

test('students can edit their name but cannot change role, school or auth identity', async () => {
  await asUser(student, async () => {
    await database.exec(`UPDATE public.usuarios_biblioteca SET nome = 'Novo nome' WHERE user_id = '${student}'`);
    assert.equal((await database.query('SELECT nome FROM public.usuarios_biblioteca')).rows[0].nome, 'Novo nome');
  });
  for (const assignment of ["tipo = 'gestor'", "tipo = 'professor'", `escola_id = '${schoolB}'`, "user_id = '00000000-0000-0000-0000-000000000099'"]) {
    await asUser(student, () => denied(`UPDATE public.usuarios_biblioteca SET ${assignment} WHERE user_id = '${student}'`));
  }
});

test('librarians cannot assign gestor and managers cannot assign super admin', async () => {
  await asUser(librarian, () => denied(`UPDATE public.usuarios_biblioteca SET tipo = 'gestor' WHERE user_id = '${student}'`));
  await asUser(manager, () => denied(`UPDATE public.usuarios_biblioteca SET tipo = 'super_admin' WHERE user_id = '${student}'`));
  await asUser(manager, () => denied(`INSERT INTO public.user_roles VALUES ('${student}', 'super_admin')`));
  await asUser(manager, () => denied(`UPDATE public.user_roles SET role = 'super_admin' WHERE user_id = '${student}'`));
  await asUser(manager, async () => {
    await database.exec(`UPDATE public.usuarios_biblioteca SET tipo = 'professor' WHERE user_id = '${student}'`);
    await database.exec(`INSERT INTO public.user_roles VALUES ('${student}', 'professor')`);
  });
});

test('invites are visible only to authorized staff within their school', async () => {
  await asUser(student, async () => assert.equal((await database.query('SELECT * FROM public.tokens_convite')).rows.length, 0));
  await asUser(manager, async () => assert.deepEqual((await database.query('SELECT id FROM public.tokens_convite')).rows, [{ id: 1 }]));
  await asUser(librarian, () => denied(`INSERT INTO public.tokens_convite VALUES (3, '${schoolA}', 'gestor')`));
  await asUser(manager, () => denied(`INSERT INTO public.tokens_convite VALUES (3, '${schoolA}', 'super_admin')`));
});

test('internal tables and rate limit RPC are server only', async () => {
  for (const table of ['ai_rate_limits', 'auth_session_handoffs', 'analytics_events', 'analytics_sessions']) {
    await asUser(student, () => denied(`SELECT * FROM public.${table}`));
    await asUser('', () => database.exec(`SELECT * FROM public.${table}`), 'service_role');
  }
  await asUser(student, () => denied("SELECT public.check_ai_rate_limit('key', 1, 60)"));
  await asUser('', () => database.exec("SELECT public.check_ai_rate_limit('key', 1, 60)"), 'service_role');
});

test('super admin retains cross-school access and server retains write access', async () => {
  await asUser(administrator, async () => {
    assert.equal((await database.query('SELECT * FROM public.livros')).rows.length, 2);
    await database.exec(`INSERT INTO public.user_roles VALUES ('${student}', 'super_admin')`);
  });
  await asUser('', () => database.exec(`UPDATE public.usuarios_biblioteca SET escola_id = '${schoolB}' WHERE user_id = '${student}'`), 'service_role');
});

test('new public tables and tenant clones automatically get RLS and deny access without policies', async () => {
  await database.exec(`
    CREATE TABLE public.future_table (id integer);
    CREATE SCHEMA tenant_future;
    CREATE TABLE tenant_future.livros (LIKE public.livros INCLUDING ALL);
    CREATE TABLE public.future_copy AS SELECT 1 AS id;
    SELECT 1 AS id INTO public.future_select;
    GRANT USAGE ON SCHEMA tenant_future TO authenticated;
    GRANT SELECT ON public.future_table, public.future_copy, public.future_select, tenant_future.livros TO authenticated;
    INSERT INTO public.future_table VALUES (1);
  `);
  const result = await database.query("SELECT tablename FROM pg_tables WHERE (schemaname = 'public' OR starts_with(schemaname, 'tenant_')) AND NOT rowsecurity");
  assert.equal(result.rows.length, 0);
  await asUser(student, async () => {
    for (const table of ['public.future_table', 'public.future_copy', 'public.future_select', 'tenant_existing.livros', 'tenant_future.livros']) {
      assert.equal((await database.query(`SELECT * FROM ${table}`)).rows.length, 0);
    }
  });
});
