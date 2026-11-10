import { describe, expect, it } from 'vitest'

import { formatMoney, paiseToRupeesInput, rupeesToPaise, shiftPeriod, titleCase } from './format'

describe('money', () => {
  it.each([
    ['8500', 850000],
    ['8,500', 850000],
    ['₹ 12,500.5', 1250050],
    ['0.05', 5],
    ['100.25', 10025],
  ])('parses %s rupees', (input, paise) => {
    expect(rupeesToPaise(input)).toBe(paise)
  })

  it.each(['', 'abc', '-5', '1.234', '1e5'])('rejects %s', (input) => {
    expect(rupeesToPaise(input)).toBeNull()
  })

  it('formats in Indian style', () => {
    expect(formatMoney(12345600)).toBe('₹1,23,456')
    expect(formatMoney(1250050)).toBe('₹12,500.5')
    expect(formatMoney(null)).toBe('—')
  })

  it('round-trips form input', () => {
    expect(paiseToRupeesInput(850000)).toBe('8500')
    expect(paiseToRupeesInput(850050)).toBe('8500.50')
  })
})

describe('periods', () => {
  it('shifts across years', () => {
    expect(shiftPeriod('2026-01', -1)).toBe('2025-12')
    expect(shiftPeriod('2026-12', 1)).toBe('2027-01')
  })
  it('title-cases codes', () => {
    expect(titleCase('partially_paid')).toBe('Partially paid')
  })
})
