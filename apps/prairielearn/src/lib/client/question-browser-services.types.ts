import type { StatusMessageSubmission } from '../externalGradingSocket.types.js';
import type { SubmissionPanels } from '../question-render.types.js';

/** Content that belongs in the question document, including authored HTML and scripts. */
export type QuestionContentPanels = Pick<
  SubmissionPanels,
  'submissionPanel' | 'extraHeadersHtml' | 'answerPanel' | 'questionPanelFooter'
>;

export type QuestionAnswerAction = 'save' | 'grade';

export type QuestionNavigationTarget =
  | 'new-variant'
  | 'try-again'
  | 'manual-grading-preview'
  | 'ai-grading-preview';

/**
 * Application operations available to a single question view. The implementation
 * owns endpoints and credentials; callers only identify actions within that view.
 * This is the local UI API, not the wire format: the port adapter translates
 * signals and callbacks into cancellation and subscription messages.
 */
export interface QuestionBrowserServices {
  openCopyQuestion(): Promise<void>;

  openSubmissionInfo(request: { submissionId: string }): Promise<void>;

  /**
   * Renders an allowed submission in this view. Superseded requests reject with
   * AbortError. History loads return submission content only; grading results
   * also refresh shared panels unless a newer result has already refreshed them.
   */
  renderSubmission(
    request: { submissionId: string; purpose: 'history' | 'grading-result' },
    options: { signal: AbortSignal },
  ): Promise<QuestionContentPanels>;

  subscribeToGradingStatus(listener: (submissions: StatusMessageSubmission[]) => void): () => void;

  /**
   * Submits the answer form's entries with the application's credentials. The
   * application navigates to the response, so this resolves once it is sent.
   */
  submitAnswer(request: {
    action: QuestionAnswerAction;
    entries: [string, string][];
  }): Promise<void>;

  navigate(request: { target: QuestionNavigationTarget }): Promise<void>;

  /** The application warns before leaving the page while answers are unsaved. */
  reportAnswerState(state: { dirty: boolean }): void;
}

/** Application-owned initialization data, kept outside the question container. */
export interface QuestionBrowserServicesData {
  variantId: string;
  variantToken: string;
  csrfToken: string;
  submissionRenderUrls: [string, string][];
  navigationUrls: Partial<Record<QuestionNavigationTarget, string>>;
}
