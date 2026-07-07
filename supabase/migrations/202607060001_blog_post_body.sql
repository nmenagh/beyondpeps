alter table if exists public.blog_posts
  add column if not exists body text not null default '';

update public.blog_posts
set body = summary
where coalesce(body, '') = ''
  and coalesce(summary, '') <> '';
