import { type HtmlSafeString, html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/react';
import { Hydrate, hydrateHtml } from '@prairielearn/react/server';

import { CreateQuestionModalContents } from '../../components/CreateQuestionModalContents.js';
import { Modal } from '../../components/Modal.js';
import { PageLayout } from '../../components/PageLayout.js';
import { type QuestionsPageData } from '../../components/QuestionsTable.shared.js';
import { type CourseInstance } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

import { InstructorQuestionsTable } from './InstructorQuestionsTable.js';

export interface InstructorQuestionsPageProps {
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
  resLocals: ResLocalsForPage<'course' | 'course-instance'>;
}

export function InstructorQuestionsPage({
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
}: InstructorQuestionsPageProps) {
  // Map course instances to the simpler format expected by the table
  const mappedCourseInstances = courseInstances.map((ci) => ({
    id: ci.id,
    short_name: ci.short_name ?? '',
  }));

  const tableContent = renderHtml(
    <Hydrate fullHeight>
      <InstructorQuestionsTable
        questions={questions}
        courseInstances={mappedCourseInstances}
        currentCourseInstanceId={currentCourseInstanceId}
        showAddQuestionButton={showAddQuestionButton}
        showAiGenerateQuestionButton={showAiGenerateQuestionButton}
        showSharingSets={showSharingSets}
        urlPrefix={urlPrefix}
        search={search}
        isDevMode={isDevMode}
      />
    </Hydrate>,
  );

  const content: HtmlSafeString[] = [];

  if (showAddQuestionButton) {
    content.push(
      CreateQuestionModal({
        csrfToken,
        templateQuestions,
      }),
    );
  }
  content.push(tableContent);

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
      fullHeight: true,
    },
    content,
  });
}

function CreateQuestionModal({
  csrfToken,
  templateQuestions,
}: {
  csrfToken: string;
  templateQuestions: { example_course: boolean; qid: string; title: string }[];
}) {
  return Modal({
    id: 'createQuestionModal',
    title: 'Create question',
    formMethod: 'POST',
    body: hydrateHtml(<CreateQuestionModalContents templateQuestions={templateQuestions} />),
    footer: html`
      <input type="hidden" name="__action" value="add_question" />
      <input type="hidden" name="__csrf_token" value="${csrfToken}" />
      <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
      <button type="submit" class="btn btn-primary">Create</button>
    `,
  });
}
