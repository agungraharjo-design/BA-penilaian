import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer-core'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

function getChromePath(): string {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH
  if (process.platform === 'win32') {
    const paths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ]
    for (const p of paths) {
      const fs = require('fs')
      if (fs.existsSync(p)) return p
    }
  }
  if (process.platform === 'darwin') {
    return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  }
  return '/usr/bin/google-chrome'
}

function getSparticuzBinPath(): string | undefined {
  try {
    const { dirname, join } = require('path')
    const { fileURLToPath } = require('url')
    const pkgDir = dirname(require.resolve('@sparticuz/chromium/package.json'))
    return join(pkgDir, 'bin')
  } catch {
    return undefined
  }
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

  const chromePath = getChromePath()
  const sparticuzBinPath = getSparticuzBinPath()
  const { tmpdir } = require('os')
  const { join, dirname } = require('path')
  const { fileURLToPath } = require('url')

  let browser: any = null
  let page: any = null
  let chromeUsed: string = 'none'
  const step = (name: string) => console.log(`[PDF] ${name}`)

  try {
    step('launching browser')

    // Strategy 1: system Chrome
    try {
      browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      })
      chromeUsed = `system:${chromePath}`
      step(`system Chrome OK`)
    } catch (e: any) {
      step(`system Chrome failed: ${e.message}`)
    }

    // Strategy 2: @sparticuz/chromium (explicit bin path to bypass import.meta.url bundling bug)
    if (!browser && sparticuzBinPath) {
      try {
        step(`@sparticuz/chromium bin at: ${sparticuzBinPath}`)
        const { existsSync } = require('fs')
        if (!existsSync(sparticuzBinPath)) {
          step(`bin dir missing — package likely bundled by Next.js`)
        }
        const Chromium = (await import('@sparticuz/chromium')).default
        const exePath = await Chromium.executablePath(sparticuzBinPath)
        browser = await puppeteer.launch({
          executablePath: exePath,
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        })
        chromeUsed = `sparticuz:${exePath}`
        step(`@sparticuz/chromium OK → ${exePath}`)
      } catch (e: any) {
        step(`@sparticuz/chromium failed: ${e.message}`)
      }
    } else if (!browser && !sparticuzBinPath) {
      step('@sparticuz/chromium package not resolvable')
    }

    // Strategy 3: @puppeteer/browsers download fallback
    if (!browser) {
      step('trying @puppeteer/browsers download fallback')
      try {
        const { install, Browser } = await import('@puppeteer/browsers')
        const installed = await install({
          cacheDir: join(tmpdir(), 'chrome-download'),
          browser: Browser.CHROME,
          buildId: 'latest',
        })
        browser = await puppeteer.launch({
          executablePath: installed.executablePath,
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
        })
        chromeUsed = `puppeteer-browsers:${installed.executablePath}`
        step(`@puppeteer/browsers download OK → ${installed.executablePath}`)
      } catch (e: any) {
        step(`@puppeteer/browsers download failed: ${e.message}`)
        throw new Error(`All Chrome launch strategies failed. Last error: ${e.message}`)
      }
    }

    step(`Chrome source: ${chromeUsed}`)
    page = await browser.newPage()

    const host = request.headers.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const renderUrl = `${protocol}://${host}/pdf-render/${id}`

    step(`navigating to ${renderUrl}`)
    const navResponse = await page.goto(renderUrl, {
      waitUntil: 'networkidle0',
      timeout: 60000,
    })
    step(`navigated, status: ${navResponse?.status()}`)

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
      chromeUsed,
      stack: err.stack,
    }, { status: 500 })
  } finally {
    if (page) try { await page.close() } catch {}
    if (browser) try { await browser.close() } catch {}
  }
}
