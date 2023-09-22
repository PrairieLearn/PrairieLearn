import { z } from 'zod';
import { SessionStore } from '@prairielearn/session';
import { loadSqlEquiv, queryAsync, queryOptionalRow } from '@prairielearn/postgres';
import { DateFromISOString } from './db-types';

const sql = loadSqlEquiv(__filename);

const SessionSchema = z.object({
  session: z.any(),
  sid: z.string(),
  updated_at: DateFromISOString,
  // This column is technically nullable at the moment. However, it should never
  // be null for any session that's being loaded by this store, as it should
  // always have been created with an expiration date.
  expires_at: DateFromISOString,
});

export class NewSessionStore implements SessionStore {
  async set(id: string, session: any, expiresAt: Date) {
    await queryAsync(sql.set_session, {
      sid: id,
      session: JSON.stringify(session),
      expires_at: expiresAt,
    });
  }

  async get(id: string) {
    const session = await queryOptionalRow(sql.get_session, { sid: id }, SessionSchema);

    if (!session) {
      return null;
    }

    return {
      data: session.session,
      expiresAt: session.expires_at,
    };
  }

  async destroy(id: string) {
    await queryAsync(sql.destroy_session, { sid: id });
  }
}
