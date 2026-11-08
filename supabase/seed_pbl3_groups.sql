-- ============================================================
-- PBL 3 GROUPS SEED — 14 kelompok dari "Keputusan Rektor tentang Dosen
-- Penguji Praktik Belajar Lapangan 3 ... Semester Ganjil TA 2026/2027"
-- (sumber: tanggal KEPUTUSAN PENGUJI PRAKTEK PBL3.docx, lampiran).
--
-- ADDITIVE ONLY: hanya membuat kelompok kode PBL3-01..PBL3-14 beserta
-- dosen penguji (penguji_1) dan anggota mahasiswa. Tidak ada data
-- PBL 1 / PBL 2 / SP yang disentuh.
--
-- Jalankan SEBELUM seed_pbl3_blueprint.sql? Tidak wajib — urutan bebas.
-- Review dulu, lalu jalankan sekali di Supabase Dashboard SQL editor.
-- ============================================================

-- Kelompok 1 — Penguji: Chahya Kharin Herbawani, S.Keb.,Bd, M.K.M.
with g_01 as (
  insert into public.pbl_groups (code, name, title, semester, academic_year, status, hari_tanggal, venue, blueprint_version)
  values ('PBL3-01', 'Kelompok 1', 'Seminar PBL 3', 'Ganjil', '2026/2027', 'scheduled', 'Senin, 30 November 2026', 'Kampus FIKES UPNVJ', 'pbl3-rps-v1')
  on conflict (code) do update set name = excluded.name, updated_at = now()
  returning id
)
insert into public.pbl_assessors (group_id, assessor_role, display_name, nip, email, sequence_no)
select id, 'penguji_1', 'Chahya Kharin Herbawani, S.Keb.,Bd, M.K.M.', '', 'chahyakharin@upnvj.ac.id', 1 from g_01
on conflict (group_id, assessor_role) do update set display_name = excluded.display_name, email = excluded.email, updated_at = now();

insert into public.pbl_group_members (group_id, nim, name, role)
select id, m.nim, m.name, 'member' from g_01, (values
  ('2310713153', 'Bagas Gunanto'),
  ('2310713012', 'Syifa Fitriana Qurrotaayun'),
  ('2310713159', 'Salsa Cahya Amira'),
  ('2310713124', 'Zahra Herliana Agustien'),
  ('2310713156', 'Rismauli Romaito Sinaga'),
  ('2310713078', 'Nufikha Nayazsa Aulia'),
  ('2310713123', 'Rizkiana Putrika Maharani'),
  ('2310713044', 'Cindy Tia Clairine'),
  ('2310713100', 'Salwa Febriana Ekasari Siregar'),
  ('2310713090', 'Seftiani Syafira'),
  ('2310713050', 'Zahwa Azalia')
) as m(nim, name)
on conflict (group_id, nim) do update set name = excluded.name, updated_at = now();

-- Kelompok 2 — Penguji: Dr. Putri Permatasari, SKM, MKM
with g_02 as (
  insert into public.pbl_groups (code, name, title, semester, academic_year, status, hari_tanggal, venue, blueprint_version)
  values ('PBL3-02', 'Kelompok 2', 'Seminar PBL 3', 'Ganjil', '2026/2027', 'scheduled', 'Senin, 30 November 2026', 'Kampus FIKES UPNVJ', 'pbl3-rps-v1')
  on conflict (code) do update set name = excluded.name, updated_at = now()
  returning id
)
insert into public.pbl_assessors (group_id, assessor_role, display_name, nip, email, sequence_no)
select id, 'penguji_1', 'Dr. Putri Permatasari, SKM, MKM', '', 'putripermatasari@upnvj.ac.id', 1 from g_02
on conflict (group_id, assessor_role) do update set display_name = excluded.display_name, email = excluded.email, updated_at = now();

insert into public.pbl_group_members (group_id, nim, name, role)
select id, m.nim, m.name, 'member' from g_02, (values
  ('2310713127', 'Muhammad Hafizh Azzuraiqi'),
  ('2310713018', 'Suci Nur Qudsiyah'),
  ('2310713136', 'Tiar Kasih Jeremiah Sihombing'),
  ('2310713016', 'Amanda Safitri'),
  ('2310713021', 'Nazwa Fadya Nur Shaumi'),
  ('2310713098', 'Reynanda Sabrina'),
  ('2310713005', 'Dwi Rani Oktapiani'),
  ('2310713040', 'Siti Rahima Kiram'),
  ('2310713081', 'Meutya Zahra Saphira'),
  ('2310713091', 'Nadya Nur Syafina Putri'),
  ('2310713047', 'Robby Firmansyah')
) as m(nim, name)
on conflict (group_id, nim) do update set name = excluded.name, updated_at = now();

-- Kelompok 3 — Penguji: Farahul Jannah, S.Kep., M.KKK.
with g_03 as (
  insert into public.pbl_groups (code, name, title, semester, academic_year, status, hari_tanggal, venue, blueprint_version)
  values ('PBL3-03', 'Kelompok 3', 'Seminar PBL 3', 'Ganjil', '2026/2027', 'scheduled', 'Senin, 30 November 2026', 'Kampus FIKES UPNVJ', 'pbl3-rps-v1')
  on conflict (code) do update set name = excluded.name, updated_at = now()
  returning id
)
insert into public.pbl_assessors (group_id, assessor_role, display_name, nip, email, sequence_no)
select id, 'penguji_1', 'Farahul Jannah, S.Kep., M.KKK.', '', 'farahuljannah@upnvj.ac.id', 1 from g_03
on conflict (group_id, assessor_role) do update set display_name = excluded.display_name, email = excluded.email, updated_at = now();

insert into public.pbl_group_members (group_id, nim, name, role)
select id, m.nim, m.name, 'member' from g_03, (values
  ('2310713119', 'Johannes Braven Azarel Sjawaloedin'),
  ('2310713135', 'Isnaini Nur Hasanah'),
  ('2310713150', 'Indira Khaznati Salvira'),
  ('2310713084', 'Keira Dwinova'),
  ('2310713099', 'Ghaida Ramadhani'),
  ('2310713043', 'Salsabila Azzahra'),
  ('2310713086', 'Agisna Rafa Krismawanti'),
  ('2310713096', 'Putri Aqilah Ramadhani'),
  ('2310713140', 'Najwa Aulia Salsabila'),
  ('2310713080', 'Inayah Dzikra Fauziyyah'),
  ('2310713101', 'Nayla Alfiah')
) as m(nim, name)
on conflict (group_id, nim) do update set name = excluded.name, updated_at = now();

-- Kelompok 4 — Penguji: Dr. Fathinah Ranggauni Hardy, SKM.M.Epid
with g_04 as (
  insert into public.pbl_groups (code, name, title, semester, academic_year, status, hari_tanggal, venue, blueprint_version)
  values ('PBL3-04', 'Kelompok 4', 'Seminar PBL 3', 'Ganjil', '2026/2027', 'scheduled', 'Senin, 30 November 2026', 'Kampus FIKES UPNVJ', 'pbl3-rps-v1')
  on conflict (code) do update set name = excluded.name, updated_at = now()
  returning id
)
insert into public.pbl_assessors (group_id, assessor_role, display_name, nip, email, sequence_no)
select id, 'penguji_1', 'Dr. Fathinah Ranggauni Hardy, SKM.M.Epid', '', 'fathinahranggaunihardy@gmail.com', 1 from g_04
on conflict (group_id, assessor_role) do update set display_name = excluded.display_name, email = excluded.email, updated_at = now();

insert into public.pbl_group_members (group_id, nim, name, role)
select id, m.nim, m.name, 'member' from g_04, (values
  ('2310713038', 'Riesvito Khairurizky'),
  ('2310713054', 'Salsabila Firdausi'),
  ('2310713094', 'Alvamuna Khairani Sudarmaji'),
  ('2310713110', 'Rifa Neisya Azalia Putri'),
  ('2310713051', 'Nazhifa Nurul Azizah'),
  ('2310713022', 'Siti Aisyah'),
  ('2310713089', 'Raeesah Wahlullizar'),
  ('2310713049', 'Adzroo Atiiqoh Nur Nabiila'),
  ('2310713114', 'Assyifa Ramadhani'),
  ('2310713145', 'Evita Mutiara')
) as m(nim, name)
on conflict (group_id, nim) do update set name = excluded.name, updated_at = now();

-- Kelompok 5 — Penguji: Nayla Kamilia Fithri, S.KM., M.P.H.
with g_05 as (
  insert into public.pbl_groups (code, name, title, semester, academic_year, status, hari_tanggal, venue, blueprint_version)
  values ('PBL3-05', 'Kelompok 5', 'Seminar PBL 3', 'Ganjil', '2026/2027', 'scheduled', 'Senin, 30 November 2026', 'Kampus FIKES UPNVJ', 'pbl3-rps-v1')
  on conflict (code) do update set name = excluded.name, updated_at = now()
  returning id
)
insert into public.pbl_assessors (group_id, assessor_role, display_name, nip, email, sequence_no)
select id, 'penguji_1', 'Nayla Kamilia Fithri, S.KM., M.P.H.', '', 'naylakamiliafithri@upnvj.ac.id', 1 from g_05
on conflict (group_id, assessor_role) do update set display_name = excluded.display_name, email = excluded.email, updated_at = now();

insert into public.pbl_group_members (group_id, nim, name, role)
select id, m.nim, m.name, 'member' from g_05, (values
  ('2310713070', 'Pahhad Abdullah'),
  ('2310713112', 'Joana Angelica Depari'),
  ('2310713020', 'Fadilah Salinu Berti'),
  ('2310713133', 'Aatifah Dihyan Calista'),
  ('2310713002', 'Mutiara Cantika Mujiano'),
  ('2310713006', 'Virgine Weby Anastasia'),
  ('2310713143', 'Jelita Ratna Kusumah'),
  ('2310713154', 'Cynthia Amelia Anindyawati'),
  ('2310713009', 'Maya Dwi Safitri'),
  ('2310713023', 'Rahma Nasywa Sabilla'),
  ('2310713026', 'Maharani Muntaz')
) as m(nim, name)
on conflict (group_id, nim) do update set name = excluded.name, updated_at = now();

-- Kelompok 6 — Penguji: Prof. Dr. Acim Heri Iswanto, SKM. MARS
with g_06 as (
  insert into public.pbl_groups (code, name, title, semester, academic_year, status, hari_tanggal, venue, blueprint_version)
  values ('PBL3-06', 'Kelompok 6', 'Seminar PBL 3', 'Ganjil', '2026/2027', 'scheduled', 'Senin, 30 November 2026', 'Kampus FIKES UPNVJ', 'pbl3-rps-v1')
  on conflict (code) do update set name = excluded.name, updated_at = now()
  returning id
)
insert into public.pbl_assessors (group_id, assessor_role, display_name, nip, email, sequence_no)
select id, 'penguji_1', 'Prof. Dr. Acim Heri Iswanto, SKM. MARS', '', 'h.iswanto@upnvj.ac.id', 1 from g_06
on conflict (group_id, assessor_role) do update set display_name = excluded.display_name, email = excluded.email, updated_at = now();

insert into public.pbl_group_members (group_id, nim, name, role)
select id, m.nim, m.name, 'member' from g_06, (values
  ('2310713029', 'Virens Rizaldi'),
  ('2310713027', 'Faiza Athallah Salman'),
  ('2310713103', 'Naya Syakira Nursyabani'),
  ('2310713105', 'Putri Annisa'),
  ('2310713032', 'Marlina Kosmiyatun Hasanah'),
  ('2310713033', 'Dwi Septia Handayani'),
  ('2310713158', 'Azzahra Athyahanna Harahap'),
  ('2310713031', 'A''idah Husniyah'),
  ('2310713046', 'Canttika'),
  ('2310713035', 'Aisyah Nur Karimah')
) as m(nim, name)
on conflict (group_id, nim) do update set name = excluded.name, updated_at = now();

-- Kelompok 7 — Penguji: Dr. Laily Hanifah, SKM., M.Kes.
with g_07 as (
  insert into public.pbl_groups (code, name, title, semester, academic_year, status, hari_tanggal, venue, blueprint_version)
  values ('PBL3-07', 'Kelompok 7', 'Seminar PBL 3', 'Ganjil', '2026/2027', 'scheduled', 'Senin, 30 November 2026', 'Kampus FIKES UPNVJ', 'pbl3-rps-v1')
  on conflict (code) do update set name = excluded.name, updated_at = now()
  returning id
)
insert into public.pbl_assessors (group_id, assessor_role, display_name, nip, email, sequence_no)
select id, 'penguji_1', 'Dr. Laily Hanifah, SKM., M.Kes.', '', 'laily.hanifah@upnvj.ac.id', 1 from g_07
on conflict (group_id, assessor_role) do update set display_name = excluded.display_name, email = excluded.email, updated_at = now();

insert into public.pbl_group_members (group_id, nim, name, role)
select id, m.nim, m.name, 'member' from g_07, (values
  ('2310713065', 'Denisya Marshaluna Dinanti'),
  ('2310713079', 'Mazaya Fazila Syahira'),
  ('2310713152', 'Oktavia Ramadhaningrum'),
  ('2310713072', 'Marshella Yuanda'),
  ('2310713137', 'Aelsya Nuretta'),
  ('2310713068', 'Talitha Athazora Jaohar'),
  ('2310713130', 'Meuthya Putri Salsabila'),
  ('2310713102', 'Raden Roro Mahira Kaysa Tiaradewi'),
  ('2310713111', 'Maritza Adelia Putri'),
  ('2310713139', 'Nazwa Prisca Alya')
) as m(nim, name)
on conflict (group_id, nim) do update set name = excluded.name, updated_at = now();

-- Kelompok 8 — Penguji: Dr. Agus Joko Susanto, S.K.M., M.K.K.K
with g_08 as (
  insert into public.pbl_groups (code, name, title, semester, academic_year, status, hari_tanggal, venue, blueprint_version)
  values ('PBL3-08', 'Kelompok 8', 'Seminar PBL 3', 'Ganjil', '2026/2027', 'scheduled', 'Selasa, 1 Desember 2026', 'Kampus FIKES UPNVJ', 'pbl3-rps-v1')
  on conflict (code) do update set name = excluded.name, updated_at = now()
  returning id
)
insert into public.pbl_assessors (group_id, assessor_role, display_name, nip, email, sequence_no)
select id, 'penguji_1', 'Dr. Agus Joko Susanto, S.K.M., M.K.K.K', '', 'agusjoko@upnvj.ac.id', 1 from g_08
on conflict (group_id, assessor_role) do update set display_name = excluded.display_name, email = excluded.email, updated_at = now();

insert into public.pbl_group_members (group_id, nim, name, role)
select id, m.nim, m.name, 'member' from g_08, (values
  ('2310713042', 'Muhamad Rama Noufalwafiq'),
  ('2310713069', 'Putri Gita Ameliya'),
  ('2310713125', 'Annisa Juliandari'),
  ('2310713060', 'Christiani Pasaribu'),
  ('2310713071', 'Theresa Mira Sandy Br Hutapea'),
  ('2310713001', 'Fera Agustina'),
  ('2310713063', 'Renata Safira Septiani Tambunan'),
  ('2310713151', 'Destya Putri Maharani Tanjung'),
  ('2310713087', 'Fara Anindia Zahri'),
  ('2310713109', 'Najla Malihah Izzati'),
  ('2310713117', 'Shofiana')
) as m(nim, name)
on conflict (group_id, nim) do update set name = excluded.name, updated_at = now();

-- Kelompok 9 — Penguji: Afif Amir Amrullah, S.Kp, M.K.K.K
with g_09 as (
  insert into public.pbl_groups (code, name, title, semester, academic_year, status, hari_tanggal, venue, blueprint_version)
  values ('PBL3-09', 'Kelompok 9', 'Seminar PBL 3', 'Ganjil', '2026/2027', 'scheduled', 'Selasa, 1 Desember 2026', 'Kampus FIKES UPNVJ', 'pbl3-rps-v1')
  on conflict (code) do update set name = excluded.name, updated_at = now()
  returning id
)
insert into public.pbl_assessors (group_id, assessor_role, display_name, nip, email, sequence_no)
select id, 'penguji_1', 'Afif Amir Amrullah, S.Kp, M.K.K.K', '', 'afif.amir@upnvj.ac.id', 1 from g_09
on conflict (group_id, assessor_role) do update set display_name = excluded.display_name, email = excluded.email, updated_at = now();

insert into public.pbl_group_members (group_id, nim, name, role)
select id, m.nim, m.name, 'member' from g_09, (values
  ('2310713141', 'Salmin'),
  ('2310713045', 'Alya Salsabilah'),
  ('2310713074', 'Helwa Rachman'),
  ('2310713128', 'Rizki Aprilia Putri'),
  ('2310713057', 'Lazika Nazwa Tiara'),
  ('2310713085', 'Rouzatul Fitri'),
  ('2310713146', 'Talitha Rafa Maritza'),
  ('2310713028', 'Triya Wulan Sari'),
  ('2310713108', 'Adzra Nabilah Widyatama'),
  ('2310713147', 'Grace Yohana Meilianie')
) as m(nim, name)
on conflict (group_id, nim) do update set name = excluded.name, updated_at = now();

-- Kelompok 10 — Penguji: Arga Buntara, S.K.M., M.P.H.
with g_10 as (
  insert into public.pbl_groups (code, name, title, semester, academic_year, status, hari_tanggal, venue, blueprint_version)
  values ('PBL3-10', 'Kelompok 10', 'Seminar PBL 3', 'Ganjil', '2026/2027', 'scheduled', 'Selasa, 1 Desember 2026', 'Kampus FIKES UPNVJ', 'pbl3-rps-v1')
  on conflict (code) do update set name = excluded.name, updated_at = now()
  returning id
)
insert into public.pbl_assessors (group_id, assessor_role, display_name, nip, email, sequence_no)
select id, 'penguji_1', 'Arga Buntara, S.K.M., M.P.H.', '', 'arga.buntara@upnvj.ac.id', 1 from g_10
on conflict (group_id, assessor_role) do update set display_name = excluded.display_name, email = excluded.email, updated_at = now();

insert into public.pbl_group_members (group_id, nim, name, role)
select id, m.nim, m.name, 'member' from g_10, (values
  ('2310713134', 'Rasyad Fitrianto'),
  ('2310713121', 'Anindya Khairunnisa Ramadhannis'),
  ('2310713004', 'Tanti Aulia Najwa'),
  ('2310713048', 'Dea Callula Annaishauma Arifahmi'),
  ('2310713118', 'Sabrina Salsabila Nuranisa'),
  ('2310713092', 'Khalisya Maharani Djan'),
  ('2310713138', 'Afrida Khusna'),
  ('2310713010', 'Lovia Gindha Puspita'),
  ('2310713013', 'Dian Mardiana Lestari'),
  ('2310713024', 'Dea Nurul Hilda'),
  ('2310713052', 'Nadhira Nasywa Cordellia')
) as m(nim, name)
on conflict (group_id, nim) do update set name = excluded.name, updated_at = now();

-- Kelompok 11 — Penguji: Muhammad Fadli Ramadhansyah, S.K.M., M.Kes.
with g_11 as (
  insert into public.pbl_groups (code, name, title, semester, academic_year, status, hari_tanggal, venue, blueprint_version)
  values ('PBL3-11', 'Kelompok 11', 'Seminar PBL 3', 'Ganjil', '2026/2027', 'scheduled', 'Selasa, 1 Desember 2026', 'Kampus FIKES UPNVJ', 'pbl3-rps-v1')
  on conflict (code) do update set name = excluded.name, updated_at = now()
  returning id
)
insert into public.pbl_assessors (group_id, assessor_role, display_name, nip, email, sequence_no)
select id, 'penguji_1', 'Muhammad Fadli Ramadhansyah, S.K.M., M.Kes.', '', 'fadliramadhansyah@upnvj.ac.id', 1 from g_11
on conflict (group_id, assessor_role) do update set display_name = excluded.display_name, email = excluded.email, updated_at = now();

insert into public.pbl_group_members (group_id, nim, name, role)
select id, m.nim, m.name, 'member' from g_11, (values
  ('2310713155', 'Harry Fauzi'),
  ('2310713007', 'Jauza''a Firdaus Dhiya''ulhaq'),
  ('2310713039', 'Ghaisani Putri Budhiharto'),
  ('2310713056', 'Sabrine Tsabita'),
  ('2310713073', 'Cahya Chairunissa Nabila'),
  ('2310713019', 'Fanny Fadlilah'),
  ('2310713126', 'Fauziah Nurussholihah'),
  ('2310713131', 'Rizda Maharani Sekarningrum'),
  ('2310713075', 'Rachielita Shoifia'),
  ('2310713149', 'Shofia Rahmalia Zain')
) as m(nim, name)
on conflict (group_id, nim) do update set name = excluded.name, updated_at = now();

-- Kelompok 12 — Penguji: Dr. Fajaria Nurcandra, S.K.M., M.Epid.
with g_12 as (
  insert into public.pbl_groups (code, name, title, semester, academic_year, status, hari_tanggal, venue, blueprint_version)
  values ('PBL3-12', 'Kelompok 12', 'Seminar PBL 3', 'Ganjil', '2026/2027', 'scheduled', 'Selasa, 1 Desember 2026', 'Kampus FIKES UPNVJ', 'pbl3-rps-v1')
  on conflict (code) do update set name = excluded.name, updated_at = now()
  returning id
)
insert into public.pbl_assessors (group_id, assessor_role, display_name, nip, email, sequence_no)
select id, 'penguji_1', 'Dr. Fajaria Nurcandra, S.K.M., M.Epid.', '', 'fajarianurcandra@upnvj.ac.id', 1 from g_12
on conflict (group_id, assessor_role) do update set display_name = excluded.display_name, email = excluded.email, updated_at = now();

insert into public.pbl_group_members (group_id, nim, name, role)
select id, m.nim, m.name, 'member' from g_12, (values
  ('2310713107', 'Aditya Ibnu Gunawan'),
  ('2310713003', 'Artika Putri Reza'),
  ('2310713058', 'Nasya Asifa Ahmad'),
  ('2310713077', 'Humairah Fahma Tsabitah'),
  ('2310713059', 'Matthew Anthony Sugiyarto'),
  ('2310713122', 'Prananta Hadi Panggayuh'),
  ('2310713132', 'Rafa Ilham Febriansyah'),
  ('2310713017', 'Pragathafausta Arfan Goni'),
  ('2310713036', 'Diki Saputra'),
  ('2310713157', 'Muhammad Zaki Adiutomo')
) as m(nim, name)
on conflict (group_id, nim) do update set name = excluded.name, updated_at = now();

-- Kelompok 13 — Penguji: Cahya Arbitera, S.K.M., M.K.M.
with g_13 as (
  insert into public.pbl_groups (code, name, title, semester, academic_year, status, hari_tanggal, venue, blueprint_version)
  values ('PBL3-13', 'Kelompok 13', 'Seminar PBL 3', 'Ganjil', '2026/2027', 'scheduled', 'Selasa, 1 Desember 2026', 'Kampus FIKES UPNVJ', 'pbl3-rps-v1')
  on conflict (code) do update set name = excluded.name, updated_at = now()
  returning id
)
insert into public.pbl_assessors (group_id, assessor_role, display_name, nip, email, sequence_no)
select id, 'penguji_1', 'Cahya Arbitera, S.K.M., M.K.M.', '', 'cahyaarbitera@upnvj.ac.id', 1 from g_13
on conflict (group_id, assessor_role) do update set display_name = excluded.display_name, email = excluded.email, updated_at = now();

insert into public.pbl_group_members (group_id, nim, name, role)
select id, m.nim, m.name, 'member' from g_13, (values
  ('2310713066', 'Syahlom Demartc Simanjuntak'),
  ('2310713025', 'Sudarningayuti Lintang Wahyu Azahra'),
  ('2310713083', 'Donna Ndari Santoso Putri'),
  ('2310713015', 'Nadia Hafrisa'),
  ('2310713053', 'Nasywa Athiyah Zahra'),
  ('2310713082', 'Nirna Dwi Anggraini'),
  ('2310713014', 'Amanda Nurjanah'),
  ('2310713104', 'Nadia Putri Untiami'),
  ('2310713064', 'Tuanku Banang Rabbani Imsyaamru'),
  ('2310713067', 'Rizky Khaeran')
) as m(nim, name)
on conflict (group_id, nim) do update set name = excluded.name, updated_at = now();

-- Kelompok 14 — Penguji: Dr. Ns. Dyah Utari, S.Kep.MKKK
with g_14 as (
  insert into public.pbl_groups (code, name, title, semester, academic_year, status, hari_tanggal, venue, blueprint_version)
  values ('PBL3-14', 'Kelompok 14', 'Seminar PBL 3', 'Ganjil', '2026/2027', 'scheduled', 'Selasa, 1 Desember 2026', 'Kampus FIKES UPNVJ', 'pbl3-rps-v1')
  on conflict (code) do update set name = excluded.name, updated_at = now()
  returning id
)
insert into public.pbl_assessors (group_id, assessor_role, display_name, nip, email, sequence_no)
select id, 'penguji_1', 'Dr. Ns. Dyah Utari, S.Kep.MKKK', '', 'dyahutari@upnvj.ac.id', 1 from g_14
on conflict (group_id, assessor_role) do update set display_name = excluded.display_name, email = excluded.email, updated_at = now();

insert into public.pbl_group_members (group_id, nim, name, role)
select id, m.nim, m.name, 'member' from g_14, (values
  ('2310713011', 'Ditza Ghali Dzakaria'),
  ('2310713055', 'Mazaya Raini Nurmaliza'),
  ('2310713061', 'Giska Dwi Sari Febriyani'),
  ('2310713148', 'Felicia Avriel Kriestian'),
  ('2310713037', 'Puspa Ayu Maulidya'),
  ('2310713041', 'Bebby Shandra Caecarya Akbar'),
  ('2310713116', 'Azzahra Putri Nurkholis'),
  ('2310713062', 'Saffana Urfa Setiawan'),
  ('2310713088', 'Renata Mazmur'),
  ('2310713097', 'Innes Oktaviyani')
) as m(nim, name)
on conflict (group_id, nim) do update set name = excluded.name, updated_at = now();

-- Verifikasi ringkas:
-- select code, name, hari_tanggal from public.pbl_groups where code like 'PBL3-%' order by code;
-- select g.code, a.display_name, a.email from public.pbl_assessors a join public.pbl_groups g on g.id=a.group_id where g.code like 'PBL3-%' order by g.code;
-- select g.code, count(m.id) from public.pbl_groups g join public.pbl_group_members m on m.group_id=g.id where g.code like 'PBL3-%' group by g.code order by g.code;