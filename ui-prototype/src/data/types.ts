/** Shapes of the sample data. Money is in paise (₹1 = 100), dates are YYYY-MM-DD. */

export type Role = 'owner' | 'manager' | 'accountant' | 'caretaker'
export type Gender = 'men' | 'women' | 'coed'
export type BedStatus = 'vacant' | 'occupied' | 'reserved' | 'blocked' | 'notice'

export interface Business {
  id: string
  name: string
  ownerName: string
  phone: string
  email: string
  gstin: string
  address: string
  city: string
  logoText: string
  plan: PlanCode
  planStatus: 'trial' | 'active' | 'ended'
  planRenewsOn: string
  verification: OwnerCheckStatus
  emailConfirmed: boolean
}

export type PlanCode = 'free' | 'starter' | 'pro' | 'business'

export interface Plan {
  code: PlanCode
  name: string
  pricePerMonth: number
  pricePerYear: number
  limits: {
    properties: number | null
    beds: number | null
    team: number | null
    tenants: number | null
  }
  features: string[]
  popular?: boolean
}

export type OwnerCheckStatus =
  'not_started' | 'draft' | 'submitted' | 'under_review' | 'more_info' | 'approved' | 'rejected'

export type PropertyStatus = 'draft' | 'active' | 'inactive' | 'archived'
export type PropertyVerification =
  'unverified' | 'submitted' | 'under_review' | 'verified' | 'changes_requested' | 'rejected'

export interface Property {
  id: string
  reference: string
  name: string
  type: 'pg' | 'hostel' | 'coliving' | 'apartment'
  gender: Gender
  address: string
  locality: string
  city: string
  pincode: string
  landmark: string
  contactPhone: string
  floors: number
  status: PropertyStatus
  verification: PropertyVerification
  rentDueDay: number
  noticeDays: number
  depositMonths: number
  foodIncluded: boolean
  amenities: string[]
  rules: string[]
  photos: { id: string; caption: string; hue: number }[]
  documents: {
    id: string
    kind: string
    title: string
    uploadedOn: string
    expiresOn?: string
    status: 'ok' | 'expiring' | 'expired'
  }[]
  description: string
  createdOn: string
}

export interface Room {
  id: string
  propertyId: string
  floor: number
  number: string
  sharing: number
  letting: 'by_bed' | 'whole'
  type: 'private' | 'shared' | 'dormitory'
  ac: boolean
  attachedBath: boolean
  rentPerBed: number
  wholeRent: number
  features: { key: string; name: string; extra?: number }[]
}

export interface Bed {
  id: string
  roomId: string
  propertyId: string
  label: string
  rent: number
  status: BedStatus
  tenantId?: string
}

export type TenantStatus = 'active' | 'notice' | 'upcoming' | 'moved_out'
export type KycStatus = 'verified' | 'pending' | 'missing'

export interface Tenant {
  id: string
  name: string
  phone: string
  email: string
  gender: 'female' | 'male'
  dob: string
  occupation: 'working' | 'student'
  organisation: string
  homeCity: string
  emergencyName: string
  emergencyPhone: string
  emergencyRelation: string
  propertyId: string
  bedId?: string
  status: TenantStatus
  checkIn: string
  noticeGivenOn?: string
  moveOutOn?: string
  rent: number
  deposit: number
  depositPaid: number
  kyc: KycStatus
  idType: string
  agreement: 'signed' | 'sent' | 'not_sent'
  food: boolean
  vehicle?: string
  photoHue: number
  notes: string
}

export type InvoiceStatus = 'paid' | 'partly_paid' | 'due' | 'overdue'

export interface Invoice {
  id: string
  number: string
  tenantId: string
  propertyId: string
  period: string // YYYY-MM
  issuedOn: string
  dueOn: string
  lines: { label: string; amount: number }[]
  total: number
  paid: number
  status: InvoiceStatus
}

export type PayMode = 'upi' | 'cash' | 'bank' | 'card'

export interface Payment {
  id: string
  receipt: string
  invoiceId: string
  tenantId: string
  propertyId: string
  amount: number
  mode: PayMode
  reference: string
  paidOn: string
  collectedBy: string
}

export type ComplaintStatus = 'open' | 'in_progress' | 'resolved' | 'closed'
export type Priority = 'low' | 'medium' | 'high' | 'urgent'

export interface Complaint {
  id: string
  number: string
  propertyId: string
  tenantId?: string
  room?: string
  category:
    | 'electrical'
    | 'plumbing'
    | 'cleaning'
    | 'wifi'
    | 'food'
    | 'furniture'
    | 'appliance'
    | 'security'
    | 'other'
  title: string
  description: string
  priority: Priority
  status: ComplaintStatus
  assignedTo?: string
  raisedOn: string
  resolvedOn?: string
  updates: { on: string; by: string; text: string }[]
  cost?: number
}

export interface Notice {
  id: string
  title: string
  body: string
  propertyIds: string[]
  audience: 'all' | 'tenants' | 'staff'
  channel: ('app' | 'whatsapp' | 'sms')[]
  postedOn: string
  pinned: boolean
  postedBy: string
  readBy: number
}

export interface Expense {
  id: string
  propertyId: string
  date: string
  category:
    | 'electricity'
    | 'water'
    | 'internet'
    | 'groceries'
    | 'gas'
    | 'maintenance'
    | 'salary'
    | 'rent'
    | 'cleaning'
    | 'other'
  description: string
  vendor: string
  amount: number
  mode: PayMode
  hasBill: boolean
}

export interface Staff {
  id: string
  name: string
  phone: string
  role: 'cook' | 'cleaner' | 'security' | 'caretaker' | 'electrician' | 'helper'
  propertyIds: string[]
  salary: number
  joinedOn: string
  shift: string
  status: 'active' | 'on_leave' | 'left'
  idProof: boolean
  salaryPaid: { period: string; paidOn: string; amount: number }[]
  attendance: number // days present this month
}

export interface Member {
  id: string
  name: string
  phone: string
  email: string
  role: Role
  propertyIds: string[] // empty = all
  status: 'active' | 'invited' | 'switched_off'
  lastActive: string
}

export interface Activity {
  id: string
  at: string // ISO date-time
  by: string
  action: string
  target: string
  propertyId?: string
  kind: 'tenant' | 'rent' | 'property' | 'complaint' | 'team' | 'settings' | 'expense'
}

export interface Reminder {
  id: string
  tenantId: string
  invoiceId: string
  channel: 'whatsapp' | 'sms' | 'email'
  sentOn: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  kind: 'before_due' | 'due_day' | 'overdue'
}

export interface Enquiry {
  id: string
  name: string
  phone: string
  propertyId: string
  sharing: number
  moveIn: string
  budget: number
  source: 'website' | 'walk_in' | 'phone' | 'referral' | 'marketplace'
  status: 'new' | 'contacted' | 'visit_booked' | 'converted' | 'lost'
  note: string
  createdOn: string
}

/* ---------------------------------------------------------------- platform team */

export interface PlatformBusiness {
  id: string
  name: string
  owner: string
  phone: string
  city: string
  plan: PlanCode
  planStatus: 'trial' | 'active' | 'ended' | 'past_due'
  properties: number
  beds: number
  tenants: number
  joinedOn: string
  lastActive: string
  status: 'active' | 'suspended'
  ownerCheck: OwnerCheckStatus
  mrr: number
}

export interface VerificationItem {
  id: string
  kind: 'property' | 'owner'
  business: string
  subject: string
  submittedOn: string
  status: 'submitted' | 'under_review' | 'more_info' | 'approved' | 'rejected'
  documents: string[]
  assignedTo?: string
  locality: string
}

export interface PlatformPayment {
  id: string
  business: string
  plan: PlanCode
  amount: number
  gateway: 'razorpay' | 'cashfree'
  status: 'paid' | 'failed' | 'refunded'
  paidOn: string
  reference: string
}

export interface SmsGateway {
  code: string
  name: string
  enabled: boolean
  position: number
  keyEnding?: string
  lastOk?: string
  lastError?: string
  sentToday: number
}

export interface PlatformStaffMember {
  id: string
  name: string
  email: string
  role: 'platform_owner' | 'finance_admin' | 'support_agent' | 'verification_reviewer'
  status: 'active' | 'invited'
  lastActive: string
}

export interface SupportTicket {
  id: string
  business: string
  subject: string
  priority: Priority
  status: 'open' | 'waiting' | 'solved'
  openedOn: string
  assignedTo?: string
}
