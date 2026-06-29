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
  // ESM-safe: @sparticuz/chromium is ESM-only so require.resolve fails.
  // process.cwd() in Vercel/serverless = project root, so node_modules is always here.
  const { join } = require('path')
  return join(process.cwd(), 'node_modules', '@sparticuz', 'chromium', 'bin')
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const step = (name: string) => console.log(`[PDF] ${name}`)
  let browser: any = null
  let page: any = null

  try {
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
      return NextResponse.json({ error: 'Session not found', details: fetchError?.message }, { status: 404 })
    }

    let executablePath: string | undefined
    const systemChrome = getSystemChromePath()

    if (systemChrome && process.platform !== 'linux') {
      executablePath = systemChrome
      step(`System Chrome: ${executablePath}`)
    } else {
      const binPath = getSparticuzBinPath()
      step(`@sparticuz bin: ${binPath}`)
      executablePath = await ChromiumPkg.executablePath(binPath)
      step(`Chromium exe: ${executablePath}`)
    }

    step('Launching...')
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    })
    step('Launched')

    page = await browser.newPage()

    const host = request.headers.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const renderUrl = `${protocol}://${host}/pdf-render/${id}`

    step(`Navigating: ${renderUrl}`)
    await page.goto(renderUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    step('Navigated')

    const pageContent = await page.content()
    if (!pageContent.includes('Laporan Sidang Skripsi')) {
      console.error('[PDF] Bad content. First 200 chars:', pageContent.slice(0, 200))
      return NextResponse.json({ error: 'Render page invalid', url: renderUrl }, { status: 500 })
    }

    step('Generating PDF...')
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '15mm', right: '20mm', bottom: '20mm', left: '20mm' },
      printBackground: true,
      preferCSSPageSize: false,
    })
    step(`PDF size: ${pdfBuffer.length}`)

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

    step('DONE')
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
