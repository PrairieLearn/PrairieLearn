import { html, unsafeHtml } from '@prairielearn/html';

import { BaseHeadContents } from '../../components/HeadContents.js';
import {
  compiledScriptTag,
  compiledStylesheetPath,
  compiledStylesheetTag,
  nodeModulesAssetPath,
} from '../../lib/assets.js';
import type { PaperSize } from '../../lib/printing/pdf-output.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

import {
  DEFAULT_ASSESSMENT_INSTRUCTIONS,
  answerKeyDescription,
  getDefaultHonorCodePledge,
  getPrintCoverFields,
  getPrintFooterLabel,
} from './print-cover.js';

const PAPER_DIMENSIONS = {
  Letter: { width: '8.5in', height: '11in' },
  A4: { width: '210mm', height: '297mm' },
} satisfies Record<PaperSize, { width: string; height: string }>;

export function InstructorAssessmentInstancePrint({
  resLocals,
  document,
  formLabel,
  paperSize,
  includeCoverPage,
  includeGradingTable,
  identityFields,
  questionHtmls,
  omittedQuestionCount = 0,
  warnings = [],
  extraHeadersHtml,
  maxPoints,
  assessmentTextHtml,
  honorCodeHtml,
  includeHonorCode,
}: {
  resLocals: ResLocalsForPage<'assessment-instance'>;
  document: 'assessment' | 'answer_key';
  formLabel?: string;
  paperSize: PaperSize;
  includeCoverPage: boolean;
  includeGradingTable: boolean;
  identityFields: readonly string[];
  questionHtmls: string[];
  omittedQuestionCount?: number;
  warnings?: { code: string; question_number: string; message: string }[];
  extraHeadersHtml: string;
  maxPoints: number;
  assessmentTextHtml: string | null;
  honorCodeHtml: string | null;
  includeHonorCode: boolean;
}) {
  const isAnswerKey = document === 'answer_key';
  const documentLabel = isAnswerKey ? 'Answer key' : resLocals.assessment.type;
  const footerLabel = getPrintFooterLabel({
    document,
    formId: resLocals.assessment_instance.id,
    formLabel,
  });
  const { width: paperWidth, height: paperHeight } = PAPER_DIMENSIONS[paperSize];

  return html`<!doctype html>
    <html
      lang="en"
      data-print-document="${document}"
      data-print-form-label="${formLabel ?? ''}"
      data-print-paper-size="${paperSize}"
      data-print-include-cover="${includeCoverPage}"
      data-print-status="loading"
      data-print-question-count="${questionHtmls.length}"
      data-print-omitted-question-count="${omittedQuestionCount}"
      data-print-warnings="${JSON.stringify(warnings)}"
      data-print-max-points="${maxPoints}"
    >
      <head>
        ${BaseHeadContents({
          resLocals,
          pageTitle: isAnswerKey
            ? `${resLocals.assessment_label} answer key`
            : `${resLocals.assessment_label} printable assessment`,
        })}
        <script>
          document.urlPrefix = '${resLocals.urlPrefix}';
          window.PagedConfig = { auto: false };
          window.__PL_PRINT_READINESS_PROMISES__ = [];
          window.PrairieLearnAssessmentPrinting = {
            waitUntil(promise) {
              void promise.catch(() => undefined);
              window.__PL_PRINT_READINESS_PROMISES__.push(promise);
            },
          };
        </script>
        ${compiledScriptTag('assessment-printing-client.ts')}
        <script src="${nodeModulesAssetPath('pagedjs/dist/paged.polyfill.min.js')}"></script>
        <style>
          :root {
            --assessment-print-page-width: ${paperWidth};
            --assessment-print-page-height: ${paperHeight};
          }

          @page {
            size: ${paperWidth} ${paperHeight};
          }
        </style>
        <link
          rel="stylesheet"
          href="${compiledStylesheetPath('assessment-printing-preview.css')}"
          data-pagedjs-ignore
        />
        <style data-pagedjs-ignore>
          @media print {
            @page {
              size: ${paperSize};
              margin: 0;
            }
          }
        </style>
        ${unsafeHtml(extraHeadersHtml)} ${compiledStylesheetTag('assessment-printing.css')}
        <style>
          @page {
            @bottom-right {
              color: #555;
              content: '${footerLabel}  |  Page ' counter(page) ' of ' counter(pages);
              font-family: system-ui, sans-serif;
              font-size: 8pt;
            }
          }

          @page assessment-cover {
            @bottom-right {
              color: #555;
              content: '${footerLabel}  |  Page ' counter(page) ' of ' counter(pages);
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
        <div id="assessment-print-status" role="status">
          Preparing ${paperSize} ${documentLabel.toLowerCase()} pages…
        </div>
        <div id="assessment-print-source" class="assessment-print-document">
          ${
            includeCoverPage
              ? html`
                  <article class="assessment-cover" aria-label="${documentLabel} cover page">
                    <header class="assessment-cover-header">
                      <div class="assessment-cover-course">${resLocals.course.short_name}</div>
                      <div class="assessment-cover-course-title">
                        ${resLocals.course.title ?? resLocals.course_instance.long_name ?? ''}
                      </div>
                      <h1>${resLocals.assessment_label}</h1>
                      ${
                        resLocals.assessment.title
                          ? html`<div class="assessment-cover-title">
                              ${resLocals.assessment.title}
                            </div>`
                          : ''
                      }
                      ${isAnswerKey ? html`<div class="assessment-cover-document-label">Answer key</div>` : ''}
                    </header>

                    ${
                      isAnswerKey
                        ? ''
                        : html`
                            <div class="assessment-cover-fields">
                              ${getPrintCoverFields({
                                identityFields,
                                teamWork: resLocals.assessment.team_work,
                              }).map(
                                (field) => html`
                                  <div
                                    class="assessment-cover-field${field.wide ? ' assessment-cover-field-wide' : ''}"
                                  >
                                    <span>${field.label}</span>
                                  </div>
                                `,
                              )}
                            </div>
                          `
                    }

                    <dl class="assessment-cover-summary">
                      <div>
                        <dt>Questions</dt>
                        <dd>${questionHtmls.length}</dd>
                      </div>
                      <div>
                        <dt>Points</dt>
                        <dd>${maxPoints}</dd>
                      </div>
                      <div>
                        <dt>${formLabel ? 'Form' : 'Form ID'}</dt>
                        <dd>${formLabel ?? resLocals.assessment_instance.id}</dd>
                      </div>
                    </dl>

                    <section
                      class="assessment-cover-instructions"
                      aria-labelledby="assessment-instructions-heading"
                    >
                      <h2 id="assessment-instructions-heading">
                        ${isAnswerKey ? 'About this answer key' : 'Instructions'}
                      </h2>
                      ${
                        isAnswerKey
                          ? html`<p>
                              ${answerKeyDescription(resLocals.assessment_instance.id, formLabel)}
                            </p>`
                          : html`<ol>
                              ${DEFAULT_ASSESSMENT_INSTRUCTIONS.map((instruction) => html`<li>${instruction}</li>`)}
                            </ol>`
                      }
                      ${
                        assessmentTextHtml
                          ? html`<div class="assessment-cover-custom-instructions">
                              ${unsafeHtml(assessmentTextHtml)}
                            </div>`
                          : ''
                      }
                    </section>

                    ${
                      !isAnswerKey && includeHonorCode
                        ? html`
                            <section
                              class="assessment-cover-honor-code"
                              aria-labelledby="honor-code-heading"
                            >
                              <h2 id="honor-code-heading">Academic integrity pledge</h2>
                              ${
                                honorCodeHtml
                                  ? unsafeHtml(honorCodeHtml)
                                  : html`<ul>
                                      ${getDefaultHonorCodePledge(
                                        resLocals.assessment.team_work,
                                      ).map((item) => html`<li>${item}</li>`)}
                                    </ul>`
                              }
                              <div class="assessment-cover-signature"><span>Signature</span></div>
                            </section>
                          `
                        : ''
                    }
                    ${
                      !isAnswerKey && includeGradingTable
                        ? html`
                            <section
                              class="assessment-grading-table"
                              aria-label="Grading table"
                              hidden
                            >
                              <h2>Grading</h2>
                              <div class="assessment-grading-grid"></div>
                            </section>
                          `
                        : ''
                    }

                    <footer>
                      ${resLocals.course_instance.long_name ?? resLocals.course_instance.short_name}
                      <span
                        >${getPrintFooterLabel({
                          document: 'assessment',
                          formId: resLocals.assessment_instance.id,
                          formLabel,
                        })}</span
                      >
                    </footer>
                  </article>
                `
              : ''
          }

          <div class="assessment-questions">
            ${questionHtmls.map((questionHtml) => unsafeHtml(questionHtml))}
          </div>
        </div>
        <main id="assessment-print-pages"></main>
        <noscript>This printable assessment requires JavaScript to to prepare its layout.</noscript>
      </body>
    </html>`;
}
