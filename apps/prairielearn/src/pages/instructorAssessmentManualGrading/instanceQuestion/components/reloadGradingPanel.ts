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

export async function reloadGradingPanel(): Promise<void> {
  const res = await fetch(`${window.location.pathname}/grading_rubric_panels`, {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return;
  const data = await res.json();
  if (!data.gradingPanel) return;

  const gradingPanel = document.querySelector<HTMLElement>('.js-main-grading-panel');
  if (!gradingPanel) return;

  // The CSRF token returned by /grading_rubric_panels is issued for that URL,
  // not for the main form's POST URL, so preserve the existing one.
  const oldCsrfToken =
    gradingPanel.querySelector<HTMLInputElement>(
      'form[name="manual-grading-form"] [name=__csrf_token]',
    )?.value ?? '';

  gradingPanel.innerHTML = data.gradingPanel;

  gradingPanel.querySelectorAll<HTMLInputElement>('input[name=__csrf_token]').forEach((input) => {
    input.value = oldCsrfToken;
  });

  const explanationSlot = swapSlot(
    '.js-ai-grading-explanation-slot',
    data.aiGradingExplanation ?? '',
  );
  const promptSlot = swapSlot('.js-ai-grading-prompt-slot', data.aiGradingPrompt ?? '');

  window.resetInstructorGradingPanel();
  await window.mathjaxTypeset(
    [gradingPanel, explanationSlot, promptSlot].filter((el): el is HTMLElement => el != null),
  );
}
