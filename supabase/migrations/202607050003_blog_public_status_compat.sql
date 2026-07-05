alter table if exists public.blog_posts add column if not exists published boolean not null default false;

update public.blog_posts
set published = true,
    status = 'published',
    published_at = coalesce(published_at, now())
where slug in ('building-a-better-peptide-supply-station', 'why-calculators-need-context');

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
    and tablename = 'blog_posts'
    and policyname = 'Public can read published posts'
  ) then
    drop policy "Public can read published posts" on public.blog_posts;
  end if;

  create policy "Public can read published posts"
    on public.blog_posts for select
    to anon, authenticated
    using (published = true or status = 'published');
end;
$$;
