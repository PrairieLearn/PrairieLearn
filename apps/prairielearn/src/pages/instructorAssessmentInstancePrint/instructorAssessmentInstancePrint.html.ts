import { html, unsafeHtml } from '@prairielearn/html';
import type { PaperSize } from '@prairielearn/printing';

import { HeadContents } from '../../components/HeadContents.js';
import {
  assetPath,
  compiledScriptTag,
  compiledStylesheetTag,
  nodeModulesAssetPath,
} from '../../lib/assets.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

export function InstructorAssessmentInstancePrint({
  resLocals,
  document,
  paperSize,
  identityFields,
  questionHtmls,
  extraHeadersHtml,
  hasLegacyQuestions,
  maxPoints,
  assessmentTextHtml,
  honorCodeHtml,
}: {
  resLocals: ResLocalsForPage<'assessment-instance'>;
  document: 'exam' | 'answer_key';
  paperSize: PaperSize;
  identityFields: readonly string[];
  questionHtmls: string[];
  extraHeadersHtml: string;
  hasLegacyQuestions: boolean;
  maxPoints: number;
  assessmentTextHtml: string | null;
  honorCodeHtml: string | null;
}) {
  const isAnswerKey = document === 'answer_key';
  const documentLabel = isAnswerKey ? 'Answer key' : 'Exam';
  const pageFooterPrefix = isAnswerKey ? 'Answer key  |  ' : '';

  return html`<!doctype html>
    <html
      lang="en"
      data-print-document="${document}"
      data-print-paper-size="${paperSize}"
      data-print-status="loading"
    >
      <head>
        ${HeadContents({
          resLocals,
          pageTitle: isAnswerKey
            ? `${resLocals.assessment_label} answer key`
            : `${resLocals.assessment_label} printable exam`,
        })}
        <script>
          document.urlPrefix = '${resLocals.urlPrefix}';
          window.PagedConfig = { auto: false };
          window.__PL_PRINT_READINESS_PROMISES__ = [];
          window.PrairieLearnExamPrinting = {
            waitUntil(promise) {
              void promise.catch(() => undefined);
              window.__PL_PRINT_READINESS_PROMISES__.push(promise);
            },
          };
        </script>
        ${compiledScriptTag('examPrintingClient.ts')}
        <script src="${nodeModulesAssetPath('pagedjs/dist/paged.polyfill.min.js')}"></script>
        <style>
          @page {
            size: ${paperSize};
          }
        </style>
        <style data-pagedjs-ignore>
          #exam-print-status {
            background: #fff;
            border: 1px solid #bbb;
            border-radius: 0.25rem;
            box-shadow: 0 0.25rem 1rem rgb(0 0 0 / 12%);
            left: 50%;
            padding: 0.65rem 1rem;
            position: fixed;
            top: 1rem;
            transform: translateX(-50%);
            z-index: 1000;
          }

          html[data-print-status='ready'] #exam-print-status {
            display: none;
          }

          html[data-print-status='error'] #exam-print-status {
            background: #f8d7da;
            border-color: #842029;
            color: #842029;
          }

          @media screen {
            html,
            body {
              background: #e7eaee;
              margin: 0;
            }

            #exam-print-pages {
              overflow-x: auto;
            }

            #exam-print-pages .pagedjs_pages {
              align-items: center;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              gap: 1.25rem;
              min-width: 100%;
              padding: 1.75rem 0;
              width: max-content;
            }

            #exam-print-pages .pagedjs_page {
              background: #fff;
              box-shadow: 0 0.25rem 1.25rem rgb(0 0 0 / 18%);
              margin: 0;
            }
          }

          @media print {
            @page {
              size: ${paperSize};
              margin: 0;
            }

            html,
            body {
              margin: 0 !important;
              padding: 0 !important;
            }

            #exam-print-status {
              display: none !important;
            }

            #exam-print-pages .pagedjs_pages {
              display: block !important;
            }

            #exam-print-pages .pagedjs_page {
              break-after: page;
              box-shadow: none !important;
              margin: 0 !important;
            }

            #exam-print-pages .exam-cover {
              break-after: auto !important;
              page: auto !important;
            }

            #exam-print-pages .pagedjs_page:last-child {
              break-after: auto;
            }
          }
        </style>
        ${hasLegacyQuestions
          ? html`
              <script src="${nodeModulesAssetPath('lodash/lodash.min.js')}"></script>
              <script src="${assetPath('javascripts/require.js')}"></script>
              <script src="${assetPath('localscripts/question.js')}"></script>
              <script src="${assetPath('localscripts/questionCalculation.js')}"></script>
            `
          : ''}
        ${unsafeHtml(extraHeadersHtml)} ${compiledStylesheetTag('examPrinting.css')}
        <style>
          @page {
            @bottom-right {
              color: #555;
              content: '${pageFooterPrefix}Form ID ${resLocals.assessment_instance.id}  |  Page '
                counter(page) ' of ' counter(pages);
              font-family: system-ui, sans-serif;
              font-size: 8pt;
            }
          }

          @page exam-cover {
            @bottom-right {
              color: #555;
              content: '${pageFooterPrefix}Form ID ${resLocals.assessment_instance.id}  |  Page '
                counter(page) ' of ' counter(pages);
              font-family: system-ui, sans-serif;
              font-size: 8pt;
            }
          }
        </style>
        <script defer src="${nodeModulesAssetPath('mathjax/tex-svg.js')}"></script>
        <meta
          name="mathjax-fonts-path"
          content="${nodeModulesAssetPath('@mathjax/mathjax-newcm-font')}"
        />
        ${compiledScriptTag('question.ts')}
      </head>
      <body>
        <div id="exam-print-status" role="status">
          Preparing ${paperSize} ${documentLabel.toLowerCase()} pages…
        </div>
        <main id="exam-print-source" class="exam-print-document">
          <article class="exam-cover" aria-label="${documentLabel} cover page">
            <header class="exam-cover-header">
              <div class="exam-cover-course">${resLocals.course.short_name}</div>
              <div class="exam-cover-course-title">
                ${resLocals.course.title ?? resLocals.course_instance.long_name ?? ''}
              </div>
              <h1>${resLocals.assessment_label}</h1>
              ${resLocals.assessment.title
                ? html`<div class="exam-cover-title">${resLocals.assessment.title}</div>`
                : ''}
              ${isAnswerKey ? html`<div class="exam-cover-document-label">Answer key</div>` : ''}
            </header>

            ${isAnswerKey
              ? ''
              : html`
                  <div class="exam-cover-fields">
                    <div class="exam-cover-field exam-cover-field-wide"><span>Name</span></div>
                    ${identityFields.map(
                      (identityField) => html`
                        <div class="exam-cover-field"><span>${identityField}</span></div>
                      `,
                    )}
                    ${resLocals.assessment.team_work
                      ? html`
                          <div class="exam-cover-field"><span>Team</span></div>
                          <div class="exam-cover-field"><span>Date</span></div>
                        `
                      : html`<div
                          class="exam-cover-field${identityFields.length === 0
                            ? ' exam-cover-field-wide'
                            : ''}"
                        >
                          <span>Date</span>
                        </div>`}
                  </div>
                `}

            <dl class="exam-cover-summary">
              <div>
                <dt>Questions</dt>
                <dd>${questionHtmls.length}</dd>
              </div>
              <div>
                <dt>Points</dt>
                <dd>${maxPoints}</dd>
              </div>
              <div>
                <dt>Paper</dt>
                <dd>${paperSize}</dd>
              </div>
              <div>
                <dt>Form ID</dt>
                <dd>${resLocals.assessment_instance.id}</dd>
              </div>
            </dl>

            <section class="exam-cover-instructions" aria-labelledby="exam-instructions-heading">
              <h2 id="exam-instructions-heading">
                ${isAnswerKey ? 'About this answer key' : 'Instructions'}
              </h2>
              ${isAnswerKey
                ? html`<p>
                    Correct answers are shown with the questions for assessment Form ID
                    ${resLocals.assessment_instance.id}.
                  </p>`
                : html`<ol>
                    <li>Write your name and identifying information clearly above.</li>
                    <li>Show your work and place each final answer in the space provided.</li>
                    <li>
                      If you need more room, identify the question number on any additional page.
                    </li>
                  </ol>`}
              ${assessmentTextHtml
                ? html`<div class="exam-cover-custom-instructions">
                    ${unsafeHtml(assessmentTextHtml)}
                  </div>`
                : ''}
            </section>

            ${!isAnswerKey && resLocals.assessment.require_honor_code
              ? html`
                  <section class="exam-cover-honor-code" aria-labelledby="honor-code-heading">
                    <h2 id="honor-code-heading">Academic integrity pledge</h2>
                    ${honorCodeHtml
                      ? unsafeHtml(honorCodeHtml)
                      : html`<ul>
                          <li>
                            I certify that I am ____________________________ and
                            ${resLocals.assessment.team_work ? 'our group is' : 'I am'} allowed to
                            take this assessment.
                          </li>
                          <li>
                            ${resLocals.assessment.team_work ? 'We' : 'I'} pledge on
                            ${resLocals.assessment.team_work ? 'our' : 'my'} honor that
                            ${resLocals.assessment.team_work ? 'we' : 'I'} will not give or receive
                            any unauthorized assistance on this assessment and that all work will be
                            ${resLocals.assessment.team_work ? 'our' : 'my'} own.
                          </li>
                        </ul>`}
                    <div class="exam-cover-signature"><span>Signature</span></div>
                  </section>
                `
              : ''}

            <footer>
              ${resLocals.course_instance.long_name ?? resLocals.course_instance.short_name}
              <span>Form ID ${resLocals.assessment_instance.id}</span>
            </footer>
          </article>

          <div class="exam-questions">
            ${questionHtmls.length > 0
              ? questionHtmls.map((questionHtml) => unsafeHtml(questionHtml))
              : html`<section class="printing-question printing-question-empty">
                  This exam contains no questions.
                </section>`}
          </div>
        </main>
        <div id="exam-print-pages"></div>
        <noscript>This printable exam requires JavaScript to paginate its pages.</noscript>
      </body>
    </html>`;
}
