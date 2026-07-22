#!/usr/bin/env node
/**
 * generate-s2-pdf.js — Standalone PDF generator for S2 Proposal Tesis.
 *
 * Fetches session data from Supabase (service role), renders the full
 * HTML layout (Berita Acara + Penilaian + Rekap + Daftar Hadir) using
 * Puppeteer, and saves a PDF.
 *
 * Usage:
 *   npm install puppeteer @supabase/supabase-js
 *   node scripts/generate-s2-pdf.js --nim 2510722005
 *   node scripts/generate-s2-pdf.js --session-id <uuid>
 *
 * Required env vars or .env file:
 *   SUPABASE_URL=https://rvfyljuuchmuynbkqczp.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=<your-key>
 */

const { createClient } = require('@supabase/supabase-js');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// ── Config ──────────────────────────────────────────────────
const KOP_PATH = path.resolve(__dirname, '..', 'public', 'kop-surat-resize.png');

const RUBRIC = [
  { code: 'tema_judul', label: 'Tema dan Judul', bobot: 10, details: ['Tema penelitian terbaru dan relevan dengan bidang ilmu', 'Mencantumkan variabel-variabel serta waktu, tempat, dan subjek penelitian'] },
  { code: 'pendahuluan', label: 'Pendahuluan', bobot: 20, details: ['Merumuskan latar belakang dan masalah penelitian', 'Menentukan tujuan dan manfaat penelitian'] },
  { code: 'tinjauan_pustaka', label: 'Tinjauan Pustaka', bobot: 15, details: ['Menelusuri kepustakaan yang relevan dengan judul, bersumber dari buku, jurnal terakreditasi nasional dan internasional', 'Menyajikan kerangka teori yang komprehensif', 'Menyusun daftar studi literatur atau penelitian terdahulu'] },
  { code: 'metode_penelitian', label: 'Metode Penelitian', bobot: 25, details: ['Merumuskan desain penelitian sesuai dengan pertanyaan penelitian', 'Menyusun prosedur pengambilan sampel (pemilihan populasi, kriteria sampel, pemilihan sampel)', 'Menyusun prosedur pengumpulan data (perizinan, lokasi)', 'Menyusun dan mengembangkan instrumen penelitian', 'Menyusun definisi operasional penelitian', 'Menyajikan perangkat dan tahapan analisis data yang telah dilakukan', 'Menyajikan kerangka konsep dan hipotesis', 'Menjelaskan prinsip etik dalam proses penelitian'] },
  { code: 'daftar_pustaka', label: 'Daftar Pustaka', bobot: 5, details: ['Menyajikan daftar pustaka yang digunakan mengikuti format universitas', 'Melengkapi sumber pustaka dengan proses akses internet yang digunakan', 'Menggunakan aplikasi pengelolaan daftar pustaka', 'Bersumber dari buku, jurnal terakreditasi nasional dan internasional dengan tahun kepustakaan ≤ 5 tahun terakhir'] },
  { code: 'lampiran', label: 'Lampiran', bobot: 5, details: ['Melampirkan linimasa pengerjaan tesis (time schedule)', 'Melampirkan instrumen penelitian', 'Melampirkan surat lolos kaji etik', 'Melampirkan dokumen perizinan', 'Melampirkan dokumentasi foto pelaksanaan penelitian', 'Melampirkan output analisis data (jika ada)'] },
  { code: 'presentasi_responsi', label: 'Presentasi dan Responsi', bobot: 20, details: ['Menyajikan laporan hasil penelitian dalam waktu 10—15 menit', 'Menggunakan bahan tayang yang menarik dan informatif', 'Melakukan presentasi dengan suara dan intonasi yang jelas', 'Menggunakan bahasa yang baku/formal', 'Menunjukkan sikap yang baik dalam melakukan presentasi dan merespons masukan', 'Menunjukkan kemampuan argumentasi yang baik', 'Menguasai materi proposal penelitian'] },
];

const S2_EXAMINER_ROLES = ['ketua_penguji', 'anggota_penguji_1', 'anggota_penguji_2', 'anggota_penguji_3'];

const S2_ROLE_LABELS = {
  ketua_penguji: 'Ketua Penguji',
  anggota_penguji_1: 'Anggota Penguji 1',
  anggota_penguji_2: 'Anggota Penguji 2',
  anggota_penguji_3: 'Anggota Penguji 3',
  pembimbing_1: 'Dosen Pembimbing 1',
  pembimbing_2: 'Dosen Pembimbing 2',
  koordinator: 'Koordinator',
};

const KOORDINATOR_DEFAULT = 'Dr. Apriningsih, S.K.M., M.K.M.';
const KOORDINATOR_NIP_DEFAULT = '197604102021212009';

function calcTotalSkorXBobot(scores, weights) {
  return scores.reduce((sum, score, i) => {
    if (score === null || score === undefined) return sum;
    return sum + score * weights[i];
  }, 0);
}

function calcNilaiAkhir(total) {
  if (total <= 0) return 0;
  return total / 4;
}

function calcGrade(nilai) {
  if (nilai >= 85) return 'A';
  if (nilai >= 80) return 'A-';
  if (nilai >= 75) return 'B+';
  if (nilai >= 70) return 'B';
  return 'TIDAK LULUS';
}

function calcIP(nilai) {
  if (nilai >= 85) return 4.00;
  if (nilai >= 80) return 3.75;
  if (nilai >= 75) return 3.50;
  if (nilai >= 70) return 3.00;
  return null;
}

// ── HTML Builder ────────────────────────────────────────────

function esc(s) { return (s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function buildHTML({ session, people, scores, attendance, kopDataUri }) {
  const examiners = people.filter(p => S2_EXAMINER_ROLES.includes(p.role));
  const penguji = examiners.concat(people.filter(p => p.role === 'pembimbing_1' || p.role === 'pembimbing_2'));
  const peserta = attendance.filter(a => a.attendance_type === 'peserta');
  const audiens = attendance.filter(a => a.attendance_type === 'audiens');

  const weights = RUBRIC.map(c => c.bobot);

  function getExaminerScores(personId) {
    const out = [null, null, null, null, null, null, null];
    scores.filter(s => s.examiner_person_id === personId).forEach(s => {
      const idx = RUBRIC.findIndex(c => c.code === s.criterion_code);
      if (idx >= 0) out[idx] = s.score;
    });
    return out;
  }

  function renderDocHeader(title) {
    return `<div class="doc-header">
      ${kopDataUri ? `<img src="${kopDataUri}" alt="KOP UPN Veteran Jakarta" class="kop" />` : ''}
      <div class="header-sep"></div>
      <h1>${esc(title)}</h1>
      <p>PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM MAGISTER</p>
      <p>FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
      <p class="semester">SEMESTER ${esc(session.semester)} T.A. ${esc(session.academic_year)}</p>
    </div>`;
  }

  function renderAssessment(personId) {
    const sc = getExaminerScores(personId);
    const total = calcTotalSkorXBobot(sc, weights);
    const nilai = total > 0 ? calcNilaiAkhir(total) : 0;
    const grade = total > 0 ? calcGrade(nilai) : '';

    let rows = '';
    RUBRIC.forEach((c, i) => {
      const score = sc[i];
      const sw = score !== null ? score * c.bobot : null;
      const details = c.details.filter(Boolean).map(d => `<li>${esc(d)}</li>`).join('');
      rows += `<tr>
        <td class="tc">${i + 1}.</td>
        <td><div class="fw-bold">${esc(c.label)}</div>${details ? `<ul class="detail">${details}</ul>` : ''}</td>
        <td class="tc">${score !== null ? score : ''}</td>
        <td class="tc">${c.bobot}</td>
        <td class="tc fw-bold">${sw !== null ? sw : ''}</td>
      </tr>`;
    });

    return `<table class="assessment">
      <thead><tr><th class="w-8">NO</th><th>PARAMETER PENILAIAN</th><th class="w-24">SKOR (1—4)</th><th class="w-14">BOBOT</th><th class="w-24">SKOR × BOBOT</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr class="fw-bold"><td colspan="4" class="tc">TOTAL SKOR NILAI × BOBOT</td><td class="tc">${total}</td></tr>
        <tr class="fw-bold"><td colspan="4" class="tc">NILAI AKHIR [(Total Skor × Bobot)/400 × 100]</td><td class="tc">${total > 0 ? nilai.toFixed(2) : ''}</td></tr>
        <tr class="fw-bold"><td colspan="4" class="tc">HURUF MUTU</td><td class="tc">${grade}</td></tr>
      </tfoot>
    </table>`;
  }

  function renderSignatureBlock(person, label) {
    return `<div class="signature-block">
      <p>Jakarta, ${esc(session.tanggal_ba || '______________')}</p>
      <p>${esc(label)}</p>
      ${person.signature_path ? `<img src="${esc(person.signature_path)}" alt="TTD" class="ttd" />` : '<div class="ttd-placeholder"></div>'}
      <p class="fw-bold name-line">${esc(person.display_name)}</p>
      <p class="nip">NIP. ${esc(person.nip)}</p>
    </div>`;
  }

  // ── BUILD DOCUMENTS ──

  // 1) Berita Acara
  let ba = `<section class="page">
    ${renderDocHeader('Laporan Seminar Proposal Tesis')}
    <p>Pada hari ini ${esc(session.hari_tanggal || '______________')}, telah dilaksanakan Seminar Proposal Tesis bagi mahasiswa:</p>
    <table class="info">
      <tr><td class="w-36">Nama</td><td class="w-4">:</td><td>${esc(session.student_name)}</td></tr>
      <tr><td>NIM</td><td>:</td><td>${esc(session.student_nim)}</td></tr>
      <tr><td>Waktu Sidang</td><td>:</td><td>${esc(session.start_time || '______________')}</td></tr>
      <tr><td>Peminatan</td><td>:</td><td>${esc(session.specialization || '______________')}</td></tr>
    </table>
    <div class="mt-3"><p class="fw-bold">Dengan Judul Penelitian sebagai berikut :</p><p>${esc(session.thesis_title || '______________')}</p></div>
    <p class="mt-3">
      <span style="margin-left:1em;">${session.decision === 'lulus_dengan_perbaikan' ? '✓' : '○'} Proposal tesis dilanjutkan dengan perbaikan</span><br/>
      <span style="margin-left:1em;">${session.decision === 'tidak_lulus_mengulang' ? '✓' : '○'} Proposal tesis tidak diluluskan / Mengulang sidang</span>
    </p>
    <p class="mt-3 text-justify italic">Demikian laporan seminar proposal tesis ini dibuat sebagai laporan selama seminar berlangsung untuk diketahui dan dipergunakan sebagaimana mestinya.</p>
    <div class="mt-5">
      <h3 class="text-center fw-bold">TIM PENGUJI</h3>
      <table class="template">
        <thead><tr><th class="w-12">NO</th><th>NAMA PENGUJI</th><th>JABATAN</th><th class="w-24">TANDA TANGAN</th></tr></thead>
        <tbody>${penguji.map((p, i) => `<tr>
          <td class="tc">${i + 1}.</td>
          <td>${esc(p.display_name)}</td>
          <td>${esc(S2_ROLE_LABELS[p.role] || '')}</td>
          <td class="tc">${p.signature_path ? `<img src="${esc(p.signature_path)}" alt="TTD" class="ttd-sm" />` : ''}</td>
        </tr>`).join('')}</tbody>
      </table>
    </div>
    <div class="mt-10 text-right koordinator-block">
      <p>Jakarta, ${esc(session.tanggal_ba || '______________')}</p>
      <p class="mt-4">Koordinator Program Studi</p>
      ${session.koordinator_signature_path ? `<img src="${esc(session.koordinator_signature_path)}" alt="TTD Koordinator" class="ttd-koord" />` : '<div class="h-16"></div>'}
      <p class="fw-bold">${esc(session.koordinator || KOORDINATOR_DEFAULT)}</p>
      <p>NIP. ${esc(session.nip_koordinator || KOORDINATOR_NIP_DEFAULT)}</p>
    </div>
  </section>`;

  // 2) Penilaian per examiner
  let penilaianSections = examiners.map(person => {
    const label = S2_ROLE_LABELS[person.role] || person.role;
    return `<section class="page penilaian-page">
      ${renderDocHeader('Formulir Penilaian Seminar Proposal Tesis')}
      <table class="penilaian-header">
        <tr><td class="w-36">Nama Peserta</td><td class="w-4">:</td><td>${esc(session.student_name)}</td><td class="w-16">NIM</td><td class="w-4">:</td><td>${esc(session.student_nim)}</td></tr>
        <tr><td>Judul Tesis</td><td>:</td><td colspan="4">${esc(session.thesis_title)}</td></tr>
        <tr><td>Jabatan Penguji</td><td>:</td><td colspan="4">${esc(label)}</td></tr>
      </table>
      ${renderAssessment(person.id)}
      ${renderSignatureBlock(person, label)}
    </section>`;
  }).join('');

  // 3) Rekapitulasi
  const examScores = examiners.map(person => {
    const sc = getExaminerScores(person.id);
    const total = calcTotalSkorXBobot(sc, weights);
    return total > 0 ? calcNilaiAkhir(total) : null;
  });
  const validScores = examScores.filter(n => n !== null);
  const jumlah = validScores.length ? validScores.reduce((a, b) => a + b, 0) : 0;
  const ip = validScores.length ? calcIP(jumlah / validScores.length) : null;

  let rekap = `<section class="page rekap-page">
    ${renderDocHeader('Rekapitulasi Nilai Seminar Proposal Tesis')}
    <table class="template mt-2">
      <thead><tr><th class="w-8">NO</th><th>NAMA</th><th class="w-20">NIM</th>${S2_EXAMINER_ROLES.map((_, i) => `<th class="w-14">${['I','II','III','IV'][i]||''}</th>`).join('')}<th class="w-16">JUMLAH</th><th class="w-14">IP</th></tr></thead>
      <tbody>
        <tr><td class="tc">1.</td><td>${esc(session.student_name)}</td><td>${esc(session.student_nim)}</td>
        ${examScores.map(s => `<td class="tc fw-bold">${s !== null ? s.toFixed(2) : ''}</td>`).join('')}
        ${Array.from({length: Math.max(0, 4 - examScores.length)}).map(() => `<td class="tc"></td>`).join('')}
        <td class="tc fw-bold">${validScores.length ? jumlah.toFixed(2) : ''}</td>
        <td class="tc fw-bold">${ip !== null ? ip.toFixed(2) : ''}</td>
        </tr>
      </tbody>
    </table>
    <p class="mt-3">Jakarta, ${esc(session.tanggal_ba || '______________')}</p>
    <p class="mt-2 fw-bold">Tanda Tangan</p>
    ${examiners.map((person, i) => `<div class="ttd-row">
      <span class="w-48">${i + 1}. ${esc(S2_ROLE_LABELS[person.role] || '')}</span>
      <span class="name-underline">${esc(person.display_name || '…………………………………..')}</span>
      <span class="ttd-cell">${person.signature_path ? `<img src="${esc(person.signature_path)}" alt="TTD" class="ttd-xs" />` : '<span class="muted">(—)</span>'}</span>
    </div>`).join('')}
  </section>`;

  // 4) Daftar Hadir
  let dh = `<section class="page hadir-page">
    ${renderDocHeader('Daftar Hadir Seminar Proposal Tesis')}
    <table class="info">
      <tr><td class="w-32">Nama Mahasiswa</td><td class="w-4">:</td><td>${esc(session.student_name)}</td></tr>
      <tr><td>NIM</td><td>:</td><td>${esc(session.student_nim)}</td></tr>
      <tr><td>Tanggal</td><td>:</td><td>${esc(session.hari_tanggal || session.exam_date || '')}</td></tr>
      <tr><td>Peminatan</td><td>:</td><td>${esc(session.specialization)}</td></tr>
    </table>
    <h2 class="text-center fw-bold mt-4">DAFTAR HADIR PENGUJI</h2>
    <table class="template mt-1">
      <thead><tr><th class="w-8">NO</th><th class="w-28">NIP</th><th>NAMA PENGUJI</th><th>JABATAN</th><th class="w-24">TANDA TANGAN</th></tr></thead>
      <tbody>${penguji.map((p, i) => `<tr><td class="tc">${i + 1}.</td><td>${esc(p.nip)}</td><td>${esc(p.display_name)}</td><td>${esc(S2_ROLE_LABELS[p.role] || '')}</td><td class="tc">${p.signature_path ? `<img src="${esc(p.signature_path)}" alt="TTD" class="ttd-xs" />` : '<span class="muted">—</span>'}</td></tr>`).join('')}</tbody>
    </table>
    <h2 class="text-center fw-bold mt-4">DAFTAR HADIR PESERTA</h2>
    <table class="template mt-1">
      <thead><tr><th class="w-8">NO</th><th>NAMA PESERTA</th><th class="w-24">NIM</th><th class="w-24">TANDA TANGAN</th><th class="w-16">KET</th></tr></thead>
      <tbody>${peserta.length === 0 ? '<tr><td class="tc">1.</td><td colspan="4">____________________________</td></tr>' : peserta.map((p, i) => `<tr><td class="tc">${i + 1}.</td><td>${esc(p.name)}</td><td>${esc(p.nim)}</td><td class="tc">${p.signature_path ? `<img src="${esc(p.signature_path)}" alt="TTD" class="ttd-xs" />` : '<span class="muted">—</span>'}</td><td class="tc">${esc(p.notes)}</td></tr>`).join('')}</tbody>
    </table>
    <h2 class="text-center fw-bold mt-4">DAFTAR HADIR MAHASISWA SEBAGAI AUDIENS</h2>
    <table class="template mt-1">
      <thead><tr><th class="w-8">NO</th><th>NAMA MAHASISWA</th><th class="w-24">NIM</th><th class="w-24">TANDA TANGAN</th><th class="w-16">KET</th></tr></thead>
      <tbody>${audiens.length === 0 ? '<tr><td class="tc">1.</td><td colspan="4">____________________________</td></tr>' : audiens.map((a, i) => `<tr><td class="tc">${i + 1}.</td><td>${esc(a.name)}</td><td>${esc(a.nim)}</td><td class="tc">${a.signature_path ? `<img src="${esc(a.signature_path)}" alt="TTD" class="ttd-xs" />` : '<span class="muted">—</span>'}</td><td class="tc">${esc(a.notes)}</td></tr>`).join('')}</tbody>
    </table>
  </section>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  @page { size: A4 portrait; margin: 12mm 14mm 14mm 14mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Times New Roman', Georgia, serif; font-size: 12pt; color: #000; background: #fff; }
  .page { page-break-after: always; width: 100%; padding: 0; margin: 0; }
  .doc-header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 0.5em; margin-bottom: 0.75em; }
  .doc-header img.kop { display: block; margin: 0 auto 0.5rem; max-width: 100%; max-height: 100px; width: auto; height: auto; }
  .header-sep { display: none; }
  .doc-header h1 { font-size: 16pt; font-weight: bold; text-transform: uppercase; }
  .doc-header p { font-size: 11pt; }
  .doc-header p.semester { font-size: 11pt; font-weight: 600; }
  .template { width: 100%; border-collapse: collapse; font-size: 11pt; }
  .template th, .template td { border: 1px solid #000; padding: 3px 5px; vertical-align: top; }
  .template th { background: #f0f0f0; text-align: center; font-weight: bold; }
  .info { width: 100%; font-size: 11pt; }
  .info td { padding: 2px 3px; vertical-align: top; }
  .assessment { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 0.5em; }
  .assessment th, .assessment td { border: 1px solid #000; padding: 2px 4px; vertical-align: top; }
  .assessment th { background: #f0f0f0; text-align: center; font-weight: bold; }
  .penilaian-header { width: 100%; font-size: 10pt; margin-top: 0.25em; }
  .penilaian-header td { padding: 1px 3px; vertical-align: top; }
  .tc { text-align: center; }
  .fw-bold { font-weight: bold; }
  .text-center { text-align: center; }
  .text-right { text-align: right; }
  .text-justify { text-align: justify; }
  .italic { font-style: italic; }
  .mt-1 { margin-top: 0.25em; }
  .mt-2 { margin-top: 0.5em; }
  .mt-3 { margin-top: 0.75em; }
  .mt-4 { margin-top: 1em; }
  .mt-5 { margin-top: 1.5em; }
  .mt-8 { margin-top: 2em; }
  .mt-10 { margin-top: 3em; }
  .w-4 { width: 1em; }
  .w-8 { width: 2em; }
  .w-12 { width: 3em; }
  .w-14 { width: 3.5em; }
  .w-16 { width: 4em; }
  .w-20 { width: 5em; }
  .w-24 { width: 6em; }
  .w-28 { width: 7em; }
  .w-32 { width: 8em; }
  .w-36 { width: 9em; }
  .w-48 { width: 12em; }
  .h-16 { height: 4em; }
  .detail { margin: 0.25em 0 0 1.5em; padding: 0; list-style: disc; }
  .detail li { margin: 0; padding: 0; }
  .ttd { max-height: 3em; max-width: 8em; object-fit: contain; margin: 0.25em 0; }
  .ttd-sm { max-height: 2.5em; max-width: 6em; object-fit: contain; }
  .ttd-xs { max-height: 2em; max-width: 5em; object-fit: contain; }
  .ttd-koord { max-height: 4em; max-width: 8em; object-fit: contain; margin: 0.5em 0; }
  .ttd-placeholder { height: 3em; }
  .signature-block { width: 240px; max-width: 240px; margin-left: auto; margin-right: 0; margin-top: 1em; page-break-inside: avoid; }
  .signature-block .name-line { border-top: 1px solid #000; padding-top: 0.25em; font-weight: bold; }
  .signature-block .nip { font-size: 9pt; }
  .koordinator-block { page-break-inside: avoid; }
  .ttd-row { display: flex; align-items: center; gap: 0.5em; margin-top: 0.25em; font-size: 10pt; }
  .ttd-row .name-underline { flex: 1; border-bottom: 1px solid #000; }
  .ttd-row .ttd-cell { width: 6em; text-align: center; }
  .muted { color: #aaa; }
  .rekap-page td { font-size: 10pt; }
  .hadir-page td { font-size: 10pt; }
  img { max-width: 100%; }
  @media print {
    body { margin: 0; padding: 0; }
    .page { page-break-after: always; }
  }
</style></head>
<body>
${ba}
${penilaianSections}
${rekap}
${dh}
</body>
</html>`;
}

// ── Main ─────────────────────────────────────────────────────
async function main() {
  const args = {};
  process.argv.slice(2).forEach((a, i, arr) => {
    if (a.startsWith('--')) {
      const key = a.replace(/^--/, '');
      const val = arr[i + 1];
      if (val && !val.startsWith('--')) args[key] = val;
      else args[key] = true;
    }
  });

  const supabaseUrl = process.env.SUPABASE_URL || args['supabase-url'];
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || args['service-key'];
  const nim = args['nim'] || args['n'] || args['student'];
  const sessionId = args['session-id'] || args['sid'];
  const outputDir = args['output'] || args['o'] || process.cwd();

  if (!supabaseUrl || !serviceKey) {
    console.error('ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
    console.error('  Set them as env vars or pass --supabase-url / --service-key');
    console.error('  Example: node generate-s2-pdf.js --nim 2510722005');
    process.exit(1);
  }
  if (!nim && !sessionId) {
    console.error('ERROR: Provide --nim or --session-id');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // Query session
  let sessionResult;
  if (sessionId) {
    sessionResult = await supabase.from('s2_sessions').select('*').eq('id', sessionId).single();
  } else {
    sessionResult = await supabase.from('s2_sessions').select('*').eq('student_nim', nim).eq('exam_type', 'proposal').order('created_at', { ascending: false }).limit(1).single();
  }

  if (sessionResult.error) {
    console.error('Error querying session:', sessionResult.error.message);
    process.exit(1);
  }
  const session = sessionResult.data;
  console.log(`Session found: ${session.student_name} (${session.student_nim})`);

  // Query people, scores, attendance
  const [peopleRes, scoresRes, attRes] = await Promise.all([
    supabase.from('s2_session_people').select('*').eq('session_id', session.id).order('sequence_no'),
    supabase.from('s2_scores').select('*').eq('session_id', session.id),
    supabase.from('s2_attendance').select('*').eq('session_id', session.id),
  ]);

  const people = peopleRes.data || [];
  const scores = scoresRes.data || [];
  const attendance = attRes.data || [];

  // Read and embed KOP image
  let kopDataUri = '';
  try {
    const imgBuf = fs.readFileSync(KOP_PATH);
    kopDataUri = `data:image/png;base64,${imgBuf.toString('base64')}`;
    console.log('KOP image loaded, size:', (kopDataUri.length / 1024).toFixed(0), 'KB');
  } catch (e) {
    console.warn('Warning: Could not read KOP image, continuing without it.');
  }

  console.log('Generating HTML...');
  const html = buildHTML({ session, people, scores, attendance, kopDataUri });

  const outputFile = path.resolve(outputDir, `S2_Proposal_${session.student_nim}_${new Date().toISOString().split('T')[0]}.pdf`);

  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.evaluate(() => document.fonts?.ready);
    console.log('Generating PDF...');
    await page.pdf({
      path: outputFile,
      format: 'A4',
      margin: { top: '12mm', right: '14mm', bottom: '14mm', left: '14mm' },
      printBackground: true,
      displayHeaderFooter: false,
    });
    console.log(`PDF saved: ${outputFile}`);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1); });
}

module.exports = { buildHTML, esc, calcTotalSkorXBobot, calcNilaiAkhir, calcGrade, calcIP, RUBRIC };
