'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/app/components/AuthProvider';
import { isDosenEmail } from '@/lib/dosen';

export default function ProgramPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, loading } = useAuth();

  const from = searchParams.get('from') || '/program';
  const isDosen = profile && isDosenEmail(profile.email);
  const isSuperadmin = profile?.role === 'superadmin';

  // Redirect authenticated users
  useEffect(() => {
    if (!loading && profile) {
      if (isDosen) {
        router.push('/s2/sessions');
      } else {
        router.push('/session');
      }
    }
  }, [loading, profile, isDosen, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center font-serif text-lg text-gray-600">
          Memuat...
        </div>
      </div>
    );
  }

  if (!profile) {
    router.push(`/login?from=${encodeURIComponent(from)}`);
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="text-center mb-10">
          <img
            src="/kop-surat-resize.png"
            alt="KOP UPN Veteran Jakarta"
            className="mx-auto mb-4"
            style={{ maxWidth: '100%', maxHeight: '100px', width: 'auto', height: 'auto' }}
          />
          <h1 className="text-3xl font-bold uppercase text-gray-900 font-serif">
            Sistem Informasi Sidang
          </h1>
          <p className="text-gray-600 mt-2 font-serif">
            Fakultas Ilmu Kesehatan UPN &ldquo;Veteran&rdquo; Jakarta
          </p>
        </div>

        {/* Program Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* S1 Card */}
          <Link
            href="/session"
            className="group block bg-white rounded-xl shadow-lg p-8 border border-gray-200 hover:shadow-xl hover:border-blue-300 transition-all duration-300"
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-14 h-14 bg-blue-100 rounded-xl flex items-center justify-center group-hover:bg-blue-900 group-hover:text-white transition-colors">
                <svg className="w-7 h-7 text-blue-700 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 font-serif uppercase">S1 Kesmas</h3>
                <p className="text-sm text-gray-600 mt-1 font-serif">
                  Sidang Skripsi Program Sarjana
                </p>
                <p className="text-xs text-gray-500 mt-3 font-sans">
                  {isDosen ? 'Akses ke sidang skripsi S1' : 'Daftar hadir & lihat jadwal sidang'}
                </p>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-gray-100">
              <span className="inline-flex items-center px-4 py-2 bg-blue-900 text-white text-sm font-medium rounded-lg group-hover:bg-blue-800 transition-colors">
                Buka S1 Kesmas →
              </span>
            </div>
          </Link>

          {/* S2 Card */}
          <Link
            href="/s2/sessions"
            className={`group block bg-white rounded-xl shadow-lg p-8 border border-gray-200 transition-all duration-300 ${
              !isDosen ? 'opacity-50 pointer-events-none cursor-not-allowed' : 'hover:shadow-xl hover:border-green-300'
            }`}
          >
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center group-hover:bg-green-900 group-hover:text-white transition-colors">
                <svg className="w-7 h-7 text-green-700 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-gray-900 font-serif uppercase">S2 Kesmas</h3>
                <p className="text-sm text-gray-600 mt-1 font-serif">
                  Seminar Proposal, Hasil & Sidang Tesis Program Magister
                </p>
                <p className="text-xs text-gray-500 mt-3 font-sans">
                  {isDosen ? 'Seminar Proposal Tesis (4 penguji)' : 'Dalam pengembangan - akses terbatas'}
                </p>
              </div>
            </div>
            <div className="mt-6 pt-4 border-t border-gray-100">
              {isDosen ? (
                <span className="inline-flex items-center px-4 py-2 bg-green-900 text-white text-sm font-medium rounded-lg group-hover:bg-green-800 transition-colors">
                  Buka S2 Kesmas →
                </span>
              ) : (
                <span className="inline-flex items-center px-4 py-2 bg-gray-300 text-gray-500 text-sm font-medium rounded-lg cursor-not-allowed">
                  Dalam Pengembangan
                </span>
              )}
            </div>
          </Link>
        </div>

        {/* Info footer */}
        <div className="mt-10 text-center text-sm text-gray-500 font-sans">
          <p>Fakultas Ilmu Kesehatan UPN &ldquo;Veteran&rdquo; Jakarta</p>
          <p className="mt-1">Program Studi Kesehatan Masyarakat</p>
        </div>

        {/* User info */}
        <div className="mt-6 no-print text-center text-xs text-gray-400">
          <p>
            Login sebagai: <strong className="text-gray-600">{profile.full_name || profile.email}</strong>
            <span className="mx-2">•</span>
            Role: <strong className="text-gray-600 capitalize">{profile.role}</strong>
          </p>
        </div>
      </div>
    </div>
  );
}