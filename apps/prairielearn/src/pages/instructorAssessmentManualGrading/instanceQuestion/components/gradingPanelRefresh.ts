import { executeScripts, parseHTMLElement } from '@prairielearn/browser-utils';

import { mathjaxTypeset } from '../../../../lib/client/mathjax.js';
import { GRADING_PANEL_REFRESH_EVENT } from '../instanceQuestion.shared.js';

import type { GradingPanelProps, GradingPanelRefreshDetail } from './gradingPanel.types.js';

export function applyGradingPanelRefreshDetail(detail: GradingPanelRefreshDetail) {
  document.dispatchEvent(
    new CustomEvent<GradingPanelRefreshDetail>(GRADING_PANEL_REFRESH_EVENT, { detail }),
  );
}

export async function fetchAndApplyGradingPanelRefresh({
  url,
  preserveSelections = false,
}: {
  url: string;
  preserveSelections?: boolean;
}): Promise<boolean> {
  let data: Partial<GradingPanelRefreshDetail>;
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

  if (!data.panel) {
    console.error('Failed to refresh grading panel: response missing panel data');
    return false;
  }

  const panel: GradingPanelProps = data.panel;
  applyGradingPanelRefreshDetail({
    panel,
    aiGradingInfo: data.aiGradingInfo,
    submissionPanel: data.submissionPanel,
    submissionId: data.submissionId,
    preserveSelections,
  });

  if (data.submissionPanel && data.submissionId) {
    const oldSubmission = document.getElementById(`submission-${data.submissionId}`);
    if (oldSubmission) {
      const newSubmission = parseHTMLElement<HTMLElement>(document, data.submissionPanel);
      oldSubmission.replaceWith(newSubmission);
      executeScripts(newSubmission);
      await mathjaxTypeset([newSubmission]);
    }
  }

  return true;
}
