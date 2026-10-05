// PBL 2 Calculations - RPS PBL 2 Aligned (same weight architecture as PBL 1)
import type { Pbl2ComponentCode } from '@/types/pbl2';
import { PBL2_COMPONENT_WEIGHTS, PBL2_ALL_COMPONENTS } from '@/types/pbl2';

// ── Raw → weighted ──────────────────────────────────────────

function weighted(raw: number | null, w: number): number | null {
  if (raw === null || raw === undefined) return null;
  return raw * w;
}

// Criterion points: (level / 4) × internal_weight × 100
// The rubric weights for a component sum to 1, so sum(criterion_points) yields a 0–100 raw score.
export function calcCriterionPoints(level: number, internalWeight: number): number {
  const clamped = Math.min(4, Math.max(0, level));
  return (clamped / 4) * internalWeight * 100;
}

export function calcComponentRawFromCriterionPoints(
  criterionPoints: (number | null)[]
): number | null {
  const valid = criterionPoints.filter((v) => v !== null && v !== undefined);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + b, 0);
}

// ── RPS recap ───────────────────────────────────────────────

// Raw scores (0–100) for the seven RPS PBL 2 components, by per-student scope.
// For GROUP components, the same raw value is applied to each active member.
export type ComponentRawScores = Record<Pbl2ComponentCode, number | null>;

export interface PblRecapFields {
  cpmk1: number | null;
  cpmk2: number | null;
  finalScore: number | null;
  complete: boolean;
  missing: Pbl2ComponentCode[];
}

export function calcCpmk1(s: ComponentRawScores): number | null {
  if (s['2I1'] === null || s['2B1'] === null || s['2B2'] === null) return null;
  const num =
    (weighted(s['2I1'], 0.15) as number) +
    (weighted(s['2B1'], 0.175) as number) +
    (weighted(s['2B2'], 0.175) as number);
  return num / 0.5;
}

export function calcCpmk2(s: ComponentRawScores): number | null {
  if (s['2I2'] === null || s['2P1'] === null || s['2E1'] === null || s['2E2'] === null) return null;
  const num =
    (weighted(s['2I2'], 0.25) as number) +
    (weighted(s['2P1'], 0.1) as number) +
    (weighted(s['2E1'], 0.075) as number) +
    (weighted(s['2E2'], 0.075) as number);
  return num / 0.5;
}

export function calcPblFinal(s: ComponentRawScores): number | null {
  const raw: (number | null)[] = PBL2_ALL_COMPONENTS.map((c) => weighted(s[c], PBL2_COMPONENT_WEIGHTS[c]));
  if (raw.some((v) => v === null)) return null;
  return (raw as number[]).reduce((a, b) => a + b, 0);
}

export function calcPblBreakdown(s: ComponentRawScores): PblRecapFields {
  const missing = PBL2_ALL_COMPONENTS.filter((c) => s[c] === null);
  const complete = missing.length === 0;
  return {
    cpmk1: calcCpmk1(s),
    cpmk2: calcCpmk2(s),
    finalScore: calcPblFinal(s),
    complete,
    missing,
  };
}

export function calcPblGrade(nilai: number): string | null {
  if (nilai >= 85) return 'A';
  if (nilai >= 80) return 'A-';
  if (nilai >= 75) return 'B+';
  if (nilai >= 70) return 'B';
  if (nilai >= 65) return 'B-';
  if (nilai >= 60) return 'C+';
  if (nilai >= 55) return 'C';
  return null;
}

// ── Examiner average (never overwrite raw records) ──────────
export function calcExaminerAverage(scores: (number | null)[]): number | null {
  const valid = scores.filter((s) => s !== null && s !== undefined);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + (b as number), 0) / valid.length;
}

export function calcAbsoluteDifference(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.abs(a - b);
}

export function reconciliationRequired(absoluteDiff: number | null, threshold = 15): boolean {
  return absoluteDiff !== null && absoluteDiff > threshold;
}

// Component weight getter from the RPS master constant
export function weightOf(code: Pbl2ComponentCode): number {
  return PBL2_COMPONENT_WEIGHTS[code] ?? 0;
}
