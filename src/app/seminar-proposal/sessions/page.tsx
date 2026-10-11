'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/components/AuthProvider'
import { SP_STATUS_LABELS, SP_ROLE_LABELS } from '@/types/seminarproposa'
import type { SpAssessorRole, PblGroup, PblAssessor } from '@/types/seminarproposa'

// List Seminar Proposal Skripsi.
// Reads ONLY pbl_groups rows coded SP-xx, so PBL 1 / PBL 2 never appear here.
export default function SpSessionsPage() {
  const router = useRouter()
  const { isDosen } = useAuth()
  const [groups, setGroups] = useState<PblGroup[]>([])
  const [assessors, setAssessors] = useState<PblAssessor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPeminatan, setFilterPeminatan] = useState('all')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('pbl_groups')
      .select('*')
      .like('code', 'SP-%')
      .order('code', { ascending: true })
    const rows = (data as PblGroup[]) || []
    setGroups(rows)
    if (rows.length) {
      const { data: asr } = await supabase
        .from('pbl_assessors')
        .select('*')
        .in('group_id', rows.map((g) => g.id))
      setAssessors((asr as PblAssessor[]) || [])
    }
    setLoading(false)
  }

  const peminatanList = useMemo(() => {
    const s = new Set(groups.map((g) => g.field_location).filter(Boolean))
    return Array.from(s).sort()
  }, [groups])

  const asrOf = (gid: string, role: SpAssessorRole) =>
    assessors.find((a) => a.group_id === gid && a.assessor_role === role)?.display_name || '—'

  const filtered = groups.filter((g) => {
    if (filterStatus !== 'all' && g.status !== filterStatus) return false
    if (filterPeminatan !== 'all' && g.field_location !== filterPeminatan) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      return (
        g.name?.toLowerCase().includes(q) ||
        g.code?.toLowerCase().includes(q) ||
        g.title?.toLowerCase().includes(q) ||
        assessors.some((a) => a.group_id === g.id && a.display_name?.toLowerCase().includes(q))
      )
    }
    return true
  })

  return (
    <div className="max-w-6xl mx-auto p-4 font-serif">
      <div className="bg-white rounded-lg shadow-md p-6 mb-6">
        <Link href="/program" className="text-sm text-blue-700 hover:underline mb-2 inline-block">
          ← Kembali ke Pilih Program
        </Link>
        <h1 className="text-2xl font-bold">Seminar Proposal Skripsi</h1>
        <p className="text-sm text-gray-600">
          Program Studi Kesehatan Masyarakat — Semester Ganjil T.A. 2026/2027
        </p>
        <p className="text-xs text-gray-400 mt-1 font-sans">
          {groups.length} mahasiswa • Penilaian oleh Penguji Utama, Penguji Pendamping &amp; Anggota Penguji
        </p>
      </div>

      <div className="bg-white rounded-lg shadow-md p-4 mb-4 flex flex-wrap gap-3 items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[220px] border border-gray-300 rounded px-3 py-2 font-serif text-sm"
          placeholder="Cari nama, NIM, judul, atau nama penguji..."
        />
        <select
          value={filterPeminatan}
          onChange={(e) => setFilterPeminatan(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 font-serif text-sm"
        >
          <option value="all">Semua Peminatan</option>
          {peminatanList.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="border border-gray-300 rounded px-3 py-2 font-serif text-sm"
        >
          <option value="all">Semua Status</option>
          {Object.entries(SP_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        {(search || filterStatus !== 'all' || filterPeminatan !== 'all') && (
          <button
            onClick={() => { setSearch(''); setFilterStatus('all'); setFilterPeminatan('all') }}
            className="text-sm text-gray-500 hover:text-gray-700 px-2"
          >
            ✕ Reset
          </button>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6">
        {loading ? (
          <p className="text-gray-500 text-center py-8">Memuat...</p>
        ) : filtered.length === 0 ? (
          <p className="text-gray-500 text-center py-8">
            {groups.length === 0
              ? 'Belum ada jadwal Seminar Proposal Skripsi.'
              : 'Tidak ditemukan hasil untuk filter ini.'}
          </p>
        ) : (
          <div className="space-y-2">
            {filtered.map((g) => (
              <div
                key={g.id}
                onClick={() => router.push(`/seminar-proposal/session/${g.id}`)}
                className="p-4 border rounded-lg hover:bg-emerald-50 cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold">{g.name}</span>
                      <span className="text-gray-500 text-sm font-sans">({g.code})</span>
                      <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-sans">
                        {SP_STATUS_LABELS[g.status] || g.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1 font-sans">{g.field_location || '—'}</p>
                    <p className="text-sm text-gray-700 mt-1 line-clamp-2">{g.title || '—'}</p>
                    <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-1 text-[11px] text-gray-500 font-sans">
                      {(['penguji_1', 'penguji_2', 'pembimbing_1'] as SpAssessorRole[]).map((r) => (
                        <div key={r}>
                          <span className="text-gray-400">{SP_ROLE_LABELS[r].split(' (')[0]}:</span>{' '}
                          {asrOf(g.id, r)}
                        </div>
                      ))}
                    </div>
                  </div>
                  <svg className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {!isDosen && (
        <p className="text-xs text-gray-400 mt-3 text-center font-sans">
          Anda dapat melihat jadwal; pengisian penilaian hanya untuk dosen.
        </p>
      )}
    </div>
  )
}
