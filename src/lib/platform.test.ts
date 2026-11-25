import { describe, expect, it } from 'vitest'
import { opportunityExtraSchema, organizationDetailsSchema, volunteerProfileSchema } from './validation'

describe('wk06 form validation (mirrors database CHECK constraints)', () => {
  const future = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16)
  it('paid and stipend roles must describe compensation', () => {
    expect(opportunityExtraSchema.safeParse({ compensation_type: 'paid', compensation_details: '', selection_mode: 'open', application_deadline: '' }).success).toBe(false)
    expect(opportunityExtraSchema.safeParse({ compensation_type: 'stipend', compensation_details: 'USD 20/day', selection_mode: 'open', application_deadline: '' }).success).toBe(true)
    expect(opportunityExtraSchema.safeParse({ compensation_type: 'voluntary', compensation_details: '', selection_mode: 'open', application_deadline: '' }).success).toBe(true)
  })
  it('deadline only for application mode, and only in the future', () => {
    expect(opportunityExtraSchema.safeParse({ compensation_type: 'voluntary', compensation_details: '', selection_mode: 'open', application_deadline: future }).success).toBe(false)
    expect(opportunityExtraSchema.safeParse({ compensation_type: 'voluntary', compensation_details: '', selection_mode: 'application', application_deadline: future }).success).toBe(true)
    expect(opportunityExtraSchema.safeParse({ compensation_type: 'voluntary', compensation_details: '', selection_mode: 'application', application_deadline: '2020-01-01T10:00' }).success).toBe(false)
  })
  it('phone and email formats', () => {
    const base = { org_type: 'ngo', city: '', phone: '', official_email: '', address: '', registration_id: '', representative_name: '', representative_role: '' }
    expect(organizationDetailsSchema.safeParse({ ...base, phone: '+880 1700-000000', official_email: 'INFO@Org.test' }).success).toBe(true)
    expect(organizationDetailsSchema.safeParse({ ...base, phone: 'call me' }).success).toBe(false)
    expect(organizationDetailsSchema.safeParse({ ...base, official_email: 'not-an-email' }).success).toBe(false)
  })
  it('volunteer profile lists are de-duplicated and bounded', () => {
    const r = volunteerProfileSchema.safeParse({ full_name: 'A', country_code: 'bd', city: '', bio: '', skills: 'x, x', phone: '', education: '', interests: 'a, b, a', languages: 'bn, en', availability: '', experience: '' })
    expect(r.success && r.data.interests).toEqual(['a', 'b'])
    expect(r.success && r.data.country_code).toBe('BD')
    const many = Array.from({ length: 16 }, (_, i) => `l${i}`).join(',')
    expect(volunteerProfileSchema.safeParse({ full_name: 'A', country_code: '', city: '', bio: '', skills: '', phone: '', education: '', interests: '', languages: many, availability: '', experience: '' }).success).toBe(false)
  })
})
