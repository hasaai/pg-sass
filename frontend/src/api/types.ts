import type { components } from './schema'

type S = components['schemas']

export type Page<T> = { next: string | null; previous: string | null; results: T[] }

export type Me = S['Me']
export type MembershipSummary = S['MembershipSummary']
export type AuthResponse = S['AuthResponse']
export type Organization = S['Organization']
export type Membership = S['Membership']
export type Role = 'owner' | 'manager' | 'staff'

export type Property = S['Property']
export type PropertyRequest = S['PropertyRequest']
export type Room = S['Room']
export type Readiness = S['Readiness']
export type Floor = S['Floor']
export type RentalUnit = S['RentalUnit']
export type Inventory = S['Inventory']
export type PropertyDocument = S['PropertyDocument']
export type VerificationEvent = S['VerificationEvent']
export type Bed = S['Bed']
export type BedStatus = S['BedStatusEnum']

export type Tenant = S['Tenant']
export type TenantRequest = S['TenantRequest']
export type Stay = S['Stay']

export type Invoice = S['Invoice']
export type InvoiceStatus = S['InvoiceStatusEnum']
export type Payment = S['Payment']
export type PaymentMode = S['ModeEnum']
export type GenerateResult = S['GenerateResult']

export type Complaint = S['Complaint']
export type Notice = S['Notice']

export type Listing = S['Listing']
export type Enquiry = S['Enquiry']
export type EnquiryStatus = S['EnquiryStatusEnum']
export type PublicListing = S['PublicListing']
export type SharingOption = S['SharingOption']
export type Locality = S['Locality']
export type AuditEntry = S['AuditLog']
export type ListingPhoto = S['ListingPhoto']

export type AmenityCatalog = S['Catalog']
export type CatalogCategory = S['CatalogCategory']
export type CatalogAmenity = S['CatalogAmenity']
export type AmenityAttribute = S['AmenityAttribute']
export type PropertyAmenity = S['PropertyAmenity']
export type AmenityAssignmentRequest = S['AmenityAssignmentRequest']
export type PublicAmenity = S['PublicAmenity']
export type PropertyType = S['PropertyTypeEnum']
export type PublicPhoto = S['PublicPhoto']
export type ReportReason = S['ReasonEnum']

export type Application = S['Application']
export type ApplicationStatus = S['ApplicationStatusEnum']

export type Employee = S['Employee']
export type Expense = S['Expense']
export type ExpenseCategory = S['ExpenseCategoryEnum']
export type FinanceSummary = S['FinanceSummary']
export type DueReminder = S['DueReminder']
export type EmailResult = S['EmailResult']

/** /reports/dashboard (described by hand: the endpoint returns a free-form object). */
export interface Dashboard {
  period: string
  beds: Record<BedStatus | 'total', number>
  occupancy_rate: number
  tenants: { current: number; on_notice: number; checked_in_this_period: number }
  upcoming_checkouts: {
    stay_id: string
    tenant_name: string
    property_name: string
    room_number: string
    bed_label: string
    place_label: string
    expected_checkout: string
  }[]
  complaints: { open: number; high_priority_open: number }
  money: {
    invoiced: number
    collected: number
    outstanding: number
    overdue: number
    overdue_invoices: number
  } | null
  enquiries?: { new: number }
}
