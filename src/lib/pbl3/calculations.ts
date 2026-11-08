// PBL 3 Calculations - Final RPS PBL 3 (2026/2027 Ganjil) aligned
// NILAI AKHIR = 40% Pembimbing Lapangan + 20% Penilaian Aktivitas (Dosen
// Pembimbing, CPMK 2) + 20% Penilaian Laporan (Dosen Pembimbing, CPMK 3) +
// 10% Seminar (Penguji, CPMK 4) + 10% Seminar (Pembimbing, CPMK 5).
// Aktivitas and Laporan are separate rubric components (user decision).
import type { Pbl3ComponentCode } from '@/types/pbl3';
import { PBL3_COMPONENT_WEIGHTS, PBL3_ALL_COMPONENTS, PBL3_GRADE_BANDS } from '@/types/pbl3';

// Criterion points: (level / 4) × internal_weight × 100 — same convention as
// PBL 1 / PBL 2 so the shared rubric machinery behaves identically.
export function calcCriterionPoints(level: number, internalWeight: number): number {
  const clamped = Math.min(4, Math.max(0, level));
  return (clamped / 4) * internalWeight * 100;
}

export function calcComponentRawFromCriterionPoints(
  criterionPoints: (number | null)[]
): number | null {
  const valid = criterionPoints.filter((v) => v !== null && v !== undefined);
  if (valid.length === 0) return null;
  const sum = valid.reduce((a, b) => a + b, 0);
  // pbl_assessment_scores.final_raw_score is numeric(5,2) with
  // check (final_raw_score between 0 and 100); clamp rounding drift (PBL2 fix).
  return Math.min(100, Math.round(sum * 100) / 100);
}

// Raw scores (0–100) per component for one student.
export type Pbl3RawScores = Record<Pbl3ComponentCode, number | null>;

export function weighted(raw: number | null, w: number): number | null {
  if (raw === null || raw === undefined) return null;
  return raw * w;
}

export function calcPbl3Final(s: Pbl3RawScores): number | null {
  const raw: (number | null)[] = PBL3_ALL_COMPONENTS.map((c) => weighted(s[c], PBL3_COMPONENT_WEIGHTS[c]));
  if (raw.some((v) => v === null)) return null;
  return Math.round((raw as number[]).reduce((a, b) => a + b, 0) * 100) / 100;
}

export interface Pbl3RecapFields {
  finalScore: number | null;
  grade: string | null;
  complete: boolean;
  missing: Pbl3ComponentCode[];
}

export function calcPbl3Breakdown(s: Pbl3RawScores): Pbl3RecapFields {
  const missing = PBL3_ALL_COMPONENTS.filter((c) => s[c] === null);
  const finalScore = calcPbl3Final(s);
  return {
    finalScore,
    grade: finalScore !== null ? calcPbl3Grade(finalScore) : null,
    complete: missing.length === 0,
    missing,
  };
}

// Full band set from the paper form (includes D and E, unlike PBL 1/2).
export function calcPbl3Grade(nilai: number): string | null {
  for (const b of PBL3_GRADE_BANDS) {
    if (nilai >= b.min && nilai <= b.max) return b.huruf;
  }
  return null;
}

// Examiner average — kept for symmetry with PBL 1/2 (not used by PBL 3 recap
// today since each component has a single assessor, but harmless).
export function calcExaminerAverage(scores: (number | null)[]): number | null {
  const valid = scores.filter((s) => s !== null && s !== undefined);
  if (valid.length === 0) return null;
  return valid.reduce((a, b) => a + (b as number), 0) / valid.length;
}
