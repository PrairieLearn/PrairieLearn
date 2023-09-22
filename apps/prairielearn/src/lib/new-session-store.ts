import { z } from 'zod';
import { SessionStore } from '@prairielearn/session';
import { loadSqlEquiv, queryAsync, queryOptionalRow } from '@prairielearn/postgres';

import { DateFromISOString, IdSchema } from './db-types';

const sql = loadSqlEquiv(__filename);

const SessionSchema = z.object({
  id: IdSchema,
  session_id: z.string(),
  created_at: DateFromISOString,
  updated_at: DateFromISOString,
  expires_at: DateFromISOString,
  data: z.any(),
});

export class NewSessionStore implements SessionStore {
  async set(session_id: string, data: any, expires_at: Date) {
    await queryAsync(sql.set_session, {
      session_id,
      data: JSON.stringify(data),
      expires_at,
    });
  }

  async get(session_id: string) {
    const session = await queryOptionalRow(sql.get_session, { session_id }, SessionSchema);

    if (!session) {
      return null;
    }

    return {
      data: session.data,
      expiresAt: session.expires_at,
    };
  }

  async destroy(session_id: string) {
    await queryAsync(sql.destroy_session, { session_id });
  }
}
