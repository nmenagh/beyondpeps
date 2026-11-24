-- Brand kit cleanup: customer-facing copy that still addressed the site owner,
-- human-use wording in the V-2 Pen listing, the supplier's name left in product
-- disclaimers, and a product-name typo. Only the listed strings change; every
-- other live value (including copy edited in the admin panel) is left alone.

update public.site_settings
set value = value
  || jsonb_build_object(
    'homeReferencesBody', 'Short guides on units, storage, labels, and workflow basics, written to sit beside the calculators and products.',
    'homeCalculatorsBody', 'A peptide unit planner and a GLP half-life estimator for educational research planning. Not medical advice.',
    'homeBlogBody', 'Educational articles and updates from the Beyond Peps team.'
  )
where key = 'home'
  and (
    value->>'homeReferencesBody' ilike '%admin panel%'
    or value->>'homeCalculatorsBody' ilike 'The calculator page now includes%'
    or value->>'homeBlogBody' ilike '%admin panel%'
  );

update public.site_settings
set value = jsonb_set(
  value,
  '{pages,cart,body}',
  to_jsonb('Review your selections, then choose shipping and payment at checkout. Items stay saved in this browser.'::text)
)
where key = 'home'
  and value #>> '{pages,cart,body}' ilike 'Payment options are coming next%';

update public.products
set
  summary = 'Reusable 3 mL metal pen-style injector with an adjustable 1 to 60 unit dial and ISO 11608-3 cartridge compatibility.',
  description = replace(
    description,
    'The V2 injection pen is a reusable, metal,, 3mL, pen-style injector designed for precise, daily administration of 1-60 units of research peptides or compounds. It features an adjustable dosage dial, a durable metal body, and compatibility with standard ISO 11608-3 cartridges. It is commonly used as a cost-effective alternative to disposable syringes, boasting over 200 uses.',
    'The V-2 Pen is a reusable 3 mL pen-style injector with a durable metal body and an adjustable dial that measures 1 to 60 units. It accepts standard ISO 11608-3 cartridges and is rated for more than 200 uses, which makes it a cost-effective alternative to disposable syringes in research workflows.'
  )
where slug = 'V2-Pen';

update public.products
set description = replace(description, 'Trivial Bioworks makes no therapeutic claims', 'Beyond Peps makes no therapeutic claims')
where description like '%Trivial Bioworks makes no therapeutic claims%';

update public.products
set
  name = replace(name, 'Syringes10-Pack', 'Syringes 10-Pack'),
  title = replace(title, 'Syringes10-Pack', 'Syringes 10-Pack')
where slug = 'Reconstituting-Syringes-10-Pack';

-- Replace the hand-held snapshot gallery for the single glass cartridge with a
-- grey-studio image cut from the 10-pack photo, matching the rest of the catalog.
update public.products
set
  image_url = '/assets/products/Pen-3ml-Glass-Cartridge.png',
  gallery_image_urls = array['/assets/products/Pen-3ml-Glass-Cartridge.png']
where slug = 'Pen-3ml-Glass-Cartridge';
