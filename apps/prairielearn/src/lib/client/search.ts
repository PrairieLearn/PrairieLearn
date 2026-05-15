import { rankItem, rankings } from '@tanstack/match-sorter-utils';

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
      // Split letter/number boundaries: `addingNumbers2` -> `adding Numbers 2`.
      .replaceAll(/([A-Za-z])([0-9])/g, '$1 $2')
      .replaceAll(/([0-9])([A-Za-z])/g, '$1 $2')
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
  const originalRank = rankItem(text, query, { threshold: rankings.CONTAINS });
  const normalizedText = normalizeQid(text);
  const normalizedQuery = normalizeQid(query);

  if (!normalizedText || normalizedText === text) return originalRank;

  const normalizedRank = rankItem(normalizedText, normalizedQuery, {
    threshold: rankings.CONTAINS,
  });
  return normalizedRank.rank > originalRank.rank ? normalizedRank : originalRank;
}
