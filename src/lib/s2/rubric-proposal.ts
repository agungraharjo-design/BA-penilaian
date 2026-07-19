// S2 Rubric Constants - Proposal V1
// Based on Form Penilaian Proposal Tesis.xlsx

import type { S2ExamType } from '@/types/s2';

export type S2CriterionCode =
  | 'tema_judul'
  | 'pendahuluan'
  | 'tinjauan_pustaka'
  | 'metode_penelitian'
  | 'daftar_pustaka'
  | 'lampiran'
  | 'presentasi_responsi';

export interface S2Criterion {
  code: S2CriterionCode;
  label: string;
  bobot: number;
  details: string[];
  maxScore: number;
  minScore: number;
  step: number;
}

// S2 Seminar Proposal Rubric V1
// Total weight = 100
export const S2_PROPOSAL_RUBRIC_V1: S2Criterion[] = [
  {
    code: 'tema_judul',
    label: 'Tema dan Judul',
    bobot: 10,
    maxScore: 4,
    minScore: 1,
    step: 0.01,
    details: [
      'Tema penelitian terbaru dan relevan dengan bidang ilmu',
      'Mencantumkan variabel-variabel serta waktu, tempat, dan subjek penelitian',
    ],
  },
  {
    code: 'pendahuluan',
    label: 'Pendahuluan',
    bobot: 20,
    maxScore: 4,
    minScore: 1,
    step: 0.01,
    details: [
      'Merumuskan latar belakang dan masalah penelitian',
      'Menentukan tujuan dan manfaat penelitian',
    ],
  },
  {
    code: 'tinjauan_pustaka',
    label: 'Tinjauan Pustaka',
    bobot: 15,
    maxScore: 4,
    minScore: 1,
    step: 0.01,
    details: [
      'Menelusuri kepustakaan yang relevan dengan judul, bersumber dari buku, jurnal terakreditasi nasional dan internasional',
      'Menyajikan kerangka teori yang komprehensif',
      'Menyusun daftar studi literatur atau penelitian terdahulu',
    ],
  },
  {
    code: 'metode_penelitian',
    label: 'Metode Penelitian',
    bobot: 25,
    maxScore: 4,
    minScore: 1,
    step: 0.01,
    details: [
      'Merumuskan desain penelitian sesuai dengan pertanyaan penelitian',
      'Menyusun prosedur pengambilan sampel (pemilihan populasi, kriteria sampel, pemilihan sampel)',
      'Menyusun prosedur pengumpulan data (perizinan, lokasi)',
      'Menyusun dan mengembangkan instrumen penelitian',
      'Menyusun definisi operasional penelitian',
      'Menyajikan perangkat dan tahapan analisis data yang telah dilakukan',
      'Menyajikan kerangka konsep dan hipotesis',
      'Menjelaskan prinsip etik dalam proses penelitian',
    ],
  },
  {
    code: 'daftar_pustaka',
    label: 'Daftar Pustaka',
    bobot: 5,
    maxScore: 4,
    minScore: 1,
    step: 0.01,
    details: [
      'Menyajikan daftar pustaka yang digunakan mengikuti format universitas',
      'Melengkapi sumber pustaka dengan proses akses internet yang digunakan',
      'Menggunakan aplikasi pengelolaan daftar pustaka',
      'Bersumber dari buku, jurnal terakreditasi nasional dan internasional dengan tahun kepustakaan ≤ 5 tahun terakhir',
    ],
  },
  {
    code: 'lampiran',
    label: 'Lampiran',
    bobot: 5,
    maxScore: 4,
    minScore: 1,
    step: 0.01,
    details: [
      'Melampirkan linimasa pengerjaan tesis (time schedule)',
      'Melampirkan instrumen penelitian',
      'Melampirkan surat lolos kaji etik',
      'Melampirkan dokumen perizinan',
      'Melampirkan dokumentasi foto pelaksanaan penelitian',
      'Melampirkan output analisis data (jika ada)',
    ],
  },
  {
    code: 'presentasi_responsi',
    label: 'Presentasi dan Responsi',
    bobot: 20,
    maxScore: 4,
    minScore: 1,
    step: 0.01,
    details: [
      'Menyajikan laporan hasil penelitian dalam waktu 10—15 menit',
      'Menggunakan bahan tayang yang menarik dan informatif',
      'Melakukan presentasi dengan suara dan intonasi yang jelas',
      'Menggunakan bahasa yang baku/formal',
      'Menunjukkan sikap yang baik dalam melakukan presentasi dan merespons masukan',
      'Menunjukkan kemampuan argumentasi yang baik',
      'Menguasai materi proposal penelitian',
    ],
  },
];

// Total weight should equal 100
export const S2_PROPOSAL_TOTAL_WEIGHT = S2_PROPOSAL_RUBRIC_V1.reduce((sum, c) => sum + c.bobot, 0);

// Criterion codes in order for UI display
export const S2_CRITERION_CODES = [
  'tema_judul',
  'pendahuluan',
  'tinjauan_pustaka',
  'metode_penelitian',
  'daftar_pustaka',
  'lampiran',
  'presentasi_responsi',
];

// Weights array in order
export const S2_PROPOSAL_WEIGHTS = S2_PROPOSAL_RUBRIC_V1.map(c => c.bobot);

// Score limits
export const S2_SCORE_MIN = 1;
export const S2_SCORE_MAX = 4;
export const S2_SCORE_STEP = 0.01;

// Maximum possible weighted total = 4 * 100 = 400
export const S2_MAX_WEIGHTED_TOTAL = 400;

// ============================================================
// HASIL TESIS & SIDANG TESIS RUBRICS (Placeholder for future)
// ============================================================

export interface S2RubricVersion {
  version: string;
  examType: S2ExamType;
  criteria: S2Criterion[];
  totalWeight: number;
}

export const S2_RUBRICS: Record<string, S2RubricVersion> = {
  'proposal-v1': {
    version: 'proposal-v1',
    examType: 'proposal',
    criteria: S2_PROPOSAL_RUBRIC_V1,
    totalWeight: S2_PROPOSAL_TOTAL_WEIGHT,
  },
};

// Helper to get rubric by version
export function getRubric(version: string): S2RubricVersion | undefined {
  return S2_RUBRICS[version];
}