/** Sample data for the prototype: one Bengaluru PG business with three properties. */
import type {
  Activity,
  Bed,
  Business,
  Complaint,
  Enquiry,
  Expense,
  Invoice,
  Member,
  Notice,
  Payment,
  Plan,
  PlatformBusiness,
  PlatformPayment,
  PlatformStaffMember,
  Property,
  Reminder,
  Room,
  SmsGateway,
  Staff,
  SupportTicket,
  Tenant,
  VerificationItem,
} from './types'

/** "Today" in the prototype, so the numbers always make sense. */
export const TODAY = '2026-11-02'
export const THIS_MONTH = '2026-11'
export const LAST_MONTH = '2026-10'

// Small deterministic random generator so the data is the same on every load.
let seed = 42
function rand() {
  seed = (seed * 1664525 + 1013904223) % 4294967296
  return seed / 4294967296
}
const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)] as T
const int = (min: number, max: number) => Math.floor(rand() * (max - min + 1)) + min
const pad = (n: number, w = 2) => String(n).padStart(w, '0')
const rupees = (n: number) => n * 100

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y!, m! - 1, d! + days)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export const AMENITY_CATALOG = [
  { key: 'wifi', name: 'Wi-Fi', group: 'Basics' },
  { key: 'power_backup', name: 'Power backup', group: 'Basics' },
  { key: 'ro_water', name: 'RO drinking water', group: 'Basics' },
  { key: 'hot_water', name: 'Hot water / geyser', group: 'Basics' },
  { key: 'meals', name: 'Meals (3 times)', group: 'Food' },
  { key: 'tea_coffee', name: 'Tea & coffee', group: 'Food' },
  { key: 'fridge', name: 'Refrigerator', group: 'Food' },
  { key: 'washing_machine', name: 'Washing machine', group: 'Laundry & cleaning' },
  { key: 'housekeeping', name: 'Daily housekeeping', group: 'Laundry & cleaning' },
  { key: 'laundry', name: 'Laundry service', group: 'Laundry & cleaning' },
  { key: 'cctv', name: 'CCTV', group: 'Safety' },
  { key: 'security_guard', name: 'Security guard', group: 'Safety' },
  { key: 'biometric', name: 'Biometric entry', group: 'Safety' },
  { key: 'fire_safety', name: 'Fire extinguishers', group: 'Safety' },
  { key: 'parking_2w', name: 'Two-wheeler parking', group: 'Building' },
  { key: 'parking_4w', name: 'Car parking', group: 'Building' },
  { key: 'lift', name: 'Lift', group: 'Building' },
  { key: 'gym', name: 'Gym', group: 'Common areas' },
  { key: 'tv_lounge', name: 'TV lounge', group: 'Common areas' },
  { key: 'terrace', name: 'Terrace / sit-out', group: 'Common areas' },
  { key: 'study_room', name: 'Study room', group: 'Common areas' },
] as const

export const ROOM_FEATURES = [
  { key: 'bed', name: 'Bed / cot' },
  { key: 'mattress', name: 'Mattress' },
  { key: 'wardrobe', name: 'Wardrobe / cupboard' },
  { key: 'study_table', name: 'Study table & chair' },
  { key: 'fan', name: 'Ceiling fan' },
  { key: 'television', name: 'Television' },
  { key: 'balcony', name: 'Balcony' },
  { key: 'geyser', name: 'Hot water / geyser' },
  { key: 'western_toilet', name: 'Western toilet' },
  { key: 'refrigerator', name: 'Refrigerator' },
] as const

export const business: Business = {
  id: 'biz1',
  name: 'Asha Stays',
  ownerName: 'Asha Rao',
  phone: '98450 12345',
  email: 'asha@ashastays.in',
  gstin: '29ABCDE1234F1Z5',
  address: '12, 5th Cross, 27th Main, HSR Layout Sector 2',
  city: 'Bengaluru',
  logoText: 'AS',
  plan: 'pro',
  planStatus: 'trial',
  planRenewsOn: '2026-11-12',
  verification: 'draft',
  emailConfirmed: false,
}

export const plans: Plan[] = [
  {
    code: 'free',
    name: 'Free',
    pricePerMonth: 0,
    pricePerYear: 0,
    limits: { properties: 1, beds: 20, team: 1, tenants: 20 },
    features: ['Rooms & beds', 'Tenants', 'Rent tracking', 'Receipts'],
  },
  {
    code: 'starter',
    name: 'Starter',
    pricePerMonth: rupees(499),
    pricePerYear: rupees(4990),
    limits: { properties: 2, beds: 60, team: 3, tenants: 60 },
    features: [
      'Everything in Free',
      'WhatsApp & SMS reminders',
      'Complaints',
      'Notices',
      'Expenses',
    ],
  },
  {
    code: 'pro',
    name: 'Pro',
    pricePerMonth: rupees(1299),
    pricePerYear: rupees(12990),
    limits: { properties: 5, beds: 250, team: 10, tenants: 250 },
    features: [
      'Everything in Starter',
      'Staff & salaries',
      'Profit reports',
      'Online listing',
      'CSV import',
      'Team access controls',
    ],
    popular: true,
  },
  {
    code: 'business',
    name: 'Business',
    pricePerMonth: rupees(2999),
    pricePerYear: rupees(29990),
    limits: { properties: null, beds: null, team: null, tenants: null },
    features: ['Everything in Pro', 'Unlimited properties', 'Priority support', 'Custom receipts'],
  },
]

/* ---------------------------------------------------------------- properties */

export const properties: Property[] = [
  {
    id: 'p1',
    reference: 'PG-5K3N5X',
    name: 'Sunrise Women’s PG',
    type: 'pg',
    gender: 'women',
    address: '12, 5th Cross, 27th Main, Sector 2',
    locality: 'HSR Layout',
    city: 'Bengaluru',
    pincode: '560102',
    landmark: 'Near BDA Complex',
    contactPhone: '98450 12345',
    floors: 3,
    status: 'active',
    verification: 'verified',
    rentDueDay: 5,
    noticeDays: 30,
    depositMonths: 2,
    foodIncluded: true,
    amenities: [
      'wifi',
      'power_backup',
      'ro_water',
      'hot_water',
      'meals',
      'tea_coffee',
      'washing_machine',
      'housekeeping',
      'cctv',
      'biometric',
      'fire_safety',
      'parking_2w',
      'tv_lounge',
      'terrace',
    ],
    rules: [
      'Gate closes at 10:30 pm',
      'No visitors in rooms',
      'No smoking or alcohol',
      'Inform the warden before staying out',
    ],
    photos: [
      { id: 'ph1', caption: 'Front of the building', hue: 200 },
      { id: 'ph2', caption: '2 sharing room', hue: 30 },
      { id: 'ph3', caption: 'Dining area', hue: 120 },
      { id: 'ph4', caption: 'Terrace', hue: 260 },
      { id: 'ph5', caption: 'Bathroom', hue: 180 },
    ],
    documents: [
      {
        id: 'd1',
        kind: 'Rental agreement with building owner',
        title: 'Lease 2025–2028',
        uploadedOn: '2025-04-02',
        expiresOn: '2028-03-31',
        status: 'ok',
      },
      {
        id: 'd2',
        kind: 'Trade licence',
        title: 'BBMP trade licence',
        uploadedOn: '2025-04-10',
        expiresOn: '2026-12-31',
        status: 'expiring',
      },
      {
        id: 'd3',
        kind: 'Fire safety certificate',
        title: 'Fire NOC',
        uploadedOn: '2025-05-01',
        expiresOn: '2027-04-30',
        status: 'ok',
      },
      {
        id: 'd4',
        kind: 'Electricity bill',
        title: 'BESCOM bill Sep 2026',
        uploadedOn: '2026-10-03',
        status: 'ok',
      },
    ],
    description:
      'Safe, clean PG for working women, 5 minutes from HSR BDA Complex. Home-style food three times a day, daily cleaning and 24×7 security.',
    createdOn: '2025-04-01',
  },
  {
    id: 'p2',
    reference: 'PG-8RTQ2M',
    name: 'Lotus Men’s PG',
    type: 'pg',
    gender: 'men',
    address: '45, 1st Main, 6th Block',
    locality: 'Koramangala',
    city: 'Bengaluru',
    pincode: '560095',
    landmark: 'Behind Forum Mall',
    contactPhone: '98450 67890',
    floors: 4,
    status: 'active',
    verification: 'under_review',
    rentDueDay: 1,
    noticeDays: 30,
    depositMonths: 1,
    foodIncluded: true,
    amenities: [
      'wifi',
      'power_backup',
      'ro_water',
      'hot_water',
      'meals',
      'washing_machine',
      'housekeeping',
      'cctv',
      'security_guard',
      'parking_2w',
      'gym',
      'lift',
    ],
    rules: ['Gate closes at 11 pm', 'No smoking inside', 'Keep the common areas clean'],
    photos: [
      { id: 'ph6', caption: 'Building', hue: 20 },
      { id: 'ph7', caption: '3 sharing room', hue: 210 },
      { id: 'ph8', caption: 'Gym', hue: 340 },
    ],
    documents: [
      {
        id: 'd5',
        kind: 'Rental agreement with building owner',
        title: 'Lease 2026–2029',
        uploadedOn: '2026-01-15',
        expiresOn: '2029-01-14',
        status: 'ok',
      },
      {
        id: 'd6',
        kind: 'Trade licence',
        title: 'Trade licence',
        uploadedOn: '2026-01-20',
        expiresOn: '2026-10-31',
        status: 'expired',
      },
    ],
    description:
      'Comfortable men’s PG in the heart of Koramangala with gym, lift and veg + non-veg food.',
    createdOn: '2026-01-15',
  },
  {
    id: 'p3',
    reference: 'PG-2HW7PA',
    name: 'Green Nest Co-living',
    type: 'coliving',
    gender: 'coed',
    address: '8, 16th Main, 2nd Stage',
    locality: 'BTM Layout',
    city: 'Bengaluru',
    pincode: '560076',
    landmark: 'Near Udupi Garden',
    contactPhone: '98450 22233',
    floors: 2,
    status: 'draft',
    verification: 'unverified',
    rentDueDay: 5,
    noticeDays: 30,
    depositMonths: 2,
    foodIncluded: false,
    amenities: [
      'wifi',
      'power_backup',
      'ro_water',
      'fridge',
      'washing_machine',
      'cctv',
      'study_room',
    ],
    rules: ['Quiet hours 11 pm – 7 am'],
    photos: [{ id: 'ph9', caption: 'Living room', hue: 150 }],
    documents: [],
    description: 'New co-living space for students and young professionals. Opening in December.',
    createdOn: '2026-10-20',
  },
]

/* ---------------------------------------------------------------- rooms & beds */

export const rooms: Room[] = []
export const beds: Bed[] = []

function makeRooms(
  propertyId: string,
  floors: number,
  perFloor: number,
  sharingPattern: number[],
  rentBy: Record<number, number>,
  ac: (n: number) => boolean,
) {
  for (let f = 1; f <= floors; f++) {
    for (let r = 1; r <= perFloor; r++) {
      const sharing = sharingPattern[(r - 1) % sharingPattern.length]!
      const number = `${f}${pad(r)}`
      const id = `${propertyId}-r${number}`
      const isAc = ac(r)
      const rent = rupees(rentBy[sharing]! + (isAc ? 1500 : 0))
      const features: Room['features'] = [
        { key: 'bed', name: 'Bed / cot' },
        { key: 'mattress', name: 'Mattress' },
        { key: 'wardrobe', name: 'Wardrobe / cupboard' },
        { key: 'fan', name: 'Ceiling fan' },
      ]
      if (r % 3 === 0) features.push({ key: 'balcony', name: 'Balcony' })
      if (sharing === 1)
        features.push({ key: 'television', name: 'Television', extra: rupees(300) })
      rooms.push({
        id,
        propertyId,
        floor: f,
        number,
        sharing,
        letting: sharing === 1 && propertyId === 'p3' ? 'whole' : 'by_bed',
        type: sharing === 1 ? 'private' : 'shared',
        ac: isAc,
        attachedBath: r % 2 === 1 || sharing === 1,
        rentPerBed: rent,
        wholeRent: sharing === 1 ? rent : 0,
        features,
      })
      for (let b = 0; b < sharing; b++) {
        beds.push({
          id: `${id}-${'ABCDEF'[b]}`,
          roomId: id,
          propertyId,
          label: 'ABCDEF'[b]!,
          rent,
          status: 'vacant',
        })
      }
    }
  }
}
makeRooms('p1', 3, 5, [2, 3, 2, 1, 3], { 1: 14000, 2: 9500, 3: 8000 }, (r) => r <= 2)
makeRooms('p2', 4, 4, [3, 2, 4, 2], { 2: 9000, 3: 7500, 4: 6500 }, (r) => r === 2)
makeRooms('p3', 2, 4, [1, 2, 2, 1], { 1: 16000, 2: 11000 }, () => true)

/* ---------------------------------------------------------------- tenants */

const WOMEN = [
  'Priya Sharma',
  'Ananya Iyer',
  'Sneha Reddy',
  'Kavya Nair',
  'Divya Menon',
  'Pooja Hegde',
  'Meera Pillai',
  'Aishwarya Rao',
  'Nikita Joshi',
  'Shreya Kulkarni',
  'Ritu Singh',
  'Lakshmi Prasad',
  'Harini Krishnan',
  'Neha Gupta',
  'Swathi Gowda',
  'Bhavana Shetty',
  'Tanvi Desai',
  'Madhuri Patil',
  'Sowmya Bhat',
  'Fatima Khan',
  'Aditi Verma',
  'Ishita Das',
  'Rachana M',
  'Deepika S',
  'Nandini Raju',
  'Roshni Thomas',
  'Kirthana V',
  'Sana Mirza',
]
const MEN = [
  'Rahul Verma',
  'Arjun Reddy',
  'Karthik Subramanian',
  'Vikram Shetty',
  'Manoj Kumar',
  'Rohit Jain',
  'Suresh Babu',
  'Aditya Rao',
  'Nikhil Menon',
  'Pranav Kulkarni',
  'Sandeep Gowda',
  'Abhishek Singh',
  'Varun Nair',
  'Imran Sheikh',
  'Harsha Vardhan',
  'Kiran Patil',
  'Ravi Teja',
  'Deepak Yadav',
  'Akash Mehta',
  'Sachin Hegde',
  'Mohit Agarwal',
  'Tarun Bose',
  'Gautham K',
  'Naveen Prakash',
  'Yash Malhotra',
  'Faizal Ahmed',
  'Anil Joseph',
  'Sunil D',
  'Chetan Raj',
  'Vivek Pandey',
  'Ajay Krishna',
  'Lokesh M',
]
const COMPANIES = [
  'Infosys',
  'Wipro',
  'Flipkart',
  'Swiggy',
  'Accenture',
  'Razorpay',
  'Deloitte',
  'TCS',
  'Amazon',
  'Zepto',
  'IBM',
  'PhonePe',
  'Myntra',
  'Cognizant',
  'Capgemini',
]
const COLLEGES = [
  'Christ University',
  'PES University',
  'Jain University',
  'RV College',
  'BMS College',
  'Dayananda Sagar',
]
const CITIES = [
  'Hyderabad',
  'Chennai',
  'Kochi',
  'Pune',
  'Mysuru',
  'Mangaluru',
  'Hubballi',
  'Vijayawada',
  'Lucknow',
  'Patna',
  'Kolkata',
  'Jaipur',
  'Coimbatore',
  'Bhopal',
]
const ID_TYPES = ['Aadhaar (masked)', 'PAN card', 'Passport', 'Driving licence', 'Voter ID']

export const tenants: Tenant[] = []

function phone() {
  return `${pick(['98', '97', '96', '90', '88', '81', '70'])}${int(100, 999)} ${int(10000, 99999)}`
}

const RELATIVES = [
  ['Ramesh', 'Father'],
  ['Suresh', 'Father'],
  ['Mohan', 'Father'],
  ['Lakshmi', 'Mother'],
  ['Geetha', 'Mother'],
  ['Kamala', 'Mother'],
  ['Arun', 'Brother'],
  ['Divya', 'Sister'],
] as const

function emergencyFor(name: string) {
  const [first, relation] = pick(RELATIVES)
  return {
    emergencyName: `${first} ${name.split(' ')[1] ?? ''}`.trim(),
    emergencyRelation: relation,
  }
}

function fill(propertyId: string, names: string[], gender: 'female' | 'male', occupancy: number) {
  const propBeds = beds.filter((b) => b.propertyId === propertyId)
  let i = 0
  for (const bed of propBeds) {
    if (i >= names.length || rand() > occupancy) continue
    const name = names[i++]!
    const student = rand() < 0.3
    const months = int(1, 20)
    const checkIn = addDays(TODAY, -months * 30 - int(0, 25))
    const t: Tenant = {
      id: `t${tenants.length + 1}`,
      name,
      phone: phone(),
      email: `${name.toLowerCase().split(' ')[0]}.${name.toLowerCase().split(' ')[1] ?? 'pg'}@gmail.com`,
      gender,
      dob: `${int(1995, 2004)}-${pad(int(1, 12))}-${pad(int(1, 28))}`,
      occupation: student ? 'student' : 'working',
      organisation: student ? pick(COLLEGES) : pick(COMPANIES),
      homeCity: pick(CITIES),
      ...emergencyFor(name),
      emergencyPhone: phone(),
      propertyId,
      bedId: bed.id,
      status: 'active',
      checkIn,
      rent: bed.rent,
      deposit: bed.rent * 2,
      depositPaid: bed.rent * 2,
      kyc: rand() < 0.8 ? 'verified' : rand() < 0.5 ? 'pending' : 'missing',
      idType: pick(ID_TYPES),
      agreement: rand() < 0.75 ? 'signed' : rand() < 0.5 ? 'sent' : 'not_sent',
      food: rand() < 0.85,
      vehicle:
        rand() < 0.4
          ? `KA ${pad(int(1, 60))} ${pick(['EK', 'HJ', 'MN', 'JB'])} ${int(1000, 9999)}`
          : undefined,
      photoHue: int(0, 360),
      notes: '',
    }
    bed.status = 'occupied'
    bed.tenantId = t.id
    tenants.push(t)
  }
}
fill('p1', WOMEN, 'female', 0.9)
fill('p2', MEN, 'male', 0.82)

// A few on notice, one reserved bed, one blocked bed, upcoming and moved-out tenants.
for (const id of ['t3', 't11', 't27']) {
  const t = tenants.find((x) => x.id === id)
  if (!t) continue
  t.status = 'notice'
  t.noticeGivenOn = addDays(TODAY, -int(5, 20))
  t.moveOutOn = addDays(t.noticeGivenOn, 30)
  const bed = beds.find((b) => b.id === t.bedId)
  if (bed) bed.status = 'notice'
}
{
  const free = beds.filter((b) => b.propertyId === 'p1' && b.status === 'vacant')
  if (free[0]) free[0].status = 'reserved'
  if (free[1]) free[1].status = 'blocked'
  const p2free = beds.filter((b) => b.propertyId === 'p2' && b.status === 'vacant')
  tenants.push({
    id: `t${tenants.length + 1}`,
    name: 'Siddharth Rao',
    phone: '99001 22334',
    email: 'siddharth.rao@gmail.com',
    gender: 'male',
    dob: '2001-06-14',
    occupation: 'working',
    organisation: 'Swiggy',
    homeCity: 'Udupi',
    emergencyName: 'Vasanth Rao',
    emergencyPhone: '94480 11223',
    emergencyRelation: 'Father',
    propertyId: 'p2',
    bedId: p2free[0]?.id,
    status: 'upcoming',
    checkIn: addDays(TODAY, 4),
    rent: p2free[0]?.rent ?? rupees(7500),
    deposit: (p2free[0]?.rent ?? rupees(7500)) * 1,
    depositPaid: rupees(2000),
    kyc: 'pending',
    idType: 'PAN card',
    agreement: 'sent',
    food: true,
    photoHue: 90,
    notes: 'Token amount ₹2,000 paid by UPI. Moving in on Friday.',
  })
  if (p2free[0]) p2free[0].status = 'reserved'
  for (const [name, gender, pid] of [
    ['Asmita Kulkarni', 'female', 'p1'],
    ['Rekha Pai', 'female', 'p1'],
    ['Joseph Mathew', 'male', 'p2'],
  ] as const) {
    tenants.push({
      id: `t${tenants.length + 1}`,
      name,
      phone: phone(),
      email: `${name.split(' ')[0]!.toLowerCase()}@gmail.com`,
      gender,
      dob: '1998-02-11',
      occupation: 'working',
      organisation: pick(COMPANIES),
      homeCity: pick(CITIES),
      emergencyName: 'Parent',
      emergencyPhone: phone(),
      emergencyRelation: 'Mother',
      propertyId: pid,
      status: 'moved_out',
      checkIn: addDays(TODAY, -400),
      moveOutOn: addDays(TODAY, -int(20, 90)),
      rent: rupees(9000),
      deposit: rupees(18000),
      depositPaid: rupees(18000),
      kyc: 'verified',
      idType: 'Aadhaar (masked)',
      agreement: 'signed',
      food: true,
      photoHue: int(0, 360),
      notes: 'Deposit returned after deducting ₹1,200 for a broken chair.',
    })
  }
}

/* ---------------------------------------------------------------- rent bills & payments */

export const invoices: Invoice[] = []
export const payments: Payment[] = []
const MODES = ['upi', 'upi', 'upi', 'bank', 'cash', 'card'] as const

let inv = 1
let rec = 1
for (const t of tenants.filter((x) => x.status === 'active' || x.status === 'notice')) {
  const prop = properties.find((p) => p.id === t.propertyId)!
  const room = rooms.find((r) => beds.find((b) => b.id === t.bedId)?.roomId === r.id)
  for (const period of ['2026-08', '2026-09', LAST_MONTH, THIS_MONTH]) {
    if (`${period}-28` < t.checkIn) continue
    const lines = [{ label: 'Rent', amount: t.rent }]
    const extra = room?.features.find((f) => f.extra)
    if (extra?.extra) lines.push({ label: extra.name, amount: extra.extra })
    if (period === LAST_MONTH && rand() < 0.35)
      lines.push({ label: 'Electricity (meter share)', amount: rupees(int(350, 900)) })
    const total = lines.reduce((s, l) => s + l.amount, 0)
    const dueOn = `${period}-${pad(prop.rentDueDay)}`
    let paid = total
    let status: Invoice['status'] = 'paid'
    if (period === THIS_MONTH) {
      const r = rand()
      if (r < 0.45) {
        paid = 0
        status = dueOn < TODAY ? 'overdue' : 'due'
      } else if (r < 0.55) {
        paid = Math.round(total / 2 / 10000) * 10000
        status = 'partly_paid'
      }
    } else if (period === LAST_MONTH && rand() < 0.08) {
      paid = 0
      status = 'overdue'
    }
    const invoice: Invoice = {
      id: `inv${inv}`,
      number: `INV-${period.replace('-', '')}-${pad(inv, 4)}`,
      tenantId: t.id,
      propertyId: t.propertyId,
      period,
      issuedOn: `${period}-01`,
      dueOn,
      lines,
      total,
      paid,
      status,
    }
    inv++
    invoices.push(invoice)
    if (paid > 0) {
      payments.push({
        id: `pay${rec}`,
        receipt: `RCPT-${pad(rec, 5)}`,
        invoiceId: invoice.id,
        tenantId: t.id,
        propertyId: t.propertyId,
        amount: paid,
        mode: pick(MODES),
        reference: `UTR${int(100000000, 999999999)}`,
        paidOn: period === THIS_MONTH ? addDays(TODAY, -int(0, 1)) : `${period}-${pad(int(1, 9))}`,
        collectedBy: pick(['Asha Rao', 'Ravi Kumar', 'Online']),
      })
      rec++
    }
  }
}

/* ---------------------------------------------------------------- operations */

const tenantIn = (pid: string, n: number) =>
  tenants.filter((t) => t.propertyId === pid && t.status !== 'moved_out')[n]

function roomOf(t?: Tenant) {
  const bed = beds.find((b) => b.id === t?.bedId)
  return rooms.find((r) => r.id === bed?.roomId)?.number
}

export const complaints: Complaint[] = [
  [
    'p1',
    0,
    'plumbing',
    'Bathroom tap leaking',
    'Water keeps dripping from the tap in the attached bathroom, even when closed.',
    'medium',
    'open',
    undefined,
    -1,
  ],
  [
    'p1',
    4,
    'wifi',
    'Wi-Fi very slow on 2nd floor',
    'Speed is below 1 Mbps in the evenings. Unable to attend office calls.',
    'high',
    'in_progress',
    'Ravi Kumar',
    -2,
  ],
  [
    'p2',
    2,
    'electrical',
    'Fan not working',
    'The ceiling fan stopped working last night.',
    'high',
    'open',
    undefined,
    0,
  ],
  [
    'p2',
    6,
    'food',
    'Dinner served cold',
    'Dinner has been cold for the last 3 days.',
    'medium',
    'resolved',
    'Manjunath (Cook)',
    -6,
  ],
  [
    'p1',
    8,
    'cleaning',
    'Room not cleaned on Sunday',
    'Housekeeping skipped our room.',
    'low',
    'closed',
    'Lakshmamma',
    -9,
  ],
  [
    'p2',
    9,
    'appliance',
    'Washing machine shows error E4',
    'Machine on the terrace stops midway.',
    'medium',
    'in_progress',
    'Ravi Kumar',
    -3,
  ],
  [
    'p1',
    12,
    'furniture',
    'Wardrobe door broken',
    'Hinge of the left door came off.',
    'low',
    'open',
    undefined,
    -4,
  ],
  [
    'p2',
    11,
    'security',
    'Main gate lock broken',
    'The gate does not lock properly at night.',
    'urgent',
    'open',
    undefined,
    0,
  ],
  [
    'p1',
    15,
    'electrical',
    'Geyser not heating',
    'Hot water is not coming in the morning.',
    'high',
    'resolved',
    'Shivu (Electrician)',
    -12,
  ],
  [
    'p2',
    14,
    'plumbing',
    'Blocked drain in bathroom',
    'Water collects on the floor.',
    'medium',
    'resolved',
    'Ravi Kumar',
    -15,
  ],
  [
    'p1',
    18,
    'other',
    'Need an extra pillow',
    'Please provide one more pillow.',
    'low',
    'closed',
    'Lakshmamma',
    -20,
  ],
  [
    'p2',
    3,
    'wifi',
    'Router restarting every hour',
    'Internet drops many times a day.',
    'high',
    'open',
    undefined,
    -1,
  ],
].map(([pid, idx, category, title, description, priority, status, assignedTo, ago], i) => {
  const t = tenantIn(pid as string, idx as number)
  const raisedOn = addDays(TODAY, ago as number)
  const resolved = status === 'resolved' || status === 'closed'
  return {
    id: `c${i + 1}`,
    number: `CMP-${pad(1040 + i, 4)}`,
    propertyId: pid as string,
    tenantId: t?.id,
    room: roomOf(t),
    category: category as Complaint['category'],
    title: title as string,
    description: description as string,
    priority: priority as Complaint['priority'],
    status: status as Complaint['status'],
    assignedTo: assignedTo as string | undefined,
    raisedOn,
    resolvedOn: resolved ? addDays(raisedOn, int(1, 3)) : undefined,
    updates: [
      { on: raisedOn, by: t?.name ?? 'Tenant', text: 'Complaint raised from the tenant app.' },
      ...(assignedTo
        ? [{ on: addDays(raisedOn, 0), by: 'Asha Rao', text: `Assigned to ${assignedTo}.` }]
        : []),
      ...(resolved
        ? [
            {
              on: addDays(raisedOn, 1),
              by: assignedTo as string,
              text: 'Fixed and checked with the tenant.',
            },
          ]
        : []),
    ],
    cost: resolved ? rupees(int(0, 3) * 250) : undefined,
  }
})

export const notices: Notice[] = [
  {
    id: 'n1',
    title: 'Water supply off on Sunday 10 am – 2 pm',
    body: 'BWSSB is repairing the main line. Please store water on Saturday night. Sorry for the trouble.',
    propertyIds: ['p1'],
    audience: 'tenants',
    channel: ['app', 'whatsapp'],
    postedOn: '2026-11-01',
    pinned: true,
    postedBy: 'Asha Rao',
    readBy: 21,
  },
  {
    id: 'n2',
    title: 'Rent for November is due on the 5th',
    body: 'Please pay by UPI to ashastays@okhdfc or at the office. A late fee of ₹100 a day applies after the 7th.',
    propertyIds: ['p1', 'p2'],
    audience: 'tenants',
    channel: ['app', 'whatsapp', 'sms'],
    postedOn: '2026-10-30',
    pinned: false,
    postedBy: 'Asha Rao',
    readBy: 38,
  },
  {
    id: 'n3',
    title: 'Deepavali dinner on 8 Nov',
    body: 'Special Deepavali dinner on the terrace at 8 pm. Sweets and crackers (green only). Everyone is welcome!',
    propertyIds: ['p1', 'p2'],
    audience: 'all',
    channel: ['app'],
    postedOn: '2026-10-28',
    pinned: false,
    postedBy: 'Ravi Kumar',
    readBy: 30,
  },
  {
    id: 'n4',
    title: 'Pest control on 15 Nov',
    body: 'Pest control in all rooms between 11 am and 4 pm. Please keep food items closed.',
    propertyIds: ['p2'],
    audience: 'tenants',
    channel: ['app', 'whatsapp'],
    postedOn: '2026-10-25',
    pinned: false,
    postedBy: 'Ravi Kumar',
    readBy: 12,
  },
  {
    id: 'n5',
    title: 'Staff: new duty timings',
    body: 'Morning shift 6 am – 2 pm, evening shift 2 pm – 10 pm from Monday.',
    propertyIds: ['p1', 'p2'],
    audience: 'staff',
    channel: ['app', 'sms'],
    postedOn: '2026-10-20',
    pinned: false,
    postedBy: 'Asha Rao',
    readBy: 6,
  },
]

export const expenses: Expense[] = []
{
  const cats: [Expense['category'], string, string, number, number][] = [
    ['electricity', 'BESCOM electricity bill', 'BESCOM', 14000, 22000],
    ['water', 'Water tanker (2 loads)', 'Sri Sai Water Supply', 1600, 2400],
    ['internet', 'ACT Fibernet 300 Mbps', 'ACT Fibernet', 3500, 3500],
    ['groceries', 'Monthly groceries', 'Metro Cash & Carry', 38000, 52000],
    ['gas', 'Commercial LPG cylinders', 'Indane Gas', 7200, 9600],
    ['maintenance', 'Plumbing repair', 'Raju Plumbing Works', 800, 3500],
    ['cleaning', 'Cleaning supplies', 'DMart', 1800, 2600],
    ['rent', 'Building rent to owner', 'Mr. Venkatesh', 120000, 120000],
  ]
  let e = 1
  for (const period of ['2026-08', '2026-09', LAST_MONTH, THIS_MONTH]) {
    for (const pid of ['p1', 'p2']) {
      for (const [category, description, vendor, min, max] of cats) {
        if (period === THIS_MONTH && !['internet', 'groceries', 'water'].includes(category))
          continue
        expenses.push({
          id: `e${e++}`,
          propertyId: pid,
          date: period === THIS_MONTH ? TODAY : `${period}-${pad(int(2, 27))}`,
          category,
          description,
          vendor,
          amount: rupees(category === 'rent' && pid === 'p2' ? 150000 : int(min, max)),
          mode: category === 'groceries' || category === 'water' ? 'cash' : pick(['upi', 'bank']),
          hasBill: rand() < 0.8,
        })
      }
    }
  }
}

export const staff: Staff[] = [
  {
    id: 's1',
    name: 'Ravi Kumar',
    phone: '99860 11223',
    role: 'caretaker',
    propertyIds: ['p1', 'p2'],
    salary: rupees(22000),
    joinedOn: '2025-04-01',
    shift: '9 am – 7 pm',
    status: 'active',
    idProof: true,
    salaryPaid: [],
    attendance: 2,
  },
  {
    id: 's2',
    name: 'Manjunath',
    phone: '97412 33445',
    role: 'cook',
    propertyIds: ['p2'],
    salary: rupees(18000),
    joinedOn: '2026-01-20',
    shift: '6 am – 2 pm',
    status: 'active',
    idProof: true,
    salaryPaid: [],
    attendance: 2,
  },
  {
    id: 's3',
    name: 'Saraswathi',
    phone: '96321 55667',
    role: 'cook',
    propertyIds: ['p1'],
    salary: rupees(17000),
    joinedOn: '2025-05-10',
    shift: '6 am – 2 pm',
    status: 'active',
    idProof: true,
    salaryPaid: [],
    attendance: 2,
  },
  {
    id: 's4',
    name: 'Lakshmamma',
    phone: '90080 77889',
    role: 'cleaner',
    propertyIds: ['p1'],
    salary: rupees(12000),
    joinedOn: '2025-04-15',
    shift: '8 am – 4 pm',
    status: 'active',
    idProof: false,
    salaryPaid: [],
    attendance: 1,
  },
  {
    id: 's5',
    name: 'Basavaraj',
    phone: '88611 99001',
    role: 'security',
    propertyIds: ['p1'],
    salary: rupees(15000),
    joinedOn: '2025-04-01',
    shift: '8 pm – 8 am',
    status: 'active',
    idProof: true,
    salaryPaid: [],
    attendance: 2,
  },
  {
    id: 's6',
    name: 'Shivu',
    phone: '81234 56789',
    role: 'electrician',
    propertyIds: ['p1', 'p2'],
    salary: rupees(8000),
    joinedOn: '2025-08-01',
    shift: 'On call',
    status: 'active',
    idProof: true,
    salaryPaid: [],
    attendance: 0,
  },
  {
    id: 's7',
    name: 'Gowramma',
    phone: '70221 33445',
    role: 'cleaner',
    propertyIds: ['p2'],
    salary: rupees(12000),
    joinedOn: '2026-02-01',
    shift: '8 am – 4 pm',
    status: 'on_leave',
    idProof: true,
    salaryPaid: [],
    attendance: 0,
  },
]
for (const s of staff) {
  for (const period of ['2026-08', '2026-09', LAST_MONTH]) {
    if (`${period}-28` < s.joinedOn) continue
    s.salaryPaid.push({ period, paidOn: addDays(`${period}-01`, 31), amount: s.salary })
  }
}

export const members: Member[] = [
  {
    id: 'm1',
    name: 'Asha Rao',
    phone: '98450 12345',
    email: 'asha@ashastays.in',
    role: 'owner',
    propertyIds: [],
    status: 'active',
    lastActive: '2026-11-02T09:40:00',
  },
  {
    id: 'm2',
    name: 'Ravi Kumar',
    phone: '99860 11223',
    email: 'ravi@ashastays.in',
    role: 'manager',
    propertyIds: ['p1', 'p2'],
    status: 'active',
    lastActive: '2026-11-02T08:15:00',
  },
  {
    id: 'm3',
    name: 'Kavitha N',
    phone: '94481 22110',
    email: 'accounts@ashastays.in',
    role: 'accountant',
    propertyIds: [],
    status: 'active',
    lastActive: '2026-10-31T17:05:00',
  },
  {
    id: 'm4',
    name: 'Basavaraj',
    phone: '88611 99001',
    email: '',
    role: 'caretaker',
    propertyIds: ['p1'],
    status: 'active',
    lastActive: '2026-11-01T21:30:00',
  },
  {
    id: 'm5',
    name: 'Prakash S',
    phone: '90363 45678',
    email: 'prakash@ashastays.in',
    role: 'manager',
    propertyIds: ['p3'],
    status: 'invited',
    lastActive: '',
  },
]

export const ROLE_INFO = {
  owner: { label: 'Owner', description: 'Everything, including plan, billing and team.' },
  manager: {
    label: 'Manager',
    description: 'Runs the PGs: tenants, rent, rooms, complaints, staff.',
  },
  accountant: {
    label: 'Accountant',
    description: 'Rent, payments, expenses and reports. No room changes.',
  },
  caretaker: {
    label: 'Caretaker',
    description: 'Daily work: complaints, notices, check-ins. Sees no money.',
  },
} as const

export const PERMISSIONS = [
  {
    group: 'Properties',
    items: [
      ['properties.view', 'See properties, rooms and beds'],
      ['properties.manage', 'Add and change properties, rooms and beds'],
      ['properties.documents', 'Open property documents'],
    ],
  },
  {
    group: 'Tenants',
    items: [
      ['tenants.view', 'See tenants'],
      ['tenants.manage', 'Add, check in, move and check out tenants'],
      ['tenants.id_documents', 'Open tenant ID documents'],
    ],
  },
  {
    group: 'Rent',
    items: [
      ['rent.view', 'See rent bills and payments'],
      ['rent.collect', 'Record payments'],
      ['rent.adjust', 'Give discounts and waive fees'],
    ],
  },
  {
    group: 'Daily work',
    items: [
      ['complaints.manage', 'Handle complaints'],
      ['notices.manage', 'Post notices'],
      ['expenses.view', 'See expenses'],
      ['expenses.manage', 'Add expenses'],
      ['salaries.manage', 'Staff and salaries'],
    ],
  },
  {
    group: 'Business',
    items: [
      ['reports.download', 'Download reports'],
      ['team.view', 'See the team'],
      ['team.manage', 'Invite and change team members'],
      ['business.settings', 'Change business settings'],
      ['plan.billing', 'Plan and billing'],
    ],
  },
] as const

export const ROLE_PERMS: Record<string, string[]> = {
  owner: PERMISSIONS.flatMap((g) => g.items.map((i) => i[0])),
  manager: [
    'properties.view',
    'properties.manage',
    'properties.documents',
    'tenants.view',
    'tenants.manage',
    'tenants.id_documents',
    'rent.view',
    'rent.collect',
    'complaints.manage',
    'notices.manage',
    'expenses.view',
    'expenses.manage',
    'salaries.manage',
    'team.view',
  ],
  accountant: [
    'properties.view',
    'tenants.view',
    'rent.view',
    'rent.collect',
    'rent.adjust',
    'expenses.view',
    'expenses.manage',
    'reports.download',
  ],
  caretaker: ['properties.view', 'tenants.view', 'complaints.manage', 'notices.manage'],
}

const ACTIONS: [Activity['kind'], string, string][] = [
  ['rent', 'Recorded a payment of ₹9,500 by UPI', 'Priya Sharma'],
  ['tenant', 'Checked in a new tenant to Room 203 · Bed B', 'Neha Gupta'],
  ['complaint', 'Marked complaint CMP-1048 as fixed', 'Geyser not heating'],
  ['property', 'Added 4 rooms on the 3rd floor', 'Lotus Men’s PG'],
  ['rent', 'Sent WhatsApp reminders to 12 tenants', 'November rent'],
  ['team', 'Invited Prakash S as Manager', 'Green Nest Co-living'],
  ['expense', 'Added an expense of ₹42,350', 'Monthly groceries'],
  ['tenant', 'Recorded notice to move out on 30 Nov', 'Sneha Reddy'],
  ['settings', 'Changed the late fee to ₹100 a day', 'Rent settings'],
  ['property', 'Uploaded the fire safety certificate', 'Sunrise Women’s PG'],
  ['rent', 'Gave a discount of ₹500', 'Kavya Nair'],
  ['tenant', 'Moved a tenant from Room 102 to Room 104', 'Arjun Reddy'],
]
export const activity: Activity[] = ACTIONS.map(([kind, action, target], i) => ({
  id: `a${i + 1}`,
  at: `${addDays(TODAY, -Math.floor(i / 3))}T${pad(19 - i)}:${pad(int(0, 59))}:00`,
  by: pick(['Asha Rao', 'Ravi Kumar', 'Kavitha N']),
  action,
  target,
  propertyId: pick(['p1', 'p2']),
  kind,
}))

export const reminders: Reminder[] = invoices
  .filter((i) => i.period === THIS_MONTH && i.status !== 'paid')
  .slice(0, 18)
  .map((i, n) => ({
    id: `rem${n + 1}`,
    tenantId: i.tenantId,
    invoiceId: i.id,
    channel: n % 3 === 0 ? 'sms' : 'whatsapp',
    sentOn: n % 2 ? '2026-11-01' : '2026-10-29',
    status: (['read', 'delivered', 'sent', 'read', 'failed'] as const)[n % 5]!,
    kind: n % 2 ? 'due_day' : 'before_due',
  }))

export const enquiries: Enquiry[] = [
  {
    id: 'q1',
    name: 'Anjali Mehta',
    phone: '98861 44556',
    propertyId: 'p1',
    sharing: 2,
    moveIn: '2026-11-15',
    budget: rupees(10000),
    source: 'marketplace',
    status: 'new',
    note: 'Joining Deloitte on the 16th.',
    createdOn: '2026-11-02',
  },
  {
    id: 'q2',
    name: 'Rakesh Shetty',
    phone: '97400 12121',
    propertyId: 'p2',
    sharing: 3,
    moveIn: '2026-11-10',
    budget: rupees(8000),
    source: 'phone',
    status: 'visit_booked',
    note: 'Visit on Tuesday 6 pm.',
    createdOn: '2026-10-31',
  },
  {
    id: 'q3',
    name: 'Sruthi K',
    phone: '90199 88776',
    propertyId: 'p1',
    sharing: 1,
    moveIn: '2026-12-01',
    budget: rupees(15000),
    source: 'website',
    status: 'contacted',
    note: 'Wants a single AC room.',
    createdOn: '2026-10-30',
  },
  {
    id: 'q4',
    name: 'Mohammed Irfan',
    phone: '88844 55667',
    propertyId: 'p2',
    sharing: 2,
    moveIn: '2026-11-05',
    budget: rupees(9000),
    source: 'walk_in',
    status: 'converted',
    note: 'Booked Room 302 · Bed B.',
    createdOn: '2026-10-26',
  },
  {
    id: 'q5',
    name: 'Pallavi R',
    phone: '96111 23456',
    propertyId: 'p3',
    sharing: 2,
    moveIn: '2026-12-10',
    budget: rupees(11000),
    source: 'referral',
    status: 'new',
    note: 'Friend of Kavya.',
    createdOn: '2026-11-01',
  },
  {
    id: 'q6',
    name: 'Rohan Das',
    phone: '70191 22334',
    propertyId: 'p2',
    sharing: 4,
    moveIn: '2026-11-03',
    budget: rupees(6000),
    source: 'marketplace',
    status: 'lost',
    note: 'Found a cheaper place.',
    createdOn: '2026-10-22',
  },
]

/* ---------------------------------------------------------------- platform team */

const BIZ = [
  'Asha Stays',
  'Comfort Homes PG',
  'Sri Lakshmi Ladies Hostel',
  'Urban Nest Co-living',
  'Royal Gents PG',
  'Zolo-style Stays',
  'Shanthi Nilaya PG',
  'Elite Residency',
  'Hostel Hub BTM',
  'Kalpavriksha PG',
  'Metro Living',
  'Sai Krupa Men’s PG',
  'Happy Homes',
  'Brigade Stay',
  'Nest Away PG',
]
const OWNERS = [
  'Asha Rao',
  'Venkatesh Murthy',
  'Lakshmi Devi',
  'Arun Prakash',
  'Mahesh Gowda',
  'Sunitha R',
  'Ramesh Babu',
  'Kiran Shetty',
  'Nagaraj K',
  'Padma S',
  'Harish Reddy',
  'Sai Kumar',
  'Geetha M',
  'Anand Rao',
  'Rajesh N',
]
export const platformBusinesses: PlatformBusiness[] = BIZ.map((name, i) => {
  const plan = (
    [
      'pro',
      'starter',
      'free',
      'business',
      'pro',
      'starter',
      'free',
      'pro',
      'starter',
      'free',
      'business',
      'starter',
      'free',
      'pro',
      'starter',
    ] as const
  )[i]!
  const props = plan === 'business' ? int(5, 9) : plan === 'pro' ? int(2, 4) : 1
  const bedsCount = props * int(18, 40)
  return {
    id: `b${i + 1}`,
    name,
    owner: OWNERS[i]!,
    phone: phone(),
    city: pick([
      'HSR Layout',
      'Koramangala',
      'BTM Layout',
      'Marathahalli',
      'Whitefield',
      'Electronic City',
      'Bellandur',
      'Indiranagar',
    ]),
    plan,
    planStatus: i === 0 ? 'trial' : i === 6 ? 'past_due' : i === 9 ? 'ended' : 'active',
    properties: props,
    beds: bedsCount,
    tenants: Math.round(bedsCount * (0.6 + rand() * 0.35)),
    joinedOn: addDays(TODAY, -int(10, 500)),
    lastActive: addDays(TODAY, -int(0, 12)),
    status: i === 12 ? 'suspended' : 'active',
    ownerCheck: (
      [
        'draft',
        'approved',
        'approved',
        'submitted',
        'approved',
        'under_review',
        'not_started',
        'approved',
        'more_info',
        'not_started',
        'approved',
        'submitted',
        'rejected',
        'approved',
        'approved',
      ] as const
    )[i]!,
    mrr: plans.find((p) => p.code === plan)!.pricePerMonth,
  }
})

export const verificationQueue: VerificationItem[] = [
  {
    id: 'v1',
    kind: 'property',
    business: 'Asha Stays',
    subject: 'Lotus Men’s PG',
    submittedOn: '2026-10-29',
    status: 'under_review',
    documents: ['Rental agreement', 'Trade licence', '6 photos'],
    assignedTo: 'Divya (Reviewer)',
    locality: 'Koramangala',
  },
  {
    id: 'v2',
    kind: 'owner',
    business: 'Urban Nest Co-living',
    subject: 'Arun Prakash · PAN ending 4F2K',
    submittedOn: '2026-11-01',
    status: 'submitted',
    documents: ['PAN card (front)', 'GST certificate'],
    locality: 'Bellandur',
  },
  {
    id: 'v3',
    kind: 'property',
    business: 'Sai Krupa Men’s PG',
    subject: 'Sai Krupa – Block A',
    submittedOn: '2026-10-31',
    status: 'submitted',
    documents: ['Electricity bill', '4 photos'],
    locality: 'Marathahalli',
  },
  {
    id: 'v4',
    kind: 'owner',
    business: 'Zolo-style Stays',
    subject: 'Sunitha R · Aadhaar ending 7781',
    submittedOn: '2026-10-28',
    status: 'under_review',
    documents: ['Masked Aadhaar (front)', 'Masked Aadhaar (back)'],
    assignedTo: 'Divya (Reviewer)',
    locality: 'Whitefield',
  },
  {
    id: 'v5',
    kind: 'property',
    business: 'Hostel Hub BTM',
    subject: 'Hostel Hub – Main building',
    submittedOn: '2026-10-25',
    status: 'more_info',
    documents: ['Trade licence', '2 photos'],
    locality: 'BTM Layout',
  },
  {
    id: 'v6',
    kind: 'owner',
    business: 'Sai Krupa Men’s PG',
    subject: 'Sai Kumar · Passport ending 2290',
    submittedOn: '2026-10-30',
    status: 'submitted',
    documents: ['Passport photo page'],
    locality: 'Marathahalli',
  },
  {
    id: 'v7',
    kind: 'property',
    business: 'Elite Residency',
    subject: 'Elite Residency – Tower 2',
    submittedOn: '2026-10-20',
    status: 'approved',
    documents: ['Rental agreement', 'Fire NOC', '8 photos'],
    assignedTo: 'Divya (Reviewer)',
    locality: 'Indiranagar',
  },
]

export const platformPayments: PlatformPayment[] = platformBusinesses
  .filter((b) => b.plan !== 'free')
  .flatMap((b, i) =>
    ['2026-09-0', '2026-10-0', '2026-11-0'].map((d, j) => ({
      id: `pp${i}-${j}`,
      business: b.name,
      plan: b.plan,
      amount: b.mrr,
      gateway: (i % 3 === 0 ? 'cashfree' : 'razorpay') as PlatformPayment['gateway'],
      status: (b.planStatus === 'past_due' && j === 2
        ? 'failed'
        : i === 4 && j === 0
          ? 'refunded'
          : 'paid') as PlatformPayment['status'],
      paidOn: `${d}${int(1, 2)}`,
      reference: `pay_${Math.floor(rand() * 1e14).toString(36)}`,
    })),
  )

export const smsGateways: SmsGateway[] = [
  {
    code: 'apitxt',
    name: 'APITxT',
    enabled: true,
    position: 0,
    keyEnding: '…8f2a',
    lastOk: '2026-11-02T09:12:00',
    sentToday: 148,
  },
  {
    code: 'twofactor',
    name: '2Factor',
    enabled: true,
    position: 1,
    keyEnding: '…41c0',
    lastOk: '2026-10-30T14:02:00',
    sentToday: 3,
  },
  {
    code: 'fast2sms',
    name: 'Fast2SMS',
    enabled: false,
    position: 2,
    lastError: 'DLT template not approved',
    sentToday: 0,
  },
  {
    code: 'console',
    name: 'Test (shows the code on screen)',
    enabled: false,
    position: 3,
    sentToday: 0,
  },
]

export const platformStaff: PlatformStaffMember[] = [
  {
    id: 'ps1',
    name: 'San (Founder)',
    email: 'san@pgmanager.in',
    role: 'platform_owner',
    status: 'active',
    lastActive: '2026-11-02T10:01:00',
  },
  {
    id: 'ps2',
    name: 'Meghana',
    email: 'finance@pgmanager.in',
    role: 'finance_admin',
    status: 'active',
    lastActive: '2026-11-01T18:20:00',
  },
  {
    id: 'ps3',
    name: 'Rohit',
    email: 'support@pgmanager.in',
    role: 'support_agent',
    status: 'active',
    lastActive: '2026-11-02T09:55:00',
  },
  {
    id: 'ps4',
    name: 'Divya',
    email: 'verify@pgmanager.in',
    role: 'verification_reviewer',
    status: 'active',
    lastActive: '2026-11-02T09:30:00',
  },
  {
    id: 'ps5',
    name: 'Faisal',
    email: 'faisal@pgmanager.in',
    role: 'support_agent',
    status: 'invited',
    lastActive: '',
  },
]

export const supportTickets: SupportTicket[] = [
  {
    id: 'st1',
    business: 'Comfort Homes PG',
    subject: 'WhatsApp reminders not going',
    priority: 'high',
    status: 'open',
    openedOn: '2026-11-02',
    assignedTo: 'Rohit',
  },
  {
    id: 'st2',
    business: 'Royal Gents PG',
    subject: 'How to give a discount for one month?',
    priority: 'low',
    status: 'waiting',
    openedOn: '2026-11-01',
    assignedTo: 'Rohit',
  },
  {
    id: 'st3',
    business: 'Shanthi Nilaya PG',
    subject: 'Payment failed but money was deducted',
    priority: 'urgent',
    status: 'open',
    openedOn: '2026-11-01',
  },
  {
    id: 'st4',
    business: 'Metro Living',
    subject: 'Need to add a 6th property',
    priority: 'medium',
    status: 'solved',
    openedOn: '2026-10-29',
    assignedTo: 'Meghana',
  },
  {
    id: 'st5',
    business: 'Happy Homes',
    subject: 'Account switched off by mistake?',
    priority: 'high',
    status: 'open',
    openedOn: '2026-10-31',
  },
]
