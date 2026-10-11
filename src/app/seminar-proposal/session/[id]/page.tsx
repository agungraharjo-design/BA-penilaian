'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/app/components/AuthProvider'
import { S2SignatureUpload } from '@/app/components/common/S2SignatureUpload'
import { SpImageUpload } from '@/app/components/common/SpImageUpload'
import { getSpBlueprint } from '@/lib/seminarproposal/repositories'
import { calcCriterionPoints, calcRawFromCriterionPoints, calcRerata } from '@/lib/seminarproposal/calculations'
import {
  SP_COMPONENT_CODE, SP_BLUEPRINT_VERSION,
  SP_ASSESSOR_ROLES, SP_ROLE_LABELS, SP_ROLE_SHORT, SP_STATUS_LABELS, spGrade,
  parseScreenshots, emptyScreenshots,
} from '@/types/seminarproposa'
import type {
  SpTab, SpAssessorRole, SpBlueprint, SpRubricCriterion, SpScreenshots,
  PblGroup, PblGroupMember, PblAssessor, PblAssessmentInstance,
  PblAssessmentScore, PblRubricRating,
} from '@/types/seminarproposa'

const LEVEL_LABELS: Record<number, string> = {
  4: 'Memenuhi Seluruh Kriteria',
  3: 'Memenuhi Sebagian Besar',
  2: 'Memenuhi Sebagian',
  1: 'Tidak Memenuhi',
  0: 'Tidak Hadir / Tidak Ada',
}

type CriterionWithLevels = SpRubricCriterion & {
  levels: { value: number; label: string; descriptor: string }[]
}

export default function SpSessionPage() {
  const params = useParams<{ id: string }>()
  const groupId = params.id
  const { profile, isDosen, isSuperadmin } = useAuth()

  const [blueprint, setBlueprint] = useState<SpBlueprint | null>(null)
  const [group, setGroup] = useState<PblGroup | null>(null)
  const [members, setMembers] = useState<PblGroupMember[]>([])
  const [assessors, setAssessors] = useState<PblAssessor[]>([])
  const [instances, setInstances] = useState<PblAssessmentInstance[]>([])
  const [scores, setScores] = useState<PblAssessmentScore[]>([])
  const [ratings, setRatings] = useState<PblRubricRating[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<SpTab>('berita-acara')
  const [dialog, setDialog] = useState<{ role: SpAssessorRole; label: string } | null>(null)
  const [sync, setSync] = useState<'live' | 'saving' | 'offline'>('live')
  const [screenshots, setScreenshots] = useState<SpScreenshots>(() => emptyScreenshots())

  const canEdit = !!isDosen || !!isSuperadmin
  const groupRef = useRef<PblGroup | null>(null)
  const dirty = useRef<Set<string>>(new Set())
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saving = useRef(false)

  const member = members[0] || null

  useEffect(() => { load(); return () => { if (timer.current) clearTimeout(timer.current) } }, [groupId])

  async function load() {
    setLoading(true)
    const bp = await getSpBlueprint()
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
    const ev = (gr as unknown as { evidence?: { screenshot?: unknown } | null }).evidence
    setScreenshots(parseScreenshots(ev?.screenshot ?? null, gr.name || ''))
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

  // Tangkapan layar lives in pbl_groups.evidence (jsonb). Kept out of the
  // autosave path above because it is written as a whole object on upload.
  const updateScreenshots = useCallback((next: SpScreenshots) => {
    setScreenshots(next)
    void (async () => {
      setSync('saving')
      const { error } = await supabase
        .from('pbl_groups')
        .update({ evidence: { screenshot: next }, updated_at: new Date().toISOString() })
        .eq('id', groupId)
      if (error) {
        console.error('Gagal menyimpan tangkapan layar:', error)
        setSync('offline')
        return
      }
      setSync('live')
    })()
  }, [groupId])


  async function saveAssessor(role: SpAssessorRole, display_name: string, nip: string) {
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

  const instanceFor = useCallback((role: SpAssessorRole) =>
    instances.find((i) => i.assessor_role === role) || null, [instances])

  const scoreFor = useCallback((instId: string | null) => {
    if (!instId) return null
    return scores.find((s) => s.instance_id === instId) || null
  }, [scores])

  const rawOf = useCallback((scoreId: string | null): number | null => {
    if (!scoreId) return null
    const pts = ratings.filter((r) => r.assessment_score_id === scoreId).map((r) => r.criterion_points)
    return calcRawFromCriterionPoints(pts)
  }, [ratings])

  const roleRaw = useCallback((role: SpAssessorRole): number | null =>
    rawOf(scoreFor(instanceFor(role)?.id ?? null)?.id ?? null), [instanceFor, scoreFor, rawOf])

  // Per-examiner rating map, so Preview can render the three full forms.
  const ratingsFor = useCallback((role: SpAssessorRole) => {
    const inst = instanceFor(role)
    const sc = inst ? scoreFor(inst.id) : null
    if (!sc) return {}
    const map: Record<string, { level: number | null; points: number | null }> = {}
    ratings.filter((r) => r.assessment_score_id === sc.id).forEach((r) => {
      map[r.criterion_id] = { level: r.level_value, points: r.criterion_points }
    })
    return map
  }, [instanceFor, scoreFor, ratings])


  async function saveRubric(role: SpAssessorRole, drafts: { criterionId: string; level: number | null; note: string }[]) {
    setSync('saving')
    let inst = instanceFor(role)
    if (!inst) {
      const { data, error } = await supabase.from('pbl_assessment_instances').insert({
        group_id: groupId, component_code: SP_COMPONENT_CODE,
        rubric_version: SP_BLUEPRINT_VERSION, assessor_role: role, status: 'DRAFT',
      }).select('*').single()
      if (error) { setSync('offline'); return false }
      inst = data as PblAssessmentInstance
      setInstances((p) => [...p, inst!])
    }
    let scoreRow = scoreFor(inst.id)
    if (!scoreRow) {
      const { data, error } = await supabase.from('pbl_assessment_scores').insert({
        instance_id: inst.id, student_id: null, entered_by: profile?.id,
        score_source: 'RUBRIC_CALCULATED',
      }).select('*').single()
      if (error) { setSync('offline'); return false }
      scoreRow = data as PblAssessmentScore
      setScores((p) => [...p, scoreRow!])
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
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-purple-500 font-serif text-lg gap-4">
      <p>Seminar proposal tidak ditemukan</p>
      <Link href="/seminar-proposal/sessions" className="text-blue-700 underline">← Kembali ke daftar</Link>
    </div>
  )

  const rerata = calcRerata(SP_ASSESSOR_ROLES.map((r) => roleRaw(r)))
  const grade = spGrade(rerata)

  const tabs: { key: SpTab; label: string }[] = [
    { key: 'berita-acara', label: 'Berita Acara' },
    ...SP_ASSESSOR_ROLES.map((r) => ({ key: r as SpTab, label: SP_ROLE_SHORT[r] })),
    { key: 'rekap', label: 'Rekap' },
    { key: 'screenshot', label: 'Tangkapan Layar' },
    { key: 'preview', label: 'Preview & PDF' },
  ]

  return (
    <div className="max-w-6xl mx-auto p-4 font-serif">
      <div className={`no-print sync-indicator ${sync === 'live' ? 'bg-green-100 text-green-800' : sync === 'saving' ? 'bg-yellow-100 text-yellow-800' : 'bg-purple-100 text-purple-800'}`}>
        <span className={`w-2 h-2 rounded-full ${sync === 'live' ? 'bg-green-500' : sync === 'saving' ? 'bg-yellow-500' : 'bg-purple-500'}`} />
        {sync === 'live' ? 'Tersimpan' : sync === 'saving' ? 'Menyimpan...' : 'Offline'}
      </div>

      <div className="bg-white rounded-lg shadow-md p-4 mb-4 no-print">
        <Link href="/seminar-proposal/sessions" className="text-sm text-blue-700 hover:underline">← Kembali ke daftar</Link>
        <h1 className="text-xl font-bold mt-1">{group.name} <span className="text-gray-500 text-base">({group.code})</span></h1>
        <p className="text-sm text-gray-600">{group.field_location || '—'}</p>
        <p className="text-xs text-gray-400 font-sans mt-1">
          {group.academic_year || '-'} • {group.semester || '-'} • NIM: {member?.nim || '—'} •
          Status: {SP_STATUS_LABELS[group.status] || group.status}
        </p>
      </div>

      <div className="no-print flex flex-wrap gap-1 mb-4 bg-white rounded-lg shadow-sm p-1">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 rounded text-sm font-sans font-medium transition-colors ${activeTab === t.key ? 'bg-emerald-900 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 print:shadow-none print:p-0">
        {activeTab === 'berita-acara' && (
          <BeritaAcaraTab group={group} member={member} assessors={assessors}
            isDosen={canEdit} onUpdate={updateField}
            onSaveAssessor={saveAssessor} onSaveSignature={saveAssessorSignature} />
        )}
        {SP_ASSESSOR_ROLES.includes(activeTab as SpAssessorRole) && (
          <ExaminerTab role={activeTab as SpAssessorRole} group={group} member={member}
            assessors={assessors} criteria={criteria} isDosen={canEdit}
            raw={roleRaw(activeTab as SpAssessorRole)}
            ratings={ratings} scores={scores} instances={instances}
            onOpen={() => setDialog({ role: activeTab as SpAssessorRole, label: SP_ROLE_LABELS[activeTab as SpAssessorRole] })} />
        )}
        {activeTab === 'rekap' && (
          <RekapTab group={group} member={member} assessors={assessors}
            roleRaw={roleRaw} rerata={rerata} grade={grade} />
        )}
        {activeTab === 'screenshot' && (
          <ScreenshotTab group={group} member={member} assessors={assessors}
            screenshots={screenshots} isDosen={canEdit} onChange={updateScreenshots} />
        )}
        {activeTab === 'preview' && (
          <PreviewTab group={group} member={member} assessors={assessors}
            criteria={criteria} roleRaw={roleRaw} ratingsFor={ratingsFor}
            rerata={rerata} grade={grade} screenshots={screenshots} />
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
  group, member, assessors, isDosen, onUpdate, onSaveAssessor, onSaveSignature,
}: {
  group: PblGroup; member: PblGroupMember | null; assessors: PblAssessor[]; isDosen: boolean
  onUpdate: (f: keyof PblGroup, v: unknown) => void
  onSaveAssessor: (r: SpAssessorRole, n: string, nip: string) => Promise<void>
  onSaveSignature: (id: string, p: string) => Promise<void>
}) {
  const [draft, setDraft] = useState<Record<string, string>>({})
  const setD = (k: string, v: string) => setDraft((p) => ({ ...p, [k]: v }))
  const val = (k: string, cur: string) => draft[k] ?? (cur || '')

  return (
    <div className="space-y-6">
      <DocHeader title="Berita Acara Seminar Proposal Skripsi" semester={group.semester} academicYear={group.academic_year} />
      <table className="w-full text-sm">
        <tbody>
          <tr><td className="w-44 py-1">Kode</td><td className="w-4 py-1">:</td><td className="py-1 font-sans">{group.code}</td></tr>
          <tr><td className="py-1">Nama Mahasiswa</td><td className="py-1">:</td>
            <td className="py-1"><input className="w-full border-b border-gray-400 bg-transparent" value={val('name', group.name)} disabled={!isDosen}
              onChange={(e) => { setD('name', e.target.value); onUpdate('name', e.target.value) }} /></td></tr>
          <tr><td className="py-1">NIM</td><td className="py-1">:</td><td className="py-1 font-sans">{member?.nim || '—'}</td></tr>
          <tr><td className="py-1">Peminatan</td><td className="py-1">:</td>
            <td className="py-1"><input className="w-full border-b border-gray-400 bg-transparent" value={val('field_location', group.field_location)} disabled={!isDosen}
              onChange={(e) => { setD('field_location', e.target.value); onUpdate('field_location', e.target.value) }} /></td></tr>
          <tr><td className="py-1 align-top">Judul Skripsi</td><td className="py-1 align-top">:</td>
            <td className="py-1"><textarea rows={3} className="w-full border border-gray-300 rounded p-2 text-sm" value={val('title', group.title)} disabled={!isDosen}
              onChange={(e) => { setD('title', e.target.value); onUpdate('title', e.target.value) }} /></td></tr>
          <tr><td className="py-1">Hari, Tanggal Ujian</td><td className="py-1">:</td>
            <td className="py-1"><input className="w-full border-b border-gray-400 bg-transparent" placeholder="Senin, 12 Oktober 2026"
              value={val('hari_tanggal', group.hari_tanggal)} disabled={!isDosen}
              onChange={(e) => { setD('hari_tanggal', e.target.value); onUpdate('hari_tanggal', e.target.value) }} /></td></tr>
          <tr><td className="py-1">Tempat Ujian</td><td className="py-1">:</td>
            <td className="py-1"><input className="w-full border-b border-gray-400 bg-transparent" placeholder="R. Seminar FIKES"
              value={val('venue', group.venue)} disabled={!isDosen}
              onChange={(e) => { setD('venue', e.target.value); onUpdate('venue', e.target.value) }} /></td></tr>
          <tr><td className="py-1">Waktu Seminar</td><td className="py-1">:</td>
            <td className="py-1 flex gap-2 items-center">
              <input className="border-b border-gray-400 bg-transparent w-24" placeholder="09.00" value={val('start_time', group.start_time)} disabled={!isDosen}
                onChange={(e) => { setD('start_time', e.target.value); onUpdate('start_time', e.target.value) }} />
              <span>-</span>
              <input className="border-b border-gray-400 bg-transparent w-24" placeholder="11.00" value={val('end_time', group.end_time)} disabled={!isDosen}
                onChange={(e) => { setD('end_time', e.target.value); onUpdate('end_time', e.target.value) }} />
            </td></tr>
          <tr><td className="py-1 align-top">Hasil Pelaksanaan</td><td className="py-1 align-top">:</td>
            <td className="py-1">
              <div className="flex gap-4">
                {['Lulus', 'Tidak Lulus'].map((o) => (
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
            {SP_ASSESSOR_ROLES.map((role, i) => {
              const a = assessors.find((x) => x.assessor_role === role)
              return (
                <tr key={role} className="border-b border-gray-200 align-top">
                  <td className="py-3 text-center">{i + 1}</td>
                  <td className="py-3">
                    <input className="w-full border-b border-gray-400 bg-transparent"
                      placeholder={SP_ROLE_LABELS[role]}
                      defaultValue={a?.display_name || ''}
                      disabled={!isDosen}
                      onBlur={(e) => { if (e.target.value.trim()) void onSaveAssessor(role, e.target.value.trim(), a?.nip || '') }} />
                  </td>
                  <td className="py-3 text-sm text-gray-600">{SP_ROLE_LABELS[role]}</td>
                  <td className="py-3 text-center">
                    {a ? (
                      <S2SignatureUpload value={a.signature_path} label={SP_ROLE_SHORT[role]}
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
  role: SpAssessorRole; group: PblGroup; member: PblGroupMember | null; assessors: PblAssessor[]
  criteria: CriterionWithLevels[]; isDosen: boolean; raw: number | null
  ratings: PblRubricRating[]; scores: PblAssessmentScore[]; instances: PblAssessmentInstance[]
  onOpen: () => void
}) {
  const a = assessors.find((x) => x.assessor_role === role)
  const inst = instances.find((i) => i.assessor_role === role)
  const sc = inst ? scores.find((s) => s.instance_id === inst.id) : null
  const myRatings = sc ? ratings.filter((r) => r.assessment_score_id === sc.id) : []
  const answered = myRatings.filter((r) => r.criterion_points !== null && r.criterion_points !== undefined).length

  return (
    <div className="space-y-5">
      <DocHeader title={`Form Penilaian — ${SP_ROLE_LABELS[role]}`} semester={group.semester} academicYear={group.academic_year} />
      <table className="w-full text-sm">
        <tbody>
          <tr><td className="w-40 py-1">Nama Mahasiswa</td><td className="w-4 py-1">:</td><td className="py-1">{group.name}</td></tr>
          <tr><td className="py-1">NIM</td><td className="py-1">:</td><td className="py-1 font-sans">{member?.nim || '—'}</td></tr>
          <tr><td className="py-1">Peminatan</td><td className="py-1">:</td><td className="py-1">{group.field_location || '—'}</td></tr>
          <tr><td className="py-1 align-top">Judul Skripsi</td><td className="py-1 align-top">:</td><td className="py-1">{group.title || '—'}</td></tr>
          <tr><td className="py-1">Tempat Ujian</td><td className="py-1">:</td><td className="py-1">{group.venue || '—'}</td></tr>
          <tr><td className="py-1">Hari/Tanggal</td><td className="py-1">:</td><td className="py-1">{group.hari_tanggal || '—'}</td></tr>
          <tr><td className="py-1">Nama Penguji</td><td className="py-1">:</td><td className="py-1">{a?.display_name || '—'}</td></tr>
        </tbody>
      </table>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-sm text-gray-600 font-sans">
            Kelengkapan: <span className="font-semibold">{answered}/{criteria.length}</span> parameter
          </p>
          <p className="text-lg font-bold">
            Nilai Akhir: <span className={raw !== null ? 'text-emerald-800' : 'text-gray-300'}>{raw !== null ? raw.toFixed(2) : '—'}</span>
            <span className="text-gray-400 text-sm font-sans"> / 100</span>
          </p>
        </div>
        {isDosen && (
          <button onClick={onOpen} className="no-print bg-emerald-900 text-white px-4 py-2 rounded-lg hover:bg-emerald-800 font-sans text-sm font-medium">
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
      <p className="text-[11px] text-gray-500 font-sans">Nilai Akhir = (Total Skor Nilai x Bobot) / 400 x 100</p>
    </div>
  )
}

// ─── RUBRIC DIALOG ─────────────────────────────────────────────────────────
function RubricDialog({
  role, label, criteria, instance, scores, ratings, canEdit, onClose, onSave,
}: {
  role: SpAssessorRole; label: string; criteria: CriterionWithLevels[]
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
      init[c.id] = { level: r?.level_value != null ? Number(r.level_value) : null, note: r?.evidence_note || '' }
    })
    return init
  })
  const [saving, setSaving] = useState(false)

  const points = criteria.map((c) => {
    const d = drafts[c.id]
    if (!d || d.level === null) return null
    return calcCriterionPoints(d.level, Number(c.internal_weight))
  })
  const raw = calcRawFromCriterionPoints(points)
  const completed = criteria.filter((c) => drafts[c.id]?.level !== null).length

  const setLevel = (id: string, lv: number | null) =>
    setDrafts((p) => ({ ...p, [id]: { ...(p[id] || { note: '' }), level: lv } }))
  const setNote = (id: string, n: string) =>
    setDrafts((p) => ({ ...p, [id]: { ...(p[id] || { level: null }), note: n } }))

  const doSave = async () => {
    setSaving(true)
    const ok = await onSave(criteria.map((c) => ({
      criterionId: c.id, level: drafts[c.id]?.level ?? null, note: drafts[c.id]?.note || '',
    })))
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-6">
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 rounded-t-xl flex items-start justify-between gap-3">
          <div>
            <h2 className="font-bold text-lg">Form Penilaian</h2>
            <p className="text-xs text-gray-500 font-sans">{label}</p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none">x</button>
        </div>
        <div className="p-5 space-y-4">
          {criteria.length === 0 && <p className="text-amber-600 italic text-sm">Rubrik belum dimuat. Jalankan seed Seminar Proposal terlebih dahulu.</p>}
          {criteria.map((c, i) => {
            const d = drafts[c.id] || { level: null, note: '' }
            return (
              <div key={c.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className="font-semibold text-sm">
                    {i + 1}. {c.name} <span className="text-gray-400 text-[11px] font-sans">({(Number(c.internal_weight) * 100).toFixed(0)}%)</span>
                  </p>
                  <span className="text-[11px] text-gray-500 font-sans">
                    {d.level !== null ? `${calcCriterionPoints(d.level, Number(c.internal_weight)).toFixed(2)} poin` : '—'}
                  </span>
                </div>
                {c.evidence_guidance && <p className="text-xs text-gray-500 mt-1 italic">{c.evidence_guidance}</p>}
                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {c.levels.length === 0 && <p className="text-xs text-amber-600 italic col-span-full">Deskriptor belum tersedia.</p>}
                  {c.levels.map((lvl) => {
                    const selected = d.level === lvl.value
                    return (
                      <label key={lvl.value}
                        className={`flex items-start gap-2 rounded border p-2 cursor-pointer text-sm ${selected ? 'border-emerald-600 bg-emerald-50' : canEdit ? 'border-gray-200 hover:border-gray-300' : 'border-gray-200 opacity-70'}`}>
                        <input type="radio" name={`crit-${c.id}`} checked={selected} disabled={!canEdit}
                          onChange={() => setLevel(c.id, lvl.value)} className="mt-1 accent-emerald-900" />
                        <span>
                          <span className="font-semibold font-sans">Skor {lvl.value}</span>
                          <span className="block text-[11px] text-gray-500">{lvl.label}</span>
                          <span className="block text-xs text-gray-600 mt-0.5">{lvl.descriptor}</span>
                        </span>
                      </label>
                    )
                  })}
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  <label className="text-xs text-gray-600 font-sans whitespace-nowrap">Skor manual (0–4, 2 desimal):</label>
                  <input
                    type="number"
                    min={0}
                    max={4}
                    step={0.01}
                    disabled={!canEdit}
                    value={d.level ?? ''}
                    placeholder="3.75"
                    onChange={(e) => {
                      const raw = e.target.value
                      if (raw === '') { setLevel(c.id, null); return }
                      const n = Number(raw)
                      if (Number.isNaN(n)) return
                      setLevel(c.id, Math.min(4, Math.max(0, Math.round(n * 100) / 100)))
                    }}
                    className="w-28 border border-gray-300 rounded px-2 py-1.5 text-sm font-sans disabled:bg-gray-100"
                  />
                  <span className="text-[11px] text-gray-500 font-sans">
                    {d.level !== null ? `= ${calcCriterionPoints(d.level, Number(c.internal_weight)).toFixed(2)} poin` : 'belum diisi'}
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
              className="px-4 py-2 rounded bg-emerald-900 text-white text-sm font-sans hover:bg-emerald-800 disabled:opacity-50">
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
  roleRaw: (r: SpAssessorRole) => number | null; rerata: number | null
  grade: { huruf: string; skala: string } | null
}) {
  return (
    <div className="space-y-5">
      <DocHeader title="Rekapitulasi Nilai Seminar Proposal Skripsi" semester={group.semester} academicYear={group.academic_year} />
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
          {SP_ASSESSOR_ROLES.map((r, i) => {
            const a = assessors.find((x) => x.assessor_role === r)
            const v = roleRaw(r)
            return (
              <tr key={r} className="border-b border-gray-200">
                <td className="py-3 text-center">{i + 1}</td>
                <td className="py-3">{a?.display_name || '—'}</td>
                <td className="py-3 text-sm text-gray-600">{SP_ROLE_LABELS[r]}</td>
                <td className="py-3 text-center font-semibold font-sans">{v !== null ? v.toFixed(2) : '—'}</td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-black font-bold">
            <td colSpan={3} className="text-right py-3">Rerata Nilai Hasil Seminar</td>
            <td className="py-3 text-center">{rerata !== null ? rerata.toFixed(2) : '—'}</td>
          </tr>
        </tfoot>
      </table>
      <div className="border border-gray-300 rounded-lg p-4 flex items-center justify-between">
        <span className="text-sm text-gray-600">Hasil Seminar</span>
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
    </div>
  )
}

// ─── PREVIEW ───────────────────────────────────────────────────────────────
function PreviewTab({
  group, member, assessors, criteria, roleRaw, ratingsFor, rerata, grade, screenshots,
}: {
  group: PblGroup; member: PblGroupMember | null; assessors: PblAssessor[]
  criteria: CriterionWithLevels[]; roleRaw: (r: SpAssessorRole) => number | null
  ratingsFor: (r: SpAssessorRole) => Record<string, { level: number | null; points: number | null }>
  rerata: number | null; grade: { huruf: string; skala: string } | null
  screenshots: SpScreenshots
}) {
  const sig = (role: SpAssessorRole) => assessors.find((a) => a.assessor_role === role)?.signature_path
  const handlePrint = () => window.print()
  const shotRows = screenshots.hadir.filter((r) => r.bukti)
  const hasShot = shotRows.length > 0 || !!screenshots.overall

  return (
    <div data-sp-preview-root="true">
      <div className="no-print mb-4 flex justify-end gap-3 print:hidden">
        <button onClick={handlePrint}
          className="bg-emerald-900 text-white px-5 py-2.5 rounded-lg hover:bg-emerald-800 font-sans text-sm font-medium shadow">
          🖨 Cetak / Simpan PDF
        </button>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm 14mm 14mm 14mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          body * { visibility: hidden; }
          [data-sp-preview-root='true'],
          [data-sp-preview-root='true'] * { visibility: visible; }
          [data-sp-preview-root='true'] { position: absolute !important; inset: 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
          [data-sp-preview-root='true'] .print-area { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
          [data-sp-preview-root='true'] .sp-preview-section { width: 100% !important; margin: 0 !important; padding: 0 !important; }
          [data-sp-preview-root='true'] .sp-preview-section + .sp-preview-section { break-before: page !important; page-break-before: always !important; }
          [data-sp-preview-root='true'] [data-preview-doc-header='true'],
          [data-sp-preview-root='true'] .avoid-break { break-inside: avoid !important; page-break-inside: avoid !important; }
          [data-sp-preview-root='true'] .signature-block { break-inside: avoid !important; page-break-inside: avoid !important; width: 74mm !important; max-width: 74mm !important; margin-left: auto !important; margin-right: 0 !important; }
          [data-sp-preview-root='true'] table { width: 100% !important; max-width: 100% !important; border-collapse: collapse !important; }
          [data-sp-preview-root='true'] thead { display: table-header-group !important; }
          [data-sp-preview-root='true'] tr { break-inside: avoid !important; page-break-inside: avoid !important; }
          [data-sp-preview-root='true'] img { print-color-adjust: exact; -webkit-print-color-adjust: exact; max-width: 100% !important; }
        }
      `}</style>

      <div className="print-area space-y-10 bg-white p-8 md:p-12 print:space-y-0 print:p-0"
        style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>

        {/* ===== BERITA ACARA (halaman 1) ===== */}
        <section className="sp-preview-section">
          <DocHeader title="Laporan Seminar Proposal Skripsi" semester={group.semester} academicYear={group.academic_year} />
          <div className="text-sm leading-relaxed">
            <p>
              Pada hari <span className="border-b border-gray-500 px-6 inline-block min-w-[10rem]">{group.hari_tanggal || '............'}</span> telah dilaksanakan seminar proposal skripsi.
            </p>
            <table className="mt-4 w-full text-sm">
              <tbody>
                <tr><td className="w-40 py-1">Nama Mahasiswa</td><td className="w-4 py-1">:</td><td className="py-1 font-semibold">{group.name}</td></tr>
                <tr><td className="py-1">NIM</td><td className="py-1">:</td><td className="py-1 font-sans font-semibold">{member?.nim || '—'}</td></tr>
                <tr><td className="py-1">Peminatan</td><td className="py-1">:</td><td className="py-1">{group.field_location || '—'}</td></tr>
                <tr><td className="py-1 align-top">Judul Skripsi</td><td className="py-1 align-top">:</td><td className="py-1">{group.title || '—'}</td></tr>
                <tr><td className="py-1">Waktu</td><td className="py-1">:</td><td className="py-1">{group.start_time && group.end_time ? `${group.start_time} – ${group.end_time}` : '—'}</td></tr>
                <tr><td className="py-1">Tempat</td><td className="py-1">:</td><td className="py-1">{group.venue || '—'}</td></tr>
              </tbody>
            </table>
            <p className="mt-4">
              Dinyatakan yang bersangkutan:{' '}
              <span className="font-bold">{group.decision === 'Lulus' ? 'LULUS' : group.decision === 'Tidak Lulus' ? 'TIDAK LULUS' : '........................'}</span>
            </p>
            {group.report_notes && <p className="mt-2 text-gray-700">Catatan: {group.report_notes}</p>}
            <p className="mt-4 text-justify">
              Demikian laporan seminar proposal ini dibuat sebagai laporan selama seminar berlangsung
              untuk diketahui dan dipergunakan sebagaimana mestinya.
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
                {SP_ASSESSOR_ROLES.map((r, i) => {
                  const a = assessors.find((x) => x.assessor_role === r)
                  return (
                    <tr key={r} className="border-b border-gray-200">
                      <td className="py-4 text-center">{i + 1}</td>
                      <td className="py-4">{a?.display_name || '—'}</td>
                      <td className="py-4 text-sm text-gray-600">{SP_ROLE_LABELS[r]}</td>
                      <td className="py-4 text-center">
                        {sig(r) ? <img src={sig(r)!} alt={SP_ROLE_SHORT[r]} className="max-h-14 max-w-28 object-contain mx-auto" /> : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-10 flex justify-end text-center text-sm signature-block">
            <div>
              <p>Jakarta, {group.tanggal_ba || '.............. 2026'}</p>
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
        {SP_ASSESSOR_ROLES.map((role) => {
          const a = assessors.find((x) => x.assessor_role === role)
          const m = ratingsFor(role)
          return (
            <section key={role} className="sp-preview-section">
              <DocHeader title={`Formulir Penilaian — ${SP_ROLE_LABELS[role]}`} semester={group.semester} academicYear={group.academic_year} />
              <table className="w-full text-sm">
                <tbody>
                  <tr><td className="w-40 py-0.5">Nama Mahasiswa</td><td className="w-4 py-0.5">:</td><td className="py-0.5">{group.name}</td></tr>
                  <tr><td className="py-0.5">NIM</td><td className="py-0.5">:</td><td className="py-0.5 font-sans">{member?.nim || '—'}</td></tr>
                  <tr><td className="py-0.5 align-top">Judul Skripsi</td><td className="py-0.5 align-top">:</td><td className="py-0.5">{group.title || '—'}</td></tr>
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
              <p className="text-[11px] text-gray-500 font-sans mt-1">Nilai Akhir = (Total Skor Nilai × Bobot) / 400 × 100</p>
              <div className="mt-4 flex justify-end text-center text-sm signature-block">
                <div>
                  <p>{group.tanggal_ba || '.............. 2026'}</p>
                  <p className="mt-1 font-semibold">{SP_ROLE_LABELS[role]}</p>
                  {sig(role)
                    ? <img src={sig(role)!} alt={SP_ROLE_SHORT[role]} className="max-h-14 object-contain mx-auto mt-1" />
                    : <div className="w-48 border-b border-gray-500 mt-6 mx-auto" />}
                  <p className="mt-1 font-semibold">{a?.display_name || '..........................'}</p>
                </div>
              </div>
            </section>
          )
        })}

        {/* ===== REKAPITULASI ===== */}
        <section className="sp-preview-section">
          <DocHeader title="Rekapitulasi Nilai Seminar Proposal Skripsi" semester={group.semester} academicYear={group.academic_year} />
          <table className="w-full text-sm template-table">
            <thead><tr className="border-b border-black">
              <th className="w-8">No</th><th className="text-left">Parameter</th><th className="w-14">Bobot</th>
              {SP_ASSESSOR_ROLES.map((r) => <th key={r} className="w-20">{SP_ROLE_SHORT[r].split(' ')[0]}</th>)}
            </tr></thead>
            <tbody>
              {criteria.map((c, i) => (
                <tr key={c.id} className="border-b border-gray-200">
                  <td className="text-center">{i + 1}.</td>
                  <td>{c.name}</td>
                  <td className="text-center font-sans">{(Number(c.internal_weight) * 100).toFixed(0)}%</td>
                  {SP_ASSESSOR_ROLES.map((r) => <td key={r} className="text-center font-sans">{roleRaw(r) !== null ? roleRaw(r)!.toFixed(2) : ''}</td>)}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="font-bold border-t-2 border-black">
                <td colSpan={2} className="text-right">Rerata Nilai Hasil Seminar</td>
                <td></td>
                <td colSpan={3} className="text-center">{rerata !== null ? rerata.toFixed(2) : '—'}</td>
              </tr>
            </tfoot>
          </table>
          <p className="text-sm mt-3">
            Hasil seminar proposal:{' '}
            <span className="font-bold">{grade ? `${grade.huruf} (${grade.skala})` : rerata !== null ? 'TIDAK LULUS' : '—'}</span>
          </p>
        </section>

        {/* ===== TANGKAPAN LAYAR — hanya tampil bila diisi (seminar daring) ===== */}
        {hasShot ? (
          <section className="sp-preview-section">
            <DocHeader title="Tangkapan Layar Seminar Proposal Skripsi" semester={group.semester} academicYear={group.academic_year} />
            {shotRows.length > 0 && (
              <>
                <h3 className="font-bold text-base mb-2">Daftar Hadir (Screencapture)</h3>
                <table className="w-full text-sm border border-gray-300">
                  <thead><tr className="bg-gray-100 border-b border-gray-300">
                    <th className="w-10 py-2">No</th>
                    <th className="py-2 text-left">Nama</th>
                    <th className="py-2 text-left">Jabatan</th>
                    <th className="w-52 py-2">Bukti Wajah</th>
                  </tr></thead>
                  <tbody>
                    {shotRows.map((r, i) => (
                      <tr key={i} className="border-b border-gray-200 align-middle">
                        <td className="py-3 text-center">{i + 1}.</td>
                        <td className="py-3">{r.nama || '—'}</td>
                        <td className="py-3 text-sm text-gray-600">{r.jabatan}</td>
                        <td className="py-3 text-center">
                          <img src={r.bukti!} alt={`Bukti ${r.jabatan}`} className="max-h-24 max-w-48 object-contain mx-auto border rounded" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
            {screenshots.overall && (
              <>
                <h3 className="font-bold text-base mt-6 mb-2">Bukti Tangkapan Layar Secara Keseluruhan</h3>
                <img src={screenshots.overall} alt="Tangkapan layar keseluruhan" className="max-w-full border rounded" />
              </>
            )}
          </section>
        ) : null}
      </div>
    </div>
  )
}

// ─── TANGKAPAN LAYAR ───────────────────────────────────────────────────────
function ScreenshotTab({
  group, member, assessors, screenshots, isDosen, onChange,
}: {
  group: PblGroup; member: PblGroupMember | null; assessors: PblAssessor[]
  screenshots: SpScreenshots; isDosen: boolean
  onChange: (s: SpScreenshots) => void
}) {
  const setRow = (i: number, patch: Partial<SpScreenshots['hadir'][number]>) => {
    const hadir = screenshots.hadir.map((r, idx) => (idx === i ? { ...r, ...patch } : r))
    onChange({ ...screenshots, hadir })
  }

  // Prefill examiner names from the Berita Acara TIM PENGUJI entries.
  const prefill = () => {
    const roleFor = (idx: number): SpAssessorRole | null =>
      idx === 0 ? 'penguji_1' : idx === 1 ? 'penguji_2' : idx === 2 ? 'pembimbing_1' : null
    const hadir = screenshots.hadir.map((r, i) => {
      const role = roleFor(i)
      const name = role ? assessors.find((a) => a.assessor_role === role)?.display_name : ''
      return { ...r, nama: r.nama || name || (i === 3 ? member?.name || '' : '') }
    })
    onChange({ ...screenshots, hadir })
  }

  return (
    <div className="space-y-6">
      <DocHeader title="Tangkapan Layar (Screencapture)" semester={group.semester} academicYear={group.academic_year} />
      <p className="text-sm text-gray-600 font-sans">
        Diisi bila seminar dilaksanakan <strong>daring</strong>. Unggah tangkapan layar bukti kehadiran tiap peserta,
        lalu satu gambar tangkapan layar keseluruhan. Gambar ikut tercetak pada tab <em>Preview &amp; PDF</em>.
      </p>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="font-bold text-base">Daftar Hadir (Screencapture)</h3>
        {isDosen && (
          <button type="button" onClick={prefill}
            className="text-xs font-sans text-emerald-800 border border-emerald-300 rounded px-3 py-1.5 hover:bg-emerald-50">
            Isi nama dari TIM PENGUJI
          </button>
        )}
      </div>

      <table className="w-full text-sm border border-gray-300">
        <thead><tr className="bg-gray-100 border-b border-gray-300">
          <th className="w-10 py-2">No</th>
          <th className="py-2 text-left">Nama</th>
          <th className="py-2 text-left">Jabatan</th>
          <th className="w-56 py-2">Bukti Wajah</th>
        </tr></thead>
        <tbody>
          {screenshots.hadir.map((r, i) => (
            <tr key={i} className="border-b border-gray-200 align-top">
              <td className="py-3 text-center">{i + 1}.</td>
              <td className="py-3">
                <input value={r.nama} disabled={!isDosen} onChange={(e) => setRow(i, { nama: e.target.value })}
                  placeholder={i === 3 ? (member?.name || 'Nama mahasiswa') : 'Nama dosen'}
                  className="w-full border-b border-gray-400 bg-transparent text-sm disabled:opacity-60" />
              </td>
              <td className="py-3 text-sm text-gray-600">{r.jabatan}</td>
              <td className="py-3">
                {isDosen ? (
                  <SpImageUpload groupCode={group.code} slot={['ketua', 'anggota_2', 'anggota_3', 'mahasiswa'][i]}
                    label={r.jabatan} value={r.bukti} onChange={(v) => setRow(i, { bukti: v })} />
                ) : r.bukti ? (
                  <img src={r.bukti} alt={r.jabatan} className="max-h-20 max-w-40 object-contain border rounded mx-auto" />
                ) : (
                  <span className="text-[10px] text-gray-400 italic">(belum ada bukti)</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div>
        <h3 className="font-bold text-base mb-2">Bukti Tangkapan Layar Secara Keseluruhan</h3>
        {isDosen ? (
          <SpImageUpload groupCode={group.code} slot="overall" label="Tangkapan layar keseluruhan"
            value={screenshots.overall} onChange={(v) => onChange({ ...screenshots, overall: v })} />
        ) : screenshots.overall ? (
          <img src={screenshots.overall} alt="Tangkapan layar keseluruhan" className="max-w-full border rounded" />
        ) : (
          <p className="text-gray-400 text-sm italic">Belum ada bukti</p>
        )}
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
      <p className="text-sm uppercase">Program Studi Kesehatan Masyarakat Program Sarjana</p>
      <p className="text-sm uppercase">Fakultas Ilmu Kesehatan UPN &ldquo;Veteran&rdquo; Jakarta</p>
      <p className="text-xs mt-1 font-sans">SEMESTER {semester || 'Ganjil'} T.A. {academicYear || '2026/2027'}</p>
    </div>
  )
}
