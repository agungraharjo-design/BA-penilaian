// PBL 3 repositories - blueprint loader typed for the PBL 3 component codes.
// Same tables as PBL 1 / PBL 2 / SP; rows are distinguished by component_code.
import { supabase } from '@/lib/supabase';
import type { Pbl3Blueprint } from '@/types/pbl3';

export async function getPbl3Blueprint(): Promise<Pbl3Blueprint | null> {
  const [components, criteria, levels, descriptors] = await Promise.all([
    supabase.from('pbl_assessment_components').select('*').order('display_order'),
    supabase.from('pbl_rubric_criteria').select('*').order('criterion_order'),
    supabase.from('pbl_rubric_performance_levels').select('*').order('display_order'),
    supabase.from('pbl_rubric_descriptors').select('*').order('display_order'),
  ]);
  if (components.error || criteria.error || levels.error || descriptors.error) return null;
  return {
    components: (components.data as Pbl3Blueprint['components']) || [],
    criteria: (criteria.data as Pbl3Blueprint['criteria']) || [],
    performanceLevels: (levels.data as Pbl3Blueprint['performanceLevels']) || [],
    descriptors: (descriptors.data as Pbl3Blueprint['descriptors']) || [],
  };
}
