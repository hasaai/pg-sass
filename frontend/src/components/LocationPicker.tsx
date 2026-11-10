/**
 * Pick a property's location: search an address or landmark, or drag / tap the pin.
 *
 * With VITE_GOOGLE_MAPS_API_KEY set this is real Google Maps (Places autocomplete +
 * reverse geocoding). Without a key it falls back to OpenStreetMap, so the form still
 * works in development. Loaded lazily: the map code only downloads when the form opens.
 */
import 'leaflet/dist/leaflet.css'

import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet'

import { GOOGLE_MAP_ID, GOOGLE_MAPS_KEY, loadGoogleMaps, toLiteral } from '../lib/googleMaps'
import type { GMap, GMarker, LatLngLiteral, PlaceSelectEvent } from '../lib/googleMaps'
import { addressFromGoogle, addressFromOsm, makePoint } from '../lib/location'
import type { OsmAddress, PickedAddress, Point } from '../lib/location'

export type PickSource = 'search' | 'pin'
export interface LocationPickerProps {
  value: Point | null
  onPick: (point: Point, address: PickedAddress | null, source: PickSource) => void
}

// Centre of the launch area (HSR Layout / Koramangala) when nothing is picked yet.
const DEFAULT: LatLngLiteral = { lat: 12.925, lng: 77.64 }

function literal(value: Point | null): LatLngLiteral | null {
  return value ? { lat: Number(value.latitude), lng: Number(value.longitude) } : null
}

export default function LocationPicker(props: LocationPickerProps) {
  return GOOGLE_MAPS_KEY ? <GooglePicker {...props} /> : <OsmPicker {...props} />
}

/* ---------------- Google Maps ---------------- */

function GooglePicker({ value, onPick }: LocationPickerProps) {
  const mapDiv = useRef<HTMLDivElement>(null)
  const searchDiv = useRef<HTMLDivElement>(null)
  const map = useRef<GMap | null>(null)
  const marker = useRef<GMarker | null>(null)
  const onPickRef = useRef(onPick)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    onPickRef.current = onPick
  }, [onPick])

  useEffect(() => {
    let cancelled = false
    const start = literal(value)
    ;(async () => {
      try {
        const importLibrary = await loadGoogleMaps()
        const [{ Map }, { AdvancedMarkerElement }, { PlaceAutocompleteElement }, { Geocoder }] =
          await Promise.all([
            importLibrary('maps'),
            importLibrary('marker'),
            importLibrary('places'),
            importLibrary('geocoding'),
          ])
        if (cancelled || !mapDiv.current || !searchDiv.current) return
        const m = new Map(mapDiv.current, {
          center: start ?? DEFAULT,
          zoom: start ? 17 : 13,
          mapId: GOOGLE_MAP_ID,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        })
        const pin = new AdvancedMarkerElement({
          map: start ? m : null,
          position: start,
          gmpDraggable: true,
          title: 'Drag to the PG entrance',
        })
        map.current = m
        marker.current = pin
        const geocoder = new Geocoder()

        // Dropping the pin: keep the exact spot, and suggest the address Google has there.
        const dropAt = async (p: LatLngLiteral) => {
          pin.position = p
          pin.map = m
          const point = makePoint(p.lat, p.lng)
          if (!point) return
          let address: PickedAddress | null = null
          try {
            const { results } = await geocoder.geocode({ location: p })
            const best = results[0]
            if (best) address = addressFromGoogle(best.address_components, best.formatted_address)
          } catch {
            // no address for this spot: the location alone is still useful
          }
          onPickRef.current(point, address, 'pin')
        }
        pin.addListener('dragend', () => {
          const p = toLiteral(pin.position)
          if (p) void dropAt(p)
        })
        m.addListener('click', (e) => {
          const p = toLiteral(e.latLng)
          if (p) void dropAt(p)
        })

        const search = new PlaceAutocompleteElement({
          includedRegionCodes: ['in'],
          locationBias: start ?? DEFAULT,
          placeholder: 'Search the PG name, address or a landmark',
        })
        search.addEventListener('gmp-select', async (event) => {
          const place = (event as PlaceSelectEvent).placePrediction.toPlace()
          await place.fetchFields({
            fields: ['displayName', 'formattedAddress', 'location', 'addressComponents'],
          })
          const p = toLiteral(place.location)
          const point = p && makePoint(p.lat, p.lng)
          if (!p || !point) return
          m.panTo(p)
          m.setZoom(18)
          pin.position = p
          pin.map = m
          onPickRef.current(
            point,
            addressFromGoogle(place.addressComponents ?? [], place.formattedAddress),
            'search',
          )
        })
        searchDiv.current.replaceChildren(search)
        setReady(true)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Google Maps failed to load.')
      }
    })()
    return () => {
      cancelled = true
    }
    // The map is created once; later value changes are applied by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Value typed or pasted in the form: move the pin there.
  useEffect(() => {
    const p = literal(value)
    if (!p || !map.current || !marker.current) return
    const current = toLiteral(marker.current.position)
    if (current && Math.abs(current.lat - p.lat) < 1e-6 && Math.abs(current.lng - p.lng) < 1e-6)
      return
    marker.current.position = p
    marker.current.map = map.current
    map.current.panTo(p)
  }, [value])

  if (error)
    return <p className="banner banner-error">{error} You can still paste a location below.</p>
  return (
    <div className="location-picker">
      <div ref={searchDiv} className="place-search" />
      <div ref={mapDiv} className="picker-map" aria-label="Map: tap or drag the pin to the PG" />
      {!ready && <p className="muted small">Loading Google Maps…</p>}
    </div>
  )
}

/* ---------------- OpenStreetMap fallback (no key) ---------------- */

const pinIcon = L.divIcon({
  className: 'map-pin-wrap',
  html: '<span class="map-pin" aria-hidden="true"></span>',
  iconSize: [28, 28],
  iconAnchor: [14, 28],
})

interface OsmResult {
  lat: string
  lon: string
  display_name: string
  address?: OsmAddress
}

const NOMINATIM = 'https://nominatim.openstreetmap.org'

async function osm<T>(path: string, params: Record<string, string>): Promise<T> {
  const qs = new URLSearchParams({ format: 'jsonv2', addressdetails: '1', ...params })
  const response = await fetch(`${NOMINATIM}/${path}?${qs}`, {
    headers: { Accept: 'application/json', 'Accept-Language': 'en' },
  })
  if (!response.ok) throw new Error('Address search is not available right now.')
  return (await response.json()) as T
}

function ClickToDrop({ onDrop }: { onDrop: (p: LatLngLiteral) => void }) {
  useMapEvents({ click: (e) => onDrop({ lat: e.latlng.lat, lng: e.latlng.lng }) })
  return null
}

function FollowValue({ center }: { center: LatLngLiteral | null }) {
  const map = useMap()
  useEffect(() => {
    if (center) map.setView(center, Math.max(map.getZoom(), 16))
  }, [center?.lat, center?.lng, map]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

function OsmPicker({ value, onPick }: LocationPickerProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<OsmResult[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const point = literal(value)

  async function search() {
    if (!query.trim()) return
    setBusy(true)
    setError(null)
    try {
      const rows = await osm<OsmResult[]>('search', {
        q:
          query.includes('Bengaluru') || query.includes('Bangalore')
            ? query
            : `${query}, Bengaluru`,
        countrycodes: 'in',
        limit: '5',
      })
      setResults(rows)
      if (rows.length === 0) setError('No match. Try a nearby landmark, or tap the map.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.')
    } finally {
      setBusy(false)
    }
  }

  function choose(r: OsmResult) {
    const p = makePoint(Number(r.lat), Number(r.lon))
    setResults([])
    if (p) onPick(p, addressFromOsm(r.address ?? {}, r.display_name), 'search')
  }

  async function drop(p: LatLngLiteral) {
    const picked = makePoint(p.lat, p.lng)
    if (!picked) return
    let address: PickedAddress | null = null
    try {
      const r = await osm<OsmResult>('reverse', {
        lat: String(p.lat),
        lon: String(p.lng),
        zoom: '18',
      })
      address = addressFromOsm(r.address ?? {}, r.display_name)
    } catch {
      // the location alone is still useful
    }
    onPick(picked, address, 'pin')
  }

  return (
    <div className="location-picker">
      <div className="place-search osm-search">
        <input
          type="search"
          aria-label="Search the map"
          placeholder="Search the address or a landmark"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void search()
            }
          }}
        />
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void search()}
        >
          {busy ? 'Searching…' : 'Find'}
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
      {results.length > 0 && (
        <ul className="search-results" aria-label="Search results">
          {results.map((r) => (
            <li key={`${r.lat},${r.lon}`}>
              <button type="button" onClick={() => choose(r)}>
                {r.display_name}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="picker-map">
        <MapContainer center={point ?? DEFAULT} zoom={point ? 17 : 13} scrollWheelZoom={false}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToDrop onDrop={(p) => void drop(p)} />
          <FollowValue center={point} />
          {point && (
            <Marker
              position={point}
              icon={pinIcon}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const ll = (e.target as L.Marker).getLatLng()
                  void drop({ lat: ll.lat, lng: ll.lng })
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      <p className="muted small">
        Free OpenStreetMap search. Add a Google Maps key (see README) for Google search.
      </p>
    </div>
  )
}
