# 08 — Evaluation Specification

**Status:** Revised v2 (supersedes v1) · **Owns:** F-7xx (evaluation)

The claim being defended: **we can tell whether a change made the system better or worse, and we
can prove it before it merges.**

v1 of this document could not support that claim. Three design errors, all corrected here:
no-answer cases were scored with gold-chunk relevance metrics that are undefined without gold
chunks; the golden set was seeded from the current retriever and repaired from its own failures,
with no locked holdout; and judge disagreements were fed back into the judge's few-shot examples
while agreement was re-measured on the same examples.

---

## 1. Principles

1. **Retrieval and generation are evaluated separately.** One blended score cannot say which half
   regressed.
2. **Different question types need different metrics.** A no-answer question has no gold chunk;
   scoring it with recall produces a number that means nothing.
3. **A locked test set is frozen before tuning** and is the only source of headline numbers.
4. **Golden sets are code** — JSONL in git, reviewed in PRs, never regenerated silently.
5. **Every result carries its provenance**: prompt version, model IDs, corpus version, embedding
   model, `ef_search`, retrieval config hash, split name.
6. **Quality is reported with cost and latency, always.**
7. **Gates go on only after a baseline exists.** A threshold invented before measurement either
   never fires or blocks everything.
8. **An uncalibrated judge is an opinion**, and a judge calibrated on its own few-shot examples is
   a fabrication.

---

## 2. Data splits

Frozen at the end of S2 week 6, **before any retrieval tuning**.

| Split | Size | Use | May be inspected? |
|---|---|---|---|
| `train` | 40% | Prompt iteration, fixture debugging, error analysis | Yes, freely |
| `dev` | 30% | Day-to-day measurement during development; CI gating | Yes |
| **`locked-test`** | 30% | **Headline numbers and release gates only** | **No.** Run at most weekly and at release |

Rules:
- Nobody looks at individual `locked-test` failures during development. Aggregate scores only.
- If a corpus gap is discovered through a `dev` failure, the fix is allowed. If it is discovered
  through `locked-test`, the case is retired and replaced, and the retirement is logged.
- Split assignment is by a hash of the question ID, recorded in the file, so it cannot drift.

Without this, the benchmark is gradually trained to the implementation and every number is
self-congratulation.

---

## 3. Three retrieval suites, three metric sets

The central v1 error was one suite with one metric set. Questions with no correct answer, and
questions testing a permission boundary, cannot be scored the same way as ordinary lookups.

### 3.1 Relevance suite — `evals/golden/retrieval-relevance.jsonl`

Queries that **have** gold chunks. ~110 queries.

| Metric | Definition | Gate |
|---|---|---|
| recall@5 / @10 / @20 | Gold chunks in top-k | recall@10 ≥ 0.85 |
| MRR | Reciprocal rank of first gold chunk | ≥ 0.70 |
| nDCG@10 | Graded relevance, discounted | ≥ 0.75 |
| p95 latency | Total retrieval | ≤ 3 s |

Reported **per category** as well as in aggregate: `simple`, `compound`, `clause-lookup`,
`table-sourced`, `multi-document`, `contradictory-versions`. An aggregate that holds while
`compound` collapses is a hidden regression.

```jsonl
{"id":"rel-001","split":"dev","category":"compound","tenantId":"t_northwind","callerAclTags":["internal"],"query":"Do you encrypt data at rest and in transit, and who manages the keys?","goldChunkIds":["chk_a1","chk_b7","chk_c3"],"corpusVersion":"v3","labeledBy":"aakash","labeledAt":"2026-09-01"}
```

### 3.2 Rejection suite — `evals/golden/retrieval-rejection.jsonl`

Queries with **no** supporting evidence in the corpus. Empty gold sets. Recall, MRR, and nDCG are
undefined here and are **not computed**.

Retrieval always returns *something* — that is what a nearest-neighbour search does. The question
is whether what it returns clears a usability bar.

| Metric | Definition | Gate |
|---|---|---|
| `retrievalRejectionRate` | Fraction where the top fused/rerank score falls below the usable-evidence threshold | ≥ 0.80 |
| `falseEvidenceRate` | Fraction where a labelled non-supporting chunk scores **above** the threshold | ≤ 0.10 |
| `topScoreMargin` | Mean gap between the rejection suite's top scores and the relevance suite's | Reported, not gated |

The usable-evidence threshold is calibrated in S5 alongside the grounding threshold. These
metrics are what make abstention predictable rather than accidental — if retrieval cannot
distinguish "no evidence" from "weak evidence", the agent is guessing.

```jsonl
{"id":"rej-004","split":"locked-test","tenantId":"t_northwind","callerAclTags":["internal"],"query":"Do you hold ISO 27001 certification?","goldChunkIds":[],"knownNonSupportingIds":["chk_soc2_1","chk_soc2_4"],"reason":"corpus contains SOC 2 evidence only","corpusVersion":"v3"}
```

### 3.3 Isolation suite — `evals/golden/retrieval-isolation.jsonl`

The permission boundary. Fixtures encode caller identity explicitly, plus what the caller **may**
see and what they **must not**.

| Metric | Definition | Gate |
|---|---|---|
| `authorisedRecall@10` | Recall over `allowedGoldIds` only | ≥ 0.83 (within 0.02 of unfiltered) |
| `leakageCount` | Any `forbiddenChunkIds` returned | **Exactly 0 — hard fail** |
| `shortfallRate` | Queries returning fewer than k permitted candidates when ≥ k exist | ≤ 0.02 |

`shortfallRate` exists because of filtered approximate search. With a restrictive ACL predicate,
an HNSW scan can traverse mostly-inaccessible neighbours and return too few permitted results —
a silent recall failure that looks like an empty corpus. It is measured directly, and
[ADR-0007](adr/0007-filtered-vector-search.md) specifies the mitigation.

```jsonl
{"id":"iso-007","split":"locked-test","tenantId":"t_northwind","callerAclTags":["internal"],"query":"What critical findings were identified in the most recent penetration test?","allowedGoldIds":["chk_pentest_summary_2"],"forbiddenChunkIds":["chk_pentest_raw_11","chk_pentest_raw_12"],"crossTenantForbiddenIds":["chk_acme_pentest_3"],"expectedOutcome":"NEXT_BEST_PERMITTED","note":"forbidden chunks are the top semantic matches"}
```

**The adversarial fixture:** at least 15 isolation cases must be *dense* — the nearest restricted
and cross-tenant chunks deliberately surround the best permitted match in embedding space. A
boundary that only holds when the forbidden content is semantically distant has not been tested.

---

## 4. Four tiers

| Tier | What | When | Runtime | Cost |
|---|---|---|---|---|
| 1 | Deterministic assertions | Every PR | < 30 s | $0 |
| 2 | Retrieval, three suites, `dev` split | Every PR | ~2 min | ~$0.05 |
| 3 | Generation quality, LLM-as-judge | On merge + on demand | ~15 min | ~$4 |
| 4 | Human review sample | Per release | 30 min human | — |

Headline/locked-test runs of Tiers 2 and 3 happen weekly and at release, not per PR.

### Tier 1 — Deterministic assertions

Zero model calls, against recorded fixtures.

- Response conforms to the answer schema
- Every factual sentence carries ≥ 1 citation ID
- **Every cited ID exists in the assembled evidence set** — catches fabrication without a judge
- Citations resolve to the exact immutable `evidenceId` used at generation
      ([14-contracts.md §5](14-contracts.md))
- Live-evidence citations carry `observedAt` and are not past `staleAfter`
- Token, turn, and wall-clock ceilings respected
- Abstention output has a non-generic `missingEvidence` — fails on "no evidence found"
- No document text in emitted log records

### Tier 2 — Retrieval

The three suites in §3, on the `dev` split for PRs and `locked-test` weekly.

### Tier 3 — Generation, LLM-as-judge

| Metric | Gate |
|---|---|
| Faithfulness | ≥ 0.95 |
| Citation precision / recall | ≥ 0.90 / ≥ 0.85 |
| Answer completeness vs reference | ≥ 0.80 |
| **Correct abstention** | **≥ 0.90** |
| **Fabrication rate** on no-evidence questions | **≤ 0.05** |
| Gap quality — is `missingEvidence` specific and actionable | ≥ 0.80 |

Correct abstention and fabrication rate are weighted highest; they decide whether the product is
usable at all. Judge model is a different family from the generator, temperature 0, structured
verdicts with required reasoning, prompt versioned.

### Tier 4 — Human review

20 stratified items per release: 8 answered, 8 gaps, 4 low-confidence. Feeds judge validation
and the golden set. Logged in `evals/human-reviews/{date}.jsonl`.

---

## 5. Judge calibration — three-way split

v1 added judge disagreements to the judge's few-shot examples and then re-measured agreement on
the same 50 items. That measures memorisation.

| Split | Size | Use |
|---|---|---|
| `judge-dev` | 20 | Prompt iteration. Disagreements **may** become few-shot examples |
| `judge-calibration` | 30 | Threshold and weight fitting |
| **`judge-validation`** | **30** | **Never inspected, never used as few-shot. κ is reported from here** |

Procedure:
1. Human-label 80 answers, stratified faithful / unfaithful / abstained.
2. Iterate the judge prompt on `judge-dev` only.
3. Fit on `judge-calibration`.
4. Measure **Cohen's κ on `judge-validation`**, blind, once per judge version.
5. **κ ≥ 0.6 required** before any judge-gated CI. Below that, Tier 3 is report-only and is
   described as advisory — which is an honest position; a badly calibrated gate is not.
6. Re-validate whenever the judge prompt or model changes. Each re-validation consumes
   credibility, so version deliberately.

Publish the agreement matrix in the eval report.

---

## 6. Gating schedule

Gates turn on when they have something to compare against — not before.

| Tier | Report-only from | Gates from | Precondition |
|---|---|---|---|
| 1 | — | **S1, immediately** | Deterministic; no baseline needed |
| 2 | S2 week 6 | **S2 week 7** | Locked-test baseline recorded; ≥ 100 relevance queries |
| 2 — leakage | — | **S2 week 5, immediately** | Zero is the only acceptable value; no baseline needed |
| 3 | S5 week 13 | **S5 week 13, abstention + fabrication only** | κ ≥ 0.6 on `judge-validation` |
| 3 — other metrics | S5 | Post-release | Needs more samples than the core release affords |

Leakage is the exception to the report-only rule. Zero is not a threshold to be calibrated.

---

## 7. Golden set construction

Budget **~10 hours**, spread across S1, S2 and S5 rather than dropped into one week.

```
1. Design the fixtures first (§3). Labelling into the wrong schema wastes the labelling.
2. Seed questions
   a. Real CAIQ items — the actual distribution, and the primary source
   b. Hand-written hard cases: contradictions, tables, cross-document, no-answer, dense ACL
   c. LLM-generated questions per corpus section, for coverage
3. Candidate labelling: run retrieval, take top 20, LLM proposes relevant/not with a reason
4. HUMAN VERIFICATION — the non-negotiable step. CLI, keystroke accept/reject/skip
5. Freeze the splits. Then, and only then, start tuning.
```

**Seeding bias, stated plainly:** labelling only what current retrieval surfaced makes gold
chunks it never returns invisible, which inflates recall. Mitigations, all applied:
- 20% of relevance queries are labelled against deliberately different configurations
  (FTS-only; vector-only at high `ef_search`)
- Hard cases get hand-selected gold chunks, not candidate-picked ones
- Isolation fixtures are constructed adversarially, never sampled
- The limitation is stated in the eval report

A stated known bias is worth more than a silently inflated number.

---

## 8. Thresholds

`evals/thresholds.yaml` — populated from real baselines at the end of S2 and S5, not invented.

```yaml
version: 2
corpus_version: v3
split: locked-test
gating_enabled:
  tier1: true
  tier2_relevance: true       # from S2 week 7
  tier2_leakage:  true        # from S2 week 5 — zero, always
  tier3: abstention_only      # until judge kappa >= 0.6 on validation

retrieval_relevance:
  recall_at_10:  { min: 0.85, max_regression: 0.02 }
  mrr:           { min: 0.70, max_regression: 0.03 }
  ndcg_at_10:    { min: 0.75, max_regression: 0.02 }
retrieval_rejection:
  rejection_rate:      { min: 0.80 }
  false_evidence_rate: { max: 0.10 }
retrieval_isolation:
  authorised_recall_at_10: { min: 0.83 }
  leakage_count:           { max: 0 }     # hard fail
  shortfall_rate:          { max: 0.02 }
generation:
  correct_abstention: { min: 0.90, max_regression: 0.02 }
  fabrication_rate:   { max: 0.05 }       # hard fail
  faithfulness:       { min: 0.95, max_regression: 0.01 }
cost:
  usd_per_question: { max: 0.12, max_increase_pct: 15 }
latency:
  p95_question_ms:  { max: 45000 }
```

**PR comment:**

```
ATTEST eval · split=dev · corpus v3 · prompt answer.v3 · ef_search=100

RELEVANCE (110q)      baseline  current   delta    gate
recall@10               0.871    0.884   +0.013    PASS
  · compound            0.812    0.847   +0.035    PASS
  · clause-lookup       0.903    0.897   -0.006    PASS
ndcg@10                 0.766    0.759   -0.007    PASS (tol 0.02)

REJECTION (20q)
rejection_rate          0.850    0.850    0.000    PASS
false_evidence_rate     0.050    0.100   +0.050    PASS (limit 0.10)

ISOLATION (20q)
authorised_recall@10    0.840    0.845   +0.005    PASS
leakage_count               0        0        0    PASS
shortfall_rate          0.000    0.000    0.000    PASS

cost/question          $0.058   $0.071  +22.4%    FAIL (limit +15%)

RESULT: BLOCKED — cost regression exceeds tolerance.
```

Cost is a gate, not a footnote.

---

## 9. Runner

```
evals/
├── golden/
│   ├── retrieval-relevance.jsonl
│   ├── retrieval-rejection.jsonl
│   ├── retrieval-isolation.jsonl
│   ├── generation.jsonl
│   ├── abstention.jsonl
│   └── injection.jsonl
├── runner/          thin interface: run(suite, split, config) → Result[]
├── judges/          versioned prompts + the three-way split
├── human-reviews/
└── thresholds.yaml
```

The runner is thin so the backing implementation can be swapped without touching a test case.
The test cases are the asset.

**Determinism:** temperature 0 in eval; retrieval config hash and `ef_search` recorded with every
result; Tier 3 runs N=3 with variance reported, because single-shot judge noise exceeds most
deltas being measured.

---

## 10. Cost control

| Tier | Cadence | Est. cost | Monthly |
|---|---|---|---|
| 1 | ~20 PRs/month | $0 | $0 |
| 2 (`dev`) | ~20 PRs/month | $0.05 | $1 |
| 2 (`locked-test`) | Weekly + release | $0.10 | $0.50 |
| 3 | **On merge + on demand** | $4 | ~$8–15 |
| 4 | Per release | Human | — |

**Nightly Tier 3 is off by default.** v1 assumed a nightly cadence at ~$130/month, which cannot
coexist with the infrastructure budget. Enabling it requires explicit approval and a budget
line. A monthly eval-spend cap is enforced by the scheduler.

---

## 11. The proof

The S5 exit criterion is a specific demonstrable event:

> Introduce a deliberately bad prompt change — remove the "cite every claim" instruction. Open a
> PR. Tier 1 fails on citation assertions and blocks the merge. Screenshot it.

A quality gate that has never blocked anything is not known to work.
