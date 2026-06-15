import * as z from 'zod/v4';

export function booleanFormat() {
  return z.string().meta({ format: 'boolean' });
}

export function integerFormat() {
  return z.string().meta({ format: 'integer' });
}

export function numberFormat() {
  return z.string().meta({ format: 'number' });
}
