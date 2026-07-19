'use client';

import { useEffect, useState, useRef, useCallback, startTransition, memo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/app/components/AuthProvider';
import { isDosenEmail } from '@/lib/dosen';
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
import {
  calcTotalSkorXBobot,
  calcNilaiAkhir,
  calcGrade,
} from '@/lib/s2/calculations';

type Tab =
  | 'naskah'
  | 'laporan'
  | 'penilaian-ketua_penguji'
  | 'penilaian-anggota_penguji_1'
  | 'penilaian-anggota_penguji_2'
  | 'penilaian-anggota_penguji_3'
  | 'rekap'
  | 'daftar-hadir-penguji'
  | 'daftar-hadir-peserta'
  | 'preview';

const RUBRIC = S2_PROPOSAL_RUBRIC_V1;
const DEFAULT_SCORE_MATRIX: Record<string, (number | null)[]> = {};
S2_EXAMINER_ROLES.forEach((r) => {
  DEFAULT_SCORE_MATRIX[r] = [null, null, null, null, null, null, null];
});

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
  const [activeTab, setActiveTab] = useState<Tab>('naskah');
  const [saving, setSaving] = useState(false);
  const [syncStatus, setSyncStatus] = useState<'live' | 'saving' | 'offline'>('live');

  const sessionRef = useRef<S2Session | null>(null);
  const peopleRef = useRef<S2SessionPerson[]>([]);
  const scoresRef = useRef<S2Score[]>([]);
  const lastSavedSession = useRef<S2Session | null>(null);

  // Load everything
  useEffect(() => {
    if (!sessionId) return;
    loadAll();
    const channel = supabase
      .channel(`s2_session:${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 's2_sessions', filter: `id=eq.${sessionId}` },
        (payload: any) => {
          if (payload.new) {
            lastSavedSession.current = payload.new as S2Session;
            setSession((prev) => ({ ...(prev || {}), ...payload.new }));
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [sessionId]);

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
    const s = sRes.data as S2Session;
    const p = (pRes.data || []) as S2SessionPerson[];
    const sc = (scRes.data || []) as S2Score[];
    const a = (aRes.data || []) as S2Attendance[];

    setSession(s);
    setPeople(p);
    setScores(sc);
    setAttendance(a);

    sessionRef.current = s;
    peopleRef.current = p;
    scoresRef.current = sc;
    lastSavedSession.current = s;
    setLoading(false);
  }

  // Permission
  const myPerson = people.find((p) => p.user_id === profile?.id) || null;
  const myExaminerRole: string | null =
    myPerson && S2_EXAMINER_ROLES.includes(myPerson.role) ? myPerson.role : null;
  const isAssigned = !!myPerson;
  const canEdit = isSuperadmin || (isDosen && (isAssigned || true)); // dosen can edit any assigned; restrict per-tab below

  // Examiner score helpers
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
    if (myExaminerRole === role) return true;
    // supervisor / koordinator / pembimbing can also view but only their own exam
    return false;
  }

  // Persist session field changes
  const persistSession = useCallback(
    async (updates: Partial<S2Session>) => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      setSyncStatus('saving');
      const merged = { ...(sessionRef.current || {}), ...updates, updated_at: new Date().toISOString() };
      sessionRef.current = merged as S2Session;
      startTransition(() => setSession(merged as S2Session));
      const { error } = await supabase
        .from('s2_sessions')
        .update(updates)
        .eq('id', sessionId);
      if (!error) {
        lastSavedSession.current = { ...lastSavedSession.current, ...updates } as S2Session;
        setSyncStatus('live');
      } else {
        setSyncStatus('offline');
        console.error(error);
      }
    },
    [sessionId]
  );

  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null);
  const updateSessionField = useCallback(
    (field: keyof S2Session, value: any) => {
      persistSession({ [field]: value } as Partial<S2Session>);
    },
    [persistSession]
  );

  // Persist a single criterion score
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
    // refresh local
    const { data } = await supabase.from('s2_scores').select('*').eq('session_id', sessionId);
    if (data) {
      setScores(data as S2Score[]);
      scoresRef.current = data as S2Score[];
    }
    setSyncStatus(error ? 'offline' : 'live');
  }

  // Persist attendance
  async function saveAttendance(entries: S2Attendance[], type: 'peserta' | 'audiens') {
    setSyncStatus('saving');
    // delete existing of this type then insert
    await supabase.from('s2_attendance').delete().eq('session_id', sessionId).eq('attendance_type', type);
    if (entries.length > 0) {
      const toInsert = entries.map((e) => ({
        session_id: sessionId,
        attendance_type: type,
        name: e.name,
        nim: e.nim || '',
        signature_path: e.signature_path || null,
        notes: e.notes || '',
      }));
      const { error } = await supabase.from('s2_attendance').insert(toInsert);
      if (error) { setSyncStatus('offline'); console.error(error); return; }
    }
    const { data } = await supabase.from('s2_attendance').select('*').eq('session_id', sessionId);
    if (data) { setAttendance(data as S2Attendance[]); }
    setSyncStatus('live');
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-gray-500 font-serif text-lg">Memuat data sesi...</div>;
  }
  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-red-500 font-serif text-lg gap-4">
        <p>Sesi tidak ditemukan</p>
        <Link href="/s2/sessions" className="text-blue-700 underline">← Kembali ke daftar</Link>
      </div>
    );
  }

  // Tabs
  const allTabs: { key: Tab; label: string }[] = [
    { key: 'naskah', label: 'Naskah & Info' },
    { key: 'laporan', label: 'Laporan Seminar' },
    ...S2_EXAMINER_ROLES.map((r) => ({
      key: `penilaian-${r}` as Tab,
      label: S2_EXAMINER_TAB_LABELS[r] || r,
    })),
    { key: 'rekap', label: 'Rekapitulasi' },
    { key: 'daftar-hadir-penguji', label: 'Daftar Hadir Penguji' },
    { key: 'daftar-hadir-peserta', label: 'Daftar Hadir Peserta' },
    { key: 'preview', label: 'Preview & PDF' },
  ];

  const tabs = allTabs.filter((t) => {
    if (t.key.startsWith('penilaian-')) {
      const role = t.key.replace('penilaian-', '');
      return canEditExaminer(role);
    }
    return true;
  });

  // Helper: people by role
  const personByRole = (role: string) => people.find((p) => p.role === role) || null;

  return (
    <div className="max-w-5xl mx-auto p-4 font-serif">
      {/* Sync indicator */}
      <div className={`no-print sync-indicator ${syncStatus === 'live' ? 'bg-green-100 text-green-800' : syncStatus === 'saving' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
        <span className={`w-2 h-2 rounded-full ${syncStatus === 'live' ? 'bg-green-500' : syncStatus === 'saving' ? 'bg-yellow-500' : 'bg-red-500'}`} />
        {syncStatus === 'live' ? 'Tersimpan' : syncStatus === 'saving' ? 'Menyimpan...' : 'Offline'}
      </div>

      {/* Header */}
      <div className="bg-white rounded-lg shadow-md p-4 mb-4 no-print">
        <Link href="/s2/sessions" className="text-sm text-green-800 hover:underline">← Kembali ke S2 Sessions</Link>
        <h1 className="text-xl font-bold mt-1">{session.student_name} <span className="text-gray-500 text-base">({session.student_nim})</span></h1>
        <p className="text-sm text-gray-600">{session.thesis_title || '—'}</p>
        <p className="text-xs text-gray-400 font-sans mt-1">
          {session.exam_date ? new Date(session.exam_date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Belum dijadwalkan'}
          {session.venue ? ` • ${session.venue}` : ''} • Status: {session.status}
        </p>
      </div>

      {/* Tabs */}
      <div className="no-print flex flex-wrap gap-1 mb-4 bg-white rounded-lg shadow-sm p-1 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`px-3 py-2 rounded text-sm font-sans font-medium whitespace-nowrap transition-colors ${
              activeTab === t.key ? 'bg-green-900 text-white shadow' : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-md p-6 print:shadow-none print:p-0">
        {activeTab === 'naskah' && (
          <NaskahTab session={session} onUpdate={updateSessionField} isDosen={isDosen} people={people} onSavePerson={savePerson} onAddPerson={(role, name, nip) => addPerson(session.id, role, name, nip)} onRemovePerson={removePerson} />
        )}
        {activeTab === 'laporan' && (
          <LaporanTab session={session} onUpdate={updateSessionField} people={people} />
        )}
        {S2_EXAMINER_ROLES.map((role) => {
          if (activeTab !== `penilaian-${role}`) return null;
          const person = personByRole(role);
          if (!person) return <div key={role} className="text-amber-600">Penguji untuk peran ini belum ditambahkan.</div>;
          const examinerScores = getExaminerScores(person.id);
          return (
            <PenilaianTab
              key={role}
              session={session}
              person={person}
              role={role}
              scores={examinerScores}
              canEdit={canEditExaminer(role)}
              onSaveScore={(code, val) => saveScore(person.id, code, val)}
            />
          );
        })}
        {activeTab === 'rekap' && (
          <RekapTab session={session} people={people} scores={scores} onUpdate={updateSessionField} />
        )}
        {activeTab === 'daftar-hadir-penguji' && (
          <DaftarHadirPengujiTab session={session} people={people} onUpdate={updateSessionField} isDosen={isDosen} />
        )}
        {activeTab === 'daftar-hadir-peserta' && (
          <DaftarHadirPesertaTab
            session={session}
            attendance={attendance}
            onSave={(entries) => saveAttendance(entries, 'peserta')}
          />
        )}
        {activeTab === 'preview' && (
          <S2Preview session={session} people={people} scores={scores} attendance={attendance} onUpdate={updateSessionField} />
        )}
      </div>
    </div>
  );
}

// ─── People save helper ───────────────────────────────────────
async function savePerson(personId: string, field: 'display_name' | 'nip' | 'signature_path', value: string) {
  const { error } = await supabase
    .from('s2_session_people')
    .update({ [field]: value, updated_at: new Date().toISOString() })
    .eq('id', personId);
  if (error) console.error(error);
}

async function addPerson(sessionId: string, role: string, displayName: string, nip: string) {
  const { error } = await supabase
    .from('s2_session_people')
    .insert({
      session_id: sessionId,
      role,
      display_name: displayName,
      nip: nip || '',
      email: '',
      sequence_no: 1,
    });
  if (error) { console.error(error); alert('Gagal menambah: ' + error.message); }
}

async function removePerson(personId: string) {
  const { error } = await supabase
    .from('s2_session_people')
    .delete()
    .eq('id', personId);
  if (error) { console.error(error); alert('Gagal menghapus: ' + error.message); }
}

// ─── NASKAH TAB ───────────────────────────────────────────────
function NaskahTab({
  session,
  onUpdate,
  isDosen,
  people,
  onSavePerson,
  onAddPerson,
  onRemovePerson,
}: {
  session: S2Session;
  onUpdate: (f: keyof S2Session, v: any) => void;
  isDosen: boolean;
  people: S2SessionPerson[];
  onSavePerson: (id: string, f: 'display_name' | 'nip' | 'signature_path', v: string) => void;
  onAddPerson: (role: string, name: string, nip: string) => void;
  onRemovePerson: (id: string) => void;
}) {
  const field = (label: string, field: keyof S2Session, placeholder = '') => (
    <div className="flex">
      <span className="w-40 shrink-0">{label}</span>
      <span className="w-4">:</span>
      {isDosen ? (
        <input value={(session[field] as any) ?? ''} onChange={(e) => onUpdate(field, e.target.value)} className="flex-1 border-b border-gray-400 bg-transparent" placeholder={placeholder} />
      ) : (
        <span className="flex-1">{(session[field] as any) || '—'}</span>
      )}
    </div>
  );

  const supervisors = people.filter((p) => p.role === 'pembimbing_1' || p.role === 'pembimbing_2');

  return (
    <div className="space-y-5">
      <div className="text-center border-b-2 border-black pb-4">
        <img src="/kop-surat-resize.png" alt="KOP" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: 100, width: 'auto', height: 'auto' }} />
        <h1 className="text-xl font-bold uppercase">Naskah Seminar Proposal Tesis</h1>
        <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM MAGISTER</p>
        <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
      </div>

      <div className="space-y-1 text-sm">
        {field('Nama Mahasiswa', 'student_name')}
        {field('NIM', 'student_nim')}
        {field('Peminatan', 'specialization')}
        {field(' Semester', 'semester')}
        {field('Tahun Akademik', 'academic_year')}
        {field('Tanggal Ujian', 'exam_date')}
        {field('Waktu', 'start_time')}
        {field('Tempat', 'venue')}
      </div>

      <div>
        <p className="text-sm font-semibold">Judul Proposal Tesis</p>
        {isDosen ? (
          <textarea value={session.thesis_title} onChange={(e) => onUpdate('thesis_title', e.target.value)} className="w-full border border-gray-300 rounded p-2 font-serif mt-1" rows={3} />
        ) : (
          <p className="text-sm border-b border-gray-400 min-h-[2rem]">{session.thesis_title || '—'}</p>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold mb-1">Susunan Tim Penguji & Pembimbing</p>
        <table className="template-table text-sm">
          <thead>
            <tr><th className="w-10">NO</th><th className="w-28">JABATAN</th><th>NAMA</th><th className="w-24">NIP</th><th className="w-24">TANDA TANGAN</th>{isDosen && <th className="w-10">✕</th>}</tr>
          </thead>
          <tbody>
            {[
              ...people.filter((p) => p.role === 'ketua_penguji' || p.role.startsWith('anggota_penguji')).map((p) => ({ p, jab: S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS] })),
              ...supervisors.map((p) => ({ p, jab: S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS] })),
            ].map((row, i) => (
              <tr key={row.p.id}>
                <td className="text-center">{i + 1}.</td>
                <td>{row.jab}</td>
                <td>
                  {isDosen ? (
                    <input value={row.p.display_name} onChange={(e) => onSavePerson(row.p.id, 'display_name', e.target.value)} className="w-full bg-transparent" />
                  ) : (
                    row.p.display_name
                  )}
                </td>
                <td>
                  {isDosen ? (
                    <input value={row.p.nip} onChange={(e) => onSavePerson(row.p.id, 'nip', e.target.value)} className="w-full bg-transparent" />
                  ) : (
                    row.p.nip
                  )}
                </td>
                <td className="text-center align-middle">
                  {isDosen ? (
                    <S2SignatureUpload value={row.p.signature_path} onChange={(v) => onSavePerson(row.p.id, 'signature_path', v || '')} label={row.jab} />
                  ) : (
                    row.p.signature_path ? <img src={row.p.signature_path} alt="TTD" className="max-h-10 max-w-20 object-contain mx-auto" /> : ''
                  )}
                </td>
                {isDosen && (
                  <td className="text-center">
                    <button onClick={() => onRemovePerson(row.p.id)} className="text-red-500 hover:text-red-700 text-xs" title="Hapus">✕</button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>

        {isDosen && <AddPersonForm onAdd={onAddPerson} existingRoles={people.map((p) => p.role)} />}
      </div>
    </div>
  );
}

// ─── ADD PERSON FORM ──────────────────────────────────────────
const ALL_ROLES: { role: string; label: string }[] = [
  { role: 'ketua_penguji', label: 'Ketua Penguji' },
  { role: 'anggota_penguji_1', label: 'Anggota Penguji 1' },
  { role: 'anggota_penguji_2', label: 'Anggota Penguji 2' },
  { role: 'anggota_penguji_3', label: 'Anggota Penguji 3' },
  { role: 'pembimbing_1', label: 'Pembimbing 1' },
  { role: 'pembimbing_2', label: 'Pembimbing 2' },
];

function AddPersonForm({ onAdd, existingRoles }: { onAdd: (role: string, name: string, nip: string) => void; existingRoles: string[] }) {
  const [role, setRole] = useState('ketua_penguji');
  const [name, setName] = useState('');
  const [nip, setNip] = useState('');

  const availableRoles = ALL_ROLES.filter((r) => !existingRoles.includes(r.role));
  const effectiveRole = availableRoles.find((r) => r.role === role) ? role : availableRoles[0]?.role || '';

  const handleAdd = () => {
    if (!name.trim()) { alert('Masukkan nama dosen'); return; }
    if (!effectiveRole) { alert('Semua peran sudah terisi'); return; }
    onAdd(effectiveRole, name.trim(), nip.trim());
    setName('');
    setNip('');
  };

  if (availableRoles.length === 0) {
    return <p className="text-xs text-gray-500 mt-2 italic">Semua peran penguji & pembimbing sudah ditambahkan.</p>;
  }

  return (
    <div className="mt-3 p-3 border rounded-lg bg-gray-50 space-y-2">
      <p className="text-sm font-semibold">+ Tambah Penguji / Pembimbing</p>
      <div className="flex flex-wrap gap-2 items-end">
        <div>
          <label className="block text-xs mb-1">Jabatan</label>
          <select value={effectiveRole} onChange={(e) => setRole(e.target.value)} className="border border-gray-300 rounded px-2 py-1 font-serif text-sm">
            {availableRoles.map((r) => (
              <option key={r.role} value={r.role}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[160px]">
          <label className="block text-xs mb-1">Nama Dosen</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 font-serif text-sm" placeholder="Nama lengkap" />
        </div>
        <div className="w-32">
          <label className="block text-xs mb-1">NIP</label>
          <input value={nip} onChange={(e) => setNip(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1 font-serif text-sm" placeholder="NIP" />
        </div>
        <button onClick={handleAdd} className="bg-green-900 text-white px-4 py-2 rounded hover:bg-green-800 font-sans text-sm font-medium">Tambah</button>
      </div>
    </div>
  );
}

// ─── LAPORAN TAB ──────────────────────────────────────────────
function LaporanTab({ session, onUpdate, people }: { session: S2Session; onUpdate: (f: keyof S2Session, v: any) => void; people: S2SessionPerson[] }) {
  const ketua = people.find((p) => p.role === 'ketua_penguji');
  return (
    <div className="space-y-5">
      <div className="text-center border-b-2 border-black pb-4">
        <img src="/kop-surat-resize.png" alt="KOP" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: 100, width: 'auto', height: 'auto' }} />
        <h1 className="text-xl font-bold uppercase">Laporan Seminar Proposal Tesis</h1>
        <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM MAGISTER</p>
        <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
      </div>

      <p className="text-sm">
        Pada hari <input value={session.exam_date || ''} onChange={(e) => onUpdate('exam_date', e.target.value)} className="border-b border-gray-400 bg-transparent px-1 font-semibold w-48" />, telah dilaksanakan seminar proposal tesis mahasiswa:
      </p>

      <table className="w-full text-sm">
        <tbody>
          <tr><td className="w-36">Nama Mahasiswa</td><td className="w-4">:</td><td><input value={session.student_name} onChange={(e) => onUpdate('student_name', e.target.value)} className="w-full border-b border-gray-400 bg-transparent" /></td></tr>
          <tr><td>NIM</td><td>:</td><td><input value={session.student_nim} onChange={(e) => onUpdate('student_nim', e.target.value)} className="w-full border-b border-gray-400 bg-transparent" /></td></tr>
          <tr><td>Waktu</td><td>:</td><td><input value={session.start_time || ''} onChange={(e) => onUpdate('start_time', e.target.value)} className="w-full border-b border-gray-400 bg-transparent" /></td></tr>
          <tr><td>Peminatan</td><td>:</td><td><input value={session.specialization} onChange={(e) => onUpdate('specialization', e.target.value)} className="w-full border-b border-gray-400 bg-transparent" /></td></tr>
        </tbody>
      </table>

      <div>
        <p className="font-semibold text-sm">Hasil Pelaksanaan :</p>
        <textarea value={session.report_notes} onChange={(e) => onUpdate('report_notes', e.target.value)} className="w-full border border-gray-300 rounded p-2 min-h-[60px] font-serif mt-1" />
      </div>

      <div className="space-y-2">
        <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-green-50">
          <input type="radio" name="s2-decision" checked={session.decision === 'lulus_dengan_perbaikan'} onChange={() => onUpdate('decision', 'lulus_dengan_perbaikan')} className="mt-1" />
          <span className="font-semibold">Lulus dengan Perbaikan</span>
        </label>
        <label className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-red-50">
          <input type="radio" name="s2-decision" checked={session.decision === 'tidak_lulus_mengulang'} onChange={() => onUpdate('decision', 'tidak_lulus_mengulang')} className="mt-1" />
          <span className="font-semibold">Tidak Lulus Mengulang</span>
        </label>
      </div>

      <div className="text-right mt-8 avoid-break">
        <p>Jakarta, <input value={session.exam_date || ''} onChange={(e) => onUpdate('exam_date', e.target.value)} className="border-b border-gray-400 bg-transparent w-40 text-center" /></p>
        <p className="mt-4">Ketua Penguji</p>
        <S2SignatureUpload value={ketua?.signature_path ?? null} onChange={() => {}} label="Ketua Penguji" />
        <div className="h-8" />
        <p className="border-t border-black pt-1 font-semibold">{ketua?.display_name || '....................'}</p>
        <p className="text-xs">NIP. {ketua?.nip || '..........................'}</p>
      </div>
    </div>
  );
}

// ─── PENILAIAN TAB ────────────────────────────────────────────
const PenilaianTab = memo(function PenilaianTab({
  session,
  person,
  role,
  scores,
  canEdit,
  onSaveScore,
}: {
  session: S2Session;
  person: S2SessionPerson;
  role: string;
  scores: (number | null)[];
  canEdit: boolean;
  onSaveScore: (code: string, value: number | null) => void;
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
      <div className="text-center border-b-2 border-black pb-4">
        <img src="/kop-surat-resize.png" alt="KOP" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: 100, width: 'auto', height: 'auto' }} />
        <h1 className="text-xl font-bold uppercase">Formulir Penilaian Seminar Proposal Tesis</h1>
        <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM MAGISTER</p>
        <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
      </div>

      <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
        <div className="flex"><span className="w-36">Nama Peserta</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.student_name}</span></div>
        <div className="flex"><span className="w-36">NIM</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.student_nim}</span></div>
        <div className="flex"><span className="w-36">Hari, Tanggal</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.exam_date || ''}</span></div>
        <div className="flex"><span className="w-36">Waktu</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.start_time || ''}</span></div>
        <div className="flex"><span className="w-36">Tempat</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.venue}</span></div>
        <div className="flex"><span className="w-36">Jabatan Penguji</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{label}</span></div>
      </div>
      <div className="flex"><span className="w-36">Peminatan</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.specialization}</span></div>
      <div className="flex"><span className="w-36">Judul Tesis</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.thesis_title}</span></div>

      <table className="template-table text-sm">
        <thead>
          <tr><th className="w-8">NO</th><th>PARAMETER PENILAIAN</th><th className="w-24">SKOR (1—4)</th><th className="w-14">BOBOT</th><th className="w-24">SKOR × BOBOT</th></tr>
        </thead>
        <tbody>
          {RUBRIC.map((c, i) => {
            const sb = local[i] !== null ? local[i]! * c.bobot : null;
            return (
              <tr key={c.code} className="avoid-break">
                <td className="text-center align-top">{i + 1}.</td>
                <td className="text-xs leading-snug py-1.5">
                  <div className="font-semibold">{c.label}</div>
                  <div className="whitespace-pre-line text-[11px] text-gray-700">{c.details.join('\n')}</div>
                </td>
                <td className="text-center">
                  {canEdit ? (
                    <input type="number" min={1} max={4} step="0.01" value={local[i] ?? ''} onChange={(e) => setScore(i, c.code, e.target.value)} className="w-16 text-center border border-gray-300 rounded px-1 py-1" />
                  ) : (
                    <span>{local[i] ?? ''}</span>
                  )}
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
        <p>Jakarta, {session.exam_date || '______________'}</p>
        <p className="mt-8">{label}</p>
        <S2SignatureUpload value={person.signature_path} onChange={() => {}} label={label} />
        <div className="h-8" />
        <p className="border-t border-black pt-1 font-semibold">{person.display_name}</p>
        <p className="text-xs">NIP. {person.nip}</p>
      </div>
    </div>
  );
});

// ─── REKAP TAB ────────────────────────────────────────────────
function RekapTab({ session, people, scores, onUpdate }: { session: S2Session; people: S2SessionPerson[]; scores: S2Score[]; onUpdate: (f: keyof S2Session, v: any) => void }) {
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
  const rataRata = valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;

  return (
    <div className="space-y-4">
      <div className="text-center border-b-2 border-black pb-4">
        <img src="/kop-surat-resize.png" alt="KOP" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: 100, width: 'auto', height: 'auto' }} />
        <h1 className="text-xl font-bold uppercase">Rekapitulasi Nilai Seminar Proposal Tesis</h1>
        <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM MAGISTER</p>
        <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
        <div className="flex"><span className="w-36">Nama Mahasiswa</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.student_name}</span></div>
        <div className="flex"><span className="w-28">NIM</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.student_nim}</span></div>
        <div className="flex"><span className="w-36">Peminatan</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.specialization}</span></div>
        <div className="flex"><span className="w-28">Hari/Tanggal</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.exam_date || ''}</span></div>
      </div>
      <div className="flex"><span className="w-36">Judul Tesis</span><span className="w-4">:</span><span className="flex-1 border-b border-gray-400">{session.thesis_title}</span></div>

      <table className="template-table text-sm">
        <thead>
          <tr>
            <th className="w-6">NO</th><th>NAMA PENGUJI</th><th className="w-14">JABATAN</th>
            <th className="w-16">NILAI</th><th className="w-16">RERATA</th>
          </tr>
        </thead>
        <tbody>
          {examiners.map((p, i) => (
            <tr key={p.id}>
              <td className="text-center">{i + 1}.</td>
              <td>{p.display_name}</td>
              <td className="text-center">{S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS].replace('Anggota ', 'Ang. ').replace('Ketua ', 'Ket. ')}</td>
              <td className="text-center font-semibold">{nilaiPerExaminer[i] !== null ? (nilaiPerExaminer[i] as number).toFixed(2) : ''}</td>
              <td className="text-center">{i === 0 && rataRata !== null ? rataRata.toFixed(2) : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="text-sm">
        <p>Nilai Akhir (Rerata): <strong>{rataRata !== null ? rataRata.toFixed(2) : '—'}</strong></p>
        <p>Huruf Mutu: <strong>{rataRata !== null ? calcGrade(rataRata) : '—'}</strong></p>
      </div>

      <div className="mt-8 avoid-break">
        <div className="flex justify-between text-center">
          {examiners.map((p) => (
            <div key={p.id} className="w-48">
              <p className="text-sm mb-1">{S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS]}</p>
              <S2SignatureUpload value={p.signature_path} onChange={() => {}} label={p.display_name} />
              <div className="h-8" />
              <p className="border-t border-black pt-1 font-semibold text-sm">{p.display_name}</p>
              <p className="text-xs">NIP. {p.nip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── DAFTAR HADIR PENGUJI ─────────────────────────────────────
function DaftarHadirPengujiTab({ session, people, onUpdate, isDosen }: { session: S2Session; people: S2SessionPerson[]; onUpdate: (f: keyof S2Session, v: any) => void; isDosen: boolean }) {
  const penguji = people.filter((p) => p.role === 'ketua_penguji' || p.role.startsWith('anggota_penguji'));
  return (
    <div className="space-y-4">
      <div className="text-center border-b-2 border-black pb-4">
        <img src="/kop-surat-resize.png" alt="KOP" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: 100, width: 'auto', height: 'auto' }} />
        <h1 className="text-xl font-bold uppercase">Daftar Hadir Penguji Seminar Proposal Tesis</h1>
        <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM MAGISTER</p>
        <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
      </div>
      <table className="w-full text-sm">
        <tbody>
          <tr><td className="w-32">Nama Mahasiswa</td><td className="w-4">:</td><td>{session.student_name}</td></tr>
          <tr><td>NIM</td><td>:</td><td>{session.student_nim}</td></tr>
          <tr><td>Tanggal</td><td>:</td><td>{session.exam_date || ''}</td></tr>
          <tr><td>Peminatan</td><td>:</td><td>{session.specialization}</td></tr>
        </tbody>
      </table>
      <table className="template-table text-sm mt-4">
        <thead><tr><th className="w-8">NO</th><th className="w-28">NIP</th><th>NAMA PENGUJI</th><th>JABATAN</th><th className="w-24">TANDA TANGAN</th></tr></thead>
        <tbody>
          {penguji.map((p, i) => (
            <tr key={p.id}>
              <td className="text-center">{i + 1}.</td>
              <td>{p.nip}</td>
              <td>{p.display_name}</td>
              <td>{S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS]}</td>
              <td className="text-center align-middle">{p.signature_path ? <img src={p.signature_path} alt="TTD" className="max-h-10 max-w-20 object-contain mx-auto" /> : <span className="text-gray-300">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── DAFTAR HADIR PESERTA ─────────────────────────────────────
function DaftarHadirPesertaTab({ session, attendance, onSave }: { session: S2Session; attendance: S2Attendance[]; onSave: (e: S2Attendance[]) => void }) {
  const [local, setLocal] = useState<S2Attendance[]>(
    attendance.length > 0 ? attendance : [{ id: '', session_id: session.id, attendance_type: 'peserta', name: session.student_name, nim: session.student_nim, signature_path: null, notes: '', submitted_by: null, submitted_at: '', created_at: '', updated_at: '' }]
  );

  const update = (idx: number, field: 'name' | 'nim' | 'signature_path', value: string | null) => {
    setLocal((prev) => prev.map((e, i) => (i === idx ? { ...e, [field]: value } : e)));
  };
  const add = () => setLocal((prev) => [...prev, { id: '', session_id: session.id, attendance_type: 'peserta', name: '', nim: '', signature_path: null, notes: '', submitted_by: null, submitted_at: '', created_at: '', updated_at: '' }]);
  const remove = (idx: number) => setLocal((prev) => prev.filter((_, i) => i !== idx));

  return (
    <div className="space-y-4">
      <div className="text-center border-b-2 border-black pb-4">
        <img src="/kop-surat-resize.png" alt="KOP" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: 100, width: 'auto', height: 'auto' }} />
        <h1 className="text-xl font-bold uppercase">Daftar Hadir Peserta Seminar Proposal Tesis</h1>
        <p className="text-sm">PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM MAGISTER</p>
        <p className="text-sm">FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
      </div>
      <table className="w-full text-sm">
        <tbody>
          <tr><td className="w-32">Nama Mahasiswa</td><td className="w-4">:</td><td>{session.student_name}</td></tr>
          <tr><td>NIM</td><td>:</td><td>{session.student_nim}</td></tr>
          <tr><td>Tanggal</td><td>:</td><td>{session.exam_date || ''}</td></tr>
        </tbody>
      </table>
      <table className="template-table text-sm mt-4">
        <thead><tr><th className="w-8">NO</th><th>NAMA PESERTA</th><th className="w-24">NIM</th><th className="w-24">TANDA TANGAN</th><th className="w-16">KET</th></tr></thead>
        <tbody>
          {local.map((p, i) => (
            <tr key={i}>
              <td className="text-center">{i + 1}.</td>
              <td><input value={p.name} onChange={(e) => update(i, 'name', e.target.value)} className="w-full bg-transparent" /></td>
              <td><input value={p.nim} onChange={(e) => update(i, 'nim', e.target.value)} className="w-full bg-transparent" /></td>
              <td className="text-center align-middle"><S2SignatureUpload value={p.signature_path} onChange={(v) => update(i, 'signature_path', v)} label="Peserta" /></td>
              <td className="text-center">{local.length > 1 && <button onClick={() => remove(i)} className="no-print text-red-500 text-xs">✕</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={add} className="no-print mt-2 px-3 py-1 bg-gray-100 border rounded text-sm hover:bg-gray-200 font-sans">+ Tambah baris peserta</button>
      <button onClick={() => onSave(local)} className="no-print ml-2 px-3 py-1 bg-green-800 text-white rounded text-sm hover:bg-green-700 font-sans">Simpan Daftar Hadir</button>
    </div>
  );
}

// ─── PREVIEW & PDF ────────────────────────────────────────────
function S2Preview({ session, people, scores, attendance, onUpdate }: { session: S2Session; people: S2SessionPerson[]; scores: S2Score[]; attendance: S2Attendance[]; onUpdate: (f: keyof S2Session, v: any) => void }) {
  const examiners = people.filter((p) => S2_EXAMINER_ROLES.includes(p.role));
  const getExaminerScores = (pid: string) => {
    const sc: (number | null)[] = [null, null, null, null, null, null, null];
    scores.filter((s) => s.examiner_person_id === pid).forEach((s) => {
      const idx = RUBRIC.findIndex((c) => c.code === s.criterion_code);
      if (idx >= 0) sc[idx] = s.score;
    });
    return sc;
  };

  const handlePrint = () => window.print();

  return (
    <div className="space-y-6">
      <div className="no-print flex gap-3 mb-4">
        <button onClick={handlePrint} className="bg-green-900 text-white px-6 py-2 rounded hover:bg-green-800 font-sans text-sm font-medium">🖨 Print / Save PDF</button>
      </div>

      {/* Laporan */}
      <div className="document-page">
        <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 4, marginBottom: 8 }}>
          <img src="/kop-surat-resize.png" style={{ display: 'block', margin: '0 auto 4px', maxWidth: '100%', maxHeight: 52, width: 'auto', height: 'auto' }} />
          <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: 14 }}>Laporan Seminar Proposal Tesis</div>
          <div style={{ fontSize: 12 }}>PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM MAGISTER</div>
          <div style={{ fontSize: 12 }}>FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</div>
        </div>
        <div style={{ textAlign: 'justify' }}>Pada hari {session.exam_date || '______________'}, telah dilaksanakan seminar proposal tesis mahasiswa:</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
          <tbody>
            <tr><td style={{ width: 110 }}>Nama Mahasiswa</td><td style={{ width: 14 }}>:</td><td>{session.student_name}</td></tr>
            <tr><td>NIM</td><td>:</td><td>{session.student_nim}</td></tr>
            <tr><td>Peminatan</td><td>:</td><td>{session.specialization}</td></tr>
          </tbody>
        </table>
        {session.report_notes && <div style={{ marginTop: 6 }}><div style={{ fontWeight: 'bold' }}>Hasil Pelaksanaan :</div><div style={{ whiteSpace: 'pre-wrap' }}>{session.report_notes}</div></div>}
        <div style={{ marginTop: 6 }}><span style={{ marginLeft: 8 }}>{session.decision === 'lulus_dengan_perbaikan' ? '✓' : '○'} Lulus dengan Perbaikan</span><br /><span style={{ marginLeft: 8 }}>{session.decision === 'tidak_lulus_mengulang' ? '✓' : '○'} Tidak Lulus Mengulang</span></div>
        <div style={{ fontWeight: 'bold', textAlign: 'center', marginTop: 6 }}>TIM PENGUJI</div>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 2 }}>
          <thead><tr><th style={{ width: 32, border: '1px solid #000', padding: 2 }}>NO</th><th style={{ border: '1px solid #000', padding: 2 }}>NAMA PENGUJI</th><th style={{ border: '1px solid #000', padding: 2 }}>JABATAN</th><th style={{ width: 80, border: '1px solid #000', padding: 2 }}>TANDA TANGAN</th></tr></thead>
          <tbody>
            {examiners.map((p, i) => (
              <tr key={p.id}>
                <td style={{ textAlign: 'center', border: '1px solid #000', padding: 2 }}>{i + 1}.</td>
                <td style={{ border: '1px solid #000', padding: 2 }}>{p.display_name}</td>
                <td style={{ border: '1px solid #000', padding: 2 }}>{S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS]}</td>
                <td style={{ textAlign: 'center', border: '1px solid #000', padding: 2, verticalAlign: 'middle' }}>{p.signature_path ? <img src={p.signature_path} alt="TTD" style={{ maxHeight: 30, maxWidth: 60, margin: '0 auto', objectFit: 'contain' }} /> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Penilaian per examiner */}
      {examiners.map((p) => {
        const sc = getExaminerScores(p.id);
        const total = calcTotalSkorXBobot(sc, RUBRIC.map((c) => c.bobot));
        const nilai = total > 0 ? calcNilaiAkhir(total) : 0;
        const grade = total > 0 ? calcGrade(nilai) : '';
        return (
          <div key={p.id} className="document-page">
            <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 4, marginBottom: 6 }}>
              <img src="/kop-surat-resize.png" style={{ display: 'block', margin: '0 auto 4px', maxWidth: '100%', maxHeight: 52, width: 'auto', height: 'auto' }} />
              <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: 14 }}>Formulir Penilaian Seminar Proposal Tesis</div>
              <div style={{ fontSize: 12 }}>PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM MAGISTER</div>
              <div style={{ fontSize: 12 }}>FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 4 }}>
              <tbody>
                <tr><td style={{ width: 110 }}>Nama Peserta</td><td style={{ width: 14 }}>:</td><td>{session.student_name}</td><td style={{ width: 80 }}>NIM</td><td style={{ width: 14 }}>:</td><td>{session.student_nim}</td></tr>
                <tr><td>Judul Tesis</td><td>:</td><td colSpan={3}>{session.thesis_title}</td></tr>
                <tr><td>Jabatan</td><td>:</td><td colSpan={3}>{S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS]}</td></tr>
              </tbody>
            </table>
            <table className="pdf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 4 }}>
              <thead><tr><th style={{ width: 24, border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>NO</th><th style={{ border: '1px solid #000', padding: '1px 3px' }}>PARAMETER PENILAIAN</th><th style={{ width: 52, border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>SKOR (1–4)</th><th style={{ width: 36, border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>BOBOT</th><th style={{ width: 70, border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>SKOR × BOBOT</th></tr></thead>
              <tbody>
                {RUBRIC.map((c, i) => {
                  const sb = sc[i] !== null ? sc[i]! * c.bobot : null;
                  return (
                    <tr key={c.code}>
                      <td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', verticalAlign: 'top' }}>{i + 1}.</td>
                      <td style={{ border: '1px solid #000', padding: '1px 3px', verticalAlign: 'top' }}><div style={{ fontWeight: 'bold', fontSize: 10 }}>{c.label}</div><div style={{ fontSize: 9, whiteSpace: 'pre-line' }}>{c.details.join('\n')}</div></td>
                      <td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', verticalAlign: 'top' }}>{sc[i] ?? ''}</td>
                      <td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', verticalAlign: 'top' }}>{c.bobot}</td>
                      <td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px', fontWeight: 'bold', verticalAlign: 'top' }}>{sb ?? ''}</td>
                    </tr>
                  );
                })}
                <tr style={{ fontWeight: 'bold' }}><td colSpan={2} style={{ border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>TOTAL SKOR × BOBOT</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}></td><td style={{ border: '1px solid #000', padding: '1px 3px' }}></td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px' }}>{total}</td></tr>
                <tr style={{ fontWeight: 'bold' }}><td colSpan={2} style={{ border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>NILAI AKHIR [/400 × 100]</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}></td><td style={{ border: '1px solid #000', padding: '1px 3px' }}></td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px' }}>{total > 0 ? nilai.toFixed(2) : ''}</td></tr>
                <tr style={{ fontWeight: 'bold' }}><td colSpan={2} style={{ border: '1px solid #000', padding: '1px 3px', textAlign: 'center' }}>HURUF MUTU</td><td style={{ border: '1px solid #000', padding: '1px 3px' }}></td><td style={{ border: '1px solid #000', padding: '1px 3px' }}></td><td style={{ textAlign: 'center', border: '1px solid #000', padding: '1px 3px' }}>{grade}</td></tr>
              </tbody>
            </table>
            <div style={{ textAlign: 'right', marginTop: 15 }}>
              <p>Jakarta, {session.exam_date || '______________'}</p>
              <p style={{ marginTop: 8 }}>{S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS]}</p>
              {p.signature_path ? <img src={p.signature_path} alt="TTD" style={{ maxHeight: 38, maxWidth: 80, marginLeft: 'auto', marginTop: 4, display: 'block', objectFit: 'contain' }} /> : <div style={{ height: 38 }}></div>}
              <p style={{ fontWeight: 'bold' }}>{p.display_name}</p>
              <p style={{ fontSize: 11 }}>NIP. {p.nip}</p>
            </div>
          </div>
        );
      })}

      {/* Rekap */}
      <div className="document-page">
        <div style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 4, marginBottom: 8 }}>
          <img src="/kop-surat-resize.png" style={{ display: 'block', margin: '0 auto 4px', maxWidth: '100%', maxHeight: 52, width: 'auto', height: 'auto' }} />
          <div style={{ fontWeight: 'bold', textTransform: 'uppercase', fontSize: 14 }}>Rekapitulasi Nilai Seminar Proposal Tesis</div>
          <div style={{ fontSize: 12 }}>PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM MAGISTER</div>
          <div style={{ fontSize: 12 }}>FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</div>
        </div>
        <table className="pdf-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead><tr><th style={{ width: 32, border: '1px solid #000', padding: 2 }}>NO</th><th style={{ border: '1px solid #000', padding: 2 }}>NAMA PENGUJI</th><th style={{ width: 60, border: '1px solid #000', padding: 2 }}>JABATAN</th><th style={{ width: 70, border: '1px solid #000', padding: 2, textAlign: 'center' }}>NILAI</th></tr></thead>
          <tbody>
            {examiners.map((p, i) => {
              const sc = getExaminerScores(p.id);
              const total = calcTotalSkorXBobot(sc, RUBRIC.map((c) => c.bobot));
              const nilai = total > 0 ? calcNilaiAkhir(total) : null;
              return (
                <tr key={p.id}>
                  <td style={{ textAlign: 'center', border: '1px solid #000', padding: 2 }}>{i + 1}.</td>
                  <td style={{ border: '1px solid #000', padding: 2 }}>{p.display_name}</td>
                  <td style={{ border: '1px solid #000', padding: 2 }}>{S2_ROLE_LABELS[p.role as keyof typeof S2_ROLE_LABELS].replace('Anggota ', 'Ang. ').replace('Ketua ', 'Ket. ')}</td>
                  <td style={{ textAlign: 'center', border: '1px solid #000', padding: 2 }}>{nilai !== null ? nilai.toFixed(2) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ marginTop: 8, fontWeight: 'bold' }}>
          Rerata Nilai Sidang: {(() => {
            const vals = examiners.map((p) => { const sc = getExaminerScores(p.id); const t = calcTotalSkorXBobot(sc, RUBRIC.map((c) => c.bobot)); return t > 0 ? calcNilaiAkhir(t) : null; }).filter((n) => n !== null) as number[];
            return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2) : '—';
          })()}
        </p>
      </div>
    </div>
  );
}
