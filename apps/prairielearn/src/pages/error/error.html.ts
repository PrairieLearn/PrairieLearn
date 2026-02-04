import { isEmpty } from 'es-toolkit/compat';
import jsonStringifySafe from 'json-stringify-safe';

import { formatErrorStack } from '@prairielearn/error';
import { html, unsafeHtml } from '@prairielearn/html';
import { formatQueryWithErrorPosition } from '@prairielearn/postgres';

import { PageLayout } from '../../components/PageLayout.js';
import type { UntypedResLocals } from '../../lib/res-locals.types.js';

function formatJson(value: any): string {
  return jsonStringifySafe(value, null, '    ');
}

export function ErrorPage({
  error,
  errorInfo,
  errorId,
  referrer,
  resLocals,
}: {
  error: {
    message?: string;
    stack?: string;
    status?: number;
    data?: Record<string, any>;
  };
  errorInfo?: string;
  errorId: string;
  referrer: string | null;
  resLocals: UntypedResLocals;
}) {
  const {
    outputStderr,
    outputStdout,
    sql: sqlQuery,
    sqlParams,
    sqlError,
    ...restData
  } = error.data ?? {};

  const formattedSqlQuery = formatQueryWithErrorPosition(sqlQuery, sqlError?.position);

  return PageLayout({
    resLocals,
    pageTitle: `Error ${error.status}`,
    navContext: {
      type: resLocals.navbarType,
      page: 'error',
    },
    content: html`
      <div class="card mb-4">
        <div class="card-header bg-danger text-white">
          <h1>Error processing request</h1>
        </div>

        <div class="card-body">
          <h2 class="mb-3 h4">${error.message}</h2>

          ${unsafeHtml(errorInfo ?? '')}

          <p><strong>Error ID:</strong> <code>${errorId}</code></p>

          <p><strong>Status:</strong> ${error.status}</p>

          <div class="d-flex flex-column gap-2 align-items-start">
            <a href="${referrer}" class="btn btn-primary" ${!referrer ? 'disabled' : ''}>
              <i class="fa fa-arrow-left" aria-hidden="true"></i>
              Back to previous page
            </a>
            <a href="/pl" class="btn btn-primary">
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
          ${!isEmpty(sqlParams)
            ? html`
                <p><strong>SQL params:</strong></p>
                <pre class="bg-dark text-white rounded p-2">${formatJson(sqlParams)}</pre>
              `
            : ''}
          ${!isEmpty(sqlError)
            ? html`
                <p><strong>SQL error data:</strong></p>
                <pre class="bg-dark text-white rounded p-2">${formatJson(sqlError)}</pre>
              `
            : ''}
          ${!isEmpty(restData)
            ? html`
                <p><strong>Additional data:</strong></p>
                <pre class="bg-dark text-white rounded p-2">${formatJson(restData)}</pre>
              `
            : ''}
        </div>
      </div>
    `,
  });
}
