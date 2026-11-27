import { z } from 'zod'
import { isCountryCode } from './geo'

/**
 * Emergency Volunteer Call — client rules. They mirror the database rules drafted in
 * supabase/proposals/wk12_location_emergency.sql (NOT applied; needs owner approval).
 * Until that migration is live, the UI validates input but never claims a request was sent.
 */
export const EMERGENCY_BACKEND_LIVE = false

export const EMERGENCY_CATEGORIES = [
  ['flood', 'Flood or storm relief'], ['fire', 'Fire aftermath support'], ['medical_support', 'Medical support desk (non-clinical)'],
  ['blood_donation', 'Blood donation coordination'], ['food_shelter', 'Food and shelter'], ['search_logistics', 'Logistics and supplies'],
  ['other', 'Other urgent community need'],
] as const
export type EmergencyCategory = (typeof EMERGENCY_CATEGORIES)[number][0]

export const URGENCY = [['high', 'High — within hours'], ['medium', 'Medium — within a day'], ['low', 'Low — within a few days']] as const
export const CONTACT_METHODS = [['in_app', 'In-app message only'], ['org_email', "Organization's official email"], ['org_phone', "Organization's official phone"]] as const

export type EmergencyStatus = 'open' | 'responders_found' | 'in_progress' | 'resolved' | 'cancelled'
export const STATUS_LABEL: Record<EmergencyStatus, string> = {
  open: 'Open', responders_found: 'Responders found', in_progress: 'In progress', resolved: 'Resolved', cancelled: 'Cancelled',
}
/** Allowed transitions; resolved and cancelled are final. */
export const NEXT_STATUS: Record<EmergencyStatus, EmergencyStatus[]> = {
  open: ['responders_found', 'in_progress', 'cancelled'],
  responders_found: ['in_progress', 'resolved', 'cancelled'],
  in_progress: ['resolved', 'cancelled'],
  resolved: [], cancelled: [],
}
export const canTransition = (from: EmergencyStatus, to: EmergencyStatus) => NEXT_STATUS[from].includes(to)

const text = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label}: at least ${min} characters`).max(max, `${label}: at most ${max} characters`)

export const emergencyRequestSchema = z.object({
  category: z.enum(EMERGENCY_CATEGORIES.map((c) => c[0]) as [EmergencyCategory, ...EmergencyCategory[]], { message: 'Choose a category' }),
  title: text(8, 90, 'Title'),
  description: text(30, 1200, 'Description'),
  country_code: z.string().trim().toUpperCase().refine(isCountryCode, 'Choose a country'),
  city: text(2, 80, 'City or area'),
  skills: z.string().trim().max(200).transform((s) => s.split(',').map((x) => x.trim()).filter(Boolean)).pipe(z.array(z.string().max(40)).max(8, 'At most 8 skills')),
  volunteers_needed: z.coerce.number({ message: 'Enter a number' }).int('Whole number').min(1, 'At least 1').max(200, 'At most 200'),
  urgency: z.enum(['high', 'medium', 'low'], { message: 'Choose urgency' }),
  contact_method: z.enum(['in_app', 'org_email', 'org_phone'], { message: 'Choose a contact method' }),
  expires_in_hours: z.coerce.number().int().min(1, 'At least 1 hour').max(72, 'At most 72 hours'),
  safety_notes: z.string().trim().max(600, 'Safety notes: at most 600 characters').optional().default(''),
  not_emergency_service_ack: z.literal('on', { message: 'Please confirm you understand Worldkin is not an emergency service' }),
})
export type EmergencyRequestInput = z.infer<typeof emergencyRequestSchema>
