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
  isMahasiswa: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string, fullName: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  isDosen: false,
  isMahasiswa: false,
  signIn: async () => null,
  signUp: async () => null,
  signOut: async () => {},
})

export const useAuth = () => useContext(AuthContext)

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [authView, setAuthView] = useState<'login' | 'register'>('login')
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
      // If no profile yet (e.g. just registered), create one now
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

  async function signUp(email: string, password: string, fullName: string): Promise<string | null> {
    setAuthLoading(true)
    setAuthError('')
    const { error } = await (supabase.auth as any).signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    })
    setAuthLoading(false)
    if (error) {
      setAuthError(error.message)
      return error.message
    }
    // After signup, the onAuthStateChange will fire and create profile
    setAuthView('login')
    setAuthError('Akun berhasil dibuat. Silakan login.')
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
          </div>

          {authView === 'login' ? (
            <>
              <h2 className="text-lg font-semibold text-center mb-4 font-serif">Login</h2>
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
              <p className="text-center text-sm mt-4 text-gray-600">
                Belum punya akun?{' '}
                <button onClick={() => { setAuthError(''); setAuthView('register') }} className="text-blue-700 underline">
                  Daftar
                </button>
              </p>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-center mb-4 font-serif">Daftar Akun</h2>
              <form onSubmit={async (e) => {
                e.preventDefault()
                const fd = new FormData(e.currentTarget)
                await signUp(fd.get('email') as string, fd.get('password') as string, fd.get('fullName') as string)
              }}>
                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium mb-1">Nama Lengkap</label>
                    <input name="fullName" required className="w-full border border-gray-300 rounded px-3 py-2 font-serif" placeholder="Nama lengkap" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Email</label>
                    <input name="email" type="email" required className="w-full border border-gray-300 rounded px-3 py-2 font-serif" placeholder="email@upnvj.ac.id" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Password</label>
                    <input name="password" type="password" required minLength={6} className="w-full border border-gray-300 rounded px-3 py-2 font-serif" />
                  </div>
                  <p className="text-xs text-gray-500">Dosen: gunakan email UPNVJ yang terdaftar. Mahasiswa: daftar dengan email apa saja.</p>
                  {authError && <p className={`text-sm text-center ${authError.includes('berhasil') ? 'text-green-600' : 'text-red-600'}`}>{authError}</p>}
                  <button type="submit" disabled={authLoading} className="w-full bg-blue-900 text-white px-4 py-2 rounded hover:bg-blue-800 font-sans font-medium disabled:opacity-50">
                    {authLoading ? 'Memproses...' : 'Daftar'}
                  </button>
                </div>
              </form>
              <p className="text-center text-sm mt-4 text-gray-600">
                Sudah punya akun?{' '}
                <button onClick={() => { setAuthError(''); setAuthView('login') }} className="text-blue-700 underline">
                  Login
                </button>
              </p>
            </>
          )}
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
      isMahasiswa: profile?.role === 'mahasiswa',
      signIn,
      signUp,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}
