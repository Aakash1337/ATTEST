/** Stable error codes. docs/14-contracts.md §7. Codes are API surface; wording is not. */

export const ERROR_CODE = {
  validation_failed: 422,
  unknown_acl_tag: 422,
  questionnaire_not_normalised: 409,
  unsupported_format: 422,
  idempotency_conflict: 409,
  estimate_exceeds_cap: 409,
  evidence_stale: 409,
  run_not_cancellable: 409,
  illegal_transition: 409,
  rate_limited: 429,
  upstream_unavailable: 503,
} as const

export type ErrorCode = keyof typeof ERROR_CODE

export class AttestError extends Error {
  override readonly name = 'AttestError'
  readonly status: number
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.status = ERROR_CODE[code]
  }

  /** RFC 9457 problem+json. */
  toProblem(instance?: string): Record<string, unknown> {
    return {
      type: `https://attest.dev/errors/${this.code.replace(/_/g, '-')}`,
      title: this.message,
      status: this.status,
      code: this.code,
      ...(instance ? { instance } : {}),
      ...(this.details === undefined ? {} : { errors: this.details }),
    }
  }
}
