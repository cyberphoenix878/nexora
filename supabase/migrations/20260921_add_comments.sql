create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null,
  user_id uuid not null,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.comments add column if not exists article_id uuid;
alter table public.comments add column if not exists user_id uuid;
alter table public.comments add column if not exists content text;
alter table public.comments add column if not exists created_at timestamptz not null default now();
alter table public.comments add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.comments'::regclass and conname = 'comments_content_length_check') then
    alter table public.comments add constraint comments_content_length_check check (char_length(content) between 1 and 2000) not valid;
  end if;
end $$;

create index if not exists comments_article_id_created_at_idx
  on public.comments(article_id, created_at);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.comments'::regclass
      and confrelid = 'public.articles'::regclass
      and contype = 'f'
  ) then
    alter table public.comments
      add constraint comments_article_id_fkey
      foreign key (article_id) references public.articles(id)
      on delete cascade
      not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.comments'::regclass
      and confrelid = 'auth.users'::regclass
      and contype = 'f'
  ) then
    alter table public.comments
      add constraint comments_user_id_fkey
      foreign key (user_id) references auth.users(id)
      on delete cascade
      not valid;
  end if;
end $$;

alter table public.comments enable row level security;

drop policy if exists "public comments" on public.comments;
drop policy if exists "read accessible comments" on public.comments;
create policy "read accessible comments"
  on public.comments for select
  using (
    exists (
      select 1
      from public.articles
      where articles.id = comments.article_id
        and (articles.published or articles.author_id = auth.uid() or public.is_admin())
    )
  );

drop policy if exists "auth comments" on public.comments;
drop policy if exists "own comment insert" on public.comments;
create policy "own comment insert"
  on public.comments for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.articles
      where articles.id = comments.article_id
        and articles.published
    )
  );

drop policy if exists "own comment update" on public.comments;
create policy "own comment update"
  on public.comments for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "own/admin comment delete" on public.comments;
create policy "own/admin comment delete"
  on public.comments for delete
  using (auth.uid() = user_id or public.is_admin());

notify pgrst, 'reload schema';

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (article_id, user_id)
);

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (article_id, user_id)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.likes'::regclass and conname = 'likes_article_id_user_id_key') then
    alter table public.likes add constraint likes_article_id_user_id_key unique (article_id, user_id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.bookmarks'::regclass and conname = 'bookmarks_article_id_user_id_key') then
    alter table public.bookmarks add constraint bookmarks_article_id_user_id_key unique (article_id, user_id);
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.likes'::regclass and confrelid = 'public.articles'::regclass and contype = 'f') then
    alter table public.likes add constraint likes_article_id_fkey foreign key (article_id) references public.articles(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.likes'::regclass and confrelid = 'auth.users'::regclass and contype = 'f') then
    alter table public.likes add constraint likes_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.bookmarks'::regclass and confrelid = 'public.articles'::regclass and contype = 'f') then
    alter table public.bookmarks add constraint bookmarks_article_id_fkey foreign key (article_id) references public.articles(id) on delete cascade not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.bookmarks'::regclass and confrelid = 'auth.users'::regclass and contype = 'f') then
    alter table public.bookmarks add constraint bookmarks_user_id_fkey foreign key (user_id) references auth.users(id) on delete cascade not valid;
  end if;
end $$;

alter table public.likes enable row level security;
alter table public.bookmarks enable row level security;

drop policy if exists "public likes" on public.likes;
create policy "public likes" on public.likes for select using (true);
drop policy if exists "own likes" on public.likes;
create policy "own likes" on public.likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "public bookmarks" on public.bookmarks;
create policy "public bookmarks" on public.bookmarks for select using (true);
drop policy if exists "own bookmarks" on public.bookmarks;
create policy "own bookmarks" on public.bookmarks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create or replace function public.sync_like_count()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update public.articles set likes_count = (select count(*) from public.likes where article_id = coalesce(new.article_id, old.article_id)) where id = coalesce(new.article_id, old.article_id);
  return coalesce(new, old);
end;
$$;

create or replace function public.sync_bookmark_count()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  update public.articles set bookmarks_count = (select count(*) from public.bookmarks where article_id = coalesce(new.article_id, old.article_id)) where id = coalesce(new.article_id, old.article_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists likes_count_insert on public.likes;
create trigger likes_count_insert after insert or delete on public.likes for each row execute function public.sync_like_count();
drop trigger if exists bookmarks_count_insert on public.bookmarks;
create trigger bookmarks_count_insert after insert or delete on public.bookmarks for each row execute function public.sync_bookmark_count();

notify pgrst, 'reload schema';
