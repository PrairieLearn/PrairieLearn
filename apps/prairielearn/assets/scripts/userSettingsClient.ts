import { onDocumentReady } from '@prairielearn/browser-utils';

onDocumentReady(() => {
  const enhancedNavToggle = document.querySelector<HTMLInputElement>('#enhanced_navigation_toggle');
  const enhancedNavFeedback = document.querySelector<HTMLDivElement>(
    '#enhanced_navigation_feedback',
  );

  if (!enhancedNavToggle || !enhancedNavFeedback) {
    throw new Error('Enhanced navigation toggle or feedback element not found.');
  }

  const initialEnhancedNavState = enhancedNavToggle.checked;

  // If the user had enhanced navigation enabled on page load then unchecks the toggle,
  // the feedback element becomes visible.
  if (initialEnhancedNavState) {
    enhancedNavToggle.addEventListener('change', (event) => {
      const newState = (event.target as HTMLInputElement).checked;
      enhancedNavFeedback.classList.toggle('d-none', !!newState);
    });
  }
});
