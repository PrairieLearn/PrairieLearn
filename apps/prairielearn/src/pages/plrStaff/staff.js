const ERR = require('async-stacktrace');
const express = require('express');
const router = express.Router();

const { config } = require('../../lib/config');
const sqldb = require('@prairielearn/postgres');

const sql = sqldb.loadSqlEquiv(__filename);

router.get('/', function (req, res) {
  res.locals.navPage = 'plrstaff';
  res.locals.isAuthenticated = !!res.locals.authn_user;
  const user = res.locals.authn_user.user_id;
  //this is temporary
  const liveScores = {};

  if (res.locals.isAuthenticated) {
    console.log('staff.js: authenticated');
    console.log('staff.js: user_id: ' + user);
    res.render(__filename.replace(/\.js$/, '.ejs'), res.locals);
  } else {
    console.log('staff.js: not authenticated');
  }
});

module.exports = router;