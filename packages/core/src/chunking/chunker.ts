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
      for (const bounded of enforceCeiling(piece, opts, block.kind)) {
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

/**
 * Hard ceiling: split at the nearest safe boundary. Never mid-sentence.
 *
 * Lists are split at ITEM boundaries first. A markdown list whose items lack terminal
 * punctuation is a single "sentence" to any sentence splitter, so a sentence-only
 * strategy emits the whole oversized list unchanged and silently breaches the ceiling —
 * which then becomes an oversized embedding input.
 */
function enforceCeiling(
  text: string,
  opts: ChunkerOptions,
  kind: Block['kind'] = 'paragraph',
): string[] {
  if (opts.countTokens(text) <= opts.hardCeiling) return [text]

  const units = kind === 'list' ? splitListItems(text) : splitSentences(text)
  const joiner = kind === 'list' ? '\n' : ' '

  const out: string[] = []
  let buf: string[] = []
  let tokens = 0

  for (const unit of units) {
    const t = opts.countTokens(unit)

    // A single unit over the ceiling: fall back to sentences, then accept the remainder.
    if (t > opts.hardCeiling) {
      if (buf.length) {
        out.push(buf.join(joiner))
        buf = []
        tokens = 0
      }
      out.push(...(kind === 'list' ? enforceCeiling(unit, opts, 'paragraph') : [unit]))
      continue
    }

    if (buf.length > 0 && tokens + t > opts.hardCeiling) {
      out.push(buf.join(joiner))
      buf = [unit]
      tokens = t
    } else {
      buf.push(unit)
      tokens += t
    }
  }
  if (buf.length) out.push(buf.join(joiner))
  return out
}

/** Split a markdown list into items, keeping continuation lines with their bullet. */
function splitListItems(text: string): string[] {
  const items: string[] = []
  let buf: string[] = []
  for (const line of text.split('\n')) {
    if (/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/.test(line) && buf.length > 0) {
      items.push(buf.join('\n'))
      buf = [line]
    } else {
      buf.push(line)
    }
  }
  if (buf.length) items.push(buf.join('\n'))
  return items.filter((s) => s.trim().length > 0)
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

  interface Packed {
    texts: string[]
    kinds: Block['kind'][]
    tokens: number
    /** Pages actually contributing to THIS chunk — not the section's. */
    pages: (number | null)[]
  }

  const packed: Packed[] = []
  let buf: string[] = []
  let kinds: Block['kind'][] = []
  let pages: (number | null)[] = []
  let tokens = 0

  for (const s of segments) {
    const t = opts.countTokens(s.text)
    if (buf.length > 0 && tokens + t > opts.targetMax) {
      packed.push({ texts: buf, kinds, tokens, pages })
      buf = []
      kinds = []
      pages = []
      tokens = 0
    }
    buf.push(s.text)
    kinds.push(s.kind)
    pages.push(s.page)
    tokens += t
  }
  if (buf.length) packed.push({ texts: buf, kinds, tokens, pages })

  // Hard floor: merge a runt upward into its predecessor within the same section.
  for (let i = packed.length - 1; i > 0; i--) {
    const cur = packed[i]
    const prev = packed[i - 1]
    if (!cur || !prev) continue
    if (cur.tokens < opts.hardFloor) {
      prev.texts.push(...cur.texts)
      prev.kinds.push(...cur.kinds)
      prev.pages.push(...cur.pages)
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
      // The page this chunk's own text starts on. Using the section's first page would
      // send a citation for a later-page quote to the wrong page of the PDF.
      page: firstPage(p.pages),
      tokenCount: opts.countTokens(text),
      ordinal: out.length,
      hasOverlap: overlap.length > 0,
      kinds: [...new Set(p.kinds)],
    })
  })
}

/** Lowest real page contributing to a chunk; null when the source has no pagination. */
function firstPage(pages: readonly (number | null)[]): number | null {
  const real = pages.filter((p): p is number => typeof p === 'number')
  return real.length > 0 ? Math.min(...real) : null
}

/**
 * Trailing units of the previous chunk, up to overlapRatio of its size.
 *
 * Same trap as the hard ceiling: a markdown list has no sentence terminators, so
 * splitSentences returns the whole chunk as one unit. The previous implementation then
 * took that single oversized unit whole — because of a `taken.length > 0` guard that
 * exempted the first unit from the budget — and the "15% overlap" became a 100% overlap
 * that doubled every chunk. Caught by the review's list finding; the assumption that
 * text contains sentences was wrong in two places, not one.
 */
function overlapText(previous: string, opts: ChunkerOptions): string {
  const budget = Math.floor(opts.countTokens(previous) * opts.overlapRatio)
  if (budget <= 0) return ''

  let units = splitSentences(previous)
  // If sentence splitting produced nothing usable within budget, fall back to lines.
  if (units.length <= 1 || units.every((u) => opts.countTokens(u) > budget)) {
    units = previous.split('\n').filter((l) => l.trim().length > 0)
  }

  const taken: string[] = []
  let tokens = 0

  for (let i = units.length - 1; i >= 0; i--) {
    const u = units[i]
    if (!u) continue
    const t = opts.countTokens(u)
    // No exemption for the first unit: exceeding the budget is never acceptable.
    if (tokens + t > budget) break
    taken.unshift(u)
    tokens += t
    if (tokens >= budget) break
  }

  const joiner = previous.includes('\n') && !previous.includes('. ') ? '\n' : ' '
  return taken.join(joiner)
}
