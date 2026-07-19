// S2 Repository - Data access layer for S2 sessions
import { supabase } from '@/lib/supabase';
import type { S2Session, S2SessionPerson, S2Score, S2Attendance, S2ExamType } from '@/types/s2';

// ============================================================
// S2_SESSIONS
// ============================================================

export async function createS2Session(data: Partial<S2Session> & { student_name: string; student_nim: string }): Promise<S2Session | null> {
  const { data: row, error } = await supabase
    .from('s2_sessions')
    .insert(data)
    .select()
    .single();

  if (error) throw error;
  return (row as S2Session) ?? null;
}

export async function getS2Session(id: string): Promise<S2Session | null> {
  const { data, error } = await supabase
    .from('s2_sessions')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

export async function updateS2Session(id: string, data: Partial<S2Session>): Promise<S2Session | null> {
  const { data: row, error } = await supabase
    .from('s2_sessions')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return (row as S2Session) ?? null;
}

export async function listS2Sessions(filters?: {
  exam_type?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<S2Session[]> {
  let query = supabase
    .from('s2_sessions')
    .select('*')
    .order('created_at', { ascending: false });

  if (filters?.exam_type) {
    query = query.eq('exam_type', filters.exam_type);
  }
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  if (filters?.search) {
    query = query.or(`student_name.ilike.%${filters.search}%,student_nim.ilike.%${filters.search}%`);
  }
  if (filters?.limit) {
    query = query.limit(filters.limit);
  }
  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// ============================================================
// S2_SESSION_PEOPLE
// ============================================================

export async function addS2SessionPerson(data: {
  session_id: string;
  role: string;
  user_id?: string;
  display_name: string;
  nip: string;
  email?: string;
  signature_path?: string;
}): Promise<string | null> {
  const { data: row, error } = await supabase
    .from('s2_session_people')
    .insert(data)
    .select('id')
    .single();

  if (error) throw error;
  return (row as { id: string } | null)?.id ?? null;
}

export async function getS2SessionPeople(sessionId: string) {
  const { data, error } = await supabase
    .from('s2_session_people')
    .select('*')
    .eq('session_id', sessionId)
    .order('sequence_no');

  if (error) throw error;
  return data || [];
}

export async function updateS2SessionPerson(id: string, data: Partial<{
  role: string;
  display_name: string;
  nip: string;
  email: string;
  signature_path: string;
}>): Promise<string | null> {
  const { data: row, error } = await supabase
    .from('s2_session_people')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select('id')
    .single();

  if (error) throw error;
  return (row as { id: string } | null)?.id ?? null;
}

export async function deleteS2SessionPerson(id: string) {
  const { error } = await supabase
    .from('s2_session_people')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================================
// S2_SCORES
// ============================================================

export async function upsertS2Score(data: {
  session_id: string;
  examiner_person_id: string;
  criterion_code: string;
  criterion_label_snapshot: string;
  weight_snapshot: number;
  score: number | null;
  notes?: string;
}): Promise<string | null> {
  const { data: row, error } = await supabase
    .from('s2_scores')
    .upsert(data, { onConflict: 'session_id,examiner_person_id,criterion_code' })
    .select('id')
    .single();

  if (error) throw error;
  return (row as { id: string } | null)?.id ?? null;
}

export async function getS2ScoresBySession(sessionId: string) {
  const { data, error } = await supabase
    .from('s2_scores')
    .select('*')
    .eq('session_id', sessionId);

  if (error) throw error;
  return data || [];
}

export async function getS2ScoresByExaminer(examinerPersonId: string) {
  const { data, error } = await supabase
    .from('s2_scores')
    .select('*')
    .eq('examiner_person_id', examinerPersonId);

  if (error) throw error;
  return data || [];
}

export async function submitExaminerScores(
  sessionId: string,
  examinerPersonId: string
) {
  const { data, error } = await supabase
    .from('s2_scores')
    .update({ submitted_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('examiner_person_id', examinerPersonId);

  if (error) throw error;
  return data;
}

// ============================================================
// S2_ATTENDANCE
// ============================================================

export async function addS2Attendance(data: {
  session_id: string;
  attendance_type: 'peserta' | 'audiens';
  name: string;
  nim?: string;
  signature_path?: string;
  notes?: string;
}): Promise<string | null> {
  const { data: row, error } = await supabase
    .from('s2_attendance')
    .insert(data)
    .select('id')
    .single();

  if (error) throw error;
  return (row as { id: string } | null)?.id ?? null;
}

export async function getS2AttendanceBySession(sessionId: string, type?: 'peserta' | 'audiens') {
  let query = supabase
    .from('s2_attendance')
    .select('*')
    .eq('session_id', sessionId);

  if (type) {
    query = query.eq('attendance_type', type);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function submitAttendance(
  sessionId: string,
  attendanceType: 'peserta' | 'audiens',
  entries: { name: string; nim: string; signature_path?: string; notes?: string }[]
) {
  const { data: authData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('s2_attendance')
    .upsert(
      entries.map(e => ({
        session_id: sessionId,
        attendance_type: attendanceType,
        name: e.name,
        nim: e.nim || '',
        signature_path: e.signature_path,
        notes: e.notes || '',
        submitted_by: authData.user?.id,
      })),
      { onConflict: 'session_id,attendance_type,name,nim' }
    );

  if (error) throw error;
  return data;
}

// ============================================================
// UTILITIES
// ============================================================

export async function generateAttendanceToken(sessionId: string): Promise<string> {
  const { data: session } = await supabase
    .from('s2_sessions')
    .select('public_attendance_token')
    .eq('id', sessionId)
    .single();

  if (!session) throw new Error('Session not found');
  return session.public_attendance_token;
}

export async function validateAttendanceToken(token: string): Promise<string | null> {
  const { data: session } = await supabase
    .from('s2_sessions')
    .select('id, attendance_open')
    .eq('public_attendance_token', token)
    .single();

  if (!session || !session.attendance_open) return null;
  return session.id;
}

export async function openAttendance(sessionId: string) {
  return supabase
    .from('s2_sessions')
    .update({ attendance_open: true, updated_at: new Date().toISOString() })
    .eq('id', sessionId);
}

export async function closeAttendance(sessionId: string) {
  return supabase
    .from('s2_sessions')
    .update({ attendance_open: false, updated_at: new Date().toISOString() })
    .eq('id', sessionId);
}

// ============================================================
// SESSION CREATION WITH DEFAULTS
// ============================================================

export async function createS2ProposalSession(data: {
  student_name: string;
  student_nim: string;
  thesis_title: string;
  specialization: string;
  study_program?: string;
  degree_program?: string;
  semester: string;
  academic_year: string;
  exam_date: string;
  start_time?: string;
  end_time?: string;
  venue: string;
  script_presentation_minutes?: number;
  created_by: string;
}): Promise<S2Session | null> {
  return createS2Session({
    exam_type: 'proposal',
    status: 'draft',
    ...data,
    study_program: data.study_program || 'Kesehatan Masyarakat',
    degree_program: data.degree_program || 'Program Magister',
    rubric_version: 'proposal-v1',
    public_attendance_token: crypto.randomUUID(),
    attendance_open: false,
  });
}