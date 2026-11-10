export const GENDER_OPTIONS = [
  { value: 'men', label: 'Men' },
  { value: 'women', label: 'Women' },
  { value: 'coed', label: 'Co-living (any)' },
]

/** A person's gender (tenants, applicants); GENDER_OPTIONS is who a PG is for. */
export const PERSON_GENDERS = [
  { value: 'female', label: 'Female' },
  { value: 'male', label: 'Male' },
  { value: 'other', label: 'Other' },
]

export const ID_TYPE_OPTIONS = [
  { value: 'aadhaar', label: 'Aadhaar' },
  { value: 'pan', label: 'PAN' },
  { value: 'passport', label: 'Passport' },
  { value: 'driving_licence', label: 'Driving licence' },
  { value: 'voter_id', label: 'Voter ID' },
  { value: 'other', label: 'Other' },
]

export const PAYMENT_MODES = [
  { value: 'upi', label: 'UPI' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'card', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
]

export const CHARGE_KINDS = [
  { value: 'electricity', label: 'Electricity' },
  { value: 'food', label: 'Food' },
  { value: 'late_fee', label: 'Late fee' },
  { value: 'other', label: 'Other' },
]

export const COMPLAINT_CATEGORIES = [
  { value: 'electrical', label: 'Electrical' },
  { value: 'plumbing', label: 'Plumbing' },
  { value: 'cleaning', label: 'Cleaning' },
  { value: 'wifi', label: 'Wi-Fi' },
  { value: 'food', label: 'Food' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'security', label: 'Security' },
  { value: 'other', label: 'Other' },
]

export const COMPLAINT_STATUSES = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
]

export const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

export const ENQUIRY_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'visit_scheduled', label: 'Visit scheduled' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
]

/** Categories an operator records by hand (salaries come from Staff → Pay salary). */
export const EXPENSE_CATEGORIES = [
  { value: 'electricity', label: 'Electricity' },
  { value: 'water', label: 'Water' },
  { value: 'groceries', label: 'Groceries & food' },
  { value: 'maintenance', label: 'Repairs & maintenance' },
  { value: 'housekeeping', label: 'Housekeeping supplies' },
  { value: 'internet', label: 'Internet' },
  { value: 'rent', label: 'Building rent / lease' },
  { value: 'tax', label: 'Taxes & licences' },
  { value: 'marketing', label: 'Marketing' },
  { value: 'other', label: 'Other' },
]

export function optionLabel(options: { value: string; label: string }[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value
}
