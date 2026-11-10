import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { ApiError } from '../../api/client'
import { createQueryClient } from '../../api/queryClient'
import type { Floor, Property, RentalUnit, Room } from '../../api/types'
import { AuthProvider } from '../../auth/AuthContext'
import { errorMessage } from '../../lib/errors'
import { relativeTime } from '../../lib/format'
import { CATALOG } from '../../test/amenityCatalog'
import { ME, mockApi } from '../../test/render'
import type { Route as ApiRoute } from '../../test/render'
import { statusActions } from './api'
import { RoomDialog } from './detail/dialogs'
import { ImportRoomsDialog } from './detail/ImportRoomsDialog'
import { PropertyDetailPage } from './detail/PropertyDetailPage'
import { floorChoices, groupRooms, nextBedLabel } from './detail/rooms'
import { floorName } from './labels'
import { initialValues, propertySchema, toBody } from './propertyForm'
import { PropertyWizardPage } from './PropertyWizardPage'
import { detailTabs, roomsTabLabel, typeInfo } from './propertyTypes'

// The map is not part of these tests (and needs a real browser).
vi.mock('../../components/LocationPicker', () => ({ default: () => null }))

afterEach(() => vi.unstubAllGlobals())

const PROPERTY = {
  id: 'p1',
  name: 'Lotus',
  status: 'draft',
  status_label: 'Not finished',
  verification_status: 'unverified',
  verification_status_label: 'Not checked yet',
  property_type: 'pg',
  property_type_label: 'PG accommodation',
  unit_word: 'Flat',
  building_name: '',
  description: '',
  address_line: '12, 5th Cross',
  locality: 'HSR Layout',
  landmark: '',
  city: 'Bengaluru',
  state: 'Karnataka',
  pincode: '560102',
  gender: 'women',
  total_floors: null,
  built_up_area_sqft: null,
  year_built: null,
  amenities: ['wifi'],
  latitude: null,
  longitude: null,
  rent_due_day: 5,
  is_active: false,
  beds_total: 0,
  beds_vacant: 0,
  beds_occupied: 0,
  floors_count: 0,
  units_count: 0,
  rooms_count: 0,
  photos: [],
  created_at: '2026-10-01T00:00:00Z',
  updated_at: '2026-10-01T00:00:00Z',
} as unknown as Property

const SAVED_WIFI = {
  id: 'pa1',
  amenity: 'wifi',
  name: 'Wi-Fi',
  category: 'internet',
  category_name: 'Internet & Technology',
  status: 'available',
  sharing: 'shared',
  charge: 'included',
  charge_amount: null,
  charge_period: '',
  quantity: null,
  level: 'property',
  rooms: [],
  room_numbers: [],
  details: {},
  note: '',
  charge_label: 'Included in rent',
  detail_labels: [],
}

const EMPTY_PAGE = { count: 0, next: null, previous: null, results: [] }

function api(extra: ApiRoute) {
  return mockApi((url, init) => {
    if (url.endsWith('/auth/refresh')) return { status: 200, body: { access: 'tok' } }
    if (url.endsWith('/auth/me')) return { status: 200, body: ME }
    if (url.startsWith('/api/v1/amenities/')) return { status: 200, body: CATALOG }
    if (url.startsWith('/api/v1/rooms/')) return { status: 200, body: EMPTY_PAGE }
    return extra(url, init)
  })
}

function renderAt(path: string) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter initialEntries={[path]}>
        <AuthProvider>
          <Routes>
            <Route path="/app/properties/new" element={<PropertyWizardPage />} />
            <Route path="/app/properties/:id/edit" element={<PropertyWizardPage />} />
            <Route path="/app/properties/:id" element={<PropertyDetailPage />} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const bodyOf = (call: unknown[] | undefined) =>
  JSON.parse(String((call?.[1] as RequestInit | undefined)?.body)) as Record<string, unknown>

describe('property types drive the screens', () => {
  it('knows each type’s words and structure', () => {
    expect(typeInfo('pg').sharedLiving).toBe(true)
    expect(typeInfo('house').unitWord).toBe('Portion')
    expect(typeInfo('building').unitWord).toBe('Flat')
    expect(typeInfo('unknown').value).toBe('pg') // safe default
    expect(detailTabs('pg')).toEqual({ units: false, rooms: true })
    expect(detailTabs('apartment').units).toBe(true)
    expect(roomsTabLabel('hostel')).toBe('Rooms & beds')
    expect(roomsTabLabel('apartment')).toBe('Rooms')
  })

  it('sends only questions that apply to the type', () => {
    const v = {
      ...initialValues(),
      property_type: 'pg' as const,
      name: ' Sunrise ',
      gender: 'women' as const,
      building_name: 'Old name',
      year_built: '2010',
      total_floors: '3',
      location: '12.9116, 77.6474',
    }
    const pg = toBody(v, [
      'name',
      'gender',
      'building_name',
      'year_built',
      'total_floors',
      'location',
    ])
    expect(pg).toEqual({
      name: 'Sunrise',
      gender: 'women',
      building_name: '',
      year_built: null,
      total_floors: 3,
      latitude: '12.911600',
      longitude: '77.647400',
    })
    const flat = toBody({ ...v, property_type: 'apartment' }, [
      'gender',
      'building_name',
      'year_built',
    ])
    expect(flat).toEqual({ gender: 'coed', building_name: 'Old name', year_built: 2010 })
  })

  it('explains bad input in plain words', () => {
    const result = propertySchema.safeParse({
      ...initialValues(),
      name: '',
      address_line: 'x',
      locality: 'y',
      pincode: '12',
      rent_due_day: '31',
      location: 'https://maps.app.goo.gl/abc',
    })
    expect(result.success).toBe(false)
    const messages = Object.fromEntries(
      (result.error?.issues ?? []).map((i) => [String(i.path[0]), i.message]),
    )
    expect(messages.name).toMatch(/Enter a name/)
    expect(messages.pincode).toBe('Enter a 6-digit pincode.')
    expect(messages.rent_due_day).toMatch(/1 to 28/)
    expect(messages.location).toMatch(/Short "maps.app.goo.gl" links/)
  })

  it('offers the right status actions', () => {
    expect(statusActions('draft').map((a) => a.action)).toEqual(['activate', 'archive'])
    expect(statusActions('active').map((a) => a.label)).toEqual(['Close for now', 'Remove'])
    expect(statusActions('archived').map((a) => a.action)).toEqual(['restore'])
  })
})

describe('room and floor helpers', () => {
  const floors = [
    { id: 'f1', number: 1, display_name: '1st floor' },
    { id: 'f0', number: 0, display_name: 'Ground floor' },
    { id: 'ft', number: 5, display_name: 'Terrace' },
  ] as Floor[]

  it('names floors and lists choices', () => {
    expect(floorName(0)).toBe('Ground floor')
    expect(floorName(12)).toBe('12th floor')
    expect(floorName(22)).toBe('22nd floor')
    expect(floorName(-1)).toBe('Basement 1')
    const choices = floorChoices(floors, 3)
    expect(choices.map((c) => c.label)).toEqual([
      'Ground floor',
      '1st floor',
      '2nd floor',
      '3rd floor',
      '4th floor',
      'Terrace',
      '6th floor',
    ])
  })

  it('suggests the next free bed letter', () => {
    expect(nextBedLabel(['A', 'B'])).toBe('C')
    expect(nextBedLabel(['B'])).toBe('A')
  })

  it('groups rooms by floor, or by flat when there are flats', () => {
    const rooms = [
      { id: 'r2', number: '10', floor: 'f1', unit: null },
      { id: 'r1', number: '9', floor: 'f1', unit: null },
      { id: 'r3', number: 'G1', floor: 'f0', unit: null },
      { id: 'r4', number: 'X', floor: null, unit: null },
    ] as Room[]
    expect(
      groupRooms(rooms, [], floors).map((g) => [g.title, g.rooms.map((r) => r.number)]),
    ).toEqual([
      ['Ground floor', ['G1']],
      ['1st floor', ['9', '10']],
      ['No floor set', ['X']],
    ])
    const units = [
      {
        id: 'u1',
        code: 'A-101',
        letting: 'by_parts',
        unit_type_label: '3 BHK',
        letting_label: 'Room by room',
      },
      {
        id: 'u2',
        code: 'A-102',
        letting: 'whole',
        unit_type_label: '2 BHK',
        letting_label: 'Whole flat',
      },
    ] as RentalUnit[]
    const inFlat = [{ ...rooms[0]!, unit: 'u1' }, rooms[3]!] as Room[]
    expect(groupRooms(inFlat, units, floors).map((g) => g.title)).toEqual([
      'A-101',
      'Rooms on their own',
    ])
  })

  it('formats times and errors for people', () => {
    const now = Date.parse('2026-10-18T12:00:00Z')
    expect(relativeTime('2026-10-16T12:00:00Z', now)).toBe('2 days ago')
    expect(relativeTime('2026-10-18T11:59:50Z', now)).toBe('just now')
    const err = new ApiError(400, 'validation_error', 'Invalid input.', {
      name: ['Required.'],
      items: [{ message: 'Flat 9 has no rent.' }],
    })
    expect(errorMessage(err, ['name'])).toBe('Flat 9 has no rent.')
    expect(errorMessage(new ApiError(409, 'x', 'Tenants live here.'))).toBe('Tenants live here.')
  })
})

describe('add-property wizard', () => {
  it('asks building questions for a building and creates it after “Name & location”', async () => {
    const fetchMock = api((url, init) => {
      if (url === '/api/v1/properties/' && init.method === 'POST')
        return {
          status: 201,
          body: { ...PROPERTY, name: 'Maple Residency', property_type: 'building' },
        }
      if (url === '/api/v1/properties/p1/' && init.method === 'PATCH')
        return { status: 200, body: { ...PROPERTY, property_type: 'building' } }
      if (url === '/api/v1/properties/p1/amenities/') return { status: 200, body: [] }
      return undefined
    })
    const user = userEvent.setup()
    renderAt('/app/properties/new')
    await user.click(await screen.findByRole('radio', { name: 'Standalone building' }))
    expect(screen.getByText(/You add flats/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))

    expect(screen.queryByLabelText('Who can stay')).toBeNull() // not shared living
    await user.type(screen.getByLabelText(/Property name/), 'Maple Residency')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByText('Enter the street address.')).toBeInTheDocument()
    expect(
      fetchMock.mock.calls.some(([u, i]) => u === '/api/v1/properties/' && i?.method === 'POST'),
    ).toBe(false)

    await user.type(screen.getByLabelText(/^Address/), '18, 5th Main')
    await user.type(screen.getByLabelText(/^Locality/), 'HSR Layout')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByLabelText('Building name')).toBeInTheDocument()
    expect(screen.getByLabelText('Year built')).toBeInTheDocument()
    const post = fetchMock.mock.calls.find(
      ([u, i]) => u === '/api/v1/properties/' && i?.method === 'POST',
    )
    expect(bodyOf(post)).toMatchObject({
      property_type: 'building',
      name: 'Maple Residency',
      gender: 'coed',
      address_line: '18, 5th Main',
    })

    await user.type(screen.getByLabelText('Year built'), '1700')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(
      await screen.findByText(/Year built: enter a whole number from 1800/),
    ).toBeInTheDocument()
    await user.clear(screen.getByLabelText('Year built'))
    await user.type(screen.getByLabelText('Year built'), '2016')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'PATCH')).toBe(true),
    )
    const patch = fetchMock.mock.calls.find(([, i]) => i?.method === 'PATCH')
    expect(bodyOf(patch)).toMatchObject({ year_built: 2016, building_name: '' })
    expect(await screen.findByRole('heading', { name: 'Amenities' })).toBeInTheDocument()
  })

  it('asks who can stay for a PG, not the year it was built', async () => {
    api(() => undefined)
    const user = userEvent.setup()
    renderAt('/app/properties/new')
    await user.click(await screen.findByRole('button', { name: 'Continue' }))
    expect(screen.getByLabelText('Who can stay')).toBeInTheDocument()
  })

  it('maps server errors to fields', async () => {
    api((url, init) => {
      if (url === '/api/v1/properties/p1/') {
        if (init.method === 'PATCH')
          return {
            status: 400,
            body: {
              error: {
                code: 'validation_error',
                message: 'Invalid input.',
                fields: { pincode: ['Enter a 6-digit pincode.'] },
              },
            },
          }
        return { status: 200, body: PROPERTY }
      }
      if (url === '/api/v1/properties/p1/amenities/') return { status: 200, body: [] }
      return undefined
    })
    const user = userEvent.setup()
    renderAt('/app/properties/p1/edit?step=details')
    await user.click(await screen.findByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByText('Enter a 6-digit pincode.')).toBeInTheDocument()
  })

  it('saves amenities only when they changed, and shows their errors', async () => {
    const fetchMock = api((url, init) => {
      if (url === '/api/v1/properties/p1/') return { status: 200, body: PROPERTY }
      if (url === '/api/v1/properties/p1/amenities/' && init.method === 'PUT')
        return {
          status: 400,
          body: {
            error: {
              code: 'validation_error',
              message: 'Invalid input.',
              fields: { assignments: [{ sharing: ['Wi-Fi cannot be marked shared or private.'] }] },
            },
          },
        }
      if (url === '/api/v1/properties/p1/amenities/') return { status: 200, body: [SAVED_WIFI] }
      return undefined
    })
    const user = userEvent.setup()
    renderAt('/app/properties/p1/edit?step=amenities')
    const chips = await screen.findByRole('list', { name: 'Selected amenities' })
    expect(within(chips).getByText('Wi-Fi')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByRole('heading', { name: 'Logo & photos' })).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'PUT')).toBe(false)

    await user.click(screen.getByRole('button', { name: 'Back' }))
    await user.click(await screen.findByRole('button', { name: /Internet & Technology/ }))
    await user.click(screen.getByRole('button', { name: 'Details' }))
    await user.selectOptions(screen.getByLabelText('Shared or private'), 'private')
    await user.click(screen.getByRole('button', { name: 'Save and continue' }))
    expect(await screen.findByText(/Some amenity details need fixing/)).toBeInTheDocument()
    expect(await screen.findByText('Wi-Fi cannot be marked shared or private.')).toBeInTheDocument()
  })
})

describe('rooms', () => {
  const pg = { ...PROPERTY, status: 'active', total_floors: 2 } as Property

  function renderDialog(ui: React.ReactElement) {
    return render(
      <QueryClientProvider client={createQueryClient()}>
        <MemoryRouter>{ui}</MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('adds a room rented bed by bed with its beds', async () => {
    const fetchMock = mockApi((url, init) =>
      url === '/api/v1/rooms/' && init.method === 'POST'
        ? { status: 201, body: { id: 'r1', number: '101' } }
        : undefined,
    )
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderDialog(
      <RoomDialog open onOpenChange={onOpenChange} property={pg} floors={[]} units={[]} />,
    )
    await user.type(screen.getByLabelText(/Room number/), '101')
    await user.selectOptions(screen.getByLabelText('Floor'), '1')
    await user.clear(screen.getByLabelText(/Sharing/))
    await user.type(screen.getByLabelText(/Sharing/), '3')
    await user.click(screen.getByRole('button', { name: 'Add room and 3 beds' }))
    expect(await screen.findByText('Enter the rent per bed, e.g. 8500.')).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Rent per bed/), '8500')
    await user.click(screen.getByRole('button', { name: 'Add room and 3 beds' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    const post = fetchMock.mock.calls.find(([, i]) => i?.method === 'POST')
    expect(bodyOf(post)).toMatchObject({
      property: 'p1',
      number: '101',
      floor_number: 1,
      sharing: 3,
      letting: 'by_parts',
      bed_rent: 850000,
      bed_count: 3,
      monthly_rent: null,
    })
  })

  it('checks a rooms CSV first, then adds all rooms', async () => {
    const row = (n: number, room: string, problems: string[]) => ({
      row: n,
      room,
      flat: '',
      floor: 1,
      sharing: 2,
      rent_per_bed: 850000,
      whole_room_rent: null,
      problems,
    })
    let commits = 0
    const fetchMock = mockApi((url, init) => {
      if (url !== '/api/v1/properties/p1/rooms-import/' || init.method !== 'POST') return undefined
      const commit = (init.body as FormData).get('commit') === 'true'
      if (commit) commits += 1
      return {
        status: 200,
        body: {
          rows: [row(2, '101', []), row(3, '102', [])],
          valid: 2,
          invalid: 0,
          beds: 4,
          created: commit ? 2 : 0,
        },
      }
    })
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderDialog(<ImportRoomsDialog open onOpenChange={onOpenChange} property={pg} />)
    expect(screen.getByRole('button', { name: 'Add rooms' })).toBeDisabled()
    await user.upload(
      screen.getByLabelText('Rooms CSV file'),
      new File(['room,sharing,rent_per_bed\n101,2,8500\n102,2,8500\n'], 'rooms.csv', {
        type: 'text/csv',
      }),
    )
    expect(await screen.findByText('Everything looks right')).toBeInTheDocument()
    expect(commits).toBe(0)
    await user.click(screen.getByRole('button', { name: 'Add 2 rooms and 4 beds' }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    expect(commits).toBe(1)
    expect(fetchMock).toHaveBeenCalled()
  })

  it('shows the problems of each line and adds nothing', async () => {
    mockApi((url) =>
      url === '/api/v1/properties/p1/rooms-import/'
        ? {
            status: 200,
            body: {
              rows: [
                {
                  row: 2,
                  room: '101',
                  flat: '',
                  floor: null,
                  sharing: null,
                  rent_per_bed: null,
                  whole_room_rent: null,
                  problems: ['Sharing “two” is not a whole number.'],
                },
              ],
              valid: 0,
              invalid: 1,
              beds: 0,
              created: 0,
            },
          }
        : undefined,
    )
    const user = userEvent.setup()
    renderDialog(<ImportRoomsDialog open onOpenChange={vi.fn()} property={pg} />)
    await user.upload(
      screen.getByLabelText('Rooms CSV file'),
      new File(['room,sharing\n101,two\n'], 'rooms.csv', { type: 'text/csv' }),
    )
    expect(await screen.findByText('1 line needs fixing')).toBeInTheDocument()
    expect(screen.getByText('Sharing “two” is not a whole number.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add rooms' })).toBeDisabled()
  })

  it('adds a balcony as an extra charge and a geyser in the rent', async () => {
    const fetchMock = mockApi((url, init) => {
      if (url === '/api/v1/rooms/feature-choices/')
        return {
          status: 200,
          body: [
            { key: 'balcony', name: 'Balcony', category: 'Room & Furnishing' },
            { key: 'geyser', name: 'Hot water / geyser', category: 'Bathroom & Hygiene' },
          ],
        }
      if (url === '/api/v1/rooms/' && init.method === 'POST')
        return { status: 201, body: { id: 'r1', number: '102' } }
      return undefined
    })
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    renderDialog(
      <RoomDialog open onOpenChange={onOpenChange} property={pg} floors={[]} units={[]} />,
    )
    await user.type(screen.getByLabelText(/Room number/), '102')
    await user.type(screen.getByLabelText(/Rent per bed/), '8500')
    await user.click(await screen.findByRole('checkbox', { name: 'Balcony' }))
    await user.click(screen.getByRole('checkbox', { name: 'Hot water / geyser' }))
    await user.click(
      within(screen.getByRole('radiogroup', { name: 'Balcony: included or extra' })).getByRole(
        'radio',
        { name: 'Extra' },
      ),
    )
    await user.click(screen.getByRole('button', { name: /Add room and/ }))
    expect(
      await screen.findByText('Balcony: enter the extra charge per month, e.g. 500.'),
    ).toBeInTheDocument()
    await user.type(screen.getByLabelText('Balcony extra charge per month'), '500')
    await user.click(screen.getByRole('button', { name: /Add room and/ }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
    const post = fetchMock.mock.calls.find(
      ([u, i]) => u === '/api/v1/rooms/' && i?.method === 'POST',
    )
    expect(bodyOf(post).features).toEqual([
      { amenity: 'balcony', charge: 'extra', charge_amount: 50000 },
      { amenity: 'geyser', charge: 'included', charge_amount: null },
    ])
  })

  it('does not let sharing go below the beds a room has', async () => {
    mockApi(() => undefined)
    const room = {
      id: 'r1',
      number: '101',
      floor: null,
      unit: null,
      room_type: 'shared',
      sharing: 3,
      letting: 'by_parts',
      monthly_rent: null,
      is_ac: false,
      has_attached_bath: false,
      features: [],
      beds: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }],
    } as unknown as Room
    const user = userEvent.setup()
    renderDialog(
      <RoomDialog open onOpenChange={vi.fn()} property={pg} floors={[]} units={[]} room={room} />,
    )
    await user.clear(screen.getByLabelText(/Sharing/))
    await user.type(screen.getByLabelText(/Sharing/), '2')
    await user.click(screen.getByRole('button', { name: 'Save room' }))
    expect(
      await screen.findByText(
        'This room has 3 beds. Remove a bed first, or keep the sharing at 3.',
      ),
    ).toBeInTheDocument()
  })

  it('edits a room and switches it to a whole room with its own rent', async () => {
    const fetchMock = mockApi((url, init) =>
      url === '/api/v1/rooms/r1/' && init.method === 'PATCH'
        ? { status: 200, body: { id: 'r1', number: '101' } }
        : undefined,
    )
    const room = {
      id: 'r1',
      number: '101',
      floor: 'f1',
      unit: null,
      room_type: 'shared',
      sharing: 2,
      letting: 'by_parts',
      monthly_rent: null,
      is_ac: false,
      has_attached_bath: false,
      beds: [],
    } as unknown as Room
    const user = userEvent.setup()
    renderDialog(
      <RoomDialog
        open
        onOpenChange={vi.fn()}
        property={pg}
        floors={[{ id: 'f1', number: 1, display_name: '1st floor' } as Floor]}
        units={[]}
        room={room}
      />,
    )
    expect(screen.getByLabelText('Floor')).toHaveValue('1')
    await user.click(screen.getByRole('radio', { name: 'Whole room' }))
    await user.click(screen.getByRole('checkbox', { name: 'Air-conditioned' }))
    await user.click(screen.getByRole('button', { name: 'Save room' }))
    expect(await screen.findByText(/Enter the rent for the whole room/)).toBeInTheDocument()
    await user.type(screen.getByLabelText(/Rent for the room/), '15,000')
    await user.click(screen.getByRole('button', { name: 'Save room' }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, i]) => i?.method === 'PATCH')).toBe(true),
    )
    const patch = fetchMock.mock.calls.find(([, i]) => i?.method === 'PATCH')
    expect(bodyOf(patch)).toMatchObject({
      letting: 'whole',
      monthly_rent: 1500000,
      is_ac: true,
      floor_number: 1,
    })
    expect(bodyOf(patch)).not.toHaveProperty('bed_rent')
  })

  it('has no rent for a room inside a flat rented as a whole', () => {
    mockApi(() => undefined)
    const flat = {
      id: 'u1',
      code: 'Flat 302',
      letting: 'whole',
      letting_label: 'Whole flat',
    } as RentalUnit
    renderDialog(
      <RoomDialog
        open
        onOpenChange={vi.fn()}
        property={{ ...pg, property_type: 'apartment' } as Property}
        floors={[]}
        units={[flat]}
        defaultUnit="u1"
      />,
    )
    expect(
      screen.getByText('Flat 302 is rented as a whole, so this room has no rent of its own.'),
    ).toBeInTheDocument()
    expect(screen.queryByLabelText(/Rent per bed/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Add room' })).toBeInTheDocument()
  })
})

describe('property page', () => {
  function pageApi(property: Partial<Property>, readiness = { ready: true, problems: [] }) {
    return api((url) => {
      if (url === '/api/v1/properties/p1/')
        return { status: 200, body: { ...PROPERTY, ...property } }
      if (url === '/api/v1/properties/p1/inventory/')
        return { status: 200, body: { floors: [], units: [], rooms: [] } }
      if (url === '/api/v1/properties/p1/amenities/') return { status: 200, body: [] }
      if (url === '/api/v1/properties/p1/readiness/') return { status: 200, body: readiness }
      return undefined
    })
  }

  it('shows flats for a building and what is left before opening', async () => {
    pageApi({ property_type: 'building' }, {
      ready: false,
      problems: [
        {
          code: 'unit_without_rent',
          message: 'Flat 109 has no rent.',
          target_type: 'unit',
          target_id: 'u9',
        },
      ],
    } as never)
    renderAt('/app/properties/p1')
    expect(await screen.findByRole('tab', { name: /Flats/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^Rooms/ })).toBeInTheDocument()
    expect(await screen.findByText('Flat 109 has no rent.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open property' })).toBeDisabled()
  })

  it('shows rooms & beds and no flats tab for a PG', async () => {
    pageApi({ property_type: 'pg', status: 'active', status_label: 'Open' })
    renderAt('/app/properties/p1')
    expect(await screen.findByRole('tab', { name: /Rooms & beds/ })).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /Flats/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Open property' })).toBeNull()
  })
})
