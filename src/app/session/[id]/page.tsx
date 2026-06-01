'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { supabase, subscribeToSession } from '@/lib/supabase'
import { Session, RUBRIC_CRITERIA } from '@/types'
import {
  calcTotalSkorXBobot, calcNilaiAkhir, calcGrade,
  getTodayFormatted, generateId,
} from '@/lib/utils'

type Tab = 'berita-acara' | 'penilaian-1' | 'penilaian-2' | 'penilaian-3' | 'rekap-nilai' | 'daftar-hadir' | 'preview'

export default function SessionPage() {
  const params = useParams()
  const sessionId = params.id as string

  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>('berita-acara')
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [syncStatus, setSyncStatus] = useState<'live' | 'saving' | 'offline'>('live')
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null)

  // Load session
  useEffect(() => {
    if (!sessionId) return
    loadSession()
    const channel = subscribeToSession(sessionId, (updated: any) => {
      if (updated) setSession(updated as Session)
    })
    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  async function loadSession() {
    const { data } = await supabase.from('sessions').select('*').eq('id', sessionId).single()
    if (data) setSession(data as Session)
    setLoading(false)
  }

  // Auto-save with debounce
  const autoSave = useCallback((updated: Session) => {
    setSession(updated)
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(async () => {
      setSyncStatus('saving')
      const { error } = await supabase
        .from('sessions')
        .upsert({ ...updated, updated_at: new Date().toISOString() })
        .eq('id', sessionId)
      if (!error) {
        setLastSaved(new Date())
        setSyncStatus('live')
      } else {
        setSyncStatus('offline')
      }
    }, 800)
  }, [sessionId])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-gray-500 font-serif text-lg">Memuat data sidang...</div>
  if (!session) return <div className="flex items-center justify-center min-h-[60vh] text-red-500 font-serif text-lg">Sidang tidak ditemukan</div>

  const tabs: { key: Tab; label: string }[] = [
    { key: 'berita-acara', label: 'Berita Acara' },
    { key: 'penilaian-1', label: 'Penilaian Penguji I' },
    { key: 'penilaian-2', label: 'Penilaian Penguji II' },
    { key: 'penilaian-3', label: 'Penilaian Penguji III' },
    { key: 'rekap-nilai', label: 'Rekapitulasi Nilai' },
    { key: 'daftar-hadir', label: 'Daftar Hadir' },
    { key: 'preview', label: 'Preview & PDF' },
  ]

  const updateField = (field: string, value: any) => {
    if (!session) return
    autoSave({ ...session, [field]: value })
  }

  return (
    <div className="max-w-5xl mx-auto p-4">
      {/* Sync indicator */}
      <div className={`sync-indicator ${syncStatus === 'live' ? 'bg-green-100 text-green-800' : syncStatus === 'saving' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
        <span className={`w-2 h-2 rounded-full ${syncStatus === 'live' ? 'bg-green-500' : syncStatus === 'saving' ? 'bg-yellow-500' : 'bg-red-500'}`} />
        {syncStatus === 'live' ? 'Tersimpan' : syncStatus === 'saving' ? 'Menyimpan...' : 'Offline'}
        {lastSaved && <span className="ml-1 opacity-60">{lastSaved.toLocaleTimeString('id-ID')}</span>}
      </div>

      {/* Tabs */}
      <div className="no-print flex flex-wrap gap-1 mb-4 bg-white rounded-lg shadow-sm p-1 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 rounded text-sm font-sans font-medium whitespace-nowrap transition-colors ${
              activeTab === t.key
                ? 'bg-blue-900 text-white shadow'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-lg shadow-md p-6 print:shadow-none print:p-0">
        {activeTab === 'berita-acara' && (
          <BeritaAcaraForm session={session} onUpdate={autoSave} />
        )}
        {activeTab === 'penilaian-1' && (
          <PenilaianForm session={session} onUpdate={autoSave} examinerIndex={0} label="Penguji I/Ketua Penguji" />
        )}
        {activeTab === 'penilaian-2' && (
          <PenilaianForm session={session} onUpdate={autoSave} examinerIndex={1} label="Penguji II/Anggota Penguji" />
        )}
        {activeTab === 'penilaian-3' && (
          <PenilaianForm session={session} onUpdate={autoSave} examinerIndex={2} label="Penguji III/Anggota Penguji" />
        )}
        {activeTab === 'rekap-nilai' && (
          <RekapNilaiForm session={session} onUpdate={autoSave} />
        )}
        {activeTab === 'daftar-hadir' && (
          <DaftarHadirForm session={session} onUpdate={autoSave} />
        )}
        {activeTab === 'preview' && (
          <PreviewAll session={session} />
        )}
      </div>
    </div>
  )
}

// ─── BERITA ACARA ──────────────────────────────────────────────
function BeritaAcaraForm({ session, onUpdate }: { session: Session; onUpdate: (s: Session) => void }) {
  return (
    <div className="space-y-6">
      <div className="text-center border-b-2 border-black pb-4">
        <h1 className="text-xl font-bold uppercase">Berita Acara Sidang Skripsi</h1>
        <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
        <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
        <p className="text-sm font-semibold">SEMESTER GENAP T.A. 2025/2026</p>
      </div>

      <p>
        Hari ini,{' '}
        <input
          value={session.tanggal_ba}
          onChange={(e) => onUpdate({ ...session, tanggal_ba: e.target.value })}
          className="border-b border-gray-400 bg-transparent px-1 font-semibold w-56"
        />
        , telah dilaksanakan sidang skripsi bagi mahasiswa:
      </p>

      <table className="w-full">
        <tbody>
          <tr>
            <td className="w-24">Nama</td>
            <td className="w-4">:</td>
            <td><input value={session.nama} onChange={(e) => onUpdate({ ...session, nama: e.target.value })} className="w-full border-b border-gray-400 bg-transparent" /></td>
          </tr>
          <tr>
            <td>NIM</td>
            <td>:</td>
            <td><input value={session.nim} onChange={(e) => onUpdate({ ...session, nim: e.target.value })} className="w-full border-b border-gray-400 bg-transparent" /></td>
          </tr>
        </tbody>
      </table>

      <p>Dengan judul penelitian sebagai berikut:</p>
      <p className="font-semibold ml-4">
        Judul Penelitian:{' '}
        <input
          value={session.judul_skripsi}
          onChange={(e) => onUpdate({ ...session, judul_skripsi: e.target.value })}
          className="w-full border-b border-gray-400 bg-transparent"
        />
      </p>

      <div className="border-t pt-4 space-y-2">
        <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-blue-50">
          <input
            type="radio"
            name="decision"
            checked={session.decision === 'lulus_perbaikan'}
            onChange={() => onUpdate({ ...session, decision: 'lulus_perbaikan' })}
            className="mt-1"
          />
          <div>
            <span className="font-semibold">Skripsi dilanjutkan dengan perbaikan</span>
          </div>
        </label>
        <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-red-50">
          <input
            type="radio"
            name="decision"
            checked={session.decision === 'tidak_lulus_ulang'}
            onChange={() => onUpdate({ ...session, decision: 'tidak_lulus_ulang' })}
            className="mt-1"
          />
          <div>
            <span className="font-semibold">Skripsi tidak diluluskan/Mengulang Sidang Skripsi</span>
          </div>
        </label>
      </div>

      {/* Tim Penguji Table */}
      <div>
        <h3 className="font-bold text-center mb-1">TIM PENGUJI</h3>
        <table className="template-table">
          <thead>
            <tr>
              <th className="w-12">NO</th>
              <th>DOSEN PENGUJI</th>
              <th>JABATAN DALAM SIDANG</th>
              <th className="w-24">TANDA TANGAN</th>
            </tr>
          </thead>
          <tbody>
            {[
              { no: 1, field: 'penguji1', jabatan: 'Penguji I/Ketua Penguji' },
              { no: 2, field: 'penguji2', jabatan: 'Penguji II/Anggota Penguji' },
              { no: 3, field: 'penguji3', jabatan: 'Penguji III/Anggota Penguji' },
            ].map((p) => (
              <tr key={p.no}>
                <td className="text-center">{p.no}</td>
                <td>
                  <input
                    value={(session as any)[p.field] || ''}
                    onChange={(e) => onUpdate({ ...session, [p.field]: e.target.value })}
                    className="w-full bg-transparent"
                    placeholder="Nama dosen"
                  />
                </td>
                <td>{p.jabatan}</td>
                <td className="h-10"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Catatan */}
      <div>
        <p className="font-semibold">Catatan:</p>
        <textarea
          value={session.catatan}
          onChange={(e) => onUpdate({ ...session, catatan: e.target.value })}
          className="w-full border border-gray-300 rounded p-2 min-h-[80px] font-serif"
        />
        <p className="text-xs text-gray-500 mt-1">*) Beri tanda centang (✓) pada kotak yang dipilih</p>
      </div>

      {/* Dekan signature */}
      <div className="text-right mt-8">
        <p>Depok,{' '}
          <input
            value={session.tanggal_ba}
            onChange={(e) => onUpdate({ ...session, tanggal_ba: e.target.value })}
            className="border-b border-gray-400 bg-transparent w-40 text-center"
          />
        </p>
        <p className="mt-1">Dekan</p>
        <div className="h-16"></div>
        <input
          value={session.dekan}
          onChange={(e) => onUpdate({ ...session, dekan: e.target.value })}
          className="border-b border-gray-400 bg-transparent text-center font-semibold"
        />
        <br />
        <input
          value={session.nip_dekan}
          onChange={(e) => onUpdate({ ...session, nip_dekan: e.target.value })}
          className="border-b border-gray-400 bg-transparent text-center text-sm"
        />
      </div>
    </div>
  )
}

// ─── FORM PENILAIAN ─────────────────────────────────────────
function PenilaianForm({
  session, onUpdate, examinerIndex, label
}: {
  session: Session; onUpdate: (s: Session) => void; examinerIndex: number; label: string
}) {
  const scores = session.skor_penguji[examinerIndex]

  const setScore = (criterionIdx: number, value: string) => {
    const v = value === '' ? null : Math.min(4, Math.max(1, Number(value)))
    const newScores = [...session.skor_penguji]
    newScores[examinerIndex] = [
      ...newScores[examinerIndex].slice(0, criterionIdx),
      v,
      ...newScores[examinerIndex].slice(criterionIdx + 1),
    ]
    onUpdate({ ...session, skor_penguji: newScores })
  }

  const totalSkorXBobot = calcTotalSkorXBobot(scores, RUBRIC_CRITERIA.map(c => c.bobot))
  const nilaiAkhir = calcNilaiAkhir(totalSkorXBobot)
  const grade = calcGrade(nilaiAkhir)

  return (
    <div className="space-y-4">
      <div className="text-center border-b-2 border-black pb-4">
        <h1 className="text-xl font-bold uppercase">Formulir Penilaian Sidang Skripsi</h1>
        <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
        <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
        <p className="text-sm font-semibold">SEMESTER GENAP T.A. 2025/2026</p>
      </div>

      {/* Student info row */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
        <div className="flex">
          <span className="w-36">Nama Peserta</span><span className="w-4">:</span>
          <input value={session.nama} onChange={(e) => onUpdate({ ...session, nama: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" />
        </div>
        <div className="flex">
          <span className="w-36">NIM</span><span className="w-4">:</span>
          <input value={session.nim} onChange={(e) => onUpdate({ ...session, nim: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" />
        </div>
        <div className="flex">
          <span className="w-36">Hari, Tanggal Sidang</span><span className="w-4">:</span>
          <input value={session.hari_tanggal} onChange={(e) => onUpdate({ ...session, hari_tanggal: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" />
        </div>
        <div className="flex">
          <span className="w-36">Waktu Sidang</span><span className="w-4">:</span>
          <input value={session.waktu} onChange={(e) => onUpdate({ ...session, waktu: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" />
        </div>
        <div className="flex">
          <span className="w-36">Tempat Sidang</span><span className="w-4">:</span>
          <input value={session.tempat} onChange={(e) => onUpdate({ ...session, tempat: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" />
        </div>
        <div className="flex">
          <span className="w-36">Dosen Pembimbing</span><span className="w-4">:</span>
          <input value={session.pembimbing} onChange={(e) => onUpdate({ ...session, pembimbing: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" />
        </div>
      </div>
      <div className="flex">
        <span className="w-36">Judul Skripsi</span><span className="w-4">:</span>
        <input value={session.judul_skripsi} onChange={(e) => onUpdate({ ...session, judul_skripsi: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" />
      </div>

      {/* Rubric table */}
      <table className="template-table text-xs">
        <thead>
          <tr>
            <th className="w-8">NO</th>
            <th>PARAMETER PENILAIAN</th>
            <th className="w-20">SKOR NILAI (1—4)</th>
            <th className="w-12">BOBOT</th>
            <th className="w-20">SKOR NILAI × BOBOT</th>
          </tr>
        </thead>
        <tbody>
          {RUBRIC_CRITERIA.map((c, i) => {
            const skorXBobot = scores[i] !== null ? scores[i]! * c.bobot : null
            return (
              <tr key={c.no}>
                <td className="text-center align-top">{c.no}.</td>
                <td className="text-[11px] leading-tight">{c.label}</td>
                <td className="text-center">
                  <input
                    type="number"
                    min={1}
                    max={4}
                    step={1}
                    value={scores[i] ?? ''}
                    onChange={(e) => setScore(i, e.target.value)}
                    className="w-16 text-center border border-gray-300 rounded px-1 py-0.5"
                  />
                </td>
                <td className="text-center">{c.bobot}</td>
                <td className="text-center font-semibold">
                  {skorXBobot !== null ? skorXBobot : ''}
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td colSpan={4} className="text-center">TOTAL SKOR NILAI × BOBOT</td>
            <td className="text-center">{totalSkorXBobot}</td>
          </tr>
          <tr className="font-bold">
            <td colSpan={4} className="text-center">
              NILAI AKHIR [(Total Skor Nilai × Bobot)/400 × 100]
            </td>
            <td className="text-center">{nilaiAkhir > 0 ? nilaiAkhir.toFixed(2) : ''}</td>
          </tr>
          <tr className="font-bold">
            <td colSpan={4} className="text-center">HURUF MUTU</td>
            <td className="text-center">{nilaiAkhir > 0 ? grade : ''}</td>
          </tr>
        </tfoot>
      </table>

      <p className="text-xs text-gray-600 italic">
        *Bila presentasi skripsi dilakukan menggunakan Bahasa Inggris, nilai akhir ditambahkan 2—6 poin.
      </p>

      {/* Signature */}
      <div className="mt-6">
        <div className="flex">
          <span className="w-32">Hari, Tanggal</span><span className="w-4">:</span>
          <input
            value={session.hari_tanggal}
            onChange={(e) => onUpdate({ ...session, hari_tanggal: e.target.value })}
            className="flex-1 border-b border-gray-400 bg-transparent"
          />
        </div>
        <div className="flex mt-8 justify-end">
          <div className="text-center w-56">
            <p className="mb-16">Tanda Tangan</p>
            <p className="border-t border-black pt-1 font-semibold">{label}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── REKAPITULASI NILAI ──────────────────────────────────────
function RekapNilaiForm({ session, onUpdate }: { session: Session; onUpdate: (s: Session) => void }) {
  const entries = session.rekap_entries || [{ nama: session.nama, nim: session.nim, nilai_i: null, nilai_ii: null, nilai_iii: null }]
  const rekap = session.rekap_entries && session.rekap_entries.length > 0 ? session.rekap_entries : session.rekap_entries

  const updateEntry = (idx: number, field: string, value: any) => {
    const newEntries = [...entries]
    newEntries[idx] = { ...newEntries[idx], [field]: value }
    onUpdate({ ...session, rekap_entries: newEntries })
  }

  // Calculate scores from penilaian for each examiner
  const calcExaminerTotal = (examIdx: number) => {
    const scores = session.skor_penguji[examIdx]
    const total = calcTotalSkorXBobot(scores, RUBRIC_CRITERIA.map(c => c.bobot))
    return total > 0 ? calcNilaiAkhir(total) : null
  }

  const nilaiI = calcExaminerTotal(0)
  const nilaiII = calcExaminerTotal(1)
  const nilaiIII = calcExaminerTotal(2)
  const jumlah = [nilaiI, nilaiII, nilaiIII].reduce((s: number, v) => s + (v ?? 0), 0)
  const count = [nilaiI, nilaiII, nilaiIII].filter(v => v !== null).length
  const rataRata = count > 0 ? jumlah / count : null

  return (
    <div className="space-y-4">
      <div className="text-center border-b-2 border-black pb-4">
        <h1 className="text-xl font-bold uppercase">Rekapitulasi Nilai Sidang Skripsi</h1>
        <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
        <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
        <p className="text-sm font-semibold">SEMESTER GENAP T.A. 2025/2026</p>
      </div>

      <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
        <div className="flex"><span className="w-36">Hari, Tanggal Sidang</span><span className="w-4">:</span><input value={session.hari_tanggal} onChange={(e) => onUpdate({ ...session, hari_tanggal: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" /></div>
        <div className="flex"><span className="w-28">Waktu Sidang</span><span className="w-4">:</span><input value={session.waktu} onChange={(e) => onUpdate({ ...session, waktu: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" /></div>
        <div className="flex"><span className="w-28">Tempat Sidang</span><span className="w-4">:</span><input value={session.tempat} onChange={(e) => onUpdate({ ...session, tempat: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" /></div>
      </div>

      {/* Tim Penguji */}
      <div>
        <h3 className="font-bold text-center mb-1">TIM PENGUJI</h3>
        <table className="template-table text-sm">
          <thead>
            <tr><th className="w-8">NO</th><th>DOSEN PENGUJI</th><th>JABATAN DALAM SIDANG</th><th className="w-24">TANDA TANGAN</th></tr>
          </thead>
          <tbody>
            {[
              { no: 1, field: 'penguji1', jabatan: 'Penguji I/Ketua Penguji' },
              { no: 2, field: 'penguji2', jabatan: 'Penguji II/Anggota Penguji' },
              { no: 3, field: 'penguji3', jabatan: 'Penguji III/Anggota Penguji' },
            ].map((p) => (
              <tr key={p.no}>
                <td className="text-center">{p.no}</td>
                <td><input value={(session as any)[p.field] || ''} onChange={(e) => onUpdate({ ...session, [p.field]: e.target.value })} className="w-full bg-transparent" /></td>
                <td>{p.jabatan}</td>
                <td className="h-8"></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Nilai table */}
      <table className="template-table text-sm">
        <thead>
          <tr>
            <th className="w-8">NO</th>
            <th>NAMA</th>
            <th className="w-20">NIM</th>
            <th className="w-16">NILAI<br/>PENGUJI I</th>
            <th className="w-16">NILAI<br/>PENGUJI II</th>
            <th className="w-16">NILAI<br/>PENGUJI III</th>
            <th className="w-16">JUMLAH</th>
            <th className="w-16">NILAI<br/>AKHIR</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i}>
              <td className="text-center">{i + 1}.</td>
              <td><input value={e.nama} onChange={(ev) => updateEntry(i, 'nama', ev.target.value)} className="w-full bg-transparent" /></td>
              <td><input value={e.nim} onChange={(ev) => updateEntry(i, 'nim', ev.target.value)} className="w-full bg-transparent" /></td>
              <td className="text-center">{nilaiI !== null ? nilaiI.toFixed(2) : ''}</td>
              <td className="text-center">{nilaiII !== null ? nilaiII.toFixed(2) : ''}</td>
              <td className="text-center">{nilaiIII !== null ? nilaiIII.toFixed(2) : ''}</td>
              <td className="text-center font-bold">{jumlah > 0 ? jumlah.toFixed(2) : ''}</td>
              <td className="text-center font-bold">{rataRata !== null ? rataRata.toFixed(2) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Signature */}
      <div className="text-right mt-8">
        <p>Depok,{' '}
          <input value={session.tanggal_ba} onChange={(e) => onUpdate({ ...session, tanggal_ba: e.target.value })} className="border-b border-gray-400 bg-transparent w-40 text-center" />
        </p>
        <p>Dekan</p>
        <div className="h-16"></div>
        <p className="font-semibold">{session.dekan}</p>
        <p className="text-sm">NIP. {session.nip_dekan}</p>
      </div>
    </div>
  )
}

// ─── DAFTAR HADIR ────────────────────────────────────────────
function DaftarHadirForm({ session, onUpdate }: { session: Session; onUpdate: (s: Session) => void }) {
  const peserta = session.peserta_hadir || [{ nama: session.nama, nim: session.nim }]
  const audience = session.audience_hadir || []

  const updatePeserta = (idx: number, field: string, value: string) => {
    const newP = [...peserta]
    newP[idx] = { ...newP[idx], [field]: value }
    onUpdate({ ...session, peserta_hadir: newP })
  }

  const updateAudience = (idx: number, field: string, value: string) => {
    const newA = [...audience]
    newA[idx] = { ...newA[idx], [field]: value }
    onUpdate({ ...session, audience_hadir: newA })
  }

  const addAudience = () => {
    onUpdate({ ...session, audience_hadir: [...audience, { nama: '', nim: '' }] })
  }

  return (
    <div className="space-y-8">
      {/* DAFTAR HADIR PESERTA */}
      <div>
        <div className="text-center border-b-2 border-black pb-4">
          <h1 className="text-xl font-bold uppercase">Daftar Hadir Peserta Sidang Skripsi</h1>
          <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
          <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
          <p className="text-sm font-semibold">SEMESTER GENAP T.A. 2025/2026</p>
        </div>
        <table className="template-table text-sm mt-4">
          <thead>
            <tr><th className="w-8">NO</th><th>NAMA PESERTA</th><th className="w-24">NIM</th><th className="w-24">TANDA TANGAN</th><th className="w-16">KET</th></tr>
          </thead>
          <tbody>
            {peserta.map((p, i) => (
              <tr key={i}>
                <td className="text-center">{i + 1}.</td>
                <td><input value={p.nama} onChange={(e) => updatePeserta(i, 'nama', e.target.value)} className="w-full bg-transparent" /></td>
                <td><input value={p.nim} onChange={(e) => updatePeserta(i, 'nim', e.target.value)} className="w-full bg-transparent" /></td>
                <td className="h-8"></td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* DAFTAR HADIR AUDIENS */}
      <div>
        <div className="text-center border-b-2 border-black pb-4">
          <h1 className="text-xl font-bold uppercase">Daftar Hadir Mahasiswa Sebagai Audiens Sidang Skripsi</h1>
          <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
          <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
          <p className="text-sm font-semibold">SEMESTER GENAP T.A. 2025/2026</p>
        </div>
        <table className="template-table text-sm mt-4">
          <thead>
            <tr><th className="w-8">NO</th><th>NAMA MAHASISWA</th><th className="w-24">NIM</th><th className="w-24">TANDA TANGAN</th><th className="w-16">KET</th></tr>
          </thead>
          <tbody>
            {audience.map((a, i) => (
              <tr key={i}>
                <td className="text-center">{i + 1}.</td>
                <td><input value={a.nama} onChange={(e) => updateAudience(i, 'nama', e.target.value)} className="w-full bg-transparent" placeholder="Nama mahasiswa" /></td>
                <td><input value={a.nim} onChange={(e) => updateAudience(i, 'nim', e.target.value)} className="w-full bg-transparent" placeholder="NIM" /></td>
                <td className="h-8"></td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addAudience} className="no-print mt-2 px-3 py-1 bg-gray-100 border rounded text-sm hover:bg-gray-200 font-sans">+ Tambah baris audiens</button>
      </div>
    </div>
  )
}

// ─── PREVIEW & PDF ───────────────────────────────────────────
function PreviewAll({ session }: { session: Session }) {
  const previewRef = useRef<HTMLDivElement>(null)

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPDF = async () => {
    const html2canvas = (await import('html2canvas')).default
    const { jsPDF } = await import('jspdf')

    if (!previewRef.current) return

    const canvas = await html2canvas(previewRef.current, {
      scale: 2,
      useCORS: true,
      logging: false,
    })

    const imgData = canvas.toDataURL('image/png')
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pdfWidth = pdf.internal.pageSize.getWidth()
    const pdfHeight = pdf.internal.pageSize.getHeight()
    const imgWidth = pdfWidth
    const imgHeight = (canvas.height * pdfWidth) / canvas.width

    let heightLeft = imgHeight
    let position = 0

    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
    heightLeft -= pdfHeight

    while (heightLeft > 0) {
      position = heightLeft - imgHeight + pdfHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pdfHeight
    }

    pdf.save(`BA_Sidang_${session.nama.replace(/\s+/g, '_')}_${session.nim}.pdf`)
  }

  const calculateAll = () => {
    const scoresByExaminer = [0, 1, 2].map(idx => {
      const scores = session.skor_penguji[idx]
      const totalSkorXBobot = calcTotalSkorXBobot(scores, RUBRIC_CRITERIA.map(c => c.bobot))
      const nilaiAkhir = calcNilaiAkhir(totalSkorXBobot)
      return { totalSkorXBobot, nilaiAkhir }
    })
    const jumlah = scoresByExaminer.reduce((s, e) => s + e.nilaiAkhir, 0)
    const count = scoresByExaminer.filter(e => e.nilaiAkhir > 0).length
    const rataRata = count > 0 ? jumlah / count : 0
    return { scoresByExaminer, jumlah, rataRata }
  }

  const calc = calculateAll()

  return (
    <div>
      <div className="no-print flex gap-3 mb-6">
        <button onClick={handlePrint} className="bg-blue-900 text-white px-6 py-2 rounded hover:bg-blue-800 font-sans text-sm font-medium flex items-center gap-2">
          🖨 Cetak / Print
        </button>
        <button onClick={handleDownloadPDF} className="bg-green-800 text-white px-6 py-2 rounded hover:bg-green-700 font-sans text-sm font-medium flex items-center gap-2">
          ⬇ Download PDF
        </button>
        <span className="text-xs text-gray-500 self-center ml-2 font-sans">(PDF akan sesuai dengan template asli)</span>
      </div>

      <div ref={previewRef} className="print-area bg-white p-8 space-y-12" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>
        {/* ===== BERITA ACARA ===== */}
        <div className="border-b-2 border-black pb-4">
          <h1 className="text-xl font-bold text-center uppercase">Berita Acara Sidang Skripsi</h1>
          <p className="text-sm text-center">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
          <p className="text-sm text-center">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
          <p className="text-sm text-center font-bold">SEMESTER GENAP T.A. 2025/2026</p>
        </div>

        <p className="text-justify">
          Hari ini, {session.tanggal_ba || '______________'}, telah dilaksanakan sidang skripsi bagi mahasiswa:
        </p>

        <table className="w-full">
          <tbody>
            <tr><td className="w-24">Nama</td><td className="w-4">:</td><td>{session.nama || '______________'}</td></tr>
            <tr><td>NIM</td><td>:</td><td>{session.nim || '______________'}</td></tr>
          </tbody>
        </table>

        <p>Dengan judul penelitian sebagai berikut :</p>
        <p className="font-bold ml-4">Judul Penelitian: {session.judul_skripsi || '________________________________________'}</p>

        <p className="mt-4">
          Dinyatakan bahwa{' '}
          {session.decision === 'lulus_perbaikan'
            ? '✓ Skripsi dilanjutkan dengan perbaikan'
            : '✓ Skripsi tidak diluluskan/Mengulang Sidang Skripsi'}
        </p>

        <div className="mt-6">
          <h3 className="font-bold text-center">TIM PENGUJI</h3>
          <table className="template-table mt-1">
            <thead><tr><th className="w-12">NO</th><th>DOSEN PENGUJI</th><th>JABATAN DALAM SIDANG</th><th className="w-24">TANDA TANGAN</th></tr></thead>
            <tbody>
              <tr><td className="text-center">1</td><td>{session.penguji1 || '______________'}</td><td>Penguji I/Ketua Penguji</td><td className="h-10"></td></tr>
              <tr><td className="text-center">2</td><td>{session.penguji2 || '______________'}</td><td>Penguji II/Anggota Penguji</td><td className="h-10"></td></tr>
              <tr><td className="text-center">3</td><td>{session.penguji3 || '______________'}</td><td>Penguji III/Anggota Penguji</td><td className="h-10"></td></tr>
            </tbody>
          </table>
        </div>

        {session.catatan && (
          <div className="mt-4">
            <p className="font-bold">Catatan:</p>
            <p className="whitespace-pre-wrap">{session.catatan}</p>
          </div>
        )}

        <div className="text-right mt-10">
          <p>Depok, {session.tanggal_ba || '______________'}</p>
          <p>Dekan</p>
          <div className="h-16"></div>
          <p className="font-bold">{session.dekan}</p>
          <p className="text-sm">NIP. {session.nip_dekan}</p>
        </div>

        {/* ===== FORM PENILAIAN (3 examiners) ===== */}
        {[0, 1, 2].map((examIdx) => {
          const scores = session.skor_penguji[examIdx]
          const labels = ['Penguji I/Ketua Penguji', 'Penguji II/Anggota Penguji', 'Penguji III/Anggota Penguji']
          const namaPenguji = [session.penguji1, session.penguji2, session.penguji3]
          return (
            <div key={examIdx} className="mt-12 page-break">
              <div className="border-b-2 border-black pb-4">
                <h1 className="text-xl font-bold text-center uppercase">Formulir Penilaian Sidang Skripsi</h1>
                <p className="text-sm text-center">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
                <p className="text-sm text-center">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
                <p className="text-sm text-center font-bold">SEMESTER GENAP T.A. 2025/2026</p>
              </div>

              <table className="w-full mt-2 text-sm">
                <tbody>
                  <tr><td className="w-36">Nama Peserta</td><td className="w-4">:</td><td>{session.nama}</td><td className="w-36">NIM</td><td className="w-4">:</td><td>{session.nim}</td></tr>
                  <tr><td>Hari, Tanggal Sidang</td><td>:</td><td>{session.hari_tanggal}</td><td>Waktu Sidang</td><td>:</td><td>{session.waktu}</td></tr>
                  <tr><td>Tempat Sidang</td><td>:</td><td>{session.tempat}</td><td>Dosen Pembimbing</td><td>:</td><td>{session.pembimbing}</td></tr>
                </tbody>
              </table>
              <p className="text-sm mt-1"><span className="font-semibold">Judul Skripsi:</span> {session.judul_skripsi}</p>

              <table className="template-table text-xs mt-3">
                <thead>
                  <tr><th className="w-8">NO</th><th>PARAMETER PENILAIAN</th><th className="w-20">SKOR NILAI (1—4)</th><th className="w-12">BOBOT</th><th className="w-20">SKOR NILAI × BOBOT</th></tr>
                </thead>
                <tbody>
                  {RUBRIC_CRITERIA.map((c, i) => {
                    const skorXBobot = scores[i] !== null ? scores[i]! * c.bobot : null
                    return (
                      <tr key={c.no}>
                        <td className="text-center align-top">{c.no}.</td>
                        <td className="text-[11px] leading-tight">{c.label}</td>
                        <td className="text-center">{scores[i] ?? ''}</td>
                        <td className="text-center">{c.bobot}</td>
                        <td className="text-center font-bold">{skorXBobot ?? ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-bold">
                    <td colSpan={4} className="text-center">TOTAL SKOR NILAI × BOBOT</td>
                    <td className="text-center">{calc.scoresByExaminer[examIdx].totalSkorXBobot}</td>
                  </tr>
                  <tr className="font-bold">
                    <td colSpan={4} className="text-center">NILAI AKHIR [(Total Skor Nilai × Bobot)/400 × 100]</td>
                    <td className="text-center">{calc.scoresByExaminer[examIdx].nilaiAkhir > 0 ? calc.scoresByExaminer[examIdx].nilaiAkhir.toFixed(2) : ''}</td>
                  </tr>
                  <tr className="font-bold">
                    <td colSpan={4} className="text-center">HURUF MUTU</td>
                    <td className="text-center">{calc.scoresByExaminer[examIdx].nilaiAkhir > 0 ? calcGrade(calc.scoresByExaminer[examIdx].nilaiAkhir) : ''}</td>
                  </tr>
                </tfoot>
              </table>

              <p className="text-xs mt-1 italic">*Bila presentasi skripsi dilakukan menggunakan Bahasa Inggris, nilai akhir ditambahkan 2—6 poin.</p>

              <div className="mt-6">
                <p>Hari, Tanggal: {session.hari_tanggal}</p>
                <div className="flex justify-end mt-12">
                  <div className="text-center w-56">
                    <p>Tanda Tangan</p>
                    <div className="h-14"></div>
                    <p className="border-t border-black pt-1 font-bold">{labels[examIdx]}</p>
                    <p className="text-sm">{namaPenguji[examIdx]}</p>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {/* ===== REKAPITULASI NILAI ===== */}
        <div className="mt-12 page-break">
          <div className="border-b-2 border-black pb-4">
            <h1 className="text-xl font-bold text-center uppercase">Rekapitulasi Nilai Sidang Skripsi</h1>
            <p className="text-sm text-center">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
            <p className="text-sm text-center">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
            <p className="text-sm text-center font-bold">SEMESTER GENAP T.A. 2025/2026</p>
          </div>

          <table className="w-full mt-2 text-sm">
            <tbody>
              <tr><td className="w-36">Hari, Tanggal Sidang</td><td className="w-4">:</td><td>{session.hari_tanggal}</td><td className="w-28">Waktu Sidang</td><td className="w-4">:</td><td>{session.waktu}</td><td className="w-28">Tempat Sidang</td><td className="w-4">:</td><td>{session.tempat}</td></tr>
            </tbody>
          </table>

          <h3 className="font-bold text-center mt-4">TIM PENGUJI</h3>
          <table className="template-table text-sm">
            <thead><tr><th className="w-12">NO</th><th>DOSEN PENGUJI</th><th>JABATAN DALAM SIDANG</th><th className="w-24">TANDA TANGAN</th></tr></thead>
            <tbody>
              <tr><td className="text-center">1</td><td>{session.penguji1 || '______________'}</td><td>Penguji I/Ketua Penguji</td><td className="h-8"></td></tr>
              <tr><td className="text-center">2</td><td>{session.penguji2 || '______________'}</td><td>Penguji II/Anggota Penguji</td><td className="h-8"></td></tr>
              <tr><td className="text-center">3</td><td>{session.penguji3 || '______________'}</td><td>Penguji III/Anggota Penguji</td><td className="h-8"></td></tr>
            </tbody>
          </table>

          <table className="template-table text-sm mt-4">
            <thead>
              <tr>
                <th className="w-8">NO</th><th>NAMA</th><th className="w-20">NIM</th>
                <th className="w-16">NILAI<br/>PENGUJI I</th><th className="w-16">NILAI<br/>PENGUJI II</th><th className="w-16">NILAI<br/>PENGUJI III</th>
                <th className="w-16">JUMLAH</th><th className="w-16">NILAI<br/>AKHIR</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-center">1.</td><td>{session.nama}</td><td>{session.nim}</td>
                <td className="text-center">{calc.scoresByExaminer[0].nilaiAkhir > 0 ? calc.scoresByExaminer[0].nilaiAkhir.toFixed(2) : ''}</td>
                <td className="text-center">{calc.scoresByExaminer[1].nilaiAkhir > 0 ? calc.scoresByExaminer[1].nilaiAkhir.toFixed(2) : ''}</td>
                <td className="text-center">{calc.scoresByExaminer[2].nilaiAkhir > 0 ? calc.scoresByExaminer[2].nilaiAkhir.toFixed(2) : ''}</td>
                <td className="text-center font-bold">{calc.jumlah > 0 ? calc.jumlah.toFixed(2) : ''}</td>
                <td className="text-center font-bold">{calc.rataRata > 0 ? calc.rataRata.toFixed(2) : ''}</td>
              </tr>
            </tbody>
          </table>

          <div className="text-right mt-10">
            <p>Depok, {session.tanggal_ba || '______________'}</p>
            <p>Dekan</p>
            <div className="h-16"></div>
            <p className="font-bold">{session.dekan}</p>
            <p className="text-sm">NIP. {session.nip_dekan}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
