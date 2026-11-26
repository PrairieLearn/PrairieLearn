import type { UIMessage } from 'ai';
import clsx from 'clsx';
import { useId, useState } from 'react';
import { Spinner } from 'react-bootstrap';

import { type PlanPart, PlanPartSchema } from '@prairielearn/course-agent-types';

type PlanStep = PlanPart['steps'][number];

const STATUS_LABEL = { completed: 'done', inProgress: 'in progress', pending: 'not started' };

/** The plan of the turn that is writing this message, if the agent is keeping one. */
export function planOf(message: UIMessage | undefined): PlanPart | null {
  if (message?.role !== 'assistant') return null;
  for (let i = message.parts.length - 1; i >= 0; i--) {
    const part = message.parts[i];
    // A plan before this marker belongs to an earlier turn of the same message.
    if (part.type === 'data-turn') return null;
    if (part.type === 'data-plan') {
      const plan = PlanPartSchema.safeParse(part.data).data;
      return plan && !plan.ended ? plan : null;
    }
  }
  return null;
}

function StepIcon({ status }: { status: PlanStep['status'] }) {
  return (
    <span
      className="course-agent-plan-icon d-flex align-items-center justify-content-center flex-shrink-0"
      aria-hidden="true"
    >
      {status === 'inProgress' ? (
        <Spinner
          animation="border"
          variant="primary"
          style={{ width: '0.875rem', height: '0.875rem', borderWidth: '0.125em' }}
        />
      ) : status === 'completed' ? (
        <i className="bi bi-check-circle-fill text-success" />
      ) : (
        <i className="bi bi-circle text-body-tertiary" />
      )}
    </span>
  );
}

/**
 * The agent's plan for the running turn, in a strip between the conversation and the message box.
 * It takes one line, naming the step in progress, and opens to the whole list.
 */
export function PlanChecklist({ plan }: { plan: PlanPart }) {
  const [expanded, setExpanded] = useState(false);
  const listId = useId();
  const inProgress = plan.steps.findIndex((step) => step.status === 'inProgress');
  const pending = plan.steps.findIndex((step) => step.status === 'pending');
  // Between steps, the next one to start is the current one; after the last, the last is.
  const index = inProgress !== -1 ? inProgress : pending !== -1 ? pending : plan.steps.length - 1;
  const current = plan.steps.at(index);
  const position = `${index + 1} of ${plan.steps.length}`;

  return (
    <div className="small border-top">
      <button
        type="button"
        className="course-agent-plan-toggle btn border-0 rounded-0 w-100 d-flex align-items-start gap-2 text-start"
        aria-expanded={expanded}
        aria-controls={listId}
        onClick={() => setExpanded(!expanded)}
      >
        {expanded || !current ? (
          <span className="flex-grow-1 text-body-secondary">Step {position}</span>
        ) : (
          <>
            <StepIcon status={current.status} />
            <span className="course-agent-plan-current flex-grow-1 fw-semibold">
              {current.text}
            </span>
            <span className="flex-shrink-0 text-body-secondary">
              <span className="visually-hidden">Step </span>
              {position}
            </span>
          </>
        )}
        <span
          className="course-agent-plan-icon d-flex align-items-center justify-content-center flex-shrink-0"
          aria-hidden="true"
        >
          <i
            className={clsx(
              'bi small text-body-secondary',
              expanded ? 'bi-chevron-down' : 'bi-chevron-right',
            )}
          />
        </span>
      </button>
      {expanded && (
        <ol
          id={listId}
          className="course-agent-plan-steps list-unstyled mb-0 d-flex flex-column gap-1 overflow-y-auto"
          aria-label="Plan"
        >
          {plan.steps.map((step, index) => (
            <li
              // The agent identifies a plan's steps only by their order.
              // oxlint-disable-next-line react/no-array-index-key
              key={index}
              className={clsx(
                'd-flex gap-2',
                step.status === 'inProgress' ? 'text-body fw-semibold' : 'text-body-secondary',
              )}
            >
              <StepIcon status={step.status} />
              <span>
                {step.text}
                <span className="visually-hidden"> ({STATUS_LABEL[step.status]})</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
