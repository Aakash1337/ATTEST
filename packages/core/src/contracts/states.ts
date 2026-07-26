/**
 * State machines from docs/14-contracts.md §3.
 *
 * Transitions are data, not scattered `if` statements, so that:
 *   - illegal transitions are a single assertion rather than a code review question
 *   - the machines are testable without any infrastructure
 *   - the delivery-plan release gate "lifecycle transitions are legal" is checkable
 */

import type {
  DocumentStatus,
  ItemStatus,
  QuestionnaireStatus,
  ReviewState,
  RunStatus,
} from './enums.js'

export type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>

/**
 * SCREENING precedes EMBEDDING. Untrusted content is never sent to a model for
 * contextual augmentation, and never embedded, before injection screening.
 */
export const DOCUMENT_TRANSITIONS: TransitionMap<DocumentStatus> = {
  PENDING_UPLOAD: ['PARSING', 'FAILED'],
  PARSING: ['SCREENING', 'FAILED'],
  SCREENING: ['EMBEDDING', 'QUARANTINED', 'FAILED'],
  QUARANTINED: ['EMBEDDING', 'FAILED'], // only via explicit human release
  EMBEDDING: ['INDEXED', 'FAILED'],
  INDEXED: ['SUPERSEDED'],
  SUPERSEDED: [],
  FAILED: [],
}

export const QUESTIONNAIRE_TRANSITIONS: TransitionMap<QuestionnaireStatus> = {
  PENDING_UPLOAD: ['NORMALISING', 'FAILED'],
  NORMALISING: ['NORMALISED', 'FAILED'],
  NORMALISED: [],
  FAILED: [],
}

export const RUN_TRANSITIONS: TransitionMap<RunStatus> = {
  QUEUED: ['IN_PROGRESS', 'CANCELLED', 'FAILED'],
  IN_PROGRESS: ['COMPLETE', 'CANCELLED', 'FAILED'],
  COMPLETE: [],
  CANCELLED: [],
  FAILED: [],
}

export const ITEM_TRANSITIONS: TransitionMap<ItemStatus> = {
  PENDING: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: [
    'ANSWERED',
    'GAP',
    'CANCELLED',
    'FAILED_BUDGET',
    'FAILED_TOOL_ARGS',
    'FAILED_UPSTREAM',
  ],
  ANSWERED: [],
  GAP: [],
  CANCELLED: [],
  // Terminal within a generation. Resume (an extension) re-dispatches by minting a
  // fresh generation rather than by transitioning out of a failure state.
  FAILED_BUDGET: [],
  FAILED_TOOL_ARGS: [],
  FAILED_UPSTREAM: [],
}

/**
 * EDITED -> REJECTED is intentional (docs/14-contracts.md §3.5): editing and approving
 * are separate acts, often by separate people. Without that edge an approver could only
 * reject by first reverting the edit, destroying the record of what was attempted.
 */
export const REVIEW_TRANSITIONS: TransitionMap<ReviewState> = {
  PENDING: ['APPROVED', 'REJECTED', 'EDITED'],
  EDITED: ['APPROVED', 'REJECTED'],
  APPROVED: [],
  REJECTED: [],
}

export function canTransition<S extends string>(
  map: TransitionMap<S>,
  from: S,
  to: S,
): boolean {
  return (map[from] ?? []).includes(to)
}

export class IllegalTransitionError extends Error {
  override readonly name = 'IllegalTransitionError'
  readonly code = 'illegal_transition'
  constructor(
    readonly entity: string,
    readonly from: string,
    readonly to: string,
    readonly allowed: readonly string[],
  ) {
    super(
      `Illegal ${entity} transition ${from} → ${to}. Allowed from ${from}: ` +
        (allowed.length ? allowed.join(', ') : '(terminal)'),
    )
  }
}

export function assertTransition<S extends string>(
  entity: string,
  map: TransitionMap<S>,
  from: S,
  to: S,
): void {
  if (!canTransition(map, from, to)) {
    throw new IllegalTransitionError(entity, from, to, map[from] ?? [])
  }
}

/** Only ANSWERED and GAP items are reviewable. */
export function isReviewable(status: ItemStatus): boolean {
  return status === 'ANSWERED' || status === 'GAP'
}
