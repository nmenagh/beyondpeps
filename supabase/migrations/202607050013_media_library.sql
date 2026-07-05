create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  url text not null,
  path text,
  folder text not null default 'uploads',
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (url)
);

alter table public.media_assets enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'media_assets' and policyname = 'Media assets are public') then
    create policy "Media assets are public" on public.media_assets for select to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'media_assets' and policyname = 'Admins manage media assets') then
    create policy "Admins manage media assets" on public.media_assets for all to authenticated using (public.beyond_peps_is_admin()) with check (public.beyond_peps_is_admin());
  end if;
end;
$$;

insert into public.media_assets (name, url, folder)
select distinct
  regexp_replace(split_part(url_value, '?', 1), '^.*/', ''),
  url_value,
  'products'
from (
  select image_url as url_value from public.products where coalesce(image_url, '') <> ''
  union all
  select unnest(gallery_image_urls) as url_value from public.products where coalesce(array_length(gallery_image_urls, 1), 0) > 0
) product_images
where coalesce(url_value, '') <> ''
on conflict (url) do update
set name = coalesce(nullif(public.media_assets.name, ''), excluded.name),
    folder = coalesce(nullif(public.media_assets.folder, ''), excluded.folder),
    updated_at = now();
