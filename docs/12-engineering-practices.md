# 12 — Engineering Practices

**Status:** Revised v2

---

## 1. Repository layout

```
attest/
├── specs/                        spec-first: written before code
│   ├── 000-product.md
│   ├── 010-retrieval-pipeline.md
│   ├── 020-agent-loop.md
│   ├── 030-eval-strategy.md
│   └── 040-questionnaire-normalisation.md
├── docs/                         this document set
│   ├── adr/                      numbered decision records
│   ├── runbook.md
│   ├── optimizations.md
│   ├── cost-model.md
│   ├── ai-workflow.md
│   └── pentest-self-assessment.md
├── packages/
│   ├── core/                     pure domain logic — ZERO AWS imports, 90% coverage
│   │   ├── chunking/
│   │   ├── retrieval/            fusion, ranking, budget packing
│   │   ├── agent/                the control loop
│   │   ├── questionnaire/        normalisation + export mapping
│   │   └── prompts/              versioned, id'd, diffable
│   ├── adapters/                 bedrock · postgres · dynamo · s3 — thin and mockable
│   ├── functions/                lambda handlers — thin
│   ├── api/                      openapi.yaml + generated types
│   ├── ui/                       minimal review SPA
│   └── infra/                    CDK app
├── evals/
│   ├── golden/                   JSONL, versioned, reviewed like code
│   ├── runner/                   thin swappable interface
│   ├── judges/
│   ├── human-reviews/
│   └── thresholds.yaml
├── tests/
│   ├── unit/
│   ├── infra/                    CDK Template assertions + snapshots
│   ├── integration/              against a deployed dev stack
│   └── isolation/                tenant + ACL — never deleted
├── .github/workflows/
├── CLAUDE.md
└── AGENTS.md
```

### The `core` rule

**`packages/core` has zero AWS imports.** This is enforced by a lint rule and a CI check, not by
good intentions.

Why it earns its constraint: the chunker, the fusion algorithm, the budget packer, and the
agent control loop are the interesting logic. Keeping them free of AWS SDK types means they are
tested in milliseconds with plain objects and no mocks. Every piece of logic worth arguing
about in a code review is testable without touching a cloud.

---

## 2. Conventions

| Area | Convention |
|---|---|
| Language | TypeScript strict, `noUncheckedIndexedAccess`, no `any` outside adapter boundaries |
| Validation | Zod at every boundary: API input, tool arguments, LLM output, config |
| Errors | Typed error classes; no thrown strings; every error carries a stable code |
| Logging | Structured JSON via a shared logger with a field allowlist. `console.log` is a lint error |
| IDs | ULIDs, prefixed by entity |
| Time | ISO 8601 UTC everywhere; no local time in storage |
| Config | Environment variables typed and validated at cold start; failure to validate crashes the init, loudly |
| Prompts | Files, not string literals. Versioned IDs. Changing one is a reviewable diff |
| SQL | Parameterised only. Template-literal interpolation into SQL is a lint error |
| Commits | Conventional commits with the requirement ID: `feat(retrieval): RRF fusion [F-203]` |

---

## 3. Testing

| Tier | Tool | Scope | Runs |
|---|---|---|---|
| Unit | Vitest | `packages/core`, pure logic, 90% coverage floor | Every commit |
| Adapter | `aws-sdk-client-mock` | AWS call shapes, retries, error mapping | Every commit |
| Infra | `aws-cdk-lib/assertions` | Template assertions + snapshots | Every commit |
| Contract | Generated types vs `openapi.yaml` | Drift detection | Every commit |
| Isolation | Vitest + deployed dev stack | Tenant and ACL boundaries | Every commit + on merge |
| Integration | Deployed dev stack, real Bedrock | End-to-end paths | On merge |
| Eval | See [08-evaluation-spec.md](08-evaluation-spec.md) | Quality | PR + nightly |

**Snapshot discipline:** CDK snapshots are reviewed, never blindly updated. A snapshot diff in a
PR that claims to change only application code is a signal, not a nuisance.

---

## 4. CI/CD

Scaled deliberately to a 140-hour solo build. A deployed-stack isolation suite on *every commit*,
release attestations, canary rollback, and nightly multi-tier evaluation would compete directly
with core functionality. Three tiers, each doing only what it must:

### On pull request — fast, local, free
```
lint · typecheck · unit · adapter tests
contract check      (generated types vs openapi.yaml vs packages/core/contracts)
infra assertions    (CDK Template + snapshots)
cdk synth · cdk diff → posted as a PR comment
eval tier 1         (deterministic citation + schema + budget assertions)
eval tier 2         (retrieval, `dev` split, local fixtures)
static checks:
  · core-has-no-aws-imports
  · every query on chunk/prior_answer/live_evidence carries tenant + acl predicates
  · every table with a tenant_id column has RLS enabled AND forced
  · retrieval and generation not changed in the same PR (override requires justification)
```

### On merge to main — one deployed run
```
deploy to dev → integration smoke → isolation smoke suite → eval tier 2 (locked-test)
→ eval tier 3 → publish eval report
```

### Manual / release — the expensive proofs
```
full isolation fuzzing across every ID-bearing endpoint
judge evaluation + calibration on the untouched validation split
export round-trip verification
restore/reindex drill
self-pentest
SBOM generation + artifact attestation
```

**Deferred from the core release:** canary deploys and alarm-triggered automatic rollback.
Production deploys go through a manual approval gate and a straight deploy. Recorded as a known
gap rather than quietly omitted.

**The eval gate blocking a merge on a quality regression is the most differentiating thing in
this pipeline** — and the thing most likely to be quietly disabled when it becomes inconvenient.
It does not get disabled. Thresholds get renegotiated in a PR, in the open.

**Zero static AWS credentials.** GitHub Actions authenticates via OIDC federation. All actions
are SHA-pinned.

---

## 5. Definition of done

A change is done when:

- [ ] The spec in `specs/` is updated if behaviour changed
- [ ] Tests exist and fail without the change
- [ ] Coverage floor holds for `core`
- [ ] No new AWS import in `core`
- [ ] If it touches retrieval: Tier 2 ran, and the delta is in `optimizations.md`
- [ ] If it touches generation: Tier 3 ran (and it is a *separate PR* from any retrieval change)
- [ ] If it touches infra: `cdk diff` reviewed in the PR comment
- [ ] If it touches security surface: the threat model is updated
- [ ] Structured logs added for any new failure mode
- [ ] The requirement ID is in the commit message

---

## 6. AI-assisted development discipline

This is treated as a deliverable in its own right, documented in `docs/ai-workflow.md`.

### Spec before prompt
Every non-trivial change starts as a file in `specs/`. The spec states the behaviour, the
constraints, and the tests that would prove it. Only then does implementation begin. This is
not ceremony — a specification is a far better prompt than a description, and it survives as
documentation afterwards.

Use a spec-driven tool (Kiro) for at least one full feature end to end, so the workflow can be
discussed concretely rather than abstractly.

### `CLAUDE.md` at repo root
Contains: architecture summary, the conventions above, the "core has no AWS imports" rule,
testing requirements, the SQL predicate rule, and an explicit list of what must never be
modified without human review — `evals/golden/`, `thresholds.yaml`, IAM policies, and the
isolation test suite.

### Review discipline
- Generated code is reviewed line by line before commit. Reading it later does not count.
- No generated code merges without a test that was written or verified by a human.
- Generated infrastructure changes are reviewed as `cdk diff`, never as source. Source looks
  fine; the diff is where a security group opens to the world.
- Generated dependencies are checked against the SBOM policy. New transitive dependencies are a
  supply-chain decision, not a convenience.
- Golden sets and thresholds are never modified by an assistant unsupervised. A model adjusting
  the bar it is being measured against is the failure mode that invalidates the entire eval
  story.

### Honest calibration
`docs/ai-workflow.md` records where assistance helped and where it produced plausible garbage —
with specifics. Expected candidates based on the shape of this project: CDK constructs that
synthesise but are subtly over-permissioned; retrieval SQL that omits a predicate; confidently
wrong claims about current AWS service limits; and eval code that measures something adjacent to
what was asked for.

Calibration is more credible than enthusiasm, and it is the honest answer to a question
interviewers are increasingly asking.

---

## 7. Architecture Decision Records

One ADR per decision that would otherwise be re-litigated. Numbered, immutable once accepted,
superseded rather than edited.

Target 8–12 by the end, **including the rejections**: Bedrock Knowledge Bases, OpenSearch
Serverless, and agent frameworks were all evaluated and declined. A rejected option with a
recorded rationale demonstrates judgement better than a chosen one.

See [adr/README.md](adr/README.md) for the index and template.
