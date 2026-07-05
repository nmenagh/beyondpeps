alter table if exists public.products add column if not exists image_url text;
alter table if exists public.blog_posts add column if not exists image_url text;
alter table if exists public.blog_posts add column if not exists hero_image_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'beyond-peps-media',
  'beyond-peps-media',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'Public can read Beyond Peps media'
  ) then
    drop policy "Public can read Beyond Peps media" on storage.objects;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'Admins can upload Beyond Peps media'
  ) then
    drop policy "Admins can upload Beyond Peps media" on storage.objects;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'Admins can update Beyond Peps media'
  ) then
    drop policy "Admins can update Beyond Peps media" on storage.objects;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'storage'
    and tablename = 'objects'
    and policyname = 'Admins can delete Beyond Peps media'
  ) then
    drop policy "Admins can delete Beyond Peps media" on storage.objects;
  end if;

  create policy "Public can read Beyond Peps media"
    on storage.objects for select
    to anon, authenticated
    using (bucket_id = 'beyond-peps-media');

  create policy "Admins can upload Beyond Peps media"
    on storage.objects for insert
    to authenticated
    with check (bucket_id = 'beyond-peps-media' and public.beyond_peps_is_admin());

  create policy "Admins can update Beyond Peps media"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'beyond-peps-media' and public.beyond_peps_is_admin())
    with check (bucket_id = 'beyond-peps-media' and public.beyond_peps_is_admin());

  create policy "Admins can delete Beyond Peps media"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'beyond-peps-media' and public.beyond_peps_is_admin());
end;
$$;
