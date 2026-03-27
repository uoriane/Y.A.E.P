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
-- Trainer-Student Assignments
-- =========================
-- Each student is assigned to exactly one trainer for strict review ownership.
create table if not exists public.trainer_student_assignments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references auth.users(id) on delete cascade,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  note text
);

create index if not exists trainer_student_assignments_trainer_idx
on public.trainer_student_assignments(trainer_id);

-- Backfill assignment ownership from already graded/reviewed submissions.
insert into public.trainer_student_assignments (student_id, trainer_id)
select distinct on (s.student_id)
  s.student_id,
  s.trainer_id
from public.submissions s
where s.trainer_id is not null
order by s.student_id, s.submitted_at desc
on conflict (student_id) do nothing;

-- Backfill missing submission trainer IDs from assignment ownership.
update public.submissions s
set trainer_id = tsa.trainer_id
from public.trainer_student_assignments tsa
where s.student_id = tsa.student_id
  and s.trainer_id is null;

-- =========================
-- Training Sessions (Schedule)
-- =========================
create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  trainer_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  session_date date not null,
  start_time time,
  end_time time,
  location text,
  description text,
  created_at timestamptz not null default now()
);

create index if not exists training_sessions_category_date_idx
on public.training_sessions(category, session_date);

create index if not exists training_sessions_trainer_date_idx
on public.training_sessions(trainer_id, session_date);

-- =========================
-- Notifications (Email Queue + In-App Inbox)
-- =========================
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  delivery_channel text not null default 'email' check (delivery_channel in ('email')),
  delivery_status text not null default 'queued' check (delivery_status in ('queued', 'sent', 'failed')),
  kind text not null default 'general' check (kind in ('registration', 'selection-result', 'announcement', 'reminder', 'general')),
  subject text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_recipient_created_idx
on public.notifications(recipient_user_id, created_at desc);

-- =========================
-- Admin Audit Logs
-- =========================
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_admin_created_idx
on public.admin_audit_logs(admin_user_id, created_at desc);

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
alter table public.trainer_student_assignments enable row level security;
alter table public.training_sessions enable row level security;
alter table public.notifications enable row level security;
alter table public.admin_audit_logs enable row level security;

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

create or replace function public.log_admin_action(
  p_action text,
  p_entity_type text,
  p_entity_id text default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if public.current_user_role() <> 'admin' then
    raise exception 'Only administrators can log admin actions';
  end if;

  insert into public.admin_audit_logs (admin_user_id, action, entity_type, entity_id, details)
  values (auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb));
end;
$$;

create or replace function public.update_my_profile(
  p_full_name text,
  p_category text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_role text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select role into current_role
  from public.profiles
  where user_id = auth.uid();

  if current_role is null then
    raise exception 'Profile not found';
  end if;

  update public.profiles
  set
    full_name = nullif(trim(coalesce(p_full_name, '')), ''),
    category = case
      when current_role = 'admin' then category
      else coalesce(nullif(trim(coalesce(p_category, '')), ''), category)
    end
  where user_id = auth.uid();
end;
$$;

create or replace function public.assign_student_trainer(
  p_student_id uuid,
  p_trainer_id uuid,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  student_role text;
  student_category text;
  trainer_role text;
  trainer_category text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if public.current_user_role() <> 'admin' then
    raise exception 'Only administrators can assign students to trainers';
  end if;

  select role, category into student_role, student_category
  from public.profiles
  where user_id = p_student_id;

  if student_role is distinct from 'student' then
    raise exception 'Selected user is not a student';
  end if;

  select role, category into trainer_role, trainer_category
  from public.profiles
  where user_id = p_trainer_id;

  if trainer_role is distinct from 'trainer' then
    raise exception 'Selected user is not a trainer';
  end if;

  if coalesce(student_category, '') = '' then
    raise exception 'Student category is missing';
  end if;

  if coalesce(trainer_category, '') = '' then
    raise exception 'Trainer category is missing';
  end if;

  if student_category <> trainer_category then
    raise exception 'Student and trainer categories must match';
  end if;

  insert into public.trainer_student_assignments (student_id, trainer_id, assigned_by, note)
  values (p_student_id, p_trainer_id, auth.uid(), p_note)
  on conflict (student_id) do update set
    trainer_id = excluded.trainer_id,
    assigned_by = excluded.assigned_by,
    note = excluded.note,
    assigned_at = now();

  insert into public.notifications (
    recipient_user_id,
    kind,
    subject,
    body,
    delivery_status
  )
  values (
    p_student_id,
    'announcement',
    'Trainer assignment updated',
    'You have been assigned to a trainer. Please check your dashboard for updates.',
    'queued'
  );

  -- Backfill previously submitted rows so newly assigned trainers can see historical work.
  update public.submissions
  set trainer_id = p_trainer_id
  where student_id = p_student_id
    and trainer_id is null;

  perform public.log_admin_action(
    'assign_student_trainer',
    'trainer_student_assignments',
    p_student_id::text,
    jsonb_build_object('student_id', p_student_id, 'trainer_id', p_trainer_id)
  );
end;
$$;

create or replace function public.create_broadcast_notification(
  p_subject text,
  p_body text,
  p_kind text default 'announcement',
  p_target_role text default null,
  p_target_category text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  inserted_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if public.current_user_role() <> 'admin' then
    raise exception 'Only administrators can send broadcasts';
  end if;

  insert into public.notifications (
    recipient_user_id,
    kind,
    subject,
    body,
    delivery_status
  )
  select
    p.user_id,
    case
      when p_kind in ('registration', 'selection-result', 'announcement', 'reminder', 'general') then p_kind
      else 'announcement'
    end,
    p_subject,
    p_body,
    'queued'
  from public.profiles p
  where (p_target_role is null or p.role = p_target_role)
    and (p_target_category is null or p_target_category = '' or p.category = p_target_category);

  get diagnostics inserted_count = row_count;

  perform public.log_admin_action(
    'create_broadcast_notification',
    'notifications',
    null,
    jsonb_build_object(
      'target_role', p_target_role,
      'target_category', p_target_category,
      'kind', p_kind,
      'subject', p_subject,
      'recipient_count', inserted_count
    )
  );

  return inserted_count;
end;
$$;

create or replace function public.set_submission_trainer()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  assigned_trainer uuid;
begin
  select tsa.trainer_id into assigned_trainer
  from public.trainer_student_assignments tsa
  where tsa.student_id = new.student_id
  limit 1;

  if assigned_trainer is null then
    raise exception 'No trainer assigned to this student yet. Ask the administrator to assign your trainer first.';
  end if;

  new.trainer_id := assigned_trainer;
  return new;
end;
$$;

drop trigger if exists submissions_set_trainer on public.submissions;
create trigger submissions_set_trainer
before insert or update of student_id on public.submissions
for each row execute procedure public.set_submission_trainer();

create or replace function public.notify_registration_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (
    recipient_user_id,
    kind,
    subject,
    body,
    delivery_status
  )
  values (
    new.id,
    'registration',
    'Welcome to Arts Rwanda Youth Learning Platform',
    'Your registration was received. Please confirm your email and wait for further updates from the program team.',
    'queued'
  );

  return new;
end;
$$;

drop trigger if exists on_auth_user_registration_email on auth.users;
create trigger on_auth_user_registration_email
after insert on auth.users
for each row execute procedure public.notify_registration_email();

create or replace function public.notify_application_decision_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status not in ('approved', 'rejected') then
    return new;
  end if;

  insert into public.notifications (
    recipient_user_id,
    kind,
    subject,
    body,
    delivery_status
  )
  values (
    new.user_id,
    'selection-result',
    case when new.status = 'approved' then 'Application approved' else 'Application update' end,
    case
      when new.status = 'approved'
        then 'Congratulations. Your application has been approved. You can now access assignments and training sessions.'
      else 'Your application was not approved at this time. Contact the administrator for more details.'
    end,
    'queued'
  );

  return new;
end;
$$;

drop trigger if exists applications_notify_decision on public.applications;
create trigger applications_notify_decision
after update on public.applications
for each row execute procedure public.notify_application_decision_email();

grant execute on function public.log_admin_action(text, text, text, jsonb) to authenticated;
grant execute on function public.update_my_profile(text, text) to authenticated;
grant execute on function public.assign_student_trainer(uuid, uuid, text) to authenticated;
grant execute on function public.create_broadcast_notification(text, text, text, text, text) to authenticated;

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

-- Trainer-student assignments:
drop policy if exists "trainer_student_assignments_select_student" on public.trainer_student_assignments;
create policy "trainer_student_assignments_select_student"
on public.trainer_student_assignments
for select
using (student_id = auth.uid());

drop policy if exists "trainer_student_assignments_select_trainer" on public.trainer_student_assignments;
create policy "trainer_student_assignments_select_trainer"
on public.trainer_student_assignments
for select
using (trainer_id = auth.uid());

drop policy if exists "trainer_student_assignments_select_admin" on public.trainer_student_assignments;
create policy "trainer_student_assignments_select_admin"
on public.trainer_student_assignments
for select
using (public.current_user_role() = 'admin');

-- Training sessions:
drop policy if exists "training_sessions_select_student" on public.training_sessions;
create policy "training_sessions_select_student"
on public.training_sessions
for select
using (
  exists (
    select 1 from public.applications a
    where a.user_id = auth.uid()
      and a.status = 'approved'
      and a.category = training_sessions.category
  )
);

drop policy if exists "training_sessions_select_trainer" on public.training_sessions;
create policy "training_sessions_select_trainer"
on public.training_sessions
for select
using (
  public.current_user_role() = 'trainer'
  and training_sessions.trainer_id = auth.uid()
);

drop policy if exists "training_sessions_select_admin" on public.training_sessions;
create policy "training_sessions_select_admin"
on public.training_sessions
for select
using (public.current_user_role() = 'admin');

drop policy if exists "training_sessions_insert_trainer" on public.training_sessions;
create policy "training_sessions_insert_trainer"
on public.training_sessions
for insert
to authenticated
with check (
  public.current_user_role() = 'trainer'
  and training_sessions.trainer_id = auth.uid()
  and exists (
    select 1 from public.profiles p
    where p.user_id = auth.uid()
      and p.category = training_sessions.category
  )
);

drop policy if exists "training_sessions_insert_admin" on public.training_sessions;
create policy "training_sessions_insert_admin"
on public.training_sessions
for insert
to authenticated
with check (public.current_user_role() = 'admin');

drop policy if exists "training_sessions_update_trainer" on public.training_sessions;
create policy "training_sessions_update_trainer"
on public.training_sessions
for update
using (
  public.current_user_role() = 'trainer'
  and training_sessions.trainer_id = auth.uid()
)
with check (
  public.current_user_role() = 'trainer'
  and training_sessions.trainer_id = auth.uid()
);

drop policy if exists "training_sessions_update_admin" on public.training_sessions;
create policy "training_sessions_update_admin"
on public.training_sessions
for update
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

-- Notifications:
drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own"
on public.notifications
for select
using (recipient_user_id = auth.uid());

drop policy if exists "notifications_select_admin" on public.notifications;
create policy "notifications_select_admin"
on public.notifications
for select
using (public.current_user_role() = 'admin');

drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own"
on public.notifications
for update
using (recipient_user_id = auth.uid())
with check (recipient_user_id = auth.uid());

drop policy if exists "notifications_update_admin" on public.notifications;
create policy "notifications_update_admin"
on public.notifications
for update
using (public.current_user_role() = 'admin')
with check (public.current_user_role() = 'admin');

-- Admin audit logs:
drop policy if exists "admin_audit_logs_select_admin" on public.admin_audit_logs;
create policy "admin_audit_logs_select_admin"
on public.admin_audit_logs
for select
using (public.current_user_role() = 'admin');

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
  and trainer_id is not null
  and exists (
    select 1 from public.trainer_student_assignments tsa
    where tsa.student_id = auth.uid()
      and tsa.trainer_id = submissions.trainer_id
  )
  and exists (
    select 1 from public.applications a
    where a.user_id = auth.uid()
      and a.status = 'approved'
  )
);

-- Select:
-- - students can read their own submissions
-- - trainers can read submissions assigned to them
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
  and (
    submissions.trainer_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.category = submissions.category
    )
    or exists (
      select 1 from public.trainer_student_assignments tsa
      where tsa.student_id = submissions.student_id
        and tsa.trainer_id = auth.uid()
    )
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
  and trainer_id is not null
  and exists (
    select 1 from public.trainer_student_assignments tsa
    where tsa.student_id = auth.uid()
      and tsa.trainer_id = submissions.trainer_id
  )
  and exists (
    select 1 from public.applications a
    where a.user_id = auth.uid()
      and a.status = 'approved'
  )
)
with check (
  student_id = auth.uid()
  and status = 'submitted'
  and trainer_id is not null
  and exists (
    select 1 from public.trainer_student_assignments tsa
    where tsa.student_id = auth.uid()
      and tsa.trainer_id = submissions.trainer_id
  )
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
  and (
    submissions.trainer_id = auth.uid()
    or exists (
      select 1 from public.profiles p
      where p.user_id = auth.uid()
        and p.category = submissions.category
    )
    or exists (
      select 1 from public.trainer_student_assignments tsa
      where tsa.student_id = submissions.student_id
        and tsa.trainer_id = auth.uid()
    )
  )
  and exists (
    select 1 from public.applications a
    where a.user_id = submissions.student_id
      and a.status = 'approved'
  )
)
with check (
  public.current_user_role() = 'trainer'
  and submissions.trainer_id = auth.uid()
  and exists (
    select 1 from public.applications a
    where a.user_id = submissions.student_id
      and a.status = 'approved'
  )
);


