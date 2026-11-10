import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { PLATFORM_EMAIL, PLATFORM_PASSWORD } from './accounts'

const PNG_1PX =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

/** Open a main-menu page; on phones the menu is behind the menu button. */
async function go(page: Page, label: string) {
  const toggle = page.getByRole('button', { name: 'Open menu' })
  if (await toggle.isVisible()) await toggle.click()
  await page
    .getByRole('navigation', { name: 'Main' })
    .getByRole('link', { name: label, exact: true })
    .click()
}

test('owner finds the home page, runs a PG end to end, and the platform team verifies it', async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(150_000) // a long journey: owner and platform team
  const run = `${testInfo.project.name}-${Date.now()}`
  const email = `owner-${run}@example.com`
  const pgName = `Lotus ${run}`
  const phone = testInfo.project.name === 'desktop' ? '9845011111' : '9845022222'
  const ownerPhone = testInfo.project.name === 'desktop' ? '9845033331' : '9845033332'

  // 1. The home page shows what the app does and where each person signs in
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Tenants', exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Register my PG' }).click()
  await expect(page).toHaveURL(/\/register$/)
  // Agree to Terms and Privacy, confirm the mobile (SMS_TEST_CODE in playwright.config.ts)
  await page.getByLabel('Mobile number').fill(ownerPhone)
  await page.getByRole('checkbox', { name: /Terms and Conditions/ }).check()
  await page.getByRole('checkbox', { name: /Privacy Policy/ }).check()
  await page.getByRole('button', { name: 'Send code' }).click()
  await page.getByLabel('Code').fill('123456')
  await page.getByRole('button', { name: 'Confirm' }).click()
  // Profile: name, email, business name; then straight to the dashboard
  await expect(page.getByRole('heading', { name: 'About you' })).toBeVisible()
  await page.getByLabel('Your name').fill('Asha Rao')
  await page.getByLabel('Email').fill(email)
  await page.getByLabel('Business name (optional)').fill(`Asha Stays ${run}`)
  await page.getByRole('button', { name: 'Continue to my dashboard' }).click()
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
  // Email is not confirmed yet, and that blocks nothing
  await expect(page.getByText('Confirm your email')).toBeVisible()
  // A new business starts on a free Pro trial
  await go(page, 'Your plan')
  await expect(page.getByText('Free trial · 14 days left')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Choose Basic' })).toBeVisible()
  await go(page, 'Dashboard')
  await page.getByRole('link', { name: 'Add a property' }).click()
  await expect(page.getByRole('heading', { name: 'Properties' })).toBeVisible()

  // 2. Add a property with the step-by-step form, then a 2-sharing room (beds are created)
  await page.getByRole('button', { name: 'Add property' }).click()
  await expect(page.getByRole('heading', { name: 'Add a property' })).toBeVisible()
  await page.getByRole('radio', { name: 'PG (paying guest)' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByLabel('Property name').fill(pgName)
  await page.getByLabel('Who can stay').selectOption('women')
  // Owners often paste the link from Google Maps; the pin is read from it.
  await page
    .getByLabel('Location', { exact: true })
    .fill('https://www.google.com/maps/place/Lotus/@12.91,77.64,17z/data=!3d12.9116!4d77.6474')
  await page.getByRole('textbox', { name: 'Address', exact: true }).fill('12, 5th Cross, Sector 2')
  await page.getByLabel('Locality').fill('HSR Layout')
  await page.getByLabel('Pincode').fill('560102')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  // Building step: a PG is not asked for the year built
  await expect(page.getByLabel('Rent due on day')).toBeVisible()
  await expect(page.getByLabel('Year built')).toHaveCount(0)
  await page.getByLabel('Floors in the building').fill('3')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  // Amenities: pick from the catalog and say how each is offered
  await page.getByRole('searchbox', { name: 'Search amenities' }).fill('wifi')
  await page.getByRole('checkbox', { name: 'Wi-Fi' }).check()
  await page
    .getByRole('group', { name: 'Wi-Fi details' })
    .getByLabel('Shared or private')
    .selectOption('shared')
  await page
    .getByRole('group', { name: 'Wi-Fi details' })
    .getByLabel('Charge')
    .selectOption('included')
  await page.getByRole('searchbox', { name: 'Search amenities' }).fill('')
  await page.getByRole('button', { name: /Kitchen & Dining/ }).click()
  await page.getByRole('checkbox', { name: 'Meals' }).check()
  const meals = page.getByRole('group', { name: 'Meals details' })
  await meals.getByLabel('Charge').selectOption('extra')
  await meals.getByLabel('Amount (₹)').fill('3000')
  await meals.getByRole('checkbox', { name: 'Dinner' }).check()
  await expect(page.getByRole('status').filter({ hasText: 'selected' })).toHaveText('2 selected')
  await page.getByRole('button', { name: 'Save and continue' }).click()
  // Photos
  await page.locator('label.file-btn input[type=file]').setInputFiles({
    name: 'front.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_1PX, 'base64'),
  })
  await expect(page.getByRole('img', { name: /front|Photo/ }).first()).toBeVisible()
  await page.getByRole('button', { name: 'Finish' }).click()

  // The property page: "Not finished" until it has something to rent and is opened.
  await expect(page.getByRole('heading', { name: new RegExp(pgName) })).toBeVisible()
  await expect(page.getByText('Not finished').first()).toBeVisible()
  await expect(
    page.getByText('Add at least one room, bed or flat that tenants can rent.'),
  ).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open property' })).toBeDisabled()
  const details = page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Amenities' }) })
  await expect(details.getByText('Wi-Fi')).toBeVisible()
  await expect(details.getByText('Extra: ₹3,000 per month')).toBeVisible()
  await expect(page.getByRole('link', { name: /Open in Google Maps/ })).toHaveAttribute(
    'href',
    /query=12\.911600,77\.647400/,
  )

  await page.getByRole('tab', { name: /Rooms & beds/ }).click()
  // Add rooms: the panel suggests room 101; choose the floor, 2 beds, rent per bed
  await page.getByRole('button', { name: 'Add rooms' }).first().click()
  await expect(page.getByLabel('First room number')).toHaveValue('101')
  await page.getByLabel('Floor').selectOption({ label: '1st floor' })
  await page
    .getByRole('radiogroup', { name: 'Beds in each room' })
    .getByRole('radio', { name: '2' })
    .click()
  await page.getByLabel('Rent per bed (₹ / month)').fill('9000')
  await expect(page.getByText('1 room with 2 beds will be added to 1st floor.')).toBeVisible()
  await page.getByRole('button', { name: 'Add room', exact: true }).click()
  // Rooms & beds opens on the floor layout: building → floor → room → beds
  await expect(page.getByRole('tab', { name: 'Floor layout' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('heading', { name: /^1st floor/ })).toBeVisible()
  await expect(page.getByText('Room 101', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Open room 101' }).click()
  await expect(page.getByRole('tab', { name: 'Bed allocation' })).toHaveAttribute(
    'aria-selected',
    'true',
  )
  await expect(page.getByRole('button', { name: /^Bed B in room 101/ })).toBeVisible()

  // Edit the room: it has AC and an attached bathroom
  await page.getByRole('button', { name: 'Edit room 101' }).click()
  const edit = page.getByRole('dialog', { name: 'Edit room 101' })
  await edit.getByRole('checkbox', { name: 'Air-conditioned' }).click()
  await edit.getByRole('checkbox', { name: 'Attached bathroom' }).click()
  // a balcony costs ₹500 more per tenant each month
  await edit.getByRole('checkbox', { name: 'Balcony' }).click()
  await edit
    .getByRole('radiogroup', { name: 'Balcony: included or extra' })
    .getByRole('radio', { name: 'Extra' })
    .click()
  await edit.getByLabel('Balcony extra charge per month').fill('500')
  await edit.getByRole('button', { name: 'Save room' }).click()
  await expect(edit).toBeHidden()
  await expect(page.getByText('Attached bath')).toBeVisible()
  await expect(page.getByText('Balcony +₹500')).toBeVisible()
  // 2 sharing = 2 beds: no third bed
  await expect(page.getByRole('button', { name: 'Add bed' })).toHaveCount(0)

  await expect(page.getByText(/Everything needed is in place/)).toBeVisible()
  await page.getByRole('button', { name: 'Open property' }).click()
  await expect(page.getByRole('button', { name: 'Open property' })).toBeHidden()
  await expect(page.getByText('Open', { exact: true }).first()).toBeVisible()

  // Property logo and a private document; then send the property for verification
  await page.getByRole('tab', { name: /Overview/ }).click()
  await page.getByLabel(`Logo for ${pgName}`).setInputFiles({
    name: 'logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_1PX, 'base64'),
  })
  await expect(page.getByRole('img', { name: `${pgName} logo` })).toBeVisible()
  await page.getByRole('tab', { name: /Documents/ }).click()
  await expect(page.getByRole('button', { name: /Send for verification/ })).toBeDisabled()
  await page.getByRole('button', { name: 'Upload document' }).click()
  const docDialog = page.getByRole('dialog', { name: 'Upload a document' })
  await docDialog.getByLabel('File').setInputFiles({
    name: 'lease.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\n%%EOF\n'),
  })
  await docDialog.getByLabel('What is it?').selectOption('rental_agreement')
  await docDialog.getByLabel('Expires on').fill('2028-03-31')
  await docDialog.getByRole('button', { name: 'Upload' }).click()
  await expect(docDialog).toBeHidden()
  await expect(
    page.getByRole('button', { name: 'Rental or lease agreement with the owner', exact: true }),
  ).toBeVisible()
  await page.getByLabel('Message for the team (optional)').fill('New PG, please verify')
  await page.getByRole('button', { name: /Send for verification/ }).click()
  await expect(page.getByText('Being checked').first()).toBeVisible()

  // The platform team verifies it from the admin portal
  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  await admin.goto('/login')
  await admin.getByRole('tab', { name: 'Email and password' }).click()
  await admin.getByLabel('Email').fill(PLATFORM_EMAIL)
  await admin.getByLabel('Password').fill(PLATFORM_PASSWORD)
  await admin.getByRole('button', { name: 'Sign in' }).click()
  await expect(admin.getByRole('heading', { name: 'Platform overview' })).toBeVisible()
  await admin.goto('/platform/verification')
  await admin
    .getByRole('row', { name: new RegExp(pgName) })
    .getByRole('link', { name: 'Review' })
    .click()
  await expect(admin.getByText('lease.pdf', { exact: false })).toBeVisible()
  await admin.getByRole('button', { name: 'Verify property' }).click()
  await expect(admin.getByText('Verified', { exact: true }).first()).toBeVisible()
  await admin.goto('/platform/plans')
  await expect(admin.getByRole('button', { name: 'Edit Basic' })).toBeVisible()
  // Platform staff: add a support agent, who gets that role's ticks
  await admin.goto('/platform/staff')
  await admin.getByRole('button', { name: 'Add person' }).click()
  const join = admin.getByRole('dialog', { name: 'Add to the PG Manager team' })
  await join.getByRole('textbox', { name: /^Name/ }).fill('Suresh Support')
  const sureshEmail = `suresh.${Date.now()}@example.com`
  await join.getByRole('textbox', { name: /^Email/ }).fill(sureshEmail)
  await join.getByLabel('Temporary password').fill('Support-Pass-2026')
  await join.getByRole('button', { name: 'Add to team' }).click()
  const suresh = admin.getByRole('row').filter({ hasText: sureshEmail })
  await expect(suresh).toContainText('Support agent')
  await expect(suresh).toContainText('Same as role')
  await adminContext.close()
  await page.reload()
  await expect(page.getByText('Verified', { exact: true }).first()).toBeVisible()

  // 3. Add a tenant and check them in on the same screen
  await go(page, 'Tenants')
  await expect(page.getByRole('heading', { name: 'Tenants' })).toBeVisible()
  await page.getByRole('button', { name: 'Add tenant' }).first().click()
  const t = page.getByRole('dialog', { name: 'Add tenant' })
  await t.getByLabel('Full name').fill('Meera N')
  await t.getByLabel(/^Mobile/).fill(phone)
  await t.getByLabel('ID proof').selectOption('aadhaar')
  await t.getByLabel('Last 4 characters of the ID').fill('4321')
  await t.getByRole('button', { name: 'Add tenant' }).click()
  await expect(t.getByText('The tenant must agree')).toBeVisible() // consent is required
  await t.getByRole('checkbox', { name: /The tenant agrees/ }).click()
  await t.getByRole('checkbox', { name: /Check in now/ }).click()
  await t.getByLabel(/^Property/).selectOption({ label: pgName })
  await t.getByRole('radio', { name: /Room 101 · Bed A/ }).click()
  await t.getByLabel('Security deposit (₹)').fill('18000')
  await t.getByLabel('Deposit paid now (₹)').fill('18000')
  await t.getByRole('button', { name: 'Add and check in' }).click()
  await expect(page.getByRole('heading', { name: /Meera N/ })).toBeVisible()
  await expect(page.getByText('₹18,000 of ₹18,000 paid')).toBeVisible()
  await expect(page.getByText(`${pgName} · Room 101 · Bed A`)).toBeVisible()

  // 4. Bill the month and take a payment
  await go(page, 'Rent & payments')
  await page.getByRole('button', { name: /Generate rent for/ }).click()
  await expect(page.getByText(/Created 1 invoice/)).toBeVisible()
  await page.getByRole('link', { name: /^INV-/ }).click()
  await page.getByRole('button', { name: 'Record payment' }).click()
  const pay = page.getByRole('dialog', { name: 'Record payment' })
  await pay.getByLabel('Paid by').selectOption('upi')
  await pay.getByLabel(/Reference/).fill('UTR998877')
  await pay.getByRole('button', { name: 'Record payment' }).click()
  await expect(page.getByText('Payment recorded.')).toBeVisible()
  await expect(
    page.getByRole('region', { name: 'Summary' }).getByText('Paid', { exact: true }).first(),
  ).toBeVisible()
  await page.getByRole('link', { name: /Open receipt RCPT-/ }).click()
  await expect(page.getByRole('heading', { name: 'Payment receipt' })).toBeVisible()
  await expect(page.getByText('UTR998877')).toBeVisible()

  // 7b. Running costs: an electricity bill turns rent into profit
  await go(page, 'Expenses & profit')
  await page.getByRole('button', { name: 'Add expense' }).click()
  const ex = page.getByRole('dialog', { name: 'Add expense' })
  await ex.getByLabel('Amount (₹)').fill('2500')
  await ex.getByLabel('Paid to').fill('BESCOM')
  await ex.getByRole('button', { name: 'Add expense' }).click()
  await expect(page.getByText('BESCOM', { exact: true }).filter({ visible: true })).toBeVisible()
  // Profit = rent collected (the first month is prorated) − the ₹2,500 bill
  await expect(page.locator('.stat').filter({ hasText: /^Expenses/ })).toContainText('₹2,500')
  const stat = (name: RegExp) =>
    page.locator('.stat').filter({ hasText: name }).locator('.stat-value')
  const rupees = async (name: RegExp) => Number((await stat(name).innerText()).replace(/[₹,]/g, ''))
  expect(await rupees(/^Profit/)).toBeCloseTo((await rupees(/^Rent collected/)) - 2500, 2)

  // 7d. Add a caretaker who works only in this property and also sees rent
  await go(page, 'Team')
  await page.getByRole('button', { name: 'Add person' }).click()
  const add = page.getByRole('dialog', { name: 'Add a person' })
  await add.getByLabel('Name').fill('Ramesh Caretaker')
  await add.getByLabel('Email').fill(`ramesh.${Date.now()}@example.com`)
  await add.getByLabel('Temporary password').fill('Caretaker-Pass-2026')
  await add.getByRole('checkbox', { name: 'See bills, payments and dues' }).click()
  await add.getByRole('checkbox', { name: 'All properties (also new ones)' }).click()
  await add.getByRole('button', { name: 'Add to team' }).click()
  const ramesh = page.getByRole('row').filter({ hasText: 'Ramesh Caretaker' })
  await expect(ramesh).toContainText('Caretaker')
  await expect(ramesh).toContainText('1 added')
  await expect(ramesh).not.toContainText('All properties')

  // 8. Dashboard reflects it all; sign out
  await go(page, 'Dashboard')
  await expect(page.getByText('50%')).toBeVisible() // 1 of the 2 beds is taken
  await page.getByRole('button', { name: 'Your account' }).click()
  await page.getByRole('menuitem', { name: 'Sign out' }).click()
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
  await page.goto('/app')
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible()
})
