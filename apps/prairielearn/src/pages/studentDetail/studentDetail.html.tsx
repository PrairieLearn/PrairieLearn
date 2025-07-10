import { Fragment } from 'preact/jsx-runtime';
import { z } from 'zod';

import { Scorebar } from '../../components/Scorebar.js';
import { setCookieClient } from '../../lib/client/cookie.js';
import { StaffUserSchema } from '../../lib/client/safe-db-types.js';
import { type StaffGradebookRow, computeLabel, computeTitle } from '../../lib/gradebook.shared.js';

export const UserDetailSchema = z.object({
  user: StaffUserSchema,
  role: z.string(),
  enrollment_date: z.string().nullable(),
});

type UserDetail = z.infer<typeof UserDetailSchema>;

interface StudentDetailProps {
  gradebookRows: StaffGradebookRow[];
  student: UserDetail;
  urlPrefix: string;
  courseInstanceUrl: string;
}

export function StudentDetail({
  gradebookRows,
  student,
  urlPrefix,
  courseInstanceUrl,
}: StudentDetailProps) {
  const { user } = student;

  const gradebookRowsBySet = new Map<string, StaffGradebookRow[]>();
  gradebookRows.forEach((row) => {
    const setHeading = row.assessment_set.heading;
    if (!gradebookRowsBySet.has(setHeading)) {
      gradebookRowsBySet.set(setHeading, []);
    }
    const setAssessments = gradebookRowsBySet.get(setHeading);
    if (setAssessments) {
      setAssessments.push(row);
    }
  });

  const handleViewAsStudent = () => {
    setCookieClient(['pl_requested_uid', 'pl2_requested_uid'], user.uid);
    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    window.location.href = `${courseInstanceUrl}/assessments`;
  };

  const handleViewGradebookAsStudent = () => {
    setCookieClient(['pl_requested_uid', 'pl2_requested_uid'], user.uid);
    setCookieClient(['pl_requested_data_changed', 'pl2_requested_data_changed'], 'true');
    window.location.href = `${courseInstanceUrl}/gradebook`;
  };

  return (
    <div class="container-fluid">
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center justify-content-between">
          <h1 class="mb-0">Details</h1>
          <button type="button" class="btn btn-sm btn-light" onClick={handleViewAsStudent}>
            <i class="fas fa-user-graduate me-1" aria-hidden="true"></i>
            View as Student
          </button>
        </div>
        <div class="card-body">
          <div class="row">
            <div class="col-md-3">
              <strong>Name:</strong>
              <div>{user.name}</div>
            </div>
            <div class="col-md-3">
              <strong>UID:</strong>
              <div>{user.uid}</div>
            </div>
            {user.uin && (
              <div class="col-md-3">
                <strong>UIN:</strong>
                <div>{user.uin}</div>
              </div>
            )}
            <div class="col-md-3">
              <strong>Role:</strong>
              <div>{student.role}</div>
            </div>
          </div>
          {student.enrollment_date && (
            <div class="row mt-3">
              <div class="col-md-3">
                <strong>Enrolled:</strong>
                <div>{student.enrollment_date}</div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center justify-content-between">
          <h2 class="mb-0">Gradebook</h2>
          <button type="button" class="btn btn-sm btn-light" onClick={handleViewGradebookAsStudent}>
            <i class="fas fa-book me-1" aria-hidden="true"></i>
            View Gradebook as Student
          </button>
        </div>

        {gradebookRows.length === 0 ? (
          <div class="card-body">
            <div class="text-muted">No gradebook entries found.</div>
          </div>
        ) : (
          <table class="table table-sm table-hover" aria-label="Student Assessment Performance">
            <thead>
              <tr>
                <th style="width: 1%">
                  <span class="visually-hidden">Label</span>
                </th>
                <th></th>
                <th class="text-center">Score</th>
                <th class="text-center">Points</th>
                <th class="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {Array.from(gradebookRowsBySet.entries()).map(([setHeading, setAssessments]) => (
                <Fragment key={setHeading}>
                  <tr>
                    <th colspan={5}>{setHeading}</th>
                  </tr>
                  {setAssessments.map((row) => (
                    <tr key={row.assessment.id}>
                      <td class="align-middle" style="width: 1%">
                        <span class={`badge color-${row.assessment_set.color}`}>
                          {computeLabel(row)}
                        </span>
                      </td>
                      <td class="align-middle">
                        {computeTitle(row)}
                        {row.assessment.group_work && (
                          <i class="fas fa-users ms-1" aria-hidden="true" title="Group work"></i>
                        )}
                      </td>
                      <td class="text-center align-middle">
                        {row.assessment_instance.id && row.show_closed_assessment_score ? (
                          <Scorebar
                            score={row.assessment_instance.score_perc}
                            className="mx-auto"
                          />
                        ) : row.assessment_instance.id ? (
                          'In progress'
                        ) : (
                          <span class="text-muted">Not started</span>
                        )}
                      </td>
                      <td class="text-center align-middle">
                        {row.assessment_instance.id && row.show_closed_assessment_score ? (
                          `${row.assessment_instance.points?.toFixed(1) || '0.0'} / ${row.assessment_instance.max_points?.toFixed(1) || '0.0'}`
                        ) : row.assessment_instance.id ? (
                          <span class="text-muted">—</span>
                        ) : (
                          <span class="text-muted">—</span>
                        )}
                      </td>
                      <td class="text-center align-middle">
                        {row.assessment_instance.id ? (
                          <a
                            href={`${urlPrefix}/assessment_instance/${row.assessment_instance.id}`}
                            class="btn btn-xs btn-outline-primary"
                          >
                            View Instance
                          </a>
                        ) : (
                          <span class="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

StudentDetail.displayName = 'StudentDetail';
