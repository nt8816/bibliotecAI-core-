-- Ranking: soma XP de quiz de comunidade (melhor tentativa) e posts do aluno (não comunicados).

BEGIN;

CREATE OR REPLACE FUNCTION public.get_aluno_rankings()
RETURNS TABLE (
  id uuid,
  nome text,
  turma text,
  xp_total integer,
  nivel integer,
  livros_lidos integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  with current_student as (
    select
      public.current_aluno_profile_id() as aluno_id,
      public.current_aluno_escola_id() as escola_id
  ),
  alunos as (
    select ub.id, ub.nome, ub.turma
    from public.usuarios_biblioteca ub
    join current_student cs on cs.escola_id is not null and ub.escola_id = cs.escola_id
    where lower(coalesce(ub.tipo::text, 'aluno')) not in ('gestor', 'bibliotecaria', 'professor', 'super_admin')
      and (
        lower(coalesce(ub.tipo::text, '')) = 'aluno'
        or ub.id = cs.aluno_id
        or exists (select 1 from public.emprestimos e where e.usuario_id = ub.id)
        or exists (select 1 from public.avaliacoes_livros av where av.usuario_id = ub.id)
        or exists (select 1 from public.atividades_entregas ae where ae.aluno_id = ub.id)
        or exists (select 1 from public.preferencias_aluno pa where pa.usuario_id = ub.id)
        or exists (select 1 from public.comunidade_quiz_tentativas qt where qt.aluno_id = ub.id)
        or exists (select 1 from public.comunidade_posts cp where cp.autor_id = ub.id)
      )
  ),
  livros_pontuados_distintos as (
    select distinct e.usuario_id as aluno_id, e.livro_id
    from public.emprestimos e
    join alunos a on a.id = e.usuario_id
    where e.status = 'devolvido'
      and e.livro_id is not null
  ),
  xp_leituras as (
    select
      lpd.aluno_id,
      count(*)::int as livros_lidos,
      coalesce(sum(public.get_livro_xp_categoria_sql(l.area)), 0)::int as xp_leituras
    from livros_pontuados_distintos lpd
    left join public.livros l on l.id = lpd.livro_id
    group by lpd.aluno_id
  ),
  xp_avaliacoes as (
    select usuario_id as aluno_id, count(*)::int as total_avaliacoes
    from public.avaliacoes_livros
    where usuario_id in (select id from alunos)
    group by usuario_id
  ),
  xp_atividades as (
    select
      aluno_id,
      count(*) filter (where status = 'aprovada')::int as atividades_aprovadas,
      coalesce(sum(case when status = 'aprovada' then coalesce(pontos_ganhos, 0) else 0 end), 0)::int as pontos_ganhos
    from public.atividades_entregas
    where aluno_id in (select id from alunos)
    group by aluno_id
  ),
  xp_bonus as (
    select
      usuario_id as aluno_id,
      coalesce(desafio_ia_xp_bonus, 0)::int as bonus_desafio
    from public.preferencias_aluno
    where usuario_id in (select id from alunos)
  ),
  quiz_melhor as (
    select qt.aluno_id, qt.post_id, max(qt.acertos)::int as best_acertos
    from public.comunidade_quiz_tentativas qt
    where qt.aluno_id in (select id from alunos)
    group by qt.aluno_id, qt.post_id
  ),
  xp_quizzes as (
    select
      aluno_id,
      coalesce(sum(best_acertos), 0)::int as quiz_acertos_total,
      (coalesce(sum(best_acertos), 0) * 10)::int as xp_quizzes
    from quiz_melhor
    group by aluno_id
  ),
  xp_posts as (
    select
      cp.autor_id as aluno_id,
      count(*)::int as posts_comunidade,
      (count(*) * 20)::int as xp_posts
    from public.comunidade_posts cp
    where cp.autor_id in (select id from alunos)
      and lower(coalesce(cp.tipo::text, '')) in ('resenha', 'quiz', 'dica', 'sugestao')
    group by cp.autor_id
  ),
  xp_total as (
    select
      a.id as aluno_id,
      (
        coalesce(xl.xp_leituras, 0)
        + (coalesce(xa.total_avaliacoes, 0) * 15)
        + (coalesce(xat.atividades_aprovadas, 0) * 25)
        + coalesce(xat.pontos_ganhos, 0)
        + coalesce(xb.bonus_desafio, 0)
        + coalesce(xq.xp_quizzes, 0)
        + coalesce(xp.xp_posts, 0)
      )::int as xp
    from alunos a
    left join xp_leituras xl on xl.aluno_id = a.id
    left join xp_avaliacoes xa on xa.aluno_id = a.id
    left join xp_atividades xat on xat.aluno_id = a.id
    left join xp_bonus xb on xb.aluno_id = a.id
    left join xp_quizzes xq on xq.aluno_id = a.id
    left join xp_posts xp on xp.aluno_id = a.id
  )
  select
    a.id,
    a.nome,
    a.turma,
    t.xp as xp_total,
    greatest(1, floor(t.xp / 150.0)::int + 1) as nivel,
    coalesce(xl.livros_lidos, 0)::int as livros_lidos
  from alunos a
  join xp_total t on t.aluno_id = a.id
  left join xp_leituras xl on xl.aluno_id = a.id
  order by t.xp desc, nivel desc, a.nome asc;
$$;

GRANT EXECUTE ON FUNCTION public.get_aluno_rankings() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_school_rankings()
RETURNS TABLE (
  id uuid,
  nome text,
  turma text,
  xp_total integer,
  nivel integer,
  livros_lidos integer
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  with contexto_usuario as (
    select public.get_user_escola_id(auth.uid()) as escola_id
  ),
  alunos as (
    select ub.id, ub.nome, ub.turma
    from public.usuarios_biblioteca ub
    join contexto_usuario cu on cu.escola_id is not null and ub.escola_id = cu.escola_id
    where lower(coalesce(ub.tipo::text, 'aluno')) not in ('gestor', 'bibliotecaria', 'professor', 'super_admin')
      and (
        lower(coalesce(ub.tipo::text, '')) = 'aluno'
        or exists (select 1 from public.emprestimos e where e.usuario_id = ub.id)
        or exists (select 1 from public.avaliacoes_livros av where av.usuario_id = ub.id)
        or exists (select 1 from public.atividades_entregas ae where ae.aluno_id = ub.id)
        or exists (select 1 from public.preferencias_aluno pa where pa.usuario_id = ub.id)
        or exists (select 1 from public.comunidade_quiz_tentativas qt where qt.aluno_id = ub.id)
        or exists (select 1 from public.comunidade_posts cp where cp.autor_id = ub.id)
      )
  ),
  livros_pontuados_distintos as (
    select distinct e.usuario_id as aluno_id, e.livro_id
    from public.emprestimos e
    join alunos a on a.id = e.usuario_id
    where e.status = 'devolvido'
      and e.livro_id is not null
  ),
  xp_leituras as (
    select
      lpd.aluno_id,
      count(*)::int as livros_lidos,
      coalesce(sum(public.get_livro_xp_categoria_sql(l.area)), 0)::int as xp_leituras
    from livros_pontuados_distintos lpd
    left join public.livros l on l.id = lpd.livro_id
    group by lpd.aluno_id
  ),
  xp_avaliacoes as (
    select usuario_id as aluno_id, count(*)::int as total_avaliacoes
    from public.avaliacoes_livros
    where usuario_id in (select id from alunos)
    group by usuario_id
  ),
  xp_atividades as (
    select
      aluno_id,
      count(*) filter (where status = 'aprovada')::int as atividades_aprovadas,
      coalesce(sum(case when status = 'aprovada' then coalesce(pontos_ganhos, 0) else 0 end), 0)::int as pontos_ganhos
    from public.atividades_entregas
    where aluno_id in (select id from alunos)
    group by aluno_id
  ),
  xp_bonus as (
    select
      usuario_id as aluno_id,
      coalesce(desafio_ia_xp_bonus, 0)::int as bonus_desafio
    from public.preferencias_aluno
    where usuario_id in (select id from alunos)
  ),
  quiz_melhor as (
    select qt.aluno_id, qt.post_id, max(qt.acertos)::int as best_acertos
    from public.comunidade_quiz_tentativas qt
    where qt.aluno_id in (select id from alunos)
    group by qt.aluno_id, qt.post_id
  ),
  xp_quizzes as (
    select
      aluno_id,
      coalesce(sum(best_acertos), 0)::int as quiz_acertos_total,
      (coalesce(sum(best_acertos), 0) * 10)::int as xp_quizzes
    from quiz_melhor
    group by aluno_id
  ),
  xp_posts as (
    select
      cp.autor_id as aluno_id,
      count(*)::int as posts_comunidade,
      (count(*) * 20)::int as xp_posts
    from public.comunidade_posts cp
    where cp.autor_id in (select id from alunos)
      and lower(coalesce(cp.tipo::text, '')) in ('resenha', 'quiz', 'dica', 'sugestao')
    group by cp.autor_id
  ),
  xp_total as (
    select
      a.id as aluno_id,
      (
        coalesce(xl.xp_leituras, 0)
        + (coalesce(xa.total_avaliacoes, 0) * 15)
        + (coalesce(xat.atividades_aprovadas, 0) * 25)
        + coalesce(xat.pontos_ganhos, 0)
        + coalesce(xb.bonus_desafio, 0)
        + coalesce(xq.xp_quizzes, 0)
        + coalesce(xp.xp_posts, 0)
      )::int as xp
    from alunos a
    left join xp_leituras xl on xl.aluno_id = a.id
    left join xp_avaliacoes xa on xa.aluno_id = a.id
    left join xp_atividades xat on xat.aluno_id = a.id
    left join xp_bonus xb on xb.aluno_id = a.id
    left join xp_quizzes xq on xq.aluno_id = a.id
    left join xp_posts xp on xp.aluno_id = a.id
  )
  select
    a.id,
    a.nome,
    a.turma,
    t.xp as xp_total,
    greatest(1, floor(t.xp / 150.0)::int + 1) as nivel,
    coalesce(xl.livros_lidos, 0)::int as livros_lidos
  from alunos a
  join xp_total t on t.aluno_id = a.id
  left join xp_leituras xl on xl.aluno_id = a.id
  order by t.xp desc, nivel desc, a.nome asc;
$$;

GRANT EXECUTE ON FUNCTION public.get_school_rankings() TO authenticated;

COMMIT;
