/**
 * Map location helpers for the property form (pure functions, unit tested).
 *
 * Owners usually have the PG open in Google Maps on their phone, so besides the map
 * picker they can paste a Google Maps link or plain "lat, lng" numbers.
 */

export interface Point {
  latitude: string
  longitude: string
}

/** Address fields the property form can fill in from a map search. */
export interface PickedAddress {
  address_line?: string
  locality?: string
  landmark?: string
  city?: string
  pincode?: string
}

const round = (v: number) => v.toFixed(6)

export function makePoint(lat: number, lng: number): Point | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { latitude: round(lat), longitude: round(lng) }
}

/**
 * Read a location from what an owner pastes:
 * - "12.9116, 77.6474"
 * - https://www.google.com/maps/place/.../@12.9116,77.6474,17z/...  (map centre)
 * - ...!3d12.9116!4d77.6474...  (the pin itself; preferred over the centre)
 * - https://maps.google.com/?q=12.9116,77.6474  or  ?ll= / ?query= / ?destination=
 * Short links (maps.app.goo.gl/...) hide the location; they return null.
 */
export function parseLocationInput(input: string): Point | null {
  const text = input.trim()
  if (!text) return null
  const num = '(-?\\d{1,3}(?:\\.\\d+)?)'
  const plain = text.match(new RegExp(`^${num}\\s*,\\s*${num}$`))
  if (plain) return makePoint(Number(plain[1]), Number(plain[2]))
  const pin = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/)
  if (pin) return makePoint(Number(pin[1]), Number(pin[2]))
  let decoded = text
  try {
    decoded = decodeURIComponent(text)
  } catch {
    // keep the raw text
  }
  const query = decoded.match(
    new RegExp(`[?&](?:q|ll|query|destination|center)=(?:loc:)?${num}\\s*,\\s*${num}`),
  )
  if (query) return makePoint(Number(query[1]), Number(query[2]))
  const at = decoded.match(new RegExp(`@${num},${num}`))
  if (at) return makePoint(Number(at[1]), Number(at[2]))
  return null
}

export function isShortMapsLink(input: string): boolean {
  return /^(https?:\/\/)?(maps\.app\.goo\.gl|goo\.gl\/maps)\//i.test(input.trim())
}

/** Google address component, in either the Places (New) or the Geocoder shape. */
export interface AddressComponent {
  types: string[]
  longText?: string | null
  long_name?: string
}

/**
 * Turn Google's address components into our fields. In Bengaluru the "locality" people
 * use (HSR Layout, Koramangala) is Google's sublocality; Google's locality is the city.
 */
export function addressFromGoogle(
  components: AddressComponent[],
  formatted?: string | null,
): PickedAddress {
  const get = (...types: string[]) => {
    for (const type of types) {
      const c = components.find((x) => x.types.includes(type))
      const text = c?.longText ?? c?.long_name
      if (text) return text
    }
    return undefined
  }
  const pincode = get('postal_code')
  const locality = get('sublocality_level_1', 'sublocality', 'neighborhood', 'locality')
  const city = get('locality', 'administrative_area_level_3', 'administrative_area_level_2')
  const street = [get('premise', 'street_number'), get('route'), get('sublocality_level_2')]
    .filter(Boolean)
    .join(', ')
  return clean({
    address_line: street || shortenFormatted(formatted, locality),
    locality,
    city: city === 'Bangalore' ? 'Bengaluru' : city,
    pincode: pincode && /^\d{6}$/.test(pincode) ? pincode : undefined,
  })
}

/** OpenStreetMap (Nominatim) address, used when no Google key is configured. */
export interface OsmAddress {
  house_number?: string
  building?: string
  road?: string
  neighbourhood?: string
  suburb?: string
  quarter?: string
  city_district?: string
  city?: string
  town?: string
  state_district?: string
  postcode?: string
}

export function addressFromOsm(a: OsmAddress, displayName?: string): PickedAddress {
  const locality = a.suburb ?? a.neighbourhood ?? a.quarter ?? a.city_district
  const street = [a.building ?? a.house_number, a.road].filter(Boolean).join(', ')
  const city = a.city ?? a.town ?? a.state_district
  return clean({
    address_line: street || shortenFormatted(displayName, locality),
    locality,
    city: city === 'Bangalore' || city === 'Bangalore Urban' ? 'Bengaluru' : city,
    pincode: a.postcode && /^\d{6}$/.test(a.postcode) ? a.postcode : undefined,
  })
}

/** "12, 5th Cross, HSR Layout, Bengaluru, Karnataka 560102, India" → "12, 5th Cross". */
function shortenFormatted(formatted: string | null | undefined, locality?: string): string {
  if (!formatted) return ''
  const parts = formatted.split(',').map((p) => p.trim())
  const cut = locality ? parts.findIndex((p) => p === locality) : -1
  const head = cut > 0 ? parts.slice(0, cut) : parts.slice(0, 2)
  return head.join(', ').slice(0, 255)
}

function clean(a: PickedAddress): PickedAddress {
  return Object.fromEntries(
    Object.entries(a).filter(([, v]) => typeof v === 'string' && v.trim() !== ''),
  ) as PickedAddress
}

/** Link to open the exact spot in Google Maps (for the owner, not the public page). */
export function googleMapsLink(p: Point): string {
  return `https://www.google.com/maps/search/?api=1&query=${p.latitude},${p.longitude}`
}
