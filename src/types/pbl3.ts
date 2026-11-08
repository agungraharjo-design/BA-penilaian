// PBL 3 Kesmas Types - Pengalaman Belajar Lapangan 3
//
// Final RPS PBL 3 (RPS-Pengalaman-Belajar-Lapangan-3-S1-Kesehatan-Masyarakat-
// 2026-2027-Ganjil, disahkan 01 Agustus 2026) grading model:
//   CPMK 1  Aktivitas & laporan oleh Pembimbing Lapangan ........ 40%
//           (paper form "2. Form Penilaian Aktivitas Peserta PBL 3 -
//            Pemb Lapangan" — diisi pembimbing lapangan di instansi,
//            angka akhirnya di-seed ke database, TANPA rubrik aplikasi)
//   CPMK 2  Penilaian Aktivitas oleh Dosen Pembimbing ............ 20%
//   CPMK 3  Penilaian Laporan oleh Dosen Pembimbing .............. 20%
//           (SEPARATE rubrics — user decision 2026-10-30. The 7 aspek of the
//            paper Form 3 sheet "Aktivitas dan Laporan" are distributed by
//            nature: proses/sikap aspek → Aktivitas (3AK: administrasi 30,
//            pembimbingan 30, etika 40), dokumen/produk aspek → Laporan
//            (3LP: gambaran instansi 25, kedalaman 30, bidang fokus 30,
//            format 15); each component's aspek sum to 100.)
//   CPMK 4  Seminar Laporan oleh Dosen Penguji ................... 10%
//   CPMK 5  Seminar Laporan oleh Dosen Pembimbing ................ 10%
//           (lembar SEMINAR LAPORAN — 5 aspek, di-rubrikkan)
//
// Component codes start with "3" so they cannot collide with PBL 1 (I1..E2),
// PBL 2 ("2*") or Seminar Proposal (SP-*); the PBL 2 duplicate-block trigger
// (component_code LIKE '2%') therefore never fires for PBL 3 rows.
//
// ⚠ DB legacy constraints (20260801_create_pbl_module.sql) — do not widen:
//   pbl_assessment_components.cpmk_code CHECK allows only 'CPMK1'|'CPMK2',
//   so rows store the closest legal bucket and the REAL RPS CPMK label for
//   the UI comes from PBL3_CPMK_LABELS below, never from the DB column.

import type {
  PblGroup,
  PblGroupMember,
  PblAssessor,
  PblAssessmentScore,
  PblRubricRating,
  PblPeerFinalScore,
  PblRubricDescriptor,
  PblPerformanceLevel,
  PblAssessorRole,
  PblGroupStatus,
  PblInstanceState,
} from '@/types/pbl1';

export type {
  PblGroup,
  PblGroupMember,
  PblAssessor,
  PblAssessmentScore,
  PblRubricRating,
  PblPeerFinalScore,
  PblRubricDescriptor,
  PblPerformanceLevel,
  PblAssessorRole,
  PblGroupStatus,
  PblInstanceState,
};

// 3PL  = Pembimbing Lapangan (seeded, no rubric)
// 3AK  = Penilaian Aktivitas — Dosen Pembimbing (rubric, 20%, CPMK 2)
// 3LP  = Penilaian Laporan — Dosen Pembimbing (rubric, 20%, CPMK 3)
// 3SP  = Seminar Laporan — Dosen Penguji (rubric, 10%)
// 3SM  = Seminar Laporan — Dosen Pembimbing (rubric, 10%)
export type Pbl3ComponentCode = '3PL' | '3AK' | '3LP' | '3SP' | '3SM';

export const PBL3_BLUEPRINT_VERSION = 'pbl3-rps-v1';

// Rubric components per assessor role. Dosen Pembimbing owns three forms
// (aktivitas 20% + laporan 20% + seminar 10%), Dosen Penguji owns one (10%).
export const PBL3_PENGUJI_COMPONENTS: Pbl3ComponentCode[] = ['3SP'];
export const PBL3_PEMBIMBING_COMPONENTS: Pbl3ComponentCode[] = ['3AK', '3LP', '3SM'];

// Assessor roles used by PBL 3 (subset of the existing pbl_assessors CHECK):
//   penguji_1    -> Dosen Penguji seminar (from Keputusan Rektor PBL 3)
//   pembimbing_1 -> Dosen Pembimbing kelompok
export const PBL3_ROLES = ['penguji_1', 'pembimbing_1'] as const;
export type Pbl3Role = (typeof PBL3_ROLES)[number];

export const PBL3_ROLE_LABELS: Record<Pbl3Role, string> = {
  penguji_1: 'Dosen Penguji',
  pembimbing_1: 'Dosen Pembimbing',
};

// RPS CPMK labels shown in the UI (DB cpmk_code column cannot hold CPMK3..5).
export const PBL3_CPMK_LABELS: Record<Pbl3ComponentCode, string> = {
  '3PL': 'CPMK 1',
  '3AK': 'CPMK 2',
  '3LP': 'CPMK 3',
  '3SP': 'CPMK 4',
  '3SM': 'CPMK 5',
};

// Bobot display per RPS: each rubric component is one RPS item.
export const PBL3_COMPONENT_BOBOT_LABELS: Record<Pbl3ComponentCode, string> = {
  '3PL': '40%',
  '3AK': '20%',
  '3LP': '20%',
  '3SP': '10%',
  '3SM': '10%',
};

// ── Blueprint (loaded from DB) ──────────────────────────────

export interface Pbl3AssessmentComponent {
  id: string;
  code: Pbl3ComponentCode;
  name: string;
  rps_weight: number;
  cpmk_code: string;
  default_scope: string;
  assessor_role: string | null;
  active: boolean;
  locked: boolean;
  display_order: number;
}

export interface Pbl3RubricCriterion {
  id: string;
  component_code: Pbl3ComponentCode;
  code: string;
  name: string;
  evidence_guidance: string | null;
  internal_weight: number;
  criterion_order: number;
  critical_for_reconciliation: boolean;
  active: boolean;
}

export interface Pbl3AssessmentInstance {
  id: string;
  group_id: string;
  component_code: Pbl3ComponentCode;
  rubric_version: string;
  assessor_role: string | null;
  assessor_user_id: string | null;
  status: PblInstanceState;
  finalized_at: string | null;
  finalized_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Pbl3Blueprint {
  components: Pbl3AssessmentComponent[];
  criteria: Pbl3RubricCriterion[];
  performanceLevels: PblPerformanceLevel[];
  descriptors: PblRubricDescriptor[];
}

// ── Display labels (Form 3 + RPS wording) ───────────────────

export const PBL3_COMPONENT_LABELS: Record<Pbl3ComponentCode, string> = {
  '3PL': 'Nilai Aktivitas Peserta — Pembimbing Lapangan',
  '3AK': 'Penilaian Aktivitas — Dosen Pembimbing',
  '3LP': 'Penilaian Laporan — Dosen Pembimbing',
  '3SP': 'Penilaian Seminar Laporan — Dosen Penguji',
  '3SM': 'Penilaian Seminar Laporan — Dosen Pembimbing',
};

// Final RPS weights (page 3, "Penilaian dan Korelasinya dengan CPMK").
// Aktivitas and Laporan are SEPARATE components, each with its own rubric.
export const PBL3_COMPONENT_WEIGHTS: Record<Pbl3ComponentCode, number> = {
  '3PL': 0.4,
  '3AK': 0.2,
  '3LP': 0.2,
  '3SP': 0.1,
  '3SM': 0.1,
};

export const PBL3_ALL_COMPONENTS: Pbl3ComponentCode[] = ['3PL', '3AK', '3LP', '3SP', '3SM'];

// Short display code shown in recap table columns (mirrors rekap layout).
export const PBL3_COMPONENT_SHORT: Record<Pbl3ComponentCode, string> = {
  '3PL': 'PL',
  '3AK': 'AKT',
  '3LP': 'LAP',
  '3SP': 'SP',
  '3SM': 'SM',
};

// ── Rekapitulasi columns — RPS "Penilaian dan Korelasinya dengan CPMK" ─────
// Five evaluation items in RPS order, each with its own score:
//   CPMK 1  Aktivitas & laporan — Pembimbing Lapangan .... 40%
//   CPMK 2  Penilaian Aktivitas — Dosen Pembimbing ........ 20%
//   CPMK 3  Penilaian Laporan — Dosen Pembimbing .......... 20%
//   CPMK 4  Seminar laporan — Dosen Penguji ................ 10%
//   CPMK 5  Seminar — Dosen Pembimbing .................... 10%
// (Total bobot per CPMK: 40 / 20 / 20 / 10 / 10.)
export const PBL3_REKAP_COLS: { code: Pbl3ComponentCode; label: string; group: string }[] = [
  { code: '3PL', label: 'PL (40%)', group: 'AKTIVITAS & LAPORAN — PEMBIMBING LAPANGAN · CPMK 1' },
  { code: '3AK', label: 'AKT (20%)', group: 'PENILAIAN AKTIVITAS — DOSEN PEMBIMBING · CPMK 2' },
  { code: '3LP', label: 'LAP (20%)', group: 'PENILAIAN LAPORAN — DOSEN PEMBIMBING · CPMK 3' },
  { code: '3SP', label: 'SP (10%)', group: 'SEMINAR LAPORAN — DOSEN PENGUJI · CPMK 4' },
  { code: '3SM', label: 'SM (10%)', group: 'SEMINAR — DOSEN PEMBIMBING · CPMK 5' },
];

// CPMK totals row of the RPS mapping table (for the rekap footnote).
export const PBL3_CPMK_TOTALS =
  'CPMK 1 40% · CPMK 2 20% · CPMK 3 20% · CPMK 4 10% · CPMK 5 10%';

// ── Grade bands (paper form "Keterangan Sistem Penilaian") ──
export const PBL3_GRADE_BANDS: { min: number; max: number; huruf: string }[] = [
  { min: 85, max: 100, huruf: 'A' },
  { min: 80, max: 84.99, huruf: 'A-' },
  { min: 75, max: 79.99, huruf: 'B+' },
  { min: 70, max: 74.99, huruf: 'B' },
  { min: 65, max: 69.99, huruf: 'B-' },
  { min: 60, max: 64.99, huruf: 'C+' },
  { min: 55, max: 59.99, huruf: 'C' },
  { min: 40, max: 54.99, huruf: 'D' },
  { min: 0, max: 39.99, huruf: 'E' },
];

// ── Tab keys ────────────────────────────────────────────────
export type Pbl3Tab =
  | 'berita-acara'
  | 'form-penguji'
  | 'form-pembimbing'
  | 'pembimbing-lapangan'
  | 'daftar-hadir'
  | 'dokumentasi'
  | 'rekap'
  | 'preview';

// ── Dokumentasi Foto & Daftar Hadir (evidence jsonb) ────────
// Stored under pbl_groups.evidence.pbl3 (SP owns "screenshot"; PBL 3 groups
// are never opened by the SP page, but we still merge-read/merge-write so
// unknown keys survive).
export interface Pbl3DokumentasiRow {
  nama: string;
  jabatan: string;
  bukti: string | null;
}

export interface Pbl3Dokumentasi {
  hadir: Pbl3DokumentasiRow[];
  kegiatan: Pbl3DokumentasiRow[];
  overall: string | null;
}

export const PBL3_DOKUMENTASI_HADIR_SLOTS = ['penguji', 'pembimbing', 'mahasiswa'] as const;
export const PBL3_DOKUMENTASI_KEGIATAN_SLOTS = ['kegiatan_1', 'kegiatan_2', 'kegiatan_3'] as const;

export interface Pbl3Kehadiran {
  penguji_1: 'Hadir' | 'Tidak Hadir';
  pembimbing_1: 'Hadir' | 'Tidak Hadir';
  catatan: string;
}

export interface Pbl3Evidence {
  kehadiran: Pbl3Kehadiran;
  dokumentasi: Pbl3Dokumentasi;
}

export function emptyKehadiran(): Pbl3Kehadiran {
  return { penguji_1: 'Hadir', pembimbing_1: 'Hadir', catatan: '' };
}

export function emptyDokumentasi(): Pbl3Dokumentasi {
  return {
    hadir: [
      { nama: '', jabatan: 'Dosen Penguji', bukti: null },
      { nama: '', jabatan: 'Dosen Pembimbing', bukti: null },
      { nama: '', jabatan: 'Mahasiswa', bukti: null },
    ],
    kegiatan: [
      { nama: '', jabatan: 'Dokumentasi Kegiatan 1', bukti: null },
      { nama: '', jabatan: 'Dokumentasi Kegiatan 2', bukti: null },
      { nama: '', jabatan: 'Dokumentasi Kegiatan 3', bukti: null },
    ],
    overall: null,
  };
}

export function parseEvidence(raw: unknown): { kehadiran: Pbl3Kehadiran; dokumentasi: Pbl3Dokumentasi } {
  const kehadiran = emptyKehadiran();
  const dokumentasi = emptyDokumentasi();
  if (!raw || typeof raw !== 'object') return { kehadiran, dokumentasi };
  const pbl3 = (raw as Record<string, unknown>).pbl3 as Record<string, unknown> | undefined;
  if (!pbl3) return { kehadiran, dokumentasi };
  const k = pbl3.kehadiran as Partial<Pbl3Kehadiran> | undefined;
  if (k) {
    kehadiran.penguji_1 = k.penguji_1 === 'Tidak Hadir' ? 'Tidak Hadir' : 'Hadir';
    kehadiran.pembimbing_1 = k.pembimbing_1 === 'Tidak Hadir' ? 'Tidak Hadir' : 'Hadir';
    kehadiran.catatan = typeof k.catatan === 'string' ? k.catatan : '';
  }
  const d = pbl3.dokumentasi as Partial<Pbl3Dokumentasi> | undefined;
  if (d) {
    const mergeRows = (rows: unknown, base: Pbl3DokumentasiRow[]): Pbl3DokumentasiRow[] =>
      Array.isArray(rows) && rows.length
        ? rows.map((r, i) => ({
            nama: (r as Pbl3DokumentasiRow)?.nama ?? base[i]?.nama ?? '',
            jabatan: (r as Pbl3DokumentasiRow)?.jabatan ?? base[i]?.jabatan ?? '',
            bukti: (r as Pbl3DokumentasiRow)?.bukti ?? null,
          }))
        : base;
    dokumentasi.hadir = mergeRows(d.hadir, dokumentasi.hadir);
    dokumentasi.kegiatan = mergeRows(d.kegiatan, dokumentasi.kegiatan);
    dokumentasi.overall = d.overall ?? null;
  }
  return { kehadiran, dokumentasi };
}
