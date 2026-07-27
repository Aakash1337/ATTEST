/**
 * CI guard: every query touching tenant-scoped tables filters by tenant AND acl inside
 * the SQL, never afterwards in application code.
 *
 * Post-filtering is a security bug AND a silent recall regression — permitted results
 * that fell below the pre-filter cut are simply lost. This is non-negotiable rule #1 in
 * the README, so it is enforced mechanically rather than by review discipline.
 *
 * docs/03-retrieval-spec.md §2.2, docs/07-security-threat-model.md §4 layer 3.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'

const SEARCH_DIRS = ['packages', 'scripts/spikes']
const GUARDED_TABLES = ['chunk', 'prior_answer', 'live_evidence']

// Migrations define the tables; they are not queries against them.
const EXEMPT = [/migrations[\\/]/, /\.test\.ts$/, /check-sql-predicates\.mjs$/]

function walk(dir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(ts|mjs|js|sql)$/.test(p)) out.push(p)
  }
  return out
}

/** Pull out SELECT statements that read from a guarded table. */
function selectsAgainstGuardedTables(source) {
  const statements = []
  const re = /SELECT[\s\S]*?(?:;|`|$)/gi
  for (const m of source.match(re) ?? []) {
    const from = /\bFROM\s+([a-z_]+)/i.exec(m)
    if (from && GUARDED_TABLES.includes((from[1] ?? '').toLowerCase())) {
      statements.push(m)
    }
  }
  return statements
}

const violations = []
for (const dir of SEARCH_DIRS) {
  for (const file of walk(dir)) {
    if (EXEMPT.some((re) => re.test(file))) continue
    const source = readFileSync(file, 'utf8')

    for (const stmt of selectsAgainstGuardedTables(source)) {
      const hasTenant = /\btenant_id\s*=/.test(stmt)
      const hasAcl = /\bacl_tags\s*&&/.test(stmt)
      if (!hasTenant || !hasAcl) {
        const missing = [
          !hasTenant ? 'tenant_id =' : null,
          !hasAcl ? 'acl_tags &&' : null,
        ].filter(Boolean)
        violations.push(
          `${relative('.', file)}: SELECT missing ${missing.join(' and ')}\n` +
            `      ${stmt.replace(/\s+/g, ' ').slice(0, 120)}…`,
        )
      }
    }
  }
}

if (violations.length > 0) {
  console.error('FAIL: retrieval queries must filter tenant and ACL inside the SQL.\n')
  for (const v of violations) console.error('  ' + v)
  process.exit(1)
}

console.log(
  `PASS  sql-predicates: all SELECTs against [${GUARDED_TABLES.join(', ')}] ` +
    'filter tenant_id and acl_tags in-query',
)
