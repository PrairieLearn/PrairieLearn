import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.js';
import { QuestionsTable, QuestionsTableHead } from '../../components/QuestionsTable.js';
import { type QuestionsPageData } from '../../models/questions.js';

export const QuestionsPage = ({
  questions,
  showAddQuestionButton,
  resLocals,
}: {
  questions: QuestionsPageData[];
  showAddQuestionButton: boolean;
  resLocals: Record<string, any>;
}) => {
  // Example course questions can be publicly shared, but we don't allow them to
  // be imported into courses, so we won't show the sharing name in the QID.
  const qidPrefix = resLocals.course.example_course ? '' : `@${resLocals.course.sharing_name}/`;

  return PageLayout({
    resLocals,
    pageTitle: 'Public Questions',
    navContext: {
      type: 'public',
      page: 'public_questions',
      subPage: 'questions',
    },
    options: {
      fullWidth: true,
    },
    headContent: QuestionsTableHead(),
    content: html`
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
            <a href="${resLocals.plainUrlPrefix}/course/${resLocals.course.id}/course_admin/sharing"
              >course sharing settings page</a
            >.
          </p>`}
    `,
  });
};
