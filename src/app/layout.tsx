import type { Metadata } from 'next'
import './globals.css'
import AuthProvider from '@/app/components/AuthProvider'
import NavBar from '@/app/components/NavBar'

export const metadata: Metadata = {
  title: 'Sistem Berita Acara & Penilaian Sidang Skripsi',
  description: 'PSKMPS - FIKES UPN Veteran Jakarta',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-gray-100 text-black">
        <AuthProvider>
          <NavBar />
          <main className="min-h-screen">{children}</main>
        </AuthProvider>
      </body>
    </html>
  )
}
