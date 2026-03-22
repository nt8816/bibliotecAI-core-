# Saida do Supabase Sem Quebrar Tudo

## Objetivo

Esta fase prepara a plataforma para sair do Supabase sem uma ruptura brusca. O foco aqui nao e mudar o banco imediatamente, e sim:

- mapear o acoplamento atual
- criar uma camada propria de API
- parar de depender do acesso direto do frontend ao Supabase como unico caminho

## O que ja foi feito

- arquivos e midias passaram a usar Cloudflare R2
- existe backfill para mover acervo legado para o R2
- foi criado um inventario automatico das dependencias de Supabase
- foi criado um esqueleto inicial de API em Cloudflare Workers

## Artefatos desta fase

- inventario gerado: [generated/supabase-dependency-summary.md](/c:/Users/cfake/OneDrive/Documentos/bibliotecAI-core-/docs/generated/supabase-dependency-summary.md)
- inventario bruto: [generated/supabase-dependency-inventory.json](/c:/Users/cfake/OneDrive/Documentos/bibliotecAI-core-/docs/generated/supabase-dependency-inventory.json)
- worker inicial: [index.ts](/c:/Users/cfake/OneDrive/Documentos/bibliotecAI-core-/cloudflare/api-gateway/src/index.ts)
- configuracao do worker: [wrangler.toml](/c:/Users/cfake/OneDrive/Documentos/bibliotecAI-core-/cloudflare/api-gateway/wrangler.toml)

## Ordem recomendada das proximas fases

1. API propria
   Mover primeiro os fluxos mais sensiveis para a API do Worker:
   - login e sessao
   - reclamacoes
   - gestao de super admins
   - tenants

2. Banco fora do Supabase
   Migrar o Postgres para um provedor proprio antes de pensar em remover regras de negocio.

3. Auth proprio
   Substituir Supabase Auth por auth controlado pela propria plataforma.

4. Realtime
   Trocar subscriptions por WebSocket, polling controlado ou Durable Objects.

## O que nao fazer agora

- migrar direto para Cloudflare D1
- reescrever tudo de uma vez
- remover Supabase Auth antes de existir uma API propria estavel

## Primeiros modulos a sair

- `Reclamacoes`
- `Super Admins`
- `AdminTenants`
- `Auth`

Esses modulos concentram autenticacao, autorizacao e funcoes administrativas. Sao o melhor ponto de partida para o desacoplamento.
