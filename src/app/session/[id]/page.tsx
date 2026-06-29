'use client'

import { useEffect, useState, useRef, useCallback, memo, startTransition } from 'react'
import { useParams } from 'next/navigation'
import { supabase, subscribeToSession } from '@/lib/supabase'
import { Session, RUBRIC_CRITERIA } from '@/types'
import {
  calcTotalSkorXBobot, calcNilaiAkhir, calcGrade,
} from '@/lib/utils'
import { useAuth } from '@/app/components/AuthProvider'
import { isDosenEmail } from '@/lib/dosen'

type Tab = 'berita-acara' | 'penilaian-1' | 'penilaian-2' | 'penilaian-3' | 'rekap-nilai' | 'daftar-hadir' | 'preview'

export default function SessionPage() {
  const params = useParams()
  const sessionId = params.id as string

  const { isDosen, profile } = useAuth()
  const isSuperadmin = profile?.role === 'superadmin'
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<Tab>(isDosen ? 'berita-acara' : 'daftar-hadir')
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [syncStatus, setSyncStatus] = useState<'live' | 'saving' | 'offline'>('live')
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null)

  // Load session
  useEffect(() => {
    if (!sessionId) return
    loadSession()
    const channel = subscribeToSession(sessionId, (updated: any) => {
      if (updated) {
        const s = updated as Session
        if (!s.skor_penguji) s.skor_penguji = [[null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null]]
        if (!s.peserta_hadir) s.peserta_hadir = [{ nama: s.nama, nim: s.nim }]
        if (!s.audience_hadir) s.audience_hadir = []
        lastSavedSkorRef.current = s.skor_penguji
        lastSavedTtdRef.current = { ttd_penguji1: s.ttd_penguji1, ttd_penguji2: s.ttd_penguji2, ttd_penguji3: s.ttd_penguji3, ttd_koordinator: s.ttd_koordinator, peserta_hadir: s.peserta_hadir, audience_hadir: s.audience_hadir }
        setSession(s)
      }
    })
    return () => { supabase.removeChannel(channel) }
  }, [sessionId])

  async function loadSession() {
    const { data } = await supabase.from('sessions').select('*').eq('id', sessionId).single()
    if (data) {
      const s = data as Session
      if (!s.skor_penguji) s.skor_penguji = [[null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null]]
      if (!s.peserta_hadir) s.peserta_hadir = [{ nama: s.nama, nim: s.nim }]
      if (!s.audience_hadir) s.audience_hadir = []
      lastSavedSkorRef.current = s.skor_penguji
      lastSavedTtdRef.current = { ttd_penguji1: s.ttd_penguji1, ttd_penguji2: s.ttd_penguji2, ttd_penguji3: s.ttd_penguji3, ttd_koordinator: s.ttd_koordinator, peserta_hadir: s.peserta_hadir, audience_hadir: s.audience_hadir }
      setSession(s)
    }
    setLoading(false)
  }

  // Auto-save with debounce — track last saved data to detect user changes vs untouched
  const sessionRef = useRef<Session | null>(null)
  const lastSavedSkorRef = useRef<(number | null)[][] | null>(null)
  const lastSavedTtdRef = useRef<{
    ttd_penguji1?: string; ttd_penguji2?: string; ttd_penguji3?: string; ttd_koordinator?: string
    peserta_hadir?: { nama: string; nim: string; ttd?: string }[]
    audience_hadir?: { nama: string; nim: string; ttd?: string }[]
  } | null>(null)

  // Helper to merge attendance arrays by name+nim key
  function mergeAttendance(
    local: { nama: string; nim: string; ttd?: string }[],
    db: { nama: string; nim: string; ttd?: string }[],
    lastSaved: { nama: string; nim: string; ttd?: string }[]
  ) {
    const dbMap = new Map(db.map(e => [e.nama + '|' + e.nim, e]))
    const lastMap = new Map(lastSaved.map(e => [e.nama + '|' + e.nim, e]))
    return local.map(entry => {
      const key = entry.nama + '|' + entry.nim
      const lastEntry = lastMap.get(key)
      // If user didn't change this entry's ttd, use DB value
      if (lastEntry && JSON.stringify(entry.ttd) === JSON.stringify(lastEntry.ttd)) {
        const dbEntry = dbMap.get(key)
        if (dbEntry?.ttd) return { ...entry, ttd: dbEntry.ttd }
      }
      return entry
    })
  }

  const saveNow = useCallback(async () => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    const toSave = sessionRef.current
    if (!toSave) return
    setSyncStatus('saving')
    try {
      const { data: currentDb } = await supabase
        .from('sessions')
        .select('skor_penguji, ttd_penguji1, ttd_penguji2, ttd_penguji3, ttd_koordinator, peserta_hadir, audience_hadir')
        .eq('id', sessionId)
        .single()

      let mergedSkor = toSave.skor_penguji
      let mergedTtd1 = toSave.ttd_penguji1
      let mergedTtd2 = toSave.ttd_penguji2
      let mergedTtd3 = toSave.ttd_penguji3
      let mergedTtdKoordinator = toSave.ttd_koordinator
      let mergedPeserta = toSave.peserta_hadir
      let mergedAudience = toSave.audience_hadir
      const lastSaved = lastSavedSkorRef.current
      const lastSavedTtd = lastSavedTtdRef.current

      if (currentDb) {
        // Always merge skor_penguji — per examiner, to prevent concurrent overwrites
        if (currentDb.skor_penguji) {
          const baseSkor = lastSaved || currentDb.skor_penguji
          mergedSkor = toSave.skor_penguji.map((localArr: (number | null)[], i: number) => {
            const userModified = JSON.stringify(localArr) !== JSON.stringify(baseSkor[i])
            if (userModified) return localArr
            return currentDb.skor_penguji[i] || localArr
          })
        }

        // Merge TTD fields — only overwrite if this user changed them
        if (lastSavedTtd) {
          if (JSON.stringify(toSave.ttd_penguji1) === JSON.stringify(lastSavedTtd.ttd_penguji1) && currentDb.ttd_penguji1) {
            mergedTtd1 = currentDb.ttd_penguji1
          }
          if (JSON.stringify(toSave.ttd_penguji2) === JSON.stringify(lastSavedTtd.ttd_penguji2) && currentDb.ttd_penguji2) {
            mergedTtd2 = currentDb.ttd_penguji2
          }
          if (JSON.stringify(toSave.ttd_penguji3) === JSON.stringify(lastSavedTtd.ttd_penguji3) && currentDb.ttd_penguji3) {
            mergedTtd3 = currentDb.ttd_penguji3
          }
          if (JSON.stringify(toSave.ttd_koordinator) === JSON.stringify(lastSavedTtd.ttd_koordinator) && currentDb.ttd_koordinator) {
            mergedTtdKoordinator = currentDb.ttd_koordinator
          }
          // Merge peserta/audience — per entry by name+nim
          if (currentDb.peserta_hadir && lastSavedTtd.peserta_hadir) {
            mergedPeserta = mergeAttendance(toSave.peserta_hadir, currentDb.peserta_hadir, lastSavedTtd.peserta_hadir)
          }
          if (currentDb.audience_hadir && lastSavedTtd.audience_hadir) {
            mergedAudience = mergeAttendance(toSave.audience_hadir, currentDb.audience_hadir, lastSavedTtd.audience_hadir)
          }
        }
      }

      const merged = {
        ...toSave,
        skor_penguji: mergedSkor,
        ttd_penguji1: mergedTtd1,
        ttd_penguji2: mergedTtd2,
        ttd_penguji3: mergedTtd3,
        ttd_koordinator: mergedTtdKoordinator,
        peserta_hadir: mergedPeserta,
        audience_hadir: mergedAudience,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('sessions')
        .upsert(merged)
        .eq('id', sessionId)
      if (!error) {
        lastSavedSkorRef.current = mergedSkor
        lastSavedTtdRef.current = {
          ttd_penguji1: mergedTtd1,
          ttd_penguji2: mergedTtd2,
          ttd_penguji3: mergedTtd3,
          ttd_koordinator: mergedTtdKoordinator,
          peserta_hadir: mergedPeserta,
          audience_hadir: mergedAudience,
        }
        setLastSaved(new Date())
        startTransition(() => setSession(merged))
        setSyncStatus('live')
      } else {
        setSyncStatus('offline')
      }
    } catch (err) {
      setSyncStatus('offline')
    }
  }, [sessionId])

  const autoSave = useCallback((updated: Session) => {
    startTransition(() => setSession(updated))
    sessionRef.current = updated
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => saveNow(), 800)
  }, [sessionId, saveNow])

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-gray-500 font-serif text-lg">Memuat data sidang...</div>
  if (!session) return <div className="flex items-center justify-center min-h-[60vh] text-red-500 font-serif text-lg">Sidang tidak ditemukan</div>

  const allTabs: { key: Tab; label: string }[] = [
    { key: 'berita-acara', label: 'Berita Acara' },
    { key: 'penilaian-1', label: 'Penilaian Penguji I' },
    { key: 'penilaian-2', label: 'Penilaian Penguji II' },
    { key: 'penilaian-3', label: 'Penilaian Penguji III' },
    { key: 'rekap-nilai', label: 'Rekapitulasi Nilai' },
    { key: 'daftar-hadir', label: 'Daftar Hadir' },
    { key: 'preview', label: 'Preview & PDF' },
  ]

  // Match current user to their penguji assignment — use both DB name AND whitelist name
  const whitelistMatch = profile?.email ? isDosenEmail(profile.email) : null
  const canonicalName = whitelistMatch?.nama || ''
  const dbFullName = profile?.full_name || ''
  const emailPrefix = profile?.email?.split('@')[0] || ''
  // Try matching against all name variants
  const allUserNames = [canonicalName, dbFullName, emailPrefix].filter(Boolean)

  const matchPenguji = (pengujiName: string) => {
    if (allUserNames.length === 0 || !pengujiName) return false
    const normalize = (s: string) => s.toLowerCase().replace(/[,.\-]/g, '').replace(/\s+/g, ' ').trim()
    const b = normalize(pengujiName)

    for (const name of allUserNames) {
      const a = normalize(name)
      if (a === b) return true
      if (a.includes(b) || b.includes(a)) return true
      const wordsA = a.split(' ').filter((w: string) => w.length > 2)
      const wordsB = b.split(' ').filter((w: string) => w.length > 2)
      if (wordsA.length >= 2 && wordsB.length >= 2 && wordsA[0] === wordsB[0] && wordsA[1] === wordsB[1]) return true
    }
    return false
  }

  const isKoordinator = isDosen && session ? matchPenguji(session.koordinator) : false

  let allowedPenilaian: number[] | null = null // null = no penilaian access
  if (!isSuperadmin && isDosen && session && !isKoordinator) {
    const matched = [
      matchPenguji(session.penguji1),
      matchPenguji(session.penguji2),
      matchPenguji(session.penguji3),
    ]
    const matchedIndices = matched.map((m, i) => m ? i : -1).filter(i => i >= 0)
    if (matchedIndices.length > 0) {
      allowedPenilaian = matchedIndices
    }
  }

  const tabs = isDosen
    ? allTabs.filter(t => {
        if (isSuperadmin || isKoordinator) return true // superadmin & coordinator see all
        if (t.key.startsWith('penilaian-')) {
          if (allowedPenilaian === null) return false // not a penguji → no penilaian
          const idx = parseInt(t.key.split('-')[1]) - 1
          return allowedPenilaian.includes(idx)
        }
        return true // berita-acara, rekap, daftar-hadir, preview always visible
      })
    : allTabs.filter(t => t.key === 'daftar-hadir')

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
          <div>
            {isDosen && (
              <div className="no-print mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-blue-900">Link Daftar Hadir untuk Mahasiswa</p>
                  <p className="text-xs text-blue-700">Bagikan link ini ke mahasiswa untuk mengisi daftar hadir (tanpa login).</p>
                </div>
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/attendance/${sessionId}`
                    navigator.clipboard.writeText(url).then(() => {
                      alert('Link Daftar Hadir disalin!')
                    })
                  }}
                  className="bg-blue-900 text-white px-4 py-2 rounded hover:bg-blue-800 font-sans text-sm font-medium shrink-0"
                >
                  Salin Link
                </button>
              </div>
            )}
            <DaftarHadirForm session={session} onUpdate={autoSave} isDosen={isDosen} sessionId={sessionId} />
          </div>
        )}
        {activeTab === 'preview' && (
          <PreviewAll session={session} />
        )}
      </div>

      {/* Floating save button — above sync indicator */}
      {isDosen && (
        <button
          onClick={() => saveNow()}
          disabled={syncStatus === 'saving'}
          className="no-print fixed bottom-16 right-4 z-50 px-5 py-2.5 bg-blue-900 text-white text-sm font-sans font-bold rounded-full shadow-lg hover:bg-blue-800 disabled:opacity-50 flex items-center gap-2 transition-all hover:scale-105"
        >
          💾 Simpan
        </button>
      )}
    </div>
  )
}

// ─── SIGNATURE UPLOAD ───────────────────────────────────────────
function SignatureUpload({ value, onChange, label }: { value?: string; onChange: (v: string) => void; label?: string }) {
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Compress & resize to keep DB row small
    const img = new Image()
    img.onload = () => {
      const MAX_W = 400
      const c = document.createElement('canvas')
      const scale = Math.min(1, MAX_W / img.width)
      c.width = Math.round(img.width * scale)
      c.height = Math.round(img.height * scale)
      const ctx = c.getContext('2d')!
      ctx.drawImage(img, 0, 0, c.width, c.height)
      onChange(c.toDataURL('image/png'))
    }
    img.src = URL.createObjectURL(file)
  }

  return (
    <div className="flex flex-col items-center gap-1">
      {value ? (
        <img src={value} alt={label || 'Tanda Tangan'} className="max-h-14 max-w-28 object-contain" />
      ) : (
        <span className="text-[10px] text-gray-400 italic">(upload)</span>
      )}
      <input type="file" accept="image/*" ref={fileRef} onChange={handleFile} className="hidden" />
      <button type="button" onClick={() => fileRef.current?.click()} className="text-[10px] text-blue-700 underline">
        {value ? 'Ganti' : 'Upload'}
      </button>
      {value && (
        <button type="button" onClick={() => onChange('')} className="text-[10px] text-red-600 underline">Hapus</button>
      )}
    </div>
  )
}

// ─── BERITA ACARA (LAPORAN SIDANG SKRIPSI) ─────────────────────
const BeritaAcaraForm = memo(function BeritaAcaraForm({ session, onUpdate }: { session: Session; onUpdate: (s: Session) => void }) {
  const [local, setLocal] = useState(session)
  const fromRealtime = useRef(false)
  const localRef = useRef(local)

  useEffect(() => {
    if (fromRealtime.current) { fromRealtime.current = false; setLocal(session); localRef.current = session }
  }, [session])

  const update = (field: string, value: any) => {
    const next = { ...localRef.current, [field]: value }
    localRef.current = next
    setLocal(next)
  }
  const persist = () => { fromRealtime.current = true; onUpdate(localRef.current) }

  return (
    <div className="space-y-6">
      <div className="text-center border-b-2 border-black pb-4">
        <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }} />
        <h1 className="text-xl font-bold uppercase">Laporan Sidang Skripsi</h1>
        <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
        <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
        <p className="text-sm font-semibold">
          T.A. <input value={local.ta} onChange={(e) => update('ta', e.target.value)} onBlur={persist} className="bg-transparent border-b border-gray-400 w-28 text-center font-bold" />
        </p>
      </div>

      <p>
        Pada hari{' '}
        <input
          value={local.hari_tanggal}
          onChange={(e) => update('hari_tanggal', e.target.value)}
          onBlur={persist}
          className="border-b border-gray-400 bg-transparent px-1 font-semibold w-64"
        />
        , telah dilaksanakan sidang skripsi mahasiswa:
      </p>

      <table className="w-full">
        <tbody>
          <tr>
            <td className="w-36">Nama Mahasiswa</td>
            <td className="w-4">:</td>
            <td><input value={local.nama} onChange={(e) => update('nama', e.target.value)} onBlur={persist} className="w-full border-b border-gray-400 bg-transparent" /></td>
          </tr>
          <tr>
            <td>NIM</td>
            <td>:</td>
            <td><input value={local.nim} onChange={(e) => update('nim', e.target.value)} onBlur={persist} className="w-full border-b border-gray-400 bg-transparent" /></td>
          </tr>
          <tr>
            <td>Waktu Sidang</td>
            <td>:</td>
            <td><input value={local.waktu} onChange={(e) => update('waktu', e.target.value)} onBlur={persist} className="w-full border-b border-gray-400 bg-transparent" /></td>
          </tr>
          <tr>
            <td>Peminatan</td>
            <td>:</td>
            <td><input value={local.peminatan} onChange={(e) => update('peminatan', e.target.value)} onBlur={persist} className="w-full border-b border-gray-400 bg-transparent" placeholder="K3 /Kesling/Epidemiologi/ AKK/Kesehatan Reproduksi" /></td>
          </tr>
        </tbody>
      </table>

      <div>
        <p className="font-semibold">Hasil Pelaksanaan :</p>
        <textarea
          value={local.catatan}
          onChange={(e) => update('catatan', e.target.value)}
          onBlur={persist}
          className="w-full border border-gray-300 rounded p-2 min-h-[60px] font-serif mt-1"
          placeholder="Catatan hasil pelaksanaan sidang..."
        />
      </div>

      <div className="space-y-2">
        <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-blue-50">
          <input
            type="radio"
            name="decision"
            checked={local.decision === 'lulus_perbaikan'}
            onChange={() => { update('decision', 'lulus_perbaikan'); setTimeout(persist, 0) }}
            className="mt-1"
          />
          <div>
            <span className="font-semibold">Lulus</span>
          </div>
        </label>
        <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-red-50">
          <input
            type="radio"
            name="decision"
            checked={local.decision === 'tidak_lulus_ulang'}
            onChange={() => { update('decision', 'tidak_lulus_ulang'); setTimeout(persist, 0) }}
            className="mt-1"
          />
          <div>
            <span className="font-semibold">Tidak Lulus</span>
          </div>
        </label>
      </div>

      <p className="italic text-sm text-justify">
        Demikian laporan sidang ini dibuat sebagai laporan selama sidang berlangsung untuk diketahui dan dipergunakan sebagaimana mestinya.
      </p>

      {/* Tim Penguji Table */}
      <div>
        <h3 className="font-bold text-center mb-1">TIM PENGUJI</h3>
        <table className="template-table">
          <thead>
            <tr>
              <th className="w-12">NO</th>
              <th>NAMA PENGUJI</th>
              <th>JABATAN</th>
              <th className="w-24">TANDA TANGAN</th>
            </tr>
          </thead>
          <tbody>
              {[
                { no: 1, field: 'penguji1', jabatan: 'Ketua Penguji', ttdField: 'ttd_penguji1' as const },
                { no: 2, field: 'penguji2', jabatan: 'Anggota Penguji I', ttdField: 'ttd_penguji2' as const },
                { no: 3, field: 'penguji3', jabatan: 'Anggota Penguji II', ttdField: 'ttd_penguji3' as const },
              ].map((p) => (
                <tr key={p.no}>
                  <td className="text-center">{p.no}.</td>
                  <td>
                    <input
                      value={(local as any)[p.field] || ''}
                      onChange={(e) => update(p.field, e.target.value)}
                      onBlur={persist}
                      className="w-full bg-transparent"
                      placeholder="Nama dosen"
                    />
                  </td>
                  <td>{p.jabatan}</td>
                  <td className="text-center align-middle">
                    <SignatureUpload
                      value={(local as any)[p.ttdField]}
                      onChange={(v) => { update(p.ttdField, v); setTimeout(persist, 0) }}
                      label={p.jabatan}
                    />
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Koordinator Prodi signature */}
      <div className="text-right mt-8 avoid-break">
        <p>Jakarta,{' '}
          <input
            value={local.tanggal_ba}
            onChange={(e) => update('tanggal_ba', e.target.value)}
            onBlur={persist}
            className="border-b border-gray-400 bg-transparent w-40 text-center"
          />
        </p>
        <p className="mt-4">Koordinator Program Studi Kesehatan Masyarakat Program Sarjana</p>
        <SignatureUpload value={local.ttd_koordinator} onChange={(v) => { update('ttd_koordinator', v); setTimeout(persist, 0) }} label="Koordinator Prodi" />
        <div className="h-8"></div>
        <input
          value={local.koordinator}
          onChange={(e) => update('koordinator', e.target.value)}
          onBlur={persist}
          className="border-b border-gray-400 bg-transparent text-center font-semibold"
        />
        <br />
        <input
          value={local.nip_koordinator}
          onChange={(e) => update('nip_koordinator', e.target.value)}
          onBlur={persist}
          className="border-b border-gray-400 bg-transparent text-center text-sm"
        />
        <p className="text-xs text-gray-500 mt-2">*) Coret yang tidak perlu</p>
      </div>
    </div>
  )
})

// ─── FORM PENILAIAN ─────────────────────────────────────────
const PenilaianForm = memo(function PenilaianForm({
  session, onUpdate, examinerIndex, label
}: {
  session: Session; onUpdate: (s: Session) => void; examinerIndex: number; label: string
}) {
  const defaultSkor = [[null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null]]
  const [localSkor, setLocalSkor] = useState<(number | null)[][]>(session.skor_penguji || defaultSkor)
  const fromRealtime = useRef(false)
  const localSkorRef = useRef(localSkor)

  useEffect(() => {
    if (fromRealtime.current) { fromRealtime.current = false; setLocalSkor(session.skor_penguji || defaultSkor); localSkorRef.current = session.skor_penguji || defaultSkor }
  }, [session.skor_penguji])

  const scores = localSkor[examinerIndex] || [null,null,null,null,null,null,null,null,null,null]

  const setScore = (criterionIdx: number, value: string) => {
    if (value === '') {
      // User cleared the input — set to null immediately
      setLocalSkor(prev => {
        const next = [...prev]
        next[examinerIndex] = [...(next[examinerIndex] || [null,null,null,null,null,null,null,null,null,null])]
        next[examinerIndex][criterionIdx] = null
        localSkorRef.current = next
        return next
      })
      return
    }
    const num = Number(value)
    if (isNaN(num)) return
    const v = Math.min(4, Math.max(1, num))
    setLocalSkor(prev => {
      const next = [...prev]
      next[examinerIndex] = [...(next[examinerIndex] || [null,null,null,null,null,null,null,null,null,null])]
      next[examinerIndex][criterionIdx] = v
      localSkorRef.current = next
      return next
    })
  }

  const persist = () => {
    fromRealtime.current = true
    onUpdate({ ...session, skor_penguji: localSkorRef.current })
  }

  const totalSkorXBobot = calcTotalSkorXBobot(scores, RUBRIC_CRITERIA.map(c => c.bobot))
  const nilaiAkhir = calcNilaiAkhir(totalSkorXBobot)
  const grade = calcGrade(nilaiAkhir)

  return (
    <div className="space-y-4">
      <div className="text-center border-b-2 border-black pb-4">
        <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }} />
        <h1 className="text-xl font-bold uppercase">Formulir Penilaian Sidang Skripsi</h1>
        <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
        <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
        <p className="text-sm font-semibold">
          SEMESTER <input value={session.semester} onChange={(e) => onUpdate({ ...session, semester: e.target.value })} className="bg-transparent border-b border-gray-400 w-20 text-center font-bold" /> T.A. <input value={session.ta} onChange={(e) => onUpdate({ ...session, ta: e.target.value })} className="bg-transparent border-b border-gray-400 w-28 text-center font-bold" />
        </p>
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
        <span className="w-36">Peminatan</span><span className="w-4">:</span>
        <input value={session.peminatan} onChange={(e) => onUpdate({ ...session, peminatan: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" placeholder="K3 /Kesling/Epidemiologi/ AKK/Kesehatan Reproduksi" />
      </div>
      <div className="flex">
        <span className="w-36">Judul Skripsi</span><span className="w-4">:</span>
        <input value={session.judul_skripsi} onChange={(e) => onUpdate({ ...session, judul_skripsi: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" />
      </div>

      {/* Rubric table */}
      <table className="template-table text-sm">
        <thead>
          <tr>
            <th className="w-8">NO</th>
            <th>PARAMETER PENILAIAN</th>
            <th className="w-24">SKOR NILAI (1—4)</th>
            <th className="w-14">BOBOT</th>
            <th className="w-24">SKOR NILAI × BOBOT</th>
          </tr>
        </thead>
        <tbody>
          {RUBRIC_CRITERIA.map((c, i) => {
            const skorXBobot = scores[i] !== null ? scores[i]! * c.bobot : null
            return (
              <tr key={c.no} className="avoid-break">
                <td className="text-center align-top">{c.no}.</td>
                <td className="text-xs leading-snug py-1.5">
                  <div className="font-semibold">{c.label}</div>
                  <div className="whitespace-pre-line text-[11px] text-gray-700">{c.detail}</div>
                </td>
                <td className="text-center">
                  <input
                    type="number"
                    min={1}
                    max={4}
                    step="0.01"
                    value={scores[i] ?? ''}
                    onChange={(e) => setScore(i, e.target.value)}
                    onBlur={persist}
                    className="w-16 text-center border border-gray-300 rounded px-1 py-1"
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
      <div className="mt-6 avoid-break">
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
              <SignatureUpload
                value={(session as any)[`ttd_penguji${examinerIndex + 1}`]}
                onChange={(v) => onUpdate({ ...session, [`ttd_penguji${examinerIndex + 1}`]: v } as any)}
                label={label}
              />
              <div className="h-6"></div>
              <p>Tanda Tangan</p>
              <p className="border-t border-black pt-1 font-semibold">{label}</p>
              <p className="text-xs">{session[`nip_penguji${examinerIndex + 1}` as keyof Session] as string || ''}</p>
            </div>
          </div>
      </div>
    </div>
  )
})

// ─── REKAPITULASI NILAI ──────────────────────────────────────
function RekapNilaiForm({ session, onUpdate }: { session: Session; onUpdate: (s: Session) => void }) {
  const entries = (session.rekap_entries && session.rekap_entries.length > 0)
    ? session.rekap_entries
    : [{ nama: session.nama, nim: session.nim, nilai_i: null, nilai_ii: null, nilai_iii: null }]

  const updateEntry = (idx: number, field: string, value: any) => {
    const newEntries = [...entries]
    newEntries[idx] = { ...newEntries[idx], [field]: value }
    onUpdate({ ...session, rekap_entries: newEntries })
  }

  // Calculate scores from penilaian for each examiner
  const calcExaminerTotal = (examIdx: number) => {
    const scores = session.skor_penguji?.[examIdx] || [null,null,null,null,null,null,null,null,null,null]
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
        <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }} />
        <h1 className="text-xl font-bold uppercase">Rekapitulasi Nilai Sidang Skripsi</h1>
        <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
        <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
        <p className="text-sm font-semibold">
          SEMESTER <input value={session.semester} onChange={(e) => onUpdate({ ...session, semester: e.target.value })} className="bg-transparent border-b border-gray-400 w-20 text-center font-bold" /> T.A. <input value={session.ta} onChange={(e) => onUpdate({ ...session, ta: e.target.value })} className="bg-transparent border-b border-gray-400 w-28 text-center font-bold" />
        </p>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <div className="flex"><span className="w-36">Dosen Pembimbing</span><span className="w-4">:</span><input value={session.pembimbing} onChange={(e) => onUpdate({ ...session, pembimbing: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" /></div>
        <div className="flex"><span className="w-28">Peminatan</span><span className="w-4">:</span><input value={session.peminatan} onChange={(e) => onUpdate({ ...session, peminatan: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" placeholder="K3 /Kesling/Epidemiologi/ AKK/Kesehatan Reproduksi" /></div>
      </div>

      <div className="grid grid-cols-3 gap-x-6 gap-y-1 text-sm">
        <div className="flex"><span className="w-36">Hari, Tanggal Sidang</span><span className="w-4">:</span><input value={session.hari_tanggal} onChange={(e) => onUpdate({ ...session, hari_tanggal: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" /></div>
        <div className="flex"><span className="w-28">Waktu Sidang</span><span className="w-4">:</span><input value={session.waktu} onChange={(e) => onUpdate({ ...session, waktu: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" /></div>
        <div className="flex"><span className="w-28">Tempat Sidang</span><span className="w-4">:</span><input value={session.tempat} onChange={(e) => onUpdate({ ...session, tempat: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" /></div>
      </div>

      <div className="grid grid-cols-1 gap-y-1 text-sm">
        <div className="flex"><span className="w-36">Judul Skripsi</span><span className="w-4">:</span><input value={session.judul_skripsi} onChange={(e) => onUpdate({ ...session, judul_skripsi: e.target.value })} className="flex-1 border-b border-gray-400 bg-transparent" /></div>
      </div>

      {/* Nilai table with 55% */}
      <table className="template-table text-sm">
        <thead>
          <tr>
            <th className="w-6">NO</th>
            <th>NAMA</th>
            <th className="w-16">NIM</th>
            <th className="w-14 text-[10px]">NILAI<br/>PENGUJI I<br/>(Ketua)</th>
            <th className="w-14 text-[10px]">NILAI<br/>PENGUJI II<br/>(Anggota I)</th>
            <th className="w-14 text-[10px]">NILAI<br/>PENGUJI III<br/>(Anggota II)</th>
            <th className="w-16 text-[10px]">RERATA<br/>NILAI SIDANG<br/>SKRIPSI</th>
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
              <td className="text-center font-bold">{rataRata !== null ? rataRata.toFixed(2) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Signature by 3 examiners with NIP */}
      <div className="mt-8 avoid-break">
        <div className="flex justify-between text-center">
          {[
            { label: 'Ketua Penguji', nama: session.penguji1, nip: session.nip_penguji1, ttd: session.ttd_penguji1 },
            { label: 'Anggota Penguji I', nama: session.penguji2, nip: session.nip_penguji2, ttd: session.ttd_penguji2 },
            { label: 'Anggota Penguji II', nama: session.penguji3, nip: session.nip_penguji3, ttd: session.ttd_penguji3 },
          ].map((p, i) => (
            <div key={i} className="w-48">
              <p className="text-sm mb-1">{p.label}</p>
              <SignatureUpload
                value={p.ttd}
                onChange={(v) => onUpdate({ ...session, [`ttd_penguji${i + 1}`]: v } as any)}
                label={p.label}
              />
              <div className="h-8"></div>
              <p className="border-t border-black pt-1 font-semibold text-sm">{p.nama || '....................'}</p>
              <p className="text-xs">NIP. {p.nip || '..........................'}</p>
            </div>
          ))}
        </div>
        <p className="text-center text-sm mt-4">Jakarta,{' '}
          <input value={session.tanggal_ba} onChange={(e) => onUpdate({ ...session, tanggal_ba: e.target.value })} className="border-b border-gray-400 bg-transparent w-40 text-center" />
        </p>
      </div>
    </div>
  )
}

// ─── DAFTAR HADIR ────────────────────────────────────────────
function DaftarHadirForm({ session, onUpdate, isDosen, sessionId }: { session: Session; onUpdate: (s: Session) => void; isDosen: boolean; sessionId: string }) {
  const [localPeserta, setLocalPeserta] = useState(session.peserta_hadir || [{ nama: session.nama, nim: session.nim }])
  const [localAudience, setLocalAudience] = useState(session.audience_hadir || [])
  const fromRealtime = useRef(false)
  const pesertaRef = useRef(localPeserta)
  const audienceRef = useRef(localAudience)

  useEffect(() => {
    if (fromRealtime.current) {
      fromRealtime.current = false
      setLocalPeserta(session.peserta_hadir || [{ nama: session.nama, nim: session.nim }])
      setLocalAudience(session.audience_hadir || [])
      pesertaRef.current = session.peserta_hadir || [{ nama: session.nama, nim: session.nim }]
      audienceRef.current = session.audience_hadir || []
    }
  }, [session.peserta_hadir, session.audience_hadir, session.nama, session.nim])

  const persistAttendance = async (newPeserta: typeof localPeserta, newAudience: typeof localAudience) => {
    pesertaRef.current = newPeserta
    audienceRef.current = newAudience
    if (isDosen) {
      fromRealtime.current = true
      onUpdate({ ...session, peserta_hadir: newPeserta, audience_hadir: newAudience })
    } else {
      const { data: { session: authSession } } = await (supabase.auth as any).getSession()
      const token = authSession?.access_token
      if (token) {
        await fetch('/api/attendance', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ sessionId, peserta_hadir: newPeserta, audience_hadir: newAudience }),
        })
      }
    }
  }

  const updatePeserta = (idx: number, field: string, value: string) => {
    const newP = localPeserta.map((item, i) => i === idx ? { ...item, [field]: value } : item)
    setLocalPeserta(newP)
    pesertaRef.current = newP
    return newP
  }

  const updateAudience = (idx: number, field: string, value: string) => {
    const newA = localAudience.map((item, i) => i === idx ? { ...item, [field]: value } : item)
    setLocalAudience(newA)
    audienceRef.current = newA
    return newA
  }

  const addPeserta = () => {
    const newP = [...localPeserta, { nama: '', nim: '' }]
    setLocalPeserta(newP)
    pesertaRef.current = newP
  }

  const removePeserta = (idx: number) => {
    const newP = localPeserta.filter((_, i) => i !== idx)
    setLocalPeserta(newP)
    pesertaRef.current = newP
    persistAttendance(newP, audienceRef.current)
  }

  const addAudience = () => {
    const newA = [...localAudience, { nama: '', nim: '' }]
    setLocalAudience(newA)
    audienceRef.current = newA
  }

  const removeAudience = (idx: number) => {
    const newA = localAudience.filter((_, i) => i !== idx)
    setLocalAudience(newA)
    audienceRef.current = newA
    persistAttendance(pesertaRef.current, newA)
  }

  const persistChanges = () => {
    persistAttendance(pesertaRef.current, audienceRef.current)
  }

  return (
    <div className="space-y-8">
      {/* DAFTAR HADIR PENGUJI SIDANG SKRIPSI — only for dosen */}
      {isDosen && (
        <div>
          <div className="text-center border-b-2 border-black pb-4">
            <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }} />
            <h1 className="text-xl font-bold uppercase">Daftar Hadir Penguji Sidang Skripsi</h1>
            <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
            <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
            <p className="text-sm font-semibold">
              T.A. <input value={session.ta} onChange={(e) => onUpdate({ ...session, ta: e.target.value })} className="bg-transparent border-b border-gray-400 w-28 text-center font-bold" />
            </p>
          </div>
          <table className="w-full mt-2 text-sm">
            <tbody>
              <tr><td className="w-32">Nama Mahasiswa</td><td className="w-4">:</td><td><input value={session.nama} onChange={(e) => onUpdate({ ...session, nama: e.target.value })} className="w-full border-b border-gray-400 bg-transparent" /></td></tr>
              <tr><td>NIM</td><td>:</td><td><input value={session.nim} onChange={(e) => onUpdate({ ...session, nim: e.target.value })} className="w-full border-b border-gray-400 bg-transparent" /></td></tr>
              <tr><td>Tanggal Ujian</td><td>:</td><td><input value={session.hari_tanggal} onChange={(e) => onUpdate({ ...session, hari_tanggal: e.target.value })} className="w-full border-b border-gray-400 bg-transparent" /></td></tr>
              <tr><td>Peminatan</td><td>:</td><td><input value={session.peminatan} onChange={(e) => onUpdate({ ...session, peminatan: e.target.value })} className="w-full border-b border-gray-400 bg-transparent" placeholder="K3 /Kesling/Epidemiologi/ AKK/Kesehatan Reproduksi" /></td></tr>
            </tbody>
          </table>
          <table className="template-table text-sm mt-4">
            <thead>
              <tr><th className="w-8">NO</th><th className="w-28">NIP</th><th>NAMA PENGUJI</th><th>JABATAN</th><th className="w-24">TANDA TANGAN</th></tr>
            </thead>
            <tbody>
              {[
                { no: 1, field: 'penguji1', nipField: 'nip_penguji1', jabatan: 'Ketua Penguji', ttdField: 'ttd_penguji1' as const },
                { no: 2, field: 'penguji2', nipField: 'nip_penguji2', jabatan: 'Anggota Penguji I', ttdField: 'ttd_penguji2' as const },
                { no: 3, field: 'penguji3', nipField: 'nip_penguji3', jabatan: 'Anggota Penguji II', ttdField: 'ttd_penguji3' as const },
              ].map((p) => (
                <tr key={p.no}>
                  <td className="text-center">{p.no}.</td>
                  <td><input value={(session as any)[p.nipField] || ''} onChange={(e) => onUpdate({ ...session, [p.nipField]: e.target.value })} className="w-full bg-transparent" placeholder="NIP" /></td>
                  <td><input value={(session as any)[p.field] || ''} onChange={(e) => onUpdate({ ...session, [p.field]: e.target.value })} className="w-full bg-transparent" placeholder="Nama dosen" /></td>
                  <td>{p.jabatan}</td>
                  <td className="text-center align-middle">
                    <SignatureUpload value={(session as any)[p.ttdField]} onChange={(v) => onUpdate({ ...session, [p.ttdField]: v })} label={p.jabatan} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {/* DAFTAR HADIR PESERTA */}
      <div>
        <div className="text-center border-b-2 border-black pb-4">
          <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }} />
          <h1 className="text-xl font-bold uppercase">Daftar Hadir Peserta Sidang Skripsi</h1>
          <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
          <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
          <p className="text-sm font-semibold">
            SEMESTER {isDosen ? <input value={session.semester} onChange={(e) => onUpdate({ ...session, semester: e.target.value })} className="bg-transparent border-b border-gray-400 w-20 text-center font-bold" /> : <span className="font-bold">{session.semester}</span>} T.A. {isDosen ? <input value={session.ta} onChange={(e) => onUpdate({ ...session, ta: e.target.value })} className="bg-transparent border-b border-gray-400 w-28 text-center font-bold" /> : <span className="font-bold">{session.ta}</span>}
          </p>
        </div>
        <table className="template-table text-sm mt-4">
          <thead>
            <tr><th className="w-8">NO</th><th>NAMA PESERTA</th><th className="w-24">NIM</th><th className="w-24">TANDA TANGAN</th><th className="w-16">KET</th></tr>
          </thead>
          <tbody>
            {localPeserta.map((p, i) => (
              <tr key={i}>
                <td className="text-center">{i + 1}.</td>
                <td><input value={p.nama} onChange={(e) => updatePeserta(i, 'nama', e.target.value)} onBlur={persistChanges} className="w-full bg-transparent" /></td>
                <td><input value={p.nim} onChange={(e) => updatePeserta(i, 'nim', e.target.value)} onBlur={persistChanges} className="w-full bg-transparent" /></td>
                <td className="text-center align-middle">
                  <SignatureUpload value={(p as any).ttd} onChange={(v) => { const newP = updatePeserta(i, 'ttd', v); persistAttendance(newP, localAudience) }} />
                </td>
                <td className="text-center">
                  {localPeserta.length > 1 && (
                    <button onClick={() => { const newP = localPeserta.filter((_, j) => j !== i); setLocalPeserta(newP); persistAttendance(newP, localAudience) }} className="no-print text-red-500 text-xs hover:text-red-700" title="Hapus baris">✕</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={addPeserta} className="no-print mt-2 px-3 py-1 bg-gray-100 border rounded text-sm hover:bg-gray-200 font-sans">+ Tambah baris peserta</button>
      </div>

      {/* DAFTAR HADIR AUDIENS */}
      <div>
        <div className="text-center border-b-2 border-black pb-4">
          <h1 className="text-xl font-bold uppercase">Daftar Hadir Mahasiswa Sebagai Audiens Sidang Skripsi</h1>
          <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
          <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
          <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }} />
          <p className="text-sm font-semibold">
            SEMESTER {isDosen ? <input value={session.semester} onChange={(e) => onUpdate({ ...session, semester: e.target.value })} className="bg-transparent border-b border-gray-400 w-20 text-center font-bold" /> : <span className="font-bold">{session.semester}</span>} T.A. {isDosen ? <input value={session.ta} onChange={(e) => onUpdate({ ...session, ta: e.target.value })} className="bg-transparent border-b border-gray-400 w-28 text-center font-bold" /> : <span className="font-bold">{session.ta}</span>}
          </p>
        </div>
        <table className="template-table text-sm mt-4">
          <thead>
            <tr><th className="w-8">NO</th><th>NAMA MAHASISWA</th><th className="w-24">NIM</th><th className="w-24">TANDA TANGAN</th><th className="w-16">KET</th></tr>
          </thead>
          <tbody>
            {localAudience.map((a, i) => (
              <tr key={i}>
                <td className="text-center">{i + 1}.</td>
                <td><input value={a.nama} onChange={(e) => updateAudience(i, 'nama', e.target.value)} onBlur={persistChanges} className="w-full bg-transparent" placeholder="Nama mahasiswa" /></td>
                <td><input value={a.nim} onChange={(e) => updateAudience(i, 'nim', e.target.value)} onBlur={persistChanges} className="w-full bg-transparent" placeholder="NIM" /></td>
                <td className="text-center align-middle">
                  <SignatureUpload value={(a as any).ttd} onChange={(v) => { const newA = updateAudience(i, 'ttd', v); persistAttendance(localPeserta, newA) }} />
                </td>
                <td className="text-center">
                  <button onClick={() => { const newA = localAudience.filter((_, j) => j !== i); setLocalAudience(newA); persistAttendance(localPeserta, newA) }} className="no-print text-red-500 text-xs hover:text-red-700" title="Hapus baris">✕</button>
                </td>
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
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPDF = async () => {
    const html2canvas = (await import('html2canvas')).default
    const { jsPDF } = await import('jspdf')

    if (!previewRef.current) return

    const original = previewRef.current
    setPdfStatus('saving')

    // Clone the preview content
    const docFrag = original.cloneNode(true) as HTMLElement

    // Hide .no-print elements
    docFrag.querySelectorAll('.no-print').forEach(el => {
      ;(el as HTMLElement).style.display = 'none'
    })

    // Split content into sections at .page-break boundaries
    const children = Array.from(docFrag.children)
    const sections: HTMLElement[] = []
    let currentParts: HTMLElement[] = []

    for (const child of children) {
      const el = child as HTMLElement
      if (el.classList.contains('page-break') && currentParts.length > 0) {
        const section = document.createElement('div')
        section.style.width = '100%'
        currentParts.forEach(c => section.appendChild(c.cloneNode(true)))
        sections.push(section)
        currentParts = [el.cloneNode(true) as HTMLElement]
      } else {
        currentParts.push(el.cloneNode(true) as HTMLElement)
      }
    }
    if (currentParts.length > 0) {
      const section = document.createElement('div')
      section.style.width = '100%'
      currentParts.forEach(c => section.appendChild(c))
      sections.push(section)
    }
    if (sections.length === 0) {
      const section = document.createElement('div')
      section.style.width = '100%'
      children.forEach(c => section.appendChild(c.cloneNode(true)))
      sections.push(section)
    }

    // A4 PDF dimensions
    const pdf = new jsPDF('p', 'mm', 'a4')
    const pageW = 210
    const pageH = 297
    const marginLR = 15
    const marginTop = 12
    const marginBottom = 10
    const contentW = pageW - marginLR * 2
    const contentH = pageH - marginTop - marginBottom

    // Render each section separately
    for (let sIdx = 0; sIdx < sections.length; sIdx++) {
      const section = sections[sIdx]

      // Create offscreen container matching preview width
      const offscreen = document.createElement('div')
      offscreen.style.position = 'absolute'
      offscreen.style.left = '-9999px'
      offscreen.style.top = '0'
      offscreen.style.width = original.scrollWidth + 'px'
      offscreen.style.background = 'white'
      offscreen.style.fontFamily = "'Times New Roman', Georgia, serif"
      offscreen.style.color = '#000'
      offscreen.style.lineHeight = '1.5'
      offscreen.appendChild(section)
      document.body.appendChild(offscreen)

      // Apply print styles to tables
      offscreen.querySelectorAll('table').forEach(table => {
        ;(table as HTMLElement).style.borderCollapse = 'collapse'
      })

      // Wait for images
      const images = offscreen.querySelectorAll('img')
      await Promise.all(Array.from(images).map(img => {
        if (img.complete) return Promise.resolve()
        return new Promise<void>(resolve => { img.onload = () => resolve(); img.onerror = () => resolve() })
      }))

      await new Promise(r => setTimeout(r, 150))

      // Capture this section
      const canvas = await html2canvas(offscreen, {
        scale: 2,
        useCORS: true,
        logging: false,
        width: offscreen.scrollWidth,
        height: offscreen.scrollHeight,
      })

      document.body.removeChild(offscreen)

      const imgHeight = (canvas.height * contentW) / canvas.width

      if (imgHeight <= contentH) {
        // Section fits on one page
        if (sIdx > 0) pdf.addPage()
        const imgData = canvas.toDataURL('image/jpeg', 0.9)
        pdf.addImage(imgData, 'JPEG', marginLR, marginTop, contentW, imgHeight)
      } else {
        // Section is taller than one page — slice with top margin on each page
        let yOffset = 0
        let isFirstSlice = true

        while (yOffset < imgHeight) {
          if (!isFirstSlice || sIdx > 0) pdf.addPage()
          isFirstSlice = false

          const sliceH = Math.min(contentH, imgHeight - yOffset)
          const srcY = (yOffset / imgHeight) * canvas.height
          const srcH = (sliceH / imgHeight) * canvas.height

          const pageCanvas = document.createElement('canvas')
          pageCanvas.width = canvas.width
          pageCanvas.height = Math.round(srcH)
          const ctx = pageCanvas.getContext('2d')!
          ctx.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH)

          const pageImg = pageCanvas.toDataURL('image/jpeg', 0.9)
          pdf.addImage(pageImg, 'JPEG', marginLR, marginTop, contentW, sliceH)

          yOffset += contentH
        }
      }
    }

    // Upload to Supabase Storage
    const fileName = `BA_Sidang_${session.nama.replace(/\s+/g, '_')}_${session.nim}.pdf`
    try {
      const blob = pdf.output('blob')
      const storagePath = `${session.id}/${fileName}`
      const { error: uploadError } = await supabase.storage
        .from('pdf-archive')
        .upload(storagePath, blob, { contentType: 'application/pdf', upsert: true })

      if (uploadError) {
        console.error('Storage upload error:', uploadError)
        setPdfStatus('error')
      } else {
        const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/pdf-archive/${storagePath}`
        const { error: updateError } = await supabase.from('sessions').update({ pdf_url: publicUrl }).eq('id', session.id)
        if (updateError) console.error('DB update error:', updateError)
        setPdfStatus('saved')
      }
    } catch (err) {
      console.error('PDF storage error:', err)
      setPdfStatus('error')
    }
  }

  const calculateAll = () => {
    const scoresByExaminer = [0, 1, 2].map(idx => {
      const scores = session.skor_penguji?.[idx] || [null,null,null,null,null,null,null,null,null,null]
      const totalSkorXBobot = calcTotalSkorXBobot(scores, RUBRIC_CRITERIA.map(c => c.bobot))
      const nilaiAkhir = calcNilaiAkhir(totalSkorXBobot)
      return { totalSkorXBobot, nilaiAkhir }
    })
    const jumlah = scoresByExaminer.reduce((s, e) => s + e.nilaiAkhir, 0)
    const count = scoresByExaminer.filter(e => e.nilaiAkhir > 0).length
    const rataRata = count > 0 ? jumlah / count : 0
    const total55 = rataRata * 0.55
    return { scoresByExaminer, jumlah, rataRata }
  }

  const calc = calculateAll()

  return (
    <div>
      <div className="no-print flex gap-3 mb-6">
        <button onClick={handlePrint} className="bg-blue-900 text-white px-6 py-2 rounded hover:bg-blue-800 font-sans text-sm font-medium flex items-center gap-2">
          🖨 Cetak / Print
        </button>
        <button onClick={handleDownloadPDF} disabled={pdfStatus === 'saving'} className="bg-green-800 text-white px-6 py-2 rounded hover:bg-green-700 font-sans text-sm font-medium flex items-center gap-2 disabled:opacity-50">
          {pdfStatus === 'saving' ? '⏳ Menyimpan...' : '⬇ Generate PDF'}
        </button>
        {pdfStatus === 'saved' && !session.pdf_url && (
          <span className="text-green-700 text-sm font-sans self-center">✓ PDF tersimpan</span>
        )}
        {pdfStatus === 'error' && (
          <span className="text-red-600 text-sm font-sans self-center">⚠ Gagal simpan ke database</span>
        )}
        {(session.pdf_url || pdfStatus === 'saved') && (() => {
          const cleanUrl = session.pdf_url?.split('?token=')[0] || ''
          return cleanUrl ? (
            <a href={cleanUrl} target="_blank" rel="noopener noreferrer" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-500 font-sans text-sm font-medium flex items-center gap-2 no-print">
              📄 PDF Tersimpan
            </a>
          ) : (
            <span className="text-green-600 text-sm font-sans self-center">✓ PDF tersimpan di server</span>
          )
        })()}
        {(session.pdf_url || pdfStatus === 'saved') && (() => {
          const cleanUrl = session.pdf_url?.split('?token=')[0] || ''
          return cleanUrl ? (
            <a href={cleanUrl} target="_blank" rel="noopener noreferrer" className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-500 font-sans text-sm font-medium flex items-center gap-2 no-print">
              📄 PDF Tersimpan
            </a>
          ) : (
            <span className="text-green-600 text-sm font-sans self-center">✓ PDF tersimpan di server</span>
          )
        })()}
        <span className="text-xs text-gray-500 self-center ml-2 font-sans">(PDF akan sesuai dengan template asli)</span>
      </div>

      <div ref={previewRef} className="print-area bg-white p-8 md:p-12 print:p-0 space-y-10 print:space-y-0" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>
        {/* ===== LAPORAN SIDANG SKRIPSI (replaces BA) ===== */}
        <div className="text-center border-b-2 border-black pb-4">
          <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }} />
          <h1 className="text-xl font-bold text-center uppercase">Laporan Sidang Skripsi</h1>
          <p className="text-sm text-center">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
          <p className="text-sm text-center">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
          <p className="text-sm text-center font-bold">T.A. {session.ta}</p>
        </div>

        <p className="text-justify">
          Pada hari {session.hari_tanggal || '______________'}, telah dilaksanakan sidang skripsi mahasiswa:
        </p>

        <table className="w-full">
          <tbody>
            <tr><td className="w-32">Nama Mahasiswa</td><td className="w-4">:</td><td>{session.nama || '______________'}</td></tr>
            <tr><td>NIM</td><td>:</td><td>{session.nim || '______________'}</td></tr>
            <tr><td>Waktu Sidang</td><td>:</td><td>{session.waktu || '______________'}</td></tr>
            <tr><td>Peminatan</td><td>:</td><td>{session.peminatan || '______________'}</td></tr>
          </tbody>
        </table>

        {session.catatan && (
          <div className="mt-4">
            <p className="font-bold">Hasil Pelaksanaan :</p>
            <p className="whitespace-pre-wrap">{session.catatan}</p>
          </div>
        )}

        <p className="mt-4">
          Dinyatakan yang bersangkutan:<br />
          <span className="ml-4">{session.decision === 'lulus_perbaikan' ? '✓' : '○'} Lulus</span><br />
          <span className="ml-4">{session.decision === 'tidak_lulus_ulang' ? '✓' : '○'} Tidak Lulus</span>
        </p>

        <p className="italic text-sm text-justify mt-4">
          Demikian laporan sidang ini dibuat sebagai laporan selama sidang berlangsung untuk diketahui dan dipergunakan sebagaimana mestinya.
        </p>

        <div className="mt-6">
          <h3 className="font-bold text-center">TIM PENGUJI</h3>
          <table className="template-table mt-1">
            <thead><tr><th className="w-12">NO</th><th>NAMA PENGUJI</th><th>JABATAN</th><th className="w-24">TANDA TANGAN</th></tr></thead>
            <tbody>
              <tr><td className="text-center">1.</td><td>{session.penguji1 || '______________'}</td><td>Ketua Penguji</td><td className="text-center align-middle">{session.ttd_penguji1 ? <img src={session.ttd_penguji1} alt="TTD" className="max-h-12 max-w-24 mx-auto object-contain" /> : ''}</td></tr>
              <tr><td className="text-center">2.</td><td>{session.penguji2 || '______________'}</td><td>Anggota Penguji I</td><td className="text-center align-middle">{session.ttd_penguji2 ? <img src={session.ttd_penguji2} alt="TTD" className="max-h-12 max-w-24 mx-auto object-contain" /> : ''}</td></tr>
              <tr><td className="text-center">3.</td><td>{session.penguji3 || '______________'}</td><td>Anggota Penguji II</td><td className="text-center align-middle">{session.ttd_penguji3 ? <img src={session.ttd_penguji3} alt="TTD" className="max-h-12 max-w-24 mx-auto object-contain" /> : ''}</td></tr>
            </tbody>
          </table>
        </div>

        <div className="text-right mt-10 avoid-break">
          <p>Jakarta, {session.tanggal_ba || '______________'}</p>
          <p className="mt-4">Koordinator Program Studi Kesehatan Masyarakat</p>
          <p>Program Sarjana</p>
          {session.ttd_koordinator ? <img src={session.ttd_koordinator} alt="TTD Koordinator" className="max-h-16 max-w-32 ml-auto my-2 object-contain" /> : <div className="h-16"></div>}
          <p className="font-bold">{session.koordinator}</p>
          <p className="text-sm">NIP. {session.nip_koordinator}</p>
        </div>

        {/* ===== FORM PENILAIAN (3 examiners) ===== */}
        {[0, 1, 2].map((examIdx) => {
          const scores = session.skor_penguji?.[examIdx] || [null,null,null,null,null,null,null,null,null,null]
          const labels = ['Penguji I/Ketua Penguji', 'Penguji II/Anggota Penguji', 'Penguji III/Anggota Penguji']
          const namaPenguji = [session.penguji1, session.penguji2, session.penguji3]
          return (
            <div key={examIdx} className="page-break">
              <div className="text-center border-b-2 border-black pb-4">
                <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }} />
                <h1 className="text-xl font-bold text-center uppercase">Formulir Penilaian Sidang Skripsi</h1>
                <p className="text-sm text-center">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
                <p className="text-sm text-center">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
                <p className="text-sm text-center font-bold">SEMESTER {session.semester} T.A. {session.ta}</p>
              </div>

              <table className="w-full mt-2 text-sm">
                <tbody>
                  <tr><td className="w-36">Nama Peserta</td><td className="w-4">:</td><td>{session.nama}</td><td className="w-36">NIM</td><td className="w-4">:</td><td>{session.nim}</td></tr>
                  <tr><td>Hari, Tanggal Sidang</td><td>:</td><td>{session.hari_tanggal}</td><td>Waktu Sidang</td><td>:</td><td>{session.waktu}</td></tr>
                  <tr><td>Tempat Sidang</td><td>:</td><td>{session.tempat}</td><td>Dosen Pembimbing</td><td>:</td><td>{session.pembimbing}</td></tr>
                  <tr><td>Peminatan</td><td>:</td><td>{session.peminatan}</td><td></td><td></td><td></td></tr>
                </tbody>
              </table>
              <p className="text-sm mt-1"><span className="font-semibold">Judul Skripsi:</span> {session.judul_skripsi}</p>

              <table className="template-table text-sm mt-3">
                <thead>
                  <tr><th className="w-8">NO</th><th>PARAMETER PENILAIAN</th><th className="w-24">SKOR NILAI (1—4)</th><th className="w-14">BOBOT</th><th className="w-24">SKOR NILAI × BOBOT</th></tr>
                </thead>
                <tbody>
                  {RUBRIC_CRITERIA.map((c, i) => {
                    const skorXBobot = scores[i] !== null ? scores[i]! * c.bobot : null
                    return (
                      <tr key={c.no} className="avoid-break">
                        <td className="text-center align-top">{c.no}.</td>
                        <td className="text-xs leading-snug py-1.5">
                          <div className="font-semibold">{c.label}</div>
                          <div className="whitespace-pre-line text-[11px] text-gray-700">{c.detail}</div>
                        </td>
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

              <div className="mt-6 avoid-break">
                <p>Hari, Tanggal: {session.hari_tanggal}</p>
                <div className="flex justify-end mt-12">
                  <div className="text-center w-56">
                    {session[`ttd_penguji${examIdx + 1}` as keyof Session] ? (
                      <img src={session[`ttd_penguji${examIdx + 1}` as keyof Session] as string} alt="TTD" className="max-h-14 max-w-28 mx-auto object-contain" />
                    ) : <div className="h-14"></div>}
                    <p>Tanda Tangan</p>
                    <div className="h-2"></div>
                    <p className="border-t border-black pt-1 font-bold">{labels[examIdx]}</p>
                    <p className="text-sm">{namaPenguji[examIdx]}</p>
                    <p className="text-xs">NIP. {session[`nip_penguji${examIdx + 1}` as keyof Session] as string || ''}</p>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        {/* ===== REKAPITULASI NILAI ===== */}
        <div className="page-break">
          <div className="text-center border-b-2 border-black pb-4">
            <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }} />
            <h1 className="text-xl font-bold text-center uppercase">Rekapitulasi Nilai Sidang Skripsi</h1>
            <p className="text-sm text-center">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
            <p className="text-sm text-center">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
            <p className="text-sm text-center font-bold">SEMESTER {session.semester} T.A. {session.ta}</p>
          </div>

          <table className="w-full mt-2 text-sm">
            <tbody>
              <tr><td className="w-36">Dosen Pembimbing</td><td className="w-4">:</td><td>{session.pembimbing}</td><td className="w-28">Peminatan</td><td className="w-4">:</td><td>{session.peminatan}</td></tr>
              <tr><td>Hari, Tanggal Sidang</td><td>:</td><td>{session.hari_tanggal}</td><td>Waktu Sidang</td><td>:</td><td>{session.waktu}</td><td>Tempat Sidang</td><td>:</td><td>{session.tempat}</td></tr>
              <tr><td>Judul Skripsi</td><td>:</td><td colSpan={7}>{session.judul_skripsi}</td></tr>
            </tbody>
          </table>

          <table className="template-table text-sm mt-4">
            <thead>
              <tr>
                <th className="w-6">NO</th><th>NAMA</th><th className="w-16">NIM</th>
                <th className="w-14 text-[10px]">NILAI<br/>PENGUJI I<br/>(Ketua)</th><th className="w-14 text-[10px]">NILAI<br/>PENGUJI II<br/>(Anggota I)</th><th className="w-14 text-[10px]">NILAI<br/>PENGUJI III<br/>(Anggota II)</th>
                <th className="w-16 text-[10px]">RERATA<br/>NILAI SIDANG<br/>SKRIPSI</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-center">1.</td><td>{session.nama}</td><td>{session.nim}</td>
                <td className="text-center">{calc.scoresByExaminer[0].nilaiAkhir > 0 ? calc.scoresByExaminer[0].nilaiAkhir.toFixed(2) : ''}</td>
                <td className="text-center">{calc.scoresByExaminer[1].nilaiAkhir > 0 ? calc.scoresByExaminer[1].nilaiAkhir.toFixed(2) : ''}</td>
                <td className="text-center">{calc.scoresByExaminer[2].nilaiAkhir > 0 ? calc.scoresByExaminer[2].nilaiAkhir.toFixed(2) : ''}</td>
                <td className="text-center font-bold">{calc.rataRata > 0 ? calc.rataRata.toFixed(2) : ''}</td>
              </tr>
            </tbody>
          </table>

          <div className="mt-10 avoid-break">
            <div className="flex justify-between text-center">
              {[
                { label: 'Ketua Penguji', nama: session.penguji1, nip: session.nip_penguji1, ttd: session.ttd_penguji1 },
                { label: 'Anggota Penguji I', nama: session.penguji2, nip: session.nip_penguji2, ttd: session.ttd_penguji2 },
                { label: 'Anggota Penguji II', nama: session.penguji3, nip: session.nip_penguji3, ttd: session.ttd_penguji3 },
              ].map((p, i) => (
                <div key={i} className="w-48">
                  <p className="text-sm mb-1">{p.label}</p>
                  {p.ttd ? <img src={p.ttd} alt="TTD" className="max-h-14 max-w-28 mx-auto object-contain" /> : <div className="h-14"></div>}
                  <div className="h-8"></div>
                  <p className="border-t border-black pt-1 font-semibold text-sm">{p.nama || '....................'}</p>
                  <p className="text-xs">NIP. {p.nip || '..........................'}</p>
                </div>
              ))}
            </div>
            <p className="text-center text-sm mt-4">Jakarta, {session.tanggal_ba || '______________'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
