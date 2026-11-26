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

import { AlwaysApproveModal } from './AlwaysApproveModal.js';

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
  autoApprove,
  onAlwaysApprove,
}: {
  conversationId: string;
  reviewId: string;
  /** The agent is idle but has not received this review's result, for example after Stop. */
  canResume: boolean;
  /** Submitted under "Always approve", so the agent service asks PrairieLearn to approve it. */
  autoApprove: boolean;
  /** The instructor approved this review and asked not to be asked again in this course. */
  onAlwaysApprove: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [showChanges, setShowChanges] = useState(false);
  const [confirmingAlways, setConfirmingAlways] = useState(false);
  const [shownAt] = useState(Date.now);
  const reviewInput = { conversationId, reviewId };
  const review = useQuery({
    ...trpc.courseAgent.getReview.queryOptions(reviewInput),
    retry: false,
    // Saving runs in the background; poll until it records a result. An automatic approval is
    // polled for a while too, after which a refused one is left for the instructor.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status === 'decided' && !data.result) return 2000;
      return autoApprove && autoApproving(query.state, shownAt) ? 2000 : false;
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
  // A decided review no longer returns its diff, so keep the last one for the card to show while
  // the changes are saved.
  const [lastFiles, setLastFiles] = useState<ReviewDiffFile[] | null>(null);
  if (pending?.diff.files && pending.diff.files !== lastFiles) setLastFiles(pending.diff.files);
  const files = pending?.diff.files ?? lastFiles;
  const decide = (value: 'approved' | 'denied') =>
    decision.mutate({ conversationId, reviewId, decision: value });
  const approveAlways = () =>
    decision.mutate(
      { conversationId, reviewId, decision: 'approved' },
      { onSuccess: onAlwaysApprove },
    );
  const autoApprovalPolled = autoApprove && autoApproving(review, shownAt);
  const actionsDisabled = !pending || decision.isPending;
  const canApprove = !!pending?.diff.files;
  const approving = decision.isPending && decision.variables.decision === 'approved';
  // What the card is waiting on once the changes are approved, shown in place of the choices.
  // An automatic approval is shown for a while; if it is refused, the choices come back.
  const progress =
    (data?.status === 'decided' && !data.result) || approving
      ? 'Saving and syncing'
      : autoApprovalPolled
        ? 'Approving automatically'
        : null;
  // A result that arrives while the card is open eases in; one loaded with history is just shown.
  const [sawUndecided, setSawUndecided] = useState(false);
  if ((pending || progress) && !sawUndecided) setSawUndecided(true);
  return (
    <div className="course-agent-review border rounded-3">
      {data?.status === 'decided' && data.result ? (
        <ReviewResult result={data.result} entering={sawUndecided} />
      ) : (
        <ReviewActions
          disabled={actionsDisabled}
          canApprove={canApprove}
          files={files}
          progress={progress}
          onViewChanges={() => setShowChanges(true)}
          onDecision={decide}
          onApproveAlways={() => setConfirmingAlways(true)}
        />
      )}
      {data?.status === 'unavailable' && (
        <p className="small text-muted mt-2 mb-0">This review is no longer available.</p>
      )}
      {/* The composer delivers a denial by message again when the instructor resends it. */}
      {canResume && data?.status === 'decided' && data.result && !data.result.viaMessage && (
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
        files={files}
        error={pending?.diff.error ? <Alert variant="danger">{pending.diff.error}</Alert> : null}
        actionsDisabled={actionsDisabled}
        canApprove={canApprove}
        onHide={() => setShowChanges(false)}
        onDecision={(value) => {
          decide(value);
          setShowChanges(false);
        }}
        onApproveAlways={() => {
          setShowChanges(false);
          setConfirmingAlways(true);
        }}
      />
      <AlwaysApproveModal
        show={confirmingAlways}
        onHide={() => setConfirmingAlways(false)}
        onConfirm={() => {
          setConfirmingAlways(false);
          approveAlways();
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

const AUTO_APPROVAL_WAIT_MS = 60_000;

function autoApproving(
  { data, dataUpdatedAt }: { data: { status: string } | undefined; dataUpdatedAt: number },
  shownAt: number,
) {
  return data?.status === 'pending' && dataUpdatedAt - shownAt < AUTO_APPROVAL_WAIT_MS;
}

function ReviewActions({
  disabled,
  canApprove,
  files,
  progress,
  onViewChanges,
  onDecision,
  onApproveAlways,
}: {
  disabled: boolean;
  canApprove: boolean;
  files: ReviewDiffFile[] | null;
  /** What is happening to approved changes, which replaces the choices while it does. */
  progress: string | null;
  onViewChanges: () => void;
  onDecision: (decision: 'approved' | 'denied') => void;
  onApproveAlways: () => void;
}) {
  const additions = files?.reduce((sum, file) => sum + file.additions, 0) ?? 0;
  const deletions = files?.reduce((sum, file) => sum + file.deletions, 0) ?? 0;
  return (
    <>
      <div className="d-flex align-items-center gap-2">
        <i className="bi bi-exclamation-triangle text-warning" aria-hidden="true" />
        <span>Review course changes</span>
      </div>
      <Button
        variant="link"
        className="course-agent-review-files"
        title="View changes"
        onClick={onViewChanges}
      >
        <i className="bi bi-file-earmark-diff text-body-secondary" aria-hidden="true" />
        {files && (
          <span className="text-truncate">
            {files.length === 1 ? '1 changed file' : `${files.length} changed files`}
          </span>
        )}
        {files?.some((file) => file.patch !== null) && (
          <span className="flex-shrink-0">
            <span className="text-success">+{additions}</span>{' '}
            <span className="text-danger">−{deletions}</span>
          </span>
        )}
        <span className="course-agent-review-view d-flex align-items-center gap-1 ms-auto flex-shrink-0">
          <span>
            View<span className="course-agent-review-view-wide"> changes</span>
          </span>
          <i className="bi bi-chevron-right" aria-hidden="true" />
        </span>
      </Button>
      {progress ? (
        <div
          className="course-agent-review-progress course-agent-fade d-flex align-items-center gap-2 small"
          role="status"
        >
          <Spinner
            animation="border"
            variant="primary"
            style={{ width: '0.875rem', height: '0.875rem', borderWidth: '0.125em' }}
            aria-hidden="true"
          />
          <span className="course-agent-shimmer">{progress}…</span>
        </div>
      ) : (
        <div className="d-flex flex-wrap gap-2">
          <Button
            size="sm"
            className="course-agent-composer-button course-agent-composer-send"
            disabled={disabled || !canApprove}
            onClick={() => onDecision('approved')}
          >
            Approve once
          </Button>
          <Button
            variant="link"
            size="sm"
            className="course-agent-composer-button course-agent-review-always"
            disabled={disabled || !canApprove}
            onClick={onApproveAlways}
          >
            Always approve
          </Button>
          <Button
            variant="link"
            size="sm"
            className="course-agent-composer-button"
            disabled={disabled}
            onClick={() => onDecision('denied')}
          >
            Deny
          </Button>
        </div>
      )}
    </>
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
  onApproveAlways,
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
  onApproveAlways: () => void;
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
        <Button disabled={actionsDisabled || !canApprove} onClick={() => onDecision('approved')}>
          Approve once
        </Button>
        <Button
          variant="outline-primary"
          disabled={actionsDisabled || !canApprove}
          onClick={onApproveAlways}
        >
          Always approve
        </Button>
        <Button
          variant="outline-secondary"
          disabled={actionsDisabled}
          onClick={() => onDecision('denied')}
        >
          Deny
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

function ReviewResult({
  result,
  entering,
}: {
  result: RequestChangesResult;
  /** Whether the result arrived while the card was open, so it eases in. */
  entering: boolean;
}) {
  const saved =
    result.decision === 'approved' &&
    (result.publication.status === 'saved_locally' || result.publication.status === 'published');
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
    <div className={clsx(entering && 'course-agent-fade')} role="status">
      <p className="d-flex align-items-baseline gap-2 mb-0">
        {saved && result.sync.status === 'succeeded' && (
          <i
            className={clsx('bi bi-check-circle-fill text-success', entering && 'course-agent-pop')}
            aria-hidden="true"
          />
        )}
        <span>{message}</span>
      </p>
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
