import { z } from 'zod'
import { Constants } from './database.types'

/**
 * Client-side validation mirrors the database CHECK constraints so users get
 * immediate, field-level feedback. The database remains the authority.
 */
const enums = Constants.public.Enums
const trimmed = (min: number, max: number, label: string) =>
  z.string().trim().min(min, `${label} must be at least ${min} characters`).max(max, `${label} must be at most ${max} characters`)
const optionalText = (max: number) =>
  z.string().trim().max(max, `At most ${max} characters`).transform((v) => (v === '' ? null : v))
const countryCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2}$/, 'Use a 2-letter country code (e.g. BD)')
const optionalCountry = z
  .string()
  .trim()
  .toUpperCase()
  .refine((v) => v === '' || /^[A-Z]{2}$/.test(v), 'Use a 2-letter country code (e.g. BD)')
  .transform((v) => (v === '' ? null : v))
export const skillsSchema = z
  .string()
  .transform((v) => [...new Set(v.split(',').map((s) => s.trim()).filter(Boolean))])
  .refine((arr) => arr.length <= 20, 'At most 20 skills')

export const signInSchema = z.object({
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

export const signUpSchema = z.object({
  fullName: trimmed(1, 120, 'Name'),
  email: z.string().trim().email('Enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(72, 'Password is too long'),
})

export const profileSchema = z.object({
  full_name: trimmed(1, 120, 'Name'),
  country_code: optionalCountry,
  city: optionalText(80),
  bio: optionalText(1000),
  skills: skillsSchema,
})

export const organizationSchema = z.object({
  name: trimmed(2, 120, 'Name'),
  slug: z
    .string()
    .trim()
    .min(3, 'At least 3 characters')
    .max(60, 'At most 60 characters')
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Lowercase letters, numbers and single hyphens only'),
  cause: z.enum(enums.cause_category),
  country_code: countryCode,
  description: optionalText(2000),
  website: z
    .string()
    .trim()
    .refine((v) => v === '' || /^https?:\/\/\S+$/i.test(v), 'Must start with http:// or https://')
    .transform((v) => (v === '' ? null : v)),
})

export const opportunitySchema = z
  .object({
    title: trimmed(3, 140, 'Title'),
    description: trimmed(10, 5000, 'Description'),
    cause: z.enum(enums.cause_category),
    mode: z.enum(enums.opportunity_mode),
    country_code: optionalCountry,
    city: optionalText(80),
    skills_wanted: skillsSchema,
    requirements: optionalText(1000),
    requires_skill_match: z.boolean(),
    is_sensitive: z.boolean(),
  })
  .refine((v) => v.mode === 'remote' || v.country_code !== null, {
    path: ['country_code'],
    message: 'Country is required for on-site and hybrid opportunities',
  })
  .refine((v) => !v.requires_skill_match || v.skills_wanted.length > 0, {
    path: ['skills_wanted'],
    message: 'List at least one skill when skills are required',
  })

export const shiftSchema = z
  .object({
    title: optionalText(120),
    starts_at: z.string().min(1, 'Start time is required'),
    ends_at: z.string().min(1, 'End time is required'),
    capacity: z.coerce.number().int('Whole number').min(1, 'At least 1').max(500, 'At most 500'),
    waitlist_limit: z.coerce.number().int('Whole number').min(0, 'At least 0').max(500, 'At most 500'),
  })
  .refine((v) => new Date(v.starts_at).getTime() > Date.now(), { path: ['starts_at'], message: 'Must be in the future' })
  .refine((v) => new Date(v.ends_at) > new Date(v.starts_at), { path: ['ends_at'], message: 'Must be after the start' })
  .refine((v) => new Date(v.ends_at).getTime() - new Date(v.starts_at).getTime() <= 24 * 3_600_000, {
    path: ['ends_at'],
    message: 'A shift can be at most 24 hours long',
  })

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  role: z.enum(enums.org_role),
})

/** Flatten zod issues into { field: firstMessage } for forms. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form')
    out[key] ??= issue.message
  }
  return out
}
