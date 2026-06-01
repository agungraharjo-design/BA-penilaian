# Sistem Informasi Berita Acara & Penilaian Sidang Skripsi

A real-time collaborative web application for managing Indonesian thesis defense 
minutes (Berita Acara) and assessment forms (Form Penilaian), specifically designed 
for **Program Studi Kesehatan Masyarakat Program Sarjana, FIKES UPN "Veteran" Jakarta**.

## Features

- **Berita Acara Sidang Skripsi** — Minutes of thesis defense with committee details and decision
- **Formulir Penilaian (3 Examiners)** — Detailed rubric-based scoring (10 criteria, weights 6-20)  
- **Rekapitulasi Nilai** — Automatic score aggregation and grade calculation
- **Daftar Hadir Peserta & Audiens** — Attendance tracking for participants and audience
- **Real-time Sync** — All changes are instantly synced across users via Supabase Realtime
- **PDF Export** — Download or print documents preserving the exact template format
- **Auto-save** — Changes are automatically saved with debounce

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Realtime | Supabase Realtime |
| PDF | html2canvas + jsPDF (client-side) |
| Hosting | Vercel (free tier) |

## Free Tier Architecture

```
GitHub (source) → Vercel (hosting) → Supabase (DB + realtime)
                        ↓
              PDF generated client-side
              (no server needed)
```

- **Vercel Free**: 100GB bandwidth, 6000 build minutes/month
- **Supabase Free**: 500MB database, 1GB file storage, 50MB realtime
- **GitHub Free**: Unlimited private repos

## Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/your-username/skripsi-ba-system.git
cd skripsi-ba-system
npm install
```

### 2. Set Up Supabase

1. Create a free account at https://supabase.com
2. Create a new project (free tier)
3. Go to SQL Editor and run the contents of `supabase-schema.sql`
4. Go to Project Settings > API and copy your URL and anon key
5. Go to Replication and ensure the `sessions` table is included in the `supabase_realtime` publication (the schema script does this automatically)

### 3. Configure Environment

Create `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 4. Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

### 5. Deploy to Vercel (Free)

```bash
npm i -g vercel
vercel
```

Or connect your GitHub repo to Vercel:
1. Push to GitHub
2. Import repo at https://vercel.com/new
3. Add environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
4. Deploy

## Usage

1. **Create a session** — Enter student name and NIM
2. **Fill Berita Acara** — Thesis title, examiners, decision, notes
3. **Fill Penilaian** — Each examiner enters scores (1-4) for 10 criteria; totals auto-calculate
4. **Rekapitulasi Nilai** — Scores auto-populate from penilaian forms
5. **Daftar Hadir** — Track attendance
6. **Preview & PDF** — View all documents together, print or download as PDF

## Real-time Collaboration

Multiple users can fill out the same session simultaneously. Changes from any user 
are broadcast to all other viewers in real-time via Supabase Realtime. A green/yellow/red 
indicator in the bottom-right shows the sync status.

## Template Structure (from DOCX)

The application faithfully reproduces the official UPN "Veteran" Jakarta template:

- **Berita Acara**: 1 page — student info, thesis title, decision, examiner table, dean signature
- **Form Penilaian**: 3 pages (one per examiner) — 10 scoring criteria with weights totaling 100
- **Rekapitulasi Nilai**: 1 page — aggregated scores with average
- **Daftar Hadir Peserta**: 1 page — participant attendance
- **Daftar Hadir Audiens**: 1+ pages — audience attendance

### Rubric Criteria

| No | Criteria | Weight |
|----|----------|--------|
| 1 | Abstrak | 6 |
| 2 | Tema dan Judul | 8 |
| 3 | Pendahuluan | 8 |
| 4 | Tinjauan Pustaka | 10 |
| 5 | Metode Penelitian | 15 |
| 6 | Hasil Penelitian dan Pembahasan | 20 |
| 7 | Penutup | 8 |
| 8 | Daftar Pustaka | 5 |
| 9 | Lampiran | 5 |
| 10 | Presentasi dan Responsi | 15 |
| **Total** | | **100** |

Score: 1—4 per criterion.  
Final = (Total Skor × Bobot) / 400 × 100

## Project Structure

```
skripsi-ba-system/
├── src/
│   ├── app/
│   │   ├── layout.tsx          # Root layout with nav
│   │   ├── page.tsx            # Home page (session list)
│   │   ├── globals.css         # Global styles + print styles
│   │   └── session/[id]/
│   │       └── page.tsx        # Main session workspace
│   ├── lib/
│   │   ├── supabase.ts         # Supabase client + realtime
│   │   └── utils.ts            # Grade calc utils
│   └── types/
│       └── index.ts            # TypeScript types
├── supabase-schema.sql         # Database schema
├── .env.local.example          # Environment template
├── package.json
├── next.config.js
├── tailwind.config.ts
└── README.md
```

## Cost Breakdown (Free Tier)

| Service | Free Tier Includes | Paid Upgrade |
|---------|-------------------|--------------|
| Vercel | 100GB bandwidth, 6000 build min/mo | Pro $20/mo |
| Supabase | 500MB DB, 1GB storage, 50MB realtime | Pro $25/mo |
| GitHub | Unlimited private repos | Free |
| **Total** | **$0/mo** | ~$45/mo |

## License

MIT
