/**
 * Structure-aware chunking. docs/03-retrieval-spec.md §1.2.
 *
 * Split on semantic boundaries, never on a fixed character count.
 *
 * Boundary precedence:
 *   1. Heading changes at any level
 *   2. Numbered clause markers (4.2, AC-2, CC6.1, §3)
 *   3. List-item groups
 *   4. Paragraph boundaries (last resort)
 *
 * Why this matters more than it looks: compliance documents are dense with clause
 * identifiers, and a chunk that severs "4.2 MFA is required for..." from its clause
 * number becomes uncitable.
 */

import type { Block } from './blocks.js'
import { looksLikeClauseStart } from './blocks.js'
import { estimateTokens, splitSentences, type TokenCounter } from './tokens.js'

export interface ChunkerOptions {
  readonly targetMin: number
  readonly targetMax: number
  /** Below this, merge upward into the previous chunk of the same section. */
  readonly hardFloor: number
  /** Above this, split at the nearest sentence boundary. */
  readonly hardCeiling: number
  /** Fraction of the previous chunk repeated as lead-in, within the same section. */
  readonly overlapRatio: number
  readonly countTokens: TokenCounter
}

export const DEFAULT_CHUNKER_OPTIONS: ChunkerOptions = {
  targetMin: 400,
  targetMax: 800,
  hardFloor: 100,
  hardCeiling: 1000,
  overlapRatio: 0.15,
  countTokens: estimateTokens,
}

export interface DraftChunk {
  readonly text: string
  readonly headingPath: readonly string[]
  readonly page: number | null
  readonly tokenCount: number
  readonly ordinal: number
  /** True when a preceding-context overlap was prepended. */
  readonly hasOverlap: boolean
  readonly kinds: readonly Block['kind'][]
}

interface Segment {
  text: string
  headingPath: readonly string[]
  page: number | null
  kind: Block['kind']
  /** Segments with different sectionKey values never share a chunk. */
  sectionKey: string
}

export function chunkBlocks(
  blocks: readonly Block[],
  options: Partial<ChunkerOptions> = {},
): DraftChunk[] {
  const opts = { ...DEFAULT_CHUNKER_OPTIONS, ...options }
  const segments = toSegments(blocks, opts)
  const grouped = groupBySection(segments)

  const out: DraftChunk[] = []
  for (const group of grouped) {
    packSection(group, opts, out)
  }
  return out.map((c, i) => ({ ...c, ordinal: i }))
}

/**
 * Flatten blocks into segments, applying boundary precedence 1-3 and the hard ceiling.
 * Headings are not emitted as standalone segments — a heading alone is not evidence.
 * They contribute the sectionKey and are carried on headingPath instead.
 */
function toSegments(blocks: readonly Block[], opts: ChunkerOptions): Segment[] {
  const segments: Segment[] = []

  for (const block of blocks) {
    if (block.kind === 'heading') continue
    const sectionKey = block.headingPath.join(' > ')

    if (block.kind === 'table') {
      for (const piece of splitTable(block, opts)) {
        segments.push({ ...piece, sectionKey })
      }
      continue
    }

    // Precedence 2: a clause marker starts a new segment even mid-block.
    for (const piece of splitOnClauseMarkers(block.text)) {
      for (const bounded of enforceCeiling(piece, opts)) {
        segments.push({
          text: bounded,
          headingPath: block.headingPath,
          page: block.page,
          kind: block.kind,
          sectionKey,
        })
      }
    }
  }

  return segments.filter((s) => s.text.trim().length > 0)
}

function splitOnClauseMarkers(text: string): string[] {
  const lines = text.split('\n')
  const out: string[] = []
  let buf: string[] = []

  for (const line of lines) {
    if (buf.length > 0 && looksLikeClauseStart(line)) {
      out.push(buf.join('\n').trim())
      buf = [line]
    } else {
      buf.push(line)
    }
  }
  if (buf.length) out.push(buf.join('\n').trim())
  return out.filter((s) => s.length > 0)
}

/** Hard ceiling: split at the nearest sentence boundary. Never mid-sentence. */
function enforceCeiling(text: string, opts: ChunkerOptions): string[] {
  if (opts.countTokens(text) <= opts.hardCeiling) return [text]

  const sentences = splitSentences(text)
  const out: string[] = []
  let buf: string[] = []
  let tokens = 0

  for (const sentence of sentences) {
    const t = opts.countTokens(sentence)
    if (buf.length > 0 && tokens + t > opts.hardCeiling) {
      out.push(buf.join(' '))
      buf = [sentence]
      tokens = t
    } else {
      buf.push(sentence)
      tokens += t
    }
  }
  if (buf.length) out.push(buf.join(' '))
  return out
}

/**
 * Tables stay whole if under the ceiling; otherwise split by row groups with the
 * header row repeated, because a data row without its header is unreadable.
 */
function splitTable(block: Block, opts: ChunkerOptions): Omit<Segment, 'sectionKey'>[] {
  const base = { headingPath: block.headingPath, page: block.page, kind: 'table' as const }
  if (opts.countTokens(block.text) <= opts.hardCeiling) {
    return [{ ...base, text: block.text }]
  }

  const rows = block.text.split('\n')
  const header = rows.slice(0, 2).join('\n') // header + separator
  const body = rows.slice(2)
  const headerTokens = opts.countTokens(header)

  const out: Omit<Segment, 'sectionKey'>[] = []
  let buf: string[] = []
  let tokens = headerTokens

  for (const row of body) {
    const t = opts.countTokens(row)
    if (buf.length > 0 && tokens + t > opts.hardCeiling) {
      out.push({ ...base, text: [header, ...buf].join('\n') })
      buf = [row]
      tokens = headerTokens + t
    } else {
      buf.push(row)
      tokens += t
    }
  }
  if (buf.length) out.push({ ...base, text: [header, ...buf].join('\n') })
  return out
}

function groupBySection(segments: readonly Segment[]): Segment[][] {
  const groups: Segment[][] = []
  let current: Segment[] = []
  let key: string | null = null

  for (const s of segments) {
    if (key !== null && s.sectionKey !== key) {
      if (current.length) groups.push(current)
      current = []
    }
    key = s.sectionKey
    current.push(s)
  }
  if (current.length) groups.push(current)
  return groups
}

/**
 * Pack one section's segments into chunks, then apply the floor and the overlap.
 * Overlap is applied only WITHIN a section — bleeding the tail of one policy clause
 * into an unrelated one is how a citation ends up quoting the wrong control.
 */
function packSection(
  segments: readonly Segment[],
  opts: ChunkerOptions,
  out: DraftChunk[],
): void {
  if (segments.length === 0) return

  const packed: { texts: string[]; kinds: Block['kind'][]; tokens: number }[] = []
  let buf: string[] = []
  let kinds: Block['kind'][] = []
  let tokens = 0

  for (const s of segments) {
    const t = opts.countTokens(s.text)
    if (buf.length > 0 && tokens + t > opts.targetMax) {
      packed.push({ texts: buf, kinds, tokens })
      buf = []
      kinds = []
      tokens = 0
    }
    buf.push(s.text)
    kinds.push(s.kind)
    tokens += t
  }
  if (buf.length) packed.push({ texts: buf, kinds, tokens })

  // Hard floor: merge a runt upward into its predecessor within the same section.
  for (let i = packed.length - 1; i > 0; i--) {
    const cur = packed[i]
    const prev = packed[i - 1]
    if (!cur || !prev) continue
    if (cur.tokens < opts.hardFloor) {
      prev.texts.push(...cur.texts)
      prev.kinds.push(...cur.kinds)
      prev.tokens += cur.tokens
      packed.splice(i, 1)
    }
  }

  const first = segments[0]
  if (!first) return

  packed.forEach((p, idx) => {
    const body = p.texts.join('\n\n')
    const prev = idx > 0 ? packed[idx - 1] : undefined
    const overlap = prev ? overlapText(prev.texts.join('\n\n'), opts) : ''
    const text = overlap ? `${overlap}\n\n${body}` : body
    out.push({
      text,
      headingPath: first.headingPath,
      page: first.page,
      tokenCount: opts.countTokens(text),
      ordinal: out.length,
      hasOverlap: overlap.length > 0,
      kinds: [...new Set(p.kinds)],
    })
  })
}

/** Trailing sentences of the previous chunk, up to overlapRatio of its size. */
function overlapText(previous: string, opts: ChunkerOptions): string {
  const budget = Math.floor(opts.countTokens(previous) * opts.overlapRatio)
  if (budget <= 0) return ''

  const sentences = splitSentences(previous)
  const taken: string[] = []
  let tokens = 0

  for (let i = sentences.length - 1; i >= 0; i--) {
    const s = sentences[i]
    if (!s) continue
    const t = opts.countTokens(s)
    if (tokens + t > budget && taken.length > 0) break
    taken.unshift(s)
    tokens += t
    if (tokens >= budget) break
  }
  return taken.join(' ')
}
