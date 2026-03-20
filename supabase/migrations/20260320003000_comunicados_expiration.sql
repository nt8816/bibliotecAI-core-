alter table public.comunidade_posts
  add column if not exists expires_at timestamptz;

create index if not exists comunidade_posts_expires_at_idx
  on public.comunidade_posts (expires_at);

create or replace function public.cleanup_expired_comunicados()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  deleted_count integer := 0;
begin
  with deleted_rows as (
    delete from public.comunidade_posts
    where tipo = 'comunicado'
      and expires_at is not null
      and expires_at <= now()
    returning id
  )
  select count(*)::int into deleted_count from deleted_rows;

  return deleted_count;
end;
$$;

grant execute on function public.cleanup_expired_comunicados() to authenticated;
