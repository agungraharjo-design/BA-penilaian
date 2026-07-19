'use client'

import { useAuth } from './AuthProvider'

export default function NavBar() {
  const { user, profile, signOut } = useAuth()

  const isDosen = profile?.role === 'dosen' || profile?.role === 'superadmin'
  const isSuperadmin = profile?.role === 'superadmin'

  if (!user || !profile) return null

  return (
    <nav className="no-print bg-blue-900 text-white px-6 py-3 shadow-md flex items-center justify-between">
      <div className="flex items-center gap-4">
        <a href="/program" className="text-lg font-bold font-sans tracking-tight hover:text-blue-200">
          BA Sidang
        </a>
        <div className="flex items-center gap-1 text-sm font-sans">
          <a href="/" className="px-2 py-1 rounded hover:bg-blue-800">S1 Skripsi</a>
          {isDosen && (
            <a href="/s2/sessions" className="px-2 py-1 rounded hover:bg-blue-800">S2 Tesis</a>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-xs text-blue-200 font-sans">
          {profile?.full_name || user.email}
          <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase ${isSuperadmin ? 'bg-purple-700 text-purple-100' : 'bg-blue-700 text-blue-100'}`}>
            {isSuperadmin ? 'Superadmin' : isDosen ? 'Dosen' : 'Mahasiswa'}
          </span>
        </span>
        <button
          onClick={signOut}
          className="text-xs text-blue-200 hover:text-white underline font-sans"
        >
          Logout
        </button>
      </div>
    </nav>
  )
}
