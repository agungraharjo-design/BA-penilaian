import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

function getClient() {
  return createAdminClient() || createClient(url, anonKey)
}

// GET /api/s2/attendance?token=xxx — load session + attendance for public form
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get('token')

  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 })
  }

  const supabase = getClient()
  const { data: session, error } = await supabase
    .from('s2_sessions')
    .select('id, student_name, student_nim, specialization, hari_tanggal, semester, ta')
    .eq('public_attendance_token', token)
    .single()

  if (error || !session) {
    return NextResponse.json({ error: 'Sesi tidak ditemukan' }, { status: 404 })
  }

  const { data: attendance } = await supabase
    .from('s2_attendance')
    .select('*')
    .eq('session_id', session.id)

  return NextResponse.json({ session, attendance: attendance || [] })
}

// PATCH /api/s2/attendance — replace peserta/audiens rows for a session
export async function PATCH(request: Request) {
  const supabase = getClient()

  if (!url) {
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const body = await request.json()
  const { token, peserta, audiens } = body

  if (!token) {
    return NextResponse.json({ error: 'token required' }, { status: 400 })
  }

  const { data: session, error: sessErr } = await supabase
    .from('s2_sessions')
    .select('id')
    .eq('public_attendance_token', token)
    .single()

  if (sessErr || !session) {
    return NextResponse.json({ error: 'Sesi tidak ditemukan' }, { status: 404 })
  }

  const sessionId = session.id

  const { error: delErr } = await supabase
    .from('s2_attendance')
    .delete()
    .eq('session_id', sessionId)

  if (delErr) {
    return NextResponse.json({ error: delErr.message }, { status: 500 })
  }

  const toInsert: any[] = []
  ;(peserta || []).forEach((p: any) => {
    if (p.name && p.name.trim()) {
      toInsert.push({
        session_id: sessionId,
        attendance_type: 'peserta',
        name: p.name,
        nim: p.nim || '',
        signature_path: p.signature_path || null,
        notes: '',
      })
    }
  })
  ;(audiens || []).forEach((a: any) => {
    if (a.name && a.name.trim()) {
      toInsert.push({
        session_id: sessionId,
        attendance_type: 'audiens',
        name: a.name,
        nim: a.nim || '',
        signature_path: a.signature_path || null,
        notes: '',
      })
    }
  })

  if (toInsert.length > 0) {
    const { error: insErr } = await supabase.from('s2_attendance').insert(toInsert)
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true })
}
