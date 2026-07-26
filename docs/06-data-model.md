# 06 — Data Model

**Status:** Revised v2 (supersedes v1) · **Derives from:** [14-contracts.md](14-contracts.md)

v1 gave `document` a single-row primary key with `version` as a column, which cannot represent
two coexisting versions — while the API exposed `supersedes` and citations carried
`documentVersion`. A citation could not be pinned to the version it cited, which breaks the
audit story. That is corrected here. RLS is also extended to every tenant-scoped table, not just
`chunk`.

---

## 1. Access patterns

| # | Pattern | Index | Key condition |
|---|---|---|---|
| A1 | Get tenant metadata | Main | `PK=TENANT#{tid}`, `SK=META` |
| A2 | List a tenant's documents | Main | `PK=TENANT#{tid}`, `SK begins_with DOC#` |
| A3 | Get one document | Main | `PK=TENANT#{tid}`, `SK=DOC#{documentId}` |
| A4 | List a tenant's runs, newest first | GSI1 | `GSI1PK=TENANT#{tid}#RUN` |
| A5 | Get one run | Main | `PK=TENANT#{tid}`, `SK=RUN#{runId}` |
| A6 | List all answers in a run, in order | Main | `PK=RUN#{runId}`, `SK begins_with ANS#` |
| A7 | Get one answer | Main | `PK=RUN#{runId}`, `SK=ANS#{seq}` |
| A8 | List gaps in a run | GSI2 | `GSI2PK=RUN#{runId}#GAP` |
| A9 | List answers pending review | GSI2 | `GSI2PK=RUN#{runId}#PENDING` |
| A10 | List in-flight items (for the cancel sweeper) | GSI2 | `GSI2PK=RUN#{runId}#IN_PROGRESS` |
| A11 | Conversation messages, chronological | Main | `PK=CONV#{convId}`, `SK begins_with MSG#` |
| A12 | Feedback for a run | Main | `PK=RUN#{runId}`, `SK begins_with FB#` |
| A13 | Feedback awaiting golden-set promotion | GSI2 | `GSI2PK=FEEDBACK#UNPROMOTED` |
| A14 | Runs in progress (ops) | GSI2 | `GSI2PK=RUN#IN_PROGRESS` |
| A15 | Resolve an API key to a caller context | Main | `PK=KEY#{sha256}`, `SK=META` |
| A16 | Check an idempotency key | Main | `PK=IDEM#{tid}#{key}`, `SK=META` |
| A17 | Get questionnaire items | Main | `PK=QST#{qstId}`, `SK begins_with ITM#` |
| A18 | **Resolve a citation to its exact evidence version** | *Postgres* | `chunk_id` → `document_version_id`, ignoring `active` |
| A19 | Resolve a live-evidence citation | *Postgres* | `live_evidence.evidence_id` |
| A20 | Look up an approved prior answer *(extension)* | *Postgres* | Hybrid search over `prior_answer` |

A18 and A19 are the audit path and must work forever, including for superseded documents and
stale observations.

---

## 2. DynamoDB single table

**Table:** `attest-{env}` · On-demand · PITR on · TTL attribute `ttl`

| Entity | PK | SK | GSI1PK / GSI1SK | GSI2PK / GSI2SK |
|---|---|---|---|---|
| Tenant | `TENANT#{tid}` | `META` | — | — |
| API key | `KEY#{hash}` | `META` | — | — |
| Document | `TENANT#{tid}` | `DOC#{documentId}` | `TENANT#{tid}#DOC` / `{createdAt}` | — |
| Questionnaire | `TENANT#{tid}` | `QST#{qstId}` | — | — |
| Questionnaire item | `QST#{qstId}` | `ITM#{seq:06d}` | — | — |
| Run | `TENANT#{tid}` | `RUN#{runId}` | `TENANT#{tid}#RUN` / `{createdAt}` | `RUN#{status}` / `{createdAt}` |
| Answer | `RUN#{runId}` | `ANS#{seq:06d}` | — | `RUN#{runId}#{status}` / `{seq:06d}` |
| Conversation | `CONV#{convId}` | `META` | — | — |
| Message | `CONV#{convId}` | `MSG#{ts}#{ulid}` | — | — |
| Feedback | `RUN#{runId}` | `FB#{seq:06d}#{ts}` | — | `FEEDBACK#{UNPROMOTED\|PROMOTED}` / `{ts}` |
| Export | `TENANT#{tid}` | `EXP#{exportId}` | — | — |
| Idempotency | `IDEM#{tid}#{key}` | `META` | — | — (24 h TTL) |

Notes:
- `seq` is zero-padded to six digits so lexicographic ordering equals numeric ordering.
- Answers are keyed under `RUN#` because every access is run-scoped, keeping partitions bounded
  at ~300 items.
- GSI2 is overloaded across four purposes. Overloading is fine; *undocumented* overloading is
  not, hence this table.
- Document *versions* live in Postgres, not DynamoDB — the DynamoDB `DOC#` record is the logical
  document with a pointer to the current version.
- **Every write path takes `CallerContext` as its first argument** and derives `tenantId` from
  it. There is no overload without it, so a forgotten tenant is a compile error.

### 2.1 Run and Answer shapes

```ts
type RunItem = {
  PK: `TENANT#${string}`; SK: `RUN#${string}`
  entity: "RUN"
  runId: string; tenantId: string; questionnaireId: string
  status: RunStatus
  generation: number                    // fence — see 14-contracts.md §4
  counts: { total; pending; inProgress; answered; gap; cancelled; failed }
  cost: { totalUsd: number; estimateUsd: number; estimateAcceptedUsd?: number
          byStage: Record<string, number>
          tokens: { input: number; output: number; cached: number } }
  config: { groundingThreshold: number; maxConcurrency: number; enableLiveTools: boolean }
  corpusVersion: string; promptVersions: Record<string,string>
  executionArn: string; traceId: string
  createdAt: string; startedAt?: string; completedAt?: string
}

type AnswerItem = {
  PK: `RUN#${string}`; SK: `ANS#${string}`
  entity: "ANSWER"
  answerId: string; itemId: string; seq: number; tenantId: string
  status: ItemStatus                    // includes PENDING, IN_PROGRESS, CANCELLED
  runGeneration: number                 // conditional-write fence
  attempt: number
  reviewState: ReviewState
  responseEnum?: "YES" | "NO" | "NA"
  text?: string
  citations?: Citation[]                // documents AND live observations
  confidence?: { band: "HIGH"|"MEDIUM"|"LOW"; score: number }
  groundingScore?: number
  reason?: string; missingEvidence?: string; nearestEvidenceIds?: string[]
  toolCalls: Array<{ name: string; outcome: "OK"|"INVALID_ARGS"|"ERROR"; durationMs: number }>
  budget: { turnsUsed: number; inputTokens: number; outputTokens: number; wallClockMs: number }
  promptVersion: string; modelIds: Record<string,string>
  revision: number
  costUsd: number
  traceId: string
  createdAt: string; updatedAt: string
}

type Citation = {
  citationId: string                    // "C3", stable within this answer
  evidenceId: string                    // chunkId, or ev_… for live
  kind: "DOCUMENT" | "LIVE_OBSERVATION"
  // denormalised for display without a join:
  documentTitle?: string; documentVersionId?: string
  headingPath?: string[]; page?: number | null; quote?: string
  source?: string; check?: string; observedAt?: string
}
```

### 2.2 Conditional writes

Every item write carries the fence:

```
ConditionExpression:
  attribute_not_exists(runGeneration) OR runGeneration <= :myGeneration
```

A worker dispatched under generation 1 cannot overwrite a result written after a cancel bumped
the run to generation 2. Proven by a race test ([14-contracts.md §4](14-contracts.md)).

### 2.3 Cost rollup

200 items completing concurrently must not contend on one counter. Each item writes its own
cost; the run total comes from the Distributed Map aggregation at completion, with a
best-effort atomic `ADD` for live progress. The aggregation is authoritative.

---

## 3. Postgres schema

Aurora Serverless v2 PostgreSQL with `pgvector`, via the RDS Data API.

```sql
CREATE EXTENSION IF NOT EXISTS vector;

-- Logical document identity. Stable across versions.
CREATE TABLE document (
  document_id        uuid PRIMARY KEY,
  tenant_id          text NOT NULL,
  title              text NOT NULL,
  doc_type           text NOT NULL,
  current_version_id uuid,                    -- FK added after document_version exists
  created_at         timestamptz NOT NULL DEFAULT now()
);

-- IMMUTABLE once INDEXED. This is what a citation is pinned to.
CREATE TABLE document_version (
  document_version_id uuid PRIMARY KEY,
  document_id         uuid NOT NULL REFERENCES document(document_id),
  tenant_id           text NOT NULL,
  version             int  NOT NULL,
  status              text NOT NULL,          -- DocumentStatus
  acl_tags            text[] NOT NULL,
  content_hash        text NOT NULL,
  source_etag         text,
  screening_verdict   text,                   -- CLEAN | FLAGGED
  screening_reason    text,
  released_by         text,                   -- set when a human releases a quarantine
  released_at         timestamptz,
  superseded_by       uuid REFERENCES document_version(document_version_id),
  failure_reason      text,
  ingested_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version),
  UNIQUE (tenant_id, content_hash)
);

ALTER TABLE document ADD CONSTRAINT document_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES document_version(document_version_id);

-- IMMUTABLE. Only `active` ever changes.
CREATE TABLE chunk (
  chunk_id            uuid PRIMARY KEY,
  document_version_id uuid NOT NULL REFERENCES document_version(document_version_id),
  tenant_id           text NOT NULL,
  ordinal             int  NOT NULL,
  acl_tags            text[] NOT NULL,
  heading_path        text[] NOT NULL,
  page                int,
  raw_text            text NOT NULL,          -- what is quoted and cited
  contextualised_text text NOT NULL,          -- what is embedded
  token_count         int NOT NULL,
  embedding           vector(1024) NOT NULL,
  tsv                 tsvector GENERATED ALWAYS AS
                        (to_tsvector('english', contextualised_text)) STORED,
  embed_model_id      text NOT NULL,
  active              boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- IMMUTABLE. Minted when a live tool returns, before the model sees the result.
CREATE TABLE live_evidence (
  evidence_id   uuid PRIMARY KEY,
  tenant_id     text NOT NULL,
  acl_tags      text[] NOT NULL,
  source        text NOT NULL,                -- 'aws_config'
  check_name    text NOT NULL,
  scope         jsonb NOT NULL,               -- { accountAlias, region }
  result        jsonb NOT NULL,               -- { compliant, ruleName, resourceCounts }
  rendered_text text NOT NULL,                -- fed to grounding, shown to users
  observed_at   timestamptz NOT NULL,
  stale_after   timestamptz NOT NULL
);

-- Extension, not core.
CREATE TABLE prior_answer (
  prior_id      uuid PRIMARY KEY,
  tenant_id     text NOT NULL,
  acl_tags      text[] NOT NULL,
  question_text text NOT NULL,
  answer_text   text NOT NULL,
  approved_at   timestamptz NOT NULL,
  run_id        text NOT NULL,
  embedding     vector(1024) NOT NULL,
  tsv           tsvector GENERATED ALWAYS AS
                  (to_tsvector('english', question_text)) STORED
);

CREATE INDEX chunk_embedding_hnsw ON chunk USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
CREATE INDEX chunk_tsv_gin        ON chunk USING gin (tsv);
CREATE INDEX chunk_acl_gin        ON chunk USING gin (acl_tags);
CREATE INDEX chunk_tenant_active  ON chunk (tenant_id, active) WHERE active;
CREATE INDEX chunk_version        ON chunk (document_version_id);
CREATE INDEX live_ev_tenant       ON live_evidence (tenant_id, observed_at DESC);
```

### 3.1 Version activation — one transaction

```sql
BEGIN;
  INSERT INTO document_version (...) VALUES (...);           -- status INDEXED
  INSERT INTO chunk (...) SELECT ...;                        -- active = true
  UPDATE document_version SET status = 'SUPERSEDED', superseded_by = :new
    WHERE document_version_id = :old;
  UPDATE chunk SET active = false WHERE document_version_id = :old;
  UPDATE document SET current_version_id = :new WHERE document_id = :doc;
COMMIT;
```

Retrieval never observes a half-indexed document or a mix of versions.

### 3.2 Row-level security — every tenant-scoped table

v1 enabled RLS on `chunk` only, leaving `document`, `document_version`, `live_evidence`, and the
searchable `prior_answer` unprotected.

```sql
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['document','document_version','chunk','live_evidence','prior_answer']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE  ROW LEVEL SECURITY', t);
    EXECUTE format($f$CREATE POLICY %1$I_tenant_isolation ON %1$I
                      USING (tenant_id = current_setting('attest.tenant_id', true))$f$, t);
  END LOOP;
END $$;
```

The data-access layer sets `attest.tenant_id` on every Data API transaction. The application
predicate remains the primary control; RLS catches the query that forgets it. A CI test asserts
every table with a `tenant_id` column has RLS enabled **and** forced — new tables cannot silently
opt out.

The static predicate check covers `chunk`, `prior_answer`, **and** `live_evidence`.

### 3.3 Query rules

- **Never select `embedding` back.** 1024 floats × 50 rows is what turns a 120 KB Data API
  response into a limit breach. Enforced by a repository-layer rule and a lint check.
- `ef_search` is set per query and **recorded with every retrieval metric**. A recall number
  without its `ef_search` is not reproducible. See
  [ADR-0007](adr/0007-filtered-vector-search.md).
- Citation resolution (A18) queries by `chunk_id` and **ignores `active`**. Retrieval filters
  `active = true`. These are different code paths with different rules and must not be shared.

---

## 4. S3 layout

```
attest-{env}-corpus/
  tenants/{tid}/raw/{documentId}/v{n}/{filename}
  tenants/{tid}/parsed/{documentVersionId}/blocks.json
  tenants/{tid}/questionnaires/{qstId}/{filename}     original workbook — the export template
  tenants/{tid}/exports/{exportId}/{filename}

attest-{env}-traces/
  runs/{runId}/items/{seq}.json          full LLM IO, KMS-encrypted, 90-day lifecycle

attest-{env}-sfn-results/
  runs/{runId}/…                         Distributed Map result writer
```

Bucket policies deny cross-prefix access via IAM conditions on `s3:prefix`. Traces are separately
encrypted and separately expiring because they hold the document text deliberately kept out of
CloudWatch.

The original questionnaire workbook is retained permanently — it is the template that makes
formatting-preserving export possible.

---

## 5. Migrations and reindexes

- SQL migrations in `packages/adapters/postgres/migrations/`, forward-only, numbered, applied by
  a CDK custom resource on deploy. Each is idempotent and re-runnable.
- **A reindex is not a migration.** It is a runbook operation with dual-write, backfill, verify,
  and cut-over steps, an expected duration, and a cost. Drilled once in S5 with a stated
  RTO/RPO (R-17).
- Embedding-model and chunking-strategy changes both force a reindex and both bump
  `corpus_version`, which is recorded on every run and every eval result.
- **Reindexing never mutates existing chunks.** It creates new `document_version` rows and
  activates them, so citations made before the reindex still resolve.
