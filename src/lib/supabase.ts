import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { envResult } from './env'

/**
 * Single browser client. Uses ONLY the publishable key; every permission is
 * enforced in the database (RLS, column grants, SECURITY DEFINER RPCs).
 * Null when configuration is invalid — the app then shows ConfigErrorPage.
 */
export const supabase: SupabaseClient<Database> | null = envResult.ok
  ? createClient<Database>(envResult.env.VITE_SUPABASE_URL, envResult.env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : null

export function db(): SupabaseClient<Database> {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}
