# ADR-0002 — Own the retrieval pipeline rather than use Bedrock Knowledge Bases

**Status:** Accepted
**Date:** 2026-07-25

## Context

Bedrock Knowledge Bases would provide ingestion, chunking, embedding, vector storage, and
retrieval as a managed service. Adopting it would remove most of S1 and much of S2
from the schedule — roughly 40 hours of the 140-hour budget.

The question is whether the components it manages are incidental complexity or the substance of
the system.

## Options considered

### A — Bedrock Knowledge Bases end to end
- **Pros:** ~50 hours saved; managed reliability; less operational surface.
- **Cons:**
  - Chunking strategy is configurable within limits but not authorable. Structure-aware
    chunking on control IDs and numbered clauses — the thing that makes compliance documents
    citable — is not expressible.
  - Contextual chunk augmentation, expected to be the single largest recall lever in the
    pipeline, cannot be inserted before embedding.
  - Hybrid fusion behaviour is not controllable; RRF parameters cannot be tuned or measured.
  - Metadata filtering exists, but the ACL enforcement point is inside a service boundary we
    cannot inspect or test to the standard [07-security-threat-model.md](../07-security-threat-model.md)
    requires.
  - Retrieval metrics would have to be measured externally against a system whose internals
    cannot be varied — which makes the experiments in
    [03-retrieval-spec.md §6](../03-retrieval-spec.md) impossible.

### B — Knowledge Bases for ingestion, custom retrieval on top
- **Pros:** saves parsing and chunking work.
- **Cons:** inherits the chunking constraint, which is the part that matters most, while adding
  a boundary to work across.
- **Verdict:** rejected — keeps the cost, loses the benefit.

### C — Own the pipeline
- **Pros:** every stage is inspectable, testable, and independently measurable; ACL enforcement
  is in code we own and can prove; the seven planned retrieval experiments become possible.
- **Cons:** ~50 hours; more operational surface; the reliability of the ingestion pipeline
  becomes ours.

## Decision

**Own the pipeline.** Evaluate Knowledge Bases explicitly, document the evaluation, and record
the reasons for declining it.

## Rationale

Three of the project's core claims are unprovable under option A:

1. *"Filtering happens inside the query, not after."* Unverifiable inside a managed service.
2. *"Contextual chunk augmentation produced the largest single recall gain."* Requires
   controlling the pre-embedding step.
3. *"We measured hybrid fusion against vector-only and here is the delta."* Requires being able
   to turn a branch off.

Each of these is a load-bearing claim with a test or a measurement attached. Delegating the
component that produces them leaves the claims unsupported.

The secondary consideration: having evaluated a managed service and articulated why it was
declined is a stronger position than either using it uncritically or being unaware of it. The
evaluation is part of the deliverable.

## Consequences

**Positive**
- Every retrieval stage is independently measurable, which is what makes
  [08-evaluation-spec.md](../08-evaluation-spec.md) possible.
- ACL enforcement is in testable application code with a CI check.
- Chunking is tuned to the actual document structure of compliance material.

**Negative**
- ~50 hours of the budget.
- Ingestion reliability, retries, and idempotency are our problem.
- Parser edge cases (scanned PDFs, awkward DOCX) are our problem.

**Makes harder later**
- Migrating to Knowledge Bases would mean losing structure-aware chunking and contextual
  augmentation — realistically a rewrite, not a migration.

## Revisit when

- Knowledge Bases exposes custom pre-embedding transforms and configurable fusion, **and**
- Ingestion maintenance exceeds ~2 hours/month, **and**
- The retrieval experiments are complete, so nothing measurable is lost by switching.
