import { useMemo, useState, type FormEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '../auth/AuthProvider'
import { Alert, Button, Card, Checkbox, EmptyState, ErrorState, PageHeader, Select, TextArea, TextField } from '../components/ui'
import { Icon } from '../components/Icon'
import { WorldMap } from '../components/WorldMap'
import { KIND_STYLE, type MapPointKind } from '../lib/mapKinds'
import { VideoPlayer } from '../components/VideoPlayer'
import { COUNTRY_OPTIONS, COUNTRY_VIEW, WORLD_VIEW, countryName, isCountryCode, type LatLngZoom } from '../lib/geo'
import { buildMapPoints } from '../lib/mapPoints'
import { searchOpportunities, listOrganizations } from '../lib/platform'
import { getUpcomingEvents } from '../lib/events'
import { toAppError } from '../lib/errors'
import { fieldErrors } from '../lib/validation'
import {
  CONTACT_METHODS, EMERGENCY_BACKEND_LIVE, EMERGENCY_CATEGORIES, NEXT_STATUS, STATUS_LABEL, URGENCY, emergencyRequestSchema, type EmergencyStatus,
} from '../lib/emergency'
import { VIDEOS } from '../lib/siteContent'

const KINDS: [MapPointKind | 'all', string][] = [['all', 'All'], ['opp', 'Opportunities'], ['event', 'Events'], ['org', 'Organizations']]

type GeoState = { status: 'idle' | 'asking' | 'denied' | 'unavailable' | 'ok'; coords?: { lat: number; lng: number } }

/** Asks the browser for the visitor's position only after they press the button; the result never leaves the device. */
function useDeviceLocation() {
  const [geo, setGeo] = useState<GeoState>({ status: 'idle' })
  const ask = () => {
    if (!('geolocation' in navigator)) return setGeo({ status: 'unavailable' })
    setGeo({ status: 'asking' })
    navigator.geolocation.getCurrentPosition(
      (p) => setGeo({ status: 'ok', coords: { lat: p.coords.latitude, lng: p.coords.longitude } }),
      (err) => setGeo({ status: err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable' }),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    )
  }
  return { geo, ask }
}

function GeoNotice({ geo }: { geo: GeoState }) {
  if (geo.status === 'denied') return <Alert tone="warning">Location permission was not given. The map still works: choose a country, or zoom and drag to any area.</Alert>
  if (geo.status === 'unavailable') return <Alert tone="warning">Your location could not be found on this device. Choose a country instead.</Alert>
  if (geo.status === 'ok') return <p className="text-xs text-ink-500"><Icon name="lock" size={12} className="mr-1 inline" />Your position is shown only on this device. It is not saved or sent to Worldkin.</p>
  return null
}

function useCountryView(country: string) {
  return useMemo<{ view: LatLngZoom; key: string }>(() => {
    const v = country ? COUNTRY_VIEW[country] : undefined
    return { view: v ?? WORLD_VIEW, key: country || 'world' }
  }, [country])
}

/** A10 — Map discovery on a real world map, using public listings only. */
export function MapPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const kind = (params.get('kind') as MapPointKind | null) ?? 'all'
  const country = (params.get('country') ?? '').toUpperCase()
  const [view, setView] = useState<'map' | 'list'>('map')
  const [active, setActive] = useState<string | null>(null)
  const { geo, ask } = useDeviceLocation()
  const target = useCountryView(country)
  const setParam = (k: string, v: string) => { const p = new URLSearchParams(params); if (v) p.set(k, v); else p.delete(k); setParams(p, { replace: true }); setActive(null) }

  const opps = useQuery({ queryKey: ['map', 'opps', country], queryFn: async () => (await searchOpportunities({ country: country || undefined, pageSize: 100, sort: 'soonest' })).rows })
  const events = useQuery({ queryKey: ['map', 'events'], queryFn: () => getUpcomingEvents(Date.now(), { limit: 100 }) })
  const orgs = useQuery({ queryKey: ['map', 'orgs', country], queryFn: async () => (await listOrganizations({ country: country || undefined, pageSize: 100 })).rows })

  const built = useMemo(() => buildMapPoints(opps.data ?? [], (events.data ?? []).filter((e) => !country || e.opportunities?.country_code === country), orgs.data ?? []), [opps.data, events.data, orgs.data, country])
  const points = useMemo(() => built.points.filter((p) => kind === 'all' || p.kind === kind), [built.points, kind])
  const error = opps.error ?? events.error ?? orgs.error
  const loading = opps.isPending || events.isPending || orgs.isPending

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <PageHeader title="Explore on the map" subtitle="Opportunities, events and verified organizations on a real world map. Drag, zoom and choose a country." />
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Show on map">
          {KINDS.map(([k, l]) => (
            <button key={k} type="button" aria-pressed={kind === k} onClick={() => setParam('kind', k === 'all' ? '' : k)}
              className={`min-h-10 rounded-full border px-4 text-sm font-medium ${kind === k ? 'border-brand-700 bg-brand-700 text-white' : 'border-[#d5d9d2] bg-white text-ink-700 hover:border-brand-600'}`}>{l}</button>
          ))}
        </div>
        <div className="w-full sm:w-64"><Select label="Country" value={country} onChange={(e) => setParam('country', e.currentTarget.value)}
          options={[{ value: '', label: 'Whole world' }, ...COUNTRY_OPTIONS]} /></div>
        <Button type="button" variant="secondary" busy={geo.status === 'asking'} onClick={ask}><Icon name="locate" size={16} />Use my location</Button>
        <div className="flex gap-1 rounded-lg bg-neutral-100 p-1 lg:hidden" role="group" aria-label="View">
          {(['map', 'list'] as const).map((v) => (
            <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={`inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium ${view === v ? 'bg-white shadow-sm' : 'text-ink-500'}`}>
              <Icon name={v === 'map' ? 'map' : 'list'} size={16} />{v === 'map' ? 'Map' : 'List'}</button>
          ))}
        </div>
      </div>
      <p className="-mt-2 text-xs text-ink-500">We ask for your location only when you press “Use my location”, to centre the map near you. It stays on this device.</p>
      <GeoNotice geo={geo} />
      {error && <ErrorState message={toAppError(error).message} onRetry={() => { void opps.refetch(); void events.refetch(); void orgs.refetch() }} />}

      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <section aria-labelledby="map-list-h" className={`${view === 'list' ? 'flex' : 'hidden'} min-w-0 flex-col gap-2 lg:flex lg:max-h-[600px] lg:overflow-y-auto lg:pr-1`}>
          <h2 id="map-list-h" className="text-sm font-semibold text-ink-700" aria-live="polite">
            {loading ? 'Loading places…' : `${points.length} on the map${country ? ` · ${countryName(country)}` : ''}`}
          </h2>
          {!loading && points.length === 0 && <EmptyState title="Nothing to show here">Try another country or show everything.</EmptyState>}
          <ul className="flex flex-col gap-2">
            {points.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => { setActive(p.id); setView('map') }} aria-current={active === p.id || undefined}
                  className={`flex w-full items-start gap-3 rounded-lg border bg-white p-3 text-left hover:border-brand-600 ${active === p.id ? 'border-brand-600 ring-1 ring-brand-600' : 'border-neutral-100'}`}>
                  <span className="mt-1 h-3 w-3 shrink-0" style={{ background: KIND_STYLE[p.kind].color, borderRadius: p.kind === 'org' ? 3 : 9999 }} aria-hidden />
                  <span className="min-w-0">
                    <span className="block text-xs font-semibold uppercase tracking-wide text-ink-500">{KIND_STYLE[p.kind].label}</span>
                    <span className="block font-semibold text-ink-900">{p.title}</span>
                    <span className="block text-sm text-ink-500">{p.sub}{p.sub ? ' · ' : ''}{p.area}{p.precision === 'country' ? ' (country level)' : ''}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {built.unplaced > 0 && <p className="text-xs text-ink-500">{built.unplaced} listing{built.unplaced === 1 ? '' : 's'} with an unrecognised place are not on the map; find them in <Link className="text-brand-700 underline" to="/explore">Explore</Link>.</p>}
        </section>
        <div className={`${view === 'map' ? 'block' : 'hidden'} min-w-0 lg:block`}>
          <WorldMap label="World map of opportunities, events and organizations" points={points} view={target.view} viewKey={target.key}
            user={geo.coords ?? null} activeId={active} onSelect={setActive} onOpen={(href) => navigate(href)} className="h-[460px] sm:h-[560px] lg:h-[600px]" />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-500">
            {Object.values(KIND_STYLE).map((k) => <span key={k.label} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: k.color }} aria-hidden />{k.label}</span>)}
            <span>Numbered circles group nearby places — zoom in to separate them.</span>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="flex items-center gap-2 font-semibold"><Icon name="info" size={18} />How places are shown</h2>
          <p className="mt-2 text-sm text-ink-700">Markers sit at the centre of the listing’s city (or its country when the city is not recognised). They are approximate areas, never street addresses. Remote opportunities are not placed.</p>
        </Card>
        <Card>
          <h2 className="flex items-center gap-2 font-semibold"><Icon name="users" size={18} />Volunteer availability layer</h2>
          <p className="mt-2 text-sm text-ink-700">Not active yet. Showing where volunteers are available needs their explicit opt-in and area-level counts (database change <em>wk12-A</em>, awaiting approval). Until then <strong>no volunteer location is shown</strong> — nothing here is estimated or invented.</p>
        </Card>
      </div>
    </div>
  )
}

const LIFECYCLE: EmergencyStatus[] = ['open', 'responders_found', 'in_progress', 'resolved', 'cancelled']

/** A11 — Emergency Volunteer Call. Validates requests; sending is disabled until the reviewed migration is approved. */
export function EmergencyPage() {
  const { session, memberships } = useAuth()
  const navigate = useNavigate()
  const verifiedOrgs = memberships.filter((m) => m.organization?.status === 'verified' && (m.role === 'org_admin' || m.role === 'coordinator'))
  const [country, setCountry] = useState('BD')
  const target = useCountryView(isCountryCode(country) ? country : '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [checked, setChecked] = useState(false)
  const { geo, ask } = useDeviceLocation()

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const parsed = emergencyRequestSchema.safeParse(Object.fromEntries(new FormData(e.currentTarget)))
    if (!parsed.success) { setChecked(false); return setErrors(fieldErrors(parsed.error)) }
    setErrors({}); setChecked(true)
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Emergency Volunteer Call" subtitle="When a verified organization needs urgent local help, volunteers who opted in nearby can say they’re available." />
      <div role="note" className="flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-900">
        <Icon name="siren" size={22} />
        <p className="text-[15px]"><strong>Worldkin Roster is not an emergency service.</strong> If anyone is in danger, contact your local emergency number first. This network only helps verified organizations find willing volunteers; a response is never guaranteed.</p>
      </div>

      <ul className="grid gap-4 md:grid-cols-3">
        {([['user', 'Volunteers opt in', 'Off by default. Volunteers choose skills, availability and an approximate area (~5 km) — never an exact address.'],
          ['shield-check', 'Verified requests only', 'Only admins or coordinators of verified organizations can post, with rate limits and a maximum lifetime of 72 hours.'],
          ['lock', 'Contact on the volunteer’s terms', 'Organizations see counts only until a volunteer answers “I’m available”; then only that organization sees their first name and chosen contact.']] as const).map(([i, t, d]) => (
          <li key={t}><Card className="h-full"><span className="grid h-10 w-10 place-items-center rounded-lg bg-brand-50 text-brand-700"><Icon name={i} size={20} /></span><h2 className="mt-3 font-semibold">{t}</h2><p className="mt-1 text-sm text-ink-700">{d}</p></Card></li>
        ))}
      </ul>

      {!EMERGENCY_BACKEND_LIVE && (
        <Alert tone="warning">The emergency module is built in the interface but <strong>not switched on</strong>: its database tables and security rules (migration <em>wk12-B</em>) are written and awaiting the owner’s approval. Until then no request can be sent, and no volunteer receives anything.</Alert>
      )}

      <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
        <section aria-labelledby="em-form-h" className="min-w-0">
          <Card className="sm:p-7">
            <h2 id="em-form-h" className="text-xl font-semibold">Post an urgent request</h2>
            {!session ? (
              <p className="mt-2 text-sm text-ink-700"><Link className="text-brand-700 underline" to="/signin?as=org&next=/emergency">Sign in as an organization</Link> to post. Requests can only come from verified organizations.</p>
            ) : verifiedOrgs.length === 0 ? (
              <p className="mt-2 text-sm text-ink-700">Only admins or coordinators of a <strong>verified</strong> organization can post requests. Your account has no such role.</p>
            ) : (
              <form className="mt-4 flex flex-col gap-4" onSubmit={onSubmit} noValidate>
                <Select label="Organization" name="org_id" options={verifiedOrgs.map((m) => ({ value: m.org_id, label: m.organization?.name ?? m.org_id }))} />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="Category" name="category" error={errors.category} options={[{ value: '', label: 'Choose…' }, ...EMERGENCY_CATEGORIES.map(([v, l]) => ({ value: v, label: l }))]} />
                  <Select label="Urgency" name="urgency" error={errors.urgency} options={[{ value: '', label: 'Choose…' }, ...URGENCY.map(([v, l]) => ({ value: v, label: l }))]} />
                </div>
                <TextField label="Short title" name="title" maxLength={90} error={errors.title} placeholder="e.g. Sandbag team for flood barrier" />
                <TextArea label="What is needed" name="description" maxLength={1200} error={errors.description} hint="Tasks, timing and what volunteers should bring. No personal data about affected people." />
                <div className="grid gap-4 sm:grid-cols-2">
                  <Select label="Country" name="country_code" value={country} onChange={(e) => setCountry(e.currentTarget.value)} error={errors.country_code} options={COUNTRY_OPTIONS} />
                  <TextField label="City or area" name="city" maxLength={80} error={errors.city} hint="Approximate area only, not an address" />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <TextField label="Volunteers needed" name="volunteers_needed" type="number" min={1} max={200} error={errors.volunteers_needed} />
                  <TextField label="Expires in (hours)" name="expires_in_hours" type="number" min={1} max={72} defaultValue="24" error={errors.expires_in_hours} />
                  <Select label="Contact method" name="contact_method" error={errors.contact_method} options={CONTACT_METHODS.map(([v, l]) => ({ value: v, label: l }))} />
                </div>
                <TextField label="Skills needed (comma-separated)" name="skills" error={errors.skills} placeholder="First aid, Driving" />
                <TextArea label="Safety information (optional)" name="safety_notes" maxLength={600} error={errors.safety_notes} hint="Protective equipment, meeting point safety, age limits." />
                <div>
                  <Checkbox label="I understand Worldkin Roster is not an emergency service and responses are not guaranteed." name="not_emergency_service_ack" />
                  {errors.not_emergency_service_ack && <p className="mt-1 text-sm text-rose-700">{errors.not_emergency_service_ack}</p>}
                </div>
                <div aria-live="polite">
                  {checked && <Alert tone="info">The request passed every check, but <strong>it was not sent</strong>: the emergency module is awaiting database approval. No volunteer has been contacted.</Alert>}
                </div>
                <div><Button type="submit">Check request</Button></div>
              </form>
            )}
          </Card>
        </section>

        <aside className="flex min-w-0 flex-col gap-4">
          <Card>
            <h2 className="font-semibold">Area</h2>
            <p className="mt-1 text-sm text-ink-500">Requests and volunteer availability are shown as ~5 km areas with counts only. No individual volunteer location is ever displayed.</p>
            <div className="mt-3">
              <WorldMap label="Map of the request area" points={[]} view={target.view} viewKey={target.key} user={geo.coords ?? null} onOpen={(h) => navigate(h)} className="h-72" />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3"><Button type="button" size="sm" variant="secondary" busy={geo.status === 'asking'} onClick={ask}><Icon name="locate" size={16} />Centre on my location</Button></div>
            <div className="mt-2"><GeoNotice geo={geo} /></div>
          </Card>
          <Card>
            <h2 className="font-semibold">Open requests near you</h2>
            <EmptyState title="No live requests">{EMERGENCY_BACKEND_LIVE ? 'Nothing open in your area right now.' : 'The emergency module is not switched on yet, so there are no requests to show.'}</EmptyState>
          </Card>
          <Card>
            <h2 className="font-semibold">Request lifecycle</h2>
            <ol className="mt-2 flex flex-col gap-2 text-sm">
              {LIFECYCLE.map((s) => (
                <li key={s} className="flex flex-wrap items-baseline gap-x-2"><strong>{STATUS_LABEL[s]}</strong>
                  <span className="text-ink-500">{NEXT_STATUS[s].length ? `→ ${NEXT_STATUS[s].map((n) => STATUS_LABEL[n]).join(' / ')}` : 'final'}</span></li>
              ))}
            </ol>
            <p className="mt-2 text-xs text-ink-500">The posting organization can cancel an accidental request at any time; requests close automatically when they expire.</p>
          </Card>
          <Card>
            <h2 className="font-semibold">Your availability</h2>
            <p className="mt-1 text-sm text-ink-700">Volunteers will be able to opt in here with skills and an approximate area. Not available until the module is switched on.</p>
            <label className="mt-3 flex items-center gap-2 text-sm text-ink-500"><input type="checkbox" disabled className="h-4 w-4" />Receive urgent requests (off)</label>
          </Card>
        </aside>
      </div>
    </div>
  )
}

/** A08/A09 — Stories & media: video section. Organization-uploaded media needs the media module (wk08). */
export function MediaPage() {
  const groups = [['platform', 'About the platform'], ['volunteer', 'For volunteers'], ['organization', 'For organizations']] as const
  return (
    <div className="flex min-w-0 flex-col gap-8">
      <PageHeader title="Stories & media" subtitle="Videos about how Worldkin Roster works. Photos and stories from verified organizations will appear after moderation." />
      {groups.map(([cat, title]) => {
        const items = VIDEOS.filter((v) => v.category === cat)
        return (
          <section key={cat} aria-labelledby={`v-${cat}`}>
            <h2 id={`v-${cat}`} className="mb-3 text-xl font-semibold">{title}</h2>
            <div className="grid gap-6 lg:grid-cols-2">
              {items.map((v) => (
                <article key={v.id} className="flex flex-col gap-3">
                  <VideoPlayer url={v.url} title={v.title} />
                  <div><h3 className="font-semibold">{v.title}</h3><p className="text-sm text-ink-700">{v.description}</p></div>
                </article>
              ))}
            </div>
          </section>
        )
      })}
      <Card>
        <h2 className="flex items-center gap-2 font-semibold"><Icon name="layers" size={18} />Organization photos, videos and stories</h2>
        <p className="mt-2 text-sm text-ink-700">Not available yet. Uploads by organizations need moderation, consent records and private storage (media module <em>wk08</em>, awaiting approval). Nothing is shown until then — no sample media is presented as real.</p>
      </Card>
    </div>
  )
}
