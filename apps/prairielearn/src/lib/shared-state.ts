import type { SharedStateObjectPropertiesJson } from '../schemas/infoCourse.js';

/**
 * A single shared-state object's value must fit in this many UTF-8 bytes
 * when JSON-encoded. This is intentionally small; see the discussion on
 * https://github.com/PrairieLearn/PrairieLearn/issues/5501.
 */
export const SHARED_STATE_MAX_OBJECT_BYTES = 4096;

/**
 * The total size of all shared-state object values accessible from a single
 * assessment instance must fit in this many UTF-8 bytes, so that courses
 * cannot bypass the per-object cap by defining many small objects.
 */
export const SHARED_STATE_MAX_TOTAL_BYTES_PER_ASSESSMENT_INSTANCE = 16384;

const SHARED_STATE_MAX_PROPERTIES_PER_OBJECT = 32;

export type SharedStateObjectValue = Record<string, string | number | boolean>;

/**
 * Validates that a shared-state object's authored property schema is
 * internally consistent (default matches type, enum values match type,
 * booleans can't have enums, default is present in its own enum). This
 * mirrors `validatePreferencesSchema` conceptually, but is implemented
 * separately since shared-state objects have a materially different
 * lifecycle (live, mutable, versioned) than frozen question preferences.
 */
export function validateSharedStateObjectProperties(
  properties: SharedStateObjectPropertiesJson,
): string[] {
  const errors: string[] = [];

  const propertyNames = Object.keys(properties);
  if (propertyNames.length > SHARED_STATE_MAX_PROPERTIES_PER_OBJECT) {
    errors.push(
      `object defines ${propertyNames.length} properties, which exceeds the limit of ${SHARED_STATE_MAX_PROPERTIES_PER_OBJECT}`,
    );
  }

  for (const [key, field] of Object.entries(properties)) {
    if (typeof field.default !== field.type) {
      errors.push(
        `properties.${key}: default value must be of type "${field.type}", got ${typeof field.default}`,
      );
    } else if (field.type === 'number' && !Number.isFinite(field.default)) {
      errors.push(`properties.${key}: default value must be a finite number`);
    }
    if (field.enum) {
      if (field.type === 'boolean') {
        errors.push(`properties.${key}: boolean properties cannot have enum values`);
      } else {
        for (const [i, val] of field.enum.entries()) {
          if (typeof val !== field.type) {
            errors.push(
              `properties.${key}.enum[${i}]: enum values must be of type "${field.type}", got ${typeof val}`,
            );
          } else if (field.type === 'number' && !Number.isFinite(val)) {
            errors.push(`properties.${key}.enum[${i}]: enum values must be finite numbers`);
          }
        }
        if (!field.enum.includes(field.default as string | number)) {
          errors.push(`properties.${key}: default value must be present in the enum options`);
        }
      }
    }
  }
  return errors;
}

/**
 * Computes a shallow, property-level patch between the value a question
 * phase was handed and the value it returned. Applying just this patch onto
 * the freshest stored value (rather than replacing the whole object) is what
 * lets two questions' concurrent, disjoint changes both survive.
 */
export function diffSharedStateObjectValue(
  before: SharedStateObjectValue,
  after: SharedStateObjectValue,
): SharedStateObjectValue {
  const patch: SharedStateObjectValue = {};
  for (const [key, value] of Object.entries(after)) {
    if (before[key] !== value) {
      patch[key] = value;
    }
  }
  return patch;
}

export function extractSharedStateObjectDefaults(
  properties: SharedStateObjectPropertiesJson,
): SharedStateObjectValue {
  const defaults: SharedStateObjectValue = {};
  for (const [key, field] of Object.entries(properties)) {
    defaults[key] = field.default;
  }
  return defaults;
}

/**
 * Classifies a property-schema change as compatible (safe to apply under the
 * same authored data version) or breaking (requires a data version bump).
 * Per the agreed compatibility rules: adding a property or widening an enum
 * is compatible; removing/renaming a property, changing its type or default,
 * or narrowing its enum is breaking.
 */
export function classifySharedStateObjectPropertiesChange(
  oldProperties: SharedStateObjectPropertiesJson,
  newProperties: SharedStateObjectPropertiesJson,
): { compatible: boolean; reasons: string[] } {
  const reasons: string[] = [];

  for (const [key, oldField] of Object.entries(oldProperties)) {
    if (!(key in newProperties)) {
      reasons.push(`property "${key}" was removed or renamed`);
      continue;
    }
    const newField = newProperties[key];
    if (newField.type !== oldField.type) {
      reasons.push(`property "${key}" changed type from "${oldField.type}" to "${newField.type}"`);
      continue;
    }
    if (newField.default !== oldField.default) {
      reasons.push(`property "${key}" changed its default value`);
    }
    const oldEnum = oldField.enum;
    const newEnum = newField.enum;
    if (oldEnum != null && newEnum != null) {
      const removed = oldEnum.filter((v) => !newEnum.includes(v));
      if (removed.length > 0) {
        reasons.push(`property "${key}" narrowed its enum (removed: ${removed.join(', ')})`);
      }
    }
  }

  return { compatible: reasons.length === 0, reasons };
}

/**
 * Builds a transient, schema-conforming view for a question invocation:
 * fills missing properties from defaults and drops properties the current
 * schema doesn't recognize. Never mutates the stored row.
 */
export function normalizeSharedStateObjectValueForRead(
  value: SharedStateObjectValue,
  properties: SharedStateObjectPropertiesJson,
): SharedStateObjectValue {
  const normalized: SharedStateObjectValue = {};
  for (const [key, field] of Object.entries(properties)) {
    const stored = value[key];
    const isValid =
      typeof stored === field.type && (field.enum == null || field.enum.includes(stored as any));
    normalized[key] = isValid ? stored : field.default;
  }
  return normalized;
}

/**
 * Strictly validates a value returned by question code against the current
 * schema. Unlike `normalizeSharedStateObjectValueForRead`, this never
 * silently substitutes defaults: an invalid write is an author error and
 * should become a fatal course issue.
 */
export function validateSharedStateObjectValueForWrite(
  value: SharedStateObjectValue,
  properties: SharedStateObjectPropertiesJson,
): string[] {
  const errors: string[] = [];
  const propertyNames = new Set(Object.keys(properties));

  for (const key of Object.keys(value)) {
    if (!propertyNames.has(key)) {
      errors.push(`unknown property "${key}"`);
    }
  }

  for (const [key, field] of Object.entries(properties)) {
    const val = value[key];
    if (typeof val !== field.type) {
      errors.push(`property "${key}" must be of type "${field.type}", got ${typeof val}`);
      continue;
    }
    if (field.type === 'number' && !Number.isFinite(val)) {
      errors.push(`property "${key}" must be a finite number`);
    }
    if (field.enum && !field.enum.includes(val as string | number)) {
      errors.push(`property "${key}" must be one of: ${field.enum.join(', ')}`);
    }
  }

  const byteLength = Buffer.byteLength(JSON.stringify(value), 'utf8');
  if (byteLength > SHARED_STATE_MAX_OBJECT_BYTES) {
    errors.push(
      `value is ${byteLength} bytes, which exceeds the per-object limit of ${SHARED_STATE_MAX_OBJECT_BYTES} bytes`,
    );
  }

  return errors;
}
