import { Fragment } from 'preact/jsx-runtime';
import { z } from 'zod';

import { PageLayout } from '../../components/PageLayout.html.js';
import { Scorebar } from '../../components/Scorebar.js';
import { IdSchema, type UserSchema } from '../../lib/db-types.js';

export const StudentAssessmentRowSchema = z.object({
  assessment_id: IdSchema,
  assessment_instance_id: IdSchema.nullable(),
  assessment_set_heading: z.string(),
  assessment_set_color: z.string(),
  assessment_title: z.string(),
  assessment_number: z.string(),
  assessment_label: z.string(),
  score_perc: z.number().nullable(),
  max_points: z.number().nullable(),
  points: z.number().nullable(),
  show_closed_assessment_score: z.boolean(),
  assessment_group_work: z.boolean(),
});

export interface StudentDetailUser {
  user: z.infer<typeof UserSchema>;
  role: string;
  enrollment_date: string | null;
}
export type StudentAssessmentRow = z.infer<typeof StudentAssessmentRowSchema>;

interface StudentDetailProps {
  resLocals: Record<string, any>;
  student: StudentDetailUser;
  assessments: StudentAssessmentRow[];
  csvFilename: string;
}

export function StudentDetail({
  resLocals,
  student,
  assessments,
  csvFilename,
}: StudentDetailProps) {
  const { user } = student;
  const { urlPrefix } = resLocals;

  // Group assessments by assessment set
  const assessmentsBySet = new Map<string, StudentAssessmentRow[]>();
  assessments.forEach((assessment) => {
    const setHeading = assessment.assessment_set_heading;
    if (!assessmentsBySet.has(setHeading)) {
      assessmentsBySet.set(setHeading, []);
    }
    const setAssessments = assessmentsBySet.get(setHeading);
    if (setAssessments) {
      setAssessments.push(assessment);
    }
  });

  return PageLayout({
    resLocals,
    pageTitle: `${user.name} (${user.uid})`,
    navContext: {
      type: 'instructor',
      page: 'instance_admin',
      subPage: 'students',
    },
    content: (
      <div class="container-fluid">
        {/* Student Information Card */}
        <div class="card mb-4">
          <div class="card-header bg-primary text-white">
            <h1 class="mb-0">Student Details</h1>
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
            <div class="row mt-3">
              <div class="col-md-12">
                <a
                  href={`${urlPrefix}/gradebook/${csvFilename}`}
                  class="btn btn-sm btn-outline-primary me-2"
                >
                  <i class="fas fa-download" aria-hidden="true"></i>
                  Student Gradebook
                </a>
                <a href={`${urlPrefix}/gradebook`} class="btn btn-sm btn-outline-secondary">
                  <i class="fas fa-table" aria-hidden="true"></i>
                  View Full Gradebook
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Assessment Performance Card */}
        <div class="card mb-4">
          <div class="card-header bg-secondary text-white d-flex align-items-center">
            <h2 class="mb-0">Assessment Performance</h2>
          </div>

          {assessments.length === 0 ? (
            <div class="card-body">
              <p class="text-muted">No assessments found for this student.</p>
            </div>
          ) : (
            <table class="table table-sm table-hover" aria-label="Student Assessment Performance">
              <thead>
                <tr>
                  <th style="width: 1%">
                    <span class="visually-hidden">Label</span>
                  </th>
                  <th>Assessment</th>
                  <th class="text-center">Score</th>
                  <th class="text-center">Points</th>
                  <th class="text-center">Actions</th>
                </tr>
              </thead>
              <tbody>
                {Array.from(assessmentsBySet.entries()).map(([setHeading, setAssessments]) => (
                  <Fragment key={setHeading}>
                    <tr>
                      <th colspan={5} class="table-active">
                        {setHeading}
                      </th>
                    </tr>
                    {setAssessments.map((assessment) => (
                      <tr key={assessment.assessment_id}>
                        <td class="align-middle" style="width: 1%">
                          <span class={`badge color-${assessment.assessment_set_color}`}>
                            {assessment.assessment_label}
                          </span>
                        </td>
                        <td class="align-middle">
                          {assessment.assessment_title}
                          {assessment.assessment_group_work && (
                            <i class="fas fa-users ms-1" aria-hidden="true" title="Group work"></i>
                          )}
                        </td>
                        <td class="text-center align-middle">
                          {assessment.assessment_instance_id &&
                          assessment.show_closed_assessment_score ? (
                            <Scorebar score={assessment.score_perc} className="mx-auto" />
                          ) : assessment.assessment_instance_id ? (
                            'In progress'
                          ) : (
                            <span class="text-muted">Not started</span>
                          )}
                        </td>
                        <td class="text-center align-middle">
                          {assessment.assessment_instance_id &&
                          assessment.show_closed_assessment_score ? (
                            `${assessment.points?.toFixed(1) || '0.0'} / ${assessment.max_points?.toFixed(1) || '0.0'}`
                          ) : assessment.assessment_instance_id ? (
                            <span class="text-muted">—</span>
                          ) : (
                            <span class="text-muted">—</span>
                          )}
                        </td>
                        <td class="text-center align-middle">
                          {assessment.assessment_instance_id ? (
                            <a
                              href={`${urlPrefix}/assessment_instance/${assessment.assessment_instance_id}`}
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
    ),
  });
}
