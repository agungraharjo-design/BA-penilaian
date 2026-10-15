import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// Upload one image for the Seminar Proposal "Tangkapan Layar" tab.
//
// Mirrors the existing /api/upload-pdf route: server-side admin client, so it
// does not depend on storage RLS policies that the browser client may not have.
// Images are public read; the caller stores the returned URL in the session.
export async function POST(request: NextRequest) {
  try {
    const { groupCode, slot, imageBase64, fileName } = await request.json()

    if (!groupCode || !slot || !imageBase64 || !fileName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const buffer = Buffer.from(imageBase64, 'base64')
    if (!buffer.length) {
      return NextResponse.json({ error: 'Empty image payload' }, { status: 400 })
    }

    const storagePath = `${groupCode}/${fileName}`
    const { error } = await supabase.storage
      .from('seminar-proposal')
      .upload(storagePath, buffer, { contentType: 'image/png', upsert: true })

    if (error) {
      console.error('Storage upload error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    // ?v= cache-buster: the object path is reused on re-upload, so the CDN and
    // browser would keep serving the previous image for up to an hour (max-age=3600)
    // without a fresh URL.
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/seminar-proposal/${storagePath}?v=${Date.now()}`
    return NextResponse.json({ url: publicUrl })
  } catch (err) {
    console.error('SP image upload error:', err)
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
