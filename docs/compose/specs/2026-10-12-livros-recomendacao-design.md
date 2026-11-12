# Recomendação de livros — design

## [S1] Problema e visão

O aluno não tem orientação ao abrir o catálogo de livros. Queremos:

1. Um **card principal de recomendação** no topo da biblioteca, gerado por **IA** a partir do histórico de empréstimos, gêneros preferidos e disponibilidade.
2. Um botão pequeno **“Sugerir outro”** no mesmo card, que troca a sugestão por outra ranqueada por **scoring local** (sem IA), limitado a **3 por dia**.
3. **Cold start**: sem histórico nem preferências, um dialog com **chips de gênero** (Ficção, Fantasia, Terror, Romance, História, Ciência, Aventura, Biografia) — o aluno escolhe 1–3. As sugestões evoluem com empréstimos e uso ao longo do tempo.

Superfícies (prioridade ao aluno):

- **Biblioteca do aluno** (`/aluno/biblioteca` em `PainelAluno.jsx`) — experiência principal.
- **Página Livros da equipe** (`/livros` em `Livros.jsx`) — faixa “Sugestão do sistema”, mesma lógica (histórico pessoal se houver; senão acervo da escola).

## [S2] Dados e API

### Tabelas Supabase

`aluno_livro_preferencias`

| coluna | tipo | notas |
|--------|------|-------|
| aluno_id | uuid PK | ref `usuarios_biblioteca` |
| generos | text[] | chips escolhidos |
| perfil_ia | jsonb | resumo/perfil que a IA usa e evolui |
| updated_at | timestamptz | |

`aluno_livro_sugestoes_dia`

| coluna | tipo | notas |
|--------|------|-------|
| aluno_id | uuid | parte da PK |
| dia | date | parte da PK (fuso da escola / UTC-3) |
| contador | int | 0–3, incrementado só em `POST /proximo` |

RLS: dono do `aluno_id` (service_role no gateway).

### Endpoints (gateway `bibliotecai-api-gateway`)

- `GET /v1/livros/recomendacao`
  - Resposta: `{ principal, alternativas[], restantes_hoje, precisa_preferencias, generos_catalogo[] }`
  - `principal`: `{ livro_id, titulo, autor, area, sinopse, motivo, origem: 'ia' | 'local' }`
  - 1ª chamada do dia (ou sem cache): IA monta `principal` + `motivo`.
  - Se IA falhar ou sem credencial: fallback scoring local (`origem: 'local'`).
  - Se `precisa_preferencias: true`, frontend abre o dialog de chips.
- `POST /v1/livros/recomendacao/proximo`
  - Body vazio. Valida `contador < 3` (senão 429 com `restantes_hoje: 0`).
  - Incrementa contador e devolve o próximo do scoring local (sem IA).
- `POST /v1/livros/preferencias`
  - Body `{ generos: string[] }` (1–3 itens do catálogo canônico).
  - Upsert em `aluno_livro_preferencias`; limpa `perfil_ia` para a IA reevoluir.

### Scoring local (fallback e “sugerir outro”)

```
score =
  3.0 * match_area_com_generos_preferidos
+ 2.0 * frequencia_da_area_no_historico
+ 1.5 * recencia_de_area_similar
+ 1.0 * disponivel_agora
+ 1.0 * nunca_foi_emprestado_pelo_aluno
+ 0.5 * similaridade_titulo_sinopse_com_perfil
```

Candidatos: livros da escola. Exclui: livro já exibido como recomendação hoje, livros com empréstimo ativo do aluno e livros que o aluno marcou como “não gostei” (se existir wishlist/sinal). Prefere `disponivel = true`. Ordena por `score` desc, empate por popularidade (total de empréstimos do livro).

### IA (somente o card principal)

- Chama o mesmo path `POST /v1/ai/text` (llama 3.3 70b fast) via Worker `api-ia`.
- Prompt: resumo dos últimos empréstimos (área/título), `generos`, `perfil_ia`, lista top-30 candidatos (id/título/área/sinopse curta).
- Saída JSON: `{ livro_id, motivo }` + `perfil_ia` atualizado (interesses, nível, o que evitar).
- Timeout ~8s; qualquer erro → scoring local.

## [S3] Interface

### Biblioteca do aluno

- Card **“Recomendado para você”** antes do grid, com badge, `motivo`, e botão pequeno **“Sugerir outro”** (ícone refresh) + contador “N de 3 hoje”.
- Esgotado: botão disabled, texto “Volte amanhã”.
- Clique no card → mesmo fluxo de solicitar empréstimo existente.
- Dialog de chips (cold start e “Ajustar gostos”): 1–3 gêneros, botão “Salvar e ver sugestão”.
- Erro de rede: card mostra “Não foi possível gerar a sugestão” + botão “Tentar de novo”.

### Página Livros (equipe)

- Faixa no topo do acervo: “Sugestão do sistema” com o mesmo card e o mesmo limite 3/dia.
- Preferência do aluno em primeiro lugar; se o perfil da equipe não tiver empréstimos, usa popularidade + áreas mais emprestadas da escola.

### Evolução

- Cada empréstimo/solicitação realimenta o histórico usado no scoring e no prompt da IA.
- `perfil_ia` guarda o que a IA aprendeu (jsonb) e é regravado a cada sugestão principal bem-sucedida.
- “Ajustar gostos” reabre os chips e reseta o perfil.

## [S4] Tratamento de erros

| caso | comportamento |
|------|----------------|
| IA timeout/erro | principal via scoring local |
| Sem livros no acervo | card vazio “Ainda não há livros para sugerir” |
| Sem preferências e sem histórico | `precisa_preferencias` + dialog chips |
| Limite 3/dia atingido | 429 no `POST /proximo`; UI desabilita botão |
| Falha ao salvar chips | toast de erro, dialog permanece |

## [S5] Testes

- Unit: função de scoring (match de gênero, exclusão de lidos, ordenação, empate).
- Unit: validação de `generos` (1–3, catálogo canônico).
- API/worker: `POST /proximo` respeita contador (429 no 4º do dia); `GET /recomendacao` faz fallback sem IA.
- UI (mínimo): render do card com `precisa_preferencias`, botão disabled em `restantes_hoje === 0`.

## [S6] Fora de escopo

- Notificação push de nova sugestão.
- Multi-usuário / recomendação para turma inteira.
- Mudar o fluxo de empréstimo/solicitação existente.
- Recomendação por conteúdo de PDF/audiobook.
