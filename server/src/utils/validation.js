import mongoose from 'mongoose';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isValidObjectId(value) {
  return mongoose.isValidObjectId(value);
}

export function normalizeOptionalObjectId(value) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  return value;
}

export function normalizeOptionalObjectIdArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map(normalizeOptionalObjectId)
    .filter((value) => value !== null && value !== undefined);
}
