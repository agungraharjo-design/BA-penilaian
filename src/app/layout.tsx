import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sistem Berita Acara & Penilaian Sidang Skripsi',
  description: 'PSKMPS - FIKES UPN Veteran Jakarta',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body className="bg-gray-100 text-black">
        <nav className="no-print bg-blue-900 text-white px-6 py-3 shadow-md flex items-center justify-between">
          <a href="/" className="text-lg font-bold font-sans tracking-tight">
            ⚖️ BA Sidang Skripsi
          </a>
          <span className="text-xs text-blue-200 font-sans">
            PSKMPS FIKES UPN Veteran Jakarta
          </span>
        </nav>
        <main className="min-h-screen">{children}</main>
      </body>
    </html>
  )
}
