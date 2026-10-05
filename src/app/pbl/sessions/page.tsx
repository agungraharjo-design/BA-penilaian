'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/components/AuthProvider'
import { PBL_STATUS_LABELS } from '@/types/pbl1'
import type { PblGroup } from '@/types/pbl1'

export default function PblSessionsPage() {
  const router = useRouter()
  const { profile, isDosen, isSuperadmin } = useAuth()
  const [groups, setGroups] = useState<PblGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)

  useEffect(() => { loadGroups() }, [])

  async function loadGroups() {
    setLoading(true)
    const { data, error } = await supabase
      .from('pbl_groups')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) {
      console.error('Error loading PBL groups:', error)
      setGroups([])
    } else {
      // Only show PBL 1 groups (exclude PBL 2 groups which live on /pbl2/sessions)
      const rows = (data as PblGroup[]) || []
      setGroups(rows.filter((g) => !(g.code?.toUpperCase().startsWith('PBL2') || g.title?.toUpperCase().includes('PBL 2'))))
    }
    setLoading(false)
  }

  async function createGroup(data: {
    code: string
    name: string
    field_location: string
    semester: string
    academic_year: string
    title: string
  }) {
    const { data: result, error } = await supabase
      .from('pbl_groups')
      .insert({ ...data, status: 'draft', blueprint_version: 'pbl1-rps-v1', created_by: profile?.id })
      .select('id')
      .single()
    if (error) {
      alert('Gagal membuat kelompok: ' + error.message)
      return
    }
    setShowCreate(false)
    router.push(`/pbl/session/${result.id}`)
  }

  const filtered = groups.filter((g) => {
    if (filterStatus !== 'all' && g.status !== filterStatus) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        g.name?.toLowerCase().includes(q) ||
        g.code?.toLowerCase().includes(q) ||
        g.field_location?.toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <div className="max-w-5xl mx-auto p-4 font-serif">
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <Link href="/program" className="text-sm text-blue-700 hover:underline mb-2 inline-block">
              ← Kembali ke Pilih Program
            </Link>
            <h1 className="text-2xl font-bold">PBL 1 — Pengalaman Belajar Lapangan</h1>
            <p className="text-sm text-gray-600">
              Program Studi Kesehatan Masyarakat — Penilaian terintegrasi berbasis RPS Final
            </p>
          </div>
          {isDosen && (
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 font-sans text-sm font-medium"
            >
              + Buat Kelompok Baru
            </button>
          )}
        </div>

        {showCreate && <CreateGroupForm onSubmit={createGroup} onCancel={() => setShowCreate(false)} />}
      </div>

      <div className="bg-white rounded-lg shadow-md p-4 mb-4 flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[200px] border border-gray-300 rounded px-3 py-2 font-serif text-sm"
          placeholder="Cari nama kelompok, kode, lokasi..."
        />
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
        {(search || filterStatus !== 'all') && (
          <button onClick={() => { setSearch(''); setFilterStatus('all') }} className="text-sm text-gray-500 hover:text-gray-700 px-2">
            ✕ Reset
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        {loading ? (
          <p className="text-gray-500 text-center py-8">Memuat...</p>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-500 mb-4">
              {groups.length === 0 ? 'Belum ada kelompok PBL. Buat kelompok baru untuk memulai.' : 'Tidak ditemukan hasil untuk filter ini.'}
            </p>
            {isDosen && groups.length === 0 && (
              <button
                onClick={() => setShowCreate(true)}
                className="bg-red-900 text-white px-4 py-2 rounded-lg hover:bg-red-800 font-sans text-sm font-medium"
              >
                + Buat Kelompok Baru
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((g) => (
              <div
                key={g.id}
                onClick={() => router.push(`/pbl/session/${g.id}`)}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-red-50 cursor-pointer transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{g.name}</span>
                    {g.code && <span className="text-gray-500 text-sm">({g.code})</span>}
                    <span className="text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-sans">
                      {PBL_STATUS_LABELS[g.status as keyof typeof PBL_STATUS_LABELS] || g.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1 truncate">
                    {g.field_location || '—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-1 font-sans">
                    {g.academic_year || ''} • {g.semester || ''} • {g.title || '—'}
                  </p>
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

function CreateGroupForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: {
    code: string; name: string; field_location: string;
    semester: string; academic_year: string; title: string;
  }) => void
  onCancel: () => void
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [fieldLocation, setFieldLocation] = useState('')
  const [semester, setSemester] = useState('Genap')
  const [academicYear, setAcademicYear] = useState('2025/2026')
  const [title, setTitle] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!code.trim() || !name.trim()) {
      alert('Kode dan Nama kelompok wajib diisi')
      return
    }
    onSubmit({
      code: code.trim(),
      name: name.trim(),
      field_location: fieldLocation.trim(),
      semester: semester.trim(),
      academic_year: academicYear.trim(),
      title: title.trim(),
    })
  }

  return (
    <form onSubmit={handleSubmit} className="border-t pt-4 mt-4 space-y-3">
      <h3 className="font-semibold text-lg">Buat Kelompok PBL 1 Baru</h3>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Kode Kelompok *</label>
          <input value={code} onChange={(e) => setCode(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 font-serif" placeholder="PBL1-G01" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Nama Kelompok *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 font-serif" placeholder="Kelompok 1" required />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Tahun Akademik</label>
          <input value={academicYear} onChange={(e) => setAcademicYear(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 font-serif" placeholder="2025/2026" />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-sm font-medium mb-1">Lokasi Lapangan</label>
          <input value={fieldLocation} onChange={(e) => setFieldLocation(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 font-serif" placeholder="Puskesmas / Posyandu" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Semester</label>
          <input value={semester} onChange={(e) => setSemester(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 font-serif" />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Judul/Agenda Seminar</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-gray-300 rounded px-3 py-2 font-serif" placeholder="Seminar PBL 1" />
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button type="submit" className="bg-red-900 text-white px-4 py-2 rounded hover:bg-red-800 font-sans text-sm font-medium">
          Buat Kelompok
        </button>
        <button type="button" onClick={onCancel} className="bg-gray-200 text-gray-700 px-4 py-2 rounded hover:bg-gray-300 font-sans text-sm font-medium">
          Batal
        </button>
      </div>
    </form>
  )
}