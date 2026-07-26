# 03 — Retrieval Specification

**Status:** Revised v2 · **Owns:** F-1xx, F-2xx
**Derives from:** [14-contracts.md](14-contracts.md)

This is the deepest part of the system. Everything downstream is capped by retrieval quality —
a perfect agent over bad evidence produces confident nonsense.

---

## 1. Ingestion pipeline

### 1.1 Parse (F-102, F-103)

| Format | Parser | Core? | Notes |
|---|---|---|---|
| PDF (text layer) | `pdf-parse` / `unpdf` | **Core** | Must retain page numbers |
| MD / TXT | Direct | **Core** | Heading levels from `#` depth |
| PDF (scanned) | Amazon Textract | *Extension* | Fallback when text density is below threshold |
| DOCX | `mammoth` → HTML → structured | *Extension* | Heading levels come from styles |

**Output contract** — parsing produces an ordered list of blocks:

```ts
type Block = {
  text: string
  headingPath: string[]   // ["Access Control Policy", "4. Authentication", "4.2 MFA"]
  page: number | null
  kind: "heading" | "paragraph" | "list" | "table" | "code"
}
```

Heading path and page number are not optional metadata — they are what makes a citation
clickable and auditable. A parser that loses them is a failed parser.

### 1.2 Structure-aware chunking (F-104)

Split on semantic boundaries, never on a fixed character count.

**Boundary precedence:**
1. Heading changes at any level
2. Numbered clause markers (`4.2`, `AC-2`, `CC6.1`, `§3`)
3. List-item groups
4. Paragraph boundaries (last resort)

**Constraints:**
- Target 400–800 tokens. Hard floor 100 (merge upward), hard ceiling 1000 (split at the
  nearest sentence boundary).
- 15% overlap between adjacent chunks within the same section.
- Never split mid-sentence.
- Tables stay whole if under the ceiling; otherwise split by row groups with the header row
  repeated.
- Every chunk inherits `headingPath`, `page`, and its **immutable** `documentVersionId`
  ([14-contracts.md §6](14-contracts.md)).

**Why this matters more than it looks:** compliance documents are dense with clause
identifiers, and a chunk that severs "4.2 MFA is required for..." from its clause number
becomes unciteable. Chunking quality is measured, not assumed — see §4.

### 1.3 Injection screening — before any LLM call (F-104a)

**This step sits between chunking and augmentation, and its position is a security control, not
a pipeline preference.** The corpus is untrusted by construction; contextual augmentation sends
chunk text to a model. Screening after augmentation would mean the first thing an injected
instruction reaches is an LLM.

```
PARSING → SCREENING ─┬─ clean ──▶ EMBEDDING (augment → embed → index)
                     └─ flagged ─▶ QUARANTINED ──human release──▶ EMBEDDING
```

- A cheap classifier flags chunks containing imperative second-person instructions, references
  to system prompts or prior instructions, or directives about how questionnaires should be
  answered.
- Flagging quarantines the **document version**, not the chunk: partial ingestion of a document
  containing an injection payload is worse than none.
- `screening_verdict`, `screening_reason`, `released_by`, and `released_at` are persisted
  ([06-data-model.md §3](06-data-model.md)).
- **Quarantined content is unreachable by retrieval** — it has no `active` chunks — until a human
  releases it, at which point it re-enters at `EMBEDDING`.
- The classifier is heuristic and is defence in depth. The primary controls remain role
  separation, fencing, output-schema validation, and the grounding check
  ([07-security-threat-model.md §5](07-security-threat-model.md)).

### 1.4 Contextual chunk augmentation (F-105)

Before embedding, generate one to two sentences of document-level context per chunk with a
cheap model and prepend it.

```
raw:            "This must be reviewed annually and approved by the CISO."

contextualised: "In Northwind Systems' Access Control Policy, section 4.2 covering MFA
                 enforcement for administrative accounts: This must be reviewed annually
                 and approved by the CISO."
```

This single technique typically produces the largest recall improvement in the entire
pipeline, because it repairs the anaphora problem — compliance prose is full of "this,"
"such systems," "the above" — that makes isolated chunks unretrievable.

**Implementation notes:**
- Use prompt caching so the source document is not re-sent for every chunk. This is the
  difference between a viable and a ruinous ingest cost.
- Store both `raw_text` and `contextualised_text`. Embed the contextualised form; **display
  and cite the raw form**, so a reviewer never sees model-generated words presented as
  policy text.
- The augmentation prompt is versioned. Changing it requires a full reindex, which is a
  scheduled operation, not a side effect.

### 1.5 Embed (F-106)

Candidates: **Titan Text Embeddings v2** and **Cohere Embed v3**.

Run a bake-off on the golden set in S2 and record dimensions, index build time, storage
cost, recall@10, and cost per million tokens in a table in `docs/optimizations.md`. Pick on
the number, not the reputation.

- Batch embedding calls; cache by `sha256(contextualised_text + model_id)` so re-ingests and
  re-runs are free.
- The embedding model ID is stored on the chunk row. Mixing embedding models within one index
  is a correctness bug — a model change means a reindex, gated by a migration.

### 1.6 Index (F-106, F-108)

Full DDL is in [06-data-model.md §3](06-data-model.md) and is authoritative. The two properties
that matter here:

**Chunks belong to an immutable `document_version`, not to a document.** A chunk row is never
mutated after insert; only `active` flips. That is what lets a citation resolve to the exact text
that was in context when an answer was generated, months after the policy was updated
([ADR-0006](adr/0006-evidence-identity.md)).

**Activation is one transaction** — insert the new version and its chunks, mark the previous
version `SUPERSEDED`, deactivate its chunks, repoint `document.current_version_id`. Retrieval
never observes a half-indexed document or a mix of versions.

Two code paths with deliberately different rules:

| Path | Filter |
|---|---|
| **Retrieval** | `active = true` — never answer from a superseded policy |
| **Citation resolution** | ignores `active` entirely — historical answers stay verifiable forever |

---

## 2. Query pipeline

### 2.1 Query understanding (F-201, F-202)

Questionnaire items are frequently compound:

> "Do you encrypt data at rest and in transit, and who manages the encryption keys?"

That is three retrieval targets. A single embedding of the whole sentence retrieves the
centroid of three topics, which matches nothing well.

**Decomposition:** cheap model, structured output, max 4 sub-queries.
**Rewriting:** each sub-query rewritten into declarative retrieval-friendly phrasing
("encryption of data at rest" rather than "do you encrypt data at rest").

Both the original and the derived queries are persisted with the answer, because eval needs to
attribute a failure to decomposition rather than to search.

### 2.2 Hybrid search (F-203, F-204)

Two branches, executed concurrently, per sub-query.

**Vector branch:**
```sql
SELECT chunk_id, 1 - (embedding <=> $query_vec) AS score
FROM chunk
WHERE tenant_id = $tenant
  AND active
  AND acl_tags && $caller_tags
ORDER BY embedding <=> $query_vec
LIMIT 50;
```

**Full-text branch:**
```sql
SELECT chunk_id, ts_rank_cd(tsv, websearch_to_tsquery('english', $q)) AS score
FROM chunk
WHERE tenant_id = $tenant
  AND active
  AND acl_tags && $caller_tags
  AND tsv @@ websearch_to_tsquery('english', $q)
ORDER BY score DESC
LIMIT 50;
```

> **The rule that cannot be broken:** `tenant_id` and `acl_tags` predicates live **inside** both
> queries. Retrieving broadly and filtering in application code is a security bug *and* a
> silent recall regression — you lose the permitted results that fell below the cut. A CI test
> statically asserts that every retrieval SQL statement in the repo contains both predicates.

#### Filtered approximate search — the recall trap

Putting the predicates inside the query is necessary but **not sufficient**. HNSW is an
approximate index: it walks a neighbour graph and the `WHERE` clause is applied to what the walk
visits. When a caller's permitted set is a small fraction of the corpus — which is exactly the
restricted-document case the security model is built around — the walk can spend its whole
budget on inaccessible neighbours and return **fewer than `LIMIT` permitted rows, or none at
all**.

That failure looks identical to "the corpus has nothing relevant." It would silently convert a
permission boundary into a recall collapse, and the abstention rate would rise for reasons
nobody could attribute.

**Policy** (specified in [ADR-0007](adr/0007-filtered-vector-search.md), spiked in S0 week 1):

1. Enable pgvector **iterative index scans**, so the scan continues past filtered rows rather
   than returning a short result set.
2. Set `ef_search` per query, scaled by the selectivity of the caller's ACL set — a narrow tag
   set needs a wider search.
3. **Shortfall retry:** if a branch returns fewer than `k` permitted candidates, retry once at a
   higher `ef_search`; if it still falls short, fall back to an exact scan bounded by the tenant
   predicate. Log the escalation as a metric.
4. **Record `ef_search`, the iterative-scan setting, and any escalation with every retrieval
   metric.** A recall number without them is not reproducible.
5. Measured continuously by `shortfallRate` in the isolation suite
   ([08-evaluation-spec.md §3.3](08-evaluation-spec.md)), gated at ≤ 0.02, with adversarial
   fixtures where restricted and cross-tenant chunks deliberately surround the best permitted
   match.

**Fusion — Reciprocal Rank Fusion:**

```
RRF(d) = Σ over branches b of  1 / (k + rank_b(d)),  k = 60
```

RRF over score normalisation because the two branches produce incomparable score scales, and
RRF only needs ranks. `k = 60` is the conventional starting point and is a tuned parameter —
record any change with a before/after nDCG.

Results across sub-queries are merged by max-RRF per chunk, then deduplicated.

### 2.3 Rerank (F-205)

Cohere Rerank on Bedrock over the top 50 fused candidates; keep the top 8.

Reranking is the most expensive retrieval stage in both latency and dollars. It ships **only
if** it earns its cost:

| Measure | Requirement to keep it |
|---|---|
| nDCG@10 improvement | ≥ +0.05 absolute on the golden set |
| Added p95 latency | ≤ 800 ms |

If it fails either bar, it is disabled behind a flag and the negative result is written up in
`optimizations.md`. A documented rejected optimisation is worth more than an undocumented
accepted one.

**Week 1 check:** confirm Cohere Rerank availability in the target region. If unavailable,
the fallback is an LLM-based listwise reranker on the Haiku tier, benchmarked identically.

### 2.4 Context assembly (F-206, F-207)

1. Sort survivors by final relevance.
2. Collapse near-duplicates (cosine > 0.97) keeping the highest-ranked, recording the
   collapsed IDs so citations remain complete.
3. Pack under an explicit token budget (default 6000 tokens for evidence), stopping at the
   last chunk that fits whole — never truncate a chunk mid-clause.
4. Assign each surviving passage a stable citation ID `C1`, `C2`, … and persist the
   `C{n} → chunk_id` mapping with the answer.
5. Render each passage with its provenance visible to the model:

```
<evidence id="C3" doc="Access Control Policy v3" section="4.2 MFA" page="11">
The raw chunk text, verbatim, unmodified.
</evidence>
```

Evidence is passed in a **data channel with fenced delimiters and IDs**, never concatenated
into the system prompt. That fence is a security control, not formatting — see
[07-security-threat-model.md](07-security-threat-model.md).

---

## 3. Permission model in retrieval

The caller's API key resolves to `{ tenant_id, acl_tags[] }`. A chunk is visible iff:

```
chunk.tenant_id = caller.tenant_id
AND chunk.acl_tags && caller.acl_tags     -- array overlap: any tag in common
AND chunk.active
```

Defence in depth: Postgres row-level security is enabled on `chunk` with a policy keyed to a
session variable set by the data-access layer. The application-layer predicate is the primary
control; RLS catches the case where someone writes a query that forgets it.

**Two tests that must exist and must be in CI:**
1. Tenant B cannot retrieve tenant A's chunk, even when it is the single best semantic match.
2. A restricted document is invisible to an unprivileged caller within the same tenant, even
   when it is the single best semantic match — and the caller receives the next-best permitted
   result rather than an empty response.

---

## 4. Retrieval metrics (F-702)

Measured **independently of generation**. This separation is the whole point.

Retrieval is scored by **three separate suites with three different metric sets**, because
questions with no correct answer and questions testing a permission boundary cannot be scored
the same way as ordinary lookups. Full definitions and fixture formats are in
[08-evaluation-spec.md §3](08-evaluation-spec.md); the summary:

| Suite | Queries | Metrics | Key gate |
|---|---|---|---|
| **Relevance** — have gold chunks | ~110 | recall@5/10/20, MRR, nDCG@10, per-category breakdown | recall@10 ≥ 0.85 |
| **Rejection** — no supporting evidence | ~20 | `retrievalRejectionRate`, `falseEvidenceRate` | rejection ≥ 0.80 |
| **Isolation** — permission boundary | ~20 | `authorisedRecall@10`, `leakageCount`, `shortfallRate` | leakage = 0 |

**Rejection queries have no gold chunks, so recall, MRR, and nDCG are undefined for them and are
not computed.** Nearest-neighbour search always returns something; the meaningful question is
whether what it returns clears a usable-evidence bar. That is what makes downstream abstention
predictable instead of accidental.

Stage latency (p50/p95 for decompose, vector, fts, fuse, rerank, assemble) is reported for all
three suites: p95 total ≤ 3 s.

**Hard cases the relevance suite must contain:**
- Near-miss distractors requiring different evidence (encryption at rest vs in transit vs key
  management)
- Answers that live in a table, not prose
- Answers requiring two documents combined
- Contradictions where the current version must outrank the superseded one

**Cases that belong in the *rejection* suite, not the relevance suite:**
- Questions with genuinely no supporting evidence in the corpus (ISO 27001, insider-threat
  programme, MFA for standard users)

---

## 5. Operating rules

1. **Never change retrieval and generation in the same commit.** One concern per PR, enforced
   in self-review. Violating this makes every subsequent metric movement unattributable.
2. **No optimisation lands without a before number** in `docs/optimizations.md`.
3. **Golden sets are reviewed like code.** Never regenerated silently.
4. **Reindex is a migration**, with a version bump and a documented procedure in the runbook.

---

## 6. Planned experiments (S2)

Each becomes one row in `docs/optimizations.md` with hypothesis, before, after, decision.

| # | Experiment | Hypothesis |
|---|---|---|
| E1 | Fixed-size vs structure-aware chunking | Structure-aware improves recall@10 by ≥ 0.05 |
| E2 | With vs without contextual augmentation | Largest single gain in the pipeline |
| E3 | Titan v2 vs Cohere Embed v3 | Within noise; pick on cost |
| E4 | Vector-only vs hybrid + RRF | Hybrid wins on clause-ID and acronym queries specifically |
| E5 | With vs without reranking | +nDCG, but check the latency bill |
| E6 | RRF `k` sweep (20 / 60 / 100) | Marginal; document that it is marginal |
| E7 | Query decomposition on vs off | Large gain on compound questions, neutral elsewhere |
