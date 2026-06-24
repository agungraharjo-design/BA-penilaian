'use client'

import { createClient } from '@/lib/supabase/client'
import { isDosenEmail } from '@/lib/dosen'
import { useRouter } from 'next/navigation'
import { useEffect, useState, createContext, useContext } from 'react'

interface User { id: string; email?: string; user_metadata?: { full_name?: string }; aud?: string }

export interface UserProfile {
  id: string
  email: string
  full_name: string
  role: 'dosen' | 'mahasiswa'
}

interface AuthContextType {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  isDosen: boolean
  signInWithGoogle: () => Promise<void>
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isDosen: false,
  signInWithGoogle: async () => {},
  signIn: async () => null,
  signOut: async () => {},
})

export const useAuth = () => useContext(AuthContext)

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = (supabase.auth as any).onAuthStateChange(async (event: string, session: any) => {
      const currentUser = session?.user ?? null
      setUser(currentUser)
      if (currentUser) {
        await loadProfile(currentUser)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(u: User) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', u.id)
      .single()
    if (data) {
      setProfile(data as UserProfile)
    } else {
      const check = isDosenEmail(u.email || '')
      const newProfile = {
        id: u.id,
        email: u.email,
        full_name: u.user_metadata?.full_name || u.email?.split('@')[0] || '',
        role: check.isDosen ? 'dosen' : 'mahasiswa',
      } as UserProfile
      const { data: inserted } = await supabase
        .from('profiles')
        .upsert(newProfile)
        .select()
        .single()
      if (inserted) setProfile(inserted as UserProfile)
    }
  }

  async function signInWithGoogle() {
    setAuthLoading(true)
    const { error } = await (supabase.auth as any).signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
    if (error) {
      setAuthError(error.message)
      setAuthLoading(false)
    }
  }

  async function signIn(email: string, password: string): Promise<string | null> {
    setAuthLoading(true)
    setAuthError('')
    const { error } = await (supabase.auth as any).signInWithPassword({ email, password })
    setAuthLoading(false)
    if (error) {
      setAuthError(error.message)
      return error.message
    }
    router.refresh()
    return null
  }

  async function signOut() {
    await (supabase.auth as any).signOut()
    setUser(null)
    setProfile(null)
    router.refresh()
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <p className="text-gray-500 font-serif text-lg">Memuat...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="w-full max-w-md bg-white rounded-lg shadow-md p-8">
          <div className="text-center mb-6">
            <img src="/kop-surat-resize.png" alt="KOP UPN Veteran Jakarta" className="mx-auto max-h-16 mb-3" />
            <h1 className="text-xl font-bold font-serif">Sistem Informasi Berita Acara & Penilaian Sidang Skripsi</h1>
            <p className="text-sm text-gray-600 mt-1">PSKMPS FIKES UPN Veteran Jakarta</p>
            <p className="text-xs text-gray-400 mt-2">Khusus Dosen — Mahasiswa gunakan link Daftar Hadir yang diberikan dosen.</p>
          </div>

          <h2 className="text-lg font-semibold text-center mb-4 font-serif">Login Dosen</h2>

          <button
            onClick={signInWithGoogle}
            disabled={authLoading}
            className="w-full flex items-center justify-center gap-3 bg-white border-2 border-gray-300 text-gray-800 px-4 py-2.5 rounded-lg hover:bg-gray-50 font-sans font-medium disabled:opacity-50 mb-4"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {authLoading ? 'Memproses...' : 'Masuk dengan Google'}
          </button>

          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300"></div></div>
            <div className="relative flex justify-center text-sm"><span className="bg-white px-2 text-gray-500">atau</span></div>
          </div>

          <form onSubmit={async (e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            await signIn(fd.get('email') as string, fd.get('password') as string)
          }}>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input name="email" type="email" required className="w-full border border-gray-300 rounded px-3 py-2 font-serif" placeholder="email@upnvj.ac.id" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Password</label>
                <input name="password" type="password" required className="w-full border border-gray-300 rounded px-3 py-2 font-serif" />
              </div>
              {authError && <p className="text-sm text-red-600 text-center">{authError}</p>}
              <button type="submit" disabled={authLoading} className="w-full bg-blue-900 text-white px-4 py-2 rounded hover:bg-blue-800 font-sans font-medium disabled:opacity-50">
                {authLoading ? 'Memproses...' : 'Login'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      loading: false,
      isDosen: profile?.role === 'dosen',
      signInWithGoogle,
      signIn,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
