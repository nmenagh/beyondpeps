update public.products
set image_url = regexp_replace(image_url, '^https?://[^/]+/', '/')
where image_url ~ '^https?://[^/]+/assets/products/';

update public.products
set image_url = '/' || image_url
where image_url like 'assets/products/%';
