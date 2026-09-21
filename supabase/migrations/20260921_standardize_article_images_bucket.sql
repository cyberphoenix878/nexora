insert into storage.buckets (id, name, public)
values ('article-images', 'article-images', true)
on conflict (id) do update set public = true;

drop policy if exists "public article images read" on storage.objects;
drop policy if exists "users upload article images" on storage.objects;
drop policy if exists "users update article images" on storage.objects;
drop policy if exists "users delete article images" on storage.objects;
drop policy if exists "public media read" on storage.objects;
drop policy if exists "users upload media" on storage.objects;
drop policy if exists "users update media" on storage.objects;
drop policy if exists "users delete media" on storage.objects;

create policy "public article images read" on storage.objects
for select using (bucket_id = 'article-images');

create policy "users upload article images" on storage.objects
for insert
with check (
  bucket_id = 'article-images'
  and auth.uid()::text = (storage.foldername(name))[2]
);

create policy "users update article images" on storage.objects
for update
using (
  bucket_id = 'article-images'
  and auth.uid()::text = (storage.foldername(name))[2]
)
with check (
  bucket_id = 'article-images'
  and auth.uid()::text = (storage.foldername(name))[2]
);

create policy "users delete article images" on storage.objects
for delete
using (
  bucket_id = 'article-images'
  and auth.uid()::text = (storage.foldername(name))[2]
);