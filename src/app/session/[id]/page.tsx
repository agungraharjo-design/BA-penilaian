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
      <div className={`no-print sync-indicator ${syncStatus === 'live' ? 'bg-green-100 text-green-800' : syncStatus === 'saving' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
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
          <PreviewAll session={session} onUpdate={autoSave} />
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
function PreviewAll({ session, onUpdate }: { session: Session; onUpdate: (s: Session) => void }) {
  const previewRef = useRef<HTMLDivElement>(null)
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'preparing' | 'saved' | 'error'>('idle')

  const handlePrint = () => {
    window.print()
  }

  const handleDownloadPDF = async () => {
    const pdfStage = document.querySelector('.pdf-stage') as HTMLElement | null
    if (!pdfStage) { setPdfStatus('idle'); return }
    setPdfStatus('preparing')
    
    try {
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import('html2canvas'),
        import('jspdf'),
      ])
      
      const pdfStage = document.querySelector('.pdf-stage') as HTMLElement
      if (!pdfStage) { setPdfStatus('idle'); return }
      
      const pages = Array.from(pdfStage.querySelectorAll<HTMLElement>('.pdf-page'))
      if (!pages.length) { setPdfStatus('idle'); return }

      if (document.fonts?.ready) {
        await document.fonts.ready
      }

      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: false,
      })

      const A4_W = 210
      const A4_H = 297
      const RENDER_SCALE = 2
      const JPEG_QUALITY = 0.88

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i]

        const canvas = await html2canvas(page, {
          scale: RENDER_SCALE,
          backgroundColor: '#ffffff',
          useCORS: true,
          allowTaint: true,
          logging: false,
          width: page.offsetWidth,
          height: page.offsetHeight,
          windowWidth: page.offsetWidth,
          windowHeight: page.offsetHeight,
          scrollX: 0,
          scrollY: 0,
          onclone: (clonedDoc) => {
            const style = clonedDoc.createElement('style')
            style.textContent = `
              .pdf-stage, .pdf-stage * { box-sizing: border-box !important; }
              .pdf-page { color: #000 !important; overflow: hidden !important; }
              .pdf-page p { margin: 0; }
              .pdf-page img { vertical-align: middle !important; }
              .pdf-page > table:not(.pdf-table) { width: 100% !important; border-collapse: collapse !important; table-layout: fixed !important; margin: 4px 0 8px 0 !important; }
              .pdf-page > table:not(.pdf-table) td { padding: 0 0 2px 0 !important; line-height: 1.18 !important; vertical-align: top !important; }
              .pdf-table { border-collapse: collapse !important; table-layout: fixed !important; margin-left: auto !important; margin-right: auto !important; border-spacing: 0 !important; }
              .pdf-table th, .pdf-table td { border: 1px solid #000 !important; box-sizing: border-box !important; overflow: hidden !important; word-break: normal !important; overflow-wrap: break-word !important; white-space: normal !important; }
              .pdf-table th { text-align: center !important; vertical-align: middle !important; font-weight: bold !important; }
              .pdf-section-title { text-align: center !important; font-weight: bold !important; line-height: 1.1 !important; margin: 12px 0 5px 0 !important; }
              .pdf-table--attendance th { font-size: 10.5px !important; line-height: 1.08 !important; padding: 5px 4px !important; }
              .pdf-table--attendance td { font-size: 11px !important; line-height: 1.12 !important; padding: 5px 5px !important; height: 31px !important; vertical-align: middle !important; }
              .pdf-table--penguji { width: 610px !important; }
              .pdf-table--penguji th:nth-child(1), .pdf-table--penguji td:nth-child(1) { width: 34px !important; text-align: center !important; }
              .pdf-table--penguji th:nth-child(2), .pdf-table--penguji td:nth-child(2) { width: 110px !important; text-align: center !important; }
              .pdf-table--penguji th:nth-child(3), .pdf-table--penguji td:nth-child(3) { width: 225px !important; text-align: left !important; }
              .pdf-table--penguji th:nth-child(4), .pdf-table--penguji td:nth-child(4) { width: 125px !important; text-align: center !important; }
              .pdf-table--penguji th:nth-child(5), .pdf-table--penguji td:nth-child(5) { width: 116px !important; text-align: center !important; }
              .pdf-table--peserta { width: 430px !important; }
              .pdf-table--audiens { width: 470px !important; }
              .pdf-table--peserta th:nth-child(1), .pdf-table--peserta td:nth-child(1), .pdf-table--audiens th:nth-child(1), .pdf-table--audiens td:nth-child(1) { width: 34px !important; text-align: center !important; }
              .pdf-table--peserta th:nth-child(2), .pdf-table--peserta td:nth-child(2) { width: 150px !important; }
              .pdf-table--audiens th:nth-child(2), .pdf-table--audiens td:nth-child(2) { width: 180px !important; }
              .pdf-table--peserta th:nth-child(3), .pdf-table--peserta td:nth-child(3), .pdf-table--audiens th:nth-child(3), .pdf-table--audiens td:nth-child(3) { width: 100px !important; text-align: center !important; }
              .pdf-table--peserta th:nth-child(4), .pdf-table--peserta td:nth-child(4), .pdf-table--audiens th:nth-child(4), .pdf-table--audiens td:nth-child(4) { width: 96px !important; text-align: center !important; }
              .pdf-table--peserta th:nth-child(5), .pdf-table--peserta td:nth-child(5), .pdf-table--audiens th:nth-child(5), .pdf-table--audiens td:nth-child(5) { width: 50px !important; text-align: center !important; }
              .pdf-table--rubric { width: 100% !important; }
              .pdf-table--rubric th { font-size: 10px !important; line-height: 1.08 !important; padding: 5px 3px !important; }
              .pdf-table--rubric td { font-size: 9.5px !important; line-height: 1.08 !important; padding: 4px 5px !important; vertical-align: top !important; }
              .pdf-table--rubric th:nth-child(1), .pdf-table--rubric td:nth-child(1) { width: 28px !important; text-align: center !important; vertical-align: middle !important; }
              .pdf-table--rubric th:nth-child(3), .pdf-table--rubric td:nth-child(3) { width: 52px !important; text-align: center !important; vertical-align: middle !important; }
              .pdf-table--rubric th:nth-child(4), .pdf-table--rubric td:nth-child(4) { width: 40px !important; text-align: center !important; vertical-align: middle !important; }
              .pdf-table--rubric th:nth-child(5), .pdf-table--rubric td:nth-child(5) { width: 70px !important; text-align: center !important; vertical-align: middle !important; font-weight: bold !important; }
              .pdf-criterion-title { display: block !important; font-size: 10px !important; line-height: 1.08 !important; font-weight: bold !important; margin: 0 0 2px 0 !important; }
              .pdf-criterion-detail { display: block !important; font-size: 8.8px !important; line-height: 1.08 !important; color: #111 !important; white-space: pre-line !important; }
              .pdf-table--rubric-p1 tbody tr:nth-child(1) { height: 76px !important; }
              .pdf-table--rubric-p1 tbody tr:nth-child(2) { height: 58px !important; }
              .pdf-table--rubric-p1 tbody tr:nth-child(3) { height: 58px !important; }
              .pdf-table--rubric-p1 tbody tr:nth-child(4) { height: 70px !important; }
              .pdf-table--rubric-p1 tbody tr:nth-child(5) { height: 118px !important; }
              .pdf-table--rubric-p2 tbody tr:nth-child(1) { height: 78px !important; }
              .pdf-table--rubric-p2 tbody tr:nth-child(2) { height: 58px !important; }
              .pdf-table--rubric-p2 tbody tr:nth-child(3) { height: 82px !important; }
              .pdf-table--rubric-p2 tbody tr:nth-child(4) { height: 92px !important; }
              .pdf-table--rubric-p2 tbody tr:nth-child(5) { height: 100px !important; }
              .pdf-table--rubric-p2 tbody tr:nth-child(n+6) { height: 24px !important; }
              .pdf-table--rekap { width: 100% !important; }
              .pdf-table--rekap th { font-size: 10px !important; line-height: 1.08 !important; padding: 5px 3px !important; }
              .pdf-table--rekap td { font-size: 10.5px !important; line-height: 1.1 !important; padding: 5px 4px !important; height: 30px !important; vertical-align: middle !important; }
              .pdf-table--rekap th:nth-child(1), .pdf-table--rekap td:nth-child(1) { width: 34px !important; text-align: center !important; white-space: nowrap !important; }
              .pdf-table--rekap th:nth-child(3), .pdf-table--rekap td:nth-child(3) { width: 82px !important; text-align: center !important; white-space: nowrap !important; }
              .pdf-table--rekap th:nth-child(4), .pdf-table--rekap th:nth-child(5), .pdf-table--rekap th:nth-child(6), .pdf-table--rekap td:nth-child(4), .pdf-table--rekap td:nth-child(5), .pdf-table--rekap td:nth-child(6) { width: 58px !important; text-align: center !important; }
              .pdf-table--rekap th:nth-child(7), .pdf-table--rekap td:nth-child(7) { width: 66px !important; text-align: center !important; font-weight: bold !important; }
              .pdf-signature-img { display: block !important; max-width: 110px !important; max-height: 46px !important; object-fit: contain !important; margin: 0 auto !important; }
            `
            clonedDoc.head.appendChild(style)
          },
        })

        const imgData = canvas.toDataURL('image/jpeg', JPEG_QUALITY)

        if (i > 0) pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, 0, A4_W, A4_H)
      }
      
      // Set PDF properties
      pdf.setProperties({
        title: `BA_Sidang_${session.nim || 'unknown'}`,
        subject: 'Laporan Sidang Skripsi',
        creator: 'SKRIPSI BA SYSTEM',
      })
      
      // Convert to base64 for API upload
      const pdfBase64 = pdf.output('datauristring').split(',')[1]
      
      const safeName = (session.nama || 'unknown').replace(/[^a-zA-Z0-9]/g, '_')
      const fileName = `BA_Sidang_${safeName}_${session.nim || 'unknown'}.pdf`
      
      const uploadRes = await fetch('/api/upload-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: session.id,
          pdfBase64,
          fileName
        })
      })
      
      const uploadData = await uploadRes.json()
      
      if (!uploadRes.ok || uploadData.error) {
        console.error('Upload error:', uploadData.error)
        alert('Gagal upload PDF: ' + (uploadData.error || 'Unknown error'))
        setPdfStatus('idle')
        return
      }
      
      const publicUrl = uploadData.url
      
      // Update session with PDF URL
      const { error: updateError } = await supabase
        .from('sessions')
        .update({ pdf_url: publicUrl })
        .eq('id', session.id)
      
      if (updateError) {
        console.error('Update error:', updateError)
      }
      
      onUpdate({ ...session, pdf_url: publicUrl })
      setPdfStatus('saved')
      
    } catch (err: any) {
      console.error('PDF generation error:', err)
      alert('Gagal generate PDF: ' + err.message)
      setPdfStatus('idle')
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
          🖨 Preview Print / Save PDF
        </button>
        <button onClick={handleDownloadPDF} disabled={pdfStatus === 'preparing'} className="bg-green-800 text-white px-6 py-2 rounded hover:bg-green-700 font-sans text-sm font-medium flex items-center gap-2 disabled:opacity-50">
          {pdfStatus === 'preparing' ? '⏳ Generating PDF...' : '⬇ Menyimpan PDF'}
        </button>
        {pdfStatus === 'saved' && (
          <span className="text-green-700 text-sm font-sans self-center">✓ PDF berhasil tersimpan</span>
        )}
        <span className="text-xs text-gray-500 self-center ml-2 font-sans">(PDF sesuai dengan template asli)</span>
      </div>

      <div className="pdf-stage" style={{ position: 'absolute', top: -100000, left: 0, width: 794, zIndex: -1, pointerEvents: 'none', opacity: 1, fontFamily: "'Times New Roman', Georgia, serif", background: '#fff' }}>

        {/* P1: BA */}
        <div className="pdf-page" style={{ width: 794, height: 1123, boxSizing: 'border-box', padding: '42px 46px 54px 46px', background: '#fff', overflow: 'hidden', fontFamily: "'Times New Roman', Georgia, serif", fontSize: 14, lineHeight: 1.28 }}>
          <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 4, marginBottom: 8 }}>
            <img src="/kop-surat-resize.png" style={{ display: 'block', margin: '0 auto 4px', maxWidth: '100%', maxHeight: 52, width: 'auto', height: 'auto' }} />
            <div style={{ fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', fontSize: 14 }}>Laporan Sidang Skripsi</div>
            <div style={{ fontSize: 12, textAlign: 'center' }}>PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</div>
            <div style={{ fontSize: 12, textAlign: 'center' }}>FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</div>
            <div style={{ fontWeight: 'bold', fontSize: 12, textAlign: 'center' }}>T.A. {session.ta}</div>
          </div>
          <div style={{ textAlign: 'justify' }}>Pada hari {session.hari_tanggal || '______________'}, telah dilaksanakan sidang skripsi mahasiswa:</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
            <tbody><tr><td style={{ width: 110 }}>Nama Mahasiswa</td><td style={{ width: 14 }}>:</td><td>{session.nama || '______________'}</td></tr><tr><td>NIM</td><td>:</td><td>{session.nim || '______________'}</td></tr><tr><td>Waktu Sidang</td><td>:</td><td>{session.waktu || '______________'}</td></tr><tr><td>Peminatan</td><td>:</td><td>{session.peminatan || '______________'}</td></tr></tbody>
          </table>
          {session.catatan && <div style={{ marginTop: 6 }}><div style={{ fontWeight: 'bold' }}>Hasil Pelaksanaan :</div><div style={{ whiteSpace: 'pre-wrap' }}>{session.catatan}</div></div>}
          <div style={{ marginTop: 6 }}><span style={{ marginLeft: 8 }}>{session.decision === 'lulus_perbaikan' ? '✓' : '○'} Lulus</span><br/><span style={{ marginLeft: 8 }}>{session.decision === 'tidak_lulus_ulang' ? '✓' : '○'} Tidak Lulus</span></div>
          <div style={{ fontStyle: 'italic', fontSize: 11, textAlign: 'justify', marginTop: 6 }}>Demikian laporan sidang ini dibuat sebagai laporan selama sidang berlangsung untuk diketahui dan dipergunakan sebagaimana mestinya.</div>
          <div style={{ fontWeight: 'bold', textAlign: 'center', marginTop: 6 }}>TIM PENGUJI</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 2 }}>
            <thead><tr><th style={{ width: 32, border: '1px solid #000', padding: 2 }}>NO</th><th style={{ border: '1px solid #000', padding: 2 }}>NAMA PENGUJI</th><th style={{ border: '1px solid #000', padding: 2 }}>JABATAN</th><th style={{ width: 80, border: '1px solid #000', padding: 2 }}>TANDA TANGAN</th></tr></thead>
            <tbody>
              <tr><td style={{ textAlign: 'center', border: '1px solid #000', padding: 2 }}>1.</td><td style={{ border: '1px solid #000', padding: 2 }}>{session.penguji1 || '______________'}</td><td style={{ border: '1px solid #000', padding: 2 }}>Ketua Penguji</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: 2, verticalAlign: 'middle' }}>{session.ttd_penguji1 ? <img src={session.ttd_penguji1} alt="TTD" style={{ maxHeight: 30, maxWidth: 60, margin: '0 auto', objectFit: 'contain' }} /> : ''}</td></tr>
              <tr><td style={{ textAlign: 'center', border: '1px solid #000', padding: 2 }}>2.</td><td style={{ border: '1px solid #000', padding: 2 }}>{session.penguji2 || '______________'}</td><td style={{ border: '1px solid #000', padding: 2 }}>Anggota Penguji I</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: 2, verticalAlign: 'middle' }}>{session.ttd_penguji2 ? <img src={session.ttd_penguji2} alt="TTD" style={{ maxHeight: 30, maxWidth: 60, margin: '0 auto', objectFit: 'contain' }} /> : ''}</td></tr>
              <tr><td style={{ textAlign: 'center', border: '1px solid #000', padding: 2 }}>3.</td><td style={{ border: '1px solid #000', padding: 2 }}>{session.penguji3 || '______________'}</td><td style={{ border: '1px solid #000', padding: 2 }}>Anggota Penguji II</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: 2, verticalAlign: 'middle' }}>{session.ttd_penguji3 ? <img src={session.ttd_penguji3} alt="TTD" style={{ maxHeight: 30, maxWidth: 60, margin: '0 auto', objectFit: 'contain' }} /> : ''}</td></tr>
            </tbody>
          </table>
          <div style={{ textAlign: 'right', marginTop: 15 }}>
            <p>Jakarta, {session.tanggal_ba || '______________'}</p>
            <p style={{ marginTop: 8 }}>Koordinator Program Studi Kesehatan Masyarakat</p><p>Program Sarjana</p>
            {session.ttd_koordinator ? <img src={session.ttd_koordinator} alt="TTD" className="pdf-signature-img" style={{ maxHeight: 38, maxWidth: 80, marginLeft: 'auto', marginTop: 4, display: 'block', objectFit: 'contain' }} /> : <div style={{ height: 38 }}></div>}
            <p style={{ fontWeight: 'bold' }}>{session.koordinator}</p>
            <p style={{ fontSize: 11 }}>NIP. {session.nip_koordinator}</p>
          </div>
        </div>

        <div className="pdf-page" style={{ width: 794, height: 1123, boxSizing: 'border-box', padding: '42px 46px 54px 46px', background: '#fff', overflow: 'hidden', fontFamily: "'Times New Roman', Georgia, serif", fontSize: 14, lineHeight: 1.28 }}>
          <div style={{ textAlign: 'center', borderBottom: '2px solid #000', padding: 4, marginBottom: 6 }}>
            <img src="/kop-surat-resize.png" style={{ display: 'block', margin: '0 auto 4px', maxWidth: '100%', maxHeight: 52, width: 'auto', height: 'auto' }} />
            <div style={{ fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', fontSize: 14 }}>Daftar Hadir Sidang Skripsi</div>
            <div style={{ fontSize: 12, textAlign: 'center' }}>PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</div>
            <div style={{ fontSize: 12, textAlign: 'center' }}>FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</div>
            <div style={{ fontWeight: 'bold', fontSize: 12, textAlign: 'center' }}>T.A. {session.ta}</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 3 }}>
            <tbody><tr><td style={{ width: 110 }}>Nama Mahasiswa</td><td style={{ width: 14 }}>:</td><td>{session.nama}</td></tr><tr><td>NIM</td><td>:</td><td>{session.nim}</td></tr><tr><td>Hari, Tanggal</td><td>:</td><td>{session.hari_tanggal}</td></tr><tr><td>Peminatan</td><td>:</td><td>{session.peminatan}</td></tr></tbody>
          </table>
          <div className="pdf-section-title">DAFTAR HADIR PENGUJI</div>
          <table className="pdf-table pdf-table--attendance pdf-table--penguji" style={{ fontSize: 12 }}>
            <thead><tr><th style={{ width: 22, border: '1px solid #000', padding: '1px 3px' }}>NO</th><th style={{ width: 90, border: '1px solid #000', padding: '1px 3px' }}>NIP</th><th style={{ border: '1px solid #000', padding: '1px 3px' }}>NAMA PENGUJI</th><th style={{ border: '1px solid #000', padding: '1px 3px' }}>JABATAN</th><th style={{ width: 80, border: '1px solid #000', padding: '1px 3px' }}>TANDA TANGAN</th></tr></thead>
            <tbody>
              <tr><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px' }}>1.</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}>{session.nip_penguji1 || ''}</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}>{session.penguji1 || '______________'}</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}>Ketua Penguji</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', verticalAlign: 'middle' }}>{session.ttd_penguji1 ? <img src={session.ttd_penguji1} alt="TTD" style={{ maxHeight: 28, maxWidth: 56, margin: '0 auto', objectFit: 'contain' }} /> : <span style={{ color: '#999' }}>-</span>}</td></tr>
              <tr><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px' }}>2.</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}>{session.nip_penguji2 || ''}</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}>{session.penguji2 || '______________'}</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}>Anggota Penguji I</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', verticalAlign: 'middle' }}>{session.ttd_penguji2 ? <img src={session.ttd_penguji2} alt="TTD" style={{ maxHeight: 28, maxWidth: 56, margin: '0 auto', objectFit: 'contain' }} /> : <span style={{ color: '#999' }}>-</span>}</td></tr>
              <tr><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px' }}>3.</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}>{session.nip_penguji3 || ''}</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}>{session.penguji3 || '______________'}</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}>Anggota Penguji II</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', verticalAlign: 'middle' }}>{session.ttd_penguji3 ? <img src={session.ttd_penguji3} alt="TTD" style={{ maxHeight: 28, maxWidth: 56, margin: '0 auto', objectFit: 'contain' }} /> : <span style={{ color: '#999' }}>-</span>}</td></tr>
            </tbody>
          </table>
          <div className="pdf-section-title">DAFTAR HADIR PESERTA</div>
          <table className="pdf-table pdf-table--attendance pdf-table--peserta" style={{ fontSize: 12 }}>
            <thead><tr><th style={{ width: 22, border: '1px solid #000', padding: '1px 3px' }}>NO</th><th style={{ border: '1px solid #000', padding: '1px 3px' }}>NAMA PESERTA</th><th style={{ width: 80, border: '1px solid #000', padding: '1px 3px' }}>NIM</th><th style={{ width: 80, border: '1px solid #000', padding: '1px 3px' }}>TTD</th><th style={{ width: 28, border: '1px solid #000', padding: '1px 3px' }}>KET</th></tr></thead>
            <tbody>
              {(session.peserta_hadir || [{ nama: session.nama, nim: session.nim }]).map((p: any, i: number) => (
                <tr key={i}><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px' }}>{i + 1}.</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}>{p.nama || ''}</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}>{p.nim || ''}</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', verticalAlign: 'middle' }}>{p.ttd ? <img src={p.ttd} alt="TTD" style={{ maxHeight: 24, maxWidth: 48, margin: '0 auto', objectFit: 'contain' }} /> : <span style={{ color: '#999' }}>-</span>}</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px' }}></td></tr>
              ))}
            </tbody>
          </table>
          <div className="pdf-section-title">DAFTAR HADIR AUDIENS</div>
          <table className="pdf-table pdf-table--attendance pdf-table--audiens" style={{ fontSize: 12 }}>
            <thead><tr><th style={{ width: 22, border: '1px solid #000', padding: '1px 3px' }}>NO</th><th style={{ border: '1px solid #000', padding: '1px 3px' }}>NAMA MAHASISWA</th><th style={{ width: 80, border: '1px solid #000', padding: '1px 3px' }}>NIM</th><th style={{ width: 80, border: '1px solid #000', padding: '1px 3px' }}>TTD</th><th style={{ width: 28, border: '1px solid #000', padding: '1px 3px' }}>KET</th></tr></thead>
            <tbody>
              {(session.audience_hadir || []).map((a: any, i: number) => (
                <tr key={i}><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px' }}>{i + 1}.</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}>{a.nama || 'Nama mahasiswa'}</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}>{a.nim || ''}</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', verticalAlign: 'middle' }}>{a.ttd ? <img src={a.ttd} alt="TTD" style={{ maxHeight: 24, maxWidth: 48, margin: '0 auto', objectFit: 'contain' }} /> : <span style={{ color: '#999' }}>-</span>}</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px' }}></td></tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Form Penilaian P1 + P2 per examiner */}
        {[0, 1, 2].map((examIdx) => {
          const scores = session.skor_penguji?.[examIdx] || [null,null,null,null,null,null,null,null,null,null]
          const labels = ['Penguji I/Ketua Penguji', 'Penguji II/Anggota Penguji', 'Penguji III/Anggota Penguji']
          const namaPenguji = [session.penguji1, session.penguji2, session.penguji3]
          const firstPageCriteriaCount = 5
          return [
            <div key={`${examIdx}-p1`} className="pdf-page" style={{ width: 794, height: 1123, boxSizing: 'border-box', padding: '42px 46px 54px 46px', background: '#fff', overflow: 'hidden', fontFamily: "'Times New Roman', Georgia, serif", fontSize: 14, lineHeight: 1.28 }}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 4, marginBottom: 6 }}>
                <img src="/kop-surat-resize.png" style={{ display: 'block', margin: '0 auto 4px', maxWidth: '100%', maxHeight: 52, width: 'auto', height: 'auto' }} />
                <div style={{ fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', fontSize: 14 }}>Formulir Penilaian Sidang Skripsi</div>
                <div style={{ fontSize: 12, textAlign: 'center' }}>PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</div>
                <div style={{ fontSize: 12, textAlign: 'center' }}>FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</div>
                <div style={{ fontWeight: 'bold', fontSize: 12, textAlign: 'center' }}>SEMESTER {session.semester} T.A. {session.ta}</div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 4 }}>
                <tbody>
                  <tr><td style={{ width: 110 }}>Nama Peserta</td><td style={{ width: 14 }}>:</td><td>{session.nama}</td><td style={{ width: 80 }}>NIM</td><td style={{ width: 14 }}>:</td><td>{session.nim}</td></tr>
                  <tr><td>Hari, Tanggal</td><td>:</td><td>{session.hari_tanggal}</td><td>Waktu</td><td>:</td><td>{session.waktu}</td></tr>
                  <tr><td>Tempat</td><td>:</td><td>{session.tempat}</td><td>Pembimbing</td><td>:</td><td>{session.pembimbing}</td></tr>
                  <tr><td>Peminatan</td><td>:</td><td colSpan={3}>{session.peminatan}</td></tr>
                </tbody>
              </table>
              <div style={{ fontSize: 12, marginTop: 3 }}><b>Judul Skripsi:</b> {session.judul_skripsi}</div>
              <table className="pdf-table pdf-table--rubric pdf-table--rubric-p1" style={{ fontSize: 12, marginTop: 3 }}>
                <thead><tr><th style={{ width: 24, border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>NO</th><th style={{ border: '1px solid #000', padding: '1px 3px' }}>PARAMETER PENILAIAN</th><th style={{ width: 52, border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>SKOR (1–4)</th><th style={{ width: 36, border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>BOBOT</th><th style={{ width: 70, border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>SKOR × BOBOT</th></tr></thead>
                <tbody>
                  {RUBRIC_CRITERIA.slice(0, firstPageCriteriaCount).map((c) => {
                    const skorXBobot = scores[c.no - 1] !== null ? scores[c.no - 1]! * c.bobot : null
                    return <tr key={c.no}><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', verticalAlign: 'top' }}>{c.no}.</td><td style={{ border: '1px solid #000', padding: '1px 3px', verticalAlign: 'top' }}><div className="pdf-criterion-title">{c.label}</div><div className="pdf-criterion-detail">{c.detail}</div></td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', verticalAlign: 'top' }}>{scores[c.no - 1] ?? ''}</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', verticalAlign: 'top' }}>{c.bobot}</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', fontWeight: 'bold', verticalAlign: 'top' }}>{skorXBobot ?? ''}</td></tr>
                  })}
                </tbody>
              </table>
            </div>,
            <div key={`${examIdx}-p2`} className="pdf-page" style={{ width: 794, height: 1123, boxSizing: 'border-box', padding: '42px 46px 54px 46px', background: '#fff', overflow: 'hidden', fontFamily: "'Times New Roman', Georgia, serif", fontSize: 14, lineHeight: 1.28 }}>
              <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 4, marginBottom: 6 }}>
                <img src="/kop-surat-resize.png" style={{ display: 'block', margin: '0 auto 4px', maxWidth: '100%', maxHeight: 52, width: 'auto', height: 'auto' }} />
                <div style={{ fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', fontSize: 14 }}>Formulir Penilaian Sidang Skripsi</div>
                <div style={{ fontSize: 12, textAlign: 'center' }}>PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</div>
                <div style={{ fontSize: 12, textAlign: 'center' }}>FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</div>
                <div style={{ fontWeight: 'bold', fontSize: 12, textAlign: 'center' }}>SEMESTER {session.semester} T.A. {session.ta}</div>
              </div>
              <table className="pdf-table pdf-table--rubric pdf-table--rubric-p2" style={{ fontSize: 12, marginTop: 0 }}>
                <thead><tr><th style={{ width: 24, border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>NO</th><th style={{ border: '1px solid #000', padding: '1px 3px' }}>PARAMETER PENILAIAN</th><th style={{ width: 52, border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>SKOR (1–4)</th><th style={{ width: 36, border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>BOBOT</th><th style={{ width: 70, border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>SKOR × BOBOT</th></tr></thead>
                <tbody>
                  {RUBRIC_CRITERIA.slice(firstPageCriteriaCount).map((c) => {
                    const skorXBobot = scores[c.no - 1] !== null ? scores[c.no - 1]! * c.bobot : null
                    return <tr key={c.no}><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', verticalAlign: 'top' }}>{c.no}.</td><td style={{ border: '1px solid #000', padding: '1px 3px', verticalAlign: 'top' }}><div className="pdf-criterion-title">{c.label}</div><div className="pdf-criterion-detail">{c.detail}</div></td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', verticalAlign: 'top' }}>{scores[c.no - 1] ?? ''}</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', verticalAlign: 'top' }}>{c.bobot}</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', fontWeight: 'bold', verticalAlign: 'top' }}>{skorXBobot ?? ''}</td></tr>
                  })}
                  <tr style={{ fontWeight: 'bold', borderTop: '2px solid #000' }}><td colSpan={2} style={{ border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>TOTAL SKOR × BOBOT</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}></td><td style={{ border: '1px solid #000', padding: '1px 3px' }}></td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px' }}>{calc.scoresByExaminer[examIdx].totalSkorXBobot}</td></tr>
                  <tr style={{ fontWeight: 'bold' }}><td colSpan={2} style={{ border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>NILAI AKHIR [/400 × 100]</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}></td><td style={{ border: '1px solid #000', padding: '1px 3px' }}></td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px' }}>{calc.scoresByExaminer[examIdx].nilaiAkhir > 0 ? calc.scoresByExaminer[examIdx].nilaiAkhir.toFixed(2) : ''}</td></tr>
                  <tr style={{ fontWeight: 'bold' }}><td colSpan={2} style={{ border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>HURUF MUTU</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}></td><td style={{ border: '1px solid #000', padding: '1px 3px' }}></td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px' }}>{calc.scoresByExaminer[examIdx].nilaiAkhir > 0 ? calcGrade(calc.scoresByExaminer[examIdx].nilaiAkhir) : ''}</td></tr>
                </tbody>
              </table>
              <div style={{ fontSize: 10, fontStyle: 'italic', marginTop: 3 }}>*Bila presentasi skripsi dilakukan menggunakan Bahasa Inggris, nilai akhir ditambahkan 2—6 poin.</div>
              <div style={{ marginTop: 8 }}>
                <p>Hari, Tanggal: {session.hari_tanggal}</p>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  <div style={{ textAlign: 'center', width: 190 }}>
                    {session[`ttd_penguji${examIdx + 1}` as keyof Session] ? <img src={session[`ttd_penguji${examIdx + 1}` as keyof Session] as string} alt="TTD" className="pdf-signature-img" style={{ maxHeight: 42, maxWidth: 110, margin: '0 auto', display: 'block', objectFit: 'contain' }} /> : <div style={{ height: 42 }}></div>}
                    <p style={{ margin: '2px 0' }}>Tanda Tangan</p>
                    <div style={{ height: 6 }}></div>
                    <p style={{ borderTop: '1px solid #000', paddingTop: 2, fontWeight: 'bold', fontSize: 12 }}>{labels[examIdx]}</p>
                    <p style={{ fontSize: 12, margin: '1px 0' }}>{namaPenguji[examIdx]}</p>
                    <p style={{ fontSize: 10, margin: 0 }}>NIP. {session[`nip_penguji${examIdx + 1}` as keyof Session] as string || ''}</p>
                  </div>
                </div>
              </div>
            </div>
          ]
        })}

        {/* P8: REKAPITULASI NILAI */}
        <div className="pdf-page" style={{ width: 794, height: 1123, boxSizing: 'border-box', padding: '42px 46px 54px 46px', background: '#fff', overflow: 'hidden', fontFamily: "'Times New Roman', Georgia, serif", fontSize: 14, lineHeight: 1.28 }}>
          <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 4, marginBottom: 8 }}>
            <img src="/kop-surat-resize.png" style={{ display: 'block', margin: '0 auto 4px', maxWidth: '100%', maxHeight: 52, width: 'auto', height: 'auto' }} />
            <div style={{ fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase', fontSize: 14 }}>Rekapitulasi Nilai Sidang Skripsi</div>
            <div style={{ fontSize: 12, textAlign: 'center' }}>PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</div>
            <div style={{ fontSize: 12, textAlign: 'center' }}>FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</div>
            <div style={{ fontWeight: 'bold', fontSize: 12, textAlign: 'center' }}>SEMESTER {session.semester} T.A. {session.ta}</div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, lineHeight: 1.2, marginTop: 4, tableLayout: 'fixed' }}>
            <tbody>
              <tr><td style={{ width: 120, padding: '1px 0' }}>Dosen Pembimbing</td><td style={{ width: 14, padding: '1px 0' }}>:</td><td style={{ padding: '1px 0' }}>{session.pembimbing}</td><td style={{ width: 75, padding: '1px 0' }}>Peminatan</td><td style={{ width: 14, padding: '1px 0' }}>:</td><td style={{ padding: '1px 0' }}>{session.peminatan}</td></tr>
              <tr><td style={{ padding: '1px 0' }}>Hari, Tanggal</td><td style={{ padding: '1px 0' }}>:</td><td style={{ padding: '1px 0' }}>{session.hari_tanggal}</td><td style={{ width: 75, padding: '1px 0' }}>Waktu</td><td style={{ padding: '1px 0' }}>:</td><td style={{ padding: '1px 0' }}>{session.waktu}</td></tr>
              <tr><td style={{ padding: '1px 0' }}>Tempat</td><td style={{ padding: '1px 0' }}>:</td><td style={{ padding: '1px 0' }} colSpan={4}>{session.tempat}</td></tr>
              <tr><td style={{ padding: '1px 0' }}>Judul Skripsi</td><td style={{ padding: '1px 0' }}>:</td><td style={{ padding: '1px 0', fontSize: 10 }} colSpan={4}>{session.judul_skripsi}</td></tr>
            </tbody>
          </table>
          <table className="pdf-table pdf-table--rekap" style={{ fontSize: 12, marginTop: 6 }}>
            <thead><tr><th style={{ width: 22, border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>NO</th><th style={{ border: '1px solid #000', padding: '1px 3px' }}>NAMA</th><th style={{ width: 60, border: '1px solid #000', padding: '1px 3px' }}>NIM</th><th style={{ width: 52, border: '1px solid #000', padding: '1px 2px', textAlign: 'center', fontSize: 11 }}>NILAI<br/>PENGUJI I</th><th style={{ width: 52, border: '1px solid #000', padding: '1px 2px', textAlign: 'center', fontSize: 11 }}>NILAI<br/>PENGUJI II</th><th style={{ width: 52, border: '1px solid #000', padding: '1px 2px', textAlign: 'center', fontSize: 11 }}>NILAI<br/>PENGUJI III</th><th style={{ width: 60, border: '1px solid #000', padding: '1px 2px', textAlign: 'center', fontSize: 11 }}>RERATA<br/>NILAI</th></tr></thead>
            <tbody>
              <tr><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px' }}>1.</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}>{session.nama}</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}>{session.nim}</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', fontSize: 11 }}>{calc.scoresByExaminer[0].nilaiAkhir > 0 ? calc.scoresByExaminer[0].nilaiAkhir.toFixed(2) : ''}</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', fontSize: 11 }}>{calc.scoresByExaminer[1].nilaiAkhir > 0 ? calc.scoresByExaminer[1].nilaiAkhir.toFixed(2) : ''}</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', fontSize: 11 }}>{calc.scoresByExaminer[2].nilaiAkhir > 0 ? calc.scoresByExaminer[2].nilaiAkhir.toFixed(2) : ''}</td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', fontWeight: 'bold', fontSize: 11 }}>{calc.rataRata > 0 ? calc.rataRata.toFixed(2) : ''}</td></tr>
            </tbody>
          </table>
          <div style={{ marginTop: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              {[
                { label: 'Ketua Penguji', nama: session.penguji1, nip: session.nip_penguji1, ttd: session.ttd_penguji1 },
                { label: 'Anggota Penguji I', nama: session.penguji2, nip: session.nip_penguji2, ttd: session.ttd_penguji2 },
                { label: 'Anggota Penguji II', nama: session.penguji3, nip: session.nip_penguji3, ttd: session.ttd_penguji3 },
              ].map((p, i) => (
                <div key={i} style={{ textAlign: 'center', width: 150 }}>
                  <p style={{ fontSize: 12, margin: '1px 0' }}>{p.label}</p>
                  {p.ttd ? <img src={p.ttd} alt="TTD" className="pdf-signature-img" style={{ maxHeight: 38, maxWidth: 80, margin: '0 auto', display: 'block', objectFit: 'contain' }} /> : <div style={{ height: 38 }}></div>}
                  <div style={{ height: 8 }}></div>
                  <p style={{ borderTop: '1px solid #000', paddingTop: 2, fontWeight: 'bold', fontSize: 12, margin: 0 }}>{p.nama || '....................'}</p>
                  <p style={{ fontSize: 10, margin: 0 }}>NIP. {p.nip || '..........................'}</p>
                </div>
              ))}
            </div>
            <p style={{ textAlign: 'center', fontSize: 12, marginTop: 10 }}>Jakarta, {session.tanggal_ba || '______________'}</p>
          </div>
        </div>

      </div>

      <div ref={previewRef} className="print-area bg-white p-8 md:p-12 print:p-0 space-y-10 print:space-y-0" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>
        {/* ===== LAPORAN SIDANG SKRIPSI (BA) ===== */}
        <div className="page-break">
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
        </div>

        {/* ===== DAFTAR HADIR ===== */}
        <div className="page-break">
          <div className="text-center border-b-2 border-black pb-4">
            <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }} />
            <h1 className="text-xl font-bold uppercase">Daftar Hadir Sidang Skripsi</h1>
            <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
            <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
            <p className="text-sm font-semibold">T.A. {session.ta}</p>
          </div>
          <table className="w-full mt-2 text-sm">
            <tbody>
              <tr><td className="w-32">Nama Mahasiswa</td><td className="w-4">:</td><td>{session.nama}</td></tr>
              <tr><td>NIM</td><td>:</td><td>{session.nim}</td></tr>
              <tr><td>Hari, Tanggal</td><td>:</td><td>{session.hari_tanggal}</td></tr>
              <tr><td>Peminatan</td><td>:</td><td>{session.peminatan}</td></tr>
            </tbody>
          </table>

          <h3 className="font-bold text-center mt-4 mb-1">DAFTAR HADIR PENGUJI</h3>
          <table className="template-table text-sm">
            <thead><tr><th className="w-8">NO</th><th className="w-28">NIP</th><th>NAMA PENGUJI</th><th>JABATAN</th><th className="w-24">TANDA TANGAN</th></tr></thead>
            <tbody>
              {[
                { no: 1, nip: session.nip_penguji1, nama: session.penguji1, jabatan: 'Ketua Penguji', ttd: session.ttd_penguji1 },
                { no: 2, nip: session.nip_penguji2, nama: session.penguji2, jabatan: 'Anggota Penguji I', ttd: session.ttd_penguji2 },
                { no: 3, nip: session.nip_penguji3, nama: session.penguji3, jabatan: 'Anggota Penguji II', ttd: session.ttd_penguji3 },
              ].map((p) => (
                <tr key={p.no}>
                  <td className="text-center">{p.no}.</td>
                  <td>{p.nip || ''}</td>
                  <td>{p.nama || '______________'}</td>
                  <td>{p.jabatan}</td>
                  <td className="text-center align-middle">
                    {p.ttd ? <img src={p.ttd} alt="TTD" className="max-h-12 max-w-24 mx-auto object-contain" /> : <span className="text-gray-400">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="font-bold text-center mt-4 mb-1">DAFTAR HADIR PESERTA</h3>
          <table className="template-table text-sm">
            <thead><tr><th className="w-8">NO</th><th>NAMA PESERTA</th><th className="w-24">NIM</th><th className="w-24">TANDA TANGAN</th><th className="w-16">KET</th></tr></thead>
            <tbody>
              {(session.peserta_hadir || [{ nama: session.nama, nim: session.nim }]).map((p: any, i: number) => (
                <tr key={i}>
                  <td className="text-center">{i + 1}.</td>
                  <td>{p.nama || ''}</td>
                  <td>{p.nim || ''}</td>
                  <td className="text-center align-middle">
                    {p.ttd ? <img src={p.ttd} alt="TTD" className="max-h-12 max-w-24 mx-auto object-contain" /> : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="text-center"></td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="font-bold text-center mt-4 mb-1">DAFTAR HADIR AUDIENS</h3>
          <table className="template-table text-sm">
            <thead><tr><th className="w-8">NO</th><th>NAMA MAHASISWA</th><th className="w-24">NIM</th><th className="w-24">TANDA TANGAN</th><th className="w-16">KET</th></tr></thead>
            <tbody>
              {(session.audience_hadir || []).map((a: any, i: number) => (
                <tr key={i}>
                  <td className="text-center">{i + 1}.</td>
                  <td>{a.nama || <span className="text-gray-400">Nama mahasiswa</span>}</td>
                  <td>{a.nim || ''}</td>
                  <td className="text-center align-middle">
                    {a.ttd ? <img src={a.ttd} alt="TTD" className="max-h-12 max-w-24 mx-auto object-contain" /> : <span className="text-gray-400">-</span>}
                  </td>
                  <td className="text-center"></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ===== FORM PENILAIAN (3 examiners, 1 page each, font 12pt) ===== */}
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

              <table className="w-full mt-2 text-base">
                <tbody>
                  <tr><td className="w-36">Nama Peserta</td><td className="w-4">:</td><td>{session.nama}</td><td className="w-36">NIM</td><td className="w-4">:</td><td>{session.nim}</td></tr>
                  <tr><td>Hari, Tanggal Sidang</td><td>:</td><td>{session.hari_tanggal}</td><td>Waktu Sidang</td><td>:</td><td>{session.waktu}</td></tr>
                  <tr><td>Tempat Sidang</td><td>:</td><td>{session.tempat}</td><td>Dosen Pembimbing</td><td>:</td><td>{session.pembimbing}</td></tr>
                  <tr><td>Peminatan</td><td>:</td><td>{session.peminatan}</td><td></td><td></td><td></td></tr>
                </tbody>
              </table>
              <p className="text-base mt-1"><span className="font-semibold">Judul Skripsi:</span> {session.judul_skripsi}</p>

              <table className="template-table text-base mt-3">
                <thead>
                  <tr><th className="w-8">NO</th><th className="w-64">PARAMETER PENILAIAN</th><th className="w-24">SKOR (1—4)</th><th className="w-14">BOBOT</th><th className="w-24">SKOR × BOBOT</th></tr>
                </thead>
                <tbody>
                  {RUBRIC_CRITERIA.map((c) => {
                    const skorXBobot = scores[c.no - 1] !== null ? scores[c.no - 1]! * c.bobot : null
                    return (
                      <tr key={c.no} className="avoid-break">
                        <td className="text-center align-top">{c.no}.</td>
                        <td className="leading-snug py-1.5">
                          <div className="font-semibold">{c.label}</div>
                          <div className="text-[11px] text-gray-700 whitespace-pre-line">{c.detail}</div>
                        </td>
                        <td className="text-center">{scores[c.no - 1] ?? ''}</td>
                        <td className="text-center">{c.bobot}</td>
                        <td className="text-center font-bold">{skorXBobot ?? ''}</td>
                      </tr>
                    )
                  })}
                  <tr className="font-bold border-t-2 border-black">
                    <td colSpan={4} className="text-center">TOTAL SKOR × BOBOT</td>
                    <td className="text-center">{calc.scoresByExaminer[examIdx].totalSkorXBobot}</td>
                  </tr>
                  <tr className="font-bold">
                    <td colSpan={4} className="text-center">NILAI AKHIR [/400 × 100]</td>
                    <td className="text-center">{calc.scoresByExaminer[examIdx].nilaiAkhir > 0 ? calc.scoresByExaminer[examIdx].nilaiAkhir.toFixed(2) : ''}</td>
                  </tr>
                  <tr className="font-bold">
                    <td colSpan={4} className="text-center">HURUF MUTU</td>
                    <td className="text-center">{calc.scoresByExaminer[examIdx].nilaiAkhir > 0 ? calcGrade(calc.scoresByExaminer[examIdx].nilaiAkhir) : ''}</td>
                  </tr>
                </tbody>
              </table>

              <div className="mt-4 avoid-break">
                <p>Hari, Tanggal: {session.hari_tanggal}</p>
                <div className="flex justify-end mt-8">
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
