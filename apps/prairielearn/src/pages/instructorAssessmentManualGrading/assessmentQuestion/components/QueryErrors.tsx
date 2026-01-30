import type { UseMutationResult } from '@tanstack/react-query';
import Alert from 'react-bootstrap/Alert';

export function QueryErrors({ queries }: { queries: UseMutationResult<any, any, any>[] }) {
  return queries.map((query, index) => {
    if (!query.isError) return null;

    return (
      <Alert
        // eslint-disable-next-line @eslint-react/no-array-index-key
        key={index}
        variant="danger"
        className="mb-3"
        dismissible
        onClose={() => query.reset()}
      >
        <strong>Error:</strong> {query.error.message}
      </Alert>
    );
  });
}
