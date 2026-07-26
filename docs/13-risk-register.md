# 13 — Risk Register

**Status:** Revised v2 · **Owner:** Aakash (all rows — solo build)
**Review cadence:** weekly, at the start of each work session
**Next review:** 2026-08-02 (end of S0)

A risk without a **trigger condition** is decoration. Each entry states what specifically would
tell you it has materialised, and what you do about it that day.

Scoring: Likelihood (L) and Impact (I) on 1–5. Priority = L × I. **Residual** is the rating that
remains once the stated mitigation is in place — the number that actually matters.

## Summary

| # | Risk | Status | P | Residual | Next action / date |
|---|---|---|---:|---:|---|
| R-01 | Employment IP assignment | **Open — blocking** | 20 | 4 | Read the clause · Week 1 |
| R-02 | Corpus authoring consumes the schedule | Open | 16 | 6 | Draft 8 docs · Week 2 |
| R-03 | Evals bolted on late | Mitigated by plan | 15 | 4 | Tier 2 report-only · S2 wk 6 |
| R-04 | Bedrock access or quota blocks S3 | **Open — act now** | 12 | 3 | Request access + quota · Week 1 |
| R-05 | Cost surprise | Open | 12 | 4 | Budget alarms + Aurora spike · Week 1 |
| R-18 | **Schedule has no slack** | Open | 12 | 8 | Contingency reserved; cut at first missed milestone |
| R-06 | Scope creep | Open | 12 | 6 | Weekly scope re-read |
| R-07 | Retrieval + generation changed together | Mitigated | 12 | 3 | CI check · S2 |
| R-19 | **Filtered search silently collapses recall** | Open | 12 | 4 | pgvector spike · Week 1 |
| R-08 | CAIQ parsing harder than estimated | Open | 9 | 5 | Normaliser · S1 wk 4 |
| R-09 | Golden-set labelling bias | Structural | 8 | 5 | Fixture design before labelling · S2 wk 6 |
| R-10 | Judge disagrees with humans | Open | 9 | 4 | Three-way split · S5 |
| R-11 | Aurora idle cost / resume latency | **Open — go/no-go** | 9 | 4 | Spike · Week 1 |
| R-13 | Corpus too easy | Open | 9 | 4 | Planted difficulties · S2 |
| R-17 | **No tested recovery path** | Open | 8 | 4 | Reindex/restore drill · S5 wk 14 |
| R-14 | Injection defence untested | Open | 8 | 3 | Payloads embedded in S1, asserted in CI |
| R-12 | Data API latency dominates p95 | Open | 6 | 4 | Measure · S5 |
| R-15 | Never finishing | Open | 12 | 5 | Milestone-based intervention |
| R-16 | Questionnaire licensing | Open | 4 | 2 | Check terms before the repo goes public |

---

## Critical

### R-01 · Employment IP assignment covers personal work
**L4 · I5 · P20**

The employer's agreement may assign IP created on personal time, which would compromise
ownership of the project.

- **Trigger:** Reading the assignment clause and finding language broader than "work relating
  to the company's business, using company resources."
- **Mitigation:** Read the clause in **Week 1**, before any code. If broad, request a written
  carve-out naming the project. Keep all work on personal hardware, personal accounts, personal
  time, with a clean git history that proves it.
- **Contingency:** If a carve-out is refused, the project does not proceed in its current form.
  Finding this out in Week 1 costs one hour. Finding it out in Week 11 costs the project.
- **Note:** This is separate from — and much more likely than — the client-material question,
  which is already settled: no client material is used at all.

### R-02 · Corpus authoring consumes the schedule
**L4 · I4 · P16**

~23 hours of writing 40 security documents is the largest single line item, and it is the least
interesting work in the project. It is exactly the kind of task that quietly expands.

- **Trigger:** Week 3 ends with fewer than 20 documents.
- **Mitigation:** Interleave rather than front-load ([10-corpus-spec.md §8](10-corpus-spec.md)).
  Draft with an LLM and edit hard for realism — the domain knowledge shows in the editing, not
  the typing. Six documents is enough to build and test the entire ingestion pipeline.
- **Contingency:** Ship with 25 documents. Note the corpus size in the eval report. Metric
  validity depends on the *difficulty* of the corpus, not its volume.

### R-03 · Evals get bolted on at the end
**L3 · I5 · P15**

The single failure mode that would reduce this to another portfolio RAG demo. Evals written
after the fact measure nothing, because there is no baseline to compare against.

- **Trigger:** End of Week 3 without Tier 2 running in CI.
- **Mitigation:** Tier 2 is a S1 exit criterion, not a S5 one. The trivial eval in CI
  from Week 1 exists specifically so the harness is never a from-scratch task.
- **Contingency:** Stop feature work entirely and build it. Nothing downstream is meaningful
  without it.

---

## High

### R-04 · Bedrock model access or quota blocks the agent phase
**L3 · I4 · P12**

Model access is granted per model per region; quota increases take days. Discovering either in
Week 6 stalls S3.

- **Trigger:** Any model in the routing table is unavailable, or throttling appears at
  concurrency 5.
- **Mitigation:** Request all model access and file quota increases in **Week 1**. Verify
  Cohere Rerank regional availability at the same time.
- **Contingency:** Lower Distributed Map concurrency and accept slower runs. Substitute an
  LLM-based listwise reranker if Cohere Rerank is unavailable, benchmarked identically.

### R-05 · Cost surprise
**L3 · I4 · P12**

An unbounded loop, a missing prompt cache, or nightly Tier 3 evals can each quietly cost more
than everything else combined.

- **Trigger:** Budget forecast above $30/month (warn) or $75/month (act), or cost-per-run above
  $30.
- **Mitigation:** Preventative first — the pre-run **estimate cap** rejects expensive runs before
  they start, per-item budgets are enforced by reservation, and the eval scheduler has a monthly
  cap. Detective second — both budget alarms set on day one before provisioning, and
  `CacheHitRate` on the dashboard so a silently broken prompt cache is visible. See
  [09-observability-and-cost.md §5.5](09-observability-and-cost.md).
- **Contingency:** Move Tier 3 evals from nightly to on-merge; use batch inference; sample
  rather than run the full generation set nightly.

### R-06 · Scope creep into a SaaS product
**L4 · I3 · P12**

The product is interesting enough that adding "just one more feature" is continuously tempting.

- **Trigger:** Working on anything on the out-of-scope list in
  [00-OVERVIEW.md §5](00-OVERVIEW.md).
- **Mitigation:** Re-read that list at the start of every week. Any addition requires writing
  down what is being removed to pay for it.
- **Contingency:** Cut back to the descoping ladder in
  [11-delivery-plan.md §5](11-delivery-plan.md).

### R-07 · Retrieval and generation changed together
**L3 · I4 · P12**

Once this happens, no metric movement is attributable and the whole measurement story is
compromised.

- **Trigger:** A PR touching both `packages/core/retrieval/` and `packages/core/prompts/`.
- **Mitigation:** A CI check that fails on exactly that combination and requires an explicit
  `[combined-change]` override in the commit message with a written justification.
- **Contingency:** Revert and split the PR.

### R-08 · Questionnaire parsing is harder than estimated
**L3 · I3 · P9**

Real CAIQ and SIG workbooks have merged cells, preambles, multiple sheets, and inconsistent
column layouts. "Parse the spreadsheet" hides a lot.

- **Trigger:** Week 6 ends without CAIQ normalising cleanly.
- **Mitigation:** Report unparsed rows explicitly rather than dropping them (F-301) — a parser
  that handles 90% and reports the rest honestly is shippable; one that silently drops 10% is
  not. Capture `sourceCell` at parse time or lose export capability entirely.
- **Contingency:** CSV-only ingestion plus a documented manual conversion step. The agent work
  is what matters; the parser is plumbing.

---

## Medium

### R-09 · Golden set labelling bias inflates recall
**L4 · I2 · P8**

Labelling only what current retrieval surfaced makes recall look better than it is — a
self-congratulating metric.

- **Trigger:** Structural — it is present by default unless actively mitigated.
- **Mitigation:** Label 20% of queries against deliberately different retrieval configurations
  (FTS-only, vector-only at high `ef_search`). Hand-select gold chunks for hard cases.
- **Contingency:** Document the bias explicitly in the eval report. A stated known limitation
  is worth more than an unstated inflated number.

### R-10 · Judge disagrees with humans
**L3 · I3 · P9**

A judge with low agreement gates CI on noise.

- **Trigger:** Cohen's κ < 0.6 on the 50-item calibration set.
- **Mitigation:** Calibrate before enabling any judge-gated CI. Add disagreement cases as
  few-shot examples and re-measure.
- **Contingency:** Use Tier 3 as reporting-only, keep gating on Tiers 1 and 2, and state that
  the judge is advisory. That is an honest position; a badly-calibrated gate is not.

### R-11 · Aurora idle cost or resume latency
**L3 · I3 · P9**

Serverless v2 behaviour around minimum ACU and scale-to-zero determines both the idle bill and
first-request latency.

- **Trigger:** Idle spend above $25/month, or first-request latency above 15 s.
- **Mitigation:** Verify current behaviour in **Week 1** — it is an explicit S0 task.
- **Contingency:** Accept resume latency and document it as a known limitation; or evaluate S3
  Vectors if it has reached GA, and publish the comparison as an experiment.

### R-12 · RDS Data API latency dominates p95
**L2 · I3 · P6**

Trading VPC complexity for HTTP overhead may cost more latency than expected.

- **Trigger:** `retrieve.*` spans show Data API overhead above 300 ms p95.
- **Mitigation:** Measured explicitly in S5. Never select the `embedding` column back.
- **Contingency:** Move Lambdas into the VPC with RDS Proxy, gateway endpoints for S3 and
  DynamoDB, and interface endpoints only for Bedrock. Accept the NAT-free endpoint cost. The
  decision is documented either way, which makes it an asset rather than a mistake.

### R-13 · Synthetic corpus is too easy
**L3 · I3 · P9**

A corpus where every question is answerable produces metrics that mean nothing.

- **Trigger:** recall@10 above 0.95 on the first baseline, or abstention rate near zero.
- **Mitigation:** The planted difficulties in [10-corpus-spec.md §4](10-corpus-spec.md) are
  requirements, not decoration.
- **Contingency:** Add contradictions, version skew, and no-answer questions until the numbers
  become informative. An easy corpus is a broken instrument.

### R-14 · Prompt injection defence is untested theory
**L2 · I4 · P8**

Writing about injection defences is not the same as demonstrating them.

- **Trigger:** S5 arrives without the red-team corpus assertions in CI.
- **Mitigation:** The three payloads in [10-corpus-spec.md §5](10-corpus-spec.md) are embedded
  during S2 corpus work, not S5, so they are exercised throughout.
- **Contingency:** Non-negotiable. This is the differentiating security claim; it ships tested.

---

## Low

### R-15 · Never finishing
**L3 · I4 · P12 · Residual 5**

Fourteen-week side projects alongside full-time work have a well-known failure rate.

- **Trigger:** **A missed milestone** (M1–M6 in [11-delivery-plan.md §5](11-delivery-plan.md)).
  Not "two consecutive low weeks" — that trigger fires too late to act on. v1 used a capacity
  decline as the signal; the milestone is the earlier and more honest one.
- **Mitigation:** Every workstream ends in something demonstrable. The descoping ladder is
  written in advance so cutting is a decision, not a defeat. 8 hours of contingency are reserved
  and drawn explicitly.
- **Contingency:** At the first missed milestone, cut from the extension list *that week*. Do not
  absorb the slip into contingency and hope.

---

## New in v2

### R-17 · No tested recovery path
**L2 · I4 · P8 · Residual 4**

A corrupted index, a bad reindex, or an accidental deletion has no rehearsed recovery. The plan
described reindex as a runbook operation but never proved one could be completed.

- **Trigger:** Structural — present until the drill is run.
- **Mitigation:** One timed **restore/reindex drill in S5 week 14**, against the dev stack, with a
  stated RTO and RPO. Aurora PITR is on; the drill proves it is usable, not merely enabled.
- **Contingency:** If the drill fails, the recovery gap is documented as a known limitation with
  a measured actual RTO. An honest measured number beats an untested claim.
- **Target:** RTO ≤ 4 hours for a full corpus reindex; RPO ≤ 5 minutes (PITR).

### R-18 · The schedule has almost no slack
**L4 · I3 · P12 · Residual 8** — *the highest residual in the register*

Even rebaselined to 140 hours, 132 hours of planned work leaves 8 hours of contingency across 14
weeks. One bad fortnight consumes it.

- **Trigger:** Any milestone missed, or contingency draw exceeding 4 hours before S4.
- **Mitigation:** Contingency is **reserved, not allocated** — it is not available for scope. The
  extension list exists precisely so there is something to cut that costs nothing structural.
  Each workstream has a named "cut first if slipping" item.
- **Contingency:** Cut from [11-delivery-plan.md §7](11-delivery-plan.md) in order. The cut line
  in that ladder marks where cutting starts breaking release gates — above it, everything is
  discretionary.
- **Residual stays high on purpose.** This is the risk the plan cannot design away, only manage.
  Pretending otherwise is what produced v1.

### R-19 · Filtered approximate search silently collapses recall
**L3 · I4 · P12 · Residual 4**

HNSW is approximate; a restrictive ACL predicate can leave the scan returning too few permitted
rows. The failure is indistinguishable from a genuine evidence gap: retrieval returns little, the
agent correctly abstains, nothing errors, and the abstention rate rises for unattributable
reasons. A security control would be *causing* wrong product behaviour while appearing to work.

- **Trigger:** `shortfallRate` > 0.02 on the isolation suite, or escalation to exact scan on more
  than 5% of queries.
- **Mitigation:** [ADR-0007](adr/0007-filtered-vector-search.md) — iterative index scan,
  ACL-scaled `ef_search`, shortfall retry, exact-scan fallback. Spiked in **week 1**, before any
  retrieval code, because a negative result reopens the vector-store decision.
- **Contingency:** Exact scan bounded by the tenant predicate. Affordable at this corpus size,
  which gives correctness a cheap floor.

### R-16 · Questionnaire licensing restricts redistribution
**L2 · I2 · P4**

- **Trigger:** CAIQ or SIG terms prohibit redistribution in a public repository.
- **Mitigation:** Check terms in Week 5, before the repository goes public.
- **Contingency:** Ship the normaliser plus a small synthetic sample; the user downloads the
  full instrument at setup. Note it in the README.

---

## Review log

| Date | Changes |
|---|---|
| 2026-07-25 | Initial register created alongside the doc set |
| 2026-07-25 | v2: added owner, status, residual rating, and next-action dates. Added R-17 (recovery), R-18 (schedule slack), R-19 (filtered-search recall). Changed R-15's trigger from a capacity decline to the first missed milestone — the earlier signal. |
