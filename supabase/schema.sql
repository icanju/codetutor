-- Codeon classroom, assignments and grading history.
-- Run once in Supabase Dashboard > SQL Editor as the project owner.

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  display_name text not null default '',
  role text not null default 'student' check (role in ('student', 'teacher', 'admin')),
  created_at timestamptz not null default now()
);
create unique index profiles_username_lower_unique on public.profiles (lower(username)) where username is not null;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, username, display_name, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'username', ''),
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1)),
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles (id, username, display_name, role)
select
  u.id,
  nullif(u.raw_user_meta_data ->> 'username', ''),
  coalesce(u.raw_user_meta_data ->> 'display_name', split_part(coalesce(u.email, ''), '@', 1)),
  'student'
from auth.users u
on conflict (id) do nothing;

create function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role in ('teacher', 'admin')
  );
$$;

create function public.is_admin()
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

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete restrict,
  name text not null,
  created_at timestamptz not null default now()
);

create table public.enrollments (
  class_id uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

create function public.can_manage_class(target_class uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.classes c
    where c.id = target_class and (c.teacher_id = (select auth.uid()) or public.is_admin())
  ) and public.is_teacher();
$$;

create function public.teaches_class(target_class uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.can_manage_class(target_class); $$;

create function public.is_enrolled(target_class uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    where e.class_id = target_class and e.student_id = (select auth.uid())
  );
$$;

create table public.problems (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  title text not null,
  description text not null,
  allowed_concepts text[] not null default '{}',
  points integer not null default 100 check (points between 1 and 10000),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  created_at timestamptz not null default now()
);

create table public.problem_examples (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.problems(id) on delete cascade,
  stdin text not null default '',
  expected_stdout text not null,
  created_at timestamptz not null default now()
);

create table public.test_cases (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.problems(id) on delete cascade,
  stdin text not null default '',
  expected_stdout text not null,
  points integer not null default 1 check (points > 0),
  created_at timestamptz not null default now()
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  problem_id uuid not null references public.problems(id) on delete restrict,
  student_id uuid not null references public.profiles(id) on delete restrict,
  source_code text not null,
  status text not null default 'queued' check (status in ('queued', 'accepted', 'wrong_answer', 'runtime_error', 'time_limit', 'internal_error')),
  score integer,
  max_score integer not null default 100 check (max_score > 0),
  check (score is null or score between 0 and max_score),
  created_at timestamptz not null default now()
);

create table public.submission_tests (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions(id) on delete cascade,
  test_case_id uuid references public.test_cases(id) on delete set null,
  passed boolean not null,
  actual_stdout text,
  error_summary text,
  created_at timestamptz not null default now()
);

create table public.tutor_events (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  problem_id uuid references public.problems(id) on delete set null,
  session_id uuid not null,
  stage smallint not null check (stage between 1 and 3),
  error_type text not null,
  line_number integer,
  created_at timestamptz not null default now(),
  unique (session_id, stage)
);
create index tutor_events_class_time_idx on public.tutor_events (class_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.enrollments enable row level security;
alter table public.problems enable row level security;
alter table public.problem_examples enable row level security;
alter table public.test_cases enable row level security;
alter table public.submissions enable row level security;
alter table public.submission_tests enable row level security;
alter table public.tutor_events enable row level security;

create policy "profiles_read_self_or_teacher" on public.profiles for select to authenticated
  using (
    id = (select auth.uid()) or public.is_admin() or exists (
      select 1 from public.enrollments e
      join public.classes c on c.id = e.class_id
      where e.student_id = profiles.id and c.teacher_id = (select auth.uid()) and public.is_teacher()
    )
  );
create policy "profiles_update_display_name" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "classes_read_members" on public.classes for select to authenticated
  using (teacher_id = (select auth.uid()) or public.is_enrolled(id) or public.is_admin());
create policy "classes_teacher_insert" on public.classes for insert to authenticated
  with check (teacher_id = (select auth.uid()) and public.is_teacher());
create policy "classes_teacher_update" on public.classes for update to authenticated
  using (public.can_manage_class(id))
  with check ((teacher_id = (select auth.uid()) or public.is_admin()) and public.is_teacher());
create policy "classes_teacher_delete" on public.classes for delete to authenticated
  using (public.can_manage_class(id));

create policy "enrollments_read_self_or_teacher" on public.enrollments for select to authenticated
  using (student_id = (select auth.uid()) or public.teaches_class(class_id));
create policy "enrollments_teacher_insert" on public.enrollments for insert to authenticated
  with check (public.teaches_class(class_id));
create policy "enrollments_teacher_delete" on public.enrollments for delete to authenticated
  using (public.teaches_class(class_id));

create policy "problems_read_assigned" on public.problems for select to authenticated
  using (public.teaches_class(class_id) or (status = 'published' and public.is_enrolled(class_id)));
create policy "problems_teacher_insert" on public.problems for insert to authenticated
  with check (public.teaches_class(class_id));
create policy "problems_teacher_update" on public.problems for update to authenticated
  using (public.teaches_class(class_id)) with check (public.teaches_class(class_id));
create policy "problems_teacher_delete" on public.problems for delete to authenticated
  using (public.teaches_class(class_id));

create policy "examples_read_assigned" on public.problem_examples for select to authenticated
  using (exists (
    select 1 from public.problems p where p.id = problem_id
      and (public.teaches_class(p.class_id) or (p.status = 'published' and public.is_enrolled(p.class_id)))
  ));
create policy "examples_teacher_insert" on public.problem_examples for insert to authenticated
  with check (exists (select 1 from public.problems p where p.id = problem_id and public.teaches_class(p.class_id)));
create policy "examples_teacher_update" on public.problem_examples for update to authenticated
  using (exists (select 1 from public.problems p where p.id = problem_id and public.teaches_class(p.class_id)))
  with check (exists (select 1 from public.problems p where p.id = problem_id and public.teaches_class(p.class_id)));
create policy "examples_teacher_delete" on public.problem_examples for delete to authenticated
  using (exists (select 1 from public.problems p where p.id = problem_id and public.teaches_class(p.class_id)));

create policy "test_cases_teacher_only" on public.test_cases for all to authenticated
  using (exists (select 1 from public.problems p where p.id = problem_id and public.teaches_class(p.class_id)))
  with check (exists (select 1 from public.problems p where p.id = problem_id and public.teaches_class(p.class_id)));

create policy "submissions_read_own_or_class_teacher" on public.submissions for select to authenticated
  using (student_id = (select auth.uid()) or exists (
    select 1 from public.problems p where p.id = problem_id and public.teaches_class(p.class_id)
  ));
create policy "submissions_insert_own_queued" on public.submissions for insert to authenticated
  with check (
    student_id = (select auth.uid()) and status = 'queued' and score is null
    and exists (
      select 1 from public.problems p where p.id = problem_id and p.status = 'published'
        and public.is_enrolled(p.class_id)
    )
  );

create policy "submission_tests_teacher_only" on public.submission_tests for select to authenticated
  using (exists (
    select 1 from public.submissions s join public.problems p on p.id = s.problem_id
    where s.id = submission_id and public.teaches_class(p.class_id)
  ));

create policy "tutor_events_read_own_or_class_teacher" on public.tutor_events for select to authenticated
  using (student_id = (select auth.uid()) or public.teaches_class(class_id));

grant usage on schema public to authenticated;
grant select on public.profiles, public.classes, public.enrollments, public.problems,
  public.problem_examples, public.test_cases, public.submissions, public.submission_tests,
  public.tutor_events to authenticated;
grant update (display_name) on public.profiles to authenticated;
grant insert, update, delete on public.classes, public.enrollments, public.problems, public.problem_examples, public.test_cases to authenticated;
grant insert (problem_id, student_id, source_code) on public.submissions to authenticated;

-- Submission status/scores and per-test outcomes must be written by a trusted grader only.
