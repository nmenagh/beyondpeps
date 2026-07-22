create table if not exists public.order_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  package_number integer not null default 1,
  shippo_transaction_id text,
  carrier text,
  service_level text,
  tracking_number text not null,
  tracking_url text,
  status text not null default 'UNKNOWN',
  status_details text,
  substatus_code text,
  substatus_text text,
  action_required boolean not null default false,
  eta timestamptz,
  original_eta timestamptz,
  status_date timestamptz,
  delivered_at timestamptz,
  location jsonb not null default '{}'::jsonb,
  tracking_history jsonb not null default '[]'::jsonb,
  last_shippo_update_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_shipments_carrier_tracking_unique unique (carrier, tracking_number)
);

create unique index if not exists order_shipments_shippo_transaction_unique
  on public.order_shipments (shippo_transaction_id)
  where shippo_transaction_id is not null;

create index if not exists order_shipments_order_id_idx
  on public.order_shipments (order_id);

alter table public.order_shipments enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'order_shipments'
      and policyname = 'Users can view own shipments'
  ) then
    create policy "Users can view own shipments" on public.order_shipments for select
      to authenticated using (
        exists (
          select 1 from public.orders
          where orders.id = order_shipments.order_id
            and orders.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'order_shipments'
      and policyname = 'Admins manage shipments'
  ) then
    create policy "Admins manage shipments" on public.order_shipments for all
      to authenticated using (public.beyond_peps_is_admin())
      with check (public.beyond_peps_is_admin());
  end if;
end;
$$;

-- Backfill labels that were purchased before live tracking was enabled.
insert into public.order_shipments (
  order_id,
  package_number,
  shippo_transaction_id,
  carrier,
  service_level,
  tracking_number,
  tracking_url,
  status,
  created_at,
  updated_at
)
select
  orders.id,
  1,
  nullif(split_part(coalesce(orders.shippo_transaction_id, ''), ',', 1), ''),
  coalesce(orders.tracking_carrier, orders.shipping_provider),
  orders.shipping_service,
  orders.tracking_number,
  orders.tracking_url,
  'UNKNOWN',
  coalesce(orders.shipped_at, orders.created_at),
  now()
from public.orders
where nullif(trim(coalesce(orders.tracking_number, '')), '') is not null
  and position(',' in orders.tracking_number) = 0
on conflict (carrier, tracking_number) do nothing;
