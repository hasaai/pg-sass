import type { AmenityCatalog, CatalogAmenity } from '../api/types'

const base = {
  property_types: [],
  supports_sharing: false,
  supports_charge: false,
  supports_quantity: false,
  supports_rooms: false,
  attributes: [],
  aliases: [],
  is_filterable: false,
}

const amenity = (o: Partial<CatalogAmenity> & { key: string; name: string }): CatalogAmenity => ({
  ...base,
  ...o,
})

/** A small slice of the real catalog, shaped exactly like GET /amenities/. */
export const CATALOG: AmenityCatalog = {
  property_types: [
    { value: 'pg', label: 'PG accommodation' },
    { value: 'apartment', label: 'Apartment' },
    { value: 'house', label: 'Independent house' },
  ],
  categories: [
    {
      key: 'room',
      name: 'Room & Furnishing',
      amenities: [
        amenity({
          key: 'ac',
          name: 'Air conditioning',
          supports_rooms: true,
          supports_charge: true,
          supports_quantity: true,
          attributes: [
            {
              key: 'ac_type',
              label: 'Type',
              type: 'choice',
              options: [
                ['split', 'Split'],
                ['window', 'Window'],
              ],
            },
          ],
          is_filterable: true,
        }),
        amenity({ key: 'wardrobe', name: 'Wardrobe / cupboard', supports_rooms: true }),
      ],
    },
    {
      key: 'bathroom',
      name: 'Bathroom & Hygiene',
      amenities: [
        amenity({
          key: 'geyser',
          name: 'Hot water / geyser',
          aliases: ['hot water', 'water heater'],
          is_filterable: true,
        }),
      ],
    },
    {
      key: 'kitchen',
      name: 'Kitchen & Dining',
      amenities: [
        amenity({
          key: 'meals',
          name: 'Meals',
          property_types: ['pg', 'coliving', 'hostel'],
          supports_charge: true,
          attributes: [
            {
              key: 'meals',
              label: 'Meals served',
              type: 'multi',
              options: [
                ['breakfast', 'Breakfast'],
                ['lunch', 'Lunch'],
                ['dinner', 'Dinner'],
              ],
            },
          ],
          is_filterable: true,
        }),
      ],
    },
    {
      key: 'internet',
      name: 'Internet & Technology',
      amenities: [
        amenity({
          key: 'wifi',
          name: 'Wi-Fi',
          supports_sharing: true,
          supports_charge: true,
          attributes: [
            { key: 'speed_mbps', label: 'Speed', type: 'int', min: 1, max: 10000, unit: 'Mbps' },
          ],
          aliases: ['internet'],
          is_filterable: true,
        }),
      ],
    },
    {
      key: 'safety',
      name: 'Safety & Accessibility',
      amenities: [amenity({ key: 'cctv', name: 'CCTV', is_filterable: true })],
    },
    {
      key: 'standalone',
      name: 'Standalone Property Features',
      amenities: [
        amenity({
          key: 'private_entrance',
          name: 'Private entrance',
          property_types: ['house', 'apartment'],
        }),
      ],
    },
  ],
}
