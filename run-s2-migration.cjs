const fs = require('fs');
const { Client } = require('pg');
const dns = require('dns');

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ2ZnlsanV1Y2htdXluYmtxY3pwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4Mzg4MjI3MiwiZXhwIjoyMDk5NDU4MjcyfQ.BeCAQyWm6Tp6VzL0q4ZnNq0GAcExuodjle1thT3W2zM';

const sql = fs.readFileSync('supabase/migrations/20260719_create_s2_module.sql', 'utf8');

(async () => {
  const host = '2406:da18:e5c:b701:a206:5b8f:2272:d380';
  console.log('Using DB host literal:', host);

  const client = new Client({
    host,
    port: 5432,
    user: 'postgres',
    password: SERVICE_KEY,
    database: 'postgres',
    family: 6,
    ssl: { rejectUnauthorized: true },
  });

  try {
    await client.connect();
    console.log('Connected to new project DB.');
    await client.query(sql);
    console.log('Migration applied successfully.');
    const res = await client.query(
      "select table_name from information_schema.tables where table_schema='public' and table_name like 's2_%' order by table_name"
    );
    console.log('s2 tables:', res.rows.map((r) => r.table_name).join(', '));
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
