create table if not exists public.tutor_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  problem_id uuid not null references public.problems(id) on delete cascade,
  session_id uuid not null,
  stage smallint not null check (stage between 1 and 3),
  error_type text not null,
  line_number integer,
  created_at timestamptz not null default now(),
  unique (session_id, stage)
);

create index if not exists tutor_events_problem_time_idx
  on public.tutor_events (problem_id, created_at desc);

alter table public.tutor_events enable row level security;

drop policy if exists "tutor_events_read_own_or_class_teacher" on public.tutor_events;
create policy "tutor_events_read_own_or_class_teacher" on public.tutor_events for select to authenticated
  using (student_id = (select auth.uid()) or exists (
    select 1 from public.problems p where p.id = problem_id and public.teaches_class(p.class_id)
  ));

grant select on public.tutor_events to authenticated;
