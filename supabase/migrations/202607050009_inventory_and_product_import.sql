alter table if exists public.products add column if not exists inventory_count integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_inventory_count_nonnegative'
    and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
      add constraint products_inventory_count_nonnegative
      check (inventory_count is null or inventory_count >= 0) not valid;
  end if;
end;
$$;

alter table if exists public.cart_reservations enable row level security;

create table if not exists public.cart_reservations (
  id uuid primary key default gen_random_uuid(),
  cart_id text not null,
  product_slug text not null references public.products(slug) on delete cascade,
  quantity integer not null check (quantity > 0),
  expires_at timestamptz not null default now() + interval '1 hour',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cart_id, product_slug)
);

create index if not exists cart_reservations_product_expires_idx
  on public.cart_reservations (product_slug, expires_at);

create index if not exists cart_reservations_cart_idx
  on public.cart_reservations (cart_id);

alter table public.cart_reservations enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'products' and policyname = 'Active products are public') then
    create policy "Active products are public" on public.products for select to anon, authenticated using (status in ('active', 'coming_soon'));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'products' and policyname = 'Admins manage products') then
    create policy "Admins manage products" on public.products for all to authenticated using (public.beyond_peps_is_admin()) with check (public.beyond_peps_is_admin());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'cart_reservations' and policyname = 'Admins view cart reservations') then
    create policy "Admins view cart reservations" on public.cart_reservations for select to authenticated using (public.beyond_peps_is_admin());
  end if;
end;
$$;

create or replace function public.beyond_peps_release_expired_reservations()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.cart_reservations where expires_at <= now();
$$;

create or replace function public.beyond_peps_reserve_cart(p_cart_id text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item jsonb;
  v_slug text;
  v_qty integer;
  v_stock integer;
  v_held integer;
  v_available integer;
  v_expires_at timestamptz := now() + interval '1 hour';
  v_unavailable jsonb := '[]'::jsonb;
  v_valid_items jsonb := '[]'::jsonb;
begin
  if coalesce(trim(p_cart_id), '') = '' then
    return jsonb_build_object('ok', false, 'message', 'Missing cart id.', 'unavailable', '[]'::jsonb);
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return jsonb_build_object('ok', false, 'message', 'Cart items must be an array.', 'unavailable', '[]'::jsonb);
  end if;

  perform public.beyond_peps_release_expired_reservations();

  for v_item in select * from jsonb_array_elements(p_items)
  loop
    v_slug := nullif(trim(v_item->>'id'), '');
    v_qty := greatest(0, coalesce((v_item->>'quantity')::integer, 0));
    if v_slug is null or v_qty <= 0 then
      continue;
    end if;

    select inventory_count
      into v_stock
      from public.products
      where slug = v_slug
      and status in ('active', 'coming_soon')
      for update;

    if not found then
      v_unavailable := v_unavailable || jsonb_build_array(jsonb_build_object('id', v_slug, 'requested', v_qty, 'available', 0));
      continue;
    end if;

    if v_stock is null then
      v_valid_items := v_valid_items || jsonb_build_array(jsonb_build_object('id', v_slug, 'quantity', v_qty, 'available', null));
      continue;
    end if;

    select coalesce(sum(quantity), 0)
      into v_held
      from public.cart_reservations
      where product_slug = v_slug
      and cart_id <> p_cart_id
      and expires_at > now();

    v_available := greatest(0, v_stock - v_held);

    if v_qty > v_available then
      v_unavailable := v_unavailable || jsonb_build_array(jsonb_build_object('id', v_slug, 'requested', v_qty, 'available', v_available));
    else
      v_valid_items := v_valid_items || jsonb_build_array(jsonb_build_object('id', v_slug, 'quantity', v_qty, 'available', v_available));
    end if;
  end loop;

  if jsonb_array_length(v_unavailable) > 0 then
    return jsonb_build_object('ok', false, 'unavailable', v_unavailable);
  end if;

  delete from public.cart_reservations where cart_id = p_cart_id;

  for v_item in select * from jsonb_array_elements(v_valid_items)
  loop
    insert into public.cart_reservations (cart_id, product_slug, quantity, expires_at)
    values (p_cart_id, v_item->>'id', (v_item->>'quantity')::integer, v_expires_at)
    on conflict (cart_id, product_slug) do update
      set quantity = excluded.quantity,
          expires_at = excluded.expires_at,
          updated_at = now();
  end loop;

  return jsonb_build_object('ok', true, 'expiresAt', v_expires_at, 'items', v_valid_items, 'unavailable', '[]'::jsonb);
end;
$$;

create or replace function public.beyond_peps_validate_checkout(p_cart_id text, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.beyond_peps_reserve_cart(p_cart_id, p_items);
end;
$$;

grant execute on function public.beyond_peps_release_expired_reservations() to anon, authenticated;
grant execute on function public.beyond_peps_reserve_cart(text, jsonb) to anon, authenticated;
grant execute on function public.beyond_peps_validate_checkout(text, jsonb) to anon, authenticated;

insert into public.products (slug, title, name, category, summary, description, price_cents, status, tags, featured, inventory_count, image_url, sort_order)
values
  ('Pen-Cartridges-10-Pack', 'Pen Cartridges 10-Pack', 'Pen Cartridges 10-Pack', 'Pens', '3mL Cartridges for V2 Injection Pens', '3mL Cartridges for V2 Injection Pens

Engineered for precision and compatibility, our 3mL cartridges for V2 injection pens provide a reliable solution for controlled liquid handling in research and laboratory environments. Designed to integrate seamlessly with V2 pen systems, these cartridges ensure consistent performance and ease of use across applications.

Each cartridge is constructed from high-quality, medical-grade materials to support durability, clarity, and secure containment. The 3mL capacity offers an optimal balance between volume and control, making it ideal for repeatable, measured dispensing.

Key Features
3mL capacity for extended usability and fewer replacements
Compatible with V2 injection pens for seamless integration
Precision-molded construction for consistent fit and function
Clear barrel design for easy visual monitoring
Secure sealing system to help minimize leakage and contamination', 1500, 'active', array['pens'], true, 15, 'assets/products/Gray-BG-10-3ml.png', 10),
  ('Deluxe-Pen-Set', 'Deluxe Pen Set', 'Deluxe Pen Set', 'Pens', 'The Deluxe Pen Set Includes:', 'The Deluxe Pen Set Includes:

5- Disposable Pen Tips
5- Alcohol Pad Wipe Sets
2- Reconstitution Syringes
1- 3mL cartridge
1- V2 Pen




This preparation is intended exclusively for laboratory research use in controlled scientific environments. It has not been evaluated or approved by the Food and Drug Administration and is not intended for human or veterinary use, nor for incorporation into any food, supplement, cosmetic, or medicinal product. Trivial Bioworks makes no therapeutic claims regarding this material. By purchasing this product, the buyer confirms their qualifications as a research professional or accredited institution and accepts responsibility for proper handling, storage, and regulatory compliance. All transactions are considered final upon completion.', 3000, 'active', array['pens'], true, 77, 'assets/products/1-2.avif', 20),
  ('Pen-Tip-30-Pack', 'Pen Tip - 30 Pack', 'Pen Tip - 30 Pack', 'Pens', '30 Pack of V2 Pen Tips', '30 Pack of V2 Pen Tips

This preparation is intended exclusively for laboratory research use in controlled scientific environments. It has not been evaluated or approved by the Food and Drug Administration and is not intended for human or veterinary use, nor for incorporation into any food, supplement, cosmetic, or medicinal product. Trivial Bioworks makes no therapeutic claims regarding this material. By purchasing this product, the buyer confirms their qualifications as a research professional or accredited institution and accepts responsibility for proper handling, storage, and regulatory compliance. All transactions are considered final upon completion.', 1000, 'active', array['pens'], true, 19, 'assets/products/2-2.avif', 30),
  ('Pen-Starter-Set', 'Pen Starter Set', 'Pen Starter Set', 'Pens', 'The Pen Starter Set Includes:', 'The Pen Starter Set Includes:

5- Disposable Pen Tips
5- Alcohol Pad Wipe Sets
2- Reconstitution Syringes
1- 3mL cartridge

This preparation is intended exclusively for laboratory research use in controlled scientific environments. It has not been evaluated or approved by the Food and Drug Administration and is not intended for human or veterinary use, nor for incorporation into any food, supplement, cosmetic, or medicinal product. Trivial Bioworks makes no therapeutic claims regarding this material. By purchasing this product, the buyer confirms their qualifications as a research professional or accredited institution and accepts responsibility for proper handling, storage, and regulatory compliance. All transactions are considered final upon completion.', 1000, 'active', array['pens'], false, 16, 'assets/products/3-1.avif', 40),
  ('Pen-3ml-Glass-Cartridge', 'Pen 3ml Glass Cartridge', 'Pen 3ml Glass Cartridge', 'Pens', '3mL Cartridges for V2 Injection Pens', '3mL Cartridges for V2 Injection Pens

Engineered for precision and compatibility, our 3mL cartridges for V2 injection pens provide a reliable solution for controlled liquid handling in research and laboratory environments. Designed to integrate seamlessly with V2 pen systems, these cartridges ensure consistent performance and ease of use across applications.

Each cartridge is constructed from high-quality, medical-grade materials to support durability, clarity, and secure containment. The 3mL capacity offers an optimal balance between volume and control, making it ideal for repeatable, measured dispensing.

Key Features
3mL capacity for extended usability and fewer replacements
Compatible with V2 injection pens for seamless integration
Precision-molded construction for consistent fit and function
Clear barrel design for easy visual monitoring
Secure sealing system to help minimize leakage and contamination', 175, 'active', array['pens'], false, 84, 'assets/products/4.avif', 50),
  ('Easy-Touch-Syringe-Bag-of-10', 'Easy Touch Syringe Bag of 10', 'Easy Touch Syringe Bag of 10', 'Syringes', 'Bag of 10 – Easy Touch 31ga x 5/16″(8mm) x .5ml Syringes', 'Bag of 10 – Easy Touch 31ga x 5/16″(8mm) x .5ml Syringes




This preparation is intended exclusively for laboratory research use in controlled scientific environments. It has not been evaluated or approved by the Food and Drug Administration and is not intended for human or veterinary use, nor for incorporation into any food, supplement, cosmetic, or medicinal product. Trivial Bioworks makes no therapeutic claims regarding this material. By purchasing this product, the buyer confirms their qualifications as a research professional or accredited institution and accepts responsibility for proper handling, storage, and regulatory compliance. All transactions are considered final upon completion.', 750, 'active', array['syringes'], false, 21, 'assets/products/Deluxe-Pen-Set.png', 60),
  ('Reconstituting-Syringes-10-Pack', 'Reconstituting Syringes10-Pack', 'Reconstituting Syringes10-Pack', 'Syringes', '10-Pack of 3ml reconstituting Syringes', '10-Pack of 3ml reconstituting Syringes




This preparation is intended exclusively for laboratory research use in controlled scientific environments. It has not been evaluated or approved by the Food and Drug Administration and is not intended for human or veterinary use, nor for incorporation into any food, supplement, cosmetic, or medicinal product. Trivial Bioworks makes no therapeutic claims regarding this material. By purchasing this product, the buyer confirms their qualifications as a research professional or accredited institution and accepts responsibility for proper handling, storage, and regulatory compliance. All transactions are considered final upon completion.', 1000, 'active', array['syringes'], false, 31, 'assets/products/ChatGPT-Image-May-20-2026-10_48_56-PM.png', 70),
  ('Syringe-Starter-Kit', 'Syringe Starter Kit', 'Syringe Starter Kit', 'Syringes', 'The Syringe Starter Set Includes:', 'The Syringe Starter Set Includes:

4- Easy Touch Syringes
5- Alcohol Pad Wipe Sets
2- Reconstitution Syringes




This preparation is intended exclusively for laboratory research use in controlled scientific environments. It has not been evaluated or approved by the Food and Drug Administration and is not intended for human or veterinary use, nor for incorporation into any food, supplement, cosmetic, or medicinal product. Trivial Bioworks makes no therapeutic claims regarding this material. By purchasing this product, the buyer confirms their qualifications as a research professional or accredited institution and accepts responsibility for proper handling, storage, and regulatory compliance. All transactions are considered final upon completion.', 1000, 'active', array['syringes'], false, 22, 'assets/products/Pen-Starter-Set.png', 80),
  ('V2-Pen', 'V-2 Pen', 'V-2 Pen', 'Pens', 'The V2 injection pen is a reusable, metal,, 3mL, pen-style injector designed for precise, daily administration of 1-60 units of research peptides or compound...', 'The V2 injection pen is a reusable, metal,, 3mL, pen-style injector designed for precise, daily administration of 1-60 units of research peptides or compounds. It features an adjustable dosage dial, a durable metal body, and compatibility with standard ISO 11608-3 cartridges. It is commonly used as a cost-effective alternative to disposable syringes, boasting over 200 uses.

This preparation is intended exclusively for laboratory research use in controlled scientific environments. It has not been evaluated or approved by the Food and Drug Administration and is not intended for human or veterinary use, nor for incorporation into any food, supplement, cosmetic, or medicinal product. Trivial Bioworks makes no therapeutic claims regarding this material. By purchasing this product, the buyer confirms their qualifications as a research professional or accredited institution and accepts responsibility for proper handling, storage, and regulatory compliance. All transactions are considered final upon completion.', 2500, 'active', array['pens'], false, 81, 'assets/products/3-1.avif', 90),
  ('Empty-Peptide-Storage-for-10-vials', 'Empty Peptide Storage for 10 vials', 'Empty Peptide Storage for 10 vials', 'Storage', 'These are empty peptide storage containers for your research storage.', 'These are empty peptide storage containers for your research storage.', 100, 'active', array['storage'], false, 50, 'assets/products/1-2.avif', 100),
  ('BP-H-Bacteriostatic-Water', 'BP-H Bacteriostatic Water', 'BP-H Bacteriostatic Water', 'Syringes', 'BP-H Bacteriostatic Water for Injection, USP – 30 mL', 'BP-H Bacteriostatic Water for Injection, USP – 30 mL

Sterile, non-pyrogenic bacteriostatic water supplied in a 30 mL multiple-dose vial with 0.9% benzyl alcohol as a preservative. Ideal for reconstituting lyophilized research compounds in laboratory settings. Compatible with luer-lock and standard stoppers. Store at controlled room temperature; do not freeze.

This preparation is intended exclusively for laboratory research use in controlled scientific environments. It has not been evaluated or approved by the Food and Drug Administration and is not intended for human or veterinary use, nor for incorporation into any food, supplement, cosmetic, or medicinal product. Trivial Bioworks makes no therapeutic claims regarding this material. By purchasing this product, the buyer confirms their qualifications as a research professional or accredited institution and accepts responsibility for proper handling, storage, and regulatory compliance. All transactions are considered final upon completion.', 2500, 'active', array['syringes'], false, 19, 'assets/products/3-1.avif', 110),
  ('Hume-Health-Pod-Scale', 'Hume Health Pod Scale', 'Hume Health Pod Scale', 'Measurement', 'The Hume Health Body Pod is an advanced, at-home body composition analyzer that uses multi-frequency Bioelectrical Impedance Analysis (BIA) and a retractable...', 'The Hume Health Body Pod is an advanced, at-home body composition analyzer that uses multi-frequency Bioelectrical Impedance Analysis (BIA) and a retractable handle. It tracks over 45 health metrics—including body fat percentage, muscle mass, visceral fat, and hydration—giving you a comprehensive picture of your fitness progress.
How It Works
8-Point Sensor System: Unlike traditional smart scales that only measure through the feet, the Body Pod features four foot sensors and a retractable four-electrode handle. [1, 2]
Segmental Analysis: By passing harmless electrical currents through both your upper and lower body, it measures the composition of your arms, legs, and torso separately to pinpoint muscle imbalances and exact areas of fat loss. [1, 2, 3]
Quick Scans: A full body scan takes roughly 60 seconds.
Hume Health Pod Scale.  Comprehensive, Accurate Full Body Analysis

Get a full picture of your health like never before. With the Hume Pod, you can now easily understand, how your body reacts to food, sleep, stress and other factors so you can start making informed health choices.  The science sounds simple, but actually doing this is difficult without an accurate view of your body''s composition. Hume Pod can be your guide, so you never have to guess ever again.

The ultimate home health hub

Understanding your health and fitness at this level has been impossible—until now. The Hume Pod uses 8 frequency sensors to deliver precise weight, full body composition and heart health to advance your weight and health management journey. The advanced sensors embedded in the handle are able to scan your torso, arms, and legs and even heart at an accuracy of 98%!

Why it matters?

Our Hume Pod delivers full-body insights, measuring muscle mass, body fat, and water composition with superior accuracy. Unlike standard smart scales that only measure half the body and uses estimations, the Hume Pod provides reliable data that empowers you to track your progress and achieve your fitness goals with confidence.

Take the guesswork out of your health. The Hume Pod is elegantly designed and easy to use. No matter where you are in your health journey, this health station will fit seamlessly into your life.

Key Health Metrics Tracked
Weight & Composition: Total body weight, skeletal muscle mass, and body fat percentage.
Fat Breakdown: Visceral fat (harmful fat around organs) and subcutaneous fat.
Hydration: Total body water percentage to monitor cellular health and recovery.
Metabolism: Basal Metabolic Rate (BMR) and estimated metabolic age.
Bone Density: Estimated bone mass.

App & Connectivity
AI-Powered Insights: The system pairs with the Hume Health App via Bluetooth to transform raw data into visual dashboards, weekly health reports, and personalized coaching.
Platform Sync: It seamlessly connects with third-party apps like Apple Health, Google Fit, Fitbit, and Garmin.
Multi-User: The device automatically recognizes different users in your household and supports up to 24–30 distinct profiles.

Device Specs & Design
Build: Sleek, modern tempered glass platform capable of supporting up to 400 lbs.
Battery: Powered by a rechargeable lithium-ion battery that lasts up to a year on a single charge.', 20900, 'active', array['measurement'], false, 3, 'assets/products/ChatGPT-Image-May-20-2026-10_55_21-PM.png', 120)
on conflict (slug) do update
set title = excluded.title,
    name = excluded.name,
    category = excluded.category,
    summary = excluded.summary,
    description = excluded.description,
    price_cents = excluded.price_cents,
    status = excluded.status,
    tags = excluded.tags,
    featured = excluded.featured,
    inventory_count = excluded.inventory_count,
    image_url = excluded.image_url,
    sort_order = excluded.sort_order,
    updated_at = now();

delete from public.products
where slug in ('sterile-vial-kit', 'amber-cold-storage', 'micro-measure-set');
