/**
 * Parse output contract. docs/03-retrieval-spec.md §1.1.
 *
 * Heading path and page number are not optional metadata — they are what makes a
 * citation clickable and auditable. A parser that loses them is a failed parser.
 */

export type BlockKind = 'heading' | 'paragraph' | 'list' | 'table' | 'code'

export interface Block {
  readonly text: string
  readonly headingPath: readonly string[]
  readonly page: number | null
  readonly kind: BlockKind
  /** Heading depth (1-6) when kind === 'heading'; otherwise the depth of the enclosing section. */
  readonly depth: number
}

/**
 * Clause markers we split on: `4.2`, `§3`, and control IDs like `AC-2` / `CC6.1`.
 * Anchored at line start so a mid-sentence "section 4.2" reference is not a boundary.
 */
export const CLAUSE_RE = /^\s{0,3}(?:§\s?)?(?:\d+(?:\.\d+){0,3}|[A-Z]{2,3}-?\d+(?:\.\d+)?)[.)]?\s+\S/

export function looksLikeClauseStart(line: string): boolean {
  return CLAUSE_RE.test(line)
}

const HEADING_RE = /^(#{1,6})\s+(.*\S)\s*$/
const FENCE_RE = /^\s*(```|~~~)/
const LIST_RE = /^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/
const TABLE_ROW_RE = /^\s*\|.*\|\s*$/
const NEWLINE_RE = /\r?\n/

export interface ParseOptions {
  /**
   * Root heading for content appearing BEFORE the first heading.
   *
   * Real documents open with a metadata block — often a blockquote or a table rather
   * than `---` front matter — and that content would otherwise produce chunks with an
   * empty headingPath. An empty headingPath makes a chunk uncitable, and F-102 requires
   * every chunk to carry one. Defaults to the document's first H1, then to '(preamble)'.
   */
  readonly documentTitle?: string
}

/**
 * Markdown parser. PDF parsing lives in the adapters layer (it needs a binary library);
 * it produces the same Block[] contract, with real page numbers.
 *
 * Front matter delimited by `---` at the very top is skipped: it is metadata, not prose.
 * Blockquote-style metadata headers are NOT skipped — they carry effective dates and
 * classifications that are legitimately answerable — but they are attributed to the
 * document title rather than left orphaned.
 */
export function parseMarkdown(source: string, options: ParseOptions = {}): Block[] {
  const body = stripFrontMatter(source)
  const lines = body.split(NEWLINE_RE)
  const blocks: Block[] = []
  const headingStack: string[] = []
  const fallbackRoot = options.documentTitle ?? firstH1(body) ?? '(preamble)'

  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ''

    if (line.trim() === '') {
      i++
      continue
    }

    const heading = HEADING_RE.exec(line)
    if (heading) {
      const depth = (heading[1] ?? '').length
      const title = heading[2] ?? ''
      headingStack.length = depth - 1
      headingStack[depth - 1] = title
      blocks.push({
        text: title,
        headingPath: [...compact(headingStack)],
        page: null,
        kind: 'heading',
        depth,
      })
      i++
      continue
    }

    if (FENCE_RE.test(line)) {
      const fence = FENCE_RE.exec(line)?.[1] ?? '```'
      const buf: string[] = [line]
      i++
      while (i < lines.length && !(lines[i] ?? '').trimStart().startsWith(fence)) {
        buf.push(lines[i] ?? '')
        i++
      }
      if (i < lines.length) {
        buf.push(lines[i] ?? '')
        i++
      }
      blocks.push(makeBlock(buf.join('\n'), headingStack, 'code', fallbackRoot))
      continue
    }

    if (TABLE_ROW_RE.test(line)) {
      const buf: string[] = []
      while (i < lines.length && TABLE_ROW_RE.test(lines[i] ?? '')) {
        buf.push(lines[i] ?? '')
        i++
      }
      blocks.push(makeBlock(buf.join('\n'), headingStack, 'table', fallbackRoot))
      continue
    }

    if (LIST_RE.test(line)) {
      const buf: string[] = []
      while (
        i < lines.length &&
        (lines[i] ?? '').trim() !== '' &&
        !HEADING_RE.test(lines[i] ?? '') &&
        !TABLE_ROW_RE.test(lines[i] ?? '')
      ) {
        buf.push(lines[i] ?? '')
        i++
      }
      blocks.push(makeBlock(buf.join('\n'), headingStack, 'list', fallbackRoot))
      continue
    }

    const buf: string[] = []
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() !== '' &&
      !HEADING_RE.test(lines[i] ?? '') &&
      !TABLE_ROW_RE.test(lines[i] ?? '') &&
      !FENCE_RE.test(lines[i] ?? '') &&
      !LIST_RE.test(lines[i] ?? '')
    ) {
      buf.push(lines[i] ?? '')
      i++
    }
    if (buf.length) {
      blocks.push(makeBlock(buf.join('\n'), headingStack, 'paragraph', fallbackRoot))
    }
  }

  return blocks
}

function makeBlock(
  text: string,
  headingStack: string[],
  kind: BlockKind,
  fallbackRoot: string,
): Block {
  const path = compact(headingStack)
  // Never emit an empty heading path: an uncitable chunk is a failed parse (F-102).
  const headingPath = path.length > 0 ? path : [fallbackRoot]
  return { text: text.trim(), headingPath, page: null, kind, depth: headingPath.length }
}

function firstH1(source: string): string | null {
  for (const line of source.split(NEWLINE_RE)) {
    const m = HEADING_RE.exec(line)
    if (m && (m[1] ?? '').length === 1) return m[2] ?? null
  }
  return null
}

function compact(stack: readonly (string | undefined)[]): string[] {
  return stack.filter((s): s is string => typeof s === 'string' && s.length > 0)
}

function stripFrontMatter(src: string): string {
  if (!src.startsWith('---')) return src
  const end = src.indexOf('\n---', 3)
  if (end === -1) return src
  const after = src.indexOf('\n', end + 1)
  return after === -1 ? '' : src.slice(after + 1)
}
