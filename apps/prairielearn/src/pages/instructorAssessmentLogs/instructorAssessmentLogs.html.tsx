import { Hydrate } from '@prairielearn/react/server';

import { getAssessmentSettingsUrl } from '../../lib/client/url.js';

import { type AssessmentLogRow, AssessmentLogsTable } from './AssessmentLogsTable.js';

export function InstructorAssessmentLogs({
  courseInstanceId,
  assessmentId,
  timezone,
  logs,
  search,
}: {
  courseInstanceId: string;
  assessmentId: string;
  timezone: string;
  logs: AssessmentLogRow[];
  search: string;
}) {
  return (
    <div className="d-flex flex-column h-100">
      <nav aria-label="Breadcrumb">
        <ol className="breadcrumb">
          <li className="breadcrumb-item">
            <a href={getAssessmentSettingsUrl({ courseInstanceId, assessmentId })}>Settings</a>
          </li>
          <li className="breadcrumb-item active" aria-current="page">
            Assessment logs
          </li>
        </ol>
      </nav>
      <div className="flex-grow-1" style={{ minHeight: 0 }}>
        <Hydrate fullHeight>
          <AssessmentLogsTable
            logs={logs}
            courseInstanceId={courseInstanceId}
            timezone={timezone}
            search={search}
          />
        </Hydrate>
      </div>
    </div>
  );
}
