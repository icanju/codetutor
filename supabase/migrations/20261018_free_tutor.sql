alter table public.tutor_events
  add column if not exists class_id uuid references public.classes(id) on delete cascade;

update public.tutor_events e
set class_id = p.class_id
from public.problems p
where e.class_id is null and e.problem_id = p.id;

alter table public.tutor_events alter column class_id set not null;
alter table public.tutor_events alter column problem_id drop not null;

drop policy if exists "tutor_events_read_own_or_class_teacher" on public.tutor_events;
create policy "tutor_events_read_own_or_class_teacher" on public.tutor_events for select to authenticated
  using (student_id = (select auth.uid()) or public.teaches_class(class_id));

drop index if exists public.tutor_events_problem_time_idx;
create index if not exists tutor_events_class_time_idx on public.tutor_events (class_id, created_at desc);
