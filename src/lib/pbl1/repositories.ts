// PBL 1 Repository - Data access layer
import { supabase } from '@/lib/supabase';
import type {
  PblGroup,
  PblGroupMember,
  PblAssessor,
  PblBlueprint,
  PblAssessmentComponent,
  PblRubricCriterion,
  PblRubricDescriptor,
  PblPerformanceLevel,
  PblAssessmentInstance,
  PblAssessmentScore,
  PblRubricRating,
  PblPeerFinalScore,
  PblComponentCode,
} from '@/types/pbl1';

// ── PBL_GROUPS ──────────────────────────────────────────────

export async function createPblGroup(data: Partial<PblGroup> & { code: string; name: string }): Promise<PblGroup | null> {
  const { data: row, error } = await supabase
    .from('pbl_groups')
    .insert(data)
    .select()
    .single();
  if (error) throw error;
  return (row as PblGroup) ?? null;
}

export async function getPblGroup(id: string): Promise<PblGroup | null> {
  const { data, error } = await supabase.from('pbl_groups').select('*').eq('id', id).single();
  if (error) return null;
  return data as PblGroup;
}

export async function updatePblGroup(id: string, data: Partial<PblGroup>): Promise<PblGroup | null> {
  const { data: row, error } = await supabase
    .from('pbl_groups')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return (row as PblGroup) ?? null;
}

export async function listPblGroups(filters?: {
  status?: string;
  search?: string;
  limit?: number;
}): Promise<PblGroup[]> {
  let query = supabase.from('pbl_groups').select('*').order('created_at', { ascending: false });
  if (filters?.status) query = query.eq('status', filters.status);
  if (filters?.search) query = query.or(`name.ilike.%${filters.search}%,code.ilike.%${filters.search}%,field_location.ilike.%${filters.search}%`);
  if (filters?.limit) query = query.limit(filters.limit);
  const { data, error } = await query;
  if (error) throw error;
  return (data as PblGroup[]) || [];
}

// ── MEMBERS ─────────────────────────────────────────────────

export async function listPblMembers(groupId: string): Promise<PblGroupMember[]> {
  const { data, error } = await supabase
    .from('pbl_group_members')
    .select('*')
    .eq('group_id', groupId)
    .order('name');
  if (error) throw error;
  return (data as PblGroupMember[]) || [];
}

export async function addPblMember(data: {
  group_id: string;
  nim?: string;
  name: string;
  role?: 'member' | 'leader';
}): Promise<PblGroupMember | null> {
  const { data: row, error } = await supabase.from('pbl_group_members').insert(data).select().single();
  if (error) throw error;
  return (row as PblGroupMember) ?? null;
}

export async function updatePblMember(id: string, data: Partial<PblGroupMember>): Promise<PblGroupMember | null> {
  const { data: row, error } = await supabase
    .from('pbl_group_members')
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return (row as PblGroupMember) ?? null;
}

export async function deletePblMember(id: string): Promise<void> {
  const { error } = await supabase.from('pbl_group_members').delete().eq('id', id);
  if (error) throw error;
}

// ── ASSESSORS ───────────────────────────────────────────────

export async function getPblAssessors(groupId: string): Promise<PblAssessor[]> {
  const { data, error } = await supabase
    .from('pbl_assessors')
    .select('*')
    .eq('group_id', groupId)
    .order('sequence_no');
  if (error) throw error;
  return (data as PblAssessor[]) || [];
}

export async function upsertPblAssessor(data: Partial<PblAssessor> & { group_id: string; assessor_role: string }) {
  const { data: row, error } = await supabase
    .from('pbl_assessors')
    .upsert(data, { onConflict: 'group_id,assessor_role' })
    .select()
    .single();
  if (error) throw error;
  return row as PblAssessor;
}

export async function deletePblAssessor(id: string): Promise<void> {
  const { error } = await supabase.from('pbl_assessors').delete().eq('id', id);
  if (error) throw error;
}

// ── BLUEPRINT ───────────────────────────────────────────────

export async function getPblBlueprint(): Promise<PblBlueprint | null> {
  const [components, criteria, levels, descriptors] = await Promise.all([
    supabase.from('pbl_assessment_components').select('*').order('display_order'),
    supabase.from('pbl_rubric_criteria').select('*').order('criterion_order'),
    supabase.from('pbl_rubric_performance_levels').select('*').order('display_order'),
    supabase.from('pbl_rubric_descriptors').select('*').order('display_order'),
  ]);
  if (components.error || criteria.error || levels.error || descriptors.error) return null;
  return {
    components: (components.data as PblAssessmentComponent[]) || [],
    criteria: (criteria.data as PblRubricCriterion[]) || [],
    performanceLevels: (levels.data as PblPerformanceLevel[]) || [],
    descriptors: (descriptors.data as PblRubricDescriptor[]) || [],
  };
}

// ── ASSESSMENT INSTANCES ────────────────────────────────────

export async function getPblInstances(groupId: string): Promise<PblAssessmentInstance[]> {
  const { data, error } = await supabase
    .from('pbl_assessment_instances')
    .select('*')
    .eq('group_id', groupId);
  if (error) throw error;
  return (data as PblAssessmentInstance[]) || [];
}

export async function upsertPblInstance(data: Partial<PblAssessmentInstance> & { group_id: string; component_code: string }) {
  const { data: row, error } = await supabase
    .from('pbl_assessment_instances')
    .upsert(data, { onConflict: 'group_id,component_code,assessor_role' })
    .select()
    .single();
  if (error) throw error;
  return row as PblAssessmentInstance;
}

// ── SCORES & RATINGS ────────────────────────────────────────

export async function upsertPblScore(data: Partial<PblAssessmentScore> & { instance_id: string }) {
  const { data: row, error } = await supabase
    .from('pbl_assessment_scores')
    .upsert(data, {
      onConflict: ['instance_id', 'student_id'].join(',') as any,
    })
    .select()
    .single();
  if (error) throw error;
  return row as PblAssessmentScore;
}

export async function upsertPblRating(data: Partial<PblRubricRating> & {
  assessment_score_id: string;
  criterion_id: string;
}) {
  const { data: row, error } = await supabase
    .from('pbl_rubric_ratings')
    .upsert(data, { onConflict: 'assessment_score_id,criterion_id' })
    .select()
    .single();
  if (error) throw error;
  return row as PblRubricRating;
}

// ── PEER ────────────────────────────────────────────────────

export async function upsertPblPeer(data: Partial<PblPeerFinalScore> & { group_id: string; student_id: string }) {
  const { data: row, error } = await supabase
    .from('pbl_peer_final_scores')
    .upsert(data, { onConflict: 'group_id,student_id' })
    .select()
    .single();
  if (error) throw error;
  return row as PblPeerFinalScore;
}

// ── AGGREGATE LOAD ──────────────────────────────────────────

export async function loadPblGroupDetail(groupId: string) {
  const [group, members, assessors, instances] = await Promise.all([
    getPblGroup(groupId),
    listPblMembers(groupId),
    getPblAssessors(groupId),
    getPblInstances(groupId),
  ]);

  const instanceIds = instances.map((i) => i.id);
  const scoresRows = instanceIds.length
    ? ((await supabase.from('pbl_assessment_scores').select('*').in('instance_id', instanceIds)).data as PblAssessmentScore[]) || []
    : [];
  const scoreIds = scoresRows.map((s) => s.id);
  const ratingsRows = scoreIds.length
    ? ((await supabase.from('pbl_rubric_ratings').select('*').in('assessment_score_id', scoreIds)).data as PblRubricRating[]) || []
    : [];
  const peers = ((await supabase.from('pbl_peer_final_scores').select('*').eq('group_id', groupId)).data as PblPeerFinalScore[]) || [];

  return {
    group,
    members,
    assessors,
    instances,
    scores: scoresRows,
    ratings: ratingsRows,
    peers,
  };
}