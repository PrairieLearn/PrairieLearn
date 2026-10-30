import type { StatusMessageSubmission } from '../externalGradingSocket.types.js';
import type { SubmissionPanels } from '../question-render.types.js';

/** Content that belongs in the question document, including authored HTML and scripts. */
export type QuestionContentPanels = Pick<
  SubmissionPanels,
  'submissionPanel' | 'extraHeadersHtml' | 'answerPanel' | 'questionPanelFooter'
>;

/**
 * Application operations available to a single question view. The implementation
 * owns endpoints and credentials; callers only identify actions within that view.
 * Native form submission remains separate until the iframe transport is introduced.
 */
export interface QuestionBrowserServices {
  renderSubmission(
    request: { submissionId: string; purpose: 'history' | 'grading-result' },
    options: { signal: AbortSignal },
  ): Promise<QuestionContentPanels>;

  subscribeToGradingStatus(listener: (submissions: StatusMessageSubmission[]) => void): () => void;
}
