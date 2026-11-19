import type { UIMessage } from 'ai';
import clsx from 'clsx';
import { useState } from 'react';
import { Spinner } from 'react-bootstrap';

import { type PlanPart, PlanPartSchema } from '@prairielearn/course-agent-types';

import { Disclosure } from '../ai/ChatParts.js';

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
 * The agent's plan for the running turn, pinned above the message box. The step in progress
 * holds a slot where the chat shows what the agent is doing right now.
 */
export function PlanChecklist({
  plan,
  activitySlot,
}: {
  plan: PlanPart;
  /** Receives the element under the step in progress, or null when there is none to fill. */
  activitySlot: (element: HTMLElement | null) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const done = plan.steps.filter((step) => step.status === 'completed').length;
  const current = plan.steps.find((step) => step.status === 'inProgress');
  return (
    <Disclosure
      className="border rounded-3 px-3 py-2 mx-3 mb-2 small"
      summary={
        <span className="d-flex gap-2 flex-grow-1 overflow-hidden">
          <span className="fw-semibold text-body flex-shrink-0">Plan</span>
          {!expanded && current && <span className="text-truncate">{current.text}</span>}
          <span className="ms-auto flex-shrink-0">
            {done} of {plan.steps.length}
          </span>
        </span>
      }
      expanded={expanded}
      onToggle={() => setExpanded(!expanded)}
    >
      <div
        className="progress my-2"
        style={{ height: '3px' }}
        role="progressbar"
        aria-label="Plan progress"
        aria-valuemin={0}
        aria-valuemax={plan.steps.length}
        aria-valuenow={done}
      >
        <div className="progress-bar" style={{ width: `${(done / plan.steps.length) * 100}%` }} />
      </div>
      <ol
        className="list-unstyled mb-0 d-flex flex-column gap-1 overflow-y-auto"
        style={{ maxHeight: '11rem' }}
      >
        {plan.steps.map((step, index) => (
          <li
            // The agent identifies a plan's steps only by their order.
            // oxlint-disable-next-line react/no-array-index-key
            key={index}
            className="course-agent-plan-step d-flex gap-2"
          >
            <span
              className="course-agent-plan-icon d-flex align-items-center justify-content-center flex-shrink-0 bg-body"
              aria-hidden="true"
            >
              {step.status === 'inProgress' ? (
                <Spinner
                  animation="border"
                  variant="primary"
                  style={{ width: '0.875rem', height: '0.875rem', borderWidth: '0.125em' }}
                />
              ) : (
                <i
                  className={clsx(
                    'bi',
                    step.status === 'completed'
                      ? 'bi-check-circle-fill text-success'
                      : 'bi-circle text-body-tertiary',
                  )}
                />
              )}
            </span>
            <span className="flex-grow-1 overflow-hidden">
              <span
                className={clsx(
                  step.status === 'inProgress' && 'text-body fw-semibold',
                  step.status === 'completed' && 'text-body-secondary',
                  step.status === 'pending' && 'text-body-tertiary',
                )}
              >
                {step.text}
              </span>
              <span className="visually-hidden"> ({STATUS_LABEL[step.status]})</span>
              {step.status === 'inProgress' && <span ref={activitySlot} className="d-block" />}
            </span>
          </li>
        ))}
      </ol>
    </Disclosure>
  );
}
