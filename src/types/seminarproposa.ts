// Seminar Proposal Skripsi (S1 Kesmas) - types
//
// Reuses the PBL blueprint tables behind an SP- discriminator so PBL 1 / PBL 2
// are untouched (both look components up by explicit code, never by iteration):
//   pbl_groups.code                = 'SP-01' .. 'SP-22'
//   pbl_groups.blueprint_version   = 'sp-rps-v1'
//   pbl_assessment_components.code = 'SP-PROP'
//
// Examiner roles reuse the existing pbl_assessors CHECK constraint; the UI shows
// the Seminar Proposal labels below while the stored keys stay unchanged:
//   penguji_1    -> Penguji Utama (Ketua Penguji)
//   penguji_2    -> Penguji Pendamping
//   pembimbing_1 -> Anggota Penguji (Dosen Pembimbing)

import type {
  PblGroup,
  PblGroupMember,
  PblAssessor,
  PblAssessmentScore,
  PblRubricRating,
  PblAssessmentInstance,
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
  PblAssessmentInstance,
  PblRubricDescriptor,
  PblPerformanceLevel,
  PblAssessorRole,
  PblGroupStatus,
  PblInstanceState,
};

export type SpComponentCode = 'SP-PROP';

export const SP_BLUEPRINT_VERSION = 'sp-rps-v1';
export const SP_COMPONENT_CODE: SpComponentCode = 'SP-PROP';

// ── Assessor roles ─────────────────────────────────────────────────────────
export type SpAssessorRole = 'penguji_1' | 'penguji_2' | 'pembimbing_1';

export const SP_ASSESSOR_ROLES: SpAssessorRole[] = ['penguji_1', 'penguji_2', 'pembimbing_1'];

export const SP_ROLE_LABELS: Record<SpAssessorRole, string> = {
  penguji_1: 'Penguji Utama (Ketua Penguji)',
  penguji_2: 'Penguji Pendamping',
  pembimbing_1: 'Anggota Penguji (Dosen Pembimbing)',
};

export const SP_ROLE_SHORT: Record<SpAssessorRole, string> = {
  penguji_1: 'Penguji Utama',
  penguji_2: 'Penguji Pendamping',
  pembimbing_1: 'Anggota Penguji',
};

// Tab keys for the session page
export type SpTab =
  | 'berita-acara'
  | 'penguji_1'
  | 'penguji_2'
  | 'pembimbing_1'
  | 'rekap'
  | 'screenshot'
  | 'preview';

// ── Tangkapan Layar (online seminar evidence) ──────────────────────────────
// Stored as JSON in pbl_groups.minutes, which the Seminar Proposal module
// does not otherwise use (no DDL available to add a dedicated column).
export interface SpScreenshotRow {
  nama: string;
  jabatan: string;
  bukti: string | null;
}

export interface SpScreenshots {
  hadir: SpScreenshotRow[];
  overall: string | null;
}

export const SP_SCREENSHOT_SLOTS = [
  'ketua', 'anggota_2', 'anggota_3', 'mahasiswa', 'overall',
] as const;

export type SpScreenshotSlot = (typeof SP_SCREENSHOT_SLOTS)[number];

export function emptyScreenshots(mahasiswa = ''): SpScreenshots {
  return {
    hadir: [
      { nama: '', jabatan: 'PENGUJI I/Ketua Penguji', bukti: null },
      { nama: '', jabatan: 'PENGUJI II/Anggota Penguji', bukti: null },
      { nama: '', jabatan: 'PENGUJI III/Anggota Penguji', bukti: null },
      { nama: mahasiswa, jabatan: 'Mahasiswa', bukti: null },
    ],
    overall: null,
  };
}

export function parseScreenshots(raw: string | null | undefined, mahasiswa = ''): SpScreenshots {
  if (!raw) return emptyScreenshots(mahasiswa);
  try {
    const parsed = JSON.parse(raw) as Partial<SpScreenshots>;
    const base = emptyScreenshots(mahasiswa);
    return {
      hadir: Array.isArray(parsed.hadir) && parsed.hadir.length
        ? parsed.hadir.map((r, i) => ({
            nama: r?.nama ?? base.hadir[i]?.nama ?? '',
            jabatan: r?.jabatan ?? base.hadir[i]?.jabatan ?? '',
            bukti: r?.bukti ?? null,
          }))
        : base.hadir,
      overall: parsed.overall ?? null,
    };
  } catch {
    return emptyScreenshots(mahasiswa);
  }
}

// ── Assessment component ───────────────────────────────────────────────────
export interface SpAssessmentComponent {
  id: string;
  code: SpComponentCode;
  name: string;
  rps_weight: number;
  cpmk_code: string;
  default_scope: string;
  assessor_role: string | null;
  active: boolean;
  locked: boolean;
  display_order: number;
}

export interface SpRubricCriterion {
  id: string;
  component_code: SpComponentCode;
  code: string;
  name: string;
  evidence_guidance: string | null;
  internal_weight: number;
  criterion_order: number;
  critical_for_reconciliation: boolean;
  active: boolean;
}

export interface SpBlueprint {
  component: SpAssessmentComponent | null;
  criteria: SpRubricCriterion[];
  performanceLevels: PblPerformanceLevel[];
  descriptors: PblRubricDescriptor[];
}

// ── Display ────────────────────────────────────────────────────────────────
export const SP_COMPONENT_NAME = 'Penilaian Seminar Proposal Skripsi';

// Nilai Akhir = (Total Skor Nilai x Bobot) / 400 x 100
// The 7 bobot sum to 100 and are 2dp-exact, so a level-4 score is exactly
// 100.00 -- the rounding bug that hit PBL 2 cannot occur here.
export const SP_GRADE_BANDS: { min: number; max: number; huruf: string; skala: string }[] = [
  { min: 85, max: 100, huruf: 'A', skala: '4.00' },
  { min: 80, max: 84.99, huruf: 'A-', skala: '3.75' },
  { min: 75, max: 79.99, huruf: 'B+', skala: '3.50' },
  { min: 70, max: 74.99, huruf: 'B', skala: '3.00' },
];

export function spGrade(nilai: number | null): { huruf: string; skala: string } | null {
  if (nilai === null || isNaN(nilai)) return null;
  for (const b of SP_GRADE_BANDS) {
    if (nilai >= b.min && nilai <= b.max) return { huruf: b.huruf, skala: b.skala };
  }
  return { huruf: 'TIDAK LULUS', skala: '-' };
}

export const SP_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  scheduled: 'Terjadwal',
  in_progress: 'Berlangsung',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};
