import { html, unsafeHtml } from '@prairielearn/html';
import { renderHtml } from '@prairielearn/preact';
import { run } from '@prairielearn/run';

import { InstructorInfoPanel } from '../../components/InstructorInfoPanel.js';
import { PageLayout } from '../../components/PageLayout.js';
import { QuestionContainer } from '../../components/QuestionContainer.js';
import { QuestionSyncErrorsAndWarnings } from '../../components/SyncErrorsAndWarnings.js';
import { assetPath, compiledScriptTag, nodeModulesAssetPath } from '../../lib/assets.js';
import { type CopyTarget } from '../../lib/copy-content.js';

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
}: {
  normalPreviewUrl: string;
  manualGradingPreviewEnabled: boolean;
  manualGradingPreviewUrl: string;
  aiGradingPreviewEnabled: boolean;
  aiGradingPreviewUrl?: string;
  renderSubmissionSearchParams: URLSearchParams;
  readmeHtml: string;
  questionCopyTargets: CopyTarget[] | null;
  resLocals: Record<string, any>;
}) {
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
      ${compiledScriptTag('question.ts')}
      <script defer src="${nodeModulesAssetPath('mathjax/es5/startup.js')}"></script>
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
    preContent: html`
      <div class="container-fluid">
        ${renderHtml(
          <QuestionSyncErrorsAndWarnings
            authzData={resLocals.authz_data}
            question={resLocals.question}
            course={resLocals.course}
            urlPrefix={resLocals.urlPrefix}
          />,
        )}
      </div>
    `,
    content: html`
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
