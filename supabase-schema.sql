-- Supabase SQL Schema for Skripsi BA System
-- Run this in Supabase SQL Editor to set up your database

-- Create the sessions table
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  nama TEXT NOT NULL,
  nim TEXT NOT NULL,
  peminatan TEXT DEFAULT '',
  judul_skripsi TEXT DEFAULT '',
  pembimbing TEXT DEFAULT '',
  hari_tanggal TEXT DEFAULT '',
  waktu TEXT DEFAULT '09.00',
  tempat TEXT DEFAULT '305 Gedung A',
  semester TEXT DEFAULT 'Genap',
  ta TEXT DEFAULT '2025/2026',
  penguji1 TEXT DEFAULT '',
  penguji2 TEXT DEFAULT '',
  penguji3 TEXT DEFAULT '',
  decision TEXT DEFAULT 'lulus_perbaikan',
  catatan TEXT DEFAULT '',
  koordinator TEXT DEFAULT 'Dr. Suparni, S.T., MKKK.',
  nip_koordinator TEXT DEFAULT '197705072024212008',
  tanggal_ba TEXT DEFAULT '',
  skor_penguji JSONB DEFAULT '[[null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null],[null,null,null,null,null,null,null,null,null,null]]',
  rekap_entries JSONB DEFAULT '[]',
  peserta_hadir JSONB DEFAULT '[]',
  audience_hadir JSONB DEFAULT '[]',
  ttd_penguji1 TEXT,
  ttd_penguji2 TEXT,
  ttd_penguji3 TEXT,
  ttd_koordinator TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security (optional for free tier, can be disabled)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anon key (for simplicity on free tier)
-- In production, you should restrict this
CREATE POLICY "Allow all on sessions" ON sessions
  FOR ALL USING (true) WITH CHECK (true);

-- Enable Realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE sessions;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);
