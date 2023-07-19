import { loadSqlEquiv, queryValidatedZeroOrOneRow } from '@prairielearn/postgres';

import { User, UserSchema } from './db-types';

const sql = loadSqlEquiv(__filename);

/**
 * Parses a string of UIDs separated by commas, whitespace, line breaks, or semicolons
 * into an array of unique UIDs.
 */
export function parseUidsString(uidsString: string): string[] {
  const uids = new Set(
    uidsString
      .split(/[\s,;]+/)
      .map((uid) => uid.trim())
      .filter((uid) => uid),
  );
  return Array.from(uids);
}

/**
 * Selects a user by their UID.
 */
export function selectUserByUid(uid: string): Promise<User | null> {
  return queryValidatedZeroOrOneRow(sql.select_user_by_uid, { uid }, UserSchema);
}
