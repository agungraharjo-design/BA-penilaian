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
    nilaiPengujiI: number | null
    nilaiPengujiII: number | null
    nilaiPengujiIII: number | null
    jumlah: number | null
    nilaiAkhir: number | null
  }[]
}

export interface Session {
  id: string
  nama: string
  nim: string
  judulSkripsi: string
  pembimbing: string
  hariTanggal: string
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
  nipDekan: string
  tanggalBa: string
  // Penilaian scores for each examiner
  skorPenguji: (number | null)[][] // [examinerIndex][criterionIndex]
  // Rekap
  rekapEntries: RekapEntry[]
  // Daftar hadir
  pesertaHadir: { nama: string; nim: string }[]
  audienceHadir: { nama: string; nim: string }[]
  created_at?: string
  updated_at?: string
}

export interface RekapEntry {
  nama: string
  nim: string
  nilaiI: number | null
  nilaiII: number | null
  nilaiIII: number | null
}

export const RUBRIC_CRITERIA = [
  { no: 1, label: 'Abstrak', bobot: 6 },
  { no: 2, label: 'Tema dan Judul', bobot: 8 },
  { no: 3, label: 'Pendahuluan', bobot: 8 },
  { no: 4, label: 'Tinjauan Pustaka', bobot: 10 },
  { no: 5, label: 'Metode Penelitian', bobot: 15 },
  { no: 6, label: 'Hasil Penelitian dan Pembahasan', bobot: 20 },
  { no: 7, label: 'Penutup', bobot: 8 },
  { no: 8, label: 'Daftar Pustaka', bobot: 5 },
  { no: 9, label: 'Lampiran', bobot: 5 },
  { no: 10, label: 'Presentasi dan Responsi', bobot: 15 },
]

export const RUBRIC_WEIGHTS = RUBRIC_CRITERIA.map(c => c.bobot)
export const TOTAL_WEIGHT = RUBRIC_WEIGHTS.reduce((a, b) => a + b, 0) // 100
