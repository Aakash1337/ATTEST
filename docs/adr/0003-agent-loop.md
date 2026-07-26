# ADR-0003 — Hand-written agent control loop, no framework

**Status:** Accepted
**Date:** 2026-07-25

## Context

Each questionnaire item is resolved by a multi-step agent: plan, retrieve, optionally call
tools, generate, self-critique, ground-check, emit or abstain. Frameworks exist that provide
this shape out of the box.

The loop has hard requirements that are unusual:

- A **hard token budget** per item, enforced mid-loop, because 200 items × an unbounded loop is
  an unbounded bill.
- A **turn ceiling** with a deterministic terminal state when hit.
- **Structured, model-recoverable tool errors**, with a counter that fails the item
  deterministically after three invalid attempts.
- A **grounding score that is control flow**, not logging — it decides between emitting an
  answer and emitting a gap.
- Every stage emitting **OTel spans and EMF cost metrics** with specific attribute names.

## Options considered

### A — An agent framework
- **Pros:** faster start; tool-calling plumbing provided; community patterns.
- **Cons:**
  - Token accounting is typically per-call, not a mid-loop budget that can halt execution.
  - Tool-error handling is usually retry-until-success or fail, not a counted, structured
    recovery path.
  - Instrumentation must be threaded through abstractions not designed to expose it.
  - Framework upgrades can silently change loop semantics, which would invalidate every
    recorded eval baseline.
  - The abstraction hides exactly the decisions this project exists to demonstrate.

### B — Bedrock Agents (managed)
- **Pros:** fully managed orchestration and tool invocation.
- **Cons:** the loop is not inspectable; grounding-as-control-flow and custom budgets are not
  expressible; per-stage cost attribution is not available at the granularity the cost model
  needs.
- **Verdict:** rejected for the same reason as [ADR-0002](0002-own-the-pipeline.md) — it
  manages the substance, not the incidental complexity.

### C — Hand-written loop over the Converse API
- **Pros:** every turn boundary, budget check, and stop condition is explicit code with a unit
  test; instrumentation goes exactly where it is needed; no dependency that can change loop
  semantics under us.
- **Cons:** ~200 lines to write and maintain; the tool-calling protocol must be handled
  correctly.

## Decision

**Hand-write the loop** over the Bedrock Converse API, in `packages/core/agent/`, with zero AWS
imports — the Bedrock client is injected as an interface, so the entire loop is unit-testable
with a fake.

## Rationale

The loop is approximately 200 lines. Every one of them corresponds to a decision that has to be
explainable and testable:

| Requirement | Why a framework makes it harder |
|---|---|
| Halt at 120k input tokens mid-loop | Needs accounting between turns, inside the loop |
| 3 invalid tool-arg attempts → `FAILED_TOOL_ARGS` | Needs a typed error taxonomy and a counter |
| Grounding score branches to GAP | Needs the guardrail response as a first-class loop value |
| Per-stage cost attribution | Needs instrumentation at every call site |

Writing it directly costs less than bending an abstraction into this shape, and the result is
readable by someone who has never seen the framework.

The tests in [04-agent-spec.md §10](../04-agent-spec.md) — loop terminates on turn ceiling,
terminates on token budget, recovers from invalid tool arguments, fails deterministically after
three — are only writable against an owned loop.

## Consequences

**Positive**
- The entire loop is unit-testable in milliseconds with an injected fake client.
- Budgets and stop conditions are enforced where they must be, with tests proving it.
- No dependency upgrade can silently change behaviour and invalidate eval baselines.
- The control flow is readable end to end in one file.

**Negative**
- The Converse tool-use protocol must be handled correctly, including multi-tool turns.
- Streaming (`ConverseStream`) for the review chat is a second code path.
- No community patterns to borrow from when something unusual comes up.

**Makes harder later**
- Adopting a framework afterwards would mean re-proving every budget and failure-path test.

## Revisit when

- The loop exceeds ~500 lines, or
- More than three distinct loop shapes are needed (at which point the abstraction is earned), or
- A framework appears that exposes mid-loop budget enforcement and typed tool-error recovery as
  first-class features.
