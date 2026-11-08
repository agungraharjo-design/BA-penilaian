// Sidang Skripsi calculations - Form Penilaian Sidang Skripsi (S1 Kesmas).
// NILAI AKHIR per examiner = (Total Skor Nilai x Bobot) / 4, achieved with
// internal_weight = bobot/100: calcCriterionPoints(level, w) =
// (level/4) x w x 100 = level x bobot / 4, and the sum over the 10
// parameters equals exactly the paper's NILAI AKHIR (0-100).
export function calcCriterionPoints(level: number, internalWeight: number): number {
  const clamped = Math.min(4, Math.max(0, level));
  return (clamped / 4) * internalWeight * 100;
}

export function calcRawFromCriterionPoints(criterionPoints: (number | null)[]): number | null {
  const valid = criterionPoints.filter((v) => v !== null && v !== undefined);
  if (valid.length === 0) return null;
  const sum = valid.reduce((a, b) => a + b, 0);
  // final_raw_score is numeric(5,2) with check (between 0 and 100); clamp
  // rounding drift (same guard as PBL 2 / PBL 3).
  return Math.min(100, Math.round(sum * 100) / 100);
}

// Rerata = (Ketua Penguji + Anggota Penguji I + Anggota Penguji II) / 3
export function calcRerata(scores: (number | null)[]): number | null {
  const valid = scores.filter((s) => s !== null && s !== undefined);
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((a, b) => a + (b as number), 0) / valid.length) * 100) / 100;
}

// Total Hasil Sidang Skripsi (55%) = Rerata x 0.55 (Rekap sheet column)
export function calcTotalHasilSidang(rerata: number | null): number | null {
  if (rerata === null) return null;
  return Math.round(rerata * 0.55 * 10000) / 10000;
}
