import { generateSignedToken } from '@prairielearn/signed-token';

import type { UnsavedSubmissionForAssessment } from '../models/unsaved-submission.js';
import { UnsavedSubmissionPreview } from '../pages/instructorAssessmentInstance/unsavedSubmissionPreview.html.js';
import * as questionServers from '../question-servers/index.js';

import { config } from './config.js';
import type { Course, Submission } from './db-types.js';
import { writeCourseIssues } from './issues.js';
import { getQuestionCourse } from './question-variant.js';
import type { ResLocalsForPage } from './res-locals.js';

export async function parseUnsavedSubmissionForPreview({
  draftData,
  course,
  authnUserId,
}: {
  draftData: UnsavedSubmissionForAssessment;
  course: Course;
  authnUserId: string;
}) {
  const { unsaved_submission: draft, question } = draftData;
  // Parsing can change variant data; a preview must not change the saved variant.
  const variant = structuredClone(draftData.variant);
  const rawAnswer = structuredClone(draft.raw_submitted_answer);
  const questionCourse = await getQuestionCourse(question, course);
  const questionModule = questionServers.getModule(question.type);
  const caller = {
    userId: variant.user_id,
    groupId: variant.team_id,
    variantCourse: course,
    unsavedSubmissionUserId: draft.user_id,
  };
  const { courseIssues, data } = await questionModule.parse(
    { submitted_answer: rawAnswer, raw_submitted_answer: rawAnswer },
    variant,
    question,
    questionCourse,
    caller,
  );
  const submission: Submission = {
    auth_user_id: authnUserId,
    broken: courseIssues.some((issue) => issue.fatal),
    client_fingerprint_id: null,
    correct: null,
    credit: draft.credit,
    date: draft.updated_at,
    duration: null,
    feedback: data.feedback,
    format_errors: data.format_errors,
    gradable: data.gradable,
    graded_at: null,
    grading_requested_at: null,
    id: draft.id,
    is_ai_graded: false,
    manual_rubric_grading_id: null,
    mode: null,
    modified_at: draft.updated_at,
    override_score: null,
    params: data.params,
    partial_scores: null,
    raw_submitted_answer: data.raw_submitted_answer,
    recovered_from_user_id: draft.user_id,
    regradable: false,
    score: null,
    submitted_answer: data.submitted_answer,
    true_answer: data.true_answer,
    v2_score: null,
    variant_id: variant.id,
  };
  variant.params = data.params;
  variant.true_answer = data.true_answer;
  await writeCourseIssues(
    courseIssues,
    variant,
    draft.user_id,
    authnUserId,
    'Error parsing unsaved submission preview',
    { variant, question, submission, course },
  );
  return { variant, submission, questionCourse, caller };
}

export async function renderUnsavedSubmissionPreview({
  draftData,
  locals,
}: {
  draftData: UnsavedSubmissionForAssessment;
  locals: ResLocalsForPage<'assessment-instance'>;
}) {
  const { question, unsaved_submission: draft } = draftData;
  if (draftData.variant.broken_at !== null) {
    return UnsavedSubmissionPreview({
      resLocals: locals,
      question,
      preview: { rawSubmittedAnswer: draft.raw_submitted_answer },
    });
  }
  const { variant, submission, questionCourse, caller } = await parseUnsavedSubmissionForPreview({
    draftData,
    course: locals.course,
    authnUserId: locals.authn_user.id,
  });
  // The sandbox has an opaque origin, so resource requests cannot use staff cookies.
  const token = generateSignedToken(
    {
      type: 'unsaved-submission-preview',
      unsaved_submission_id: draft.id,
      assessment_id: locals.assessment.id,
      course_id: locals.course.id,
      course_instance_id: locals.course_instance.id,
      variant_id: variant.id,
      authn_user_id: locals.authn_user.id,
      revision: draftData.revision,
    },
    config.secretKey,
  );
  const previewUrl = `/pl/unsaved_submission_preview/${draft.id}/${token}`;
  const urls = {
    questionUrl: `${previewUrl}/`,
    baseUrl: previewUrl,
    clientFilesQuestionUrl: `${previewUrl}/clientFilesQuestion`,
    clientFilesCourseUrl: `${previewUrl}/clientFilesCourse`,
    clientFilesQuestionGeneratedFileUrl: `${previewUrl}/generatedFilesQuestion/variant/${variant.id}`,
    calculationQuestionFileUrl: `${previewUrl}/file`,
    calculationQuestionGeneratedFileUrl: `${previewUrl}/generatedFilesQuestion/variant/${variant.id}`,
    workspaceUrl: undefined,
    externalImageCaptureUrl: null,
  };
  const { courseIssues, data } = await questionServers.getModule(question.type).render({
    renderSelection: { question: true, answer: true, submissions: true },
    variant,
    question,
    submission,
    submissions: [submission],
    course: questionCourse,
    locals: {
      ...urls,
      urlPrefix: previewUrl,
      showCorrectAnswer: true,
      allowAnswerEditing: false,
    },
    caller,
  });
  await writeCourseIssues(
    courseIssues,
    variant,
    draft.user_id,
    locals.authn_user.id,
    'Error rendering unsaved submission preview',
    { variant, question, submission, course: locals.course },
  );
  const questionJsonBase64 =
    question.type === 'Freeform'
      ? undefined
      : Buffer.from(
          encodeURIComponent(
            JSON.stringify({
              questionFilePath: urls.calculationQuestionFileUrl,
              questionGeneratedFilePath: urls.calculationQuestionGeneratedFileUrl,
              effectiveQuestionType: 'Calculation',
              variant: { id: variant.id, params: variant.params },
              submittedAnswer: submission.submitted_answer,
              feedback: submission.feedback,
              trueAnswer: variant.true_answer,
              submissions: [submission],
            }),
          ),
        ).toString('base64');
  return UnsavedSubmissionPreview({
    resLocals: locals,
    question,
    preview: { rendered: data, questionJsonBase64, urlPrefix: previewUrl },
  });
}
