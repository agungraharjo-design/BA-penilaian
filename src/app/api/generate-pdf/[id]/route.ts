import { NextRequest, NextResponse } from 'next/server'
import { chromium } from 'playwright-core'
import ChromiumPkg from '@sparticuz/chromium'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getSystemChromePath(): string | undefined {
  if (process.platform === 'win32') {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ]
    const fs = require('fs')
    for (const p of paths) { if (fs.existsSync(p)) return p }
  }
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  return undefined
}

function getSparticuzBinPath(): string {
  const { dirname, join } = require('path')
  const { createRequire } = require('node:module')
  const requireFromHere = createRequire(import.meta.url)
  const mainPath = requireFromHere.resolve('@sparticuz/chromium')
  return join(dirname(dirname(mainPath)), 'bin')
}

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
    // On Vercel (Linux): use @sparticuz/chromium
    // On local Windows/Mac: fall back to system Chrome
    let executablePath: string | undefined
    const systemChrome = getSystemChromePath()

    if (systemChrome && process.platform !== 'linux') {
      // Local dev — use system Chrome
      executablePath = systemChrome
      console.log('[PDF] Using system Chrome:', executablePath)
    } else {
      // Vercel Linux (or fallback) — use @sparticuz/chromium
      const binPath = getSparticuzBinPath()
      console.log('[PDF] @sparticuz/chromium bin:', binPath)
      executablePath = await ChromiumPkg.executablePath(binPath)
      console.log('[PDF] Chromium executable:', executablePath)
    }

    console.log('[PDF] Launching Chromium...')
    browser = await chromium.launch({
      executablePath,
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
    return NextResponse.json({
      error: err.message || 'PDF generation failed',
      stack: err.stack,
    }, { status: 500 })
  } finally {
    if (page) try { await page.close() } catch {}
    if (browser) try { await browser.close() } catch {}
  }
}

