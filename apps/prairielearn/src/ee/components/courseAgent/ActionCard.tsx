import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { Button } from 'react-bootstrap';

import type { CourseActionCard, CourseActionResult } from '@prairielearn/course-agent-types';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';

import { useTRPC } from '../../../trpc/course/context.js';
import type { CourseAgentError } from '../../../trpc/course/course-agent.js';

/**
 * A course action the agent requested, for the instructor to approve or deny. Everything shown
 * comes from PrairieLearn, which built it from the request it will carry out.
 */
export function ActionCard({
  conversationId,
  actionId,
  canResume,
  autoApprove,
  onAlwaysApprove,
}: {
  conversationId: string;
  actionId: string;
  /** The agent is idle but has not received this request's result, for example after Stop. */
  canResume: boolean;
  /** Approve the request once it loads, without waiting for the instructor. */
  autoApprove: boolean;
  /** The instructor approved this request and asked not to be asked again. */
  onAlwaysApprove: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const actionInput = { conversationId, actionId };
  const action = useQuery({
    ...trpc.courseAgent.getAction.queryOptions(actionInput),
    retry: false,
    // An approval made in another tab, or still running, has a decision before it has a result.
    refetchInterval: (query) => {
      const data = query.state.data;
      return data?.decision === 'approved' && !data.result ? 2000 : false;
    },
  });
  // Set when the instructor clicks "Always approve", so the mode changes once the approval succeeds.
  const alwaysApproveRef = useRef(false);
  const reviewKey = trpc.courseAgent.getReview.queryKey({ conversationId, reviewId: actionId });
  const decision = useMutation({
    ...trpc.courseAgent.postReviewDecision.mutationOptions(),
    retry: false,
    // Callbacks given to mutate() are dropped if the card unmounts first, and these are not.
    onSuccess: () => {
      if (alwaysApproveRef.current) onAlwaysApprove();
    },
    // The chat reads the same request through getReview to decide what a new message does.
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: trpc.courseAgent.getAction.queryKey(actionInput),
        }),
        queryClient.invalidateQueries({ queryKey: reviewKey }),
      ]),
  });
  const resume = useMutation({
    ...trpc.courseAgent.resume.mutationOptions(),
    retry: false,
  });
  const data = action.data;
  const failure =
    getAppError<CourseAgentError['GetAction']>(action.error) ??
    getAppError<CourseAgentError['PostReviewDecision']>(decision.error) ??
    getAppError<CourseAgentError['Resume']>(resume.error);
  const pending = data?.decision === null;
  const decide = (value: 'approved' | 'denied', always = false) => {
    alwaysApproveRef.current = always;
    decision.mutate({ conversationId, reviewId: actionId, decision: value });
  };
  // Approves a pending request on the instructor's behalf once it has loaded. It tries once: if
  // the approval fails, the card's buttons are left for the instructor to decide.
  const autoApprovedRef = useRef(false);
  const { mutate: mutateDecision } = decision;
  useEffect(() => {
    if (!autoApprove || !pending || autoApprovedRef.current) return;
    autoApprovedRef.current = true;
    mutateDecision({ conversationId, reviewId: actionId, decision: 'approved' });
  }, [autoApprove, pending, mutateDecision, conversationId, actionId]);
  // Also true in a tab that did not make the approval, while the action is still running.
  const approving =
    (decision.isPending && decision.variables.decision === 'approved') ||
    (data?.decision === 'approved' && !data.result);
  const disabled = !pending || decision.isPending;
  return (
    <div className="course-agent-review border rounded-3">
      {data && (
        <>
          <div className="d-flex align-items-start gap-2">
            <i
              className={
                pending
                  ? 'bi bi-exclamation-triangle text-warning'
                  : 'bi bi-lightning-charge text-body-secondary'
              }
              aria-hidden="true"
            />
            <div className="flex-grow-1" style={{ minWidth: 0 }}>
              <div>{data.card.title}</div>
              {data.card.context && (
                <div className="small text-body-secondary">{data.card.context}</div>
              )}
            </div>
          </div>
          {data.card.rows.length > 0 && (
            <div className="small border-top border-bottom my-2 py-2">
              <ActionRows rows={data.card.rows.slice(0, ROWS_SHOWN)} />
              {data.card.rows.length > ROWS_SHOWN && (
                // The instructor decides on every row, so the rest are one click away.
                <details>
                  <summary className="text-body-secondary py-1">
                    Show all {data.card.rows.length}
                  </summary>
                  <ActionRows rows={data.card.rows.slice(ROWS_SHOWN)} />
                </details>
              )}
            </div>
          )}
          {data.result ? (
            <ActionResult result={data.result} />
          ) : (
            <>
              <p className="small text-body-secondary mb-2">
                {data.card.undo ? `To undo: ${data.card.undo}` : 'This cannot be undone.'}
                {data.card.alwaysAsk && ' PrairieLearn always asks before doing this.'}
              </p>
              {!approving && (
                <div className="d-flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="course-agent-composer-button course-agent-composer-send"
                    disabled={disabled}
                    onClick={() => decide('approved')}
                  >
                    Approve once
                  </Button>
                  {!data.card.alwaysAsk && (
                    <Button
                      variant="link"
                      size="sm"
                      className="course-agent-composer-button course-agent-review-always"
                      disabled={disabled}
                      onClick={() => decide('approved', true)}
                    >
                      Always approve
                    </Button>
                  )}
                  <Button
                    variant="link"
                    size="sm"
                    className="course-agent-composer-button"
                    disabled={disabled}
                    onClick={() => decide('denied')}
                  >
                    Deny
                  </Button>
                </div>
              )}
            </>
          )}
        </>
      )}
      {approving && (
        <p className="small text-muted mt-2 mb-0" role="status">
          {autoApprove ? 'Approved automatically. Working…' : 'Working…'}
        </p>
      )}
      {/* The composer delivers a denial by message again when the instructor resends it. */}
      {canResume && data?.result && !data.result.viaMessage && (
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
      {action.isError && (
        <Button
          className="mt-2"
          size="sm"
          variant="outline-secondary"
          onClick={() => void action.refetch()}
        >
          Reload request
        </Button>
      )}
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

const ROWS_SHOWN = 20;

function ActionRows({ rows }: { rows: CourseActionCard['rows'] }) {
  return (
    <ul className="list-unstyled mb-0">
      {rows.map((row, index) => (
        // Rows are fixed once requested, so their positions identify them. The instructor
        // decides on these, so a long detail wraps instead of being cut off.
        // oxlint-disable-next-line react/no-array-index-key
        <li key={index} className="d-flex gap-3 py-1">
          <span className="flex-shrink-0 course-agent-action-row-label">{row.label}</span>
          {row.detail && (
            <span className="text-body-secondary ms-auto text-end course-agent-action-row-detail">
              {row.detail}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function ActionResult({ result }: { result: CourseActionResult }) {
  if (result.decision === 'denied') {
    return (
      <p className="mb-0" role="status">
        Denied. Nothing was changed.
      </p>
    );
  }
  switch (result.outcome.status) {
    case 'succeeded':
      return (
        <p className="mb-0 text-success" role="status">
          <i className="bi bi-check-lg me-1" aria-hidden="true" />
          {result.outcome.summary}
        </p>
      );
    case 'failed':
      return (
        // The reason is written for the course agent, which explains it in its reply.
        <p className="mb-0" role="status">
          This could not be done, and nothing was changed. The course agent will explain why.
        </p>
      );
    default:
      return (
        <p className="mb-0" role="status">
          PrairieLearn was interrupted before recording the outcome, so this may or may not have
          been done. Check before trying again.
        </p>
      );
  }
}
