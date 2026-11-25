/**
 * Idempotency keys for "join shift" (A05). One key per user intent:
 * - the same key is reused if the request is retried (double click,
 *   network error, timeout) so the database returns the original result
 *   instead of creating a second signup;
 * - the key is released once the server gave a definitive answer, so a
 *   later, deliberate new attempt gets a fresh key.
 */
export class IdempotencyKeys {
  private readonly keys = new Map<string, string>()
  private readonly generate: () => string

  constructor(generate: () => string = () => crypto.randomUUID()) {
    this.generate = generate
  }

  keyFor(scope: string): string {
    let key = this.keys.get(scope)
    if (!key) {
      key = this.generate()
      this.keys.set(scope, key)
    }
    return key
  }

  /** Call after a definitive server answer (success or business-rule error). */
  release(scope: string): void {
    this.keys.delete(scope)
  }
}

export const joinKeys = new IdempotencyKeys()
