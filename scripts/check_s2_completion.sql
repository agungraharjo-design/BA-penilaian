-- Identify S2 Proposal sessions with score completion status
-- Run in Supabase SQL Editor (project rvfyljuuchmuynbkqczp)
-- Shows which students have complete scores ready for Rekap Nilai

with examiner_score_counts as (
  select
    sp.session_id,
    sp.id as person_id,
    sp.role,
    count(sc.id) filter (where sc.score is not null) as filled_scores,
    case
      when count(sc.id) filter (where sc.score is not null) = 7 then true
      else false
    end as is_complete
  from public.s2_session_people sp
  left join public.s2_scores sc on sc.examiner_person_id = sp.id
  where sp.role in ('ketua_penguji', 'anggota_penguji_1', 'anggota_penguji_2', 'anggota_penguji_3')
  group by sp.session_id, sp.id, sp.role
),
session_summary as (
  select
    s.id,
    s.student_nim,
    s.student_name,
    s.semester,
    s.academic_year,
    count(esc.*) as total_examiners,
    count(esc.*) filter (where esc.is_complete) as examiners_complete,
    jsonb_agg(jsonb_build_object(
      'role', esc.role,
      'filled', esc.filled_scores,
      'complete', esc.is_complete
    ) order by esc.role) as examiner_details
  from public.s2_sessions s
  left join examiner_score_counts esc on esc.session_id = s.id
  where s.exam_type = 'proposal'
  group by s.id, s.student_nim, s.student_name, s.semester, s.academic_year
)
select
  student_nim,
  student_name,
  semester,
  academic_year,
  total_examiners,
  examiners_complete,
  case
    when total_examiners = 0 then 'Belum ada penguji'
    when examiners_complete = 0 then 'Belum ada nilai'
    when examiners_complete < total_examiners then 'Sebagian (' || examiners_complete || '/' || total_examiners || ')'
    when examiners_complete = total_examiners then 'LENGKAP ✓'
  end as status_nilai,
  examiner_details
from session_summary
order by
  case
    when examiners_complete = total_examiners and total_examiners > 0 then 1
    when examiners_complete > 0 then 2
    else 3
  end,
  student_nim;
