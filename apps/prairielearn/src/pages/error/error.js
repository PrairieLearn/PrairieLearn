// @ts-check
var _ = require('lodash');
var path = require('path');
var jsonStringifySafe = require('json-stringify-safe');

const { logger } = require('@prairielearn/logger');

/** @type {import('express').ErrorRequestHandler} */
module.exports = function (err, req, res, _next) {
  const errorId = res.locals.error_id;

  err.status = err.status ?? 500;
  res.status(err.status);

  var referrer = req.get('Referrer') || null;
  logger.log(err.status >= 500 ? 'error' : 'verbose', 'Error page', {
    msg: err.message,
    id: errorId,
    status: err.status,
    stack: err.stack,
    data: jsonStringifySafe(err.data),
    referrer,
    response_id: res.locals.response_id,
  });

  const sqlPos = _.get(err, ['data', 'sqlError', 'position'], null);
  let sqlQuery = _.get(err, ['data', 'sql'], null);
  if (sqlPos != null && sqlQuery != null) {
    const preSql = sqlQuery.substring(0, sqlPos);
    const postSql = sqlQuery.substring(sqlPos);
    const prevNewline = Math.max(0, preSql.lastIndexOf('\n'));
    let nextNewline = postSql.indexOf('\n');
    if (nextNewline < 0) nextNewline = postSql.length;
    nextNewline += preSql.length;
    const gap = ' '.repeat(Math.max(0, sqlPos - prevNewline - 2));
    sqlQuery =
      sqlQuery.substring(0, nextNewline) +
      '\n' +
      gap +
      '^\n' +
      gap +
      '|\n' +
      gap +
      '+ ERROR POSITION SHOWN ABOVE\n' +
      sqlQuery.substring(nextNewline);
  }

  const templateData = {
    error: err,
    error_data: jsonStringifySafe(
      _.omit(_.get(err, ['data'], {}), ['sql', 'sqlParams', 'sqlError']),
      null,
      '    ',
    ),
    error_data_sqlError: jsonStringifySafe(_.get(err, ['data', 'sqlError'], null), null, '    '),
    error_data_sqlParams: jsonStringifySafe(_.get(err, ['data', 'sqlParams'], null), null, '    '),
    error_data_sqlQuery: sqlQuery,
    id: errorId,
    referrer,
  };
  if (req.app.get('env') === 'development') {
    // development error handler
    // will print stacktrace
    res.render(path.join(__dirname, 'error'), templateData);
  } else {
    // production error handler
    // no stacktraces leaked to user
    templateData.error = { message: err.message, info: err.info };
    res.render(path.join(__dirname, 'error'), templateData);
  }
};
