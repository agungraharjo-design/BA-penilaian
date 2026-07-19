const { randomUUID } = require('crypto');
const id = randomUUID();

const sql = `INSERT INTO sessions (id, nama, nim, peminatan, judul_skripsi, penguji1, penguji2, penguji3, pembimbing)
VALUES (
  '${id}',
  'Alif Indah Melani',
  '2210713120',
  'Administrasi & Kebijakan Kesehatan (2022)',
  'Analisis Ketersediaan Obat Dan Barang Medis Habis Pakai Serta Dampaknya Terhadap Efektivitas Pelayanan Farmasi Di RS X',
  'Dr. Apriningsih, S.K.M., M.K.M.',
  'Apt. Riswandy Wasir, M.P.H., PhD',
  'Cahya Arbitera, S.K.M., M.K.M.',
  'Cahya Arbitera, S.K.M., M.K.M.'
);`;

process.stdout.write(sql);
