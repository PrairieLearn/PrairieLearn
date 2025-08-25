import { Fragment } from 'preact/jsx-runtime';

import { PageLayout } from '../../components/PageLayout.js';
import { Scorebar } from '../../components/Scorebar.js';

export interface StudentGradebookTableRow {
  assessment_id: string;
  assessment_instance_id: string;
  assessment_group_work: boolean;
  title: string;
  assessment_set_heading: string;
  assessment_set_color: string;
  label: string;
  assessment_instance_score_perc: number | null;
  show_closed_assessment_score: boolean;
  start_new_set: boolean;
}

export function StudentGradebook({
  resLocals,
  rows,
  csvFilename,
}: {
  resLocals: Record<string, any>;
  rows: StudentGradebookTableRow[];
  csvFilename: string;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Gradebook',
    navContext: {
      type: 'student',
      page: 'gradebook',
    },
    content: (
      <div class="card mb-4">
        <div class="card-header bg-primary text-white d-flex align-items-center">
          <h1>Gradebook</h1>
          <a
            href={`/pl/course_instance/${resLocals.course_instance.id}/gradebook/${csvFilename}`}
            class="btn btn-light btn-sm ms-auto"
            aria-label="Download gradebook CSV"
          >
            <i class="fas fa-download" aria-hidden="true" />
            <span class="d-none d-sm-inline">Download</span>
          </a>
        </div>

        {rows.length === 0 ? (
          <div class="card-body">
            <div class="text-muted">No gradebook entries found.</div>
          </div>
        ) : (
          <div class="table-responsive">
            <table class="table table-sm table-hover" aria-label="Gradebook">
              <thead>
                <tr>
                  <th style="width: 1%">
                    <span class="visually-hidden">Label</span>
                  </th>
                  <th>
                    <span class="visually-hidden">Title</span>
                  </th>
                  <th class="text-center">Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={`${row.assessment_id}-${row.assessment_instance_id}`}>
                    {row.start_new_set && (
                      <tr>
                        <th colspan={3}>{row.assessment_set_heading}</th>
                      </tr>
                    )}
                    <tr>
                      <td class="align-middle" style="width: 1%">
                        <span class={`badge color-${row.assessment_set_color}`}>{row.label}</span>
                      </td>
                      <td class="align-middle">
                        {row.title}{' '}
                        {row.assessment_group_work && <i class="fas fa-users" aria-hidden="true" />}
                      </td>
                      <td class="text-center align-middle">
                        {row.show_closed_assessment_score ? (
                          <Scorebar score={row.assessment_instance_score_perc} class="mx-auto" />
                        ) : (
                          'Score not shown'
                        )}
                      </td>
                    </tr>
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    ),
  });
}
