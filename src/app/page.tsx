'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Session } from '@/types'
import { generateId, getTodayFormatted } from '@/lib/utils'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/components/AuthProvider'

export default function Home() {
  const router = useRouter()
  const { isDosen } = useAuth()
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [nama, setNama] = useState('')
  const [nim, setNim] = useState('')
  const [defaultSemester, setDefaultSemester] = useState('Genap')
  const [defaultTa, setDefaultTa] = useState('2025/2026')

  useEffect(() => {
    loadSessions()
  }, [])

  async function loadSessions() {
    setLoading(true)
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setSessions(data as Session[])
    setLoading(false)
  }

  async function createNewSession() {
    if (!nama.trim() || !nim.trim()) {
      alert('Masukkan Nama dan NIM mahasiswa')
      return
    }
    const id = generateId()
    const session: Session = {
      id,
      nama: nama.trim(),
      nim: nim.trim(),
      judul_skripsi: '',
      peminatan: '',
      pembimbing: '',
      hari_tanggal: getTodayFormatted(),
      waktu: '09.00',
      tempat: '305 Gedung A',
      semester: defaultSemester,
      ta: defaultTa,
      penguji1: '',
      nip_penguji1: '',
      penguji2: '',
      nip_penguji2: '',
      penguji3: '',
      nip_penguji3: '',
      decision: 'lulus_perbaikan',
      catatan: '',
      koordinator: 'Dr. Suparni, S.T., MKKK.',
      nip_koordinator: '197705072024212008',
      tanggal_ba: getTodayFormatted(),
      skor_penguji: [
        [null, null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null, null, null],
      ],
      rekap_entries: [{ nama: nama.trim(), nim: nim.trim(), nilai_i: null, nilai_ii: null, nilai_iii: null }],
      peserta_hadir: [{ nama: nama.trim(), nim: nim.trim() }],
      audience_hadir: [],
    }
    const { error } = await supabase.from('sessions').insert(session)
    if (!error) {
      router.push(`/session/${id}`)
    } else {
      alert('Gagal membuat session: ' + error.message)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6 font-serif">
      <div className="bg-white rounded-lg shadow-md p-6 mb-8">
        <h1 className="text-2xl font-bold text-center mb-2">Sistem Informasi Berita Acara & Penilaian Sidang Skripsi</h1>
        <p className="text-center text-sm text-gray-600 mb-6">
          Program Studi Kesehatan Masyarakat Program Sarjana<br />
          Fakultas Ilmu Kesehatan UPN "Veteran" Jakarta<br />
          Semester <input value={defaultSemester} onChange={(e) => setDefaultSemester(e.target.value)} className="bg-transparent border-b border-gray-400 w-20 text-center text-sm font-bold" /> T.A. <input value={defaultTa} onChange={(e) => setDefaultTa(e.target.value)} className="bg-transparent border-b border-gray-400 w-28 text-center text-sm font-bold" />
        </p>

        {isDosen && (
          <div className="border-t pt-6">
            <h2 className="text-lg font-semibold mb-4">Buat Sidang Baru</h2>
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-sm font-medium mb-1">Nama Mahasiswa</label>
                <input
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 font-serif"
                  placeholder="Nama lengkap"
                />
              </div>
              <div className="w-48">
                <label className="block text-sm font-medium mb-1">NIM</label>
                <input
                  value={nim}
                  onChange={(e) => setNim(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 font-serif"
                  placeholder="NIM"
                />
              </div>
              <button
                onClick={createNewSession}
                className="bg-blue-900 text-white px-6 py-2 rounded hover:bg-blue-800 font-sans text-sm font-medium"
              >
                + Buat Sidang Baru
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold mb-4">Daftar Sidang</h2>
        {loading ? (
          <p className="text-gray-500 text-center py-8">Memuat...</p>
        ) : sessions.length === 0 ? (
          <p className="text-gray-500 text-center py-8">Belum ada data sidang. Buat sidang baru untuk memulai.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => router.push(`/session/${s.id}`)}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-blue-50 cursor-pointer transition-colors"
              >
                <div>
                  <span className="font-semibold">{s.nama}</span>
                  <span className="text-gray-500 ml-3">({s.nim})</span>
                  <span className="text-gray-400 text-sm ml-4">
                    {s.judul_skripsi ? s.judul_skripsi.substring(0, 60) + (s.judul_skripsi.length > 60 ? '...' : '') : '—'}
                  </span>
                </div>
                <span className="text-xs text-gray-400">{new Date(s.created_at || '').toLocaleDateString('id-ID')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
