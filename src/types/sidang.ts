// Sidang Skripsi S1 Kesmas types - replicates the Seminar Proposal module
// architecture (pbl_groups + pbl_assessors + shared blueprint tables) with
// component code prefix "SID-" so it can never collide with PBL 1 (I1..E2),
// PBL 2 ("2*"), PBL 3 ("3*") or Seminar Proposal ("SP-*").
//
// Form source: "Form Penilaian Sidang Skripsi Prodi Kesehatan Masyarakat.xlsx"
//   - 3 examiners fill the SAME 10-parameter form:
//       Ketua Penguji / Anggota Penguji I / Anggota Penguji II
//   - per-parameter Skor Nilai 2.75-4.00 (decimal bands per Petunjuk sheet)
//   - NILAI AKHIR = (Total Skor Nilai x Bobot) / 4
//   - Rekap: Rerata = (Ketua + Anggota I + Anggota II) / 3,
//     Total Hasil Sidang Skripsi (55%) = Rerata x 0.55
//   - bands: 85+ = A (4.00), 80-84.99 = A- (3.75), 75-79.99 = B+ (3.50),
//            70-74.99 = B (3.00), <70 = TIDAK LULUS
//
// Assessor roles reuse the existing pbl_assessors CHECK constraint
// ('pembimbing_1','pembimbing_2','penguji_1','penguji_2','koordinator'):
//   penguji_1    -> Ketua Penguji
//   penguji_2    -> Anggota Penguji I
//   pembimbing_2 -> Anggota Penguji II (relabel)
//   pembimbing_1 -> Dosen Pembimbing (no scoring form - header field only)

import type {
  PblGroup,
  PblGroupMember,
  PblAssessor,
  PblAssessmentScore,
  PblRubricRating,
  PblAssessmentInstance,
  PblRubricDescriptor,
  PblPerformanceLevel,
  PblGroupStatus,
  PblInstanceState,
} from '@/types/pbl1';

export type {
  PblGroup,
  PblGroupMember,
  PblAssessor,
  PblAssessmentScore,
  PblRubricRating,
  PblAssessmentInstance,
  PblRubricDescriptor,
  PblPerformanceLevel,
  PblGroupStatus,
  PblInstanceState,
};

export type SidangComponentCode = 'SID-SKR';

export const SIDANG_COMPONENT_CODE: SidangComponentCode = 'SID-SKR';
export const SIDANG_BLUEPRINT_VERSION = 'sidang-v1';
export const SIDANG_GROUP_PREFIX = 'SIDANG-';

// ── Assessor roles ─────────────────────────────────────────────────────────
export type SidangExaminerRole = 'penguji_1' | 'penguji_2' | 'pembimbing_2';

export const SIDANG_EXAMINER_ROLES: SidangExaminerRole[] = ['penguji_1', 'penguji_2', 'pembimbing_2'];

export const SIDANG_ROLE_LABELS: Record<SidangExaminerRole, string> = {
  penguji_1: 'Ketua Penguji',
  penguji_2: 'Anggota Penguji I',
  pembimbing_2: 'Anggota Penguji II',
};

export const SIDANG_ROLE_SHORT: Record<SidangExaminerRole, string> = {
  penguji_1: 'Ketua Penguji',
  penguji_2: 'Anggota I',
  pembimbing_2: 'Anggota II',
};

export const SIDANG_PEMBIMBING_LABEL = 'Dosen Pembimbing';

// Tab keys for the session page (no tangkapan layar - sidang is not scored
// via screencapture; tanggal/tempat ujian are display-only until scheduled)
export type SidangTab =
  | 'berita-acara'
  | 'penguji_1'
  | 'penguji_2'
  | 'pembimbing_2'
  | 'rekap'
  | 'preview';

// ── Blueprint (loaded from DB) ─────────────────────────────────────────────
export interface SidangAssessmentComponent {
  id: string;
  code: SidangComponentCode;
  name: string;
  rps_weight: number;
  cpmk_code: string;
  default_scope: string;
  assessor_role: string | null;
  active: boolean;
  locked: boolean;
  display_order: number;
}

export interface SidangRubricCriterion {
  id: string;
  component_code: SidangComponentCode;
  code: string;
  name: string;
  evidence_guidance: string | null;
  internal_weight: number;
  criterion_order: number;
  critical_for_reconciliation: boolean;
  active: boolean;
}

export interface SidangBlueprint {
  component: SidangAssessmentComponent | null;
  criteria: SidangRubricCriterion[];
  performanceLevels: PblPerformanceLevel[];
  descriptors: PblRubricDescriptor[];
}

// ── Grade bands (Form "Keterangan") ────────────────────────────────────────
export const SIDANG_GRADE_BANDS: { min: number; max: number; huruf: string; skala: string }[] = [
  { min: 85, max: 100, huruf: 'A', skala: '4.00' },
  { min: 80, max: 84.99, huruf: 'A-', skala: '3.75' },
  { min: 75, max: 79.99, huruf: 'B+', skala: '3.50' },
  { min: 70, max: 74.99, huruf: 'B', skala: '3.00' },
];

export function sidangGrade(nilai: number | null): { huruf: string; skala: string } | null {
  if (nilai === null || isNaN(nilai)) return null;
  for (const b of SIDANG_GRADE_BANDS) {
    if (nilai >= b.min && nilai <= b.max) return { huruf: b.huruf, skala: b.skala };
  }
  return { huruf: 'TIDAK LULUS', skala: '-' };
}

export const SIDANG_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Terjadwal',
  in_progress: 'Berlangsung',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

// ── Band options per parameter (Petunjuk Penilaian sheet) ──────────────────
// pbl_rubric_descriptors.level_value is SMALLINT (integers only), so the
// decimal band options (4,00 / 3,50 / 3,00 / 2,75) live here instead of the
// descriptors table. Radio click stores the band value directly in
// pbl_rubric_ratings.level_value (numeric(3,2)); the direct input allows
// in-band refinement (e.g. 3,75). Points = skor x bobot / 4.
export interface SidangBandLevel {
  value: number;
  label: string;
  descriptor: string;
}

const B = (n: string, text: string): SidangBandLevel => ({
  value: Number(n),
  label: n === '4' ? 'Memenuhi Seluruh Kriteria' : n === '3.5' ? 'Memenuhi Sebagian Besar' : n === '3' ? 'Memenuhi Sebagian' : 'Kurang Memenuhi',
  descriptor: text,
});

export const SIDANG_BAND_LEVELS: Record<string, SidangBandLevel[]> = {
  'SID-SKR-C1': [ // Abstrak (5 kriteria)
    B('4', 'Memenuhi 5 kriteria (skor 4,00).'),
    B('3.5', 'Memenuhi 3-4 kriteria (skor 3,50-3,99).'),
    B('3', 'Memenuhi 2 kriteria (skor 3,00-3,49).'),
    B('2.75', 'Memenuhi 1 kriteria (skor 2,75-2,99).'),
  ],
  'SID-SKR-C2': [ // Tema dan Judul (2 kriteria)
    B('4', 'Memenuhi 2 kriteria (skor 4,00).'),
    B('3.5', 'Memenuhi 2 kriteria namun tidak sempurna (skor 3,50-3,99).'),
    B('3', 'Memenuhi 1 kriteria (skor 3,00-3,49).'),
    B('2.75', 'Tidak memenuhi kriteria (skor 2,75-2,99).'),
  ],
  'SID-SKR-C3': [ // Pendahuluan (2 kriteria)
    B('4', 'Memenuhi 2 kriteria (skor 4,00).'),
    B('3.5', 'Memenuhi 2 kriteria namun tidak sempurna (skor 3,50-3,99).'),
    B('3', 'Memenuhi 1 kriteria (skor 3,00-3,49).'),
    B('2.75', 'Tidak memenuhi kriteria (skor 2,75-2,99).'),
  ],
  'SID-SKR-C4': [ // Tinjauan Pustaka (3 kriteria)
    B('4', 'Memenuhi 3 kriteria (skor 4,00).'),
    B('3.5', 'Memenuhi 2 kriteria (skor 3,50-3,99).'),
    B('3', 'Memenuhi 1 kriteria (skor 3,00-3,49).'),
    B('2.75', 'Tidak memenuhi kriteria (skor 2,75-2,99).'),
  ],
  'SID-SKR-C5': [ // Metode Penelitian (8 kriteria)
    B('4', 'Memenuhi 8 kriteria (skor 4,00).'),
    B('3.5', 'Memenuhi 5-7 kriteria (skor 3,50-3,99).'),
    B('3', 'Memenuhi 3-4 kriteria (skor 3,00-3,49).'),
    B('2.75', 'Memenuhi 1-2 kriteria (skor 2,75-2,99).'),
  ],
  'SID-SKR-C6': [ // Hasil Penelitian dan Pembahasan (3 kriteria)
    B('4', 'Memenuhi 3 kriteria (skor 4,00).'),
    B('3.5', 'Memenuhi 2 kriteria (skor 3,50-3,99).'),
    B('3', 'Memenuhi 1 kriteria (skor 3,00-3,49).'),
    B('2.75', 'Tidak memenuhi kriteria (skor 2,75-2,99).'),
  ],
  'SID-SKR-C7': [ // Penutup (2 kriteria)
    B('4', 'Memenuhi 2 kriteria (skor 4,00).'),
    B('3.5', 'Memenuhi 2 kriteria namun tidak sempurna (skor 3,50-3,99).'),
    B('3', 'Memenuhi 1 kriteria (skor 3,00-3,49).'),
    B('2.75', 'Tidak memenuhi kriteria (skor 2,75-2,99).'),
  ],
  'SID-SKR-C8': [ // Daftar Pustaka (4 kriteria)
    B('4', 'Memenuhi 4 kriteria (skor 4,00).'),
    B('3.5', 'Memenuhi 3 kriteria (skor 3,50-3,99).'),
    B('3', 'Memenuhi 2 kriteria (skor 3,00-3,49).'),
    B('2.75', 'Memenuhi 1 kriteria (skor 2,75-2,99).'),
  ],
  'SID-SKR-C9': [ // Lampiran (6 kriteria)
    B('4', 'Memenuhi 6 kriteria (skor 4,00).'),
    B('3.5', 'Memenuhi 4-5 kriteria (skor 3,50-3,99).'),
    B('3', 'Memenuhi 2-3 kriteria (skor 3,00-3,49).'),
    B('2.75', 'Memenuhi 1 kriteria (skor 2,75-2,99).'),
  ],
  'SID-SKR-C10': [ // Presentasi dan Responsi (7 kriteria)
    B('4', 'Memenuhi 7 kriteria (skor 4,00).'),
    B('3.5', 'Memenuhi 5-6 kriteria (skor 3,50-3,99).'),
    B('3', 'Memenuhi 3-4 kriteria (skor 3,00-3,49).'),
    B('2.75', 'Memenuhi 1-2 kriteria (skor 2,75-2,99).'),
  ],
};
