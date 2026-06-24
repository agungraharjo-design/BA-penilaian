'use client'

import { useAuth } from './AuthProvider'

export default function NavBar() {
  const { user, profile, signOut } = useAuth()

  const isDosen = profile?.role === 'dosen'

  if (!user || !profile) return null

  return (
    <nav className="no-print bg-blue-900 text-white px-6 py-3 shadow-md flex items-center justify-between">
      <a href="/" className="text-lg font-bold font-sans tracking-tight">
        BA Sidang Skripsi
      </a>
      <div className="flex items-center gap-4">
        <span className="text-xs text-blue-200 font-sans">
          {profile?.full_name || user.email}
          <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-700 text-blue-100">
            {isDosen ? 'Dosen' : 'Mahasiswa'}
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
