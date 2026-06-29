export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let browser: any = null
  let page: any = null

  try {
    const { id } = await params

    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
    }

    const { createClient } = await import('@supabase/supabase-js')
    // Puppeteer auto-downloads chromium on first launch
    const puppeteer = await import('puppeteer')

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: session, error: fetchError } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single()

    if (fetchError || !session) {
      return NextResponse.json({ error: 'Session not found', details: fetchError?.message }, { status: 404 })
    }

    console.log('[PDF] Launching Puppeteer...')
    browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    })
    console.log('[PDF] Launched')

    page = await browser.newPage()

    const host = request.headers.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const renderUrl = `${protocol}://${host}/pdf-render/${id}`

    console.log(`[PDF] Navigating: ${renderUrl}`)
    await page.goto(renderUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    console.log('[PDF] Navigated')

    const pageContent = await page.content()
    if (!pageContent.includes('Laporan Sidang Skripsi')) {
      console.error('[PDF] Bad content. First 200 chars:', pageContent.slice(0, 200))
      return NextResponse.json({ error: 'Render page invalid', url: renderUrl }, { status: 500 })
    }

    console.log('[PDF] Generating PDF...')
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '15mm', right: '20mm', bottom: '20mm', left: '20mm' },
      printBackground: true,
      preferCSSPageSize: false,
    })
    console.log(`[PDF] PDF size: ${pdfBuffer.length}`)

    const safeName = (session.nama || 'unknown').replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `BA_Sidang_${safeName}_${session.nim || 'unknown'}.pdf`
    const storagePath = `${session.id}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('pdf-archive')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    if (uploadError) {
      console.error('[PDF] Upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed', details: uploadError.message }, { status: 500 })
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/pdf-archive/${storagePath}`
    await supabase.from('sessions').update({ pdf_url: publicUrl }).eq('id', session.id)

    console.log('[PDF] DONE')
    return NextResponse.json({ url: publicUrl, fileName })
  } catch (err: any) {
    console.error('[PDF] FATAL:', err)
    return NextResponse.json({
      error: err.message || 'PDF generation failed',
      ...(err.stack ? { stack: err.stack } : {}),
    }, { status: 500 })
  } finally {
    if (page) try { await page.close() } catch {}
    if (browser) try { await browser.close() } catch {}
  }
}