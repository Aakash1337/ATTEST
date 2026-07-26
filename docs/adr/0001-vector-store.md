# ADR-0001 — Aurora Serverless v2 + pgvector as the vector store

**Status:** Accepted
**Date:** 2026-07-25

## Context

Retrieval must satisfy four constraints simultaneously:

1. **Hybrid search** — vector KNN *and* BM25-style full-text, because compliance questions
   mix semantic phrasing ("do you protect data at rest") with exact identifiers ("CC6.1",
   "AC-2") that embeddings handle poorly.
2. **Hard predicates on tenant and ACL, applied inside the search** — not as a post-filter.
   Post-filtering is both a security risk and a silent recall regression, because permitted
   results that fell below the pre-filter cut are lost.
3. **Near-zero idle cost.** The system must sit deployed and demonstrable for months. Anything
   with a meaningful idle floor is unusable.
4. **Transactional index updates**, so retrieval never observes a half-indexed document or a
   mix of document versions.

## Options considered

### A — Amazon OpenSearch Serverless
- **Pros:** purpose-built hybrid search, strong filtering, managed.
- **Cons:** minimum capacity units impose a floor of roughly hundreds of dollars per month
  while idle.
- **Verdict:** rejected on cost. The idle bill alone exceeds the entire project budget.

### B — Bedrock Knowledge Bases
- **Pros:** fastest path to working retrieval; chunking, embedding, and search are managed.
- **Cons:** it is a managed black box over precisely the components that constitute the
  engineering work here — chunking strategy, hybrid fusion weights, ACL filter placement.
- **Verdict:** rejected. See [ADR-0002](0002-own-the-pipeline.md).

### C — Aurora Serverless v2 PostgreSQL + pgvector
- **Pros:** vector KNN (HNSW), full-text (`tsvector`/GIN), and SQL predicates in one query
  plan; row-level security available as defence in depth; transactional writes; scales down
  when idle; familiar operational model.
- **Cons:** HNSW recall/latency requires tuning (`m`, `ef_construction`, `ef_search`); pgvector
  is less specialised than a dedicated engine at very large scale; the VPC requirement needs a
  separate answer (see [ADR-0005](0005-data-access-path.md)).
- **Verdict:** accepted.

### D — S3 Vectors
- **Pros:** potentially the cheapest option by a wide margin.
- **Cons:** GA status and feature completeness need verification; no co-located full-text
  search, so hybrid would require a second system.
- **Verdict:** deferred. Benchmark as a S5 cost experiment and publish the comparison.

## Decision

**Aurora Serverless v2 PostgreSQL with pgvector**, using HNSW for vector search and a GIN index
over a generated `tsvector` column for full-text.

## Rationale

The deciding factor is constraint 2. Putting `tenant_id = $1 AND acl_tags && $2` in the same
`WHERE` clause as the vector ordering means the permission boundary is enforced by the index
scan itself. Every alternative either applies filters as a separate layer or requires trusting
a managed service's filter semantics with tenant data.

Corpus scale is roughly 3,000–10,000 chunks per tenant. That is well within the range where
pgvector's HNSW performs comfortably, and far below the scale at which a specialised engine
would justify its cost.

Constraint 4 comes free with Postgres. In a separate vector service it would need to be
engineered.

## Consequences

**Positive**
- One query plan for hybrid search, filtering, and ordering.
- Row-level security available as a second, independent enforcement layer.
- Real SQL for eval tooling, debugging, and ad-hoc corpus analysis.
- Idle cost is a tunable parameter rather than a fixed floor.

**Negative**
- HNSW parameters must be tuned and their values recorded alongside every recall metric — a
  recall number without its `ef_search` is not reproducible.
- Aurora resume latency after idle is user-visible on the first request.
- Aurora normally implies a VPC, which forces a separate networking decision.
- pgvector will not scale to millions of chunks per tenant without revisiting.

**Makes harder later**
- Migrating to a dedicated vector engine would mean rebuilding hybrid fusion and re-proving the
  ACL filtering guarantees.

## Revisit when

- Any tenant's corpus exceeds ~500,000 chunks, or
- p95 vector-search latency exceeds 500 ms at the tuned recall target, or
- S3 Vectors reaches GA with a co-located full-text story and a materially better cost profile.
