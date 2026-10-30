import { parseHTMLElement } from '@prairielearn/browser-utils';

import type { SubmissionPanels } from '../question-render.types.js';

/** Applies application-owned markup received directly from the server. */
export function updateQuestionPagePanels(document: Document, msg: SubmissionPanels): void {
  if (msg.questionScorePanel) {
    const parsedHTML = parseHTMLElement(document, msg.questionScorePanel);

    // We might be getting new markup for just the content, or legacy markup
    // for the whole panel.
    //
    // TODO: switch back to using a specific ID once we drop the legacy markup.
    // Using a specific ID ensures we can find things easily via grep.
    const targetElement = document.getElementById(parsedHTML.id);
    targetElement?.replaceWith(parsedHTML);
  }

  if (msg.assessmentScorePanel) {
    const assessmentScorePanel = document.getElementById('assessment-score-panel');
    if (assessmentScorePanel) {
      assessmentScorePanel.outerHTML = msg.assessmentScorePanel;
    }
  }

  if (msg.questionNavNextButton) {
    const questionNavNextButtonContainer = document.getElementById('question-nav-next-container');
    if (questionNavNextButtonContainer) {
      questionNavNextButtonContainer.outerHTML = msg.questionNavNextButton;
    }
  }
}
