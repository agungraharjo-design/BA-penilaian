import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const supabase = createAdminClient()
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase admin not configured' }, { status: 500 })
  }

  const { data: session, error: fetchError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  try {
    // Dynamic import to avoid issues
    const { default: html2canvas } = await import('html2canvas')
    const { jsPDF } = await import('jspdf')

    // Fetch the preview HTML by navigating to the page
    // Since we can't easily fetch and render HTML, we'll return instructions
    // Actually, let's use the browser to capture
    
    // Create a simple PDF with jsPDF directly since html2canvas needs a browser
    // For a proper solution, we need client-side rendering
    return NextResponse.json({ 
      error: 'PDF generation requires client-side rendering. Use Print button instead.',
      hint: 'Click Print button and save as PDF from browser dialog'
    }, { status: 500 })

  } catch (err: any) {
    console.error('PDF error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}