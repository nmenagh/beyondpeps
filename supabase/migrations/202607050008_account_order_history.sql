do $$
begin
  if to_regclass('public.orders') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public'
    and tablename = 'orders'
    and policyname = 'Users can view own orders'
  ) then
    create policy "Users can view own orders"
      on public.orders for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if to_regclass('public.orders') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public'
    and tablename = 'orders'
    and policyname = 'Admins manage orders'
  ) then
    create policy "Admins manage orders"
      on public.orders for all
      to authenticated
      using (public.beyond_peps_is_admin())
      with check (public.beyond_peps_is_admin());
  end if;

  if to_regclass('public.order_items') is not null and to_regclass('public.orders') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public'
    and tablename = 'order_items'
    and policyname = 'Users can view own order items'
  ) then
    create policy "Users can view own order items"
      on public.order_items for select
      to authenticated
      using (
        exists (
          select 1
          from public.orders
          where orders.id = order_items.order_id
          and orders.user_id = auth.uid()
        )
      );
  end if;

  if to_regclass('public.order_items') is not null and not exists (
    select 1 from pg_policies
    where schemaname = 'public'
    and tablename = 'order_items'
    and policyname = 'Admins manage order items'
  ) then
    create policy "Admins manage order items"
      on public.order_items for all
      to authenticated
      using (public.beyond_peps_is_admin())
      with check (public.beyond_peps_is_admin());
  end if;
end;
$$;
