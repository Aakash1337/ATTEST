# ATTEST

**Evidence-backed answers, or no answer at all.**

A multi-tenant, permission-aware Agentic RAG platform that drafts answers to **CAIQ v4** security
questionnaires from a company's own policy and evidence corpus — with citations on every claim,
and an explicit "we cannot substantiate this" when the evidence isn't there.

One questionnaire format in the core release. SIG and arbitrary workbooks are extensions with a
defined mapping, not a vague promise — see
[docs/11-delivery-plan.md §3](docs/11-delivery-plan.md).

---

## Start here

**New to this codebase — including if you specified it but didn't type it?**
Start with **[learn/README.md](learn/README.md)**. A six-session guided path through the code,
with break-it exercises and interview drills. Do that before reading the docs below; the docs are
reference material and reading them front-to-back builds vocabulary without understanding.

| If you want to know… | Read |
|---|---|
| What this is, what it does, and when it ships | [docs/00-OVERVIEW.md](docs/00-OVERVIEW.md) |
| What we're building, for whom, and the acceptance criteria | [docs/01-product-spec.md](docs/01-product-spec.md) |
| **Enums, state machines, evidence model — normative** | **[docs/14-contracts.md](docs/14-contracts.md)** |
| How it's put together and why | [docs/02-architecture.md](docs/02-architecture.md) |
| Week-by-week schedule, and what "done" means | [docs/11-delivery-plan.md](docs/11-delivery-plan.md) |

Full document map is in [docs/00-OVERVIEW.md §9](docs/00-OVERVIEW.md).

---

## Document set

```
docs/
├── 00-OVERVIEW.md                 Master brief: what, why, functionality catalog, timeline
├── 01-product-spec.md             Personas, journeys, functional + non-functional requirements
├── 02-architecture.md             System shape, component decisions, environments, networking
├── 03-retrieval-spec.md           Ingestion, chunking, hybrid search, reranking, metrics
├── 04-agent-spec.md               Control loop, tool schemas, abstention, review assistant
├── 05-api-spec.md                 REST surface, auth, errors, idempotency, streaming
├── 06-data-model.md               DynamoDB single-table design + Postgres schema/DDL
├── 07-security-threat-model.md    Trust boundaries, STRIDE, isolation, prompt injection
├── 08-evaluation-spec.md          Four eval tiers, golden sets, judge calibration, CI gates
├── 09-observability-and-cost.md   Tracing, metrics, dashboards, alarms, cost model
├── 10-corpus-spec.md              Northwind Systems synthetic corpus + questionnaire sources
├── 11-delivery-plan.md            14-week plan, effort estimates, exit criteria, cut lines
├── 12-engineering-practices.md    Repo layout, CI/CD, testing tiers, AI-assisted workflow
├── 13-risk-register.md            Risks with triggers, owners, and residual ratings
├── 14-contracts.md                NORMATIVE — enums, state machines, evidence, versioning
├── 99-portfolio-positioning.md    Career-facing framing, kept out of the product docs
└── adr/                           Architecture Decision Records
```

## Status

Pre-build, rebaselined v2 after external review. No code yet.

- **Budget:** 140 hours at 10 h/week over 14 weeks (2026-07-27 → 2026-11-01)
- **Done means:** the nine release gates in [docs/11-delivery-plan.md §6](docs/11-delivery-plan.md)
- **Built so far:** contracts, Postgres schema + RLS, structure-aware chunker, injection
  screening, the Northwind corpus, and three CI guards. 118 tests. Nothing is deployed —
  retrieval queries, embedding, the agent loop and the API are specified but not yet written.

## Non-negotiables

Five rules whose violation silently destroys the project's value:

1. **Retrieval filters inside the SQL predicate, never after.** Post-filtering is a security bug
   and a silent recall regression.
2. **…and filtering inside the query is not enough.** Approximate search under a restrictive ACL
   predicate can return too few permitted rows. `shortfallRate` is gated for exactly this reason
   ([ADR-0007](docs/adr/0007-filtered-vector-search.md)).
3. **Never change retrieval and generation in the same commit.** You will not know which moved
   the number.
4. **Evidence is immutable and citations pin the version they cited.** Otherwise every historical
   answer becomes unverifiable the moment a policy is updated.
5. **Security lands with the data path it protects**, not in a hardening phase afterwards.
