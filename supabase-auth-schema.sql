-- ============================================================
-- Supabase Auth Schema for Sistem Informasi Sidang Skripsi
-- Run this in Supabase SQL Editor
-- ============================================================

-- MIGRATION: Add superadmin role (run once if table already exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname LIKE '%profiles_role_check%') THEN
    ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
    ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (role IN ('dosen', 'mahasiswa', 'superadmin'));
  END IF;
END $$;

-- 1. Profiles table (linked to auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  email TEXT,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'mahasiswa' CHECK (role IN ('dosen', 'mahasiswa', 'superadmin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

-- Users can insert their own profile (needed for upsert from client)
CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 2. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    'mahasiswa'
  );
  RETURN NEW;
END;
$$;

-- Drop trigger if exists, then recreate
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- 3. RLS for sessions table
-- Enable RLS on sessions (if not already)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Dosen can read all sessions
CREATE POLICY "Dosen can read all sessions"
  ON sessions FOR SELECT
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'dosen'
    OR
    auth.uid() IS NOT NULL
  );

-- Mahasiswa can only read sessions (read-only access)
CREATE POLICY "Authenticated users can read sessions"
  ON sessions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Public (unauthenticated) can read sessions for attendance
CREATE POLICY "Public can read sessions for attendance"
  ON sessions FOR SELECT
  USING (auth.uid() IS NULL);

-- Only dosen can insert/update/delete sessions
CREATE POLICY "Dosen can insert sessions"
  ON sessions FOR INSERT
  WITH CHECK (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'dosen'
  );

CREATE POLICY "Dosen can update sessions"
  ON sessions FOR UPDATE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'dosen'
  );

CREATE POLICY "Dosen can delete sessions"
  ON sessions FOR DELETE
  USING (
    (SELECT role FROM profiles WHERE id = auth.uid()) = 'dosen'
  );

-- Public (unauthenticated) can update attendance for sessions
CREATE POLICY "Public can update attendance for sessions"
  ON sessions FOR UPDATE
  USING (auth.uid() IS NULL);
