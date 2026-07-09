create table if not exists public.email_templates (
  id text primary key,
  name text not null,
  category text not null default 'transactional' check (category in ('transactional', 'marketing')),
  subject text not null default '',
  preview_text text not null default '',
  header_image_url text,
  body_html text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  full_name text not null default '',
  source text not null default 'mailing_list_signup',
  marketing_status text not null default 'subscribed' check (marketing_status in ('subscribed', 'unsubscribed')),
  subscribed_at timestamptz,
  unsubscribed_at timestamptz,
  unsubscribe_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists crm_contacts_email_lower_key on public.crm_contacts (lower(email));
create unique index if not exists crm_contacts_unsubscribe_token_key on public.crm_contacts (unsubscribe_token);

create table if not exists public.crm_sequences (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  trigger_source text not null default 'all',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.crm_sequence_steps (
  id uuid primary key default gen_random_uuid(),
  sequence_id uuid not null references public.crm_sequences(id) on delete cascade,
  template_id text not null references public.email_templates(id) on delete restrict,
  delay_days integer not null default 0 check (delay_days >= 0),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.crm_enrollments (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  sequence_id uuid not null references public.crm_sequences(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (contact_id, sequence_id)
);

create table if not exists public.crm_sends (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.crm_contacts(id) on delete cascade,
  enrollment_id uuid references public.crm_enrollments(id) on delete cascade,
  sequence_step_id uuid references public.crm_sequence_steps(id) on delete set null,
  template_id text references public.email_templates(id) on delete set null,
  resend_id text,
  status text not null default 'sent',
  error_message text,
  sent_at timestamptz not null default now(),
  unique (enrollment_id, sequence_step_id)
);

alter table public.email_templates enable row level security;
alter table public.crm_contacts enable row level security;
alter table public.crm_sequences enable row level security;
alter table public.crm_sequence_steps enable row level security;
alter table public.crm_enrollments enable row level security;
alter table public.crm_sends enable row level security;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'email_templates',
    'crm_contacts',
    'crm_sequences',
    'crm_sequence_steps',
    'crm_enrollments',
    'crm_sends'
  ]
  loop
    execute format('drop policy if exists "Admins manage %s" on public.%I', table_name, table_name);
    execute format(
      'create policy "Admins manage %s" on public.%I for all to authenticated using (public.beyond_peps_is_admin()) with check (public.beyond_peps_is_admin())',
      table_name,
      table_name
    );
  end loop;
end
$$;

create or replace function public.subscribe_marketing_contact(
  p_email text,
  p_full_name text default '',
  p_source text default 'mailing_list_signup',
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact public.crm_contacts;
  v_sequence record;
begin
  if coalesce(trim(p_email), '') = '' or position('@' in p_email) < 2 then
    raise exception 'A valid email address is required.';
  end if;

  insert into public.crm_contacts (
    user_id,
    email,
    full_name,
    source,
    marketing_status,
    subscribed_at,
    unsubscribed_at
  )
  values (
    case when auth.uid() = p_user_id then p_user_id else null end,
    lower(trim(p_email)),
    coalesce(trim(p_full_name), ''),
    coalesce(nullif(trim(p_source), ''), 'mailing_list_signup'),
    'subscribed',
    now(),
    null
  )
  on conflict (lower(email)) do update
  set user_id = coalesce(excluded.user_id, public.crm_contacts.user_id),
      full_name = coalesce(nullif(excluded.full_name, ''), public.crm_contacts.full_name),
      source = excluded.source,
      marketing_status = 'subscribed',
      subscribed_at = now(),
      unsubscribed_at = null,
      updated_at = now()
  returning * into v_contact;

  for v_sequence in
    select id
    from public.crm_sequences
    where active = true
      and trigger_source in ('all', coalesce(nullif(trim(p_source), ''), 'mailing_list_signup'))
  loop
    insert into public.crm_enrollments (contact_id, sequence_id, status, started_at)
    values (v_contact.id, v_sequence.id, 'active', now())
    on conflict (contact_id, sequence_id) do update
    set status = 'active',
        started_at = case
          when public.crm_enrollments.status = 'cancelled' then now()
          else public.crm_enrollments.started_at
        end,
        completed_at = null;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'contactId', v_contact.id,
    'status', v_contact.marketing_status
  );
end
$$;

create or replace function public.unsubscribe_marketing_contact(p_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_contact_id uuid;
begin
  update public.crm_contacts
  set marketing_status = 'unsubscribed',
      unsubscribed_at = now(),
      updated_at = now()
  where unsubscribe_token = p_token
  returning id into v_contact_id;

  if v_contact_id is null then
    return jsonb_build_object('ok', false, 'message', 'Unsubscribe link is invalid.');
  end if;

  update public.crm_enrollments
  set status = 'cancelled'
  where contact_id = v_contact_id and status = 'active';

  return jsonb_build_object('ok', true);
end
$$;

grant execute on function public.subscribe_marketing_contact(text, text, text, uuid) to anon, authenticated;
grant execute on function public.unsubscribe_marketing_contact(uuid) to anon, authenticated;

insert into public.email_templates (id, name, category, subject, preview_text, header_image_url, body_html)
values
  (
    'order_confirmation',
    'Order confirmation',
    'transactional',
    'Beyond Peps order {{order_number}} received',
    'We received your Beyond Peps order.',
    '/assets/bp-logo-mark.png',
    '<h1>Order received</h1><p>Hi {{customer_name}},</p><p>Thanks for your Beyond Peps order. Your order number is <strong>{{order_number}}</strong>.</p>{{order_items}}<p><strong>Subtotal:</strong> {{subtotal}}</p><p><strong>Shipping:</strong> {{shipping}}</p><p><strong>Total:</strong> {{total}}</p>{{payment_details}}<p>We will update your order after payment is matched and again when it ships.</p>'
  ),
  (
    'order_shipped',
    'Order shipped',
    'transactional',
    'Your Beyond Peps order has shipped',
    'Your order is on the way.',
    '/assets/bp-logo-mark.png',
    '<h1>Your order has shipped</h1><p>Hi {{customer_name}},</p><p>Order <strong>{{order_number}}</strong> is on the way.</p><p><strong>Carrier:</strong> {{shipping_provider}}</p><p><strong>Service:</strong> {{shipping_service}}</p><p><strong>Tracking:</strong> {{tracking_number}}</p><p><a href="{{tracking_url}}">Track your package</a></p>'
  ),
  (
    'order_status_update',
    'Order status update',
    'transactional',
    'Beyond Peps order {{order_number}} update',
    'The status of your order has changed.',
    '/assets/bp-logo-mark.png',
    '<h1>Order update</h1><p>Hi {{customer_name}},</p><p>The status of order <strong>{{order_number}}</strong> is now <strong>{{order_status}}</strong>.</p><p>You can sign in to your Beyond Peps account to view the full order details.</p>'
  ),
  (
    'crm_welcome_1',
    'CRM welcome email 1',
    'marketing',
    'Welcome to Beyond Peps',
    'Research carefully. Build deliberately.',
    '/assets/bp-logo-mark.png',
    '<h1>Welcome to Beyond Peps</h1><p>Hi {{customer_name}},</p><p>Thanks for joining us. We built Beyond Peps to make research supplies, educational references, and practical tools easier to navigate.</p><p><a href="{{site_url}}/references.html">Explore the reference library</a></p>'
  ),
  (
    'crm_welcome_2',
    'CRM welcome email 2',
    'marketing',
    'A better way to plan your research',
    'Explore the calculators and educational resources.',
    '/assets/bp-logo-mark.png',
    '<h1>Keep the research organized</h1><p>Hi {{customer_name}},</p><p>Good decisions start with reliable information and consistent tracking. Our calculators and reference library are designed to help you plan more clearly.</p><p><a href="{{site_url}}/calculators.html">Open the calculators</a></p>'
  )
on conflict (id) do nothing;

do $$
declare
  v_sequence_id uuid;
begin
  select id into v_sequence_id
  from public.crm_sequences
  where name = 'New subscriber welcome'
  limit 1;

  if v_sequence_id is null then
    insert into public.crm_sequences (name, description, trigger_source, active)
    values (
      'New subscriber welcome',
      'Two-part welcome series for account registrations and mailing-list signups.',
      'all',
      true
    )
    returning id into v_sequence_id;
  end if;

  insert into public.crm_sequence_steps (sequence_id, template_id, delay_days, sort_order)
  values
    (v_sequence_id, 'crm_welcome_1', 1, 10),
    (v_sequence_id, 'crm_welcome_2', 8, 20)
  on conflict do nothing;
end
$$;
