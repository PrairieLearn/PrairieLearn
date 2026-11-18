import { EncodedData } from '@prairielearn/browser-utils';

import type { QuestionBrowserServicesData as ServicesData } from '../lib/client/question-browser-services.types.js';
import type { UntypedResLocals } from '../lib/res-locals.types.js';

import type { QuestionContext } from './QuestionContainer.types.js';
import { type SubmissionForRender, getSubmissionRenderUrl } from './SubmissionPanel.js';

export function QuestionBrowserServicesData({
  resLocals,
  questionContext,
  renderSubmissionSearchParams,
  manualGradingPreviewUrl,
  aiGradingPreviewUrl,
}: {
  resLocals: UntypedResLocals;
  questionContext: QuestionContext;
  renderSubmissionSearchParams?: URLSearchParams;
  manualGradingPreviewUrl?: string;
  aiGradingPreviewUrl?: string;
}) {
  return EncodedData<ServicesData>(
    {
      variantId: resLocals.variant.id,
      variantToken: resLocals.variantToken,
      csrfToken: resLocals.__csrf_token,
      submissionRenderUrls:
        resLocals.question.type === 'Freeform'
          ? resLocals.submissions.map((submission: SubmissionForRender) => [
              submission.id,
              getSubmissionRenderUrl({
                questionHostingUpdate: true,
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
      navigationUrls: {
        'new-variant': resLocals.newVariantUrl,
        'try-again': resLocals.tryAgainUrl,
        'manual-grading-preview': manualGradingPreviewUrl,
        'ai-grading-preview': aiGradingPreviewUrl,
      },
    },
    'question-browser-services-data',
  );
}
