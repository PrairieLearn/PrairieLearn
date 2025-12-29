import { Fragment } from 'preact/jsx-runtime';

import { AssessmentBadge } from '../../../components/AssessmentBadge.js';
import { Scorebar } from '../../../components/Scorebar.js';
import { getAssessmentInstanceUrl } from '../../../lib/client/url.js';
import {
  type StaffGradebookRow,
  computeLabel,
  computeTitle,
} from '../../../lib/gradebook.shared.js';

interface StudentGradebookTableProps {
  rows: StaffGradebookRow[];
  urlPrefix: string;
}

export function StudentGradebookTable({ rows, urlPrefix }: StudentGradebookTableProps) {
  if (rows.length === 0) {
    return (
      <div class="card-body">
        <div class="text-muted">No gradebook entries found.</div>
      </div>
    );
  }

  const rowsBySet = new Map<string, StaffGradebookRow[]>();
  rows.forEach((row) => {
    const setHeading = row.assessment_set.heading;
    const list = rowsBySet.get(setHeading) ?? [];
    list.push(row);
    rowsBySet.set(setHeading, list);
  });

  return (
    <table class="table table-sm table-hover" aria-label="Student Assessment Performance">
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
        {Array.from(rowsBySet.entries()).map(([setHeading, setAssessments]) => (
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
                    href={getAssessmentInstanceUrl({ urlPrefix, assessmentId: row.assessment.id })}
                  >
                    {computeTitle(row)}
                  </a>
                  {row.assessment.team_work && (
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
  );
}
