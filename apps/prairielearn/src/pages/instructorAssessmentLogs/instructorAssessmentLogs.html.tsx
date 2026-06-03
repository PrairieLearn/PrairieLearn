import { z } from 'zod';

import { formatDate } from '@prairielearn/formatter';

import { JobStatus } from '../../components/JobStatus.js';
import { getAssessmentSettingsUrl, getCourseInstanceJobSequenceUrl } from '../../lib/client/url.js';
import { JobSequenceSchema, UserSchema } from '../../lib/db-types.js';

export const LogJobSequenceSchema = z.object({
  job_sequence: JobSequenceSchema,
  user_uid: UserSchema.shape.uid,
});
type LogJobSequence = z.infer<typeof LogJobSequenceSchema>;

export function InstructorAssessmentLogs({
  courseInstanceId,
  assessmentId,
  timezone,
  regradingJobSequences,
  uploadJobSequences,
}: {
  courseInstanceId: string;
  assessmentId: string;
  timezone: string;
  regradingJobSequences: LogJobSequence[];
  uploadJobSequences: LogJobSequence[];
}) {
  return (
    <>
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

      <div className="card">
        <div className="card-body">
          <h1 className="h5 card-title mb-3">Assessment logs</h1>
          <ul className="nav nav-tabs" role="tablist">
            <li className="nav-item" role="presentation">
              <button
                className="nav-link active"
                id="regrading-logs-tab"
                data-bs-toggle="tab"
                data-bs-target="#regrading-logs"
                type="button"
                role="tab"
                aria-controls="regrading-logs"
                aria-selected="true"
              >
                Regrading
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button
                className="nav-link"
                id="upload-logs-tab"
                data-bs-toggle="tab"
                data-bs-target="#upload-logs"
                type="button"
                role="tab"
                aria-controls="upload-logs"
                aria-selected="false"
              >
                File uploads
              </button>
            </li>
          </ul>
          <div className="tab-content pt-3">
            <div
              className="tab-pane fade show active"
              id="regrading-logs"
              role="tabpanel"
              aria-labelledby="regrading-logs-tab"
            >
              <JobSequenceLogTable
                jobSequences={regradingJobSequences}
                courseInstanceId={courseInstanceId}
                timezone={timezone}
                ariaLabel="Regrading job history"
                emptyMessage="No previous regradings."
              />
            </div>
            <div
              className="tab-pane fade"
              id="upload-logs"
              role="tabpanel"
              aria-labelledby="upload-logs-tab"
            >
              <JobSequenceLogTable
                jobSequences={uploadJobSequences}
                courseInstanceId={courseInstanceId}
                timezone={timezone}
                ariaLabel="Score upload job history"
                emptyMessage="No previous uploads."
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function JobSequenceLogTable({
  jobSequences,
  courseInstanceId,
  timezone,
  ariaLabel,
  emptyMessage,
}: {
  jobSequences: LogJobSequence[];
  courseInstanceId: string;
  timezone: string;
  ariaLabel: string;
  emptyMessage: string;
}) {
  return (
    <div className="table-responsive">
      <table className="table table-sm table-hover" aria-label={ariaLabel}>
        <thead>
          <tr>
            <th>Number</th>
            <th>Date</th>
            <th>Description</th>
            <th>User</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {jobSequences.length > 0 ? (
            jobSequences.map(({ job_sequence, user_uid }) => (
              <tr key={job_sequence.id}>
                <td>{job_sequence.number}</td>
                <td>{formatDate(job_sequence.start_date!, timezone)}</td>
                <td>{job_sequence.description}</td>
                <td>{user_uid}</td>
                <td>
                  <JobStatus status={job_sequence.status} />
                </td>
                <td>
                  <a
                    href={getCourseInstanceJobSequenceUrl(courseInstanceId, job_sequence.id)}
                    className="btn btn-xs btn-info"
                  >
                    Details
                  </a>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={6}>{emptyMessage}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
