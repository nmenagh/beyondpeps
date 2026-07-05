alter table if exists public.products
add column if not exists gallery_image_urls text[] not null default '{}';

update public.products
set gallery_image_urls = array[image_url]
where coalesce(array_length(gallery_image_urls, 1), 0) = 0
and coalesce(image_url, '') <> '';
