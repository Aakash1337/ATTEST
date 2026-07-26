# ADR-0004 — Step Functions Distributed Map for run fan-out

**Status:** Accepted
**Date:** 2026-07-25

## Context

A run resolves 100–300 questionnaire items. Each item takes 15–45 seconds and makes several
Bedrock calls. The orchestration must provide:

- Execution well beyond Lambda's 15-minute ceiling (200 items × 20 s sequential ≈ 67 minutes).
- **Bounded concurrency**, as the backpressure lever against Bedrock quotas.
- **Per-item retry** with different backoff for throttling than for generic errors.
- **Partial-failure isolation** — item 147 failing must not affect the other 199.
- Visible state, so "what is this run doing right now" is answerable without log archaeology.
- Cancellation and selective resume of failed items.

## Options considered

### A — Loop inside a single Lambda
- **Cons:** exceeds the 15-minute ceiling; one failure kills the run; no visibility; no
  concurrency control.
- **Verdict:** rejected outright.

### B — SQS queue + Lambda consumers
- **Pros:** natural concurrency control via reserved concurrency; retries and DLQ built in.
- **Cons:** run-level completion detection requires a separate counter and is racy at scale;
  cancellation means draining a queue; no execution-level visibility; "which items are
  outstanding" needs to be reconstructed.
- **Verdict:** viable but weaker on exactly the properties that matter for a bounded batch.

### C — Step Functions inline `Map`
- **Cons:** limited to 40 concurrent iterations and constrained by the 256 KB state payload
  limit — 200 items with their results will not fit.
- **Verdict:** rejected on limits.

### D — Step Functions **Distributed Map**
- **Pros:** designed for large item sets; concurrency cap as a first-class setting; per-item
  retry policy; `ToleratedFailurePercentage` for partial-failure isolation; results written to
  S3 so payload limits do not apply; execution history gives per-item visibility;
  cancellation is a single API call.
- **Cons:** child-execution accounting adds cost (small at this scale); state machine
  definitions are more work to test than application code; debugging state machines is less
  pleasant than debugging code.

### E — Container on ECS/Fargate with a worker pool
- **Pros:** full control, familiar programming model.
- **Cons:** reintroduces "what happens on partial failure" as an application concern; always-on
  cost unless carefully managed; more infrastructure to secure and operate.

## Decision

**Step Functions Distributed Map**, with the per-item agent loop in a Lambda invoked by the Map.

Configuration:

| Setting | Value | Why |
|---|---|---|
| `MaxConcurrency` | 10, tuned from 5 | Backpressure against Bedrock quotas |
| `ToleratedFailurePercentage` | 100 | One bad item never aborts the run |
| Item retry | 3 attempts, exponential backoff + jitter | Throttling gets a longer backoff |
| `ResultWriter` | S3 | Results exceed state payload limits |
| Item timeout | 300 s | Above the agent's wall-clock budget |

## Rationale

`MaxConcurrency` is the deciding property. It is a single declarative number that bounds
pressure on Bedrock, and it can be tuned against observed `ThrottlingException` counts without
touching application code. In the SQS design the equivalent lever is reserved concurrency plus
visibility-timeout tuning, which is more moving parts for the same outcome.

`ToleratedFailurePercentage: 100` combined with per-item results in S3 gives partial-failure
isolation and selective resume almost for free — both are explicit requirements (F-309, F-310)
that would otherwise be bespoke code.

Execution visibility matters operationally: when a run is slow, the execution history shows
which items are in flight and which have retried, without needing a query across logs.

## Consequences

**Positive**
- Concurrency is a tuned parameter with a dashboard metric next to it.
- Partial failure is the default behaviour, not an implementation.
- Run state is inspectable in the console during an incident.
- Cancellation and resume are straightforward.

**Negative**
- State machine definitions need their own tests (CDK assertions + a `sfn-local` style check).
- Child execution accounting adds a small per-run cost.
- Debugging inside a Map iteration is less ergonomic than debugging a local loop.

**Makes harder later**
- Streaming per-item progress to a client is awkward; the API polls instead. Accepted, and
  documented as a limitation in [02-architecture.md §7](../02-architecture.md).

## Revisit when

- Runs routinely exceed 1,000 items, or
- Per-item results grow large enough that S3 round-trips dominate item latency, or
- Real-time progress streaming becomes a requirement rather than a nicety.
