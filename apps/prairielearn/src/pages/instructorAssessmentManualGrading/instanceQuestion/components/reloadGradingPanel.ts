import { executeScripts, parseHTMLElement } from '@prairielearn/browser-utils';

import { getManualGradingInstanceQuestionRubricPanelsUrl } from '../../../../lib/client/url.js';

declare global {
  interface Window {
    resetInstructorGradingPanel: () => any;
    mathjaxTypeset: (elements?: Element[]) => Promise<any>;
  }
}

function swapSlot(selector: string, html: string): HTMLElement | null {
  const slot = document.querySelector<HTMLElement>(selector);
  if (!slot) return null;
  slot.innerHTML = html;
  return slot;
}

/**
 * Refreshes the grading panel, AI explanation/prompt slots, and submission
 * panel in place after AI grading completes. Done imperatively (innerHTML
 * swaps + `window.resetInstructorGradingPanel`) because the grading panel is
 * server-rendered HTML; a declarative React version would require porting the
 * entire panel (and its many imperative `js-*` handlers) to React.
 *
 * Returns `true` on success, `false` on any failure. The UI only surfaces a
 * generic "failed to refresh" alert, so the specific error isn't threaded back
 * — it's logged to the console for debugging.
 */
export async function reloadGradingPanel({
  courseInstanceId,
  assessmentId,
  instanceQuestionId,
}: {
  courseInstanceId: string;
  assessmentId: string;
  instanceQuestionId: string;
}): Promise<boolean> {
  const url = getManualGradingInstanceQuestionRubricPanelsUrl({
    courseInstanceId,
    assessmentId,
    instanceQuestionId,
  });
  let data: any;
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      console.error(`Failed to refresh grading panel: HTTP ${res.status}`);
      return false;
    }
    data = await res.json();
  } catch (err) {
    console.error('Failed to refresh grading panel:', err);
    return false;
  }
  if (!data?.gradingPanel) {
    console.error('Failed to refresh grading panel: response missing gradingPanel');
    return false;
  }

  const gradingPanel = document.querySelector<HTMLElement>('.js-main-grading-panel');
  if (!gradingPanel) {
    console.error('Failed to refresh grading panel: .js-main-grading-panel not found');
    return false;
  }

  // The CSRF token returned by /grading_rubric_panels is issued for that URL,
  // not for the main form's POST URL, so preserve the existing one. Scope both
  // the read and the write to the manual-grading form so any future sibling
  // form (e.g., nested action) keeps its own token.
  const manualGradingForm = gradingPanel.querySelector<HTMLFormElement>(
    'form[name="manual-grading-form"]',
  );
  const oldCsrfToken =
    manualGradingForm?.querySelector<HTMLInputElement>('[name=__csrf_token]')?.value ?? '';

  gradingPanel.innerHTML = data.gradingPanel;

  gradingPanel
    .querySelectorAll<HTMLInputElement>('form[name="manual-grading-form"] input[name=__csrf_token]')
    .forEach((input) => {
      input.value = oldCsrfToken;
    });

  const explanationSlot = swapSlot(
    '.js-ai-grading-explanation-slot',
    data.aiGradingExplanation ?? '',
  );
  const promptSlot = swapSlot('.js-ai-grading-prompt-slot', data.aiGradingPrompt ?? '');

  const typesetTargets: HTMLElement[] = [gradingPanel, explanationSlot, promptSlot].filter(
    (el): el is HTMLElement => el != null,
  );

  if (data.submissionPanel && data.submissionId) {
    const oldSubmission = document.getElementById(`submission-${data.submissionId}`);
    if (oldSubmission) {
      const newSubmission = parseHTMLElement<HTMLElement>(document, data.submissionPanel);
      oldSubmission.replaceWith(newSubmission);
      executeScripts(newSubmission);
      typesetTargets.push(newSubmission);
    }
  }

  window.resetInstructorGradingPanel();
  await window.mathjaxTypeset(typesetTargets);
  return true;
}
