import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Public attendance API — no auth required
export async function PATCH(request: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
  )
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const body = await request.json()
  const { sessionId, peserta_hadir, audience_hadir } = body

  if (!sessionId) {
    return NextResponse.json({ error: 'sessionId required' }, { status: 400 })
  }

  const updateData: Record<string, any> = {}
  if (peserta_hadir !== undefined) updateData.peserta_hadir = peserta_hadir
  if (audience_hadir !== undefined) updateData.audience_hadir = audience_hadir

  const { error } = await supabase
    .from('sessions')
    .update(updateData)
    .eq('id', sessionId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
