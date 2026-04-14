/**
 * Client-side utilities for matching Canvas gradebook students to PrairieLearn
 * users. Used by the Canvas CSV export modals on the Gradebook and Assessment
 * Downloads pages.
 */

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

export interface PlStudent {
  uid: string;
  userName: string | null;
  uin: string | null;
}

export type MatchStrategy = 'uid' | 'uin' | 'name';

export interface MatchedPair {
  plStudent: PlStudent;
  canvasStudent: CanvasStudent;
}

export interface AmbiguousMatch {
  plStudent: PlStudent;
  candidates: CanvasStudent[];
  selectedCanvasIndex: number | null;
}

export interface MatchResult {
  matched: MatchedPair[];
  ambiguous: AmbiguousMatch[];
  unmatchedPl: PlStudent[];
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

export function validateCanvasHeaders(headers: string[]): string | null {
  const missing = REQUIRED_CANVAS_HEADERS.filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    return `Missing required Canvas columns: ${missing.join(', ')}`;
  }
  return null;
}

export function parseCanvasCsv(csvText: string): {
  students: CanvasStudent[];
  error: string | null;
} {
  const lines = parseCsvLines(csvText);
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

/**
 * Minimal RFC 4180 CSV parser for browser use. Handles quoted fields (with
 * escaped quotes) and fields that contain commas or newlines.
 */
function parseCsvLines(csv: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  while (i < csv.length) {
    const { row, nextIndex } = parseCsvRow(csv, i);
    rows.push(row);
    i = nextIndex;
  }
  return rows;
}

function parseCsvRow(csv: string, start: number): { row: string[]; nextIndex: number } {
  const fields: string[] = [];
  let i = start;

  while (i < csv.length) {
    if (csv[i] === '"') {
      const { value, nextIndex } = parseQuotedField(csv, i);
      fields.push(value);
      i = nextIndex;
    } else {
      const end = findFieldEnd(csv, i);
      fields.push(csv.slice(i, end));
      i = end;
    }

    if (i >= csv.length || csv[i] === '\n' || csv[i] === '\r') {
      // consume \r\n or \n or \r
      if (i < csv.length && csv[i] === '\r') i++;
      if (i < csv.length && csv[i] === '\n') i++;
      break;
    }

    // skip comma delimiter
    if (csv[i] === ',') i++;
  }

  return { row: fields, nextIndex: i };
}

function parseQuotedField(csv: string, start: number): { value: string; nextIndex: number } {
  let i = start + 1; // skip opening quote
  let value = '';
  while (i < csv.length) {
    if (csv[i] === '"') {
      if (i + 1 < csv.length && csv[i + 1] === '"') {
        value += '"';
        i += 2;
      } else {
        i++; // skip closing quote
        break;
      }
    } else {
      value += csv[i];
      i++;
    }
  }
  return { value, nextIndex: i };
}

function findFieldEnd(csv: string, start: number): number {
  let i = start;
  while (i < csv.length && csv[i] !== ',' && csv[i] !== '\n' && csv[i] !== '\r') {
    i++;
  }
  return i;
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

function matchByUid(plStudents: PlStudent[], canvasStudents: CanvasStudent[]): MatchResult {
  return matchByKey(
    plStudents,
    canvasStudents,
    (pl) => pl.uid.toLowerCase(),
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

function matchByUin(plStudents: PlStudent[], canvasStudents: CanvasStudent[]): MatchResult {
  return matchByKey(
    plStudents,
    canvasStudents,
    (pl) => (pl.uin ? normalizeSisIdentifier(pl.uin) : ''),
    (c) => [normalizeSisIdentifier(c.sisUserId), normalizeSisIdentifier(c.sisLoginId)],
  );
}

function matchByKey(
  plStudents: PlStudent[],
  canvasStudents: CanvasStudent[],
  plKey: (pl: PlStudent) => string,
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
  const unmatchedPl: PlStudent[] = [];
  const usedCanvas = new Set<CanvasStudent>();

  for (const pl of plStudents) {
    const key = plKey(pl);
    if (!key) {
      unmatchedPl.push(pl);
      continue;
    }

    const rawCandidates = canvasByKey.get(key);
    // Deduplicate: the same Canvas student may appear under multiple keys.
    const candidates = rawCandidates ? [...new Set(rawCandidates)] : undefined;
    if (!candidates || candidates.length === 0) {
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

function matchByName(plStudents: PlStudent[], canvasStudents: CanvasStudent[]): MatchResult {
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
  const unmatchedPl: PlStudent[] = [];
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
  plStudents: PlStudent[],
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
      return 'Matches each student\u2019s campus student ID (UIN) stored in PrairieLearn against the SIS User ID and SIS Login ID columns in the Canvas export. Leading zeros are ignored.';
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
