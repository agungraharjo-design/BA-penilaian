// S2 Kesmas Types - Separate from S1 types
// Per requirements: keep S1 and S2 domain types separate

export type S2ExamType = 'proposal' | 'hasil' | 'sidang';

export type S2SessionStatus =
  | 'draft'
  | 'scheduled'
  | 'in_progress'
  | 'completed'
  | 'cancelled';

export type S2PersonRole =
  | 'pembimbing_1'
  | 'pembimbing_2'
  | 'ketua_penguji'
  | 'anggota_penguji_1'
  | 'anggota_penguji_2'
  | 'anggota_penguji_3'
  | 'koordinator';

export type S2ProposalDecision =
  | 'lulus_dengan_perbaikan'
  | 'tidak_lulus_mengulang'
  | null;

export interface S2Session {
  id: string;
  exam_type: S2ExamType;
  status: S2SessionStatus;

  student_name: string;
  student_nim: string;
  thesis_title: string;
  specialization: string;
  study_program: string;
  degree_program: string;

  semester: string;
  academic_year: string;

  exam_date: string | null;
  start_time: string | null;
  end_time: string | null;
  venue: string;

  hari_tanggal: string;
  ta: string;
  tanggal_ba: string;
  koordinator: string;
  nip_koordinator: string;

  decision: S2ProposalDecision;
  report_notes: string;
  script_presentation_minutes: number | null;
  rubric_version: string;

  attendance_open: boolean;
  public_attendance_token: string;

  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface S2SessionPerson {
  id: string;
  session_id: string;
  role: S2PersonRole;
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

export interface S2Score {
  id: string;
  session_id: string;
  examiner_person_id: string;
  criterion_code: string;
  criterion_label_snapshot: string;
  weight_snapshot: number;
  score: number | null;
  notes: string;
  submitted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface S2Attendance {
  id: string;
  session_id: string;
  attendance_type: 'peserta' | 'audiens';
  name: string;
  nim: string;
  signature_path: string | null;
  notes: string;
  submitted_by: string | null;
  submitted_at: string;
  created_at: string;
  updated_at: string;
}

// Helper types for UI
export interface S2SessionWithRelations extends S2Session {
  people?: S2SessionPerson[];
  scores?: S2Score[];
  attendance?: S2Attendance[];
}

// Role display labels
export const S2_ROLE_LABELS: Record<S2PersonRole, string> = {
  pembimbing_1: 'Dosen Pembimbing 1',
  pembimbing_2: 'Dosen Pembimbing 2',
  ketua_penguji: 'Ketua Penguji',
  anggota_penguji_1: 'Anggota Penguji 1',
  anggota_penguji_2: 'Anggota Penguji 2',
  anggota_penguji_3: 'Anggota Penguji 3',
  koordinator: 'Koordinator',
};

// Examiner roles in order for tabs
export const S2_EXAMINER_ROLES: S2PersonRole[] = [
  'ketua_penguji',
  'anggota_penguji_1',
  'anggota_penguji_2',
  'anggota_penguji_3',
];

export const S2_EXAMINER_TAB_LABELS: Partial<Record<S2PersonRole, string>> = {
  ketua_penguji: 'Penilaian Ketua Penguji',
  anggota_penguji_1: 'Penilaian Anggota Penguji 1',
  anggota_penguji_2: 'Penilaian Anggota Penguji 2',
  anggota_penguji_3: 'Penilaian Anggota Penguji 3',
};

// Session status labels
export const S2_STATUS_LABELS: Record<S2SessionStatus, string> = {
  draft: 'Draft',
  scheduled: 'Terjadwal',
  in_progress: 'Berlangsung',
  completed: 'Selesai',
  cancelled: 'Dibatalkan',
};

// Exam type labels
export const S2_EXAM_TYPE_LABELS: Record<S2ExamType, string> = {
  proposal: 'Seminar Proposal Tesis',
  hasil: 'Seminar Hasil Tesis',
  sidang: 'Sidang Tesis',
};

// Decision labels
export const S2_DECISION_LABELS: Record<Exclude<S2ProposalDecision, null>, string> = {
  lulus_dengan_perbaikan: 'Lulus dengan Perbaikan',
  tidak_lulus_mengulang: 'Tidak Lulus Mengulang',
};