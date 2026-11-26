/**
 * Request timeouts for every Supabase call (Auth, Data API, Storage).
 * A hung request (provider outage, captive portal, lost connection) is aborted
 * instead of leaving a spinner forever; the caller then shows a retry message.
 * Callers' own abort signals keep working. No automatic retries happen here.
 */
export const API_TIMEOUT_MS = 15_000
export const UPLOAD_TIMEOUT_MS = 60_000

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`The service did not respond within ${Math.round(ms / 1000)} seconds`)
    this.name = 'TimeoutError'
  }
}

export function timeoutFor(url: string): number {
  return url.includes('/storage/v1/') ? UPLOAD_TIMEOUT_MS : API_TIMEOUT_MS
}

export function makeTimeoutFetch(base: typeof fetch, pick: (url: string) => number = timeoutFor): typeof fetch {
  return (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const ms = pick(url)
    const controller = new AbortController()
    const outer = init?.signal
    if (outer) {
      if (outer.aborted) controller.abort(outer.reason)
      else outer.addEventListener('abort', () => controller.abort(outer.reason), { once: true })
    }
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; controller.abort() }, ms)
    return base(input, { ...init, signal: controller.signal })
      .catch((e: unknown) => { throw timedOut ? new TimeoutError(ms) : e })
      .finally(() => clearTimeout(timer))
  }
}
