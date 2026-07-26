# ATTEST — Build Plan

**A multi tenant, permission aware Agentic RAG platform for security questionnaire and compliance evidence automation.**

Target: close every gap between your current profile and the Agentic RAG Engineer posting, with one artifact that a company could actually deploy.

---

## 1. The bet

Most portfolio RAG projects are a chatbot over a PDF folder. They fail the posting's last bullet — "not just prompt engineering or proof of concepts" — because there is no reliability story, no eval story, no cost story, and no reason a business would run it.

ATTEST is chosen because it is the rare project where the interesting engineering and the commercial value point the same direction:

- **The retrieval problem is genuinely hard.** Compliance answers must be grounded in specific policy clauses and evidence artifacts, cited, and never fabricated. Hallucination is not an annoyance here, it is a legal liability. That forces real grounding enforcement, which is exactly what the posting means by "model quality."
- **The agent loop is genuinely agentic.** For each of 200+ questionnaire items: plan, retrieve, check live cloud state via tool call, synthesize, self critique, cite, or abstain and flag a gap. That is multi step tool use, not a single completion.
- **Multi tenancy and document level ACLs are non negotiable.** A consultancy answering questionnaires for five clients cannot leak client A's evidence into client B's answer. Permission filtered retrieval is a hard RAG problem most candidates have never touched.
- **It is your domain.** You can write the corpus, judge the answers, and threat model the system without pretending. Your security lane becomes a differentiator instead of a side note.
- **There is a real market.** Vanta, Drata, Conveyor, SafeBase, Whistic all sell into it. Cybic, a security consultancy, is a plausible first user.

Working name: **ATTEST**. Tagline: *Evidence backed answers, or no answer at all.* (Alternative if the name is taken: VOUCH.)

---

## 2. Product definition

### Primary user
A security or GRC engineer at a company that receives vendor security questionnaires (CAIQ, SIG Lite, custom enterprise forms) and must answer 100 to 300 questions per questionnaire, each backed by policy or evidence.

### Jobs to be done
1. Upload our security corpus once: policies, SOC 2 control narratives, architecture docs, pentest reports, prior questionnaire responses.
2. Drop in a new questionnaire. Get a draft answer per question, each with citations to the source clause.
3. See clearly which questions we cannot answer from evidence, so we know our gaps.
4. Review, correct, and approve. My corrections should make the system better next time.
5. Prove to an auditor where every answer came from.

### In scope (v1)
- Document ingestion and structure aware chunking
- Hybrid retrieval with reranking, permission filtered
- Agentic per question resolution with tool use
- Grounding enforcement and abstention
- Multi turn review assistant over a completed run
- Full evaluation harness with CI gates
- Observability, cost tracking, multi tenant isolation
- One command deploy into any AWS account

### Explicitly out of scope (v1)
- Pretty UI beyond a functional review screen. Build the API first, always.
- Integrations with Jira, Slack, Drata. One live tool integration (AWS Config) proves the pattern.
- SSO, billing, org management. Stub with API keys per tenant.
- Fine tuning. You are demonstrating systems engineering, not model training.

---

## 3. Traceability to the role

| Posting requirement | How ATTEST covers it |
|---|---|
| End to end Agentic RAG in production | Ingestion, hybrid retrieval, agent orchestration, eval, monitoring, optimization — all sections below |
| Bedrock, agents, tool calling, guardrails, multi turn | Converse API with `toolConfig`, Bedrock Guardrails including contextual grounding checks, review chat with persisted state |
| TypeScript, Node, Lambda, API Gateway, DynamoDB, CDK, CI/CD, automated testing | Entire stack is TypeScript. CDK in TypeScript. Vitest plus CDK assertions plus integration tier |
| AI coding assistant expertise | Section 12: spec first workflow with Kiro and Claude Code, plus a documented review discipline |
| Production ownership | ADRs, runbook, dashboards, alarms, cost budget, threat model, on call notes |
| Real engineering depth, LLM evaluation | Section 8: four tier eval strategy, golden sets in git, regression gates blocking merge |

Gaps this does **not** close: the 5+ years TypeScript claim. You compensate with artifact depth, not by overstating.

---

## 4. Architecture

### 4.1 System shape

```
                      ┌─────────────────────────────────────┐
   Upload docs ──────▶│  S3 (raw docs, per tenant prefix)    │
                      └──────────────┬──────────────────────┘
                                     │ EventBridge
                      ┌──────────────▼──────────────────────┐
                      │ Ingestion Step Function             │
                      │  parse → chunk → contextualize      │
                      │  → embed → index                    │
                      └──────────────┬──────────────────────┘
                                     ▼
                      ┌─────────────────────────────────────┐
                      │ Aurora Serverless v2 Postgres       │
                      │  pgvector (HNSW) + tsvector FTS     │
                      │  chunk rows carry tenant_id + acl[] │
                      └──────────────▲──────────────────────┘
                                     │
  POST /runs ──▶ API GW ──▶ Lambda ──┤
                     │               │
                     ▼               │
        ┌────────────────────────┐   │
        │ Run Step Function      │   │
        │  Distributed Map over  │   │
        │  N questions, conc=10  │   │
        │   ├ plan               │   │
        │   ├ retrieve ──────────┘
        │   ├ tools (AWS Config, corpus search)
        │   ├ generate (Bedrock Converse + Guardrail)
        │   ├ ground check → abstain or emit
        │   └ persist
        └───────────┬────────────┘
                    ▼
        ┌────────────────────────┐      ┌──────────────────┐
        │ DynamoDB single table  │◀────▶│ Review API +     │
        │  runs, answers,        │      │ multi turn chat  │
        │  conversations, feedback│     │ (streaming SSE)  │
        └────────────────────────┘      └──────────────────┘

   Every step emits OTel spans → CloudWatch / X-Ray
   Every LLM call emits EMF metrics: tokens, cost, latency, model
```

### 4.2 Component decisions and why

**Compute: Lambda, Node 22, TypeScript, esbuild bundling.** Matches the posting exactly. Keep handlers thin; all logic in testable pure modules.

**Orchestration: Step Functions, not a loop inside Lambda.** A 200 question run takes longer than Lambda's 15 minute ceiling and needs per item retry, partial failure isolation, and visible state. Use **Distributed Map** with a concurrency cap so you can talk about backpressure against Bedrock throttling. This is the single most "senior" choice in the design — most candidates loop in a container and cannot explain what happens on partial failure.

**The agent loop itself lives in a Lambda,** invoked per question by the Map. Inside that Lambda is a hand written control loop over Bedrock Converse: plan, tool call, observe, repeat, max N turns, hard token budget, structured stop conditions. **Write this yourself. Do not use a framework.** The posting wants someone who understands the loop, and you already built one for RELAY.

**Vector store: Aurora Serverless v2 PostgreSQL with pgvector.**
- Rejected OpenSearch Serverless: minimum capacity units make it cost hundreds of dollars per month idle. That kills your ability to leave it running, and it is a bad cost story.
- Rejected Bedrock Knowledge Bases: it is a managed black box. The posting asks for "retrieval pipelines" — if you hand chunking, embedding, and hybrid search to a managed service you have nothing to say in the interview. Build it, then mention you evaluated KB and chose to own the pipeline for control over hybrid fusion and ACL filtering. That answer is stronger than using it.
- Postgres gives you vector search and BM25 style full text in one query plan, plus real SQL predicates for tenant and ACL filtering. Aurora Serverless v2 scales to near zero when idle.
- Verify current pricing and whether S3 Vectors has reached GA before committing; if it has, benchmark it as a cost experiment and write up the comparison. That comparison is itself an interview asset.

**Models on Bedrock, routed by job:**
| Job | Model class | Why |
|---|---|---|
| Query rewrite, routing, classification | Haiku tier | High volume, trivial task, 10x cheaper |
| Chunk contextualization at ingest | Haiku tier + prompt caching | Runs once per chunk over the whole corpus |
| Answer generation | Sonnet tier | Quality where it is user visible |
| LLM as judge in evals | Different model family than the generator | Avoid self preference bias |

Model routing with a measured quality delta is a strong "cost optimization" story.

**Guardrails: Bedrock Guardrails, applied on the Converse call.** Use content filters, a PII sensitive information filter, denied topics, and critically the **contextual grounding check**, which scores whether the response is supported by the provided source passages. Set a grounding threshold; below it, the answer is suppressed and the question is flagged as a gap. That turns a guardrail from a checkbox into the core product behavior.

**State: DynamoDB single table.**

| Entity | PK | SK | Notes |
|---|---|---|---|
| Tenant | `TENANT#<id>` | `META` | |
| Document | `TENANT#<id>` | `DOC#<docId>` | status, acl tags, checksum |
| Run | `TENANT#<id>` | `RUN#<runId>` | status, counts, cost rollup |
| Answer | `RUN#<runId>` | `Q#<seq>` | answer, citations[], confidence, state |
| Conversation | `CONV#<convId>` | `MSG#<ts>` | multi turn review chat |
| Feedback | `RUN#<runId>` | `FB#<qSeq>#<ts>` | reviewer correction, feeds eval set |

GSI1: `status` as PK for "all runs in progress." Write access patterns down before the table — put them in an ADR.

**Ingestion:** S3 put → EventBridge rule → ingestion Step Function. Idempotent by content hash so re uploads are free.

---

## 5. Retrieval design

This is the headline bullet. Treat it as the deepest part of the build.

### 5.1 Ingestion pipeline
1. **Parse.** PDFs via a text extractor; fall back to Textract for scanned documents. Preserve heading hierarchy and page numbers — you need them for citations.
2. **Structure aware chunking.** Split on semantic boundaries (headings, control IDs, numbered clauses), not on a fixed character count. Target 400 to 800 tokens with 15 percent overlap. Carry forward the heading path as metadata (`Policy > Access Control > 4.2 MFA`).
3. **Contextual chunk augmentation.** Before embedding, generate one to two sentences of document level context per chunk with a cheap model and prepend it. A chunk that says "This must be reviewed annually" is useless in isolation; "In Northwind's Access Control Policy section 4.2, regarding MFA enforcement: This must be reviewed annually" retrieves correctly. This one technique typically produces the largest single recall improvement in the whole pipeline. Use prompt caching so the source document is not re sent per chunk.
4. **Embed.** Titan Text Embeddings v2 or Cohere Embed v3 on Bedrock. Benchmark both on your golden set and record the numbers — that table is interview gold.
5. **Index.** Insert into Postgres with `vector` column (HNSW index), `tsvector` column (GIN index), plus `tenant_id`, `acl_tags text[]`, `doc_id`, `heading_path`, `page`.

### 5.2 Query pipeline
1. **Query understanding.** Questionnaire items are often compound ("Do you encrypt data at rest and in transit, and who manages the keys?"). Decompose into sub queries with a cheap model. Rewrite into retrieval friendly phrasing.
2. **Hybrid search.** Run vector KNN and full text search in parallel, fuse with Reciprocal Rank Fusion. Both branches must include `WHERE tenant_id = $1 AND acl_tags && $2` — **filter inside the query, never post filter results.** Post filtering silently degrades recall and is a real security bug.
3. **Rerank.** Cohere Rerank on Bedrock over the top 50 fused results, keep top 8. Measure the latency cost and the nDCG gain, then decide. Having the measurement is the point.
4. **Context assembly.** Pack under an explicit token budget, deduplicate near identical chunks, order by relevance, and tag each with a stable citation id the model must reference.

### 5.3 Retrieval metrics (measured independently of generation)
- recall@k (k = 5, 10, 20) against labeled gold chunks
- MRR and nDCG@10
- Filtered recall: does ACL filtering drop recall for legitimately permitted queries
- p95 retrieval latency, split by stage

**Rule: never change retrieval and generation in the same commit.** You will not know which moved the number. This discipline is what separates you from PoC candidates.

---

## 6. Agent design

### 6.1 The per question loop
```
plan(question)                    → sub queries + which tools may help
  loop (max 6 turns, token budget):
    retrieve(sub queries)         → candidate evidence
    maybe tool_call               → live system state
    Converse(evidence + tools)    → draft or another tool request
    if tool_use → execute, append result, continue
    else → break
selfCritique(draft, evidence)     → are all claims cited and supported
groundingCheck (Guardrail)        → score
  score >= threshold → emit answer with citations + confidence
  score <  threshold → emit GAP with reason and what evidence is missing
persist + emit metrics
```

Abstention is a first class output, not a failure. "We could not substantiate this from your evidence, here is what is missing" is the most valuable thing the product says.

### 6.2 Tools (Converse `toolConfig`)
| Tool | Purpose |
|---|---|
| `search_corpus` | Targeted follow up retrieval with filters, when the initial pass was thin |
| `get_document_section` | Pull surrounding context for a chunk when a clause is truncated |
| `check_aws_config` | Query AWS Config for a live control state (encryption enabled, public buckets, MFA on root). Proves an answer against reality, not just policy text |
| `lookup_prior_answer` | Retrieve how this question was answered in a previous questionnaire, with its approval status |

Design the tool schemas strictly: required fields, enums instead of free text, and validate arguments with Zod before execution. Then write the failure path — models fabricate arguments, and how you handle that is a real interview question. Return a structured error the model can recover from, count retries, and fail the item deterministically after N attempts.

### 6.3 Multi turn review assistant
Separate endpoint over a completed run. The reviewer says "this answer is too strong, we only do this for prod" and the agent re retrieves, revises, and updates the citation set. Conversation history in DynamoDB, streamed to the client with `ConverseStream` over SSE. Windowing plus summarization for long sessions — do not naively resend everything.

### 6.4 The flywheel
Every reviewer correction is persisted as a feedback record. A weekly job promotes reviewed corrections into the evaluation golden set (after human confirmation, never automatically). Approved answers become retrievable via `lookup_prior_answer`. This is the same compounding structure as RELAY, applied to quality rather than outreach.

---

## 7. Security and multi tenancy

Your differentiator. Make it explicit and documented.

- **Tenant isolation:** `tenant_id` on every row, enforced at the data access layer, plus Postgres row level security as defense in depth. S3 prefixes per tenant with IAM conditions. Separate KMS key per tenant if you want the strongest story.
- **Document ACLs:** `acl_tags` array per chunk. The caller's identity resolves to a tag set; retrieval filters in the SQL predicate. Write an explicit test that proves tenant B cannot retrieve tenant A's chunk, and a second test that proves a restricted document is invisible to an unprivileged user even when it is the single best semantic match.
- **Prompt injection:** your corpus is untrusted user uploaded documents. A malicious policy PDF can carry instructions. Mitigate with strict role separation (evidence goes in a data channel, never as system text), delimiter fencing with injected id tags, output schema validation, and a Guardrail denied topics filter. Write this up in the threat model — very few candidates think about injection through the retrieval corpus.
- **Secrets:** none in code. Secrets Manager, retrieved at cold start, rotated.
- **Logging:** never log full document content or LLM IO to CloudWatch. Redacted structured logs to CloudWatch, full traces to S3 with lifecycle expiry and KMS encryption.
- **Deliverable:** a threat model document (STRIDE or attack trees) and a self pentest report against your own deployed instance. You are the one candidate who can produce that.

---

## 8. Evaluation strategy

The bullet that says "strong understanding of LLM evaluation" is where you win. Reuse your existing `specs/` and `evals/` convention rather than inventing something project specific — that convention was always meant to generalize, and this is the proof.

### Four tiers

**Tier 1 — Deterministic assertions.** Runs on every PR, seconds, zero model cost.
- Response conforms to schema
- Every factual sentence carries a citation id
- Every cited id exists in the retrieved set (catches fabricated citations without a judge)
- Token budget and latency ceilings respected

**Tier 2 — Retrieval metrics.** Runs on every PR, ~1 minute, cost is embedding only.
- recall@k, MRR, nDCG against 150 to 200 labeled queries with gold chunk ids
- Hard negative cases: questions that look similar but need different evidence
- ACL cases: queries that must return nothing

**Tier 3 — Generation quality, LLM as judge.** Nightly and pre release, ~10 minutes.
- Faithfulness: is each claim supported by cited evidence
- Citation precision and recall
- Answer completeness against a reference answer
- **Correct abstention:** on questions with no supporting evidence, does the system flag a gap rather than confabulate. Weight this heavily. This is the metric that matters commercially.
- Use a different model family as judge. Calibrate the judge against 50 human labeled examples and report judge agreement — most people skip this and it is the first thing a rigorous interviewer probes.

**Tier 4 — Human review sample.** 20 items per release, logged, feeds back into the golden set.

### Mechanics
- Golden sets as JSONL in git, versioned, reviewed like code. Never regenerate them silently.
- Thresholds in `evals/thresholds.yaml`. CI fails the PR if a metric regresses beyond tolerance.
- Runner is a thin interface so the backing implementation (custom, promptfoo, Ragas style) can be swapped without touching the test cases.
- Every eval run emits cost and p95 latency alongside quality. A change that improves faithfulness by 2 points and triples cost is a rejected change, and you should be able to show the tradeoff table.
- Report artifact posted as a PR comment: metric, previous, current, delta, pass or fail.

---

## 9. Observability, performance, cost

**Tracing.** ADOT Lambda layer, OpenTelemetry spans for `ingest.chunk`, `retrieve.vector`, `retrieve.fts`, `retrieve.rerank`, `llm.converse`, `guardrail.check`, `tool.<name>`. One trace per question, parent trace per run. When someone asks "why did question 47 take 40 seconds," you open the trace and answer.

**Metrics via CloudWatch EMF** (structured logs, no PutMetricData throttling): input and output tokens, model id, cost in dollars, cache hit rate, retrieval candidate counts, grounding scores, abstention rate, tool call counts and failures.

**Dashboard.** One page: run throughput, p50/p95/p99 per question, cost per run and per question, abstention rate over time, grounding score distribution, Bedrock throttle count, error budget burn.

**Alarms.** Bedrock throttling above threshold, cost per run above budget, abstention rate spike (signals corpus or retrieval regression), Step Function failure rate, DLQ depth.

**Performance levers to implement and measure:**
- Prompt caching on the stable system prompt and tool definitions
- Parallel retrieval branches instead of sequential
- Embedding cache keyed by content hash
- Batch inference for eval runs (roughly half price, latency irrelevant offline)
- Model routing by task
- Distributed Map concurrency tuned against observed throttling

Keep a `docs/optimizations.md` with a row per change: what, hypothesis, before, after, decision. Three or four honest rows including one rejected change is worth more than a page of claims.

---

## 10. The corpus — and an IP warning

**Do not use Cybic client material.** Pentest reports for Cogniva or any client are confidential and covered by your engagement terms. Using them in a personal portfolio project is a serious professional problem, regardless of how good the corpus would be.

Build a synthetic corpus for a fictional company, "Northwind Systems":
- Security policies you author (access control, encryption, incident response, vendor management, BCDR) — roughly 15 documents. Writing these is itself credible domain work.
- Control narratives mapped to public frameworks: NIST CSF, CIS Controls, SOC 2 TSC criteria descriptions
- A synthetic pentest report and remediation tracker you write
- Architecture and data flow documents
- Two prior completed questionnaires as historical answers

Questionnaires to answer: **CAIQ** from the Cloud Security Alliance and a SIG style set are publicly available and are exactly what real customers send. Using the real instrument is what makes this "the same level as an industry product" rather than a toy.

Also check your Cybic employment agreement for IP assignment language before building on personal time. If it is broad, get a written carve out. Do this in week 1, not week 11.

---

## 11. Repo layout

```
attest/
├── specs/                        # spec first: written before code
│   ├── 000-product.md
│   ├── 010-retrieval-pipeline.md
│   ├── 020-agent-loop.md
│   └── 030-eval-strategy.md
├── docs/
│   ├── adr/                      # architecture decision records, numbered
│   ├── threat-model.md
│   ├── runbook.md
│   ├── optimizations.md
│   └── cost-model.md
├── packages/
│   ├── core/                     # pure domain logic, no AWS imports, 90% coverage
│   │   ├── chunking/
│   │   ├── retrieval/            # fusion, ranking, budget packing
│   │   ├── agent/                # the control loop
│   │   └── prompts/              # versioned, id'd, diffable
│   ├── adapters/                 # bedrock, postgres, dynamo, s3 — thin, mockable
│   ├── functions/                # lambda handlers, thin
│   └── infra/                    # CDK app
├── evals/
│   ├── golden/                   # JSONL, versioned
│   │   ├── retrieval.jsonl
│   │   ├── generation.jsonl
│   │   └── abstention.jsonl
│   ├── runner/                   # thin swappable interface
│   ├── judges/
│   └── thresholds.yaml
├── tests/
│   ├── unit/
│   ├── infra/                    # CDK Template assertions + snapshots
│   └── integration/              # against a deployed dev stack
├── .github/workflows/
├── CLAUDE.md                     # agent instructions for this repo
└── AGENTS.md
```

The `core` package having zero AWS imports is deliberate: it makes the interesting logic testable in milliseconds without mocks, and it is a signal of engineering maturity that reviewers notice immediately.

---

## 12. Engineering practices

### CI/CD
Reuse what you already built at Cybic — this is the cheapest credibility in the whole plan.
- GitHub Actions, OIDC federation to AWS, zero static credentials
- All actions SHA pinned
- PR: lint, typecheck, unit, CDK synth and Template assertions, `cdk diff` posted as a comment, eval tiers 1 and 2
- Merge to main: deploy to dev, run integration tests, run eval tier 3, publish eval report
- Prod: manual approval gate, canary via Lambda alias weighted routing, CloudWatch alarm triggered auto rollback
- SBOM generation and artifact attestation

The eval gate blocking a merge on a quality regression is the single most differentiating thing in your CI. Screenshot it.

### Testing tiers
| Tier | Tool | Runs |
|---|---|---|
| Unit (pure logic) | Vitest | every commit |
| AWS adapter | `aws-sdk-client-mock` | every commit |
| Infra | `aws-cdk-lib/assertions` Template + snapshots | every commit |
| Integration | deployed dev stack, real Bedrock | on merge |
| Eval | see section 8 | PR and nightly |

### AI coding assistant discipline (a posting bullet — treat it as a deliverable)
- **Spec before prompt.** Every non trivial change starts as a file in `specs/`. Kiro is built around exactly this; install it and use it for at least one full feature so you can speak to it by name. Your existing spec driven workflow means you are adopting a tool, not learning a concept.
- `CLAUDE.md` at repo root: architecture summary, conventions, the "core has no AWS imports" rule, testing requirements, what the agent must never touch.
- **Review discipline, written down in `docs/ai-workflow.md`:** generated code is reviewed line by line before commit; no generated code merges without a test written or verified by you; generated infrastructure changes always reviewed as `cdk diff`, never as source; generated dependencies checked against the SBOM policy.
- Keep an honest note on where the assistant helped and where it produced plausible garbage. Interviewers are tired of uncritical enthusiasm and respond well to calibration.

---

## 13. Delivery plan

Assume 10 to 14 hours per week alongside full time work. Twelve weeks. Every phase ends with something demonstrable — if a phase slips, cut scope inside it rather than extending it.

| Phase | Weeks | Build | Exit criteria |
|---|---|---|---|
| **0. Skeleton** | 1 | Repo, CDK app, OIDC CI, API GW → Lambda → DynamoDB hello path, Aurora provisioned, one trivial eval running in CI | `git push` deploys to dev and CI is green. IP carve out confirmed. |
| **1. Corpus + ingestion** | 2–3 | Northwind corpus authored. Parse, chunk, embed, index. Retrieval eval harness with 50 labeled queries | A query script returns relevant chunks. recall@10 has a baseline number written down. |
| **2. Retrieval quality** | 4–5 | Hybrid + RRF, contextual chunk augmentation, reranking, embedding model bake off | `docs/optimizations.md` shows four changes with before and after recall@10 and latency. Golden set at 150 queries. |
| **3. The agent** | 6–7 | Converse loop, tool schemas, AWS Config tool, Step Functions Distributed Map, Guardrails with grounding threshold, abstention path | A full CAIQ run completes end to end, producing cited answers and flagged gaps. |
| **4. Review assistant** | 8 | Multi turn chat over a run, streaming, conversation state, feedback capture | A reviewer can challenge an answer and get a revised, re grounded response. |
| **5. Evals hardened** | 9 | Tiers 3 and 4, judge calibration against human labels, thresholds, PR report comment | A deliberately bad prompt change is caught and blocked by CI. Prove it with a screenshot. |
| **6. Security + ops** | 10 | Tenant isolation tests, ACL filtering tests, injection defenses, threat model, dashboard, alarms, runbook | Self pentest report written. Isolation tests pass and are in CI. |
| **7. Optimize + package** | 11–12 | Cost and latency sprint, prompt caching, model routing, README, one command deploy, 5 minute demo video | A stranger can deploy it. Cost per run is a known number. Demo recorded. |

**Apply to the role in week 3.** Do not wait. Four bullets already fit you, and having a build in progress with measured numbers is a stronger interview position than a finished project you did not get to discuss.

---

## 14. Failure modes to avoid

| Risk | Mitigation |
|---|---|
| Scope creep into a SaaS product | Section 2's out of scope list is a contract with yourself. Re read it weekly. |
| Building UI early | API and evals first. UI in week 8 or later, functional only. |
| Evals bolted on at the end | Tier 2 exists in week 2 or the project has failed. This is non negotiable. |
| Cost surprise | Budget alarm at $50/month on day one. Aurora scales to near zero. Do not provision OpenSearch Serverless. |
| Optimizing before measuring | No performance change lands without a before number in `optimizations.md`. |
| Retrieval and generation changed together | One concern per PR. Enforce in your own review. |
| Synthetic corpus too easy | Deliberately include contradictory policies, outdated versions, and questions with genuinely no answer. A corpus where everything is findable proves nothing. |
| Never finishing | Phase 3 is the minimum shippable story. If life intervenes, stop at phase 5 with a clean writeup rather than half of phase 7. |

---

## 15. Interview deliverables

By the end, you should be able to hand over or screen share:

1. **The repo**, with a README that opens on architecture and the eval report, not on installation steps.
2. **`docs/adr/`** — eight to twelve decision records including the ones where you rejected something (Knowledge Bases, OpenSearch Serverless, an agent framework). Rejected options demonstrate judgment better than chosen ones.
3. **The eval report** — retrieval metrics, generation metrics, judge calibration, abstention accuracy, with the golden set methodology.
4. **`docs/optimizations.md`** — measured changes including at least one you reverted.
5. **`docs/cost-model.md`** — cost per question and per run, broken down by stage, with the levers you pulled.
6. **The threat model and self pentest report** — nobody else brings this.
7. **A 5 minute demo video** — upload a questionnaire, watch the run, inspect a citation, challenge an answer in chat, show the flagged gap.
8. **A short writeup on the AI assisted workflow** — spec first, review discipline, calibrated on where it failed.

Prepare crisp verbal answers for: how you chose chunk boundaries; when reranking earns its latency; how you separate retrieval regressions from generation regressions; how you handle a model fabricating tool arguments; how you prevented cross tenant leakage in retrieval rather than after it; what you did when quality and cost pulled in opposite directions.

---

## 16. First three actions

1. Read your Cybic IP assignment clause. Get a carve out in writing if needed.
2. Create the repo and write `specs/000-product.md` and `specs/010-retrieval-pipeline.md` before any code.
3. Stand up phase 0 end to end — deploy pipeline green — before touching a model. The infrastructure spine being real from day one is what keeps this from becoming a notebook.
