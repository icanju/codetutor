create table if not exists public.enrollments (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

alter table public.enrollments enable row level security;

drop policy if exists "enrollments_read_self_or_teacher" on public.enrollments;
create policy "enrollments_read_self_or_teacher" on public.enrollments for select to authenticated
  using (student_id = (select auth.uid()) or public.teaches_class(class_id));

drop policy if exists "enrollments_teacher_insert" on public.enrollments;
create policy "enrollments_teacher_insert" on public.enrollments for insert to authenticated
  with check (public.teaches_class(class_id));

drop policy if exists "enrollments_teacher_delete" on public.enrollments;
create policy "enrollments_teacher_delete" on public.enrollments for delete to authenticated
  using (public.teaches_class(class_id));

grant select, insert, delete on public.enrollments to authenticated;
