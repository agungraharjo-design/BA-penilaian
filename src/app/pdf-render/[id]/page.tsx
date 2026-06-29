import { createAdminClient } from '@/lib/supabase/admin'
import { RUBRIC_CRITERIA, type Session } from '@/types'
import { calcTotalSkorXBobot, calcNilaiAkhir, calcGrade } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function PdfRenderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const admin = createAdminClient()
  if (!admin) return <div>Service role not configured</div>

  const { data } = await admin.from('sessions').select('*').eq('id', id).single()
  if (!data) return <div>Session not found</div>

  const s = data as Session
  if (!s.skor_penguji) s.skor_penguji = [[null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null]]
  if (!s.peserta_hadir) s.peserta_hadir = [{ nama: s.nama, nim: s.nim }]
  if (!s.audience_hadir) s.audience_hadir = []

  const scoresByExaminer = [0, 1, 2].map(idx => {
    const scores = s.skor_penguji?.[idx] || [null,null,null,null,null,null,null,null,null,null]
    const totalSkorXBobot = calcTotalSkorXBobot(scores, RUBRIC_CRITERIA.map(c => c.bobot))
    const nilaiAkhir = calcNilaiAkhir(totalSkorXBobot)
    return { totalSkorXBobot, nilaiAkhir }
  })
  const jumlah = scoresByExaminer.reduce((ss, e) => ss + e.nilaiAkhir, 0)
  const count = scoresByExaminer.filter(e => e.nilaiAkhir > 0).length
  const rataRata = count > 0 ? jumlah / count : 0

  return (
    <html>
    <head>
      <style>{`
        @page { size: A4; margin: 15mm 20mm 20mm; }
        * { box-sizing: border-box; }
        body { font-family: 'Times New Roman', Georgia, serif; color: #000; margin: 0; padding: 0; font-size: 12pt; line-height: 1.5; }
        .template-table { border-collapse: collapse; width: 100%; font-family: 'Times New Roman', Georgia, serif; }
        .template-table th, .template-table td { border: 1px solid black; padding: 2px 4px; vertical-align: top; }
        .template-table th { background-color: #f0f0f0; text-align: center; font-weight: bold; }
        .page-break { page-break-before: always; break-before: page; padding-top: 8mm; }
        .avoid-break { page-break-inside: avoid; break-inside: avoid; }
        img { max-width: 100%; height: auto; }
        .print-area { padding: 0; }
        .no-print { display: none; }
        table { border-collapse: collapse; }
      `}</style>
    </head>
    <body>
    <div className="print-area" style={{ fontFamily: "'Times New Roman', Georgia, serif" }}>

      {/* ===== LAPORAN SIDANG SKRIPSI ===== */}
      <div style={{ textAlign: 'center', borderBottom: '2px solid black', paddingBottom: '1rem' }}>
        <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }} />
        <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center' }}>Laporan Sidang Skripsi</h1>
        <p style={{ fontSize: '0.875rem', textAlign: 'center' }}>PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
        <p style={{ fontSize: '0.875rem', textAlign: 'center' }}>FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
        <p style={{ fontSize: '0.875rem', textAlign: 'center', fontWeight: 'bold' }}>T.A. {s.ta}</p>
      </div>

      <p style={{ textAlign: 'justify' }}>
        Pada hari {s.hari_tanggal || '______________'}, telah dilaksanakan sidang skripsi mahasiswa:
      </p>

      <table style={{ width: '100%' }}>
        <tbody>
          <tr><td style={{ width: '8rem' }}>Nama Mahasiswa</td><td style={{ width: '1rem' }}>:</td><td>{s.nama || '______________'}</td></tr>
          <tr><td>NIM</td><td>:</td><td>{s.nim || '______________'}</td></tr>
          <tr><td>Waktu Sidang</td><td>:</td><td>{s.waktu || '______________'}</td></tr>
          <tr><td>Peminatan</td><td>:</td><td>{s.peminatan || '______________'}</td></tr>
        </tbody>
      </table>

      {s.catatan && (
        <div style={{ marginTop: '1rem' }}>
          <p style={{ fontWeight: 'bold' }}>Hasil Pelaksanaan :</p>
          <p style={{ whiteSpace: 'pre-wrap' }}>{s.catatan}</p>
        </div>
      )}

      <p style={{ marginTop: '1rem' }}>
        Dinyatakan yang bersangkutan:<br />
        <span style={{ marginLeft: '1rem' }}>{s.decision === 'lulus_perbaikan' ? '✓' : '○'} Lulus</span><br />
        <span style={{ marginLeft: '1rem' }}>{s.decision === 'tidak_lulus_ulang' ? '✓' : '○'} Tidak Lulus</span>
      </p>

      <p style={{ fontStyle: 'italic', fontSize: '0.875rem', textAlign: 'justify', marginTop: '1rem' }}>
        Demikian laporan sidang ini dibuat sebagai laporan selama sidang berlangsung untuk diketahui dan dipergunakan sebagaimana mestinya.
      </p>

      <div style={{ marginTop: '1.5rem' }}>
        <h3 style={{ fontWeight: 'bold', textAlign: 'center' }}>TIM PENGUJI</h3>
        <table className="template-table" style={{ marginTop: '0.25rem' }}>
          <thead><tr><th style={{ width: '3rem' }}>NO</th><th>NAMA PENGUJI</th><th>JABATAN</th><th style={{ width: '6rem' }}>TANDA TANGAN</th></tr></thead>
          <tbody>
            <tr><td style={{ textAlign: 'center' }}>1.</td><td>{s.penguji1 || '______________'}</td><td>Ketua Penguji</td><td style={{ textAlign: 'center', verticalAlign: 'middle' }}>{s.ttd_penguji1 ? <img src={s.ttd_penguji1} alt="TTD" style={{ maxHeight: '3rem', maxWidth: '6rem', margin: '0 auto', objectFit: 'contain' }} /> : ''}</td></tr>
            <tr><td style={{ textAlign: 'center' }}>2.</td><td>{s.penguji2 || '______________'}</td><td>Anggota Penguji I</td><td style={{ textAlign: 'center', verticalAlign: 'middle' }}>{s.ttd_penguji2 ? <img src={s.ttd_penguji2} alt="TTD" style={{ maxHeight: '3rem', maxWidth: '6rem', margin: '0 auto', objectFit: 'contain' }} /> : ''}</td></tr>
            <tr><td style={{ textAlign: 'center' }}>3.</td><td>{s.penguji3 || '______________'}</td><td>Anggota Penguji II</td><td style={{ textAlign: 'center', verticalAlign: 'middle' }}>{s.ttd_penguji3 ? <img src={s.ttd_penguji3} alt="TTD" style={{ maxHeight: '3rem', maxWidth: '6rem', margin: '0 auto', objectFit: 'contain' }} /> : ''}</td></tr>
          </tbody>
        </table>
      </div>

      <div style={{ textAlign: 'right', marginTop: '2.5rem' }} className="avoid-break">
        <p>Jakarta, {s.tanggal_ba || '______________'}</p>
        <p style={{ marginTop: '1rem' }}>Koordinator Program Studi Kesehatan Masyarakat</p>
        <p>Program Sarjana</p>
        {s.ttd_koordinator ? <img src={s.ttd_koordinator} alt="TTD Koordinator" style={{ maxHeight: '4rem', maxWidth: '8rem', marginLeft: 'auto', margin: '0.5rem 0', objectFit: 'contain' }} /> : <div style={{ height: '4rem' }}></div>}
        <p style={{ fontWeight: 'bold' }}>{s.koordinator}</p>
        <p style={{ fontSize: '0.875rem' }}>NIP. {s.nip_koordinator}</p>
      </div>

      {/* ===== FORM PENILAIAN (3 examiners) ===== */}
      {[0, 1, 2].map((examIdx) => {
        const scores = s.skor_penguji?.[examIdx] || [null,null,null,null,null,null,null,null,null,null]
        const labels = ['Penguji I/Ketua Penguji', 'Penguji II/Anggota Penguji', 'Penguji III/Anggota Penguji']
        const namaPenguji = [s.penguji1, s.penguji2, s.penguji3]
        return (
          <div key={examIdx} className="page-break">
            <div style={{ textAlign: 'center', borderBottom: '2px solid black', paddingBottom: '1rem' }}>
              <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }} />
              <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center' }}>Formulir Penilaian Sidang Skripsi</h1>
              <p style={{ fontSize: '0.875rem', textAlign: 'center' }}>PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
              <p style={{ fontSize: '0.875rem', textAlign: 'center' }}>FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
              <p style={{ fontSize: '0.875rem', textAlign: 'center', fontWeight: 'bold' }}>SEMESTER {s.semester} T.A. {s.ta}</p>
            </div>

            <table style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.875rem' }}>
              <tbody>
                <tr><td style={{ width: '9rem' }}>Nama Peserta</td><td style={{ width: '1rem' }}>:</td><td>{s.nama}</td><td style={{ width: '9rem' }}>NIM</td><td style={{ width: '1rem' }}>:</td><td>{s.nim}</td></tr>
                <tr><td>Hari, Tanggal Sidang</td><td>:</td><td>{s.hari_tanggal}</td><td>Waktu Sidang</td><td>:</td><td>{s.waktu}</td></tr>
                <tr><td>Tempat Sidang</td><td>:</td><td>{s.tempat}</td><td>Dosen Pembimbing</td><td>:</td><td>{s.pembimbing}</td></tr>
                <tr><td>Peminatan</td><td>:</td><td>{s.peminatan}</td><td></td><td></td><td></td></tr>
              </tbody>
            </table>
            <p style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}><span style={{ fontWeight: 'bold' }}>Judul Skripsi:</span> {s.judul_skripsi}</p>

            <table className="template-table" style={{ fontSize: '0.875rem', marginTop: '0.75rem' }}>
              <thead>
                <tr><th style={{ width: '2rem' }}>NO</th><th>PARAMETER PENILAIAN</th><th style={{ width: '6rem' }}>SKOR NILAI (1—4)</th><th style={{ width: '3.5rem' }}>BOBOT</th><th style={{ width: '6rem' }}>SKOR NILAI × BOBOT</th></tr>
              </thead>
              <tbody>
                {RUBRIC_CRITERIA.map((c, i) => {
                  const skorXBobot = scores[i] !== null ? scores[i]! * c.bobot : null
                  return (
                    <tr key={c.no} className="avoid-break">
                      <td style={{ textAlign: 'center', verticalAlign: 'top' }}>{c.no}.</td>
                      <td style={{ fontSize: '0.75rem', lineHeight: '1.2', padding: '4px' }}>
                        <div style={{ fontWeight: 'bold' }}>{c.label}</div>
                        <div style={{ whiteSpace: 'pre-line', fontSize: '0.7rem', color: '#374151' }}>{c.detail}</div>
                      </td>
                      <td style={{ textAlign: 'center' }}>{scores[i] ?? ''}</td>
                      <td style={{ textAlign: 'center' }}>{c.bobot}</td>
                      <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{skorXBobot ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr style={{ fontWeight: 'bold' }}>
                  <td colSpan={4} style={{ textAlign: 'center' }}>TOTAL SKOR NILAI × BOBOT</td>
                  <td style={{ textAlign: 'center' }}>{scoresByExaminer[examIdx].totalSkorXBobot}</td>
                </tr>
                <tr style={{ fontWeight: 'bold' }}>
                  <td colSpan={4} style={{ textAlign: 'center' }}>NILAI AKHIR [(Total Skor Nilai × Bobot)/400 × 100]</td>
                  <td style={{ textAlign: 'center' }}>{scoresByExaminer[examIdx].nilaiAkhir > 0 ? scoresByExaminer[examIdx].nilaiAkhir.toFixed(2) : ''}</td>
                </tr>
                <tr style={{ fontWeight: 'bold' }}>
                  <td colSpan={4} style={{ textAlign: 'center' }}>HURUF MUTU</td>
                  <td style={{ textAlign: 'center' }}>{scoresByExaminer[examIdx].nilaiAkhir > 0 ? calcGrade(scoresByExaminer[examIdx].nilaiAkhir) : ''}</td>
                </tr>
              </tfoot>
            </table>

            <p style={{ fontSize: '0.75rem', marginTop: '0.25rem', fontStyle: 'italic' }}>*Bila presentasi skripsi dilakukan menggunakan Bahasa Inggris, nilai akhir ditambahkan 2—6 poin.</p>

            <div style={{ marginTop: '1.5rem' }} className="avoid-break">
              <p>Hari, Tanggal: {s.hari_tanggal}</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '3rem' }}>
                <div style={{ textAlign: 'center', width: '14rem' }}>
                  {s[`ttd_penguji${examIdx + 1}` as keyof Session] ? (
                    <img src={s[`ttd_penguji${examIdx + 1}` as keyof Session] as string} alt="TTD" style={{ maxHeight: '3.5rem', maxWidth: '7rem', margin: '0 auto', objectFit: 'contain' }} />
                  ) : <div style={{ height: '3.5rem' }}></div>}
                  <p>Tanda Tangan</p>
                  <div style={{ height: '0.5rem' }}></div>
                  <p style={{ borderTop: '1px solid black', paddingTop: '0.25rem', fontWeight: 'bold' }}>{labels[examIdx]}</p>
                  <p style={{ fontSize: '0.875rem' }}>{namaPenguji[examIdx]}</p>
                  <p style={{ fontSize: '0.75rem' }}>NIP. {s[`nip_penguji${examIdx + 1}` as keyof Session] as string || ''}</p>
                </div>
              </div>
            </div>
          </div>
        )
      })}

      {/* ===== REKAPITULASI NILAI ===== */}
      <div className="page-break">
        <div style={{ textAlign: 'center', borderBottom: '2px solid black', paddingBottom: '1rem' }}>
          <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }} />
          <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', textTransform: 'uppercase', textAlign: 'center' }}>Rekapitulasi Nilai Sidang Skripsi</h1>
          <p style={{ fontSize: '0.875rem', textAlign: 'center' }}>PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
          <p style={{ fontSize: '0.875rem', textAlign: 'center' }}>FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
          <p style={{ fontSize: '0.875rem', textAlign: 'center', fontWeight: 'bold' }}>SEMESTER {s.semester} T.A. {s.ta}</p>
        </div>

        <table style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.875rem' }}>
          <tbody>
            <tr><td style={{ width: '9rem' }}>Dosen Pembimbing</td><td style={{ width: '1rem' }}>:</td><td>{s.pembimbing}</td><td style={{ width: '7rem' }}>Peminatan</td><td style={{ width: '1rem' }}>:</td><td>{s.peminatan}</td></tr>
            <tr><td>Hari, Tanggal Sidang</td><td>:</td><td>{s.hari_tanggal}</td><td>Waktu Sidang</td><td>:</td><td>{s.waktu}</td><td>Tempat Sidang</td><td>:</td><td>{s.tempat}</td></tr>
            <tr><td>Judul Skripsi</td><td>:</td><td colSpan={7}>{s.judul_skripsi}</td></tr>
          </tbody>
        </table>

        <table className="template-table" style={{ fontSize: '0.875rem', marginTop: '1rem' }}>
          <thead>
            <tr>
              <th style={{ width: '1.5rem' }}>NO</th><th>NAMA</th><th style={{ width: '4rem' }}>NIM</th>
              <th style={{ width: '3.5rem', fontSize: '0.6rem' }}>NILAI<br/>PENGUJI I<br/>(Ketua)</th><th style={{ width: '3.5rem', fontSize: '0.6rem' }}>NILAI<br/>PENGUJI II<br/>(Anggota I)</th><th style={{ width: '3.5rem', fontSize: '0.6rem' }}>NILAI<br/>PENGUJI III<br/>(Anggota II)</th>
              <th style={{ width: '4rem', fontSize: '0.6rem' }}>RERATA<br/>NILAI SIDANG<br/>SKRIPSI</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: 'center' }}>1.</td><td>{s.nama}</td><td>{s.nim}</td>
              <td style={{ textAlign: 'center' }}>{scoresByExaminer[0].nilaiAkhir > 0 ? scoresByExaminer[0].nilaiAkhir.toFixed(2) : ''}</td>
              <td style={{ textAlign: 'center' }}>{scoresByExaminer[1].nilaiAkhir > 0 ? scoresByExaminer[1].nilaiAkhir.toFixed(2) : ''}</td>
              <td style={{ textAlign: 'center' }}>{scoresByExaminer[2].nilaiAkhir > 0 ? scoresByExaminer[2].nilaiAkhir.toFixed(2) : ''}</td>
              <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{rataRata > 0 ? rataRata.toFixed(2) : ''}</td>
            </tr>
          </tbody>
        </table>

        <div style={{ marginTop: '2.5rem' }} className="avoid-break">
          <div style={{ display: 'flex', justifyContent: 'space-between', textAlign: 'center' }}>
            {[
              { label: 'Ketua Penguji', nama: s.penguji1, nip: s.nip_penguji1, ttd: s.ttd_penguji1 },
              { label: 'Anggota Penguji I', nama: s.penguji2, nip: s.nip_penguji2, ttd: s.ttd_penguji2 },
              { label: 'Anggota Penguji II', nama: s.penguji3, nip: s.nip_penguji3, ttd: s.ttd_penguji3 },
            ].map((p, i) => (
              <div key={i} style={{ width: '12rem' }}>
                <p style={{ fontSize: '0.875rem', marginBottom: '0.25rem' }}>{p.label}</p>
                {p.ttd ? <img src={p.ttd} alt="TTD" style={{ maxHeight: '3.5rem', maxWidth: '7rem', margin: '0 auto', objectFit: 'contain' }} /> : <div style={{ height: '3.5rem' }}></div>}
                <div style={{ height: '2rem' }}></div>
                <p style={{ borderTop: '1px solid black', paddingTop: '0.25rem', fontWeight: 'bold', fontSize: '0.875rem' }}>{p.nama || '....................'}</p>
                <p style={{ fontSize: '0.75rem' }}>NIP. {p.nip || '..........................'}</p>
              </div>
            ))}
          </div>
          <p style={{ textAlign: 'center', fontSize: '0.875rem', marginTop: '1rem' }}>Jakarta, {s.tanggal_ba || '______________'}</p>
        </div>
      </div>

      {/* ===== DAFTAR HADIR PENGUJI ===== */}
      <div className="page-break">
        <div style={{ textAlign: 'center', borderBottom: '2px solid black', paddingBottom: '1rem' }}>
          <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }} />
          <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Daftar Hadir Penguji Sidang Skripsi</h1>
          <p style={{ fontSize: '0.875rem' }}>PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
          <p style={{ fontSize: '0.875rem' }}>FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
          <p style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>T.A. {s.ta}</p>
        </div>
        <table style={{ width: '100%', marginTop: '0.5rem', fontSize: '0.875rem' }}>
          <tbody>
            <tr><td style={{ width: '8rem' }}>Nama Mahasiswa</td><td style={{ width: '1rem' }}>:</td><td>{s.nama}</td></tr>
            <tr><td>NIM</td><td>:</td><td>{s.nim}</td></tr>
            <tr><td>Tanggal Ujian</td><td>:</td><td>{s.hari_tanggal}</td></tr>
            <tr><td>Peminatan</td><td>:</td><td>{s.peminatan}</td></tr>
          </tbody>
        </table>
        <table className="template-table" style={{ fontSize: '0.875rem', marginTop: '1rem' }}>
          <thead>
            <tr><th style={{ width: '2rem' }}>NO</th><th style={{ width: '7rem' }}>NIP</th><th>NAMA PENGUJI</th><th>JABATAN</th><th style={{ width: '6rem' }}>TANDA TANGAN</th></tr>
          </thead>
          <tbody>
            {[
              { no: 1, nama: s.penguji1, nip: s.nip_penguji1, jabatan: 'Ketua Penguji', ttd: s.ttd_penguji1 },
              { no: 2, nama: s.penguji2, nip: s.nip_penguji2, jabatan: 'Anggota Penguji I', ttd: s.ttd_penguji2 },
              { no: 3, nama: s.penguji3, nip: s.nip_penguji3, jabatan: 'Anggota Penguji II', ttd: s.ttd_penguji3 },
            ].map((p) => (
              <tr key={p.no}>
                <td style={{ textAlign: 'center' }}>{p.no}.</td>
                <td>{p.nip || ''}</td>
                <td>{p.nama || ''}</td>
                <td>{p.jabatan}</td>
                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>{p.ttd ? <img src={p.ttd} alt="TTD" style={{ maxHeight: '3rem', maxWidth: '6rem', margin: '0 auto', objectFit: 'contain' }} /> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== DAFTAR HADIR PESERTA ===== */}
      <div className="page-break">
        <div style={{ textAlign: 'center', borderBottom: '2px solid black', paddingBottom: '1rem' }}>
          <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }} />
          <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Daftar Hadir Peserta Sidang Skripsi</h1>
          <p style={{ fontSize: '0.875rem' }}>PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
          <p style={{ fontSize: '0.875rem' }}>FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
          <p style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>SEMESTER {s.semester} T.A. {s.ta}</p>
        </div>
        <table className="template-table" style={{ fontSize: '0.875rem', marginTop: '1rem' }}>
          <thead>
            <tr><th style={{ width: '2rem' }}>NO</th><th>NAMA PESERTA</th><th style={{ width: '6rem' }}>NIM</th><th style={{ width: '6rem' }}>TANDA TANGAN</th><th style={{ width: '4rem' }}>KET</th></tr>
          </thead>
          <tbody>
            {(s.peserta_hadir || []).map((p, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center' }}>{i + 1}.</td>
                <td>{p.nama}</td>
                <td>{p.nim}</td>
                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>{p.ttd ? <img src={p.ttd} alt="TTD" style={{ maxHeight: '3rem', maxWidth: '6rem', margin: '0 auto', objectFit: 'contain' }} /> : ''}</td>
                <td style={{ textAlign: 'center' }}></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ===== DAFTAR HADIR AUDIENS ===== */}
      <div className="page-break">
        <div style={{ textAlign: 'center', borderBottom: '2px solid black', paddingBottom: '1rem' }}>
          <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" style={{ display: 'block', margin: '0 auto 0.5rem', maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }} />
          <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold', textTransform: 'uppercase' }}>Daftar Hadir Mahasiswa Sebagai Audiens Sidang Skripsi</h1>
          <p style={{ fontSize: '0.875rem' }}>PROGRAM STUDI KESEHATAN MASYARAKAT PROGRAM SARJANA</p>
          <p style={{ fontSize: '0.875rem' }}>FAKULTAS ILMU KESEHATAN UPN &ldquo;VETERAN&rdquo; JAKARTA</p>
          <p style={{ fontSize: '0.875rem', fontWeight: 'bold' }}>SEMESTER {s.semester} T.A. {s.ta}</p>
        </div>
        <table className="template-table" style={{ fontSize: '0.875rem', marginTop: '1rem' }}>
          <thead>
            <tr><th style={{ width: '2rem' }}>NO</th><th>NAMA MAHASISWA</th><th style={{ width: '6rem' }}>NIM</th><th style={{ width: '6rem' }}>TANDA TANGAN</th><th style={{ width: '4rem' }}>KET</th></tr>
          </thead>
          <tbody>
            {(s.audience_hadir || []).map((a, i) => (
              <tr key={i}>
                <td style={{ textAlign: 'center' }}>{i + 1}.</td>
                <td>{a.nama}</td>
                <td>{a.nim}</td>
                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>{a.ttd ? <img src={a.ttd} alt="TTD" style={{ maxHeight: '3rem', maxWidth: '6rem', margin: '0 auto', objectFit: 'contain' }} /> : ''}</td>
                <td style={{ textAlign: 'center' }}></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
    </body>
    </html>
  )
}
