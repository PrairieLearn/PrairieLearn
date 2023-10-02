import { SessionStore } from '@prairielearn/session';
import { loadSqlEquiv, queryAsync, queryOptionalRow } from '@prairielearn/postgres';
import * as opentelemetry from '@prairielearn/opentelemetry';

import { UserSessionSchema } from './db-types';

const sql = loadSqlEquiv(__filename);

export class PostgresSessionStore implements SessionStore {
  private setCounter: opentelemetry.Counter;
  private getCounter: opentelemetry.Counter;
  private destroyCounter: opentelemetry.Counter;

  constructor() {
    const meter = opentelemetry.metrics.getMeter('prairielearn');
    this.setCounter = opentelemetry.getCounter(meter, 'session_store.set', {
      valueType: opentelemetry.ValueType.INT,
    });
    this.getCounter = opentelemetry.getCounter(meter, 'session_store.get', {
      valueType: opentelemetry.ValueType.INT,
    });
    this.destroyCounter = opentelemetry.getCounter(meter, 'session_store.destroy', {
      valueType: opentelemetry.ValueType.INT,
    });
  }

  async set(session_id: string, data: any, expires_at: Date) {
    this.setCounter.add(1);

    await queryAsync(sql.set_session, {
      session_id,
      data: JSON.stringify(data),
      expires_at,
      user_id: data?.user_id ?? null,
    });
  }

  async get(session_id: string) {
    this.getCounter.add(1);

    const session = await queryOptionalRow(sql.get_session, { session_id }, UserSessionSchema);

    if (!session) {
      return null;
    }

    return {
      data: session.data,
      expiresAt: session.expires_at,
    };
  }

  async destroy(session_id: string) {
    this.destroyCounter.add(1);

    await queryAsync(sql.destroy_session, { session_id });
  }
}
