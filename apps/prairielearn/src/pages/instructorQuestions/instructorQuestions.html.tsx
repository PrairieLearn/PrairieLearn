import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';

import { PageLayout } from '../../components/PageLayout.js';
import { QuestionsTable, QuestionsTableHead } from '../../components/QuestionsTable.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { type CourseInstance } from '../../lib/db-types.js';
import { type QuestionsPageData } from '../../models/questions.js';

export const QuestionsPage = ({
  questions,
  templateQuestions = [],
  course_instances,
  showAddQuestionButton,
  showAiGenerateQuestionButton,
  resLocals,
}: {
  questions: QuestionsPageData[];
  templateQuestions?: { example_course: boolean; qid: string; title: string }[];
  course_instances: CourseInstance[];
  showAddQuestionButton: boolean;
  showAiGenerateQuestionButton: boolean;
  resLocals: Record<string, any>;
}) => {
  return PageLayout({
    resLocals,
    pageTitle: 'Questions',
    navContext: {
      type: 'instructor',
      page: 'course_admin',
      subPage: 'questions',
    },
    options: {
      fullWidth: true,
    },
    headContent: QuestionsTableHead(),
    content: html`
      ${renderHtml(
        <CourseSyncErrorsAndWarnings
          authzData={resLocals.authz_data}
          course={resLocals.course}
          urlPrefix={resLocals.urlPrefix}
        />,
      )}
      ${QuestionsTable({
        questions,
        templateQuestions,
        course_instances,
        showAddQuestionButton,
        showAiGenerateQuestionButton,
        showSharingSets: resLocals.question_sharing_enabled,
        current_course_instance: resLocals.course_instance,
        urlPrefix: resLocals.urlPrefix,
        plainUrlPrefix: resLocals.plainUrlPrefix,
        __csrf_token: resLocals.__csrf_token,
      })}
    `,
  });
};
