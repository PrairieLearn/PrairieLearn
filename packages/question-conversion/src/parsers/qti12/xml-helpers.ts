import { XMLParser } from 'fast-xml-parser';

const PARSER_OPTIONS = {
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  textNodeName: '#text',
  isArray: (name: string) => ARRAY_TAGS.has(name),
  trimValues: true,
  processEntities: false,
};

/** Tags that should always be parsed as arrays even if there's only one. */
const ARRAY_TAGS = new Set([
  'item',
  'section',
  'response_label',
  'response_lid',
  'response_str',
  'qtimetadatafield',
  'respcondition',
  'varequal',
  'itemfeedback',
]);

const parser = new XMLParser(PARSER_OPTIONS);

/** Parse a QTI XML string into a JS object. */
export function parseXml(xml: string): Record<string, unknown> {
  return parser.parse(xml) as Record<string, unknown>;
}

/** Safely navigate a nested object path. */
export function getNestedValue(obj: unknown, ...path: string[]): unknown {
  let current: unknown = obj;
  for (const key of path) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/** Get text content from a value that might be a string or an object with #text. */
export function textContent(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'object' && '#text' in (value as Record<string, unknown>)) {
    return String((value as Record<string, unknown>)['#text']).trim();
  }
  return '';
}

/** Get an attribute from a parsed element. */
export function attr(element: unknown, name: string): string {
  if (element == null || typeof element !== 'object') return '';
  return String((element as Record<string, unknown>)[`@_${name}`] ?? '').trim();
}

/** Ensure a value is an array. */
export function ensureArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/** Extract metadata fields from a qtimetadata element. */
export function parseMetadata(qtimetadata: unknown): Record<string, string> {
  const metadata: Record<string, string> = {};
  if (qtimetadata == null || typeof qtimetadata !== 'object') return metadata;
  const fields = ensureArray(
    (qtimetadata as Record<string, unknown>)['qtimetadatafield'] as unknown,
  );
  for (const field of fields) {
    if (field == null || typeof field !== 'object') continue;
    const rec = field as Record<string, unknown>;
    const key = textContent(rec['fieldlabel']);
    const value = textContent(rec['fieldentry']);
    if (key) {
      metadata[key] = value;
    }
  }
  return metadata;
}
