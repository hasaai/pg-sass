import { describe, expect, it } from 'vitest'

import type { DueReminder } from '../api/types'
import { homeFor, safeReturnPath } from '../auth/redirects'
import { addMonths, toISODate } from './format'
import { addressFromGoogle, addressFromOsm, isShortMapsLink, parseLocationInput } from './location'
import { genderLabel, searchQuery } from './marketplace'
import { dueLabel, emailSummary } from './reminders'

describe('dates', () => {
  it('formats local dates without shifting to UTC', () => {
    // Midnight in India is the previous day in UTC; toISOString would say 2026-10-31.
    expect(toISODate(new Date(2026, 10, 1, 0, 5))).toBe('2026-11-01')
  })

  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-10-18', 11, '2027-09-18'],
    ['2026-03-15', 0, '2026-03-15'],
  ])('%s + %i months = %s', (start, months, expected) => {
    expect(addMonths(start, months)).toBe(expected)
  })
})

describe('marketplace search query', () => {
  it('converts rupees to paise and switches on boolean filters', () => {
    const q = searchQuery(new URLSearchParams('budget=9000&food=1&amenities=wifi,ac&q=HSR'))
    expect(q).toMatchObject({ max_rent: 900000, food: true, amenities: 'wifi,ac', q: 'HSR' })
    expect(q.available).toBeNull()
  })

  it('sends map bounds only when all four are present', () => {
    const partial = searchQuery(new URLSearchParams('min_lat=12.9&max_lat=13'))
    expect(partial).not.toHaveProperty('min_lat')
    const full = searchQuery(
      new URLSearchParams('min_lat=12.9&max_lat=13&min_lng=77.6&max_lng=77.7'),
    )
    expect(full).toMatchObject({ min_lat: '12.9', max_lng: '77.7' })
  })

  it('labels who a PG is for', () => {
    expect(genderLabel('coed')).toBe('Anyone')
    expect(genderLabel('women')).toBe('Women')
  })
})

describe('map location input', () => {
  it.each([
    [' 12.9116, 77.6474 ', '12.911600', '77.647400'],
    ['12.91165432,77.6', '12.911654', '77.600000'],
    [
      'https://www.google.com/maps/place/Lotus+PG/@12.9100,77.6400,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d12.9116!4d77.6474',
      '12.911600',
      '77.647400',
    ],
    ['https://www.google.com/maps/@12.935,77.624,15z', '12.935000', '77.624000'],
    ['https://maps.google.com/?q=12.9116,77.6474', '12.911600', '77.647400'],
    ['https://www.google.com/maps/search/?api=1&query=12.9%2C77.6', '12.900000', '77.600000'],
  ])('reads %s', (input, latitude, longitude) => {
    expect(parseLocationInput(input)).toEqual({ latitude, longitude })
  })

  it.each(['', 'HSR Layout', '12.9', '12.9; 77.6', '95, 77', 'https://maps.app.goo.gl/abc123'])(
    'rejects %j',
    (input) => {
      expect(parseLocationInput(input)).toBeNull()
    },
  )

  it('recognises short share links, which hide the location', () => {
    expect(isShortMapsLink('https://maps.app.goo.gl/abc123')).toBe(true)
    expect(isShortMapsLink('https://www.google.com/maps/@12.9,77.6,15z')).toBe(false)
  })
})

describe('address from a map search', () => {
  it('maps Google components to our fields (sublocality is the Bengaluru locality)', () => {
    const components = [
      { types: ['premise'], longText: 'Lotus Residency' },
      { types: ['route'], longText: '5th Cross Road' },
      { types: ['sublocality_level_2', 'sublocality'], longText: 'Sector 2' },
      { types: ['sublocality_level_1', 'sublocality'], longText: 'HSR Layout' },
      { types: ['locality', 'political'], longText: 'Bengaluru' },
      { types: ['postal_code'], longText: '560102' },
    ]
    expect(addressFromGoogle(components, 'Lotus Residency, 5th Cross Road, ...')).toEqual({
      address_line: 'Lotus Residency, 5th Cross Road, Sector 2',
      locality: 'HSR Layout',
      city: 'Bengaluru',
      pincode: '560102',
    })
  })

  it('reads the geocoder shape and falls back to the formatted address', () => {
    expect(
      addressFromGoogle(
        [
          { types: ['sublocality_level_1'], long_name: 'Koramangala' },
          { types: ['locality'], long_name: 'Bangalore' },
        ],
        '80 Feet Road, 4th Block, Koramangala, Bangalore, Karnataka 560034, India',
      ),
    ).toEqual({
      address_line: '80 Feet Road, 4th Block',
      locality: 'Koramangala',
      city: 'Bengaluru',
    })
  })

  it('maps OpenStreetMap addresses', () => {
    expect(
      addressFromOsm({
        house_number: '12',
        road: '27th Main Road',
        suburb: 'HSR Layout',
        city: 'Bengaluru',
        postcode: '560102',
      }),
    ).toEqual({
      address_line: '12, 27th Main Road',
      locality: 'HSR Layout',
      city: 'Bengaluru',
      pincode: '560102',
    })
  })
})

describe('login redirects', () => {
  it('sends business people to the app and the PG Manager team to the platform', () => {
    expect(homeFor(true)).toBe('/app')
    expect(homeFor(false)).toBe('/app') // no business yet: the app explains how to join
    expect(homeFor(false, true)).toBe('/platform')
    expect(homeFor(true, true)).toBe('/app')
  })

  it('only follows same-site paths', () => {
    expect(safeReturnPath('/app/tenants')).toBe('/app/tenants')
    expect(safeReturnPath('//evil.example')).toBeNull()
    expect(safeReturnPath('https://evil.example')).toBeNull()
    expect(safeReturnPath(undefined)).toBeNull()
  })
})

describe('rent reminders', () => {
  const base = { due_date: '2026-10-20', days_overdue: 0 } as DueReminder

  it.each([
    [{ ...base, days_overdue: 4 }, '4 days late'],
    [{ ...base, due_date: '2026-10-18' }, 'Due today'],
    [{ ...base, due_date: '2026-10-19' }, 'Due in 1 day'],
    [base, 'Due in 2 days'],
  ])('labels %o', (row, label) => {
    expect(dueLabel(row, '2026-10-18').label).toBe(label)
  })

  it('summarises an email run', () => {
    expect(emailSummary({ sent: 3, skipped_recent: 1, no_email: 2, failed: 0 })).toBe(
      '3 emails sent, 1 skipped (reminded in the last 3 days), 2 without an email address.',
    )
    expect(emailSummary({ sent: 1, skipped_recent: 0, no_email: 0, failed: 1 })).toBe(
      '1 email sent, 1 failed.',
    )
  })
})
