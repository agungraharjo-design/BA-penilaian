import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request) {
  const admin = createAdminClient()
  if (!admin) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  // Verify JWT from Authorization header
  const authHeader = request.headers.get('authorization')?.replace('Bearer ', '')
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Use anon client to verify the user's JWT
  const anonClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
  const { data: { user }, error: authError } = await (anonClient.auth as any).getUser(authHeader)
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { sessionId, peserta_hadir, audience_hadir } = body

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  }

  // Only update the attendance fields
  const updateData: Record<string, any> = {}
  if (peserta_hadir !== undefined) updateData.peserta_hadir = peserta_hadir
  if (audience_hadir !== undefined) updateData.audience_hadir = audience_hadir

  const { error } = await admin
    .from('sessions')
    .update(updateData)
    .eq('id', sessionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
