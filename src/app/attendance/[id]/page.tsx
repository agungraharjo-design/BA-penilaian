'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams } from 'next/navigation'

interface Session {
  id: string
  nama: string
  nim: string
  peminatan: string
  hari_tanggal: string
  semester: string
  ta: string
  peserta_hadir: { nama: string; nim: string }[]
  audience_hadir: { nama: string; nim: string }[]
}

export default function PublicAttendancePage() {
  const params = useParams()
  const sessionId = params.id as string
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [peserta, setPeserta] = useState<{ nama: string; nim: string }[]>([])
  const [audience, setAudience] = useState<{ nama: string; nim: string }[]>([])
  const saveTimer = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!sessionId) return
    loadSession()
  }, [sessionId])

  async function loadSession() {
    try {
      const res = await fetch(`/api/attendance?id=${sessionId}`)
      if (!res.ok) {
        setError('Sidang tidak ditemukan')
        setLoading(false)
        return
      }
      const data = await res.json()
      setSession(data)
      setPeserta(data.peserta_hadir || [{ nama: '', nim: '' }])
      setAudience(data.audience_hadir || [])
    } catch {
      setError('Gagal memuat data')
    }
    setLoading(false)
  }

  async function saveAttendance() {
    setSaving(true)
    try {
      const res = await fetch('/api/attendance', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, peserta_hadir: peserta, audience_hadir: audience }),
      })
      if (res.ok) {
        setSaved(true)
        setTimeout(() => setSaved(false), 3000)
      }
    } catch (err) {
      console.error('Save error:', err)
    }
    setSaving(false)
  }

  const debouncedSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(saveAttendance, 800)
  }

  const updatePeserta = (idx: number, field: string, value: string) => {
    const newP = [...peserta]
    newP[idx] = { ...newP[idx], [field]: value }
    setPeserta(newP)
    debouncedSave()
  }

  const updateAudience = (idx: number, field: string, value: string) => {
    const newA = [...audience]
    newA[idx] = { ...newA[idx], [field]: value }
    setAudience(newA)
    debouncedSave()
  }

  const addPeserta = () => {
    setPeserta([...peserta, { nama: '', nim: '' }])
  }

  const addAudience = () => {
    setAudience([...audience, { nama: '', nim: '' }])
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-gray-500 font-serif text-lg">Memuat...</div>
  if (error) return <div className="flex items-center justify-center min-h-[60vh] text-red-500 font-serif text-lg">{error}</div>
  if (!session) return null

  return (
    <div className="max-w-4xl mx-auto p-4 font-serif">
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="text-center border-b-2 border-black pb-4 mb-6">
          <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" className="mx-auto max-h-16 mb-3" />
          <h1 className="text-xl font-bold uppercase">Daftar Hadir Sidang Skripsi</h1>
          <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
          <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
          <p className="text-sm font-bold mt-1">SEMESTER {session.semester} T.A. {session.ta}</p>
        </div>

        <table className="w-full text-sm mb-6">
          <tbody>
            <tr><td className="w-36 font-semibold">Nama Mahasiswa</td><td>:</td><td>{session.nama}</td></tr>
            <tr><td>NIM</td><td>:</td><td>{session.nim}</td></tr>
            <tr><td>Tanggal Ujian</td><td>:</td><td>{session.hari_tanggal}</td></tr>
            <tr><td>Peminatan</td><td>:</td><td>{session.peminatan || '-'}</td></tr>
          </tbody>
        </table>

        <div className="flex items-center justify-between mb-4">
          <p className="text-xs text-gray-500">Isi data diri Anda pada tabel di bawah, perubahan tersimpan otomatis.</p>
          {saved && <span className="text-xs text-green-700 font-semibold">Tersimpan ✓</span>}
          {saving && <span className="text-xs text-yellow-700 font-semibold">Menyimpan...</span>}
        </div>

        <div className="mb-8">
          <h2 className="font-bold text-center mb-2">Daftar Hadir Peserta Sidang Skripsi</h2>
          <table className="template-table text-sm">
            <thead>
              <tr><th className="w-8">NO</th><th>NAMA PESERTA</th><th className="w-28">NIM</th><th className="w-24">TANDA TANGAN</th><th className="w-16">KET</th></tr>
            </thead>
            <tbody>
              {peserta.map((p, i) => (
                <tr key={i}>
                  <td className="text-center">{i + 1}.</td>
                  <td><input value={p.nama} onChange={(e) => updatePeserta(i, 'nama', e.target.value)} className="w-full bg-transparent" placeholder="Nama" /></td>
                  <td><input value={p.nim} onChange={(e) => updatePeserta(i, 'nim', e.target.value)} className="w-full bg-transparent" placeholder="NIM" /></td>
                  <td className="h-8"></td>
                  <td></td>
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
              {audience.map((a, i) => (
                <tr key={i}>
                  <td className="text-center">{i + 1}.</td>
                  <td><input value={a.nama} onChange={(e) => updateAudience(i, 'nama', e.target.value)} className="w-full bg-transparent" placeholder="Nama" /></td>
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
    </div>
  )
}
