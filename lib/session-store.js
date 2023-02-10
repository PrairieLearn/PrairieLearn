/*
// https://github.com/expressjs/session#session-store-implementation
//
// Uses PL database as a express-session store
*/
const session = require('express-session');
const _ = require('lodash');
const util = require('util');

const config = require('./config');
const sqldb = require('@prairielearn/postgres');
const sql = sqldb.loadSqlEquiv(__filename);

class plSessionStore extends session.Store {
  //
  // Required
  //
  set = util.callbackify(async (sid, session) => {
    let params = {
      sid,
      session: JSON.stringify(session),
    };
    await sqldb.queryOneRowAsync(sql.upsert, params);
  });

  get = util.callbackify(async (sid) => {
    let params = {
      sid,
      expirationInSeconds: config.sessionStoreExpireSeconds,
    };
    let results = await sqldb.queryZeroOrOneRowAsync(sql.get, params);
    if (results.rowCount === 0) {
      return null;
    } else {
      return results.rows[0].session;
    }
  });

  destroy = util.callbackify(async (sid) => {
    await sqldb.queryZeroOrOneRowAsync(sql.destroy, { sid });
  });

  //
  // Recommended
  //
  touch = (sid, session, callback) => {
    // Does the same thing as set() in our implementation
    this.set(sid, session, callback);
  };

  //
  // Optional
  //
  length = util.callbackify(async () => {
    let result = await sqldb.queryOneRowAsync(sql.length, {
      expirationInSeconds: config.sessionStoreExpireSeconds,
    });
    return result.rows[0].count;
  });

  clear = util.callbackify(async () => {
    await sqldb.queryAsync(sql.clear, {});
  });

  all = util.callbackify(async () => {
    let result = await sqldb.queryAsync(sql.allsessions, {
      expirationInSeconds: config.sessionStoreExpireSeconds,
    });
    let sessions = _.map(result.rows, 'session');
    return sessions;
  });
}

module.exports = plSessionStore;
