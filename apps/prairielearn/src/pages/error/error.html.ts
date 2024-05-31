import jsonStringifySafe from 'json-stringify-safe';
import _ from 'lodash';

import { formatErrorStack } from '@prairielearn/error';
import { HtmlSafeString, html } from '@prairielearn/html';
import { renderEjs } from '@prairielearn/html-ejs';

import { config } from '../../lib/config.js';

function formatJson(value: any): string {
  return jsonStringifySafe(value, null, '    ');
}

export function ErrorPage({
  error,
  errorId,
  referrer,
  resLocals,
}: {
  error: {
    message?: string;
    stack?: string;
    status?: number;
    data?: Record<string, any>;
    info?: HtmlSafeString;
  };
  errorId: string;
  referrer: string | null;
  resLocals: Record<string, any>;
}) {
  const {
    outputStderr,
    outputStdout,
    sql: sqlQuery,
    sqlParams,
    sqlError,
    ...restData
  } = error.data ?? {};

  const sqlPosition = error.data?.sqlError?.position;
  let formattedSqlQuery = sqlQuery;
  if (sqlPosition != null && sqlQuery != null) {
    const preSql = sqlQuery.substring(0, sqlPosition);
    const postSql = sqlQuery.substring(sqlPosition);
    const prevNewline = Math.max(0, preSql.lastIndexOf('\n') + 1);
    let nextNewline = postSql.indexOf('\n');
    if (nextNewline < 0) nextNewline = postSql.length;
    nextNewline += preSql.length;
    const gap = ' '.repeat(Math.max(0, sqlPosition - prevNewline - 1));
    formattedSqlQuery =
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

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${renderEjs(import.meta.url, "<%- include('../partials/head') %>", {
          ...resLocals,
          pageTitle: `Error ${error.status}`,
        })}
      </head>
      <body>
        ${renderEjs(import.meta.url, "<%- include('../partials/navbar') %>", {
          ...resLocals,
          navPage: 'error',
        })}
        <main id="content" class="container">
          <div class="card mb-4">
            <div class="card-header bg-danger text-white">Error processing request</div>

            <div class="card-body">
              <h4 class="mb-3">${error.message}</h4>

              ${error.info ?? ''}

              <p><strong>Error ID:</strong> <code>${errorId}</code></p>

              <p><strong>Status:</strong> ${error.status}</p>

              <div>
                <a href="${referrer}" class="btn btn-primary" ${!referrer ? 'disabled' : ''}>
                  <i class="fa fa-arrow-left" aria-hidden="true"></i>
                  Back to previous page
                </a>
                <a href="${config.urlPrefix}" class="btn btn-primary">
                  <i class="fa fa-home" aria-hidden="true"></i>
                  PrairieLearn home
                </a>
              </div>

              ${outputStderr
                ? html`
                    <p><strong>Standard error:</strong></p>
                    <pre class="bg-dark text-white rounded p-2">${outputStderr}</pre>
                  `
                : ''}
              ${outputStdout
                ? html`
                    <p><strong>Standard output:</strong></p>
                    <pre class="bg-dark text-white rounded p-2">${outputStdout}</pre>
                  `
                : ''}
              ${error.stack
                ? html`
                    <p><strong>Stack trace:</strong></p>
                    <pre class="bg-dark text-white rounded p-2">${formatErrorStack(error)}</pre>
                  `
                : ''}
              ${formattedSqlQuery
                ? html`
                    <p><strong>SQL query:</strong></p>
                    <pre class="bg-dark text-white rounded p-2">${formattedSqlQuery}</pre>
                  `
                : ''}
              ${!_.isEmpty(sqlParams)
                ? html`
                    <p><strong>SQL params:</strong></p>
                    <pre class="bg-dark text-white rounded p-2">${formatJson(sqlParams)}</pre>
                  `
                : ''}
              ${!_.isEmpty(sqlError)
                ? html`
                    <p><strong>SQL error data:</strong></p>
                    <pre class="bg-dark text-white rounded p-2">${formatJson(sqlError)}</pre>
                  `
                : ''}
              ${!_.isEmpty(restData)
                ? html`
                    <p><strong>Additional data:</strong></p>
                    <pre class="bg-dark text-white rounded p-2">${formatJson(restData)}</pre>
                  `
                : ''}
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}
