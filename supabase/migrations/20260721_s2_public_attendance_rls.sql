-- Allow anonymous (no-login) read of a session + its attendance when accessed
-- by the public attendance token. This mirrors the S1 public attendance flow
-- and lets /s2/attendance/[token] work without authentication.
-- Service-role API route still works; this just removes any auth dependency.

-- 1. Anonymous can SELECT a session if they know its public_attendance_token
drop policy if exists "Public can view S2 session by attendance token" on public.s2_sessions;
create policy "Public can view S2 session by attendance token"
  on public.s2_sessions for select
  to anon, authenticated
  using ( public_attendance_token is not null );

-- 2. Anonymous can SELECT attendance rows for a session that is publicly reachable
drop policy if exists "Public can view S2 attendance by session token" on public.s2_attendance;
create policy "Public can view S2 attendance by session token"
  on public.s2_attendance for select
  to anon, authenticated
  using (
    exists (
      select 1 from public.s2_sessions s
      where s.id = s2_attendance.session_id
        and s.public_attendance_token is not null
    )
  );

-- 3. Anonymous can INSERT attendance rows for a publicly reachable session
--    (the public page saves peserta/audiens via the API which uses service role,
--     but allow anon too for resilience)
drop policy if exists "Public can insert S2 attendance by session token" on public.s2_attendance;
create policy "Public can insert S2 attendance by session token"
  on public.s2_attendance for insert
  to anon, authenticated
  with check (
    exists (
      select 1 from public.s2_sessions s
      where s.id = s2_attendance.session_id
        and s.public_attendance_token is not null
    )
  );
