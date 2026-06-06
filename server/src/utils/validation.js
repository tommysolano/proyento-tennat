import mongoose from 'mongoose';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function isValidObjectId(value) {
  return mongoose.isValidObjectId(value);
}
