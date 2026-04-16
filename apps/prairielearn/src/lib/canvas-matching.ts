/**
 * Client-side utilities for matching Canvas gradebook students to PrairieLearn
 * users. Used by the Canvas CSV export modals on the Gradebook and Assessment
 * Downloads pages.
 */
import { parse as csvParse } from 'csv-parse/browser/esm/sync';

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

export interface MatchStrategy {
  name: string;
  label: string;
  prairielearnKey: (student: Student) => string;
  canvasKey: (student: CanvasStudent) => string;
}

export interface MatchedPair {
  plStudent: Student;
  canvasStudent: CanvasStudent;
}

export interface MatchResult {
  matched: MatchedPair[];
  ambiguousPl: Student[];
  ambiguousCanvas: CanvasStudent[];
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

const CANVAS_FIXED_HEADERS = ['Student', 'ID', 'SIS User ID', 'SIS Login ID', 'Section'] as const;
const [NAME_IDX, ID_IDX, SIS_USER_IDX, SIS_LOGIN_IDX, SECTION_IDX] = CANVAS_FIXED_HEADERS.map(
  (_, i) => i,
);

function validateCanvasHeaders(headers: string[]): string | null {
  const missing = CANVAS_FIXED_HEADERS.filter((h, i) => headers[i] !== h);
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

function safeParseCsvRows(csvText: string): { rows: string[][]; error: string | null } {
  try {
    return { rows: parseCsvRows(csvText), error: null };
  } catch (err) {
    return {
      rows: [],
      error: err instanceof Error ? err.message : 'Failed to parse CSV file.',
    };
  }
}

export function parseCanvasCsv(csvText: string): {
  students: CanvasStudent[];
  error: string | null;
} {
  const { rows: lines, error: parseError } = safeParseCsvRows(csvText);
  if (parseError) {
    return { students: [], error: parseError };
  }
  if (lines.length < 2) {
    return { students: [], error: 'CSV file is empty or has no data rows.' };
  }

  const headers = lines[0];
  const headerError = validateCanvasHeaders(headers);
  if (headerError) {
    return { students: [], error: headerError };
  }

  const students: CanvasStudent[] = [];
  // Start from row 1; skip the "Points Possible" sentinel row if present.
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i];
    const name = row[NAME_IDX]?.trim() ?? '';
    if (!name || name === 'Points Possible' || name.startsWith('Points Possible')) continue;
    students.push({
      name,
      id: row[ID_IDX]?.trim() ?? '',
      sisUserId: row[SIS_USER_IDX]?.trim() ?? '',
      sisLoginId: row[SIS_LOGIN_IDX]?.trim() ?? '',
      section: row[SECTION_IDX]?.trim() ?? '',
    });
  }

  return { students, error: null };
}

// --------------------------------------------------------------------------
// Key extraction helpers
// --------------------------------------------------------------------------

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

/**
 * Normalizes a name into "first [middle...] last" canonical form so that
 * "Last, First Middle" and "First Middle Last" produce the same key.
 */
function canonicalName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return '';

  let parts: string[];
  if (trimmed.includes(',')) {
    // "Last, First Middle" → [First, Middle, Last]
    const [last, ...rest] = trimmed.split(',');
    const firstMiddle = rest.join(',').trim();
    parts = [...firstMiddle.split(/\s+/).filter(Boolean), last.trim()];
  } else {
    // "First Middle Last" → [First, Middle, Last]
    parts = trimmed.split(/\s+/).filter(Boolean);
  }

  return parts
    .map((p) => p.toLowerCase().replaceAll(/[^a-z]/g, ''))
    .filter(Boolean)
    .join(' ');
}

// --------------------------------------------------------------------------
// Strategy definitions
// --------------------------------------------------------------------------

const MATCH_STRATEGIES: MatchStrategy[] = [
  {
    name: 'uid-sislogin',
    label: 'UID \u2194 SIS Login ID',
    prairielearnKey: (s) => s.uid.toLowerCase(),
    canvasKey: (c) => c.sisLoginId.toLowerCase(),
  },
  {
    name: 'uid-sisuser',
    label: 'UID \u2194 SIS User ID',
    prairielearnKey: (s) => s.uid.toLowerCase(),
    canvasKey: (c) => c.sisUserId.toLowerCase(),
  },
  {
    name: 'uin-sisuser',
    label: 'UIN \u2194 SIS User ID',
    prairielearnKey: (s) => (s.uin ? normalizeSisIdentifier(s.uin) : ''),
    canvasKey: (c) => normalizeSisIdentifier(c.sisUserId),
  },
  {
    name: 'uin-sislogin',
    label: 'UIN \u2194 SIS Login ID',
    prairielearnKey: (s) => (s.uin ? normalizeSisIdentifier(s.uin) : ''),
    canvasKey: (c) => normalizeSisIdentifier(c.sisLoginId),
  },
  {
    name: 'name',
    label: 'student name',
    prairielearnKey: (s) => (s.userName ? canonicalName(s.userName) : ''),
    canvasKey: (c) => canonicalName(c.name),
  },
  {
    name: 'email-sislogin',
    label: 'email prefix \u2194 SIS Login ID',
    prairielearnKey: (s) => {
      const atIdx = s.uid.indexOf('@');
      return atIdx !== -1 ? s.uid.slice(0, Math.max(0, atIdx)).toLowerCase() : '';
    },
    canvasKey: (c) => c.sisLoginId.toLowerCase(),
  },
  {
    name: 'email-sisuser',
    label: 'email prefix \u2194 SIS User ID',
    prairielearnKey: (s) => {
      const atIdx = s.uid.indexOf('@');
      return atIdx !== -1 ? s.uid.slice(0, Math.max(0, atIdx)).toLowerCase() : '';
    },
    canvasKey: (c) => c.sisUserId.toLowerCase(),
  },
];

// --------------------------------------------------------------------------
// Matching algorithm
// --------------------------------------------------------------------------

/**
 * Runs a single match strategy:
 * 1. Builds a map of key → record(s) on both sides.
 * 2. Discards ambiguous entries (multiple records sharing a key).
 * 3. Matches remaining entries by key intersection.
 */
function runStrategy(
  strategy: MatchStrategy,
  plStudents: Student[],
  canvasStudents: CanvasStudent[],
): MatchResult {
  // Step 1: Build maps on both sides.
  const plByKey = new Map<string, Student[]>();
  const plNoKey: Student[] = [];
  for (const pl of plStudents) {
    const key = strategy.prairielearnKey(pl);
    if (!key) {
      plNoKey.push(pl);
      continue;
    }
    const arr = plByKey.get(key) ?? [];
    arr.push(pl);
    plByKey.set(key, arr);
  }

  const canvasByKey = new Map<string, CanvasStudent[]>();
  const canvasNoKey: CanvasStudent[] = [];
  for (const c of canvasStudents) {
    const key = strategy.canvasKey(c);
    if (!key) {
      canvasNoKey.push(c);
      continue;
    }
    const arr = canvasByKey.get(key) ?? [];
    arr.push(c);
    canvasByKey.set(key, arr);
  }

  // Step 2: Discard ambiguous entries (multiple records sharing a key).
  const ambiguousPl: Student[] = [];
  const uniquePl = new Map<string, Student>();
  for (const [key, records] of plByKey) {
    if (records.length > 1) {
      ambiguousPl.push(...records);
    } else {
      uniquePl.set(key, records[0]);
    }
  }

  const ambiguousCanvas: CanvasStudent[] = [];
  const uniqueCanvas = new Map<string, CanvasStudent>();
  for (const [key, records] of canvasByKey) {
    if (records.length > 1) {
      ambiguousCanvas.push(...records);
    } else {
      uniqueCanvas.set(key, records[0]);
    }
  }

  // Step 3: Match by key intersection.
  const matched: MatchedPair[] = [];
  const unmatchedPl: Student[] = [...plNoKey];
  const matchedCanvasKeys = new Set<string>();

  for (const [key, pl] of uniquePl) {
    const canvas = uniqueCanvas.get(key);
    if (canvas) {
      matched.push({ plStudent: pl, canvasStudent: canvas });
      matchedCanvasKeys.add(key);
    } else {
      unmatchedPl.push(pl);
    }
  }

  const unmatchedCanvas: CanvasStudent[] = [...canvasNoKey];
  for (const [key, canvas] of uniqueCanvas) {
    if (!matchedCanvasKeys.has(key)) {
      unmatchedCanvas.push(canvas);
    }
  }

  return { matched, ambiguousPl, ambiguousCanvas, unmatchedPl, unmatchedCanvas };
}

function scoreResult(result: MatchResult): number {
  if (result.matched.length === 0) return 0;
  return (
    result.matched.length * 3 -
    result.ambiguousPl.length -
    result.ambiguousCanvas.length -
    result.unmatchedPl.length
  );
}

export function runAllStrategies(
  plStudents: Student[],
  canvasStudents: CanvasStudent[],
): StrategyResult[] {
  return MATCH_STRATEGIES.map((strategy) => {
    const result = runStrategy(strategy, plStudents, canvasStudents);
    return { strategy, result, score: scoreResult(result) };
  });
}

// --------------------------------------------------------------------------
// Build the Canvas identity columns from match results
// --------------------------------------------------------------------------

/**
 * Given a final MatchResult, returns a Map from PL uid → CanvasStudent for all
 * successfully matched students.
 */
export function buildCanvasLookup(result: MatchResult): Map<string, CanvasStudent> {
  const lookup = new Map<string, CanvasStudent>();
  for (const { plStudent, canvasStudent } of result.matched) {
    lookup.set(plStudent.uid, canvasStudent);
  }
  return lookup;
}
