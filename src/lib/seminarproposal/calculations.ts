// Seminar Proposal Skripsi - calculations
//
// Nilai Akhir = (Total Skor Nilai x Bobot) / 400 x 100, which is identical to
// summing (level / 4) x internal_weight x 100 because the bobot sum to 100 and
// internal_weight = bobot / 100.

// Level range is 0-4 (0 = tidak hadir / tidak ada bukti). Decimal levels such as
// 3.75 are allowed and match the official 2.75-3.99 descriptor bands.
export function calcCriterionPoints(level: number, internalWeight: number): number {
  const clamped = Math.min(4, Math.max(0, level));
  return (clamped / 4) * internalWeight * 100;
}

export function calcRawFromCriterionPoints(points: (number | null)[]): number | null {
  const valid = points.filter((v) => v !== null && v !== undefined);
  if (valid.length === 0) return null;
  const sum = valid.reduce((a, b) => a + b, 0);
  // Guard the numeric(5,2) check (final_raw_score <= 100) the same way PBL 2 does.
  return Math.min(100, Math.round(sum * 100) / 100);
}

// Rerata across the three examiners (Utama / Pendamping / Anggota Penguji).
export function calcRerata(raws: (number | null)[]): number | null {
  const valid = raws.filter((v): v is number => v !== null && v !== undefined && !isNaN(v));
  if (valid.length === 0) return null;
  const avg = valid.reduce((a, b) => a + b, 0) / valid.length;
  return Math.round(avg * 100) / 100;
}
