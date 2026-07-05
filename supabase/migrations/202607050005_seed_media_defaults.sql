update public.site_settings
set value = jsonb_set(value, '{blogHeroImageUrl}', '"assets/hero-liquid-lab.png"', true)
where key = 'home'
and not (value ? 'blogHeroImageUrl');

update public.products
set image_url = 'assets/hero-liquid-lab.png'
where slug in ('sterile-vial-kit', 'amber-cold-storage', 'micro-measure-set')
and nullif(image_url, '') is null;

update public.blog_posts
set image_url = 'assets/hero-liquid-lab.png',
    hero_image_url = 'assets/hero-liquid-lab.png'
where slug in ('building-a-better-peptide-supply-station', 'why-calculators-need-context')
and (nullif(image_url, '') is null or nullif(hero_image_url, '') is null);
