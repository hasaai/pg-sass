import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createQueryClient } from '../../../api/queryClient'
import type { Floor, Property, Room, Stay } from '../../../api/types'
import { mockApi } from '../../../test/render'
import { nextRoomNumber, quickAddCsv, roomNumbers } from './rooms'
import { RoomsTab } from './RoomsTab'
import { countRooms, floorSummaries, indexStays, maintenancePlan, rentPreview } from './roomStats'

afterEach(() => vi.unstubAllGlobals())

const PG = { id: 'p1', name: 'Lotus', property_type: 'pg', total_floors: 3 } as Property
const FLOORS = [{ id: 'f1', number: 1, display_name: '1st floor' }] as Floor[]
const bed = (id: string, label: string, status: string, status_label: string) => ({
  id,
  label,
  status,
  status_label,
  monthly_rent: 850000,
})
const ROOMS = [
  {
    id: 'r1',
    number: '101',
    floor: 'f1',
    unit: null,
    sharing: 2,
    letting: 'by_parts',
    room_type: 'shared',
    room_type_label: 'Shared',
    is_ac: true,
    has_attached_bath: false,
    features: [
      { amenity: 'television', name: 'Television', charge: 'extra', charge_amount: 30000 },
    ],
    beds: [bed('b1', 'A', 'occupied', 'Filled'), bed('b2', 'B', 'vacant', 'Free')],
  },
  {
    id: 'r2',
    number: '102',
    floor: 'f1',
    unit: null,
    sharing: 3,
    letting: 'by_parts',
    room_type: 'shared',
    room_type_label: 'Shared',
    features: [],
    beds: [bed('b3', 'A', 'occupied', 'Filled')],
  },
] as unknown as Room[]

function renderTab(rooms = ROOMS) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <RoomsTab property={PG} floors={FLOORS} units={[]} rooms={rooms} canManage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('room helpers', () => {
  it('turns a range into room numbers', () => {
    expect(roomNumbers('101', '104')).toEqual(['101', '102', '103', '104'])
    expect(roomNumbers('009', '011')).toEqual(['009', '010', '011'])
    expect(roomNumbers('G1', '')).toEqual(['G1'])
    expect(roomNumbers('105', '101')).toEqual([])
    expect(roomNumbers('', '5')).toEqual([])
  })

  it('suggests the next room number', () => {
    expect(nextRoomNumber(ROOMS, '101')).toBe('103')
    expect(nextRoomNumber([], '201')).toBe('201')
  })

  it('writes amenities as yes (included) or an extra charge', () => {
    const csv = quickAddCsv({
      numbers: ['101', '102'],
      floor: '1',
      flat: '',
      sharing: 2,
      whole: false,
      rent: '8,500',
      ac: true,
      bath: false,
      features: { balcony: '', television: '300' },
    })
    expect(csv.split('\n')).toEqual([
      'room,floor,sharing,rent_per_bed,whole_room_rent,room_type,ac,attached_bathroom,flat,balcony,television',
      '101,1,2,8500,,shared,yes,no,,yes,300',
      '102,1,2,8500,,shared,yes,no,,yes,300',
      '',
    ])
  })
})

const STAY = {
  id: 's1',
  tenant: { id: 't1', full_name: 'Ravi Kumar', phone: '9000000001' },
  bed: null,
  place: {
    kind: 'bed',
    bed_id: 'b1',
    room_id: 'r1',
    unit_id: null,
    label: '',
    kind_label: '',
    property_id: 'p1',
    property_name: 'Lotus',
  },
  status: 'active',
  status_label: 'Staying',
  check_in: '2026-06-01',
  expected_checkout: null,
  monthly_rent: 800000,
}

function renderWithTenants(rooms = ROOMS) {
  return render(
    <QueryClientProvider client={createQueryClient()}>
      <MemoryRouter>
        <RoomsTab property={PG} floors={FLOORS} units={[]} rooms={rooms} canManage canSeeTenants />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function staysApi(extra?: (url: string, init: RequestInit) => unknown) {
  return mockApi((url, init) => {
    if (url.startsWith('/api/v1/stays/'))
      return {
        status: 200,
        body: { next: null, previous: null, results: url.includes('status=active') ? [STAY] : [] },
      }
    return extra?.(url, init) as ReturnType<Parameters<typeof mockApi>[0]>
  })
}

describe('room counts', () => {
  it('counts beds, leaving soon, maintenance and availability', () => {
    const rooms = [
      { ...ROOMS[0]!, beds: [bed('b1', 'A', 'occupied', ''), bed('b2', 'B', 'blocked', '')] },
      ROOMS[1]!,
    ] as Room[]
    const notice = indexStays([{ ...STAY, status: 'notice' } as unknown as Stay])
    const c = countRooms(rooms, notice)
    expect(c).toMatchObject({ beds: 3, occupied: 1, notice: 1, blocked: 1, sellable: 2, vacant: 0 })
    expect(c.occupancyPct).toBe(100)
    expect(c.blockedRent).toBe(850000)
  })

  it('lists every floor of the building, top floor first', () => {
    const five = floorSummaries(ROOMS, FLOORS, 5)
    expect(five.map((f) => f.title)).toEqual([
      '4th floor',
      '3rd floor',
      '2nd floor',
      '1st floor',
      'Ground floor',
    ])
    expect(five.find((f) => f.title === '1st floor')?.counts.rooms).toBe(2)
    expect(five.find((f) => f.title === '4th floor')?.rooms).toEqual([])
  })

  it('previews rent changes rounded to ₹10 and never below zero', () => {
    const up = rentPreview([ROOMS[0]!], { kind: 'percent', percent: 5 })
    expect(up.map((c) => [c.label, c.from, c.to, c.occupied])).toEqual([
      ['Room 101 · Bed A', 850000, 893000, true],
      ['Room 101 · Bed B', 850000, 893000, false],
    ])
    expect(rentPreview([ROOMS[0]!], { kind: 'add', amount: -9000000 })[0]!.to).toBe(0)
  })

  it('never puts an occupied bed under maintenance', () => {
    const plan = maintenancePlan(ROOMS, true)
    expect(plan.change.map((c) => c.bed.id)).toEqual(['b2'])
    expect(plan.skippedOccupied.map((c) => c.bed.id)).toEqual(['b1', 'b3'])
  })
})

describe('rooms and beds screen', () => {
  it('opens on the floor layout: building → floor → room → beds → tenant', async () => {
    staysApi()
    const user = userEvent.setup()
    renderWithTenants()
    expect(screen.getByRole('tab', { name: 'Floor layout' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    const floors = within(screen.getByRole('navigation', { name: 'Floors' })).getAllByRole('button')
    expect(floors).toHaveLength(3) // total_floors 3: ground, 1st, 2nd
    expect(screen.getByRole('heading', { name: '1st floor' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Open room 101' }))
    expect(screen.getByRole('tab', { name: 'Bed allocation' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('navigation', { name: 'Where you are' })).toHaveTextContent(
      'Building1st floorRoom 101',
    )
    expect(screen.getAllByRole('article')).toHaveLength(2)
    expect(await screen.findByRole('link', { name: 'Ravi Kumar' })).toHaveAttribute(
      'href',
      '/app/tenants/t1',
    )
    expect(
      within(screen.getByRole('article', { name: 'Bed B' })).getByText('Ready for a tenant.'),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: '1st floor' }))
    expect(screen.getByRole('tab', { name: 'Floor layout' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('shows the room table with beds and filters', async () => {
    mockApi(() => undefined)
    const user = userEvent.setup()
    renderTab()
    await user.click(screen.getByRole('tab', { name: 'Room table' }))
    expect(screen.getByRole('button', { name: 'Bed B in room 101: Vacant' })).toBeVisible()
    expect(screen.getByText('Television +₹300')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Only free beds' }))
    expect(screen.queryByText('Room 102')).toBeNull()
    expect(screen.getAllByText('Room 101')[0]).toBeVisible()
  })

  it('deletes a room after asking in the row', async () => {
    const fetchMock = mockApi((url, init) =>
      url === '/api/v1/rooms/r2/archive/' && init.method === 'POST'
        ? { status: 200, body: {} }
        : undefined,
    )
    const user = userEvent.setup()
    renderTab()
    await user.click(screen.getByRole('tab', { name: 'Room table' }))
    await user.click(screen.getAllByRole('button', { name: 'Delete room 102' })[0]!)
    expect(screen.getByText(/Delete room 102 and its 1 bed\?/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Yes, delete' }))
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => u === '/api/v1/rooms/r2/archive/')).toBe(true),
    )
  })

  it('blocks free beds for maintenance after a preview and a confirmation', async () => {
    const fetchMock = staysApi((url, init) =>
      url === '/api/v1/beds/b2/' && init.method === 'PATCH' ? { status: 200, body: {} } : undefined,
    )
    const user = userEvent.setup()
    renderWithTenants()
    await user.click(screen.getByRole('tab', { name: 'Maintenance & adjustments' }))
    await user.click(screen.getByRole('checkbox', { name: 'Pick room 101' }))
    await user.click(screen.getByRole('radio', { name: 'Maintenance' }))
    await user.click(screen.getByRole('button', { name: 'Preview changes' }))
    expect(screen.getByText(/1 occupied bed is left as it is/)).toBeVisible()
    expect(screen.getByRole('cell', { name: 'Room 101 · Bed B' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Apply 1 change/ }))
    expect(fetchMock.mock.calls.some(([u]) => u === '/api/v1/beds/b2/')).toBe(false) // not yet
    await user.click(screen.getByRole('button', { name: 'Yes, apply' }))
    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([u]) => u === '/api/v1/beds/b2/')
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ status: 'blocked' })
    })
  })

  it('raises rent for picked rooms and explains that tenants keep their rent', async () => {
    const fetchMock = staysApi((url, init) =>
      url.startsWith('/api/v1/beds/') && init.method === 'PATCH'
        ? { status: 200, body: {} }
        : undefined,
    )
    const user = userEvent.setup()
    renderWithTenants()
    await user.click(screen.getByRole('tab', { name: 'Maintenance & adjustments' }))
    await user.click(screen.getByRole('checkbox', { name: 'Pick room 101' }))
    await user.type(screen.getByLabelText('Amount (₹ a month)'), 'abc')
    expect(screen.getByText('Enter an amount in rupees, e.g. 500.')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Preview changes' })).toBeDisabled()
    await user.clear(screen.getByLabelText('Amount (₹ a month)'))
    await user.type(screen.getByLabelText('Amount (₹ a month)'), '500')
    await user.click(screen.getByRole('button', { name: 'Preview changes' }))
    expect(screen.getByText(/their agreed rent stays as it is/)).toBeVisible()
    await user.click(screen.getByRole('button', { name: /Apply 2 changes/ }))
    await user.click(screen.getByRole('button', { name: 'Yes, apply' }))
    await waitFor(() => {
      const bodies = fetchMock.mock.calls
        .filter(([u, i]) => String(u).startsWith('/api/v1/beds/') && i?.method === 'PATCH')
        .map(([, i]) => JSON.parse(String(i?.body)))
      expect(bodies).toEqual([{ monthly_rent: 900000 }, { monthly_rent: 900000 }])
    })
  })

  it('adds many rooms at once with their amenities', async () => {
    const sent: string[] = []
    const fetchMock = mockApi((url, init) => {
      if (url === '/api/v1/rooms/feature-choices/')
        return { status: 200, body: [{ key: 'balcony', name: 'Balcony', category: 'Room' }] }
      if (url === '/api/v1/properties/p1/rooms-import/') {
        const form = init.body as FormData
        sent.push(String(form.get('commit')))
        return {
          status: 200,
          body: { rows: [], valid: 3, invalid: 0, beds: 6, created: sent.length === 2 ? 3 : 0 },
        }
      }
      return undefined
    })
    const user = userEvent.setup()
    renderTab([])
    await user.click(screen.getAllByRole('button', { name: 'Add rooms' })[0]!)
    expect(screen.getByLabelText('First room number')).toHaveValue('101') // suggested
    await user.type(screen.getByLabelText('Last room number'), '103')
    await user.type(screen.getByLabelText(/Rent per bed/), '8500')
    await user.click(await screen.findByRole('button', { name: 'Balcony' }))
    expect(
      screen.getByText(
        (_, el) =>
          el?.tagName === 'P' &&
          el.textContent === '3 rooms (101 to 103) with 6 beds will be added to 1st floor.',
      ),
    ).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Add 3 rooms' }))
    await waitFor(() => expect(sent).toEqual(['false', 'true']))
    const call = fetchMock.mock.calls.find(([u]) => u === '/api/v1/properties/p1/rooms-import/')
    const file = (call?.[1]?.body as FormData).get('file') as File
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.readAsText(file)
    })
    expect(text).toContain('balcony')
    expect(text).toContain('103,1,2,8500,,shared,no,no,,yes')
  })
})
