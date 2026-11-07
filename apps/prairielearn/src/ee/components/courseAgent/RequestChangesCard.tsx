import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { type ReactNode, Suspense, lazy, useState } from 'react';
import { Alert, Button, Modal, Spinner } from 'react-bootstrap';

import type { RequestChangesResult } from '@prairielearn/course-agent-types';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';

import { useTRPC } from '../../../trpc/course/context.js';
import type { CourseAgentError } from '../../../trpc/course/course-agent.js';
import type { ReviewDiffFile } from '../../lib/course-agent/review-diff.js';

// The diff renderer and its syntax highlighter are only needed once the review is opened.
const LazyReviewDiff = lazy(() =>
  import('./ReviewDiff.js').then(
    (module) => module,
    () => ({ default: ReviewDiffLoadError }),
  ),
);

function ReviewDiffLoadError() {
  return (
    <Alert variant="danger" className="m-3">
      Could not load the changes. Reload this page to try again.
    </Alert>
  );
}

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
  const decide = (value: 'approved' | 'denied') =>
    decision.mutate({ conversationId, reviewId, decision: value });
  const actionsDisabled = !pending || decision.isPending;
  const canApprove = !!pending?.diff.files;
  return (
    <div className="border rounded p-2">
      {data?.status === 'decided' && data.result ? (
        <ReviewResult result={data.result} />
      ) : (
        <ReviewActions
          disabled={actionsDisabled}
          canApprove={canApprove}
          fileCount={pending?.diff.files?.length ?? null}
          onViewChanges={() => setShowChanges(true)}
          onDecision={decide}
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
      {/* A diff can fail transiently, for example while the course is locked by another save. */}
      {(review.isError || pending?.diff.error) && (
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
        files={pending?.diff.files ?? null}
        error={pending?.diff.error ? <Alert variant="danger">{pending.diff.error}</Alert> : null}
        actionsDisabled={actionsDisabled}
        canApprove={canApprove}
        onHide={() => setShowChanges(false)}
        onDecision={(value) => {
          decide(value);
          setShowChanges(false);
        }}
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
  fileCount,
  onViewChanges,
  onDecision,
}: {
  disabled: boolean;
  canApprove: boolean;
  fileCount: number | null;
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
        {fileCount === null
          ? 'View changes'
          : `View ${fileCount === 1 ? '1 changed file' : `${fileCount} changed files`}`}
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
  files,
  error,
  actionsDisabled,
  canApprove,
  onDecision,
}: {
  id: string;
  show: boolean;
  onHide: () => void;
  loading: boolean;
  files: ReviewDiffFile[] | null;
  error: ReactNode;
  actionsDisabled: boolean;
  canApprove: boolean;
  onDecision: (decision: 'approved' | 'denied') => void;
}) {
  const loadingSpinner = (
    <div className="d-flex justify-content-center p-4">
      <Spinner animation="border" size="sm" role="status">
        <span className="visually-hidden">Loading changes</span>
      </Spinner>
    </div>
  );
  return (
    <Modal
      show={show}
      size="xl"
      fullscreen="lg-down"
      aria-labelledby={`review-title-${id}`}
      scrollable
      onHide={onHide}
    >
      <Modal.Header closeButton>
        <Modal.Title id={`review-title-${id}`}>Review course changes</Modal.Title>
      </Modal.Header>
      <Modal.Body className={clsx(files && files.length > 0 && 'p-0 d-flex flex-column')}>
        {loading && loadingSpinner}
        {files && files.length > 0 && (
          <Suspense fallback={loadingSpinner}>
            <LazyReviewDiff files={files} />
          </Suspense>
        )}
        {files?.length === 0 && <p className="m-3">No files were changed.</p>}
        {files === null && !loading && !error && (
          <p className="mb-0">This review is no longer pending.</p>
        )}
        {error}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide}>
          Close
        </Button>
        <Button
          variant="outline-danger"
          disabled={actionsDisabled}
          onClick={() => onDecision('denied')}
        >
          Deny
        </Button>
        <Button disabled={actionsDisabled || !canApprove} onClick={() => onDecision('approved')}>
          Approve
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
  } else if (result.publication.status === 'unknown') {
    message =
      'Saving was interrupted before its outcome was recorded, so these changes may or may not have been saved. Check the course files or repository.';
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
