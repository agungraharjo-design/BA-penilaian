import { S2_PROPOSAL_RUBRIC_V1, S2Criterion } from './rubric-proposal';
import type { S2CriterionCode } from './rubric-proposal';

/**
 * Calculate total skor x bobot for a set of scores
 * scores: array of 7 numbers (1-4) or null
 * weights: array of 7 weights
 */
export function calcTotalSkorXBobot(
  scores: (number | null)[],
  weights: number[]
): number {
  return scores.reduce((sum: number, score, i) => {
    if (score === null || score === undefined) return sum;
    return sum + score * weights[i];
  }, 0);
}

/**
 * Calculate nilai akhir from total skor x bobot
 * Formula: (total_skor_x_bobot / 400) * 100 = total_skor_x_bobot / 4
 */
export function calcNilaiAkhir(totalSkorXBobot: number): number {
  if (totalSkorXBobot <= 0) return 0;
  return totalSkorXBobot / 4;
}

/**
 * Calculate grade from nilai akhir
 */
export function calcGrade(nilai: number): string {
  if (nilai >= 85) return 'A';
  if (nilai >= 80) return 'A-';
  if (nilai >= 75) return 'B+';
  if (nilai >= 70) return 'B';
  return 'TIDAK LULUS';
}

/**
 * Calculate IP from nilai akhir
 */
export function calcIP(nilai: number): number | null {
  if (nilai >= 85) return 4.00;
  if (nilai >= 80) return 3.75;
  if (nilai >= 75) return 3.50;
  if (nilai >= 70) return 3.00;
  return null;
}

/**
 * Get complete grade result
 */
export interface S2GradeResult {
  score: number;
  ip: number | null;
  letter: 'A' | 'A-' | 'B+' | 'B' | 'TIDAK LULUS';
  passed: boolean;
}

export function calcGradeResult(nilai: number): S2GradeResult {
  const letter = calcGrade(nilai) as S2GradeResult['letter'];
  return {
    score: nilai,
    ip: calcIP(nilai),
    letter,
    passed: nilai >= 70,
  };
}

/**
 * Calculate weighted score for a single criterion
 */
export function calcSkorXBobot(score: number | null, bobot: number): number | null {
  if (score === null || score === undefined) return null;
  return score * bobot;
}

/**
 * Calculate final score for an examiner
 * Returns average of their 7 criterion scores weighted
 */
export function calcExaminerFinalScore(
  scores: (number | null)[],
  rubric: S2Criterion[]
): number | null {
  const weights = rubric.map(c => c.bobot);
  const total = calcTotalSkorXBobot(scores, weights);
  if (total === 0) return null;
  return calcNilaiAkhir(total);
}

/**
 * Calculate recap final score from 4 examiners
 * Average of completed examiner scores
 */
export function calcRecapFinalScore(
  examinerScores: (number | null)[]
): number | null {
  const validScores = examinerScores.filter(s => s !== null && s !== undefined);
  if (validScores.length === 0) return null;
  const sum = validScores.reduce((a, b) => a + b, 0);
  return sum / validScores.length;
}

/**
 * Check if all required scores are filled
 */
export function isScoreComplete(
  scores: (number | null)[],
  requiredCount: number
): boolean {
  return scores.filter(s => s !== null && s !== undefined).length >= requiredCount;
}

/**
 * Get completion status text
 */
export function getCompletionText(
  completed: number,
  total: number
): string {
  return `Penilaian selesai: ${completed} dari ${total} penguji`;
}

/**
 * Calculate all examiner scores from session data
 */
export function calcAllExaminerScores(
  skorPenguji: (number | null)[][] | null | undefined,
  rubric: S2Criterion[]
): (number | null)[] {
  if (!skorPenguji || skorPenguji.length === 0) {
    return [null, null, null, null];
  }
  return skorPenguji.slice(0, 4).map(scores => calcExaminerFinalScore(scores, rubric));
}

/**
 * Sum of examiner scores
 */
export function calcSumExaminerScores(scores: (number | null)[]): number {
  return scores.reduce((sum: number, s) => sum + (s || 0), 0);
}