# 01 — Product Specification

**Status:** Revised v2 · **Supersedes:** `ATTEST-project-plan.md` §2
**Enums and state machines:** [14-contracts.md](14-contracts.md) is normative; this document
references but does not define them.

---

## 1. Problem statement

A company selling B2B software receives vendor security questionnaires from every prospect
above a certain size. Each is 100–300 questions covering access control, encryption, incident
response, sub-processors, BCDR, and secure development. Each answer must be accurate, must be
consistent with every previous answer given to every other customer, and must be defensible
against an auditor asking "show me where this came from."

Today this work is done by one or two people copying from a spreadsheet of previous answers.
The failure modes are:

- **Staleness.** An answer written 18 months ago is pasted into a new questionnaire after the
  underlying control changed.
- **Inconsistency.** Two people answer the same question differently for two customers.
- **Unfounded confidence.** A question is answered "Yes" because it feels true, with no
  evidence behind it. This is the expensive one — it is a misrepresentation in a document the
  customer will rely on.
- **Invisible gaps.** Nobody produces the list of questions the company genuinely cannot
  answer, which is exactly the list the security team needs.

## 2. Product thesis

> The valuable output is not the answer. It is the answer **plus the evidence**, or an honest
> statement that the evidence does not exist.

Every design decision follows from that sentence. Grounding enforcement is the product, not a
safety feature. Abstention is a first-class output, not an error path.

---

## 3. Users

### Primary — the Responder
A security or GRC engineer who owns questionnaire response. Technical, sceptical, personally
accountable if an answer is wrong. Measures success in hours saved *and* in not having to
defend a bad answer later.

**Needs:** speed, citations they can click through to, a clear gap list, and the ability to
correct the system once rather than repeatedly.

### Secondary — the Reviewer / Approver
A security lead or CISO who signs off. Reads a fraction of the answers closely, spot-checks
the rest, cares intensely about anything overstated.

**Needs:** confidence signals, a diff between the draft and previous approved answers, and an
audit trail.

### Tertiary — the Consultant (multi-tenant driver)
A security consultancy answering questionnaires on behalf of several clients from one
account. Their existence is why tenant isolation and document ACLs are v1, not v2.

**Needs:** hard guarantees that client A's evidence can never surface in client B's answer.

---

## 4. Jobs to be done

| # | Job | Delivered by |
|---|---|---|
| J1 | Get our security corpus into the system once, and keep it current | F-101…F-109 |
| J2 | Turn a new questionnaire into a draft with citations, without me reading everything | F-301…F-310 |
| J3 | Show me exactly which questions we cannot substantiate | F-307, F-504 |
| J4 | Let me correct an answer and have the correction stick | F-403, F-404, F-406 |
| J5 | Give me the workbook back in the format the customer sent it | F-501, F-502 |
| J6 | Let me prove to an auditor where an answer came from | F-503 |
| J7 | Guarantee my clients' evidence stays separated | F-601…F-605 |

---

## 5. Primary user journey

**Setup (once per tenant)**
1. Tenant is provisioned; an API key and an ACL tag vocabulary are issued
   (e.g. `public`, `internal`, `restricted`, `client-northwind`).
2. Responder uploads 15–25 documents, tagging each with ACL tags at upload.
3. Ingestion runs asynchronously through the `DocumentStatus` machine
   ([14-contracts.md §3.1](14-contracts.md)): `PENDING_UPLOAD → PARSING → SCREENING →
   EMBEDDING → INDEXED`, or `QUARANTINED` if screening flags injected content, or `FAILED`
   with a reason.

**Per questionnaire**
4. Responder uploads `CustomerX-CAIQ-v4.xlsx`. **It is normalised at upload**, reporting how many
   items were recognised and flagging any rows it could not interpret.
5. Responder creates a run against the normalised questionnaire. A cost estimate is returned
   before any work starts, and a run above the tenant cap requires explicit acceptance.
6. The run executes. Progress is pollable: `queued / in_progress / answered / gap / failed`
   counts, plus a running cost total.
7. On completion the responder opens the review screen: a table of items, each with a draft
   answer, a confidence score, citation chips, and a status.
8. For any item, the responder can:
   - expand a citation to see the exact source clause with its heading path and page,
   - open a chat and challenge the answer ("we only do this in prod"), receiving a revised
     and re-grounded answer,
   - edit the text directly,
   - approve or reject.
9. GAP items are listed separately with their missing-evidence descriptions. This list is a
   deliverable in its own right — it is the security team's backlog.
10. Responder exports. The original workbook comes back with answer, citations, confidence,
    and status columns filled, formatting intact.

**Compounding**
11. Every correction is stored as feedback. A promotion workflow (human-gated) moves
    confirmed corrections into the eval golden set and makes approved answers retrievable via
    `lookup_prior_answer`.

---

## 6. Functional requirements

IDs are stable and referenced across all documents. Acceptance criteria are written so a test
can assert them.

### F-1xx Corpus ingestion

| ID | Requirement | Acceptance criteria |
|---|---|---|
| F-101 | Documents upload to a per-tenant S3 prefix and trigger ingestion | A `PutObject` under `tenants/{tid}/raw/` creates a document record and starts the ingestion state machine within 30 s |
| F-102 | Parse PDF, DOCX, MD, TXT preserving heading hierarchy and page numbers | For a 40-page policy PDF, every chunk carries a non-empty `heading_path` and a `page` in range |
| F-103 | OCR fallback for scanned documents | A scanned PDF with no text layer produces chunks with `parser=ocr` and non-empty text |
| F-104 | Structure-aware chunking | Chunks split on headings/control IDs/numbered clauses; 400–800 tokens; 15% overlap; no chunk splits mid-sentence |
| F-105 | Contextual chunk augmentation | Every chunk stores both `raw_text` and `contextualised_text`; the embedding is computed over the contextualised form |
| F-106 | Embed and index | Chunk rows carry `embedding vector`, `tsv tsvector`, `tenant_id`, `acl_tags`, `doc_id`, `heading_path`, `page`, `doc_version` |
| F-107 | Content-hash idempotency | Re-uploading a byte-identical document performs zero embedding calls and leaves the index unchanged |
| F-108 | Document lifecycle | Superseding a document marks old chunks `inactive` in one transaction; retrieval never mixes versions |
| F-109 | ACL tags at upload | Upload accepts `acl_tags[]`; tags must exist in the tenant vocabulary or the upload is rejected |

### F-2xx Retrieval

| ID | Requirement | Acceptance criteria |
|---|---|---|
| F-201 | Query decomposition | A compound question yields ≥2 sub-queries; a simple one yields exactly 1 |
| F-202 | Query rewriting | Rewrites are logged with the original for eval traceability |
| F-203 | Hybrid search with RRF | Vector and FTS branches execute concurrently; fusion is deterministic given identical inputs |
| F-204 | In-query filtering | Static analysis test asserts every retrieval SQL statement contains `tenant_id = $` and an `acl_tags &&` predicate. Post-filtering in application code fails review |
| F-205 | Reranking | Top-50 fused → top-8 kept; nDCG@10 delta and added latency both recorded in `optimizations.md` |
| F-206 | Budgeted context assembly | Assembled context never exceeds the configured token budget; near-duplicates (cosine > 0.97) collapsed |
| F-207 | Stable citation IDs | Each passage gets an ID of the form `C{n}`; the mapping to `chunk_id` is persisted with the answer |

### F-3xx Answering

| ID | Requirement | Acceptance criteria |
|---|---|---|
| F-301 | Questionnaire normalisation | **CAIQ v4 .xlsx** (plus CSV/JSON) normalises to `QuestionnaireItem[]` **at upload**; unparsed rows are reported, never silently dropped; `sourceCell` captured for export. SIG and arbitrary workbooks are F-301a, an extension |
| F-302 | Bounded agent loop | Every stage reserves budget before running; exhaustion at any stage persists `FAILED_BUDGET` with the stage name and stops. Tested at four exhaustion points ([04-agent-spec.md §2.1](04-agent-spec.md)) |
| F-303 | Tool use | `search_corpus`, `get_document_section`, `check_aws_config` callable; each emits a span and a metric. `lookup_prior_answer` is F-303a, an extension |
| F-304 | Tool argument validation | Invalid arguments return a structured error the model can act on; after N=3 invalid attempts the item fails deterministically |
| F-305 | Self-critique | Draft is checked claim-by-claim for citation support before the grounding check |
| F-306 | Grounding check | Guardrail contextual-grounding score recorded on every answer; threshold configurable per tenant |
| F-307 | Abstention | Below threshold → `GAP` with `reason` and `missingEvidence`, never a hedged answer |
| F-308 | Response-type normalisation | Where the questionnaire expects YES/NO/NA, the item carries both the enum and the narrative |
| F-309 | Bounded-concurrency orchestration | A 200-item run at concurrency 10 completes with per-item retry; one item failing does not fail the run |
| F-310 | Run lifecycle | Create (idempotent, estimate-capped), poll, and cancel. Cancel increments `generation`; a race test proves an in-flight worker cannot write after it. Resume is F-310a, an extension |
| F-311 | Live evidence | Tool results persist as immutable `LiveEvidence` before the model sees them; citable, grounded, and past `staleAfter` uncitable in new answers ([14-contracts.md §5](14-contracts.md)) |

### F-4xx Review

| ID | Requirement | Acceptance criteria |
|---|---|---|
| F-401 | Review API | Answers listable with filters on status, confidence, and domain |
| F-402 | Streaming review chat | Multi-turn, scoped to one answer, streamed over SSE; history persisted |
| F-403 | Revision | A challenge triggers re-retrieval and re-grounding; the new citation set replaces the old, and both are retained in the audit record |
| F-404 | Approve / reject / edit | State transitions recorded with actor and timestamp |
| F-405 | Minimal review UI | Table, detail pane, citation viewer, chat. Functional, not polished |
| F-406 | Feedback capture | Every edit and rejection persists a feedback record with the before/after text |

### F-5xx Export and audit

| ID | Requirement | Acceptance criteria |
|---|---|---|
| F-501 | Round-trip .xlsx export | Original workbook returned with answer columns populated and original formatting, sheets, and non-answer cells untouched |
| F-502 | CSV and JSON export | Stable schema, documented |
| F-503 | Audit bundle | Per answer: chunk IDs, document IDs + versions, prompt version, model IDs, guardrail score, tool calls with arguments and results |
| F-504 | Run summary | Counts by status, coverage %, gap list, total and per-question cost |

### F-6xx Tenancy and security
### F-7xx Evaluation and operations

Specified in [07-security-threat-model.md](07-security-threat-model.md) and
[08-evaluation-spec.md](08-evaluation-spec.md) respectively; the catalogue is in
[00-OVERVIEW.md §4](00-OVERVIEW.md).

---

## 7. Non-functional requirements

| ID | Requirement | Target | Measured on |
|---|---|---|---|
| N-01 | Retrieval relevance | recall@10 ≥ 0.85 | Locked test split, relevance suite |
| N-01a | Retrieval rejection | rejection rate ≥ 0.80; false-evidence ≤ 0.10 | Rejection suite |
| N-02 | Faithfulness | ≥ 0.95 of claims supported by cited evidence | Tier 3, once κ ≥ 0.6 |
| N-03 | Citation precision / recall | ≥ 0.90 / ≥ 0.85 | Tier 3 |
| N-04 | Correct abstention rate | ≥ 0.90 | Locked no-evidence set |
| N-05 | Fabrication rate | ≤ 0.05 | Locked no-evidence set, hard fail |
| N-06 | Per-question latency | p95 ≤ 45 s | Telemetry |
| N-07 | Run throughput | 200 questions ≤ 25 min at concurrency 10 | Integration test |
| N-08 | Cost per question | ≤ $0.12 | EMF + pre-run estimate cap |
| N-09 | Idle infra cost | ≤ $25/month | **S0 week-1 go/no-go**, then budget alarm |
| N-10 | Tenant isolation | Zero cross-tenant retrieval | Dedicated CI suite, gated from S2 wk 5 |
| N-10a | Authorised recall under ACL | ≥ 0.83, within 0.02 of unfiltered | Isolation suite |
| N-10b | Candidate shortfall | ≤ 0.02 | Isolation suite ([ADR-0007](adr/0007-filtered-vector-search.md)) |
| N-11 | Availability | Best-effort single region; documented limitation | — |
| N-12 | Data retention | Traces to S3 with lifecycle expiry; no document content in CloudWatch | Log-redaction test |
| N-13 | Cold start | API p95 ≤ 1.5 s (a driver of the no-VPC decision) | Telemetry |
| N-14 | Recovery | Full corpus reindex RTO ≤ 4 h; RPO ≤ 5 min | Timed drill, S5 wk 14 |

Baselines for N-01…N-05 are established in S2 and S3. The numbers above are the targets those
baselines must reach by S5 — not assumptions about where we start. Gates turn on only once a
baseline exists, except N-10 where zero is the only acceptable value from day one
([08-evaluation-spec.md §6](08-evaluation-spec.md)).

---

## 8. Out of scope for v1

See [00-OVERVIEW.md §5](00-OVERVIEW.md). That list is a contract. Any addition requires
writing down what is being removed to pay for it.

---

## 9. Open questions

| # | Question | Needed by | Default if unresolved |
|---|---|---|---|
| Q1 | Do we support per-question response-type constraints beyond Yes/No/NA/narrative? | S3 | No — narrative + optional enum only |
| Q2 | Should the review chat be able to edit the corpus (e.g. "add this as a note")? | S4 | No — read-only over the corpus |
| Q3 | Do gaps need severity ranking? | S4 | No — flat list, sorted by questionnaire order |
| Q4 | Is a second live tool (beyond AWS Config) worth the time? | S3 | No — one integration proves the pattern |
