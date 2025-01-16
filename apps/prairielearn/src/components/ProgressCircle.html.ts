import { html } from '@prairielearn/html';

export function ProgressCircle({
  numComplete,
  numTotal,
}: {
  numComplete: number;
  numTotal: number;
  isInCourseNavbar?: boolean;
}) {
  // The progress circle has radius of 8px, so its circumference is 2 * PI * 8px
  const progressCircleCircumference = 2 * Math.PI * 8;

  // The complete portion length is proportional to the percentage of the tasks that are complete
  let completePortionLength = progressCircleCircumference * (numComplete / numTotal);

  // Ensure that the complete portion is not longer than the progress circle's circumference
  completePortionLength = Math.min(completePortionLength, progressCircleCircumference);

  // Ensure that the complete portion has a non-negative length
  completePortionLength = Math.max(completePortionLength, 0);

  const completePortionLengthFixed = completePortionLength.toFixed(2);

  // The incomplete portion length is the rest of the circumference
  let incompletePortionLength = progressCircleCircumference - completePortionLength;

  // Ensure that the incomplete portion is not longer than the progress circle's circumference
  incompletePortionLength = Math.min(incompletePortionLength, progressCircleCircumference);

  // Ensure that the incomplete portion has a non-negative length
  incompletePortionLength = Math.max(incompletePortionLength, 0);

  const incompletePortionLengthFixed = incompletePortionLength.toFixed(2);

  return html`<svg
    style="transform:rotate(-90deg)"
    width="20px"
    height="20px"
    viewBox="0 0 20px 20px"
    class="mx-1"
  >
    <circle
      cx="10px"
      cy="10px"
      r="8px"
      fill="none"
      stroke="var(--bs-gray-400)"
      stroke-width="2px"
    ></circle>
    <circle
      cx="10px"
      cy="10px"
      r="8px"
      fill="none"
      stroke="var(--bs-primary)"
      stroke-width="2px"
      stroke-dasharray="${completePortionLengthFixed}px ${incompletePortionLengthFixed}px"
    ></circle>
  </svg>`;
}
