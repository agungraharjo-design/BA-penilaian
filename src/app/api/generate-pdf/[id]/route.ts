import { NextRequest, NextResponse } from 'next/server'
import { chromium } from 'playwright'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Point Playwright to the browsers directory shipped with the deployment
const { existsSync } = require('fs')
const path = require('path')

function initBrowsersPath() {
  const candidates = [
    path.join(process.cwd(), 'playwright-browsers'),
    path.join(process.cwd(), '.next', 'server', 'playwright-browsers'),
    ...(process.env.PLAYWRIGHT_BROWSERS_PATH ? [process.env.PLAYWRIGHT_BROWSERS_PATH] : []),
  ]
  for (const c of candidates) {
    if (existsSync(c)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = c
      console.log('[PDF] Using browsers at:', c)
      return
    }
  }
  console.warn('[PDF] No browsers found at expected paths. Listing candidates:',
    candidates.map(c => `${c} (exists: ${existsSync(c)})`).join(', ')
  )
}
initBrowsersPath()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: session, error: fetchError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', id)
    .single()

  if (fetchError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  let browser: any = null
  let page: any = null

  try {
    console.log('[PDF] Launching Chromium...')
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    })
    console.log('[PDF] Browser launched')

    page = await browser.newPage()

    const host = request.headers.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const renderUrl = `${protocol}://${host}/pdf-render/${id}`

    console.log('[PDF] Navigating to:', renderUrl)
    await page.goto(renderUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    console.log('[PDF] Navigated OK')

    const pageContent = await page.content()
    console.log('[PDF] Page content length:', pageContent.length, 'has BA:', pageContent.includes('Laporan Sidang Skripsi'))

    if (!pageContent.includes('Laporan Sidang Skripsi')) {
      console.error('[PDF] Render page content mismatch. First 300 chars:', pageContent.slice(0, 300))
      return NextResponse.json({ error: 'Render page returned invalid content', url: renderUrl }, { status: 500 })
    }

    console.log('[PDF] Generating PDF...')
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '15mm', right: '20mm', bottom: '20mm', left: '20mm' },
      printBackground: true,
      preferCSSPageSize: false,
    })
    console.log('[PDF] PDF generated, size:', pdfBuffer.length, 'bytes')

    const safeName = (session.nama || 'unknown').replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `BA_Sidang_${safeName}_${session.nim || 'unknown'}.pdf`
    const storagePath = `${session.id}/${fileName}`

    console.log('[PDF] Uploading to storage:', storagePath)
    const { error: uploadError } = await supabase.storage
      .from('pdf-archive')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    if (uploadError) {
      console.error('[PDF] Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed', details: uploadError.message }, { status: 500 })
    }
    console.log('[PDF] Storage upload OK')

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/pdf-archive/${storagePath}`
    console.log('[PDF] Public URL:', publicUrl)
    const { error: updateError } = await supabase.from('sessions').update({ pdf_url: publicUrl }).eq('id', session.id)
    if (updateError) console.error('[PDF] DB update error:', updateError)

    console.log('[PDF] DONE')
    return NextResponse.json({ url: publicUrl, fileName })
  } catch (err: any) {
    console.error('[PDF] FATAL error:', err)
    return NextResponse.json({ error: err.message || 'PDF generation failed', stack: err.stack }, { status: 500 })
  } finally {
    if (page) try { await page.close() } catch {}
    if (browser) try { await browser.close() } catch {}
  }
}
