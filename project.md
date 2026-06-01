# Sistem Berita Acara & Penilaian Sidang Skripsi

A **Next.js 14** single-page web application for managing thesis defense minutes ("Berita Acara") and assessment forms, built for **PSKMPS FIKES UPN Veteran Jakarta**. Features real-time sync via **Supabase**, client-side **PDF generation**, and **signature image upload**.

---

## Tech Stack

| Layer        | Technology                                                   |
| ------------ | ------------------------------------------------------------ |
| Framework    | Next.js 14 (App Router)                                      |
| Language     | TypeScript                                                   |
| Styling      | Tailwind CSS                                                 |
| Database     | Supabase (PostgreSQL)                                        |
| Real-time    | Supabase Realtime (`postgres_changes`)                       |
| PDF (Print)  | Browser `@media print` CSS                                   |
| PDF (Download)| `html2canvas` + `jsPDF`                                     |
| Signature    | Base64 via `<canvas>` resize (400px PNG)                     |
| Auth         | Supabase anon key (public, no login required)                |

---

## Project Structure

```
skripsi-ba-system/
├── public/
│   └── kop-surat-resize.png         # Kop surat image (user-provided, resized)
├── src/
│   ├── app/
│   │   ├── globals.css              # Print CSS, @page margins, .page-break
│   │   ├── layout.tsx               # Root layout (nav bar + main)
│   │   ├── page.tsx                 # Home page (list/create sessions)
│   │   └── session/
│   │       └── [id]/
│   │           └── page.tsx         # Single 1000+ line file containing:
│   │                                  - SessionPage (tabs + auto-save)
│   │                                  - SignatureUpload (component)
│   │                                  - BeritaAcaraForm
│   │                                  - PenilaianForm
│   │                                  - RekapNilaiForm
│   │                                  - DaftarHadirForm
│   │                                  - PreviewAll (print + PDF download)
│   ├── lib/
│   │   ├── supabase.ts              # Supabase client + realtime subscription
│   │   └── utils.ts                 # Grade calc, ID gen, date formatting
│   └── types/
│       └── index.ts                 # All TypeScript interfaces + RUBRIC_CRITERIA
├── supabase-schema.sql              # Reference SQL (sessions table schema)
├── package.json
└── project.md                       # This file
```

---

## Database Schema (Supabase `sessions` table)

All form data lives in a single wide table. Each row = one thesis defense session.

| Column            | Type                      | Notes                               |
| ----------------- | ------------------------- | ----------------------------------- |
| `id`              | `uuid` PK                 | Client-generated via `crypto.randomUUID()` |
| `nama`            | `text`                    | Student name                        |
| `nim`             | `text`                    | Student ID                          |
| `judul_skripsi`   | `text`                    | Thesis title                        |
| `pembimbing`      | `text`                    | Advisor name                        |
| `hari_tanggal`    | `text`                    | Day, date of defense                |
| `waktu`           | `text`                    | Time                                |
| `tempat`          | `text`                    | Room/location                       |
| `semester`        | `text`                    | Editable semester field             |
| `ta`              | `text`                    | Editable academic year field        |
| `penguji1/2/3`    | `text`                    | Examiner names                      |
| `decision`        | `text`                    | `lulus_perbaikan` or `tidak_lulus_ulang` |
| `catatan`         | `text`                    | Notes                               |
| `dekan`           | `text`                    | Dean name                           |
| `nip_dekan`       | `text`                    | Dean NIP                            |
| `tanggal_ba`      | `text`                    | Date for BA signature               |
| `skor_penguji`    | `jsonb`                   | `[[s1..s10], [s1..s10], [s1..s10]]` |
| `rekap_entries`   | `jsonb`                   | Array of `{nama, nim, ...}`         |
| `peserta_hadir`   | `jsonb`                   | Attendance list (peserta)           |
| `audience_hadir`  | `jsonb`                   | Attendance list (audience)          |
| `ttd_penguji1/2/3`| `text`                    | Base64 PNG signature images         |
| `ttd_dekan`       | `text`                    | Base64 PNG dean signature           |
| `pdf_url`         | `text`                    | Public URL of saved PDF in Storage  |
| `created_at`      | `timestamptz`             | Auto-set                            |
| `updated_at`      | `timestamptz`             | Updated on each upsert              |

### SQL to create table

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY,
  nama TEXT NOT NULL,
  nim TEXT NOT NULL,
  judul_skripsi TEXT DEFAULT '',
  pembimbing TEXT DEFAULT '',
  hari_tanggal TEXT DEFAULT '',
  waktu TEXT DEFAULT '',
  tempat TEXT DEFAULT '',
  semester TEXT DEFAULT '',
  ta TEXT DEFAULT '',
  penguji1 TEXT DEFAULT '',
  penguji2 TEXT DEFAULT '',
  penguji3 TEXT DEFAULT '',
  decision TEXT DEFAULT 'lulus_perbaikan',
  catatan TEXT DEFAULT '',
  dekan TEXT DEFAULT '',
  nip_dekan TEXT DEFAULT '',
  tanggal_ba TEXT DEFAULT '',
  skor_penguji JSONB DEFAULT '[[null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null]]',
  rekap_entries JSONB DEFAULT '[]',
  peserta_hadir JSONB DEFAULT '[]',
  audience_hadir JSONB DEFAULT '[]',
  ttd_penguji1 TEXT,
  ttd_penguji2 TEXT,
  ttd_penguji3 TEXT,
  ttd_dekan TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## Key Architecture Decisions

### 1. Single-file page for session forms
All 7 tab components + Preview live in a single `src/app/session/[id]/page.tsx` (~1000 lines). This avoids prop-drilling complexity across files. Each form component receives `session` + `onUpdate` props.

### 2. Client-side PDF via html2canvas + jsPDF
- **Print** (`window.print()`): Uses CSS `@page` rules for margins, `.page-break` for page breaks, `.avoid-break` for orphans.
- **Download**: Clones the preview content, splits at each `.page-break` section, renders each section as an A4-sized canvas, assembles into a multi-page PDF.
- **Image compression**: `html2canvas scale: 1.5`, `canvas.toDataURL('image/jpeg', 0.7)` to keep file size under storage limits.

### 3. Single-table design
All data (student info, scores, rubrics, signatures, attendance) is stored in one `sessions` row. Upserts use `id` equality. This simplifies the data layer at the cost of large JSON columns.

### 4. Real-time sync
A Supabase Realtime subscription watches `postgres_changes` on the `sessions` table. Auto-save debounces at 800ms. The sync indicator shows green (saved), yellow (saving), or red (offline).

### 5. Signature images stored as base64
The `SignatureUpload` component reads a file, resizes it on a canvas (max 400px wide), and stores as base64 PNG in the row. Supabase Storage could be used instead if base64 grows too large.

---

## Rubric Criteria

Defined in `src/types/index.ts` as `RUBRIC_CRITERIA` array — 10 criteria with `no`, `label`, `bobot` (weight), and `detail` (sub-criteria text). The `detail` field is displayed below the label in assessment tables.

| No | Criterion              | Weight |
| -- | ---------------------- | ------ |
| 1  | Abstrak                | 6      |
| 2  | Tema dan Judul         | 8      |
| 3  | Pendahuluan            | 8      |
| 4  | Tinjauan Pustaka       | 10     |
| 5  | Metode Penelitian      | 15     |
| 6  | Hasil & Pembahasan     | 20     |
| 7  | Penutup                | 8      |
| 8  | Daftar Pustaka         | 5      |
| 9  | Lampiran               | 5      |
| 10 | Presentasi & Responsi  | 15     |

Final score formula: `(∑(skor × bobot) / 400) × 100`

---

## PDF Generation Details

### CSS (@media print)
- `@page { size: A4; margin: 5mm 30mm 25mm; }` — top 5mm, sides 30mm, bottom 25mm
- `.page-break { page-break-before: always; break-before: page; }`
- `.avoid-break { page-break-inside: avoid; }` on signature blocks
- `orphans: 3; widows: 3` to prevent orphaned lines

### Download PDF flow
1. Clone the preview content
2. Split children at each `.page-break` element → creates individual sections (BA, Penilaian×3, Rekap)
3. For each section, render in an offscreen A4-sized container (`width: 210mm`, `padding: 5mm 30mm 25mm`)
4. Capture with `html2canvas (scale: 1.5, JPEG 0.7)`
5. Add to jsPDF as a new page (multi-page sections tile the canvas)

---

## Pages & Routes

| Route               | Component        | Description                          |
| ------------------- | ---------------- | ------------------------------------ |
| `/`                 | `Home`           | List all sessions, create new        |
| `/session/[id]`     | `SessionPage`    | 7-tab form interface + Preview       |

### Tabs
1. **Berita Acara** — Minutes, decision, examiner table, dekan signature
2. **Penilaian Penguji I/II/III** — Rubric scoring (skor 1-4) per examiner
3. **Rekapitulasi Nilai** — Aggregated scores + grades
4. **Daftar Hadir** — Participant + audience attendance tables
5. **Preview & PDF** — WYSIWYG print preview + Cetak/Download buttons

---

## Signature Upload

The `SignatureUpload` component allows uploading signature images for:
- Each penguji (in Tim Penguji table of BA, Penilaian, and Rekap forms)
- Dekan (in BA and Rekap forms)

**Storage flow:**
1. User selects image file
2. Loaded into `<canvas>`, resized to max 400px wide
3. Exported as base64 PNG
4. Stored in the `sessions` table via auto-save
5. Rendered as `<img>` in the Preview/PDF output

**DB columns:** `ttd_penguji1`, `ttd_penguji2`, `ttd_penguji3`, `ttd_dekan` (all `TEXT`, nullable)

---

## Self-Service Checklist (for copy-pasting this project)

### 1. Initial Setup
```bash
npx create-next-app@14 my-project --typescript --tailwind --eslint
cd my-project
npm install @supabase/supabase-js html2canvas jspdf
```

### 2. Supabase Setup
- Create a Supabase project
- In **SQL Editor**, run the `CREATE TABLE sessions (...)` SQL from above
- In **Project Settings > API**, copy URL and anon key
- Create `.env.local`:
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
  ```

### 3. Create the required files
- `src/types/index.ts` — Session interface, RUBRIC_CRITERIA
- `src/lib/supabase.ts` — Supabase client (with build-time mock)
- `src/lib/utils.ts` — Grade calc, ID gen
- `src/app/globals.css` — Print CSS, @page rules
- `src/app/layout.tsx` — Root layout
- `src/app/page.tsx` — Home page
- `src/app/session/[id]/page.tsx` — Main form (heaviest file)
- `public/kop-surat-resize.png` — Your institution's letterhead image

### 4. For PDF Storage (optional)
- In **Supabase Storage**, create bucket `pdf-archive` (public)
- In **SQL Editor**, run:
  ```sql
  CREATE POLICY "public upload pdfs" ON storage.objects
    FOR INSERT TO public WITH CHECK (bucket_id = 'pdf-archive');
  CREATE POLICY "public select pdfs" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'pdf-archive');
  ```
- Add `pdf_url TEXT` column to `sessions` table

### 5. Deploy to Vercel
- Push to GitHub
- Import repo in Vercel
- Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` as environment variables
- Deploy

---

## Troubleshooting

| Problem                          | Likely Fix                                    |
| -------------------------------- | --------------------------------------------- |
| Build fails on Vercel            | Remove `@next/swc-win32-x64-msvc` from lock if present (platform-specific dep) |
| Supabase upsert returns 400      | Check that all column names match DB exactly (snake_case) |
| Signature upload → offline       | Image too large → client-side resize kicks in (max 400px PNG) |
| PDF download fails / too large   | Lower `html2canvas scale` or increase JPEG compression |
| PDF upload → "exceeded max size" | Supabase Storage free tier file size limit → compress images (scale 1.5, JPEG 0.7) |
| Print preview margins wrong      | Adjust `@page { margin: ... }` in `globals.css` |
| Kop surat stretched              | Use `max-width: 100%; max-height: 100px; width: auto; height: auto` — no `w-full` |

---

## Conventions (for code reuse)

- **All form fields use snake_case** to match Supabase column names directly
- **No ORM** — raw Supabase REST calls with TypeScript casting
- **Single-file tab forms** — each tab is a function component in the same file
- **Auto-save** via debounced `upsert` (800ms)
- **Editable fields** are plain `<input>` with `onChange → onUpdate({...session, field: value})`
- **Rubric table** is generated by mapping over `RUBRIC_CRITERIA`
- **Preview** wraps all sections in a `ref` div, uses CSS print rules for browser print, and html2canvas for download
