create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;

create or replace function public.can_manage_class(target_class uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.classes c
    where c.id = target_class and (c.teacher_id = (select auth.uid()) or public.is_admin())
  ) and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('teacher', 'admin')
  );
$$;

create or replace function public.teaches_class(target_class uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.can_manage_class(target_class); $$;

insert into public.profiles (id, username, display_name, role)
select
  u.id,
  nullif(u.raw_user_meta_data ->> 'username', ''),
  coalesce(u.raw_user_meta_data ->> 'display_name', split_part(coalesce(u.email, ''), '@', 1)),
  'student'
from auth.users u
on conflict (id) do nothing;

drop policy if exists "profiles_read_self_or_teacher" on public.profiles;
create policy "profiles_read_self_or_teacher" on public.profiles for select to authenticated
  using (
    id = (select auth.uid()) or public.is_admin() or exists (
      select 1 from public.enrollments e
      join public.classes c on c.id = e.class_id
      where e.student_id = profiles.id and c.teacher_id = (select auth.uid()) and public.is_teacher()
    )
  );

drop policy if exists "classes_read_members" on public.classes;
create policy "classes_read_members" on public.classes for select to authenticated
  using (teacher_id = (select auth.uid()) or public.is_enrolled(id) or public.is_admin());

drop policy if exists "classes_teacher_update" on public.classes;
create policy "classes_teacher_update" on public.classes for update to authenticated
  using (public.can_manage_class(id))
  with check ((teacher_id = (select auth.uid()) or public.is_admin()) and public.is_teacher());

drop policy if exists "classes_teacher_delete" on public.classes;
create policy "classes_teacher_delete" on public.classes for delete to authenticated
  using (public.can_manage_class(id));

grant select on public.tutor_events to authenticated;
