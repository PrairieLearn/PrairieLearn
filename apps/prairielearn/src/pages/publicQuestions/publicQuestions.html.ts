import { html } from '@prairielearn/html';

import { HeadContents } from '../../components/HeadContents.html.js';
import { Navbar } from '../../components/Navbar.html.js';
import { QuestionsTable, QuestionsTableHead } from '../../components/QuestionsTable.html.js';
import { type QuestionsPageData } from '../../models/questions.js';

export const QuestionsPage = ({
  questions,
  showAddQuestionButton,
  resLocals,
}: {
  questions: QuestionsPageData[];
  showAddQuestionButton: boolean;
  resLocals;
}) => {
  // Example course questions can be publicly shared, but we don't allow them to
  // be imported into courses, so we won't show the sharing name in the QID.
  const qidPrefix = resLocals.course.example_course ? '' : `@${resLocals.course.sharing_name}/`;

  return html`
    <!doctype html>
    <html lang="en">
      <head>
        ${HeadContents({ resLocals, pageTitle: 'Public Questions' })} ${QuestionsTableHead()}
      </head>

      <body>
        ${Navbar({ resLocals })}
        <main id="content" class="container-fluid">
          ${resLocals.course.sharing_name
            ? QuestionsTable({
                questions,
                showAddQuestionButton,
                qidPrefix,
                urlPrefix: resLocals.urlPrefix,
                plainUrlPrefix: resLocals.plainUrlPrefix,
                __csrf_token: resLocals.__csrf_token,
              })
            : html`<p>
                This course doesn't have a sharing name. If you are an Owner of this course, please
                choose a sharing name on the
                <a
                  href="${resLocals.plainUrlPrefix}/course/${resLocals.course
                    .id}/course_admin/sharing"
                  >course sharing settings page</a
                >.
              </p>`}
        </main>
      </body>
    </html>
  `.toString();
};
