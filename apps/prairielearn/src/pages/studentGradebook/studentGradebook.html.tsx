import { Fragment } from 'react';

import { PageLayout } from '../../components/PageLayout.js';
import { Scorebar } from '../../components/Scorebar.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

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
  resLocals: ResLocalsForPage<'course-instance'>;
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
      <div className="card mb-4">
        <div className="card-header bg-primary text-white d-flex align-items-center">
          <h1>Gradebook</h1>
          <a
            href={`/pl/course_instance/${resLocals.course_instance.id}/gradebook/${csvFilename}`}
            className="btn btn-light btn-sm ms-auto"
            aria-label="Download gradebook CSV"
          >
            <i className="fas fa-download" aria-hidden="true" />
            <span className="d-none d-sm-inline">Download</span>
          </a>
        </div>

        {rows.length === 0 ? (
          <div className="card-body">
            <div className="text-muted">No gradebook entries found.</div>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm table-hover" aria-label="Gradebook">
              <thead>
                <tr>
                  <th style={{ width: '1%' }}>
                    <span className="visually-hidden">Label</span>
                  </th>
                  <th>
                    <span className="visually-hidden">Title</span>
                  </th>
                  <th className="text-center">Score</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <Fragment key={`${row.assessment_id}-${row.assessment_instance_id}`}>
                    {row.start_new_set && (
                      <tr>
                        <th colSpan={3}>{row.assessment_set_heading}</th>
                      </tr>
                    )}
                    <tr>
                      <td className="align-middle" style={{ width: '1%' }}>
                        <span className={`badge color-${row.assessment_set_color}`}>
                          {row.label}
                        </span>
                      </td>
                      <td className="align-middle">
                        {row.title}{' '}
                        {row.assessment_group_work && (
                          <i className="fas fa-users" aria-hidden="true" />
                        )}
                      </td>
                      <td className="text-center align-middle">
                        {row.show_closed_assessment_score ? (
                          <Scorebar
                            score={row.assessment_instance_score_perc}
                            className="mx-auto"
                          />
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
