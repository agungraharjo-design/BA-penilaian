// Utility functions for grade calculation
export function calcSkorXBobot(skor: number | null, bobot: number): number {
  if (skor === null || skor < 1 || skor > 4) return 0
  return skor * bobot
}

export function calcTotalSkorXBobot(scores: (number | null)[], bobots: number[]): number {
  return scores.reduce((sum: number, s, i) => sum + (s !== null ? s * bobots[i] : 0), 0)
}

export function calcNilaiAkhir(totalSkorXBobot: number, totalBobot: number = 100): number {
  return (totalSkorXBobot / (totalBobot * 4)) * 100
}

export function calcGrade(nilai: number): string {
  if (nilai >= 85) return 'A'
  if (nilai >= 80) return 'A-'
  if (nilai >= 75) return 'B+'
  if (nilai >= 70) return 'B'
  if (nilai >= 65) return 'B-'
  if (nilai >= 60) return 'C+'
  if (nilai >= 55) return 'C'
  if (nilai >= 50) return 'C-'
  if (nilai >= 40) return 'D'
  return 'E'
}

// Generate UUID v4
export function generateId(): string {
  return crypto.randomUUID?.() ?? 
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
    })
}

// Format date to Indonesian
export function formatDateIndonesia(date: Date): string {
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
  ]
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`
}

export function getTodayFormatted(): string {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu']
  const d = new Date()
  return `${days[d.getDay()]}, ${d.getDate()} ${['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][d.getMonth()]} ${d.getFullYear()}`
}
