'use client';

import { useEffect, useState, useRef, useCallback, startTransition, memo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/app/components/AuthProvider';
import { S2SignatureUpload } from '@/app/components/common/S2SignatureUpload';
import type {
  S2Session,
  S2SessionPerson,
  S2Score,
  S2Attendance,
} from '@/types/s2';
import {
  S2_EXAMINER_ROLES,
  S2_EXAMINER_TAB_LABELS,
  S2_ROLE_LABELS,
} from '@/types/s2';
import { S2_PROPOSAL_RUBRIC_V1 } from '@/lib/s2/rubric-proposal';
import { DOSEN_WHITELIST, isDosenEmail } from '@/lib/dosen';
import {
  calcTotalSkorXBobot,
  calcNilaiAkhir,
  calcGrade,
  calcIP,
} from '@/lib/s2/calculations';

type Tab =
  | 'berita-acara'
  | 'penilaian-ketua_penguji'
  | 'penilaian-anggota_penguji_1'
  | 'penilaian-anggota_penguji_2'
  | 'penilaian-anggota_penguji_3'
  | 'rekap-nilai'
  | 'daftar-hadir'
  | 'preview';

const RUBRIC = S2_PROPOSAL_RUBRIC_V1;
const DEFAULT_SCORE: (number | null)[] = [null, null, null, null, null, null, null];

const S2_KOORDINATOR_NAME = 'Dr. Apriningsih, S.K.M., M.K.M.';
const S2_KOORDINATOR_NIP = '197604102021212009';

// Document header — mirrors the S1 session page structure exactly:
// kop image (same sizing as S1) inside a centered block with a bottom rule,
// followed by the title, program, faculty and period line.
function DocHeader({
  title, semester, academicYear, isDosen, onUpdate,
}: {
  title: string;
  semester: string;
  academicYear: string;
  isDosen?: boolean;
  onUpdate?: (f: keyof S2Session, v: any) => void;
}) {
  return (
    <div className="text-center border-b-2 border-black pb-4">
      <img
        src="/kop-surat-resize.png"
        alt="KOP UPN Veteran Jakarta"
        style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }}
      />
      <h1 className="text-xl font-bold uppercase">{title}</h1>
      <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM MAGISTER</p>
      <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
      {isDosen && onUpdate ? (
        <p className="text-sm font-semibold">SEMESTER{' '}
          <input
            value={semester}
            onChange={(e) => onUpdate('semester', e.target.value)}
            className="border-b border-gray-400 bg-transparent text-center w-24 font-semibold"
          />{' '}
          T.A.{' '}
          <input
            value={academicYear}
            onChange={(e) => onUpdate('academic_year', e.target.value)}
            className="border-b border-gray-400 bg-transparent text-center w-28 font-semibold"
            placeholder="2025/2026"
          />
        </p>
      ) : (
        <p className="text-sm font-semibold">SEMESTER {semester} T.A. {academicYear}</p>
      )}
    </div>
  );
}


export default function S2SessionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;
  const { profile, isDosen, isSuperadmin } = useAuth();

  const [session, setSession] = useState<S2Session | null>(null);
  const [people, setPeople] = useState<S2SessionPerson[]>([]);
  const [scores, setScores] = useState<S2Score[]>([]);
  const [attendance, setAttendance] = useState<S2Attendance[]>([]);

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>(isDosen ? 'berita-acara' : 'daftar-hadir');
  const [syncStatus, setSyncStatus] = useState<'live' | 'saving' | 'offline'>('live');

  const sessionRef = useRef<S2Session | null>(null);
  const lastSavedSession = useRef<S2Session | null>(null);
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const savingRef = useRef(false);
  const dirtyFields = useRef<Set<string>>(new Set());

  const saveNow = useCallback(async () => {
    if (savingRef.current) return;
    const current = sessionRef.current;
    if (!current) return;
    const toSave: Partial<S2Session> = { updated_at: new Date().toISOString() };
    let hasChanges = false;
    for (const f of Array.from(dirtyFields.current)) {
      (toSave as any)[f] = (current as any)[f];
      hasChanges = true;
    }
    if (!hasChanges) return;

    savingRef.current = true;
    setSyncStatus('saving');
    try {
      const { error } = await supabase.from('s2_sessions').update(toSave).eq('id', sessionId);
      if (!error) {
        for (const f of Array.from(dirtyFields.current)) {
          lastSavedSession.current = { ...(lastSavedSession.current || {}), [f]: (current as any)[f] } as S2Session;
        }
        dirtyFields.current.clear();
        setSyncStatus('live');
      } else {
        // Stay in "saving" — will retry on next keystroke; don't flip to offline
        // on a transient error so the UI doesn't flash "Offline" while typing.
        console.error(error);
      }
    } catch (err) {
      console.error(err);
    } finally {
      savingRef.current = false;
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    loadAll();
    const channel = supabase
      .channel(`s2_session:${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 's2_sessions', filter: `id=eq.${sessionId}` },
        (payload: any) => {
          if (!payload.new) return;
          const incoming = payload.new as S2Session;
          // Merge external changes, but never overwrite a field the local
          // user has just edited (our own realtime echo or another editor).
          lastSavedSession.current = incoming;
          sessionRef.current = { ...(sessionRef.current || {}), ...incoming };
          startTransition(() => {
            setSession((prev) => {
              if (!prev) return prev;
              const merged = { ...prev };
              for (const k of Array.from(Object.keys(incoming)) as (keyof S2Session)[]) {
                if (dirtyFields.current.has(k as string)) continue;
                (merged as any)[k] = (incoming as any)[k];
              }
              return merged;
            });
          });
        }
      )
      .subscribe();
    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      if (dirtyFields.current.size > 0) { void saveNow(); }
      supabase.removeChannel(channel);
    };
  }, [sessionId, saveNow]);

  async function loadAll() {
    setLoading(true);
    const [sRes, pRes, scRes, aRes] = await Promise.all([
      supabase.from('s2_sessions').select('*').eq('id', sessionId).single(),
      supabase.from('s2_session_people').select('*').eq('session_id', sessionId).order('sequence_no'),
      supabase.from('s2_scores').select('*').eq('session_id', sessionId),
      supabase.from('s2_attendance').select('*').eq('session_id', sessionId),
    ]);

    if (sRes.error || !sRes.data) {
      setSession(null);
      setLoading(false);
      return;
    }
    const s = { ...(sRes.data as S2Session) };
    if (!s.koordinator) s.koordinator = S2_KOORDINATOR_NAME;
    if (!s.nip_koordinator) s.nip_koordinator = S2_KOORDINATOR_NIP;

    setSession(s);
    setPeople((pRes.data || []) as S2SessionPerson[]);
    setScores((scRes.data || []) as S2Score[]);
    setAttendance((aRes.data || []) as S2Attendance[]);
    sessionRef.current = s;
    lastSavedSession.current = s;
    setLoading(false);
  }

  const updateSessionField = useCallback(
    (field: keyof S2Session, value: any) => {
      dirtyFields.current.add(field as string);
      const merged = { ...(sessionRef.current || {}), [field]: value, updated_at: new Date().toISOString() } as S2Session;
      sessionRef.current = merged;
      startTransition(() => setSession(merged));
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => { void saveNow(); }, 800);
    },
    [saveNow]
  );

  // People (penguji) helpers — match logged-in user to their assignment
  // by NAME (mirrors S1 logic), not by user_id.
  const whitelistMatch = profile?.email ? isDosenEmail(profile.email) : null;
  const canonicalName = whitelistMatch?.nama || '';
  const dbFullName = profile?.full_name || '';
  const emailPrefix = profile?.email?.split('@')[0] || '';
  const allUserNames = [canonicalName, dbFullName, emailPrefix].filter(Boolean);

  const normalize = (s: string) =>
    s.toLowerCase().replace(/[,.\-]/g, '').replace(/\s+/g, ' ').trim();

  const matchName = (target: string): boolean => {
    if (allUserNames.length === 0 || !target) return false;
    const b = normalize(target);
    for (const name of allUserNames) {
      const a = normalize(name);
      if (a === b) return true;
      if (a.includes(b) || b.includes(a)) return true;
      const wordsA = a.split(' ').filter((w) => w.length > 2);
      const wordsB = b.split(' ').filter((w) => w.length > 2);
      if (wordsA.length >= 2 && wordsB.length >= 2 && wordsA[0] === wordsB[0] && wordsA[1] === wordsB[1]) return true;
    }
    return false;
  };

  // Roles this user is allowed to view/edit (null = none)
  const allowedExaminerRoles: string[] | null = (() => {
    if (isSuperadmin) return [...S2_EXAMINER_ROLES];
    if (!isDosen) return null;
    const matched = people
      .filter((p) => S2_EXAMINER_ROLES.includes(p.role) && matchName(p.display_name))
      .map((p) => p.role);
    return matched.length ? matched : null;
  })();

  function getExaminerScores(personId: string): (number | null)[] {
    const out: (number | null)[] = [null, null, null, null, null, null, null];
    scores
      .filter((sc) => sc.examiner_person_id === personId)
      .forEach((sc) => {
        const idx = RUBRIC.findIndex((c) => c.code === sc.criterion_code);
        if (idx >= 0) out[idx] = sc.score;
      });
    return out;
  }

  function canEditExaminer(role: string): boolean {
    if (isSuperadmin) return true;
    if (!isDosen) return false;
    if (allowedExaminerRoles === null) return false;
    return allowedExaminerRoles.includes(role);
  }

  async function saveScore(examinerPersonId: string, criterionCode: string, score: number | null) {
    const criterion = RUBRIC.find((c) => c.code === criterionCode)!;
    setSyncStatus('saving');
    const { error } = await supabase.from('s2_scores').upsert(
      {
        session_id: sessionId,
        examiner_person_id: examinerPersonId,
        criterion_code: criterionCode,
        criterion_label_snapshot: criterion.label,
        weight_snapshot: criterion.bobot,
        score,
      },
      { onConflict: 'session_id,examiner_person_id,criterion_code' }
    );
    const { data } = await supabase.from('s2_scores').select('*').eq('session_id', sessionId);
    if (data) { setScores(data as S2Score[]); }
    setSyncStatus(error ? 'offline' : 'live');
  }

  async function savePerson(personId: string, field: 'display_name' | 'nip' | 'signature_path', value: string) {
    setPeople((prev) => prev.map((p) => (p.id === personId ? { ...p, [field]: value } : p)));
    const { error } = await supabase.from('s2_session_people').update({ [field]: value, updated_at: new Date().toISOString() }).eq('id', personId);
    if (error) {
      console.error(error);
      alert('Gagal menyimpan: ' + error.message);
    }
  }
  async function addPerson(role: string, displayName: string, nip: string) {
    let userId: string | null = null;
    // Try to link the person to a profiles row by email (derived from the
    // dosen whitelist) so per-examiner scoping works when user_id is set.
    const wl = DOSEN_WHITELIST.find(
      (d) => d.nama.toLowerCase().trim() === displayName.toLowerCase().trim()
    );
    if (wl) {
      const { data: prof } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', wl.email)
        .maybeSingle();
      if (prof) userId = prof.id;
    }
    const { error } = await supabase.from('s2_session_people').insert({
      session_id: sessionId,
      role,
      display_name: displayName,
      nip: nip || '',
      email: wl ? wl.email : '',
      user_id: userId,
      sequence_no: 1,
    });
    if (error) { console.error(error); alert('Gagal menambah: ' + error.message); }
    else { const { data } = await supabase.from('s2_session_people').select('*').eq('session_id', sessionId).order('sequence_no'); if (data) setPeople(data as S2SessionPerson[]); }
  }
  async function removePerson(personId: string) {
    const { error } = await supabase.from('s2_session_people').delete().eq('id', personId);
    if (error) { console.error(error); alert('Gagal menghapus: ' + error.message); }
    else { setPeople((prev) => prev.filter((p) => p.id !== personId)); }
  }

  async function saveAttendance(entries: S2Attendance[], type: 'peserta' | 'audiens') {
    setSyncStatus('saving');
    await supabase.from('s2_attendance').delete().eq('session_id', sessionId).eq('attendance_type', type);
    if (entries.length > 0) {
      const toInsert = entries.map((e) => ({
        session_id: sessionId, attendance_type: type, name: e.name, nim: e.nim || '', signature_path: e.signature_path || null, notes: e.notes || '',
      }));
      const { error } = await supabase.from('s2_attendance').insert(toInsert);
      if (error) { setSyncStatus('offline'); console.error(error); return; }
    }
    const { data } = await supabase.from('s2_attendance').select('*').eq('session_id', sessionId);
    if (data) setAttendance(data as S2Attendance[]);
    setSyncStatus('live');
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-gray-500 font-serif text-lg">Memuat data sesi...</div>;
  if (!session) return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-red-500 font-serif text-lg gap-4">
      <p>Sesi tidak ditemukan</p>
      <Link href="/s2/sessions" className="text-blue-700 underline">← Kembali ke daftar</Link>
    </div>
  );

  const examiners = people.filter((p) => S2_EXAMINER_ROLES.includes(p.role));
  const supervisors = people.filter((p) => p.role === 'pembimbing_1' || p.role === 'pembimbing_2');

  const allTabs: { key: Tab; label: string }[] = [
    { key: 'berita-acara', label: 'Berita Acara' },
    ...S2_EXAMINER_ROLES.map((r) => ({ key: `penilaian-${r}` as Tab, label: S2_EXAMINER_TAB_LABELS[r] || r })),
    { key: 'rekap-nilai', label: 'Rekapitulasi Nilai' },
    { key: 'daftar-hadir', label: 'Daftar Hadir' },
    { key: 'preview', label: 'Preview & PDF' },
  ];

  const tabs = allTabs.filter((t) => {
    if (t.key.startsWith('penilaian-')) {
      const role = t.key.replace('penilaian-', '');
      if (isSuperadmin) return true;
      if (!isDosen) return false;
      if (allowedExaminerRoles === null) return false;
      return allowedExaminerRoles.includes(role);
    }
    return true;
  });

  const personByRole = (role: string) => people.find((p) => p.role === role) || null;

  return (
    <div className="max-w-5xl mx-auto p-4 font-serif">
      <div className={`no-print sync-indicator ${syncStatus === 'live' ? 'bg-green-100 text-green-800' : syncStatus === 'saving' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
        <span className={`w-2 h-2 rounded-full ${syncStatus === 'live' ? 'bg-green-500' : syncStatus === 'saving' ? 'bg-yellow-500' : 'bg-red-500'}`} />
        {syncStatus === 'live' ? 'Tersimpan' : syncStatus === 'saving' ? 'Menyimpan...' : 'Offline'}
      </div>

      <div className="bg-white rounded-lg shadow-md p-4 mb-4 no-print">
        <Link href="/s2/sessions" className="text-sm text-green-800 hover:underline">← Kembali ke S2 Sessions</Link>
        <h1 className="text-xl font-bold mt-1">{session.student_name} <span className="text-gray-500 text-base">({session.student_nim})</span></h1>
        <p className="text-sm text-gray-600">{session.thesis_title || '—'}</p>
        <p className="text-xs text-gray-400 font-sans mt-1">
          {session.exam_date ? new Date(session.exam_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Belum dijadwalkan'}
          {session.venue ? ` • ${session.venue}` : ''} • Status: {session.status}
        </p>
      </div>

      <div className="no-print flex flex-wrap gap-1 mb-4 bg-white rounded-lg shadow-sm p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 rounded text-sm font-sans font-medium whitespace-nowrap transition-colors ${activeTab === t.key ? 'bg-green-900 text-white shadow' : 'text-gray-600 hover:bg-gray-100'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 print:shadow-none print:p-0">
        {activeTab === 'berita-acara' && (
          <BeritaAcaraTab
            session={session} onUpdate={updateSessionField} isDosen={isDosen}
            people={people} onSavePerson={savePerson} onAddPerson={(role, name, nip) => addPerson(role, name, nip)} onRemovePerson={removePerson}
          />
        )}
        {S2_EXAMINER_ROLES.map((role) => {
          if (activeTab !== `penilaian-${role}`) return null;
          const person = personByRole(role);
          if (!person) return <div key={role} className="text-amber-600">Penguji untuk peran ini belum ditambahkan di Berita Acara.</div>;
          return <PenilaianTab key={role} session={session} person={person} role={role} scores={getExaminerScores(person.id)} canEdit={canEditExaminer(role)} onSaveScore={(code, val) => saveScore(person.id, code, val)} onSavePerson={savePerson} isDosen={isDosen} onUpdate={updateSessionField} />;
        })}
        {activeTab === 'rekap-nilai' && (
          <RekapNilaiTab session={session} people={people} scores={scores} onUpdate={updateSessionField} isDosen={isDosen} />
        )}
        {activeTab === 'daftar-hadir' && (
          <DaftarHadirTab session={session} people={people} attendance={attendance} onSave={(entries, type) => saveAttendance(entries, type)} sessionId={sessionId} isDosen={isDosen} onUpdate={updateSessionField} />
        )}
        {activeTab === 'preview' && (
          <S2Preview session={session} people={people} scores={scores} attendance={attendance} onUpdate={updateSessionField} />
        )}
      </div>
    </div>
  );
}

// ─── BERITA ACARA (mirrors S1, S2 wording, 4 penguji) ─────────
const BeritaAcaraTab = memo(function BeritaAcaraTab({
  session, onUpdate, isDosen, people, onSavePerson, onAddPerson, onRemovePerson,
}: {
  session: S2Session;
  onUpdate: (f: keyof S2Session, v: any) => void;
  isDosen: boolean;
  people: S2SessionPerson[];
  onSavePerson: (id: string, f: 'display_name' | 'nip' | 'signature_path', v: string) => void;
  onAddPerson: (role: string, name: string, nip: string) => void;
  onRemovePerson: (id: string) => void;
}) {
  const field = (label: string, f: keyof S2Session, placeholder = '') => (
    <div className="flex">
      <span className="w-36 shrink-0">{label}</span><span className="w-4">:</span>
      {isDosen ? (
        <input value={(session[f] as any) ?? ''} onChange={(e) => onUpdate(f, e.target.value)} className="flex-1 border-b border-gray-400 bg-transparent" placeholder={placeholder} />
      ) : (
        <span className="flex-1">{(session[f] as any) || '—'}</span>
      )}
    </div>
  );

  const examiners = people.filter((p) => S2_EXAMINER_ROLES.includes(p.role));
  const supervisors = people.filter((p) => p.role === 'pembimbing_1' || p.role === 'pembimbing_2');

  const ALL_ROLES = [
    { role: 'ketua_penguji', label: 'Ketua Penguji' },
    { role: 'anggota_penguji_1', label: 'Anggota Penguji 1' },
    { role: 'anggota_penguji_2', label: 'Anggota Penguji 2' },
    { role: 'anggota_penguji_3', label: 'Anggota Penguji 3' },
    { role: 'pembimbing_1', label: 'Pembimbing 1' },
    { role: 'pembimbing_2', label: 'Pembimbing 2' },
  ];

  return (
    <div className="space-y-4">
      <DocHeader title="Laporan Seminar Proposal Tesis" semester={session.semester} academicYear={session.academic_year} isDosen={isDosen} onUpdate={onUpdate} />

      <p>
        Pada hari ini{' '}
        <input value={session.hari_tanggal} onChange={(e) => onUpdate('hari_tanggal', e.target.value)} className="border-b border-gray-400 bg-transparent px-1 font-semibold w-64" placeholder="..., tanggal ... bulan ... tahun 2026" />
        , telah dilaksanakan Seminar Proposal Tesis bagi mahasiswa:
      </p>

      <table className="w-full text-sm">
        <tbody>
          <tr><td className="w-36">Nama</td><td className="w-4">:</td><td><input value={session.student_name} onChange={(e) => onUpdate('student_name', e.target.value)} className="w-full border-b border-gray-400 bg-transparent" /></td></tr>
          <tr><td>NIM</td><td>:</td><td><input value={session.student_nim} onChange={(e) => onUpdate('student_nim', e.target.value)} className="w-full border-b border-gray-400 bg-transparent" /></td></tr>
          <tr><td>Waktu Sidang</td><td>:</td><td><input value={session.start_time || ''} onChange={(e) => onUpdate('start_time', e.target.value)} className="w-full border-b border-gray-400 bg-transparent" /></td></tr>
          <tr><td>Peminatan</td><td>:</td><td><input value={session.specialization} onChange={(e) => onUpdate('specialization', e.target.value)} className="w-full border-b border-gray-400 bg-transparent" /></td></tr>
        </tbody>
      </table>

      <div>
        <p className="font-semibold text-sm">Dengan Judul Penelitian sebagai berikut :</p>
        <textarea value={session.thesis_title} onChange={(e) => onUpdate('thesis_title', e.target.value)} className="w-full border border-gray-300 rounded p-2 font-serif mt-1 min-h-[60px]" />
      </div>

      <div className="space-y-2">
        <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-green-50">
          <input type="radio" name="s2-decision" checked={session.decision === 'lulus_dengan_perbaikan'} onChange={() => onUpdate('decision', 'lulus_dengan_perbaikan')} className="mt-1" />
          <span className="font-semibold">Proposal tesis dilanjutkan dengan perbaikan</span>
        </label>
        <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-red-50">
          <input type="radio" name="s2-decision" checked={session.decision === 'tidak_lulus_mengulang'} onChange={() => onUpdate('decision', 'tidak_lulus_mengulang')} className="mt-1" />
          <span className="font-semibold">Proposal tesis tidak diluluskan / Mengulang sidang</span>
        </label>
        <p className="text-xs text-gray-500">*) Coret yang tidak perlu</p>
      </div>

      <p className="italic text-sm text-justify">Demikian laporan seminar proposal tesis ini dibuat sebagai laporan selama seminar berlangsung untuk diketahui dan dipergunakan sebagaimana mestinya.</p>

      {/* TIM PENGUJI */}
      <div>
        <h3 className="font-bold text-center mb-1">TIM PENGUJI</h3>
        <table className="template-table text-[15px] leading-snug">
          <thead><tr><th className="w-10">NO</th><th>NAMA PENGUJI</th><th className="w-28">JABATAN</th><th className="w-24">TANDA TANGAN</th>{isDosen && <th className="w-10">✕</th>}</tr></thead>
          <tbody>
            {examiners.map((p, i) => (
              <tr key={p.id}>
                <td className="text-center">{i + 1}.</td>
                <td>{isDosen ? <input value={p.display_name} onChange={(e) => onSavePerson(p.id, 'display_name', e.target.value)} className="w-full bg-transparent" /> : p.display_name}</td>
                <td>{S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS]}</td>
                <td className="text-center align-middle"><S2SignatureUpload value={p.signature_path} onChange={(v) => onSavePerson(p.id, 'signature_path', v || '')} label={S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS]} /></td>
                {isDosen && <td className="text-center"><button onClick={() => onRemovePerson(p.id)} className="text-red-500 hover:text-red-700 text-xs">✕</button></td>}
              </tr>
            ))}
            {supervisors.map((p, i) => (
              <tr key={p.id}>
                <td className="text-center">{examiners.length + i + 1}.</td>
                <td>{isDosen ? <input value={p.display_name} onChange={(e) => onSavePerson(p.id, 'display_name', e.target.value)} className="w-full bg-transparent" placeholder="Nama Pembimbing" /> : p.display_name}</td>
                <td>{S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS]}</td>
                <td className="text-center align-middle"><S2SignatureUpload value={p.signature_path} onChange={(v) => onSavePerson(p.id, 'signature_path', v || '')} label={S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS]} /></td>
                {isDosen && <td className="text-center"><button onClick={() => onRemovePerson(p.id)} className="text-red-500 hover:text-red-700 text-xs">✕</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
        {isDosen && <AddPersonInline onAdd={onAddPerson} existingRoles={people.map((p) => p.role)} />}
      </div>

      {/* Koordinator */}
      <div className="text-right mt-8 avoid-break">
        <p>Jakarta,{' '}
          <input value={session.tanggal_ba} onChange={(e) => onUpdate('tanggal_ba', e.target.value)} className="border-b border-gray-400 bg-transparent w-40 text-center" placeholder="tanggal" />
        </p>
        <p className="mt-4">Koordinator Program Studi</p>
        <S2SignatureUpload value={session.koordinator_signature_path} onChange={(v) => onUpdate('koordinator_signature_path', v)} label="Koordinator" />
        <div className="h-8" />
        <input value={session.koordinator || S2_KOORDINATOR_NAME} onChange={(e) => onUpdate('koordinator', e.target.value)} className="border-b border-gray-400 bg-transparent text-center font-semibold" />
        <br />
        <input value={session.nip_koordinator || S2_KOORDINATOR_NIP} onChange={(e) => onUpdate('nip_koordinator', e.target.value)} className="border-b border-gray-400 bg-transparent text-center text-sm" />
      </div>
    </div>
  );
});

function AddPersonInline({ onAdd, existingRoles }: { onAdd: (role: string, name: string, nip: string) => void; existingRoles: string[] }) {
  const ALL_ROLES = [
    { role: 'ketua_penguji', label: 'Ketua Penguji' },
    { role: 'anggota_penguji_1', label: 'Anggota Penguji 1' },
    { role: 'anggota_penguji_2', label: 'Anggota Penguji 2' },
    { role: 'anggota_penguji_3', label: 'Anggota Penguji 3' },
    { role: 'pembimbing_1', label: 'Pembimbing 1' },
    { role: 'pembimbing_2', label: 'Pembimbing 2' },
  ];
  const [role, setRole] = useState('ketua_penguji');
  const [name, setName] = useState('');
  const [nip, setNip] = useState('');
  const available = ALL_ROLES.filter((r) => !existingRoles.includes(r.role));
  const eff = available.find((r) => r.role === role) ? role : available[0]?.role || '';
  if (available.length === 0) return <p className="text-xs text-gray-500 mt-2 italic">Semua peran sudah terisi.</p>;
  return (
    <div className="mt-3 p-3 border rounded-lg bg-gray-50 space-y-2">
      <p className="text-sm font-semibold">+ Tambah Penguji / Pembimbing</p>
      <div className="flex flex-wrap gap-2 items-end">
        <select value={eff} onChange={(e) => setRole(e.target.value)} className="border border-gray-300 rounded px-2 py-1 font-serif text-sm">
          {available.map((r) => <option key={r.role} value={r.role}>{r.label}</option>)}
        </select>
        <input value={name} onChange={(e) => setName(e.target.value)} className="flex-1 min-w-[160px] border border-gray-300 rounded px-2 py-1 font-serif text-sm" placeholder="Nama dosen" />
        <input value={nip} onChange={(e) => setNip(e.target.value)} className="w-32 border border-gray-300 rounded px-2 py-1 font-serif text-sm" placeholder="NIP" />
        <button onClick={() => { if (!name.trim()) { alert('Masukkan nama'); return; } onAdd(eff, name.trim(), nip.trim()); setName(''); setNip(''); }} className="bg-green-900 text-white px-4 py-2 rounded hover:bg-green-800 font-sans text-sm font-medium">Tambah</button>
      </div>
    </div>
  );
}

// ─── PENILAIAN (7 criteria, 4 examiners) ─────────────────────
const PenilaianTab = memo(function PenilaianTab({
  session, person, role, scores, canEdit, onSaveScore, onSavePerson, isDosen, onUpdate,
}: {
  session: S2Session; person: S2SessionPerson; role: string; scores: (number | null)[]; canEdit: boolean; onSaveScore: (code: string, value: number | null) => void; onSavePerson: (id: string, f: 'display_name' | 'nip' | 'signature_path', v: string) => void; isDosen: boolean; onUpdate: (f: keyof S2Session, v: any) => void;
}) {
  const label = S2_ROLE_LABELS[role as keyof typeof S2_ROLE_LABELS];
  const [local, setLocal] = useState(scores);
  useEffect(() => { setLocal(scores); }, [scores]);

  const setScore = (idx: number, code: string, value: string) => {
    if (value === '') { setLocal((prev) => { const n = [...prev]; n[idx] = null; return n; }); onSaveScore(code, null); return; }
    const num = Number(value);
    if (isNaN(num)) return;
    const v = Math.min(4, Math.max(1, Math.round(num * 100) / 100));
    setLocal((prev) => { const n = [...prev]; n[idx] = v; return n; });
    onSaveScore(code, v);
  };

  const total = calcTotalSkorXBobot(local, RUBRIC.map((c) => c.bobot));
  const nilai = calcNilaiAkhir(total);
  const grade = total > 0 ? calcGrade(nilai) : '';

  return (
    <div className="space-y-4">
      <DocHeader title="Formulir Penilaian Seminar Proposal Tesis" semester={session.semester} academicYear={session.academic_year} isDosen={isDosen} onUpdate={onUpdate} />

      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
        <div className="flex"><span className="w-36">Nama Peserta</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.student_name}</span></div>
        <div className="flex"><span className="w-36">NIM</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.student_nim}</span></div>
        <div className="flex"><span className="w-36">Hari, Tanggal</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.hari_tanggal || session.exam_date || ''}</span></div>
        <div className="flex"><span className="w-36">Waktu</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.start_time || ''}</span></div>
        <div className="flex"><span className="w-36">Tempat</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.venue}</span></div>
        <div className="flex"><span className="w-36">Jabatan Penguji</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{label}</span></div>
      </div>
      <div className="flex"><span className="w-36">Peminatan</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.specialization}</span></div>
      <div className="flex"><span className="w-36">Judul Tesis</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.thesis_title}</span></div>

       <table className="template-table text-[15px] leading-snug">
        <thead><tr><th className="w-8">NO</th><th>PARAMETER PENILAIAN</th><th className="w-24">SKOR (1—4)</th><th className="w-14">BOBOT</th><th className="w-24">SKOR × BOBOT</th></tr></thead>
        <tbody>
          {RUBRIC.map((c, i) => {
            const sb = local[i] !== null ? local[i]! * c.bobot : null;
            return (
              <tr key={c.code} className="avoid-break">
                <td className="text-center align-top">{i + 1}.</td>
                <td className="text-xs leading-snug py-1.5"><div className="font-semibold">{c.label}</div><div className="whitespace-pre-line text-[11px] text-gray-700">{c.details.join('\n')}</div></td>
                <td className="text-center">
                  {canEdit ? (
                    <input type="number" min={1} max={4} step="0.01" value={local[i] ?? ''} onChange={(e) => setScore(i, c.code, e.target.value)} className="w-16 text-center border border-gray-300 rounded px-1 py-1" />
                  ) : <span>{local[i] ?? ''}</span>}
                </td>
                <td className="text-center">{c.bobot}</td>
                <td className="text-center font-semibold">{sb !== null ? sb : ''}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="font-bold"><td colSpan={4} className="text-center">TOTAL SKOR NILAI × BOBOT</td><td className="text-center">{total}</td></tr>
          <tr className="font-bold"><td colSpan={4} className="text-center">NILAI AKHIR [(Total Skor × Bobot)/400 × 100]</td><td className="text-center">{total > 0 ? nilai.toFixed(2) : ''}</td></tr>
          <tr className="font-bold"><td colSpan={4} className="text-center">HURUF MUTU</td><td className="text-center">{grade}</td></tr>
        </tfoot>
      </table>

      {!canEdit && <p className="text-xs text-amber-600 italic">Anda hanya dapat melihat penilaian ini.</p>}

      <div className="mt-6 avoid-break text-right">
        <p>Jakarta, {session.tanggal_ba || session.exam_date || '______________'}</p>
        <p className="mt-8">{label}</p>
        <div className="flex justify-end">
          <S2SignatureUpload value={person.signature_path} onChange={(v) => onSavePerson(person.id, 'signature_path', v || '')} label={label} />
        </div>
        <div className="h-8" />
        <p className="border-t border-black pt-1 font-semibold">{person.display_name}</p>
        <p className="text-xs">NIP. {person.nip}</p>
      </div>
    </div>
  );
});

// ─── REKAPITULASI (S2 template) ──────────────────────────────
function RekapNilaiTab({ session, people, scores, onUpdate, isDosen }: { session: S2Session; people: S2SessionPerson[]; scores: S2Score[]; onUpdate: (f: keyof S2Session, v: any) => void; isDosen: boolean }) {
  const examiners = people.filter((p) => S2_EXAMINER_ROLES.includes(p.role));
  const nilaiPerExaminer = examiners.map((p) => {
    const sc: (number | null)[] = [null, null, null, null, null, null, null];
    scores.filter((s) => s.examiner_person_id === p.id).forEach((s) => {
      const idx = RUBRIC.findIndex((c) => c.code === s.criterion_code);
      if (idx >= 0) sc[idx] = s.score;
    });
    const total = calcTotalSkorXBobot(sc, RUBRIC.map((c) => c.bobot));
    return total > 0 ? calcNilaiAkhir(total) : null;
  });

  const valid = nilaiPerExaminer.filter((n) => n !== null) as number[];
  const rataRata = valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  const ip = valid.length ? calcIP(rataRata) : null;

  return (
    <div className="space-y-4">
      <DocHeader title="Rekapitulasi Nilai Seminar Proposal Tesis" semester={session.semester} academicYear={session.academic_year} isDosen={isDosen} onUpdate={onUpdate} />

      <table className="w-full text-sm">
        <tbody>
          <tr><td className="w-36">Tanggal Ujian</td><td className="w-4">:</td><td><input value={session.hari_tanggal || session.exam_date || ''} onChange={(e) => onUpdate('hari_tanggal', e.target.value)} className="w-full border-b border-gray-400 bg-transparent" /></td></tr>
          <tr><td>Tempat Ujian</td><td>:</td><td><input value={session.venue} onChange={(e) => onUpdate('venue', e.target.value)} className="w-full border-b border-gray-400 bg-transparent" placeholder="Fakultas Ilmu Kesehatan" /></td></tr>
        </tbody>
      </table>

       <table className="template-table text-[15px] leading-snug">
        <thead>
          <tr>
            <th className="w-8">NO</th><th>NAMA</th><th className="w-20">NIM</th>
            <th className="w-14">I</th><th className="w-14">II</th><th className="w-14">III</th><th className="w-14">IV</th>
            <th className="w-16">RATA-RATA</th><th className="w-14">IP</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="text-center">1.</td>
            <td><input value={session.student_name} onChange={(e) => onUpdate('student_name', e.target.value)} className="w-full bg-transparent" /></td>
            <td><input value={session.student_nim} onChange={(e) => onUpdate('student_nim', e.target.value)} className="w-full bg-transparent" /></td>
            {nilaiPerExaminer.map((n, i) => (
              <td key={i} className="text-center font-semibold">{n !== null ? n.toFixed(2) : ''}</td>
            ))}
            {Array.from({ length: Math.max(0, 4 - nilaiPerExaminer.length) }).map((_, i) => <td key={`e${i}`} className="text-center"></td>)}
            <td className="text-center font-bold">{valid.length ? rataRata.toFixed(2) : ''}</td>
            <td className="text-center font-bold">{ip !== null ? ip.toFixed(2) : ''}</td>
          </tr>
        </tbody>
      </table>

      <div className="mt-8 avoid-break">
        <p className="mb-2">Jakarta,{' '}
          <input value={session.tanggal_ba} onChange={(e) => onUpdate('tanggal_ba', e.target.value)} className="border-b border-gray-400 bg-transparent w-40 text-center" />
        </p>
        <p className="font-semibold mb-1">Tanda Tangan</p>
        <div className="space-y-2">
          {examiners.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2 text-sm">
              <span className="w-48 shrink-0">{i + 1}. {S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS]}</span>
              <span className="flex-1 border-b border-black">{p.display_name || '…………………………………..'}</span>
              <span className="w-24 text-center">
                {p.signature_path ? (
                  <img src={p.signature_path} alt="TTD" className="max-h-12 max-w-24 object-contain mx-auto" />
                ) : (
                  <span className="text-gray-300 text-xs">(—)</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function isStatic(v: any) { return v || ''; }

// ─── DAFTAR HADIR (single tab: penguji + peserta + audiens) ──
function DaftarHadirTab({ session, people, attendance, onSave, sessionId, isDosen, onUpdate }: {
  session: S2Session; people: S2SessionPerson[]; attendance: S2Attendance[];
  onSave: (entries: S2Attendance[], type: 'peserta' | 'audiens') => void; sessionId: string; isDosen: boolean; onUpdate: (f: keyof S2Session, v: any) => void;
}) {
  const penguji = people.filter((p) => S2_EXAMINER_ROLES.includes(p.role) || p.role === 'pembimbing_1' || p.role === 'pembimbing_2');
  const peserta = attendance.filter((a) => a.attendance_type === 'peserta');
  const audiens = attendance.filter((a) => a.attendance_type === 'audiens');

  const [localPeserta, setLocalPeserta] = useState<S2Attendance[]>(peserta.length ? peserta : [{ id: '', session_id: sessionId, attendance_type: 'peserta', name: session.student_name, nim: session.student_nim, signature_path: null, notes: '', submitted_by: null, submitted_at: '', created_at: '', updated_at: '' }]);
  const [localAudiens, setLocalAudiens] = useState<S2Attendance[]>(audiens);

  const updateP = (idx: number, f: 'name' | 'nim' | 'signature_path', v: string | null) => setLocalPeserta((prev) => prev.map((e, i) => i === idx ? { ...e, [f]: v } : e));
  const updateA = (idx: number, f: 'name' | 'nim' | 'signature_path', v: string | null) => setLocalAudiens((prev) => prev.map((e, i) => i === idx ? { ...e, [f]: v } : e));
  const addP = () => setLocalPeserta((prev) => [...prev, { id: '', session_id: sessionId, attendance_type: 'peserta', name: '', nim: '', signature_path: null, notes: '', submitted_by: null, submitted_at: '', created_at: '', updated_at: '' }]);
  const addA = () => setLocalAudiens((prev) => [...prev, { id: '', session_id: sessionId, attendance_type: 'audiens', name: '', nim: '', signature_path: null, notes: '', submitted_by: null, submitted_at: '', created_at: '', updated_at: '' }]);
  const removeP = (idx: number) => { const n = localPeserta.filter((_, i) => i !== idx); setLocalPeserta(n); onSave(n, 'peserta'); };
  const removeA = (idx: number) => { const n = localAudiens.filter((_, i) => i !== idx); setLocalAudiens(n); onSave(n, 'audiens'); };

  const copyLink = () => {
    const url = `${window.location.origin}/s2/attendance/${session.public_attendance_token}`;
    navigator.clipboard.writeText(url).then(() => alert('Link Daftar Hadir disalin!\n\n' + url));
  };

  return (
    <div className="space-y-8">
      {isDosen && (
        <div className="no-print mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-green-900">Link Daftar Hadir untuk Mahasiswa</p>
            <p className="text-xs text-green-700">Bagikan link ini ke mahasiswa untuk mengisi daftar hadir (tanpa login).</p>
          </div>
          <button onClick={copyLink} className="bg-green-900 text-white px-4 py-2 rounded hover:bg-green-800 font-sans text-sm font-medium shrink-0">Salin Link</button>
        </div>
      )}

      {/* Daftar Hadir Penguji */}
      <div>
        <DocHeader title="Daftar Hadir Penguji Seminar Proposal Tesis" semester={session.semester} academicYear={session.academic_year} isDosen={isDosen} onUpdate={onUpdate} />
        <table className="w-full text-sm"><tbody>
          <tr><td className="w-32">Nama Mahasiswa</td><td className="w-4">:</td><td>{session.student_name}</td></tr>
          <tr><td>NIM</td><td>:</td><td>{session.student_nim}</td></tr>
          <tr><td>Tanggal</td><td>:</td><td>{session.hari_tanggal || session.exam_date || ''}</td></tr>
          <tr><td>Peminatan</td><td>:</td><td>{session.specialization}</td></tr>
        </tbody></table>
        <table className="template-table text-[15px] leading-snug mt-4">
          <thead><tr><th className="w-8">NO</th><th className="w-28">NIP</th><th>NAMA PENGUJI</th><th>JABATAN</th><th className="w-24">TANDA TANGAN</th></tr></thead>
          <tbody>
            {penguji.map((p, i) => (
              <tr key={p.id}><td className="text-center">{i + 1}.</td><td>{p.nip}</td><td>{p.display_name}</td><td>{S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS]}</td><td className="text-center align-middle">{p.signature_path ? <img src={p.signature_path} alt="TTD" className="max-h-10 max-w-20 object-contain mx-auto" /> : <span className="text-gray-300">—</span>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Daftar Hadir Peserta */}
      <div>
        <h2 className="font-bold text-center mb-2">Daftar Hadir Peserta Seminar Proposal Tesis</h2>
        <table className="template-table text-[15px] leading-snug">
          <thead><tr><th className="w-8">NO</th><th>NAMA PESERTA</th><th className="w-24">NIM</th><th className="w-24">TANDA TANGAN</th><th className="w-16">KET</th></tr></thead>
          <tbody>
            {localPeserta.map((p, i) => (
              <tr key={i}><td className="text-center">{i + 1}.</td>
                <td><input value={p.name} onChange={(e) => updateP(i, 'name', e.target.value)} className="w-full bg-transparent" /></td>
                <td><input value={p.nim} onChange={(e) => updateP(i, 'nim', e.target.value)} className="w-full bg-transparent" /></td>
                <td className="text-center align-middle"><S2SignatureUpload value={p.signature_path} onChange={(v) => updateP(i, 'signature_path', v)} label="Peserta" /></td>
                <td className="text-center">{localPeserta.length > 1 && <button onClick={() => removeP(i)} className="no-print text-red-500 text-xs">✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => { addP(); }} className="no-print mt-2 px-3 py-1 bg-gray-100 border rounded text-sm hover:bg-gray-200 font-sans">+ Tambah baris peserta</button>
        <button onClick={() => onSave(localPeserta, 'peserta')} className="no-print ml-2 px-3 py-1 bg-green-800 text-white rounded text-sm hover:bg-green-700 font-sans">Simpan Peserta</button>
      </div>

      {/* Daftar Hadir Audiens */}
      <div>
        <h2 className="font-bold text-center mb-2">Daftar Hadir Mahasiswa Sebagai Audiens</h2>
        <table className="template-table text-[15px] leading-snug">
          <thead><tr><th className="w-8">NO</th><th>NAMA MAHASISWA</th><th className="w-24">NIM</th><th className="w-24">TANDA TANGAN</th><th className="w-16">KET</th></tr></thead>
          <tbody>
            {localAudiens.map((a, i) => (
              <tr key={i}><td className="text-center">{i + 1}.</td>
                <td><input value={a.name} onChange={(e) => updateA(i, 'name', e.target.value)} className="w-full bg-transparent" placeholder="Nama mahasiswa" /></td>
                <td><input value={a.nim} onChange={(e) => updateA(i, 'nim', e.target.value)} className="w-full bg-transparent" placeholder="NIM" /></td>
                <td className="text-center align-middle"><S2SignatureUpload value={a.signature_path} onChange={(v) => updateA(i, 'signature_path', v)} label="Audiens" /></td>
                <td className="text-center">{localAudiens.length > 0 && <button onClick={() => removeA(i)} className="no-print text-red-500 text-xs">✕</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button onClick={() => { addA(); }} className="no-print mt-2 px-3 py-1 bg-gray-100 border rounded text-sm hover:bg-gray-200 font-sans">+ Tambah baris audiens</button>
        <button onClick={() => onSave(localAudiens, 'audiens')} className="no-print ml-2 px-3 py-1 bg-green-800 text-white rounded text-sm hover:bg-green-700 font-sans">Simpan Audiens</button>
      </div>
    </div>
  );
}

// ─── PREVIEW & PRINT ─────────────────────────────────────────
function S2Preview({
  session,
  people,
  scores,
  attendance,
  onUpdate,
  previewHeaderDividerAfterKop = true,
}: {
  session: S2Session;
  people: S2SessionPerson[];
  scores: S2Score[];
  attendance: S2Attendance[];
  onUpdate: (f: keyof S2Session, v: any) => void;
  previewHeaderDividerAfterKop?: boolean;
}) {
  const examiners = people.filter((p) => S2_EXAMINER_ROLES.includes(p.role));
  const penguji = examiners.concat(
    people.filter((p) => p.role === 'pembimbing_1' || p.role === 'pembimbing_2')
  );
  const peserta = attendance.filter((a) => a.attendance_type === 'peserta');
  const audiens = attendance.filter((a) => a.attendance_type === 'audiens');

  const getExaminerScores = (pid: string) => {
    const sc: (number | null)[] = [null, null, null, null, null, null, null];

    scores
      .filter((s) => s.examiner_person_id === pid)
      .forEach((s) => {
        const idx = RUBRIC.findIndex((c) => c.code === s.criterion_code);
        if (idx >= 0) sc[idx] = s.score;
      });

    return sc;
  };

  const handlePrint = () => window.print();

  const renderPreviewDivider = () => (
    <div aria-hidden="true" className="my-2 w-full border-b-2 border-black" />
  );

  const renderPreviewDocHeader = (title: string, showKop = true) => (
    <div className="pb-3 text-center" data-preview-doc-header="true">
      {showKop && (
        <img
          src="/kop-surat-resize.png"
          alt="KOP UPN Veteran Jakarta"
          className="mx-auto mb-2 block h-auto max-h-[88px] w-auto max-w-full"
        />
      )}

      {showKop && previewHeaderDividerAfterKop && renderPreviewDivider()}

      <div className="space-y-0" data-preview-header-text-block="true">
        {!showKop && <div aria-hidden="true" className="my-2 w-full border-b-2 border-black" />}
        {showKop && !previewHeaderDividerAfterKop && renderPreviewDivider()}
        <h1 className="text-[16px] font-bold uppercase leading-tight">{title}</h1>
        <p className="text-[11px] leading-tight">
          PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM MAGISTER
        </p>
        <p className="text-[11px] leading-tight">
          FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA
        </p>
        <p className="text-[11px] font-semibold leading-tight">
          SEMESTER {session.semester} T.A. {session.academic_year}
        </p>
      </div>
    </div>
  );

  const renderPenilaianHeaderTable = (person: S2SessionPerson) => (
    <table
      className="mt-1 w-full table-fixed text-[11px] leading-tight"
      data-preview-penilaian-header-table="true"
    >
      <tbody>
        <tr>
          <td className="w-[17%] align-top">Nama Peserta</td>
          <td className="w-[3%] align-top">:</td>
          <td className="w-[45%] align-top">{session.student_name}</td>
          <td className="w-[10%] align-top">NIM</td>
          <td className="w-[3%] align-top">:</td>
          <td className="w-[22%] align-top">{session.student_nim}</td>
        </tr>
        <tr>
          <td className="align-top">Judul Tesis</td>
          <td className="align-top">:</td>
          <td colSpan={4} className="align-top">
            {session.thesis_title}
          </td>
        </tr>
        <tr>
          <td className="align-top">Jabatan Penguji</td>
          <td className="align-top">:</td>
          <td colSpan={4} className="align-top">
            {S2_ROLE_LABELS[person.role as keyof typeof S2_ROLE_LABELS]}
          </td>
        </tr>
      </tbody>
    </table>
  );

  const renderIndicatorList = (details: string[]) => {
    const items = details.map((d) => d.trim()).filter(Boolean);
    if (items.length === 0) return null;

    return (
      <ul className="rubric-detail list-disc ml-4">
        {items.map((item, index) => (
          <li key={index}>{item}</li>
        ))}
      </ul>
    );
  };

  const renderAssessmentTable = ({
    examinerScores,
    total,
    nilai,
    grade,
  }: {
    examinerScores: (number | null)[];
    total: number;
    nilai: number;
    grade: string;
  }) => (
    <table className="template-table s2-assessment-table mt-2">
      <colgroup>
        <col style={{ width: '5%' }} />
        <col style={{ width: '67%' }} />
        <col style={{ width: '8%' }} />
        <col style={{ width: '8%' }} />
        <col style={{ width: '12%' }} />
      </colgroup>

      <thead>
        <tr>
          <th>NO</th>
          <th>PARAMETER PENILAIAN</th>
          <th>
            SKOR
            <br />
            (1-4)
          </th>
          <th>BOBOT</th>
          <th>
            SKOR ×
            <br />
            BOBOT
          </th>
        </tr>
      </thead>

      <tbody>
        {RUBRIC.map((criterion, rubricIndex) => {
          const score = examinerScores[rubricIndex];
          const scoreTimesWeight = score !== null ? score * criterion.bobot : null;

          return (
            <tr key={criterion.code} className="s2-rubric-row">
              <td className="text-center align-top">{rubricIndex + 1}.</td>
              <td className="align-top">
                <div className="font-semibold leading-tight">{criterion.label}</div>
                {renderIndicatorList(criterion.details)}
              </td>
              <td className="text-center align-top">{score ?? ''}</td>
              <td className="text-center align-top">{criterion.bobot}</td>
              <td className="text-center align-top font-semibold">
                {scoreTimesWeight !== null ? scoreTimesWeight : ''}
              </td>
            </tr>
          );
        })}
      </tbody>

      <tbody className="s2-summary-group font-bold">
        <tr>
          <td colSpan={4} className="text-center">
            TOTAL SKOR × BOBOT
          </td>
          <td className="text-center">{total}</td>
        </tr>
        <tr>
          <td colSpan={4} className="text-center">
            NILAI AKHIR [(Total Skor × Bobot)/400 × 100]
          </td>
          <td className="text-center">{total > 0 ? nilai.toFixed(2) : ''}</td>
        </tr>
        <tr>
          <td colSpan={4} className="text-center">
            HURUF MUTU
          </td>
          <td className="text-center">{grade}</td>
        </tr>
      </tbody>
    </table>
  );

  const renderSignatureBlock = (person: S2SessionPerson) => (
    <div className="ml-auto mt-4 w-[240px] signature-block text-left">
      <p>Jakarta, {session.tanggal_ba || '______________'}</p>
      <p className="mt-2">
        {S2_ROLE_LABELS[person.role as keyof typeof S2_ROLE_LABELS]}
      </p>

      <div className="flex h-12 items-end">
        {person.signature_path ? (
          <img
            src={person.signature_path}
            alt="TTD"
            className="max-h-12 max-w-32 object-contain"
          />
        ) : null}
      </div>

      <p className="inline-block min-w-[220px] border-b border-black pb-0.5 font-bold">
        {person.display_name}
      </p>
      <p className="text-[10px]">NIP. {person.nip}</p>
    </div>
  );

  return (
    <div data-s2-preview-root="true">
      <div className="no-print mb-4 flex gap-3">
        <button
          onClick={handlePrint}
          className="rounded bg-green-900 px-6 py-2 font-sans text-sm font-medium text-white hover:bg-green-800"
        >
          🖨 Preview Print / Save PDF
        </button>
      </div>

      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 12mm 14mm 14mm 14mm;
          }

          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }

          body * {
            visibility: hidden;
          }

          [data-s2-preview-root='true'],
          [data-s2-preview-root='true'] * {
            visibility: visible;
          }

          [data-s2-preview-root='true'] {
            position: absolute !important;
            inset: 0 !important;
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          [data-s2-preview-root='true'] .print-area {
            width: 100% !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          [data-s2-preview-root='true'] .s2-report-page {
            break-after: page !important;
            page-break-after: always !important;
          }

          [data-s2-preview-root='true'] .s2-examiner-form {
            break-after: page !important;
            page-break-after: always !important;

            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }

          [data-s2-preview-root='true'] .s2-rekap-page {
            break-before: page !important;
            page-break-before: always !important;
          }

          [data-s2-preview-root='true'] .s2-daftar-hadir-page {
            break-before: page !important;
            page-break-before: always !important;
          }

          [data-s2-preview-root='true'] .s2-form-intro,
          [data-s2-preview-root='true']
            [data-preview-doc-header='true'],
          [data-s2-preview-root='true']
            [data-preview-penilaian-header-table='true'] {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          [data-s2-preview-root='true'] .s2-assessment-table {
            width: 100% !important;
            max-width: 100% !important;
            table-layout: fixed !important;
            border-collapse: collapse !important;
            box-sizing: border-box !important;

            break-inside: auto !important;
            page-break-inside: auto !important;

            font-size: 9.4pt !important;
            line-height: 1.08 !important;
          }

          [data-s2-preview-root='true']
            .s2-assessment-table
            thead {
            display: table-header-group !important;
          }

          [data-s2-preview-root='true']
            .s2-assessment-table
            tbody {
            break-inside: auto !important;
            page-break-inside: auto !important;
          }

          [data-s2-preview-root='true']
            .s2-assessment-table
            tr {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          [data-s2-preview-root='true']
            .s2-assessment-table
            th,
          [data-s2-preview-root='true']
            .s2-assessment-table
            td {
            box-sizing: border-box !important;
            padding: 1mm 1.2mm !important;
            overflow-wrap: anywhere;
            word-break: normal;
          }

          [data-s2-preview-root='true'] .rubric-detail {
            margin: 0.5mm 0 0 4mm !important;
            padding: 0 !important;
          }

          [data-s2-preview-root='true'] .rubric-detail li {
            margin: 0 !important;
            padding: 0 !important;
          }

          [data-s2-preview-root='true'] .s2-summary-group {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          [data-s2-preview-root='true'] .signature-block {
            width: 74mm !important;
            max-width: 74mm !important;
            margin-left: auto !important;
            margin-right: 0 !important;

            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }

          [data-s2-preview-root='true'] img {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>

      <div
        className="print-area space-y-10 bg-white p-8 md:p-12 print:space-y-0 print:p-0"
        style={{ fontFamily: "'Times New Roman', Georgia, serif" }}
      >
        {/* ===== LAPORAN SEMINAR PROPOSAL TESIS ===== */}
        <section className="s2-report-page">
          {renderPreviewDocHeader('Laporan Seminar Proposal Tesis')}

          <p className="text-justify">
            Pada hari ini {session.hari_tanggal || '______________'}, telah dilaksanakan
            Seminar Proposal Tesis bagi mahasiswa:
          </p>

          <table className="w-full">
            <tbody>
              <tr>
                <td className="w-32">Nama</td>
                <td className="w-4">:</td>
                <td>{session.student_name || '______________'}</td>
              </tr>
              <tr>
                <td>NIM</td>
                <td>:</td>
                <td>{session.student_nim || '______________'}</td>
              </tr>
              <tr>
                <td>Waktu Sidang</td>
                <td>:</td>
                <td>{session.start_time || '______________'}</td>
              </tr>
              <tr>
                <td>Peminatan</td>
                <td>:</td>
                <td>{session.specialization || '______________'}</td>
              </tr>
            </tbody>
          </table>

          <div className="mt-3">
            <p className="font-bold">Dengan Judul Penelitian sebagai berikut :</p>
            <p className="whitespace-pre-wrap">
              {session.thesis_title || '______________'}
            </p>
          </div>

          <p className="mt-3">
            <span className="ml-4">
              {session.decision === 'lulus_dengan_perbaikan' ? '✓' : '○'} Proposal tesis
              dilanjutkan dengan perbaikan
            </span>
            <br />
            <span className="ml-4">
              {session.decision === 'tidak_lulus_mengulang' ? '✓' : '○'} Proposal tesis
              tidak diluluskan / Mengulang sidang
            </span>
          </p>

          <p className="mt-3 text-justify text-sm italic">
            Demikian laporan seminar proposal tesis ini dibuat sebagai laporan selama seminar
            berlangsung untuk diketahui dan dipergunakan sebagaimana mestinya.
          </p>

          <div className="mt-5">
            <h3 className="text-center font-bold">TIM PENGUJI</h3>
            <table className="template-table mt-1">
              <thead>
                <tr>
                  <th className="w-12">NO</th>
                  <th>NAMA PENGUJI</th>
                  <th>JABATAN</th>
                  <th className="w-24">TANDA TANGAN</th>
                </tr>
              </thead>
              <tbody>
                {examiners
                  .concat(
                    people.filter(
                      (p) => p.role === 'pembimbing_1' || p.role === 'pembimbing_2'
                    )
                  )
                  .map((p, i) => (
                    <tr key={p.id}>
                      <td className="text-center">{i + 1}.</td>
                      <td>{p.display_name}</td>
                      <td>{S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS]}</td>
                      <td className="text-center align-middle">
                        {p.signature_path ? (
                          <img
                            src={p.signature_path}
                            alt="TTD"
                            className="mx-auto max-h-12 max-w-24 object-contain"
                          />
                        ) : (
                          ''
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>

          <div className="mt-10 break-inside-avoid text-right">
            <p>Jakarta, {session.tanggal_ba || '______________'}</p>
            <p className="mt-4">Koordinator Program Studi</p>
            {session.koordinator_signature_path ? (
              <img
                src={session.koordinator_signature_path}
                alt="TTD Koordinator"
                className="my-2 ml-auto max-h-16 max-w-32 object-contain"
              />
            ) : (
              <div className="h-16" />
            )}
            <p className="font-bold">{session.koordinator || S2_KOORDINATOR_NAME}</p>
            <p className="text-sm">
              NIP. {session.nip_koordinator || S2_KOORDINATOR_NIP}
            </p>
          </div>
        </section>

        {/* ===== PENILAIAN PER PENGUJI (one continuous table per examiner) ===== */}
        {examiners.map((person) => {
          const examinerScores = getExaminerScores(person.id);
          const total = calcTotalSkorXBobot(
            examinerScores,
            RUBRIC.map((criterion) => criterion.bobot)
          );
          const nilai = total > 0 ? calcNilaiAkhir(total) : 0;
          const grade = total > 0 ? calcGrade(nilai) : '';

          return (
            <section key={person.id} className="s2-examiner-form">
              <div className="s2-form-intro">
                {renderPreviewDocHeader('Formulir Penilaian Seminar Proposal Tesis')}
                {renderPenilaianHeaderTable(person)}
              </div>

              {renderAssessmentTable({
                examinerScores,
                total,
                nilai,
                grade,
              })}

              {renderSignatureBlock(person)}
            </section>
          );
        })}

        {/* ===== REKAPITULASI ===== */}
        <section className="s2-rekap-page">
          {renderPreviewDocHeader('Rekapitulasi Nilai Seminar Proposal Tesis')}

          <table className="template-table mt-2 text-sm">
            <thead>
              <tr>
                <th className="w-8">NO</th>
                <th>NAMA</th>
                <th className="w-20">NIM</th>
                <th className="w-14">I</th>
                <th className="w-14">II</th>
                <th className="w-14">III</th>
                <th className="w-14">IV</th>
                <th className="w-16">RATA-RATA</th>
                <th className="w-14">IP</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-center">1.</td>
                <td>{session.student_name}</td>
                <td>{session.student_nim}</td>
                {examiners.map((person) => {
                  const examinerScores = getExaminerScores(person.id);
                  const total = calcTotalSkorXBobot(
                    examinerScores,
                    RUBRIC.map((criterion) => criterion.bobot)
                  );
                  const finalScore = total > 0 ? calcNilaiAkhir(total) : null;

                  return (
                    <td key={person.id} className="text-center font-semibold">
                      {finalScore !== null ? finalScore.toFixed(2) : ''}
                    </td>
                  );
                })}
                {Array.from({ length: Math.max(0, 4 - examiners.length) }).map((_, i) => (
                  <td key={`empty-${i}`} className="text-center" />
                ))}
                <td className="text-center font-bold">
                  {(() => {
                    const values = examiners
                      .map((person) => {
                        const examinerScores = getExaminerScores(person.id);
                        const total = calcTotalSkorXBobot(
                          examinerScores,
                          RUBRIC.map((criterion) => criterion.bobot)
                        );
                        return total > 0 ? calcNilaiAkhir(total) : null;
                      })
                      .filter((value) => value !== null) as number[];

                    return values.length
                      ? (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)
                      : '';
                  })()}
                </td>
                <td className="text-center font-bold">
                  {(() => {
                    const values = examiners
                      .map((person) => {
                        const examinerScores = getExaminerScores(person.id);
                        const total = calcTotalSkorXBobot(
                          examinerScores,
                          RUBRIC.map((criterion) => criterion.bobot)
                        );
                        return total > 0 ? calcNilaiAkhir(total) : null;
                      })
                      .filter((value) => value !== null) as number[];

                    if (!values.length) return '';

                    const ip = calcIP(
                      values.reduce((sum, value) => sum + value, 0) / values.length
                    );

                    return ip !== null ? ip.toFixed(2) : '';
                  })()}
                </td>
              </tr>
            </tbody>
          </table>

          <p className="mt-3">Jakarta, {session.tanggal_ba || '______________'}</p>
          <p className="mt-2 font-semibold">Tanda Tangan</p>
          {examiners.map((person, i) => (
            <div key={person.id} className="mt-1 flex items-center gap-2">
              <span className="w-48 shrink-0">
                {i + 1}. {S2_ROLE_LABELS[person.role as keyof typeof S2_ROLE_LABELS]}
              </span>
              <span className="flex-1 border-b border-black">
                {person.display_name || '…………………………………..'}
              </span>
              <span className="w-24 text-center">
                {person.signature_path ? (
                  <img
                    src={person.signature_path}
                    alt="TTD"
                    className="mx-auto max-h-10 max-w-24 object-contain"
                  />
                ) : (
                  <span className="text-xs text-gray-300">(—)</span>
                )}
              </span>
            </div>
          ))}
        </section>

        {/* ===== DAFTAR HADIR ===== */}
        <section className="s2-daftar-hadir-page">
          {renderPreviewDocHeader('Daftar Hadir Seminar Proposal Tesis')}

          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="w-32">Nama Mahasiswa</td>
                <td className="w-4">:</td>
                <td>{session.student_name}</td>
              </tr>
              <tr>
                <td>NIM</td>
                <td>:</td>
                <td>{session.student_nim}</td>
              </tr>
              <tr>
                <td>Tanggal</td>
                <td>:</td>
                <td>{session.hari_tanggal || session.exam_date || ''}</td>
              </tr>
              <tr>
                <td>Peminatan</td>
                <td>:</td>
                <td>{session.specialization}</td>
              </tr>
            </tbody>
          </table>

          {/* Daftar Hadir Penguji */}
          <h2 className="mt-4 font-bold text-center">DAFTAR HADIR PENGUJI</h2>
          <table className="template-table mt-1 text-[11px]">
            <thead>
              <tr>
                <th className="w-8">NO</th>
                <th className="w-28">NIP</th>
                <th>NAMA PENGUJI</th>
                <th>JABATAN</th>
                <th className="w-24">TANDA TANGAN</th>
              </tr>
            </thead>
            <tbody>
              {penguji.map((p, i) => (
                <tr key={p.id}>
                  <td className="text-center">{i + 1}.</td>
                  <td>{p.nip}</td>
                  <td>{p.display_name}</td>
                  <td>{S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS]}</td>
                  <td className="text-center align-middle">
                    {p.signature_path ? (
                      <img
                        src={p.signature_path}
                        alt="TTD"
                        className="mx-auto max-h-10 max-w-20 object-contain"
                      />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Daftar Hadir Peserta */}
          <h2 className="mt-4 font-bold text-center">DAFTAR HADIR PESERTA</h2>
          <table className="template-table mt-1 text-[11px]">
            <thead>
              <tr>
                <th className="w-8">NO</th>
                <th>NAMA PESERTA</th>
                <th className="w-24">NIM</th>
                <th className="w-24">TANDA TANGAN</th>
                <th className="w-16">KET</th>
              </tr>
            </thead>
            <tbody>
              {peserta.length === 0 && (
                <tr>
                  <td className="text-center">1.</td>
                  <td colSpan={4}>____________________________</td>
                </tr>
              )}
              {peserta.map((p, i) => (
                <tr key={p.id}>
                  <td className="text-center">{i + 1}.</td>
                  <td>{p.name}</td>
                  <td>{p.nim}</td>
                  <td className="text-center align-middle">
                    {p.signature_path ? (
                      <img
                        src={p.signature_path}
                        alt="TTD"
                        className="mx-auto max-h-10 max-w-20 object-contain"
                      />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="text-center">{p.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Daftar Hadir Audiens */}
          <h2 className="mt-4 font-bold text-center">DAFTAR HADIR MAHASISWA SEBAGAI AUDIENS</h2>
          <table className="template-table mt-1 text-[11px]">
            <thead>
              <tr>
                <th className="w-8">NO</th>
                <th>NAMA MAHASISWA</th>
                <th className="w-24">NIM</th>
                <th className="w-24">TANDA TANGAN</th>
                <th className="w-16">KET</th>
              </tr>
            </thead>
            <tbody>
              {audiens.length === 0 && (
                <tr>
                  <td className="text-center">1.</td>
                  <td colSpan={4}>____________________________</td>
                </tr>
              )}
              {audiens.map((a, i) => (
                <tr key={a.id}>
                  <td className="text-center">{i + 1}.</td>
                  <td>{a.name}</td>
                  <td>{a.nim}</td>
                  <td className="text-center align-middle">
                    {a.signature_path ? (
                      <img
                        src={a.signature_path}
                        alt="TTD"
                        className="mx-auto max-h-10 max-w-20 object-contain"
                      />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </td>
                  <td className="text-center">{a.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
