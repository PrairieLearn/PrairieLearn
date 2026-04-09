import { Fragment } from 'react';
import { z } from 'zod';

import { FriendlyDate, TimezoneContext } from '../../../components/FriendlyDate.js';
import { Scorebar } from '../../../components/Scorebar.js';
import { StudentAccessRulesPopoverReact } from '../../../components/StudentAccessRulesPopover.js';
import {
  getStudentAssessmentInstanceUrl,
  getStudentAssessmentUrl,
} from '../../../lib/client/url.js';

const AccessRuleSchema = z.object({
  active: z.boolean().nullable(),
  credit: z.string(),
  end_date: z.string(),
  mode: z.enum(['Public', 'Exam', 'SEB']).nullable(),
  start_date: z.string(),
  time_limit_min: z.string(),
});

export const StudentAssessmentsTableRowSchema = z.object({
  assessment_id: z.string(),
  multiple_instance_header: z.boolean(),
  title: z.string(),
  team_work: z.boolean().nullable(),
  modern_access_control: z.boolean(),
  assessment_set_color: z.string(),
  label: z.string(),
  credit_date_string: z.string(),
  active: z.boolean(),
  access_rules: z.array(AccessRuleSchema),
  show_closed_assessment_score: z.boolean(),
  assessment_instance_id: z.string().nullable(),
  assessment_instance_score_perc: z.number().nullable(),
  assessment_instance_open: z.boolean().nullable(),
  start_new_assessment_group: z.boolean(),
  assessment_group_heading: z.string(),
  opens_at: z.string().nullable().optional(),
});
type StudentAssessmentsTableRow = z.infer<typeof StudentAssessmentsTableRowSchema>;

function getRowUrl(row: StudentAssessmentsTableRow, courseInstanceId: string): string {
  if (row.assessment_instance_id != null) {
    return getStudentAssessmentInstanceUrl({
      courseInstanceId,
      assessmentInstanceId: row.assessment_instance_id,
    });
  }
  return getStudentAssessmentUrl({ courseInstanceId, assessmentId: row.assessment_id });
}

function AssessmentScore({ row }: { row: StudentAssessmentsTableRow }) {
  if (row.assessment_instance_id == null) return <>Not started</>;
  if (!row.show_closed_assessment_score) return <>Score not shown</>;
  return <Scorebar score={row.assessment_instance_score_perc} className="mx-auto" />;
}

function NewInstanceButton({
  courseInstanceId,
  row,
}: {
  courseInstanceId: string;
  row: StudentAssessmentsTableRow;
}) {
  if (row.active) {
    return (
      <a href={getRowUrl(row, courseInstanceId)} className="btn btn-primary btn-sm">
        New instance
      </a>
    );
  }
  return (
    <button type="button" className="btn btn-primary btn-sm" disabled>
      New instance
    </button>
  );
}

function AvailableCredit({ row }: { row: StudentAssessmentsTableRow }) {
  if (row.modern_access_control && row.assessment_instance_id == null && !row.active) {
    if (row.opens_at) {
      return (
        <span className="text-muted">
          Available{' '}
          <FriendlyDate
            date={new Date(row.opens_at)}
            relative={false}
            options={{ dateOnly: true }}
            tooltip
          />
        </span>
      );
    }
    return <span className="text-muted">Not yet available</span>;
  }
  if (row.credit_date_string === 'None') return null;
  if (row.assessment_instance_open !== false) {
    return (
      <>
        {row.credit_date_string}
        <StudentAccessRulesPopoverReact accessRules={row.access_rules} />
      </>
    );
  }
  return <>Assessment closed.</>;
}

export function StudentAssessmentsTable({
  rows,
  courseInstanceId,
  displayTimezone,
}: {
  rows: StudentAssessmentsTableRow[];
  courseInstanceId: string;
  displayTimezone: string;
}) {
  return (
    <TimezoneContext value={displayTimezone}>
      <div className="table-responsive">
        <table className="table table-sm table-hover" aria-label="Assessments">
          <thead>
            <tr>
              <th style={{ width: '1%' }}>
                <span className="visually-hidden">Label</span>
              </th>
              <th>
                <span className="visually-hidden">Title</span>
              </th>
              <th className="text-center">Available credit</th>
              <th className="text-center">Score</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Fragment
                key={
                  row.assessment_instance_id != null
                    ? `instance-${row.assessment_instance_id}`
                    : `assessment-${row.assessment_id}`
                }
              >
                {row.start_new_assessment_group && (
                  <tr>
                    <th colSpan={4} scope="row" data-testid="assessment-group-heading">
                      {row.assessment_group_heading}
                    </th>
                  </tr>
                )}
                <tr>
                  <td className="align-middle" style={{ width: '1%' }}>
                    <span
                      className={`badge color-${row.assessment_set_color}`}
                      data-testid="assessment-set-badge"
                    >
                      {row.label}
                    </span>
                  </td>
                  <td className="align-middle">
                    {row.multiple_instance_header ||
                    (!row.active && row.assessment_instance_id == null) ? (
                      <span className="text-muted">{row.title}</span>
                    ) : (
                      <a href={getRowUrl(row, courseInstanceId)}>
                        {row.title}
                        {row.team_work && <i className="fas fa-users" aria-hidden="true" />}
                      </a>
                    )}
                  </td>
                  <td className="text-center align-middle">
                    <AvailableCredit row={row} />
                  </td>
                  <td className="text-center align-middle">
                    {row.multiple_instance_header ? (
                      <NewInstanceButton courseInstanceId={courseInstanceId} row={row} />
                    ) : (
                      <AssessmentScore row={row} />
                    )}
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </TimezoneContext>
  );
}
StudentAssessmentsTable.displayName = 'StudentAssessmentsTable';
