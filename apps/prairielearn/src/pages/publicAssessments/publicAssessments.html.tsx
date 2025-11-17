import { Fragment } from 'preact';

import type { StaffCourseInstance } from '../../lib/client/safe-db-types.js';
import type { AssessmentModule, AssessmentSet } from '../../lib/db-types.js';
import type { AssessmentRow } from '../../models/assessment.js';

interface PublicAssessmentsProps {
  rows: AssessmentRow[];
  courseInstance: StaffCourseInstance;
}

function AssessmentSetHeading({ assessmentSet }: { assessmentSet: AssessmentSet }) {
  if (!assessmentSet.implicit) {
    return <>{assessmentSet.heading}</>;
  }

  return (
    <>
      {assessmentSet.name}
      <span class="text-muted">
        {' '}
        (Auto-generated from use in an assessment; add this assessment set to your infoCourse.json
        file to customize)
      </span>
    </>
  );
}

function AssessmentModuleHeading({ assessmentModule }: { assessmentModule: AssessmentModule }) {
  if (!assessmentModule.implicit || assessmentModule.heading === 'Default module') {
    return <>{assessmentModule.heading}</>;
  }

  return (
    <>
      {assessmentModule.name}
      <span class="text-muted">
        {' '}
        (Auto-generated from use in an assessment; add this assessment module to your
        infoCourse.json file to customize)
      </span>
    </>
  );
}

export function PublicAssessments({ rows, courseInstance }: PublicAssessmentsProps) {
  return (
    <div class="table-responsive">
      <table class="table table-sm table-hover">
        <thead>
          <tr>
            <th style="width: 1%">
              <span class="visually-hidden">Label</span>
            </th>
            <th>
              <span class="visually-hidden">Title</span>
            </th>
            <th>AID</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <Fragment key={row.id}>
              {row.start_new_assessment_group && (
                <tr>
                  <th colSpan={3} scope="row">
                    {courseInstance.assessments_group_by === 'Set' ? (
                      <AssessmentSetHeading assessmentSet={row.assessment_set} />
                    ) : (
                      <AssessmentModuleHeading assessmentModule={row.assessment_module} />
                    )}
                  </th>
                </tr>
              )}
              <tr id={`row-${row.id}`}>
                <td class="align-middle" style="width: 1%">
                  <span class={`badge color-${row.assessment_set.color}`}>{row.label}</span>
                </td>
                <td class="align-middle">
                  <a
                    href={`/pl/public/course_instance/${courseInstance.id}/assessment/${row.id}/questions`}
                  >
                    {row.title}
                  </a>
                </td>
                <td class="align-middle">{row.tid}</td>
              </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
