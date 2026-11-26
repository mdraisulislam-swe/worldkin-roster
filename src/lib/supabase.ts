import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { envResult } from './env'
import { makeTimeoutFetch } from './net'
import { recoveryLandingPath } from './authRedirect'

/**
 * Single browser client. Uses ONLY the publishable key; every permission is
 * enforced in the database (RLS, column grants, SECURITY DEFINER RPCs).
 * Null when configuration is invalid — the app then shows ConfigErrorPage.
 */
// Runs before the client reads the URL and before the router is created (this module is imported first).
if (typeof window !== 'undefined') {
  const to = recoveryLandingPath(window.location.pathname, window.location.hash)
  if (to) window.history.replaceState(window.history.state, '', to + window.location.hash)
}

export const supabase: SupabaseClient<Database> | null = envResult.ok
  ? createClient<Database>(envResult.env.VITE_SUPABASE_URL, envResult.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      // Every Auth / Data API / Storage request gets a timeout (no automatic retries).
      global: { fetch: makeTimeoutFetch(fetch.bind(globalThis)) },
    })
  : null

export function db(): SupabaseClient<Database> {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}
