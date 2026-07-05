do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
    and tablename = 'profiles'
    and policyname = 'Users can insert own profile'
  ) then
    create policy "Users can insert own profile"
      on public.profiles for insert
      to authenticated
      with check (id = auth.uid());
  end if;
end;
$$;

create or replace function public.beyond_peps_current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.beyond_peps_is_admin();
$$;

grant execute on function public.beyond_peps_current_user_is_admin() to authenticated;
