import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const dest = join(process.cwd(), 'playwright-browsers')
if (existsSync(dest)) {
  console.log('[playwright-install] Browsers already present at', dest)
  process.exit(0)
}

process.env.PLAYWRIGHT_BROWSERS_PATH = dest
console.log('[playwright-install] Downloading Chromium Headless Shell to', dest)

try {
  execSync('playwright install chromium-headless-shell', {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: dest },
  })
  console.log('[playwright-install] Done')
} catch {
  console.error('[playwright-install] chromium-headless-shell failed, trying chromium')
  try {
    execSync('playwright install chromium', {
      cwd: process.cwd(),
      stdio: 'inherit',
      env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: dest },
    })
    console.log('[playwright-install] Done (chromium)')
  } catch (e) {
    console.error('[playwright-install] Both installs failed:', e)
    process.exit(0) // don't block npm install
  }
}
