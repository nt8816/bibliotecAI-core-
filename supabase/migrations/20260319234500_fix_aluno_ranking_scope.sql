create or replace function public.get_aluno_rankings()
returns table (
  id uuid,
  nome text,
  turma text,
  xp_total integer,
  nivel integer,
  livros_lidos integer
)
language sql
security definer
set search_path = public
as $$
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
      )
  ),
  livros_pontuados_distintos as (
    select distinct e.usuario_id as aluno_id, e.livro_id
    from public.emprestimos e
    join alunos a on a.id = e.usuario_id
    where e.status in ('ativo', 'devolvido')
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
  )
  select
    a.id,
    a.nome,
    a.turma,
    (
      coalesce(xl.xp_leituras, 0)
      + (coalesce(xa.total_avaliacoes, 0) * 15)
      + (coalesce(xat.atividades_aprovadas, 0) * 25)
      + coalesce(xat.pontos_ganhos, 0)
      + coalesce(xb.bonus_desafio, 0)
    )::int as xp_total,
    greatest(
      1,
      floor(
        (
          coalesce(xl.xp_leituras, 0)
          + (coalesce(xa.total_avaliacoes, 0) * 15)
          + (coalesce(xat.atividades_aprovadas, 0) * 25)
          + coalesce(xat.pontos_ganhos, 0)
          + coalesce(xb.bonus_desafio, 0)
        ) / 150.0
      )::int + 1
    ) as nivel,
    coalesce(xl.livros_lidos, 0)::int as livros_lidos
  from alunos a
  left join xp_leituras xl on xl.aluno_id = a.id
  left join xp_avaliacoes xa on xa.aluno_id = a.id
  left join xp_atividades xat on xat.aluno_id = a.id
  left join xp_bonus xb on xb.aluno_id = a.id
  order by xp_total desc, nivel desc, nome asc;
$$;

grant execute on function public.get_aluno_rankings() to authenticated;
