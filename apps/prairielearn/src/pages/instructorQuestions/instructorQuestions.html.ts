import { compiledStylesheetTag } from '@prairielearn/compiled-assets';
import { html } from '@prairielearn/html';

import { Application } from '../../components/Application.html.js';
import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { QuestionsTable, QuestionsTableHead } from '../../components/QuestionsTable.html.js';
import { SideNav } from '../../components/SideNav.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
import { type CourseInstance } from '../../lib/db-types.js';
import { QuestionsPageDataAnsified } from '../../models/questions.js';

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
        ${[
          HeadContents({ resLocals }),
          compiledStylesheetTag('application.css'),
          QuestionsTableHead(),
        ]}
      </head>

      <body>
        ${Application({
          topNav: Navbar({ resLocals, showContextNavigation: false }),
          sideNav: SideNav(),
          main: html`
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
          `,
        })}
      </body>
    </html>
  `.toString();
};
