# ADR-0006 — Immutable evidence identity for documents and live observations

**Status:** Accepted
**Date:** 2026-07-25

## Context

The product's central claim is "evidence-backed answers." An answer is only defensible to an
auditor if, months later, every citation still resolves to **exactly the text that was in the
model's context when the answer was generated** — not to whatever that document says today.

Two defects in the first design made that impossible:

1. **Documents could not hold two versions.** `document.doc_id` was a primary key with `version`
   as an ordinary column, so one row per document. Meanwhile the API exposed `supersedes` and
   citations carried `documentVersion`. There was no key a citation could point at to pin the
   version it cited. Re-ingesting a policy would silently change what every historical answer
   appeared to be based on.
2. **Live tool results were uncitable.** The agent required every claim to cite evidence from
   the retrieved set, but the citation type described document chunks only. A claim like "S3
   public access is blocked across all 14 buckets," grounded in a live AWS Config call, had no
   citation type it could legally use. The rule and the type system contradicted each other.

## Options considered

### For versioning

**A — New `doc_id` per version.** Simple; every version is a wholly new document.
*Cons:* loses the logical thread between versions, so "show me the history of this policy" and
`supersedes` become application-level guesswork.

**B — `(document_id, version)` composite with an immutable surrogate key.** A logical
`document` row plus immutable `document_version` rows.
*Cons:* one more table and a two-step join.

### For live evidence

**C — Exempt live claims from the citation rule.** Cheapest.
*Cons:* creates a class of uncited claims, which destroys the deterministic
"every cited ID exists" check and the audit story with it.

**D — Defer the live tool entirely.** Removes the problem.
*Cons:* the only live tool is what makes the agentic claim concrete; cutting it to avoid a
modelling problem is solving the wrong thing.

**E — Normalise live results into immutable evidence records.** A live observation becomes a
first-class, persisted, citable evidence object alongside document chunks.
*Cons:* a table, a staleness policy, and a union type in the citation model.

## Decision

**B and E.** One `Evidence` union with two kinds, both immutable, both tenant-scoped, both
citable, both scored by the grounding check.

- Logical `document` ← immutable `document_version` ← immutable `chunk`.
- Citations reference `chunkId`, which transitively pins the exact `documentVersionId`.
- Live tool results are written to `live_evidence` with their own `evidenceId` **before the model
  sees them**, then enter context with a `C{n}` ID like any chunk.
- Superseding creates a new version; the old version and its chunks are retained with
  `active = false`.
- **Retrieval filters `active = true`. Citation resolution ignores `active` entirely.** Two code
  paths, two rules, never shared.

Full types in [14-contracts.md §5–6](../14-contracts.md).

## Rationale

The asymmetry between retrieval and citation resolution is the crux. Retrieval must only ever
surface current evidence — answering from a superseded policy is exactly the staleness failure
the product exists to prevent. Citation resolution must reach superseded evidence forever —
otherwise every historical answer becomes unverifiable the moment a policy is updated. Both are
correct simultaneously only if evidence rows are immutable and `active` is a retrieval filter
rather than a lifecycle state.

For live evidence, persisting the observation *before* the model sees it is what makes it real
evidence rather than a transcript artefact. It gets an ID, a timestamp, and an ACL scope, so it
can be cited, grounded against, audited, and exported — and it can go stale, which a document
chunk cannot.

The staleness policy exists because a live observation is a claim about a moment. "MFA is
enabled on the root account" was true on 12 September. Rendering that later without its
timestamp would be the same class of misrepresentation the whole product is built to avoid.

## Consequences

**Positive**
- A citation resolves to the exact evidence version used, permanently. This is what makes the
  audit bundle meaningful.
- The "every claim cites evidence" rule now has no exceptions, so the deterministic
  citation-existence check covers every answer.
- Live observations are exported and displayed with their observation time, visibly distinct
  from policy text.
- Document history is queryable rather than inferred.

**Negative**
- One extra table and a join on the ingestion path.
- Superseded chunks are retained indefinitely, so storage grows with version count.
- The staleness window is a new tunable that needs a default and a justification.
- Every citation-consuming surface — API, export, audit bundle, UI, grounding input — must
  handle a union type rather than one shape.

**Makes harder later**
- Hard-deleting a document now requires deciding what happens to answers that cite it. The v1
  answer: soft-delete only; hard delete is a separate deliberate admin operation that also
  invalidates the citing answers rather than silently orphaning them.

## Revisit when

- Retained superseded chunks exceed a material share of storage cost, at which point the
  question is archival tiering rather than deletion, or
- A second live evidence source is added, which will test whether the union generalises or needs
  a registry.
