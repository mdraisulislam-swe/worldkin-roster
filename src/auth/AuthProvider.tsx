import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { toAppError, unwrap } from '../lib/errors'
import type { Enums, Tables } from '../lib/database.types'
import { confirmationRedirectUrl } from '../lib/authRedirect'

export type Membership = {
  org_id: string
  role: Enums<'org_role'>
  organization: { name: string; slug: string; status: Enums<'org_status'> } | null
}

type AuthState = {
  loading: boolean
  session: Session | null
  profile: Tables<'profiles'> | null
  memberships: Membership[]
  isPlatformAdmin: boolean
  roleIn: (orgId: string) => Enums<'org_role'> | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string, next?: string | null) => Promise<{ needsConfirmation: boolean }>
  resendConfirmation: (email: string) => Promise<void>
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

/**
 * Session + profile + memberships for UI decisions (navigation, guards).
 * UI checks are convenience only — the database enforces every permission.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(supabase !== null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Tables<'profiles'> | null>(null)
  const [memberships, setMemberships] = useState<Membership[]>([])

  const loadUserData = useCallback(async (s: Session | null) => {
    if (!supabase || !s) {
      setProfile(null)
      setMemberships([])
      return
    }
    const uid = s.user.id
    const [p, m] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', uid).maybeSingle(),
      supabase.from('org_members').select('org_id, role, organizations(name, slug, status)').eq('user_id', uid),
    ])
    setProfile(unwrap(p))
    setMemberships(
      (unwrap(m) ?? []).map((r) => ({ org_id: r.org_id, role: r.role, organization: r.organizations ?? null })),
    )
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      await loadUserData(data.session).catch(() => undefined)
      if (active) setLoading(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      // Defer DB calls out of the auth callback (recommended by supabase-js).
      setTimeout(() => void loadUserData(s).catch(() => undefined), 0)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadUserData])

  const value = useMemo<AuthState>(
    () => ({
      loading,
      session,
      profile,
      memberships,
      isPlatformAdmin: profile?.platform_role === 'platform_admin',
      roleIn: (orgId) => memberships.find((m) => m.org_id === orgId)?.role ?? null,
      async signIn(email, password) {
        if (!supabase) throw new Error('Not configured')
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw toAppError(error)
      },
      async signUp(email, password, fullName, next) {
        if (!supabase) throw new Error('Not configured')
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName }, emailRedirectTo: confirmationRedirectUrl(window.location.origin, next) },
        })
        if (error) throw toAppError(error)
        return { needsConfirmation: !data.session }
      },
      async resendConfirmation(email) {
        if (!supabase) throw new Error('Not configured')
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: confirmationRedirectUrl(window.location.origin) },
        })
        if (error) throw toAppError(error)
      },
      async signOut() {
        await supabase?.auth.signOut()
      },
      refresh: () => loadUserData(session),
    }),
    [loading, session, profile, memberships, loadUserData],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// oxlint-disable-next-line react/only-export-components -- hook co-located with its provider
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
