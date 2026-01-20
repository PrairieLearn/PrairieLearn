import { useState } from 'react';

import { getStudentEnrollmentUrl } from '../lib/client/url.js';

interface UserData {
  uid: string;
  name: string | null;
  enrollment_id: string;
}

interface ExpandableUserListProps {
  users: UserData[];
  courseInstanceId: string;
  initialLimit?: number;
  emptyText?: string;
  nameFallback?: 'uid' | 'dash';
}

export function ExpandableUserList({
  users,
  courseInstanceId,
  initialLimit = 3,
  emptyText = 'No students',
  nameFallback = 'uid',
}: ExpandableUserListProps) {
  const [expanded, setExpanded] = useState(false);

  if (users.length === 0) {
    return <span className="text-muted">{emptyText}</span>;
  }

  const usersToShow = expanded ? users : users.slice(0, initialLimit);
  const hasMore = users.length > initialLimit;
  const remaining = users.length - initialLimit;

  return (
    <div className="d-flex flex-wrap align-items-center gap-2">
      {usersToShow.map((user, index) => (
        <span key={user.uid}>
          <a
            href={getStudentEnrollmentUrl(courseInstanceId, user.enrollment_id)}
            className="text-decoration-none"
          >
            {user.name || (nameFallback === 'uid' ? user.uid : '—')}
          </a>
          {index < usersToShow.length - 1 && ', '}
        </span>
      ))}
      {hasMore && (
        <button
          type="button"
          className="btn btn-sm btn-outline-secondary"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <i className="fas fa-chevron-up" aria-hidden="true" /> Show less
            </>
          ) : (
            <>
              <i className="fas fa-chevron-down" aria-hidden="true" /> +{remaining} more
            </>
          )}
        </button>
      )}
    </div>
  );
}
