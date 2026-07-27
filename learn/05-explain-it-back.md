# 05 — Explain it back

Retrieval practice. Reading creates recognition ("yes, I've seen that"); *producing* an
explanation creates understanding. Use this repeatedly, not once.

---

## How to use it

Cover the answers. Speak your response **out loud** — writing lets you skip the connective
tissue that speaking forces you to supply. Then compare.

Grade yourself honestly on three levels:

| Level | You can… |
|---|---|
| **Recall** | State what the code does |
| **Mechanism** | Explain *how*, and trace the data |
| **Judgement** | Explain why *this* way, what was rejected, and what you'd change |

Interviews probe level 3. Levels 1–2 are table stakes.

---

## Tier 1 — The 60-second pitch

Practise until fluent. This is the most-used artifact you have.

> "It answers vendor security questionnaires from a company's own policy corpus. The interesting
> part isn't the answering — it's that it refuses to answer when the evidence isn't there, and I
> can prove the refusal rate.
>
> Every claim carries a citation to a specific clause in a specific document *version*, so an
> auditor can check it. When the evidence doesn't support an answer, it emits a structured gap
> saying what's missing — which is the list a security team actually wants.
>
> It's multi-tenant with document-level ACLs, and the permission filter runs inside the SQL rather
> than on the results, because post-filtering is both a leak risk and a silent recall regression."

Then stop. Let them pick the thread.

**Common follow-ups and your one-line hooks:**

| They ask | You open with |
|---|---|
| "Why is abstention hard?" | "Because the model always *can* produce something fluent. You need a scoring step whose output is control flow, not a log line." |
| "How do you know it works?" | "Three retrieval suites with different metrics, because no-answer questions can't be scored with recall." |
| "What was the hardest bug?" | "A permission filter that silently returned zero rows." *(then Tier 3 Q1)* |

---

## Tier 2 — Mechanism

**Q1. Walk me from a markdown file to an indexed chunk.**

<details><summary>Answer</summary>

`parseMarkdown` produces `Block[]` — text plus heading path, page, and kind — maintaining a
heading stack so every block knows its position in the hierarchy.

`chunkBlocks` runs four stages: `toSegments` splits on boundary precedence (headings, then clause
markers like `4.2` or `CC6.1`, then the hard ceiling); `groupBySection` groups by heading path;
`packSection` greedily packs to ~800 tokens, merges runts upward, and prepends 15% overlap from
the previous chunk *in the same section*; then ordinals are assigned.

Then screening runs — **before** contextual augmentation and embedding, because augmentation sends
text to a model and screening after that point would mean an injected instruction already reached
one.

Embedding and indexing aren't built yet. That's the honest boundary of what exists.
</details>

**Q2. Why is `packages/core` forbidden from importing AWS?**

<details><summary>Answer</summary>

So the interesting logic is testable without infrastructure. 118 tests run in under a second with
no mocks, which is what makes retrieval iteration possible at all — you can't run a hundred
chunking experiments if each needs a deployed stack.

It's enforced by `check-core-no-aws.mjs` because it produces no immediate symptom when violated.
Nothing breaks the day you add the import; it breaks months later when core tests need mocks and
take a minute. Architectural constraints without mechanical enforcement decay.
</details>

**Q3. What happens when a policy document is updated?**

<details><summary>Answer</summary>

A new immutable `document_version` row is created with its own chunks. In one transaction the old
version is marked `SUPERSEDED`, its chunks get `active = false`, and `document.current_version_id`
is repointed — so retrieval never sees a half-indexed document or a mix of versions.

The important part is the asymmetry: **retrieval filters `active = true`; citation resolution
ignores `active` entirely.** Retrieval must never answer from a superseded policy — that's the
staleness failure. But a citation from six months ago must still resolve to the exact text that
was in context then, or every historical answer becomes unverifiable the moment you update a
document.

Two code paths, two rules, deliberately not shared.
</details>

**Q4. How does injection screening avoid flagging the whole corpus?**

<details><summary>Answer</summary>

That's the actual engineering problem. Compliance prose is wall-to-wall directives — "shall
enable", "must be patched", "you must not share credentials." A naive imperative detector
quarantines everything.

The distinguishing signal isn't that text is directive. It's that the directive targets *whoever
is processing the document*, about *how to answer*, rather than a person operating a control.
Rules are narrow and weighted; eleven tests assert legitimate policy text is not flagged.

The threshold is 10 and it's not arbitrary — one real incident-response sentence, "responders
should always state the severity tier," scores 8. There's a genuinely narrow band between the
weakest true positive and the strongest false positive.

And it's explicitly defence in depth, not the primary control. Heuristics get evaded. Role
separation, fence escaping, schema validation, the deterministic citation check, and the grounding
check all sit in front of it.
</details>

**Q5. Why three retrieval eval suites instead of one?**

<details><summary>Answer</summary>

Because different question types can't share metrics.

Relevance queries have gold chunks — recall@k, MRR, nDCG work. No-answer queries have **no** gold
chunks, so recall is mathematically undefined; scoring them that way produces a number that means
nothing. They get rejection metrics instead: does the top result fall below a usability bar.

Isolation queries need caller identity, permitted gold IDs, *and* forbidden IDs, so we can measure
authorised recall and leakage separately — plus `shortfallRate`, which catches the filtered-search
failure.

The v1 design had all three in one suite. It was a real methodological error, caught in review.
</details>

---

## Tier 3 — Judgement (where interviews are won)

**Q1. Tell me about a bug you're proud of finding.** ★ *Your strongest story.*

<details><summary>Answer</summary>

Structure it as: setup → false result → the doubt → the method fix → the finding → the meta-lesson.

"The security model depends on filtering by tenant and ACL inside the SQL. I wanted to verify that
under a restrictive filter, so I built a spike: 60,000 chunks, caller permitted 2%, forbidden
chunks deliberately placed *nearest* the query.

First run came back clean. Every configuration returned 10 of 10 rows at 100% recall.

But the timings bothered me — every HNSW configuration was within a few milliseconds of the exact
scan, which shouldn't happen if the index were doing anything. So I added `EXPLAIN` output to
print the chosen plan. The planner had been picking a **bitmap scan** the whole time. The index
was never used. The experiment had measured nothing.

Once I forced the vector index: **zero of ten rows.** Not fewer — zero. And raising `ef_search`
tenfold didn't help. `hnsw.iterative_scan = relaxed_order` fixed it at about 2.2× latency.

The severe part is that the failure is *silent*. Retrieval returns nothing, the agent correctly
abstains, nothing errors. A security control would have been causing wrong answers while appearing
to work. And because the planner only chooses HNSW as the corpus grows, it's **latent** — invisible
in small tests, appearing in production.

Two lessons. First: a measurement you can't explain is a measurement you don't have — the
suspicious timing was the whole tell. Second: it's why `shortfallRate` is a permanent CI gate
rather than a one-off check."
</details>

**Q2. You used an AI assistant heavily. What did you actually do?** ★ *Increasingly common.*

<details><summary>Answer</summary>

Be specific and calibrated. Vagueness reads as evasion; enthusiasm reads as naivety.

"I wrote the specs and the contracts document, reviewed every line, and ran the reviews. The
assistant wrote most of the implementation from those specs.

Concretely, review caught things generation didn't. Two P1s: the schema used `uuid` columns while
the contract mandated prefixed ULIDs — those IDs literally could not have been inserted, and the
spike had masked it by seeding raw UUIDs. And the evidence fence escaped attributes but not the
body, so a document containing a literal `</evidence>` could break out of the data channel. That's
the exact boundary the threat model claims to hold.

I also found a case where fixing a reported bug wasn't enough — the reviewer flagged an oversized-
list issue, and the same wrong assumption ('text contains sentences') was in a second function
where it had turned 15% overlap into 100% overlap, silently doubling every chunk.

Where it was weakest: anything requiring a *measurement* rather than a pattern. The first version
of my experiment produced a confident false negative because it never checked which query plan ran.
Plausible code, plausible output, wrong conclusion. That's the failure mode to watch for — it
doesn't look like a bug."
</details>

**Q3. What's the weakest part of this system?** ★ *The calibration question.*

<details><summary>Answer</summary>

Have a real answer. Deflecting here is worse than the weakness.

Pick one and go deep:

- **"Most of it isn't built yet."** Ingestion logic, contracts, schema and guards exist. Retrieval
  queries, embedding, the agent loop, the API — not yet. Nothing is deployed. I'd rather say that
  precisely than imply a working product.
- **"The golden set has a structural bias."** Labelling only what current retrieval surfaced makes
  gold chunks it never returns invisible, which inflates recall. Mitigations are specified — label
  a fraction against different configurations, hand-pick hard cases — but it's a known limitation
  I'd state in any report rather than hide.
- **"Token counting is a heuristic."** Length ÷ 4. Fine for chunk boundaries; explicitly not
  usable for budget enforcement, where undercounting means overspending. The comment says so, and
  the agent loop is specified to charge provider-reported usage instead.
- **"The spike fixture is flawed."** All permitted vectors sit at the same distance, so ~1,200
  candidates are near-tied and exact-ID recall reads 0% even when the mitigation works. The score
  evidence shows it's 2.3% off optimum — different but nearly as good. I documented it rather than
  quietly reporting the flattering number.
</details>

**Q4. Why not use Bedrock Knowledge Bases and save six weeks?**

<details><summary>Answer</summary>

"I evaluated it and declined it, and the reasoning is in an ADR.

Three of the project's load-bearing claims become unprovable under a managed service. 'Filtering
happens inside the query, not after' — unverifiable inside a black box. 'Contextual augmentation
produced the largest single recall gain' — requires controlling the pre-embedding step. 'Here's
hybrid fusion measured against vector-only' — requires being able to switch a branch off.

Each of those has a test or a measurement attached. Delegating the component that produces them
leaves the claims unsupported.

If the goal were shipping fastest, Knowledge Bases is the right answer and I'd say so."
</details>

**Q5. What would you change if you started again?**

<details><summary>Answer</summary>

Form your own view. Defensible candidates:

- **Less planning up front.** 5,400 lines of docs before any code. It caught real design errors
  early — the evidence identity bug was found on paper — but the first delivery plan was
  arithmetically impossible (190 hours against a 196-hour budget with six hours of slack) and
  needed a full rebaseline after review. Some of that would have surfaced faster by building.
- **The spike should have come first.** The filtered-search result affects the vector store
  choice. Running it in week one was right; it should probably have run before ADR-0001 was
  written rather than after.
- **Test fixtures against real input sooner.** The empty-`headingPath` bug existed because every
  fixture started with `#` and the real corpus didn't. Tests written alongside code inherit its
  blind spots.
</details>

---

## Tier 4 — Questions you should be able to ask *them*

Understanding shows in questions as much as answers.

- "How do you evaluate retrieval separately from generation, or do you measure end-to-end?"
- "What's your abstention story — does your system decline, and do you measure how often it
  should have?"
- "How do you handle permission filtering in vector search? Do you filter in-query or post-filter?"
  *(You now know why this is a sharp question.)*
- "Have you hit approximate-search recall problems under selective filters?"
- "What does your golden set look like, and who labels it?"

---

## The traps

**Do not claim you hand-wrote it.** It won't survive follow-up, and it's a weaker story than the
truth. "I specified it, reviewed every line, and found these two P1s in review" is stronger than
"I typed it."

**Do not oversell completeness.** "Ingestion and the contracts are built and tested; retrieval and
the agent loop are specified but not written; nothing is deployed" — precision reads as
trustworthy. Vagueness invites probing.

**Do not defend a decision you can't justify.** "I don't have a strong reason — it was the
default" is a fine answer. Inventing rationale post-hoc is transparent.

**Do not lead with the tech stack.** Lead with the constraint that made the problem hard. Bedrock
and pgvector are implementation details; "a hallucinated compliance answer is a legal
misrepresentation" is the reason any of it exists.

---

## Fluency checklist

You're ready when you can, cold and without notes:

- [ ] Give the 60-second pitch
- [ ] Explain why post-filtering is two bugs, not one
- [ ] Explain the zero-rows finding *including* why the first run said everything was fine
- [ ] Explain the retrieval/citation `active` asymmetry and why both rules are needed
- [ ] Trace markdown → chunk through all four stages
- [ ] Explain why screening precision matters more than recall, with the threshold-8 example
- [ ] Explain why no-answer questions can't be scored with recall
- [ ] Name three things not built, and one thing you'd design differently
- [ ] Describe your AI-assisted workflow, including where it failed
- [ ] Name the weakest part of the system without being asked twice
