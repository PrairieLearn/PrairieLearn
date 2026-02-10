import { hydrateHtml } from '@prairielearn/react/server';

import { CreateQuestionFormContents } from '../../components/CreateQuestionFormContents.js';
import { PageLayout } from '../../components/PageLayout.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export function InstructorQuestionCreatePage({
  templateQuestions,
  resLocals,
}: {
  templateQuestions: { example_course: boolean; qid: string; title: string }[];
  resLocals: ResLocalsForPage<'course' | 'course-instance'>;
}) {
  return PageLayout({
    resLocals,
    pageTitle: 'Create question',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'questions',
    },
    content: hydrateHtml(
      <CreateQuestionFormContents
        templateQuestions={templateQuestions}
        csrfToken={resLocals.__csrf_token}
        questionsUrl={`${resLocals.urlPrefix}/course_admin/questions`}
      />,
    ),
  });
}
