import { NextRequest, NextResponse } from 'next/server'
import { chromium } from 'playwright'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

// Locate the Playwright browsers that were copied to .next/server/ during build
const { existsSync } = require('fs')
const path = require('path')

function resolveBrowsersPath(): string | undefined {
  const here = path.join(process.cwd(), '.next', 'server', 'playwright-browsers')
  if (existsSync(here)) return here
  const project = path.join(process.cwd(), 'playwright-browsers')
  if (existsSync(project)) return project
  return process.env.PLAYWRIGHT_BROWSERS_PATH || undefined
}

const browsersPath = resolveBrowsersPath()
if (browsersPath) process.env.PLAYWRIGHT_BROWSERS_PATH = browsersPath

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
  const step = (name: string) => console.log(`[PDF] ${name}`)

  try {
    step('launching Chromium via Playwright')
    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
      ],
    })
    step('browser launched')

    page = await browser.newPage()

    const host = request.headers.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const renderUrl = `${protocol}://${host}/pdf-render/${id}`

    step(`navigating to ${renderUrl}`)
    await page.goto(renderUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    step('navigated')

    const pageContent = await page.content()
    if (!pageContent.includes('Laporan Sidang Skripsi')) {
      console.error('PDF render page content mismatch. First 500 chars:', pageContent.slice(0, 500))
      return NextResponse.json({ error: 'Render page returned invalid content', url: renderUrl }, { status: 500 })
    }

    step('generating PDF')
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '15mm', right: '20mm', bottom: '20mm', left: '20mm' },
      printBackground: true,
      preferCSSPageSize: false,
    })
    step(`PDF generated, size: ${pdfBuffer.length} bytes`)

    const safeName = (session.nama || 'unknown').replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `BA_Sidang_${safeName}_${session.nim || 'unknown'}.pdf`
    const storagePath = `${session.id}/${fileName}`

    step('uploading to storage')
    const { error: uploadError } = await supabase.storage
      .from('pdf-archive')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed', details: uploadError.message }, { status: 500 })
    }
    step('storage upload OK')

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/pdf-archive/${storagePath}`
    const { error: updateError } = await supabase.from('sessions').update({ pdf_url: publicUrl }).eq('id', session.id)
    if (updateError) console.error('DB update error:', updateError)

    step('done')
    return NextResponse.json({ url: publicUrl, fileName })
  } catch (err: any) {
    console.error('[PDF] FATAL error:', err)
    return NextResponse.json({
      error: err.message || 'PDF generation failed',
      stack: err.stack,
    }, { status: 500 })
  } finally {
    if (page) try { await page.close() } catch {}
    if (browser) try { await browser.close() } catch {}
  }
}
