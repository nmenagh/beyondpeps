alter table if exists public.products
  add column if not exists product_weight_oz numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_product_weight_positive'
  ) then
    alter table public.products
      add constraint products_product_weight_positive
      check (product_weight_oz is null or product_weight_oz > 0) not valid;
  end if;
end $$;
