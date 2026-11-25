export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      application_notes: {
        Row: {
          application_id: string
          note: string
          org_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          application_id: string
          note: string
          org_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          application_id?: string
          note?: string
          org_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "application_notes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_notes_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_notes_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      applications: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          message: string | null
          opportunity_id: string
          org_id: string
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
          volunteer_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          message?: string | null
          opportunity_id: string
          org_id: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          volunteer_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          message?: string | null
          opportunity_id?: string
          org_id?: string
          status?: Database["public"]["Enums"]["application_status"]
          updated_at?: string
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "applications_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "applications_opportunity_org_fkey"
            columns: ["opportunity_id", "org_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "applications_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          details: Json
          entity_id: string | null
          entity_type: string
          id: number
          occurred_at: string
          org_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          details?: Json
          entity_id?: string | null
          entity_type: string
          id?: never
          occurred_at?: string
          org_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          details?: Json
          entity_id?: string | null
          entity_type?: string
          id?: never
          occurred_at?: string
          org_id?: string | null
        }
        Relationships: []
      }
      complaints: {
        Row: {
          admin_response: string | null
          created_at: string
          description: string
          handled_at: string | null
          handled_by: string | null
          id: string
          opportunity_id: string | null
          org_id: string | null
          reporter_id: string
          status: Database["public"]["Enums"]["complaint_status"]
          subject: string
          updated_at: string
        }
        Insert: {
          admin_response?: string | null
          created_at?: string
          description: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          opportunity_id?: string | null
          org_id?: string | null
          reporter_id: string
          status?: Database["public"]["Enums"]["complaint_status"]
          subject: string
          updated_at?: string
        }
        Update: {
          admin_response?: string | null
          created_at?: string
          description?: string
          handled_at?: string | null
          handled_by?: string | null
          id?: string
          opportunity_id?: string | null
          org_id?: string | null
          reporter_id?: string
          status?: Database["public"]["Enums"]["complaint_status"]
          subject?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_handled_by_fkey"
            columns: ["handled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_reason: string | null
          opportunity_id: string
          org_id: string
          participation_id: string
          rating: number
          status: Database["public"]["Enums"]["feedback_status"]
          volunteer_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          opportunity_id: string
          org_id: string
          participation_id: string
          rating: number
          status?: Database["public"]["Enums"]["feedback_status"]
          volunteer_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_reason?: string | null
          opportunity_id?: string
          org_id?: string
          participation_id?: string
          rating?: number
          status?: Database["public"]["Enums"]["feedback_status"]
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_moderated_by_fkey"
            columns: ["moderated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_participation_id_fkey"
            columns: ["participation_id"]
            isOneToOne: true
            referencedRelation: "participation_records"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          kind: string
          link: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          kind: string
          link?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          kind?: string
          link?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          application_id: string
          created_at: string
          created_by: string
          expires_at: string
          id: string
          message: string | null
          org_id: string
          responded_at: string | null
          shift_id: string
          signup_id: string | null
          status: Database["public"]["Enums"]["offer_status"]
          updated_at: string
          volunteer_id: string
        }
        Insert: {
          application_id: string
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          message?: string | null
          org_id: string
          responded_at?: string | null
          shift_id: string
          signup_id?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          updated_at?: string
          volunteer_id: string
        }
        Update: {
          application_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          message?: string | null
          org_id?: string
          responded_at?: string | null
          shift_id?: string
          signup_id?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
          updated_at?: string
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offers_application_org_fkey"
            columns: ["application_id", "org_id"]
            isOneToOne: false
            referencedRelation: "applications"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "offers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_shift_org_fkey"
            columns: ["shift_id", "org_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "offers_signup_id_fkey"
            columns: ["signup_id"]
            isOneToOne: false
            referencedRelation: "signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offers_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          application_deadline: string | null
          cause: Database["public"]["Enums"]["cause_category"]
          city: string | null
          compensation_details: string | null
          compensation_type: Database["public"]["Enums"]["compensation_type"]
          country_code: string | null
          created_at: string
          created_by: string
          description: string
          id: string
          is_sensitive: boolean
          mode: Database["public"]["Enums"]["opportunity_mode"]
          moderated_at: string | null
          moderation_reason: string | null
          org_id: string
          published_at: string | null
          requirements: string | null
          requires_skill_match: boolean
          search_vector: unknown
          selection_mode: Database["public"]["Enums"]["selection_mode"]
          skills_wanted: string[]
          status: Database["public"]["Enums"]["opportunity_status"]
          title: string
          updated_at: string
        }
        Insert: {
          application_deadline?: string | null
          cause: Database["public"]["Enums"]["cause_category"]
          city?: string | null
          compensation_details?: string | null
          compensation_type?: Database["public"]["Enums"]["compensation_type"]
          country_code?: string | null
          created_at?: string
          created_by?: string
          description: string
          id?: string
          is_sensitive?: boolean
          mode?: Database["public"]["Enums"]["opportunity_mode"]
          moderated_at?: string | null
          moderation_reason?: string | null
          org_id: string
          published_at?: string | null
          requirements?: string | null
          requires_skill_match?: boolean
          search_vector?: unknown
          selection_mode?: Database["public"]["Enums"]["selection_mode"]
          skills_wanted?: string[]
          status?: Database["public"]["Enums"]["opportunity_status"]
          title: string
          updated_at?: string
        }
        Update: {
          application_deadline?: string | null
          cause?: Database["public"]["Enums"]["cause_category"]
          city?: string | null
          compensation_details?: string | null
          compensation_type?: Database["public"]["Enums"]["compensation_type"]
          country_code?: string | null
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          is_sensitive?: boolean
          mode?: Database["public"]["Enums"]["opportunity_mode"]
          moderated_at?: string | null
          moderation_reason?: string | null
          org_id?: string
          published_at?: string | null
          requirements?: string | null
          requires_skill_match?: boolean
          search_vector?: unknown
          selection_mode?: Database["public"]["Enums"]["selection_mode"]
          skills_wanted?: string[]
          status?: Database["public"]["Enums"]["opportunity_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          org_id: string
          revoked_at: string | null
          role: Database["public"]["Enums"]["org_role"]
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          org_id: string
          revoked_at?: string | null
          role: Database["public"]["Enums"]["org_role"]
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          org_id?: string
          revoked_at?: string | null
          role?: Database["public"]["Enums"]["org_role"]
        }
        Relationships: [
          {
            foreignKeyName: "org_invites_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_invites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_members: {
        Row: {
          added_by: string | null
          created_at: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_private: {
        Row: {
          address: string | null
          org_id: string
          registration_id: string | null
          representative_name: string | null
          representative_role: string | null
          updated_at: string
          verification_docs: string[]
        }
        Insert: {
          address?: string | null
          org_id: string
          registration_id?: string | null
          representative_name?: string | null
          representative_role?: string | null
          updated_at?: string
          verification_docs?: string[]
        }
        Update: {
          address?: string | null
          org_id?: string
          registration_id?: string | null
          representative_name?: string | null
          representative_role?: string | null
          updated_at?: string
          verification_docs?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "organization_private_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          cause: Database["public"]["Enums"]["cause_category"]
          city: string | null
          country_code: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          logo_url: string | null
          name: string
          official_email: string | null
          org_type: Database["public"]["Enums"]["org_type"]
          phone: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          status: Database["public"]["Enums"]["org_status"]
          status_reason: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          cause: Database["public"]["Enums"]["cause_category"]
          city?: string | null
          country_code: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name: string
          official_email?: string | null
          org_type?: Database["public"]["Enums"]["org_type"]
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug: string
          status?: Database["public"]["Enums"]["org_status"]
          status_reason?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          cause?: Database["public"]["Enums"]["cause_category"]
          city?: string | null
          country_code?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          official_email?: string | null
          org_type?: Database["public"]["Enums"]["org_type"]
          phone?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug?: string
          status?: Database["public"]["Enums"]["org_status"]
          status_reason?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organizations_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      participation_records: {
        Row: {
          hours: number
          id: string
          note: string | null
          org_id: string
          shift_id: string
          signup_id: string
          verified_at: string
          verified_by: string
          volunteer_id: string
        }
        Insert: {
          hours: number
          id?: string
          note?: string | null
          org_id: string
          shift_id: string
          signup_id: string
          verified_at?: string
          verified_by: string
          volunteer_id: string
        }
        Update: {
          hours?: number
          id?: string
          note?: string | null
          org_id?: string
          shift_id?: string
          signup_id?: string
          verified_at?: string
          verified_by?: string
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participation_records_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participation_records_shift_id_fkey"
            columns: ["shift_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participation_records_signup_id_fkey"
            columns: ["signup_id"]
            isOneToOne: true
            referencedRelation: "signups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participation_records_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participation_records_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_private: {
        Row: {
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_private_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          availability: string | null
          avatar_url: string | null
          bio: string | null
          city: string | null
          country_code: string | null
          created_at: string
          education: string | null
          experience: string | null
          full_name: string
          id: string
          interests: string[]
          languages: string[]
          platform_role: Database["public"]["Enums"]["platform_role"]
          skills: string[]
          suspended_at: string | null
          updated_at: string
        }
        Insert: {
          availability?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          education?: string | null
          experience?: string | null
          full_name: string
          id: string
          interests?: string[]
          languages?: string[]
          platform_role?: Database["public"]["Enums"]["platform_role"]
          skills?: string[]
          suspended_at?: string | null
          updated_at?: string
        }
        Update: {
          availability?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          country_code?: string | null
          created_at?: string
          education?: string | null
          experience?: string | null
          full_name?: string
          id?: string
          interests?: string[]
          languages?: string[]
          platform_role?: Database["public"]["Enums"]["platform_role"]
          skills?: string[]
          suspended_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      shifts: {
        Row: {
          cancelled_reason: string | null
          capacity: number
          created_at: string
          created_by: string
          ends_at: string
          id: string
          opportunity_id: string
          org_id: string
          starts_at: string
          status: Database["public"]["Enums"]["shift_status"]
          title: string | null
          updated_at: string
          waitlist_limit: number
        }
        Insert: {
          cancelled_reason?: string | null
          capacity: number
          created_at?: string
          created_by?: string
          ends_at: string
          id?: string
          opportunity_id: string
          org_id: string
          starts_at: string
          status?: Database["public"]["Enums"]["shift_status"]
          title?: string | null
          updated_at?: string
          waitlist_limit?: number
        }
        Update: {
          cancelled_reason?: string | null
          capacity?: number
          created_at?: string
          created_by?: string
          ends_at?: string
          id?: string
          opportunity_id?: string
          org_id?: string
          starts_at?: string
          status?: Database["public"]["Enums"]["shift_status"]
          title?: string | null
          updated_at?: string
          waitlist_limit?: number
        }
        Relationships: [
          {
            foreignKeyName: "shifts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shifts_opportunity_org_fkey"
            columns: ["opportunity_id", "org_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id", "org_id"]
          },
        ]
      }
      signups: {
        Row: {
          attendance_recorded_at: string | null
          attendance_recorded_by: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          id: string
          idempotency_key: string
          org_id: string
          promoted_at: string | null
          queue_seq: number
          shift_id: string
          slot: unknown
          status: Database["public"]["Enums"]["signup_status"]
          updated_at: string
          volunteer_id: string
        }
        Insert: {
          attendance_recorded_at?: string | null
          attendance_recorded_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          idempotency_key: string
          org_id: string
          promoted_at?: string | null
          queue_seq?: never
          shift_id: string
          slot: unknown
          status: Database["public"]["Enums"]["signup_status"]
          updated_at?: string
          volunteer_id: string
        }
        Update: {
          attendance_recorded_at?: string | null
          attendance_recorded_by?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string
          org_id?: string
          promoted_at?: string | null
          queue_seq?: never
          shift_id?: string
          slot?: unknown
          status?: Database["public"]["Enums"]["signup_status"]
          updated_at?: string
          volunteer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "signups_attendance_recorded_by_fkey"
            columns: ["attendance_recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signups_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "signups_shift_org_fkey"
            columns: ["shift_id", "org_id"]
            isOneToOne: false
            referencedRelation: "shifts"
            referencedColumns: ["id", "org_id"]
          },
          {
            foreignKeyName: "signups_volunteer_id_fkey"
            columns: ["volunteer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _assert_active: { Args: { p_uid: string }; Returns: undefined }
      _expire_offers: { Args: never; Returns: undefined }
      _is_api_request: { Args: never; Returns: boolean }
      _join_shift_core: {
        Args: {
          p_idempotency_key: string
          p_shift_id: string
          p_uid: string
          p_via_offer: boolean
        }
        Returns: Json
      }
      _notify: {
        Args: {
          p_body: string
          p_kind: string
          p_link: string
          p_title: string
          p_user: string
        }
        Returns: undefined
      }
      _notify_org_admins: {
        Args: {
          p_body: string
          p_kind: string
          p_link: string
          p_org: string
          p_title: string
        }
        Returns: undefined
      }
      _promote_waitlist: { Args: { p_shift_id: string }; Returns: string[] }
      _signup_result: {
        Args: {
          p_replayed: boolean
          p_signup: Database["public"]["Tables"]["signups"]["Row"]
        }
        Returns: Json
      }
      accept_offer: {
        Args: { p_idempotency_key: string; p_offer_id: string }
        Returns: Json
      }
      accept_org_invite: { Args: { p_invite_id: string }; Returns: Json }
      admin_moderate_opportunity: {
        Args: { p_opportunity_id: string; p_reason: string }
        Returns: undefined
      }
      admin_overview: { Args: never; Returns: Json }
      admin_set_suspension: {
        Args: { p_reason?: string; p_suspend: boolean; p_user_id: string }
        Returns: undefined
      }
      admin_users: {
        Args: { p_limit?: number; p_offset?: number; p_query?: string }
        Returns: {
          application_count: number
          city: string
          country_code: string
          created_at: string
          email: string
          full_name: string
          org_count: number
          platform_role: Database["public"]["Enums"]["platform_role"]
          signup_count: number
          suspended_at: string
          suspended_reason: string
          total_count: number
          user_id: string
        }[]
      }
      apply_to_opportunity: {
        Args: { p_message?: string; p_opportunity_id: string }
        Returns: Json
      }
      cancel_shift: {
        Args: { p_reason: string; p_shift_id: string }
        Returns: Json
      }
      cancel_signup: {
        Args: { p_reason?: string; p_signup_id: string }
        Returns: Json
      }
      create_organization: {
        Args: {
          p_address?: string
          p_cause: Database["public"]["Enums"]["cause_category"]
          p_city?: string
          p_country_code: string
          p_description?: string
          p_name: string
          p_official_email?: string
          p_org_type?: Database["public"]["Enums"]["org_type"]
          p_phone?: string
          p_registration_id?: string
          p_representative_name?: string
          p_representative_role?: string
          p_slug: string
          p_website?: string
        }
        Returns: string
      }
      decline_offer: { Args: { p_offer_id: string }; Returns: undefined }
      docs_in_org_folder: {
        Args: { p_docs: string[]; p_org: string }
        Returns: boolean
      }
      get_shift_roster: {
        Args: { p_shift_id: string }
        Returns: {
          full_name: string
          hours: number
          joined_at: string
          signup_id: string
          skills: string[]
          status: Database["public"]["Enums"]["signup_status"]
          volunteer_id: string
          waitlist_position: number
        }[]
      }
      invite_org_member: {
        Args: {
          p_email: string
          p_org_id: string
          p_role: Database["public"]["Enums"]["org_role"]
        }
        Returns: Json
      }
      is_opportunity_public: {
        Args: { p_opportunity_id: string }
        Returns: boolean
      }
      is_org_admin: { Args: { p_org_id: string }; Returns: boolean }
      is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      join_shift: {
        Args: { p_idempotency_key: string; p_shift_id: string }
        Returns: Json
      }
      list_organizations: {
        Args: {
          p_cause?: Database["public"]["Enums"]["cause_category"]
          p_country_code?: string
          p_limit?: number
          p_offset?: number
          p_org_type?: Database["public"]["Enums"]["org_type"]
          p_query?: string
        }
        Returns: {
          average_rating: number
          cause: Database["public"]["Enums"]["cause_category"]
          city: string
          country_code: string
          description: string
          id: string
          logo_url: string
          name: string
          org_type: Database["public"]["Enums"]["org_type"]
          published_opportunities: number
          review_count: number
          slug: string
          total_count: number
          website: string
        }[]
      }
      moderate_feedback: {
        Args: {
          p_feedback_id: string
          p_reason?: string
          p_status: Database["public"]["Enums"]["feedback_status"]
        }
        Returns: undefined
      }
      my_applications: {
        Args: never
        Returns: {
          application_id: string
          created_at: string
          decision_reason: string
          message: string
          offer_expires_at: string
          offer_id: string
          offer_message: string
          offer_status: Database["public"]["Enums"]["offer_status"]
          opportunity_id: string
          opportunity_title: string
          org_id: string
          org_name: string
          shift_ends_at: string
          shift_id: string
          shift_starts_at: string
          shift_title: string
          signup_id: string
          signup_status: Database["public"]["Enums"]["signup_status"]
          status: Database["public"]["Enums"]["application_status"]
          updated_at: string
        }[]
      }
      my_impact: { Args: never; Returns: Json }
      my_org_invites: {
        Args: never
        Returns: {
          expires_at: string
          invite_id: string
          org_id: string
          org_name: string
          role: Database["public"]["Enums"]["org_role"]
        }[]
      }
      my_participation: {
        Args: never
        Returns: {
          cause: Database["public"]["Enums"]["cause_category"]
          ends_at: string
          feedback_id: string
          feedback_rating: number
          hours: number
          opportunity_id: string
          opportunity_title: string
          org_id: string
          org_name: string
          participation_id: string
          shift_id: string
          shift_title: string
          starts_at: string
          verified_at: string
        }[]
      }
      org_applications: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_opportunity_id?: string
          p_org_id: string
          p_status?: Database["public"]["Enums"]["application_status"]
        }
        Returns: {
          applicant_availability: string
          applicant_bio: string
          applicant_city: string
          applicant_country: string
          applicant_education: string
          applicant_experience: string
          applicant_interests: string[]
          applicant_languages: string[]
          applicant_name: string
          applicant_skills: string[]
          applicant_verified_hours: number
          application_id: string
          created_at: string
          decision_reason: string
          message: string
          note: string
          offer_expires_at: string
          offer_id: string
          offer_status: Database["public"]["Enums"]["offer_status"]
          opportunity_id: string
          opportunity_title: string
          shift_id: string
          shift_starts_at: string
          signup_status: Database["public"]["Enums"]["signup_status"]
          status: Database["public"]["Enums"]["application_status"]
          total_count: number
          volunteer_id: string
        }[]
      }
      org_dashboard: { Args: { p_org_id: string }; Returns: Json }
      org_feedback: {
        Args: { p_limit?: number; p_offset?: number; p_org_id: string }
        Returns: {
          average_rating: number
          comment: string
          created_at: string
          feedback_id: string
          opportunity_title: string
          rating: number
          reviewer_first_name: string
          total_count: number
        }[]
      }
      platform_stats: { Args: never; Returns: Json }
      record_attendance: {
        Args: {
          p_attended: boolean
          p_hours?: number
          p_note?: string
          p_signup_id: string
        }
        Returns: Json
      }
      remove_org_member: {
        Args: { p_org_id: string; p_user_id: string }
        Returns: Json
      }
      respond_complaint: {
        Args: {
          p_complaint_id: string
          p_response?: string
          p_status: Database["public"]["Enums"]["complaint_status"]
        }
        Returns: undefined
      }
      review_application: {
        Args: {
          p_action: string
          p_application_id: string
          p_note?: string
          p_reason?: string
        }
        Returns: undefined
      }
      review_organization: {
        Args: {
          p_decision: Database["public"]["Enums"]["org_status"]
          p_org_id: string
          p_reason?: string
        }
        Returns: Json
      }
      revoke_offer: {
        Args: { p_offer_id: string; p_reason?: string }
        Returns: undefined
      }
      revoke_org_invite: { Args: { p_invite_id: string }; Returns: Json }
      search_opportunities: {
        Args: {
          p_cause?: Database["public"]["Enums"]["cause_category"]
          p_city?: string
          p_compensation?: Database["public"]["Enums"]["compensation_type"]
          p_country_code?: string
          p_limit?: number
          p_mode?: Database["public"]["Enums"]["opportunity_mode"]
          p_offset?: number
          p_only_open?: boolean
          p_org_id?: string
          p_query?: string
          p_skill?: string
          p_sort?: string
          p_starts_after?: string
        }
        Returns: {
          application_deadline: string
          cause: Database["public"]["Enums"]["cause_category"]
          city: string
          compensation_details: string
          compensation_type: Database["public"]["Enums"]["compensation_type"]
          country_code: string
          id: string
          is_sensitive: boolean
          mode: Database["public"]["Enums"]["opportunity_mode"]
          next_shift_at: string
          open_spots: number
          org_id: string
          org_name: string
          org_slug: string
          published_at: string
          selection_mode: Database["public"]["Enums"]["selection_mode"]
          skills_wanted: string[]
          title: string
          total_count: number
          upcoming_shifts: number
        }[]
      }
      send_offer: {
        Args: {
          p_application_id: string
          p_message?: string
          p_shift_id: string
        }
        Returns: Json
      }
      shares_org_with: { Args: { p_user_id: string }; Returns: boolean }
      shift_availability: {
        Args: { p_opportunity_id: string }
        Returns: {
          capacity: number
          confirmed: number
          ends_at: string
          my_signup_id: string
          my_status: Database["public"]["Enums"]["signup_status"]
          open_spots: number
          shift_id: string
          starts_at: string
          status: Database["public"]["Enums"]["shift_status"]
          title: string
          waitlist_limit: number
          waitlisted: number
        }[]
      }
      submit_complaint: {
        Args: {
          p_description: string
          p_opportunity_id?: string
          p_org_id?: string
          p_subject: string
        }
        Returns: string
      }
      submit_feedback: {
        Args: {
          p_comment?: string
          p_participation_id: string
          p_rating: number
        }
        Returns: string
      }
      update_shift_capacity: {
        Args: { p_capacity: number; p_shift_id: string }
        Returns: Json
      }
      withdraw_application: {
        Args: { p_application_id: string }
        Returns: undefined
      }
    }
    Enums: {
      application_status:
        | "submitted"
        | "under_review"
        | "selected"
        | "rejected"
        | "withdrawn"
        | "declined"
        | "expired"
      cause_category:
        | "humanitarian"
        | "disaster_response"
        | "refugee_support"
        | "conflict_relief"
        | "food_security"
        | "health"
        | "education"
        | "environment"
        | "climate"
        | "community_development"
        | "social_welfare"
        | "other"
      compensation_type: "voluntary" | "stipend" | "paid"
      complaint_status: "open" | "in_review" | "resolved" | "dismissed"
      feedback_status: "published" | "hidden"
      offer_status: "pending" | "accepted" | "declined" | "expired" | "revoked"
      opportunity_mode: "onsite" | "remote" | "hybrid"
      opportunity_status: "draft" | "published" | "closed"
      org_role: "org_admin" | "coordinator"
      org_status: "pending" | "verified" | "rejected" | "suspended"
      org_type:
        | "ngo"
        | "charity"
        | "community_group"
        | "social_enterprise"
        | "government"
        | "international"
        | "academic"
        | "other"
      platform_role: "volunteer" | "platform_admin"
      selection_mode: "open" | "application"
      shift_status: "scheduled" | "cancelled"
      signup_status:
        | "confirmed"
        | "waitlisted"
        | "cancelled"
        | "attended"
        | "no_show"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      application_status: [
        "submitted",
        "under_review",
        "selected",
        "rejected",
        "withdrawn",
        "declined",
        "expired",
      ],
      cause_category: [
        "humanitarian",
        "disaster_response",
        "refugee_support",
        "conflict_relief",
        "food_security",
        "health",
        "education",
        "environment",
        "climate",
        "community_development",
        "social_welfare",
        "other",
      ],
      compensation_type: ["voluntary", "stipend", "paid"],
      complaint_status: ["open", "in_review", "resolved", "dismissed"],
      feedback_status: ["published", "hidden"],
      offer_status: ["pending", "accepted", "declined", "expired", "revoked"],
      opportunity_mode: ["onsite", "remote", "hybrid"],
      opportunity_status: ["draft", "published", "closed"],
      org_role: ["org_admin", "coordinator"],
      org_status: ["pending", "verified", "rejected", "suspended"],
      org_type: [
        "ngo",
        "charity",
        "community_group",
        "social_enterprise",
        "government",
        "international",
        "academic",
        "other",
      ],
      platform_role: ["volunteer", "platform_admin"],
      selection_mode: ["open", "application"],
      shift_status: ["scheduled", "cancelled"],
      signup_status: [
        "confirmed",
        "waitlisted",
        "cancelled",
        "attended",
        "no_show",
      ],
    },
  },
} as const
