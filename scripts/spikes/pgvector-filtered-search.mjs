/**
 * S0 SPIKE — filtered approximate search under a restrictive ACL predicate.
 * Closes the go/no-go in docs/adr/0007-filtered-vector-search.md.
 *
 * THE QUESTION
 * HNSW is approximate: the scan walks a neighbour graph and the WHERE clause is applied
 * to what the walk visits. When a caller's permitted set is a small fraction of the
 * corpus — exactly the restricted-document case the security model is built around —
 * the walk can spend its budget on inaccessible neighbours and return FEWER than LIMIT
 * permitted rows, or none.
 *
 * That failure is silent and indistinguishable from a genuine evidence gap: retrieval
 * returns little, the agent correctly abstains, nothing errors, and the abstention rate
 * rises for unattributable reasons. A security control would be CAUSING wrong product
 * behaviour while appearing to work.
 *
 * THE EXPERIMENT
 * Build an adversarial corpus where the nearest neighbours of the query are almost all
 * forbidden, and the permitted matches sit further out. Then compare:
 *   A. exact scan            (ground truth, no index)
 *   B. HNSW, default         (iterative scan off)
 *   C. HNSW, iterative scan  (the proposed mitigation)
 * measuring shortfall (returned < k when >= k exist) and recall against A.
 *
 * Run:  node scripts/spikes/pgvector-filtered-search.mjs
 * Requires Docker. Starts and removes its own container.
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import pg from 'pg'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = resolve(HERE, '../..')
const CONTAINER = 'attest-spike-pgvector'
const PORT = 55432
const DIM = 1024
const K = 10

const TOTAL_CHUNKS = 60_000
const PERMITTED_RATIO = 0.02 // caller may see 2% of the corpus — a realistic restricted case

const sh = (cmd, opts = {}) =>
  execSync(cmd, { stdio: 'pipe', encoding: 'utf8', ...opts }).trim()

function log(...a) {
  console.log(...a)
}

async function main() {
  log('▶ S0 spike: pgvector filtered approximate search\n')

  startContainer()
  const client = await connectWithRetry()

  try {
    await applyMigrations(client)
    const { queryVec, permittedTag } = await seed(client)
    const results = await measure(client, queryVec, permittedTag)
    report(results)
  } finally {
    await client.end()
    stopContainer()
  }
}

function startContainer() {
  try {
    sh(`docker rm -f ${CONTAINER}`)
  } catch {
    /* not running */
  }
  log(`  starting pgvector container on :${PORT} …`)
  sh(
    `docker run -d --name ${CONTAINER} -e POSTGRES_PASSWORD=spike ` +
      `-e POSTGRES_DB=attest -p ${PORT}:5432 pgvector/pgvector:pg16`,
  )
}

function stopContainer() {
  log('\n  removing container …')
  try {
    sh(`docker rm -f ${CONTAINER}`)
  } catch {
    /* already gone */
  }
}

async function connectWithRetry() {
  const cfg = {
    host: 'localhost',
    port: PORT,
    user: 'postgres',
    password: 'spike',
    database: 'attest',
  }
  for (let attempt = 1; attempt <= 40; attempt++) {
    const client = new pg.Client(cfg)
    try {
      await client.connect()
      log('  connected\n')
      return client
    } catch {
      await client.end().catch(() => {})
      await new Promise((r) => setTimeout(r, 750))
    }
  }
  throw new Error('postgres did not become ready')
}

async function applyMigrations(client) {
  for (const f of ['001_init.sql', '002_rls.sql', '003_indexes.sql']) {
    const sql = readFileSync(resolve(REPO, 'packages/adapters/migrations', f), 'utf8')
    await client.query(sql)
    log(`  applied ${f}`)
  }

  const cov = await client.query('SELECT * FROM rls_coverage ORDER BY table_name')
  const bad = cov.rows.filter((r) => !r.compliant)
  log(
    `  RLS coverage: ${cov.rows.length} tenant-scoped tables, ` +
      `${bad.length === 0 ? 'all compliant' : `NON-COMPLIANT: ${bad.map((b) => b.table_name)}`}`,
  )
  if (bad.length > 0) throw new Error('RLS coverage check failed')
}

/** Deterministic pseudo-random unit vector — no Math.random, so the spike is repeatable. */
function seededVector(seed) {
  let s = seed >>> 0
  const v = new Array(DIM)
  let norm = 0
  for (let i = 0; i < DIM; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    const x = (s / 0xffffffff) * 2 - 1
    v[i] = x
    norm += x * x
  }
  norm = Math.sqrt(norm)
  return v.map((x) => x / norm)
}

/** Blend toward a target so we can place chunks at controlled distances from the query. */
function blend(base, target, alpha) {
  const v = base.map((x, i) => x * (1 - alpha) + target[i] * alpha)
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0))
  return v.map((x) => x / n)
}

async function seed(client) {
  log(`\n  seeding ${TOTAL_CHUNKS} chunks (${Math.round(PERMITTED_RATIO * 100)}% permitted) …`)

  const tenantId = 't_northwind'
  const permittedTag = 'internal'
  const forbiddenTag = 'restricted'
  const queryVec = seededVector(1)

  // Prefixed ULIDs per docs/14-contracts.md §1 — the schema CHECKs enforce the format.
  const docId = `doc_01J${'0'.repeat(22)}1`
  const dvId = `dv_01J${'0'.repeat(22)}2`

  await client.query(`SET attest.tenant_id = '${tenantId}'`)
  await client.query(
    `INSERT INTO document (document_id, tenant_id, title, doc_type)
     VALUES ($1,$2,'Spike Corpus','POLICY') ON CONFLICT DO NOTHING`,
    [docId, tenantId],
  )
  await client.query(
    `INSERT INTO document_version
       (document_version_id, document_id, tenant_id, version, status, acl_tags, content_hash, ingested_at)
     VALUES ($1,$2,$3,1,'INDEXED',$4,'sha256:spike',now()) ON CONFLICT DO NOTHING`,
    [dvId, docId, tenantId, [permittedTag, forbiddenTag]],
  )

  // ADVERSARIAL LAYOUT: forbidden chunks are packed closest to the query; permitted
  // chunks sit further out. This is docs/10-corpus-spec.md D9 turned into a benchmark.
  const rows = []
  for (let i = 0; i < TOTAL_CHUNKS; i++) {
    const permitted = i % Math.round(1 / PERMITTED_RATIO) === 0
    // permitted → weaker blend (further); forbidden → stronger blend (nearer)
    const alpha = permitted ? 0.55 : 0.9 - (i / TOTAL_CHUNKS) * 0.25
    const vec = blend(seededVector(i + 1000), queryVec, alpha)
    rows.push({
      id: uuidFor(i),
      permitted,
      vec,
    })
  }

  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH)
    const values = []
    const params = []
    slice.forEach((r, j) => {
      const b = j * 8
      values.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},'titan-v2',true)`,
      )
      params.push(
        r.id,
        dvId,
        't_northwind',
        i + j,
        [r.permitted ? permittedTag : forbiddenTag],
        ['Spike', `Clause ${i + j}`],
        `chunk ${i + j} body text for the spike corpus`,
        `[${r.vec.join(',')}]`,
      )
    })
    await client.query(
      `INSERT INTO chunk (chunk_id, document_version_id, tenant_id, ordinal, acl_tags,
                          heading_path, raw_text, contextualised_text, token_count,
                          embedding, embed_model_id, active)
       SELECT v.chunk_id, v.dv, v.t, v.ord, v.acl, v.hp, v.raw, v.raw, 120, v.emb, 'titan-v2', true
       FROM (VALUES ${slice
         .map((_, j) => {
           const b = j * 8
           return `($${b + 1}::text,$${b + 2}::text,$${b + 3}::text,$${b + 4}::int,$${b + 5}::text[],$${b + 6}::text[],$${b + 7}::text,$${b + 8}::vector)`
         })
         .join(',')}) AS v(chunk_id, dv, t, ord, acl, hp, raw, emb)`,
      params,
    )
  }

  await client.query('ANALYZE chunk')
  const { rows: cnt } = await client.query(
    `SELECT count(*) FILTER (WHERE acl_tags && ARRAY['internal']) AS permitted,
            count(*) AS total
     FROM chunk
     WHERE tenant_id = 't_northwind' AND acl_tags && ARRAY['internal','restricted']`,
  )
  log(`  seeded: ${cnt[0].total} total, ${cnt[0].permitted} permitted\n`)

  return { queryVec, permittedTag }
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Deterministic, format-valid chunk ULID for the spike corpus. */
function uuidFor(i) {
  let n = i
  let suffix = ''
  for (let k = 0; k < 10; k++) {
    suffix = CROCKFORD[n % 32] + suffix
    n = Math.floor(n / 32)
  }
  // 3 + 13 + 10 = 26 chars, Crockford base32 (no I, L, O, U).
  return `chk_01J${'0'.repeat(13)}${suffix}`
}

const FILTERED_SQL = `
  SELECT chunk_id, 1 - (embedding <=> $1::vector) AS score
  FROM chunk
  WHERE tenant_id = $2 AND active AND acl_tags && $3
  ORDER BY embedding <=> $1::vector
  LIMIT ${K}`

/**
 * Extract the scan node actually chosen. Without this the spike is worthless: if the
 * planner picks a bitmap/seq scan the results are exact by construction, recall is
 * trivially 100%, and we would have "measured" HNSW without ever executing it.
 */
async function planFor(client, args) {
  const { rows } = await client.query(`EXPLAIN (FORMAT JSON) ${FILTERED_SQL}`, args)
  const plan = JSON.stringify(rows[0]['QUERY PLAN'])
  if (plan.includes('chunk_embedding_hnsw')) return 'HNSW'
  if (plan.includes('Bitmap')) return 'Bitmap'
  if (plan.includes('Seq Scan')) return 'SeqScan'
  return 'Other'
}

async function measure(client, queryVec, permittedTag) {
  const v = `[${queryVec.join(',')}]`
  const args = [v, 't_northwind', [permittedTag]]

  // A — ground truth: exact scan, all indexes disabled.
  await client.query('SET enable_indexscan = off')
  await client.query('SET enable_bitmapscan = off')
  const t0 = performance.now()
  const exact = await client.query(FILTERED_SQL, args)
  const exactMs = performance.now() - t0
  await client.query('RESET enable_indexscan')
  await client.query('RESET enable_bitmapscan')
  const truth = exact.rows.map((r) => r.chunk_id)
  const truthScores = exact.rows.map((r) => Number(r.score))

  // What does the planner choose when left alone?
  const naturalPlan = await planFor(client, args)

  // B/C — HNSW specifically. seqscan/bitmapscan are disabled so the vector index is
  // actually exercised; otherwise the planner sidesteps the very behaviour under test.
  const off = await runHnsw(client, args, 'off')
  const on = await runHnsw(client, args, 'relaxed_order')

  return { truth, truthScores, exactMs, naturalPlan, off, on }
}

async function runHnsw(client, args, iterativeMode) {
  const out = { iterativeSupported: true }
  await client.query('SET enable_seqscan = off')
  await client.query('SET enable_bitmapscan = off')

  try {
    await client.query(`SET hnsw.iterative_scan = ${iterativeMode}`)
  } catch {
    out.iterativeSupported = false
  }

  for (const ef of [40, 100, 400]) {
    await client.query(`SET hnsw.ef_search = ${ef}`)
    const plan = await planFor(client, args)
    const t = performance.now()
    const res = await client.query(FILTERED_SQL, args)
    out[ef] = {
      returned: res.rows.length,
      ids: res.rows.map((r) => r.chunk_id),
      scores: res.rows.map((r) => Number(r.score)),
      ms: performance.now() - t,
      plan,
    }
  }

  await client.query('RESET hnsw.ef_search')
  await client.query('RESET enable_seqscan')
  await client.query('RESET enable_bitmapscan')
  try {
    await client.query('RESET hnsw.iterative_scan')
  } catch {
    /* older pgvector */
  }
  return out
}

function mean(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

function recall(ids, truth) {
  if (truth.length === 0) return 1
  const t = new Set(truth)
  return ids.filter((i) => t.has(i)).length / truth.length
}

function report({ truth, truthScores, exactMs, naturalPlan, off, on }) {
  log('─'.repeat(74))
  log('RESULT — filtered HNSW under a 2% permitted ACL set, k=10')
  log('─'.repeat(74))
  log(
    `  A. exact scan (ground truth): ${truth.length} rows, ` +
      `meanScore=${mean(truthScores).toFixed(4)}, top=${truthScores[0].toFixed(4)}, ` +
      `${exactMs.toFixed(0)}ms\n`,
  )

  const row = (label, r) =>
    `  ${label.padEnd(28)} returned=${String(r.returned).padStart(2)}/${K}  ` +
    `recall=${(recall(r.ids, truth) * 100).toFixed(0).padStart(3)}%  ` +
    `meanScore=${r.scores.length ? mean(r.scores).toFixed(4) : ' n/a  '}  ` +
    `${String(r.ms.toFixed(0)).padStart(4)}ms  [${r.plan}]` +
    (r.returned < K ? '   ← SHORTFALL' : '')

  log(`  Planner's natural choice (no hints): ${naturalPlan}
`)
  log('  B. iterative_scan = off   [seqscan+bitmap disabled to force the vector index]')
  for (const ef of [40, 100, 400]) log(row(`     ef_search=${ef}`, off[ef]))
  log('\n  C. iterative_scan = relaxed_order   (ADR-0007 mitigation)')
  for (const ef of [40, 100, 400]) log(row(`     ef_search=${ef}`, on[ef]))

  const worstOff = Math.min(...[40, 100, 400].map((ef) => off[ef].returned))
  const worstOn = Math.min(...[40, 100, 400].map((ef) => on[ef].returned))
  const shortfallReproduced = worstOff < K
  const mitigationWorks = worstOn === K

  log('\n' + '─'.repeat(74))
  log(`  Shortfall reproduced without mitigation: ${shortfallReproduced ? 'YES' : 'NO'}`)
  log(`  Mitigation returns a full result set:    ${mitigationWorks ? 'YES' : 'NO'}`)
  log('─'.repeat(74))

  if (shortfallReproduced && mitigationWorks) {
    log('\n  VERDICT: GO. The failure mode is real and the ADR-0007 mitigation fixes it.')
    log('  Keep pgvector. Gate shortfallRate in the isolation suite as specified.')
  } else if (!shortfallReproduced) {
    log('\n  VERDICT: shortfall NOT reproduced at this corpus size / selectivity.')
    log('  The risk is not disproven — it scales with corpus size and filter selectivity.')
    log('  Keep the shortfallRate gate; re-run this spike as the corpus grows.')
  } else {
    log('\n  VERDICT: NO-GO. Mitigation did not restore a full result set.')
    log('  Reopen ADR-0001 before writing retrieval code.')
  }
  log('')
}

main().catch((e) => {
  console.error('\nSPIKE FAILED:', e.message)
  try {
    execSync(`docker rm -f ${CONTAINER}`, { stdio: 'ignore' })
  } catch {
    /* ignore */
  }
  process.exit(1)
})
