import { html } from '@prairielearn/html';

export function ProgressCircle({
  value,
  maxValue,
  class: className = '',
}: {
  value: number;
  maxValue: number;
  class?: string;
}) {
  // The progress circle has radius of 8px, so its circumference is 2 * PI * 8px.
  const progressCircleCircumference = 2 * Math.PI * 8;

  // The filled portion length is proportional to the ratio of the value to the max value.
  let filledPortionLength = progressCircleCircumference * (value / maxValue);

  // Ensure that the filled portion is at most as long as the progress circle's circumference.
  filledPortionLength = Math.min(filledPortionLength, progressCircleCircumference);

  // Ensure that the filled portion has a non-negative length.
  filledPortionLength = Math.max(filledPortionLength, 0);

  const filledPortionLengthFixed = filledPortionLength.toFixed(2);

  // The unfilled portion length is the rest of the circumference.
  let unfilledPortionLength = progressCircleCircumference - filledPortionLength;

  // Ensure that the unfilled portion is at most as long as the progress circle's circumference.
  // This should not be necessary since the filledPortionLength is already constrained from 0 to
  // progressCircleCircumference, but it's included for robustness.
  unfilledPortionLength = Math.min(unfilledPortionLength, progressCircleCircumference);

  // Ensure that the unfilled portion has a non-negative length.
  // This should not be necessary since the completePortionLength is already constrained from 0 to
  // progressCircleCircumference, but it's included for robustness.
  unfilledPortionLength = Math.max(unfilledPortionLength, 0);

  const unfilledPortionLengthFixed = unfilledPortionLength.toFixed(2);

  return html`<svg
    style="transform:rotate(-90deg)"
    width="20px"
    height="20px"
    viewBox="0 0 20 20"
    class="${className}"
  >
    <circle
      cx="10px"
      cy="10px"
      r="8px"
      fill="none"
      stroke="var(--bs-gray-400)"
      stroke-width="3px"
    ></circle>
    <circle
      cx="10px"
      cy="10px"
      r="8px"
      fill="none"
      stroke="var(--bs-primary)"
      stroke-width="3px"
      stroke-dasharray="${filledPortionLengthFixed}px ${unfilledPortionLengthFixed}px"
    ></circle>
  </svg>`;
}
