import { Fragment } from 'react';
import z from 'zod';

import { Hydrate } from '@prairielearn/react/server';

import { AssessmentModuleHeading } from '../../components/AssessmentModuleHeading.js';
import { AssessmentSetHeading } from '../../components/AssessmentSetHeading.js';
import {
  PublicAssessmentModuleSchema,
  PublicAssessmentSetSchema,
  type PublicCourse,
  type PublicCourseInstance,
  RawPublicAssessmentSchema,
  RawPublicAssessmentSetSchema,
} from '../../lib/client/safe-db-types.js';

import {
  CopyCourseInstanceModal,
  type SafeCopyTarget,
  type SafeQuestionForCopy,
} from './components/CopyCourseInstanceModal.js';

const SafeAssessmentStatsRowSchema = RawPublicAssessmentSchema.extend({
  needs_statistics_update: z.boolean().optional(),
});

export const SafeAssessmentRowSchema = SafeAssessmentStatsRowSchema.extend({
  name: RawPublicAssessmentSetSchema.shape.name,
  start_new_assessment_group: z.boolean(),
  assessment_set: PublicAssessmentSetSchema,
  assessment_module: PublicAssessmentModuleSchema,
  label: z.string(),
  open_issue_count: z.coerce.number(),
});
type SafeAssessmentRow = z.infer<typeof SafeAssessmentRowSchema>;

export function PublicAssessments({
  rows,
  courseInstance,
  course,
  courseInstanceCopyTargets,
  questionsForCopy,
  isAdministrator,
}: {
  rows: SafeAssessmentRow[];
  courseInstance: PublicCourseInstance;
  course: PublicCourse;
  courseInstanceCopyTargets: SafeCopyTarget[] | null;
  questionsForCopy: SafeQuestionForCopy[];
  isAdministrator: boolean;
}) {
  return (
    <div className="card mb-4">
      <div className="card-header bg-primary text-white d-flex align-items-center">
        <h1>Assessments</h1>
        <div className="ms-auto d-flex flex-row gap-1">
          <div className="btn-group">
            <Hydrate>
              <CopyCourseInstanceModal
                course={course}
                courseInstance={courseInstance}
                courseInstanceCopyTargets={courseInstanceCopyTargets}
                questionsForCopy={questionsForCopy}
                isAdministrator={isAdministrator}
              />
            </Hydrate>
          </div>
        </div>
      </div>

      <div className="table-responsive">
        <table className="table table-sm table-hover">
          <thead>
            <tr>
              <th style={{ width: '1%' }}>
                <span className="visually-hidden">Label</span>
              </th>
              <th>
                <span className="visually-hidden">Title</span>
              </th>
              <th>Short name</th>
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
                  <td className="align-middle" style={{ width: '1%' }}>
                    <span className={`badge color-${row.assessment_set.color}`}>{row.label}</span>
                  </td>
                  <td className="align-middle">
                    <a
                      href={`/pl/public/course_instance/${courseInstance.id}/assessment/${row.id}/questions`}
                    >
                      {row.title}
                    </a>
                  </td>
                  <td className="align-middle">{row.tid}</td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
