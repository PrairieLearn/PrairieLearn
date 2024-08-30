import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { QuestionsTable, QuestionsTableHead } from '../../components/QuestionsTable.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { type CourseInstance } from '../../lib/db-types.js';
import { User } from '../../lib/db-types.js';
import { QuestionsPageDataAnsified } from '../../models/questions.js';

export function InstructorQuestionsNoPermission({
  resLocals,
  courseOwners,
}: {
  resLocals: Record<string, any>;
  courseOwners: User[];
}) {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Questions' })}
      </head>
      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          <div class="card mb-4">
            <div class="card-header bg-danger text-white">
              <h1>Questions</h1>
            </div>
            <div class="card-body">
              <h2>Insufficient permissions</h2>
              <p>You must have at least &quot;Viewer&quot; permissions for this course.</p>
              ${courseOwners.length > 0
                ? html`
                    <p>Contact one of the below course owners to request access.</p>
                    <ul>
                      ${courseOwners.map(
                        (owner) => html`
                          <li>${owner.uid} ${owner.name ? `(${owner.name})` : ''}</li>
                        `,
                      )}
                    </ul>
                  `
                : ''}
            </div>
          </div>
        </main>
      </body>
    </html>
  `.toString();
}

export const QuestionsPage = ({
  questions,
  course_instances,
  showAddQuestionButton,
  showAiGenerateQuestionButton,
  resLocals,
}: {
  questions: QuestionsPageDataAnsified[];
  course_instances: CourseInstance[];
  showAddQuestionButton: boolean;
  showAiGenerateQuestionButton: boolean;
  resLocals;
}) => {
  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals })} ${QuestionsTableHead()}
      </head>

      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          ${CourseSyncErrorsAndWarnings({
            authz_data: resLocals.authz_data,
            course: resLocals.course,
            urlPrefix: resLocals.urlPrefix,
          })}
          ${QuestionsTable({
            questions,
            course_instances,
            showAddQuestionButton,
            showAiGenerateQuestionButton,
            showSharingSets: resLocals.question_sharing_enabled,
            current_course_instance: resLocals.course_instance,
            urlPrefix: resLocals.urlPrefix,
            plainUrlPrefix: resLocals.plainUrlPrefix,
            __csrf_token: resLocals.__csrf_token,
          })}
        </main>
      </body>
    </html>
  `.toString();
};
