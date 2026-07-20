-- ============================================================
-- S2 RLS parity with S1 (permissive model)
-- Replace the strict per-user scoping from 20260719/20260721 with
-- the same approach S1 uses: sessions/people/scores/attendance are
-- readable by everyone (public), and writes are allowed for
-- authenticated dosen (and public for attendance saves).
-- This fixes: examiners added by name (no user_id) being locked out,
-- and the public Daftar Hadir link requiring login.
-- ============================================================

-- 1. Drop all previously created S2 policies (idempotent)
drop policy if exists "Superadmin/coordinator/admin can view all S2 sessions" on public.s2_sessions;
drop policy if exists "Assigned people can view their S2 sessions" on public.s2_sessions;
drop policy if exists "Superadmin/coordinator/admin can insert S2 sessions" on public.s2_sessions;
drop policy if exists "Superadmin/coordinator/admin can update S2 sessions" on public.s2_sessions;
drop policy if exists "Superadmin/coordinator/admin can delete S2 sessions" on public.s2_sessions;
drop policy if exists "Public can view S2 session by attendance token" on public.s2_sessions;

drop policy if exists "Superadmin/coordinator/admin can manage S2 session people" on public.s2_session_people;
drop policy if exists "Users can view their own S2 session people assignments" on public.s2_session_people;

drop policy if exists "Superadmin/coordinator/admin can manage S2 scores" on public.s2_scores;
drop policy if exists "Examiners can view and update their own S2 scores" on public.s2_scores;

drop policy if exists "Superadmin/coordinator/admin can manage S2 attendance" on public.s2_attendance;
drop policy if exists "Users can view attendance for their sessions" on public.s2_attendance;
drop policy if exists "Public can view S2 attendance by session token" on public.s2_attendance;
drop policy if exists "Public can insert S2 attendance by session token" on public.s2_attendance;

-- 2. s2_sessions  (mirror S1: public read, dosen write)
create policy "Public can read S2 sessions"
  on public.s2_sessions for select
  to public
  using ( true );

create policy "Dosen can insert S2 sessions"
  on public.s2_sessions for insert
  to authenticated
  with check ( true );

create policy "Dosen can update S2 sessions"
  on public.s2_sessions for update
  to authenticated
  using ( true );

create policy "Dosen can delete S2 sessions"
  on public.s2_sessions for delete
  to authenticated
  using ( true );

-- 3. s2_session_people  (public read; dosen write)
create policy "Public can read S2 session people"
  on public.s2_session_people for select
  to public
  using ( true );

create policy "Dosen can manage S2 session people"
  on public.s2_session_people for all
  to authenticated
  using ( true )
  with check ( true );

-- 4. s2_scores  (public read; dosen write)
create policy "Public can read S2 scores"
  on public.s2_scores for select
  to public
  using ( true );

create policy "Dosen can manage S2 scores"
  on public.s2_scores for all
  to authenticated
  using ( true )
  with check ( true );

-- 5. s2_attendance  (public read + public update for attendance saves;
--    dosen can also insert/delete)
create policy "Public can read S2 attendance"
  on public.s2_attendance for select
  to public
  using ( true );

create policy "Public can update S2 attendance"
  on public.s2_attendance for update
  to public
  using ( true )
  with check ( true );

create policy "Dosen can insert S2 attendance"
  on public.s2_attendance for insert
  to authenticated
  with check ( true );

create policy "Dosen can delete S2 attendance"
  on public.s2_attendance for delete
  to authenticated
  using ( true );
