/**
 * Normative enums. Derived from docs/14-contracts.md §2.
 *
 * These are declared HERE and imported everywhere. A string literal that duplicates
 * one of these values is a lint error (scripts/ci/check-enum-literals.mjs).
 *
 * Enum VALUES are SCREAMING_SNAKE everywhere — JSON, TypeScript, and SQL alike.
 */

export const DOCUMENT_STATUS = [
  'PENDING_UPLOAD', // record created, bytes not yet received
  'PARSING', // extracting blocks
  'SCREENING', // injection detection — BEFORE augmentation or embedding
  'QUARANTINED', // screening flagged it; unreachable by retrieval; awaits human release
  'EMBEDDING', // contextualising + embedding
  'INDEXED', // active and retrievable
  'SUPERSEDED', // a newer version is active; chunks retained for citation resolution
  'FAILED', // terminal; failureReason populated
] as const
export type DocumentStatus = (typeof DOCUMENT_STATUS)[number]

export const QUESTIONNAIRE_STATUS = [
  'PENDING_UPLOAD',
  'NORMALISING',
  'NORMALISED', // itemCount and unparsedRows are final
  'FAILED',
] as const
export type QuestionnaireStatus = (typeof QUESTIONNAIRE_STATUS)[number]

export const RUN_STATUS = [
  'QUEUED',
  'IN_PROGRESS',
  'COMPLETE',
  'CANCELLED',
  'FAILED',
] as const
export type RunStatus = (typeof RUN_STATUS)[number]

export const ITEM_STATUS = [
  'PENDING', // not yet picked up
  'IN_PROGRESS', // a worker holds it
  'ANSWERED', // grounded, cited
  'GAP', // deliberate abstention — a success
  'CANCELLED', // run cancelled before this item resolved
  'FAILED_BUDGET', // turn / token / wall-clock ceiling
  'FAILED_TOOL_ARGS', // 3 consecutive invalid tool-argument attempts
  'FAILED_UPSTREAM', // model or tool error after retries
] as const
export type ItemStatus = (typeof ITEM_STATUS)[number]

export const REVIEW_STATE = ['PENDING', 'APPROVED', 'REJECTED', 'EDITED'] as const
export type ReviewState = (typeof REVIEW_STATE)[number]

export const EVIDENCE_KIND = ['DOCUMENT', 'LIVE_OBSERVATION'] as const
export type EvidenceKind = (typeof EVIDENCE_KIND)[number]

export const EXPORT_STATUS = ['PROCESSING', 'READY', 'FAILED'] as const
export type ExportStatus = (typeof EXPORT_STATUS)[number]

export const DOC_TYPE = [
  'POLICY',
  'CONTROL_NARRATIVE',
  'ARCHITECTURE',
  'PENTEST',
  'PRIOR_ANSWER',
] as const
export type DocType = (typeof DOC_TYPE)[number]

export const RESPONSE_TYPE = [
  'YES_NO_NA',
  'NARRATIVE',
  'YES_NO_NA_WITH_NARRATIVE',
] as const
export type ResponseType = (typeof RESPONSE_TYPE)[number]

export const RESPONSE_ENUM = ['YES', 'NO', 'NA'] as const
export type ResponseEnum = (typeof RESPONSE_ENUM)[number]

export const QUESTIONNAIRE_FORMAT = ['CAIQ_V4', 'CSV', 'JSON'] as const
export type QuestionnaireFormat = (typeof QUESTIONNAIRE_FORMAT)[number]

export const SCREENING_VERDICT = ['CLEAN', 'FLAGGED'] as const
export type ScreeningVerdict = (typeof SCREENING_VERDICT)[number]

export const CONFIDENCE_BAND = ['HIGH', 'MEDIUM', 'LOW'] as const
export type ConfidenceBand = (typeof CONFIDENCE_BAND)[number]

export const TOOL_OUTCOME = ['OK', 'INVALID_ARGS', 'ERROR'] as const
export type ToolOutcome = (typeof TOOL_OUTCOME)[number]

/**
 * ANSWERED and GAP are both TERMINAL SUCCESSES.
 * Everything prefixed FAILED_ is a terminal failure. CANCELLED is terminal and neither.
 */
export const TERMINAL_ITEM_SUCCESS: readonly ItemStatus[] = ['ANSWERED', 'GAP']
export const TERMINAL_ITEM_FAILURE: readonly ItemStatus[] = [
  'FAILED_BUDGET',
  'FAILED_TOOL_ARGS',
  'FAILED_UPSTREAM',
]
export const TERMINAL_ITEM_STATUS: readonly ItemStatus[] = [
  ...TERMINAL_ITEM_SUCCESS,
  ...TERMINAL_ITEM_FAILURE,
  'CANCELLED',
]

export function isTerminalItemStatus(s: ItemStatus): boolean {
  return TERMINAL_ITEM_STATUS.includes(s)
}

export function isItemFailure(s: ItemStatus): boolean {
  return TERMINAL_ITEM_FAILURE.includes(s)
}
