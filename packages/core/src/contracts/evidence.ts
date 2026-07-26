/**
 * The evidence model. docs/14-contracts.md §5, docs/adr/0006-evidence-identity.md.
 *
 * Two kinds of evidence, one union. Both immutable, both tenant-scoped, both citable,
 * both scored by the grounding check. This exists because the first design required
 * every claim to cite evidence but typed citations as document chunks only — which made
 * any claim grounded in live AWS Config state uncitable by construction.
 */

import { z } from 'zod'
import { EVIDENCE_KIND } from './enums.js'

/** Default staleness window for a live observation. */
export const DEFAULT_STALENESS_WINDOW_DAYS = 30

export const documentEvidenceSchema = z.object({
  evidenceId: z.string().min(1), // === chunkId; chunks are immutable, only deactivated
  kind: z.literal('DOCUMENT'),
  tenantId: z.string().min(1),
  aclTags: z.array(z.string()).min(1),
  documentId: z.string().min(1),
  documentVersionId: z.string().min(1), // immutable — what a citation actually pins
  documentTitle: z.string(),
  headingPath: z.array(z.string()),
  page: z.number().int().nullable(),
  quote: z.string().min(1), // raw_text verbatim, NEVER the augmented form
})
export type DocumentEvidence = z.infer<typeof documentEvidenceSchema>

export const liveEvidenceSchema = z.object({
  evidenceId: z.string().min(1), // ev_… minted at observation time
  kind: z.literal('LIVE_OBSERVATION'),
  tenantId: z.string().min(1),
  aclTags: z.array(z.string()).min(1),
  source: z.literal('aws_config'),
  check: z.string().min(1),
  scope: z.object({ accountAlias: z.string(), region: z.string() }),
  result: z.object({
    compliant: z.boolean(),
    ruleName: z.string(),
    resourceCounts: z.record(z.number()),
  }),
  observedAt: z.string().datetime(),
  staleAfter: z.string().datetime(),
  renderedText: z.string().min(1), // what grounding scores and users see
})
export type LiveEvidence = z.infer<typeof liveEvidenceSchema>

export const evidenceSchema = z.discriminatedUnion('kind', [
  documentEvidenceSchema,
  liveEvidenceSchema,
])
export type Evidence = z.infer<typeof evidenceSchema>

/** A citation as persisted on an answer. Display fields are denormalised. */
export const citationSchema = z.object({
  citationId: z.string().regex(/^C\d+$/), // stable within one answer
  evidenceId: z.string().min(1),
  kind: z.enum(EVIDENCE_KIND),
  documentId: z.string().optional(),
  documentVersionId: z.string().optional(),
  documentTitle: z.string().optional(),
  headingPath: z.array(z.string()).optional(),
  page: z.number().int().nullable().optional(),
  quote: z.string().optional(),
  source: z.string().optional(),
  check: z.string().optional(),
  observedAt: z.string().optional(),
})
export type Citation = z.infer<typeof citationSchema>

export function isDocumentEvidence(e: Evidence): e is DocumentEvidence {
  return e.kind === 'DOCUMENT'
}
export function isLiveEvidence(e: Evidence): e is LiveEvidence {
  return e.kind === 'LIVE_OBSERVATION'
}

/**
 * Live evidence past `staleAfter` may NOT be cited in a NEW answer — the tool
 * re-observes instead. Existing answers keep their citation and always render the
 * original observedAt. A live observation is never presented as a timeless fact.
 *
 * Document evidence never goes stale: it is pinned to an immutable version.
 */
export function isStale(e: Evidence, now: Date): boolean {
  if (e.kind !== 'LIVE_OBSERVATION') return false
  return now.getTime() >= Date.parse(e.staleAfter)
}

export function staleAfterFor(
  observedAt: string,
  windowDays = DEFAULT_STALENESS_WINDOW_DAYS,
): string {
  return new Date(Date.parse(observedAt) + windowDays * 86_400_000).toISOString()
}

/**
 * Render an evidence item for a model context. Both kinds go into a FENCED DATA
 * CHANNEL with an id — never concatenated into the system prompt. The fence is a
 * security control (docs/07-security-threat-model.md §5), not formatting.
 */
export function renderForContext(citationId: string, e: Evidence): string {
  if (e.kind === 'DOCUMENT') {
    const section = e.headingPath.join(' > ')
    const page = e.page === null ? '' : ` page="${e.page}"`
    return (
      `<evidence id="${citationId}" kind="DOCUMENT" doc="${escapeAttr(e.documentTitle)}" ` +
      `section="${escapeAttr(section)}"${page}>\n${e.quote}\n</evidence>`
    )
  }
  return (
    `<evidence id="${citationId}" kind="LIVE_OBSERVATION" source="${e.source}" ` +
    `check="${escapeAttr(e.check)}" observedAt="${e.observedAt}">\n` +
    `${e.renderedText}\n</evidence>`
  )
}

/** Human/export-facing rendering. Live observations always carry their timestamp. */
export function renderCitationLabel(c: Citation): string {
  if (c.kind === 'DOCUMENT') {
    const section = (c.headingPath ?? []).join(' > ')
    const page = c.page === null || c.page === undefined ? '' : `, p.${c.page}`
    return `${c.documentTitle ?? 'Untitled'}${section ? ` § ${section}` : ''}${page}`
  }
  const observed = c.observedAt ? c.observedAt.slice(0, 10) : 'unknown date'
  return `AWS Config · ${c.check ?? 'unknown check'} · observed ${observed}`
}

export function citationFromEvidence(citationId: string, e: Evidence): Citation {
  if (e.kind === 'DOCUMENT') {
    return {
      citationId,
      evidenceId: e.evidenceId,
      kind: 'DOCUMENT',
      documentId: e.documentId,
      documentVersionId: e.documentVersionId,
      documentTitle: e.documentTitle,
      headingPath: e.headingPath,
      page: e.page,
      quote: e.quote,
    }
  }
  return {
    citationId,
    evidenceId: e.evidenceId,
    kind: 'LIVE_OBSERVATION',
    source: e.source,
    check: e.check,
    observedAt: e.observedAt,
    quote: e.renderedText,
  }
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}
