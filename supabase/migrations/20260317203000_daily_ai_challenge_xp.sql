alter table public.preferencias_aluno
  add column if not exists desafio_ia_ativo jsonb,
  add column if not exists desafio_ia_gerado_em timestamptz,
  add column if not exists desafio_ia_concluido_em timestamptz,
  add column if not exists desafio_ia_xp_bonus integer not null default 0;
