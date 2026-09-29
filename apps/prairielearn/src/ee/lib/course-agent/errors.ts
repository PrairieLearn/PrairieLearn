import { ChatError } from '@prairielearn/course-agent-contract';

export function workerResponseError(status: number) {
  if (status === 401 || status === 403) {
    return new ChatError(
      status,
      `Course agent authentication failed (HTTP ${status}). Set PL_SERVICE_TOKEN and courseAgent.serviceToken to the same value, then restart both services.`,
    );
  }
  if (status === 404) {
    return new ChatError(
      status,
      'Course agent endpoint was not found (HTTP 404). Check courseAgent.workerUrl points to the course-agent Worker.',
    );
  }
  return new ChatError(
    status,
    `Course agent request failed (HTTP ${status}). Check the Worker is running and retry the connection.`,
  );
}

export function connectionFailure(error: unknown) {
  return {
    message:
      error instanceof ChatError
        ? error.message
        : 'Could not connect to the course agent. Check the Worker is running, then retry the connection. Your draft is preserved.',
  };
}
