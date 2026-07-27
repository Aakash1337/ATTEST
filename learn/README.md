# Learning ATTEST — start here

You are about to learn a codebase you did not write, well enough to defend every line of it
under questioning. This directory is the path.

---

## The honest state of things

| What | Size | How to treat it |
|---|---:|---|
| Domain logic (`packages/core`) | ~1,090 lines TS | **Read every line.** This is what you'll be asked about |
| SQL (`packages/adapters/migrations`) | 207 lines | **Read every line.** Small and load-bearing |
| Scripts (spike + CI guards) | 587 lines | Read the spike closely; skim the guards |
| Tests | 854 lines | **Read these second.** They encode the requirements |
| Docs (`docs/`) | 5,362 lines | **Reference. Do not read front-to-back** |

The imbalance is deliberate — the plan was written before the code — but it creates a trap:
it is easy to absorb the vocabulary from the docs and *feel* fluent while being unable to
explain how a single function works. Interviewers find that gap in about ninety seconds.

**So: code first, docs as lookup.**

---

## What you're actually learning

Three separate things, and it helps to keep them separate:

1. **Domain knowledge** — security questionnaires, evidence, citations, abstention. You already
   have this. It is why the project was chosen.
2. **General technique** — embeddings, HNSW, hybrid search, row-level security, chunking. Mostly
   new. Covered in [02-concepts.md](02-concepts.md).
3. **This system's specific decisions** — why filtering goes inside the SQL, why evidence is
   immutable, why screening runs before embedding. Covered in [01-the-thesis.md](01-the-thesis.md)
   and the code tour.

Most of the "extreme understanding" you want is category 3. Category 2 is the prerequisite
that makes category 3 make sense.

---

## The path

Six sessions, roughly 7 hours total. Do them in order. Each ends with a checkpoint you should
be able to pass before moving on.

| # | Session | Time | Doc |
|---|---|---|---|
| 1 | The thesis — what problem, and the six ideas everything derives from | 45 min | [01-the-thesis.md](01-the-thesis.md) |
| 2 | Concepts — the background the code assumes you have | 75 min | [02-concepts.md](02-concepts.md) |
| 3 | Code tour part 1 — contracts (the vocabulary of the system) | 60 min | [03-code-tour.md](03-code-tour.md) §1–3 |
| 4 | Code tour part 2 — the chunker (the hardest file) | 90 min | [03-code-tour.md](03-code-tour.md) §4–5 |
| 5 | Code tour part 3 — screening, SQL, and the spike | 75 min | [03-code-tour.md](03-code-tour.md) §6–8 |
| 6 | Break it — exercises that prove you understand | 90 min | [04-exercises.md](04-exercises.md) |
| — | Then, repeatedly: explain it back | ongoing | [05-explain-it-back.md](05-explain-it-back.md) |

**Do not skip session 6.** It is where understanding actually forms. Sessions 1–5 are
preparation for it.

---

## How to read code you didn't write

A method, since this is the core skill:

1. **Run it first.** `npm test` before reading anything. Watching 118 tests pass in under a
   second tells you the shape of the thing.
2. **Read the test before the implementation.** A test says *what it must do*. The
   implementation says *how*. What comes first.
3. **Read top-to-bottom once without stopping.** Do not chase every unfamiliar thing. Get the
   shape.
4. **Second pass: stop at every "why is it like this?"** Those are the real questions. Most are
   answered in a comment or an ADR. If not, that is a gap worth flagging.
5. **Change something and predict the failure before running.** If your prediction is wrong,
   you have found the boundary of your understanding — which is exactly what you're looking for.

Step 5 is the one people skip and the one that works.

---

## Ground rules while learning

- **Predict, then run.** Always. Writing the prediction down is better than thinking it.
- **When a doc and the code disagree, the code is what runs** — but [docs/14-contracts.md](../docs/14-contracts.md)
  is *normative*, so a disagreement there is a bug to be fixed, not a fact to be memorised.
  You will find one such case in the exercises.
- **Keep a "don't understand yet" list.** Do not let it block you. Review it at the end of each
  session; most entries resolve themselves.
- **Note what you'd have done differently.** This is not a criticism exercise — it is how you
  end up with opinions, which is what "understanding" actually means in an interview.

---

## A caution about ownership

You did not write this code. That's a fact, and it is entirely normal for a project built with
an AI assistant — but it has a consequence: **you must not describe it as though you typed it.**

The defensible position, and it is a strong one:

> "I specified it, I reviewed every line, I found the bugs in review, and I can tell you why
> each decision was made and what I'd change."

That claim is only true once you've done this course. It is completely true afterwards, and it
is a *better* story than "I wrote it by hand," because AI-assisted engineering with real review
discipline is what the industry is actually moving toward — and most candidates cannot describe
their review process at all.

[docs/12-engineering-practices.md §6](../docs/12-engineering-practices.md) has the workflow.
[05-explain-it-back.md](05-explain-it-back.md) has the honest framing for interviews.

---

## Session 0 — do this now, before session 1

```bash
npm install && npm test
```

You should see **118 tests pass in under a second**. Then:

```bash
npm run ci:checks
```

Three static checks pass. Then open these four files and just *look* at them — don't study
them yet, get a sense of size and shape:

- `packages/core/src/contracts/enums.ts`
- `packages/core/src/chunking/chunker.ts`
- `packages/core/src/screening/injection.ts`
- `packages/adapters/migrations/001_init.sql`

That is most of the system. It is smaller than you expect. Now start
[01-the-thesis.md](01-the-thesis.md).
