# CLAUDE.md — agent instructions for the ATTEST repository

## What this is

A multi-tenant, permission-aware Agentic RAG platform that drafts answers to CAIQ v4
security questionnaires from a company's own evidence corpus — with citations on every
claim, and an explicit gap when the evidence isn't there.

Read [docs/00-OVERVIEW.md](docs/00-OVERVIEW.md) first. **[docs/14-contracts.md](docs/14-contracts.md)
is normative**: enums, state machines, the evidence model, and document-version identity
are defined there and nowhere else. If any other document disagrees with it, that other
document is the defect.

## The five non-negotiables

Violating any of these silently destroys the project's value. They are enforced by CI,
not by review discipline.

1. **Retrieval filters tenant and ACL inside the SQL predicate, never after.**
   Post-filtering is a security bug *and* a silent recall regression.
   → `scripts/ci/check-sql-predicates.mjs`

2. **Filtering inside the query is not sufficient.** Approximate HNSW search under a
   restrictive ACL predicate can return zero permitted rows — measured, not theorised
   (see [ADR-0007](docs/adr/0007-filtered-vector-search.md)). `hnsw.iterative_scan` must
   stay on and `shortfallRate` must stay gated.

3. **Never change retrieval and generation in the same commit.** You will not know which
   moved the number.

4. **Evidence is immutable and citations pin the version they cited.** Retrieval filters
   `active = true`; citation resolution ignores `active` entirely. Two code paths, two
   rules, never shared.

5. **`packages/core` has zero AWS imports.** That constraint is what makes the
   interesting logic testable in milliseconds without mocks.
   → `scripts/ci/check-core-no-aws.mjs`

## Layout

```
packages/core/        pure domain logic — NO AWS imports, no I/O
  contracts/          enums, state machines, evidence model  ← derives from docs/14
  chunking/           block model, structure-aware chunker
  screening/          injection detection (runs BEFORE any LLM call)
packages/adapters/    bedrock · postgres · dynamo · s3 — thin, mockable
  migrations/         forward-only SQL, idempotent
packages/functions/   lambda handlers — thin
packages/infra/       CDK app
scripts/ci/           static checks that enforce the non-negotiables
scripts/spikes/       one-off experiments; results land in an ADR
corpus/northwind/     synthetic corpus — the measuring instrument
evals/                golden sets, runner, thresholds
```

## What the agent must never modify without explicit human review

- `evals/golden/**` and `evals/thresholds.yaml` — a model adjusting the bar it is
  measured against invalidates the entire evaluation story
- `packages/adapters/migrations/002_rls.sql` — the tenant isolation boundary
- Anything under `scripts/ci/` — these are the guards, not the code
- IAM policies in `packages/infra/`

## Conventions

- TypeScript strict, `noUncheckedIndexedAccess`. No `any` outside adapter boundaries.
- Zod at every boundary: API input, tool arguments, LLM output, config.
- Enum values are `SCREAMING_SNAKE` everywhere. JSON/TS is `camelCase`; SQL is
  `snake_case`. Mapping happens in the repository layer and nowhere else.
- Prompts are files with versioned IDs, never string literals.
- Parameterised SQL only. Template-literal interpolation into SQL is a lint error.
- Commits: `feat(retrieval): RRF fusion [F-203]` — include the requirement ID.

## Testing

`npm test` runs everything. Tests must fail without the change they cover.

The corpus fixture tests (`tests/corpus-fixtures.test.ts`) assert that the planted
difficulties in `corpus/northwind/` still exist. **If one disappears, every retrieval and
abstention metric computed against the corpus becomes meaningless while still looking
healthy.** Treat a failure there as a broken instrument, not a broken test.

## Before you finish a change

- [ ] Spec in `specs/` updated if behaviour changed
- [ ] Tests exist and fail without the change
- [ ] `npm run ci:checks` passes
- [ ] If it touches retrieval: Tier 2 ran, delta recorded in `docs/optimizations.md`
- [ ] If it touches generation: separate PR from any retrieval change
- [ ] If it touches security surface: threat model updated
