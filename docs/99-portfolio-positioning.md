# 99 — Portfolio Positioning

**Status:** Draft v1 · **Audience:** you, not the project

This is career-facing material, deliberately separated from the product documentation so that
`docs/00` through `docs/13` read as a real system spec rather than a portfolio pitch. Anyone
reading the repository sees engineering; this file is the reason the engineering was chosen.

---

## 1. The bet

Most portfolio RAG projects are a chatbot over a PDF folder. They fail the "not just prompt
engineering or proof of concepts" bar because there is no reliability story, no eval story, no
cost story, and no reason a business would run it.

ATTEST is chosen because the interesting engineering and the commercial value point in the same
direction:

- The retrieval problem is genuinely hard, and hallucination is a legal liability rather than an
  annoyance. That forces real grounding enforcement.
- The agent loop is genuinely multi-step, not a completion with a retrieval prefix.
- Multi-tenancy with document-level ACLs is a hard RAG problem most candidates have never
  touched.
- It is your domain. You can author the corpus, judge the answers, and threat-model the system
  without pretending — your security background becomes a differentiator instead of a footnote.
- There is a real market: Vanta, Drata, Conveyor, SafeBase, Whistic all sell into it.

---

## 2. Requirement traceability

| Requirement | Where it is covered |
|---|---|
| End-to-end Agentic RAG in production | The entire doc set — ingestion, retrieval, orchestration, eval, monitoring, optimisation |
| Bedrock, agents, tool calling, guardrails, multi-turn | [04-agent-spec.md](04-agent-spec.md) — Converse with `toolConfig`, Guardrails with contextual grounding, streaming review chat with persisted state |
| TypeScript, Node, Lambda, API Gateway, DynamoDB, CDK, CI/CD, automated testing | [02-architecture.md](02-architecture.md), [12-engineering-practices.md](12-engineering-practices.md) — entire stack in TypeScript, CDK in TypeScript, four testing tiers |
| AI coding assistant expertise | [12-engineering-practices.md §6](12-engineering-practices.md) — spec-first workflow, documented review discipline, honest calibration |
| Production ownership | ADRs, runbook, dashboards, alarms, cost budget, threat model |
| LLM evaluation depth | [08-evaluation-spec.md](08-evaluation-spec.md) — four tiers, golden sets in git, judge calibration, CI gates that block merges |
| Security engineering | [07-security-threat-model.md](07-security-threat-model.md) — STRIDE, isolation tests, injection defences, self-pentest |

**What this does not close:** a years-of-TypeScript experience claim. The compensation is
artifact depth, not an overstated CV. Do not overstate it.

---

## 3. Deliverables

By the end you should be able to hand over or screen-share:

1. **The repository**, with a README that opens on architecture and the eval report — not on
   installation steps.
2. **8–12 ADRs**, including the rejections: Knowledge Bases, OpenSearch Serverless, agent
   frameworks. Rejected options demonstrate judgement better than chosen ones.
3. **The eval report** — retrieval metrics, generation metrics, judge calibration with Cohen's
   κ, abstention accuracy, and the golden-set methodology *including its known bias*.
4. **`docs/optimizations.md`** — measured changes, including at least one reverted.
5. **`docs/cost-model.md`** — cost per question and per run, broken down by stage, with the
   levers pulled and their effects.
6. **The threat model and self-pentest report** — including a finding you found in your own
   system and fixed.
7. **A 5-minute demo video** — upload a questionnaire, watch the run, inspect a citation,
   challenge an answer in chat, show a flagged gap, export the workbook.
8. **`docs/ai-workflow.md`** — spec-first process, review discipline, calibrated honestly on
   where the assistant produced plausible garbage.

The screenshot that matters most: **CI blocking a merge on a quality regression.** Very few
candidates have one.

---

## 4. Questions to have crisp answers for

Rehearse these until they are 60-second answers with a number in them.

| Question | Where your answer comes from |
|---|---|
| How did you choose chunk boundaries? | [03-retrieval-spec.md §1.2](03-retrieval-spec.md) — semantic boundaries over fixed size, and the recall delta from experiment E1 |
| When does reranking earn its latency? | [03-retrieval-spec.md §2.3](03-retrieval-spec.md) — the explicit keep/drop bar: +0.05 nDCG, ≤800 ms |
| How do you separate retrieval regressions from generation regressions? | Never in the same commit; Tier 2 and Tier 3 measure different things |
| What happens when the model fabricates tool arguments? | [04-agent-spec.md §3.1](04-agent-spec.md) — structured recoverable error, counted, deterministic failure at 3 |
| How did you prevent cross-tenant leakage in retrieval rather than after it? | [07-security-threat-model.md §4](07-security-threat-model.md) — five layers, and specifically the test proving the caller gets the *next-best permitted* result rather than an empty one |
| What did you do when quality and cost pulled in opposite directions? | The reverted row in `optimizations.md` — 8→12 chunks, no faithfulness gain, 35% more expensive |
| Why not use Bedrock Knowledge Bases? | [ADR-0002](adr/0002-own-the-pipeline.md) — three load-bearing claims become unprovable |
| How do you know your judge is any good? | Cohen's κ against 50 human labels, target ≥ 0.6, published |
| What is the weakest part of the system? | Have a real answer. The golden-set labelling bias (R-09) and the single-region limitation are both honest ones |

That last question is the one that separates calibrated engineers from enthusiastic ones. Have
the answer ready and do not soften it.

---

## 5. Timing

**Apply in Week 3.** Do not wait for completion.

A build in progress with measured numbers is a stronger interview position than a finished
project you never got to discuss. By Week 3 you have: a deployed pipeline, a working ingestion
path, a retrieval baseline with a real recall number, and evals running in CI. That is already
more than most candidates finish with.

By the M4 milestone (Sep 20) you have a full end-to-end run with cited answers, flagged gaps, a
cost figure, and a p95 latency. That is a demo.

---

## 6. Framing when you talk about it

Lead with the constraint, not the technology.

> *"It answers vendor security questionnaires from a company's own policy corpus. The
> interesting part isn't the answering — it's that it refuses to answer when the evidence isn't
> there, and I can prove the refusal rate. On questions with no supporting evidence in the
> corpus it correctly abstains 90-plus percent of the time, and I gate that number in CI."*

Then let them ask how. Every follow-up has a document behind it.
