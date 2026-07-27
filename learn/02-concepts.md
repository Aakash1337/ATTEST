# 02 — Concepts the code assumes you know

**75 minutes.** Background knowledge, each section ending with *why it matters in this repo*.
Skip a section only if you could already teach it.

---

## 1. RAG in one paragraph

A language model knows nothing about your company. **Retrieval-Augmented Generation** fixes that
by, per question: searching your documents for relevant passages, pasting them into the prompt,
and asking the model to answer *using only those passages*. The model supplies language and
reasoning; your corpus supplies facts.

Everything hard about RAG is in the word *relevant*. If retrieval hands the model the wrong
passages, a perfect model produces a confident wrong answer. **Retrieval quality is the ceiling
on system quality**, which is why retrieval gets its own eval tier and its own metrics here.

---

## 2. Embeddings and similarity

An **embedding** turns text into a fixed-length vector of numbers (1,024 here) such that texts
with similar *meaning* land near each other. "Do you protect data at rest?" and "Data is
encrypted when stored" have almost no words in common but sit close in embedding space.

Closeness is **cosine similarity** — the angle between two vectors, ignoring magnitude:

```
similarity = 1.0   identical direction
             0.0   unrelated
            -1.0   opposite
```

In pgvector, `<=>` is *cosine distance* (`1 - similarity`), so **smaller is better** and
`ORDER BY embedding <=> $query` gives nearest-first. You'll see this inversion in the SQL:

```sql
SELECT chunk_id, 1 - (embedding <=> $1) AS score   -- convert back to similarity
ORDER BY embedding <=> $1                          -- but order by distance
```

**Where embeddings fail:** exact identifiers. "CC6.1" and "CC7.2" are nearly identical strings
with unrelated meanings, and an embedding cannot reliably tell them apart. Compliance documents
are *full* of such identifiers. This single weakness is why hybrid search exists (§5).

> **In this repo:** `chunk.embedding vector(1024)`. Not yet generated — that needs Bedrock.
> The spike fabricates vectors deterministically so it can test the index without a model.

---

## 3. Vector indexes: exact vs approximate

**Exact search** compares the query to every row. Perfect recall, cost grows linearly. At 60,000
rows it took 72ms in our spike — genuinely fine.

**Approximate search (ANN)** trades a little accuracy for a lot of speed. **HNSW** —
Hierarchical Navigable Small World — is the standard choice and what pgvector uses.

### How HNSW works

Picture a multi-layer graph. The top layer is sparse with long-range links; lower layers are
denser and more local.

```
layer 2:   A ─────────────── F              sparse, long hops
layer 1:   A ─── C ─── D ─── F              medium
layer 0:   A ─ B ─ C ─ D ─ E ─ F ─ G        dense, every node
```

A search enters at the top, greedily hops toward the query, drops a layer, repeats. Like using
motorways to get near a city, then A-roads, then streets. You reach a *very good* answer fast,
without ever proving it's the best.

Three parameters:

| Parameter | When | Meaning |
|---|---|---|
| `m` | build | Links per node per layer. Higher = better recall, bigger index. We use 16 |
| `ef_construction` | build | Candidate list size while building. Higher = better graph, slower build. We use 64 |
| `ef_search` | **query** | Candidate list size while searching. **Higher = better recall, slower.** Tunable per query |

`ef_search` is the knob that matters at runtime. **A recall number reported without its
`ef_search` is not reproducible** — this is why the repo insists on recording it with every
metric.

> **In this repo:** `003_indexes.sql` builds the HNSW index; the spike sweeps `ef_search` across
> 40/100/400.

---

## 4. The filtered-search problem (the important one)

Combine §3 with a `WHERE` clause and something non-obvious happens.

The index knows about *vectors*. It does not know about your ACL predicate. So the scan walks the
graph collecting candidates, and the filter is applied to what it visited. If your caller may see
2% of the corpus, roughly 98% of everything visited gets discarded — and when the candidate list
is exhausted you return whatever survived. **Possibly nothing.**

```
ef_search = 40  →  visit ~40 nearest  →  filter  →  0 permitted  →  return 0 rows
```

Not "the wrong rows." **Zero rows**, while thousands of permitted relevant rows sit slightly
further out in the graph, never visited.

**The fix:** `hnsw.iterative_scan`. Instead of giving up when the candidate list is exhausted,
the scan continues pulling more candidates until it has enough that pass the filter.

| Value | Behaviour |
|---|---|
| `off` | Original behaviour — return short |
| `strict_order` | Keep scanning; results in exact distance order |
| `relaxed_order` | Keep scanning; results may be slightly out of order. Faster |

We use `relaxed_order`: a reranking stage will reorder the survivors anyway, so strict ordering
buys nothing.

**The planner twist.** Postgres might not use the HNSW index at all. With a highly selective
filter it may prefer a bitmap scan over the ACL index and then sort — which is *exact*, and
therefore fine. That's why our first spike run at 20,000 rows found no problem: **the index was
never used.** It only showed up once we forced the vector index and printed the chosen plan.

This makes the bug **latent** — invisible in small tests, appearing as the corpus grows.

> **In this repo:** measured in `scripts/spikes/pgvector-filtered-search.mjs`; conclusions in
> ADR-0007; `shortfallRate` is a permanently gated metric precisely because the failure is silent.

---

## 5. Full-text search and hybrid retrieval

Postgres full-text works on **lexemes** — words normalised for stemming and stop-words:

```sql
to_tsvector('english', 'Encryption is required for all backups')
-- 'backup':6 'encrypt':1 'requir':3
```

A GIN index over that column makes lookups fast. `ts_rank_cd` scores matches by term frequency
and proximity — the same family of ideas as BM25.

**Full-text is exactly strong where embeddings are weak**: exact tokens. "CC6.1" matches "CC6.1".

So run both and combine — **hybrid search**:

```
vector branch:     semantic similarity      good at paraphrase
full-text branch:  lexical match            good at identifiers, acronyms, clause numbers
```

### Reciprocal Rank Fusion

The two branches produce incomparable scores (cosine 0–1 vs `ts_rank_cd` unbounded). Normalising
them is fiddly and fragile. RRF sidesteps it by using **ranks only**:

```
RRF(doc) = Σ over branches  1 / (k + rank_in_that_branch)      k = 60
```

A document ranked 1st in one branch and 8th in the other scores
`1/61 + 1/68 ≈ 0.0311`. A document ranked 3rd in both scores `2/63 ≈ 0.0317` — slightly higher.
That's the intent: **agreement across different retrieval methods is a stronger signal than
excellence in one.**

`k = 60` is conventional; it damps the difference between top ranks so one branch can't dominate.

> **In this repo:** specified in [docs/03-retrieval-spec.md §2.2](../docs/03-retrieval-spec.md),
> **not yet implemented** — that's S2 work.

---

## 6. Chunking, and why it's the whole ballgame

You cannot embed a 40-page policy as one vector — the meaning averages into mush and you couldn't
cite a specific clause anyway. So documents are split into **chunks**, each embedded and indexed
separately.

Chunking decides what retrieval *can* return. It is upstream of everything.

**Fixed-size chunking** (every 500 characters) is the naive approach and it is bad here:

```
chunk 41: "...and approved by the CISO. 4.2 Multi-Factor Authentication is required for all"
chunk 42: "administrative accounts, reviewed annually."
```

Neither chunk is answerable. Chunk 42 lost the clause number and the subject; chunk 41 is cut
mid-sentence. Cite either and an auditor sees nonsense.

**Structure-aware chunking** splits on meaning boundaries — headings, clause numbers, list items,
paragraphs — so a chunk is a *unit of argument* rather than a unit of length.

Three constraints in tension:
- **Too small** → no context, poor embeddings, fragmentary citations
- **Too large** → diluted embedding, wasted context budget, imprecise citations
- **Overlap** helps a chunk boundary not sever an idea, but costs storage and can duplicate results

Targets here: 400–800 tokens, hard floor 100 (merge up), hard ceiling 1000 (split at sentence),
15% overlap **within a section only**.

That last constraint matters: overlapping across a section boundary would bleed the tail of one
policy clause into an unrelated one — and then a citation quotes the wrong control.

> **In this repo:** `packages/core/src/chunking/chunker.ts`. Session 4 is entirely about this file.

---

## 7. Tokens

Models don't see characters, they see **tokens** — subword units. "encryption" might be one
token; "MFA" might be two. Roughly **4 characters ≈ 1 token** for English prose.

Tokens matter because they're the unit of cost, of context limits, and of chunk sizing.

**A critical distinction this repo makes explicit:** `estimateTokens` is a *heuristic* (length ÷ 4),
not a real tokenizer. That's fine for deciding chunk boundaries — a chunk 15% off target still
retrieves fine. It is **not** acceptable for budget enforcement, where undercounting means
overspending real money. The agent loop must charge *provider-reported* usage.

The code says so in a comment. Being able to articulate that distinction is the kind of thing
that separates careful engineers from careless ones.

---

## 8. Multi-tenancy, ACLs, and Postgres RLS

**Tenant** = customer. **ACL tags** = which documents within a tenant a caller may see.

Tags are a Postgres array, and `&&` is the **array overlap** operator:

```sql
acl_tags && ARRAY['internal','public']   -- true if ANY tag is shared
```

So a caller carrying `['internal']` sees chunks tagged `internal`, and never those tagged only
`restricted`.

### Row-level security

RLS makes the *database* enforce the rule, independently of application code:

```sql
ALTER TABLE chunk ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunk FORCE  ROW LEVEL SECURITY;
CREATE POLICY chunk_tenant_isolation ON chunk
  USING (tenant_id = current_setting('attest.tenant_id', true));
```

Three things worth understanding precisely:

1. **`ENABLE` vs `FORCE`.** `ENABLE` applies policies to normal users but **the table owner
   bypasses them** — and in a simple deployment your application role often *is* the owner. Without
   `FORCE`, RLS can look enabled and do nothing. This distinction is why
   `check-rls-coverage.mjs` exists.

2. **`current_setting('attest.tenant_id', true)`** reads a per-transaction session variable. The
   `true` means "don't error if unset" — it returns `NULL` instead.

3. **It fails closed.** If the variable is unset, the comparison is `tenant_id = NULL`, which
   evaluates to `NULL`, which is not `TRUE`, so **no rows match**. Forgetting to set the tenant
   yields an empty result, never a leak. That's the right direction to fail.

**RLS is defence in depth, not the primary control.** The primary control is the in-query
predicate. RLS catches the query that forgets it.

> **In this repo:** `002_rls.sql`, applied to all five tenant-scoped tables, with an
> `rls_coverage` view so a newly added table cannot silently opt out.

---

## 9. Grounding, faithfulness, abstention

- **Grounded** — every claim traceable to supplied evidence
- **Faithful** — the answer doesn't contradict or overstate that evidence
- **Hallucination** — fluent, plausible, unsupported
- **Abstention** — declining to answer when evidence is insufficient

Most RAG systems treat abstention as failure. Here it's the **highest-weighted metric**, because
in this domain a confident wrong answer is a legal liability and "we cannot substantiate this" is
genuinely valuable output.

The mechanism: a guardrail scores whether the draft is supported by the supplied passages. Above
threshold → emit with citations. Below → discard the draft entirely and emit a `GAP` describing
what's missing. Note *discard*, not "show with a warning."

---

## 10. Prompt injection through the corpus

The attack most RAG systems ignore. Your retrieved passages go into the model's context. If an
attacker controls a document, they control part of the prompt.

The structural defence is **role separation**: evidence goes into a fenced data channel, never
into the system prompt, and the system prompt states that fenced content is source material and
never instruction.

```
<evidence id="C3" doc="Access Control Policy" section="4.2 MFA" page="11">
MFA is required for all administrative accounts.
</evidence>
```

**And the fence must defend itself.** If a document contains a literal `</evidence>`, naive
interpolation ends the element early and the attacker's text appears *outside* the data channel —
where the model may read it as instruction. That was a real P1 bug in this repo, caught in review:
attributes were escaped, the body was not.

> **In this repo:** `renderForContext` in `evidence.ts`, and five tests covering forged closers,
> forged openers, and pre-encoded entities.

---

## Checkpoint

Without looking:

1. Why do embeddings struggle with "CC6.1", and what fixes it?
2. What does `ef_search` control, and why must it be recorded with any recall number?
3. Explain how a filtered HNSW search can return zero rows when thousands qualify.
4. Why does RRF use ranks instead of scores?
5. What's the difference between `ENABLE` and `FORCE` row level security, and why does it matter here?
6. Why is a token *estimate* acceptable for chunking but not for budget enforcement?

Then start [03-code-tour.md](03-code-tour.md).
