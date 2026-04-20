import { Hydrate } from '@prairielearn/react/server';

import { PageLayout } from '../../components/PageLayout.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

import { CanvasImportForm } from './components/CanvasImportForm.js';

export interface ImportedAssessmentRow {
  id: string;
  tid: string;
  title: string;
  type: string;
  question_count: number;
}

export function InstructorCanvasImport({
  resLocals,
  importedAssessments,
  csrfToken,
  trpcCsrfToken,
}: {
  resLocals: ResLocalsForPage<'course-instance'>;
  importedAssessments: ImportedAssessmentRow[];
  csrfToken: string;
  trpcCsrfToken: string;
}) {
  const { urlPrefix, course_instance } = resLocals;

  return PageLayout({
    resLocals,
    pageTitle: 'Import from Canvas',
    navContext: {
      type: 'instructor',
      page: 'instance_admin',
      subPage: 'assessments',
    },
    options: {},
    content: (
      <>
        <Hydrate>
          <CanvasImportForm
            urlPrefix={urlPrefix}
            courseInstanceId={course_instance.id}
            csrfToken={csrfToken}
            trpcCsrfToken={trpcCsrfToken}
          />
        </Hydrate>

        {importedAssessments.length > 0 && (
          <div className="card mb-4">
            <div className="card-header bg-primary text-white">
              <h2 className="h6 mb-0">Previously imported assessments</h2>
            </div>
            <div className="table-responsive">
              <table className="table table-sm table-hover mb-0" aria-label="Imported assessments">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>AID</th>
                    <th>Type</th>
                    <th className="text-center">Questions</th>
                  </tr>
                </thead>
                <tbody>
                  {importedAssessments.map((row) => (
                    <tr key={row.id}>
                      <td>
                        <a href={`${urlPrefix}/assessment/${row.id}`}>{row.title}</a>
                      </td>
                      <td>{row.tid}</td>
                      <td>{row.type}</td>
                      <td className="text-center">{row.question_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </>
    ),
  });
}
