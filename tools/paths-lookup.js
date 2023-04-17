//
// "/pl/course_instance/32982/assessment_instance/1153012"
// "/pl/course_instance/32982/instance_question/56753346/"
//
// Diagnostic tool for parsing PrairieLearn server logs
// Pass in GET paths to have it decode them against the
// database to print out course and question ID
//
const ERR = require('async-stacktrace');
const sqldb = require('@prairielearn/postgres');
const { config } = require('../lib/config-new');
const { logger } = require('@prairielearn/logger');
const readline = require('readline');

var sql = sqldb.loadSqlEquiv(__filename);

config.loadConfig('config.json');

var pgConfig = {
  user: config.postgresqlUser,
  database: config.postgresqlDatabase,
  host: config.postgresqlHost,
  password: config.postgresqlPassword,
  max: 100,
  idleTimeoutMillis: 3000,
};
logger.verbose(
  'Connecting to database ' + pgConfig.user + '@' + pgConfig.host + ':' + pgConfig.database
);
var idleErrorHandler = function (err) {
  logger.error('idle client error', err);
};
sqldb.init(pgConfig, idleErrorHandler, function (err) {
  if (ERR(err)) return;
  logger.verbose('Successfully connected to database');

  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false,
  });

  rl.on('line', lookup_path);
  rl.on('close', function () {
    sqldb.close(function () {});
  });
});

var lookup_path = function (line) {
  //console.log(line);

  var regexp = /instance_question\/(\d+)/;
  var match = regexp.exec(line);
  //console.log(match);
  if (match) {
    var iq_id = match[1];
    sqldb.query(sql.iqsearch, { iq_id }, function (err, result) {
      if (ERR(err)) return;
      if (result.rows[0]) {
        console.log(result.rows[0]);
      }
    });
  }
};
