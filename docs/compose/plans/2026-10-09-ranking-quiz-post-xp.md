# Ranking Quiz/Post XP Implementation Plan

> **For agentic workers:** Use compose:execute to implement this plan task-by-task.

**Goal:** Include community quiz acertos and student community posts in school ranking XP.

**Architecture:** SQL RPC `get_aluno_rankings` + `get_school_rankings` extended; no new tables.

## Global Constraints
- Keep existing XP sources unchanged
- Quiz: 10 XP × best acertos per quiz
- Post: 20 XP for tipo in resenha,quiz,dica,sugestao
- No push unless asked

### Task 1: Migration
Create `supabase/migrations/20261009120000_ranking_quiz_post_xp.sql` replacing both ranking functions with quiz/post XP CTEs.

### Task 2: Apply + verify
`supabase db push`; curl rankings 401/200 smoke; tests if any.

### Task 3: Local commit only
Commit migration; do not push unless user asks.
