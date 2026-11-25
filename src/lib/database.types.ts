// Generated from the live Worldkin schema (Supabase generate_typescript_types,
// project ekkvwgohpzliwbmjnrth, 25 Nov 2026) — generic helper types trimmed.
// Regenerate after every migration.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

type E = Database['public']['Enums']

export type Database = {
  __InternalSupabase: { PostgrestVersion: '14.18' }
  public: {
    Tables: {
      audit_logs: {
        Row: { action: string; actor_id: string | null; details: Json; entity_id: string | null; entity_type: string; id: number; occurred_at: string; org_id: string | null }
        Insert: { action: string; actor_id?: string | null; details?: Json; entity_id?: string | null; entity_type: string; id?: never; occurred_at?: string; org_id?: string | null }
        Update: { action?: string; actor_id?: string | null; details?: Json; entity_id?: string | null; entity_type?: string; id?: never; occurred_at?: string; org_id?: string | null }
        Relationships: []
      }
      opportunities: {
        Row: {
          cause: E['cause_category']; city: string | null; country_code: string | null; created_at: string; created_by: string
          description: string; id: string; is_sensitive: boolean; mode: E['opportunity_mode']; org_id: string; published_at: string | null
          requirements: string | null; requires_skill_match: boolean; search_vector: unknown; skills_wanted: string[]
          status: E['opportunity_status']; title: string; updated_at: string
        }
        Insert: {
          cause: E['cause_category']; city?: string | null; country_code?: string | null; created_at?: string; created_by?: string
          description: string; id?: string; is_sensitive?: boolean; mode?: E['opportunity_mode']; org_id: string; published_at?: string | null
          requirements?: string | null; requires_skill_match?: boolean; search_vector?: unknown; skills_wanted?: string[]
          status?: E['opportunity_status']; title: string; updated_at?: string
        }
        Update: {
          cause?: E['cause_category']; city?: string | null; country_code?: string | null; created_at?: string; created_by?: string
          description?: string; id?: string; is_sensitive?: boolean; mode?: E['opportunity_mode']; org_id?: string; published_at?: string | null
          requirements?: string | null; requires_skill_match?: boolean; search_vector?: unknown; skills_wanted?: string[]
          status?: E['opportunity_status']; title?: string; updated_at?: string
        }
        Relationships: [
          { foreignKeyName: 'opportunities_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'opportunities_org_id_fkey'; columns: ['org_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null; accepted_by: string | null; created_at: string; email: string; expires_at: string; id: string
          invited_by: string; org_id: string; revoked_at: string | null; role: E['org_role']
        }
        Insert: {
          accepted_at?: string | null; accepted_by?: string | null; created_at?: string; email: string; expires_at?: string; id?: string
          invited_by: string; org_id: string; revoked_at?: string | null; role: E['org_role']
        }
        Update: {
          accepted_at?: string | null; accepted_by?: string | null; created_at?: string; email?: string; expires_at?: string; id?: string
          invited_by?: string; org_id?: string; revoked_at?: string | null; role?: E['org_role']
        }
        Relationships: [
          { foreignKeyName: 'org_invites_accepted_by_fkey'; columns: ['accepted_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'org_invites_invited_by_fkey'; columns: ['invited_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'org_invites_org_id_fkey'; columns: ['org_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] },
        ]
      }
      org_members: {
        Row: { added_by: string | null; created_at: string; org_id: string; role: E['org_role']; user_id: string }
        Insert: { added_by?: string | null; created_at?: string; org_id: string; role: E['org_role']; user_id: string }
        Update: { added_by?: string | null; created_at?: string; org_id?: string; role?: E['org_role']; user_id?: string }
        Relationships: [
          { foreignKeyName: 'org_members_added_by_fkey'; columns: ['added_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'org_members_org_id_fkey'; columns: ['org_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'org_members_user_id_fkey'; columns: ['user_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      organizations: {
        Row: {
          cause: E['cause_category']; country_code: string; created_at: string; created_by: string; description: string | null; id: string
          name: string; reviewed_at: string | null; reviewed_by: string | null; slug: string; status: E['org_status']
          status_reason: string | null; updated_at: string; website: string | null
        }
        Insert: {
          cause: E['cause_category']; country_code: string; created_at?: string; created_by?: string; description?: string | null; id?: string
          name: string; reviewed_at?: string | null; reviewed_by?: string | null; slug: string; status?: E['org_status']
          status_reason?: string | null; updated_at?: string; website?: string | null
        }
        Update: {
          cause?: E['cause_category']; country_code?: string; created_at?: string; created_by?: string; description?: string | null; id?: string
          name?: string; reviewed_at?: string | null; reviewed_by?: string | null; slug?: string; status?: E['org_status']
          status_reason?: string | null; updated_at?: string; website?: string | null
        }
        Relationships: [
          { foreignKeyName: 'organizations_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'organizations_reviewed_by_fkey'; columns: ['reviewed_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      participation_records: {
        Row: { hours: number; id: string; note: string | null; org_id: string; shift_id: string; signup_id: string; verified_at: string; verified_by: string; volunteer_id: string }
        Insert: { hours: number; id?: string; note?: string | null; org_id: string; shift_id: string; signup_id: string; verified_at?: string; verified_by: string; volunteer_id: string }
        Update: { hours?: number; id?: string; note?: string | null; org_id?: string; shift_id?: string; signup_id?: string; verified_at?: string; verified_by?: string; volunteer_id?: string }
        Relationships: [
          { foreignKeyName: 'participation_records_org_id_fkey'; columns: ['org_id']; isOneToOne: false; referencedRelation: 'organizations'; referencedColumns: ['id'] },
          { foreignKeyName: 'participation_records_shift_id_fkey'; columns: ['shift_id']; isOneToOne: false; referencedRelation: 'shifts'; referencedColumns: ['id'] },
          { foreignKeyName: 'participation_records_signup_id_fkey'; columns: ['signup_id']; isOneToOne: true; referencedRelation: 'signups'; referencedColumns: ['id'] },
          { foreignKeyName: 'participation_records_verified_by_fkey'; columns: ['verified_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'participation_records_volunteer_id_fkey'; columns: ['volunteer_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
      profiles: {
        Row: { bio: string | null; city: string | null; country_code: string | null; created_at: string; full_name: string; id: string; platform_role: E['platform_role']; skills: string[]; updated_at: string }
        Insert: { bio?: string | null; city?: string | null; country_code?: string | null; created_at?: string; full_name: string; id: string; platform_role?: E['platform_role']; skills?: string[]; updated_at?: string }
        Update: { bio?: string | null; city?: string | null; country_code?: string | null; created_at?: string; full_name?: string; id?: string; platform_role?: E['platform_role']; skills?: string[]; updated_at?: string }
        Relationships: []
      }
      shifts: {
        Row: {
          cancelled_reason: string | null; capacity: number; created_at: string; created_by: string; ends_at: string; id: string
          opportunity_id: string; org_id: string; starts_at: string; status: E['shift_status']; title: string | null; updated_at: string; waitlist_limit: number
        }
        Insert: {
          cancelled_reason?: string | null; capacity: number; created_at?: string; created_by?: string; ends_at: string; id?: string
          opportunity_id: string; org_id: string; starts_at: string; status?: E['shift_status']; title?: string | null; updated_at?: string; waitlist_limit?: number
        }
        Update: {
          cancelled_reason?: string | null; capacity?: number; created_at?: string; created_by?: string; ends_at?: string; id?: string
          opportunity_id?: string; org_id?: string; starts_at?: string; status?: E['shift_status']; title?: string | null; updated_at?: string; waitlist_limit?: number
        }
        Relationships: [
          { foreignKeyName: 'shifts_created_by_fkey'; columns: ['created_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'shifts_opportunity_org_fkey'; columns: ['opportunity_id', 'org_id']; isOneToOne: false; referencedRelation: 'opportunities'; referencedColumns: ['id', 'org_id'] },
        ]
      }
      signups: {
        Row: {
          attendance_recorded_at: string | null; attendance_recorded_by: string | null; cancel_reason: string | null; cancelled_at: string | null
          cancelled_by: string | null; created_at: string; id: string; idempotency_key: string; org_id: string; promoted_at: string | null
          queue_seq: number; shift_id: string; slot: unknown; status: E['signup_status']; updated_at: string; volunteer_id: string
        }
        Insert: {
          attendance_recorded_at?: string | null; attendance_recorded_by?: string | null; cancel_reason?: string | null; cancelled_at?: string | null
          cancelled_by?: string | null; created_at?: string; id?: string; idempotency_key: string; org_id: string; promoted_at?: string | null
          queue_seq?: never; shift_id: string; slot: unknown; status: E['signup_status']; updated_at?: string; volunteer_id: string
        }
        Update: {
          attendance_recorded_at?: string | null; attendance_recorded_by?: string | null; cancel_reason?: string | null; cancelled_at?: string | null
          cancelled_by?: string | null; created_at?: string; id?: string; idempotency_key?: string; org_id?: string; promoted_at?: string | null
          queue_seq?: never; shift_id?: string; slot?: unknown; status?: E['signup_status']; updated_at?: string; volunteer_id?: string
        }
        Relationships: [
          { foreignKeyName: 'signups_attendance_recorded_by_fkey'; columns: ['attendance_recorded_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'signups_cancelled_by_fkey'; columns: ['cancelled_by']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
          { foreignKeyName: 'signups_shift_org_fkey'; columns: ['shift_id', 'org_id']; isOneToOne: false; referencedRelation: 'shifts'; referencedColumns: ['id', 'org_id'] },
          { foreignKeyName: 'signups_volunteer_id_fkey'; columns: ['volunteer_id']; isOneToOne: false; referencedRelation: 'profiles'; referencedColumns: ['id'] },
        ]
      }
    }
    Views: { [_ in never]: never }
    Functions: {
      accept_org_invite: { Args: { p_invite_id: string }; Returns: Json }
      cancel_shift: { Args: { p_reason: string; p_shift_id: string }; Returns: Json }
      cancel_signup: { Args: { p_reason?: string; p_signup_id: string }; Returns: Json }
      create_organization: {
        Args: { p_cause: E['cause_category']; p_country_code: string; p_description?: string; p_name: string; p_slug: string; p_website?: string }
        Returns: string
      }
      get_shift_roster: {
        Args: { p_shift_id: string }
        Returns: { full_name: string; hours: number; joined_at: string; signup_id: string; skills: string[]; status: E['signup_status']; volunteer_id: string; waitlist_position: number }[]
      }
      invite_org_member: { Args: { p_email: string; p_org_id: string; p_role: E['org_role'] }; Returns: Json }
      is_opportunity_public: { Args: { p_opportunity_id: string }; Returns: boolean }
      is_org_admin: { Args: { p_org_id: string }; Returns: boolean }
      is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      join_shift: { Args: { p_idempotency_key: string; p_shift_id: string }; Returns: Json }
      my_impact: { Args: never; Returns: Json }
      my_org_invites: { Args: never; Returns: { expires_at: string; invite_id: string; org_id: string; org_name: string; role: E['org_role'] }[] }
      org_dashboard: { Args: { p_org_id: string }; Returns: Json }
      record_attendance: { Args: { p_attended: boolean; p_hours?: number; p_note?: string; p_signup_id: string }; Returns: Json }
      remove_org_member: { Args: { p_org_id: string; p_user_id: string }; Returns: Json }
      review_organization: { Args: { p_decision: E['org_status']; p_org_id: string; p_reason?: string }; Returns: Json }
      revoke_org_invite: { Args: { p_invite_id: string }; Returns: Json }
      search_opportunities: {
        Args: {
          p_cause?: E['cause_category']; p_country_code?: string; p_limit?: number; p_mode?: E['opportunity_mode']; p_offset?: number
          p_only_open?: boolean; p_query?: string; p_sort?: string; p_starts_after?: string
        }
        Returns: {
          cause: E['cause_category']; city: string; country_code: string; id: string; is_sensitive: boolean; mode: E['opportunity_mode']
          next_shift_at: string; open_spots: number; org_id: string; org_name: string; published_at: string; title: string
          total_count: number; upcoming_shifts: number
        }[]
      }
      shares_org_with: { Args: { p_user_id: string }; Returns: boolean }
      shift_availability: {
        Args: { p_opportunity_id: string }
        Returns: {
          capacity: number; confirmed: number; ends_at: string; my_signup_id: string; my_status: E['signup_status']; open_spots: number
          shift_id: string; starts_at: string; status: E['shift_status']; title: string; waitlist_limit: number; waitlisted: number
        }[]
      }
      update_shift_capacity: { Args: { p_capacity: number; p_shift_id: string }; Returns: Json }
    }
    Enums: {
      cause_category:
        | 'humanitarian' | 'disaster_response' | 'refugee_support' | 'conflict_relief' | 'food_security' | 'health'
        | 'education' | 'environment' | 'climate' | 'community_development' | 'social_welfare' | 'other'
      opportunity_mode: 'onsite' | 'remote' | 'hybrid'
      opportunity_status: 'draft' | 'published' | 'closed'
      org_role: 'org_admin' | 'coordinator'
      org_status: 'pending' | 'verified' | 'rejected' | 'suspended'
      platform_role: 'volunteer' | 'platform_admin'
      shift_status: 'scheduled' | 'cancelled'
      signup_status: 'confirmed' | 'waitlisted' | 'cancelled' | 'attended' | 'no_show'
    }
    CompositeTypes: { [_ in never]: never }
  }
}

export type Tables<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row']
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T]

export const Constants = {
  public: {
    Enums: {
      cause_category: [
        'humanitarian', 'disaster_response', 'refugee_support', 'conflict_relief', 'food_security', 'health',
        'education', 'environment', 'climate', 'community_development', 'social_welfare', 'other',
      ],
      opportunity_mode: ['onsite', 'remote', 'hybrid'],
      opportunity_status: ['draft', 'published', 'closed'],
      org_role: ['org_admin', 'coordinator'],
      org_status: ['pending', 'verified', 'rejected', 'suspended'],
      platform_role: ['volunteer', 'platform_admin'],
      shift_status: ['scheduled', 'cancelled'],
      signup_status: ['confirmed', 'waitlisted', 'cancelled', 'attended', 'no_show'],
    },
  },
} as const
