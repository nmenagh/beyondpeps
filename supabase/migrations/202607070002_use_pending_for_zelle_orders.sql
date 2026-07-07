create or replace function public.beyond_peps_create_zelle_order(
  p_cart_id text,
  p_customer jsonb,
  p_shipping_address jsonb,
  p_shipping_rate jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_slug text;
  v_qty integer;
  v_product record;
  v_held integer;
  v_available integer;
  v_subtotal_cents integer := 0;
  v_shipping_amount numeric := case
    when coalesce(p_shipping_rate->>'amount', '') ~ '^[0-9]+(\.[0-9]+)?$' then (p_shipping_rate->>'amount')::numeric
    else 0
  end;
  v_shipping_cents integer := greatest(0, round(v_shipping_amount * 100));
  v_total_cents integer := 0;
  v_order_id uuid;
  v_payment_reference text := 'BP-ZELLE-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
  v_unavailable jsonb := '[]'::jsonb;
begin
  if coalesce(trim(p_cart_id), '') = '' then
    return jsonb_build_object('ok', false, 'message', 'Missing cart id.', 'unavailable', '[]'::jsonb);
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    return jsonb_build_object('ok', false, 'message', 'Your cart is empty.', 'unavailable', '[]'::jsonb);
  end if;

  if coalesce(trim(p_customer->>'email'), '') = '' then
    return jsonb_build_object('ok', false, 'message', 'Customer email is required.', 'unavailable', '[]'::jsonb);
  end if;

  perform public.beyond_peps_release_expired_reservations();

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_slug := nullif(trim(v_item->>'id'), '');
    v_qty := greatest(0, coalesce((v_item->>'quantity')::integer, 0));
    if v_slug is null or v_qty <= 0 then
      continue;
    end if;

    select id, slug, name, title, category, price_cents, inventory_count
      into v_product
      from public.products
      where slug = v_slug
      and status = 'active'
      for update;

    if not found then
      v_unavailable := v_unavailable || jsonb_build_array(jsonb_build_object('id', v_slug, 'requested', v_qty, 'available', 0));
      continue;
    end if;

    if v_product.inventory_count is not null then
      select coalesce(sum(quantity), 0)
        into v_held
        from public.cart_reservations
        where product_slug = v_slug
        and cart_id <> p_cart_id
        and expires_at > now();

      v_available := greatest(0, v_product.inventory_count - v_held);
      if v_qty > v_available then
        v_unavailable := v_unavailable || jsonb_build_array(jsonb_build_object('id', v_slug, 'requested', v_qty, 'available', v_available));
      end if;
    end if;

    v_subtotal_cents := v_subtotal_cents + (v_product.price_cents * v_qty);
  end loop;

  if jsonb_array_length(v_unavailable) > 0 then
    return jsonb_build_object('ok', false, 'message', 'Some items are no longer available.', 'unavailable', v_unavailable);
  end if;

  v_total_cents := v_subtotal_cents + v_shipping_cents;

  insert into public.orders (
    user_id,
    email,
    customer_email,
    status,
    subtotal_cents,
    shipping_cents,
    total_cents,
    currency,
    payment_provider,
    payment_method,
    payment_reference,
    shipping_address,
    billing_address,
    shipping_method,
    shippo_rate_id,
    selected_carrier,
    metadata
  )
  values (
    auth.uid(),
    p_customer->>'email',
    p_customer->>'email',
    'pending',
    v_subtotal_cents,
    v_shipping_cents,
    v_total_cents,
    'USD',
    'zelle',
    'zelle',
    v_payment_reference,
    coalesce(p_shipping_address, '{}'::jsonb),
    coalesce(p_shipping_address, '{}'::jsonb),
    coalesce(p_shipping_rate, '{}'::jsonb),
    nullif(p_shipping_rate->>'id', ''),
    nullif(concat_ws(' - ', nullif(p_shipping_rate->>'provider', ''), nullif(p_shipping_rate->>'servicelevel', '')), ''),
    jsonb_build_object('customer', coalesce(p_customer, '{}'::jsonb), 'paymentMethod', 'zelle', 'paymentStatus', 'awaiting_zelle_payment')
  )
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_slug := nullif(trim(v_item->>'id'), '');
    v_qty := greatest(0, coalesce((v_item->>'quantity')::integer, 0));
    if v_slug is null or v_qty <= 0 then
      continue;
    end if;

    select id, slug, name, title, category, price_cents, inventory_count
      into v_product
      from public.products
      where slug = v_slug
      and status = 'active'
      for update;

    insert into public.order_items (
      order_id,
      product_id,
      product_slug,
      product_name,
      product_title,
      product_type,
      quantity,
      unit_price_cents,
      price_cents_at_purchase,
      total_cents
    )
    values (
      v_order_id,
      v_product.id,
      v_product.slug,
      coalesce(nullif(v_product.name, ''), v_product.title),
      coalesce(nullif(v_product.title, ''), nullif(v_product.name, ''), v_product.slug),
      coalesce(nullif(v_product.category, ''), 'Research Supplies'),
      v_qty,
      v_product.price_cents,
      v_product.price_cents,
      v_product.price_cents * v_qty
    );

    if v_product.inventory_count is not null then
      update public.products
      set inventory_count = greatest(0, inventory_count - v_qty)
      where id = v_product.id;
    end if;
  end loop;

  insert into public.payment_attempts (order_id, provider, provider_reference, status, amount_cents, currency, raw_response)
  values (
    v_order_id,
    'zelle',
    v_payment_reference,
    'awaiting_payment',
    v_total_cents,
    'USD',
    jsonb_build_object('instructionsSent', false)
  );

  delete from public.cart_reservations where cart_id = p_cart_id;

  return jsonb_build_object(
    'ok', true,
    'orderId', v_order_id,
    'orderNumber', substr(v_order_id::text, 1, 8),
    'paymentReference', v_payment_reference,
    'subtotalCents', v_subtotal_cents,
    'shippingCents', v_shipping_cents,
    'totalCents', v_total_cents,
    'currency', 'USD',
    'status', 'pending',
    'paymentStatus', 'awaiting_zelle_payment'
  );
end;
$$;

grant execute on function public.beyond_peps_create_zelle_order(text, jsonb, jsonb, jsonb, jsonb) to anon, authenticated;
