# ADR-0007 — Filtered approximate search policy

**Status:** Accepted — **spike executed 2026-07-25, verdict GO** (see §Spike result)
**Date:** 2026-07-25

## Context

[ADR-0001](0001-vector-store.md) chose pgvector with HNSW specifically so that tenant and ACL
predicates could live **inside** the query rather than being applied to results afterwards. That
is the right call and it is the foundation of the security model.

It is also not sufficient on its own, and the first draft of the retrieval spec missed why.

HNSW is an **approximate** index. A query walks a neighbour graph, collecting candidates, and the
`WHERE` clause is applied to what the walk visits. When the caller's permitted set is a small
fraction of the corpus, the walk can exhaust its search budget among inaccessible neighbours and
return **fewer than `LIMIT` permitted rows — possibly zero** — even though plenty of permitted,
relevant chunks exist.

This is worst precisely where the product's security story is strongest: a caller without the
`restricted` tag querying a topic where the restricted documents are the closest matches. That
is not a hypothetical, it is [10-corpus-spec.md](../10-corpus-spec.md) difficulty D9, which the
corpus contains on purpose.

**Why this is dangerous rather than merely suboptimal:** the failure is silent and it is
indistinguishable from a genuine evidence gap. Retrieval returns little or nothing; the agent
correctly abstains; the answer is a GAP with a plausible `missingEvidence` string. Nothing errors.
The abstention rate rises and the cause is unattributable. A permission boundary would have
quietly become a recall collapse, and the security control would be *causing* incorrect product
behaviour while appearing to work.

## Options considered

### A — Ignore it; rely on `LIMIT 50` being generous
Assumes the filter is never selective enough to matter. False for exactly the ACL cases the
system is designed around.

### B — Post-filter after an unfiltered search
Retrieve broadly, discard forbidden rows in application code. Restores result counts, but
reintroduces the security bug and the recall truncation that
[ADR-0001](0001-vector-store.md) exists to avoid. **Rejected outright** — this is the thing the
whole design is built to prevent.

### C — Exact (non-approximate) scan under the tenant predicate
Perfect recall, no approximation. Fine at 3–10k chunks per tenant, degrades as the corpus grows.
Viable as a fallback, not as the default.

### D — Iterative index scan plus adaptive `ef_search`, with an exact fallback
Let the index scan continue past filtered rows instead of returning short; widen the search
proportionally to how selective the caller's ACL set is; fall back to an exact scan when a
shortfall persists.

## Decision

**Option D**, with the parameters fixed by a spike in S0 week 1 (before any retrieval code is
written) and a metric that watches it permanently.

1. **Iterative index scans enabled**, so a filtered scan continues rather than returning a short
   result set.
2. **`ef_search` set per query**, scaled by ACL selectivity — a narrow tag set searches wider. The
   value is a function of the caller's tag set, not a constant.
3. **Shortfall retry:** if a branch returns fewer than `k` permitted candidates, retry once at a
   higher `ef_search`. If it still falls short, fall back to an exact scan bounded by the tenant
   predicate. Every escalation is logged as a metric.
4. **`ef_search`, the iterative-scan setting, and any escalation are recorded with every
   retrieval metric.** A recall number without them is not reproducible, and this is the single
   most common way a retrieval benchmark becomes meaningless.
5. **`shortfallRate` is a gated metric** in the isolation suite, ≤ 0.02
   ([08-evaluation-spec.md §3.3](../08-evaluation-spec.md)).
6. **Adversarial fixtures:** at least 15 isolation cases are constructed so the nearest restricted
   and cross-tenant chunks deliberately surround the best permitted match in embedding space. A
   boundary that only holds when forbidden content is semantically distant has not been tested.

## Rationale

The metric is as important as the mitigation. Parameters tuned once against a 25-document corpus
will not hold as the corpus grows or as ACL vocabularies get narrower — but `shortfallRate` fails
loudly when they stop holding, which converts a silent correctness failure into a build failure.

The exact-scan fallback is deliberately unglamorous. At this corpus size an exact scan bounded by
`tenant_id` is entirely affordable, so correctness has a cheap floor. Availability of that floor
is what makes the approximate path safe to tune aggressively.

Running the spike in week 1 rather than during retrieval work is deliberate: if the mitigation
does not behave as expected, that is a vector-store decision, and it is much cheaper to reopen
[ADR-0001](0001-vector-store.md) in week 1 than in week 7.

## Consequences

**Positive**
- The permission boundary cannot silently degrade recall.
- A previously invisible failure mode is measured on every eval run and gated in CI.
- The exact-scan fallback gives correctness a floor independent of index tuning.

**Negative**
- Higher `ef_search` costs latency; the ACL-selectivity scaling makes latency caller-dependent,
  so p95 must be tracked per ACL profile rather than globally.
- Escalation adds a second round trip on affected queries.
- Recorded parameters make eval results more verbose — a cost worth paying.

**Makes harder later**
- Any future change to index type or vector store must re-establish this guarantee and re-run the
  adversarial fixtures. That is a feature, not a defect.

## Spike result — executed 2026-07-25

`scripts/spikes/pgvector-filtered-search.mjs`, pgvector/pgvector:pg16 in Docker.
60,000 chunks, 1,024-dim, HNSW (m=16, ef_construction=64). Caller permitted **2%** of the
corpus. Adversarial layout: forbidden chunks packed nearest the query, permitted matches
further out. k=10.

```
A. exact scan (ground truth)   10 rows, meanScore=0.7938, top=0.7988, 72ms

Planner's natural choice (no hints): Bitmap

B. iterative_scan = off        [seqscan+bitmap disabled to force the vector index]
   ef_search=40      returned= 0/10   50ms   ← SHORTFALL
   ef_search=100     returned= 0/10   51ms   ← SHORTFALL
   ef_search=400     returned= 0/10   52ms   ← SHORTFALL

C. iterative_scan = relaxed_order
   ef_search=40      returned=10/10  meanScore=0.7757  108ms
   ef_search=100     returned=10/10  meanScore=0.7757  111ms
   ef_search=400     returned=10/10  meanScore=0.7850  135ms
```

**Verdict: GO.** Keep pgvector; the mitigation works. Four findings, one of which was not
predicted:

1. **The failure is worse than this ADR assumed.** The prediction was "too few permitted
   rows." The measurement is **zero rows** — total recall collapse — and raising
   `ef_search` tenfold does not help at all. A caller with a narrow ACL set would have
   received an empty evidence set for every query, the agent would have correctly
   abstained, and nothing anywhere would have errored.

2. **`hnsw.iterative_scan = relaxed_order` fully restores the result count**, at roughly
   **2.2× latency** (51ms → 111ms). That is affordable against a 3s retrieval budget and
   is now the configured default.

3. **NOT PREDICTED — the bug is latent, not immediate.** The planner's natural choice at
   this size and selectivity is a **Bitmap** scan, which is exact. HNSW only wins as the
   corpus grows. An earlier 20,000-chunk run showed no problem at all *because the index
   was never used* — the first version of this spike would have reported a false all-clear
   had it not printed the chosen plan. The failure would therefore have appeared for the
   first time in production, at scale, long after the design was settled. This is the
   strongest possible argument for keeping `shortfallRate` as a permanent CI gate rather
   than a one-off measurement.

4. **Known limitation of the fixture.** Exact-ID recall reads 0% even in case C, but that
   is an artifact: all permitted vectors were generated at the same blend distance, so
   ~1,200 candidates are near-tied and the "true top 10" is arbitrary among them. The
   score evidence settles it — 0.7757 vs 0.7938 is **2.3% below optimum**, i.e. *different
   but nearly as good*, not wrong. The fixture should vary permitted distances before
   exact-ID recall is treated as meaningful; tracked as a follow-up.

**Configured as a result:** `hnsw.iterative_scan = relaxed_order` on every retrieval
connection; `ef_search` scaled by ACL selectivity; shortfall retry then exact fallback;
`shortfallRate` gated at ≤ 0.02 from S2 week 5.

## Revisit when

- `shortfallRate` exceeds 0.02 on the locked test set, or
- Escalation to exact scan exceeds 5% of queries, or
- Per-tenant corpora exceed ~500k chunks, at which point the exact-scan fallback stops being
  affordable and this decision reopens together with [ADR-0001](0001-vector-store.md).
