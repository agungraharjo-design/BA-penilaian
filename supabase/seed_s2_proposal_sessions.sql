-- ============================================================
-- S2 KESMAS - Seed 19 Proposal Tesis sessions + examiners
-- Run in Supabase SQL Editor (new project rvfyljuuchmuynbkqczp)
-- Excludes Putri Kurniawati. New dosen get auth users.
-- ============================================================

-- ============================================================
-- INSERT 19 sessions + 76 examiners in a single statement
-- ============================================================
with seed (nim, sname, k1, n1, a1, na1, a2, na2, a3, na3) as (
  values
  ('2410722008', 'Agus Sya''roni Nashir', 'Dr. Laily Hanifah, SKM., M.Kes.', '197410202025212000', 'Dr. Lusyta Puri Ardhiyanti, Amd.Keb., S.St., M.Kes.', '198801092022032000', 'Dr. Chandrayani Simanjorang, S.K.M., M.Epid.', '198510192014042000', 'Dr. Lusyta Puri Ardhiyanti, Amd.Keb., S.St., M.Kes.', '198801092022032000'),
  ('2510722002', 'Mifthah Muliani Lubis', 'Dr .Apriningsih, S.K.M.,M.K.M', '197604102021212000', 'Dr. Lusyta Puri Ardhiyanti, Amd.Keb., S.St., M.Kes.', '198801092022032000', 'Dr. Ns. Dyah Utari, S.Kep., M.K.K.K', '198304152009012000', 'Dr. Yunita Amraeni, S.K.M., M.Kes.', '198508192024062000'),
  ('2510722003', 'Asto Ginawang', 'Dr. Yunita Amraeni, S.K.M., M.Kes.', '198508192024062000', 'Dr. Fajaria Nurchandra, S.K.M.,M.Epid', '199204102024062000', 'Dr. Chandrayani Simanjorang, S.K.M., M.Epid.', '198510192014042000', 'Dr. Fathinah Ranggauni Hardy, SKM.M.Epid', '199201272025212000'),
  ('2510722004', 'Tri Wulandari', 'Dr .Apriningsih, S.K.M.,M.K.M', '197604102021212000', 'apt. Riswandy Wasir, S.Farm., MPH., PhD', '198801122022031000', 'Dr. Fajaria Nurchandra, S.K.M.,M.Epid', '199204102024062000', 'Dr. Hj., BD. Een Kurnaesih, S.K.M., M.Kes.', '196610031986032000'),
  ('2510722005', 'Denny Wulandari', 'Dr. Chandrayani Simanjorang, S.K.M., M.Epid.', '198510192014042000', 'Dr. Putri Permatasari, S.K.M,.M.K.M', '199007082025212000', 'Prof. Dr. Acim Heri Iswanto, SKM. MARS', '197707062025211000', 'Dr. Hj., BD. Een Kurnaesih, S.K.M., M.Kes.', '196610031986032000'),
  ('2510722006', 'Fatima Tudzahro', 'Dr. Firlia Ayu Arini, S.K.M.,M.K.M', '198501022021212004', 'apt. Riswandy Wasir, S.Farm., MPH., PhD', '198801122022031000', 'Dr. Nur Intania Sofianita, S.I.Kom, MKM', '198410202021212005', 'Dr .Apriningsih, S.K.M.,M.K.M', '197604102021212000'),
  ('2510722007', 'Shzalfa Azzahra', 'Dr. Hj., BD. Een Kurnaesih, S.K.M., M.Kes.', '196610031986032000', 'Dr. Yunita Amraeni, S.K.M., M.Kes.', '198508192024062000', 'Dr. Fajaria Nurchandra, S.K.M.,M.Epid', '199204102024062000', 'Dr. Ns. Dyah Utari, S.Kep., M.K.K.K', '198304152009012000'),
  ('2510722008', 'Regia Puspa Astari', 'Dr. Hj., BD. Een Kurnaesih, S.K.M., M.Kes.', '196610031986032000', 'Dr. Firlia Ayu Arini, S.K.M.,M.K.M', '198501022021212004', 'Dr. dr. Yessi Crosita Octaria, M.I.H., MIH', '198010182025212020', 'IV Dr.Laily Hanifah, S.K.M.,M.Kes', '197410202025212000'),
  ('2510722009', 'Nurul Aini', 'Dr .Apriningsih, S.K.M.,M.K.M', '197604102021212000', 'Dr. Putri Permatasari, S.K.M,.M.K.M', '199007082025212000', 'Prof. Dr. Acim Heri Iswanto, SKM. MARS', '197707062025211000', 'apt. Riswandy Wasir, S.Farm., MPH., PhD', '198801122022031000'),
  ('2510722010', 'Jazzy Dwi Arimurti', 'Dr. Chandrayani Simanjorang, S.K.M., M.Epid.', '198510192014042000', 'Dr. Fajaria Nurchandra, S.K.M.,M.Epid', '199204102024062000', 'Dr. Yunita Amraeni, S.K.M., M.Kes.', '198508192024062000', 'Dr. Laily Hanifah, SKM., M.Kes.', '197410202025212000'),
  ('2510722011', 'Khoirunnisa Ghefira Yusrani', 'Dr. Chandrayani Simanjorang, S.K.M., M.Epid.', '198510192014042000', 'apt. Riswandy Wasir, S.Farm., MPH., PhD', '198801122022031000', 'Dr. Putri Permatasari, S.K.M,.M.K.M', '199007082025212000', 'Prof. Dr. Acim Heri Iswanto, SKM. MARS', '197707062025211000'),
  ('2510722012', 'Fathiyah Aulia Mumtaz', 'Dr. Laily Hanifah, SKM., M.Kes.', '197410202025212000', 'Dr. Fathinah Ranggauni Hardy, SKM.M.Epid', '199201272025212000', 'Dr. Ns. Dyah Utari, S.Kep., M.K.K.K', '198304152009012000', 'IV Dr. Lusyta Puri Ardhiyanti, Amd.Keb., S.St., M.Kes.', '198801092022032000'),
  ('2510722013', 'Dona Putri Ariningrum', 'Dr. Hj., BD. Een Kurnaesih, S.K.M., M.Kes.', '196610031986032000', 'Dr. Chandrayani Simanjorang, S.K.M., M.Epid.', '198510192014042000', 'Dr. Yunita Amraeni, S.K.M., M.Kes.', '198508192024062000', 'Dr. Lusyta Puri Ardhiyanti, Amd.Keb., S.St., M.Kes.', '198801092022032000'),
  ('2510722014', 'Ammy Fahmy Myala', 'Prof. Dr. Acim Heri Iswanto, SKM. MARS', '197707062025211000', 'Dr. Yunita Amraeni, S.K.M., M.Kes.', '198508192024062000', 'Dr. Laily Hanifah, SKM., M.Kes.', '197410202025212000', 'Dr.Apriningsih, S.K.M.,M.K.M', '197604102021212000'),
  ('2510722015', 'Astri Maretta', 'Dr. Fathinah Ranggauni Hardy, SKM.M.Epid', '199201272025212000', 'Dr. Putri Permatasari, S.K.M,.M.K.M', '199007082025212000', 'Dr. Suparni, S.ST., M.K.K.K.', '197705072024212000', 'Prof. Dr. Acim Heri Iswanto, SKM. MARS', '197707062025211000'),
  ('2510722016', 'Hasri Ahsanti', 'Dr. Agus Joko  Susanto, S.K.M.,M.K.K.K', '197008251999031000', 'Dr. Suparni, S.ST., M.K.K.K.', '197705072024212000', 'Dr. Ns. Dyah Utari, S.Kep., M.K.K.K', '198304152009012000', 'Dr. Januar Ariyanto, S.K.M.,M.Kes', '199001082024061000'),
  ('2510722017', 'Brahma Deva Joyo Nusantara', 'Dr. Ns. Dyah Utari, S.Kep., M.K.K.K', '198304152009012000', 'Dr. Januar Ariyanto, S.K.M.,M.Kes', '199001082024061000', 'Dr.Suparni, S.ST., M.K.K.K.', '197705072024212000', 'Dr. Agus Joko  Susanto, S.K.M.,M.K.K.K', '197008251999031000'),
  ('2510722018', 'Nelsi Merella', 'Prof. Dr. Ir. Netti Herawati, M.Si.', '196501011990102001', 'Dr. Nur Intania Sofianita, S.I.Kom, MKM', '198410202021212005', 'Dr.Apriningsih, S.K.M.,M.K.M', '197604102021212000', 'apt. Riswandy Wasir, S.Farm., MPH., PhD', '198801122022031000'),
  ('2510722019', 'Adelia Putri Mahardhika', 'Dr. Ns. Dyah Utari, S.Kep., M.K.K.K', '198304152009012000', 'Dr. Januar Ariyanto, S.K.M.,M.Kes', '199001082024061000', 'Dr. Agus Joko  Susanto, S.K.M.,M.K.K.K', '197008251999031000', 'Dr. Suparni, S.ST., M.K.K.K.', '197705072024212000')
),
ins_sessions as (
  insert into public.s2_sessions (
    exam_type, status, student_name, student_nim, thesis_title,
    study_program, degree_program, semester, academic_year,
    venue, rubric_version, created_at
  )
  select 'proposal', 'scheduled', sname, nim,
    'Penelitian ' || split_part(sname, ' ', 1),
    'Kesehatan Masyarakat', 'Program Magister',
    'Genap', '2025/2026', 'Ruang Sidang FIK', 'proposal-v1', now()
  from seed
  returning id, student_nim
),
link as (
  select s.id as sid, s.student_nim as nim from ins_sessions s
)
insert into public.s2_session_people (session_id, role, display_name, nip, email, sequence_no)
select l.sid, v.role, v.disp, v.nip, '', v.seq
from link l
join seed z on z.nim = l.nim
cross join lateral (values
  ('ketua_penguji', z.k1, z.n1, 1),
  ('anggota_penguji_1', z.a1, z.na1, 2),
  ('anggota_penguji_2', z.a2, z.na2, 3),
  ('anggota_penguji_3', z.a3, z.na3, 4)
) as v(role, disp, nip, seq)
where v.disp <> '';

-- ============================================================
-- CREATE AUTH USERS for 4 NEW S2 dosen (password: S2kesmas)
-- Existing auth users are NOT modified.
-- ============================================================
-- Dr. Firlia Ayu Arini, S.K.M.,M.K.M <firliaayuarini@upnvj.ac.id>
do $$
declare
  new_uid uuid;
begin
  if not exists (select 1 from auth.users where email = 'firliaayuarini@upnvj.ac.id') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(), 'authenticated', 'authenticated',
      'firliaayuarini@upnvj.ac.id', crypt('S2kesmas', gen_salt('bf')),
      now(),
      '{"full_name": "Dr. Firlia Ayu Arini, S.K.M.,M.K.M", "role": "dosen"}'::jsonb,
      now(), now()
    ) returning id into new_uid;
    -- profile auto-created by trigger; set role to dosen
    update public.profiles set role = 'dosen', full_name = 'Dr. Firlia Ayu Arini, S.K.M.,M.K.M' where id = new_uid;
  end if;
end $$;
-- Dr. Nur Intania Sofianita, S.I.Kom, MKM <intania@upnvj.ac.id>
do $$
declare
  new_uid uuid;
begin
  if not exists (select 1 from auth.users where email = 'intania@upnvj.ac.id') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(), 'authenticated', 'authenticated',
      'intania@upnvj.ac.id', crypt('S2kesmas', gen_salt('bf')),
      now(),
      '{"full_name": "Dr. Nur Intania Sofianita, S.I.Kom, MKM", "role": "dosen"}'::jsonb,
      now(), now()
    ) returning id into new_uid;
    -- profile auto-created by trigger; set role to dosen
    update public.profiles set role = 'dosen', full_name = 'Dr. Nur Intania Sofianita, S.I.Kom, MKM' where id = new_uid;
  end if;
end $$;
-- Dr. dr. Yessi Crosita Octaria, M.I.H., MIH <yessi@upnvj.ac.id>
do $$
declare
  new_uid uuid;
begin
  if not exists (select 1 from auth.users where email = 'yessi@upnvj.ac.id') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(), 'authenticated', 'authenticated',
      'yessi@upnvj.ac.id', crypt('S2kesmas', gen_salt('bf')),
      now(),
      '{"full_name": "Dr. dr. Yessi Crosita Octaria, M.I.H., MIH", "role": "dosen"}'::jsonb,
      now(), now()
    ) returning id into new_uid;
    -- profile auto-created by trigger; set role to dosen
    update public.profiles set role = 'dosen', full_name = 'Dr. dr. Yessi Crosita Octaria, M.I.H., MIH' where id = new_uid;
  end if;
end $$;
-- Prof. Dr. Ir. Netti Herawati, M.Si. <netti.herawati@upnvj.ac.id>
do $$
declare
  new_uid uuid;
begin
  if not exists (select 1 from auth.users where email = 'netti.herawati@upnvj.ac.id') then
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_user_meta_data, created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000',
      gen_random_uuid(), 'authenticated', 'authenticated',
      'netti.herawati@upnvj.ac.id', crypt('S2kesmas', gen_salt('bf')),
      now(),
      '{"full_name": "Prof. Dr. Ir. Netti Herawati, M.Si.", "role": "dosen"}'::jsonb,
      now(), now()
    ) returning id into new_uid;
    -- profile auto-created by trigger; set role to dosen
    update public.profiles set role = 'dosen', full_name = 'Prof. Dr. Ir. Netti Herawati, M.Si.' where id = new_uid;
  end if;
 end $$;

-- VERIFY
select s.student_nim, s.student_name, p.role, p.display_name, p.nip
from public.s2_sessions s join public.s2_session_people p on p.session_id = s.id
order by s.student_nim, p.sequence_no;
