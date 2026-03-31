import type { UseMutationResult } from '@tanstack/react-query';
import Alert from 'react-bootstrap/Alert';

import { type AppError, getAppError } from '../../../../lib/client/errors.js';

export function QueryErrors<T>({
  queries,
  messages = {},
}: {
  queries: UseMutationResult<any, any, any>[];
  messages?: Partial<Record<AppError<T>['code'], string>>;
}) {
  return queries.map((query, index) => {
    if (!query.isError) return null;

    const appError = getAppError<T>(query.error);
    const message = appError
      ? (messages[appError.code as AppError<T>['code']] ?? appError.message)
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
