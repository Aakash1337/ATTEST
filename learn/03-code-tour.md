# 03 — Code tour

**Three sessions, ~4 hours.** Read with the file open beside this. Where you see **PREDICT**,
stop and answer before reading on — that's the part that builds understanding.

Order matters: contracts define the vocabulary the rest of the code speaks.

---

## §0 — The map

```
packages/core/src/          ← pure logic, no AWS, no I/O. 118 tests in <1s because of this
├── contracts/              THE VOCABULARY — read first
│   ├── enums.ts      113   every state name in the system
│   ├── states.ts     120   which transitions are legal, as data
│   ├── evidence.ts   173   the evidence model + the security-critical fence
│   ├── ids.ts         42   ID formats, CallerContext
│   └── errors.ts      42   stable error codes
├── chunking/               THE HARDEST PART
│   ├── blocks.ts     180   markdown → Block[]
│   ├── tokens.ts      51   token estimate + sentence splitting
│   └── chunker.ts    366   Block[] → DraftChunk[]
└── screening/
    └── injection.ts  201   injection detection before any LLM call

packages/adapters/migrations/   207 lines of SQL, all load-bearing
scripts/spikes/                 402 lines — the experiment that closed ADR-0007
scripts/ci/                     185 lines — three guards
```

**Data flow of what exists today:**

```
markdown file
   → parseMarkdown()   → Block[]        blocks.ts
   → chunkBlocks()     → DraftChunk[]   chunker.ts
   → screenDocument()  → CLEAN | FLAGGED  injection.ts
   → [NOT BUILT: contextualise → embed → index]
```

Everything downstream of screening is unwritten. Be precise about that when you describe it.

---

# SESSION 3 — Contracts (60 min)

## §1 — `contracts/enums.ts`

Open it. It's a list of string-literal arrays. The interesting parts are at the bottom.

```ts
export const TERMINAL_ITEM_SUCCESS: readonly ItemStatus[] = ['ANSWERED', 'GAP']
```

**`GAP` is grouped with `ANSWERED` as a success.** That one line encodes the product thesis. A
question the system refuses to answer has *succeeded*.

Note the pattern used throughout:

```ts
export const ITEM_STATUS = ['PENDING', 'IN_PROGRESS', ...] as const
export type ItemStatus = (typeof ITEM_STATUS)[number]
```

`as const` freezes the array into literal types, and the indexed access derives a union type from
it. One declaration gives you both a **runtime value** (iterable, validatable) and a
**compile-time type**. If they were separate you could drift.

**PREDICT:** why is `CANCELLED` in `TERMINAL_ITEM_STATUS` but in neither
`TERMINAL_ITEM_SUCCESS` nor `TERMINAL_ITEM_FAILURE`?

<details><summary>Answer</summary>

A cancelled item is finished but it neither succeeded nor failed — nobody made a claim about it.
Counting cancellations as failures would corrupt the failure-rate metric every time an operator
stops a run. Three categories, not two.
</details>

## §2 — `contracts/states.ts`

The key design move:

```ts
export const DOCUMENT_TRANSITIONS: TransitionMap<DocumentStatus> = {
  PENDING_UPLOAD: ['PARSING', 'FAILED'],
  PARSING:        ['SCREENING', 'FAILED'],
  SCREENING:      ['EMBEDDING', 'QUARANTINED', 'FAILED'],
  ...
}
```

**Transitions are data, not scattered `if` statements.** Consequences: the whole lifecycle is
visible in one place; illegal transitions are one assertion; and you can *test* the machine
without any infrastructure.

Look at `PARSING`. It can go to `SCREENING` — **not** to `EMBEDDING`. That's a security control
expressed in a data structure: untrusted text cannot reach a model before it has been screened.
The test asserts exactly that:

```ts
expect(canTransition(DOCUMENT_TRANSITIONS, 'PARSING', 'EMBEDDING')).toBe(false)
```

**PREDICT:** `QUARANTINED: ['EMBEDDING', 'FAILED']` — why can quarantine go to `EMBEDDING` but
not straight to `INDEXED`?

<details><summary>Answer</summary>

Releasing a quarantined document doesn't skip work — it re-enters the normal pipeline at
embedding, so contextualisation and indexing still happen. Allowing `QUARANTINED → INDEXED` would
imply a released document could become searchable without ever being embedded, which is
incoherent.
</details>

## §3 — `contracts/evidence.ts` (security-critical)

Two evidence kinds in one discriminated union:

```ts
export type Evidence = DocumentEvidence | LiveEvidence
```

**Why this exists:** the agent requires every claim to cite evidence. Originally citations were
typed as document chunks only — so a claim grounded in a live AWS Config check was *uncitable by
construction*. The rule and the type system contradicted each other. This union is the fix
(ADR-0006).

### The fence — `renderForContext`

```ts
return (
  `<evidence id="${citationId}" kind="DOCUMENT" doc="${escapeAttr(e.documentTitle)}" ` +
  `section="${escapeAttr(section)}"${page}>\n${escapeBody(e.quote)}\n</evidence>`
)
```

Two escapes, two different jobs:

- `escapeAttr` — `&`, `"`, `<` — stops a crafted *title* breaking out of an attribute
- `escapeBody` — `&`, `<` — stops crafted *document text* breaking out of the element

**`escapeBody` was missing.** It was a P1 review finding. A document containing a literal
`</evidence>` would terminate the element early, and everything after it would appear outside
the data channel where the model may read it as instruction.

Two details worth being able to explain:

1. **`&` is escaped first.** Otherwise input containing `&lt;` would survive as `&lt;` and could
   be decoded back into a live `<`. Order matters.
2. **`>` is deliberately *not* escaped.** A `>` with no `<` cannot form a tag, and leaving it
   keeps quoted policy text readable. Escaping is minimal-but-sufficient, not maximal.

### Staleness

```ts
export function isStale(e: Evidence, now: Date): boolean {
  if (e.kind !== 'LIVE_OBSERVATION') return false
  return now.getTime() >= Date.parse(e.staleAfter)
}
```

**Document evidence never goes stale; live evidence does.** A document chunk is pinned to an
immutable version — it says what it said. A live observation is a claim about a *moment*: "MFA was
enabled on 12 September." Rendering that later without its timestamp would be the same class of
misrepresentation the product exists to prevent.

**PREDICT:** why does `renderCitationLabel` always include `observedAt` for live evidence, even
when the observation is fresh?

<details><summary>Answer</summary>

Because a reader cannot tell fresh from stale by looking. If the date only appeared when stale,
its absence would be an implicit "this is current" claim the system never verified. Always showing
it makes the temporal nature of the evidence unavoidable.
</details>

---

# SESSION 4 — The chunker (90 min)

The hardest file. Read `blocks.ts` first, then `tokens.ts`, then `chunker.ts`.

## §4 — `chunking/blocks.ts` — parsing

`parseMarkdown` is a line-oriented state machine producing `Block[]`:

```ts
interface Block {
  text: string
  headingPath: readonly string[]   // ["Access Control Policy", "4. Authentication", "4.2 MFA"]
  page: number | null
  kind: 'heading' | 'paragraph' | 'list' | 'table' | 'code'
  depth: number
}
```

`headingPath` is the whole point. It's what makes a citation say *"Access Control Policy §4.2, p.11"*
rather than *"some chunk"*.

### The heading stack

```ts
headingStack.length = depth - 1     // truncate deeper levels
headingStack[depth - 1] = title     // set this level
```

Seeing `## D` after `### C` truncates the stack to length 1 then sets index 1 — so `C` is
correctly dropped. Two lines, and it's the whole hierarchy algorithm.

### The bug that was found here

```ts
const fallbackRoot = options.documentTitle ?? firstH1(body) ?? '(preamble)'
```

Real corpus documents open with a metadata block:

```markdown
> **Document ID:** NWS-IRP-004
> **Version:** 4.0

# Incident Response Plan
```

That blockquote sits **before the first heading**, so `headingStack` is empty and those blocks got
`headingPath: []`. An empty heading path means an **uncitable chunk**, and the spec calls a parser
that loses citation metadata a failed parser.

Found by running against the real corpus, not by unit tests — the fixtures all began with `#`.
Worth remembering: *your fixtures share your assumptions.*

## §5 — `chunking/chunker.ts` — the algorithm

Four stages:

```
Block[]  →  toSegments()     split to the smallest safe units
         →  groupBySection() group by heading path
         →  packSection()    combine to target size, add overlap
         →  DraftChunk[]     assign ordinals
```

### Stage 1 — `toSegments`

Boundary precedence, in order:

1. **Headings** — `if (block.kind === 'heading') continue`. Headings never become chunks; a
   heading alone is not evidence. It survives as `headingPath`.
2. **Clause markers** — `splitOnClauseMarkers` starts a new segment at any line matching
   `4.2` / `§3` / `AC-2` / `CC6.1`.
3. **Hard ceiling** — `enforceCeiling` splits anything still over 1000 tokens.

The clause regex is anchored at line start:

```ts
export const CLAUSE_RE = /^\s{0,3}(?:§\s?)?(?:\d+(?:\.\d+){0,3}|[A-Z]{2,3}-?\d+(?:\.\d+)?)[.)]?\s+\S/
```

**PREDICT:** why anchored, rather than matching anywhere in the line?

<details><summary>Answer</summary>

`"as described in section 4.2 above"` mentions a clause; it doesn't *start* one. Splitting there
would sever a sentence mid-flow. Anchoring encodes "a clause number at the start of a line is a
structural marker; elsewhere it's a cross-reference."
</details>

### Tables

```ts
const header = rows.slice(0, 2).join('\n')   // header + separator
```

An oversized table splits by row groups **with the header repeated**. A data row without its
header is unreadable — and the corpus has a planted difficulty (D5) where the Sev-1 RTO exists
*only* in a table, so this path is load-bearing, not defensive.

### Stage 3 — `packSection`, and the two bugs

```ts
if (buf.length > 0 && tokens + t > opts.targetMax) { /* start a new chunk */ }
```

Greedy packing to `targetMax` (800). Then the **hard floor** pass merges runts backwards:

```ts
for (let i = packed.length - 1; i > 0; i--) {
  if (cur.tokens < opts.hardFloor) { /* merge into predecessor */ }
}
```

Backwards because merging shifts indices; iterating forwards would skip elements.

#### Bug 1 — page attribution (review P2)

Was `page: first.page` — every chunk in a section got the *section's* first page. For a PDF
section spanning pages 10–12, a quote from page 12 would cite page 10. Now pages are tracked per
packed chunk.

Latent today (markdown yields `page: null`) but it would produce **confidently wrong citations**
the moment PDF parsing lands — the exact failure this product least tolerates.

#### Bug 2 — the overlap bug (the instructive one)

`overlapText` takes trailing sentences of the previous chunk, up to 15% of its size. The original:

```ts
if (tokens + t > budget && taken.length > 0) break   // ← the bug
```

That `taken.length > 0` exempts the **first** unit from the budget. Usually harmless — one
sentence rarely exceeds 15%.

But a markdown list has no sentence terminators, so `splitSentences` returns **the entire chunk as
one unit**. The exemption then takes all of it. "15% overlap" became **100% overlap**, doubling
every chunk: 998 → 1985 tokens.

Two lessons, and they're the ones worth carrying:

1. **The reviewer flagged the ceiling; the overlap was the same wrong assumption in a second
   place.** The assumption — *"text contains sentences"* — was the actual defect. When you fix a
   bug, ask where else the assumption lives.
2. **The symptom looked like the fix hadn't worked.** Chunks were still oversized after the
   ceiling fix, from an unrelated line. Debugging by printing the intermediate values found it in
   about a minute; guessing would not have.

**PREDICT:** why does `overlapText` fall back to line-splitting when sentence splitting yields
one oversized unit, rather than simply returning `''`?

<details><summary>Answer</summary>

Returning `''` would silently disable overlap for every list — a quiet quality regression that no
test would catch. Falling back to lines preserves the *intent* (some trailing context) under a
different text shape. Degrade the mechanism, not the guarantee.
</details>

---

# SESSION 5 — Screening, SQL, and the spike (75 min)

## §6 — `screening/injection.ts`

Ten weighted rules; score ≥ 10 → `FLAGGED`.

```ts
{ id: 'IJ-006',
  pattern: /\bregardless\s+of\s+(the\s+)?(evidence|documentation|...)/i,
  weight: 12 }
```

**The hard part is precision, not detection.** Compliance prose is wall-to-wall directives:

> "Administrators **shall** enable MFA."
> "Systems **must** be patched within 30 days."
> "You **must not** share credentials."

A naive imperative detector flags the entire corpus and quarantines everything. Useless.

The distinguishing signal isn't *that* text is directive — it's that the directive is aimed at
**whoever is processing the document**, about **how to answer**, rather than at a person operating
a control.

Eleven tests assert legitimate policy text is *not* flagged. Those tests are more important than
the ones asserting payloads *are* caught, because false positives are the failure mode that kills
the feature.

### Document-level quarantine

```ts
export function screenDocument(units) { ... }   // ANY unit flagged → whole version quarantined
```

**PREDICT:** why quarantine the whole document version rather than just the offending chunk?

<details><summary>Answer</summary>

Partial ingestion is worse than none. The surrounding legitimate clauses lend the document
credibility while the payload is merely displaced — and you'd have a document that is *partly*
indexed, which no reviewer can reason about. Quarantine is a statement about trust in the
document, and trust doesn't fragment by chunk.
</details>

## §7 — The SQL

### `001_init.sql` — the identity model

```sql
CREATE TABLE document          (document_id text PRIMARY KEY, ...)
CREATE TABLE document_version  (document_version_id text PRIMARY KEY,
                                document_id text REFERENCES document, ...)
CREATE TABLE chunk             (chunk_id text PRIMARY KEY,
                                document_version_id text REFERENCES document_version, ...)
```

Three levels: logical document → immutable version → immutable chunk. **A citation stores
`chunk_id`, which transitively pins the exact version.** That's ADR-0006 in schema form.

Keys are `text`, not `uuid` — a P1 review finding. The contract mandates prefixed ULIDs
(`doc_01H…`); those cannot go in a `uuid` column, so ingestion could not have persisted a
contracted ID at all. `CHECK` constraints recover the format validation:

```sql
CONSTRAINT chunk_id_fmt CHECK (chunk_id ~ '^chk_[0-9A-HJKMNP-TV-Z]{26}$')
```

That character class is **Crockford base32** — no `I`, `L`, `O`, `U`, because they're visually
confusable. The constraint immediately rejected two malformed spike IDs on the next run.

Notice this constraint:

```sql
CONSTRAINT document_version_quarantine_ck CHECK (
  status <> 'QUARANTINED' OR screening_reason IS NOT NULL)
```

*A quarantined version must carry a reason.* Silent quarantine is unreviewable. The database
refuses to store an unexplained one.

### `002_rls.sql`

A `DO` block loops five tables applying `ENABLE` + `FORCE` + a policy. Then:

```sql
CREATE OR REPLACE VIEW rls_coverage AS
SELECT c.relname, c.relrowsecurity, c.relforcerowsecurity, ...
WHERE ... EXISTS (SELECT 1 FROM pg_attribute WHERE attname = 'tenant_id')
```

The view queries `pg_class` for **every table with a `tenant_id` column** and reports whether RLS
is enabled *and* forced. A new tenant-scoped table shows up as non-compliant automatically. The
guard is structural, not a list someone must remember to update.

## §8 — The spike (`scripts/spikes/pgvector-filtered-search.mjs`)

**Read this one closely.** It's the most interview-relevant artifact in the repo, because it
demonstrates experimental method rather than just code.

The experiment: 60,000 chunks, caller permitted 2%, forbidden chunks packed *nearest* the query.
Three configurations — exact scan (ground truth), HNSW with `iterative_scan=off`, HNSW with
`relaxed_order`.

### Why it's adversarial by construction

```js
const alpha = permitted ? 0.55 : 0.9 - (i / TOTAL_CHUNKS) * 0.25
```

Permitted vectors are blended *less* toward the query, so they sit further away; forbidden ones
sit closer. This turns corpus difficulty D9 — *a restricted document is the best semantic match* —
into a benchmark.

### The method detail that saved the result

```js
async function planFor(client, args) {
  const { rows } = await client.query(`EXPLAIN (FORMAT JSON) ${FILTERED_SQL}`, args)
  if (plan.includes('chunk_embedding_hnsw')) return 'HNSW'
  ...
}
```

The first version didn't print the plan. At 20,000 rows it reported a clean all-clear — because
**the planner chose a bitmap scan and the HNSW index was never used.** The "experiment" had
measured nothing.

The tell was that every timing was suspiciously close to the exact scan. Adding `EXPLAIN` and
forcing the index revealed 0/10.

**This is the single most valuable thing in the repo to be able to narrate**: a measurement that
looked fine, a reason to doubt it, and a method change that turned a false negative into the
project's most important finding.

### On reading the results honestly

Case C shows `recall=0%` even though it returns 10/10 rows. The ADR states plainly that this is a
**fixture artifact**: all permitted vectors sit at the same blend distance, so ~1,200 candidates
are near-tied and the "true top 10" is arbitrary. The score evidence settles it — 0.7757 vs
0.7938 is 2.3% below optimum, i.e. *different but nearly as good*.

Being able to say "this number looks alarming and here's why it isn't, and here's what I'd fix in
the fixture" is worth more than a clean-looking result.

---

## Checkpoint

Explain aloud, without notes:

1. Why transitions are data rather than `if` statements, and one security property that buys.
2. Why `escapeBody` exists and why `&` is escaped before `<`.
3. The four stages of the chunker.
4. The overlap bug: mechanism, symptom, and the generalisable lesson.
5. Why screening precision matters more than screening recall.
6. Why `document_version` exists rather than a `version` column on `document`.
7. What the spike's first run got wrong and how it was caught.

Then go to [04-exercises.md](04-exercises.md) — where you prove it.
