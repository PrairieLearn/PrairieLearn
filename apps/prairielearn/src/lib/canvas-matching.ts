/**
 * Client-side utilities for matching Canvas gradebook students to PrairieLearn
 * users. Used by the Canvas CSV export modals on the Gradebook and Assessment
 * Downloads pages.
 */
import { parse as csvParse } from 'csv-parse/browser/esm/sync';

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface CanvasStudent {
  name: string;
  id: string;
  sisUserId: string;
  sisLoginId: string;
  section: string;
}

export interface Student {
  uid: string;
  userName: string | null;
  uin: string | null;
}

export type MatchStrategy = 'uid' | 'uin' | 'name';

export interface MatchedPair {
  plStudent: Student;
  canvasStudent: CanvasStudent;
}

export interface AmbiguousMatch {
  plStudent: Student;
  candidates: CanvasStudent[];
  selectedCanvasIndex: number | null;
}

export interface MatchResult {
  matched: MatchedPair[];
  ambiguous: AmbiguousMatch[];
  unmatchedPl: Student[];
  unmatchedCanvas: CanvasStudent[];
}

export interface StrategyResult {
  strategy: MatchStrategy;
  result: MatchResult;
  score: number;
}

// --------------------------------------------------------------------------
// CSV Parsing
// --------------------------------------------------------------------------

const REQUIRED_CANVAS_HEADERS = ['Student', 'ID', 'SIS User ID', 'SIS Login ID', 'Section'];

function validateCanvasHeaders(headers: string[]): string | null {
  const missing = REQUIRED_CANVAS_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return `Missing required Canvas columns: ${missing.join(', ')}`;
  }
  return null;
}

/**
 * Parses CSV text into an array of rows (each row is an array of field strings)
 * using the csv-parse library.
 */
export function parseCsvRows(csvText: string): string[][] {
  return csvParse(csvText, {
    relaxColumnCount: true,
    skipEmptyLines: true,
  });
}

export function parseCanvasCsv(csvText: string): {
  students: CanvasStudent[];
  error: string | null;
} {
  const lines = parseCsvRows(csvText);
  if (lines.length < 2) {
    return { students: [], error: 'CSV file is empty or has no data rows.' };
  }

  const headers = lines[0];
  const headerError = validateCanvasHeaders(headers);
  if (headerError) {
    return { students: [], error: headerError };
  }

  const nameIdx = headers.indexOf('Student');
  const idIdx = headers.indexOf('ID');
  const sisUserIdx = headers.indexOf('SIS User ID');
  const sisLoginIdx = headers.indexOf('SIS Login ID');
  const sectionIdx = headers.indexOf('Section');

  const students: CanvasStudent[] = [];
  // Start from row 1; skip the "Points Possible" sentinel row if present.
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    const name = row[nameIdx]?.trim() ?? '';
    if (!name || name === 'Points Possible' || name.startsWith('Points Possible')) continue;
    students.push({
      name,
      id: row[idIdx]?.trim() ?? '',
      sisUserId: row[sisUserIdx]?.trim() ?? '',
      sisLoginId: row[sisLoginIdx]?.trim() ?? '',
      section: row[sectionIdx]?.trim() ?? '',
    });
  }

  return { students, error: null };
}

// --------------------------------------------------------------------------
// Name normalization
// --------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name.toLowerCase().replaceAll(/[^a-z]/g, '');
}

/**
 * Parses a name that might be "Last, First Middle" or "First Middle Last" into
 * a set of normalized comparison keys. Returns multiple variants so we can
 * match across different formatting conventions.
 */
function nameVariants(name: string): Set<string> {
  const variants = new Set<string>();
  const trimmed = name.trim();
  if (!trimmed) return variants;

  // Always add the fully-normalized version (all alpha chars, lowered)
  variants.add(normalizeName(trimmed));

  if (trimmed.includes(',')) {
    // "Last, First Middle" → try "firstmiddlelast" and "firstlast"
    const [last, ...rest] = trimmed.split(',');
    const firstMiddle = rest.join(',').trim();
    const parts = firstMiddle.split(/\s+/).filter(Boolean);
    const lastNorm = normalizeName(last);

    if (parts.length > 0) {
      const allParts = parts.map(normalizeName).join('');
      variants.add(allParts + lastNorm);
      // First + Last only (drop middle names)
      variants.add(normalizeName(parts[0]) + lastNorm);
    }
  } else {
    // "First Middle Last" → try "lastfirstmiddle" and "lastfirst"
    const parts = trimmed.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const first = parts.slice(0, -1).map(normalizeName).join('');
      const last = normalizeName(parts[parts.length - 1]);
      variants.add(last + first);
      variants.add(last + normalizeName(parts[0]));
    }
  }

  return variants;
}

// --------------------------------------------------------------------------
// Matching strategies
// --------------------------------------------------------------------------

function matchByUid(plStudents: Student[], canvasStudents: CanvasStudent[]): MatchResult {
  return matchByKey(
    plStudents,
    canvasStudents,
    (pl) => [pl.uid.toLowerCase()],
    (c) => [c.sisLoginId.toLowerCase(), c.sisUserId.toLowerCase()],
  );
}

/**
 * Normalizes identifiers for comparison. Numeric strings are compared without
 * leading zeros so PrairieLearn and Canvas exports agree when one side pads.
 */
function normalizeSisIdentifier(value: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  if (/^\d+$/.test(trimmed)) {
    return trimmed.replace(/^0+/, '') || '0';
  }
  return trimmed;
}

function matchByUin(plStudents: Student[], canvasStudents: CanvasStudent[]): MatchResult {
  return matchByKey(
    plStudents,
    canvasStudents,
    (pl) => {
      const keys: string[] = [];
      if (pl.uin) keys.push(normalizeSisIdentifier(pl.uin));
      if (pl.uid) keys.push(normalizeSisIdentifier(pl.uid));
      return keys;
    },
    (c) => [normalizeSisIdentifier(c.sisUserId), normalizeSisIdentifier(c.sisLoginId)],
  );
}

function matchByKey(
  plStudents: Student[],
  canvasStudents: CanvasStudent[],
  plKeys: (pl: Student) => string[],
  canvasKeys: (c: CanvasStudent) => string[],
): MatchResult {
  const canvasByKey = new Map<string, CanvasStudent[]>();
  for (const c of canvasStudents) {
    const seen = new Set<string>();
    for (const key of canvasKeys(c)) {
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const arr = canvasByKey.get(key) ?? [];
      arr.push(c);
      canvasByKey.set(key, arr);
    }
  }

  const matched: MatchedPair[] = [];
  const ambiguous: AmbiguousMatch[] = [];
  const unmatchedPl: Student[] = [];
  const usedCanvas = new Set<CanvasStudent>();

  for (const pl of plStudents) {
    const keys = plKeys(pl).filter(Boolean);
    if (keys.length === 0) {
      unmatchedPl.push(pl);
      continue;
    }

    // Collect candidates across all PL keys, deduplicating by identity.
    const candidateSet = new Set<CanvasStudent>();
    for (const key of keys) {
      const found = canvasByKey.get(key);
      if (found) {
        for (const c of found) candidateSet.add(c);
      }
    }

    const candidates = [...candidateSet];
    if (candidates.length === 0) {
      unmatchedPl.push(pl);
    } else if (candidates.length === 1) {
      matched.push({ plStudent: pl, canvasStudent: candidates[0] });
      usedCanvas.add(candidates[0]);
    } else {
      ambiguous.push({ plStudent: pl, candidates, selectedCanvasIndex: null });
      for (const c of candidates) usedCanvas.add(c);
    }
  }

  const unmatchedCanvas = canvasStudents.filter((c) => !usedCanvas.has(c));
  return { matched, ambiguous, unmatchedPl, unmatchedCanvas };
}

function matchByName(plStudents: Student[], canvasStudents: CanvasStudent[]): MatchResult {
  const canvasNameMap = new Map<string, CanvasStudent[]>();
  for (const c of canvasStudents) {
    for (const variant of nameVariants(c.name)) {
      const arr = canvasNameMap.get(variant) ?? [];
      arr.push(c);
      canvasNameMap.set(variant, arr);
    }
  }

  const matched: MatchedPair[] = [];
  const ambiguous: AmbiguousMatch[] = [];
  const unmatchedPl: Student[] = [];
  const usedCanvas = new Set<CanvasStudent>();

  for (const pl of plStudents) {
    if (!pl.userName) {
      unmatchedPl.push(pl);
      continue;
    }

    const plVariants = nameVariants(pl.userName);
    const candidateSet = new Set<CanvasStudent>();
    for (const v of plVariants) {
      const found = canvasNameMap.get(v);
      if (found) {
        for (const c of found) candidateSet.add(c);
      }
    }

    const candidates = [...candidateSet];
    if (candidates.length === 0) {
      unmatchedPl.push(pl);
    } else if (candidates.length === 1) {
      matched.push({ plStudent: pl, canvasStudent: candidates[0] });
      usedCanvas.add(candidates[0]);
    } else {
      ambiguous.push({ plStudent: pl, candidates, selectedCanvasIndex: null });
      for (const c of candidates) usedCanvas.add(c);
    }
  }

  const unmatchedCanvas = canvasStudents.filter((c) => !usedCanvas.has(c));
  return { matched, ambiguous, unmatchedPl, unmatchedCanvas };
}

// --------------------------------------------------------------------------
// Run all strategies and pick the best
// --------------------------------------------------------------------------

function scoreResult(result: MatchResult): number {
  const total =
    result.matched.length +
    result.ambiguous.length +
    result.unmatchedPl.length +
    result.unmatchedCanvas.length;
  if (total === 0) return 0;
  // Heavily weight exact matches; penalize ambiguous and unmatched.
  return result.matched.length * 3 - result.ambiguous.length - result.unmatchedPl.length * 2;
}

export function runAllStrategies(
  plStudents: Student[],
  canvasStudents: CanvasStudent[],
): StrategyResult[] {
  const strategies: { strategy: MatchStrategy; fn: typeof matchByUid }[] = [
    { strategy: 'uid', fn: matchByUid },
    { strategy: 'uin', fn: matchByUin },
    { strategy: 'name', fn: matchByName },
  ];

  return strategies.map(({ strategy, fn }) => {
    const result = fn(plStudents, canvasStudents);
    return { strategy, result, score: scoreResult(result) };
  });
}

export function strategyLabel(strategy: MatchStrategy): string {
  switch (strategy) {
    case 'uid':
      return 'Sign-in identifier match';
    case 'uin':
      return 'Campus student ID match';
    case 'name':
      return 'Name-based match';
  }
}

export function strategyDescription(strategy: MatchStrategy): string {
  switch (strategy) {
    case 'uid':
      return 'Matches each student\u2019s PrairieLearn sign-in identifier against the SIS Login ID and SIS User ID columns in the Canvas export.';
    case 'uin':
      return 'Matches each student\u2019s campus student ID (UIN) or sign-in identifier (UID) stored in PrairieLearn against the SIS User ID and SIS Login ID columns in the Canvas export. Leading zeros are ignored for numeric identifiers.';
    case 'name':
      return 'Compares student names across different formats (e.g. "Last, First" vs. "First Last"), ignoring case and punctuation.';
  }
}

// --------------------------------------------------------------------------
// Build the Canvas identity columns from match results
// --------------------------------------------------------------------------

/**
 * Given a final MatchResult (with ambiguous selections resolved), returns a
 * Map from PL uid → CanvasStudent for all successfully matched students.
 */
export function buildCanvasLookup(result: MatchResult): Map<string, CanvasStudent> {
  const lookup = new Map<string, CanvasStudent>();
  for (const { plStudent, canvasStudent } of result.matched) {
    lookup.set(plStudent.uid, canvasStudent);
  }
  for (const { plStudent, candidates, selectedCanvasIndex } of result.ambiguous) {
    if (selectedCanvasIndex != null && candidates[selectedCanvasIndex]) {
      lookup.set(plStudent.uid, candidates[selectedCanvasIndex]);
    }
  }
  return lookup;
}
