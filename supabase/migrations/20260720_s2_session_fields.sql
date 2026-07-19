-- ============================================================
-- S2_SESSIONS additional fields (mirror S1 BA layout)
-- Run in Supabase SQL Editor of project rvfyljuuchmuynbkqczp
-- ============================================================

alter table public.s2_sessions
  add column if not exists hari_tanggal text not null default '',
  add column if not exists ta text not null default '',
  add column if not exists tanggal_ba text not null default '',
  add column if not exists koordinator text not null default 'Dr. Apriningsih, S.K.M., M.K.M.',
  add column if not exists nip_koordinator text not null default '197604102021212009',
  add column if not exists koordinator_signature_path text;
