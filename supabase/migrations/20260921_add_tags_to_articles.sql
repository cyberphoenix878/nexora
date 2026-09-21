create extension if not exists pgcrypto;

do $$
begin
  create type public.user_role as enum ('user', 'admin');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text not null default '',
  avatar_url text,
  bio text not null default '',
  role public.user_role not null default 'user',
  created_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text unique not null,
  description text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  slug text unique not null,
  excerpt text not null default '',
  content text not null default '',
  cover_image text,
  category_id uuid references public.categories(id) on delete set null,
  tags text[] not null default '{}'::text[],
  published boolean not null default false,
  reading_time integer not null default 1,
  likes_count integer not null default 0,
  bookmarks_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (article_id, user_id)
);

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.articles(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (article_id, user_id)
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists full_name text default '';
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text default '';
alter table public.profiles add column if not exists role public.user_role default 'user';
alter table public.profiles add column if not exists created_at timestamptz default now();
alter table public.categories add column if not exists name text;
alter table public.categories add column if not exists slug text;
alter table public.categories add column if not exists description text default '';
alter table public.categories add column if not exists created_at timestamptz default now();
alter table public.articles add column if not exists author_id uuid;
alter table public.articles add column if not exists title text;
alter table public.articles add column if not exists slug text;
alter table public.articles add column if not exists excerpt text default '';
alter table public.articles add column if not exists content text default '';
alter table public.articles add column if not exists cover_image text;
alter table public.articles add column if not exists category_id uuid;
alter table public.articles add column if not exists tags text[] not null default '{}'::text[];
alter table public.articles add column if not exists published boolean not null default false;
alter table public.articles add column if not exists reading_time integer not null default 1;
alter table public.articles add column if not exists likes_count integer not null default 0;
alter table public.articles add column if not exists bookmarks_count integer not null default 0;
alter table public.articles add column if not exists created_at timestamptz not null default now();
alter table public.articles add column if not exists updated_at timestamptz not null default now();
alter table public.comments add column if not exists article_id uuid;
alter table public.comments add column if not exists user_id uuid;
alter table public.comments add column if not exists content text;
alter table public.comments add column if not exists created_at timestamptz not null default now();
alter table public.likes add column if not exists article_id uuid;
alter table public.likes add column if not exists user_id uuid;
alter table public.likes add column if not exists created_at timestamptz not null default now();
alter table public.bookmarks add column if not exists article_id uuid;
alter table public.bookmarks add column if not exists user_id uuid;
alter table public.bookmarks add column if not exists created_at timestamptz not null default now();

create index if not exists articles_author_id_idx on public.articles(author_id);
create index if not exists articles_category_id_idx on public.articles(category_id);
create index if not exists articles_published_created_at_idx on public.articles(published, created_at desc);
create index if not exists comments_article_id_idx on public.comments(article_id);

insert into public.categories (name, slug, description) values
  ('Technology', 'technology', 'Tools and ideas shaping tomorrow.'),
  ('Programming', 'programming', 'Practical craft for building software.'),
  ('AI', 'ai', 'The systems changing how we think and work.'),
  ('Web Development', 'web-development', 'Modern interfaces and the web platform.'),
  ('Business', 'business', 'Strategy, markets, and meaningful growth.'),
  ('Education', 'education', 'Learning that compounds.'),
  ('Gaming', 'gaming', 'Play, culture, and interactive worlds.'),
  ('Lifestyle', 'lifestyle', 'A better way to spend your attention.'),
  ('Productivity', 'productivity', 'Systems for doing work that matters.')
on conflict (slug) do nothing;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') $$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, username, full_name, avatar_url)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), 'user-' || substr(new.id::text, 1, 8)),
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, username, full_name, avatar_url)
select
  u.id,
  'user-' || substr(u.id::text, 1, 8),
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  u.raw_user_meta_data->>'avatar_url'
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

create or replace function public.sync_like_count()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.articles
  set likes_count = (select count(*) from public.likes where article_id = coalesce(new.article_id, old.article_id))
  where id = coalesce(new.article_id, old.article_id);
  return coalesce(new, old);
end;
$$;

create or replace function public.sync_bookmark_count()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  update public.articles
  set bookmarks_count = (select count(*) from public.bookmarks where article_id = coalesce(new.article_id, old.article_id))
  where id = coalesce(new.article_id, old.article_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists likes_count_insert on public.likes;
create trigger likes_count_insert after insert or delete on public.likes for each row execute function public.sync_like_count();
drop trigger if exists bookmarks_count_insert on public.bookmarks;
create trigger bookmarks_count_insert after insert or delete on public.bookmarks for each row execute function public.sync_bookmark_count();

create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() and new.role is distinct from old.role then
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role before update on public.profiles for each row execute function public.prevent_profile_role_change();

alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.articles enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.bookmarks enable row level security;

drop policy if exists "public profiles" on public.profiles;
drop policy if exists "own profile update" on public.profiles;
drop policy if exists "own profile insert" on public.profiles;
create policy "public profiles" on public.profiles for select using (true);
create policy "own profile update" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "public categories" on public.categories;
drop policy if exists "admin categories" on public.categories;
create policy "public categories" on public.categories for select using (true);
create policy "admin categories" on public.categories for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "published or owner articles" on public.articles;
drop policy if exists "own article insert" on public.articles;
drop policy if exists "own article update" on public.articles;
drop policy if exists "own article delete" on public.articles;
create policy "published or owner articles" on public.articles for select using (published or auth.uid() = author_id or public.is_admin());
create policy "own article insert" on public.articles for insert with check (auth.uid() = author_id or public.is_admin());
create policy "own article update" on public.articles for update using (auth.uid() = author_id or public.is_admin()) with check (auth.uid() = author_id or public.is_admin());
create policy "own article delete" on public.articles for delete using (auth.uid() = author_id or public.is_admin());

drop policy if exists "public comments" on public.comments;
drop policy if exists "auth comments" on public.comments;
drop policy if exists "own/admin comment delete" on public.comments;
create policy "public comments" on public.comments for select using (true);
create policy "auth comments" on public.comments for insert with check (auth.uid() = user_id);
create policy "own/admin comment delete" on public.comments for delete using (auth.uid() = user_id or public.is_admin());

drop policy if exists "public likes" on public.likes;
drop policy if exists "own likes" on public.likes;
create policy "public likes" on public.likes for select using (true);
create policy "own likes" on public.likes for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own bookmarks" on public.bookmarks;
create policy "own bookmarks" on public.bookmarks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('article-images', 'article-images', true)
on conflict (id) do update set public = true;

drop policy if exists "public media read" on storage.objects;
drop policy if exists "users upload media" on storage.objects;
drop policy if exists "users update media" on storage.objects;
drop policy if exists "users delete media" on storage.objects;
create policy "public article images read" on storage.objects for select using (bucket_id = 'article-images');
create policy "users upload article images" on storage.objects for insert with check (bucket_id = 'article-images' and auth.uid()::text = (storage.foldername(name))[2]);
create policy "users update article images" on storage.objects for update using (bucket_id = 'article-images' and auth.uid()::text = (storage.foldername(name))[2]);
create policy "users delete article images" on storage.objects for delete using (bucket_id = 'article-images' and auth.uid()::text = (storage.foldername(name))[2]);

notify pgrst, 'reload schema';
