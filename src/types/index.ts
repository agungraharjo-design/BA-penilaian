// Types matching the UPN Veteran Jakarta template (PSKMPS)
export interface Student {
  nama: string
  nim: string
}

export interface Thesis {
  judul: string
  pembimbing: string
}

export interface SessionInfo {
  hariTanggal: string
  waktu: string
  tempat: string
  semester: string
  ta: string
}

export interface Examiner {
  no: number
  nama: string
  jabatan: string
  tandaTangan?: string
}

export interface RubricScore {
  skor: number | null
  bobot: number
  skorXBobot: number | null
}

export type Decision = 'lulus_perbaikan' | 'tidak_lulus_ulang'

export interface BeritaAcara {
  id: string
  student: Student
  thesis: Thesis
  session: SessionInfo
  examiners: Examiner[]
  decision: Decision
  catatan: string
  dekan: string
  nipDekan: string
  tanggal: string
}

export interface Penilaian {
  id: string
  sessionId: string
  examinerIndex: number // 0, 1, 2
  student: Student
  thesis: Thesis
  session: SessionInfo
  pembimbing: string
  scores: number[] // 10 criteria, each 1-4
  totalSkorXBobot: number | null
  nilaiAkhir: number | null
  hariTanggal: string
  tandaTangan: string
  jabatan: string
}

export interface DaftarHadirPeserta {
  id: string
  session: SessionInfo
  participants: { nama: string; nim: string; tandaTangan?: string; ket?: string }[]
}

export interface DaftarHadirAudience {
  id: string
  session: SessionInfo
  audiences: { nama: string; nim: string; tandaTangan?: string; ket?: string }[]
}

export interface RekapitulasiNilai {
  id: string
  session: SessionInfo
  entries: {
    nama: string
    nim: string
    nilai_penguji_i: number | null
    nilai_penguji_ii: number | null
    nilai_penguji_iii: number | null
    jumlah: number | null
    nilai_akhir: number | null
  }[]
}

export interface Session {
  id: string
  nama: string
  nim: string
  judul_skripsi: string
  pembimbing: string
  hari_tanggal: string
  waktu: string
  tempat: string
  semester: string
  ta: string
  penguji1: string
  penguji2: string
  penguji3: string
  decision: Decision
  catatan: string
  dekan: string
  nip_dekan: string
  tanggal_ba: string
  skor_penguji: (number | null)[][]
  rekap_entries: RekapEntry[]
  peserta_hadir: { nama: string; nim: string }[]
  audience_hadir: { nama: string; nim: string }[]
  ttd_penguji1?: string
  ttd_penguji2?: string
  ttd_penguji3?: string
  ttd_dekan?: string
  pdf_url?: string
  created_at?: string
  updated_at?: string
}

export interface RekapEntry {
  nama: string
  nim: string
  nilai_i: number | null
  nilai_ii: number | null
  nilai_iii: number | null
}

export interface RubricCriterion {
  no: number
  label: string
  bobot: number
  detail: string
}

export const RUBRIC_CRITERIA: RubricCriterion[] = [
  { no: 1, label: 'Abstrak', bobot: 6,
    detail: 'a.\tMenggunakan format abstrak sesuai dengan format universitas;\nb.\tMeringkas latar belakang penelitian\nc.\tMeringkas metode penelitian yang digunakan;\nd.\tMenyampaikan ringkasan hasil dan pembahasan;\ne.\tMenyampaikan ringkasan kesimpulan dan rekomendasi/saran penelitian.' },
  { no: 2, label: 'Tema dan Judul', bobot: 8,
    detail: 'a.\tTema penelitian terbaru dan relevan dengan bidang ilmu\nb.\tMencantumkan variabel-variabel serta waktu, tempat, dan subjek penelitian' },
  { no: 3, label: 'Pendahuluan', bobot: 8,
    detail: 'a.\tMerumuskan latar belakang dan masalah penelitian\nb.\tMenentukan tujuan dan manfaat penelitian' },
  { no: 4, label: 'Tinjauan Pustaka', bobot: 10,
    detail: 'a.\tMenelusuri kepustakaan yang relevan dengan judul, bersumber dari buku, jurnal terakreditasi nasional dan internasional\nb.\tMenyajikan kerangka teori yang komprehensif\nc.\tMenyusun daftar studi literatur atau penelitian terdahulu' },
  { no: 5, label: 'Metode Penelitian', bobot: 15,
    detail: 'a.\tMerumuskan desain penelitian sesuai dengan pertanyaan penelitian;\nb.\tMenyusun prosedur pengambilan sampel (pemilihan populasi, kriteria sampel, pemilihan sampel);\nc.\tMenyusun prosedur pengumpulan data (perizinan, lokasi);\nd.\tMenyusun dan mengembangkan instrumen penelitian;\ne.\tMenyusun definisi operasional penelitian;\nf.\tMenyajikan perangkat dan tahapan analisis data yang telah dilakukan;\ng.\tMenyajikan kerangka konsep dan hipotesis;\nh.\tMenjelaskan prinsip etik dalam proses penelitian.' },
  { no: 6, label: 'Hasil Penelitian dan Pembahasan', bobot: 20,
    detail: 'a.\tMenjelaskan hasil penelitian dengan sistematis (sesuai dengan tujuan penelitian);\nb.\tMenyajikan data hasil penelitian dan interpretasi data dengan jelas dan informatif;\nc.\tMembahas temuan utama penelitian berdasarkan literatur dan penelitian terdahulu, baik yang sejalan maupun yang tidak sejalan dengan hasil penelitian.' },
  { no: 7, label: 'Penutup', bobot: 8,
    detail: 'a.\tMerumuskan kesimpulan sesuai dengan hasil penelitian;\nb.\tMenyusun saran teoritis dan aplikatif sesuai dengan hasil penelitian yang berimplikasi pada bidang keilmuan.' },
  { no: 8, label: 'Daftar Pustaka', bobot: 5,
    detail: 'a.\tMenyajikan daftar pustaka yang digunakan mengikuti format universitas;\nb.\tMelengkapi sumber pustaka dengan proses akses internet yang digunakan;\nc.\tMenggunakan aplikasi pengelolaan daftar pustaka.\nd.\tBersumber dari buku, jurnal terakreditasi nasional dan internasional dengan tahun kepustakaan ≤ 5 tahun terakhir' },
  { no: 9, label: 'Lampiran', bobot: 5,
    detail: 'a.\tMelampirkan linimasa pengerjaan skripsi (time schedule);\nb.\tMelampirkan instrumen penelitian;\nc.\tMelampirkan surat lolos kaji etik\nd.\tMelampirkan dokumen perizinan\ne.\tMelampirkan dokumentasi foto pelaksanaan penelitian\nf.\tMelampirkan output analisis data (jika ada)' },
  { no: 10, label: 'Presentasi dan Responsi', bobot: 15,
    detail: 'a.\tMenyajikan laporan hasil penelitian dalam waktu 10—15 menit;\nb.\tMenggunakan bahan tayang yang menarik dan informatif\nc.\tMelakukan presentasi dengan suara dan intonasi yang jelas;\nd.\tMenggunakan bahasa yang baku/formal;\ne.\tMenunjukkan sikap yang baik dalam melakukan presentasi dan merespons masukan;\nf.\tMenunjukkan kemampuan argumentasi yang baik;\ng.\tMenguasai materi hasil penelitian.' },
]

export const RUBRIC_WEIGHTS = RUBRIC_CRITERIA.map(c => c.bobot)
export const TOTAL_WEIGHT = RUBRIC_WEIGHTS.reduce((a, b) => a + b, 0) // 100
