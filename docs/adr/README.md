# Architecture Decision Records

One record per decision that would otherwise be re-litigated. Numbered, immutable once
accepted, **superseded rather than edited**.

Target: 8–12 by project end, **including the rejections**. A rejected option with a recorded
rationale demonstrates judgement better than a chosen one.

## Index

| # | Title | Status | Date |
|---|---|---|---|
| [0001](0001-vector-store.md) | Aurora Serverless v2 + pgvector as the vector store | Accepted | 2026-07-25 |
| [0002](0002-own-the-pipeline.md) | Own the retrieval pipeline rather than use Bedrock Knowledge Bases | Accepted | 2026-07-25 |
| [0003](0003-agent-loop.md) | Hand-written agent control loop, no framework | Accepted | 2026-07-25 |
| [0004](0004-orchestration.md) | Step Functions Distributed Map for run fan-out | Accepted | 2026-07-25 |
| [0005](0005-data-access-path.md) | Lambdas outside the VPC, Aurora via RDS Data API | Accepted | 2026-07-25 |
| [0006](0006-evidence-identity.md) | Immutable evidence identity for documents and live observations | Accepted | 2026-07-25 |
| [0007](0007-filtered-vector-search.md) | Filtered approximate search policy | Accepted *(pending S0 spike)* | 2026-07-25 |
| 0008 | Aurora idle-cost go/no-go *(S0 week 1 outcome)* | Proposed | — |
| 0009 | Single-table DynamoDB design | Proposed | — |
| 0010 | Grounding threshold as control flow, not a warning | Proposed | — |
| 0011 | Hybrid search with RRF over score normalisation | Proposed | — |
| 0012 | Embedding model selection *(after the S2 bake-off)* | Proposed | — |
| 0013 | Reranking: keep or drop *(after measurement)* | Proposed | — |
| 0014 | Confidence score composition | Proposed | — |

## Template

```markdown
# ADR-000N — Title

**Status:** Proposed | Accepted | Superseded by ADR-000M
**Date:** YYYY-MM-DD
**Deciders:** …

## Context
What forces are at play. What constraint makes this a decision rather than a default.

## Options considered
### Option A — …
Pros / Cons / Cost / Risk

### Option B — …
Pros / Cons / Cost / Risk

## Decision
What was chosen, stated plainly.

## Rationale
Why, tied to the forces in Context. Include the numbers if numbers exist.

## Consequences
### Positive
### Negative
### What this makes harder later

## Revisit when
The specific condition that would reopen this decision.
```

## Rules

1. Write the ADR **when the decision is made**, not retrospectively. A retrospective ADR is a
   justification, and it reads like one.
2. Record the options that were rejected, with real reasons — "we didn't like it" is not a
   reason.
3. Include numbers wherever numbers exist. An ADR asserting "faster" without a measurement is
   an opinion with formatting.
4. Never edit an accepted ADR. Supersede it with a new one and link both ways.
5. Every ADR ends with a **Revisit when** condition. A decision with no reopening condition is
   dogma.
