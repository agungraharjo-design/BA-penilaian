// PBL 2 Kesmas Types - Pengalaman Belajar Lapangan 2
// RPS PBL 2 2026/2027 aligned: same weight architecture as PBL 1,
// but component descriptions and kriteria come from the PBL 2 sources
// (Penilaian Responsi Seminar PBL, Panduan PBL 2 2026, RPS PBL 2).

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
  PblCpmkCode,
  PblScope,
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
  PblCpmkCode,
  PblScope,
};

// PBL 2 component codes are distinct from PBL 1 (I1..E2) so both blueprints
// coexist in the shared blueprint tables without touching PBL 1 data.
export type Pbl2ComponentCode = '2I1' | '2I2' | '2P1' | '2B1' | '2B2' | '2E1' | '2E2';

export interface Pbl2AssessmentComponent {
  id: string;
  code: Pbl2ComponentCode;
  name: string;
  rps_weight: number;
  cpmk_code: PblCpmkCode;
  default_scope: PblScope;
  assessor_role: string | null;
  active: boolean;
  locked: boolean;
  display_order: number;
}

export interface Pbl2RubricCriterion {
  id: string;
  component_code: Pbl2ComponentCode;
  code: string;
  name: string;
  evidence_guidance: string | null;
  internal_weight: number;
  criterion_order: number;
  critical_for_reconciliation: boolean;
  active: boolean;
}

export interface Pbl2AssessmentInstance {
  id: string;
  group_id: string;
  component_code: Pbl2ComponentCode;
  rubric_version: string;
  assessor_role: string | null;
  assessor_user_id: string | null;
  status: PblInstanceState;
  finalized_at: string | null;
  finalized_by: string | null;
  created_at: string;
  updated_at: string;
}

// RPS blueprint with criteria attached (loaded from DB)
export interface Pbl2Blueprint {
  components: Pbl2AssessmentComponent[];
  criteria: Pbl2RubricCriterion[];
  performanceLevels: PblPerformanceLevel[];
  descriptors: PblRubricDescriptor[];
}

// ── Display labels (RPS PBL 2 component descriptions) ───────

export const PBL2_COMPONENT_LABELS: Record<Pbl2ComponentCode, string> = {
  '2I1': 'Laporan Keluarga Binaan',
  '2I2': 'Hasil Proyek Kasus Binaan',
  '2P1': 'Penilaian Sesama Mahasiswa',
  '2B1': 'Kegiatan Pelaksanaan PBL - Pembimbing',
  '2B2': 'Presentasi Kelompok - Dosen Pembimbing',
  '2E1': 'Kegiatan Pelaksanaan PBL - Penguji',
  '2E2': 'Presentasi Kelompok - Penguji',
};

export const PBL2_COMPONENT_WEIGHTS: Record<Pbl2ComponentCode, number> = {
  '2I1': 0.15,
  '2I2': 0.25,
  '2P1': 0.1,
  '2B1': 0.175,
  '2B2': 0.175,
  '2E1': 0.075,
  '2E2': 0.075,
};

export const PBL2_ALL_COMPONENTS: Pbl2ComponentCode[] = ['2I1', '2I2', '2P1', '2B1', '2B2', '2E1', '2E2'];

// Short display code shown in recap tables (mirrors the PBL 1 column layout)
export const PBL2_COMPONENT_SHORT: Record<Pbl2ComponentCode, string> = {
  '2I1': 'I1',
  '2I2': 'I2',
  '2P1': 'P1',
  '2B1': 'B1',
  '2B2': 'B2',
  '2E1': 'E1',
  '2E2': 'E2',
};
