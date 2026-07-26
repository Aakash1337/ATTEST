/**
 * Ingest-time injection screening. docs/03-retrieval-spec.md §1.3, §7 threat T-03.
 *
 * Runs BETWEEN chunking and contextual augmentation — before any LLM sees the text and
 * before embedding. Screening after augmentation would mean the first thing an injected
 * instruction reaches is a model.
 *
 * THE PRECISION PROBLEM: compliance prose is wall-to-wall directives. "Administrators
 * shall enable MFA", "Systems must be patched within 30 days", "Personnel are required
 * to complete training". A naive imperative detector flags the entire corpus.
 *
 * The distinguishing signal is not that text is directive. It is that the directive is
 * aimed at WHOEVER OR WHATEVER IS PROCESSING THE DOCUMENT, and concerns how to answer,
 * respond, or behave — rather than aimed at a person operating a control.
 *
 * This is heuristic and it is DEFENCE IN DEPTH, not the primary control. Primary
 * controls remain role separation, fenced data channels, output-schema validation, the
 * deterministic citation check, and the grounding check.
 */

import type { ScreeningVerdict } from '../contracts/enums.js'

export interface ScreeningRule {
  readonly id: string
  readonly category:
    | 'instruction_override'
    | 'prompt_disclosure'
    | 'answer_directive'
    | 'assistant_address'
    | 'evidence_bypass'
  readonly pattern: RegExp
  readonly weight: number
  readonly description: string
}

/**
 * Weights are calibrated so that any single high-confidence signal (>= THRESHOLD)
 * flags on its own, while weaker signals must corroborate.
 */
export const SCREENING_THRESHOLD = 10

export const SCREENING_RULES: readonly ScreeningRule[] = [
  {
    id: 'IJ-001',
    category: 'instruction_override',
    pattern: /\b(ignore|disregard|forget|override)\s+(all\s+|any\s+)?(previous|prior|earlier|above|preceding|the\s+foregoing)\s+(instruction|prompt|direction|rule|guidance)/i,
    weight: 12,
    description: 'Directs the reader to discard prior instructions',
  },
  {
    id: 'IJ-002',
    category: 'prompt_disclosure',
    pattern: /\b(reveal|disclose|print|output|repeat|show)\s+(the\s+|your\s+|full\s+)*(system\s+prompt|initial\s+instruction|hidden\s+instruction|configuration\s+prompt)/i,
    weight: 12,
    description: 'Attempts to extract the system prompt',
  },
  {
    id: 'IJ-003',
    category: 'answer_directive',
    pattern: /\bwhen\s+(completing|answering|responding\s+to|filling\s+(in|out))\s+[^.]{0,40}\b(questionnaire|assessment|security\s+review|due\s+diligence)/i,
    weight: 8,
    description: 'Instructs how to complete questionnaires',
  },
  {
    id: 'IJ-004',
    category: 'answer_directive',
    pattern: /\b(always|invariably|in\s+all\s+cases)\s+(state|answer|respond|reply|indicate|assert|confirm)\b/i,
    weight: 8,
    description: 'Mandates a fixed answer irrespective of context',
  },
  {
    id: 'IJ-005',
    category: 'answer_directive',
    pattern: /\banswer\s+["'`]?(yes|no|n\/?a)["'`]?\s+to\s+(all|any|every|each)\b/i,
    weight: 12,
    description: 'Mandates a blanket response value',
  },
  {
    id: 'IJ-006',
    category: 'evidence_bypass',
    pattern: /\bregardless\s+of\s+(the\s+)?(evidence|documentation|actual|underlying|supporting|whether)/i,
    weight: 12,
    description: 'Explicitly instructs answering without evidence',
  },
  {
    id: 'IJ-007',
    category: 'assistant_address',
    pattern: /\b(you\s+are\s+(an?\s+)?(AI|assistant|language\s+model|chatbot)|as\s+an\s+AI\b)/i,
    weight: 12,
    description: 'Addresses the reader as an AI system',
  },
  {
    id: 'IJ-008',
    category: 'assistant_address',
    pattern: /\b(system\s+note|system\s+message|assistant\s+note|note\s+to\s+(the\s+)?(AI|assistant|model))\s*:/i,
    weight: 10,
    description: 'Impersonates a system-level channel',
  },
  {
    id: 'IJ-009',
    category: 'answer_directive',
    pattern: /\b(do\s+not|never)\s+(mention|disclose|reveal|report|flag|include)\s+[^.]{0,40}\b(finding|gap|exception|deficiency|weakness|non-?compliance)/i,
    weight: 12,
    description: 'Instructs suppression of adverse findings',
  },
  {
    id: 'IJ-010',
    category: 'answer_directive',
    pattern: /\bstate\s+that\s+[^.]{0,60}\b(fully|entirely|completely)\s+(compliant|certified|conformant)\b/i,
    weight: 10,
    description: 'Dictates an unqualified compliance assertion',
  },
]

export interface ScreeningHit {
  readonly ruleId: string
  readonly category: ScreeningRule['category']
  readonly description: string
  readonly excerpt: string
}

export interface ScreeningResult {
  readonly verdict: ScreeningVerdict
  readonly score: number
  readonly hits: readonly ScreeningHit[]
  /** Human-readable, persisted as document_version.screening_reason. */
  readonly reason: string | null
}

const EXCERPT_RADIUS = 60

export function screenText(text: string): ScreeningResult {
  const hits: ScreeningHit[] = []
  let score = 0

  for (const rule of SCREENING_RULES) {
    const m = rule.pattern.exec(text)
    if (!m) continue
    score += rule.weight
    hits.push({
      ruleId: rule.id,
      category: rule.category,
      description: rule.description,
      excerpt: excerptAround(text, m.index, m[0].length),
    })
  }

  const verdict: ScreeningVerdict = score >= SCREENING_THRESHOLD ? 'FLAGGED' : 'CLEAN'
  return {
    verdict,
    score,
    hits,
    reason:
      verdict === 'FLAGGED'
        ? `Injection screening flagged ${hits.length} signal(s): ` +
          hits.map((h) => `${h.ruleId} (${h.description})`).join('; ')
        : null,
  }
}

/**
 * A flag quarantines the WHOLE DOCUMENT VERSION, not the offending chunk. Partial
 * ingestion of a document containing a payload is worse than none: the surrounding
 * clauses lend it credibility while the payload itself is merely displaced.
 */
export function screenDocument(
  units: readonly { readonly id: string; readonly text: string }[],
): ScreeningResult & { readonly flaggedUnitIds: readonly string[] } {
  const flaggedUnitIds: string[] = []
  const allHits: ScreeningHit[] = []
  let score = 0

  for (const unit of units) {
    const r = screenText(unit.text)
    if (r.verdict === 'FLAGGED') {
      flaggedUnitIds.push(unit.id)
      allHits.push(...r.hits)
      score = Math.max(score, r.score)
    }
  }

  const verdict: ScreeningVerdict = flaggedUnitIds.length > 0 ? 'FLAGGED' : 'CLEAN'
  return {
    verdict,
    score,
    hits: allHits,
    flaggedUnitIds,
    reason:
      verdict === 'FLAGGED'
        ? `Quarantined: ${flaggedUnitIds.length} unit(s) matched injection signals ` +
          `[${[...new Set(allHits.map((h) => h.ruleId))].join(', ')}]`
        : null,
  }
}

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - EXCERPT_RADIUS)
  const end = Math.min(text.length, index + length + EXCERPT_RADIUS)
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() +
    (end < text.length ? '…' : '')
}
