/**
 * Loads the Google Maps JavaScript API once, only when a page needs it.
 *
 * The key is a *browser* key from Google Cloud (VITE_GOOGLE_MAPS_API_KEY in
 * frontend/.env.local). It is visible to anyone using the site, so restrict it in
 * Google Cloud to your domains (HTTP referrers) and to the three APIs used here:
 * Maps JavaScript API, Places API (New) and Geocoding API.
 *
 * Only the few calls we use are typed below, to avoid another dependency.
 */

export interface LatLngLiteral {
  lat: number
  lng: number
}
interface LatLngLike {
  lat: number | (() => number)
  lng: number | (() => number)
}
interface Listener {
  remove(): void
}
export interface GMap {
  setCenter(p: LatLngLiteral): void
  setZoom(z: number): void
  panTo(p: LatLngLiteral): void
  addListener(event: 'click', fn: (e: { latLng?: LatLngLike | null }) => void): Listener
}
export interface GMarker {
  position: LatLngLike | LatLngLiteral | null | undefined
  map: GMap | null
  addListener(event: 'dragend', fn: () => void): Listener
}
export interface GAddressComponent {
  types: string[]
  longText?: string | null
  long_name?: string
}
export interface GPlace {
  location?: LatLngLike | null
  formattedAddress?: string | null
  displayName?: string | null
  addressComponents?: GAddressComponent[] | null
  fetchFields(o: { fields: string[] }): Promise<unknown>
}
/** The `gmp-select` event of <gmp-place-autocomplete>. */
export type PlaceSelectEvent = Event & { placePrediction: { toPlace(): GPlace } }
export type GAutocomplete = HTMLElement
interface Libraries {
  maps: { Map: new (el: HTMLElement, o: Record<string, unknown>) => GMap }
  marker: { AdvancedMarkerElement: new (o: Record<string, unknown>) => GMarker }
  places: { PlaceAutocompleteElement: new (o: Record<string, unknown>) => GAutocomplete }
  geocoding: {
    Geocoder: new () => {
      geocode(r: { location: LatLngLiteral }): Promise<{
        results: { formatted_address: string; address_components: GAddressComponent[] }[]
      }>
    }
  }
}
type ImportLibrary = <K extends keyof Libraries>(name: K) => Promise<Libraries[K]>

declare global {
  interface Window {
    google?: { maps?: { importLibrary?: ImportLibrary } }
    __pgGoogleMapsReady?: () => void
  }
}

export const GOOGLE_MAPS_KEY: string = import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? ''
/** Advanced markers need a map ID; Google's DEMO_MAP_ID works for development. */
export const GOOGLE_MAP_ID: string = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID || 'DEMO_MAP_ID'

let loading: Promise<ImportLibrary> | null = null

export function loadGoogleMaps(key = GOOGLE_MAPS_KEY): Promise<ImportLibrary> {
  if (window.google?.maps?.importLibrary) return Promise.resolve(window.google.maps.importLibrary)
  loading ??= new Promise<ImportLibrary>((resolve, reject) => {
    const params = new URLSearchParams({
      key,
      v: 'weekly',
      loading: 'async',
      libraries: 'places,marker,geocoding',
      region: 'IN',
      language: 'en',
      callback: '__pgGoogleMapsReady',
    })
    window.__pgGoogleMapsReady = () => {
      const lib = window.google?.maps?.importLibrary
      if (lib) resolve(lib)
      else reject(new Error('Google Maps loaded without importLibrary.'))
    }
    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?${params}`
    script.async = true
    script.onerror = () => {
      loading = null
      reject(new Error('Could not load Google Maps. Check the internet connection and API key.'))
    }
    document.head.append(script)
  })
  return loading
}

export function toLiteral(p: LatLngLike | LatLngLiteral | null | undefined): LatLngLiteral | null {
  if (!p) return null
  const lat = typeof p.lat === 'function' ? p.lat() : p.lat
  const lng = typeof p.lng === 'function' ? p.lng() : p.lng
  return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
}
