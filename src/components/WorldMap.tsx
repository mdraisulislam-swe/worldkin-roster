import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet.markercluster'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import type { LatLngZoom } from '../lib/geo'
import { KIND_STYLE, type MapPoint, type MapPointKind } from '../lib/mapKinds'

const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'

function markerIcon(kind: MapPointKind, active: boolean) {
  const { color } = KIND_STYLE[kind]
  const size = active ? 22 : 16
  const shape = kind === 'org' ? 'border-radius:4px' : 'border-radius:50%'
  return L.divIcon({
    className: 'wk-marker',
    html: `<span style="display:block;width:${size}px;height:${size}px;${shape};background:${color};border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35)"></span>`,
    iconSize: [size + 6, size + 6], iconAnchor: [(size + 6) / 2, (size + 6) / 2],
  })
}

/** Popup content built with DOM nodes (textContent), so listing text can never inject HTML. */
function popupNode(p: MapPoint, onOpen: (href: string) => void) {
  const box = document.createElement('div'); box.className = 'wk-popup'
  const kind = document.createElement('p'); kind.textContent = KIND_STYLE[p.kind].label; kind.style.cssText = `margin:0;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:${KIND_STYLE[p.kind].color}`
  const title = document.createElement('p'); title.textContent = p.title; title.style.cssText = 'margin:2px 0 0;font-weight:600;font-size:14px'
  const sub = document.createElement('p'); sub.textContent = p.sub; sub.style.cssText = 'margin:2px 0 0;font-size:12px;color:#5b6660'
  const area = document.createElement('p'); area.textContent = `${p.area} (${p.precision === 'city' ? 'approximate city area' : 'country level'})`; area.style.cssText = 'margin:2px 0 6px;font-size:12px;color:#5b6660'
  const a = document.createElement('a'); a.href = p.href; a.textContent = 'View details'; a.style.cssText = 'font-size:13px;font-weight:600;color:#0f5e57'
  a.addEventListener('click', (e) => { e.preventDefault(); onOpen(p.href) })
  box.append(kind, title, sub, area, a)
  return box
}

type Props = {
  points: MapPoint[]
  /** Change `viewKey` to fly to `view` (e.g. after choosing a country). */
  view: LatLngZoom; viewKey: string
  user?: { lat: number; lng: number } | null
  activeId?: string | null
  onSelect?: (id: string) => void
  onOpen: (href: string) => void
  label: string
  className?: string
}

/**
 * Real, interactive world map (Leaflet + OpenStreetMap tiles): drag to pan, scroll / buttons / pinch to zoom,
 * keyboard (+/−, arrow keys) when focused, and marker clustering. Shows its own loading and tile-error states.
 */
export function WorldMap({ points, view, viewKey, user, activeId, onSelect, onOpen, label, className = 'h-[560px]' }: Props) {
  const el = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const cluster = useRef<L.MarkerClusterGroup | null>(null)
  const userLayer = useRef<L.LayerGroup | null>(null)
  const markers = useRef(new Map<string, L.Marker>())
  const [tiles, setTiles] = useState<'loading' | 'ok' | 'error'>('loading')
  const cb = useRef({ onSelect, onOpen })
  useEffect(() => { cb.current = { onSelect, onOpen } }, [onSelect, onOpen])

  // Create the map once.
  useEffect(() => {
    if (!el.current) return
    const m = L.map(el.current, { worldCopyJump: true, minZoom: 2, maxZoom: 18, zoomControl: true, keyboard: true, attributionControl: true })
      .setView([view.lat, view.lng], view.zoom)
    m.attributionControl.setPrefix(false)
    let loaded = false, errors = 0
    const layer = L.tileLayer(TILE_URL, { attribution: ATTRIBUTION, maxZoom: 19, crossOrigin: true })
    layer.on('load', () => { loaded = true; setTiles('ok') })
    layer.on('tileload', () => { loaded = true; setTiles('ok') })
    layer.on('tileerror', () => { errors += 1; if (!loaded && errors >= 4) setTiles('error') })
    layer.addTo(m)
    cluster.current = L.markerClusterGroup({ showCoverageOnHover: false, spiderfyOnMaxZoom: true, maxClusterRadius: 50 }).addTo(m)
    userLayer.current = L.layerGroup().addTo(m)
    map.current = m
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(el.current)
    return () => { ro.disconnect(); m.remove(); map.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- created once; view changes are handled below
  }, [])

  // Markers.
  useEffect(() => {
    const c = cluster.current; if (!c) return
    c.clearLayers(); markers.current.clear()
    for (const p of points) {
      const mk = L.marker([p.lat, p.lng], { icon: markerIcon(p.kind, p.id === activeId), title: `${KIND_STYLE[p.kind].label}: ${p.title}`, keyboard: true, riseOnHover: true })
      mk.bindPopup(() => popupNode(p, (href) => cb.current.onOpen(href)), { closeButton: true, maxWidth: 260 })
      mk.on('click', () => cb.current.onSelect?.(p.id))
      markers.current.set(p.id, mk)
      c.addLayer(mk)
    }
  }, [points, activeId])

  // Fly to a requested view.
  useEffect(() => { map.current?.flyTo([view.lat, view.lng], view.zoom, { duration: 0.8 }) }, [viewKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // Reveal the active marker (from the list).
  useEffect(() => {
    if (!activeId || !cluster.current) return
    const mk = markers.current.get(activeId); if (!mk) return
    cluster.current.zoomToShowLayer(mk, () => mk.openPopup())
  }, [activeId])

  // The user's own location: shown only on this device, never sent anywhere.
  useEffect(() => {
    const g = userLayer.current; if (!g) return
    g.clearLayers()
    if (user) {
      L.circleMarker([user.lat, user.lng], { radius: 9, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1 })
        .bindTooltip('You are here (shown only on this device)').addTo(g)
      map.current?.flyTo([user.lat, user.lng], 11, { duration: 0.8 })
    }
  }, [user])

  return (
    <div className={`relative isolate overflow-hidden rounded-xl border border-neutral-100 bg-[#e8eee9] ${className}`}>
      <div ref={el} role="region" aria-label={label} className="h-full w-full" />
      {tiles === 'loading' && <p className="pointer-events-none absolute left-1/2 top-3 z-[500] -translate-x-1/2 rounded-full bg-white/95 px-3 py-1 text-xs text-ink-700 shadow" role="status">Loading map…</p>}
      {tiles === 'error' && (
        <div role="alert" className="absolute inset-x-3 top-3 z-[500] rounded-lg bg-white/95 px-4 py-3 text-sm text-rose-800 shadow">
          Map tiles could not be loaded (network or tile server unavailable). The list still works; try again later.
        </div>
      )}
    </div>
  )
}
