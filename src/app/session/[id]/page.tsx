'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/components/AuthProvider'
import { isDosenEmail } from '@/lib/dosen'
import { S2SignatureUpload } from '@/app/components/common/S2SignatureUpload'
import { getSidangBlueprint } from '@/lib/sidang/repositories'
import { calcCriterionPoints, calcRawFromCriterionPoints, calcRerata } from '@/lib/sidang/calculations'
import {
  SIDANG_COMPONENT_CODE, SIDANG_BLUEPRINT_VERSION,
  SIDANG_EXAMINER_ROLES, SIDANG_ROLE_LABELS, SIDANG_ROLE_SHORT,
  SIDANG_PEMBIMBING_LABEL, SIDANG_STATUS_LABELS, sidangGrade, SIDANG_BAND_LEVELS,
} from '@/types/sidang'
import type {
  SidangTab, SidangExaminerRole, SidangBlueprint, SidangRubricCriterion,
  PblGroup, PblGroupMember, PblAssessor, PblAssessmentInstance,
  PblAssessmentScore, PblRubricRating,
} from '@/types/sidang'

type CriterionWithLevels = SidangRubricCriterion & {
  levels: { value: number; label: string; descriptor: string }[]
}

export default function SidangSessionPage() {
  const params = useParams<{ id: string }>()
  const groupId = params.id
  const { profile, isDosen, isSuperadmin } = useAuth()

  const [blueprint, setBlueprint] = useState<SidangBlueprint | null>(null)
  const [group, setGroup] = useState<PblGroup | null>(null)
  const [members, setMembers] = useState<PblGroupMember[]>([])
  const [assessors, setAssessors] = useState<PblAssessor[]>([])
  const [instances, setInstances] = useState<PblAssessmentInstance[]>([])
  const [scores, setScores] = useState<PblAssessmentScore[]>([])
  const [ratings, setRatings] = useState<PblRubricRating[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<SidangTab>('berita-acara')
  const [dialog, setDialog] = useState<{ role: SidangExaminerRole; label: string } | null>(null)
  const [sync, setSync] = useState<'live' | 'saving' | 'offline'>('live')

  const canEdit = !!isDosen || !!isSuperadmin

  // ── Examiner tab access — same matching logic as Seminar Proposal ─────────
  const whitelistMatch = profile?.email ? isDosenEmail(profile.email) : null
  const canonicalName = whitelistMatch?.nama || ''
  const dbFullName = profile?.full_name || ''
  const emailPrefix = profile?.email?.split('@')[0] || ''
  const allUserNames = [canonicalName, dbFullName, emailPrefix].filter(Boolean)

  const matchPenguji = (pengujiName: string) => {
    if (allUserNames.length === 0 || !pengujiName) return false
    const normalize = (s: string) => s.toLowerCase().replace(/[,.\-]/g, '').replace(/\s+/g, ' ').trim()
    const b = normalize(pengujiName)
    for (const name of allUserNames) {
      const a = normalize(name)
      if (a === b) return true
      if (a.includes(b) || b.includes(a)) return true
      const wordsA = a.split(' ').filter((w) => w.length > 2)
      const wordsB = b.split(' ').filter((w) => w.length > 2)
      if (wordsA.length >= 2 && wordsB.length >= 2 && wordsA[0] === wordsB[0] && wordsA[1] === wordsB[1]) return true
    }
    return false
  }

  let allowedRoles: SidangExaminerRole[] | null = null // null = no examiner form access
  if (!isSuperadmin && isDosen) {
    const matched = SIDANG_EXAMINER_ROLES.filter((role) =>
      matchPenguji(assessors.find((a) => a.assessor_role === role)?.display_name || ''))
    if (matched.length > 0) allowedRoles = matched
  }

  const isTabAllowed = (key: SidangTab) => {
    if (isSuperadmin) return true
    if (SIDANG_EXAMINER_ROLES.includes(key as SidangExaminerRole)) {
      if (!isDosen) return false
      return allowedRoles !== null && allowedRoles.includes(key as SidangExaminerRole)
    }
    return true
  }

  // Bounce away from an examiner tab that is no longer visible (e.g. on load).
  useEffect(() => {
    if (loading || !group) return
    if (SIDANG_EXAMINER_ROLES.includes(activeTab as SidangExaminerRole) && !isTabAllowed(activeTab)) {
      setActiveTab('berita-acara')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, group, activeTab, assessors, isDosen, isSuperadmin, profile])

  const groupRef = useRef<PblGroup | null>(null)
  const dirty = useRef<Set<string>>(new Set())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saving = useRef(false)

  const member = members[0] || null

  useEffect(() => { load(); return () => { if (timer.current) clearTimeout(timer.current) } }, [groupId])

  async function load() {
    setLoading(true)
    const bp = await getSidangBlueprint()
    setBlueprint(bp)
    const [g, m, a, i] = await Promise.all([
      supabase.from('pbl_groups').select('*').eq('id', groupId).single(),
      supabase.from('pbl_group_members').select('*').eq('group_id', groupId).order('name'),
      supabase.from('pbl_assessors').select('*').eq('group_id', groupId).order('sequence_no'),
      supabase.from('pbl_assessment_instances').select('*').eq('group_id', groupId),
    ])
    if (g.error || !g.data) { setLoading(false); return }
    const gr = g.data as PblGroup
    setGroup(gr); groupRef.current = gr
    setMembers((m.data as PblGroupMember[]) || [])
    setAssessors((a.data as PblAssessor[]) || [])
    const inst = (i.data as PblAssessmentInstance[]) || []
    setInstances(inst)
    if (inst.length) {
      const sc = await supabase.from('pbl_assessment_scores').select('*').in('instance_id', inst.map((x) => x.id))
      const scr = (sc.data as PblAssessmentScore[]) || []
      setScores(scr)
      if (scr.length) {
        const rt = await supabase.from('pbl_rubric_ratings').select('*').in('assessment_score_id', scr.map((x) => x.id))
        setRatings((rt.data as PblRubricRating[]) || [])
      }
    }
    setLoading(false)
  }

  const saveNow = useCallback(async () => {
    if (saving.current) return
    const cur = groupRef.current
    if (!cur || dirty.current.size === 0) return
    saving.current = true
    setSync('saving')
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() }
    dirty.current.forEach((f) => { (payload as Record<string, unknown>)[f] = (cur as unknown as Record<string, unknown>)[f] })
    const { error } = await supabase.from('pbl_groups').update(payload).eq('id', cur.id)
    if (!error) dirty.current.clear()
    saving.current = false
    setSync(error ? 'offline' : 'live')
  }, [])

  const updateField = useCallback((f: keyof PblGroup, v: unknown) => {
    setGroup((prev) => {
      if (!prev) return prev
      const next = { ...prev, [f]: v } as PblGroup
      groupRef.current = next
      dirty.current.add(f as string)
      return next
    })
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void saveNow() }, 800)
  }, [saveNow])

  async function saveAssessor(role: SidangExaminerRole | 'pembimbing_1', display_name: string, nip: string) {
    const existing = assessors.find((a) => a.assessor_role === role)
    const payload = { display_name, nip, group_id: groupId, assessor_role: role }
    if (existing) {
      const { error } = await supabase.from('pbl_assessors').update(payload).eq('id', existing.id)
      if (error) { alert('Gagal menyimpan: ' + error.message); return }
    } else {
      const { error } = await supabase.from('pbl_assessors').insert(payload)
      if (error) { alert('Gagal menambah: ' + error.message); return }
    }
    const { data } = await supabase.from('pbl_assessors').select('*').eq('group_id', groupId).order('sequence_no')
    setAssessors((data as PblAssessor[]) || [])
  }

  async function saveAssessorSignature(id: string, path: string) {
    await supabase.from('pbl_assessors').update({ signature_path: path }).eq('id', id)
    const { data } = await supabase.from('pbl_assessors').select('*').eq('group_id', groupId).order('sequence_no')
    setAssessors((data as PblAssessor[]) || [])
  }

  async function updateMemberNim(nim: string) {
    if (!member) return
    const { error } = await supabase.from('pbl_group_members')
      .update({ nim, updated_at: new Date().toISOString() }).eq('id', member.id)
    if (error) { alert('Gagal menyimpan NIM: ' + error.message); return }
    const { data } = await supabase.from('pbl_group_members').select('*').eq('group_id', groupId).order('name')
    setMembers((data as PblGroupMember[]) || [])
  }

  const criteria = useMemo<CriterionWithLevels[]>(() => {
    if (!blueprint) return []
    const byId = new Map<string, { value: number; label: string; descriptor: string }[]>()
    blueprint.descriptors.forEach((d) => {
      const arr = byId.get(d.criterion_id) || []
      arr.push({ value: Number(d.level_value), label: d.level_label, descriptor: d.descriptor_text })
      byId.set(d.criterion_id, arr)
    })
    return blueprint.criteria.filter((c) => c.active).map((c) => ({
      ...c,
      levels: (byId.get(c.id) || []).sort((a, b) => b.value - a.value),
    })) as CriterionWithLevels[]
  }, [blueprint])

  const instanceFor = useCallback((role: SidangExaminerRole) =>
    instances.find((i) => i.assessor_role === role) || null, [instances])

  const scoreFor = useCallback((instId: string | null) => {
    if (!instId) return null
    return scores.find((s) => s.instance_id === instId) || null
  }, [scores])

  const rawOf = useCallback((scoreId: string | null) => {
    if (!scoreId) return null
    const pts = ratings.filter((r) => r.assessment_score_id === scoreId).map((r) => r.criterion_points)
    return calcRawFromCriterionPoints(pts)
  }, [ratings])

  const roleRaw = useCallback((role: SidangExaminerRole): number | null =>
    rawOf(scoreFor(instanceFor(role)?.id ?? null)?.id ?? null), [instanceFor, scoreFor, rawOf])

  // Per-examiner rating map, so Preview can render the three full forms.
  const ratingsFor = useCallback((role: SidangExaminerRole) => {
    const inst = instanceFor(role)
    const sc = inst ? scoreFor(inst.id) : null
    if (!sc) return {}
    const map: Record<string, { level: number | null; points: number | null }> = {}
    ratings.filter((r) => r.assessment_score_id === sc.id).forEach((r) => {
      map[r.criterion_id] = { level: r.level_value, points: r.criterion_points }
    })
    return map
  }, [instanceFor, scoreFor, ratings])

  async function saveRubric(role: SidangExaminerRole, drafts: { criterionId: string; level: number | null; note: string }[]) {
    setSync('saving')
    let inst = instanceFor(role)
    if (!inst) {
      const { data, error } = await supabase.from('pbl_assessment_instances').insert({
        group_id: groupId, component_code: SIDANG_COMPONENT_CODE,
        rubric_version: SIDANG_BLUEPRINT_VERSION, assessor_role: role, status: 'DRAFT',
      }).select('*').single()
      if (error) { setSync('offline'); return false }
      inst = data as PblAssessmentInstance
      setInstances((p) => [...p, inst!])
    }
    let scoreRow = scoreFor(inst.id)
    if (!scoreRow) {
      // Re-fetch first: another tab may have created the shared row after load
      const { data: existingRows } = await supabase.from('pbl_assessment_scores')
        .select('*').eq('instance_id', inst.id).is('student_id', null).limit(1)
      const existing = ((existingRows as PblAssessmentScore[]) || [])[0]
      if (existing) {
        scoreRow = existing
        setScores((p) => (p.some((x) => x.id === existing.id) ? p : [...p, existing]))
      } else {
        const { data, error } = await supabase.from('pbl_assessment_scores').insert({
          instance_id: inst.id, student_id: null, entered_by: profile?.id,
          score_source: 'RUBRIC_CALCULATED',
        }).select('*').single()
        if (error) { setSync('offline'); return false }
        scoreRow = data as PblAssessmentScore
        setScores((p) => [...p, scoreRow!])
      }
    }
    let ok = true
    for (const d of drafts) {
      const crit = criteria.find((c) => c.id === d.criterionId)
      if (d.level === null) {
        const { error } = await supabase.from('pbl_rubric_ratings')
          .delete().eq('assessment_score_id', scoreRow.id).eq('criterion_id', d.criterionId)
        if (error) ok = false
        continue
      }
      const points = crit ? calcCriterionPoints(d.level, Number(crit.internal_weight)) : null
      const descriptor = crit?.levels.find((l) => l.value === d.level)?.descriptor || null
      const { error } = await supabase.from('pbl_rubric_ratings').upsert({
        assessment_score_id: scoreRow.id, criterion_id: d.criterionId,
        level_value: d.level, criterion_points: points,
        evidence_note: d.note || null, selected_descriptor_snapshot: descriptor,
      }, { onConflict: 'assessment_score_id,criterion_id' })
      if (error) ok = false
    }
    const { data: fresh } = await supabase.from('pbl_rubric_ratings')
      .select('*').eq('assessment_score_id', scoreRow.id)
    const freshRatings = (fresh as PblRubricRating[]) || []
    setRatings((p) => p.filter((r) => r.assessment_score_id !== scoreRow!.id).concat(freshRatings))
    const raw = calcRawFromCriterionPoints(freshRatings.map((r) => r.criterion_points))
    const { error: rawErr } = await supabase.from('pbl_assessment_scores')
      .update({ calculated_raw_score: raw, final_raw_score: raw, updated_at: new Date().toISOString() })
      .eq('id', scoreRow.id)
    if (!rawErr) {
      setScores((p) => p.map((s) => s.id === scoreRow!.id
        ? { ...s, calculated_raw_score: raw, final_raw_score: raw } : s))
    }
    setSync(ok && !rawErr ? 'live' : 'offline')
    return ok && !rawErr
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-gray-500 font-serif text-lg">Memuat...</div>
  if (!group) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-indigo-500 font-serif text-lg gap-4">
      <p>Sidang skripsi tidak ditemukan</p>
      <Link href="/session" className="text-blue-700 underline">← Kembali ke daftar</Link>
    </div>
  )

  const rerata = calcRerata(SIDANG_EXAMINER_ROLES.map((r) => roleRaw(r)))
  const grade = sidangGrade(rerata)

  const allTabs: { key: SidangTab; label: string }[] = [
    { key: 'berita-acara', label: 'Berita Acara' },
    ...SIDANG_EXAMINER_ROLES.map((r) => ({ key: r as SidangTab, label: SIDANG_ROLE_SHORT[r] })),
    { key: 'rekap', label: 'Rekap' },
    { key: 'preview', label: 'Preview & PDF' },
  ]
  const tabs = allTabs.filter((t) => isTabAllowed(t.key))

  return (
    <div className="max-w-6xl mx-auto p-4 font-serif">
      <div className={`no-print sync-indicator ${sync === 'live' ? 'bg-green-100 text-green-800' : sync === 'saving' ? 'bg-yellow-100 text-yellow-800' : 'bg-purple-100 text-purple-800'}`}>
        <span className={`w-2 h-2 rounded-full ${sync === 'live' ? 'bg-green-500' : sync === 'saving' ? 'bg-yellow-500' : 'bg-purple-500'}`} />
        {sync === 'live' ? 'Tersimpan' : sync === 'saving' ? 'Menyimpan...' : 'Offline'}
      </div>

      <div className="bg-white rounded-lg shadow-md p-4 mb-4 no-print">
        <Link href="/session" className="text-sm text-blue-700 hover:underline">← Kembali ke daftar</Link>
        <h1 className="text-xl font-bold mt-1">{group.name} <span className="text-gray-500 text-base">({group.code})</span></h1>
        <p className="text-sm text-gray-600">{group.field_location || '—'}</p>
        <p className="text-xs text-gray-400 font-sans mt-1">
          {group.academic_year || '-'} • {group.semester || '-'} • NIM: {member?.nim || '—'} •
          Status: {SIDANG_STATUS_LABELS[group.status] || group.status}
        </p>
      </div>

      <div className="no-print flex flex-wrap gap-1 mb-4 bg-white rounded-lg shadow-sm p-1">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 rounded text-sm font-sans font-medium transition-colors ${activeTab === t.key ? 'bg-indigo-900 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 print:shadow-none print:p-0">
        {activeTab === 'berita-acara' && (
          <BeritaAcaraTab group={group} member={member} assessors={assessors}
            isDosen={canEdit} onUpdate={updateField} onUpdateNim={updateMemberNim}
            onSaveAssessor={saveAssessor} onSaveSignature={saveAssessorSignature} />
        )}
        {SIDANG_EXAMINER_ROLES.includes(activeTab as SidangExaminerRole) && (
          <ExaminerTab role={activeTab as SidangExaminerRole} group={group} member={member}
            assessors={assessors} criteria={criteria} isDosen={canEdit}
            raw={roleRaw(activeTab as SidangExaminerRole)}
            ratings={ratings} scores={scores} instances={instances}
            onOpen={() => setDialog({ role: activeTab as SidangExaminerRole, label: SIDANG_ROLE_LABELS[activeTab as SidangExaminerRole] })} />
        )}
        {activeTab === 'rekap' && (
          <RekapTab group={group} member={member} assessors={assessors}
            roleRaw={roleRaw} rerata={rerata} grade={grade} />
        )}
        {activeTab === 'preview' && (
          <PreviewTab group={group} member={member} assessors={assessors}
            criteria={criteria} roleRaw={roleRaw} ratingsFor={ratingsFor}
            rerata={rerata} grade={grade} />
        )}
      </div>

      {dialog && (
        <RubricDialog role={dialog.role} label={dialog.label} criteria={criteria}
          instance={instanceFor(dialog.role)} scores={scores} ratings={ratings}
          canEdit={canEdit} onClose={() => setDialog(null)}
          onSave={(d) => saveRubric(dialog.role, d)} />
      )}
    </div>
  )
}

// ─── BERITA ACARA ──────────────────────────────────────────────────────────
function BeritaAcaraTab({
  group, member, assessors, isDosen, onUpdate, onUpdateNim, onSaveAssessor, onSaveSignature,
}: {
  group: PblGroup; member: PblGroupMember | null; assessors: PblAssessor[]; isDosen: boolean
  onUpdate: (f: keyof PblGroup, v: unknown) => void
  onUpdateNim: (nim: string) => Promise<void>
  onSaveAssessor: (r: SidangExaminerRole | 'pembimbing_1', n: string, nip: string) => Promise<void>
  onSaveSignature: (id: string, p: string) => Promise<void>
}) {
  const [draft, setDraft] = useState<Record<string, string>>({})
  const setD = (k: string, v: string) => setDraft((p) => ({ ...p, [k]: v }))
  const val = (k: string, cur: string) => draft[k] ?? (cur || '')

  return (
    <div className="space-y-6">
      <DocHeader title="Berita Acara Sidang Skripsi" semester={group.semester} academicYear={group.academic_year} />
      <table className="w-full text-sm">
        <tbody>
          <tr><td className="w-44 py-1">Kode</td><td className="w-4 py-1">:</td><td className="py-1 font-sans">{group.code}</td></tr>
          <tr><td className="py-1">Nama Mahasiswa</td><td className="py-1">:</td>
            <td className="py-1"><input className="w-full border-b border-gray-400 bg-transparent" value={val('name', group.name)} disabled={!isDosen}
              onChange={(e) => { setD('name', e.target.value); onUpdate('name', e.target.value) }} /></td></tr>
          <tr><td className="py-1">NIM</td><td className="py-1">:</td>
            <td className="py-1"><input className="w-full border-b border-gray-400 bg-transparent font-sans" placeholder="NIM mahasiswa"
              defaultValue={member?.nim || ''} disabled={!isDosen}
              onBlur={(e) => { if (e.target.value.trim() !== (member?.nim || '')) void onUpdateNim(e.target.value.trim()) }} /></td></tr>
          <tr><td className="py-1">Peminatan</td><td className="py-1">:</td>
            <td className="py-1"><input className="w-full border-b border-gray-400 bg-transparent" value={val('field_location', group.field_location)} disabled={!isDosen}
              onChange={(e) => { setD('field_location', e.target.value); onUpdate('field_location', e.target.value) }} /></td></tr>
          <tr><td className="py-1 align-top">Judul Skripsi</td><td className="py-1 align-top">:</td>
            <td className="py-1"><textarea rows={3} className="w-full border border-gray-300 rounded p-2 text-sm" value={val('title', group.title)} disabled={!isDosen}
              onChange={(e) => { setD('title', e.target.value); onUpdate('title', e.target.value) }} /></td></tr>
          <tr><td className="py-1">Hari, Tanggal Ujian</td><td className="py-1">:</td>
            <td className="py-1"><input className="w-full border-b border-gray-400 bg-transparent" placeholder="Senin, 12 Januari 2027"
              value={val('hari_tanggal', group.hari_tanggal)} disabled={!isDosen}
              onChange={(e) => { setD('hari_tanggal', e.target.value); onUpdate('hari_tanggal', e.target.value) }} /></td></tr>
          <tr><td className="py-1">Tempat Ujian</td><td className="py-1">:</td>
            <td className="py-1"><input className="w-full border-b border-gray-400 bg-transparent" placeholder="Ruang Sidang FIKES"
              value={val('venue', group.venue)} disabled={!isDosen}
              onChange={(e) => { setD('venue', e.target.value); onUpdate('venue', e.target.value) }} /></td></tr>
          <tr><td className="py-1">Waktu Ujian</td><td className="py-1">:</td>
            <td className="py-1"><input className="w-full border-b border-gray-400 bg-transparent" placeholder="07.30"
              value={val('start_time', group.start_time)} disabled={!isDosen}
              onChange={(e) => { setD('start_time', e.target.value); onUpdate('start_time', e.target.value) }} /></td></tr>
          <tr><td className="py-1">Dosen Pembimbing</td><td className="py-1">:</td>
            <td className="py-1"><input className="w-full border-b border-gray-400 bg-transparent"
              placeholder={SIDANG_PEMBIMBING_LABEL}
              defaultValue={assessors.find((a) => a.assessor_role === 'pembimbing_1')?.display_name || ''}
              disabled={!isDosen}
              onBlur={(e) => { if (e.target.value.trim()) void onSaveAssessor('pembimbing_1', e.target.value.trim(), assessors.find((a) => a.assessor_role === 'pembimbing_1')?.nip || '') }} /></td></tr>
          <tr><td className="py-1 align-top">Hasil Sidang</td><td className="py-1 align-top">:</td>
            <td className="py-1">
              <div className="flex gap-4 flex-wrap">
                {['Lulus', 'Lulus Perbaikan', 'Tidak Lulus'].map((o) => (
                  <label key={o} className="flex items-center gap-1 text-sm">
                    <input type="radio" name="hasil" disabled={!isDosen} checked={(group.decision || '') === o}
                      onChange={() => { setD('decision', o); onUpdate('decision', o) }} /> {o}
                  </label>
                ))}
              </div>
            </td></tr>
          <tr><td className="py-1 align-top">Catatan</td><td className="py-1 align-top">:</td>
            <td className="py-1"><textarea rows={2} className="w-full border border-gray-300 rounded p-2 text-sm" value={val('report_notes', group.report_notes)} disabled={!isDosen}
              onChange={(e) => { setD('report_notes', e.target.value); onUpdate('report_notes', e.target.value) }} /></td></tr>
        </tbody>
      </table>

      <div>
        <h3 className="font-bold text-base mb-2">TIM PENGUJI</h3>
        <table className="w-full text-sm border border-gray-300">
          <thead>
            <tr className="bg-gray-100 border-b border-gray-300">
              <th className="w-10 py-2">No</th>
              <th className="py-2 text-left">Dosen Penguji</th>
              <th className="w-56 py-2 text-left">Jabatan</th>
              <th className="w-40 py-2">Tanda Tangan</th>
            </tr>
          </thead>
          <tbody>
            {SIDANG_EXAMINER_ROLES.map((role, i) => {
              const a = assessors.find((x) => x.assessor_role === role)
              return (
                <tr key={role} className="border-b border-gray-200 align-top">
                  <td className="py-3 text-center">{i + 1}</td>
                  <td className="py-3">
                    <input className="w-full border-b border-gray-400 bg-transparent"
                      placeholder={SIDANG_ROLE_LABELS[role]}
                      defaultValue={a?.display_name || ''}
                      disabled={!isDosen}
                      onBlur={(e) => { if (e.target.value.trim()) void onSaveAssessor(role, e.target.value.trim(), a?.nip || '') }} />
                  </td>
                  <td className="py-3 text-sm text-gray-600">{SIDANG_ROLE_LABELS[role]}</td>
                  <td className="py-3 text-center">
                    {a ? (
                      <S2SignatureUpload value={a.signature_path} label={SIDANG_ROLE_SHORT[role]}
                        onChange={(v) => { if (a.id) void onSaveSignature(a.id, v || '') }} />
                    ) : <span className="text-xs text-gray-400 italic">(isi nama dulu)</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div>
        <h3 className="font-bold text-base mb-2">Koordinator Program Studi</h3>
        <table className="w-full text-sm">
          <tbody>
            <tr><td className="w-44 py-1">Nama</td><td className="w-4 py-1">:</td>
              <td className="py-1"><input className="w-full border-b border-gray-400 bg-transparent" placeholder="Dr. Suparni, S.T., M.K.K.K."
                value={val('koordinator', group.koordinator)} disabled={!isDosen}
                onChange={(e) => { setD('koordinator', e.target.value); onUpdate('koordinator', e.target.value) }} /></td></tr>
            <tr><td className="py-1">NIP</td><td className="py-1">:</td>
              <td className="py-1 font-sans"><input className="w-full border-b border-gray-400 bg-transparent" placeholder="197705072024212008"
                value={val('nip_koordinator', group.nip_koordinator)} disabled={!isDosen}
                onChange={(e) => { setD('nip_koordinator', e.target.value); onUpdate('nip_koordinator', e.target.value) }} /></td></tr>
            <tr><td className="py-1">Tanggal Berita Acara</td><td className="py-1">:</td>
              <td className="py-1"><input className="w-full border-b border-gray-400 bg-transparent" placeholder="14 Oktober 2026"
                value={val('tanggal_ba', group.tanggal_ba)} disabled={!isDosen}
                onChange={(e) => { setD('tanggal_ba', e.target.value); onUpdate('tanggal_ba', e.target.value) }} /></td></tr>
            <tr><td className="py-1 align-top">Tanda Tangan</td><td className="py-1 align-top">:</td>
              <td className="py-1">
                <S2SignatureUpload value={group.koordinator_signature_path} label="Koordinator Prodi"
                  onChange={(v) => onUpdate('koordinator_signature_path', v || '')} />
              </td></tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── EXAMINER TAB ──────────────────────────────────────────────────────────
function ExaminerTab({
  role, group, member, assessors, criteria, isDosen, raw, ratings, scores, instances, onOpen,
}: {
  role: SidangExaminerRole; group: PblGroup; member: PblGroupMember | null; assessors: PblAssessor[]
  criteria: CriterionWithLevels[]; isDosen: boolean; raw: number | null
  ratings: PblRubricRating[]; scores: PblAssessmentScore[]; instances: PblAssessmentInstance[]
  onOpen: () => void
}) {
  const a = assessors.find((x) => x.assessor_role === role)
  const pembimbing = assessors.find((x) => x.assessor_role === 'pembimbing_1')
  const inst = instances.find((i) => i.assessor_role === role)
  const sc = inst ? scores.find((s) => s.instance_id === inst.id) : null
  const myRatings = sc ? ratings.filter((r) => r.assessment_score_id === sc.id) : []
  const answered = myRatings.filter((r) => r.criterion_points !== null && r.criterion_points !== undefined).length

  return (
    <div className="space-y-5">
      <DocHeader title={`Formulir Penilaian Sidang Skripsi — ${SIDANG_ROLE_LABELS[role]}`} semester={group.semester} academicYear={group.academic_year} />
      <table className="w-full text-sm">
        <tbody>
          <tr><td className="w-40 py-1">Nama Mahasiswa</td><td className="w-4 py-1">:</td><td className="py-1">{group.name}</td></tr>
          <tr><td className="py-1">NIM</td><td className="py-1">:</td><td className="py-1 font-sans">{member?.nim || '—'}</td></tr>
          <tr><td className="py-1">Peminatan</td><td className="py-1">:</td><td className="py-1">{group.field_location || '—'}</td></tr>
          <tr><td className="py-1 align-top">Judul Skripsi</td><td className="py-1 align-top">:</td><td className="py-1">{group.title || '—'}</td></tr>
          <tr><td className="py-1">Tempat Ujian</td><td className="py-1">:</td><td className="py-1">{group.venue || '—'}</td></tr>
          <tr><td className="py-1">Hari, Tanggal Ujian</td><td className="py-1">:</td><td className="py-1">{group.hari_tanggal || '—'}</td></tr>
          <tr><td className="py-1">Dosen Pembimbing</td><td className="py-1">:</td><td className="py-1">{pembimbing?.display_name || '—'}</td></tr>
          <tr><td className="py-1">Nama Penguji</td><td className="py-1">:</td><td className="py-1 font-semibold">{a?.display_name || '—'}</td></tr>
        </tbody>
      </table>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-gray-600 font-sans">
            Kelengkapan: <span className="font-semibold">{answered}/{criteria.length}</span> parameter
          </p>
          <p className="text-lg font-bold">
            Nilai Akhir: <span className={raw !== null ? 'text-indigo-800' : 'text-gray-300'}>{raw !== null ? raw.toFixed(2) : '—'}</span>
            <span className="text-gray-400 text-sm font-sans"> / 100</span>
          </p>
        </div>
        {isDosen && (
          <button onClick={onOpen} className="no-print bg-indigo-900 text-white px-4 py-2 rounded-lg hover:bg-indigo-800 font-sans text-sm font-medium">
            {answered > 0 ? 'Ubah Penilaian' : 'Isi Penilaian'}
          </button>
        )}
      </div>

      <table className="w-full text-sm template-table">
        <thead><tr className="border-b border-black">
          <th className="w-8">No</th><th className="text-left">Parameter Penilaian</th>
          <th className="w-16">Bobot</th><th className="w-20">Skor</th><th className="w-24">Poin</th>
        </tr></thead>
        <tbody>
          {criteria.map((c, i) => {
            const r = myRatings.find((x) => x.criterion_id === c.id)
            return (
              <tr key={c.id} className="border-b border-gray-200">
                <td className="text-center align-top">{i + 1}.</td>
                <td className="align-top">
                  <div className="font-semibold leading-tight">{c.name}</div>
                  {c.evidence_guidance && <div className="text-[10px] italic leading-snug text-gray-600 mt-0.5">{c.evidence_guidance}</div>}
                </td>
                <td className="text-center align-top font-sans">{(Number(c.internal_weight) * 100).toFixed(0)}%</td>
                <td className="text-center align-top font-sans">{r?.level_value ?? '—'}</td>
                <td className="text-center align-top font-semibold font-sans">{r?.criterion_points != null ? Number(r.criterion_points).toFixed(2) : ''}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="font-bold border-t-2 border-black">
            <td colSpan={4} className="text-right">NILAI AKHIR</td>
            <td className="text-center">{raw !== null ? raw.toFixed(2) : '—'}</td>
          </tr>
        </tfoot>
      </table>
      <p className="text-[11px] text-gray-500 font-sans">Nilai Akhir = (Total Skor Nilai × Bobot) / 4</p>
    </div>
  )
}

// ─── RUBRIC DIALOG ─────────────────────────────────────────────────────────
function RubricDialog({
  role, label, criteria, instance, scores, ratings, canEdit, onClose, onSave,
}: {
  role: SidangExaminerRole; label: string; criteria: CriterionWithLevels[]
  instance: PblAssessmentInstance | null; scores: PblAssessmentScore[]; ratings: PblRubricRating[]
  canEdit: boolean; onClose: () => void
  onSave: (d: { criterionId: string; level: number | null; note: string }[]) => Promise<boolean>
}) {
  const scoreRow = instance ? scores.find((s) => s.instance_id === instance.id) : null
  const existing = scoreRow ? ratings.filter((r) => r.assessment_score_id === scoreRow.id) : []
  const [drafts, setDrafts] = useState<Record<string, { level: number | null; note: string }>>(() => {
    const init: Record<string, { level: number | null; note: string }> = {}
    criteria.forEach((c) => {
      const r = existing.find((x) => x.criterion_id === c.id)
      init[c.id] = {
        level: r ? Number(r.level_value) : null,
        note: r?.evidence_note || '',
      }
    })
    return init
  })
  const [saving, setSaving] = useState(false)
  const [changed, setChanged] = useState(false)

  const setLevel = (criterionId: string, level: number | null) => {
    setDrafts((p) => ({ ...p, [criterionId]: { ...(p[criterionId] || { note: '' }), level } }))
    setChanged(true)
  }
  const setNote = (criterionId: string, note: string) => {
    setDrafts((p) => ({ ...p, [criterionId]: { ...(p[criterionId] || { level: null }), note } }))
    setChanged(true)
  }

  const completed = criteria.filter((c) => drafts[c.id]?.level !== null && drafts[c.id]?.level !== undefined).length
  const points = criteria.map((c) => {
    const d = drafts[c.id]
    if (!d || d.level === null || d.level === undefined) return null
    return calcCriterionPoints(d.level, Number(c.internal_weight))
  })
  const raw = calcRawFromCriterionPoints(points)

  const doSave = async () => {
    const anyLevel = criteria.some((c) => drafts[c.id]?.level !== null && drafts[c.id]?.level !== undefined)
    const noteNoLevel = criteria.filter((c) => (drafts[c.id]?.note || '').trim() !== ''
      && (drafts[c.id]?.level === null || drafts[c.id]?.level === undefined))
    if (!anyLevel) {
      alert('Isi minimal satu skor parameter sebelum menyimpan.')
      return
    }
    if (noteNoLevel.length > 0) {
      alert('Catatan hanya tersimpan jika skor parameter dipilih. Isi skor terlebih dahulu untuk:\n- '
        + noteNoLevel.map((c) => c.name).join('\n- '))
      return
    }
    setSaving(true)
    const ok = await onSave(criteria.map((c) => ({ criterionId: c.id, level: drafts[c.id]?.level ?? null, note: drafts[c.id]?.note || '' })))
    setSaving(false)
    if (ok) { setChanged(false); onClose() }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print" role="dialog" aria-modal="true" aria-label="Rubrik penilaian sidang">
      <div className="absolute inset-0 bg-black/40" onClick={() => { if (!changed || confirm('Ada perubahan yang belum disimpan. Batalkan?')) onClose() }} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-indigo-900 text-white px-5 py-4 rounded-t-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase">Formulir Penilaian Sidang Skripsi — {label}</p>
              <p className="text-xs text-indigo-100 mt-0.5">
                Skor per parameter 2,75–4,00: 4,00 = memenuhi seluruh kriteria · 3,50–3,99 = sebagian besar ·
                3,00–3,49 = sebagian · 2,75–2,99 = sedikit
              </p>
            </div>
            <button type="button" onClick={() => { if (!changed || confirm('Ada perubahan yang belum disimpan. Batalkan?')) onClose() }} className="text-white hover:text-indigo-200 text-xl leading-none w-8 h-8 rounded hover:bg-indigo-800">✕</button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {criteria.map((c, i) => {
            const d = drafts[c.id] || { level: null, note: '' }
            return (
              <div key={c.id} className="border border-gray-200 rounded-lg p-4">
                <p className="font-semibold text-sm">{i + 1}. {c.name} <span className="text-gray-400 text-[11px] font-sans">(bobot {(Number(c.internal_weight) * 100).toFixed(0)}%)</span></p>
                {c.evidence_guidance && <p className="text-xs text-gray-500 mt-1 italic">{c.evidence_guidance}</p>}

                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Skor parameter">
                  {(SIDANG_BAND_LEVELS[c.code] || []).map((lvl) => {
                    const selected = d.level === lvl.value
                    return (
                      <label key={lvl.value} className={`flex items-start gap-2 rounded border p-2 cursor-pointer text-sm ${selected ? 'border-indigo-600 bg-indigo-50' : canEdit ? 'border-gray-200 hover:border-gray-300' : 'border-gray-200 opacity-70'}`}>
                        <input
                          type="radio"
                          name={`crit-${c.id}`}
                          checked={selected}
                          disabled={!canEdit}
                          onChange={() => setLevel(c.id, lvl.value)}
                          className="mt-1 accent-indigo-900"
                        />
                        <span className="flex-1">
                          <span className="font-semibold">Skor {lvl.value} — {lvl.label}</span>{' '}
                          {selected && <span className="text-indigo-700">{' (terpilih)'}</span>}
                          <span className="block text-[12px] text-gray-600 mt-0.5 leading-snug">{lvl.descriptor}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
                <div className="mt-3 flex items-center gap-3 flex-wrap">
                  <label className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 font-sans">Sesuaikan skor dalam band (desimal):</span>
                    <input
                      type="number"
                      min={0}
                      max={4}
                      step="0.01"
                      value={d.level ?? ''}
                      disabled={!canEdit}
                      onChange={(e) => {
                        const v = e.target.value
                        if (v === '') { setLevel(c.id, null); return }
                        const n = Number(v)
                        if (isNaN(n)) return
                        setLevel(c.id, Math.min(4, Math.max(0, n)))
                      }}
                      className="w-24 border border-gray-300 rounded px-2 py-1.5 text-sm font-sans text-center"
                    />
                  </label>
                  <span className="text-[11px] text-gray-500 font-sans">
                    {d.level !== null
                      ? `= ${calcCriterionPoints(d.level, Number(c.internal_weight)).toFixed(2)} poin (skor × bobot ÷ 4)`
                      : 'belum diisi'}
                  </span>
                </div>
                <input className="mt-2 w-full border border-gray-200 rounded px-2 py-1.5 text-xs"
                  placeholder="Catatan bukti (opsional)" value={d.note} disabled={!canEdit}
                  onChange={(e) => setNote(c.id, e.target.value)} />
              </div>
            )
          })}
        </div>
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-5 py-3 rounded-b-xl flex items-center justify-between gap-2">
          <p className="text-sm font-sans text-gray-600">
            <span className="font-semibold">{completed}/{criteria.length}</span> terisi
            <span className="mx-2">•</span>
            <span className="font-bold">Nilai: {raw !== null ? raw.toFixed(2) : '—'}</span>
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 rounded border border-gray-300 text-sm font-sans hover:bg-gray-100">Tutup</button>
            <button type="button" onClick={doSave} disabled={saving || !canEdit}
              className="px-4 py-2 rounded bg-indigo-900 text-white text-sm font-sans hover:bg-indigo-800 disabled:opacity-50">
              {saving ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── REKAP ─────────────────────────────────────────────────────────────────
function RekapTab({
  group, member, assessors, roleRaw, rerata, grade,
}: {
  group: PblGroup; member: PblGroupMember | null; assessors: PblAssessor[]
  roleRaw: (r: SidangExaminerRole) => number | null; rerata: number | null
  grade: { huruf: string; skala: string } | null
}) {
  return (
    <div className="space-y-5">
      <DocHeader title="Rekapitulasi Nilai Sidang Skripsi" semester={group.semester} academicYear={group.academic_year} />
      <table className="w-full text-sm">
        <tbody>
          <tr><td className="w-40 py-1">Nama Mahasiswa</td><td className="w-4 py-1">:</td><td className="py-1">{group.name}</td></tr>
          <tr><td className="py-1">NIM</td><td className="py-1">:</td><td className="py-1 font-sans">{member?.nim || '—'}</td></tr>
          <tr><td className="py-1 align-top">Judul Skripsi</td><td className="py-1 align-top">:</td><td className="py-1">{group.title || '—'}</td></tr>
        </tbody>
      </table>
      <table className="w-full text-sm border border-gray-300">
        <thead>
          <tr className="bg-gray-100 border-b border-gray-300">
            <th className="w-8 py-2">No</th>
            <th className="py-2 text-left">Dosen Penguji</th>
            <th className="py-2 text-left">Jabatan</th>
            <th className="w-28 py-2">Nilai</th>
          </tr>
        </thead>
        <tbody>
          {SIDANG_EXAMINER_ROLES.map((r, i) => {
            const a = assessors.find((x) => x.assessor_role === r)
            const v = roleRaw(r)
            return (
              <tr key={r} className="border-b border-gray-200">
                <td className="py-3 text-center">{i + 1}</td>
                <td className="py-3">{a?.display_name || '—'}</td>
                <td className="py-3 text-sm text-gray-600">{SIDANG_ROLE_LABELS[r]}</td>
                <td className="py-3 text-center font-semibold font-sans">{v !== null ? v.toFixed(2) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-bold">
            <td colSpan={3} className="text-right py-3">Rerata Nilai Sidang Skripsi</td>
            <td className="py-3 text-center">{rerata !== null ? rerata.toFixed(2) : '—'}</td>
          </tr>
        </tfoot>
      </table>
      <div className="border border-gray-300 rounded-lg p-4 flex items-center justify-between">
        <span className="text-sm text-gray-600">Hasil Sidang Skripsi</span>
        <span className="text-lg font-bold">
          {grade ? `${grade.huruf} (${grade.skala})` : rerata !== null ? 'TIDAK LULUS' : '—'}
        </span>
      </div>
      <table className="w-full text-xs text-gray-600 font-sans">
        <tbody><tr>
          <td className="pr-4 font-semibold">Keterangan nilai:</td>
          <td className="pr-3">85-100 = A (4.00)</td>
          <td className="pr-3">80-84.99 = A- (3.75)</td>
          <td className="pr-3">75-79.99 = B+ (3.50)</td>
          <td className="pr-3">70-74.99 = B (3.00)</td>
          <td>&lt; 70 = TIDAK LULUS</td>
        </tr></tbody>
      </table>
      <p className="text-[11px] text-gray-500 font-sans">Rerata = (Ketua Penguji + Anggota Penguji I + Anggota Penguji II) / 3.</p>
    </div>
  )
}

// ─── PREVIEW ───────────────────────────────────────────────────────────────
function PreviewTab({
  group, member, assessors, criteria, roleRaw, ratingsFor, rerata, grade,
}: {
  group: PblGroup; member: PblGroupMember | null; assessors: PblAssessor[]
  criteria: CriterionWithLevels[]; roleRaw: (r: SidangExaminerRole) => number | null
  ratingsFor: (r: SidangExaminerRole) => Record<string, { level: number | null; points: number | null }>
  rerata: number | null
  grade: { huruf: string; skala: string } | null
}) {
  const sig = (role: SidangExaminerRole) => assessors.find((a) => a.assessor_role === role)?.signature_path
  const pembimbing = assessors.find((a) => a.assessor_role === 'pembimbing_1')
  const handlePrint = () => window.print()
  // TTD date: explicit Tanggal Berita Acara wins; otherwise derive the day
  // from "Hari, Tanggal Ujian" so a date entered once appears in every TTD block.
  const ttdDate = (group.tanggal_ba || '').trim()
    || (group.hari_tanggal || '').replace(/^(Senin|Selasa|Rabu|Kamis|Jumat|Sabtu|Minggu)\s*,?\s*/i, '').trim()

  return (
    <div data-sidang-preview-root="true">
      <div className="no-print mb-4 flex justify-end gap-3 print:hidden">
        <button onClick={handlePrint}
          className="bg-indigo-900 text-white px-5 py-2.5 rounded-lg hover:bg-indigo-800 font-sans text-sm font-medium shadow">
          🖨 Cetak / Simpan PDF
        </button>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm 14mm 14mm 14mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          body * { visibility: hidden; }
          [data-sidang-preview-root='true'],
          [data-sidang-preview-root='true'] * { visibility: visible; }
          [data-sidang-preview-root='true'] { position: absolute !important; inset: 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
          [data-sidang-preview-root='true'] .print-area { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
          [data-sidang-preview-root='true'] .sidang-preview-section { width: 100% !important; margin: 0 !important; padding: 0 !important; }
          [data-sidang-preview-root='true'] .sidang-preview-section + .sidang-preview-section { break-before: page !important; page-break-before: always !important; }
          [data-sidang-preview-root='true'] [data-preview-doc-header='true'],
          [data-sidang-preview-root='true'] .avoid-break { break-inside: avoid !important; page-break-inside: avoid !important; }
          [data-sidang-preview-root='true'] .signature-block { break-inside: avoid !important; page-break-inside: avoid !important; width: 74mm !important; max-width: 74mm !important; margin-left: auto !important; margin-right: 0 !important; }
          [data-sidang-preview-root='true'] table { width: 100% !important; max-width: 100% !important; border-collapse: collapse !important; }
          [data-sidang-preview-root='true'] thead { display: table-header-group !important; }
          [data-sidang-preview-root='true'] tr { break-inside: avoid !important; page-break-inside: avoid !important; }
          [data-sidang-preview-root='true'] img { print-color-adjust: exact; -webkit-print-color-adjust: exact; max-width: 100% !important; }
        }
      `}</style>

      <div className="print-area space-y-10 bg-white p-8 md:p-12 print:space-y-0 print:p-0"
        style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>

        {/* ===== BERITA ACARA (halaman 1) ===== */}
        <section className="sidang-preview-section">
          <DocHeader title="Berita Acara Sidang Skripsi" semester={group.semester} academicYear={group.academic_year} />
          <div className="text-sm leading-relaxed">
            <p>
              Pada hari <span className="border-b border-gray-500 px-6 inline-block min-w-[10rem]">{group.hari_tanggal || '............'}</span> telah dilaksanakan sidang skripsi.
            </p>
            <table className="mt-4 w-full text-sm">
              <tbody>
                <tr><td className="w-40 py-1">Nama Mahasiswa</td><td className="w-4 py-1">:</td><td className="py-1 font-semibold">{group.name}</td></tr>
                <tr><td className="py-1">NIM</td><td className="py-1">:</td><td className="py-1 font-sans font-semibold">{member?.nim || '—'}</td></tr>
                <tr><td className="py-1">Peminatan</td><td className="py-1">:</td><td className="py-1">{group.field_location || '—'}</td></tr>
                <tr><td className="py-1 align-top">Judul Skripsi</td><td className="py-1 align-top">:</td><td className="py-1">{group.title || '—'}</td></tr>
                <tr><td className="py-1">Dosen Pembimbing</td><td className="py-1">:</td><td className="py-1">{pembimbing?.display_name || '—'}</td></tr>
                <tr><td className="py-1">Waktu</td><td className="py-1">:</td><td className="py-1">{group.start_time && group.end_time ? `${group.start_time} – ${group.end_time}` : (group.start_time || '—')}</td></tr>
                <tr><td className="py-1">Tempat</td><td className="py-1">:</td><td className="py-1">{group.venue || '—'}</td></tr>
              </tbody>
            </table>
            <p className="mt-4">
              Dinyatakan yang bersangkutan:{' '}
              <span className="font-bold">{group.decision === 'Lulus' ? 'LULUS' : group.decision === 'Lulus Perbaikan' ? 'LULUS DENGAN PERBAIKAN' : group.decision === 'Tidak Lulus' ? 'TIDAK LULUS' : '........................'}</span>
            </p>
            {group.report_notes && <p className="mt-2 text-gray-700">Catatan: {group.report_notes}</p>}
            <p className="mt-4 text-justify">
              Demikian berita acara sidang skripsi ini dibuat untuk diketahui dan dipergunakan sebagaimana mestinya.
            </p>
          </div>

          <div className="mt-4 avoid-break">
            <h3 className="font-bold text-base mb-2">TIM PENGUJI</h3>
            <table className="w-full text-sm border border-gray-300">
              <thead><tr className="bg-gray-100 border-b border-gray-300">
                <th className="w-10 py-2">No</th><th className="py-2 text-left">Dosen Penguji</th>
                <th className="w-56 py-2 text-left">Jabatan</th><th className="w-40 py-2">Tanda Tangan</th>
              </tr></thead>
              <tbody>
                {SIDANG_EXAMINER_ROLES.map((r, i) => {
                  const a = assessors.find((x) => x.assessor_role === r)
                  return (
                    <tr key={r} className="border-b border-gray-200">
                      <td className="py-4 text-center">{i + 1}</td>
                      <td className="py-4">{a?.display_name || '—'}</td>
                      <td className="py-4 text-sm text-gray-600">{SIDANG_ROLE_LABELS[r]}</td>
                      <td className="py-4 text-center">
                        {sig(r) ? <img src={sig(r)!} alt={SIDANG_ROLE_SHORT[r]} className="max-h-14 max-w-28 object-contain mx-auto" /> : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-10 flex justify-end text-center text-sm signature-block">
            <div>
              <p>Jakarta, {ttdDate || '.............. 2026'}</p>
              <p className="mt-1">Koordinator Program Studi Kesehatan Masyarakat</p>
              {group.koordinator_signature_path
                ? <img src={group.koordinator_signature_path} alt="TTD Koordinator" className="max-h-16 object-contain mx-auto mt-1" />
                : <div className="w-48 border-b border-gray-500 mt-8 mx-auto" />}
              <p className="mt-1 font-semibold">{group.koordinator || 'Dr. Suparni, S.T., M.K.K.K.'}</p>
              <p className="text-xs font-sans">NIP. {group.nip_koordinator || '197705072024212008'}</p>
            </div>
          </div>
        </section>

        {/* ===== LEMBAR PENILAIAN KETIGA PENGUJI (masing-masing satu halaman) ===== */}
        {SIDANG_EXAMINER_ROLES.map((role) => {
          const a = assessors.find((x) => x.assessor_role === role)
          const m = ratingsFor(role)
          return (
            <section key={role} className="sidang-preview-section">
              <DocHeader title={`Formulir Penilaian Sidang Skripsi — ${SIDANG_ROLE_LABELS[role]}`} semester={group.semester} academicYear={group.academic_year} />
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="w-40 py-0.5">Nama Mahasiswa</td><td className="w-4 py-0.5">:</td><td className="py-0.5">{group.name}</td></tr>
                  <tr><td className="py-0.5">NIM</td><td className="py-0.5">:</td><td className="py-0.5 font-sans">{member?.nim || '—'}</td></tr>
                  <tr><td className="py-0.5">Peminatan</td><td className="py-0.5">:</td><td className="py-0.5">{group.field_location || '—'}</td></tr>
                  <tr><td className="py-0.5 align-top">Judul Skripsi</td><td className="py-0.5 align-top">:</td><td className="py-0.5">{group.title || '—'}</td></tr>
                  <tr><td className="py-0.5">Dosen Pembimbing</td><td className="py-0.5">:</td><td className="py-0.5">{pembimbing?.display_name || '—'}</td></tr>
                  <tr><td className="py-0.5">Tempat / Hari-Tanggal</td><td className="py-0.5">:</td>
                    <td className="py-0.5">{group.venue || '—'} / {group.hari_tanggal || '—'}</td></tr>
                  <tr><td className="py-0.5">Nama Penguji</td><td className="py-0.5">:</td><td className="py-0.5 font-semibold">{a?.display_name || '—'}</td></tr>
                </tbody>
              </table>
              <table className="w-full text-sm mt-2 template-table">
                <thead><tr className="border-b border-black">
                  <th className="w-8">No</th><th className="text-left">Parameter Penilaian</th>
                  <th className="w-14">Bobot</th><th className="w-16">Skor</th><th className="w-20">Poin</th>
                </tr></thead>
                <tbody>
                  {criteria.map((c, i) => {
                    const r = m[c.id]
                    return (
                      <tr key={c.id} className="border-b border-gray-200">
                        <td className="text-center align-top">{i + 1}.</td>
                        <td className="align-top">
                          <div className="font-semibold leading-tight">{c.name}</div>
                          {c.evidence_guidance && <div className="text-[9px] italic leading-snug text-gray-600 mt-0.5">{c.evidence_guidance}</div>}
                        </td>
                        <td className="text-center align-top font-sans">{(Number(c.internal_weight) * 100).toFixed(0)}%</td>
                        <td className="text-center align-top font-sans">{r?.level ?? '—'}</td>
                        <td className="text-center align-top font-semibold font-sans">{r?.points != null ? Number(r.points).toFixed(2) : ''}</td>
                      </tr>
                    )
                  })}
                </tbody>
                <tfoot>
                  <tr className="font-bold border-t-2 border-black">
                    <td colSpan={4} className="text-right">NILAI AKHIR</td>
                    <td className="text-center">{roleRaw(role) !== null ? roleRaw(role)!.toFixed(2) : '—'}</td>
                  </tr>
                </tfoot>
              </table>
              <p className="text-[11px] text-gray-500 font-sans mt-1">Nilai Akhir = (Total Skor Nilai × Bobot) / 4</p>
              <div className="mt-4 flex justify-end text-center text-sm signature-block">
                <div>
                  <p>Depok, {ttdDate || '.............. 2026'}</p>
                  <p className="mt-1 font-semibold">{SIDANG_ROLE_LABELS[role]}</p>
                  {sig(role)
                    ? <img src={sig(role)!} alt={SIDANG_ROLE_SHORT[role]} className="max-h-14 object-contain mx-auto mt-1" />
                    : <div className="w-48 border-b border-gray-500 mt-6 mx-auto" />}
                  <p className="mt-1 font-semibold">{a?.display_name || '..........................'}</p>
                </div>
              </div>
            </section>
          )
        })}

        {/* ===== REKAPITULASI ===== */}
        <section className="sidang-preview-section">
          <DocHeader title="Rekapitulasi Nilai Sidang Skripsi" semester={group.semester} academicYear={group.academic_year} />
          <table className="w-full text-sm template-table">
            <thead><tr className="border-b border-black">
              <th className="w-8">No</th><th className="text-left">Parameter Penilaian</th><th className="w-14">Bobot</th>
              {SIDANG_EXAMINER_ROLES.map((r) => <th key={r} className="w-20">{SIDANG_ROLE_SHORT[r]}</th>)}
            </tr></thead>
            <tbody>
              {criteria.map((c, i) => {
                const ms = SIDANG_EXAMINER_ROLES.map((r) => ratingsFor(r)[c.id])
                return (
                  <tr key={c.id} className="border-b border-gray-200">
                    <td className="text-center">{i + 1}.</td>
                    <td>{c.name}</td>
                    <td className="text-center font-sans">{(Number(c.internal_weight) * 100).toFixed(0)}%</td>
                    {ms.map((m, idx) => (
                      <td key={idx} className="text-center font-sans">{m?.level ?? '—'}</td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="font-bold border-t-2 border-black">
                <td colSpan={2} className="text-right">Rerata Nilai Sidang Skripsi</td>
                <td></td>
                <td colSpan={3} className="text-center">{rerata !== null ? rerata.toFixed(2) : '—'}</td>
              </tr>
            </tfoot>
          </table>
          <p className="text-sm mt-3">
            Hasil sidang skripsi:{' '}
            <span className="font-bold">{grade ? `${grade.huruf} (${grade.skala})` : rerata !== null ? 'TIDAK LULUS' : '—'}</span>
          </p>
        </section>
      </div>
    </div>
  )
}

// ─── shared header ─────────────────────────────────────────────────────────
function DocHeader({ title, semester, academicYear }: { title: string; semester?: string; academicYear?: string }) {
  return (
    <div data-preview-doc-header="true" className="text-center border-b-2 border-black pb-3 mb-4">
      <img src="/kop-surat-resize.png" alt="KOP UPN" className="mx-auto mb-2 print:block"
        style={{ maxWidth: '100%', maxHeight: '80px', width: 'auto', height: 'auto' }} />
      <h2 className="font-bold text-base uppercase leading-tight">{title}</h2>
      <p className="text-[11px] leading-tight">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
      <p className="text-[11px] leading-tight">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
      {semester || academicYear ? (
        <p className="text-[11px] font-semibold leading-tight">SEMESTER {semester || '…'} T.A. {academicYear || '…/…'}</p>
      ) : null}
    </div>
  )
}
