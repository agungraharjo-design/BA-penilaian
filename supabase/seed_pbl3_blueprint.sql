-- ============================================================
-- PBL 3 BLUEPRINT SEED — final RPS PBL 3 2026/2027 Ganjil
-- (RPS-Pengalaman-Belajar-Lapangan-3-S1-Kesehatan-Masyarakat-
--  2026-2027-Ganjil, disahkan 01 Agustus 2026)
--
-- ADDITIVE ONLY: uses component codes starting with "3" so it can never
-- collide with PBL 1 (I1..E1), PBL 2 ("2*") or Seminar Proposal (SP-*).
-- Nothing existing is updated or deleted. Idempotent (upserts).
--
-- Weights (RPS page 3, "Penilaian dan Korelasinya dengan CPMK" — total per
-- CPMK: 40 / 20 / 20 / 10 / 10). Aktivitas (CPMK 2) and Laporan (CPMK 3) are
-- SEPARATE components each with its own rubric (user decision 2026-10-30);
-- the 7 aspek of the paper Form 3 sheet "Aktivitas dan Laporan" are
-- distributed by nature: proses/sikap → 3AK, dokumen/produk → 3LP.
--   3PL  Aktivitas & laporan — Pembimbing Lapangan ......... 40%  (paper Form 2, seeded, NO rubric rows)
--   3AK  Penilaian Aktivitas — Dosen Pembimbing (CPMK 2) .... 20%  (rubrik, 3 aspek: administrasi 30, pembimbingan 30, etika 40)
--   3LP  Penilaian Laporan — Dosen Pembimbing (CPMK 3) ...... 20%  (rubrik, 4 aspek: instansi 25, kedalaman 30, bidang 30, format 15)
--   3SP  Seminar Laporan — Dosen Penguji (CPMK 4) ........... 10%  (rubrik, 5 aspek)
--   3SM  Seminar Laporan — Dosen Pembimbing (CPMK 5) ........ 10%  (rubrik, 5 aspek)
--
-- ⚠ Legacy CHECK constraints (20260801_create_pbl_module.sql):
--   cpmk_code allows only CPMK1|CPMK2  -> rows store the closest legal bucket;
--   the real RPS CPMK label (CPMK 1..5) is displayed by the app from types/pbl3.ts.
--
-- Rubric descriptors: 4 scored levels (1-4) per aspek, ditulis kontekstual PBL 3
-- agar penguji/pembimbing menilai lebih reliabel, plus level 0 "Tidak Ada Bukti"
-- mengikuti konvensi blueprint PBL 1/PBL 2.
-- ============================================================

-- ------------------------------------------------------------
-- 1. COMPONENTS
-- ------------------------------------------------------------
insert into public.pbl_assessment_components (code, name, rps_weight, cpmk_code, default_scope, assessor_role, active, locked, display_order)
values
  ('3PL', 'Nilai Aktivitas Peserta - Pembimbing Lapangan', 0.40000, 'CPMK1', 'INDIVIDUAL', NULL, true, false, 41),
  ('3AK', 'Penilaian Aktivitas - Dosen Pembimbing', 0.20000, 'CPMK2', 'INDIVIDUAL', 'PEMBIMBING', true, false, 42),
  ('3LP', 'Penilaian Laporan - Dosen Pembimbing', 0.20000, 'CPMK2', 'INDIVIDUAL', 'PEMBIMBING', true, false, 43),
  ('3SP', 'Penilaian Seminar Laporan - Dosen Penguji', 0.10000, 'CPMK2', 'INDIVIDUAL', 'PENGUJI', true, false, 44),
  ('3SM', 'Penilaian Seminar Laporan - Dosen Pembimbing', 0.10000, 'CPMK2', 'INDIVIDUAL', 'PEMBIMBING', true, false, 45)
on conflict (code) do update set
  name = excluded.name,
  rps_weight = excluded.rps_weight,
  default_scope = excluded.default_scope,
  assessor_role = excluded.assessor_role,
  active = excluded.active,
  display_order = excluded.display_order;

-- ------------------------------------------------------------
-- 2. CRITERIA — 3AK (3 aspek proses/sikap, bobot 30/30/40)
-- ------------------------------------------------------------
insert into public.pbl_rubric_criteria (component_code, code, name, evidence_guidance, internal_weight, criterion_order)
values
  ('3AK', '3AK-C1', 'Kelengkapan administrasi kegiatan PBL 3 (cap instansi tempat penyelenggara, tanda tangan pembimbing lapangan, ketepatan waktu)',
   'Kelengkapan dan keabsahan administrasi kegiatan dan laporan: cap instansi, tanda tangan pembimbing lapangan, serta ketepatan waktu pengumpulan sesuai jadwal.', 0.30, 1),
  ('3AK', '3AK-C2', 'Kuantitas dan kualitas pembimbingan (keteraturan konsultasi, responsivitas perbaikan)',
   'Rekap proses pembimbingan: jumlah pertemuan/konsultasi, keteraturan bimbingan, serta responsif memperbaiki laporan sesuai arahan pembimbing.', 0.30, 2),
  ('3AK', '3AK-C3', 'Etika, kedisiplinan, kejujuran, dan tanggung jawab selama pelaksanaan PBL 3',
   'Sikap selama PBL 3: kejujuran data, kedisiplinan waktu, etika terhadap instansi/pembimbing, dan tanggung jawab atas tugas.', 0.40, 3)
on conflict (component_code, code) do update set
  name = excluded.name, evidence_guidance = excluded.evidence_guidance,
  internal_weight = excluded.internal_weight, criterion_order = excluded.criterion_order;

-- ------------------------------------------------------------
-- 3. CRITERIA — 3LP (4 aspek dokumen/produk, bobot 25/30/30/15)
-- ------------------------------------------------------------
insert into public.pbl_rubric_criteria (component_code, code, name, evidence_guidance, internal_weight, criterion_order)
values
  ('3LP', '3LP-C1', 'Pemahaman terhadap gambaran instansi tempat penyelenggara PBL 3',
   'Kemampuan menjelaskan profil instansi dalam laporan: struktur organisasi, tugas, fungsi, dan proses kerja unit tempat PBL 3 dilaksanakan.', 0.25, 1),
  ('3LP', '3LP-C2', 'Kedalaman pembahasan dan rincian kegiatan PBL 3',
   'Kedalaman analisis dan kelengkapan rincian kegiatan dalam laporan: identifikasi masalah, analisis penyebab, perencanaan-pelaksanaan program, monitoring-evaluasi, dan pembelajaran.', 0.30, 2),
  ('3LP', '3LP-C3', 'Pemahaman terhadap bidang atau fokus PBL 3',
   'Penguasaan konsep dan praktik sesuai bidang peminatan/tempat PBL 3 dalam laporan, termasuk keterkaitan masalah prioritas dan program promosi-preventif dengan bidang fokus.', 0.30, 3),
  ('3LP', '3LP-C4', 'Kesesuaian penulisan dengan format Laporan Akhir PBL 3',
   'Kepatuhan laporan pada format baku Laporan Akhir PBL 3: struktur bab, sitasi/daftar pustaka, tata tulis, dan sistematika sesuai pedoman.', 0.15, 4)
on conflict (component_code, code) do update set
  name = excluded.name, evidence_guidance = excluded.evidence_guidance,
  internal_weight = excluded.internal_weight, criterion_order = excluded.criterion_order;

-- ------------------------------------------------------------
-- 4. CRITERIA — 3SP & 3SM (5 aspek seminar, bobot = Form 3 lembar Seminar Laporan)
-- ------------------------------------------------------------
insert into public.pbl_rubric_criteria (component_code, code, name, evidence_guidance, internal_weight, criterion_order)
values
  ('3SP', '3SP-C1', 'Kemampuan presentasi atau penyajian laporan PBL 3',
   'Kualitas penyajian: penguasaan materi, kejelasan alur, media presentasi, ketepatan waktu, dan cara penyampaian.', 0.20, 1),
  ('3SP', '3SP-C2', 'Kesesuaian penulisan laporan dengan format laporan PBL 3',
   'Kesesuaian struktur dan tata tulis laporan yang dipresentasikan dengan format baku laporan PBL 3.', 0.10, 2),
  ('3SP', '3SP-C3', 'Kedalaman pembahasan dan rincian kegiatan PBL 3',
   'Kedalaman analisis dalam laporan/presentasi: data, identifikasi masalah dan penyebab, program, monitoring-evaluasi, dan pembelajaran.', 0.30, 3),
  ('3SP', '3SP-C4', 'Pemahaman terhadap bidang atau fokus PBL 3',
   'Kemampuan menjawab pertanyaan dan mengelola diskusi menunjukkan penguasaan bidang/fokus PBL 3 yang dipelajari.', 0.30, 4),
  ('3SP', '3SP-C5', 'Sikap dan perilaku mahasiswa selama Seminar PBL 3',
   'Sikap selama seminar: kehadiran tepat waktu, mengikuti jalannya seminar dengan sopan, dan merespons masukan dengan baik.', 0.10, 5),
  ('3SM', '3SM-C1', 'Kemampuan presentasi atau penyajian laporan PBL 3',
   'Kualitas penyajian: penguasaan materi, kejelasan alur, media presentasi, ketepatan waktu, dan cara penyampaian.', 0.20, 1),
  ('3SM', '3SM-C2', 'Kesesuaian penulisan laporan dengan format laporan PBL 3',
   'Kesesuaian struktur dan tata tulis laporan yang dipresentasikan dengan format baku laporan PBL 3.', 0.10, 2),
  ('3SM', '3SM-C3', 'Kedalaman pembahasan dan rincian kegiatan PBL 3',
   'Kedalaman analisis dalam laporan/presentasi: data, identifikasi masalah dan penyebab, program, monitoring-evaluasi, dan pembelajaran.', 0.30, 3),
  ('3SM', '3SM-C4', 'Pemahaman terhadap bidang atau fokus PBL 3',
   'Kemampuan menjawab pertanyaan dan mengelola diskusi menunjukkan penguasaan bidang/fokus PBL 3 yang dipelajari.', 0.30, 4),
  ('3SM', '3SM-C5', 'Sikap dan perilaku mahasiswa selama Seminar PBL 3',
   'Sikap selama seminar: kehadiran tepat waktu, mengikuti jalannya seminar dengan sopan, dan merespons masukan dengan baik.', 0.10, 5)
on conflict (component_code, code) do update set
  name = excluded.name, evidence_guidance = excluded.evidence_guidance,
  internal_weight = excluded.internal_weight, criterion_order = excluded.criterion_order;

-- ------------------------------------------------------------
-- 5. DESCRIPTORS — helper (21 kriteria x 5 level)
-- ------------------------------------------------------------
create or replace function public.pbl3_seed_descriptor(
  p_code text, p_level smallint, p_text text
) returns void language plpgsql as $$
declare
  v_criterion_id uuid;
begin
  select id into v_criterion_id from public.pbl_rubric_criteria where code = p_code;
  if v_criterion_id is null then
    raise warning 'criterion % not found, skip', p_code;
    return;
  end if;
  insert into public.pbl_rubric_descriptors (criterion_id, level_value, level_label, descriptor_text, scoring_note, display_order)
  values (
    v_criterion_id, p_level,
    (case p_level when 4 then 'Melampaui Standar' when 3 then 'Memenuhi Standar'
                  when 2 then 'Mendekati Standar' when 1 then 'Belum Memenuhi Standar'
                  else 'Tidak Ada Bukti' end),
    p_text, null, p_level
  )
  on conflict (criterion_id, level_value) do update set
    level_label = excluded.level_label,
    descriptor_text = excluded.descriptor_text,
    display_order = excluded.display_order;
end $$;

-- Level 0 sama untuk semua kriteria (konvensi blueprint PBL 1/PBL 2)
do $$
declare c text;
begin
  foreach c in array array['3AK-C1','3AK-C2','3AK-C3',
                           '3LP-C1','3LP-C2','3LP-C3','3LP-C4',
                           '3SP-C1','3SP-C2','3SP-C3','3SP-C4','3SP-C5',
                           '3SM-C1','3SM-C2','3SM-C3','3SM-C4','3SM-C5'] loop
    perform public.pbl3_seed_descriptor(c, 0, 'Tidak ada bukti yang dapat dinilai untuk aspek ini.');
  end loop;
end $$;

-- ── 3AK-C1 Kelengkapan administrasi ──
select public.pbl3_seed_descriptor('3AK-C1', 4, 'Administrasi lengkap dan sah (cap instansi serta tanda tangan pembimbing lapangan terisi seluruhnya) dan laporan dikumpulkan tepat waktu bahkan lebih awal tanpa teguran.');
select public.pbl3_seed_descriptor('3AK-C1', 3, 'Administrasi lengkap dan sah; laporan dikumpulkan tepat waktu sesuai jadwal.');
select public.pbl3_seed_descriptor('3AK-C1', 2, 'Terdapat kekurangan administrasi (cap/tanda tangan belum lengkap) atau laporan terlambat singkat; masih dapat diperbaiki segera.');
select public.pbl3_seed_descriptor('3AK-C1', 1, 'Administrasi tidak lengkap/tidak sah dan laporan terlambat jauh dari jadwal tanpa keterangan yang dapat diterima.');

-- ── 3AK-C2 Kuantitas & kualitas pembimbingan ──
select public.pbl3_seed_descriptor('3AK-C2', 4, 'Pembimbingan sangat baik: konsultasi berjalan teratur melebihi ketentuan minimal, catatan bimbingan lengkap, perbaikan responsif dan berkualitas tinggi.');
select public.pbl3_seed_descriptor('3AK-C2', 3, 'Pembimbingan baik: jumlah konsultasi memadai sesuai ketentuan, perbaikan tuntas sesuai arahan pembimbing.');
select public.pbl3_seed_descriptor('3AK-C2', 2, 'Pembimbingan kurang: konsultasi jarang, catatan bimbingan tidak lengkap, atau perbaikan tidak tuntas.');
select public.pbl3_seed_descriptor('3AK-C2', 1, 'Pembimbingan minim/tidak berjalan; tidak menunjukkan proses bimbingan yang dapat dipertanggungjawabkan.');

-- ── 3AK-C3 Etika, kedisiplinan, kejujuran, tanggung jawab ──
select public.pbl3_seed_descriptor('3AK-C3', 4, 'Menunjukkan etika, kedisiplinan, kejujuran, dan tanggung jawab yang sangat baik dan konsisten sepanjang PBL 3; menjadi teladan.');
select public.pbl3_seed_descriptor('3AK-C3', 3, 'Baik: beretika, disiplin, jujur, dan bertanggung jawab selama kegiatan dan penyusunan laporan.');
select public.pbl3_seed_descriptor('3AK-C3', 2, 'Cukup: terdapat beberapa kekeliruan sikap/disiplin yang telah diperbaiki setelah ditegur.');
select public.pbl3_seed_descriptor('3AK-C3', 1, 'Kurang: terdapat pelanggaran etika/disiplin/kejujuran yang nyata dan belum ada perbaikan.');

-- ── 3LP-C1 Pemahaman gambaran instansi ──
select public.pbl3_seed_descriptor('3LP-C1', 4, 'Menjelaskan gambaran instansi secara utuh dan tajam; mengaitkan struktur organisasi, tugas, fungsi, dan proses kerja dengan konteks kesehatan masyarakat serta mampu mengkritisi peran unit.');
select public.pbl3_seed_descriptor('3LP-C1', 3, 'Menjelaskan struktur organisasi, tugas, fungsi, dan proses kerja instansi dengan benar dan lengkap sesuai kebutuhan laporan.');
select public.pbl3_seed_descriptor('3LP-C1', 2, 'Menjelaskan gambaran instansi hanya sebagian/umum; struktur atau proses kerja kurang tepat atau kurang mendalam.');
select public.pbl3_seed_descriptor('3LP-C1', 1, 'Tidak mampu menjelaskan gambaran instansi; informasi keliru atau disalin tanpa pemahaman.');

-- ── 3LP-C2 Kedalaman pembahasan & rincian kegiatan ──
select public.pbl3_seed_descriptor('3LP-C2', 4, 'Pembahasan sangat mendalam dan runtut; rincian kegiatan lengkap disertai data/bukti, analisis kritis (mis. kesenjangan teori-praktik), dan refleksi serta rekomendasi.');
select public.pbl3_seed_descriptor('3LP-C2', 3, 'Pembahasan mendalam dan rincian kegiatan lengkap sesuai tahapan manajemen (perencanaan, pelaksanaan, monitoring-evaluasi).');
select public.pbl3_seed_descriptor('3LP-C2', 2, 'Pembahasan cukup namun cenderung deskriptif; rincian kegiatan parsial atau analisis kurang mendalam.');
select public.pbl3_seed_descriptor('3LP-C2', 1, 'Pembahasan sangat kurang; rincian kegiatan tidak jelas, tidak lengkap, atau keliru.');

-- ── 3LP-C3 Pemahaman bidang/fokus ──
select public.pbl3_seed_descriptor('3LP-C3', 4, 'Menguasai bidang fokus secara komprehensif; mampu mengaitkan teori dengan praktik lapangan, mengidentifikasi kesenjangan, dan memberi rekomendasi berbasis bukti.');
select public.pbl3_seed_descriptor('3LP-C3', 3, 'Memahami bidang fokus dengan baik; konsep dan praktik sesuai bidang peminatan dijelaskan dengan benar.');
select public.pbl3_seed_descriptor('3LP-C3', 2, 'Pemahaman bidang fokus terbatas; masih terdapat kekeliruan konsep dasar pada bidang peminatan.');
select public.pbl3_seed_descriptor('3LP-C3', 1, 'Tidak menunjukkan pemahaman terhadap bidang/fokus PBL 3; jawaban/pembahasan tidak relevan dengan peminatan.');

-- ── 3LP-C4 Kesesuaian format Laporan Akhir ──
select public.pbl3_seed_descriptor('3LP-C4', 4, 'Format ditaati secara konsisten dan rapi pada seluruh laporan; sistematika, sitasi/daftar pustaka, dan tata tulis sangat baik.');
select public.pbl3_seed_descriptor('3LP-C4', 3, 'Kesesuaian format baik; hanya terdapat temuan minor yang tidak mengurangi keseluruhan laporan.');
select public.pbl3_seed_descriptor('3LP-C4', 2, 'Kesesuaian format sedang; beberapa bagian menyimpang dari pedoman dan perlu perbaikan.');
select public.pbl3_seed_descriptor('3LP-C4', 1, 'Banyak penyimpangan format; laporan belum mengikuti pedoman penulisan Laporan Akhir PBL 3.');

-- ── 3SP/3SM-C1 Kemampuan presentasi ──
select public.pbl3_seed_descriptor('3SP-C1', 4, 'Penyajian sangat baik: materi dikuasai penuh, alur logis, media efektif dan menarik, waktu terkendali, komunikasi jelas dan meyakinkan.');
select public.pbl3_seed_descriptor('3SP-C1', 3, 'Penyajian baik: materi dikuasai, alur jelas, media membantu penyajian, waktu sesuai ketentuan.');
select public.pbl3_seed_descriptor('3SP-C1', 2, 'Penyajian cukup: penguasaan materi atau penyampaian kurang lancar, waktu kurang terkendali, media kurang membantu.');
select public.pbl3_seed_descriptor('3SP-C1', 1, 'Penyajian kurang: tidak menguasai materi, alur membingungkan, penyampaian tidak jelas.');
select public.pbl3_seed_descriptor('3SM-C1', 4, 'Penyajian sangat baik: materi dikuasai penuh, alur logis, media efektif dan menarik, waktu terkendali, komunikasi jelas dan meyakinkan.');
select public.pbl3_seed_descriptor('3SM-C1', 3, 'Penyajian baik: materi dikuasai, alur jelas, media membantu penyajian, waktu sesuai ketentuan.');
select public.pbl3_seed_descriptor('3SM-C1', 2, 'Penyajian cukup: penguasaan materi atau penyampaian kurang lancar, waktu kurang terkendali, media kurang membantu.');
select public.pbl3_seed_descriptor('3SM-C1', 1, 'Penyajian kurang: tidak menguasai materi, alur membingungkan, penyampaian tidak jelas.');

-- ── 3SP/3SM-C2 Kesesuaian format laporan ──
select public.pbl3_seed_descriptor('3SP-C2', 4, 'Laporan sepenuhnya sesuai format baku laporan PBL 3 dengan sistematika dan tata tulis sangat rapi.');
select public.pbl3_seed_descriptor('3SP-C2', 3, 'Laporan sesuai format baku; hanya terdapat kesalahan minor yang tidak mengurangi substansi.');
select public.pbl3_seed_descriptor('3SP-C2', 2, 'Sebagian format tidak sesuai; perlu perbaikan pada beberapa bagian laporan.');
select public.pbl3_seed_descriptor('3SP-C2', 1, 'Laporan tidak mengikuti format baku laporan PBL 3.');
select public.pbl3_seed_descriptor('3SM-C2', 4, 'Laporan sepenuhnya sesuai format baku laporan PBL 3 dengan sistematika dan tata tulis sangat rapi.');
select public.pbl3_seed_descriptor('3SM-C2', 3, 'Laporan sesuai format baku; hanya terdapat kesalahan minor yang tidak mengurangi substansi.');
select public.pbl3_seed_descriptor('3SM-C2', 2, 'Sebagian format tidak sesuai; perlu perbaikan pada beberapa bagian laporan.');
select public.pbl3_seed_descriptor('3SM-C2', 1, 'Laporan tidak mengikuti format baku laporan PBL 3.');

-- ── 3SP/3SM-C3 Kedalaman pembahasan & rincian kegiatan ──
select public.pbl3_seed_descriptor('3SP-C3', 4, 'Analisis sangat mendalam berbasis data; rincian kegiatan lengkap dan kritis, termasuk kesenjangan teori-praktik serta rekomendasi yang aplikatif.');
select public.pbl3_seed_descriptor('3SP-C3', 3, 'Pembahasan mendalam dan rincian kegiatan lengkap sesuai tahapan kegiatan PBL 3.');
select public.pbl3_seed_descriptor('3SP-C3', 2, 'Pembahasan cukup namun deskriptif; rincian kegiatan kurang lengkap.');
select public.pbl3_seed_descriptor('3SP-C3', 1, 'Pembahasan dangkal; rincian kegiatan tidak memadai atau keliru.');
select public.pbl3_seed_descriptor('3SM-C3', 4, 'Analisis sangat mendalam berbasis data; rincian kegiatan lengkap dan kritis, termasuk kesenjangan teori-praktik serta rekomendasi yang aplikatif.');
select public.pbl3_seed_descriptor('3SM-C3', 3, 'Pembahasan mendalam dan rincian kegiatan lengkap sesuai tahapan kegiatan PBL 3.');
select public.pbl3_seed_descriptor('3SM-C3', 2, 'Pembahasan cukup namun deskriptif; rincian kegiatan kurang lengkap.');
select public.pbl3_seed_descriptor('3SM-C3', 1, 'Pembahasan dangkal; rincian kegiatan tidak memadai atau keliru.');

-- ── 3SP/3SM-C4 Pemahaman bidang/fokus (saat diskusi) ──
select public.pbl3_seed_descriptor('3SP-C4', 4, 'Jawaban tepat dengan argumentasi berbasis bukti, mengakui keterbatasan secara jujur; penguasaan bidang sangat baik termasuk saat mengelola diskusi.');
select public.pbl3_seed_descriptor('3SP-C4', 3, 'Jawaban benar dan relevan dengan pertanyaan; penguasaan bidang/fokus baik.');
select public.pbl3_seed_descriptor('3SP-C4', 2, 'Jawaban hanya sebagian benar; penguasaan bidang/fokus terbatas saat ditanya.');
select public.pbl3_seed_descriptor('3SP-C4', 1, 'Tidak mampu menjawab pertanyaan; penguasaan bidang/fokus kurang.');
select public.pbl3_seed_descriptor('3SM-C4', 4, 'Jawaban tepat dengan argumentasi berbasis bukti, mengakui keterbatasan secara jujur; penguasaan bidang sangat baik termasuk saat mengelola diskusi.');
select public.pbl3_seed_descriptor('3SM-C4', 3, 'Jawaban benar dan relevan dengan pertanyaan; penguasaan bidang/fokus baik.');
select public.pbl3_seed_descriptor('3SM-C4', 2, 'Jawaban hanya sebagian benar; penguasaan bidang/fokus terbatas saat ditanya.');
select public.pbl3_seed_descriptor('3SM-C4', 1, 'Tidak mampu menjawab pertanyaan; penguasaan bidang/fokus kurang.');

-- ── 3SP/3SM-C5 Sikap dan perilaku selama seminar ──
select public.pbl3_seed_descriptor('3SP-C5', 4, 'Sikap sangat baik: hadir tepat waktu, aktif dan sopan selama seminar, merespons masukan dengan terbuka dan konstruktif.');
select public.pbl3_seed_descriptor('3SP-C5', 3, 'Sikap baik: hadir tepat waktu dan mengikuti jalannya seminar dengan sopan.');
select public.pbl3_seed_descriptor('3SP-C5', 2, 'Sikap cukup: terdapat kekurangan kecil (mis. kurang fokus atau kurang responsif terhadap masukan).');
select public.pbl3_seed_descriptor('3SP-C5', 1, 'Sikap kurang: terlambat, tidak mengikuti jalannya seminar, atau kurang sopan.');
select public.pbl3_seed_descriptor('3SM-C5', 4, 'Sikap sangat baik: hadir tepat waktu, aktif dan sopan selama seminar, merespons masukan dengan terbuka dan konstruktif.');
select public.pbl3_seed_descriptor('3SM-C5', 3, 'Sikap baik: hadir tepat waktu dan mengikuti jalannya seminar dengan sopan.');
select public.pbl3_seed_descriptor('3SM-C5', 2, 'Sikap cukup: terdapat kekurangan kecil (mis. kurang fokus atau kurang responsif terhadap masukan).');
select public.pbl3_seed_descriptor('3SM-C5', 1, 'Sikap kurang: terlambat, tidak mengikuti jalannya seminar, atau kurang sopan.');

-- ------------------------------------------------------------
-- 6. Duplicate-block trigger for PBL 3 (mirrors user-approved PBL 2 trigger,
--    scoped ONLY to component_code LIKE '3%' — PBL 1 / PBL 2 / SP untouched).
--    The app converts 23505 into a re-fetch + update ("no rejection" UX).
-- ------------------------------------------------------------
create or replace function public.pbl3_score_no_dup()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1 from public.pbl_assessment_instances i
    where i.id = new.instance_id and i.component_code like '3%'
  ) and new.student_id is not null then
    perform pg_advisory_xact_lock(
      hashtext('pbl3_score:' || new.instance_id::text || ':' || new.student_id::text)
    );
    if exists (
      select 1 from public.pbl_assessment_scores s
      where s.instance_id = new.instance_id and s.student_id = new.student_id
    ) then
      raise exception 'duplicate PBL3 score row (instance %, student %)',
        new.instance_id, new.student_id using errcode = '23505';
    end if;
  end if;
  return new;
end; $$;

drop trigger if exists trg_pbl3_score_no_dup on public.pbl_assessment_scores;
create trigger trg_pbl3_score_no_dup
before insert on public.pbl_assessment_scores
for each row execute function public.pbl3_score_no_dup();

-- Cleanup helper (kept for re-runs)
drop function if exists public.pbl3_seed_descriptor(text, smallint, text);
