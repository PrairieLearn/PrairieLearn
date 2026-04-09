import { z } from 'zod';

import { Hydrate } from '@prairielearn/react/server';

import { PageLayout } from '../../components/PageLayout.js';
import {
  AssessmentAccessRuleSchema,
  AssessmentInstanceSchema,
  AssessmentSchema,
  AssessmentSetSchema,
  SprocAuthzAssessmentSchema,
} from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

import {
  StudentAssessmentsTable,
  StudentAssessmentsTableRowSchema,
} from './components/StudentAssessmentsTable.js';

export const StudentAssessmentsRowSchema = z.object({
  assessment_id: AssessmentSchema.shape.id,
  multiple_instance_header: z.boolean(),
  assessment_number: AssessmentSchema.shape.number,
  title: AssessmentSchema.shape.title,
  team_work: AssessmentSchema.shape.team_work.nullable(),
  modern_access_control: AssessmentSchema.shape.modern_access_control,
  authorized: z.boolean(),
  assessment_set_name: AssessmentSetSchema.shape.name,
  assessment_set_color: AssessmentSetSchema.shape.color,
  label: z.string(),
  credit_date_string: z.string(),
  active: AssessmentAccessRuleSchema.shape.active,
  access_rules: SprocAuthzAssessmentSchema.shape.access_rules,
  show_closed_assessment_score: AssessmentAccessRuleSchema.shape.show_closed_assessment_score,
  assessment_instance_id: AssessmentInstanceSchema.shape.id.nullable(),
  assessment_instance_score_perc: AssessmentInstanceSchema.shape.score_perc.nullable(),
  assessment_instance_open: AssessmentInstanceSchema.shape.open.nullable(),
  start_new_assessment_group: z.boolean(),
  assessment_group_heading: z.string(),
  show_before_release: z.boolean().optional(),
  opens_at: z.string().nullable().optional(),
});
type StudentAssessmentsRow = z.infer<typeof StudentAssessmentsRowSchema>;

export function StudentAssessments({
  resLocals,
  rows,
}: {
  resLocals: ResLocalsForPage<'course-instance'>;
  rows: StudentAssessmentsRow[];
}) {
  const { authz_data, course_instance } = resLocals;
  const safeRows = z.array(StudentAssessmentsTableRowSchema).parse(rows);
  return PageLayout({
    resLocals,
    pageTitle: 'Assessments',
    navContext: {
      type: 'student',
      page: 'assessments',
    },
    content: (
      <>
        <div className="card mb-4">
          <div className="card-header bg-primary text-white">
            <h1>Assessments</h1>
          </div>
          <Hydrate>
            <StudentAssessmentsTable
              rows={safeRows}
              courseInstanceId={course_instance.id}
              displayTimezone={course_instance.display_timezone}
            />
          </Hydrate>
        </div>
        {authz_data.mode === 'Exam' && (
          <p>
            Don't see your exam? Exams for this course are only made available to students with
            checked-in exam reservations who have clicked the "Start exam" button in PrairieTest.
            See a proctor for assistance.
          </p>
        )}
      </>
    ),
  });
}
