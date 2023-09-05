import session = require('express-session');
import util = require('util');
import sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

interface SessionStoreOptions {
  expireSeconds?: number;
}

/**
 * A {@link session.Store} implementation that uses the PrairieLearn
 * Postgres database as a session store.
 */
class SessionStore extends session.Store {
  private expireSeconds: number;

  constructor(options: SessionStoreOptions = {}) {
    super();

    this.expireSeconds = options.expireSeconds || 86400;
  }

  async setAsync(sid: string, session: session.SessionData) {
    await sqldb.queryOneRowAsync(sql.upsert, {
      sid,
      session: JSON.stringify(session),
    });
  }
  set = util.callbackify(this.setAsync).bind(this);

  async getAsync(sid: string): Promise<session.SessionData> {
    const results = await sqldb.queryZeroOrOneRowAsync(sql.get, {
      sid,
      expirationInSeconds: this.expireSeconds,
    });
    return results.rows[0]?.session ?? null;
  }
  get = util.callbackify(this.getAsync).bind(this);

  async destroyAsync(sid: string) {
    await sqldb.queryZeroOrOneRowAsync(sql.destroy, { sid });
  }
  destroy = util.callbackify(this.destroyAsync).bind(this);

  touch = (sid: string, session: session.SessionData, callback: any) => {
    // Does the same thing as set() in our implementation
    this.set(sid, session, callback);
  };

  async lengthAsync(): Promise<number> {
    const result = await sqldb.queryOneRowAsync(sql.length, {
      expirationInSeconds: this.expireSeconds,
    });
    return result.rows[0].count;
  }
  length = util.callbackify(this.lengthAsync).bind(this);

  async clearAsync() {
    await sqldb.queryAsync(sql.clear, {});
  }
  clear = util.callbackify(this.clearAsync).bind(this);

  async allAsync(): Promise<session.SessionData[]> {
    const result = await sqldb.queryAsync(sql.all_sessions, {
      expirationInSeconds: this.expireSeconds,
    });
    return result.rows.map((r) => r.session);
  }
  all = util.callbackify(this.allAsync).bind(this);
}

module.exports = SessionStore;
