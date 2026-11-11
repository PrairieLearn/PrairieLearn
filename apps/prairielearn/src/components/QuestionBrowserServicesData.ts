import { EncodedData } from '@prairielearn/browser-utils';

import type { QuestionBrowserServicesData as ServicesData } from '../lib/client/question-browser-services.types.js';
import type { UntypedResLocals } from '../lib/res-locals.types.js';

import type { QuestionContext } from './QuestionContainer.types.js';
import { type SubmissionForRender, getSubmissionRenderUrl } from './SubmissionPanel.js';

export function QuestionBrowserServicesData({
  resLocals,
  questionContext,
  renderSubmissionSearchParams,
}: {
  resLocals: UntypedResLocals;
  questionContext: QuestionContext;
  renderSubmissionSearchParams?: URLSearchParams;
}) {
  return EncodedData<ServicesData>(
    {
      variantId: resLocals.variant.id,
      variantToken: resLocals.variantToken,
      submissionRenderUrls:
        resLocals.question.type === 'Freeform'
          ? resLocals.submissions.map((submission: SubmissionForRender) => [
              submission.id,
              getSubmissionRenderUrl({
                questionContext,
                urlPrefix: resLocals.urlPrefix,
                question: resLocals.question,
                assessment_question: resLocals.assessment_question,
                instance_question: resLocals.instance_question,
                variant_id: resLocals.variant.id,
                submissionId: submission.id,
                renderSubmissionSearchParams,
              }),
            ])
          : [],
    },
    'question-browser-services-data',
  );
}
