import { describe, expect, it } from 'vitest'
import { parseMarkdown, looksLikeClauseStart } from './blocks.js'
import { chunkBlocks, DEFAULT_CHUNKER_OPTIONS } from './chunker.js'
import { estimateTokens, splitSentences } from './tokens.js'

const sentence = (n: number) =>
  `Clause text number ${n} states that the control shall be operated continuously and reviewed by the security team on a defined cadence.`

const paragraphOf = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => sentence(i + offset)).join(' ')

describe('clause detection', () => {
  it.each([
    ['4.2 Multi-Factor Authentication is required', true],
    ['§3 Scope', true],
    ['AC-2 Account Management', true],
    ['CC6.1 Logical access controls', true],
    ['10.1.3 Sub-clause', true],
    ['The policy in section 4.2 applies', false],
    ['Plain prose about encryption', false],
  ])('%s -> %s', (line, expected) => {
    expect(looksLikeClauseStart(line)).toBe(expected)
  })
})

describe('sentence splitting', () => {
  it('does not split on decimal clause numbers', () => {
    const out = splitSentences('Section 4.2 requires MFA. Section 4.3 requires review.')
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('4.2')
    expect(out[1]).toContain('4.3')
  })

  it('does not split on abbreviations', () => {
    const out = splitSentences('Controls e.g. MFA apply. They are reviewed annually.')
    expect(out).toHaveLength(2)
    expect(out[0]).toBe('Controls e.g. MFA apply.')
  })

  it('preserves CVSS-style decimals', () => {
    const out = splitSentences('The finding scored 7.5 on CVSS. It remains open.')
    expect(out).toHaveLength(2)
    expect(out[0]).toContain('7.5')
  })

  it('round-trips text without losing characters', () => {
    const input = 'Rule CC6.1 applies. See e.g. section 2.4 for detail. Done.'
    expect(splitSentences(input).join(' ')).toBe(input)
  })
})

describe('markdown parsing', () => {
  const md = `---
Document ID: POL-AC-001
Version: 3.0
---

# Access Control Policy

Intro prose about scope.

## 4. Authentication

### 4.2 Multi-Factor Authentication

MFA is required for all administrative accounts.

- Reviewed annually
- Approved by the CISO

| Tier | RTO |
| --- | --- |
| Sev-1 | 8 hours |
`

  it('strips front matter so boilerplate does not pollute retrieval', () => {
    const blocks = parseMarkdown(md)
    expect(blocks.some((b) => b.text.includes('POL-AC-001'))).toBe(false)
  })

  it('builds a heading path for every block', () => {
    const blocks = parseMarkdown(md)
    const mfa = blocks.find((b) => b.text.startsWith('MFA is required'))
    expect(mfa?.headingPath).toEqual([
      'Access Control Policy',
      '4. Authentication',
      '4.2 Multi-Factor Authentication',
    ])
  })

  it('classifies list and table blocks', () => {
    const blocks = parseMarkdown(md)
    expect(blocks.some((b) => b.kind === 'list')).toBe(true)
    expect(blocks.some((b) => b.kind === 'table')).toBe(true)
  })

  it('pops the heading stack when depth decreases', () => {
    const blocks = parseMarkdown('# A\n\n## B\n\n### C\n\ntext\n\n## D\n\nmore\n')
    const more = blocks.find((b) => b.text === 'more')
    expect(more?.headingPath).toEqual(['A', 'D'])
  })
})

describe('chunker — F-104 acceptance criteria', () => {
  it('never splits mid-sentence', () => {
    const blocks = parseMarkdown(`# Doc\n\n## S\n\n${paragraphOf(80)}\n`)
    const chunks = chunkBlocks(blocks)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(c.text.trim()).toMatch(/[.!?]$/)
    }
  })

  it('respects the hard ceiling', () => {
    const blocks = parseMarkdown(`# Doc\n\n## S\n\n${paragraphOf(200)}\n`)
    for (const c of chunkBlocks(blocks)) {
      expect(c.tokenCount).toBeLessThanOrEqual(
        DEFAULT_CHUNKER_OPTIONS.hardCeiling * 1.2, // + overlap allowance
      )
    }
  })

  it('merges runt chunks upward rather than emitting them', () => {
    // A long section followed by a two-word trailing fragment.
    const blocks = parseMarkdown(`# Doc\n\n## S\n\n${paragraphOf(40)}\n\nShort tail.\n`)
    const chunks = chunkBlocks(blocks)
    const runts = chunks.filter((c) => c.tokenCount < DEFAULT_CHUNKER_OPTIONS.hardFloor)
    expect(runts).toHaveLength(0)
  })

  it('splits on clause markers even inside one block', () => {
    const md = `# Doc\n\n## Section\n\n4.1 ${paragraphOf(3)}\n4.2 ${paragraphOf(3, 10)}\n4.3 ${paragraphOf(3, 20)}\n`
    const segments = chunkBlocks(parseMarkdown(md), { targetMax: 60 })
    expect(segments.length).toBeGreaterThan(1)
    // Each clause number must remain attached to its own text.
    const withClause = segments.filter((c) => /\b4\.\d/.test(c.text))
    expect(withClause.length).toBeGreaterThan(1)
  })

  it('carries headingPath onto every chunk', () => {
    const blocks = parseMarkdown(
      `# Policy\n\n## 4. Auth\n\n### 4.2 MFA\n\n${paragraphOf(20)}\n`,
    )
    for (const c of chunkBlocks(blocks)) {
      expect(c.headingPath.length).toBeGreaterThan(0)
      expect(c.headingPath[0]).toBe('Policy')
    }
  })

  it('never mixes two sections in one chunk', () => {
    const md = `# Doc\n\n## Encryption At Rest\n\nData at rest uses AES-256.\n\n## Encryption In Transit\n\nData in transit uses TLS 1.2.\n`
    const chunks = chunkBlocks(md ? parseMarkdown(md) : [])
    const atRest = chunks.find((c) => c.headingPath.includes('Encryption At Rest'))
    expect(atRest?.text).not.toContain('TLS 1.2')
  })

  it('applies overlap only within a section', () => {
    const md = `# Doc\n\n## A\n\n${paragraphOf(40)}\n\n## B\n\n${paragraphOf(5, 100)}\n`
    const chunks = chunkBlocks(md ? parseMarkdown(md) : [])
    const firstOfB = chunks.find((c) => c.headingPath.includes('B'))
    expect(firstOfB?.hasOverlap).toBe(false)
  })

  it('produces overlap between consecutive chunks in the same section', () => {
    const blocks = parseMarkdown(`# Doc\n\n## S\n\n${paragraphOf(90)}\n`)
    const chunks = chunkBlocks(blocks)
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.slice(1).some((c) => c.hasOverlap)).toBe(true)
  })

  it('assigns dense monotonic ordinals', () => {
    const blocks = parseMarkdown(`# Doc\n\n## S\n\n${paragraphOf(60)}\n`)
    const chunks = chunkBlocks(blocks)
    expect(chunks.map((c) => c.ordinal)).toEqual(chunks.map((_, i) => i))
  })
})

describe('chunker — tables (D5: table-only answers)', () => {
  it('keeps a small table whole', () => {
    const md = `# IR Plan\n\n## 5. Severity\n\n| Tier | RTO |\n| --- | --- |\n| Sev-1 | 8 hours |\n| Sev-2 | 24 hours |\n`
    const chunks = chunkBlocks(parseMarkdown(md))
    const table = chunks.find((c) => c.text.includes('Sev-1'))
    expect(table?.text).toContain('Sev-2')
    expect(table?.text).toContain('| Tier | RTO |')
  })

  it('repeats the header row when splitting a large table', () => {
    const rows = Array.from(
      { length: 200 },
      (_, i) => `| System ${i} | ${i} hours | Owner ${i} named in the recovery register |`,
    ).join('\n')
    const md = `# BCDR\n\n## Systems\n\n| System | RTO | Owner |\n| --- | --- | --- |\n${rows}\n`
    const chunks = chunkBlocks(parseMarkdown(md))
    const tableChunks = chunks.filter((c) => c.text.includes('| System'))
    expect(tableChunks.length).toBeGreaterThan(1)
    for (const c of tableChunks) {
      expect(c.text).toContain('| System | RTO | Owner |')
    }
  })
})

describe('chunker — hard ceiling on lists (review P2)', () => {
  it('splits an oversized list at item boundaries, not just sentences', () => {
    // Items with NO terminal punctuation: a sentence splitter sees one huge "sentence".
    const items = Array.from(
      { length: 300 },
      (_, i) => `- Control requirement ${i} covering access review and retention duties`,
    ).join('\n')
    const chunks = chunkBlocks(parseMarkdown(`# Doc\n\n## Controls\n\n${items}\n`))

    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) {
      expect(c.tokenCount).toBeLessThanOrEqual(DEFAULT_CHUNKER_OPTIONS.hardCeiling * 1.2)
    }
  })

  it('keeps each bullet intact when splitting a list', () => {
    const items = Array.from(
      { length: 300 },
      (_, i) => `- Control requirement ${i} covering access review and retention duties`,
    ).join('\n')
    const chunks = chunkBlocks(parseMarkdown(`# Doc\n\n## Controls\n\n${items}\n`))
    const bullets = chunks.flatMap((c) => c.text.split('\n')).filter((l) => l.startsWith('- '))
    // No bullet was severed mid-line.
    for (const b of bullets) {
      expect(b).toMatch(/^- Control requirement \d+ covering access review and retention duties$/)
    }
  })
})

describe('chunker — page attribution (review P2)', () => {
  const paged = (page: number, text: string) => ({
    text,
    headingPath: ['Policy', '4. Access'],
    page,
    kind: 'paragraph' as const,
    depth: 2,
  })

  it('attributes each chunk to its own page, not the section start', () => {
    // One heading spanning three PDF pages, sized so packing splits it.
    const blocks = [
      paged(10, paragraphOf(30, 0)),
      paged(11, paragraphOf(30, 40)),
      paged(12, paragraphOf(30, 80)),
    ]
    const chunks = chunkBlocks(blocks)
    const observed = [...new Set(chunks.map((c) => c.page))]

    expect(chunks.length).toBeGreaterThan(1)
    // Before the fix every chunk reported page 10.
    expect(observed.length).toBeGreaterThan(1)
    expect(observed).not.toEqual([10])
  })

  it('reports null when the source has no pagination (markdown)', () => {
    const chunks = chunkBlocks(parseMarkdown(`# Doc\n\n## S\n\n${paragraphOf(10)}\n`))
    expect(chunks.every((c) => c.page === null)).toBe(true)
  })
})

describe('token estimation', () => {
  it('is monotonic in length', () => {
    expect(estimateTokens('a b c')).toBeLessThan(estimateTokens(paragraphOf(3)))
  })
  it('returns zero for empty input', () => {
    expect(estimateTokens('   \n  ')).toBe(0)
  })
})
