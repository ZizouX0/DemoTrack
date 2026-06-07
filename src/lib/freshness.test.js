import { describe, it, expect } from 'vitest'
import {
  daysSince,
  effectiveVerified,
  freshnessStatus,
  needsRecheck,
  fmtVerified,
  FRESH_DAYS,
  AGING_DAYS,
} from './freshness'

const daysAgoISO = (n) => new Date(Date.now() - n * 86400000).toISOString()

describe('daysSince', () => {
  it('returns null for missing/invalid input', () => {
    expect(daysSince(null)).toBeNull()
    expect(daysSince(undefined)).toBeNull()
    expect(daysSince('not-a-date')).toBeNull()
  })

  it('floors elapsed days', () => {
    expect(daysSince(daysAgoISO(10))).toBe(10)
    expect(daysSince(new Date().toISOString())).toBe(0)
  })
})

describe('effectiveVerified', () => {
  it('returns null when both are missing', () => {
    expect(effectiveVerified(null, null)).toBeNull()
  })

  it('picks the more recent of the two dates', () => {
    const older = '2025-01-01'
    const newer = '2026-01-01'
    expect(effectiveVerified(older, newer)).toBe(new Date(newer).toISOString())
    expect(effectiveVerified(newer, older)).toBe(new Date(newer).toISOString())
  })

  it('tolerates one side being null', () => {
    const d = '2026-01-01'
    expect(effectiveVerified(d, null)).toBe(new Date(d).toISOString())
    expect(effectiveVerified(null, d)).toBe(new Date(d).toISOString())
  })
})

describe('freshnessStatus', () => {
  it('is unverified with no dates', () => {
    expect(freshnessStatus({})).toBe('unverified')
  })

  it('buckets by age', () => {
    expect(freshnessStatus({ last_verified: daysAgoISO(FRESH_DAYS - 1) })).toBe('fresh')
    expect(freshnessStatus({ last_verified: daysAgoISO(AGING_DAYS - 1) })).toBe('aging')
    expect(freshnessStatus({ last_verified: daysAgoISO(AGING_DAYS + 30) })).toBe('stale')
  })

  it('broken always wins, even over a fresh date', () => {
    expect(
      freshnessStatus({ last_verified: daysAgoISO(1), flagged_broken: true })
    ).toBe('broken')
    expect(
      freshnessStatus({ last_verified: daysAgoISO(1), link_status: 'broken' })
    ).toBe('broken')
  })

  it('prefers the explicit effective_verified field when present', () => {
    expect(freshnessStatus({ effective_verified: daysAgoISO(5) })).toBe('fresh')
  })
})

describe('needsRecheck', () => {
  it('flags stale, broken, unverified — not fresh/aging', () => {
    expect(needsRecheck('stale')).toBe(true)
    expect(needsRecheck('broken')).toBe(true)
    expect(needsRecheck('unverified')).toBe(true)
    expect(needsRecheck('fresh')).toBe(false)
    expect(needsRecheck('aging')).toBe(false)
  })
})

describe('fmtVerified', () => {
  it('is null-safe and formats valid dates', () => {
    expect(fmtVerified(null)).toBeNull()
    expect(fmtVerified('not-a-date')).toBeNull()
    expect(fmtVerified('2026-03-14')).toMatch(/2026/)
  })
})
