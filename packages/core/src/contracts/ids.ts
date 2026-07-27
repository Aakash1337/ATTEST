/** Prefixed entity IDs. docs/14-contracts.md §1. */

export const ID_PREFIX = {
  document: 'doc',
  documentVersion: 'dv',
  chunk: 'chk',
  questionnaire: 'qst',
  item: 'itm',
  run: 'run',
  answer: 'ans',
  evidence: 'ev',
  conversation: 'conv',
  export: 'exp',
  feedback: 'fb',
} as const

export type EntityKind = keyof typeof ID_PREFIX

const ID_RE = /^[a-z]{2,4}_[0-9A-HJKMNP-TV-Z]{26}$/

export function isPrefixedId(kind: EntityKind, value: string): boolean {
  return value.startsWith(`${ID_PREFIX[kind]}_`) && ID_RE.test(value)
}

/**
 * Zero-padded sequence, six digits, so lexicographic sort-key ordering equals
 * numeric ordering (docs/06-data-model.md §2).
 */
export function seqKey(seq: number): string {
  if (!Number.isInteger(seq) || seq < 0 || seq > 999_999) {
    throw new RangeError(`seq out of range: ${seq}`)
  }
  return String(seq).padStart(6, '0')
}

/** Caller identity. Resolved from the API key — NEVER from request input. */
export interface CallerContext {
  readonly tenantId: string
  readonly aclTags: readonly string[]
  readonly scopes: readonly string[]
  readonly keyId: string
}
