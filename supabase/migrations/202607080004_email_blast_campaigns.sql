alter table public.email_templates
  drop constraint if exists email_templates_category_check;

alter table public.email_templates
  add constraint email_templates_category_check
  check (category in ('transactional', 'marketing', 'blast'));

create table if not exists public.crm_campaigns (
  id uuid primary key default gen_random_uuid(),
  template_id text references public.email_templates(id) on delete set null,
  name text not null,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'sending', 'sent', 'cancelled', 'failed')),
  sent_at timestamptz,
  recipient_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.crm_sends
  add column if not exists campaign_id uuid references public.crm_campaigns(id) on delete cascade;

create unique index if not exists crm_sends_campaign_contact_key
  on public.crm_sends (campaign_id, contact_id);

alter table public.crm_campaigns enable row level security;

drop policy if exists "Admins manage crm_campaigns" on public.crm_campaigns;
create policy "Admins manage crm_campaigns"
  on public.crm_campaigns
  for all
  to authenticated
  using (public.beyond_peps_is_admin())
  with check (public.beyond_peps_is_admin());
