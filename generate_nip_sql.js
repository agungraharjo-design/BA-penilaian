const XLSX = require('xlsx');
const path = 'C:/Users/user/Documents/BA DAN SIDANG PENILAIAN SKRIPSI/Data Nomor_Email Dosen Kesmas.xlsx';
const wb = XLSX.readFile(path);
const ws = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(ws, { header: 1 });

function stripLeadingTitles(name) {
  return name.replace(/^(Dr\.|Dra\.|Prof\.\s*Dr\.|Prof\.|Ns\.|Apt\.|Hj\.)\s*/i, '').trim();
}

function getCoreName(fullName) {
  // Take everything before the first comma, strip titles
  const beforeComma = fullName.split(',')[0].trim();
  return stripLeadingTitles(beforeComma);
}

const dosen = [];
for (let i = 2; i < data.length; i++) {
  const row = data[i];
  if (!row || !row[1]) continue;
  const nama = String(row[1]).trim().replace(/[\r\n]/g, '');
  const nip = row[2] ? String(row[2]).trim() : '';
  if (nama && nip) {
    const coreName = getCoreName(nama).replace(/'/g, "''");
    // If coreName ends with a period, also try without
    const coreNameNoDot = coreName.endsWith('.') ? coreName.slice(0, -1) : coreName;
    dosen.push({ fullName: nama.replace(/'/g, "''"), coreName, coreNameNoDot, nip });
  }
}

let sql = '-- ============================================================\n';
sql += '-- UPDATE NIP DOSEN DI TABEL SESSIONS (SMART MATCH)\n';
sql += '-- Mencocokkan berdasarkan nama inti (sebelum koma pertama, tanpa gelar)\n';
sql += '-- ============================================================\n\n';

// Method 1: Match by core name (before first comma, no leading titles)
sql += '-- METODE 1: Core name match (nama sebelum koma, tanpa gelar depan)\n';
for (const d of dosen) {
  const escaped = d.coreName.replace(/'/g, "''");
  if (!escaped) continue;
  sql += `UPDATE sessions SET nip_penguji1 = '${d.nip}' WHERE penguji1 ILIKE '%${escaped}%' AND (nip_penguji1 IS NULL OR nip_penguji1 = '');\n`;
  sql += `UPDATE sessions SET nip_penguji2 = '${d.nip}' WHERE penguji2 ILIKE '%${escaped}%' AND (nip_penguji2 IS NULL OR nip_penguji2 = '');\n`;
  sql += `UPDATE sessions SET nip_penguji3 = '${d.nip}' WHERE penguji3 ILIKE '%${escaped}%' AND (nip_penguji3 IS NULL OR nip_penguji3 = '');\n`;
  sql += `UPDATE sessions SET nip_koordinator = '${d.nip}' WHERE koordinator ILIKE '%${escaped}%' AND (nip_koordinator IS NULL OR nip_koordinator = '');\n`;
}

// Method 2: For names ending with dot, also try without
sql += '\n-- METODE 2: Same but without trailing dot on core name\n';
for (const d of dosen) {
  if (d.coreNameNoDot === d.coreName) continue;
  const escaped = d.coreNameNoDot.replace(/'/g, "''");
  sql += `UPDATE sessions SET nip_penguji1 = '${d.nip}' WHERE penguji1 ILIKE '%${escaped}%' AND (nip_penguji1 IS NULL OR nip_penguji1 = '');\n`;
  sql += `UPDATE sessions SET nip_penguji2 = '${d.nip}' WHERE penguji2 ILIKE '%${escaped}%' AND (nip_penguji2 IS NULL OR nip_penguji2 = '');\n`;
  sql += `UPDATE sessions SET nip_penguji3 = '${d.nip}' WHERE penguji3 ILIKE '%${escaped}%' AND (nip_penguji3 IS NULL OR nip_penguji3 = '');\n`;
  sql += `UPDATE sessions SET nip_koordinator = '${d.nip}' WHERE koordinator ILIKE '%${escaped}%' AND (nip_koordinator IS NULL OR nip_koordinator = '');\n`;
}

// Special overrides for known mismatches
sql += '\n-- METODE 3: Manual overrides for known unmatched name variants\n';
sql += "UPDATE sessions SET nip_penguji1 = '197008251999031000' WHERE penguji1 ILIKE '%Agus Joko Susanto%' AND (nip_penguji1 IS NULL OR nip_penguji1 = '');\n";
sql += "UPDATE sessions SET nip_penguji2 = '197008251999031000' WHERE penguji2 ILIKE '%Agus Joko Susanto%' AND (nip_penguji2 IS NULL OR nip_penguji2 = '');\n";
sql += "UPDATE sessions SET nip_penguji3 = '197008251999031000' WHERE penguji3 ILIKE '%Agus Joko Susanto%' AND (nip_penguji3 IS NULL OR nip_penguji3 = '');\n";
sql += "UPDATE sessions SET nip_koordinator = '197008251999031000' WHERE koordinator ILIKE '%Agus Joko Susanto%' AND (nip_koordinator IS NULL OR nip_koordinator = '');\n";

// "Januar Aryanto" variant (session) vs "Januar Ariyanto" (Excel)
sql += "\n-- Dr. Januar Aryanto (variant spelling)\n";
sql += "UPDATE sessions SET nip_penguji1 = '199001082024061000' WHERE penguji1 ILIKE '%Januar Aryanto%' AND (nip_penguji1 IS NULL OR nip_penguji1 = '');\n";
sql += "UPDATE sessions SET nip_penguji2 = '199001082024061000' WHERE penguji2 ILIKE '%Januar Aryanto%' AND (nip_penguji2 IS NULL OR nip_penguji2 = '');\n";
sql += "UPDATE sessions SET nip_penguji3 = '199001082024061000' WHERE penguji3 ILIKE '%Januar Aryanto%' AND (nip_penguji3 IS NULL OR nip_penguji3 = '');\n";
sql += "UPDATE sessions SET nip_koordinator = '199001082024061000' WHERE koordinator ILIKE '%Januar Aryanto%' AND (nip_koordinator IS NULL OR nip_koordinator = '');\n";

// "A. Heri Iswanto" variant (session) vs "Acim Heri Iswanto" (Excel)
sql += "\n-- Prof. Dr. A. Heri Iswanto / Acim Heri Iswanto\n";
sql += "UPDATE sessions SET nip_penguji1 = '197707062025211000' WHERE penguji1 ILIKE '%Heri Iswanto%' AND (nip_penguji1 IS NULL OR nip_penguji1 = '');\n";
sql += "UPDATE sessions SET nip_penguji2 = '197707062025211000' WHERE penguji2 ILIKE '%Heri Iswanto%' AND (nip_penguji2 IS NULL OR nip_penguji2 = '');\n";
sql += "UPDATE sessions SET nip_penguji3 = '197707062025211000' WHERE penguji3 ILIKE '%Heri Iswanto%' AND (nip_penguji3 IS NULL OR nip_penguji3 = '');\n";
sql += "UPDATE sessions SET nip_koordinator = '197707062025211000' WHERE koordinator ILIKE '%Heri Iswanto%' AND (nip_koordinator IS NULL OR nip_koordinator = '');\n";

// Dr. Suparni variants: M.K.K.K. vs M.K.K.
sql += "\n-- Dr. Suparni: ensure both M.K.K.K. and M.K.K. match\n";
sql += "UPDATE sessions SET nip_koordinator = '197705072024212000' WHERE koordinator ILIKE '%Suparni%' AND (nip_koordinator IS NULL OR nip_koordinator = '');\n";
sql += "UPDATE sessions SET nip_penguji1 = '197705072024212000' WHERE penguji1 ILIKE '%Suparni%' AND (nip_penguji1 IS NULL OR nip_penguji1 = '');\n";
sql += "UPDATE sessions SET nip_penguji2 = '197705072024212000' WHERE penguji2 ILIKE '%Suparni%' AND (nip_penguji2 IS NULL OR nip_penguji2 = '');\n";
sql += "UPDATE sessions SET nip_penguji3 = '197705072024212000' WHERE penguji3 ILIKE '%Suparni%' AND (nip_penguji3 IS NULL OR nip_penguji3 = '');\n";

sql += '\n-- ============================================================\n';
sql += '-- VERIFIKASI: cek yang masih kosong\n';
sql += '-- ============================================================\n\n';
sql += "SELECT penguji1, nip_penguji1, penguji2, nip_penguji2, penguji3, nip_penguji3, koordinator, nip_koordinator FROM sessions WHERE (nip_penguji1 IS NULL OR nip_penguji1 = '' OR nip_penguji2 IS NULL OR nip_penguji2 = '' OR nip_penguji3 IS NULL OR nip_penguji3 = '' OR nip_koordinator IS NULL OR nip_koordinator = '') ORDER BY nama;\n";

process.stdout.write(sql);
