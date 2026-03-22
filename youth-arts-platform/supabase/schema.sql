-- Arts Rwanda Youth Learning Platform
-- Create tables and storage bucket for student submissions and trainer review.
--
-- IMPORTANT:
-- 1) Run this SQL in Supabase Dashboard -> SQL Editor
-- 2) After running, restart your frontend dev server

-- Enable required extensions (for UUID generation)
create extension if not exists pgcrypto;

-- =========================
-- Profiles
-- =========================
-- We keep role + category in a table so RLS policies can use it.
create table if not exists public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  role text not null check (role in ('student', 'trainer', 'admin')),
  category text,
  created_at timestamptz not null default now()
);

-- =========================
-- Applications (admin selects participants)
-- =========================
-- Students apply at registration time, and the admin approves/rejects.
create table if not exists public.applications (
  user_id uuid primary key references public.profiles (user_id) on delete cascade,
  category text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  submitted_at timestamptz not null default now(),
  decision_at timestamptz
);

-- Automatically create/update profile after signup.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, full_name, role, category)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'role', 'student'),
    new.raw_user_meta_data->>'category'
  )
  on conflict (user_id) do update set
    full_name = excluded.full_name,
    role = excluded.role,
    category = excluded.category;

  -- When the user registers as a student, create an application row (pending by default).
  if coalesce(new.raw_user_meta_data->>'role', 'student') = 'student' then
    insert into public.applications (user_id, category, status)
    values (
      new.id,
      new.raw_user_meta_data->>'category',
      'pending'
    )
    on conflict (user_id) do update set
      category = excluded.category,
      status = 'pending',
      submitted_at = now(),
      decision_at = null;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Backfill applications for already-existing student profiles (created before this schema update).
insert into public.applications (user_id, category, status)
select
  p.user_id,
  p.category,
  'pending'
from public.profiles p
where p.role = 'student'
  and not exists (
    select 1 from public.applications a where a.user_id = p.user_id
  )
on conflict (user_id) do nothing;

-- =========================
-- Assignments
-- =========================
-- These are the tasks students submit for.
create table if not exists public.assignments (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  title text not null,
  due_date date,
  created_at timestamptz not null default now()
);

alter table public.assignments
add column if not exists created_by uuid references auth.users(id) on delete set null;

create index if not exists assignments_category_due_date_idx
on public.assignments(category, due_date);

-- Seed a few example assignments (safe to rerun)
insert into public.assignments (category, title, due_date)
values
  ('visual-arts', 'Portfolio Piece: Identity in Color', '2026-03-30'),
  ('music', 'Community Storytelling Project (Music)', '2026-04-05'),
  ('design', 'Design Challenge: Poster for a Youth Event', '2026-04-12')
on conflict do nothing;

-- =========================
-- Submissions
-- =========================
-- Students upload a file; trainers review and grade.
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  trainer_id uuid references auth.users(id) on delete set null,

  category text not null,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  assignment_title text not null,

  student_name text not null,
  file_path text not null,

  submitted_at timestamptz not null default now(),
  status text not null default 'submitted' check (status in ('submitted', 'graded')),

  grade text,
  feedback text,
  graded_at timestamptz
);

create index if not exists submissions_student_id_idx on public.submissions(student_id);
create index if not exists submissions_category_status_idx on public.submissions(category, status);
create index if not exists submissions_assignment_id_idx on public.submissions(assignment_id);

-- =========================
-- Storage bucket for files
-- =========================
-- A public bucket is the simplest for a student/trainer demo because files can be rendered via public URLs.
-- If you want private uploads later, we can tighten policies and use signed URLs.
insert into storage.buckets (id, name, public)
values ('acdr-submissions', 'acdr-submissions', true)
on conflict (id) do nothing;

drop policy if exists "acdr_submissions_read" on storage.objects;
create policy "acdr_submissions_read"
on storage.objects
for select
using (bucket_id = 'acdr-submissions');

drop policy if exists "acdr_submissions_insert" on storage.objects;
create policy "acdr_submissions_insert"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'acdr-submissions');

drop policy if exists "acdr_submissions_update" on storage.objects;
create policy "acdr_submissions_update"
on storage.objects
for update
to authenticated
using (bucket_id = 'acdr-submissions')
with check (bucket_id = 'acdr-submissions');

-- =========================
-- RLS Policies
-- =========================
alter table public.profiles enable row level security;
alter table public.applications enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;

create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (
      select p.role
      from public.profiles p
      where p.user_id = auth.uid()
      limit 1
    ),
    auth.jwt() -> 'user_metadata' ->> 'role',
    'student'
  );
$$;

-- Profiles:
-- - Users can read their own profile
-- - Admin can read all profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles
for select
using (user_id = auth.uid());

drop policy if exists "profiles_select_admin" on public.profiles;
create policy "profiles_select_admin"
on public.profiles
for select
using (public.current_user_role() = 'admin');

-- Profiles insert/update is handled by the trigger; users don't need direct write access.
-- Admins can update profile role/category for account management.
drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
on public.profiles
for update
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

-- Applications:
-- - Students can read their own application status
-- - Admin can read all applications and update decision status
drop policy if exists "applications_select_own" on public.applications;
create policy "applications_select_own"
on public.applications
for select
using (user_id = auth.uid());

drop policy if exists "applications_select_admin" on public.applications;
create policy "applications_select_admin"
on public.applications
for select
using (public.current_user_role() = 'admin');

drop policy if exists "applications_update_admin" on public.applications;
create policy "applications_update_admin"
on public.applications
for update
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

-- Assignments:
-- - Only approved students can read assignments
drop policy if exists "assignments_select_authenticated" on public.assignments;
drop policy if exists "assignments_select_approved_students" on public.assignments;
create policy "assignments_select_approved_students"
on public.assignments
for select
using (
  exists (
    select 1 from public.applications a
    where a.user_id = auth.uid()
      and a.status = 'approved'
  )
);

drop policy if exists "assignments_select_trainer_category" on public.assignments;
create policy "assignments_select_trainer_category"
on public.assignments
for select
using (
  public.current_user_role() = 'trainer'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.category = assignments.category
  )
);

drop policy if exists "assignments_select_admin" on public.assignments;
create policy "assignments_select_admin"
on public.assignments
for select
using (public.current_user_role() = 'admin');

drop policy if exists "assignments_insert_trainer_category" on public.assignments;
create policy "assignments_insert_trainer_category"
on public.assignments
for insert
to authenticated
with check (
  public.current_user_role() = 'trainer'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.category = assignments.category
  )
);

drop policy if exists "assignments_insert_admin" on public.assignments;
create policy "assignments_insert_admin"
on public.assignments
for insert
to authenticated
with check (public.current_user_role() = 'admin');

drop policy if exists "assignments_update_trainer_category" on public.assignments;
create policy "assignments_update_trainer_category"
on public.assignments
for update
using (
  public.current_user_role() = 'trainer'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.category = assignments.category
  )
)
with check (
  public.current_user_role() = 'trainer'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.category = assignments.category
  )
);

drop policy if exists "assignments_update_admin" on public.assignments;
create policy "assignments_update_admin"
on public.assignments
for update
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

-- Submissions:
-- Insert:
-- - students can create submissions for themselves only
drop policy if exists "submissions_insert_student" on public.submissions;
drop policy if exists "submissions_insert_student_approved_only" on public.submissions;
create policy "submissions_insert_student_approved_only"
on public.submissions
for insert
to authenticated
with check (
  student_id = auth.uid()
  and exists (
    select 1 from public.applications a
    where a.user_id = auth.uid()
      and a.status = 'approved'
  )
);

-- Select:
-- - students can read their own submissions
-- - trainers can read submissions in their category
-- - admins can read all submissions
drop policy if exists "submissions_select_student_own" on public.submissions;
drop policy if exists "submissions_select_student_own_approved_only" on public.submissions;
create policy "submissions_select_student_own_approved_only"
on public.submissions
for select
using (
  student_id = auth.uid()
  and exists (
    select 1 from public.applications a
    where a.user_id = auth.uid()
      and a.status = 'approved'
  )
);

drop policy if exists "submissions_select_trainer_category" on public.submissions;
create policy "submissions_select_trainer_category"
on public.submissions
for select
using (
  public.current_user_role() = 'trainer'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.category = submissions.category
  )
  and exists (
    select 1 from public.applications a
    where a.user_id = submissions.student_id
      and a.status = 'approved'
  )
);

drop policy if exists "submissions_select_admin" on public.submissions;
create policy "submissions_select_admin"
on public.submissions
for select
using (public.current_user_role() = 'admin');

-- Update:
-- - students can update their own submission only while it is still 'submitted'
-- - trainers can grade submissions for their category
drop policy if exists "submissions_update_student_while_submitted" on public.submissions;
drop policy if exists "submissions_update_student_while_submitted_approved_only" on public.submissions;
create policy "submissions_update_student_while_submitted_approved_only"
on public.submissions
for update
using (
  student_id = auth.uid()
  and status = 'submitted'
  and exists (
    select 1 from public.applications a
    where a.user_id = auth.uid()
      and a.status = 'approved'
  )
)
with check (
  student_id = auth.uid()
  and status = 'submitted'
  and exists (
    select 1 from public.applications a
    where a.user_id = auth.uid()
      and a.status = 'approved'
  )
);

drop policy if exists "submissions_update_trainer_grade" on public.submissions;
create policy "submissions_update_trainer_grade"
on public.submissions
for update
using (
  public.current_user_role() = 'trainer'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.category = submissions.category
  )
  and exists (
    select 1 from public.applications a
    where a.user_id = submissions.student_id
      and a.status = 'approved'
  )
)
with check (
  public.current_user_role() = 'trainer'
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.category = submissions.category
  )
  and exists (
    select 1 from public.applications a
    where a.user_id = submissions.student_id
      and a.status = 'approved'
  )
);


