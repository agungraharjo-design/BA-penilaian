# PDF Generation — Implementation History & Error Log

## Goal
Click "⬇ Menyimpan PDF" → server generates paginated A4 PDF → auto-saves to Supabase Storage `pdf-archive` → "📄 Lihat PDF" link appears.

---

## Architecture

```
Frontend (PreviewAll component)
  → POST /api/generate-pdf/:id
    → Playwright (playwright-core) + @sparticuz/chromium
    → Navigates to /pdf-render/:id (server-side rendered HTML)
    → page.pdf() → A4 buffer
    → Upload to Supabase Storage
    → Return public URL
```

---

## What Was Built

### New files
- `src/app/api/generate-pdf/[id]/route.ts` — API route, generates PDF server-side
- `src/app/pdf-render/[id]/page.tsx` — Server component, fetches session from Supabase (admin client, no auth) and renders the full preview HTML that Playwright captures
- `src/app/globals.css` — Print CSS: `@page { margin: 15mm 20mm 20mm }`, `.page-break`, `.avoid-break`, `thead { display: table-header-group }` for repeated table headers
- `scripts/playwright-install.mjs` — (removed) Node.js bootstrap that downloaded Chromium during build

### Modified files
- `src/app/session/[id]/page.tsx` — `PreviewAll` component: replaced html2canvas+jsPDF pipeline with `fetch('/api/generate-pdf/...')`. Improved error handling: checks `res.ok` and `content-type` before calling `.json()` to prevent `Unexpected token '<'` crash on HTML error responses.
- `next.config.js` — externalizes `playwright-core` and `@sparticuz/chromium` in both `serverComponentsExternalPackages` and `webpack.externals` so Next.js doesn't bundle them
- `package.json` — dependencies: `playwright-core`, `@sparticuz/chromium`

---

## Error Log (chronological)

### 1. `Chrome not found` (local dev)
**Cause:** No Chrome binary on system.
**Fix:** Added fallback chain: system Chrome → `@sparticuz/chromium` → `@puppeteer/browsers` download.

### 2. `@sparticuz/chromium bin directory does not exist` (Vercel)
**Cause:** Next.js bundler was relocating/moving `@sparticuz/chromium` during build, breaking the `bin/` path that `executablePath()` relies on.
**Fix Attempts:**
- Added `serverComponentsExternalPackages` + `webpack.externals` in `next.config.js`
- Used `require.resolve()` to locate package → blocked by `exports` field in package.json
- Used `process.cwd() + '/node_modules/@sparticuz/chromium/bin'` — worked for path, but import still broke

### 3. `ERR_REQUIRE_ESM: require() of ES Module @sparticuz/chromium not supported` (Vercel)
**Cause:** `@sparticuz/chromium` is pure ESM. Next.js App Router compiles top-level `import` statements into `require()` calls internally. Even though the source code used ESM `import`, the compiled output used `require()` — crashing on ESM-only packages.
**Fix attempts:**
- Moved `import ChromiumPkg from '@sparticuz/chromium'` inside the handler → still crashed because Next.js transforms all top-level imports in the file
- Removing `require.resolve()` wasn't enough — the static ESM `import` was still being converted to `require()` by the bundler

### 4. `ERR_REQUIRE_ESM` (continued — root fix)

**Root cause confirmed:** Next.js App Router wraps route handlers in a CommonJS-compatible runtime. Any module imported at the top level of a route file can be transformed to `require()` regardless of whether the source uses ESM syntax.

**Final fix:**
```typescript
// At the very top of the route file — BEFORE any imports
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// NO top-level imports of playwright-core or @sparticuz/chromium
// Inside the handler ONLY:
const { chromium } = await import('playwright-core')
const ChromiumPkg = (await import('@sparticuz/chromium')).default
```

`runtime = 'nodejs'` tells Next.js this route uses pure Node.js ESM runtime and shouldn't wrap it in a CJS-compatible layer. Combined with 100% dynamic imports for the ESM-only packages, this prevents all `require()` transformations.

---

## Previous Approaches (abandoned)

| Approach | Why abandoned |
|---|---|
| html2canvas + jsPDF (client-side) | Pixel-based slicing — can't do semantic page breaks, repeated table headers, or match browser print quality |
| Puppeteer + `@sparticuz/chromium` (initial) | `@sparticuz/chromium` ESM + Next.js CJS bundling was incompatible; binary path resolution broke under bundling |
| Playwright full + browser download at build | Playwright's browser download at runtime fails in Vercel (npx not available); shipping Windows binaries to Linux Vercel was a mismatch |
| `playwright install chromium-headless-shell` in build script | Binary downloaded on Windows dev machine (wrong arch); Vercel's .gitignore excluded `playwright-browsers/` so it never deployed |
| Paged.js (client-side) | Can't auto-upload to Supabase Storage; requires manual "Save as PDF" from browser dialog |

---

## Current Setup

- `playwright-core` — lightweight driver (~400KB, no browser bundles)
- `@sparticuz/chromium` — prebuilt Linux Chromium binary inside npm package; extracts to `/tmp` on first call
- Bin path: `process.cwd()/node_modules/@sparticuz/chromium/bin` (ESM-safe, no require.resolve)
- PDF renders at `/pdf-render/:id` which is a Next.js server component (fetches session via admin Supabase client, no auth required)
- PDF uploaded to `pdf-archive` bucket in Supabase Storage, URL saved to `sessions.pdf_url`

---

## Vercel Environment Requirements

- `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` — removes 250 MB serverless function size limit (Chromium binary pushes function over limit)
- `next.config.js` must externalize both `playwright-core` and `@sparticuz/chromium` so their binaries ship with the function
- `playwright-browsers/` is in `.gitignore` — it's OS-specific and re-evaluated at runtime via `@sparticuz/chromium`
