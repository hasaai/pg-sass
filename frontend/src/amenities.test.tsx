import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { PropertyAmenity } from './api/types'
import { AmenitiesSection } from './components/AmenitiesSection'
import {
  amenityIndex,
  errorsFromApi,
  fromSaved,
  incompatible,
  newDraft,
  offerLabel,
  toPayload,
  visibleCategories,
} from './lib/amenities'
import type { DraftErrors, Drafts } from './lib/amenities'
import { CATALOG } from './test/amenityCatalog'

afterEach(() => vi.unstubAllGlobals())

const index = amenityIndex(CATALOG)

describe('amenity helpers', () => {
  it('filters by property type and searches names, aliases and categories', () => {
    const keys = (type: string, q = '') =>
      visibleCategories(CATALOG, type, q).flatMap((c) => c.amenities.map((a) => a.key))
    expect(keys('pg')).toContain('meals')
    expect(keys('pg')).not.toContain('private_entrance')
    expect(keys('house')).toContain('private_entrance')
    expect(keys('house')).not.toContain('meals')
    expect(keys('pg', 'hot water')).toEqual(['geyser']) // alias
    expect(keys('pg', 'INTERNET')).toEqual(['wifi']) // case-insensitive
    expect(keys('pg', 'bathroom')).toEqual(['geyser']) // category name
    expect(keys('pg', 'jacuzzi')).toEqual([])
  })

  it('builds the payload with only the fields each amenity supports', () => {
    const drafts: Drafts = {
      wifi: {
        ...newDraft('wifi'),
        sharing: 'shared',
        charge: 'extra',
        charge_amount: '500',
        charge_period: 'month',
        details: { speed_mbps: '100' },
      },
      // stale values the amenity does not support are dropped
      cctv: { ...newDraft('cctv'), sharing: 'private', charge: 'included', quantity: '2' },
      ac: {
        ...newDraft('ac'),
        level: 'room',
        rooms: ['r1'],
        quantity: '3',
        details: { ac_type: 'split' },
      },
      meals: {
        ...newDraft('meals'),
        status: 'unavailable',
        charge: 'included',
        details: { meals: ['lunch'] },
      },
    }
    const { assignments, errors, order } = toPayload(drafts, index)
    expect(errors).toEqual({})
    expect(order).toEqual(['wifi', 'cctv', 'ac', 'meals'])
    expect(assignments).toEqual([
      {
        amenity: 'wifi',
        status: 'available',
        level: 'property',
        note: '',
        sharing: 'shared',
        charge: 'extra',
        charge_amount: 50000,
        charge_period: 'month',
        details: { speed_mbps: 100 },
      },
      { amenity: 'cctv', status: 'available', level: 'property', note: '' },
      {
        amenity: 'ac',
        status: 'available',
        level: 'room',
        note: '',
        quantity: 3,
        rooms: ['r1'],
        details: { ac_type: 'split' },
      },
      { amenity: 'meals', status: 'unavailable', level: 'property', note: '' },
    ])
  })

  it('reports amounts and numbers that cannot be sent', () => {
    const { errors } = toPayload(
      {
        wifi: {
          ...newDraft('wifi'),
          charge: 'extra',
          charge_amount: 'five hundred',
          details: { speed_mbps: 'fast' },
        },
        ac: { ...newDraft('ac'), quantity: '1.5' },
      },
      index,
    )
    expect(Object.keys(errors.wifi ?? {})).toEqual(['charge_amount', 'details'])
    expect(errors.ac?.quantity).toBe('Enter a whole number.')
  })

  it('maps server errors back to amenities and restores saved selections', () => {
    const errors = errorsFromApi(
      {
        assignments: [
          {},
          {
            charge_period: ['Say whether it is per month.'],
            details: { speed_mbps: ['Too fast.'] },
          },
        ],
      },
      ['cctv', 'wifi'],
    )
    expect(errors).toEqual({
      wifi: { charge_period: 'Say whether it is per month.', details: 'speed_mbps: Too fast.' },
    })
    const saved = fromSaved([
      {
        amenity: 'wifi',
        status: 'available',
        sharing: 'private',
        charge: 'extra',
        charge_amount: 50050,
        charge_period: 'month',
        quantity: null,
        level: 'property',
        rooms: [],
        details: { speed_mbps: 50 },
        note: '',
      } as unknown as PropertyAmenity,
    ])
    expect(saved.wifi?.charge_amount).toBe('500.50')
    expect(offerLabel(saved.wifi!)).toBe('Private · ₹500.5 per month')
    expect(incompatible({ ...saved, meals: newDraft('meals') }, index, 'house')).toEqual(['meals'])
  })
})

function Harness({
  type = 'pg',
  errors = {},
  initial = {},
}: {
  type?: string
  errors?: DraftErrors
  initial?: Drafts
}) {
  const [value, setValue] = useState<Drafts>(initial)
  return (
    <>
      <AmenitiesSection
        catalog={CATALOG}
        loading={false}
        error={null}
        onRetry={() => {}}
        propertyType={type}
        value={value}
        onChange={setValue}
        errors={errors}
        rooms={[{ id: 'r1', number: '101' } as never, { id: 'r2', number: '102' } as never]}
      />
      <pre data-testid="value">{JSON.stringify(value)}</pre>
    </>
  )
}

const current = () => JSON.parse(screen.getByTestId('value').textContent || '{}') as Drafts

describe('Amenities section', () => {
  it('navigates categories, selects, shows chips and a count, and clears', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const nav = screen.getByRole('navigation', { name: 'Amenity categories' })
    expect(within(nav).queryByText('Standalone Property Features')).toBeNull() // not for a PG
    await user.click(within(nav).getByRole('button', { name: /Internet & Technology/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Wi-Fi' }))
    expect(screen.getByRole('status')).toHaveTextContent('1 selected')
    expect(
      within(screen.getByRole('list', { name: 'Selected amenities' })).getByText('Wi-Fi'),
    ).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: /Internet & Technology 1/ })).toBeInTheDocument()

    await user.click(within(nav).getByRole('button', { name: /Room & Furnishing/ }))
    await user.click(screen.getByRole('button', { name: 'Select all' }))
    expect(Object.keys(current())).toEqual(['wifi', 'ac', 'wardrobe'])
    await user.click(screen.getByRole('button', { name: 'Clear category' }))
    expect(Object.keys(current())).toEqual(['wifi'])
    await user.click(screen.getByRole('button', { name: 'Remove Wi-Fi' }))
    expect(current()).toEqual({})
    expect(screen.getByRole('status')).toHaveTextContent('0 selected')
  })

  it('searches across categories, with an empty state', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByRole('searchbox', { name: 'Search amenities' }), 'hot water')
    expect(screen.getByRole('checkbox', { name: 'Hot water / geyser' })).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Wi-Fi' })).toBeNull()
    await user.clear(screen.getByRole('searchbox', { name: 'Search amenities' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search amenities' }), 'jacuzzi')
    expect(screen.getByText(/No amenity matches/)).toBeInTheDocument()
  })

  it('shows only the details each amenity supports', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const nav = screen.getByRole('navigation', { name: 'Amenity categories' })

    await user.click(within(nav).getByRole('button', { name: /Safety/ }))
    await user.click(screen.getByRole('checkbox', { name: 'CCTV' }))
    const cctv = screen.getByRole('group', { name: 'CCTV details' })
    expect(within(cctv).queryByLabelText('Shared or private')).toBeNull()
    expect(within(cctv).queryByLabelText('Charge')).toBeNull()

    await user.click(within(nav).getByRole('button', { name: /Internet/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Wi-Fi' }))
    const wifi = screen.getByRole('group', { name: 'Wi-Fi details' })
    await user.selectOptions(within(wifi).getByLabelText('Shared or private'), 'private')
    expect(within(wifi).queryByLabelText('Amount (₹)')).toBeNull()
    await user.selectOptions(within(wifi).getByLabelText('Charge'), 'extra')
    await user.type(within(wifi).getByLabelText('Amount (₹)'), '300')
    await user.type(within(wifi).getByLabelText('Speed (Mbps)'), '100')
    expect(within(wifi).queryByLabelText('Where')).toBeNull() // not room-level
    expect(current().wifi).toMatchObject({
      sharing: 'private',
      charge: 'extra',
      charge_amount: '300',
      charge_period: 'month',
      details: { speed_mbps: '100' },
    })
    expect(screen.getByText('Private · ₹300 per month')).toBeInTheDocument()

    await user.click(within(wifi).getByRole('button', { name: 'Not available' }))
    expect(within(wifi).queryByLabelText('Charge')).toBeNull()
    expect(
      within(screen.getByRole('list', { name: 'Selected amenities' })).getByText('No wi-fi'),
    ).toBeInTheDocument()

    await user.click(within(nav).getByRole('button', { name: /Room & Furnishing/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Air conditioning' }))
    const ac = screen.getByRole('group', { name: 'Air conditioning details' })
    await user.selectOptions(within(ac).getByLabelText('Where'), 'room')
    await user.click(within(ac).getByRole('checkbox', { name: 'Room 102' }))
    expect(current().ac).toMatchObject({ level: 'room', rooms: ['r2'] })

    await user.click(within(nav).getByRole('button', { name: /Kitchen/ }))
    await user.click(screen.getByRole('checkbox', { name: 'Meals' }))
    const meals = screen.getByRole('group', { name: 'Meals details' })
    await user.click(within(meals).getByRole('checkbox', { name: 'Dinner' }))
    expect(current().meals?.details).toEqual({ meals: ['dinner'] })
  })

  it('opens the details of amenities the server rejected', async () => {
    const user = userEvent.setup()
    render(
      <Harness
        initial={{ wifi: { ...newDraft('wifi'), charge: 'extra', charge_amount: '0' } }}
        errors={{ wifi: { charge_amount: 'Enter the extra charge.' } }}
      />,
    )
    await user.click(screen.getByRole('button', { name: /Internet & Technology/ }))
    const wifi = screen.getByRole('group', { name: 'Wi-Fi details' }) // opened without a click
    expect(within(wifi).getByText('Enter the extra charge.')).toBeInTheDocument()
    expect(within(wifi).getByLabelText('Amount (₹)')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows loading, error and empty states', async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    const props = { propertyType: 'pg', value: {}, onChange: () => {}, errors: {}, rooms: [] }
    const { rerender } = render(
      <AmenitiesSection {...props} catalog={undefined} loading error={null} onRetry={retry} />,
    )
    expect(screen.getByRole('status')).toHaveTextContent('Loading amenities')
    rerender(
      <AmenitiesSection
        {...props}
        catalog={undefined}
        loading={false}
        error={new Error('Offline')}
        onRetry={retry}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Offline')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(retry).toHaveBeenCalled()
    rerender(
      <AmenitiesSection
        {...props}
        catalog={{ property_types: [], categories: [] }}
        loading={false}
        error={null}
        onRetry={retry}
      />,
    )
    expect(screen.getByText(/No amenities are set up/)).toBeInTheDocument()
  })
})
