create or replace function public.profile_role_for(user_uuid uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = user_uuid
  limit 1;
$$;

create or replace function public.profile_is_admin(user_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.profile_role_for(user_uuid), '') = 'admin';
$$;

create or replace function public.beyond_peps_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  ) or public.profile_is_admin(auth.uid());
$$;

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Admins can view all profiles') then
    drop policy "Admins can view all profiles" on public.profiles;
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can view own profile') then
    drop policy "Users can view own profile" on public.profiles;
  end if;

  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'Users can update own profile') then
    drop policy "Users can update own profile" on public.profiles;
  end if;

  create policy "Users can view own profile"
    on public.profiles for select
    to authenticated
    using (id = auth.uid());

  create policy "Users can update own profile"
    on public.profiles for update
    to authenticated
    using (id = auth.uid())
    with check (id = auth.uid());

  create policy "Admins can view all profiles"
    on public.profiles for select
    to authenticated
    using (public.profile_is_admin(auth.uid()));
end;
$$;
