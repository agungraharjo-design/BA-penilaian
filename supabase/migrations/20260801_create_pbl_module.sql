-- ============================================================
-- PBL 1 KESMAS MODULE - Additive Migration
-- Pengalaman Belajar Lapangan 1 — RPS-Final Aligned Assessment
-- Mirrors the S2 module patterns (tables, RLS, realtime, triggers)
-- ============================================================

-- Enable UUID & pgcrypto
create extension if not exists pgcrypto;

-- ============================================================
-- 1. PBL_GROUPS - Main workspace aggregate (sessions)
-- ============================================================
create table if not exists public.pbl_groups (
  id uuid primary key default gen_random_uuid(),

  code text not null default '',
  name text not null default '',
  field_location text not null default '',

  semester text not null default '',
  academic_year text not null default '',

  status text not null default 'draft'
    check (status in ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled')),

  hari_tanggal text not null default '',
  tanggal_ba text not null default '',
  start_time text not null default '',
  end_time text not null default '',
  venue text not null default '',
  title text not null default '',
  minutes text not null default '',

  decision text not null default '',
  report_notes text not null default '',

  koordinator text not null default '',
  nip_koordinator text not null default '',
  koordinator_signature_path text,

  blueprint_version text not null default 'pbl1-rps-v1',

  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pbl_groups_status_idx on public.pbl_groups(status);
create index if not exists pbl_groups_academic_year_idx on public.pbl_groups(academic_year);
create index if not exists pbl_groups_created_at_idx on public.pbl_groups(created_at);

-- ============================================================
-- 2. PBL_GROUP_MEMBERS - Students in a PBL group
-- ============================================================
create table if not exists public.pbl_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.pbl_groups(id) on delete cascade,
  student_id uuid references auth.users(id),
  nim text not null default '',
  name text not null,
  role text not null default 'member'
    check (role in ('member', 'leader')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (group_id, nim)
);

create index if not exists pbl_group_members_group_idx on public.pbl_group_members(group_id);
create index if not exists pbl_group_members_nim_idx on public.pbl_group_members(nim);

-- ============================================================
-- 3. PBL_ASSESSORS - Supervisors & examiners assigned to group
-- ============================================================
create table if not exists public.pbl_assessors (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.pbl_groups(id) on delete cascade,
  assessor_role text not null
    check (assessor_role in (
      'pembimbing_1',
      'pembimbing_2',
      'penguji_1',
      'penguji_2',
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

  unique (group_id, assessor_role)
);

create index if not exists pbl_assessors_group_idx on public.pbl_assessors(group_id);
create index if not exists pbl_assessors_user_idx on public.pbl_assessors(user_id);

-- ============================================================
-- 4. PBL_ASSESSMENT_COMPONENTS - RPS blueprint (frozen weights)
-- ============================================================
create table if not exists public.pbl_assessment_components (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  rps_weight numeric(6,5) not null,
  cpmk_code text not null check (cpmk_code in ('CPMK1', 'CPMK2')),
  default_scope text not null check (default_scope in ('INDIVIDUAL', 'GROUP')),
  assessor_role text,
  active boolean not null default true,
  locked boolean not null default true,
  display_order int not null default 0
);

insert into public.pbl_assessment_components (code, name, rps_weight, cpmk_code, default_scope, assessor_role, display_order)
values
  ('I1', 'Laporan Keluarga Binaan', 0.15000, 'CPMK1', 'INDIVIDUAL', NULL, 1),
  ('I2', 'Laporan Kasus Binaan', 0.25000, 'CPMK2', 'INDIVIDUAL', NULL, 2),
  ('P1', 'Penilaian sesama mahasiswa', 0.10000, 'CPMK2', 'INDIVIDUAL', NULL, 3),
  ('B1', 'Kegiatan Pelaksanaan (Penguji 2)', 0.17500, 'CPMK1', 'GROUP', 'PENGUJI', 4),
  ('B2', 'Presentasi Kelompok (Penguji 2)', 0.17500, 'CPMK1', 'GROUP', 'PENGUJI', 5),
  ('E1', 'Kegiatan Pelaksanaan (Penguji 1)', 0.07500, 'CPMK2', 'GROUP', 'PENGUJI', 6),
  ('E2', 'Presentasi Kelompok (Penguji 1)', 0.07500, 'CPMK2', 'GROUP', 'PENGUJI', 7)
on conflict (code) do update set
  name = excluded.name,
  rps_weight = excluded.rps_weight,
  cpmk_code = excluded.cpmk_code,
  default_scope = excluded.default_scope,
  assessor_role = excluded.assessor_role,
  display_order = excluded.display_order;

-- ============================================================
-- 5. PBL_RUBRIC_CRITERIA - Internal rubric criteria per component
-- ============================================================
create table if not exists public.pbl_rubric_criteria (
  id uuid primary key default gen_random_uuid(),
  component_code text not null references public.pbl_assessment_components(code) on delete cascade,
  code text not null,
  name text not null,
  evidence_guidance text null,
  internal_weight numeric(6,5) not null default 1,
  criterion_order int not null default 0,
  critical_for_reconciliation boolean not null default false,
  active boolean not null default true,
  unique (component_code, code)
);

insert into public.pbl_rubric_criteria (component_code, code, name, evidence_guidance, internal_weight, criterion_order)
values
  -- E1 Penguji kegiatan pelaksanaan 7.5%
  ('E1', 'E1-C1', 'Evidence & analisis situasi', 'Evaluasi kualitas dan ketelusuran analisis situasi: pengumpulan, pengolahan, penyajian data.', 0.30, 1),
  ('E1', 'E1-C2', 'Reasoning masalah/prioritas', 'Evaluasi kesesuaian prioritas/rencana dengan bukti dan alur penalaran.', 0.25, 2),
  ('E1', 'E1-C3', 'Koherensi intervensi & feasibility', 'Evaluasi koherensi intervensi dengan masalah dan kelayakan pelaksanaannya.', 0.25, 3),
  ('E1', 'E1-C4', 'Budaya, equity & etika', 'Evaluasi pertimbangan budaya, kesetaraan, etika, dan akuntabilitas stakeholder.', 0.20, 4),
  -- E2 Penguji presentasi 7.5%
  ('E2', 'E2-C1', 'Penguasaan & diskusi', 'Evaluasi penguasaan materi saat penyajian dan tanggapan dalam diskusi.', 0.40, 1),
  ('E2', 'E2-C2', 'Narasi evidence-to-action', 'Evaluasi kemampuan menyusun narasi dari bukti menuju aksi/intervensi.', 0.25, 2),
  ('E2', 'E2-C3', 'Media/visualisasi', 'Evaluasi kualitas media dan visualisasi pendukung presentasi.', 0.15, 3),
  ('E2', 'E2-C4', 'Refleksi kritis', 'Evaluasi refleksi kritis terhadap proses dan hasil kegiatan.', 0.10, 4),
  ('E2', 'E2-C5', 'Komunikasi profesional', 'Evaluasi cara berkomunikasi secara profesional kepada audiens.', 0.10, 5),
  -- B1 Pembimbing kegiatan pelaksanaan (laporan) 17.5%
  ('B1', 'B1-C1', 'Kedisiplinan/kehadiran', 'Evaluasi disiplin dan kehadiran pada kegiatan lapangan.', 0.20, 1),
  ('B1', 'B1-C2', 'Logbook & evidence trail', 'Evaluasi kelengkapan logbook dan jejak bukti kegiatan.', 0.30, 2),
  ('B1', 'B1-C3', 'Keaktifan/kontribusi lapangan', 'Evaluasi keaktifan dan kontribusi dalam kegiatan lapangan.', 0.30, 3),
  ('B1', 'B1-C4', 'Etika & komunikasi stakeholder', 'Evaluasi etika dan komunikasi dengan pemangku kepentingan.', 0.20, 4),
  -- B2 Pembimbing presentasi 17.5%
  ('B2', 'B2-C1', 'Penguasaan materi (penyajian & diskusi)', 'Evaluasi penguasaan materi dalam penyajian dan diskusi.', 0.50, 1),
  ('B2', 'B2-C2', 'Media/alat bantu', 'Evaluasi penggunaan media dan alat bantu presentasi.', 0.20, 2),
  ('B2', 'B2-C3', 'Tampilan/struktur presentasi', 'Evaluasi tampilan dan struktur presentasi.', 0.20, 3),
  ('B2', 'B2-C4', 'Gesture/delivery profesional', 'Evaluasi sikap dan penyampaian (delivery) profesional.', 0.10, 4),
  -- I1 Laporan Keluarga Binaan 15%
  ('I1', 'I1-C1', 'Rancangan & relevansi data primer', 'Evaluasi rancangan dan relevansi pengumpulan data primer.', 0.25, 1),
  ('I1', 'I1-C2', 'Pelaksanaan sistematis, etis, aman', 'Evaluasi pelaksanaan pengumpulan data yang sistematis, etis, dan aman.', 0.25, 2),
  ('I1', 'I1-C3', 'Kualitas data & keterbatasan', 'Evaluasi kualitas data dan pengakuan keterbatasan.', 0.25, 3),
  ('I1', 'I1-C4', 'Ketelusuran laporan', 'Evaluasi keterlacakan (traceability) laporan.', 0.25, 4),
  -- I2 Laporan Kasus Binaan 25%
  ('I2', 'I2-C1', 'Diagnosis masalah berbasis bukti', 'Evaluasi diagnosis masalah yang didukung oleh bukti.', 0.20, 1),
  ('I2', 'I2-C2', 'Prioritas & reasoning', 'Evaluasi penentuan prioritas beserta alasan/logikanya.', 0.20, 2),
  ('I2', 'I2-C3', 'Intervensi: tujuan, metode, indikator', 'Evaluasi kesesuaian tujuan, metode, dan indikator intervensi.', 0.20, 3),
  ('I2', 'I2-C4', 'Budaya, aspirasi & equity', 'Evaluasi perhatian pada budaya, aspirasi masyarakat, dan kesetaraan.', 0.20, 4),
  ('I2', 'I2-C5', 'Analisis, simpulan & feasibility', 'Evaluasi analisis, kesimpulan, dan kelayakan intervensi.', 0.20, 5),
  ('P1', 'P1-C1', 'Final peer score (verified aggregate)', 'Skor akhir hasil verifikasi penilaian antar mahasiswa.', 1.00000, 1)
on conflict (component_code, code) do nothing;

-- ============================================================
-- 5b. PBL_RUBRIC_DESCRIPTORS - Level 0-4 descriptor per criterion
-- ============================================================
create table if not exists public.pbl_rubric_descriptors (
  id uuid primary key default gen_random_uuid(),
  criterion_id uuid not null references public.pbl_rubric_criteria(id) on delete cascade,
  level_value smallint not null check (level_value between 0 and 4),
  level_label text not null,
  descriptor_text text not null,
  scoring_note text null,
  display_order int not null default 0,
  unique (criterion_id, level_value)
);

-- Seed descriptors for every active criterion × level 0-4
do $$
declare
  c record;
  lbl text;
  txt text;
begin
  for c in select c2.id, c2.name, c2.code from public.pbl_rubric_criteria c2 where c2.active loop
    for i in 0..4 loop
      lbl := case i
        when 4 then 'Melampaui Standar'
        when 3 then 'Memenuhi Standar'
        when 2 then 'Mendekati Standar'
        when 1 then 'Belum Memenuhi Standar'
        else 'Tidak Ada Bukti'
      end;
      txt := case i
        when 4 then 'Bukti lengkap dan konsisten; performa secara substansial melampaui harapan untuk aspek: ' || c.name || '.'
        when 3 then 'Bukti relevan dan memadai; memenuhi standar yang diharapkan untuk aspek: ' || c.name || '.'
        when 2 then 'Terdapat bukti, namun masih terdapat kesenjangan penting pada aspek: ' || c.name || '.'
        when 1 then 'Bukti belum memadai; kekurangan besar pada aspek: ' || c.name || '.'
        else 'Tidak ada bukti yang dapat dinilai untuk aspek: ' || c.name || '.'
      end;
      insert into public.pbl_rubric_descriptors (criterion_id, level_value, level_label, descriptor_text, display_order)
      values (c.id, i, lbl, txt, i)
      on conflict (criterion_id, level_value) do nothing;
    end loop;
  end loop;
end $$;

-- ============================================================
-- 6. PBL_RUBRIC_PERFORMANCE_LEVELS - 0-4 descriptor levels
-- ============================================================
create table if not exists public.pbl_rubric_performance_levels (
  id uuid primary key default gen_random_uuid(),
  level_value smallint not null check (level_value between 0 and 4),
  label text not null,
  descriptor text not null,
  display_order int not null default 0,

  unique (level_value)
);

-- Guard: ensure the unique constraint exists even if the table was created before it was added
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pbl_rubric_performance_levels'::regclass
      and contype = 'u'
      and conname = 'pbl_rubric_performance_levels_level_value_key'
  ) then
    alter table public.pbl_rubric_performance_levels
      add constraint pbl_rubric_performance_levels_level_value_key unique (level_value);
  end if;
end $$;

insert into public.pbl_rubric_performance_levels (level_value, label, descriptor, display_order)
values
  (4, 'Melampaui Standar', 'Substantively exceeds expected performance.', 4),
  (3, 'Memenuhi Standar', 'Target/proficient performance.', 3),
  (2, 'Mendekati Standar', 'Relevant evidence exists, but important gaps remain.', 2),
  (1, 'Belum Memenuhi Standar', 'Major deficiencies remain.', 1),
  (0, 'Tidak Ada Bukti', 'No assessable evidence.', 0)
on conflict (level_value) do nothing;

-- ============================================================
-- 7. PBL_ASSESSMENT_INSTANCES - One form per group+component+assessor
-- ============================================================
create table if not exists public.pbl_assessment_instances (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.pbl_groups(id) on delete cascade,
  component_code text not null references public.pbl_assessment_components(code) on delete cascade,
  rubric_version text not null default 'pbl1-rps-v1',
  assessor_role text null,
  assessor_user_id uuid references auth.users(id),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'READY_FOR_REVIEW', 'FINALIZED', 'UNLOCKED_FOR_REVISION', 'REVISED')),
  finalized_at timestamptz null,
  finalized_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (group_id, component_code, assessor_role)
);

create index if not exists pbl_assessment_instances_group_idx on public.pbl_assessment_instances(group_id);
create index if not exists pbl_assessment_instances_component_idx on public.pbl_assessment_instances(component_code);

-- ============================================================
-- 8. PBL_ASSESSMENT_SCORES - one row per instance+student(optional)
--     calculated/final raw score 0-100 (NULL = missing, NOT zero)
-- ============================================================
create table if not exists public.pbl_assessment_scores (
  id uuid primary key default gen_random_uuid(),
  instance_id uuid not null references public.pbl_assessment_instances(id) on delete cascade,
  student_id uuid references public.pbl_group_members(id),
  calculated_raw_score numeric(5,2)
    check (calculated_raw_score is null or (calculated_raw_score >= 0 and calculated_raw_score <= 100)),
  final_raw_score numeric(5,2)
    check (final_raw_score is null or (final_raw_score >= 0 and final_raw_score <= 100)),
  score_source text not null default 'RUBRIC_CALCULATED'
    check (score_source in ('RUBRIC_CALCULATED', 'MANUAL', 'IMPORTED', 'OVERRIDE')),
  override_reason text null,
  evidence_summary text null,
  entered_by uuid references auth.users(id),
  entered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists pbl_assessment_scores_instance_idx on public.pbl_assessment_scores(instance_id);

-- ============================================================
-- 9. PBL_RUBRIC_RATINGS - level per criterion (drives raw_score)
-- ============================================================
create table if not exists public.pbl_rubric_ratings (
  id uuid primary key default gen_random_uuid(),
  assessment_score_id uuid not null references public.pbl_assessment_scores(id) on delete cascade,
  criterion_id uuid not null references public.pbl_rubric_criteria(id),
  level_value smallint not null check (level_value between 0 and 4),
  criterion_points numeric(6,2) null,
  evidence_note text null,
  selected_descriptor_snapshot text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (assessment_score_id, criterion_id)
);

create index if not exists pbl_rubric_ratings_score_idx on public.pbl_rubric_ratings(assessment_score_id);

-- ============================================================
-- 10. PBL_PEER_FINAL_SCORES - lecturer-entered verified peer 0-100
-- ============================================================
create table if not exists public.pbl_peer_final_scores (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.pbl_groups(id) on delete cascade,
  student_id uuid not null references public.pbl_group_members(id),
  final_peer_score numeric(5,2) not null check (final_peer_score between 0 and 100),
  source_method text not null default 'MANUAL'
    check (source_method in ('GOOGLE_FORM_RANKING', 'GOOGLE_FORM_RUBRIC', 'MANUAL', 'OTHER')),
  respondent_count int not null default 0 check (respondent_count >= 0),
  expected_respondent_count int null,
  aggregation_method text not null default '',
  source_reference text null,
  entered_by uuid references auth.users(id),
  entered_at timestamptz not null default now(),
  verified_by uuid references auth.users(id),
  verified_at timestamptz null,
  verification_note text null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'FINALIZED')),
  updated_at timestamptz not null default now(),

  unique (group_id, student_id)
);

create index if not exists pbl_peer_final_scores_group_idx on public.pbl_peer_final_scores(group_id);

-- ============================================================
-- 11. PBL_AUDIT_LOGS
-- ============================================================
create table if not exists public.pbl_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  old_value_json jsonb null,
  new_value_json jsonb null,
  reason text null,
  created_at timestamptz not null default now(),
  ip_address varchar null,
  user_agent text null
);

create index if not exists pbl_audit_logs_entity_idx on public.pbl_audit_logs(entity_type, entity_id, created_at);

-- ============================================================
-- 12. UPDATED_AT TRIGGERS
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

drop trigger if exists update_pbl_groups_updated_at on public.pbl_groups;
create trigger update_pbl_groups_updated_at
  before update on public.pbl_groups
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_pbl_group_members_updated_at on public.pbl_group_members;
create trigger update_pbl_group_members_updated_at
  before update on public.pbl_group_members
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_pbl_assessors_updated_at on public.pbl_assessors;
create trigger update_pbl_assessors_updated_at
  before update on public.pbl_assessors
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_pbl_assessment_instances_updated_at on public.pbl_assessment_instances;
create trigger update_pbl_assessment_instances_updated_at
  before update on public.pbl_assessment_instances
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_pbl_assessment_scores_updated_at on public.pbl_assessment_scores;
create trigger update_pbl_assessment_scores_updated_at
  before update on public.pbl_assessment_scores
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_pbl_rubric_ratings_updated_at on public.pbl_rubric_ratings;
create trigger update_pbl_rubric_ratings_updated_at
  before update on public.pbl_rubric_ratings
  for each row execute function public.update_updated_at_column();

drop trigger if exists update_pbl_peer_final_scores_updated_at on public.pbl_peer_final_scores;
create trigger update_pbl_peer_final_scores_updated_at
  before update on public.pbl_peer_final_scores
  for each row execute function public.update_updated_at_column();

-- ============================================================
-- 13. ROW LEVEL SECURITY
-- ============================================================

alter table public.pbl_groups enable row level security;
alter table public.pbl_group_members enable row level security;
alter table public.pbl_assessors enable row level security;
alter table public.pbl_assessment_instances enable row level security;
alter table public.pbl_assessment_scores enable row level security;
alter table public.pbl_rubric_ratings enable row level security;
alter table public.pbl_rubric_descriptors enable row level security;
alter table public.pbl_peer_final_scores enable row level security;
alter table public.pbl_audit_logs enable row level security;

-- Helper: access check (admin/coordinator/superadmin OR assigned assessor)
create or replace function public.can_access_pbl_group(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('superadmin', 'koordinator', 'admin')
    )
    or exists (
      select 1 from public.pbl_assessors a
      where a.group_id = target_group_id and a.user_id = auth.uid()
    );
$$;

-- PBL_GROUPS
create policy "Admin roles can view all PBL groups"
  on public.pbl_groups for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('superadmin', 'koordinator', 'admin')
    )
  );

create policy "Assigned assessors can view their PBL groups"
  on public.pbl_groups for select
  using (
    exists (
      select 1 from public.pbl_assessors a
      where a.group_id = pbl_groups.id and a.user_id = auth.uid()
    )
  );

create policy "Public roles can create PBL groups"
  on public.pbl_groups for insert
  with check (true);

create policy "Assigned/admin can update PBL groups"
  on public.pbl_groups for update
  using (public.can_access_pbl_group(id));

create policy "Admin can delete PBL groups"
  on public.pbl_groups for delete
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('superadmin', 'koordinator', 'admin')
    )
  );

-- PBL_GROUP_MEMBERS
create policy "Assigned/admin can view group members"
  on public.pbl_group_members for select
  using (public.can_access_pbl_group(group_id));

create policy "Assigned/admin can create group members"
  on public.pbl_group_members for insert
  with check (public.can_access_pbl_group(group_id));

create policy "Assigned/admin can update group members"
  on public.pbl_group_members for update
  using (public.can_access_pbl_group(group_id));

create policy "Assigned/admin can delete group members"
  on public.pbl_group_members for delete
  using (public.can_access_pbl_group(group_id));

-- PBL_ASSESSORS
create policy "Assigned/admin can view assessors"
  on public.pbl_assessors for select
  using (public.can_access_pbl_group(group_id) or user_id = auth.uid());

create policy "Assigned/admin can create assessors"
  on public.pbl_assessors for insert
  with check (public.can_access_pbl_group(group_id));

create policy "Assigned/admin can update assessors"
  on public.pbl_assessors for update
  using (public.can_access_pbl_group(group_id));

create policy "Assigned/admin can delete assessors"
  on public.pbl_assessors for delete
  using (public.can_access_pbl_group(group_id));

-- PBL_ASSESSMENT_INSTANCES
create policy "Assigned/admin can manage instances"
  on public.pbl_assessment_instances for all
  using (public.can_access_pbl_group(group_id));

-- PBL_ASSESSMENT_SCORES
create policy "Assigned/admin can view rubric descriptors"
  on public.pbl_rubric_descriptors for select
  using (true);

-- PBL_ASSESSMENT_SCORES
create policy "Assigned/admin can manage scores"
  on public.pbl_assessment_scores for all
  using (
    exists (
      select 1 from public.pbl_assessment_instances i
      where i.id = pbl_assessment_scores.instance_id
        and public.can_access_pbl_group(i.group_id)
    )
  );

-- PBL_RUBRIC_RATINGS
create policy "Assigned/admin can manage ratings"
  on public.pbl_rubric_ratings for all
  using (
    exists (
      select 1 from public.pbl_assessment_scores s
      join public.pbl_assessment_instances i on i.id = s.instance_id
      where s.id = pbl_rubric_ratings.assessment_score_id
        and public.can_access_pbl_group(i.group_id)
    )
  );

-- PBL_PEER_FINAL_SCORES
create policy "Assigned/admin can manage peer scores"
  on public.pbl_peer_final_scores for all
  using (public.can_access_pbl_group(group_id));

-- PBL_AUDIT_LOGS
create policy "Admin can view audit logs"
  on public.pbl_audit_logs for select
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('superadmin', 'koordinator', 'admin')
    )
  );

create policy "Authorized insert audit logs"
  on public.pbl_audit_logs for insert
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role in ('superadmin', 'koordinator', 'admin')
    )
  );

-- ============================================================
-- 14. REALTIME PUBLICATION
-- ============================================================
alter publication supabase_realtime add table public.pbl_groups;
alter publication supabase_realtime add table public.pbl_group_members;
alter publication supabase_realtime add table public.pbl_assessors;
alter publication supabase_realtime add table public.pbl_assessment_instances;
alter publication supabase_realtime add table public.pbl_assessment_scores;
alter publication supabase_realtime add table public.pbl_rubric_ratings;
alter publication supabase_realtime add table public.pbl_rubric_descriptors;
alter publication supabase_realtime add table public.pbl_peer_final_scores;

-- ============================================================
-- 15. GRANT PERMISSIONS
-- ============================================================
grant select on public.pbl_groups, public.pbl_group_members, public.pbl_assessors,
  public.pbl_assessment_components, public.pbl_rubric_criteria,
  public.pbl_rubric_performance_levels, public.pbl_rubric_descriptors,
  public.pbl_assessment_instances, public.pbl_assessment_scores, public.pbl_rubric_ratings,
  public.pbl_peer_final_scores, public.pbl_audit_logs to anon, authenticated;

grant insert, update, delete on public.pbl_groups, public.pbl_group_members,
  public.pbl_assessors, public.pbl_assessment_instances,
  public.pbl_assessment_scores, public.pbl_rubric_ratings,
  public.pbl_peer_final_scores, public.pbl_audit_logs to authenticated;