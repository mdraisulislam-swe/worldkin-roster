import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
export async function freshDb(migDir) {
  const db = new PGlite({ extensions: { btree_gist } });
  await db.exec(readFileSync(new URL('./supabase_stub.sql', import.meta.url), 'utf8'));
  const files = readdirSync(migDir).filter(f => f.endsWith('.sql') && !f.includes('_storage')).sort(); // storage schema exists only on Supabase
  const applied = [];
  for (const f of files) {
    const sql = readFileSync(join(migDir, f), 'utf8');
    try { await db.exec('begin;\n' + sql + '\ncommit;'); applied.push(f); }
    catch (e) { await db.exec('rollback').catch(() => {}); return { db, applied, failed: f, error: e.message }; }
  }
  return { db, applied };
}
if (process.argv[2]) {
  const r = await freshDb(process.argv[2]);
  console.log('applied:', r.applied);
  if (r.failed) { console.log('FAILED:', r.failed, '\n  ', r.error); process.exit(1); }
  const q = async s => (await r.db.query(s)).rows;
  console.log('tables:', (await q(`select count(*)::int n from pg_tables where schemaname='public'`))[0].n,
    '| rls on:', (await q(`select count(*)::int n from pg_tables where schemaname='public' and rowsecurity`))[0].n,
    '| policies:', (await q(`select count(*)::int n from pg_policies where schemaname='public'`))[0].n,
    '| functions:', (await q(`select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where nspname='public'`))[0].n,
    '| triggers:', (await q(`select count(*)::int n from pg_trigger where not tgisinternal`))[0].n);
}
