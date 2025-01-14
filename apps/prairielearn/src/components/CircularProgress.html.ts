import { html } from '@prairielearn/html';

export function CircularProgress({
  numComplete,
  numTotal,
  isInCourseNavbar, // improve name
}: {
  numComplete: number;
  numTotal: number;
  isInCourseNavbar?: boolean;
}) {
  // Circumference = 2 * PI * radius = 2 * PI * 8px
  const loadingIndicatorCircumference = 2 * Math.PI * 8;

  // Filled Portion Length = Circumference * Percent Complete = Circumference * (numComplete / numTotal)
  const filledLength = loadingIndicatorCircumference * (numComplete / numTotal);

  // Unfilled Portion Length is the rest of the circumference
  const unfilledLength = loadingIndicatorCircumference - filledLength;

  const filledLengthFixed = filledLength.toFixed(2);
  const unfilledLengthFixed = unfilledLength.toFixed(2);

  return html`<div class="ml-1 ${isInCourseNavbar ? '' : 'mr-2'}">
    <svg style="transform:rotate(-90deg)" width="20px" height="20px" viewBox="0 0 20px 20px">
      <circle cx="10px" cy="10px" r="8px" fill="none" stroke="#ddd" stroke-width="2px"></circle>
      <circle
        cx="10px"
        cy="10px"
        r="8px"
        fill="none"
        stroke="#5394fd"
        stroke-width="2px"
        stroke-dasharray="${filledLengthFixed}px ${unfilledLengthFixed}px"
      ></circle>
    </svg>
  </div>`;
}
