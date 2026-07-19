// S2 Authorization utilities
// Handles role-based access control for S2 sessions

import { supabase } from '@/lib/supabase';
import type { S2PersonRole } from '@/types/s2';

export interface S2AccessResult {
  canView: boolean;
  canEdit: boolean;
  canManagePeople: boolean;
  canFinalize: boolean;
  examinerRole: S2PersonRole | null;
  isSuperadmin: boolean;
  isCoordinator: boolean;
  isAssignedExaminer: boolean;
  isAssignedSupervisor: boolean;
}

/**
 * Check user's access to an S2 session
 */
export async function checkS2SessionAccess(
  sessionId: string,
  userId: string
): Promise<S2AccessResult> {
  // Get user profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  const isSuperadmin = profile?.role === 'superadmin';
  const isCoordinator = profile?.role === 'coordinator' || profile?.role === 'admin';

  // Check if user is assigned to this session
  const { data: people } = await supabase
    .from('s2_session_people')
    .select('role, user_id')
    .eq('session_id', sessionId)
    .eq('user_id', userId);

  const assignedPerson = people?.[0];
  const examinerRole = assignedPerson?.role as S2PersonRole | null;
  const isAssigned = !!assignedPerson;
  const isAssignedExaminer = assignedPerson
    ? ['ketua_penguji', 'anggota_penguji_1', 'anggota_penguji_2', 'anggota_penguji_3'].includes(assignedPerson.role)
    : false;
  const isAssignedSupervisor = assignedPerson
    ? ['pembimbing_1', 'pembimbing_2'].includes(assignedPerson.role)
    : false;

  return {
    canView: isSuperadmin || isCoordinator || isAssigned,
    canEdit: isSuperadmin || isCoordinator || isAssigned,
    canManagePeople: isSuperadmin || isCoordinator,
    canFinalize: isSuperadmin || isCoordinator,
    examinerRole,
    isSuperadmin,
    isCoordinator,
    isAssignedExaminer,
    isAssignedSupervisor,
  };
}

/**
 * Check if user can edit a specific examiner's scores
 */
export function canEditExaminerScores(
  access: { isSuperadmin: boolean; isCoordinator: boolean; examinerRole: string | null },
  examinerRole: string
): boolean {
  if (access.isSuperadmin || access.isCoordinator) return true;
  if (access.examinerRole === examinerRole) return true;
  return false;
}

/**
 * Get allowed examiner tabs for user
 */
export function getAllowedExaminerTabs(
  access: { isSuperadmin: boolean; isCoordinator: boolean; examinerRole: string | null }
): string[] {
  if (access.isSuperadmin || access.isCoordinator) {
    return ['ketua_penguji', 'anggota_penguji_1', 'anggota_penguji_2', 'anggota_penguji_3'];
  }
  if (access.examinerRole) {
    return [access.examinerRole];
  }
  return [];
}

/**
 * Check if user can access S2 attendance
 */
export function canAccessS2Attendance(
  access: { isSuperadmin: boolean; isCoordinator: boolean; isAssigned: boolean },
  attendanceOpen: boolean
): boolean {
  return access.isSuperadmin || access.isCoordinator || access.isAssigned || attendanceOpen;
}

/**
 * Server-side validation for score updates
 */
export async function validateScoreUpdate(
  sessionId: string,
  userId: string,
  examinerPersonId: string
): Promise<boolean> {
  const { data } = await supabase
    .from('s2_session_people')
    .select('id')
    .eq('id', examinerPersonId)
    .eq('session_id', sessionId)
    .eq('user_id', userId)
    .single();

  return !!data;
}

/**
 * Server-side validation for session metadata updates
 */
export async function validateSessionUpdate(
  sessionId: string,
  userId: string
): Promise<boolean> {
  const access = await checkS2SessionAccess(sessionId, userId);
  return access.canEdit;
}