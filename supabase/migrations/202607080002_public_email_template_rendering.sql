drop policy if exists "Email templates can be rendered" on public.email_templates;

create policy "Email templates can be rendered"
  on public.email_templates
  for select
  to anon, authenticated
  using (enabled = true);
