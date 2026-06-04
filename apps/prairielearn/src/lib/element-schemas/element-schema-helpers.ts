import * as z from 'zod/v4';

export function plBoolean() {
  return z.string().meta({ format: 'boolean' });
}

export function plInteger() {
  return z.string().meta({ format: 'integer' });
}

export function plNumber() {
  return z.string().meta({ format: 'number' });
}
