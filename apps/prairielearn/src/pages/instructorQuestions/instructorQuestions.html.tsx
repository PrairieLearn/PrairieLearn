import { PageLayout } from '../../components/PageLayout.js';
import { QuestionsTable, QuestionsTableHead } from '../../components/QuestionsTable.js';
import { type CourseInstance } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { type QuestionsPageData } from '../../models/questions.js';

export const QuestionsPage = ({
  questions,
  course_instances,
  showAddQuestionButton,
  showAiGenerateQuestionButton,
  resLocals,
}: {
  questions: QuestionsPageData[];
  course_instances: CourseInstance[];
  showAddQuestionButton: boolean;
  showAiGenerateQuestionButton: boolean;
  resLocals: ResLocalsForPage<'course' | 'course-instance'>;
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
    content: QuestionsTable({
      questions,
      course_instances,
      showAddQuestionButton,
      showAiGenerateQuestionButton,
      showSharingSets: resLocals.question_sharing_enabled,
      current_course_instance: resLocals.course_instance,
      urlPrefix: resLocals.urlPrefix,
    }),
  });
};
