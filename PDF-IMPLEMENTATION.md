# PDF Generation — Implementation History & Error Log

## Goal
Click "⬇ Menyimpan PDF" → browser captures preview → saves to Supabase Storage `pdf-archive` → "📄 Lihat PDF" link appears.

---

## Current Implementation (html2canvas)

After many attempts with Playwright/Puppeteer/@sparticuz/chromium failing due to browser binary not being available on Vercel's serverless runtime, we reverted to html2canvas approach.

**How it works:**
1. User clicks "⬇ Menyimpan PDF"
2. Client-side: html2canvas captures each `.page-break` section
3. jsPDF creates A4 PDF with proper margins (15mm top/bottom, 20mm left/right)
4. PDF uploaded to Supabase Storage
5. URL saved to session

---

## Error Log (chronological)

### 1. Chrome not found (local dev)
**Cause:** No Chrome binary on system.
**Fix:** System Chrome fallback.

### 2. Playwright chromium_headless_shell not installed (Vercel)
**Cause:** Browser downloaded during build stays on build machine, not deployed to runtime.
**Fix attempts:**
- Added `npx playwright install chromium` to build script — browser still not deployed
- `@sparticuz/chromium` — ESM-only package, Next.js bundling converts imports to require() causing `ERR_REQUIRE_ESM`
- Dynamic imports + `export const runtime = 'nodejs'` — still got bundled as require()
- `playwright` full package — still needs browser at runtime
- Puppeteer — same browser download issue

### 3. Browser binary on Vercel — fundamental problem
**Root cause:** Vercel serverless functions don't have a browser binary installed. All approaches (Playwright, Puppeteer, @sparticuz/chromium) require a browser to be present at runtime, but:
- Browser downloaded during build stays on build machine
- Vercel doesn't pre-install any browsers
- @sparticuz/chromium has ESM bundling issues with Next.js

**Solution:** Revert to html2canvas (client-side rendering).

---

## Files

### Current (html2canvas)
- `src/app/session/[id]/page.tsx` — `handleDownloadPDF` uses html2canvas + jsPDF
- `src/app/globals.css` — `@page { margin: 15mm 20mm 20mm }`, `.page-break`, `.avoid-break`

### Removed during Playwright attempts
- `scripts/playwright-install.mjs` — deleted
- `public/pagedjs/paged.polyfill.js` — deleted

---

## Notes on Display Quality

html2canvas has limitations:
- Can't do semantic page breaks (captures pixels, not HTML structure)
- Table headers don't repeat on new pages
- Some layout differences from browser print

The `.page-break` class helps, but the quality is not pixel-perfect like browser print.

---

## Previous Approaches (for reference)

| Approach | Status | Issue |
|---|---|---|
| html2canvas | ✓ Working | Lower quality |
| Playwright | ✗ | Browser not on Vercel |
| Puppeteer | ✗ | Browser not on Vercel |
| @sparticuz/chromium | ✗ | ESM bundling breaks |
| Browser print → manual | ✓ Perfect | User must save manually |

---

## Supabase Storage

- Bucket: `pdf-archive` (public)
- Path format: `{session_id}/BA_Sidang_{name}_{nim}.pdf`
- File size: ~100-200KB typical