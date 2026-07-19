'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'
import { S2SignatureUpload } from '@/app/components/common/S2SignatureUpload'

interface S2Session {
  id: string
  student_name: string
  student_nim: string
  specialization: string
  hari_tanggal: string
  semester: string
  ta: string
}

interface AttRow {
  id?: string
  session_id?: string
  attendance_type: 'peserta' | 'audiens'
  name: string
  nim: string
  signature_path: string | null
  notes?: string
  submitted_by?: string | null
  submitted_at?: string
  created_at?: string
  updated_at?: string
}

export default function S2PublicAttendancePage() {
  const params = useParams()
  const token = params.token as string

  const [session, setSession] = useState<S2Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  const [peserta, setPeserta] = useState<AttRow[]>([])
  const [audiens, setAudiens] = useState<AttRow[]>([])
  const pesertaRef = useRef<AttRow[]>([])
  const audiensRef = useRef<AttRow[]>([])
  const saveTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!token) return
    loadSession()
  }, [token])

  async function loadSession() {
    try {
      const res = await fetch(`/api/s2/attendance?token=${encodeURIComponent(token)}`)
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Sesi tidak ditemukan')
        setLoading(false)
        return
      }
      const data = await res.json()
      setSession(data.session)
      const existing = (data.attendance || []) as AttRow[]
      const p = existing.filter((a: AttRow) => a.attendance_type === 'peserta')
      const a = existing.filter((x: AttRow) => x.attendance_type === 'audiens')
      const pes = p.length ? p : [{ attendance_type: 'peserta' as const, name: data.session.student_name, nim: data.session.student_nim, signature_path: null }]
      const aud = a.length ? a : []
      setPeserta(pes)
      setAudiens(aud)
      pesertaRef.current = pes
      audiensRef.current = aud
    } catch {
      setError('Gagal memuat data')
    }
    setLoading(false)
  }

  async function saveAttendance() {
    setStatus('saving')
    try {
      const res = await fetch('/api/s2/attendance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          peserta: pesertaRef.current,
          audiens: audiensRef.current,
        }),
      })
      if (res.ok) setStatus('saved')
      else setStatus('idle')
    } catch (err) {
      console.error('Save error:', err)
      setStatus('idle')
    }
  }

  const debouncedSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(saveAttendance, 800)
  }

  const updatePeserta = (idx: number, field: 'name' | 'nim' | 'signature_path', value: string | null) => {
    const newP = peserta.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    setPeserta(newP)
    pesertaRef.current = newP
    debouncedSave()
  }

  const updateAudiens = (idx: number, field: 'name' | 'nim' | 'signature_path', value: string | null) => {
    const newA = audiens.map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    setAudiens(newA)
    audiensRef.current = newA
    debouncedSave()
  }

  const addPeserta = () => {
    const newP = [...peserta, { attendance_type: 'peserta' as const, name: '', nim: '', signature_path: null }]
    setPeserta(newP)
    pesertaRef.current = newP
  }

  const removePeserta = (idx: number) => {
    const newP = peserta.filter((_, i) => i !== idx)
    setPeserta(newP)
    pesertaRef.current = newP
    debouncedSave()
  }

  const addAudiens = () => {
    const newA = [...audiens, { attendance_type: 'audiens' as const, name: '', nim: '', signature_path: null }]
    setAudiens(newA)
    audiensRef.current = newA
  }

  const removeAudiens = (idx: number) => {
    const newA = audiens.filter((_, i) => i !== idx)
    setAudiens(newA)
    audiensRef.current = newA
    debouncedSave()
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-gray-500 font-serif text-lg">Memuat...</div>
  if (error) return <div className="flex items-center justify-center min-h-[60vh] text-red-500 font-serif text-lg">{error}</div>
  if (!session) return null

  return (
    <div className="max-w-4xl mx-auto p-4 font-serif">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center border-b-2 border-black pb-4 mb-6">
          <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" className="mx-auto max-h-16 mb-3" />
          <h1 className="text-xl font-bold uppercase">Daftar Hadir Seminar Proposal Tesis</h1>
          <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM MAGISTER</p>
          <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
          <p className="text-sm font-bold mt-1">SEMESTER {session.semester} T.A. {session.ta}</p>
        </div>

        <table className="w-full text-sm mb-6">
          <tbody>
            <tr><td className="w-36 font-semibold">Nama Mahasiswa</td><td>:</td><td>{session.student_name}</td></tr>
            <tr><td>NIM</td><td>:</td><td>{session.student_nim}</td></tr>
            <tr><td>Tanggal Ujian</td><td>:</td><td>{session.hari_tanggal}</td></tr>
            <tr><td>Peminatan</td><td>:</td><td>{session.specialization || '-'}</td></tr>
          </tbody>
        </table>

        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-gray-500">Isi data diri Anda pada tabel di bawah, perubahan tersimpan otomatis.</p>
          {status === 'saved' && <span className="text-xs text-green-700 font-semibold">Tersimpan ✓</span>}
          {status === 'saving' && <span className="text-xs text-yellow-700 font-semibold">Menyimpan...</span>}
        </div>

        <div className="mb-8">
          <h2 className="font-bold text-center mb-2">Daftar Hadir Peserta Seminar Proposal Tesis</h2>
          <table className="template-table text-sm">
            <thead>
              <tr><th className="w-8">NO</th><th>NAMA PESERTA</th><th className="w-28">NIM</th><th className="w-24">TANDA TANGAN</th><th className="w-16">KET</th></tr>
            </thead>
            <tbody>
              {peserta.map((p, i) => (
                <tr key={i}>
                  <td className="text-center">{i + 1}.</td>
                  <td><input value={p.name} onChange={(e) => updatePeserta(i, 'name', e.target.value)} className="w-full bg-transparent" placeholder="Nama" /></td>
                  <td><input value={p.nim} onChange={(e) => updatePeserta(i, 'nim', e.target.value)} className="w-full bg-transparent" placeholder="NIM" /></td>
                  <td className="text-center align-middle">
                    <S2SignatureUpload value={p.signature_path} onChange={(v) => updatePeserta(i, 'signature_path', v)} label="Peserta" />
                  </td>
                  <td className="text-center">
                    {peserta.length > 1 && (
                      <button onClick={() => removePeserta(i)} className="no-print text-red-500 text-xs hover:text-red-700" title="Hapus baris">✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addPeserta} className="no-print mt-2 px-3 py-1 bg-gray-100 border rounded text-sm hover:bg-gray-200 font-sans">+ Tambah baris peserta</button>
        </div>

        <div>
          <h2 className="font-bold text-center mb-2">Daftar Hadir Mahasiswa Sebagai Audiens</h2>
          <table className="template-table text-sm">
            <thead>
              <tr><th className="w-8">NO</th><th>NAMA MAHASISWA</th><th className="w-28">NIM</th><th className="w-24">TANDA TANGAN</th><th className="w-16">KET</th></tr>
            </thead>
            <tbody>
              {audiens.map((a, i) => (
                <tr key={i}>
                  <td className="text-center">{i + 1}.</td>
                  <td><input value={a.name} onChange={(e) => updateAudiens(i, 'name', e.target.value)} className="w-full bg-transparent" placeholder="Nama" /></td>
                  <td><input value={a.nim} onChange={(e) => updateAudiens(i, 'nim', e.target.value)} className="w-full bg-transparent" placeholder="NIM" /></td>
                  <td className="text-center align-middle">
                    <S2SignatureUpload value={a.signature_path} onChange={(v) => updateAudiens(i, 'signature_path', v)} label="Audiens" />
                  </td>
                  <td className="text-center">
                    <button onClick={() => removeAudiens(i)} className="no-print text-red-500 text-xs hover:text-red-700" title="Hapus baris">✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={addAudiens} className="no-print mt-2 px-3 py-1 bg-gray-100 border rounded text-sm hover:bg-gray-200 font-sans">+ Tambah baris audiens</button>
        </div>
      </div>
    </div>
  )
}
