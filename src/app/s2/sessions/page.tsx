'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/components/AuthProvider'
import { S2_EXAM_TYPE_LABELS, S2_STATUS_LABELS } from '@/types/s2'

interface S2SessionListItem {
  id: string
  exam_type: string
  status: string
  student_name: string
  student_nim: string
  thesis_title: string
  specialization: string
  exam_date: string | null
  venue: string
  created_at: string
}

export default function S2SessionsPage() {
  const router = useRouter()
  const { profile, isDosen, isSuperadmin } = useAuth()
  const [sessions, setSessions] = useState<S2SessionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterType, setFilterType] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => {
    loadSessions()
  }, [])

  async function loadSessions() {
    setLoading(true)
    const { data, error } = await supabase
      .from('s2_sessions')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error loading S2 sessions:', error)
      setSessions([])
    } else {
      setSessions(data || [])
    }
    setLoading(false)
  }

  async function createSession(data: {
    student_name: string
    student_nim: string
    thesis_title: string
    specialization: string
    exam_date: string
    venue: string
    semester: string
    academic_year: string
  }) {
    const { data: result, error } = await supabase
      .from('s2_sessions')
      .insert({
        ...data,
        exam_type: 'proposal',
        status: 'draft',
        study_program: 'Kesehatan Masyarakat',
        degree_program: 'Program Magister',
        rubric_version: 'proposal-v1',
        created_by: profile?.id,
      })
      .select('id')
      .single()

    if (error) {
      alert('Gagal membuat sesi: ' + error.message)
      return
    }

    setShowCreate(false)
    router.push(`/s2/session/${result.id}`)
  }

  const filtered = sessions.filter((s) => {
    if (filterType !== 'all' && s.exam_type !== filterType) return false
    if (filterStatus !== 'all' && s.status !== filterStatus) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        s.student_name?.toLowerCase().includes(q) ||
        s.student_nim?.toLowerCase().includes(q) ||
        s.thesis_title?.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="max-w-5xl mx-auto p-4 font-serif">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Link href="/program" className="text-sm text-blue-700 hover:underline mb-2 inline-block">
              ← Kembali ke Pilih Program
            </Link>
            <h1 className="text-2xl font-bold">S2 Kesmas — Seminar Proposal Tesis</h1>
            <p className="text-sm text-gray-600">
              Program Studi Kesehatan Masyarakat Program Magister
            </p>
          </div>
          {isDosen && (
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="bg-green-900 text-white px-4 py-2 rounded-lg hover:bg-green-800 font-sans text-sm font-medium"
            >
              + Buat Sesi Baru
            </button>
          )}
        </div>

        {/* Create form */}
        {showCreate && (
          <CreateSessionForm onSubmit={createSession} onCancel={() => setShowCreate(false)} />
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-4 flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] border border-gray-300 rounded px-3 py-2 font-serif text-sm"
          placeholder="Cari nama, NIM, atau judul..."
        />
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 font-serif text-sm"
        >
          <option value="all">Semua Jenis</option>
          <option value="proposal">Seminar Proposal</option>
          <option value="hasil">Seminar Hasil</option>
          <option value="sidang">Sidang Tesis</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 font-serif text-sm"
        >
          <option value="all">Semua Status</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Terjadwal</option>
          <option value="in_progress">Berlangsung</option>
          <option value="completed">Selesai</option>
          <option value="cancelled">Dibatalkan</option>
        </select>
        {(search || filterType !== 'all' || filterStatus !== 'all') && (
          <button
            onClick={() => { setSearch(''); setFilterType('all'); setFilterStatus('all') }}
            className="text-sm text-gray-500 hover:text-gray-700 px-2"
          >
            ✕ Reset
          </button>
        )}
      </div>

      {/* Session list */}
      <div className="bg-white rounded-lg shadow-md p-6">
        {loading ? (
          <p className="text-gray-500 text-center py-8">Memuat...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">
              {sessions.length === 0
                ? 'Belum ada sesi S2. Buat sesi baru untuk memulai.'
                : 'Tidak ditemukan hasil untuk filter ini.'}
            </p>
            {isDosen && sessions.length === 0 && (
              <button
                onClick={() => setShowCreate(true)}
                className="bg-green-900 text-white px-4 py-2 rounded-lg hover:bg-green-800 font-sans text-sm font-medium"
              >
                + Buat Sesi Baru
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => (
              <div
                key={s.id}
                onClick={() => router.push(`/s2/session/${s.id}`)}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-green-50 cursor-pointer transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{s.student_name}</span>
                    <span className="text-gray-500 text-sm">({s.student_nim})</span>
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-0.5 rounded-full font-sans">
                      {S2_EXAM_TYPE_LABELS[s.exam_type as keyof typeof S2_EXAM_TYPE_LABELS] || s.exam_type}
                    </span>
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded-full font-sans">
                      {S2_STATUS_LABELS[s.status as keyof typeof S2_STATUS_LABELS] || s.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1 truncate">
                    {s.thesis_title || '—'}
                  </p>
                  {s.exam_date && (
                    <p className="text-xs text-gray-400 mt-1 font-sans">
                      {new Date(s.exam_date).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                      {s.venue ? ` • ${s.venue}` : ''}
                    </p>
                  )}
                </div>
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── CREATE SESSION FORM ─────────────────────────────────────
function CreateSessionForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: {
    student_name: string
    student_nim: string
    thesis_title: string
    specialization: string
    exam_date: string
    venue: string
    semester: string
    academic_year: string
  }) => void
  onCancel: () => void
}) {
  const [studentName, setStudentName] = useState('')
  const [studentNim, setStudentNim] = useState('')
  const [thesisTitle, setThesisTitle] = useState('')
  const [specialization, setSpecialization] = useState('')
  const [examDate, setExamDate] = useState('')
  const [venue, setVenue] = useState('305 Gedung A')
  const [semester, setSemester] = useState('Genap')
  const [academicYear, setAcademicYear] = useState('2025/2026')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!studentName.trim() || !studentNim.trim()) {
      alert('Nama dan NIM wajib diisi')
      return
    }
    onSubmit({
      student_name: studentName.trim(),
      student_nim: studentNim.trim(),
      thesis_title: thesisTitle.trim(),
      specialization: specialization.trim(),
      exam_date: examDate,
      venue: venue.trim(),
      semester: semester.trim(),
      academic_year: academicYear.trim(),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="border-t pt-4 mt-4 space-y-3">
      <h3 className="font-semibold text-lg">Buat Sesi Seminar Proposal Baru</h3>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Nama Mahasiswa *</label>
          <input
            value={studentName}
            onChange={(e) => setStudentName(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 font-serif"
            placeholder="Nama lengkap"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">NIM *</label>
          <input
            value={studentNim}
            onChange={(e) => setStudentNim(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 font-serif"
            placeholder="NIM"
            required
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Judul Proposal Tesis</label>
        <input
          value={thesisTitle}
          onChange={(e) => setThesisTitle(e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-2 font-serif"
          placeholder="Judul proposal tesis"
        />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Peminatan</label>
          <input
            value={specialization}
            onChange={(e) => setSpecialization(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 font-serif"
            placeholder="AKK / Epidemiologi / K3 / Kesling"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tanggal Ujian</label>
          <input
            type="date"
            value={examDate}
            onChange={(e) => setExamDate(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 font-serif"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tempat</label>
          <input
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 font-serif"
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Semester</label>
          <input
            value={semester}
            onChange={(e) => setSemester(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 font-serif"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tahun Akademik</label>
          <input
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 font-serif"
            placeholder="2025/2026"
          />
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          className="bg-green-900 text-white px-4 py-2 rounded hover:bg-green-800 font-sans text-sm font-medium"
        >
          Buat Sesi
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 font-sans text-sm font-medium"
        >
          Batal
        </button>
      </div>
    </form>
  )
}
