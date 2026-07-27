/**
 * CI guard: every table with a tenant_id column has RLS ENABLEd and FORCEd.
 *
 * Static form of the check — it reads the migrations rather than a live database, so it
 * runs on every PR without infrastructure. The live equivalent runs against the deployed
 * stack in the isolation suite (rls_coverage view, migration 002).
 *
 * The first draft of the schema applied RLS to `chunk` only, leaving the searchable
 * `prior_answer` table unprotected. This exists so that cannot recur silently.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'packages/adapters/migrations'
const sql = readdirSync(DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(DIR, f), 'utf8'))
  .join('\n')

// Tables declaring a tenant_id column.
const tenantScoped = new Set()
const tableRe = /CREATE TABLE IF NOT EXISTS (\w+) \(([\s\S]*?)\n\);/g
let m
while ((m = tableRe.exec(sql)) !== null) {
  if (/\btenant_id\s+text\b/.test(m[2] ?? '')) tenantScoped.add(m[1])
}

// Tables covered by the RLS loop in 002.
const covered = new Set()
const arrayRe = /tables text\[\] :=\s*ARRAY\[([\s\S]*?)\]/
const arrayMatch = arrayRe.exec(sql)
if (arrayMatch) {
  for (const t of (arrayMatch[1] ?? '').matchAll(/'(\w+)'/g)) covered.add(t[1])
}

const missing = [...tenantScoped].filter((t) => !covered.has(t))

if (tenantScoped.size === 0) {
  console.error('FAIL: no tenant-scoped tables found — the parser is broken')
  process.exit(1)
}

if (missing.length > 0) {
  console.error('FAIL: tenant-scoped tables without RLS coverage:\n')
  for (const t of missing) console.error(`  ${t}`)
  console.error('\nAdd them to the tables[] array in 002_rls.sql.')
  process.exit(1)
}

console.log(
  `PASS  rls-coverage: ${tenantScoped.size} tenant-scoped tables ` +
    `(${[...tenantScoped].join(', ')}) all covered`,
)
