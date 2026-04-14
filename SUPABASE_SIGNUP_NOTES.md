# Supabase signup notes

For this auth-first build, keep **Email signup enabled** and **Confirm email disabled** while testing.

You also need RLS policies that allow authenticated users to insert their own row into `profiles` and `partner_profiles`.

Use these SQL policies in Supabase SQL Editor:

```sql
alter table public.profiles enable row level security;

drop policy if exists "users can insert own profile" on public.profiles;
drop policy if exists "users can view own profile" on public.profiles;
drop policy if exists "users can update own profile" on public.profiles;

create policy "users can insert own profile"
on public.profiles
for insert
to authenticated
with check ((select auth.uid()) = auth_user_id);

create policy "users can view own profile"
on public.profiles
for select
to authenticated
using ((select auth.uid()) = auth_user_id);

create policy "users can update own profile"
on public.profiles
for update
to authenticated
using ((select auth.uid()) = auth_user_id)
with check ((select auth.uid()) = auth_user_id);
```

```sql
alter table public.partner_profiles enable row level security;

drop policy if exists "partners can insert own partner profile" on public.partner_profiles;
drop policy if exists "partners can view own partner profile" on public.partner_profiles;
drop policy if exists "partners can update own partner profile" on public.partner_profiles;

create policy "partners can insert own partner profile"
on public.partner_profiles
for insert
to authenticated
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = profile_id
      and p.auth_user_id = (select auth.uid())
  )
);

create policy "partners can view own partner profile"
on public.partner_profiles
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = profile_id
      and p.auth_user_id = (select auth.uid())
  )
);

create policy "partners can update own partner profile"
on public.partner_profiles
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = profile_id
      and p.auth_user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = profile_id
      and p.auth_user_id = (select auth.uid())
  )
);
```
