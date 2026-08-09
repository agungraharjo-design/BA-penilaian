// PBL 1 Validation utilities
import type { PblComponentCode } from '@/types/pbl1';

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePblRawScore(score: number | null, allowZero = true): ValidationResult {
  if (score === null) return { valid: true };
  if (score < 0 || score > 100) {
    return { valid: false, error: 'Skor harus antara 0 dan 100' };
  }
  return { valid: true };
}

export function validatePeerScore(data: {
  final_peer_score: number;
  source_method: string;
  respondent_count: number;
  aggregation_method: string;
}): ValidationResult {
  if (data.final_peer_score < 0 || data.final_peer_score > 100) {
    return { valid: false, error: 'Final peer score harus antara 0 dan 100' };
  }
  if (!data.source_method?.trim()) {
    return { valid: false, error: 'Source method wajib diisi' };
  }
  if (data.respondent_count < 0) {
    return { valid: false, error: 'Jumlah responden tidak boleh negatif' };
  }
  if (!data.aggregation_method?.trim()) {
    return { valid: false, error: 'Aggregation method wajib diisi' };
  }
  return { valid: true };
}

export interface PblGroupValidationErrors {
  code?: string;
  name?: string;
  field_location?: string;
  academic_year?: string;
}

export function validatePblGroupData(data: {
  code: string;
  name: string;
  field_location: string;
  academic_year: string;
}): { valid: boolean; errors: PblGroupValidationErrors } {
  const errors: PblGroupValidationErrors = {};
  if (!data.code?.trim()) errors.code = 'Kode kelompok wajib diisi';
  if (!data.name?.trim()) errors.name = 'Nama kelompok wajib diisi';
  if (!data.field_location?.trim()) errors.field_location = 'Lokasi lapangan wajib diisi';
  if (!data.academic_year?.trim()) errors.academic_year = 'Tahun akademik wajib diisi';
  return { valid: Object.keys(errors).length === 0, errors };
}

// Rubric performance level validation
export function validateLevel(level: number): ValidationResult {
  if (!Number.isInteger(level) || level < 0 || level > 4) {
    return { valid: false, error: 'Level harus bilangan bulat 0–4' };
  }
  return { valid: true };
}

export function isComponentComplete(componentCode: PblComponentCode, levels: (number | null)[]): boolean {
  return levels.every((l) => l !== null);
}