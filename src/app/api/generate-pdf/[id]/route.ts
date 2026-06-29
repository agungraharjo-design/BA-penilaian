import { NextRequest, NextResponse } from 'next/server'
import { chromium } from 'playwright'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const { execSync } = require('child_process')
const { existsSync, mkdirSync, cpSync } = require('fs')
const { tmpdir } = require('os')
const { join, dirname } = require('path')

// Loaded once per cold start
let browsersReady: Promise<void> | null = null

async function ensureBrowsers() {
  if (browsersReady) return browsersReady

  browsersReady = (async () => {
    // Priority 1: use the browsers we shipped in .next/server/ (post-build copy)
    const shipped = join(process.cwd(), '.next', 'server', 'playwright-browsers')
    if (existsSync(shipped)) {
      process.env.PLAYWRIGHT_BROWSERS_PATH = shipped
      console.log('[PDF] Using shipped browsers at', shipped)
      return
    }

    // Priority 2: download to /tmp (writable on Vercel, survives function warm starts)
    const dest = join(tmpdir(), 'playwright-browsers')
    if (!existsSync(dest)) {
      mkdirSync(dest, { recursive: true })
      console.log('[PDF] Downloading Chromium to', dest)
      try {
        execSync('npx playwright install chromium-headless-shell', {
          env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: dest },
          cwd: process.cwd(),
          timeout: 180000,
          stdio: 'inherit',
        })
        console.log('[PDF] Download complete')
      } catch (e: any) {
        // Some versions use 'chromium' instead
        console.log('[PDF] chromium-headless-shell failed, trying chromium:', e.message)
        try {
          execSync('npx playwright install chromium', {
            env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: dest },
            cwd: process.cwd(),
            timeout: 180000,
            stdio: 'inherit',
          })
          console.log('[PDF] chromium download complete')
        } catch (e2: any) {
          throw new Error('Browser download failed: ' + e2.message)
        }
      }
    } else {
      console.log('[PDF] Reusing cached browsers at', dest)
    }
    process.env.PLAYWRIGHT_BROWSERS_PATH = dest
  })()

  return browsersReady
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
    await ensureBrowsers()

    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    })

    page = await browser.newPage()

    const host = request.headers.get('host') || 'localhost:3000'
    const protocol = host.includes('localhost') ? 'http' : 'https'
    const renderUrl = `${protocol}://${host}/pdf-render/${id}`

    await page.goto(renderUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })

    const pageContent = await page.content()
    if (!pageContent.includes('Laporan Sidang Skripsi')) {
      console.error('PDF render page content mismatch. First 300 chars:', pageContent.slice(0, 300))
      return NextResponse.json({ error: 'Render page returned invalid content', url: renderUrl }, { status: 500 })
    }

    const pdfBuffer = await page.pdf({
      format: 'A4',
      margin: { top: '15mm', right: '20mm', bottom: '20mm', left: '20mm' },
      printBackground: true,
      preferCSSPageSize: false,
    })

    const safeName = (session.nama || 'unknown').replace(/[^a-zA-Z0-9]/g, '_')
    const fileName = `BA_Sidang_${safeName}_${session.nim || 'unknown'}.pdf`
    const storagePath = `${session.id}/${fileName}`

    const { error: uploadError } = await supabase.storage
      .from('pdf-archive')
      .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: true })

    if (uploadError) {
      console.error('Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Upload failed', details: uploadError.message }, { status: 500 })
    }

    const publicUrl = `${supabaseUrl}/storage/v1/object/public/pdf-archive/${storagePath}`
    await supabase.from('sessions').update({ pdf_url: publicUrl }).eq('id', session.id)

    return NextResponse.json({ url: publicUrl, fileName })
  } catch (err: any) {
    console.error('[PDF] FATAL error:', err)
    return NextResponse.json({ error: err.message || 'PDF generation failed', stack: err.stack }, { status: 500 })
  } finally {
    if (page) try { await page.close() } catch {}
    if (browser) try { await browser.close() } catch {}
  }
}
