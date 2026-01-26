import { z } from 'zod';

import { html } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/react';
import { Hydrate } from '@prairielearn/react/server';

import { GitHubButton } from '../../components/GitHubButton.js';
import { PageLayout } from '../../components/PageLayout.js';
import {
  StaffCourseInstanceSchema,
  StaffQuestionSchema,
  StaffTagSchema,
  StaffTopicSchema,
} from '../../lib/client/safe-db-types.js';
import { type Tag, type Topic } from '../../lib/db-types.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';
import { encodePath } from '../../lib/uri-util.js';
import { type CourseWithPermissions } from '../../models/course.js';

import { QuestionSettingsCardFooter } from './components/QuestionSettingsCardFooter.js';
import { QuestionSettingsForm } from './components/QuestionSettingsForm.js';
import { QuestionSharing } from './components/QuestionSharing.js';
import { QuestionTestsForm } from './components/QuestionTestsForm.js';
import {
  EditableCourseSchema,
  type SelectedAssessments,
  SelectedAssessmentsSchema,
  type SharingSetRow,
} from './instructorQuestionSettings.types.js';

export function InstructorQuestionSettings({
  resLocals,
  questionTestPath,
  questionTestCsrfToken,
  questionGHLink,
  questionTags,
  qids,
  assessmentsWithQuestion,
  sharingEnabled,
  sharingSetsIn,
  editableCourses,
  infoPath,
  origHash,
  canEdit,
  courseTopics,
  courseTags,
}: {
  resLocals: ResLocalsForPage<'instructor-question'>;
  questionTestPath: string;
  questionTestCsrfToken: string;
  questionGHLink: string | null;
  questionTags: Tag[];
  qids: string[];
  assessmentsWithQuestion: SelectedAssessments[];
  sharingEnabled: boolean;
  sharingSetsIn: SharingSetRow[] | undefined;
  editableCourses: CourseWithPermissions[];
  infoPath: string;
  origHash: string;
  canEdit: boolean;
  courseTopics: Topic[];
  courseTags: Tag[];
}) {
  const courseInstance = StaffCourseInstanceSchema.nullable().parse(resLocals.course_instance);

  const canCopy =
    editableCourses.length > 0 &&
    resLocals.authz_data.has_course_permission_view &&
    resLocals.question.course_id === resLocals.course.id;

  const showFooter = canCopy || canEdit;

  return PageLayout({
    resLocals,
    pageTitle: 'Settings',
    navContext: {
      type: 'instructor',
      page: 'question',
      subPage: 'settings',
    },
    options: {
      pageNote: resLocals.question.qid!,
    },
    content: html`
      <div class="card mb-4">
        <div
          class="card-header bg-primary text-white d-flex align-items-center justify-content-between"
        >
          <h1>Question Settings</h1>
          ${renderHtml(<GitHubButton gitHubLink={questionGHLink} />)}
        </div>
        <div class="card-body">
          ${renderHtml(
            <Hydrate>
              <QuestionSettingsForm
                question={StaffQuestionSchema.parse(resLocals.question)}
                topic={StaffTopicSchema.parse(resLocals.topic)}
                courseTopics={z.array(StaffTopicSchema).parse(courseTopics)}
                courseTags={z.array(StaffTagSchema).parse(courseTags)}
                questionTags={z.array(StaffTagSchema).parse(questionTags)}
                qids={qids}
                origHash={origHash}
                csrfToken={resLocals.__csrf_token}
                canEdit={canEdit}
                courseInstance={courseInstance}
                // eslint-disable-next-line @prairielearn/safe-db-types
                assessmentsWithQuestion={assessmentsWithQuestion}
              />
            </Hydrate>,
          )}
          ${sharingEnabled
            ? html`
                <hr />
                <div>
                  <h2 class="h4">Sharing</h2>
                  <div data-testid="shared-with">
                    ${renderHtml(
                      <QuestionSharing
                        sharePublicly={resLocals.question.share_publicly}
                        shareSourcePublicly={resLocals.question.share_source_publicly}
                        sharingSetsIn={sharingSetsIn ?? []}
                      />,
                    )}
                  </div>
                </div>
              `
            : ''}
          ${resLocals.question.type === 'Freeform' &&
          resLocals.question.grading_method !== 'External' &&
          resLocals.authz_data.has_course_permission_view
            ? html`
                <hr />
                <div>
                  <h2 class="h4">Tests</h2>
                  <div>
                    ${renderHtml(
                      <QuestionTestsForm
                        questionTestPath={questionTestPath}
                        csrfToken={questionTestCsrfToken}
                      />,
                    )}
                  </div>
                </div>
              `
            : ''}
          ${resLocals.authz_data.has_course_permission_view
            ? canEdit
              ? html`
                  <hr />
                  <a
                    data-testid="edit-question-configuration-link"
                    href="${resLocals.urlPrefix}/question/${resLocals.question
                      .id}/file_edit/${encodePath(infoPath)}"
                    >Edit question configuration</a
                  >
                  in <code>info.json</code>
                `
              : html`
                  <hr />
                  <a
                    href="${resLocals.urlPrefix}/question/${resLocals.question
                      .id}/file_view/${encodePath(infoPath)}"
                  >
                    View question configuration
                  </a>
                  in <code>info.json</code>
                `
            : ''}
        </div>
        ${showFooter
          ? renderHtml(
              // TODO: Pass full course/question objects when the whole page is hydrated.
              <Hydrate>
                <QuestionSettingsCardFooter
                  canEdit={canEdit}
                  canCopy={canCopy}
                  editableCourses={z.array(EditableCourseSchema).parse(editableCourses)}
                  courseId={resLocals.course.id}
                  qid={resLocals.question.qid!}
                  assessmentsWithQuestion={z
                    .array(SelectedAssessmentsSchema)
                    .parse(assessmentsWithQuestion)}
                  csrfToken={resLocals.__csrf_token}
                />
              </Hydrate>,
            )
          : ''}
      </div>
    `,
  });
}
