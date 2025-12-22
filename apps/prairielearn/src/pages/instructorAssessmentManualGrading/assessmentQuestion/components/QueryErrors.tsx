import type { UseMutationResult } from '@tanstack/react-query';
import Alert from 'react-bootstrap/Alert';

export function QueryErrors({ queries }: { queries: UseMutationResult<any, any, any>[] }) {
  return queries.map((query) => {
    if (!query.isError) return null;

    <Alert variant="danger" class="mb-3" dismissible onClose={() => query.reset()}>
      <strong>Error:</strong> {query.error.message}
    </Alert>;
  });
}
