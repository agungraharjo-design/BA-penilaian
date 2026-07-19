// S2 Validation utilities
import type { S2Criterion } from '@/lib/s2/rubric-proposal';

// ============================================================
// SCORE VALIDATION
// ============================================================

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

export function validateS2Score(score: number | null): ValidationResult {
  if (score === null) return { valid: true };
  if (score < 1 || score > 4) {
    return { valid: false, error: 'Skor harus antara 1 dan 4' };
  }
  // Check decimal precision (0.01)
  if (Math.round(score * 100) !== score * 100) {
    return { valid: false, error: 'Skor harus berkelipatan 0.01' };
  }
  return { valid: true };
}

export function validateS2Scores(
  scores: (number | null)[],
  criterionCodes: string[]
): { valid: boolean; errors: Record<string, string> } {
  const errors: Record<string, string> = {};

  scores.forEach((score, i) => {
    const code = criterionCodes[i];
    const result = validateS2Score(score);
    if (!result.valid) {
      errors[code] = result.error || 'Skor tidak valid';
    }
  });

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function isS2AssessmentComplete(
  scores: (number | null)[],
  requiredCount: number = 7
): boolean {
  return scores.filter(s => s !== null).length >= requiredCount;
}

export function getCompletedExaminerCount(examinerScores: (number | null)[][]): number {
  return examinerScores.filter(scores => scores.every(s => s !== null)).length;
}

// ============================================================
// SESSION VALIDATION
// ============================================================

export interface S2SessionValidationErrors {
  student_name?: string;
  student_nim?: string;
  thesis_title?: string;
  specialization?: string;
  exam_date?: string;
  venue?: string;
  people?: string;
  duplicate_people?: string;
}

export function validateS2SessionData(data: {
  student_name: string;
  student_nim: string;
  thesis_title: string;
  specialization: string;
  exam_date: string;
  venue: string;
  people: { role: string; user_id?: string; display_name: string }[];
}): { valid: boolean; errors: S2SessionValidationErrors } {
  const errors: S2SessionValidationErrors = {};

  if (!data.student_name?.trim()) errors.student_name = 'Nama mahasiswa wajib diisi';
  if (!data.student_nim?.trim()) errors.student_nim = 'NIM wajib diisi';
  if (!data.thesis_title?.trim()) errors.thesis_title = 'Judul tesis wajib diisi';
  if (!data.specialization?.trim()) errors.specialization = 'Peminatan wajib diisi';
  if (!data.exam_date?.trim()) errors.exam_date = 'Tanggal ujian wajib diisi';
  if (!data.venue?.trim()) errors.venue = 'Tempat ujian wajib diisi';

  // Check required roles
  const requiredRoles = ['ketua_penguji', 'anggota_penguji_1', 'anggota_penguji_2', 'anggota_penguji_3'];
  const assignedRoles = data.people.map(p => p.role);
  const missingRoles = requiredRoles.filter(r => !assignedRoles.includes(r));
  if (missingRoles.length > 0) {
    errors.people = `Peran penguji belum lengkap: ${missingRoles.join(', ')}`;
  }

  // Check duplicate people
  const userIds = data.people.filter(p => p.user_id).map(p => p.user_id!);
  const uniqueUserIds = new Set(userIds);
  if (userIds.length !== uniqueUserIds.size) {
    errors.duplicate_people = 'Satu dosen tidak bisa memiliki dua peran dalam satu sesi';
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

// ============================================================
// ATTENDANCE VALIDATION
// ============================================================

export interface AttendanceValidationResult {
  valid: boolean;
  error?: string;
}

export function validateAttendanceEntry(data: {
  name: string;
  nim: string;
  attendance_type: 'peserta' | 'audiens';
}): AttendanceValidationResult {
  if (!data.name?.trim()) {
    return { valid: false, error: 'Nama wajib diisi' };
  }
  if (!data.nim?.trim()) {
    return { valid: false, error: 'NIM wajib diisi' };
  }
  if (!['peserta', 'audiens'].includes(data.attendance_type)) {
    return { valid: false, error: 'Tipe kehadiran tidak valid' };
  }
  return { valid: true };
}

// ============================================================
// SIGNATURE VALIDATION
// ============================================================

export function validateSignatureFile(file: File): ValidationResult {
  const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
  const maxSize = 2 * 1024 * 1024; // 2MB

  if (!allowedTypes.includes(file.type)) {
    return { valid: false, error: 'Format file harus PNG, JPEG, atau WebP' };
  }
  if (file.size > maxSize) {
    return { valid: false, error: 'Ukuran file maksimal 2MB' };
  }
  return { valid: true };
}

// ============================================================
// ACADEMIC YEAR FORMAT
// ============================================================

export function validateAcademicYear(value: string): ValidationResult {
  // Expected format: 2025/2026
  const pattern = /^\d{4}\/\d{4}$/;
  if (!pattern.test(value)) {
    return { valid: false, error: 'Format tahun akademik: 2025/2026' };
  }
  const [start, end] = value.split('/').map(Number);
  if (end !== start + 1) {
    return { valid: false, error: 'Tahun akhir harus satu tahun setelah tahun awal' };
  }
  return { valid: true };
}

export function formatAcademicYear(startYear: number): string {
  return `${startYear}/${startYear + 1}`;
}

export function parseAcademicYear(value: string): { start: number; end: number } | null {
  const match = value.match(/^(\d{4})\/(\d{4})$/);
  if (!match) return null;
  return { start: parseInt(match[1]), end: parseInt(match[2]) };
}