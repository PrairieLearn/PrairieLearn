import { rankItem } from '@tanstack/match-sorter-utils';

/**
 * Converts a qid to a comparison form for fuzzy search. This keeps qids with
 * camelCase, PascalCase, acronyms, dashes, underscores, slashes, or spaces
 * searchable using any of those word separators.
 */
function normalizeQid(value: unknown): string {
  return (
    String(value ?? '')
      // Split acronym-to-word boundaries: `HTTPResponse` -> `HTTP Response`.
      .replaceAll(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      // Split lower/digit-to-uppercase boundaries: `additionalNames` -> `additional Names`.
      .replaceAll(/([a-z0-9])([A-Z])/g, '$1 $2')
      // Treat punctuation separators as spaces so `additional-names` and
      // `additional_names` match the same query.
      .replaceAll(/[-_/]+/g, ' ')
      .replaceAll(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  );
}

export function rankSearchText(value: unknown, query: string) {
  const text = String(value ?? '');
  const normalizedText = normalizeQid(text);
  const normalizedQuery = normalizeQid(query);
  const searchableText =
    normalizedText && normalizedText !== text ? `${text} ${normalizedText}` : text;

  return rankItem(searchableText, normalizedQuery);
}
