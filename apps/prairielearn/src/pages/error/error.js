// @ts-check
var _ = require('lodash');
var path = require('path');
var jsonStringifySafe = require('json-stringify-safe');

const { logger } = require('@prairielearn/logger');

/**
 * @param {string} stack
 * @param {number} depth
 * @returns {string}
 */
function indentString(stack, depth) {
  if (depth === 0) return stack;

  const indent = '    '.repeat(depth);
  return stack
    .split('\n')
    .map((line) => (indent + line).trimEnd())
    .join('\n');
}

/**
 * Recursively formats an error into a string. Correctly handles both the
 * `.cause` property and `AggregateError` instances.
 *
 * @param {any} err
 * @param {number} [depth]
 * @param {string} [prefix]
 * @returns {string}
 */
function formatErrorStack(err, depth = 0, prefix = '') {
  // This will handle both circular references and unnecessarily deep chains.
  if (depth > 10) return '...';

  let stack = indentString(prefix + err.stack, depth);

  if (err.cause) {
    stack += `\n\n${formatErrorStack(err.cause, depth + 1, 'Cause: ')}`;
  }

  if (err instanceof AggregateError) {
    const indent = '    '.repeat(depth + 1);
    stack += `\n\n${indent}Errors: [\n`;

    err.errors.forEach((error, i) => {
      stack += formatErrorStack(error, depth + 2);
      if (i < err.errors.length - 1) stack += '\n\n';
    });

    stack += `\n${indent}]`;
  }

  return stack;
}

/**
 * This is a version of {@link formatErrorStack} that won't error in the case
 * of an unexpected error object. We'll use the original function if it works,
 * but if it fails for any reason, we'll just return the plain stack, whatever
 * it might be.
 *
 * @param {any} err
 * @returns {string}
 */
function safeFormatErrorStack(err) {
  try {
    return formatErrorStack(err);
  } catch (e) {
    return err.stack;
  }
}

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
    // Use the "safe" version when logging so that we don't error out while
    // trying to log the actual error.
    stack: safeFormatErrorStack(err.stack),
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
    errorStack: err.stack ? formatErrorStack(err) : null,
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
