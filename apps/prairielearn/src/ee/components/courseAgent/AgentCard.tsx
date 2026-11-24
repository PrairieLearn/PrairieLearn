import type { ReactNode } from 'react';

/**
 * The shell of a request the course agent makes of the instructor: an icon and a line or two
 * saying what it is, then whatever the request adds, such as its choices or the decision made.
 */
export function AgentCard({
  icon,
  title,
  subtitle,
  children,
}: {
  /** A Bootstrap icon name, without the `bi-` prefix. */
  icon: string;
  title: string;
  subtitle?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="course-agent-review border rounded-3">
      <div className="d-flex align-items-start gap-2 mb-2">
        <span className="course-agent-card-icon" aria-hidden="true">
          <i className={`bi bi-${icon}`} />
        </span>
        <div className="flex-grow-1" style={{ minWidth: 0 }}>
          <div>{title}</div>
          {subtitle && <div className="small text-body-secondary text-break">{subtitle}</div>}
        </div>
      </div>
      {children}
    </div>
  );
}
