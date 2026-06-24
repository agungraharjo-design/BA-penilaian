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
  peserta_hadir: { nama: string; nim: string; ttd?: string }[]
  audience_hadir: { nama: string; nim: string; ttd?: string }[]
}

function SignatureUpload({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
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
        <img src={value} alt="Tanda Tangan" className="max-h-14 max-w-28 object-contain" />
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

export default function PublicAttendancePage() {
  const params = useParams()
  const sessionId = params.id as string
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const [peserta, setPeserta] = useState<{ nama: string; nim: string; ttd?: string }[]>([])
  const [audience, setAudience] = useState<{ nama: string; nim: string; ttd?: string }[]>([])
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
      setPeserta(data.peserta_hadir || [{ nama: data.nama, nim: data.nim }])
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

  const removePeserta = (idx: number) => {
    setPeserta(peserta.filter((_, i) => i !== idx))
    debouncedSave()
  }

  const addAudience = () => {
    setAudience([...audience, { nama: '', nim: '' }])
  }

  const removeAudience = (idx: number) => {
    setAudience(audience.filter((_, i) => i !== idx))
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
                  <td className="text-center align-middle">
                    <SignatureUpload value={p.ttd} onChange={(v) => updatePeserta(i, 'ttd', v)} />
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
              {audience.map((a, i) => (
                <tr key={i}>
                  <td className="text-center">{i + 1}.</td>
                  <td><input value={a.nama} onChange={(e) => updateAudience(i, 'nama', e.target.value)} className="w-full bg-transparent" placeholder="Nama" /></td>
                  <td><input value={a.nim} onChange={(e) => updateAudience(i, 'nim', e.target.value)} className="w-full bg-transparent" placeholder="NIM" /></td>
                  <td className="text-center align-middle">
                    <SignatureUpload value={a.ttd} onChange={(v) => updateAudience(i, 'ttd', v)} />
                  </td>
                  <td className="text-center">
                    <button onClick={() => removeAudience(i)} className="no-print text-red-500 text-xs hover:text-red-700" title="Hapus baris">✕</button>
                  </td>
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
