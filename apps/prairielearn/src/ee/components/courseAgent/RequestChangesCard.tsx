import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useState } from 'react';
import { Alert, Button, Modal, Spinner } from 'react-bootstrap';

import type { RequestChangesResult } from '@prairielearn/course-agent-types';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';

import { useTRPC } from '../../../trpc/course/context.js';
import type { CourseAgentError } from '../../../trpc/course/course-agent.js';

export function RequestChangesCard({
  conversationId,
  reviewId,
  canResume,
}: {
  conversationId: string;
  reviewId: string;
  /** The agent is idle but has not received this review's result, for example after Stop. */
  canResume: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showChanges, setShowChanges] = useState(false);
  const reviewInput = { conversationId, reviewId };
  const review = useQuery({
    ...trpc.courseAgent.getReview.queryOptions(reviewInput),
    retry: false,
    // Saving runs in the background; poll until it records a result.
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.status === 'decided' && !data.result ? 2000 : false;
    },
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.courseAgent.getReview.queryKey(reviewInput) });
  const decision = useMutation({
    ...trpc.courseAgent.postReviewDecision.mutationOptions(),
    retry: false,
    onSuccess: invalidate,
  });
  const resume = useMutation({
    ...trpc.courseAgent.resume.mutationOptions(),
    retry: false,
    onSuccess: invalidate,
  });
  const data = review.data;
  const failure =
    getAppError<CourseAgentError['GetReview']>(review.error) ??
    getAppError<CourseAgentError['PostReviewDecision']>(decision.error) ??
    getAppError<CourseAgentError['Resume']>(resume.error);
  const pending = data?.status === 'pending' ? data : null;
  return (
    <div className="border rounded p-2">
      {data?.status === 'decided' && data.result ? (
        <ReviewResult result={data.result} />
      ) : (
        <ReviewActions
          disabled={!pending || decision.isPending}
          canApprove={typeof pending?.diff.patch === 'string'}
          onViewChanges={() => setShowChanges(true)}
          onDecision={(value) => decision.mutate({ conversationId, reviewId, decision: value })}
        />
      )}
      {data?.status === 'decided' && !data.result && (
        <p className="small text-muted mt-2 mb-0" role="status">
          Saving and syncing…
        </p>
      )}
      {data?.status === 'unavailable' && (
        <p className="small text-muted mt-2 mb-0">This review is no longer available.</p>
      )}
      {canResume && data?.status === 'decided' && data.result && (
        <div className="d-flex align-items-center gap-2 mt-2">
          <span className="small text-muted">The course agent has not received this result.</span>
          <Button
            variant="outline-secondary"
            size="sm"
            disabled={resume.isPending}
            onClick={() => resume.mutate({ conversationId })}
          >
            Resume
          </Button>
        </div>
      )}
      {review.isError && (
        <Button
          className="mt-2"
          size="sm"
          variant="outline-secondary"
          onClick={() => void review.refetch()}
        >
          Reload review
        </Button>
      )}
      {pending?.diff.error && (
        <Alert variant="danger" className="mt-2 mb-0">
          {pending.diff.error}
        </Alert>
      )}
      <ReviewChangesModal
        id={reviewId}
        show={showChanges}
        loading={review.isLoading}
        patch={pending?.diff.patch ?? null}
        error={pending?.diff.error ? <Alert variant="danger">{pending.diff.error}</Alert> : null}
        onHide={() => setShowChanges(false)}
      />
      {failure && (
        <AppErrorAlert
          className="mt-2"
          error={failure}
          render={{ UNKNOWN: ({ message }) => message }}
        />
      )}
    </div>
  );
}

function ReviewActions({
  disabled,
  canApprove,
  onViewChanges,
  onDecision,
}: {
  disabled: boolean;
  canApprove: boolean;
  onViewChanges: () => void;
  onDecision: (decision: 'approved' | 'denied') => void;
}) {
  return (
    <div className="d-flex flex-wrap align-items-center gap-2">
      <div className="d-flex align-items-center gap-2">
        <i className="bi bi-exclamation-triangle text-warning" aria-hidden="true" />
        <span>Review course changes</span>
      </div>
      <Button variant="link" size="sm" className="p-0 text-nowrap" onClick={onViewChanges}>
        View changes
      </Button>
      <div className="d-flex align-items-center gap-2 flex-shrink-0 ms-auto">
        <Button size="sm" disabled={disabled || !canApprove} onClick={() => onDecision('approved')}>
          Approve
        </Button>
        <Button
          variant="outline-secondary"
          size="sm"
          disabled={disabled}
          onClick={() => onDecision('denied')}
        >
          Deny
        </Button>
      </div>
    </div>
  );
}

function ReviewChangesModal({
  id,
  show,
  onHide,
  loading,
  patch,
  error,
}: {
  id: string;
  show: boolean;
  onHide: () => void;
  loading: boolean;
  patch: string | null;
  error: ReactNode;
}) {
  return (
    <Modal show={show} size="lg" aria-labelledby={`review-title-${id}`} onHide={onHide}>
      <Modal.Header closeButton>
        <Modal.Title id={`review-title-${id}`}>Review course changes</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading && (
          <Spinner animation="border" size="sm" role="status">
            <span className="visually-hidden">Loading changes</span>
          </Spinner>
        )}
        {patch !== null && (
          <pre
            className="small mb-0 overflow-auto"
            style={{ maxHeight: '60vh' }}
            aria-label="Reviewed course changes"
          >
            {patch}
          </pre>
        )}
        {patch === null && !loading && !error && (
          <p className="mb-0">This review is no longer pending.</p>
        )}
        {error}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>
          Close
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function ReviewResult({ result }: { result: RequestChangesResult }) {
  let message = 'Changes could not be saved.';
  if (result.decision === 'denied') {
    message = 'Changes denied.';
  } else if (result.publication.status === 'conflict') {
    message = 'Course files changed since this proposal. No proposed changes were saved.';
  } else if (result.publication.status === 'saved_locally') {
    message =
      result.sync.status === 'succeeded'
        ? 'Changes saved locally and course synced.'
        : 'Changes saved locally, but the course sync failed.';
  } else if (result.publication.status === 'published') {
    message =
      result.sync.status === 'succeeded'
        ? 'Changes saved and course synced.'
        : 'Changes saved, but the course sync failed.';
  }
  return (
    <div role="status">
      <p className="mb-0">{message}</p>
      {result.publication.status === 'conflict' && (
        <ul className="mt-2 mb-0">
          {result.publication.paths.map((path) => (
            <li key={path}>
              <code>{path}</code>
            </li>
          ))}
        </ul>
      )}
      {result.publication.status === 'failed' && (
        <pre className="small text-wrap mt-2 mb-0">{result.publication.error}</pre>
      )}
      {result.sync.status === 'failed' && (
        <details className="mt-2">
          <summary>Error</summary>
          <pre className="small text-wrap mt-2 mb-0">{result.sync.error}</pre>
        </details>
      )}
    </div>
  );
}
