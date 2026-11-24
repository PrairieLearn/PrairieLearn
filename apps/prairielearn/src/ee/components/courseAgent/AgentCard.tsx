import clsx from 'clsx';
import type { ReactNode } from 'react';

interface AgentCardItem {
  label: string;
  href: string | null;
}

const ITEMS_SHOWN = 5;

/**
 * The shell of a request the course agent makes of the instructor: an icon and a line or two
 * saying what it is, the things it is about, then whatever the request adds, such as its choices
 * or the decision made.
 */
export function AgentCard({
  icon,
  tone = 'neutral',
  title,
  subtitle,
  items = [],
  children,
}: {
  /** A Bootstrap icon name, without the `bi-` prefix. */
  icon: string;
  /** `neutral` only looks; `positive` resolves or adds something; `caution` changes something. */
  tone?: 'neutral' | 'positive' | 'caution';
  title: string;
  subtitle?: string | null;
  /** What the request is about, each linking to its page when it has one. */
  items?: AgentCardItem[];
  children: ReactNode;
}) {
  return (
    <div className="course-agent-review border rounded-3">
      <div className="d-flex align-items-start gap-2 mb-2">
        <span
          className={clsx('course-agent-card-icon', `course-agent-card-icon-${tone}`)}
          aria-hidden="true"
        >
          <i className={`bi bi-${icon}`} />
        </span>
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <div>{title}</div>
          {subtitle && <div className="small text-body-secondary text-break">{subtitle}</div>}
        </div>
      </div>
      {items.length > 0 && (
        <div className="small mb-2">
          <AgentCardItems items={items.slice(0, ITEMS_SHOWN)} />
          {items.length > ITEMS_SHOWN && (
            // The instructor decides on every item, so the rest are one click away.
            <details>
              <summary className="text-body-secondary py-1">
                and {items.length - ITEMS_SHOWN} more
              </summary>
              <AgentCardItems items={items.slice(ITEMS_SHOWN)} />
            </details>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function AgentCardItems({ items }: { items: AgentCardItem[] }) {
  return (
    <ul className="list-unstyled mb-0">
      {items.map((item, index) => (
        // Items are fixed once requested, so their positions identify them.
        // oxlint-disable-next-line react/no-array-index-key
        <li key={index} className="py-1 text-break">
          {item.href ? <a href={item.href}>{item.label}</a> : item.label}
        </li>
      ))}
    </ul>
  );
}
