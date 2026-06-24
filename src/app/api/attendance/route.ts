import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

function getClient() {
  return createAdminClient() || createClient(url, anonKey)
}

// GET /api/attendance?id=xxx — load session data for public attendance
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const sessionId = searchParams.get('id')

  if (!sessionId) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const supabase = getClient()
  const { data, error } = await supabase
    .from('sessions')
    .select('id, nama, nim, peminatan, hari_tanggal, semester, ta, peserta_hadir, audience_hadir')
    .eq('id', sessionId)
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}

// PATCH /api/attendance — update attendance fields
export async function PATCH(request: Request) {
  const supabase = getClient()

  if (!url) {
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
