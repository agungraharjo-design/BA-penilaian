'use client';

import { useEffect, useMemo, useState, useRef, useCallback, memo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/app/components/AuthProvider';
import { isDosenEmail } from '@/lib/dosen';
import { S2SignatureUpload } from '@/app/components/common/S2SignatureUpload';
import { getPblBlueprint } from '@/lib/pbl1/repositories';
import type {
  PblGroup,
  PblGroupMember,
  PblAssessor,
  PblBlueprint,
  PblAssessmentInstance,
  PblAssessmentScore,
  PblRubricRating,
  PblPeerFinalScore,
  PblComponentCode,
  PblAssessorRole,
  PblRubricDescriptor,
} from '@/types/pbl1';
import {
  PBL_ROLE_LABELS,
  PBL_STATUS_LABELS,
  PBL_COMPONENT_LABELS,
  PBL_COMPONENT_WEIGHTS,
} from '@/types/pbl1';
import {
  calcCriterionPoints,
  calcComponentRawFromCriterionPoints,
  calcExaminerAverage,
  type ComponentRawScores,
  calcPblGrade,
  calcPblBreakdown,
} from '@/lib/pbl1/calculations';

type Tab =
  | 'berita-acara'
  | 'form-penguji-1'
  | 'form-penguji-2'
  | 'laporan-individu'
  | 'peer-mahasiswa'
  | 'rekap'
  | 'preview';

const PENGUJI_ROLES: PblAssessorRole[] = ['penguji_1', 'penguji_2'];
const PENGUJI_1_COMPONENTS: PblComponentCode[] = ['E1', 'E2'];
const PENGUJI_2_COMPONENTS: PblComponentCode[] = ['B1', 'B2'];
const INDIVIDUAL_COMPONENTS: PblComponentCode[] = ['I1', 'I2'];

const LEVEL_LABELS: Record<number, string> = {
  4: 'Melampaui Standar',
  3: 'Memenuhi Standar',
  2: 'Mendekati Standar',
  1: 'Belum Memenuhi Standar',
  0: 'Tidak Ada Bukti',
};

const PEER_REFERENCE_CRITERIA = [
  'Kedisiplinan',
  'Kontribusi',
  'Komunikasi',
  'Problem Solving',
  'Leadership',
];

export interface CriterionWithLevels {
  id: string;
  code: string;
  name: string;
  weight: number;
  evidence_guidance: string | null;
  levels: { value: number; label: string; descriptor: string; scoring_note: string | null }[];
}

export interface RatingDraft {
  level: number | null;
  note: string;
}

function DocHeader({
  title, semester, academicYear, isDosen, onUpdate,
}: {
  title: string; semester: string; academicYear: string; isDosen?: boolean;
  onUpdate?: (f: keyof PblGroup, v: any) => void;
}) {
  return (
    <div className="text-center border-b-2 border-black pb-4">
      <img
        src="/kop-surat-resize.png"
        alt="KOP UPN Veteran Jakarta"
        style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }}
      />
      <h1 className="text-xl font-bold uppercase">{title}</h1>
      <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT</p>
      <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
      {isDosen && onUpdate ? (
        <p className="text-sm font-semibold">SEMESTER{' '}
          <input value={semester} onChange={(e) => onUpdate('semester', e.target.value)} className="border-b border-gray-400 bg-transparent text-center w-24 font-semibold" />{' '}
          T.A.{' '}
          <input value={academicYear} onChange={(e) => onUpdate('academic_year', e.target.value)} className="border-b border-gray-400 bg-transparent text-center w-28 font-semibold" placeholder="2025/2026" />
        </p>
      ) : (
        <p className="text-sm font-semibold">SEMESTER {semester} T.A. {academicYear}</p>
      )}
    </div>
  );
}

export default function PblSessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const groupId = params.id as string;
  const { profile, isDosen, isSuperadmin } = useAuth();

  const [group, setGroup] = useState<PblGroup | null>(null);
  const [members, setMembers] = useState<PblGroupMember[]>([]);
  const [assessors, setAssessors] = useState<PblAssessor[]>([]);
  const [instances, setInstances] = useState<PblAssessmentInstance[]>([]);
  const [scores, setScores] = useState<PblAssessmentScore[]>([]);
  const [ratings, setRatings] = useState<PblRubricRating[]>([]);
  const [peers, setPeers] = useState<PblPeerFinalScore[]>([]);
  const [blueprint, setBlueprint] = useState<PblBlueprint | null>(null);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('berita-acara');
  const [syncStatus, setSyncStatus] = useState<'live' | 'saving' | 'offline'>('live');

  // Editing capability: superadmin/koordinator/admin or any dosen role.
  const canEdit = isDosen || isSuperadmin;

  const groupRef = useRef<PblGroup | null>(null);
  const dirtyFields = useRef<Set<string>>(new Set());
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const savingRef = useRef(false);

  const saveNow = useCallback(async () => {
    if (savingRef.current) return;
    const current = groupRef.current;
    if (!current) return;
    const toSave: Partial<PblGroup> = { updated_at: new Date().toISOString() };
    let hasChanges = false;
    for (const f of Array.from(dirtyFields.current)) {
      (toSave as any)[f] = (current as any)[f];
      hasChanges = true;
    }
    if (!hasChanges) return;
    savingRef.current = true;
    setSyncStatus('saving');
    const { error } = await supabase.from('pbl_groups').update(toSave).eq('id', current.id);
    if (!error) dirtyFields.current.clear();
    savingRef.current = false;
    setSyncStatus(error ? 'offline' : 'live');
  }, []);

  const updateGroupField = useCallback((f: keyof PblGroup, v: any) => {
    setGroup((prev) => {
      if (!prev) return prev;
      const next = { ...prev, [f]: v } as PblGroup;
      groupRef.current = next;
      dirtyFields.current.add(f);
      return next;
    });
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { void saveNow(); }, 800);
  }, [saveNow]);

  useEffect(() => {
    loadAll();
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      if (dirtyFields.current.size > 0) void saveNow();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  async function loadAll() {
    setLoading(true);
    const bp = await getPblBlueprint();
    setBlueprint(bp);
    const [groupRes, memberRes, assessorRes, instanceRes] = await Promise.all([
      supabase.from('pbl_groups').select('*').eq('id', groupId).single(),
      supabase.from('pbl_group_members').select('*').eq('group_id', groupId).order('name'),
      supabase.from('pbl_assessors').select('*').eq('group_id', groupId).order('sequence_no'),
      supabase.from('pbl_assessment_instances').select('*').eq('group_id', groupId),
    ]);

    if (groupRes.error || !groupRes.data) { setLoading(false); return; }
    const g = groupRes.data as PblGroup;
    setGroup(g);
    groupRef.current = g;
    const instRows = (instanceRes.data as PblAssessmentInstance[]) || [];
    setMembers((memberRes.data as PblGroupMember[]) || []);
    setAssessors((assessorRes.data as PblAssessor[]) || []);
    setInstances(instRows);

    const instIds = instRows.map((i) => i.id);
    let sc: PblAssessmentScore[] = [];
    let rt: PblRubricRating[] = [];
    if (instIds.length) {
      const scoreRes = await supabase.from('pbl_assessment_scores').select('*').in('instance_id', instIds);
      sc = (scoreRes.data as PblAssessmentScore[]) || [];
      const scoreIds = sc.map((s) => s.id);
      if (scoreIds.length) {
        const ratingRes = await supabase.from('pbl_rubric_ratings').select('*').in('assessment_score_id', scoreIds);
        rt = (ratingRes.data as PblRubricRating[]) || [];
      }
    }
    setScores(sc);
    setRatings(rt);
    const peerRes = await supabase.from('pbl_peer_final_scores').select('*').eq('group_id', groupId);
    setPeers((peerRes.data as PblPeerFinalScore[]) || []);
    setLoading(false);
  }

  const criteriaOf = useCallback((code: PblComponentCode): CriterionWithLevels[] => {
    const db = blueprint?.criteria.filter((c) => c.component_code === code && c.active);
    if (!db || db.length === 0) return [];
    const byId = new Map<string, PblRubricDescriptor[]>();
    (blueprint?.descriptors || []).forEach((d) => {
      const arr = byId.get(d.criterion_id) || [];
      arr.push(d);
      byId.set(d.criterion_id, arr);
    });
    return db.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      weight: Number(c.internal_weight),
      evidence_guidance: c.evidence_guidance,
      levels: (byId.get(c.id) || []).sort((a, b) => b.level_value - a.level_value).map((d) => ({
        value: d.level_value,
        label: d.level_label,
        descriptor: d.descriptor_text,
        scoring_note: d.scoring_note,
      })),
    }));
  }, [blueprint]);

  const rubricVersion = (code: PblComponentCode): string => {
    const inst = instances.find((i) => i.component_code === code);
    return inst?.rubric_version || group?.blueprint_version || 'pbl1-rps-v1';
  };

  const componentMeta = useCallback((code: PblComponentCode) => {
    const comp = blueprint?.components.find((c) => c.code === code);
    return {
      name: comp?.name || PBL_COMPONENT_LABELS[code] || code,
      weight: comp ? Number(comp.rps_weight) : PBL_COMPONENT_WEIGHTS[code],
      cpmk: comp?.cpmk_code || (code === 'I1' || code === 'B1' || code === 'B2' ? 'CPMK1' : 'CPMK2'),
      scope: comp?.default_scope || 'INDIVIDUAL',
    };
  }, [blueprint]);

  const instanceFor = useCallback((code: PblComponentCode, role: string | null): PblAssessmentInstance | null => {
    return instances.find((i) => i.component_code === code && (i.assessor_role ?? null) === role) || null;
  }, [instances]);

  const scoreFor = useCallback((instId: string | null, memberId: string | null): PblAssessmentScore | null => {
    if (!instId) return null;
    return scores.find((s) => s.instance_id === instId && (s.student_id ?? null) === memberId) || null;
  }, [scores]);

  const pointsOf = useCallback((scoreId: string | null): (number | null)[] => {
    if (!scoreId) return [];
    return ratings.filter((r) => r.assessment_score_id === scoreId).map((r) => r.criterion_points);
  }, [ratings]);

  const rawOf = useCallback((scoreId: string | null): number | null => {
    return calcComponentRawFromCriterionPoints(pointsOf(scoreId));
  }, [pointsOf]);

  // Raw 0-100 for (component, assessorRole, memberId). memberId null => group score.
  const componentRaw = useCallback((code: PblComponentCode, role: string | null, memberId: string | null): number | null => {
    const inst = instanceFor(code, role);
    if (!inst) return null;
    return rawOf(scoreFor(inst.id, memberId)?.id ?? null);
  }, [instanceFor, scoreFor, rawOf]);

  // Average across examiners for a group component (Examiner logic: no overwrite).
  const averageGroupRaw = useCallback((code: PblComponentCode, roles: PblAssessorRole[]): number | null => {
    const raws = roles
      .map((r) => componentRaw(code, r, null))
      .filter((v): v is number => v !== null);
    return calcExaminerAverage(raws);
  }, [componentRaw]);

  const peerOf = useCallback((memberId: string): PblPeerFinalScore | null => {
    return peers.find((p) => p.student_id === memberId) || null;
  }, [peers]);

  const memberSummary = useCallback((m: PblGroupMember): ComponentRawScores & {
    cpmk1: number | null; cpmk2: number | null; finalScore: number | null; grade: string | null; complete: boolean; missing: string[];
  } => {
    const raw: ComponentRawScores = {
      I1: componentRaw('I1', null, m.id),
      I2: componentRaw('I2', null, m.id),
      P1: peerOf(m.id)?.final_peer_score ?? null,
      B1: averageGroupRaw('B1', ['penguji_2']),
      B2: averageGroupRaw('B2', ['penguji_2']),
      E1: averageGroupRaw('E1', ['penguji_1']),
      E2: averageGroupRaw('E2', ['penguji_1']),
    };
    const calc = calcPblBreakdown(raw);
    return {
      ...raw,
      cpmk1: calc.cpmk1,
      cpmk2: calc.cpmk2,
      finalScore: calc.finalScore,
      grade: calc.finalScore !== null ? calcPblGrade(calc.finalScore) : null,
      complete: calc.complete,
      missing: calc.missing,
    };
  }, [componentRaw, averageGroupRaw, peerOf]);

  // Ensure instance exists; returns it (creates when missing).
  async function ensureInstance(code: PblComponentCode, role: string | null): Promise<PblAssessmentInstance | null> {
    const existing = instanceFor(code, role);
    if (existing) return existing;
    let query = supabase
      .from('pbl_assessment_instances')
      .select('*')
      .eq('group_id', groupId)
      .eq('component_code', code);
    query = role ? query.eq('assessor_role', role) : query.is('assessor_role', null);
    const { data } = await query.maybeSingle();
    if (data) {
      setInstances((prev) => [...prev, data as PblAssessmentInstance]);
      return data as PblAssessmentInstance;
    }
    const { data: inserted, error } = await supabase
      .from('pbl_assessment_instances')
      .insert({ group_id: groupId, component_code: code, rubric_version: rubricVersion(code), assessor_role: role, status: 'DRAFT' })
      .select('*')
      .single();
    if (error) return null;
    setInstances((prev) => [...prev, inserted as PblAssessmentInstance]);
    return inserted as PblAssessmentInstance;
  }

  async function saveRubric(
    code: PblComponentCode,
    assessorRole: string | null,
    memberId: string | null,
    drafts: { criterionId: string; level: number | null; note: string }[],
  ) {
    const inst = await ensureInstance(code, assessorRole);
    if (!inst) { setSyncStatus('offline'); return false; }
    let scoreRow = scoreFor(inst.id, memberId);
    if (!scoreRow) {
      const { data, error } = await supabase
        .from('pbl_assessment_scores')
        .insert({ instance_id: inst.id, student_id: memberId, entered_by: profile?.id, score_source: 'RUBRIC_CALCULATED' })
        .select('*')
        .single();
      if (error) { setSyncStatus('offline'); return false; }
      scoreRow = data as PblAssessmentScore;
      setScores((prev) => [...prev, scoreRow!]);
    }
    const criteria = criteriaOf(code);
    let ok = true;
    for (const d of drafts) {
      const crit = criteria.find((c) => c.id === d.criterionId);
      const points = d.level !== null && crit ? calcCriterionPoints(d.level, crit.weight) : null;
      const descriptor = d.level !== null && crit
        ? crit.levels.find((l) => l.value === d.level)?.descriptor || null
        : null;
      const payload: Record<string, unknown> = {
        assessment_score_id: scoreRow.id,
        criterion_id: d.criterionId,
        level_value: d.level,
        criterion_points: points,
        evidence_note: d.note || null,
        selected_descriptor_snapshot: descriptor,
      };
      if (d.level === null) {
        // clear rating row entirely when deselected
        const { error } = await supabase.from('pbl_rubric_ratings').delete().eq('assessment_score_id', scoreRow.id).eq('criterion_id', d.criterionId);
        if (error) ok = false;
        continue;
      }
      const { error } = await supabase.from('pbl_rubric_ratings')
        .upsert(payload, { onConflict: 'assessment_score_id,criterion_id' });
      if (error) ok = false;
    }
    // recompute raw score after ratings changed
    const { data: fresh } = await supabase.from('pbl_rubric_ratings').select('*').eq('assessment_score_id', scoreRow.id);
    const freshRatings = (fresh as PblRubricRating[]) || [];
    setRatings((prev) => prev.filter((r) => r.assessment_score_id !== scoreRow!.id).concat(freshRatings));
    const raw = calcComponentRawFromCriterionPoints(freshRatings.map((r) => r.criterion_points));
    const { error: rawErr } = await supabase.from('pbl_assessment_scores')
      .update({ calculated_raw_score: raw, final_raw_score: raw, updated_at: new Date().toISOString() })
      .eq('id', scoreRow.id);
    if (!rawErr) {
      setScores((prev) => prev.map((s) => s.id === scoreRow!.id ? { ...s, calculated_raw_score: raw, final_raw_score: raw } : s));
    }
    setSyncStatus(ok && !rawErr ? 'live' : 'offline');
    return ok && !rawErr;
  }

  async function savePeer(memberId: string, v: Partial<PblPeerFinalScore>) {
    setSyncStatus('saving');
    const { error } = await supabase.from('pbl_peer_final_scores')
      .upsert({ group_id: groupId, student_id: memberId, ...v }, { onConflict: 'group_id,student_id' })
      .select();
    if (error) { setSyncStatus('offline'); return; }
    const { data } = await supabase.from('pbl_peer_final_scores').select('*').eq('group_id', groupId);
    setPeers((data as PblPeerFinalScore[]) || []);
    setSyncStatus('live');
  }

  async function addMember(name: string, nim: string, role: 'member' | 'leader') {
    const { error } = await supabase.from('pbl_group_members').insert({ group_id: groupId, name, nim: nim || '', role });
    if (error) { alert('Gagal menambah mahasiswa: ' + error.message); return; }
    const { data: list } = await supabase.from('pbl_group_members').select('*').eq('group_id', groupId).order('name');
    setMembers((list as PblGroupMember[]) || []);
  }

  async function removeMember(id: string) {
    if (!confirm('Hapus anggota ini?')) return;
    const { error } = await supabase.from('pbl_group_members').delete().eq('id', id);
    if (error) { alert('Gagal menghapus: ' + error.message); return; }
    setMembers((prev) => prev.filter((m) => m.id !== id));
  }

  async function saveAssessor(role: string, data: { display_name: string; nip: string }) {
    const existing = assessors.find((a) => a.assessor_role === role);
    const payload = { ...data, group_id: groupId, assessor_role: role };
    if (existing) {
      const { error } = await supabase.from('pbl_assessors').update(payload).eq('id', existing.id);
      if (error) return alert('Gagal menyimpan ' + role + ': ' + error.message);
    } else {
      const { error } = await supabase.from('pbl_assessors').insert(payload);
      if (error) return alert('Gagal menambah ' + role + ': ' + error.message);
    }
    const { data: list } = await supabase.from('pbl_assessors').select('*').eq('group_id', groupId).order('sequence_no');
    setAssessors((list as PblAssessor[]) || []);
  }

  async function saveAssessorSignature(id: string, path: string) {
    const { error } = await supabase.from('pbl_assessors').update({ signature_path: path }).eq('id', id);
    if (error) return;
    const { data: list } = await supabase.from('pbl_assessors').select('*').eq('group_id', groupId).order('sequence_no');
    setAssessors((list as PblAssessor[]) || []);
  }

  // Rubric dialog state: {code, role, memberId, targetLabel, memberOrder, index}
  const [dialog, setDialog] = useState<{
    code: PblComponentCode; role: string | null; memberId: string | null; targetLabel: string;
    order: PblGroupMember[]; index: number;
  } | null>(null);
  const [viewDetail, setViewDetail] = useState<{ memberId: string | null; targetLabel: string; code: PblComponentCode } | null>(null);

  const activeMembers = useMemo(() => members.filter((m) => m.active), [members]);

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-gray-500 font-serif text-lg">Memuat data kelompok...</div>;
  if (!group) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-red-500 font-serif text-lg gap-4">
      <p>Kelompok tidak ditemukan</p>
      <Link href="/pbl/sessions" className="text-blue-700 underline">← Kembali ke daftar</Link>
    </div>
  );

  // Match current user to their penguji assignment — same logic as S1/S2.
  const whitelistMatch = profile?.email ? isDosenEmail(profile.email) : null;
  const canonicalName = whitelistMatch?.nama || '';
  const dbFullName = profile?.full_name || '';
  const emailPrefix = profile?.email?.split('@')[0] || '';
  const allUserNames = [canonicalName, dbFullName, emailPrefix].filter(Boolean);

  const matchPenguji = (pengujiName: string) => {
    if (allUserNames.length === 0 || !pengujiName) return false;
    const normalize = (s: string) => s.toLowerCase().replace(/[,.\-]/g, '').replace(/\s+/g, ' ').trim();
    const b = normalize(pengujiName);
    for (const name of allUserNames) {
      const a = normalize(name);
      if (a === b) return true;
      if (a.includes(b) || b.includes(a)) return true;
      const wordsA = a.split(' ').filter((w: string) => w.length > 2);
      const wordsB = b.split(' ').filter((w: string) => w.length > 2);
      if (wordsA.length >= 2 && wordsB.length >= 2 && wordsA[0] === wordsB[0] && wordsA[1] === wordsB[1]) return true;
    }
    return false;
  };

  let allowedPenguji: number[] | null = null; // null = no form penguji access
  if (!isSuperadmin && isDosen) {
    const matched = PENGUJI_ROLES.map((role) => matchPenguji(assessors.find((a) => a.assessor_role === role)?.display_name || ''));
    const matchedIndices = matched.map((m, i) => (m ? i : -1)).filter((i) => i >= 0);
    if (matchedIndices.length > 0) {
      allowedPenguji = matchedIndices;
    }
  }

  const allTabs: { key: Tab; label: string }[] = [
    { key: 'berita-acara', label: 'Berita Acara' },
    { key: 'form-penguji-1', label: 'Form Penguji 1' },
    { key: 'form-penguji-2', label: 'Form Penguji 2' },
    { key: 'laporan-individu', label: 'Laporan Individu' },
    { key: 'peer-mahasiswa', label: 'Peer Mahasiswa' },
    { key: 'rekap', label: 'Rekapitulasi' },
    { key: 'preview', label: 'Preview & PDF' },
  ];

  const tabs = isDosen
    ? allTabs.filter((t) => {
        if (isSuperadmin) return true;
        if (t.key === 'form-penguji-1') return allowedPenguji !== null && allowedPenguji.includes(0);
        if (t.key === 'form-penguji-2') return allowedPenguji !== null && allowedPenguji.includes(1);
        return true;
      })
    : allTabs.filter((t) => t.key === 'berita-acara' || t.key === 'laporan-individu' || t.key === 'peer-mahasiswa' || t.key === 'rekap' || t.key === 'preview');

  // Shared handlers for matrix cards
  const openDialogFor = (code: PblComponentCode, role: string | null, memberId: string | null, targetLabel: string) => {
    setViewDetail(null);
    const order = activeMembers;
    const index = memberId ? order.findIndex((m) => m.id === memberId) : -1;
    setDialog({ code, role, memberId, targetLabel, order: index >= 0 ? order : [], index: Math.max(index, 0) });
  };

  const openDetailFor = (code: PblComponentCode, memberId: string | null, targetLabel: string) => {
    setDialog(null);
    setViewDetail({ code, memberId, targetLabel });
  };

  return (
    <div className="max-w-6xl mx-auto p-4 font-serif">
      <div className={`no-print sync-indicator ${syncStatus === 'live' ? 'bg-green-100 text-green-800' : syncStatus === 'saving' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
        <span className={`w-2 h-2 rounded-full ${syncStatus === 'live' ? 'bg-green-500' : syncStatus === 'saving' ? 'bg-yellow-500' : 'bg-red-500'}`} />
        {syncStatus === 'live' ? 'Tersimpan' : syncStatus === 'saving' ? 'Menyimpan...' : 'Offline'}
      </div>

      <div className="bg-white rounded-lg shadow-md p-4 mb-4 no-print">
        <Link href="/pbl/sessions" className="text-sm text-red-800 hover:underline">← Kembali ke PBL 1 Sessions</Link>
        <h1 className="text-xl font-bold mt-1">{group.name} <span className="text-gray-500 text-base">({group.code})</span></h1>
        <p className="text-sm text-gray-600">{group.field_location || '—'}</p>
        <p className="text-xs text-gray-400 font-sans mt-1">
          {group.academic_year || '-'} • {group.semester || '-'} • Status: {PBL_STATUS_LABELS[group.status as keyof typeof PBL_STATUS_LABELS] || group.status}
        </p>
      </div>

      <div className="no-print flex flex-wrap gap-1 mb-4 bg-white rounded-lg shadow-sm p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 rounded text-sm font-sans font-medium whitespace-nowrap transition-colors ${activeTab === t.key ? 'bg-blue-900 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 print:shadow-none print:p-0">
        {activeTab === 'berita-acara' && (
          <BeritaAcaraTab
            group={group} onUpdate={updateGroupField} isDosen={canEdit}
            members={members} assessors={assessors}
            onAddMember={addMember} onRemoveMember={removeMember}
            onSaveAssessor={saveAssessor} onSaveAssessorSignature={saveAssessorSignature}
          />
        )}
        {activeTab === 'form-penguji-1' && (
          <GroupAssessmentTab
            title="Form Penguji 1"
            sections={[
              { role: 'penguji_1', codes: PENGUJI_1_COMPONENTS },
            ]}
            assessors={assessors} members={activeMembers}
            group={group} isDosen={canEdit}
            componentMeta={componentMeta} criteriaOf={criteriaOf} rubricVersion={rubricVersion}
            componentRaw={componentRaw} averageGroupRaw={averageGroupRaw}
            openDialog={openDialogFor}
          />
        )}
        {activeTab === 'form-penguji-2' && (
          <GroupAssessmentTab
            title="Form Penguji 2"
            sections={[
              { role: 'penguji_2', codes: PENGUJI_2_COMPONENTS },
            ]}
            assessors={assessors} members={activeMembers}
            group={group} isDosen={canEdit}
            componentMeta={componentMeta} criteriaOf={criteriaOf} rubricVersion={rubricVersion}
            componentRaw={componentRaw} averageGroupRaw={averageGroupRaw}
            openDialog={openDialogFor}
          />
        )}
        {activeTab === 'laporan-individu' && (
          <IndividualAssessmentTab
            group={group} isDosen={canEdit} members={activeMembers}
            componentMeta={componentMeta} criteriaOf={criteriaOf} rubricVersion={rubricVersion}
            instances={instances} scores={scores} rawOf={rawOf}
            openDialog={openDialogFor}
          />
        )}
        {activeTab === 'peer-mahasiswa' && (
          <PeerTab members={members} peers={peers} isDosen={canEdit} onSavePeer={savePeer} />
        )}
        {activeTab === 'rekap' && (
          <RekapTab
            group={group} members={members} assessors={assessors}
            blueprints={blueprint} memberSummary={memberSummary}
            peers={peers} isDosen={canEdit} onUpdate={updateGroupField}
            openDetail={openDetailFor}
          />
        )}
        {activeTab === 'preview' && (
          <PblPreview
            group={group}
            members={members} assessors={assessors}
            instances={instances} scores={scores} ratings={ratings} peers={peers}
            componentMeta={componentMeta} criteriaOf={criteriaOf} memberSummary={memberSummary}
          />
        )}
      </div>

      {dialog && (
        <RubricDialog
          code={dialog.code}
          componentInfo={componentMeta(dialog.code)}
          version={rubricVersion(dialog.code)}
          criteria={criteriaOf(dialog.code)}
          targetLabel={dialog.targetLabel}
          assessorLabel={dialog.role ? PBL_ROLE_LABELS[dialog.role as PblAssessorRole] || dialog.role : null}
          canEdit={canEdit}
          initialRatings={ratingInitials(dialog, scores, ratings, instanceFor, scoreFor)}
          onSave={async (drafts) => saveRubric(dialog.code, dialog.role, dialog.memberId, drafts)}
          onClose={() => setDialog(null)}
          hasNextStudent={dialog.order.length > 1}
          onSaveAndNext={() => {
            const nextIndex = dialog.index + 1;
            const next = dialog.order[nextIndex % dialog.order.length];
            setDialog({ ...dialog, index: nextIndex % dialog.order.length, memberId: next.id, targetLabel: next.name });
          }}
        />
      )}

      {viewDetail && (
        <ScoreDetailDialog
          code={viewDetail.code}
          memberId={viewDetail.memberId}
          targetLabel={viewDetail.targetLabel}
          componentInfo={componentMeta(viewDetail.code)}
          version={rubricVersion(viewDetail.code)}
          criteria={criteriaOf(viewDetail.code)}
          rates={ratingMap(viewDetail.memberId, viewDetail.code, instances, scores, ratings)}
          onClose={() => setViewDetail(null)}
          openDialog={() => openDialogFor(viewDetail.code, null, viewDetail.memberId, viewDetail.targetLabel)}
        />
      )}
    </div>
  );
}

function ratingInitials(
  ctx: { code: PblComponentCode; role: string | null; memberId: string | null },
  scores: PblAssessmentScore[],
  ratings: PblRubricRating[],
  instanceFor: (c: PblComponentCode, r: string | null) => PblAssessmentInstance | null,
  scoreFor: (instId: string | null, memberId: string | null) => PblAssessmentScore | null,
): Record<string, RatingDraft> {
  const inst = instanceFor(ctx.code, ctx.role);
  const score = scoreFor(inst?.id ?? null, ctx.memberId);
  if (!score) return {};
  const out: Record<string, RatingDraft> = {};
  ratings.filter((r) => r.assessment_score_id === score.id).forEach((r) => {
    out[r.criterion_id] = { level: r.level_value, note: r.evidence_note || '' };
  });
  return out;
}

function ratingMap(
  memberId: string | null,
  code: PblComponentCode,
  instances: PblAssessmentInstance[],
  scores: PblAssessmentScore[],
  ratings: PblRubricRating[],
): Record<string, { level: number | null; points: number | null; note: string | null }> {
  const inst = instances.find((i) => i.component_code === code && (i.assessor_role ?? null) === null);
  const score = inst ? scores.find((s) => s.instance_id === inst.id && (s.student_id ?? null) === memberId) || null : null;
  const out: Record<string, { level: number | null; points: number | null; note: string | null }> = {};
  if (!score) return out;
  ratings.filter((r) => r.assessment_score_id === score.id).forEach((r) => {
    out[r.criterion_id] = { level: r.level_value, points: r.criterion_points, note: r.evidence_note };
  });
  return out;
}

// ─── BERITA ACARA ───────────────────────────────────────────
const BeritaAcaraTab = memo(function BeritaAcaraTab({
  group, onUpdate, isDosen, members, assessors, onAddMember, onRemoveMember, onSaveAssessor, onSaveAssessorSignature,
}: {
  group: PblGroup; onUpdate: (f: keyof PblGroup, v: any) => void; isDosen: boolean;
  members: PblGroupMember[]; assessors: PblAssessor[];
  onAddMember: (name: string, nim: string, role: 'member' | 'leader') => void;
  onRemoveMember: (id: string) => void;
  onSaveAssessor: (role: string, data: { display_name: string; nip: string }) => void;
  onSaveAssessorSignature: (id: string, path: string) => void;
}) {
  const [newName, setNewName] = useState('');
  const [newNim, setNewNim] = useState('');
  const [newRole, setNewRole] = useState<'member' | 'leader'>('member');

  return (
    <div className="space-y-4">
      <DocHeader title="Berita Acara Seminar PBL 1" semester={group.semester} academicYear={group.academic_year} isDosen={isDosen} onUpdate={onUpdate} />

      <table className="w-full text-sm">
        <tbody>
          <tr><td className="w-40">Kode Kelompok</td><td className="w-4">:</td><td><input value={group.code} onChange={(e) => onUpdate('code', e.target.value)} className="w-full border-b border-gray-400 bg-transparent" disabled={!isDosen} /></td></tr>
          <tr><td>Nama Kelompok</td><td>:</td><td><input value={group.name} onChange={(e) => onUpdate('name', e.target.value)} className="w-full border-b border-gray-400 bg-transparent" disabled={!isDosen} /></td></tr>
          <tr><td>Lokasi Lapangan</td><td>:</td><td><input value={group.field_location} onChange={(e) => onUpdate('field_location', e.target.value)} className="w-full border-b border-gray-400 bg-transparent" placeholder="Puskesmas / Posyandu" disabled={!isDosen} /></td></tr>
          <tr><td>Judul / Agenda Seminar</td><td>:</td><td><input value={group.title} onChange={(e) => onUpdate('title', e.target.value)} className="w-full border-b border-gray-400 bg-transparent" disabled={!isDosen} /></td></tr>
          <tr><td>Hari, Tanggal</td><td>:</td><td><input value={group.hari_tanggal} onChange={(e) => onUpdate('hari_tanggal', e.target.value)} className="w-full border-b border-gray-400 bg-transparent" placeholder="Kamis, 12 Agustus 2026" disabled={!isDosen} /></td></tr>
          <tr>
            <td>Waktu</td><td>:</td>
            <td className="flex gap-2 items-center">
              <input value={group.start_time} onChange={(e) => onUpdate('start_time', e.target.value)} className="border-b border-gray-400 bg-transparent w-32" placeholder="09.00" disabled={!isDosen} />
              <span>–</span>
              <input value={group.end_time} onChange={(e) => onUpdate('end_time', e.target.value)} className="border-b border-gray-400 bg-transparent w-32" placeholder="11.00" disabled={!isDosen} />
            </td>
          </tr>
          <tr><td>Tempat</td><td>:</td><td><input value={group.venue} onChange={(e) => onUpdate('venue', e.target.value)} className="w-full border-b border-gray-400 bg-transparent" placeholder="Gedung A Kampus UPNVJ" disabled={!isDosen} /></td></tr>
        </tbody>
      </table>

      <div className="mt-4">
        <h3 className="font-semibold mb-2">Anggota Kelompok</h3>
        <table className="w-full text-sm border-collapse">
          <thead><tr className="border-b border-black"><th className="text-left py-1 w-8">NO</th><th className="text-left py-1">NAMA</th><th className="text-left py-1 w-32">NIM</th><th className="text-left py-1 w-24">ROLE</th><th className="text-left py-1 w-16">STATUS</th>{isDosen && <th className="w-10"></th>}</tr></thead>
          <tbody>
            {members.length === 0 && <tr><td colSpan={6} className="py-2 text-gray-400 text-sm">Belum ada anggota kelompok.</td></tr>}
            {members.map((m, i) => (
              <tr key={m.id} className="border-b border-gray-200">
                <td className="py-2">{i + 1}.</td>
                <td className="py-2">{m.name}</td>
                <td className="py-2">{m.nim}</td>
                <td className="py-2">{m.role === 'leader' ? 'Ketua' : 'Anggota'}</td>
                <td className="py-2">{m.active ? 'Aktif' : 'Non-aktif'}</td>
                {isDosen && <td className="py-2 text-center"><button type="button" onClick={() => onRemoveMember(m.id)} className="text-red-500 hover:text-red-700 text-xs no-print">✕</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {isDosen && (
          <div className="flex gap-2 mt-2 no-print">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm" placeholder="Nama mahasiswa" />
            <input value={newNim} onChange={(e) => setNewNim(e.target.value)} className="w-36 border border-gray-300 rounded px-3 py-1.5 text-sm" placeholder="NIM" />
            <select value={newRole} onChange={(e) => setNewRole(e.target.value as 'member' | 'leader')} className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
              <option value="member">Anggota</option>
              <option value="leader">Ketua</option>
            </select>
            <button type="button" onClick={() => { if (newName.trim()) { onAddMember(newName.trim(), newNim.trim(), newRole); setNewName(''); setNewNim(''); } }} className="bg-blue-900 text-white px-4 py-1.5 rounded font-sans text-sm font-medium no-print">+ Tambah</button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <h3 className="font-semibold mb-2">Dosen Penguji</h3>
        {PENGUJI_ROLES.map((role) => (
          <AssessorRow key={role} role={role} assessor={assessors.find((a) => a.assessor_role === role) || null} isDosen={isDosen} onSave={onSaveAssessor} onSaveSignature={onSaveAssessorSignature} />
        ))}
      </div>

      <div className="mt-8 text-right avoid-break">
        <p>Jakarta,{' '}
          <input value={group.tanggal_ba} onChange={(e) => onUpdate('tanggal_ba', e.target.value)} className="border-b border-gray-400 bg-transparent w-40 text-center" disabled={!isDosen} />
        </p>
        <p className="mt-4">Koordinator Program Studi Kesehatan Masyarakat Program Sarjana</p>
        <S2SignatureUpload value={group.koordinator_signature_path} onChange={(v) => onUpdate('koordinator_signature_path', v || '')} label="Koordinator Prodi" />
        <div className="h-8"></div>
        <input value={group.koordinator} onChange={(e) => onUpdate('koordinator', e.target.value)} className="border-b border-gray-400 bg-transparent text-center font-semibold" placeholder="Nama Koordinator" disabled={!isDosen} />
        <br />
        <input value={group.nip_koordinator} onChange={(e) => onUpdate('nip_koordinator', e.target.value)} className="border-b border-gray-400 bg-transparent text-center text-sm" placeholder="NIP." disabled={!isDosen} />
      </div>
    </div>
  );
});

function AssessorRow({
  role, assessor, isDosen, onSave, onSaveSignature,
}: {
  role: PblAssessorRole; assessor: PblAssessor | null; isDosen: boolean;
  onSave: (role: string, data: { display_name: string; nip: string }) => void;
  onSaveSignature: (id: string, path: string) => void;
}) {
  const [name, setName] = useState(assessor?.display_name || '');
  const [nip, setNip] = useState(assessor?.nip || '');
  const [saved, setSaved] = useState(false);
  useEffect(() => { setName(assessor?.display_name || ''); setNip(assessor?.nip || ''); }, [assessor]);

  return (
    <div className="flex flex-wrap items-center gap-3 py-2 border-b border-gray-100">
      <span className="w-40 shrink-0 font-medium">{PBL_ROLE_LABELS[role]}</span>
      {isDosen ? (
        <>
          <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-[160px] border border-gray-300 rounded px-2 py-1 text-sm" placeholder="Nama lengkap" />
          <input value={nip} onChange={(e) => setNip(e.target.value)} className="w-44 border border-gray-300 rounded px-2 py-1 text-sm" placeholder="NIP" />
          <button type="button" onClick={() => { onSave(role, { display_name: name, nip }); setSaved(true); setTimeout(() => setSaved(false), 1500); }} className={`px-3 py-1 rounded text-xs font-sans font-medium ${saved ? 'bg-green-700 text-white' : 'bg-blue-900 text-white'}`}>
            {saved ? '✓ Tersimpan' : 'Simpan'}
          </button>
          {assessor && <S2SignatureUpload value={assessor.signature_path} onChange={(v) => onSaveSignature(assessor.id, v || '')} label={PBL_ROLE_LABELS[role]} />}
        </>
      ) : (
        <>
          <span className="flex-1">{assessor?.display_name || '—'}</span>
          <span className="w-44 text-sm">{assessor?.nip || ''}</span>
        </>
      )}
    </div>
  );
}

// ─── COMPONENT CARD + MATRIX ────────────────────────────────
function ScoreCell({ value, label, onClick, dim }: { value: number | null; label: string; onClick?: () => void; dim?: boolean }) {
  return (
    <button
      type="button"
      disabled={!onClick}
      onClick={onClick}
      className={`flex flex-col items-center justify-center rounded border px-2 py-2 text-center transition-colors ${onClick ? 'cursor-pointer hover:bg-blue-50 border-gray-300' : 'cursor-default ' + (dim ? 'bg-gray-50' : 'bg-white')}`}
    >
      <span className={`text-base font-bold ${value === null ? 'text-gray-300' : 'text-blue-900'}`}>{value !== null ? value.toFixed ? value.toFixed(2) : value : '—'}</span>
      <span className="text-[10px] text-gray-500 font-sans truncate w-full">{label}</span>
    </button>
  );
}

// Group-scoped assessment tabs (Form Penguji — per penguji component set)
function GroupAssessmentTab({
  title, sections, assessors, members, group, isDosen,
  componentMeta, criteriaOf, rubricVersion,
  componentRaw, averageGroupRaw, openDialog,
}: {
  title: string; sections: { role: PblAssessorRole; codes: PblComponentCode[] }[];
  assessors: PblAssessor[]; members: PblGroupMember[]; group: PblGroup; isDosen: boolean;
  componentMeta: (c: PblComponentCode) => { name: string; weight: number; cpmk: string; scope: string };
  criteriaOf: (c: PblComponentCode) => CriterionWithLevels[];
  rubricVersion: (c: PblComponentCode) => string;
  componentRaw: (c: PblComponentCode, r: string | null, m: string | null) => number | null;
  averageGroupRaw: (c: PblComponentCode, roles: PblAssessorRole[]) => number | null;
  openDialog: (code: PblComponentCode, role: string | null, memberId: string | null, targetLabel: string) => void;
}) {
  const present = sections.filter((s) => assessors.some((a) => a.assessor_role === s.role));
  if (present.length === 0) {
    return <div className="text-amber-600 text-sm">Belum ada Dosen Penguji yang ditambahkan di Berita Acara.</div>;
  }
  return (
    <div className="space-y-6">
      <DocHeader title={title} semester={group.semester} academicYear={group.academic_year} isDosen={isDosen} />
      {present.map((s) => {
        const a = assessors.find((x) => x.assessor_role === s.role);
        return (
          <div key={s.role} className="space-y-4">
            <h3 className="text-lg font-bold flex items-center justify-between">
              <span>{PBL_ROLE_LABELS[s.role]} {a?.display_name ? `— ${a.display_name}` : ''}</span>
            </h3>
            {s.codes.map((code) => {
              const meta = componentMeta(code);
              const criteria = criteriaOf(code);
              const raw = componentRaw(code, s.role, null);
              return (
                <ComponentCard
                  key={code}
                  code={code}
                  name={PBL_COMPONENT_LABELS[code]}
                  weight={meta.weight}
                  cpmk={meta.cpmk}
                  scope="GROUP"
                  version={rubricVersion(code)}
                  criteria={criteria}
                  targets={[{ key: 'group', label: 'Kelompok', subtitle: `Berlaku untuk ${members.length} anggota`, value: raw }]}
                  isDosen={isDosen}
                  onOpen={() => openDialog(code, s.role, null, 'Kelompok')}
                  actorName={PBL_ROLE_LABELS[s.role]}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Individual assessments (I1, I2 per member)
function IndividualAssessmentTab({
  group, isDosen, members, componentMeta, criteriaOf, rubricVersion, instances, scores, rawOf, openDialog,
}: {
  group: PblGroup; isDosen: boolean; members: PblGroupMember[];
  componentMeta: (c: PblComponentCode) => { name: string; weight: number; cpmk: string; scope: string };
  criteriaOf: (c: PblComponentCode) => CriterionWithLevels[];
  rubricVersion: (c: PblComponentCode) => string;
  instances: PblAssessmentInstance[]; scores: PblAssessmentScore[]; rawOf: (scoreId: string | null) => number | null;
  openDialog: (code: PblComponentCode, role: string | null, memberId: string | null, targetLabel: string) => void;
}) {
  if (members.length === 0) return <p className="text-amber-600 text-sm">Belum ada anggota kelompok.</p>;
  return (
    <div className="space-y-6">
      <DocHeader title="Form Penilaian Laporan Individu" semester={group.semester} academicYear={group.academic_year} isDosen={isDosen} />
      {INDIVIDUAL_COMPONENTS.map((code) => {
        const meta = componentMeta(code);
        const criteria = criteriaOf(code);
        const targets = members.map((m) => {
          const inst = instances.find((i) => i.component_code === code && i.assessor_role === null);
          const score = inst ? scores.find((s) => s.instance_id === inst.id && s.student_id === m.id) || null : null;
          return { key: m.id, label: m.name.split(' ').slice(0, 2).join(' '), subtitle: m.nim, value: rawOf(score?.id ?? null) };
        });
        return (
          <ComponentCard
            key={code}
            code={code}
            name={PBL_COMPONENT_LABELS[code]}
            weight={meta.weight}
            cpmk={meta.cpmk}
            scope="INDIVIDUAL"
            version={rubricVersion(code)}
            criteria={criteria}
            targets={targets}
            isDosen={isDosen}
            onOpen={() => openDialog(code, null, members[0]?.id ?? null, members[0]?.name || 'Mahasiswa')}
            onCell={(t) => openDialog(code, null, t.key === 'group' ? null : t.key, t.label)}
          />
        );
      })}
    </div>
  );
}

function ComponentCard({
  code, name, weight, cpmk, scope, version, criteria, targets, isDosen, onOpen, onCell, actorName,
}: {
  code: string; name: string; weight: number; cpmk: string; scope: string; version: string;
  criteria: CriterionWithLevels[]; targets: { key: string; label: string; subtitle?: string; value: number | null }[];
  isDosen: boolean; onOpen: () => void; onCell?: (t: { key: string; label: string; subtitle?: string }) => void; actorName?: string;
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="font-bold">{name} <span className="text-xs text-gray-400 font-sans">({code})</span></p>
          {actorName && (
            <p className="text-xs text-gray-500 font-sans">{actorName}</p>
          )}
        </div>
        <button type="button" onClick={onOpen} className="no-print text-xs font-sans text-blue-800 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50">
          ⓘ Lihat Rubrik
        </button>
      </div>

      <div className="text-sm text-gray-700">
        <p className="text-xs font-semibold text-gray-500 mb-1">Kriteria:</p>
        <ol className="list-decimal ml-5 space-y-0.5 text-[13px]">
          {criteria.length === 0 && <li className="text-amber-600 italic text-xs">Rubrik belum dimuat dari blueprint.</li>}
          {criteria.map((c, i) => (
            <li key={c.id || i}>{c.name} <span className="text-gray-400 text-[10px] font-sans">({(c.weight * 100).toFixed(0)}%)</span></li>
          ))}
        </ol>
      </div>

      <div className="flex flex-wrap gap-2">
        {targets.map((t) => (
          <ScoreCell
            key={t.key}
            value={t.value}
            label={t.subtitle || t.label}
            onClick={isDosen && onCell ? () => onCell!(t) : undefined}
          />
        ))}
      </div>
      {scope === 'GROUP' && (
        <p className="text-[11px] text-blue-700 font-sans">🔗 Group score — synchronized</p>
      )}
    </div>
  );
}

// ─── RUBRIC DIALOG ──────────────────────────────────────────
function RubricDialog({
  code, componentInfo, version, criteria, targetLabel, assessorLabel, canEdit, initialRatings, onSave, onClose, hasNextStudent, onSaveAndNext,
}: {
  code: PblComponentCode;
  componentInfo: { name: string; weight: number; cpmk: string; scope: string };
  version: string;
  criteria: CriterionWithLevels[];
  targetLabel: string; assessorLabel: string | null; canEdit: boolean;
  initialRatings: Record<string, RatingDraft>;
  onSave: (drafts: { criterionId: string; level: number | null; note: string }[]) => Promise<boolean>;
  onClose: () => void; hasNextStudent: boolean; onSaveAndNext?: () => void;
}) {
  const [drafts, setDrafts] = useState<Record<string, RatingDraft>>(initialRatings);
  const [saving, setSaving] = useState(false);
  const [changed, setChanged] = useState(false);
  const [compareAll, setCompareAll] = useState<string | null>(null);

  const setLevel = (criterionId: string, level: number | null) => {
    setDrafts((prev) => ({ ...prev, [criterionId]: { ...(prev[criterionId] || { note: '' }), level } }));
    setChanged(true);
  };
  const setNote = (criterionId: string, note: string) => {
    setDrafts((prev) => ({ ...prev, [criterionId]: { ...(prev[criterionId] || { level: null }), note } }));
    setChanged(true);
  };

  const completed = criteria.filter((c) => drafts[c.id]?.level !== null && drafts[c.id]?.level !== undefined).length;
  const points = criteria.map((c) => {
    const d = drafts[c.id];
    if (!d || d.level === null || d.level === undefined) return null;
    return calcCriterionPoints(d.level, c.weight);
  });
  const raw = calcComponentRawFromCriterionPoints(points);

  const doSave = async (next = false) => {
    setSaving(true);
    const ok = await onSave(criteria.map((c) => ({ criterionId: c.id, level: drafts[c.id]?.level ?? null, note: drafts[c.id]?.note || '' })));
    setSaving(false);
    if (ok) {
      setChanged(false);
      if (next && onSaveAndNext) { onSaveAndNext(); }
      else if (!next) onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print" role="dialog" aria-modal="true" aria-label="Rubrik penilaian">
      <div className="absolute inset-0 bg-black/40" onClick={() => { if (!changed || confirm('Ada perubahan yang belum disimpan. Batalkan?')) onClose(); }} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Rubric header */}
        <div className="sticky top-0 bg-blue-900 text-white px-5 py-4 rounded-t-xl">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold uppercase">{componentInfo.name} <span className="text-blue-200 text-xs">({code})</span></p>
              <p className="text-xs text-blue-100 mt-0.5">
                Mahasiswa/Kelompok: <span className="font-semibold">{targetLabel}</span>
                {assessorLabel ? ` | Penilai: ${assessorLabel}` : ''}
              </p>
            </div>
            <button type="button" onClick={() => { if (!changed || confirm('Ada perubahan yang belum disimpan. Batalkan?')) onClose(); }} className="text-white hover:text-blue-200 text-xl leading-none w-8 h-8 rounded hover:bg-blue-800">✕</button>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {criteria.length === 0 && <p className="text-amber-600 italic text-sm">Rubrik belum dimuat dari blueprint. Jalankan migrasi PBL 1 terlebih dahulu.</p>}
          {criteria.map((c, i) => {
            const d = drafts[c.id] || { level: null, note: '' };
            const showAll = compareAll === c.id;
            return (
              <div key={c.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <p className="font-semibold text-sm">{i + 1}. {c.name} <span className="text-gray-400 text-[11px] font-sans">({(c.weight * 100).toFixed(0)}%)</span></p>
                  <button type="button" onClick={() => setCompareAll(showAll ? null : c.id)} className="no-print text-[11px] text-blue-700 hover:underline font-sans">
                    {showAll ? 'Sembunyikan semua level' : 'Bandingkan semua level'}
                  </button>
                </div>
                {c.evidence_guidance && <p className="text-xs text-gray-500 mt-1 italic">{c.evidence_guidance}</p>}

                <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Level penilaian">
                  {c.levels.length === 0 && <p className="text-xs text-amber-600 italic col-span-full">Deskriptor belum tersedia.</p>}
                  {c.levels.map((lvl) => {
                    const selected = d.level === lvl.value;
                    return (
                      <label key={lvl.value} className={`flex items-start gap-2 rounded border p-2 cursor-pointer text-sm ${selected ? 'border-blue-600 bg-blue-50' : canEdit ? 'border-gray-200 hover:border-gray-300' : 'border-gray-200 opacity-70'}`}>
                        <input
                          type="radio"
                          name={`crit-${c.id}`}
                          checked={selected}
                          disabled={!canEdit}
                          onChange={() => setLevel(c.id, lvl.value)}
                          className="mt-1 accent-blue-900"
                          onKeyDown={(e) => {
                            const num = Number(e.key);
                            if (canEdit && [0, 1, 2, 3, 4].includes(num)) { e.preventDefault(); setLevel(c.id, num); }
                          }}
                        />
                        <span className="flex-1">
                          <span className="font-semibold">Level {lvl.value} — {lvl.label}</span>{' '}
                          {selected && <span className="text-blue-700">{' (terpilih)'}</span>}
                          {selected || showAll ? (
                            <span className="block text-[12px] text-gray-600 mt-0.5 leading-snug">{lvl.descriptor}</span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })}
                </div>
                <label className="block mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500 font-sans">Atau isi skor langsung (1–4, desimal):</span>
                  <input
                    type="number"
                    min={0}
                    max={4}
                    step="0.01"
                    value={d.level ?? ''}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '') { setLevel(c.id, null); return; }
                      const n = Number(v);
                      if (isNaN(n)) return;
                      setLevel(c.id, Math.min(4, Math.max(0, n)));
                    }}
                    className="w-24 border border-gray-300 rounded px-2 py-1 text-xs font-sans"
                  />
                  {d.level !== null && !Number.isInteger(d.level) && (
                    <span className="text-[11px] text-blue-700 font-sans">skor manual: {d.level}</span>
                  )}
                </label>

                <label className="block mt-3">
                  <span className="text-xs text-gray-500 font-sans">Catatan bukti (evidence note)</span>
                  <textarea
                    value={d.note}
                    disabled={!canEdit}
                    onChange={(e) => setNote(c.id, e.target.value)}
                    rows={2}
                    placeholder="Contoh: data primer/sekunder konsisten, prioritas dapat ditelusuri…"
                    className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-xs font-sans"
                  />
                </label>
              </div>
            );
          })}
        </div>

        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-5 py-3 rounded-b-xl flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm">
            <p className="font-sans text-xs text-gray-500">Kelengkapan kriteria: <span className="font-semibold">{completed}/{criteria.length}</span></p>
            <p className="font-semibold text-blue-900">Skor akhir: {raw !== null ? raw.toFixed(2) : '—'} <span className="text-gray-400 text-xs">/ 100</span></p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => { if (!changed || confirm('Ada perubahan yang belum disimpan. Batalkan?')) onClose(); }} className="px-3 py-2 rounded border border-gray-300 text-sm font-sans hover:bg-gray-100">Batal</button>
            <button type="button" onClick={() => doSave(false)} disabled={!canEdit || saving} className="px-4 py-2 rounded bg-blue-900 text-white text-sm font-sans font-medium hover:bg-blue-800 disabled:opacity-50">
              {saving ? 'Menyimpan…' : 'Simpan'}
            </button>
            {hasNextStudent && canEdit && onSaveAndNext && (
              <button type="button" onClick={() => doSave(true)} disabled={saving} className="px-4 py-2 rounded bg-green-800 text-white text-sm font-sans font-medium hover:bg-green-700 disabled:opacity-50">Simpan & Mahasiswa Berikutnya</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PEER TAB ───────────────────────────────────────────────
function PeerTab({ members, peers, isDosen, onSavePeer }: {
  members: PblGroupMember[]; peers: PblPeerFinalScore[]; isDosen: boolean;
  onSavePeer: (memberId: string, v: Partial<PblPeerFinalScore>) => void;
}) {
  const [showPeerCrit, setShowPeerCrit] = useState(false);
  const [vals, setVals] = useState<Record<string, { score: string; source: string; status: string }>>({});

  useEffect(() => {
    const init: Record<string, typeof vals[string]> = {};
    members.forEach((m) => {
      const p = peers.find((x) => x.student_id === m.id);
      init[m.id] = {
        score: p ? String(p.final_peer_score) : '',
        source: p?.source_reference || '',
        status: p?.status || 'DRAFT',
      };
    });
    setVals(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, peers]);

  const input = (m: PblGroupMember, field: keyof typeof vals[string], v: string) =>
    setVals((prev) => ({ ...prev, [m.id]: { ...(prev[m.id] || {}), [field]: v } }));

  const save = (m: PblGroupMember) => {
    const d = vals[m.id];
    const score = Number(d.score);
    if (isNaN(score) || score < 0 || score > 100) { alert('Skor akhir harus 0–100'); return; }
    onSavePeer(m.id, {
      final_peer_score: score,
      source_reference: d.source || null,
      status: (d.status as 'DRAFT' | 'FINALIZED') || 'DRAFT',
    });
  };

  return (
    <div className="space-y-4">
      <DocHeader title="Penilaian Sesama Mahasiswa (Peer)" semester="" academicYear="" />
      <div className="flex items-center gap-2 no-print">
        <button type="button" onClick={() => setShowPeerCrit(!showPeerCrit)} className="text-xs font-sans text-blue-800 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50">
          ⓘ Lihat Kriteria Peer
        </button>
      </div>
      {showPeerCrit && (
        <div className="border border-gray-200 rounded-lg p-4 text-sm bg-gray-50">
          <p className="font-semibold mb-1">Kriteria referensi peer assessment:</p>
          <ol className="list-decimal ml-5 text-gray-700">{PEER_REFERENCE_CRITERIA.map((c) => <li key={c}>{c}</li>)}</ol>
          <p className="text-[11px] text-gray-500 mt-2">Referensi saja — tanpa login mahasiswa pada versi ini.</p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="template-table text-[13px] leading-snug">
          <thead>
            <tr>
              <th className="w-8">NO</th><th>NIM</th><th>NAMA</th>
              <th className="w-28">SKOR AKHIR (0–100)</th>
              <th className="w-48">REFERENSI</th><th className="w-24">STATUS</th>{isDosen && <th className="w-16">AKSI</th>}
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => {
              const d = vals[m.id] || { score: '', source: '', status: 'DRAFT' };
              return (
                <tr key={m.id} className="align-top">
                  <td className="text-center">{i + 1}.</td>
                  <td>{m.nim}</td>
                  <td className="whitespace-nowrap">{m.name}</td>
                  <td className="text-center">{isDosen ? <input type="number" min={0} max={100} step="0.01" value={d.score} onChange={(e) => input(m, 'score', e.target.value)} className="w-20 text-center border border-gray-300 rounded px-1 py-1" /> : (d.score || '—')}</td>
                  <td>{isDosen ? <input value={d.source} onChange={(e) => input(m, 'source', e.target.value)} className="w-full border border-gray-300 rounded px-1 py-1 text-xs" placeholder="Referensi/URL" /> : d.source || '—'}</td>
                  <td className="text-center">
                    {isDosen ? (
                      <select value={d.status} onChange={(e) => input(m, 'status', e.target.value)} className="border border-gray-300 rounded px-1 py-1 text-xs">
                        <option value="DRAFT">DRAFT</option>
                        <option value="FINALIZED">FINALIZED</option>
                      </select>
                    ) : d.status}
                  </td>
                  {isDosen && <td className="text-center"><button type="button" onClick={() => save(m)} className="bg-blue-900 text-white px-3 py-1 rounded text-xs font-sans font-medium">Simpan</button></td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── REKAPITULASI ───────────────────────────────────────────
function RekapTab({
  group, members, assessors, blueprints, memberSummary, peers, isDosen, onUpdate, openDetail,
}: {
  group: PblGroup; members: PblGroupMember[]; assessors: PblAssessor[];
  blueprints: PblBlueprint | null;
  memberSummary: (m: PblGroupMember) => ComponentRawScores & { cpmk1: number | null; cpmk2: number | null; finalScore: number | null; grade: string | null; complete: boolean; missing: string[] };
  peers: PblPeerFinalScore[];
  isDosen: boolean; onUpdate: (f: keyof PblGroup, v: any) => void;
  openDetail: (code: PblComponentCode, memberId: string | null, targetLabel: string) => void;
}) {
  const cols: { code: PblComponentCode; label: string; w: string; weight: number }[] = [
    { code: 'I1', label: 'I1', w: 'w-16', weight: 0.15 },
    { code: 'I2', label: 'I2', w: 'w-16', weight: 0.25 },
    { code: 'P1', label: 'P1', w: 'w-16', weight: 0.1 },
    { code: 'B1', label: 'B1', w: 'w-16', weight: 0.175 },
    { code: 'B2', label: 'B2', w: 'w-16', weight: 0.175 },
    { code: 'E1', label: 'E1', w: 'w-16', weight: 0.075 },
    { code: 'E2', label: 'E2', w: 'w-16', weight: 0.075 },
  ];
  return (
    <div className="space-y-4">
      <DocHeader title="Rekapitulasi Nilai PBL 1" semester={group.semester} academicYear={group.academic_year} isDosen={isDosen} onUpdate={onUpdate} />
      <div className="overflow-x-auto">
        <table className="template-table text-[13px] leading-snug min-w-[1000px]">
          <thead>
            <tr>
              <th className="w-8" rowSpan={2}>NO</th><th rowSpan={2}>NAMA</th><th className="w-20" rowSpan={2}>NIM</th>
              {cols.map((c) => <th key={c.code} className={`${c.w} text-[11px] font-sans`} rowSpan={1}>{(c.weight * 100).toFixed(1)}%</th>)}
              <th className="w-20" rowSpan={2}>CPMK1</th><th className="w-20" rowSpan={2}>CPMK2</th><th className="w-20" rowSpan={2}>FINAL</th><th className="w-14" rowSpan={2}>HURUF</th><th className="w-24" rowSpan={2}>STATUS</th>
            </tr>
            <tr>
              {cols.map((c) => <th key={c.code} className={c.w}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => {
              const s = memberSummary(m);
              return (
                <tr key={m.id} className="align-top">
                  <td className="text-center">{i + 1}.</td>
                  <td className="whitespace-nowrap">{m.name}</td>
                  <td>{m.nim}</td>
                  {cols.map((c) => (
                    <td key={c.code} className="text-center">
                      <button type="button" disabled={s[c.code] === null} onClick={() => openDetail(c.code, m.id, m.name)} className={s[c.code] !== null ? 'text-blue-900 font-semibold hover:underline' : 'text-gray-300'} title={s[c.code] !== null ? 'Lihat detail skor' : ''}>
                        {s[c.code] !== null ? s[c.code]!.toFixed(2) : '—'}
                      </button>
                    </td>
                  ))}
                  <td className="text-center font-semibold">{s.cpmk1 !== null ? s.cpmk1.toFixed(2) : '—'}</td>
                  <td className="text-center font-semibold">{s.cpmk2 !== null ? s.cpmk2.toFixed(2) : '—'}</td>
                  <td className="text-center font-bold">{s.finalScore !== null ? s.finalScore.toFixed(2) : '—'}</td>
                  <td className="text-center font-bold">{s.grade || '—'}</td>
                  <td className="text-center text-[11px] font-sans">{s.complete ? <span className="text-green-700">Lengkap ✓</span> : <span className="text-amber-600">Kurang: {s.missing.join(', ')}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-gray-500">Klik angka komponen pada tautan biru untuk melihat detail butir penilaian. B1/B2 dinilai Penguji 2, E1/E2 dinilai Penguji 1, P1 (peer skor akhir).</p>
    </div>
  );
}

// ─── READ-ONLY SCORE DETAIL ─────────────────────────────────
function ScoreDetailDialog({
  code, memberId, targetLabel, componentInfo, version, criteria, rates, onClose, openDialog,
}: {
  code: PblComponentCode; memberId: string | null; targetLabel: string;
  componentInfo: { name: string; weight: number; cpmk: string; scope: string };
  version: string; criteria: CriterionWithLevels[];
  rates: Record<string, { level: number | null; points: number | null; note: string | null }>;
  onClose: () => void; openDialog: () => void;
}) {
  const points = criteria.map((c) => rates[c.id]?.points ?? null);
  const raw = calcComponentRawFromCriterionPoints(points);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print" role="dialog" aria-modal="true" aria-label="Detail skor">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-800 text-white px-5 py-4 rounded-t-xl flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase">{componentInfo.name} <span className="text-gray-300 text-xs">({code})</span></p>
            <p className="text-xs text-gray-300 mt-0.5">Mahasiswa/Kelompok: <span className="font-semibold">{targetLabel}</span></p>
          </div>
          <button type="button" onClick={onClose} className="text-white hover:text-gray-200 text-xl leading-none w-8 h-8 rounded hover:bg-gray-700">✕</button>
        </div>
        <div className="p-5 space-y-2">
          <table className="w-full text-sm template-table">
            <thead><tr><th className="w-8">NO</th><th>KRITERIA</th><th className="w-14">BOBOT</th><th className="w-28">LEVEL</th><th className="w-20">POIN</th></tr></thead>
            <tbody>
              {criteria.map((c, i) => {
                const r = rates[c.id];
                return (
                  <tr key={c.id || i}>
                    <td className="text-center">{i + 1}.</td>
                    <td>{c.name}</td>
                    <td className="text-center">{(c.weight * 100).toFixed(0)}%</td>
                    <td className="text-center">{r?.level !== null && r?.level !== undefined ? `Level ${r.level} — ${LEVEL_LABELS[r.level]} ` : '—'}</td>
                    <td className="text-center font-semibold">{r?.points !== null && r?.points !== undefined ? r.points.toFixed(2) : ''}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot><tr className="font-bold"><td colSpan={4} className="text-center">NILAI AKHIR (0–100)</td><td className="text-center">{raw !== null ? raw.toFixed(2) : 'Belum dinilai'}</td></tr></tfoot>
          </table>
          {criteria.some((c) => rates[c.id]?.note) && (
            <div className="mt-3 space-y-2">
              <p className="text-xs font-semibold text-gray-600">Catatan bukti:</p>
              {criteria.filter((c) => rates[c.id]?.note).map((c) => (
                <p key={c.id} className="text-xs text-gray-600"><span className="font-semibold">{c.name}:</span> {rates[c.id]?.note}</p>
              ))}
            </div>
          )}
        </div>
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-5 py-3 rounded-b-xl flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-3 py-2 rounded border border-gray-300 text-sm font-sans hover:bg-gray-100">Tutup</button>
          <button type="button" onClick={() => { onClose(); openDialog(); }} className="px-3 py-2 rounded bg-blue-900 text-white text-sm font-sans font-medium hover:bg-blue-800">Buka Rubrik</button>
        </div>
      </div>
    </div>
  );
}

// ─── PRINT PREVIEW & PDF ────────────────────────────────────
function PblPreview({
  group, members, assessors, instances, scores, ratings, peers,
  componentMeta, criteriaOf, memberSummary,
}: {
  group: PblGroup; members: PblGroupMember[]; assessors: PblAssessor[];
  instances: PblAssessmentInstance[]; scores: PblAssessmentScore[]; ratings: PblRubricRating[]; peers: PblPeerFinalScore[];
  componentMeta: (c: PblComponentCode) => { name: string; weight: number; cpmk: string; scope: string };
  criteriaOf: (c: PblComponentCode) => CriterionWithLevels[];
  memberSummary: (m: PblGroupMember) => ComponentRawScores & { cpmk1: number | null; cpmk2: number | null; finalScore: number | null; grade: string | null; complete: boolean; missing: string[] };
}) {
  const handlePrint = () => window.print();
  const activeMembers = members.filter((m) => m.active);

  const ratesFor = (code: PblComponentCode, role: string | null, memberId: string | null) => {
    const inst = instances.find((i) => i.component_code === code && (i.assessor_role ?? null) === role);
    if (!inst) return null;
    const score = scores.find((s) => s.instance_id === inst.id && (s.student_id ?? null) === memberId);
    if (!score) return null;
    const map: Record<string, { level: number | null; points: number | null }> = {};
    ratings.filter((r) => r.assessment_score_id === score.id).forEach((r) => {
      map[r.criterion_id] = { level: r.level_value, points: r.criterion_points };
    });
    return map;
  };

  const renderPreviewDivider = () => <div aria-hidden="true" className="my-2 w-full border-b-2 border-black" />;

  const renderPreviewDocHeader = (title: string) => (
    <div className="pb-3 text-center" data-preview-doc-header="true">
      <img
        src="/kop-surat-resize.png"
        alt="KOP UPN Veteran Jakarta"
        className="mx-auto mb-2 block h-auto max-h-[88px] w-auto max-w-full"
      />
      {renderPreviewDivider()}
      <div className="space-y-0">
        <h1 className="text-[16px] font-bold uppercase leading-tight">{title}</h1>
        <p className="text-[11px] leading-tight">PROGRAM STUDI KESEHATAN MASYARAKAT</p>
        <p className="text-[11px] leading-tight">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
        <p className="text-[11px] font-semibold leading-tight">SEMESTER {group.semester} T.A. {group.academic_year}</p>
      </div>
    </div>
  );

  const renderComponentTable = (code: PblComponentCode, role: string | null, memberId: string | null) => {
    const meta = componentMeta(code);
    const criteria = criteriaOf(code);
    const rates = ratesFor(code, role, memberId);
    const points = criteria.map((c) => rates?.[c.id]?.points ?? null);
    const raw = calcComponentRawFromCriterionPoints(points);
    return (
      <div className="mb-5 avoid-break">
        <p className="font-bold text-[12px] leading-snug">
          {meta.name} <span className="text-[10px] font-normal">({code})</span> — BOBOT {(meta.weight * 100).toFixed(1)}% — {meta.cpmk}
        </p>
        <table className="template-table pbl-assessment-table mt-1">
          <colgroup>
            <col style={{ width: '5%' }} />
            <col style={{ width: '68%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} />
          </colgroup>
          <thead>
            <tr>
              <th>NO</th>
              <th>PARAMETER PENILAIAN</th>
              <th>LEVEL<br />(0-4)</th>
              <th>BOBOT</th>
              <th>POIN</th>
            </tr>
          </thead>
          <tbody>
            {criteria.map((c, i) => {
              const r = rates?.[c.id];
              return (
                <tr key={c.id || i}>
                  <td className="text-center align-top">{i + 1}.</td>
                  <td className="align-top">
                    <div className="font-semibold leading-tight">{c.name}</div>
                    {c.evidence_guidance && (
                      <div className="text-[9px] italic leading-snug text-gray-600">{c.evidence_guidance}</div>
                    )}
                  </td>
                  <td className="text-center align-top">{r?.level ?? ''}</td>
                  <td className="text-center align-top">{(c.weight * 100).toFixed(0)}%</td>
                  <td className="text-center align-top font-semibold">
                    {r?.points !== null && r?.points !== undefined ? r.points.toFixed(2) : ''}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="font-bold">
            <tr>
              <td colSpan={4} className="text-center">NILAI AKHIR KOMPONEN (0-100)</td>
              <td className="text-center">{raw !== null ? raw.toFixed(2) : ''}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    );
  };

  const renderSignatureBlock = (role: PblAssessorRole, name?: string, nip?: string, sig?: string | null) => (
    <div className="ml-auto mt-5 w-[240px] signature-block text-left">
      <p>Jakarta, {group.tanggal_ba || '______________'}</p>
      <p className="mt-2">{PBL_ROLE_LABELS[role]}</p>
      <div className="flex h-12 items-end">
        {sig ? <img src={sig} alt="TTD" className="max-h-12 max-w-32 object-contain" /> : null}
      </div>
      <p className="inline-block min-w-[220px] border-b border-black pb-0.5 font-bold">
        {name || '…………………………………'}
      </p>
      <p className="text-[10px]">NIP. {nip || ''}</p>
    </div>
  );

  const pengujiSections = [
    { role: 'penguji_1' as PblAssessorRole, codes: PENGUJI_1_COMPONENTS, label: 'Dosen Penguji 1' },
    { role: 'penguji_2' as PblAssessorRole, codes: PENGUJI_2_COMPONENTS, label: 'Dosen Penguji 2' },
  ];

  return (
    <div data-pbl-preview-root="true">
      <div className="no-print mb-4 flex gap-3">
        <button onClick={handlePrint} className="rounded bg-blue-900 px-6 py-2 font-sans text-sm font-medium text-white hover:bg-blue-800">
          🖨 Preview Print / Save PDF
        </button>
      </div>

      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 12mm 14mm 14mm 14mm; }
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          body * { visibility: hidden; }
          [data-pbl-preview-root='true'],
          [data-pbl-preview-root='true'] * { visibility: visible; }
          [data-pbl-preview-root='true'] { position: absolute !important; inset: 0 !important; width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; }
          [data-pbl-preview-root='true'] .print-area { width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important; overflow: visible !important; }
          [data-pbl-preview-root='true'] .pbl-report-page,
          [data-pbl-preview-root='true'] .pbl-examiner-form,
          [data-pbl-preview-root='true'] .pbl-member-block,
          [data-pbl-preview-root='true'] .pbl-peer-page,
          [data-pbl-preview-root='true'] .pbl-rekap-page {
            break-after: page !important;
            page-break-after: always !important;
            width: 100% !important; margin: 0 !important; padding: 0 !important;
          }
          [data-pbl-preview-root='true'] .pbl-rekap-page { break-before: page !important; page-break-before: always !important; }
          [data-pbl-preview-root='true'] [data-preview-doc-header='true'],
          [data-pbl-preview-root='true'] .avoid-break { break-inside: avoid !important; page-break-inside: avoid !important; }
          [data-pbl-preview-root='true'] .pbl-assessment-table { width: 100% !important; max-width: 100% !important; table-layout: fixed !important; border-collapse: collapse !important; box-sizing: border-box !important; font-size: 9.4pt !important; line-height: 1.08 !important; break-inside: auto !important; page-break-inside: auto !important; }
          [data-pbl-preview-root='true'] .pbl-assessment-table thead { display: table-header-group !important; }
          [data-pbl-preview-root='true'] .pbl-assessment-table tbody { break-inside: auto !important; page-break-inside: auto !important; }
          [data-pbl-preview-root='true'] .pbl-assessment-table tr { break-inside: avoid !important; page-break-inside: avoid !important; }
          [data-pbl-preview-root='true'] .pbl-assessment-table th, [data-pbl-preview-root='true'] .pbl-assessment-table td { box-sizing: border-box !important; padding: 1mm 1.2mm !important; overflow-wrap: anywhere; word-break: normal; }
          [data-pbl-preview-root='true'] .signature-block { width: 74mm !important; max-width: 74mm !important; margin-left: auto !important; margin-right: 0 !important; break-inside: avoid !important; page-break-inside: avoid !important; }
          [data-pbl-preview-root='true'] img { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        }
      `}</style>

      <div className="print-area space-y-10 bg-white p-8 md:p-12 print:space-y-0 print:p-0" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>
        {/* ===== BERITA ACARA ===== */}
        <section className="pbl-report-page">
          {renderPreviewDocHeader('Berita Acara Seminar PBL 1')}
          <table className="w-full text-[11px]">
            <tbody>
              <tr><td className="w-32">Kode Kelompok</td><td className="w-3">:</td><td>{group.code || '______________'}</td></tr>
              <tr><td>Nama Kelompok</td><td>:</td><td>{group.name || '______________'}</td></tr>
              <tr><td>Lokasi Lapangan</td><td>:</td><td>{group.field_location || '______________'}</td></tr>
              <tr><td>Judul / Agenda</td><td>:</td><td>{group.title || '______________'}</td></tr>
              <tr><td>Hari, Tanggal</td><td>:</td><td>{group.hari_tanggal || '______________'}</td></tr>
              <tr><td>Waktu</td><td>:</td><td>{group.start_time || '______'} – {group.end_time || '______'}</td></tr>
              <tr><td>Tempat</td><td>:</td><td>{group.venue || '______________'}</td></tr>
            </tbody>
          </table>

          <h3 className="mt-3 text-center font-bold">ANGGOTA KELOMPOK</h3>
          <table className="template-table mt-1 text-[11px]">
            <thead>
              <tr>
                <th className="w-10">NO</th><th>NAMA</th><th className="w-24">NIM</th><th className="w-20">ROLE</th><th className="w-20">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => (
                <tr key={m.id}>
                  <td className="text-center">{i + 1}.</td>
                  <td>{m.name}</td>
                  <td>{m.nim}</td>
                  <td className="text-center">{m.role === 'leader' ? 'Ketua' : 'Anggota'}</td>
                  <td className="text-center">{m.active ? 'Aktif' : 'Non-aktif'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h3 className="mt-3 text-center font-bold">DOSEN PENGUJI</h3>
          <table className="template-table mt-1 text-[11px]">
            <thead>
              <tr>
                <th className="w-10">NO</th><th>JABATAN</th><th>NAMA PENGUJI</th><th className="w-28">NIP</th><th className="w-28">TANDA TANGAN</th>
              </tr>
            </thead>
            <tbody>
              {PENGUJI_ROLES.map((role, i) => {
                const a = assessors.find((x) => x.assessor_role === role);
                return (
                  <tr key={role}>
                    <td className="text-center">{i + 1}.</td>
                    <td>{PBL_ROLE_LABELS[role]}</td>
                    <td>{a?.display_name || '…………………………………'}</td>
                    <td>{a?.nip || ''}</td>
                    <td className="text-center align-middle">
                      {a?.signature_path ? (
                        <img src={a.signature_path} alt="TTD" className="mx-auto max-h-10 max-w-20 object-contain" />
                      ) : ('')}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <p className="mt-4 text-justify text-[11px] italic">
            Demikian berita acara seminar PBL 1 ini dibuat dan dipergunakan sebagaimana mestinya.
          </p>

          <div className="mt-8 break-inside-avoid text-right">
            <p>Jakarta, {group.tanggal_ba || '______________'}</p>
            <p className="mt-4">Koordinator Program Studi Kesehatan Masyarakat Program Sarjana</p>
            {group.koordinator_signature_path ? (
              <img src={group.koordinator_signature_path} alt="TTD Koordinator" className="my-2 ml-auto max-h-16 max-w-32 object-contain" />
            ) : (
              <div className="h-16" />
            )}
            <p className="font-bold">{group.koordinator || '…………………………………'}</p>
            <p className="text-sm">NIP. {group.nip_koordinator || ''}</p>
          </div>
        </section>

        {/* ===== FORM PENILAIAN PENGUJI ===== */}
        {pengujiSections.map((s) => {
          const a = assessors.find((x) => x.assessor_role === s.role);
          return (
            <section key={s.role} className="pbl-examiner-form">
              <div className="pbl-form-intro">
                {renderPreviewDocHeader(`Formulir Penilaian PBL 1 — ${s.label}`)}
                <table className="w-full text-[11px]">
                  <tbody>
                    <tr><td className="w-[20%]">Kelompok</td><td className="w-3">:</td><td>{group.name} ({group.code})</td></tr>
                    <tr><td>Nama Dosen</td><td>:</td><td>{a?.display_name || '…………………………………'}</td></tr>
                    <tr><td>NIP</td><td>:</td><td>{a?.nip || ''}</td></tr>
                    <tr><td>Hari, Tanggal</td><td>:</td><td>{group.hari_tanggal || '______________'}</td></tr>
                  </tbody>
                </table>
              </div>
              <div className="mt-2">
                {s.codes.map((code) => (
                  <div key={code}>
                    {renderComponentTable(code, s.role, null)}
                  </div>
                ))}
              </div>
              {renderSignatureBlock(s.role, a?.display_name, a?.nip, a?.signature_path)}
            </section>
          );
        })}

        {/* ===== LAPORAN INDIVIDU per member ===== */}
        {activeMembers.map((m) => (
          <section key={m.id} className="pbl-member-block">
            {renderPreviewDocHeader('Formulir Penilaian Laporan Individu')}
            <table className="w-full text-[11px]">
              <tbody>
                <tr><td className="w-[20%]">Nama Mahasiswa</td><td className="w-3">:</td><td>{m.name}</td></tr>
                <tr><td>NIM</td><td>:</td><td>{m.nim}</td></tr>
                <tr><td>Kelompok</td><td>:</td><td>{group.name} ({group.code})</td></tr>
              </tbody>
            </table>
            <div className="mt-2">
              {INDIVIDUAL_COMPONENTS.map((code) => (
                <div key={code}>{renderComponentTable(code, null, m.id)}</div>
              ))}
            </div>
            {renderSignatureBlock('penguji_1')}
          </section>
        ))}

        {/* ===== PEER MAHASISWA ===== */}
        <section className="pbl-peer-page">
          {renderPreviewDocHeader('Penilaian Sesama Mahasiswa (Peer Assessment)')}
          <table className="template-table mt-2 text-[11px]">
            <thead>
              <tr>
                <th className="w-10">NO</th><th>NIM</th><th>NAMA</th>
                <th className="w-24">SKOR AKHIR (0-100)</th><th>REFERENSI</th><th className="w-20">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const p = peers.find((x) => x.student_id === m.id);
                return (
                  <tr key={m.id}>
                    <td className="text-center">{i + 1}.</td>
                    <td>{m.nim}</td>
                    <td>{m.name}</td>
                    <td className="text-center font-semibold">{p?.final_peer_score != null ? p.final_peer_score.toFixed(2) : ''}</td>
                    <td>{p?.source_reference || ''}</td>
                    <td className="text-center">{p?.status || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-[10px] italic">
            Referensi penilaian: {PEER_REFERENCE_CRITERIA.join(' · ')}. Skor merupakan hasil verifikasi dosen atas agregat penilaian antar mahasiswa.
          </p>
        </section>

        {/* ===== REKAPITULASI ===== */}
        <section className="pbl-rekap-page">
          {renderPreviewDocHeader('Rekapitulasi Nilai PBL 1')}
          <table className="template-table mt-2 text-[11px]">
            <thead>
              <tr>
                <th className="w-8" rowSpan={2}>NO</th>
                <th rowSpan={2}>NAMA</th>
                <th className="w-20" rowSpan={2}>NIM</th>
                {(['I1','I2','P1','B1','B2','E1','E2'] as PblComponentCode[]).map((c) => (
                  <th key={c} className="w-12">{c}<br />({(PBL_COMPONENT_WEIGHTS[c] * 100).toFixed(1)}%)</th>
                ))}
                <th className="w-16" rowSpan={2}>CPMK1</th>
                <th className="w-16" rowSpan={2}>CPMK2</th>
                <th className="w-16" rowSpan={2}>FINAL</th>
                <th className="w-12" rowSpan={2}>HURUF</th>
              </tr>
              <tr>
                {(['I1','I2','P1','B1','B2','E1','E2'] as PblComponentCode[]).map((c) => (
                  <th key={c} className="text-[9px] font-normal">{PBL_COMPONENT_LABELS[c].split(' ')[0]}…</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {members.map((m, i) => {
                const s = memberSummary(m);
                return (
                  <tr key={m.id}>
                    <td className="text-center">{i + 1}.</td>
                    <td>{m.name}</td>
                    <td>{m.nim}</td>
                    {(['I1','I2','P1','B1','B2','E1','E2'] as PblComponentCode[]).map((c) => (
                      <td key={c} className="text-center">{s[c] !== null ? s[c]!.toFixed(2) : ''}</td>
                    ))}
                    <td className="text-center font-semibold">{s.cpmk1 !== null ? s.cpmk1.toFixed(2) : ''}</td>
                    <td className="text-center font-semibold">{s.cpmk2 !== null ? s.cpmk2.toFixed(2) : ''}</td>
                    <td className="text-center font-bold">{s.finalScore !== null ? s.finalScore.toFixed(2) : ''}</td>
                    <td className="text-center font-bold">{s.grade || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="mt-3">
            <p className="text-[10px] italic">
              B1/B2 dinilai Dosen Penguji 2 · E1/E2 dinilai Dosen Penguji 1 · P1 (peer skor akhir) · I1/I2 dinilai per mahasiswa.
              CPMK1 = (I1×15% + B1×17.5% + B2×17.5%)/0.5 · CPMK2 = (I2×25% + P1×10% + E1×7.5% + E2×7.5%)/0.5.
            </p>
          </div>

          <div className="mt-10 flex justify-between gap-10">
            {pengujiSections.map((s) => {
              const a = assessors.find((x) => x.assessor_role === s.role);
              return (
                <div key={s.role} className="w-[220px] text-left">
                  <p>{PBL_ROLE_LABELS[s.role]}</p>
                  <div className="h-12">{a?.signature_path ? <img src={a.signature_path} alt="TTD" className="max-h-12 max-w-32 object-contain" /> : null}</div>
                  <p className="border-b border-black pb-0.5 font-bold">{a?.display_name || '………………………'}</p>
                  <p className="text-[10px]">NIP. {a?.nip || ''}</p>
                </div>
              );
            })}
            <div className="w-[220px] text-left">
              <p>Koordinator Program Studi</p>
              <div className="h-12">{group.koordinator_signature_path ? <img src={group.koordinator_signature_path} alt="TTD" className="max-h-12 max-w-32 object-contain" /> : null}</div>
              <p className="border-b border-black pb-0.5 font-bold">{group.koordinator || '………………………'}</p>
              <p className="text-[10px]">NIP. {group.nip_koordinator || ''}</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}