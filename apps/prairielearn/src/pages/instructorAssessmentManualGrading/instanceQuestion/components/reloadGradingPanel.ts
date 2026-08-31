import { executeScripts, parseHTMLElement } from '@prairielearn/browser-utils';

import { INSTANCE_QUESTION_GRADING_PANEL_UPDATE_EVENT } from '../../../../lib/client/manual-grading-events.js';
import { mathjaxTypeset } from '../../../../lib/client/mathjax.js';
import { getManualGradingInstanceQuestionRubricPanelsUrl } from '../../../../lib/client/url.js';

function swapSlot(selector: string, html: string): HTMLElement | null {
  const slot = document.querySelector<HTMLElement>(selector);
  if (!slot) return null;
  slot.innerHTML = html;
  return slot;
}

/**
 * Refreshes the grading panel, AI explanation/prompt slots, and submission
 * panel in place after AI grading completes. The grading panel is updated via
 * a custom event because it is a separate React island; the other slots still
 * use their existing imperative interop.
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
  if (!data?.gradingPanelProps) {
    console.error('Failed to refresh grading panel: response missing gradingPanelProps');
    return false;
  }

  document.dispatchEvent(
    new CustomEvent(INSTANCE_QUESTION_GRADING_PANEL_UPDATE_EVENT, {
      detail: { gradingPanelProps: data.gradingPanelProps, preserveValues: false },
    }),
  );

  const explanationSlot = swapSlot(
    '.js-ai-grading-explanation-slot',
    data.aiGradingExplanation ?? '',
  );
  const promptSlot = swapSlot('.js-ai-grading-prompt-slot', data.aiGradingPrompt ?? '');

  const typesetTargets: HTMLElement[] = [explanationSlot, promptSlot].filter(
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

  await mathjaxTypeset(typesetTargets);
  return true;
}
