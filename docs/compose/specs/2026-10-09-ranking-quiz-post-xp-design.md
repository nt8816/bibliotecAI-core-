# [S1] Problem
Ranking do BibliotecAI só pontua leitura devolvida, avaliações e atividades aprovadas. Quizzes de comunidade e posts do aluno não contam no XP/nível.

## [S2] Solution overview
Manter XP atual e somar via RPC de ranking (sem tabela extra):
- Quiz de comunidade: 10 XP por acerto, contando só a **melhor tentativa** de cada quiz.
- Post de comunidade do aluno: 20 XP por post em `resenha|quiz|dica|sugestao` (exclui `comunicado`).

## [S3] XP rules
| Ação | XP |
|---|---|
| Livro devolvido | categoria do livro (existente) |
| Avaliação de livro | 15 (existente) |
| Atividade aprovada | 25 + `pontos_ganhos` (existente) |
| Desafio IA | bonus (existente) |
| Quiz comunidade | 10 × melhor `acertos` do aluno no quiz |
| Post comunidade (aluno) | 20 por post (tipo ≠ comunicado) |

Nível = floor(xp_total / 150) + 1 (existente).

## [S4] Data sources
- `comunidade_quiz_tentativas` (`aluno_id`, `post_id`, `acertos`, `total`)
- `comunidade_posts` (`autor_id`, `tipo`, `escola_id`)
- RPCs `get_aluno_rankings` e `get_school_rankings`

## [S5] Anti-abuse
- Melhor tentativa por quiz (não soma todas).
- Só posts do tipo aluno; não comunicados.
- Escopo por escola como já existe nos RPCs.

## [S6] Delivery
- Migration SQL replace dos dois RPCs.
- Aplicar no Supabase.
- Smoke: ranking ainda responde.

## [S7] Out of scope
- Tabela de ledger de XP.
- Frontend de “feed de conquistas”.
