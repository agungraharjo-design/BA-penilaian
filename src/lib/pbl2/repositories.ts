// PBL 2 repositories - blueprint loader typed for the PBL 2 component codes.
import { supabase } from '@/lib/supabase';
import type { Pbl2Blueprint } from '@/types/pbl2';

// ── BLUEPRINT ───────────────────────────────────────────────

export async function getPblBlueprint(): Promise<Pbl2Blueprint | null> {
  const [components, criteria, levels, descriptors] = await Promise.all([
    supabase.from('pbl_assessment_components').select('*').order('display_order'),
    supabase.from('pbl_rubric_criteria').select('*').order('criterion_order'),
    supabase.from('pbl_rubric_performance_levels').select('*').order('display_order'),
    supabase.from('pbl_rubric_descriptors').select('*').order('display_order'),
  ]);
  if (components.error || criteria.error || levels.error || descriptors.error) return null;
  return {
    components: (components.data as Pbl2Blueprint['components']) || [],
    criteria: (criteria.data as Pbl2Blueprint['criteria']) || [],
    performanceLevels: (levels.data as Pbl2Blueprint['performanceLevels']) || [],
    descriptors: (descriptors.data as Pbl2Blueprint['descriptors']) || [],
  };
}
