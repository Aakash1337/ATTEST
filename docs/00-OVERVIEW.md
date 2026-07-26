# ATTEST — Project Overview

**Status:** Pre-build, rebaselined v2 · **Owner:** Aakash · **Last updated:** 2026-07-25
**Planned window:** 2026-07-27 → 2026-11-01 (14 weeks) · **Budget:** 140 hours at 10 h/week
**Definition of done:** a security-gated release — [11-delivery-plan.md §6](11-delivery-plan.md)

This is the single document to read if you read only one. It covers what ATTEST is, what it
does, every capability it will have, and when each part lands.

> **Normative contracts live in [14-contracts.md](14-contracts.md).** Enums, state machines, the
> evidence model, and document-version identity are defined there and nowhere else. Where this
> document and that one disagree, that one is correct.

---

## 1. The one-paragraph version

Companies that sell software get sent security questionnaires — CAIQ, SIG Lite, bespoke
enterprise spreadsheets — containing 100 to 300 questions each, every one of which must be
answered accurately and backed by a policy clause or a piece of evidence. Today this is done
by a human copying from old spreadsheets, which is slow, inconsistent, and quietly wrong.
ATTEST ingests a company's security corpus once, then resolves each questionnaire item with
an agent that plans, retrieves permission-filtered evidence, calls live tools to check actual
cloud state, drafts a cited answer, self-critiques it, and runs it through a grounding check.
If the evidence supports the answer, it emits the answer with citations. If it doesn't, it
emits a **gap** — a structured statement of what could not be substantiated and what evidence
is missing. It never guesses.

---

## 2. Why this problem is worth engineering

The retrieval problem is genuinely hard, and the failure mode is legal rather than cosmetic.
A hallucinated "Yes, we encrypt all data at rest with customer-managed keys" in a signed
vendor questionnaire is a misrepresentation, not a typo. That single fact forces the
architecture: grounding enforcement is not a guardrail bolted on the side, it is the product.

Three properties make this a real system rather than a demo:

- **Abstention is a feature.** The most commercially valuable output is "we cannot prove
  this." Every competitor's chatbot will confidently answer; a system that reliably declines
  is what a compliance team can actually sign.
- **Multi-tenancy with document-level ACLs is non-negotiable.** A consultancy answering
  questionnaires for five clients cannot leak client A's pentest findings into client B's
  answer. Permission-filtered retrieval — filtered *inside* the query — is the hard part.
- **The agent loop is genuinely multi-step.** Plan → retrieve → tool-call → synthesize →
  critique → ground-check → emit or abstain. That is not a single completion with a
  retrieval prefix.

---

## 3. What the system does — end to end

```
1. ONBOARD      Tenant is created. API key issued. ACL tag vocabulary defined.

2. INGEST       Upload policies, SOC 2 narratives, architecture docs, pentest reports,
                prior questionnaire responses. Each document is parsed with structure
                preserved, chunked on semantic boundaries, contextually augmented,
                embedded, and indexed with tenant_id + acl_tags on every row.

3. SUBMIT       Drop in a questionnaire (CAIQ .xlsx, SIG .xlsx, or CSV/JSON). It is
                normalised into canonical items. A run is created.

4. RESOLVE      A Step Functions Distributed Map fans out over N questions at bounded
                concurrency. Each item runs the agent loop and lands as either an
                ANSWERED item with citations and a confidence score, or a GAP with a
                reason and a description of the missing evidence.

5. REVIEW       A human opens the run, sees answers alongside their source clauses, and
                can challenge any answer in a multi-turn chat: "this is too strong, we
                only do this in prod." The agent re-retrieves, revises, and re-grounds.
                Every correction is captured.

6. EXPORT       Approved answers are written back into the customer's original workbook,
                preserving its formatting, plus citations, confidence, and status columns.
                An audit bundle records where every answer came from.

7. COMPOUND     Reviewer corrections feed the evaluation golden set (after human
                confirmation, never automatically). Approved answers become retrievable
                by the agent as prior answers.
```

---

## 4. Functionality catalogue

Each capability has a stable ID used throughout the other documents and in commit messages.
Full acceptance criteria live in [01-product-spec.md](01-product-spec.md).

Rows marked **[ext]** are extensions, deferred out of the 140-hour core release and built only
after the release gates are green. See [11-delivery-plan.md §3](11-delivery-plan.md).

### F-1xx — Corpus ingestion

| ID | Capability |
|---|---|
| F-101 | Upload documents to a per-tenant S3 prefix; ingestion triggers automatically |
| F-102 | Parse PDF (text layer) and Markdown with heading hierarchy and page numbers preserved |
| F-103 | **[ext]** OCR fallback for scanned documents; DOCX parsing |
| F-104 | Structure-aware chunking on headings, control IDs, and numbered clauses |
| F-104a | **Injection screening before augmentation or embedding**; quarantine on flag |
| F-105 | Contextual chunk augmentation — prepend document-level context before embedding |
| F-106 | Embed and index into Postgres with vector + full-text columns |
| F-107 | Content-hash idempotency — re-uploading an unchanged document is a no-op |
| F-108 | Document versioning: immutable versions, supersede in one transaction, citations pinned |
| F-109 | Per-document ACL tag assignment at upload time |

### F-2xx — Retrieval

| ID | Capability |
|---|---|
| F-201 | Query decomposition — split compound questions into sub-queries |
| F-202 | Query rewriting into retrieval-friendly phrasing |
| F-203 | Hybrid search: vector KNN + full-text, fused with Reciprocal Rank Fusion |
| F-204 | Tenant and ACL predicates applied **inside** the SQL query, never post-filtered |
| F-204a | Filtered-search policy: iterative scan, adaptive `ef_search`, shortfall retry, exact fallback |
| F-205 | Cross-encoder reranking over the fused candidate set |
| F-206 | Context assembly under an explicit token budget with near-duplicate removal |
| F-207 | Stable citation IDs attached to every passage handed to the model |

### F-3xx — Answering

| ID | Capability |
|---|---|
| F-301 | Questionnaire normalisation from **CAIQ v4 .xlsx** and CSV/JSON into canonical items, at upload |
| F-301a | **[ext]** SIG and arbitrary workbook normalisation |
| F-302 | Per-question agent loop with **deterministic** turn, token, and wall-clock budgets |
| F-303 | Tool use: `search_corpus`, `get_document_section`, `check_aws_config` |
| F-303a | **[ext]** `lookup_prior_answer` |
| F-304 | Tool-argument validation with structured, model-recoverable errors |
| F-305 | Self-critique pass — every claim checked for citation support |
| F-306 | Grounding check over document **and live** evidence, with a configurable threshold |
| F-307 | Abstention: emit a structured GAP with reason and missing-evidence description |
| F-308 | Answer normalisation to the questionnaire's expected response type (YES/NO/NA + narrative) |
| F-309 | Run orchestration with bounded concurrency, per-item retry, partial-failure isolation |
| F-310 | Run lifecycle: create (idempotent, estimate-capped), monitor, cancel with a generation fence |
| F-310a | **[ext]** Resume failed items |
| F-311 | Live evidence: immutable, tenant-scoped, citable, grounded, with a staleness policy |

### F-4xx — Review

| ID | Capability |
|---|---|
| F-401 | Review API listing answers, gaps, citations, confidence, and status |
| F-402 | Multi-turn review chat scoped to a single answer, streamed over SSE, last-N turns |
| F-402a | **[ext]** Conversation windowing with rolling summarisation |
| F-403 | Revision: agent re-retrieves and re-grounds at the **same** threshold |
| F-404 | Approve / reject / edit an answer, with the edit persisted as feedback |
| F-405 | Minimal functional review UI — table, detail pane, citation viewer, chat |
| F-406 | Feedback capture feeding the golden-set promotion workflow |

### F-5xx — Export and audit

| ID | Capability |
|---|---|
| F-501 | Export back into the original CAIQ .xlsx, preserving formatting |
| F-502 | Export to CSV and JSON |
| F-503 | Audit bundle: resolves every `evidenceId` — document versions **and** live observations — plus prompt version and model IDs |
| F-504 | Run summary report — counts, coverage, gap list, cost |

### F-6xx — Tenancy and security

| ID | Capability |
|---|---|
| F-601 | Tenant provisioning with isolated S3 prefix, ACL tag vocabulary, and API key |
| F-602 | API-key authentication resolving to a tenant + ACL tag set |
| F-603 | Row-level security **enabled and forced on every tenant-scoped Postgres table** |
| F-604 | Prompt-injection defences: screening + quarantine, role separation, fencing, schema validation |
| F-605 | Redacted logging — document content and raw LLM IO never reach CloudWatch |

### F-7xx — Evaluation and operations

| ID | Capability |
|---|---|
| F-701 | Tier 1 deterministic assertions on every PR |
| F-702 | Tier 2 retrieval metrics (recall@k, MRR, nDCG) on every PR |
| F-703 | Tier 3 LLM-as-judge generation quality, nightly |
| F-704 | Tier 4 human review sample, per release |
| F-705 | Judge calibration against human labels with reported agreement |
| F-706 | CI gate blocking merge on metric regression beyond tolerance |
| F-707 | Distributed tracing, one trace per question, parent trace per run |
| F-708 | Cost and token metrics per call, rolled up per question and per run |
| F-709 | Operational dashboard and alarms |
| F-710 | One-command deploy into a fresh AWS account |

---

## 5. What it deliberately does not do (v1)

| Not building | Why |
|---|---|
| A polished product UI | The API is the product surface. UI is functional-only, and late. |
| Jira / Slack / Drata integrations | One live tool integration (AWS Config) proves the pattern. |
| SSO, billing, org management | API keys per tenant. Not the interesting engineering. |
| Fine-tuning | This is systems engineering, not model training. |
| Automatic answer submission to a portal | Humans approve. Always. |
| Multi-region / DR | Single region. Documented as a known limitation. |

This list is a contract. Re-read it at the start of every phase.

---

## 6. Non-functional targets

Targets, not guesses. Each is baselined in S2/S3 and gated from the point a baseline exists —
see [08-evaluation-spec.md §6](08-evaluation-spec.md) for the gating schedule.

| Dimension | Target | Enforced by |
|---|---|---|
| Retrieval relevance | recall@10 ≥ 0.85 on the **locked test split** | CI Tier 2 gate, from S2 wk 7 |
| Retrieval rejection | rejection rate ≥ 0.80 on no-evidence queries | CI Tier 2 gate |
| Authorised recall under ACL | ≥ 0.83, within 0.02 of unfiltered | CI isolation suite |
| Candidate shortfall | ≤ 0.02 (filtered-search failure) | CI isolation suite |
| Faithfulness | ≥ 0.95 of claims supported by cited evidence | CI Tier 3, once κ ≥ 0.6 |
| Correct abstention | ≥ 0.90 on no-evidence questions | CI Tier 3 gate |
| Fabrication rate | ≤ 0.05 confident answers on no-evidence questions | CI Tier 3, hard fail |
| Per-question latency | p95 ≤ 45 s | Telemetry + alarm |
| 200-question run | ≤ 25 min wall clock at concurrency 10 | Integration test |
| Cost per question | ≤ $0.12 | EMF metric + pre-run estimate cap |
| Idle infrastructure | ≤ $25/month with no traffic | **S0 go/no-go decision**, then budget alarm |
| Cross-tenant leakage | Zero. Provably. | Dedicated CI isolation suite, gated from S2 wk 5 |

Idle cost is a **decision**, not an aspiration: the S0 week-1 Aurora spike measures it, and if it
fails this target the choice is made explicitly in week 1 rather than discovered in week 9.

---

## 7. Timeline at a glance

14 calendar weeks, **10 hours per week, 140 hours**. Security and evaluation are vertical slices
that land with the data path they protect, not late phases. Full breakdown in
[11-delivery-plan.md](11-delivery-plan.md).

| # | Workstream | Hours | Weeks | Dates | Demonstrable outcome |
|---|---|---:|---|---|---|
| **S0** | Foundation + go/no-go spikes | 10 | 1 | Jul 27 – Aug 2 | `git push` deploys; Aurora cost and filtered-search behaviour decided |
| **S1** | Corpus, CAIQ ingestion, evidence model | 26 | 2–4 | Aug 3 – Aug 23 | Quarantine works; RLS on; a superseded document's citation still resolves |
| **S2** | Retrieval, Tier 2 eval, isolation gates | 26 | 5–7 | Aug 24 – Sep 13 | Locked-test baseline; four measured changes; leakage and shortfall gated |
| **S3** | Answer loop, orchestration, live evidence | 30 | 8–10 | Sep 14 – Oct 4 | Full CAIQ run: cited answers, flagged gaps, cost, deterministic budgets |
| **S4** | Review and XLSX export | 20 | 11–12 | Oct 5 – Oct 18 | Challenge → revise → approve → valid Excel round trip |
| **S5** | Release gates and evidence pack | 20 | 13–14 | Oct 19 – Nov 1 | Nine gates green; CI blocks a bad prompt change; self-pentest written |
| — | **Contingency (reserved)** | **8** | — | — | Not available for scope |

**Definition of done is the nine release gates** in [11-delivery-plan.md §6](11-delivery-plan.md),
not a phase boundary. **S3 is the technical end-to-end demo** — impressive, but not yet useful to
anyone, because nothing can be reviewed or exported until S4.

---

## 8. Revision history

### v2 — rebaseline after external review (2026-07-25)

An external review found the v1 doc set was not executable as written. The substantive fixes:

| # | Change | Why |
|---|---|---|
| 1 | **Rebaselined to one capacity number: 140 h at 10 h/week** | v1 totalled 190 h against a 196 h best case — six hours of slack — and separately claimed 140 h completed Phases 0–5, which actually summed to 158. The overview said ~175 h while the delivery plan said ~190. |
| 2 | **Security became vertical slices** | v1 deferred the isolation suite, RLS, injection quarantine, and log redaction to Phase 6 — *after* the phase it called "a complete project." A multi-tenant system is not complete first and secure later. |
| 3 | **[14-contracts.md](14-contracts.md) created as the normative source** | Enums, state machines, and normalisation timing had drifted across four documents because there was no single place to look. |
| 4 | **Immutable document versions ([ADR-0006](adr/0006-evidence-identity.md))** | v1's `document` table had one row per document but the API exposed `supersedes` and citations carried a version. A citation could not be pinned to the version it cited — which breaks the audit story the product rests on. |
| 5 | **Live evidence became first-class ([ADR-0006](adr/0006-evidence-identity.md))** | v1 required every claim to cite evidence but typed citations as document chunks only, making any AWS Config-grounded claim uncitable by construction. Live observations are now immutable, citable, grounded, and carry a staleness policy. |
| 6 | **Filtered-search policy ([ADR-0007](adr/0007-filtered-vector-search.md))** | Putting ACL predicates inside the query is necessary but not sufficient: approximate HNSW search can return too few permitted rows, silently turning a permission boundary into a recall collapse. Now mitigated *and* gated by `shortfallRate`. |
| 7 | **Retrieval eval split into three suites** | v1 scored no-answer questions with recall/MRR/nDCG, which are undefined without gold chunks. Rejection and isolation now have their own metrics. |
| 8 | **Locked train/dev/test splits, frozen before tuning** | v1 seeded the golden set from the current retriever and repaired it from its own failures, with no holdout — a benchmark trained to the implementation. |
| 9 | **Three-way judge split** | v1 fed judge disagreements into the judge's few-shot examples and re-measured agreement on the same items. κ is now reported from an untouched validation set. |
| 10 | **Evals report-only until a baseline exists** | Except leakage, where zero is the only acceptable value from day one. |
| 11 | **Generation fence for cancellation** | v1's item states had no `IN_PROGRESS`/`CANCELLED` and no attempt counter, so an in-flight worker could write after a cancel. |
| 12 | **Cost controls became preventative** | v1 had a $50/month alarm alongside a possible $130/month nightly eval schedule and Aurora at up to $43. Nightly Tier 3 is now off by default; a pre-run estimate cap blocks expensive runs before they start. |
| 13 | **Scope cut to CAIQ v4 XLSX only** | "Custom enterprise forms" is not a testable contract. SIG, OCR, DOCX, `lookup_prior_answer`, resume, and conversation summarisation are extensions. |
| 14 | **Risk register gained owner, status, residual rating, and a recovery drill** | Plus a schedule trigger at the *first* missed milestone. |

Kept against the review's recommendation, with reasons: Step Functions Distributed Map, minimal
multi-turn review, and `check_aws_config` with its full evidence contract.

### v1 — corrections to the original single-file plan (2026-07-25)

Added questionnaire ingestion and export (both entirely unscheduled); scheduled the UI; moved
Lambdas out of the VPC to avoid a NAT Gateway ([ADR-0005](adr/0005-data-access-path.md));
specified auth and identity→ACL resolution; budgeted golden-set labelling; moved Bedrock model
access and quota requests to week 1; made the cost model a formula rather than a number; added
run idempotency and cancellation; split career framing into
[99-portfolio-positioning.md](99-portfolio-positioning.md); added the risk register.

---

## 9. Document map

| Doc | Answers |
|---|---|
| [01-product-spec.md](01-product-spec.md) | Who is this for, what must it do, how do we know it's done |
| [02-architecture.md](02-architecture.md) | What are the components, why these and not the alternatives |
| [03-retrieval-spec.md](03-retrieval-spec.md) | How does a document become a retrievable, permission-scoped chunk |
| [04-agent-spec.md](04-agent-spec.md) | What exactly does the loop do, and what happens when it goes wrong |
| [05-api-spec.md](05-api-spec.md) | What is the HTTP contract |
| [06-data-model.md](06-data-model.md) | What is stored where, and what are the access patterns |
| [07-security-threat-model.md](07-security-threat-model.md) | What can an attacker do, and what stops them |
| [08-evaluation-spec.md](08-evaluation-spec.md) | How do we know quality changed, and in which direction |
| [09-observability-and-cost.md](09-observability-and-cost.md) | What does it cost, how fast is it, how do we see inside it |
| [10-corpus-spec.md](10-corpus-spec.md) | What documents exist, and why they are deliberately hard |
| [11-delivery-plan.md](11-delivery-plan.md) | What happens in which week |
| [12-engineering-practices.md](12-engineering-practices.md) | How the code is organised, tested, reviewed, and shipped |
| [13-risk-register.md](13-risk-register.md) | What could go wrong and what we'll do about it |
| **[14-contracts.md](14-contracts.md)** | **Normative: enums, state machines, evidence model, version identity** |
| [adr/](adr/) | The decisions, including the rejected options |

---

## 10. First six actions

All in week 1. Every one of them is something that costs an hour now and a phase later.

1. Confirm the IP position on personally-created work with the current employer, in writing.
   See [13-risk-register.md](13-risk-register.md) R-01.
2. Set AWS budget alarms — $30/month warn, $75/month alarm — **before provisioning anything**.
3. Request Bedrock model access for every model in the routing table, in the target region, and
   file on-demand quota increases. Lead time is days.
4. **Run the Aurora idle-cost and resume-latency spike.** It is a go/no-go against N-09, recorded
   as an ADR. If it fails, decide in week 1, not week 9.
5. **Run the pgvector filtered-search spike** ([ADR-0007](adr/0007-filtered-vector-search.md)). If
   the mitigation does not behave as expected, that reopens the vector-store decision — far
   cheaper now than in week 7.
6. Create the repo, write `packages/core/contracts/` from
   [14-contracts.md](14-contracts.md), and stand up the deploy pipeline green before touching a
   model.
