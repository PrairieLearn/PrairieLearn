// @ts-check
const session = require('express-session');
const util = require('util');

const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);

/**
 * @typedef {Object} SessionStoreOptions
 * @property {number} [expireSeconds]
 */

/**
 * A {@link session.Store} implementation that uses the PrairieLearn
 * Postgres database as a session store.
 */
class SessionStore extends session.Store {
  /**
   * @param {SessionStoreOptions} options
   */
  constructor(options = {}) {
    super();

    /** @type {number} */
    this.expireSeconds = options.expireSeconds || 86400;
  }

  /**
   * @param {string} sid
   * @param {import('express-session').SessionData} session
   */
  async setAsync(sid, session) {
    await sqldb.queryOneRowAsync(sql.upsert, {
      sid,
      session: JSON.stringify(session),
    });
  }
  set = util.callbackify(this.setAsync).bind(this);

  /**
   * @param {string} sid
   */
  async getAsync(sid) {
    const results = await sqldb.queryZeroOrOneRowAsync(sql.get, {
      sid,
      expirationInSeconds: this.expireSeconds,
    });
    return results.rows[0]?.session ?? null;
  }
  get = util.callbackify(this.getAsync).bind(this);

  /**
   * @param {string} sid
   */
  async destroyAsync(sid) {
    await sqldb.queryZeroOrOneRowAsync(sql.destroy, { sid });
  }
  destroy = util.callbackify(this.destroyAsync).bind(this);

  /**
   * We want to avoid touching the session for every single request, since
   * that would cause a lot of unnecessary writes to the database. Instead,
   * we'll claim to support touches, but then just do nothing. Then, in our
   * own middleware, we'll manually modify the session when we actually want
   * to persist it.
   */
  touch = (sid, session, callback) => {
    return callback();
  };

  async lengthAsync() {
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

  async allAsync() {
    const result = await sqldb.queryAsync(sql.all_sessions, {
      expirationInSeconds: this.expireSeconds,
    });
    return result.rows.map((r) => r.session);
  }
  all = util.callbackify(this.allAsync).bind(this);
}

module.exports = SessionStore;
