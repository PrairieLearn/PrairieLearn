import type { QuestionPreferencesSchemaJson } from '../../schemas/infoQuestion.js';

/**
 * Validates a typed preferences schema object. Returns an array of error
 * messages (empty if valid). Used by both the sync code and the question
 * settings editor so that validation rules stay in one place.
 */
export function validatePreferencesSchema(preferences: QuestionPreferencesSchemaJson): string[] {
  const errors: string[] = [];
  for (const [key, field] of Object.entries(preferences)) {
    if (typeof field.default !== field.type) {
      errors.push(
        `preferences.${key}: default value must be of type "${field.type}", got ${typeof field.default}`,
      );
    } else if (field.type === 'number' && !Number.isFinite(field.default)) {
      errors.push(`preferences.${key}: default value must be a finite number`);
    }
    if (field.enum) {
      if (field.type === 'boolean') {
        errors.push(`preferences.${key}: boolean preferences cannot have enum values`);
      } else {
        for (const [i, val] of field.enum.entries()) {
          if (typeof val !== field.type) {
            errors.push(
              `preferences.${key}.enum[${i}]: enum values must be of type "${field.type}", got ${typeof val}`,
            );
          } else if (field.type === 'number' && !Number.isFinite(val)) {
            errors.push(`preferences.${key}.enum[${i}]: enum values must be finite numbers`);
          }
        }
        if (!field.enum.includes(field.default as string | number)) {
          errors.push(`preferences.${key}: default value must be present in the enum options`);
        }
      }
    }
  }
  return errors;
}
