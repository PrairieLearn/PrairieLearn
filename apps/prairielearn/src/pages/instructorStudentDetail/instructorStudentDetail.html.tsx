import { Fragment } from 'preact/jsx-runtime';
import { z } from 'zod';

import { AssessmentBadge } from '../../components/AssessmentBadge.js';
import { FriendlyDate } from '../../components/FriendlyDate.js';
import { Scorebar } from '../../components/Scorebar.js';
import { setCookieClient } from '../../lib/client/cookie.js';
import {
  StaffCourseInstanceSchema,
  StaffEnrollmentSchema,
  StaffUserSchema,
} from '../../lib/client/safe-db-types.js';
import { getAssessmentInstanceUrl } from '../../lib/client/url.js';
import { SprocUsersGetDisplayedRoleSchema } from '../../lib/db-types.js';
import { type StaffGradebookRow, computeLabel, computeTitle } from '../../lib/gradebook.shared.js';

export const UserDetailSchema = z.object({
  user: StaffUserSchema,
  course_instance: StaffCourseInstanceSchema,
  enrollment: StaffEnrollmentSchema.nullable(),
  role: SprocUsersGetDisplayedRoleSchema,
});

type UserDetail = z.infer<typeof UserDetailSchema>;

interface StudentDetailProps {
  gradebookRows: StaffGradebookRow[];
  student: UserDetail;
  urlPrefix: string;
  courseInstanceUrl: string;
}

export function InstructorStudentDetail({
  gradebookRows,
  student,
  urlPrefix,
  courseInstanceUrl,
}: StudentDetailProps) {
  const { user, course_instance, enrollment, role } = student;

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
    <>
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center justify-content-between">
          <h1 class="mb-0">Details</h1>
          <button type="button" class="btn btn-sm btn-light" onClick={handleViewAsStudent}>
            <i class="fas fa-user-graduate me-1" aria-hidden="true" />
            View as student
          </button>
        </div>
        <div class="card-body">
          <h2>{user.name}</h2>
          <div class="d-flex">
            <div class="fw-bold me-1">UID:</div>
            {user.uid}
          </div>
          {user.uin && (
            <div class="d-flex">
              <div class="fw-bold me-1">UIN:</div> {user.uin}
            </div>
          )}
          <div class="d-flex">
            <div class="fw-bold me-1">Role:</div> {role}
          </div>
          {enrollment?.first_joined_at && (
            <div class="d-flex">
              <div class="fw-bold me-1">Joined:</div>
              <FriendlyDate
                date={enrollment.first_joined_at}
                timezone={course_instance.display_timezone}
              />
            </div>
          )}
        </div>
      </div>

      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center justify-content-between">
          <h2 class="mb-0">Gradebook</h2>
          <button type="button" class="btn btn-sm btn-light" onClick={handleViewGradebookAsStudent}>
            <i class="fas fa-book me-1" aria-hidden="true" />
            View gradebook as student
          </button>
        </div>

        {gradebookRows.length === 0 ? (
          <div class="card-body">
            <div class="text-muted">No gradebook entries found.</div>
          </div>
        ) : (
          <div class="table-responsive">
            <table class="table table-sm table-hover" aria-label="Student assessment scores">
              <thead>
                <tr>
                  <th style="width: 1%">
                    <span class="visually-hidden">Label</span>
                  </th>
                  <th>
                    <span class="visually-hidden">Assessment</span>
                  </th>
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
                          <AssessmentBadge
                            urlPrefix={urlPrefix}
                            assessment={{
                              color: row.assessment_set.color,
                              label: computeLabel(row),
                              assessment_id: row.assessment.id,
                            }}
                            hideLink
                          />
                        </td>
                        <td class="align-middle">
                          <a
                            href={getAssessmentInstanceUrl({
                              urlPrefix,
                              assessmentId: row.assessment.id,
                            })}
                          >
                            {computeTitle(row)}
                          </a>
                          {row.assessment.group_work && (
                            <i class="fas fa-users ms-1" aria-hidden="true" title="Group work" />
                          )}
                        </td>
                        <td class="text-center align-middle">
                          {row.assessment_instance.id && row.show_closed_assessment_score ? (
                            <Scorebar score={row.assessment_instance.score_perc} class="mx-auto" />
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
                              View instance
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
          </div>
        )}
      </div>
    </>
  );
}

InstructorStudentDetail.displayName = 'InstructorStudentDetail';
