create table public.contatos_site (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  email text not null,
  escola text not null default '',
  assunto text not null,
  mensagem text not null,
  email_status text not null default 'pendente' check (email_status in ('pendente', 'enviado', 'falhou')),
  ip_hash text not null,
  created_at timestamptz not null default now()
);

alter table public.contatos_site enable row level security;
revoke all on public.contatos_site from anon, authenticated;
grant select, insert, update on public.contatos_site to service_role;
create index contatos_site_ip_created_idx on public.contatos_site (ip_hash, created_at desc);

create function public.registrar_contato_publico(
  p_nome text, p_email text, p_escola text, p_assunto text, p_mensagem text, p_ip_hash text
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare novo_id uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_ip_hash, 0));
  if (select count(*) from public.contatos_site where ip_hash = p_ip_hash and created_at > now() - interval '1 hour') >= 5 then
    return null;
  end if;
  insert into public.contatos_site (nome, email, escola, assunto, mensagem, ip_hash)
  values (p_nome, p_email, p_escola, p_assunto, p_mensagem, p_ip_hash) returning id into novo_id;
  return novo_id;
end;
$$;
revoke all on function public.registrar_contato_publico(text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_contato_publico(text, text, text, text, text, text) to service_role;
