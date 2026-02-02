import { type CourseInstance } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { type QuestionsPageData } from '../../models/questions.js';

import { InstructorQuestionsPage } from './InstructorQuestionsPage.js';

export interface QuestionsPageProps {
  questions: QuestionsPageData[];
  templateQuestions: { example_course: boolean; qid: string; title: string }[];
  courseInstances: CourseInstance[];
  showAddQuestionButton: boolean;
  showAiGenerateQuestionButton: boolean;
  showSharingSets: boolean;
  currentCourseInstanceId?: string;
  urlPrefix: string;
  csrfToken: string;
  search: string;
  isDevMode: boolean;
}

export function QuestionsPage({
  questions,
  templateQuestions,
  courseInstances,
  showAddQuestionButton,
  showAiGenerateQuestionButton,
  showSharingSets,
  currentCourseInstanceId,
  urlPrefix,
  csrfToken,
  search,
  isDevMode,
  resLocals,
}: QuestionsPageProps & {
  resLocals: ResLocalsForPage<'course' | 'course-instance'>;
}) {
  return InstructorQuestionsPage({
    questions,
    templateQuestions,
    courseInstances,
    showAddQuestionButton,
    showAiGenerateQuestionButton,
    showSharingSets,
    currentCourseInstanceId,
    urlPrefix,
    csrfToken,
    search,
    isDevMode,
    resLocals,
  });
}
