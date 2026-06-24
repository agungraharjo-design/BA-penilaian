import { createAdminClient } from '@/lib/supabase/admin'
import { DOSEN_WHITELIST } from '@/lib/dosen'
import { NextResponse } from 'next/server'

export async function POST() {
  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json(
      { error: 'Server not configured with SUPABASE_SERVICE_ROLE_KEY' },
      { status: 500 }
    )
  }

  const results: { email: string; status: string; error?: string; password?: string }[] = []

  for (const dosen of DOSEN_WHITELIST) {
    try {
      // Generate a random password
      const tempPassword = Math.random().toString(36).slice(2, 10) + 'Aa1!'
      const { data, error } = await (admin.auth as any).admin.createUser({
        email: dosen.email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { full_name: dosen.nama },
      })
      if (error) {
        // If user already exists, that's ok
        if (error.message.includes('already exists')) {
          results.push({ email: dosen.email, status: 'already_exists' })
        } else {
          results.push({ email: dosen.email, status: 'error', error: error.message })
        }
      } else {
        results.push({ email: dosen.email, status: 'created', password: tempPassword })
      }
    } catch (err: any) {
      results.push({ email: dosen.email, status: 'error', error: err.message })
    }
  }

  return NextResponse.json({ results })
}
