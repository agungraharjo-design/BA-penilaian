import { NextRequest, NextResponse } from 'next/server'
import puppeteer from 'puppeteer-core'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

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

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 })
  }

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

  // No pre-check here — try/catch handles everything including fallback

  let browser: any = null
  let page: any = null
  const step = (name: string) => console.log(`[PDF] Step: ${name}`)
  try {
    step('launching browser')
    try {
      browser = await puppeteer.launch({
        executablePath: chromePath,
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--font-render-hinting=none',
        ],
      })
      step('launched with system Chrome')
    } catch (launchErr: any) {
      console.error('System Chrome failed, falling back to @sparticuz/chromium:', launchErr.message)
      const Chromium = (await import('@sparticuz/chromium')).default
      browser = await puppeteer.launch({
        executablePath: await Chromium.executablePath(),
        headless: true,
        args: Chromium.args,
      })
      step('launched with @sparticuz/chromium')
    }

    page = await browser.newPage()
    step('browser launched')

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
      return NextResponse.json({ error: 'Render page content invalid', url: renderUrl }, { status: 500 })
    }

    step('generating PDF')
    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '15mm', right: '20mm', bottom: '20mm', left: '20mm' },
      printBackground: true,
      preferCSSPageSize: false,
    })
    step(`PDF generated, size: ${pdfBuffer.length}`)

    const fileName = `BA_Sidang_${session.nama?.replace(/\s+/g, '_') || 'unknown'}_${session.nim || 'unknown'}.pdf`
    const storagePath = `${session.id}/${fileName}`

    step('uploading to storage')
    const { error: uploadError } = await supabase.storage
      .from('pdf-archive')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed', details: uploadError.message }, { status: 500 })
    }
    step('uploaded')

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/pdf-archive/${storagePath}`
    const { error: updateError } = await supabase.from('sessions').update({ pdf_url: publicUrl }).eq('id', session.id)
    if (updateError) console.error('DB update error:', updateError)

    step('done')
    return NextResponse.json({ url: publicUrl, fileName })
  } catch (err: any) {
    console.error('PDF generation error at step:', err)
    return NextResponse.json({ error: err.message || 'PDF generation failed', stack: err.stack }, { status: 500 })
  } finally {
    if (page) try { await page.close() } catch {}
    if (browser) try { await browser.close() } catch {}
  }
}
