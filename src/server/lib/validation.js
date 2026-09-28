// Shared validation helpers for the service layer. They keep the rules for the
// hand-entered purchase fields (shipping, packages, product) in one place so
// `boardService` and `commonPurchaseService` cannot drift apart.
import { badRequest } from './httpError.js';

/** `null`, `undefined` and `""` all mean "no value entered". */
export function isBlank(value) {
  return value === null || value === undefined || value === '';
}

/** Coerce to a number, falling back when the value is not finite. */
export function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Parse a required non-negative number.
 * @returns {{value: number} | {error: string}}
 */
export function parseNonNegativeNumber(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return { error: `${fieldName} must be a number >= 0` };
  }
  return { value: parsed };
}

/**
 * Parse a required non-negative integer.
 * @returns {{value: number} | {error: string}}
 */
export function parseNonNegativeInteger(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { error: `${fieldName} must be a non-negative integer` };
  }
  return { value: parsed };
}

/** Throw a 400 carrying every message when the error list is not empty. */
export function throwIfErrors(errors) {
  if (errors.length > 0) {
    throw badRequest(errors.join('; '), errors);
  }
}
