# Segurança por linha (RLS)

## Estado verificado em 06/11/2026

O ambiente local foi autenticado e vinculado ao projeto
`dhjkjwkitufsvhlhcsec`. A migração `20261106120000` foi aplicada em produção
pela CLI, e seu registro foi confirmado no histórico do banco.

- As 38 tabelas da aplicação encontradas sem RLS passaram a ter RLS habilitado.
- A consulta final encontrou zero tabelas da aplicação sem RLS e zero tabelas
  acessíveis diretamente ao papel `anon` em `public` e `tenant_*`.
- Foram confirmadas 17 políticas restritivas de escola e o event trigger de
  ativação de RLS em novas tabelas.
- O papel `authenticated` não tem permissão de executar a RPC de limites de IA.
- As seis migrações existentes apenas no histórico remoto foram recuperadas
  em arquivos locais, preservando suas versões e instruções. O dry run final
  confirmou que não há migrações pendentes.

Essas verificações conferem a configuração do banco; os fluxos completos da
interface com contas reais ainda precisam de validação funcional.

A migração `supabase/migrations/20261106120000_harden_rls_school_boundaries.sql`
ativa RLS nas tabelas da aplicação em `public` e nos schemas `tenant_*`,
preservando as políticas existentes de cada módulo. Objetos pertencentes a
extensões não são alterados.

- Usuários autenticados ficam sujeitos às políticas existentes e a uma política
  restritiva de escola nas tabelas de `public` com `escola_id UUID`.
- Super admins mantêm o acesso permitido pelas políticas de cada módulo.
- Alunos e professores não podem mudar seu tipo de perfil; alterações de vínculo
  de autenticação e escola passam pelo servidor. Bibliotecárias não atribuem
  perfil de gestor e gestores não atribuem super admin.
- Convites deixam de ser enumeráveis por usuários comuns. O onboarding continua
  pelos endpoints do servidor.
- Limites de IA, sessões de transferência e analytics ficam acessíveis somente
  pelo servidor com `service_role`. A RPC de limites também é exclusiva do servidor.
- Um event trigger ativa RLS em novas tabelas de `public` e `tenant_*`, inclusive
  nas cópias criadas por `provision_tenant`. Novas tabelas exigem políticas
  explícitas para liberar acesso ao cliente.

`CREATE TABLE ... LIKE ... INCLUDING ALL` não copia políticas. Por isso, cópias
nos schemas `tenant_*` sem políticas ficam bloqueadas para clientes. Os fluxos
atuais usam as tabelas compartilhadas de `public`; antes de acessar cópias pelo
cliente, defina políticas específicas de perfil e escola para elas.

## Aplicação

### Acesso administrativo nesta máquina

A CLI Supabase 3.0.0 está instalada para o usuário local, fora das dependências
do aplicativo. O comando `supabase` está disponível em `~/.local/bin/supabase`.
Para autenticar a conta administrativa, execute no terminal:

```sh
supabase login
supabase projects list
supabase link --project-ref dhjkjwkitufsvhlhcsec
```

O login deve ser concluído pelo titular da conta. Não coloque token de acesso,
senha do banco ou chave `service_role` nas variáveis `VITE_*` nem no repositório.
O login da CLI é separado das credenciais públicas utilizadas pelo frontend.
Novos arquivos de metadados locais em `supabase/.temp/` e
`supabase/.branches/` são ignorados pelo Git. Alguns metadados antigos de
`.temp` já estão versionados; a regra não remove esses arquivos do histórico.

O arquivo no repositório não altera sozinho o banco remoto. Aplique com uma
conexão administrativa do projeto correto, depois de revisar as migrações
pendentes:

```sh
supabase link --project-ref dhjkjwkitufsvhlhcsec
supabase db push --remote --dry-run
supabase db push --remote
```

Alternativamente, execute o conteúdo da migração no SQL Editor do Supabase com
o usuário administrativo. O event trigger exige permissão administrativa; se
essa etapa falhar, a transação inteira é revertida.

## Verificação

Os testes em `supabase/tests/rls-hardening.test.mjs` executam a migração em um
PostgreSQL isolado com PGlite, usando perfis e políticas de exemplo. Eles
verificam a reaplicação, bloqueios entre escolas, elevação de privilégios,
convites, tabelas internas e criação de tabelas. Não acessam o banco remoto nem
substituem a validação de todas as migrações e dos fluxos reais da aplicação.
Para executar sem alterar as dependências do projeto:

```sh
rls_test_dir=$(mktemp -d)
npm install --prefix "$rls_test_dir" --no-audit --no-fund --package-lock=false @electric-sql/pglite
PGLITE_MODULE="file://$rls_test_dir/node_modules/@electric-sql/pglite/dist/index.js" node --test supabase/tests/rls-hardening.test.mjs
```

Esta consulta deve retornar zero linhas para tabelas da aplicação sem RLS:

```sql
SELECT schemaname, tablename
FROM pg_tables
WHERE (schemaname = 'public' OR starts_with(schemaname, 'tenant_'))
  AND NOT rowsecurity
  AND NOT EXISTS (
    SELECT 1 FROM pg_depend
    WHERE classid = 'pg_class'::regclass
      AND objid = format('%I.%I', schemaname, tablename)::regclass
      AND deptype = 'e'
  );
```

Teste com sessões reais de escolas diferentes: leitura e escrita fora da escola
devem falhar; alteração do próprio tipo de perfil e criação de super admin por
gestor devem falhar; acervo, empréstimos e acesso administrativo legítimos devem
continuar funcionando. Não use o SQL Editor administrativo para simular um
cliente sem trocar o papel, pois o proprietário pode ignorar RLS.

RLS não protege consultas feitas com `service_role`: os endpoints que usam essa
credencial precisam verificar autenticação, perfil e escola. Esta migração não
substitui a revisão dessas autorizações nem a das RPCs `SECURITY DEFINER`.

Referências: [RLS no Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security)
e [políticas restritivas no PostgreSQL](https://www.postgresql.org/docs/current/sql-createpolicy.html).
