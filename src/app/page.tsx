'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/app/components/AuthProvider'

// The old home page listed sidang skripsi sessions directly. All modules now
// live behind the program selector menu, so "/" leads there once the profile
// is ready (redirecting earlier races the program page's auth guard).
export default function Home() {
  const router = useRouter()
  const { profile, loading } = useAuth()
  useEffect(() => {
    if (!loading && profile) router.replace('/program')
  }, [loading, profile, router])
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <p className="text-gray-500 font-serif text-lg">Mengalihkan ke pilih program...</p>
    </div>
  )
}
