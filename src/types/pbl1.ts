// PBL 1 Kesmas Types - Pengalaman Belajar Lapangan 1
// RPS-Final Aligned assessment module, separate domain types.

export type PblGroupStatus =
  | 'draft'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type PblAssessorRole =
  | 'pembimbing_1'
  | 'pembimbing_2'
  | 'penguji_1'
  | 'penguji_2'
  | 'koordinator';

export type PblCpmkCode = 'CPMK1' | 'CPMK2';

export type PblComponentCode = 'I1' | 'I2' | 'P1' | 'B1' | 'B2' | 'E1' | 'E2';

export type PblScope = 'INDIVIDUAL' | 'GROUP';

export type PblInstanceState =
  | 'DRAFT'
  | 'READY_FOR_REVIEW'
  | 'FINALIZED'
  | 'UNLOCKED_FOR_REVISION'
  | 'REVISED';

export interface PblGroup {
  id: string;
  code: string;
  name: string;
  field_location: string;

  semester: string;
  academic_year: string;
  status: PblGroupStatus;

  hari_tanggal: string;
  tanggal_ba: string;
  start_time: string;
  end_time: string;
  venue: string;
  title: string;
  minutes: string;

  decision: string;
  report_notes: string;

  koordinator: string;
  nip_koordinator: string;
  koordinator_signature_path: string | null;

  blueprint_version: string;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PblGroupMember {
  id: string;
  group_id: string;
  student_id: string | null;
  nim: string;
  name: string;
  role: 'member' | 'leader';
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PblAssessor {
  id: string;
  group_id: string;
  assessor_role: PblAssessorRole;
  user_id: string | null;
  profile_id: string | null;
  display_name: string;
  nip: string;
  email: string;
  signature_path: string | null;
  sequence_no: number;
  created_at: string;
  updated_at: string;
}

export interface PblAssessmentComponent {
  id: string;
  code: PblComponentCode;
  name: string;
  rps_weight: number;
  cpmk_code: PblCpmkCode;
  default_scope: PblScope;
  assessor_role: string | null;
  active: boolean;
  locked: boolean;
  display_order: number;
}

export interface PblRubricCriterion {
  id: string;
  component_code: PblComponentCode;
  code: string;
  name: string;
  evidence_guidance: string | null;
  internal_weight: number;
  criterion_order: number;
  critical_for_reconciliation: boolean;
  active: boolean;
}

export interface PblRubricDescriptor {
  id: string;
  criterion_id: string;
  level_value: number;
  level_label: string;
  descriptor_text: string;
  scoring_note: string | null;
  display_order: number;
}

export interface PblPerformanceLevel {
  id: string;
  level_value: number;
  label: string;
  descriptor: string;
  display_order: number;
}

export interface PblAssessmentInstance {
  id: string;
  group_id: string;
  component_code: PblComponentCode;
  rubric_version: string;
  assessor_role: string | null;
  assessor_user_id: string | null;
  status: PblInstanceState;
  finalized_at: string | null;
  finalized_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PblAssessmentScore {
  id: string;
  instance_id: string;
  student_id: string | null;
  calculated_raw_score: number | null;
  final_raw_score: number | null;
  score_source: string;
  override_reason: string | null;
  evidence_summary: string | null;
  entered_by: string | null;
  entered_at: string;
  updated_at: string;
}

export interface PblRubricRating {
  id: string;
  assessment_score_id: string;
  criterion_id: string;
  level_value: number;
  criterion_points: number | null;
  evidence_note: string | null;
  selected_descriptor_snapshot: string | null;
  created_at: string;
  updated_at: string;
}

export interface PblPeerFinalScore {
  id: string;
  group_id: string;
  student_id: string;
  final_peer_score: number;
  source_method: string;
  respondent_count: number;
  expected_respondent_count: number | null;
  aggregation_method: string;
  source_reference: string | null;
  entered_by: string | null;
  entered_at: string;
  verified_by: string | null;
  verified_at: string | null;
  verification_note: string | null;
  status: 'DRAFT' | 'FINALIZED';
  updated_at: string;
}

// Aggregated detail for a group workspace
export interface PblGroupWithRelations extends PblGroup {
  members?: PblGroupMember[];
  assessors?: PblAssessor[];
  instances?: PblAssessmentInstance[];
  scores?: PblAssessmentScore[];
  ratings?: PblRubricRating[];
  peer_final_scores?: PblPeerFinalScore[];
}

// RPS blueprint with criteria attached (loaded from DB)
export interface PblBlueprint {
  components: PblAssessmentComponent[];
  criteria: PblRubricCriterion[];
  performanceLevels: PblPerformanceLevel[];
  descriptors: PblRubricDescriptor[];
}

// ── Display labels ─────────────────────────────────────────

export const PBL_ROLE_LABELS: Record<PblAssessorRole, string> = {
  pembimbing_1: 'Dosen Pembimbing 1',
  pembimbing_2: 'Dosen Pembimbing 2',
  penguji_1: 'Dosen Penguji 1',
  penguji_2: 'Dosen Penguji 2',
  koordinator: 'Koordinator',
};

export const PBL_STATUS_LABELS: Record<PblGroupStatus, string> = {
  draft: 'Draft',
  scheduled: 'Terjadwal',
  in_progress: 'Berlangsung',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

export const PBL_COMPONENT_LABELS: Record<PblComponentCode, string> = {
  I1: 'Laporan Keluarga Binaan',
  I2: 'Laporan Kasus Binaan',
  P1: 'Penilaian Sesama Mahasiswa',
  B1: 'Kegiatan Pelaksanaan (Pembimbing)',
  B2: 'Presentasi Kelompok (Pembimbing)',
  E1: 'Kegiatan Pelaksanaan (Penguji)',
  E2: 'Presentasi Kelompok (Penguji)',
};

export const PBL_COMPONENT_WEIGHTS: Record<PblComponentCode, number> = {
  I1: 0.15,
  I2: 0.25,
  P1: 0.10,
  B1: 0.175,
  B2: 0.175,
  E1: 0.075,
  E2: 0.075,
};

export const PBL_ALL_COMPONENTS: PblComponentCode[] = ['I1', 'I2', 'P1', 'B1', 'B2', 'E1', 'E2'];