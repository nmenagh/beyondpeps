create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.references (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  type text not null default 'Guide',
  summary text not null default '',
  body text not null default '',
  status text not null default 'draft',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.calculator_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label text not null,
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete cascade,
  provider text not null,
  provider_reference text,
  status text not null default 'created',
  amount_cents integer not null default 0,
  currency text not null default 'USD',
  raw_response jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table if exists public.products add column if not exists slug text;
alter table if exists public.products add column if not exists title text not null default '';
alter table if exists public.products add column if not exists name text not null default '';
alter table if exists public.products add column if not exists category text not null default 'Research Supplies';
alter table if exists public.products add column if not exists summary text not null default '';
alter table if exists public.products add column if not exists description text not null default '';
alter table if exists public.products add column if not exists price_cents integer not null default 0;
alter table if exists public.products add column if not exists currency text not null default 'USD';
alter table if exists public.products add column if not exists status text not null default 'draft';
alter table if exists public.products add column if not exists tags text[] not null default '{}';
alter table if exists public.products add column if not exists featured boolean not null default false;
alter table if exists public.products add column if not exists inventory_count integer;
alter table if exists public.products add column if not exists image_url text;
alter table if exists public.products add column if not exists sort_order integer not null default 0;
alter table if exists public.products add column if not exists created_at timestamptz not null default now();
alter table if exists public.products add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
    and table_name = 'products'
    and column_name = 'title'
  ) then
    update public.products
    set name = title
    where coalesce(name, '') = '';
  end if;
end;
$$;

update public.products
set title = name
where coalesce(title, '') = ''
and coalesce(name, '') <> '';

update public.products
set slug = lower(regexp_replace(coalesce(nullif(slug, ''), nullif(name, ''), id::text), '[^a-zA-Z0-9]+', '-', 'g'))
where slug is null or slug = '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_slug_key'
    and conrelid = 'public.products'::regclass
  ) then
    alter table public.products add constraint products_slug_key unique (slug);
  end if;
end;
$$;

alter table if exists public.blog_posts add column if not exists slug text;
alter table if exists public.blog_posts add column if not exists summary text not null default '';
alter table if exists public.blog_posts add column if not exists body text not null default '';
alter table if exists public.blog_posts add column if not exists status text not null default 'draft';
alter table if exists public.blog_posts add column if not exists published_at timestamptz;
alter table if exists public.blog_posts add column if not exists created_at timestamptz not null default now();
alter table if exists public.blog_posts add column if not exists updated_at timestamptz not null default now();

update public.blog_posts
set slug = lower(regexp_replace(coalesce(slug, title, id::text), '[^a-zA-Z0-9]+', '-', 'g'))
where slug is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'blog_posts_slug_key'
    and conrelid = 'public.blog_posts'::regclass
  ) then
    alter table public.blog_posts add constraint blog_posts_slug_key unique (slug);
  end if;
end;
$$;

alter table if exists public.orders add column if not exists user_id uuid references auth.users(id);
alter table if exists public.orders add column if not exists email text;
alter table if exists public.orders add column if not exists status text not null default 'pending';
alter table if exists public.orders add column if not exists subtotal_cents integer not null default 0;
alter table if exists public.orders add column if not exists total_cents integer not null default 0;
alter table if exists public.orders add column if not exists currency text not null default 'USD';
alter table if exists public.orders add column if not exists payment_provider text;
alter table if exists public.orders add column if not exists payment_reference text;
alter table if exists public.orders add column if not exists metadata jsonb not null default '{}';
alter table if exists public.orders add column if not exists created_at timestamptz not null default now();
alter table if exists public.orders add column if not exists updated_at timestamptz not null default now();

alter table if exists public.order_items add column if not exists product_id uuid references public.products(id);
alter table if exists public.order_items add column if not exists product_name text not null default '';
alter table if exists public.order_items add column if not exists quantity integer not null default 1;
alter table if exists public.order_items add column if not exists unit_price_cents integer not null default 0;
alter table if exists public.order_items add column if not exists total_cents integer not null default 0;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'site_settings',
    'products',
    'references',
    'blog_posts',
    'calculator_settings',
    'orders',
    'payment_attempts'
  ]
  loop
    if to_regclass('public.' || target_table) is not null then
      execute format('drop trigger if exists %I on public.%I', 'set_' || target_table || '_updated_at', target_table);
      execute format(
        'create trigger %I before update on public.%I for each row execute function public.set_updated_at()',
        'set_' || target_table || '_updated_at',
        target_table
      );
    end if;
  end loop;
end;
$$;

alter table public.admin_users enable row level security;
alter table public.site_settings enable row level security;
alter table public.products enable row level security;
alter table public.references enable row level security;
alter table public.blog_posts enable row level security;
alter table public.calculator_settings enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.payment_attempts enable row level security;

create or replace function public.beyond_peps_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  );
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'admin_users' and policyname = 'Admins can view admin users') then
    create policy "Admins can view admin users" on public.admin_users for select to authenticated using (public.beyond_peps_is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'site_settings' and policyname = 'Site settings are public') then
    create policy "Site settings are public" on public.site_settings for select to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'site_settings' and policyname = 'Admins manage site settings') then
    create policy "Admins manage site settings" on public.site_settings for all to authenticated using (public.beyond_peps_is_admin()) with check (public.beyond_peps_is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'references' and policyname = 'Published references are public') then
    create policy "Published references are public" on public.references for select to anon, authenticated using (status = 'published');
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'references' and policyname = 'Admins manage references') then
    create policy "Admins manage references" on public.references for all to authenticated using (public.beyond_peps_is_admin()) with check (public.beyond_peps_is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calculator_settings' and policyname = 'Calculator settings are public') then
    create policy "Calculator settings are public" on public.calculator_settings for select to anon, authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'calculator_settings' and policyname = 'Admins manage calculator settings') then
    create policy "Admins manage calculator settings" on public.calculator_settings for all to authenticated using (public.beyond_peps_is_admin()) with check (public.beyond_peps_is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'payment_attempts' and policyname = 'Admins manage payment attempts') then
    create policy "Admins manage payment attempts" on public.payment_attempts for all to authenticated using (public.beyond_peps_is_admin()) with check (public.beyond_peps_is_admin());
  end if;
end;
$$;

insert into public.site_settings (key, value)
values
  ('home', '{
    "announcement": "Educational resources and research supply essentials for careful lab workflows.",
    "heroEyebrow": "Research supply lab",
    "heroTitle": "Research supplies, reference tools, and measured routines.",
    "heroBody": "Beyond Peps brings research supplies, clear reference material, calculators, and practical tools into one premium dark-glass workspace.",
    "primaryCta": "Shop research supplies",
    "secondaryCta": "Explore references",
    "disclaimer": "Content is educational only and is not medical advice. Products are intended for lawful research use only. Consult a qualified professional before making health decisions."
  }'::jsonb)
on conflict (key) do update set value = excluded.value;

insert into public.products (slug, title, name, category, summary, price_cents, status, tags, featured, sort_order)
values
  ('sterile-vial-kit', 'Sterile Vial Workflow Kit', 'Sterile Vial Workflow Kit', 'Sterile Handling', 'A curated starter set for cleaner research preparation surfaces and organized supply handling.', 3800, 'coming_soon', array['sterile', 'workflow', 'starter'], true, 10),
  ('amber-cold-storage', 'Amber Cold Storage Box', 'Amber Cold Storage Box', 'Storage', 'Compact light-conscious storage for labeled vials, inserts, and tracking notes.', 2400, 'coming_soon', array['storage', 'labeling'], true, 20),
  ('micro-measure-set', 'Micro Measurement Set', 'Micro Measurement Set', 'Measurement', 'Useful measuring tools for users who value consistency, labeling, and documentation.', 1900, 'coming_soon', array['measurement', 'calculator'], true, 30)
on conflict (slug) do update
set title = excluded.title,
    name = excluded.name,
    category = excluded.category,
    summary = excluded.summary,
    price_cents = excluded.price_cents,
    status = excluded.status,
    tags = excluded.tags,
    featured = excluded.featured,
    sort_order = excluded.sort_order;

insert into public.references (slug, title, type, summary, status, sort_order)
values
  ('storage-temperature-basics', 'Storage Temperature Basics', 'Guide', 'A plain-language overview of light, temperature, labeling, and handling considerations.', 'published', 10),
  ('reconstitution-math-primer', 'Reconstitution Math Primer', 'Calculator companion', 'How concentration, volume, and per-unit values relate before using the calculator.', 'published', 20),
  ('supply-hygiene-checklist', 'Supply Hygiene Checklist', 'Checklist', 'A workflow-oriented checklist for keeping preparation areas organized and documented.', 'published', 30)
on conflict (slug) do update
set title = excluded.title,
    type = excluded.type,
    summary = excluded.summary,
    status = excluded.status,
    sort_order = excluded.sort_order;

insert into public.blog_posts (slug, title, summary, status, published_at)
values
  ('building-a-better-peptide-supply-station', 'Building a Better Research Supply Station', 'A practical look at labels, cold storage, staging trays, and the small habits that reduce mistakes.', 'draft', null),
  ('why-calculators-need-context', 'Why Calculators Need Context', 'The math is only useful when paired with clear units, documentation, and professional guidance.', 'draft', null)
on conflict (slug) do update
set title = excluded.title,
    summary = excluded.summary,
    status = excluded.status,
    published_at = excluded.published_at;

insert into public.calculator_settings (key, label, settings)
values
  ('reconstitution', 'Reconstitution concentration preview', '{"defaultPeptideMg": 5, "defaultWaterMl": 2, "defaultDoseMcg": 250}'::jsonb)
on conflict (key) do update
set label = excluded.label,
    settings = excluded.settings;
