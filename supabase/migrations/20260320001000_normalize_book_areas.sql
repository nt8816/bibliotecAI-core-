create or replace function public.normalize_book_area_key(input text)
returns text
language sql
immutable
as $$
  select lower(
    regexp_replace(
      translate(
        coalesce(input, ''),
        'ÁÀÃÂÄáàãâäÉÈÊËéèêëÍÌÎÏíìîïÓÒÕÔÖóòõôöÚÙÛÜúùûüÇç',
        'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCc'
      ),
      '\s+',
      ' ',
      'g'
    )
  );
$$;

update public.livros l
set area = c.nome
from public.categorias_livros c
where l.escola_id = c.escola_id
  and public.normalize_book_area_key(l.area) = public.normalize_book_area_key(c.nome)
  and coalesce(l.area, '') <> coalesce(c.nome, '');

update public.livros
set area = case public.normalize_book_area_key(area)
  when 'ciencias' then 'Ciências'
  when 'ciencia' then 'Ciências'
  when 'matematica' then 'Matemática'
  when 'historia' then 'História'
  when 'geografia' then 'Geografia'
  when 'literatura' then 'Literatura'
  when 'infantil' then 'Infantil'
  when 'arte' then 'Artes'
  when 'artes' then 'Artes'
  when 'filosofia' then 'Filosofia'
  when 'sociologia' then 'Sociologia'
  when 'fisica' then 'Física'
  when 'quimica' then 'Química'
  when 'biologia' then 'Biologia'
  when 'programacao' then 'Programação'
  when 'informatica' then 'Informática'
  when 'quadrinho' then 'Quadrinhos'
  when 'quadrinhos' then 'Quadrinhos'
  when 'hq' then 'Quadrinhos'
  when 'gibi' then 'Quadrinhos'
  when 'manga' then 'Quadrinhos'
  else area
end
where area is not null;
