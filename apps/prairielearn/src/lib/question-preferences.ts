export function extractDefaultPreferences(
  schema: Record<string, { default: string | number | boolean }> | null | undefined,
): Record<string, string | number | boolean> {
  if (!schema) return {};

  const defaults: Record<string, string | number | boolean> = {};
  for (const [key, prop] of Object.entries(schema)) {
    defaults[key] = prop.default;
  }
  return defaults;
}
