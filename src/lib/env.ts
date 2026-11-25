import { z } from 'zod'

/**
 * Worldkin isolation guard: the app may only ever talk to the Worldkin
 * Supabase project. A wrong URL (e.g. another project's) is rejected at
 * startup instead of silently sending data elsewhere.
 */
export const WORLDKIN_SUPABASE_URL = 'https://ekkvwgohpzliwbmjnrth.supabase.co'

const EnvSchema = z.object({
  VITE_SUPABASE_URL: z.literal(WORLDKIN_SUPABASE_URL, {
    error: `VITE_SUPABASE_URL must be ${WORLDKIN_SUPABASE_URL}`,
  }),
  VITE_SUPABASE_PUBLISHABLE_KEY: z
    .string({ error: 'VITE_SUPABASE_PUBLISHABLE_KEY is missing' })
    .min(20, 'VITE_SUPABASE_PUBLISHABLE_KEY looks invalid')
    .refine((k) => !k.startsWith('sb_secret_'), 'A SECRET key must never be used in the browser')
    // Catches placeholder text, quotes or stray whitespace pasted into the
    // hosting dashboard, which otherwise surface only as "Invalid API key".
    .refine(
      (k) => /^sb_publishable_[A-Za-z0-9_-]+$/.test(k) || /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(k),
      'VITE_SUPABASE_PUBLISHABLE_KEY must be the project publishable key (sb_publishable_…) with no spaces or quotes',
    ),
})

export type AppEnv = z.infer<typeof EnvSchema>

export function parseEnv(raw: Record<string, unknown>):
  | { ok: true; env: AppEnv }
  | { ok: false; problems: string[] } {
  const result = EnvSchema.safeParse(raw)
  if (result.success) return { ok: true, env: result.data }
  return { ok: false, problems: result.error.issues.map((i) => i.message) }
}

export const envResult = parseEnv(import.meta.env)
