/**
 * Central error handling. The database raises stable machine codes
 * ("WK_...") from RPCs and triggers; PostgREST/Postgres raise standard
 * SQLSTATE codes. Both are mapped to one user-facing message here.
 */
export const WK_MESSAGES: Record<string, string> = {
  WK_AUTH_REQUIRED: 'Please sign in to continue.',
  WK_INVALID_INPUT: 'Some of the information is invalid. Please check the form.',
  WK_FORBIDDEN: 'You do not have permission to do that.',
  WK_SHIFT_NOT_FOUND: 'This shift could not be found.',
  WK_SHIFT_NOT_OPEN: 'This shift is not open for sign-ups.',
  WK_SHIFT_CANCELLED: 'This shift has been cancelled.',
  WK_SHIFT_STARTED: 'This shift has already started.',
  WK_SHIFT_NOT_STARTED: 'Attendance can only be recorded after the shift starts.',
  WK_SHIFT_FULL: 'This shift and its waitlist are full.',
  WK_NOT_ELIGIBLE: 'This opportunity requires at least one of its listed skills. Add a matching skill to your profile.',
  WK_ALREADY_SIGNED_UP: 'You already have a place on this shift.',
  WK_DUPLICATE_REQUEST: 'This request was already processed.',
  WK_IDEMPOTENCY_KEY_REUSED: 'Please try again.',
  WK_SCHEDULE_CONFLICT: 'You already have a shift at an overlapping time.',
  WK_CAPACITY_BELOW_CONFIRMED: 'Capacity cannot be lower than the number of confirmed volunteers.',
  WK_SIGNUP_NOT_FOUND: 'This sign-up could not be found.',
  WK_INVALID_STATE: 'This action is not possible in the current state.',
  WK_REASON_REQUIRED: 'Please give a reason.',
  WK_SELF_VERIFICATION: 'You cannot verify your own attendance.',
  WK_ALREADY_RECORDED: 'Attendance has already been recorded and cannot be changed.',
  WK_ATTENDANCE_WINDOW_CLOSED: 'The attendance window (7 days after the shift) has closed.',
  WK_INVALID_HOURS: 'Hours must be more than 0 and no longer than the shift.',
  WK_ORG_NOT_FOUND: 'Organization not found.',
  WK_ORG_NOT_VERIFIED: 'The organization must be verified first.',
  WK_CONFLICT_OF_INTEREST: 'You cannot review an organization you belong to.',
  WK_INVALID_TRANSITION: 'That status change is not allowed.',
  WK_SLUG_TAKEN: 'That short name (slug) is already taken.',
  WK_TOO_MANY_PENDING_ORGS: 'You already have 3 organizations awaiting review.',
  WK_ALREADY_INVITED: 'An open invite for this email already exists.',
  WK_TOO_MANY_INVITES: 'This organization has too many open invites.',
  WK_INVITE_NOT_FOUND: 'This invite is not available (it may have expired or been revoked).',
  WK_MEMBER_NOT_FOUND: 'Member not found.',
  WK_LAST_ADMIN: 'An organization must keep at least one admin.',
  WK_FORBIDDEN_ROLE_CHANGE: 'Roles cannot be changed here.',
  WK_IMMUTABLE_FIELD: 'This field cannot be changed.',
  WK_APPEND_ONLY: 'This record cannot be changed.',
  WK_SHIFT_IN_PAST: 'Shifts must start in the future.',
  WK_SHIFT_HAS_SIGNUPS: 'Shift times cannot change after volunteers have signed up.',
  WK_OPPORTUNITY_CLOSED: 'This opportunity is closed.',
  WK_OPPORTUNITY_NOT_FOUND: 'This opportunity could not be found.',
  WK_APPLICATION_REQUIRED: 'This opportunity selects volunteers by application. Apply first — the organization will send you an offer.',
  WK_APPLICATION_NOT_REQUIRED: 'This opportunity has open sign-up. Join a shift directly.',
  WK_APPLICATION_DEADLINE_PASSED: 'The application deadline has passed.',
  WK_ALREADY_APPLIED: 'You already have an active application for this opportunity.',
  WK_APPLICATION_NOT_FOUND: 'This application could not be found.',
  WK_OFFER_NOT_FOUND: 'This offer could not be found.',
  WK_OFFER_EXISTS: 'This applicant already has an open or accepted offer.',
  WK_OFFER_EXPIRED: 'This offer has expired and can no longer be accepted.',
  WK_OFFER_REVOKED: 'The organization withdrew this offer.',
  WK_OFFER_DECLINED: 'This offer was declined.',
  WK_SHIFT_MISMATCH: 'That shift does not belong to this opportunity.',
  WK_ACCOUNT_SUSPENDED: 'Your account is suspended. Contact the Worldkin team if you think this is a mistake.',
  WK_ALREADY_REVIEWED: 'You have already left feedback for this participation.',
  WK_PARTICIPATION_NOT_FOUND: 'Feedback is only possible after verified participation.',
  WK_TOO_MANY_COMPLAINTS: 'You have 5 open complaints. Please wait for a response before filing another.',
  WK_COMPLAINT_NOT_FOUND: 'This complaint could not be found.',
  WK_USER_NOT_FOUND: 'User not found.',
}

const SQLSTATE_MESSAGES: Record<string, string> = {
  '42501': 'You do not have permission to do that.',
  '23505': 'This already exists.',
  '23514': 'Some of the information is invalid. Please check the form.',
  '23P01': 'This conflicts with an existing booking.',
  PGRST301: 'Your session has expired. Please sign in again.',
}

export class AppError extends Error {
  readonly code: string | undefined
  readonly retryable: boolean
  constructor(message: string, code?: string, retryable = false) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.retryable = retryable
  }
}

type Raw = { message?: unknown; code?: unknown; name?: unknown; status?: unknown } | null | undefined

export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  const raw = err as Raw
  const message = typeof raw?.message === 'string' ? raw.message : ''
  const code = typeof raw?.code === 'string' ? raw.code : undefined
  const status = typeof raw?.status === 'number' ? raw.status : undefined
  const name = typeof raw?.name === 'string' ? raw.name : ''

  const wk = message.match(/\bWK_[A-Z_]+\b/)?.[0]
  if (wk) return new AppError(WK_MESSAGES[wk] ?? 'The request was rejected.', wk)
  if (code && SQLSTATE_MESSAGES[code]) return new AppError(SQLSTATE_MESSAGES[code], code)
  if (name === 'TimeoutError' || name === 'AbortError' || /did not respond within|timed? ?out/i.test(message)) {
    return new AppError('The service is taking too long to respond. Check your connection and try again in a moment.', 'TIMEOUT', true)
  }
  if (status === 429 || /rate limit|too many requests/i.test(message) || code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') {
    return new AppError('Too many attempts. Please wait a few minutes and try again.', 'AUTH_RATE_LIMIT', true)
  }
  if (/error sending .*email|smtp|email.*(could not|failed).*send/i.test(message)) {
    return new AppError('We could not send the email right now. Please use "Resend" in a few minutes; if it keeps failing, try again later.', 'EMAIL_DELIVERY', true)
  }
  if (err instanceof TypeError || /fetch|network|failed to fetch/i.test(message)) {
    return new AppError('Network problem. Check your connection and try again.', 'NETWORK', true)
  }
  if (/invalid login credentials/i.test(message)) return new AppError('Email or password is incorrect.', 'AUTH_INVALID')
  if (/email not confirmed/i.test(message) || code === 'email_not_confirmed') return new AppError('Please verify your email address first. Enter the code we emailed you, or request a new one below.', 'AUTH_UNCONFIRMED')
  if (code === 'otp_expired' || /token has expired or is invalid|otp.*(expired|invalid)/i.test(message)) return new AppError('That code is incorrect or has expired. Check the newest email, or request a new code.', 'AUTH_OTP_INVALID')
  if (/user already registered/i.test(message) || code === 'user_already_exists') return new AppError('An account with this email may already exist. Try signing in instead.', 'AUTH_EXISTS')
  if (status !== undefined && status >= 500) return new AppError('The service is temporarily unavailable. Please try again in a few minutes.', 'SERVICE_UNAVAILABLE', true)
  return new AppError(message || 'Something went wrong. Please try again.', code, true)
}

/** Unwrap a Supabase { data, error } result or throw an AppError. */
export function unwrap<T>(res: { data: T; error: unknown }): T {
  if (res.error) throw toAppError(res.error)
  return res.data
}
