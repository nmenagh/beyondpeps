alter table if exists public.products
  add column if not exists must_ship_separately boolean not null default false,
  add column if not exists package_length_in numeric,
  add column if not exists package_width_in numeric,
  add column if not exists package_height_in numeric,
  add column if not exists package_weight_oz numeric;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'products_package_dimensions_positive'
  ) then
    alter table public.products
      add constraint products_package_dimensions_positive
      check (
        (package_length_in is null or package_length_in > 0)
        and (package_width_in is null or package_width_in > 0)
        and (package_height_in is null or package_height_in > 0)
        and (package_weight_oz is null or package_weight_oz > 0)
      ) not valid;
  end if;
end $$;
