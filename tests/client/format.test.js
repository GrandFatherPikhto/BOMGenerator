// Unit tests for the client formatting helpers.
import { describe, expect, it } from 'vitest';

import { formatDate, formatMoney } from '../../src/client/format.js';

// ru-RU uses a non-breaking (or narrow) space as the group separator; drop any
// whitespace so the assertion does not depend on the exact code point.
const bare = (value) => value.replace(/\s/g, '');

describe('formatMoney', () => {
  it('returns an empty string for null and undefined', () => {
    expect(formatMoney(null)).toBe('');
    expect(formatMoney(undefined)).toBe('');
  });

  it('treats zero as a real value', () => {
    expect(formatMoney(0)).toBe('0,00');
  });

  it('formats with two decimals and a comma separator', () => {
    expect(bare(formatMoney(1234.5))).toBe('1234,50');
  });

  it('accepts numeric strings', () => {
    expect(formatMoney('5')).toBe('5,00');
  });
});

describe('formatDate', () => {
  it('returns an empty string for falsy values', () => {
    expect(formatDate('')).toBe('');
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
  });

  it('renders an ISO timestamp as a localised string', () => {
    expect(formatDate('2026-01-02T03:04:05Z')).toContain('2026');
  });
});
