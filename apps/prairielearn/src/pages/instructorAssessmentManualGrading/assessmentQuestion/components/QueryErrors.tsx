import type { UseMutationResult } from '@tanstack/react-query';
import Alert from 'react-bootstrap/Alert';

import { getAppError } from '../../../../lib/client/errors.js';

export function QueryErrors({
  queries,
  messages = {},
}: {
  queries: UseMutationResult<any, any, any>[];
  messages?: Record<string, string>;
}) {
  return queries.map((query, index) => {
    if (!query.isError) return null;

    const appError = getAppError(query.error);
    const message = appError
      ? (messages[appError.code] ?? appError.message)
      : 'An unknown error occurred.';

    return (
      <Alert
        // eslint-disable-next-line @eslint-react/no-array-index-key
        key={index}
        variant="danger"
        className="mb-3"
        dismissible
        onClose={() => query.reset()}
      >
        <strong>Error:</strong> {message}
      </Alert>
    );
  });
}
