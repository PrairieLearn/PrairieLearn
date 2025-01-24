import { html } from '@prairielearn/html';

import { PageLayout } from '../../components/PageLayout.html.js';
import { QuestionsTable, QuestionsTableHead } from '../../components/QuestionsTable.html.js';
import { CourseSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.html.js';
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
  templateQuestions?: { qid: string; title: string }[];
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
    headContent: [QuestionsTableHead()],
    content: html`
      ${CourseSyncErrorsAndWarnings({
        authz_data: resLocals.authz_data,
        course: resLocals.course,
        urlPrefix: resLocals.urlPrefix,
      })}
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
