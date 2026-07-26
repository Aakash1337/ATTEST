# 02 — Architecture

**Status:** Revised v2

---

## 1. System shape

```
  ┌──────────┐   PutObject           ┌──────────────────────────────────┐
  │ Client   │──────────────────────▶│ S3  tenants/{tid}/raw/…          │
  │ (CLI/UI) │                       └───────────────┬──────────────────┘
  └────┬─────┘                                       │ EventBridge
       │                              ┌──────────────▼──────────────────┐
       │                              │ Ingestion Step Function          │
       │                              │  parse → chunk → contextualise   │
       │                              │  → embed → index                 │
       │                              └──────────────┬──────────────────┘
       │                                             ▼
       │                       ┌───────────────────────────────────────┐
       │                       │ Aurora Serverless v2 · PostgreSQL     │
       │                       │  pgvector HNSW  +  tsvector GIN       │
       │                       │  every row: tenant_id, acl_tags[]     │
       │                       │  reached via RDS Data API (no VPC)    │
       │                       └───────────────▲───────────────────────┘
       │                                       │
       │  POST /runs      ┌─────────┐   ┌──────┴───────┐
       └─────────────────▶│ API GW  │──▶│ API Lambdas  │
                          │ (HTTP)  │   └──────┬───────┘
                          └─────────┘          │ StartExecution
                                        ┌──────▼──────────────────────────┐
                                        │ Run Step Function                │
                                        │  Distributed Map, conc ≤ 10      │
                                        │    per item → Resolver Lambda    │
                                        │      plan → retrieve → tools     │
                                        │      → Converse + Guardrail      │
                                        │      → critique → ground-check   │
                                        │      → emit answer | GAP         │
                                        └──────┬──────────────────────────┘
                                               ▼
   ┌────────────────────────────┐      ┌───────────────────────────┐
   │ DynamoDB (single table)    │◀────▶│ Review API + chat (SSE)   │
   │ tenants, docs, runs,       │      │ ConverseStream            │
   │ answers, conversations,    │      └───────────────────────────┘
   │ feedback, idempotency      │
   └────────────────────────────┘

   Every step emits OTel spans → X-Ray.  Every LLM call emits EMF metrics:
   tokens in/out, model id, $ cost, cache hits, grounding score, latency.
```

---

## 2. Component decisions

### 2.1 Compute — Lambda, Node 22, TypeScript, esbuild

Thin handlers; all logic in pure modules in `packages/core` with zero AWS imports. That
constraint is what makes the interesting logic testable in milliseconds without mocks.

### 2.2 Orchestration — Step Functions Distributed Map

A 200-question run exceeds Lambda's 15-minute ceiling and needs per-item retry, partial
failure isolation, and visible state. Distributed Map gives all three plus a concurrency cap,
which is the backpressure lever against Bedrock throttling.

The alternative — a loop in a long-running container — cannot answer "what happens when item
147 fails on attempt 2." See [ADR-0004](adr/0004-orchestration.md).

**Concurrency is a tuned parameter, not a constant.** Start at 5, raise while watching
`ThrottlingException` counts, settle where throttles are near zero. Record the tuning in
`docs/optimizations.md`.

### 2.3 The agent loop — hand-written, inside a Lambda

One Lambda invocation per questionnaire item, called by the Map. Inside it is an explicit
control loop over the Bedrock Converse API: plan, tool call, observe, repeat, with a max turn
count, a hard token budget, and structured stop conditions.

**No agent framework.** The loop is ~200 lines and every line is a decision we need to be able
to explain and test. Frameworks hide exactly the parts that matter here — turn limits, token
accounting, tool-error recovery. See [ADR-0003](adr/0003-agent-loop.md).

### 2.4 Vector store — Aurora Serverless v2 PostgreSQL + pgvector

Chosen because it puts vector KNN, BM25-style full-text search, and hard SQL predicates for
`tenant_id` and `acl_tags` in a single query plan. That last property is the security
requirement: filtering happens in the index scan, not after.

**Rejected — OpenSearch Serverless.** Minimum capacity units make it cost hundreds of dollars
a month idle. That is incompatible with a project that must sit deployed and cheap.

**Rejected — Bedrock Knowledge Bases.** It is a managed black box over exactly the parts of
the system that are the point: chunking strategy, hybrid fusion, and ACL filtering. Evaluating
it and choosing to own the pipeline is a stronger position than using it.

See [ADR-0001](adr/0001-vector-store.md) and [ADR-0002](adr/0002-own-the-pipeline.md).

**Verify before committing:** current Aurora Serverless v2 minimum-ACU behaviour (scale-to-zero
availability and resume latency), and whether S3 Vectors has reached GA. If it has, benchmark
it as a cost experiment and write up the comparison — the comparison is itself an asset.

### 2.5 Data access path — RDS Data API, Lambdas outside the VPC

This is a correction to the original plan and it matters.

Putting Lambdas in a VPC to reach Aurora means either a NAT Gateway (~$32/month plus data
processing, which alone breaks the idle budget) or a set of interface VPC endpoints for
Bedrock, Secrets Manager, and friends (~$7/month each, and they add up). It also adds ENI
attachment to cold starts.

Instead: reach Aurora over the **RDS Data API**, an HTTPS endpoint. Lambdas stay outside the
VPC, keep fast cold starts, reach Bedrock and DynamoDB directly, and there is no NAT.

**Trade-offs, documented:** Data API has a result-size limit and adds per-call overhead versus a
pooled connection. Our largest result is ~50 chunks of ~600 tokens ≈ 120 KB — comfortably
inside the limit, provided **we never select the embedding column back**. If S5
benchmarking shows Data API latency is a material share of p95, the fallback is VPC-attached
Lambdas plus RDS Proxy plus gateway endpoints for S3/DynamoDB and interface endpoints only for
Bedrock. That is a S5 decision with a measurement behind it. See
[ADR-0005](adr/0005-data-access-path.md).

### 2.6 Models — routed by job

| Job | Model class | Rationale |
|---|---|---|
| Query rewrite, decomposition, routing, classification | Haiku tier | High volume, trivial task, an order of magnitude cheaper |
| Chunk contextualisation at ingest | Haiku tier + prompt caching | Runs once per chunk across the whole corpus |
| Answer generation | Sonnet tier | Quality where it is user-visible and legally consequential |
| Self-critique | Sonnet tier | Needs to actually catch unsupported claims |
| LLM-as-judge in evals | Different model family from the generator | Avoids self-preference bias |

Every routing decision must be backed by a measured quality delta on the golden set before it
ships. "We used a cheaper model here" without a number is not an optimisation, it is a guess.

**Week 1 action:** request model access for every model above in the target region, and file
on-demand quota increases. Lead time is days, and discovering this in S3 stalls the build.

### 2.7 Guardrails — Bedrock Guardrails on the Converse call

Content filters, PII/sensitive-information filter, denied topics, and critically the
**contextual grounding check**, which scores whether the response is supported by the supplied
source passages.

The grounding score is not a log line. It is the control-flow branch:

```
score ≥ threshold  → emit ANSWERED with citations and confidence
score <  threshold → emit GAP with reason + missingEvidence
```

That turns a compliance checkbox into the core product behaviour.

### 2.8 State — DynamoDB single table

Access patterns are written down before the table exists; see
[06-data-model.md](06-data-model.md). Single-table because the access patterns are known,
bounded, and mostly "give me everything under this run."

### 2.9 Ingestion trigger

`S3 PutObject` → EventBridge rule → ingestion Step Function. Idempotent by content hash, so
re-uploads cost nothing.

### 2.10 Review UI

A minimal Vite + React SPA, static-hosted on S3 behind CloudFront, talking to the same public
API. No SSR, no framework beyond React and a table component. It exists to make the demo real
and to make review ergonomic enough that feedback actually gets captured. It is explicitly not
a product surface.

---

## 3. Request paths

### 3.1 Ingestion (async)
```
Client → POST /documents            → presigned S3 URL + document record (PENDING_UPLOAD)
Client → PUT  {presigned}           → object lands in tenants/{tid}/raw/
S3 → EventBridge → SFN Ingestion:
     PARSING → SCREENING ─┬─ flagged ─▶ QUARANTINED   (no active chunks; awaits human release)
                          └─ clean ───▶ EMBEDDING: contextualise (Map) → embed (batched)
                                        → INDEXED via the version-activation transaction
     → or FAILED with reason
```

**Screening precedes any LLM call.** Untrusted document text is never sent for contextual
augmentation before injection screening ([03-retrieval-spec.md §1.3](03-retrieval-spec.md)).

### 3.2 Questionnaire (async)
```
Client → POST /questionnaires       → presigned S3 URL + record (PENDING_UPLOAD)
Client → PUT  {presigned}           → NORMALISING → NORMALISED | FAILED
```

**Normalisation happens once, at upload — never at run creation.** The original draft of this
document said `POST /runs` normalises the workbook; that was wrong and
[14-contracts.md §3.2](14-contracts.md) supersedes it.

### 3.3 Run (async, fan-out)
```
Client → POST /runs {questionnaireId, idempotencyKey, acceptEstimateUsd?}
     → reject unless questionnaire is NORMALISED
     → estimate cost; reject if over cap without explicit acceptance
     → load persisted QuestionnaireItem[] → StartExecution
SFN Run:
     Distributed Map (conc ≤ 10) over items → Resolver Lambda per item
     → per-item write to DynamoDB → aggregate counts + cost rollup → run COMPLETE
Client → GET /runs/{id}              → status + counts + cost
Client → GET /runs/{id}/answers      → paged answers
```

### 3.4 Review chat (sync, streaming)
```
Client → POST /answers/{id}/messages  (Accept: text/event-stream)
     → load conversation window → retrieve → ConverseStream → SSE tokens
     → on completion: re-ground, persist revised answer + new citation set
```

---

## 4. Environments

| Env | Purpose | Deploy trigger | Data |
|---|---|---|---|
| `dev` | Day-to-day | Merge to `main` | Synthetic Northwind corpus |
| `prod` | Demo / any real use | Manual approval gate | Same corpus, separate account or separate stack |

Single AWS region. One CDK app, environment-parameterised. No shared resources between
environments — separate Aurora clusters, separate tables, separate buckets.

Deployment safety: Lambda alias weighted routing for canary, CloudWatch alarm-triggered
automatic rollback, `cdk diff` posted as a PR comment before any infra change merges.

---

## 5. Cross-cutting concerns

| Concern | Approach |
|---|---|
| Config | Environment variables from CDK; nothing read from SSM at request time on the hot path |
| Secrets | Secrets Manager, fetched at cold start, cached in module scope, rotated |
| Idempotency | DynamoDB conditional writes on an idempotency key for `POST /runs` and document ingestion |
| Retries | Step Functions retry with exponential backoff and jitter on throttling; Bedrock throttles get a longer backoff than generic errors |
| Poison items | After N attempts, item lands as `FAILED` with the error captured; run continues; failed items are individually resumable |
| Timeouts | Resolver Lambda 5 min; API Lambdas 29 s (API Gateway ceiling); ingestion parse 10 min |
| Tracing | ADOT layer, OTel spans; one trace per question, parent trace per run |
| Versioning | Prompts carry an ID and version; every answer records the prompt version and model IDs used |

---

## 6. Technology summary

| Layer | Choice |
|---|---|
| Language | TypeScript, Node 22 |
| IaC | AWS CDK (TypeScript) |
| Compute | Lambda |
| Orchestration | Step Functions (Standard; Distributed Map for run fan-out) |
| API | API Gateway HTTP API |
| Relational + vector | Aurora Serverless v2 PostgreSQL, pgvector, RDS Data API |
| Document/state store | DynamoDB single table |
| Object store | S3 |
| Models | Amazon Bedrock (Converse / ConverseStream), Bedrock Guardrails |
| Embeddings | Titan Text Embeddings v2 vs Cohere Embed v3 — bake-off in S2 |
| Reranking | Cohere Rerank on Bedrock (verify regional availability in Week 1) |
| Events | EventBridge |
| Observability | OTel/ADOT → X-Ray; CloudWatch EMF metrics; CloudWatch dashboards + alarms |
| Testing | Vitest, `aws-sdk-client-mock`, `aws-cdk-lib/assertions` |
| CI/CD | GitHub Actions, OIDC federation to AWS, SHA-pinned actions |
| UI | Vite + React, S3 + CloudFront |
| Spreadsheets | `exceljs` for CAIQ/SIG read and formatting-preserving write-back |

---

## 7. Known limitations (v1, accepted)

- Single region; no DR story beyond backups.
- No SSO; API keys only.
- Aurora resume latency on the first request after idle is user-visible.
- One live tool integration (AWS Config). Everything else is corpus-grounded.
- No streaming of run progress — polling only. Chat streams; runs do not.
