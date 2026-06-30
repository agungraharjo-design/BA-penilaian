# PDF Generation Progress Log

## Tagged Versions
- `v20250630-daftar-hadir-fix` — Combined 3 Daftar Hadir into 1 page with single kop surat
- `v20250630-split-form-penilaian` — Split each examiner's Form Penilaian into 2 pages (5 rows each), removed `<tfoot>` repeat issue

## Current Issues (as of `v20250630-split-form-penilaian`)
1. **NIP "kepotong" (cut off) on Berita Acara** — html2canvas clips bottom of `.page-break` divs that exceed A4 height (297mm). The koordinator signature/NIP row at bottom of BA page is partially cut off.
2. **Form Penilaian font too small** — currently `text-sm` (14px ≈ 10pt). Want to test `text-base` (16px ≈ 12pt) for readability.
3. **Root cause** — `.page-break` divs have no fixed height constraint. Content flows naturally and can exceed A4. html2canvas renders pixels, not semantic HTML, so overflow clips silently.

## Proposed Fix
- Create hidden A4-fixed `.pdf-page` sections (`width: 210mm; height: 297mm; overflow: hidden`) inside a hidden `.pdf-stage` div
- Manually split each document into exact A4 pages
- For Form Penilaian: page 1 = header + rows 1-5, page 2 = header + rows 6-10 + totals + signature
- For Berita Acara: page 1 = header + content + koordinator sig (all fit in one A4)
- Use `html2canvas` with explicit `width`/`height` matching the element's pixel dimensions
- All text in PDF view is plain div/span/table (no inputs) for consistent rendering

## What Works
- Print preview (`window.print()`) is good — browser handles pagination with `@page` CSS
- Daftar Hadir all 3 sections on one page with single kop surat ✓
- Form Penilaian 2-page split in browser print ✓
- PDF upload to Supabase Storage works (using API route, quality 0.8) ✓
