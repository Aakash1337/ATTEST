# 05 — API Specification

**Status:** Revised v2 · **Base:** `https://{api}/v1` · **Format:** JSON, UTF-8
**Derives from:** [14-contracts.md](14-contracts.md) — all enums and state transitions come from
there, not from this document.

The API is the product surface. The UI is a client of it, with no privileged endpoints.

---

## 1. Authentication (F-602)

`Authorization: Bearer <api_key>`

The key resolves — via a Lambda authorizer with a short-TTL cache — to a **caller context**:

```ts
type CallerContext = {
  tenantId: string
  aclTags: string[]        // e.g. ["public", "internal", "client-northwind"]
  scopes: string[]         // ["documents:write", "runs:create", "answers:approve", ...]
  keyId: string            // for audit
}
```

Rules:
- `tenantId` is **never** taken from the request body or path. It comes only from the resolved
  key. A path containing a tenant ID that does not match the key is a 404, not a 403 — do not
  confirm the existence of other tenants' resources.
- `aclTags` is the exact set injected into every retrieval predicate.
- Keys are stored hashed (Argon2id). The plaintext is shown once at creation.
- Every request logs `keyId`, never the key.

---

## 2. Conventions

| Aspect | Convention |
|---|---|
| IDs | ULIDs, prefixed: `doc_01H…`, `run_01H…`, `ans_01H…`, `conv_01H…` |
| Timestamps | RFC 3339 UTC |
| Pagination | `?limit=` (default 50, max 200) + `?cursor=`; response carries `nextCursor` |
| Idempotency | `Idempotency-Key` header on all POSTs that create billable work |
| Errors | RFC 9457 problem+json |
| Rate limits | Per key; `429` with `Retry-After` |
| Versioning | URL-versioned `/v1`; additive changes only within a version |

**Error shape:**
```json
{
  "type": "https://attest.dev/errors/validation-failed",
  "title": "Validation failed",
  "status": 422,
  "detail": "acl_tags contains an unknown tag 'client-acme'",
  "instance": "req_01HZY…",
  "errors": [{ "path": "acl_tags[0]", "message": "unknown tag" }]
}
```

---

## 3. Documents

### `POST /v1/documents`
Create a document record and return a presigned upload URL.

```jsonc
// request
{
  "filename": "access-control-policy-v3.pdf",
  "docType": "policy",              // policy | control_narrative | architecture | pentest | prior_answer
  "aclTags": ["internal"],          // must exist in the tenant vocabulary
  "supersedes": "doc_01H…",         // optional
  "metadata": { "effectiveDate": "2026-01-15", "owner": "CISO" }
}

// 201
{
  "documentId": "doc_01HZ…",
  "status": "PENDING_UPLOAD",
  "upload": { "url": "https://…", "expiresAt": "2026-07-25T12:10:00Z", "method": "PUT" }
}
```

### `GET /v1/documents` · `GET /v1/documents/{id}`
```jsonc
{
  "documentId": "doc_01HZ…",              // logical identity, stable across versions
  "title": "Access Control Policy",
  "docType": "policy",
  "currentVersion": {
    "documentVersionId": "dv_01HZ…",      // IMMUTABLE — what citations pin to
    "version": 3,
    "status": "INDEXED",                  // DocumentStatus, see 14-contracts.md §2
    "aclTags": ["internal"],
    "chunkCount": 84,
    "contentHash": "sha256:…",
    "screening": { "verdict": "CLEAN", "reason": null },
    "failureReason": null,
    "ingestedAt": "2026-07-25T12:14:22Z"
  },
  "versions": [                           // full history; superseded versions stay resolvable
    { "documentVersionId": "dv_01HY…", "version": 2, "status": "SUPERSEDED",
      "supersededBy": "dv_01HZ…", "ingestedAt": "2026-03-02T09:00:00Z" }
  ]
}
```

A version in `QUARANTINED` carries `screening.verdict: "FLAGGED"` and a reason, has no active
chunks, and is unreachable by retrieval until released
([14-contracts.md §3.1](14-contracts.md)).

### `POST /v1/documents/{id}/versions/{versionId}/release`
Human release of a quarantined version. Records `releasedBy` and `releasedAt`, then re-enters
ingestion at `EMBEDDING`. Requires the `documents:release` scope.

### `DELETE /v1/documents/{id}`
Soft-deletes: chunks go `active = false`. Answers already citing them retain their audit
record. Hard deletion is a separate, deliberate admin operation.

---

## 4. Questionnaires

**Normalisation happens once, at upload.** `POST /runs` never parses a workbook — it rejects any
questionnaire not in `NORMALISED` with `questionnaire_not_normalised` (409). The v1 architecture
document implied normalisation at run creation; that was wrong and
[14-contracts.md §3.2](14-contracts.md) supersedes it.

### `POST /v1/questionnaires`
Upload and normalise a questionnaire (F-301). Same presigned-URL pattern as documents.

```jsonc
// request
{ "filename": "CustomerX-CAIQ-v4.xlsx", "format": "CAIQ_V4" }   // CAIQ_V4 | CSV | JSON
```

Core release supports **CAIQ v4 XLSX** plus CSV and JSON as interchange formats. Anything else
returns `unsupported_format` (422). SIG and arbitrary workbooks are an extension
([11-delivery-plan.md §3](11-delivery-plan.md)).

### `GET /v1/questionnaires/{id}`
```jsonc
{
  "questionnaireId": "qst_01HZ…",
  "format": "CAIQ_V4",
  "status": "NORMALISED",                 // QuestionnaireStatus
  "sourceObject": { "key": "…", "etag": "\"9d3f…\"", "versionId": "…" },
  "failureReason": null,
  "itemCount": 261,
  "unparsedRows": [                       // never silently dropped
    { "sheet": "CAIQ", "row": 14, "reason": "merged header cell, no question text" }
  ],
  "items": [
    {
      "itemId": "itm_01HZ…",
      "seq": 1,
      "externalId": "AIS-01.1",
      "domain": "Application & Interface Security",
      "text": "Do you use industry standards to build in security for your SDLC?",
      "responseType": "YES_NO_NA",        // YES_NO_NA | NARRATIVE | YES_NO_NA_WITH_NARRATIVE
      "sourceCell": { "sheet": "CAIQ", "row": 22, "col": "C" }
    }
  ]
}
```

`sourceCell` is what makes formatting-preserving export (F-501) possible. Capture it at parse
time or lose the ability entirely.

---

## 5. Runs

### `POST /v1/runs`
```jsonc
// request  (Idempotency-Key required)
{
  "questionnaireId": "qst_01HZ…",
  "acceptEstimateUsd": 25.00,          // required when the estimate exceeds the tenant cap
  "config": {
    "groundingThreshold": 0.75,          // optional override
    "maxConcurrency": 10,
    "enableLiveTools": true,
    "itemFilter": { "domains": ["Encryption & Key Management"] }   // optional partial run
  }
}

// 202
{ "runId": "run_01HZ…", "status": "QUEUED", "generation": 1, "itemCount": 261,
  "estimatedCostUsd": 19.60, "estimatedCompletionAt": "2026-07-25T13:05:00Z" }
```

**The estimate is a control, not a courtesy.** It is computed before work starts and compared to
the tenant's cost cap (default $25). If it exceeds the cap, the request fails with
`estimate_exceeds_cap` (409) unless `acceptEstimateUsd` is present and ≥ the estimate. Cost
protection that only reports after the fact is not protection.

Rejected with `questionnaire_not_normalised` (409) if the questionnaire is not `NORMALISED`.

### `GET /v1/runs/{id}`
```jsonc
{
  "runId": "run_01HZ…",
  "status": "IN_PROGRESS",            // RunStatus
  "generation": 1,                    // increments on cancel — see 14-contracts.md §4
  "counts": { "total": 261, "pending": 45, "inProgress": 10,
              "answered": 180, "gap": 34, "cancelled": 0, "failed": 2 },
  "coverage": 0.84,                   // answered / (answered + gap)
  "cost": { "totalUsd": 13.42, "perQuestionUsd": 0.062,
            "byStage": { "decompose": 0.4, "embed": 0.1, "rerank": 0.9,
                         "generate": 9.8, "critique": 1.6, "guardrail": 0.6 } },
  "timing": { "startedAt": "…", "p50ItemMs": 18400, "p95ItemMs": 41200 },
  "traceId": "1-68a…"
}
```

### `POST /v1/runs/{id}/cancel`
Sets `status = CANCELLED` and **increments `generation`**. Every in-flight worker holds a stale
generation, so its conditional write is rejected and it exits without persisting. A sweeper moves
any item still `PENDING` or `IN_PROGRESS` to `CANCELLED`. Already-terminal items are untouched.
Returns `run_not_cancellable` (409) if the run is already terminal.

### `POST /v1/runs/{id}/resume` — *extension, not core*
Re-executes only `FAILED_*` items into the same run, using the same generation fence. Deferred
from the core release; the fence itself is built because cancel needs it.

### `GET /v1/runs/{id}/answers`
Filters: `status`, `minConfidence`, `domain`, `q` (text search).

```jsonc
{
  "items": [
    {
      "answerId": "ans_01HZ…",
      "itemId": "itm_01HZ…",
      "seq": 1,
      "status": "ANSWERED",           // ItemStatus — see 14-contracts.md §2
      "reviewState": "PENDING",       // ReviewState
      "responseEnum": "YES",
      "text": "Yes. Northwind enforces MFA for all administrative access [C1], reviewed
               annually by the CISO [C1], and public access is blocked on all S3 buckets [C4].",
      "citations": [
        { "citationId": "C1", "evidenceId": "chk_…", "kind": "DOCUMENT",
          "documentId": "doc_…", "documentVersionId": "dv_01HZ…",
          "documentTitle": "Access Control Policy", "headingPath": ["4. Authentication","4.2 MFA"],
          "page": 11, "quote": "MFA is required for all administrative accounts…" },
        { "citationId": "C4", "evidenceId": "ev_01HZ…", "kind": "LIVE_OBSERVATION",
          "source": "aws_config", "check": "s3_public_access_block",
          "observedAt": "2026-09-12T09:14:02Z", "staleAfter": "2026-10-12T09:14:02Z",
          "quote": "Rule s3-bucket-public-read-prohibited evaluated 14 buckets as COMPLIANT." }
      ],
      "confidence": { "band": "HIGH", "score": 0.88 },
      "groundingScore": 0.91,
      "toolCalls": [{ "name": "check_aws_config", "outcome": "OK", "durationMs": 812 }],
      "budget": { "turnsUsed": 2, "inputTokens": 13120, "outputTokens": 610, "wallClockMs": 18400 },
      "promptVersion": "answer.v3",
      "modelIds": { "generate": "…", "critique": "…" },
      "costUsd": 0.061
    },
    {
      "answerId": "ans_01HZ…",
      "status": "GAP",
      "reason": "insufficient_evidence",
      "missingEvidence": "The corpus documents MFA for administrative access but contains
                          no statement covering standard user accounts.",
      "nearestEvidence": ["C1", "C4"],
      "suggestedAction": "Add a policy statement or an IdP configuration export covering
                          MFA enforcement for non-privileged users."
    }
  ],
  "nextCursor": "eyJ…"
}
```

### `GET /v1/runs/{id}/summary` (F-504)
Counts, coverage, the full gap list, cost breakdown, and timing.

---

## 6. Review

### `PATCH /v1/answers/{id}`
```jsonc
{ "reviewState": "APPROVED" }
// or
{ "reviewState": "EDITED", "text": "Yes, for production environments only.",
  "editReason": "scope narrowed to prod" }
```
Every transition writes a feedback record (F-406) with actor, timestamp, and before/after text.

### `POST /v1/answers/{id}/messages` — streaming review chat (F-402)

```
Accept: text/event-stream
{ "message": "This is too strong — we only enforce this in production." }
```

```
event: token        data: {"delta":"Revised"}
event: token        data: {"delta":" answer:"}
event: citations    data: {"citations":[{"id":"C7", …}]}
event: grounding    data: {"score":0.86,"threshold":0.75,"passed":true}
event: done         data: {"answerId":"ans_…","revision":2,"costUsd":0.031}
```

If the revision fails the grounding check, the stream ends with:
```
event: gap   data: {"reason":"insufficient_evidence","missingEvidence":"…"}
```
The reviewer can then override manually via `PATCH`, which is recorded as a human edit — never
as a system answer.

### `GET /v1/answers/{id}/audit` (F-503)
Full provenance, resolving **every `evidenceId` regardless of kind**:

- **Document evidence** — resolved by `chunkId` to its immutable `documentVersionId`, returning
  the exact text as it was at generation time. Resolution deliberately ignores `active`, so a
  superseded document's citation still resolves ([ADR-0006](adr/0006-evidence-identity.md)).
- **Live evidence** — resolved by `evidenceId` to the immutable observation, always rendered with
  its original `observedAt`. A live observation is never presented as a timeless fact.

Plus prompt version, model IDs, guardrail score, budget counters, all tool calls with arguments
and results, and every revision in order.

---

## 7. Export (F-501, F-502)

### `POST /v1/runs/{id}/exports`
```jsonc
{ "format": "xlsx",                       // xlsx | csv | json
  "include": { "onlyApproved": false, "citations": true, "confidence": true, "gaps": true },
  "citationStyle": "footnote" }           // footnote | inline | separate_column
// 202
{ "exportId": "exp_01HZ…", "status": "PROCESSING" }
```

### `GET /v1/exports/{id}`
```jsonc
{ "exportId": "exp_01HZ…", "status": "READY",
  "download": { "url": "https://…", "expiresAt": "…" } }
```

For `xlsx`, the original uploaded workbook is the template: answers are written back into the
cells recorded in `sourceCell`, and answer/citation/confidence/status columns are appended.
All other sheets, formulas, and formatting are left untouched.

---

## 8. Tenant administration

Bootstrap-scope endpoints, not exposed to normal keys.

| Endpoint | Purpose |
|---|---|
| `POST /v1/admin/tenants` | Create tenant, S3 prefix, ACL tag vocabulary |
| `POST /v1/admin/tenants/{id}/keys` | Issue an API key with tags + scopes; plaintext shown once |
| `DELETE /v1/admin/keys/{keyId}` | Revoke |
| `GET /v1/admin/tenants/{id}/usage` | Cost and token usage rollup |

---

## 9. Status codes

| Code | Meaning |
|---|---|
| 200 / 201 / 202 | OK / created / accepted (async work started) |
| 400 | Malformed request |
| 401 | Missing or invalid key |
| 403 | Valid key, insufficient scope |
| 404 | Not found **or** not visible to this tenant — deliberately indistinguishable |
| 409 | Idempotency-key conflict with a different payload |
| 422 | Semantically invalid (unknown ACL tag, unsupported format) |
| 429 | Rate limited; `Retry-After` present |
| 500 / 503 | Server error / upstream (Bedrock) unavailable after retries |

---

## 10. Contract testing

The OpenAPI document lives at `packages/api/openapi.yaml` and is the source of truth. CI
asserts:
1. Handler request/response types are generated from it — drift is a build failure.
2. Every documented endpoint has at least one integration test against a deployed dev stack.
3. No response body includes `tenantId` values other than the caller's — asserted by a
   cross-tenant fuzz test in the isolation suite.
