// PBL 1 Authorization utilities
import { supabase } from '@/lib/supabase';
import type { PblAssessorRole } from '@/types/pbl1';

export interface PblAccessResult {
  canView: boolean;
  canEdit: boolean;
  canManage: boolean;
  canFinalize: boolean;
  canUnlock: boolean;
  assessorRole: PblAssessorRole | null;
  isSuperadmin: boolean;
  isCoordinator: boolean;
  isAssigned: boolean;
  isSupervisor: boolean;
  isExaminer: boolean;
}

export async function checkPblGroupAccess(groupId: string, userId: string): Promise<PblAccessResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .single();

  const isSuperadmin = profile?.role === 'superadmin';
  const isCoordinator = profile?.role === 'coordinator' || profile?.role === 'admin';

  const { data: assessors } = await supabase
    .from('pbl_assessors')
    .select('assessor_role, user_id')
    .eq('group_id', groupId)
    .eq('user_id', userId);

  const assessor = assessors?.[0];
  const assessorRole = (assessor?.assessor_role as PblAssessorRole | null) ?? null;
  const isAssigned = !!assessor;
  const isSupervisor = assessor
    ? ['pembimbing_1', 'pembimbing_2'].includes(assessor.assessor_role)
    : false;
  const isExaminer = assessor
    ? ['penguji_1', 'penguji_2'].includes(assessor.assessor_role)
    : false;

  return {
    canView: isSuperadmin || isCoordinator || isAssigned,
    canEdit: isSuperadmin || isCoordinator || isAssigned,
    canManage: isSuperadmin || isCoordinator,
    canFinalize: isSuperadmin || isCoordinator,
    canUnlock: isSuperadmin || isCoordinator,
    assessorRole,
    isSuperadmin,
    isCoordinator,
    isAssigned,
    isSupervisor,
    isExaminer,
  };
}

export function canEditComponent(
  access: { isSuperadmin: boolean; isCoordinator: boolean; assessorRole: PblAssessorRole | null; isSupervisor: boolean; isExaminer: boolean },
  componentCode: string,
  instanceRole: string | null,
): boolean {
  if (access.isSuperadmin || access.isCoordinator) return true;
  if (!instanceRole) return true; // configurable/individual
  if (instanceRole === 'PEMBIMBING' && access.isSupervisor) return true;
  if (instanceRole === 'PENGUJI' && access.isExaminer) return true;
  return access.assessorRole === instanceRole?.toLowerCase();
}

export function getPblAllowedComponentRoles(
  access: { isSuperadmin: boolean; isCoordinator: boolean; isSupervisor: boolean; isExaminer: boolean },
): { pembimbing: boolean; penguji: boolean } {
  if (access.isSuperadmin || access.isCoordinator) {
    return { pembimbing: true, penguji: true };
  }
  return { pembimbing: access.isSupervisor, penguji: access.isExaminer };
}