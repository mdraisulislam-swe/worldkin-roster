import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Initials, StatusBadge, Tabs } from './ui'

describe('prototype status badge', () => {
  it('shows text and an icon, never colour alone', () => {
    const html = renderToStaticMarkup(<StatusBadge status="under_review" />)
    expect(html).toContain('under review')
    expect(html).toContain('<svg')
    expect(html).toContain('bg-amber-50')
  })
  it('unknown statuses still render readable text', () => {
    expect(renderToStaticMarkup(<StatusBadge status="something_new" />)).toContain('something new')
  })
})

describe('tab bar', () => {
  it('is an accessible tablist with counts and one selected tab', () => {
    const html = renderToStaticMarkup(<Tabs label="Filter" controls="p" value="b" onChange={() => {}} tabs={[{ value: 'a', label: 'A', count: 2 }, { value: 'b', label: 'B', count: 0 }]} />)
    expect(html).toContain('role="tablist"')
    expect(html.match(/role="tab"/g)?.length).toBe(2)
    expect(html).toContain('aria-selected="true"')
    expect(html).toContain('aria-controls="p"')
    expect(html).toContain('id="tab-p-b"')
    expect(html).toMatch(/tabindex="-1"/)
  })
})

describe('initials avatar', () => {
  it('is decorative and uses up to two initials', () => {
    const html = renderToStaticMarkup(<Initials name="Nadia Rahman Khan" />)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('>NR<')
  })
})
