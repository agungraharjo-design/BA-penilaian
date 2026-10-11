// Seminar Proposal Skripsi - blueprint loader
//
// Filters to the SP- component only, so PBL 1 / PBL 2 rows in the shared
// blueprint tables are never returned to this module.
import { supabase } from '@/lib/supabase';
import { SP_COMPONENT_CODE } from '@/types/seminarproposa';
import type { SpBlueprint } from '@/types/seminarproposa';

export async function getSpBlueprint(): Promise<SpBlueprint | null> {
  const [components, criteria, levels, descriptors] = await Promise.all([
    supabase.from('pbl_assessment_components').select('*').eq('code', SP_COMPONENT_CODE),
    supabase.from('pbl_rubric_criteria').select('*')
      .eq('component_code', SP_COMPONENT_CODE).order('criterion_order'),
    supabase.from('pbl_rubric_performance_levels').select('*').order('display_order'),
    supabase.from('pbl_rubric_descriptors').select('*').order('display_order'),
  ]);
  if (components.error || criteria.error || levels.error || descriptors.error) return null;
  const critRows = (criteria.data ?? []) as SpBlueprint['criteria'];
  const critIds = new Set<string>(critRows.map((c) => c.id));
  return {
    component: (components.data?.[0] as SpBlueprint['component']) || null,
    criteria: critRows,
    performanceLevels: (levels.data as SpBlueprint['performanceLevels']) || [],
    // keep only descriptors belonging to the SP criteria
    descriptors: ((descriptors.data || []) as SpBlueprint['descriptors'])
      .filter((d) => critIds.has(d.criterion_id)),
  };
}
