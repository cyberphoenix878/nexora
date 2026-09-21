alter table public.articles add column if not exists likes_count integer not null default 0;
alter table public.articles add column if not exists bookmarks_count integer not null default 0;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.articles'::regclass
      and confrelid = 'public.profiles'::regclass
      and contype = 'f'
  ) then
    alter table public.articles
      add constraint articles_author_id_fkey
      foreign key (author_id) references public.profiles(id)
      not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.articles'::regclass
      and confrelid = 'public.categories'::regclass
      and contype = 'f'
  ) then
    alter table public.articles
      add constraint articles_category_id_fkey
      foreign key (category_id) references public.categories(id)
      not valid;
  end if;
end $$;