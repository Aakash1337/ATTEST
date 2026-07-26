# 14 — Normative Contracts

**Status:** Normative · **Authority:** This document wins.

Every other document, the OpenAPI file, the TypeScript types, and the SQL schema derive from
this one. Where any of them disagrees with this file, this file is correct and the other is a
defect.

Created because the first draft of the doc set drifted on enum names, state transitions, and
where normalisation happens — three separate contradictions that only existed because there was
no single place to look.

---

## 1. Naming rules

| Surface | Convention |
|---|---|
| JSON (API), TypeScript | `camelCase` — `missingEvidence`, `documentVersionId` |
| SQL columns and tables | `snake_case` — `missing_evidence`, `document_version_id` |
| Enum *values* | `SCREAMING_SNAKE` everywhere — `PENDING_UPLOAD`, `FAILED_BUDGET` |
| Entity ID prefixes | `doc_`, `dv_`, `chk_`, `qst_`, `itm_`, `run_`, `ans_`, `ev_`, `conv_`, `exp_`, `fb_` |

Mapping between SQL and JSON happens in exactly one place: the repository layer. No handler,
no core module, and no test may perform ad-hoc case conversion.

All enums are declared once in `packages/core/contracts/enums.ts` and imported everywhere,
including by the OpenAPI generator. A string literal that duplicates an enum value is a lint
error.

---

## 2. Enums

```ts
export const DocumentStatus = [
  "PENDING_UPLOAD",   // record created, bytes not yet received
  "PARSING",          // extracting blocks
  "SCREENING",        // injection detection — BEFORE augmentation or embedding
  "QUARANTINED",      // screening flagged it; unreachable by retrieval; awaits human release
  "EMBEDDING",        // contextualising + embedding
  "INDEXED",          // active and retrievable
  "SUPERSEDED",       // a newer version is active; chunks retained for citation resolution
  "FAILED",           // terminal; failureReason populated
] as const

export const QuestionnaireStatus = [
  "PENDING_UPLOAD",
  "NORMALISING",
  "NORMALISED",       // itemCount and unparsedRows are final
  "FAILED",
] as const

export const RunStatus = [
  "QUEUED", "IN_PROGRESS", "COMPLETE", "CANCELLED", "FAILED",
] as const

export const ItemStatus = [
  "PENDING",             // not yet picked up
  "IN_PROGRESS",         // a worker holds it
  "ANSWERED",            // grounded, cited
  "GAP",                 // deliberate abstention — a success
  "CANCELLED",           // run cancelled before this item resolved
  "FAILED_BUDGET",       // turn / token / wall-clock ceiling
  "FAILED_TOOL_ARGS",    // 3 consecutive invalid tool-argument attempts
  "FAILED_UPSTREAM",     // model or tool error after retries
] as const

export const ReviewState = ["PENDING", "APPROVED", "REJECTED", "EDITED"] as const

export const EvidenceKind = ["DOCUMENT", "LIVE_OBSERVATION"] as const

export const ExportStatus = ["PROCESSING", "READY", "FAILED"] as const
```

`ANSWERED` and `GAP` are both **terminal successes**. Everything prefixed `FAILED_` is a
terminal failure. `CANCELLED` is terminal and neither.

---

## 3. State machines

### 3.1 Document

```
PENDING_UPLOAD ──bytes received──▶ PARSING ──▶ SCREENING ──┬──clean──▶ EMBEDDING ──▶ INDEXED
       │                              │           │        └──flagged─▶ QUARANTINED
       │                              │           │                          │
       └──────────────────────────────┴───────────┴──────▶ FAILED            │ human release
                                                                             ▼
                                                                        EMBEDDING

INDEXED ──new version activated──▶ SUPERSEDED     (chunks stay resolvable for citations)
```

**`SCREENING` precedes `EMBEDDING`.** Untrusted content is never sent to an LLM for contextual
augmentation, and never embedded, before injection screening. Quarantined content is
unreachable by retrieval until a human releases it.

### 3.2 Questionnaire

```
PENDING_UPLOAD ──▶ NORMALISING ──┬──▶ NORMALISED
                                 └──▶ FAILED
```

**Normalisation happens once, at upload.** `POST /runs` never parses a workbook; it rejects any
questionnaire not in `NORMALISED`. (The architecture document previously implied normalisation
at run creation. That is wrong and this supersedes it.)

### 3.3 Run

```
QUEUED ──▶ IN_PROGRESS ──┬──▶ COMPLETE     all items terminal
                         ├──▶ CANCELLED    operator cancelled
                         └──▶ FAILED       orchestration itself failed
```

`COMPLETE` means every item reached a terminal state. It does **not** mean every item was
answered — a run with 200 gaps is `COMPLETE`.

### 3.4 Item

```
PENDING ──▶ IN_PROGRESS ──┬──▶ ANSWERED
                          ├──▶ GAP
                          ├──▶ FAILED_BUDGET | FAILED_TOOL_ARGS | FAILED_UPSTREAM
                          └──▶ CANCELLED
```

### 3.5 Review

```
PENDING ──┬──▶ APPROVED
          ├──▶ REJECTED
          └──▶ EDITED ──▶ APPROVED
```

Only items in `ANSWERED` or `GAP` are reviewable. Every transition writes a feedback record
with actor, timestamp, and before/after text.

---

## 4. Concurrency: the generation fence

Cancellation races with in-flight workers. Without a fence, a worker that started before a
cancel can write its result afterwards.

```
run.generation : int, starts at 1
answer.runGeneration : int   — the generation the worker was dispatched under
answer.attempt : int         — retry counter within a generation
```

**Rules**

1. A worker is dispatched with the run's current `generation` and carries it for its lifetime.
2. Every item write is conditional:
   `attribute_not_exists(runGeneration) OR runGeneration <= :myGeneration`
3. **Cancel** sets `run.status = CANCELLED` and increments `run.generation`. Every in-flight
   worker now holds a stale generation, so its conditional write fails and it exits without
   persisting.
4. A sweeper moves any item still `PENDING` or `IN_PROGRESS` to `CANCELLED`.
5. Already-terminal items are never modified by a cancel.

Resume (an extension, not core — see [11-delivery-plan.md](11-delivery-plan.md)) reuses the same
fence: it increments `generation` and re-dispatches only `FAILED_*` items. The mechanism is
built in v1 because cancel needs it; only the resume endpoint is deferred.

---

## 5. The evidence model

This is the fix for a real hole in the first draft: the agent required every claim to cite
evidence "from the retrieved set", but the citation type described document chunks only — so a
claim grounded in live AWS Config state was **uncitable by construction**.

Both kinds of evidence are immutable, tenant-scoped, and resolvable forever.

```ts
type Evidence = DocumentEvidence | LiveEvidence

type DocumentEvidence = {
  evidenceId: string            // === chunkId; chunks are immutable, only deactivated
  kind: "DOCUMENT"
  tenantId: string
  aclTags: string[]
  documentId: string
  documentVersionId: string     // immutable — see §6
  documentTitle: string
  headingPath: string[]
  page: number | null
  quote: string                 // raw_text, verbatim, never the augmented form
}

type LiveEvidence = {
  evidenceId: string            // ev_… ULID, minted at observation time
  kind: "LIVE_OBSERVATION"
  tenantId: string
  aclTags: string[]
  source: "aws_config"
  check: string                 // the enum value from the tool schema
  scope: { accountAlias: string; region: string }
  result: { compliant: boolean; ruleName: string; resourceCounts: Record<string, number> }
  observedAt: string            // ISO 8601
  staleAfter: string            // observedAt + stalenessWindow (default 30 days)
  renderedText: string          // the natural-language form fed to grounding and shown to users
}
```

**Rules**

1. A live tool result is **persisted as an immutable `LiveEvidence` row the moment it returns**,
   before the model sees it. It then enters the context exactly like a document chunk, with a
   `C{n}` citation ID.
2. The grounding check receives `renderedText` for live evidence alongside chunk text, so live
   claims are scored, not exempted.
3. Citations are `{ citationId, evidenceId, kind }` plus the denormalised display fields. The
   audit bundle resolves `evidenceId` for both kinds.
4. **Staleness:** evidence past `staleAfter` cannot be cited in a *new* answer — the tool
   re-observes instead. Existing answers keep their citation and always render the original
   `observedAt`. A live observation is never presented as a timeless fact.
5. Export renders live citations as
   `AWS Config · s3_public_access_block · observed 2026-09-12`, visibly distinct from a document
   citation.

---

## 6. Document version identity

The first draft made `document.doc_id` a single-row primary key with `version` as a column,
which cannot represent two coexisting versions — while the API exposed `supersedes` and
citations carried `documentVersion`. A citation could not be tied to the version it actually
cited.

**Corrected identity model:**

| Concept | Key | Mutable? |
|---|---|---|
| Logical document | `documentId` | Metadata only (title, type) |
| Document version | `documentVersionId` | **Immutable once `INDEXED`** |
| Chunk | `chunkId` → belongs to exactly one `documentVersionId` | **Immutable**; only `active` flips |

- Chunks reference `documentVersionId`, never `documentId`.
- Citations reference `chunkId`, which transitively pins the exact version.
- Superseding a document creates a **new** `documentVersionId`; the old one and all its chunks
  are retained with `active = false`.
- Retrieval filters `active = true`. Citation resolution ignores `active` entirely.

**Activation is one transaction:**

```
BEGIN
  INSERT document_version (status = INDEXED)
  INSERT chunks (active = true)
  UPDATE previous document_version SET status = SUPERSEDED, superseded_by = :new
  UPDATE chunks OF previous version SET active = false
  UPDATE document SET current_version_id = :new
COMMIT
```

Retrieval never observes a half-indexed document or a mix of versions.

**Required test:** ingest v1, produce an answer citing it, ingest v2 which changes that clause,
re-open the original answer — the citation still resolves to the v1 text, and the run's
`corpusVersion` records why.

---

## 7. Error codes

Stable machine-readable codes, versioned with the API. The `title` may be reworded; the `type`
URI may not.

| Code | HTTP | Meaning |
|---|---|---|
| `validation_failed` | 422 | Schema-valid but semantically wrong |
| `unknown_acl_tag` | 422 | Tag not in the tenant vocabulary |
| `questionnaire_not_normalised` | 409 | Run creation against a non-`NORMALISED` questionnaire |
| `unsupported_format` | 422 | Not a supported questionnaire format |
| `idempotency_conflict` | 409 | Same key, different payload |
| `estimate_exceeds_cap` | 409 | Pre-run cost estimate above the cap without explicit acceptance |
| `evidence_stale` | 409 | Cited live evidence is past `staleAfter` |
| `run_not_cancellable` | 409 | Run already terminal |
| `rate_limited` | 429 | `Retry-After` present |
| `upstream_unavailable` | 503 | Model provider unavailable after retries |

---

## 8. Change procedure

1. Change this document first.
2. Update `packages/core/contracts/` to match.
3. Regenerate OpenAPI types; the contract test will fail until every consumer is updated.
4. Update the dependent prose documents.
5. A PR touching enums or state machines without touching this file fails CI.
