import { html, unsafeHtml } from '@prairielearn/html';

import { BaseHeadContents } from '../../components/HeadContents.js';
import {
  compiledScriptTag,
  compiledStylesheetPath,
  compiledStylesheetTag,
  nodeModulesAssetPath,
} from '../../lib/assets.js';
import { getDefaultHonorCodePledge } from '../../lib/honor-code.js';
import { PAPER_DIMENSIONS, type PaperSize } from '../../lib/printing/paper-size.js';
import {
  BLANK_NAME_PLACEHOLDER,
  DEFAULT_ASSESSMENT_INSTRUCTIONS,
  HONOR_CODE_HEADING,
  PRINT_FOOTER_SEPARATOR,
  answerKeyDescription,
  getPrintCoverFields,
  getPrintFooter,
} from '../../lib/printing/print-cover.js';
import type { ResLocalsForPage } from '../../lib/res-locals.js';

function cssContent(value: string) {
  // Keep nonbreaking footer spaces while escaping CSS and HTML delimiters in the style tag.
  return unsafeHtml(
    JSON.stringify(value.replaceAll(/[ \t\r\n\f]+/g, ' '))
      .replaceAll('<', '\\3c ')
      .replaceAll('>', '\\3e ')
      .replaceAll('&', '\\26 '),
  );
}

export function InstructorAssessmentPrintForm({
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
  resLocals: ResLocalsForPage<'print-form'>;
  document: 'assessment' | 'answer_key';
  formLabel: string;
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
  const footer = getPrintFooter({
    resLocals,
    document,
    formLabel,
  });
  const { width: paperWidth, height: paperHeight } = PAPER_DIMENSIONS[paperSize];

  return html`<!doctype html>
    <html
      lang="en"
      data-print-form-id="${resLocals.print_form.id}"
      data-print-document="${document}"
      data-print-form-label="${formLabel}"
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
            : `${resLocals.assessment_label} student copy`,
        })}
        <meta name="referrer" content="no-referrer" />
        <script>
          document.urlPrefix = '${resLocals.urlPrefix}';
          window.PagedConfig = { auto: false };
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
              size: ${paperWidth} ${paperHeight};
              margin: 0;
            }
          }
        </style>
        ${unsafeHtml(extraHeadersHtml)} ${compiledStylesheetTag('assessment-printing.css')}
        <style>
          @page {
            @bottom-left {
              color: #555;
              content: ${cssContent(footer.left)};
              font-family: system-ui, sans-serif;
              font-size: 8pt;
            }

            @bottom-center {
              color: #555;
              content: ${cssContent(footer.center)};
              font-family: system-ui, sans-serif;
              font-size: 8pt;
            }

            @bottom-right {
              color: #555;
              content: ${cssContent(`${footer.right}${PRINT_FOOTER_SEPARATOR}Page `)} counter(page)
                ' of ' counter(pages);
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
                        <dd data-print-cover-question-count>${questionHtmls.length}</dd>
                      </div>
                      <div>
                        <dt>Points</dt>
                        <dd data-print-cover-max-points>${maxPoints}</dd>
                      </div>
                      <div>
                        <dt>Form</dt>
                        <dd>${formLabel}</dd>
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
                          ? html`<p>${answerKeyDescription(formLabel)}</p>`
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
                              <h2 id="honor-code-heading">${HONOR_CODE_HEADING}</h2>
                              ${
                                honorCodeHtml
                                  ? unsafeHtml(honorCodeHtml)
                                  : html`<ul>
                                      ${getDefaultHonorCodePledge({
                                        name: BLANK_NAME_PLACEHOLDER,
                                        groupWork: resLocals.assessment.team_work,
                                      }).map((item) => html`<li>${item}</li>`)}
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
                  </article>
                `
              : ''
          }

          <div class="assessment-questions">
            ${questionHtmls.map((questionHtml) => unsafeHtml(questionHtml))}
          </div>
        </div>
        <main id="assessment-print-pages"></main>
      </body>
    </html>`;
}

/** A preview that failed as a whole, in the form the preparation page reads from its iframe. */
export function InstructorAssessmentPrintFormError({ message }: { message: string }) {
  return html`<!doctype html>
    <html lang="en" data-print-status="error" data-print-error="${message}">
      <head>
        <meta charset="utf-8" />
        <title>Print preview error</title>
      </head>
      <body>
        <p>${message}</p>
      </body>
    </html>`;
}
