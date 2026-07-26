# ADR-0005 — Lambdas outside the VPC, Aurora reached via RDS Data API

**Status:** Accepted
**Date:** 2026-07-25

## Context

[ADR-0001](0001-vector-store.md) selects Aurora Serverless v2. Aurora lives in a VPC. The
conventional pattern — attach Lambdas to the VPC and connect over the Postgres wire protocol —
carries consequences that conflict with two explicit project constraints:

- **N-09: idle infrastructure ≤ $25/month.** A VPC-attached Lambda that also needs Bedrock,
  DynamoDB, S3, and Secrets Manager requires either a NAT Gateway (~$32/month plus per-GB data
  processing) or a set of interface VPC endpoints (~$7/month each; Bedrock runtime, Secrets
  Manager, and any others). Either option consumes most or all of the budget before a single
  token is generated.
- **N-13: API p95 cold start ≤ 1.5 s.** VPC attachment adds ENI setup to cold starts. Modern
  Hyperplane ENIs have reduced this substantially, but it is not zero, and it applies to every
  function in the system.

There is also a connection-management problem: Aurora Serverless v2 at low ACU has a modest
connection ceiling, and a Distributed Map at concurrency 10 spawning Lambdas that each open a
pool is a well-known way to exhaust it — normally solved by adding RDS Proxy, which is another
component and another cost line.

## Options considered

### A — Lambdas in the VPC + NAT Gateway
- **Pros:** conventional; native protocol; full pgvector feature access.
- **Cons:** ~$32/month baseline plus data processing charges; NAT is a single point of failure
  unless duplicated per AZ, which doubles it; cold-start penalty.
- **Verdict:** rejected on cost. This alone breaks N-09.

### B — Lambdas in the VPC + interface endpoints (no NAT)
- **Pros:** no NAT; traffic stays on the AWS network; native protocol.
- **Cons:** one interface endpoint per service (~$7/month each) — Bedrock runtime, Secrets
  Manager, and more as the system grows; still a cold-start penalty; still needs RDS Proxy for
  connection management.
- **Verdict:** viable, and this is the **designated fallback**. Roughly $15–25/month plus
  RDS Proxy.

### C — Lambdas outside the VPC + RDS Data API
- **Pros:** no NAT, no VPC endpoints, no ENI cold-start penalty, no connection pooling problem
  (the Data API is stateless HTTPS); IAM-based authorisation rather than credential handling;
  built-in transaction support; markedly simpler infrastructure.
- **Cons:** per-call HTTP overhead versus a warm pooled connection; a response-size limit;
  results arrive as typed JSON rather than a native driver result set; not every Postgres
  feature is exposed.
- **Verdict:** accepted.

## Decision

**Lambdas run outside the VPC and reach Aurora through the RDS Data API.** Aurora is configured
with the Data API enabled and credentials in Secrets Manager, accessed by IAM.

## Rationale

The response-size limit is the obvious objection, so it is worth sizing precisely. The largest
query in the system returns 50 candidate chunks. At ~600 tokens (~2.4 KB) each, that is roughly
120 KB — comfortably inside the limit, **provided the `embedding` column is never selected
back**. A 1024-dimension float array per row across 50 rows would add megabytes and is the one
thing that could breach it. This is called out in
[06-data-model.md §3.2](../06-data-model.md) and enforced by a repository-layer rule: the
`embedding` column is never in a `SELECT` list.

On latency: the Data API adds per-call overhead. Retrieval issues two queries concurrently, so
the overhead is paid once in wall-clock terms, against a per-question budget of 45 seconds
dominated by generation. The trade is heavily favourable at this scale — but it is a *measured*
trade, not an assumed one. S5 explicitly instruments Data API overhead within the
`retrieve.*` spans.

The connection-pooling benefit is underrated. A stateless HTTPS interface removes an entire
class of failure — pool exhaustion under Distributed Map fan-out — that would otherwise require
RDS Proxy.

## Consequences

**Positive**
- No NAT Gateway. Roughly $32/month saved, and N-09 becomes achievable.
- No VPC cold-start penalty on any function.
- No connection pool management, no RDS Proxy, no pool-exhaustion failure mode.
- IAM-based database authorisation; no long-lived database credentials in application code.
- Substantially less infrastructure to define, secure, and reason about.

**Negative**
- Per-call HTTP overhead on every query.
- Response-size limit constrains query design — a real constraint that must be respected.
- Result sets are JSON-typed, so the repository layer does explicit type mapping.
- `COPY`, `LISTEN/NOTIFY`, and some session-level features are unavailable.
- Bulk indexing during ingestion must batch through the Data API rather than stream.

**Makes harder later**
- Moving to a VPC-attached architecture means adding endpoints, RDS Proxy, and connection
  management. Well-understood work, but not free.

## Revisit when

- `retrieve.*` spans show Data API overhead exceeding **300 ms at p95**, or
- Any required query cannot be expressed within the response-size limit, or
- Bulk ingestion throughput becomes a bottleneck in S5 profiling.

In any of those cases, the fallback is **Option B**: Lambdas in the VPC, gateway endpoints for
S3 and DynamoDB (free), interface endpoints only for Bedrock and Secrets Manager, and RDS Proxy
for connection management — explicitly **not** a NAT Gateway.

Either way the decision is measured and documented, which makes it an asset rather than an
assumption.
