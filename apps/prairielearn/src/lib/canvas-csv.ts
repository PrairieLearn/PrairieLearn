/**
 * Shared constants and helpers for generating Canvas-compatible CSV exports.
 *
 * Canvas expects a specific column structure and a "Points Possible" sentinel
 * row as the first data row. These utilities are used by both the gradebook
 * Canvas CSV modal (client-side) and the assessment downloads route (server-side).
 */

/**
 * Canvas-compatible fixed columns as [header, key] pairs. The key corresponds
 * to the database field name used in streaming server-side exports.
 */
export const CANVAS_CSV_FIXED_COLUMNS: [string, string][] = [
  ['Student', 'name'],
  ['ID', 'id_col'],
  ['SIS User ID', 'sis_user_id'],
  ['SIS Login ID', 'sis_login_id'],
  ['Section', 'section'],
];

/**
 * Just the header names from {@link CANVAS_CSV_FIXED_COLUMNS}, for use in
 * array-based CSV generation (e.g., client-side downloads).
 */
export const CANVAS_CSV_FIXED_HEADERS = CANVAS_CSV_FIXED_COLUMNS.map(([header]) => header);

/**
 * The name used in the "Points Possible" sentinel row that Canvas expects
 * as the first data row.
 */
export const CANVAS_CSV_POINTS_POSSIBLE_NAME = 'Points Possible';

/**
 * Returns the value to place in a "Points Possible" cell for a given format.
 * - For percentage format: always 100
 * - For points format: the provided maxPoints value (which may be null if unknown)
 */
export function canvasPointsPossibleValue(
  format: 'percentage' | 'points',
  maxPoints: number | null,
): number | null {
  return format === 'percentage' ? 100 : maxPoints;
}

/**
 * Maps a database record to Canvas CSV field values for the fixed identity
 * columns. Canvas expects ID and SIS User ID to be null, SIS Login ID to
 * be the user's uid, and Section to be null.
 */
export function canvasStudentRecord(record: { uid: string | null }) {
  return {
    id_col: null,
    sis_user_id: null,
    sis_login_id: record.uid,
    // TODO: implement once we've got singular sections [https://github.com/PrairieLearn/PrairieLearn/issues/13919]
    section: null,
  };
}
