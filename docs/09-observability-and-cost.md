# 09 — Observability, Performance, and Cost

**Status:** Revised v2 · **Owns:** F-707, F-708, F-709

---

## 1. Tracing (F-707)

ADOT Lambda layer, OpenTelemetry spans exported to X-Ray. **One trace per question; a parent
trace per run.** The design goal is that "why did question 47 take 40 seconds?" is answered by
opening one trace, not by grepping logs.

| Span | Attributes |
|---|---|
| `run.execute` | `run_id`, `tenant_id`, `item_count`, `concurrency` |
| `question.resolve` | `run_id`, `seq`, `item_id`, `final_status` |
| `agent.plan` | `sub_query_count`, `model_id`, tokens |
| `retrieve.decompose` | `sub_query_count` |
| `retrieve.vector` | `candidates`, `ef_search`, `duration_ms` |
| `retrieve.fts` | `candidates` |
| `retrieve.fuse` | `input_count`, `output_count`, `rrf_k` |
| `retrieve.rerank` | `input_count`, `kept`, `model_id` |
| `retrieve.assemble` | `chunks_packed`, `tokens_used`, `budget`, `deduped` |
| `llm.converse` | `model_id`, `turn`, `input_tokens`, `output_tokens`, `cached_tokens`, `stop_reason` |
| `tool.<name>` | `outcome`, `duration_ms`, `retry_count` |
| `agent.critique` | `unsupported_claims`, `revised` |
| `guardrail.check` | `grounding_score`, `passed`, `filters_triggered` |
| `answer.persist` | `status`, `citation_count` |

Trace IDs are stored on the run and answer records so the API can hand a user a trace link
directly.

---

## 2. Metrics (F-708)

CloudWatch EMF — structured logs carrying embedded metrics, so there is no `PutMetricData`
throttling and no extra API call on the hot path.

| Metric | Unit | Dimensions |
|---|---|---|
| `TokensInput` / `TokensOutput` / `TokensCached` | Count | model_id, stage, tenant |
| `LlmCostUsd` | None | model_id, stage, tenant |
| `LlmLatencyMs` | Milliseconds | model_id, stage |
| `RetrievalCandidates` | Count | branch (vector/fts/fused/reranked) |
| `GroundingScore` | None | tenant — tracked as a distribution |
| `AbstentionRate` | Percent | tenant |
| `ToolCalls` | Count | tool_name, outcome |
| `QuestionDurationMs` | Milliseconds | final_status |
| `RunCostUsd` | None | tenant |
| `BedrockThrottles` | Count | model_id |
| `CacheHitRate` | Percent | cache (embedding / prompt) |
| `IngestChunks` | Count | tenant, doc_type |

**Cardinality discipline:** `tenant_id` is a dimension; `run_id` and `question_id` are not —
they are log fields, queryable via Logs Insights. Unbounded metric dimensions are how a
CloudWatch bill becomes larger than a Bedrock bill.

---

## 3. Dashboard (F-709)

One page, in this order — most operationally useful at the top:

1. **Runs**: in-progress count, completion rate, failure rate
2. **Latency**: p50 / p95 / p99 per question; stacked breakdown by stage
3. **Cost**: cost per run, cost per question, 7-day trend, spend against monthly budget
4. **Quality signals**: abstention rate over time, grounding-score distribution
5. **Saturation**: Bedrock throttle count, Distributed Map concurrency, Lambda concurrent executions
6. **Errors**: failed items by category, tool error rate, DLQ depth
7. **Ingestion**: documents indexed, chunks created, parse failures

**Abstention rate is the canary.** A sudden rise means retrieval regressed, the corpus changed,
or a model was silently updated. It is the single most informative line on the page.

---

## 4. Alarms

| Alarm | Condition | Severity | Action |
|---|---|---|---|
| Cost per run over budget | > $30 for a 200-item run | High | Investigate before the next run |
| Monthly spend — warn | > $30 forecast | Medium | Check for idle drift |
| Monthly spend — act | > $75 forecast | High | Stop and investigate |
| Candidate shortfall | `shortfallRate` > 0.02 | High | Filtered-search regression ([ADR-0007](adr/0007-filtered-vector-search.md)) — not a corpus problem |
| Bedrock throttling | > 10 in 5 min | Medium | Lower Distributed Map concurrency |
| Step Functions failure rate | > 5% of executions | High | Runbook: check Bedrock status, quotas |
| Abstention rate spike | > 20 percentage points above 7-day baseline | High | Likely retrieval regression |
| DLQ depth | > 0 | Medium | Inspect and replay |
| API 5xx rate | > 1% over 5 min | High | Page |
| Ingestion failure | Any document `FAILED` | Low | Inspect parse error |
| Aurora ACU | Sustained at max for 10 min | Medium | Query plan investigation |

Each alarm maps to a section in `docs/runbook.md`. An alarm without a runbook entry is a
notification, not an alarm.

---

## 5. Cost model

**Prices change. This is a formula with an assumptions table, not a quote.** Verify every rate
against current AWS pricing before relying on any number here, and record the verification date.

### 5.1 Per-question formula

```
cost_question =
    decompose_in·P_haiku_in   + decompose_out·P_haiku_out
  + embed_tokens·P_embed
  + rerank_docs·P_rerank
  + Σ over turns ( gen_in·P_sonnet_in + gen_out·P_sonnet_out )
  + critique_in·P_sonnet_in   + critique_out·P_sonnet_out
  + guardrail_units·P_guardrail
```

### 5.2 Worked example — assumptions

| Parameter | Assumed value | Basis |
|---|---|---|
| Sub-queries per question | 2.1 | Measured in S2 |
| Evidence chunks in context | 8 | Config |
| Tokens per chunk | 600 | Chunking target |
| System prompt + tool definitions | 1,500 tokens | Cached after first call |
| Generation turns (mean) | 1.6 | Measured in S3 |
| Generation input / turn | ~6,500 tokens | 8×600 + 1,500 + history |
| Generation output | ~400 tokens | Observed |
| Critique input / output | ~7,000 / 200 | Draft + evidence |
| Rerank candidates | 50 | Config |
| Prompt-cache hit rate | 70% on system + tools | Target |

At Sonnet-class rates on the order of $3/M input and $15/M output, this lands around
**$0.06–$0.09 per question**, i.e. **$12–$18 for a 200-question run**, before caching benefits.
The target in [01-product-spec.md](01-product-spec.md) is **≤ $0.12/question**, giving headroom
for a heavier agent loop.

**The point of this section is not the number.** It is that the number is decomposed by stage,
so when it moves you know which stage moved it. `GET /runs/{id}` returns exactly this
breakdown (see [05-api-spec.md §5](05-api-spec.md)).

### 5.3 Ingestion cost (one-off per corpus)

25 documents × ~80 chunks = 2,000 chunks.
- Contextualisation: Haiku tier with prompt caching, ~1,500 input (mostly cached) + 80 output
  per chunk → a few dollars for the full corpus.
- Embedding: 3,200 × ~700 tokens ≈ 2.2 M tokens → cents.

Ingestion is cheap **because of prompt caching**. Without caching, re-sending the source
document per chunk multiplies input tokens by roughly 20×. That is the single largest
cost lever in the ingest path and it must be verified as working, with `CacheHitRate` on the
dashboard.

### 5.4 Fixed monthly infrastructure

| Item | Estimate | Notes |
|---|---|---|
| Aurora Serverless v2 | **$0–43 — the open variable** | Depends entirely on minimum-ACU configuration and idle behaviour. Resolved by the **S0 week-1 go/no-go spike** against N-09, not assumed |
| NAT Gateway | **$0** | Avoided entirely by keeping Lambdas out of the VPC ([ADR-0005](adr/0005-data-access-path.md)) |
| DynamoDB on-demand | < $1 | Low volume |
| S3 | < $1 | Corpus + traces with lifecycle expiry |
| CloudWatch logs/metrics | $2–5 | Controlled by dimension discipline and log retention |
| API Gateway + Lambda | < $1 | Low volume |
| Tier 3 evals, on-merge + on-demand | $8–15 | **Nightly is off by default** — see [08-evaluation-spec.md §10](08-evaluation-spec.md) |
| Development runs | $10–25 | Real CAIQ runs during S3–S5 |

### 5.5 Cost controls — preventative, not observational

v1 set a $50/month alarm alongside a possible $130/month nightly eval schedule and Aurora at up
to $43, while N-09 required ≤ $25/month idle. Those numbers could not all be true. And an alarm
is not a control — it fires *after* the money is spent.

| Control | Mechanism | Type |
|---|---|---|
| **Idle-cost go/no-go** | S0 week-1 Aurora spike measured against N-09 (≤ $25/month idle). If it fails, the decision is made in week 1 — raise the budget deliberately or change the store | **Preventative** |
| **Pre-run estimate cap** | `POST /runs` estimates before starting and rejects with `estimate_exceeds_cap` (409) above the tenant cap (default $25) unless `acceptEstimateUsd` is supplied | **Preventative** |
| **Per-item hard budgets** | Turn, token, and wall-clock ceilings enforced by reservation *before* every model call ([04-agent-spec.md §2.1](04-agent-spec.md)) | **Preventative** |
| **Eval scheduler cap** | Monthly eval-spend cap in the runner; nightly Tier 3 requires explicit approval and a budget line | **Preventative** |
| Budget alarm — warn | AWS Budgets forecast > $30/month | Detective |
| Budget alarm — act | AWS Budgets forecast > $75/month | Detective |
| Cost per run | EMF metric, alarm above $30 for a 200-item run | Detective |

**Both budget alarms are set on day one, before any resource is provisioned.**

**Report all-in cost separately from variable model cost.** The variable cost is what
optimisation moves; the all-in cost is what someone actually pays. Conflating them makes
optimisation results look better than the bill does.

---

## 6. Performance levers

Implemented and measured, each with a row in `docs/optimizations.md`:

| # | Lever | Expected effect | Risk |
|---|---|---|---|
| 1 | Prompt caching on system prompt + tool definitions | Large input-token reduction | Cache invalidated by any prompt edit |
| 2 | Parallel retrieval branches (vector ‖ fts) instead of sequential | ~40% off retrieval latency | None |
| 3 | Embedding cache keyed by content hash | Free re-ingests and re-runs | Stale on model change — key includes model ID |
| 4 | Batch inference for eval runs | ~half price offline | Not usable on the interactive path |
| 5 | Model routing by task | Large cost reduction | Quality delta must be measured before shipping |
| 6 | Distributed Map concurrency tuning | Throughput vs throttling | Too high causes throttle storms |
| 7 | Skip reranking when the fused top-1 RRF score clears a threshold | Latency on easy questions | Must verify it does not hurt hard ones |
| 8 | Reduce evidence chunks 8 → 6 | ~25% off generation input | Direct recall trade-off |

### `docs/optimizations.md` format

| Date | Change | Hypothesis | Before | After | Cost delta | Decision |
|---|---|---|---|---|---|---|
| 2026-09-02 | Contextual chunk augmentation | Largest single recall gain | recall@10 0.71 | 0.86 | +$0.004/q ingest | **Keep** |
| 2026-09-05 | Cohere rerank top-50→8 | +nDCG worth the latency | nDCG 0.68 / p95 1.9 s | 0.77 / 2.7 s | +$0.002/q | **Keep** |
| 2026-09-09 | Evidence chunks 8→12 | More context, better answers | faithfulness 0.94 | 0.94 | +$0.021/q | **Reverted** — no gain, 35% more expensive |

Three or four honest rows **including at least one reverted change** are worth more than a page
of claims. The reverted row is the one that demonstrates the discipline actually operates.

---

## 7. Runbook contents

`docs/runbook.md` covers, one section per alarm:

- Run stuck in `IN_PROGRESS` — how to inspect the execution, which items are outstanding, how to cancel and resume
- Bedrock throttling — where the concurrency knob is, what to set it to, how to request a quota increase
- Cost spike — how to attribute it by stage from the dashboard, which levers to pull first
- Abstention-rate spike — how to distinguish a retrieval regression from a corpus change
- Ingestion failures — how to inspect the parse error and re-drive a document
- Aurora at max ACU — how to get the slow query
- Rollback — how to shift the Lambda alias back and what to verify afterwards
- Reindex — the full dual-write, backfill, verify, cut-over sequence with expected duration and cost
