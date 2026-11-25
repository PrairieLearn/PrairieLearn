import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Button } from 'react-bootstrap';

import type { CourseActionResult } from '@prairielearn/course-agent-types';
import { getAppError } from '@prairielearn/trpc/client';
import { AppErrorAlert } from '@prairielearn/trpc/react';

import { useTRPC } from '../../../trpc/course/context.js';
import type { CourseAgentError } from '../../../trpc/course/course-agent.js';

import { AgentCard } from './AgentCard.js';
import { AUTO_APPROVAL_WAIT_MS, DecisionButtons, ResumeNotice } from './RequestChangesCard.js';

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
  /** Requested under "Always approve", so the agent service asks PrairieLearn to approve it. */
  autoApprove: boolean;
  /** The instructor approved this request and asked not to be asked again. */
  onAlwaysApprove: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  // The chat reads the same request with this query to decide what a new message does, so a
  // denial sent as a message updates the card too.
  const reviewInput = { conversationId, reviewId: actionId };
  const [shownAt] = useState(Date.now);
  const action = useQuery({
    ...trpc.courseAgent.getReview.queryOptions(reviewInput),
    retry: false,
    // An approval made elsewhere, or still running, has a decision before it has a result. An
    // automatic approval is polled for a while too, after which a refused one is left here.
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data?.status !== 'action') return false;
      if (data.decision === 'approved' && !data.result) return 2000;
      return autoApprove &&
        data.decision === null &&
        query.state.dataUpdatedAt - shownAt < AUTO_APPROVAL_WAIT_MS
        ? 2000
        : false;
    },
  });
  // Set when the instructor clicks "Always approve", so the mode changes once the approval succeeds.
  const alwaysApproveRef = useRef(false);
  const decision = useMutation({
    ...trpc.courseAgent.postReviewDecision.mutationOptions(),
    retry: false,
    // Callbacks given to mutate() are dropped if the card unmounts first, and these are not.
    onSuccess: () => {
      if (alwaysApproveRef.current) onAlwaysApprove();
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: trpc.courseAgent.getReview.queryKey(reviewInput),
      }),
  });
  const resume = useMutation({
    ...trpc.courseAgent.resume.mutationOptions(),
    retry: false,
  });
  const data = action.data?.status === 'action' ? action.data : null;
  const failure =
    getAppError<CourseAgentError['GetReview']>(action.error) ??
    getAppError<CourseAgentError['PostReviewDecision']>(decision.error) ??
    getAppError<CourseAgentError['Resume']>(resume.error);
  const pending = data?.decision === null;
  const decide = (value: 'approved' | 'denied', always = false) => {
    alwaysApproveRef.current = always;
    decision.mutate({ conversationId, reviewId: actionId, decision: value });
  };
  const awaitingAutoApproval =
    autoApprove && pending && action.dataUpdatedAt - shownAt < AUTO_APPROVAL_WAIT_MS;
  // Also true in a tab that did not make the approval, while the action is still running.
  const approving =
    (decision.isPending && decision.variables.decision === 'approved') ||
    (data?.decision === 'approved' && !data.result);
  const errors = (
    <>
      {action.isError && (
        <Button size="sm" variant="outline-secondary" onClick={() => void action.refetch()}>
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
    </>
  );
  // Without the request there is nothing to show but why it did not load.
  if (!data) return <div className="course-agent-review border rounded-3">{errors}</div>;
  return (
    <AgentCard
      icon={data.card.icon}
      tone={data.card.tone}
      title={data.card.title}
      subtitle={data.card.subtitle}
      items={data.card.items}
    >
      {data.result ? (
        <ActionResult result={data.result} />
      ) : approving ? (
        <p className="small text-muted mb-0" role="status">
          {autoApprove ? 'Approved automatically. Working…' : 'Working…'}
        </p>
      ) : awaitingAutoApproval ? (
        <p className="small text-muted mb-0" role="status">
          Approving automatically…
        </p>
      ) : (
        <DecisionButtons
          disabled={!pending || decision.isPending}
          canApprove
          onDecision={decide}
          onApproveAlways={() => decide('approved', true)}
        />
      )}
      {/* The composer delivers a denial by message again when the instructor resends it. */}
      {canResume && data.result && !data.result.viaMessage && (
        <ResumeNotice
          disabled={resume.isPending}
          onResume={() => resume.mutate({ conversationId })}
        />
      )}
      {errors}
    </AgentCard>
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
