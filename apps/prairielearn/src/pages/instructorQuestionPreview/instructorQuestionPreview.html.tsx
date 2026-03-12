import assert from 'node:assert';

import { html, unsafeHtml } from '@prairielearn/html';
import { run } from '@prairielearn/run';

import { AssessmentQuestionConfigPanel } from '../../components/AssessmentQuestionConfigPanel.js';
import { BreadcrumbsHtml } from '../../components/Breadcrumbs.js';
import { InstructorInfoPanel } from '../../components/InstructorInfoPanel.js';
import { PageLayout } from '../../components/PageLayout.js';
import { QuestionContainer } from '../../components/QuestionContainer.js';
import type {
  AssessmentQuestionContext,
  NavQuestion,
} from '../../lib/assessment-question-context.js';
import { assetPath, compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';
import { type CopyTarget } from '../../lib/copy-content.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export function InstructorQuestionPreview({
  normalPreviewUrl,
  manualGradingPreviewEnabled,
  manualGradingPreviewUrl,
  aiGradingPreviewEnabled,
  aiGradingPreviewUrl,
  renderSubmissionSearchParams,
  readmeHtml,
  questionCopyTargets,
  resLocals,
  assessmentQuestionContext,
  prevQuestion,
  nextQuestion,
}: {
  normalPreviewUrl: string;
  manualGradingPreviewEnabled: boolean;
  manualGradingPreviewUrl: string;
  aiGradingPreviewEnabled: boolean;
  aiGradingPreviewUrl?: string;
  renderSubmissionSearchParams: URLSearchParams;
  readmeHtml: string;
  questionCopyTargets: CopyTarget[] | null;
  resLocals: ResLocalsForPage<'instructor-question'>;
  assessmentQuestionContext: AssessmentQuestionContext | null;
  prevQuestion: NavQuestion | null;
  nextQuestion: NavQuestion | null;
}) {
  assert(resLocals.question.qid !== null);

  return PageLayout({
    resLocals,
    pageTitle: 'Question Preview',
    navContext: {
      type: 'instructor',
      page: 'question',
      subPage: 'preview',
    },
    options: {
      pageNote: resLocals.question.qid,
    },
    headContent: html`
      <meta
        name="mathjax-fonts-path"
        content="${nodeModulesAssetPath('@mathjax/mathjax-newcm-font')}"
      />
      ${compiledScriptTag('question.ts')}
      <script defer src="${nodeModulesAssetPath('mathjax/tex-svg.js')}"></script>
      <script>
        document.urlPrefix = '${resLocals.urlPrefix}';
      </script>
      ${resLocals.question.type !== 'Freeform'
        ? html`
            <script src="${nodeModulesAssetPath('lodash/lodash.min.js')}"></script>
            <script src="${assetPath('javascripts/require.js')}"></script>
            <script src="${assetPath('localscripts/question.js')}"></script>
            <script src="${assetPath('localscripts/questionCalculation.js')}"></script>
          `
        : ''}
      ${unsafeHtml(resLocals.extraHeadersHtml)}
      <style>
        .markdown-body :last-child {
          margin-bottom: 0;
        }

        .reveal-fade {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          height: 6rem;
          background: linear-gradient(to bottom, transparent, var(--bs-light));
          pointer-events: none;
        }

        .max-height {
          max-height: 150px;
        }
      </style>
    `,
    content: html`
      ${assessmentQuestionContext
        ? html`
            <div class="d-flex align-items-center mb-3">
              ${BreadcrumbsHtml({
                items: [
                  {
                    label: 'Questions',
                    href: `${resLocals.urlPrefix}/assessment/${assessmentQuestionContext.assessment.id}/questions`,
                  },
                  ...(assessmentQuestionContext.zone_title
                    ? [{ label: assessmentQuestionContext.zone_title }]
                    : []),
                  {
                    label: `${assessmentQuestionContext.number_in_alternative_group}: ${resLocals.question.title}`,
                  },
                ],
              })}

              <div class="ms-auto d-flex align-items-center gap-1">
                ${prevQuestion
                  ? html`
                      <a
                        href="${resLocals.urlPrefix}/question/${prevQuestion.question_id}/preview?assessment_question_id=${prevQuestion.id}"
                        class="btn btn-sm btn-outline-primary"
                        aria-label="Previous question"
                        data-bs-toggle="tooltip"
                        title="${prevQuestion.question_number}: ${prevQuestion.question_title}"
                      >
                        <i class="bi bi-chevron-left"></i>
                      </a>
                    `
                  : html`
                      <button
                        class="btn btn-sm btn-outline-primary"
                        disabled
                        aria-label="Previous question"
                      >
                        <i class="bi bi-chevron-left"></i>
                      </button>
                    `}
                ${nextQuestion
                  ? html`
                      <a
                        href="${resLocals.urlPrefix}/question/${nextQuestion.question_id}/preview?assessment_question_id=${nextQuestion.id}"
                        class="btn btn-sm btn-outline-primary"
                        aria-label="Next question"
                        data-bs-toggle="tooltip"
                        title="${nextQuestion.question_number}: ${nextQuestion.question_title}"
                      >
                        <i class="bi bi-chevron-right"></i>
                      </a>
                    `
                  : html`
                      <button
                        class="btn btn-sm btn-outline-primary"
                        disabled
                        aria-label="Next question"
                      >
                        <i class="bi bi-chevron-right"></i>
                      </button>
                    `}
              </div>
            </div>
          `
        : ''}
      ${manualGradingPreviewEnabled
        ? html`
            <div class="alert alert-primary">
              You are viewing this question as it will appear in the manual grading interface.
              <a href="${normalPreviewUrl}" class="alert-link">Return to the normal view</a> when
              you are done.
            </div>
          `
        : ''}
      ${aiGradingPreviewEnabled
        ? html`
            <div class="alert alert-primary">
              You are viewing this question as it will appear to the AI grader.
              <a href="${normalPreviewUrl}" class="alert-link">Return to the normal view</a> when
              you are done.
            </div>
          `
        : ''}
      <div class="row">
        <div class="col-lg-9 col-sm-12">
          ${readmeHtml
            ? html`
                <div class="card mb-3 js-readme-card overflow-hidden">
                  <div class="card-header d-flex align-items-center collapsible-card-header">
                    <h2 class="me-auto">
                      README <span class="small text-muted">(not visible to students)</span>
                    </h2>
                    <button
                      type="button"
                      class="expand-icon-container btn btn-outline-dark btn-sm text-nowrap"
                      data-bs-toggle="collapse"
                      data-bs-target="#readme-card-body"
                      aria-expanded="true"
                      aria-controls="#readme-card-body"
                    >
                      <i class="fa fa-angle-up ms-1 expand-icon"></i>
                    </button>
                  </div>
                  <div class="show js-collapsible-card-body" id="readme-card-body">
                    <div
                      class="card-body position-relative markdown-body overflow-hidden max-height"
                    >
                      ${unsafeHtml(readmeHtml)}
                    </div>
                    <div class="reveal-fade d-none"></div>
                    <div
                      class="py-1 z-1 position-relative d-none justify-content-center bg-light js-expand-button-container"
                    >
                      <button type="button" class="btn btn-sm btn-link">Expand</button>
                    </div>
                  </div>
                </div>
              `
            : ''}
          ${QuestionContainer({
            resLocals,
            showFooter: manualGradingPreviewEnabled || aiGradingPreviewEnabled ? false : undefined,
            questionContext: 'instructor',
            questionRenderContext: run(() => {
              if (manualGradingPreviewEnabled) return 'manual_grading';
              if (aiGradingPreviewEnabled) return 'ai_grading';
              return undefined;
            }),
            manualGradingPreviewUrl: manualGradingPreviewEnabled
              ? undefined
              : manualGradingPreviewUrl,
            aiGradingPreviewUrl: aiGradingPreviewEnabled ? undefined : aiGradingPreviewUrl,
            renderSubmissionSearchParams,
            questionCopyTargets,
          })}
        </div>

        <div class="col-lg-3 col-sm-12">
          ${!assessmentQuestionContext
            ? html`
                <div class="card mb-3">
                  <div class="card-header bg-secondary text-white">
                    <h2>Student view placeholder</h2>
                  </div>
                  <div class="card-body">
                    <div class="d-flex justify-content-center">
                      In student views this area is used for assessment and score info.
                    </div>
                  </div>
                </div>
              `
            : ''}
          ${assessmentQuestionContext
            ? AssessmentQuestionConfigPanel({
                assessment_question: assessmentQuestionContext.assessment_question,
                assessment: assessmentQuestionContext.assessment,
                numberInAlternativeGroup: assessmentQuestionContext.number_in_alternative_group,
              })
            : ''}
          ${InstructorInfoPanel({
            course: resLocals.course,
            course_instance: resLocals.course_instance,
            question: resLocals.question,
            variant: resLocals.variant,
            authz_data: resLocals.authz_data,
            question_is_shared: resLocals.question_is_shared,
            questionContext: 'instructor',
            csrfToken: resLocals.__csrf_token,
          })}
        </div>
      </div>
    `,
  });
}
