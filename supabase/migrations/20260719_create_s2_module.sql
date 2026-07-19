-- ============================================================
-- S2 KESMAS MODULE - Additive Migration
-- Creates S2 tables without modifying existing S1 tables
-- ============================================================

-- Enable UUID extension
create extension if not exists pgcrypto;

-- ============================================================
-- 1. S2_SESSIONS - Main session table for S2 examinations
-- ============================================================
create table if not exists public.s2_sessions (
  id uuid primary key default gen_random_uuid(),

  exam_type text not null
    check (exam_type in ('proposal', 'hasil', 'sidang')),

  status text not null default 'draft'
    check (status in (
      'draft',
      'scheduled',
      'in_progress',
      'completed',
      'cancelled'
    )),

  -- Student info
  student_name text not null,
  student_nim text not null,
  thesis_title text not null default '',
  specialization text not null default '',
  study_program text not null default 'Kesehatan Masyarakat',
  degree_program text not null default 'Program Magister',

  semester text not null default '',
  academic_year text not null default '',

  exam_date date,
  start_time time,
  end_time time,
  venue text not null default '',

  -- Decision (for proposal)
  decision text
    check (
      decision is null
      or decision in (
        'lulus_dengan_perbaikan',
        'tidak_lulus_mengulang'
      )
    ),

  report_notes text not null default '',
  script_presentation_minutes integer,
  rubric_version text not null default 'proposal-v1',

  -- Attendance
  public_attendance_token uuid not null default gen_random_uuid(),
  attendance_open boolean not null default false,

  -- Audit
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes
create unique index if not exists s2_sessions_nim_exam_unique
  on public.s2_sessions(student_nim, exam_type, exam_date)
  where exam_date is not null;

create index if not exists s2_sessions_exam_date_idx
  on public.s2_sessions(exam_date);

create index if not exists s2_sessions_status_idx
  on public.s2_sessions(status);

create index if not exists s2_sessions_student_nim_idx
  on public.s2_sessions(student_nim);

-- ============================================================
-- 2. S2_SESSION_PEOPLE - People assigned to session
-- ============================================================
create table if not exists public.s2_session_people (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null
    references public.s2_sessions(id)
    on delete cascade,

  role text not null
    check (role in (
      'pembimbing_1',
      'pembimbing_2',
      'ketua_penguji',
      'anggota_penguji_1',
      'anggota_penguji_2',
      'anggota_penguji_3',
      'koordinator'
    )),

  user_id uuid references auth.users(id),
  profile_id uuid,
  display_name text not null,
  nip text not null default '',
  email text not null default '',
  signature_path text,
  sequence_no smallint not null default 1,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (session_id, role)
);

create index if not exists s2_session_people_session_idx
  on public.s2_session_people(session_id);

create index if not exists s2_session_people_user_idx
  on public.s2_session_people(user_id);

-- ============================================================
-- 3. S2_SCORES - One row per examiner per criterion
-- ============================================================
create table if not exists public.s2_scores (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null
    references public.s2_sessions(id)
    on delete cascade,

  examiner_person_id uuid not null
    references public.s2_session_people(id)
    on delete cascade,

  criterion_code text not null,
  criterion_label_snapshot text not null,
  weight_snapshot numeric(6,2) not null
    check (weight_snapshot >= 0),

  score numeric(4,2)
    check (score is null or (score >= 1 and score <= 4)),

  notes text not null default '',
  submitted_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (session_id, examiner_person_id, criterion_code)
);

create index if not exists s2_scores_session_idx
  on public.s2_scores(session_id);

create index if not exists s2_scores_examiner_idx
  on public.s2_scores(examiner_person_id);

-- ============================================================
-- 4. S2_ATTENDANCE - Participant and audience attendance
-- ============================================================
create table if not exists public.s2_attendance (
  id uuid primary key default gen_random_uuid(),

  session_id uuid not null
    references public.s2_sessions(id)
    on delete cascade,

  attendance_type text not null
    check (attendance_type in ('peserta', 'audiens')),

  name text not null,
  nim text not null default '',
  signature_path text,
  notes text not null default '',

  submitted_by uuid references auth.users(id),
  submitted_at timestamptz not null default now(),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists s2_attendance_session_type_idx
  on public.s2_attendance(session_id, attendance_type);

-- ============================================================
-- 5. UPDATED_AT TRIGGER (reuse existing function if exists)
-- ============================================================
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists update_s2_sessions_updated_at on public.s2_sessions;
create trigger update_s2_sessions_updated_at
  before update on public.s2_sessions
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_s2_session_people_updated_at on public.s2_session_people;
create trigger update_s2_session_people_updated_at
  before update on public.s2_session_people
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_s2_scores_updated_at on public.s2_scores;
create trigger update_s2_scores_updated_at
  before update on public.s2_scores
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_s2_attendance_updated_at on public.s2_attendance;
create trigger update_s2_attendance_updated_at
  before update on public.s2_attendance
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================

-- Enable RLS
alter table public.s2_sessions enable row level security;
alter table public.s2_session_people enable row level security;
alter table public.s2_scores enable row level security;
alter table public.s2_attendance enable row level security;

-- Helper function for access check
create or replace function public.can_access_s2_session(target_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.role in ('superadmin', 'koordinator', 'admin')
    )
    or exists (
      select 1
      from public.s2_session_people sp
      where sp.session_id = target_session_id
        and sp.user_id = auth.uid()
    );
$$;

-- S2_SESSIONS policies
create policy "Superadmin/coordinator/admin can view all S2 sessions"
  on public.s2_sessions for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('superadmin', 'koordinator', 'admin')
    )
  );

create policy "Assigned people can view their S2 sessions"
  on public.s2_sessions for select
  using (
    exists (
      select 1 from public.s2_session_people sp
      where sp.session_id = s2_sessions.id
        and sp.user_id = auth.uid()
    )
  );

create policy "Superadmin/coordinator/admin can insert S2 sessions"
  on public.s2_sessions for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('superadmin', 'koordinator', 'admin')
    )
  );

create policy "Superadmin/coordinator/admin can update S2 sessions"
  on public.s2_sessions for update
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('superadmin', 'koordinator', 'admin')
    )
  );

create policy "Superadmin/coordinator/admin can delete S2 sessions"
  on public.s2_sessions for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('superadmin', 'koordinator', 'admin')
    )
  );

-- S2_SESSION_PEOPLE policies
create policy "Superadmin/coordinator/admin can manage S2 session people"
  on public.s2_session_people for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('superadmin', 'koordinator', 'admin')
    )
  );

create policy "Users can view their own S2 session people assignments"
  on public.s2_session_people for select
  using (user_id = auth.uid());

-- S2_SCORES policies
create policy "Superadmin/coordinator/admin can manage S2 scores"
  on public.s2_scores for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('superadmin', 'koordinator', 'admin')
    )
  );

create policy "Examiners can view and update their own S2 scores"
  on public.s2_scores for all
  using (
    exists (
      select 1 from public.s2_session_people sp
      where sp.id = s2_scores.examiner_person_id
        and sp.user_id = auth.uid()
    )
  );

-- S2_ATTENDANCE policies (public attendance via token - handled via API route)
create policy "Superadmin/coordinator/admin can manage S2 attendance"
  on public.s2_attendance for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('superadmin', 'koordinator', 'admin')
    )
  );

create policy "Users can view attendance for their sessions"
  on public.s2_attendance for select
  using (
    exists (
      select 1 from public.s2_session_people sp
      where sp.session_id = s2_attendance.session_id
        and sp.user_id = auth.uid()
    )
  );

-- ============================================================
-- 7. REALTIME PUBLICATION
-- ============================================================
alter publication supabase_realtime add table public.s2_sessions;
alter publication supabase_realtime add table public.s2_session_people;
alter publication supabase_realtime add table public.s2_scores;
alter publication supabase_realtime add table public.s2_attendance;

-- ============================================================
-- 8. STORAGE BUCKETS (run in Supabase Dashboard Storage)
-- ============================================================
-- s2-signatures/ (private)
-- s2-documents/ (private)

-- ============================================================
-- 9. GRANT PERMISSIONS
-- ============================================================
grant select on public.s2_sessions to anon, authenticated;
grant select on public.s2_session_people to anon, authenticated;
grant select on public.s2_scores to anon, authenticated;
grant select on public.s2_attendance to anon, authenticated;

grant insert, update, delete on public.s2_sessions to authenticated;
grant insert, update, delete on public.s2_session_people to authenticated;
grant insert, update, delete on public.s2_scores to authenticated;
grant insert, update, delete on public.s2_attendance to authenticated;