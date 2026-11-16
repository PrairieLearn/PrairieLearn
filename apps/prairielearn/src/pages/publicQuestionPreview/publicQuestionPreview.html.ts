import { compiledScriptTag, compiledStylesheetTag } from '@prairielearn/compiled-assets';
import { html, unsafeHtml } from '@prairielearn/html';

import { InstructorInfoPanel } from '../../components/InstructorInfoPanel.js';
import { PageLayout } from '../../components/PageLayout.js';
import { QuestionContainer } from '../../components/QuestionContainer.js';
import { assetPath, nodeModulesAssetPath } from '../../lib/assets.js';
import type { CopyTarget } from '../../lib/copy-content.js';
import type { UntypedResLocals } from '../../lib/res-locals.types.js';

export function PublicQuestionPreview({
  resLocals,
  independentScrolling,
  questionCopyTargets,
}: {
  independentScrolling: boolean;
  resLocals: UntypedResLocals;
  questionCopyTargets: CopyTarget[] | null;
}) {
  return PageLayout({
    resLocals,
    pageTitle: resLocals.question.qid,
    navContext: {
      type: 'public',
      page: 'public_question',
      subPage: 'preview',
    },
    options: {
      contentContainerClassName: independentScrolling ? 'question-page-layout' : '',
      pageNote: 'Public Preview',
    },
    headContent: html`
      ${independentScrolling ? compiledStylesheetTag('questionLayout.css') : ''}
      <meta
        name="mathjax-fonts-path"
        content="${nodeModulesAssetPath('@mathjax/mathjax-newcm-font')}"
      />
      ${compiledScriptTag('question.ts')}
      <script src="${nodeModulesAssetPath('mathjax/tex-svg.js')}"></script>
      <script>
        document.urlPrefix = '${resLocals.urlPrefix}';
      </script>
      ${
        resLocals.question.type !== 'Freeform'
          ? html`
              <script src="${nodeModulesAssetPath('lodash/lodash.min.js')}"></script>
              <script src="${assetPath('javascripts/require.js')}"></script>
              <script src="${assetPath('localscripts/question.js')}"></script>
              <script src="${assetPath('localscripts/questionCalculation.js')}"></script>
            `
          : ''
      }
      ${unsafeHtml(resLocals.extraHeadersHtml)}
    `,
    content: html`
      <div class="row question-page-row">
        <div
          class="col-lg-9 col-sm-12 question-page-question"
          ${independentScrolling ? html`role="region" aria-label="Question" tabindex="0"` : ''}
        >
          ${QuestionContainer({ resLocals, questionContext: 'public', questionCopyTargets })}
        </div>

        <div
          class="col-lg-3 col-sm-12 question-page-sidebar"
          ${independentScrolling ? html`role="region" aria-label="Question information" tabindex="0"` : ''}
        >
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
            question: resLocals.question,
            variant: resLocals.variant,
            questionContext: 'public',
            authz_data: resLocals.authz_data,
            csrfToken: resLocals.__csrf_token,
          })}
        </div>
      </div>
    `,
  });
}
