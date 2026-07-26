# 11 — Delivery Plan

**Status:** Rebaselined v2 (supersedes v1) · **Window:** 2026-07-27 → 2026-11-01 (14 weeks)
**Capacity baseline:** **10 hours/week = 140 hours total**
**Definition of done:** a **security-gated portfolio release** — see [§6 Release gates](#6-release-gates)

---

## 1. Why this was rebaselined

The v1 plan totalled 190 hours against a 196-hour best case — six hours of slack for AWS access
delays, unfamiliar services, evaluation labelling, debugging, and any rework at all. It also
claimed 140 hours reached the end of Phase 5, when Phases 0–5 actually summed to 158
(`12+42+30+34+24+16`). And it called Phase 5 "a complete project" while deferring the isolation
suite, RLS testing, injection quarantine, and log redaction to Phase 6 — controls the same
document called non-negotiable.

A multi-tenant system is not complete first and secure later. This version fixes all three:

- **One capacity baseline: 140 hours.** Anything above 10 h/week becomes buffer, not scope.
- **Security is a vertical slice**, landing with the data path it protects, not as a late phase.
- **Contingency is 8 hours, reserved, not allocated.**

Scope reductions that paid for keeping Distributed Map, multi-turn review, and the live tool:
corpus 40 → 25 documents, OCR and DOCX parsing cut, canary/auto-rollback cut, polished
dashboard reduced to thin telemetry plus one small dashboard.

---

## 2. Budget

| # | Workstream | Hours | Weeks | Dates |
|---|---|---:|---|---|
| S0 | Foundation and go/no-go spike | 10 | 1 | Jul 27 – Aug 2 |
| S1 | Corpus, CAIQ ingestion, evidence model | 26 | 2–4 | Aug 3 – Aug 23 |
| S2 | Retrieval, Tier 2 eval, isolation gates | 26 | 5–7 | Aug 24 – Sep 13 |
| S3 | Answer loop, orchestration, live evidence | 30 | 8–10 | Sep 14 – Oct 4 |
| S4 | Review and XLSX export | 20 | 11–12 | Oct 5 – Oct 18 |
| S5 | Release gates and evidence pack | 20 | 13–14 | Oct 19 – Nov 1 |
| — | **Contingency (reserved, unallocated)** | **8** | — | drawn as needed |
| | **Total** | **140** | | |

Planned work is 132 hours against 140 hours of capacity. The 8-hour gap is contingency and is
**not** available for scope.

**Rule: if a workstream overruns, cut scope inside it and record the cut. Never extend it.**

---

## 3. Scope of the core release

**One questionnaire format: CAIQ v4 XLSX**, with formatting-preserving write-back and explicit
unparsed-row reporting. CSV is supported as an import/export interchange format only. "Custom
enterprise forms" is not a testable contract and is not claimed anywhere.

**One evidence model**, covering document chunks and live observations
([14-contracts.md §5](14-contracts.md)).

**Deferred to extensions** — built only if capacity exceeds 10 h/week, and never before the
release gates are green:

| Deferred | Was |
|---|---|
| SIG and arbitrary workbook normalisation | F-301 partial |
| `lookup_prior_answer` tool | F-303 |
| Resume-failed-items endpoint | F-310 (the generation fence is still built — cancel needs it) |
| OCR fallback, DOCX parsing | F-103, F-102 partial |
| Conversation windowing and rolling summarisation | F-402 partial |
| Nightly Tier 3 evaluation | F-703 cadence |
| Canary deploy and automatic rollback | — |
| Broad operational dashboarding | F-709 partial |

**Kept against the review's advice**, with reasons in the response that accompanied this
rebaseline: Step Functions Distributed Map, minimal multi-turn review, and `check_aws_config`
with its full live-evidence contract.

---

## 4. Workstreams

### S0 — Foundation and go/no-go spike · Week 1 · Jul 27 – Aug 2 · 10 h

Nothing here is optional and nothing here is code you keep. It exists to make the expensive
surprises happen in week 1.

- [ ] Read the employment IP assignment clause; request a written carve-out if broad (R-01)
- [ ] AWS Budgets: $30/month warn, $75/month alarm — **before provisioning anything**
- [ ] Request Bedrock model access for every model in the routing table, target region
- [ ] File on-demand quota increases (lead time is days)
- [ ] Verify Cohere Rerank regional availability; record the fallback if absent
- [ ] **Aurora go/no-go spike**: measure real idle cost and resume latency against N-09
      (≤ $25/month idle). A go/no-go decision, recorded in an ADR, not an assumption
- [ ] **pgvector filtered-search spike**: confirm iterative-scan behaviour under a restrictive
      ACL predicate (see [ADR-0007](adr/0007-filtered-vector-search.md))
- [ ] Repo, pnpm workspace, TypeScript strict, Vitest, ESLint
- [ ] `packages/core/contracts/` from [14-contracts.md](14-contracts.md) — enums first
- [ ] `specs/000-product.md`, `CLAUDE.md`, `AGENTS.md`
- [ ] CDK: API Gateway → Lambda → DynamoDB hello path; Aurora with Data API
- [ ] GitHub Actions, OIDC, SHA-pinned, lint/typecheck/test/synth
- [ ] One trivial eval running in CI

**Exit:** `git push` deploys, CI green, budget alarms live, model access granted, Aurora
decision recorded. IP position confirmed in writing.

**If the Aurora spike fails N-09:** stop and decide before S1 — raise the budget with eyes open,
or evaluate an alternative store. Do not discover this in week 9.

---

### S1 — Corpus, CAIQ ingestion, evidence model · Weeks 2–4 · Aug 3 – Aug 23 · 26 h

**Security in this slice:** injection screening before any LLM call; log redaction with the
first LLM call; RLS enabled on every tenant-scoped table as it is created.

**Week 2 (10 h) — corpus core and contracts**
- [ ] Author 8 core Northwind documents, including 2 restricted and 1 injection payload
- [ ] Postgres schema per [14-contracts.md §6](14-contracts.md): `document`,
      `document_version` (immutable), `chunk`, `live_evidence`
- [ ] **RLS enabled and FORCEd on all four tables**, with the session-variable harness
- [ ] Parser: PDF text-layer and Markdown only, heading path and page preserved
- [ ] Structure-aware chunker + unit tests against fixtures

**Week 3 (10 h) — screening, augmentation, indexing**
- [ ] **Injection screening step, before contextual augmentation and embedding** — `SCREENING`
      → `QUARANTINED` or `EMBEDDING`; verdict, reason, and timestamps persisted
- [ ] Contextual chunk augmentation with prompt caching
- [ ] Embedding with content-hash cache
- [ ] Version-activation transaction ([14-contracts.md §6](14-contracts.md))
- [ ] **Log-redaction assertion** with the first LLM call: no document text in CloudWatch
- [ ] Ingestion Step Function, S3 → EventBridge, content-hash idempotency

**Week 4 (6 h) — questionnaire and evidence**
- [ ] CAIQ v4 XLSX normaliser with `sourceCell` capture and unparsed-row reporting
- [ ] Questionnaire state machine, normalisation **at upload only**
- [ ] `Evidence` union type and `live_evidence` table with staleness fields
- [ ] Corpus to 18 documents

**Exit:** a document round-trips to retrievable chunks. Quarantine works — the injection payload
is caught before embedding. RLS is on and tested. Historical citation resolution test passes
(supersede a document, old citation still resolves to the old text).

**Cut first if slipping:** corpus to 15 documents; questionnaire normaliser slides to S3.

---

### S2 — Retrieval, Tier 2 eval, isolation gates · Weeks 5–7 · Aug 24 – Sep 13 · 26 h

**Security in this slice:** the two canonical isolation tests land with the *first* retrieval
query, not in a hardening phase.

**Week 5 (10 h) — hybrid retrieval with the boundary built in**
- [ ] Vector branch with `tenant_id` + `acl_tags` predicates **inside** the query
- [ ] **The two isolation tests, same commit as the first retrieval query**
- [ ] Static-analysis CI check: every query against `chunk`, `prior_answer`, `live_evidence`
      carries both predicates
- [ ] Full-text branch, parallel execution, RRF fusion
- [ ] **Filtered-search policy** from the S0 spike: iterative scan, `ef_search`, and
      candidate-shortfall retry ([ADR-0007](adr/0007-filtered-vector-search.md))

**Week 6 (10 h) — eval sets, designed before they are labelled**
- [ ] Redesign the fixtures **first**: relevance / rejection / isolation suites are separate
      files with different metrics ([08-evaluation-spec.md](08-evaluation-spec.md))
- [ ] Freeze **train / dev / locked-test** splits before any tuning
- [ ] Labelling CLI; label 80 relevance queries, 20 rejection, 20 isolation
- [ ] Tier 2 runs in CI **report-only** — no gate until a baseline exists
- [ ] Corpus to 25 documents with all planted difficulties

**Week 7 (6 h) — quality experiments**
- [ ] Query decomposition and rewriting
- [ ] Reranking behind a flag, with the measured keep/drop bar applied
- [ ] Context assembly: token budget, dedup, citation IDs
- [ ] Record the baseline on the locked test set; **turn Tier 2 gating on**

**Exit:** `docs/optimizations.md` shows four measured changes including one rejected. Locked-test
baseline recorded. Isolation and shortfall gates green. Tier 2 gating enabled.

**Cut first if slipping:** embedding bake-off (pick Titan, record the deferral); RRF `k` sweep.

---

### S3 — Answer loop, orchestration, live evidence · Weeks 8–10 · Sep 14 – Oct 4 · 30 h

The largest workstream, and the one that must not be compressed.

**Week 8 (10 h) — the loop, with deterministic budgets**
- [ ] Converse control loop with the corrected budget semantics
      ([04-agent-spec.md §2](04-agent-spec.md)) — every stage reserves and charges; exhaustion
      persists `FAILED_BUDGET` immediately and stops
- [ ] Four budget-exhaustion tests: before generation, during tool use, before critique,
      during the one allowed revision
- [ ] Structured output with Zod validation
- [ ] Deterministic citation-existence check

**Week 9 (10 h) — tools, live evidence, grounding**
- [ ] `search_corpus` and `get_document_section` with strict schemas
- [ ] Tool failure handling; `FAILED_TOOL_ARGS` after 3 invalid attempts
- [ ] **`check_aws_config` writing immutable `LiveEvidence`** before the model sees the result,
      with staleness policy enforced
- [ ] Grounding check over document **and** live evidence
- [ ] Self-critique; abstention with specific `missingEvidence`

**Week 10 (10 h) — orchestration**
- [ ] Distributed Map, concurrency tuned from 5 against observed throttling
- [ ] Item state machine and **generation fence** ([14-contracts.md §4](14-contracts.md))
- [ ] Cancel with the sweeper; conditional writes proven by a race test
- [ ] Idempotent run creation; **pre-run estimate cap** enforced
- [ ] Thin cost and latency telemetry — in the first end-to-end run, not deferred
- [ ] First full CAIQ run

**Exit:** a full CAIQ run completes with cited answers and flagged gaps, a cost figure, and a
p95. Budget exhaustion is deterministic and tested. Cancel does not lose or corrupt items.

**This is the technical end-to-end demo, not the minimum shippable product** — it has no review
or export path yet, which is what makes it useful to anyone.

**Cut first if slipping:** `get_document_section`; concurrency tuning (fix at 5).

---

### S4 — Review and XLSX export · Weeks 11–12 · Oct 5 – Oct 18 · 20 h

**Week 11 (10 h) — review**
- [ ] Review API: list, filter, get with resolved citations of both kinds
- [ ] Approve / reject / edit with feedback capture
- [ ] **Minimal multi-turn**: challenge → re-retrieve → revise → re-ground at the same
      threshold. No windowing, no summarisation, last N turns verbatim, capped
- [ ] Audit bundle resolving `evidenceId` for documents and live observations

**Week 12 (10 h) — export and thin UI**
- [ ] Formatting-preserving XLSX write-back via `sourceCell`
- [ ] CSV and JSON export; run summary with the gap list
- [ ] Thin review UI: table, detail pane, citation viewer, chat. Functional only
- [ ] **Export round-trip test**: opens in Excel, non-answer cells and formatting unchanged

**Exit:** challenge an answer, get a revised and re-grounded response, approve it, export a
workbook that opens correctly with formatting intact.

**Cut first if slipping:** the UI drops to a CLI review tool. The API is the deliverable.

---

### S5 — Release gates and evidence pack · Weeks 13–14 · Oct 19 – Nov 1 · 20 h

Not "hardening" — this is where the claims get proven. The controls themselves already exist
from S1–S3.

**Week 13 (10 h) — generation eval and judge**
- [ ] `generation.jsonl` and `abstention.jsonl` against the locked test split
- [ ] Judge with **three-way split**: prompt-dev / calibration / untouched validation
- [ ] Report Cohen's κ **on validation**; gate only if κ ≥ 0.6
- [ ] Calibrate the grounding threshold; fit confidence weights
- [ ] Thresholds populated from real baselines; PR report comment

**Week 14 (10 h) — evidence pack**
- [ ] Isolation fuzzing across every ID-bearing endpoint
- [ ] Self-pentest against the deployed stack → `docs/pentest-self-assessment.md`
- [ ] **Restore/reindex drill**, timed, with a stated RTO/RPO (R-17)
- [ ] One small dashboard and the alarms that map to runbook entries
- [ ] `docs/cost-model.md` with measured per-stage numbers; `optimizations.md` finalised
- [ ] README, ADRs (8–12 including rejections), `docs/ai-workflow.md`
- [ ] 5-minute demo recording

**Exit:** all nine release gates in §6 are green, with artifacts.

---

## 5. Milestones

| # | Milestone | Date | Definition |
|---|---|---|---|
| M1 | Pipeline green, Aurora decided | Aug 2 | Deploys; budget alarms live; go/no-go recorded |
| M2 | Evidence path trustworthy | Aug 23 | Quarantine works; RLS on; historical citations resolve |
| M3 | Retrieval baseline locked | Sep 13 | Locked-test baseline; isolation + shortfall gates green |
| M4 | Technical end-to-end demo | Oct 4 | Full CAIQ run, cited answers, gaps, cost, deterministic budgets |
| M5 | Usable workflow | Oct 18 | Challenge → revise → approve → valid Excel round trip |
| M6 | **Security-gated release** | Nov 1 | All nine gates green with artifacts |

**Schedule intervention triggers at the first missed milestone**, not after a prolonged decline.
Missing one means cutting from §3's deferral list immediately, in that week.

---

## 6. Release gates

The project is complete when all nine are true and evidenced. Not before.

1. **Isolation** — zero cross-tenant or unauthorised-ACL chunks across the dedicated suite; the
   next-best *permitted* result is returned, not an empty one.
2. **Citation integrity** — every citation resolves to the exact immutable evidence version used
   at generation time; fabricated IDs fail deterministically.
3. **Abstention** — the locked no-evidence set meets the correct-abstention target with zero
   unsupported fallback prose.
4. **Retrieval** — locked-test recall and leakage gates pass; no-answer cases evaluated with a
   rejection metric, never with recall.
5. **Lifecycle** — upload, normalise, run, cancel, review, export transitions are legal,
   persisted, and idempotent; the generation fence is proven by a race test.
6. **Budget** — turn/token/wall-clock ceilings terminate deterministically; runs above the
   estimate cap require explicit override.
7. **Export** — the CAIQ workbook opens in Excel with formatting and non-answer cells unchanged.
8. **Security** — injection fixtures quarantined or safely ignored; tenant RLS active on every
   tenant-scoped table; logs contain no document or prompt content.
9. **Reproducibility** — corpus, prompts, models, retrieval parameters, and thresholds behind the
   headline report are all versioned and recorded.

---

## 7. Descoping ladder

When time runs short, cut in this order.

1. Demo video polish → unedited screen recording
2. Thin UI → CLI review tool
3. Small dashboard → CloudWatch Logs Insights queries in the runbook
4. Embedding bake-off → pick one, document the deferral
5. `get_document_section` tool → drop
6. Corpus 25 → 18 documents, keeping every planted difficulty
7. Reranking → RRF only, record the deferral
8. ───── **cut line — below this the release gates fail** ─────
9. Isolation tests · injection quarantine · RLS
10. Locked-test split and Tier 2 gating
11. Abstention path and grounding threshold
12. Immutable evidence and citation resolution
13. Deterministic budget exhaustion

---

## 8. Weekly discipline

1. Re-read the scope in §3. It is a contract.
2. Check spend against both budget alarms.
3. One concern per PR. Retrieval and generation never in the same commit.
4. No performance change without a before number in `optimizations.md`.
5. At a missed milestone, cut from §3 that week — do not absorb it into contingency.
6. Contingency is drawn explicitly and logged, never silently consumed.
