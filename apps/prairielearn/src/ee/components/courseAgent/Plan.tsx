import type { UIMessage } from 'ai';
import clsx from 'clsx';
import { useState } from 'react';

import { type PlanPart, PlanPartSchema } from '@prairielearn/course-agent-types';

import { Disclosure } from '../ai/ChatParts.js';

const STATUS = {
  completed: { icon: 'bi-check-circle-fill text-success', label: 'done' },
  inProgress: { icon: 'bi-arrow-right-circle-fill text-primary', label: 'in progress' },
  pending: { icon: 'bi-circle', label: 'not started' },
};

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

/** The agent's plan for the running turn, pinned above the message box. */
export function PlanChecklist({ plan }: { plan: PlanPart }) {
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
      <ol
        className="list-unstyled mb-0 mt-2 d-flex flex-column gap-1 overflow-y-auto"
        style={{ maxHeight: '9rem' }}
      >
        {plan.steps.map((step, index) => (
          <li
            // Codex identifies a plan's steps only by their order.
            // oxlint-disable-next-line react/no-array-index-key
            key={index}
            className={clsx(
              'd-flex gap-2',
              step.status === 'inProgress' ? 'text-body fw-semibold' : 'text-body-secondary',
            )}
          >
            <i className={clsx('bi flex-shrink-0', STATUS[step.status].icon)} aria-hidden="true" />
            <span>
              {step.text}
              <span className="visually-hidden"> ({STATUS[step.status].label})</span>
            </span>
          </li>
        ))}
      </ol>
    </Disclosure>
  );
}
