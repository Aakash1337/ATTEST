/**
 * Token estimation.
 *
 * HONEST LIMITATION: this is a heuristic, not a tokenizer. Real token counts come from
 * the model provider and differ per model family. Chunk-size targets in
 * docs/03-retrieval-spec.md §1.2 are expressed in tokens, so every chunk boundary
 * decision inherits this approximation's error (roughly ±15% on English prose).
 *
 * That is acceptable for BOUNDARY decisions — a chunk 15% off target still retrieves
 * fine. It is NOT acceptable for BUDGET enforcement, where undercounting means
 * overspending. The agent loop must charge actual usage reported by the provider, never
 * this estimate (docs/04-agent-spec.md §2.1).
 *
 * The interface is injectable so a real tokenizer can replace it without touching the
 * chunker.
 */

export type TokenCounter = (text: string) => number

/** ~4 characters per token for English prose; whitespace runs collapsed first. */
export const estimateTokens: TokenCounter = (text: string): number => {
  const normalised = text.replace(/\s+/g, ' ').trim()
  if (normalised.length === 0) return 0
  return Math.max(1, Math.ceil(normalised.length / 4))
}

/** Sentinel standing in for a dot that must not be treated as a sentence terminator. */
const DOT = ''

const ABBREVIATIONS =
  /\b(e\.g|i\.e|etc|vs|approx|Inc|Ltd|Corp|Dr|Mr|Ms|No|Fig|Sec|Art|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\./gi

/**
 * Split into sentences without breaking on abbreviations or on decimal clause numbers
 * ("4.2 The policy shall…"), which are dense in compliance prose and are exactly where
 * a naive splitter fails.
 */
export function splitSentences(text: string): string[] {
  const masked = text
    .replace(/(\d)\.(\d)/g, `$1${DOT}$2`) // 4.2, CC6.1, CVSS 7.5
    .replace(ABBREVIATIONS, `$1${DOT}`)

  const parts = masked
    .split(/(?<=[.!?])[ \t]+(?=[A-Z(\[])/)
    .map((s) => s.split(DOT).join('.').trim())
    .filter((s) => s.length > 0)

  if (parts.length > 0) return parts
  const whole = text.trim()
  return whole.length > 0 ? [whole] : []
}
