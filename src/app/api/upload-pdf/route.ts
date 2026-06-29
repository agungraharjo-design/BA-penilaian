import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(request: NextRequest) {
  try {
    const { sessionId, pdfBase64, fileName } = await request.json()
    
    if (!pdfBase64 || !sessionId || !fileName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    
    // Convert base64 to buffer
    const pdfBuffer = Buffer.from(pdfBase64, 'base64')
    
    const supabase = createAdminClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }
    
    const storagePath = `${sessionId}/${fileName}`
    
    const { error: uploadError } = await supabase.storage
      .from('pdf-archive')
      .upload(storagePath, pdfBuffer, { 
        contentType: 'application/pdf', 
        upsert: true 
      })
    
    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }
    
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/pdf-archive/${storagePath}`
    
    // Update session with PDF URL
    const { error: updateError } = await supabase
      .from('sessions')
      .update({ pdf_url: publicUrl })
      .eq('id', sessionId)
    
    if (updateError) {
      console.error('Update error:', updateError)
      return NextResponse.json({ error: updateError.message }, { status: 500 })
    }
    
    return NextResponse.json({ url: publicUrl })
    
  } catch (err: any) {
    console.error('PDF upload API error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}