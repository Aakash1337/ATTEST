# Spec 010 — Retrieval pipeline

**Status:** Partially implemented (S1 ingestion) · Derives from
[docs/03-retrieval-spec.md](../docs/03-retrieval-spec.md)

## Ingestion order — this order IS the security control
```
PARSING → SCREENING ─┬─ clean ──▶ EMBEDDING (augment → embed → index)
                     └─ flagged ─▶ QUARANTINED ──human release──▶ EMBEDDING
```
Screening precedes augmentation because augmentation sends chunk text to a model.
Screening afterwards would mean the first thing an injected instruction reaches is an LLM.

## Implemented (this PR)
- `parseMarkdown` → `Block[]` with heading path preserved; never emits an empty
  headingPath (an uncitable chunk is a failed parse, F-102)
- `chunkBlocks` — boundary precedence: heading → clause marker → list → paragraph.
  400-800 target, floor 100 (merge up), ceiling 1000 (split at sentence). 15% overlap,
  within a section only. Tables kept whole, or split with the header row repeated.
- `screenText` / `screenDocument` — injection detection, document-version quarantine

## Not yet implemented
Contextual augmentation, embedding, indexing, hybrid search, RRF, reranking, context
assembly. Query-side work is S2.

## Measured
Filtered approximate search under a 2% ACL set returns **zero** permitted rows without
`hnsw.iterative_scan`. See [ADR-0007](../docs/adr/0007-filtered-vector-search.md).
