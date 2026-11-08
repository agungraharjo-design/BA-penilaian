// Sidang Skripsi repositories - blueprint loader typed for SID-SKR.
import { supabase } from '@/lib/supabase';
import type { SidangBlueprint } from '@/types/sidang';

export async function getSidangBlueprint(): Promise<SidangBlueprint | null> {
  const [components, criteria, levels, descriptors] = await Promise.all([
    supabase.from('pbl_assessment_components').select('*').eq('code', 'SID-SKR').maybeSingle(),
    supabase.from('pbl_rubric_criteria').select('*').eq('component_code', 'SID-SKR').order('criterion_order'),
    supabase.from('pbl_rubric_performance_levels').select('*').order('display_order'),
    supabase.from('pbl_rubric_descriptors').select('*').order('display_order'),
  ]);
  if (components.error || criteria.error || levels.error || descriptors.error) return null;
  return {
    component: (components.data as SidangBlueprint['component']) || null,
    criteria: (criteria.data as SidangBlueprint['criteria']) || [],
    performanceLevels: (levels.data as SidangBlueprint['performanceLevels']) || [],
    descriptors: (descriptors.data as SidangBlueprint['descriptors']) || [],
  };
}
