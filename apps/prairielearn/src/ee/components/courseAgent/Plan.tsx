import type { UIMessage } from 'ai';
import clsx from 'clsx';
import { Spinner } from 'react-bootstrap';

import { type PlanPart, PlanPartSchema } from '@prairielearn/course-agent-types';

const STATUS_LABEL = { completed: 'done', inProgress: 'in progress', pending: 'not started' };

/** The plan of the turn that is writing this message, if the agent is keeping one. */
export function planOf(message: UIMessage | undefined): PlanPart | null {
  if (message?.role !== 'assistant') return null;
  for (let i = message.parts.length - 1; i >= 0; i--) {
    const part = message.parts[i];
    // A plan before this marker belongs to an earlier turn of the same message.
    if (part.type === 'data-turn') return null;
    if (part.type === 'data-plan') return PlanPartSchema.safeParse(part.data).data ?? null;
  }
  return null;
}

/**
 * The agent's plan for the running turn, shown with the message box: a plain list in which only
 * the step in progress stands out.
 */
export function PlanChecklist({ plan }: { plan: PlanPart }) {
  return (
    <ol
      className="course-agent-plan list-unstyled small border rounded-3 mb-3 d-flex flex-column gap-1 overflow-y-auto"
      style={{ maxHeight: '11rem' }}
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
          <span
            className="course-agent-plan-icon d-flex align-items-center justify-content-center flex-shrink-0"
            aria-hidden="true"
          >
            {step.status === 'inProgress' ? (
              <Spinner
                animation="border"
                variant="primary"
                style={{ width: '0.875rem', height: '0.875rem', borderWidth: '0.125em' }}
              />
            ) : step.status === 'completed' ? (
              <i className="course-agent-plan-done bi bi-check-circle-fill text-success" />
            ) : (
              <i className="bi bi-circle text-body-tertiary" />
            )}
          </span>
          <span>
            {step.text}
            <span className="visually-hidden"> ({STATUS_LABEL[step.status]})</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
