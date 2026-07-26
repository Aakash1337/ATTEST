# Feedback on the Current ATTEST Plan

**Review date:** 2026-07-25  
**Review scope:** `README.md`, the current `docs/` set, and the ADRs. The original
`ATTEST-project-plan.md` was used only to identify inconsistencies because the README says the
`docs/` set supersedes it.

## Executive assessment

ATTEST is a strong project concept with unusually good planning discipline. The product thesis is
clear, the abstention-first stance is credible, retrieval is evaluated separately from generation,
and the security model treats multi-tenancy and untrusted corpus content as correctness concerns
rather than afterthoughts.

The current plan is not yet executable as written, however. Its main problem is not the technical
direction; it is that the document set combines:

1. a 14-week, part-time portfolio build;
2. a usable questionnaire-review workflow; and
3. production-grade multi-tenant security, operations, and evaluation.

Those are three different completion standards. The schedule has almost no contingency at the
14-hour/week case and is arithmetically impossible at 10 hours/week. More importantly, the plan
calls Phase 5 a complete project even though several controls described as non-negotiable do not
arrive until Phase 6.

**Recommendation:** keep the thesis and architecture, but rebaseline the plan around one explicit
definition of “done.” For a 14-week solo build, the best definition is a **security-gated portfolio
release**: one supported questionnaire format, one coherent evidence path, a minimal review/export
flow, and automated proof of isolation, abstention, citation integrity, and cost bounds. Treat the
broader multi-format, live-tool, conversational, and operational features as extensions.

## What is already strong

- The product can be explained in one sentence, and “evidence-backed answers, or no answer at all”
  is a real differentiator rather than a cosmetic slogan.
- Retrieval and generation have separate metrics and change discipline. That will make experiments
  interpretable instead of producing one blended “answer quality” number.
- `tenant_id` and ACL filters are explicitly required inside retrieval queries
  (`docs/03-retrieval-spec.md:153-179`), and the plan includes the important “next-best permitted
  result” test (`docs/07-security-threat-model.md:86-98`).
- `GAP` is modeled as a successful, useful outcome, while turns, tokens, tools, and wall-clock time
  are meant to be bounded (`docs/04-agent-spec.md:7-17`).
- The delivery plan has phase exits, cut options, and a descoping ladder. The structure is good even
  though the current arithmetic and cut line need correction.
- The threat model is concrete and test-oriented. The red-team corpus and deterministic citation
  checks are particularly valuable.
- The documentation is strong enough that implementation gaps can already be found before code
  exists. That is exactly what a pre-build plan should accomplish.

## Must fix before implementation

### 1. Rebaseline the schedule and completion claim

Phases 0–5 total **158 hours**, not 140:

`12 + 42 + 30 + 34 + 24 + 16 = 158`

The delivery plan nevertheless says that 10 hours/week for 14 weeks, or 140 hours, reaches the end
of Phase 5 (`docs/11-delivery-plan.md:12-30`). The full 190-hour plan fits into the 196-hour best
case with only six hours of slack. That is not enough contingency for AWS access, unfamiliar
services, evaluation labeling, debugging, or a single rework cycle. The overview also says roughly
175 hours, which conflicts with the delivery plan’s 190-hour total
(`docs/00-OVERVIEW.md:244`; `docs/11-delivery-plan.md:12-22`).

**Change:**

- Choose one capacity baseline. Use **140 hours** if this remains a part-time commitment.
- Reserve at least **10–15% contingency** instead of allocating every available hour.
- Rename the current Phase 3 exit from “minimum shippable story” to **technical end-to-end demo**.
  It does not yet include the review/export outcome that makes the product useful
  (`docs/11-delivery-plan.md:143-178`).
- Do not describe Phase 5 as complete until the minimum security release gates are green.

### 2. Move minimum security into the core path

The plan says isolation tests are never cut (`docs/11-delivery-plan.md:270-285`) and defines zero
cross-tenant retrieval as N-10 (`docs/01-product-spec.md:188-201`). Yet the full isolation suite,
RLS testing, injection classifier, log-redaction test, and IAM pass are all deferred to Phase 6,
after the Phase 5 “complete” cut line (`docs/11-delivery-plan.md:182-214`).

That ordering contradicts the product thesis. A multi-tenant system is not complete first and
secure later.

**Change:**

- Implement the two canonical tenant/ACL retrieval tests with the first retrieval query.
- Enable and test RLS when each tenant-scoped table is introduced.
- Add injection quarantine before untrusted chunks are augmented or embedded.
- Add log-redaction assertions with the first LLM call.
- Keep the Phase 6 self-pentest and broader fuzzing as hardening, not as the first proof that the
  boundary works.

### 3. Make document versioning representable

The API exposes `supersedes`, a numeric version, and citations containing `documentVersion`
(`docs/05-api-spec.md:71,90,201`). The proposed schema gives `document.doc_id` a single-row primary
key, while `chunk` separately stores `doc_version` (`docs/06-data-model.md:123-153`). There is no
key representing an immutable document version, so multiple versions cannot coexist cleanly and a
citation cannot be protected by a foreign key to the exact version cited.

**Change:**

- Introduce immutable `document_version` records keyed by `(document_id, version)`, or state that
  every version gets a new immutable `doc_id`.
- Point chunks and citations to that immutable version key.
- Define the transaction that activates a new version and supersedes the old one.
- Add a test proving that a historical answer still resolves to the exact evidence version it
  originally cited.

### 4. Define one questionnaire and run state machine

The API describes questionnaire upload followed by normalization and a `NORMALISED` state
(`docs/05-api-spec.md:107-120`). The architecture instead says `POST /runs` loads and normalizes the
workbook (`docs/02-architecture.md:185-191`). The data model does not persist enough questionnaire
status/failure/source-version information to reconcile those flows.

Cancellation and resume have a similar gap. They are public API capabilities, but the model lacks
per-item in-progress/cancelled states, attempt numbers, or an execution-generation fence. An
in-flight worker could therefore write after cancellation, or an old attempt could overwrite a
resumed one.

**Change:**

- Normalize at ingestion time only.
- Persist
  `PENDING_UPLOAD → NORMALISING → NORMALISED | FAILED`, including source object version/ETag and
  failure details.
- Reject run creation unless the referenced questionnaire version is `NORMALISED`.
- Define legal run and item transitions.
- If resume remains in v1, use attempt/generation numbers and conditional writes. Otherwise cut
  resume from v1 consistently in the product spec, API, and delivery plan.

### 5. Repair the evaluation design before labeling the dataset

Several current metrics cannot support the claims they are meant to prove:

- `no-answer` cases intentionally have no gold chunks, so recall, MRR, and nDCG are undefined or
  misleading for that category. The current retrieval suite includes them in a gold-chunk-based
  design (`docs/08-evaluation-spec.md:50-67`; `docs/03-retrieval-spec.md:257-277`).
- The ACL fixture records tags but does not clearly encode caller identity, permitted gold chunks,
  and forbidden chunks. That cannot independently measure authorized recall and leakage.
- Golden examples are seeded from the current retriever and corpus gaps are later repaired from
  eval failures. Without a locked holdout, the benchmark can gradually be trained to the
  implementation.
- Judge disagreements are added to the judge’s few-shot examples
  (`docs/08-evaluation-spec.md:156-170`), but the plan does not specify a separate untouched
  validation set. Agreement measured again on the same examples would be optimistic.
- Phase 5 allocates 16 hours for golden-set completion, 50 human labels, judge construction,
  calibration, threshold fitting, CI reporting, and Tier 4 review
  (`docs/11-delivery-plan.md:182-196`). That is not credible.

**Change:**

- Exclude empty-gold cases from relevance metrics. Add false-evidence/retrieval-rejection metrics
  for no-answer queries.
- Add `tenantId`, caller ACLs, allowed gold IDs, forbidden IDs, and expected outcome to isolation
  fixtures. Report authorized recall and leakage separately.
- Freeze train/dev/locked-test splits before retrieval tuning. Headline numbers come only from the
  locked test set.
- Split judge examples into prompt-development, calibration, and untouched validation sets.
- Make evaluation report-only until a baseline and minimum sample size exist; then turn on blocking
  thresholds.
- Move data labeling across several phases and budget it explicitly.

### 6. Give live tool results citeable provenance

The agent requires every claim to cite evidence from the retrieved set
(`docs/04-agent-spec.md:7-17`). `check_aws_config` results are appended to tool history, but the
answer and citation models describe document chunks only. A correct claim based on live AWS state
therefore has no durable citation type or timestamped provenance.

**Change:**

- Either defer `check_aws_config` from the core release, or normalize every live result into an
  immutable, tenant-scoped evidence record.
- Record source type, account/scope, rule, result, observation time, and stable evidence ID.
- Extend answer citations, grounding input, and the audit bundle to support both document evidence
  and live evidence.
- Add a staleness policy; a live observation must not be represented later as timeless fact.

## High-priority design improvements

### 7. Close the RLS coverage gap

The threat model says RLS is a defense-in-depth layer for tenant data
(`docs/07-security-threat-model.md:65-84`). The schema enables it only on `chunk`; the searchable
`prior_answer` table has tenant and ACL fields but no stated RLS policy
(`docs/06-data-model.md:155-188`).

Apply and force tenant RLS to every tenant-scoped Postgres table, including prior answers and
document metadata. Add the prior-answer path to the static predicate check and isolation suite.

### 8. Specify filtered approximate-search behavior

The vector query correctly puts tenant and ACL predicates inside SQL
(`docs/03-retrieval-spec.md:153-179`), but the plan does not explain how filtered HNSW search
preserves recall when many nearest neighbors are inaccessible. Approximate search may inspect
mostly filtered rows and return too few permitted candidates.

Specify the pgvector iterative-scan/`ef_search` policy, candidate-shortfall retry behavior, and the
parameters recorded with each retrieval experiment. Add a dense adversarial fixture in which the
nearest restricted and cross-tenant chunks surround the best permitted match.

### 9. Put injection quarantine in the ingestion pipeline

The threat model requires ingest-time detection and quarantine before indexing
(`docs/07-security-threat-model.md:102-120`). The retrieval ingestion flow currently sends parsed
chunks through contextual augmentation and embedding without defining that quarantine state.

Insert detection before any LLM augmentation or embedding. Persist verdict, reason, reviewer
decision, and audit timestamps. Quarantined content must be unreachable by active retrieval until
released and reindexed.

### 10. Make budget exhaustion deterministic

The pseudocode can exit `while budget allows` without assigning `draft` and then proceed to
self-critique (`docs/04-agent-spec.md:21-60`). It also does not state whether planner, retrieval,
tools, critique, guardrail calls, and revisions all consume the same budget.

Define reservation and charging rules for every stage. On exhaustion, immediately persist
`FAILED_BUDGET` with counters and stop. Test exhaustion before generation, during tool use, before
critique, and during the one allowed revision.

### 11. Make cost controls preventative, not only observational

The plan’s `$50/month` alarm cannot coexist with a possible `$130/month` nightly Tier 3 evaluation
schedule, before infrastructure cost (`docs/09-observability-and-cost.md:150-162`). Aurora alone is
estimated at up to $43/month while N-09 requires idle infrastructure at or below $25/month
(`docs/01-product-spec.md:195-201`).

The worked example also has a small arithmetic error: $0.06–$0.09 × 200 is $12–$18, not $13–$19
(`docs/09-observability-and-cost.md:129-132`).

**Change:**

- Make the Aurora Week 1 experiment a go/no-go decision tied to N-09.
- Default Tier 3 to manual/on-merge sampling; nightly evaluation requires explicit budget approval.
- Add a hard pre-run estimate ceiling, per-item token/turn caps, and a monthly eval scheduler cap.
- Measure all-in run cost separately from model/guardrail variable cost.
- Move thin cost/latency telemetry into the first end-to-end run; defer only the polished dashboard.

### 12. Reduce CI ceremony to fit the project

The engineering practices are thoughtful but too broad for a solo 140-hour release if all are
implemented literally. A deployed-stack isolation suite on every commit, full release
attestations, canary rollback, extensive ADR production, broad dashboarding, and multiple
evaluation tiers compete with core functionality.

Use this minimum:

- **PR:** unit tests, schema/contract tests, deterministic citation checks, static tenant-predicate
  checks, and small local retrieval fixtures.
- **Merge:** one deployed isolation smoke suite and Tier 2 retrieval evaluation.
- **Manual/release:** full isolation fuzzing, judge evaluation, export round trip, restore/reindex
  drill, and self-pentest.

This keeps the controls that prove the thesis without turning the plan into a platform-engineering
exercise.

### 13. Align the advertised format scope

The README promises CAIQ, SIG, and custom enterprise forms, while concrete acceptance primarily
covers CAIQ v4, SIG-style XLSX, CSV, and JSON (`README.md:5-8`;
`docs/01-product-spec.md:142-175`). “Custom enterprise forms” is not a testable format contract.

For the core release, support **CAIQ v4 XLSX only**, including formatting-preserving write-back and
explicit unparsed-row reporting. Document CSV as an import/export interchange format if desired.
Add SIG and arbitrary workbooks only after defining their mapping and unsupported-format behavior.

### 14. Add risk ownership and recovery proof

The risk register has useful triggers and mitigations, but lacks owner, status, next review date,
and residual risk. Schedule risk is rated too lightly relative to the almost slackless plan.

Add columns for owner, status, next action/date, and residual rating. Add a recovery risk and one
tested restore/reindex drill with a modest RTO/RPO. Trigger schedule intervention at the first
missed phase exit, not after a prolonged capacity decline.

## Cross-document corrections

| Issue | Evidence | Correction |
|---|---|---|
| Total effort is ~175 h in the overview and ~190 h in delivery | `docs/00-OVERVIEW.md:244`; `docs/11-delivery-plan.md:12-22` | Use one authoritative total and derived phase sums. |
| Phase 0–5 requires 158 h, but the 140 h case claims to complete it | `docs/11-delivery-plan.md:12-30` | Rebaseline scope or move the cut line. |
| Document statuses differ (`PENDING` vs `PENDING_UPLOAD`, plus different intermediate states) | `docs/01-product-spec.md:82`; `docs/02-architecture.md:178`; `docs/05-api-spec.md:78-91` | Define one status enum and import it into every contract. |
| `missing_evidence` and `missingEvidence` are both used | `docs/01-product-spec.md:152`; `docs/04-agent-spec.md:58`; `docs/05-api-spec.md:216,260` | Use camelCase in JSON/TypeScript contracts and map explicitly if SQL uses snake_case. |
| F-303 requires all four tools while delivery says `lookup_prior_answer` may be deferred | `docs/01-product-spec.md:147-155`; `docs/11-delivery-plan.md:128-149` | Make the requirement conditional or move the tool out of v1. |
| Corpus and golden-set completion timing differs among overview, corpus, risk, and delivery docs | `docs/00-OVERVIEW.md:216`; `docs/10-corpus-spec.md:168-172`; `docs/11-delivery-plan.md:90-109`; `docs/13-risk-register.md:36` | Create one dated corpus/eval milestone table. |
| Planned deliverables do not yet exist | `docs/11-delivery-plan.md:208-232`; `docs/09-observability-and-cost.md:181-196` | Mark future paths as “planned” or add placeholders when their phase begins. |

## Recommended 140-hour rebaseline

The following is a more credible core plan for 10 hours/week over 14 weeks. Security and
evaluation are vertical slices, not late phases.

| Workstream | Hours | Core outcome |
|---|---:|---|
| Foundation and spike | 10 | Skeleton, CI, AWS access, Aurora cost/latency go/no-go |
| Corpus and CAIQ ingestion | 28 | Versioned corpus, CAIQ round trip, quarantine path |
| Retrieval and Tier 2 eval | 26 | Hybrid retrieval, locked test split, ACL/isolation gates |
| Answer loop and orchestration | 28 | One grounded evidence path, deterministic budgets, gaps |
| Review and XLSX export | 20 | Minimal CLI or thin UI, approval/edit, valid workbook |
| Release gates and evidence | 20 | Security smoke suite, generation/abstention eval, cost report, self-pentest summary |
| Contingency | 8 | Debugging, AWS/API surprises, rework |
| **Total** | **140** | Security-gated portfolio release |

### Defer from the 140-hour core

- SIG and arbitrary workbook normalization;
- `lookup_prior_answer`;
- resume-failed-items;
- live AWS Config, unless its citeable evidence contract is implemented early;
- multi-turn conversational review;
- Step Functions Distributed Map if a simpler bounded worker pool proves the thesis;
- polished React UI;
- nightly judge evaluation;
- canary/automatic rollback and broad operational dashboarding.

These are useful extensions, but none is as valuable as a trustworthy CAIQ demonstration with
measured retrieval, exact citations, correct abstention, tenant isolation, and a valid Excel
round trip.

## Minimum release gates

Call the project complete only when all of these are true:

1. **Isolation:** zero cross-tenant or unauthorized-ACL chunks across the dedicated test suite; the
   next-best permitted result is returned.
2. **Citation integrity:** every citation resolves to the exact immutable evidence version used at
   generation time; fabricated IDs fail deterministically.
3. **Abstention:** the locked no-evidence set meets the agreed correct-abstention target with zero
   unsupported fallback prose.
4. **Retrieval:** locked-test recall and leakage gates pass, with no-answer cases evaluated using
   an appropriate rejection metric.
5. **Lifecycle:** upload, normalize, run, cancel/fail, review, and export transitions are legal,
   persisted, and idempotent.
6. **Budget:** turn/token/wall-clock ceilings terminate deterministically, and runs above the hard
   estimate cap require an explicit override.
7. **Export:** the supported CAIQ workbook opens in Excel with formatting and non-answer cells
   unchanged.
8. **Security:** injection fixtures are quarantined or safely ignored, tenant-scoped RLS is active,
   and logs contain no document or prompt content.
9. **Reproducibility:** the corpus, prompts, models, retrieval parameters, and thresholds used for
   the headline report are versioned.

## Suggested next three actions

1. Rewrite `docs/11-delivery-plan.md` around the 140-hour core and move the minimum security gates
   into the phases that introduce the relevant data paths.
2. Add a short normative contract document for state machines and shared enums, then reconcile the
   product, API, architecture, and data-model documents against it.
3. Redesign `retrieval.jsonl` and the judge-calibration split before authoring more labeled examples;
   otherwise time will be spent producing a benchmark that cannot cleanly support the claims.

## Bottom line

The project is worth building. The thesis is sharper than most RAG portfolio projects, and the
planning already shows strong systems judgment. The current plan will become much more credible by
doing less, earlier: one format, one auditable evidence model, security at the point of data access,
and locked evaluations that prove the claims. A smaller release with trustworthy evidence is more
impressive than a broader demo whose security, lifecycle, cost, or metrics are still promises.
