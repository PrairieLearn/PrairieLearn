import { html } from '@prairielearn/html';

import { getInstanceQuestionUrl } from '../lib/client/url.js';
import { idsEqual } from '../lib/id.js';
import type { SimpleVariantWithScore } from '../models/variant.js';

export function QuestionVariantHistory({
  courseInstanceId,
  instanceQuestionId,
  previousVariants,
  currentVariantId,
}: {
  courseInstanceId: string;
  instanceQuestionId: string;
  previousVariants?: SimpleVariantWithScore[] | null;
  currentVariantId?: string;
}) {
  if (!previousVariants) return '';
  const MAX_DISPLAYED_VARIANTS = 10;
  const collapseClass = `variants-points-collapse-${instanceQuestionId}`;
  const collapseButtonId = `variants-points-collapse-button-${instanceQuestionId}`;

  return html`
    ${previousVariants.length > MAX_DISPLAYED_VARIANTS
      ? html`
          <button
            id="${collapseButtonId}"
            class="bg-white text-body p-0 m-0 border-0 rounded-0"
            aria-label="Show older variants"
            onclick="
                // show all the hidden variant score buttons
                document.querySelectorAll('.${collapseClass}').forEach(e => e.style.display = '');
                // hide the ... button that triggered the expansion
                document.querySelectorAll('#${collapseButtonId}').forEach(e => e.style.display = 'none');
            "
          >
            &ctdot;
          </button>
        `
      : ''}
    ${previousVariants.map(
      (variant, index) => html`
        <a
          class="badge ${currentVariantId != null && idsEqual(variant.id, currentVariantId)
            ? 'text-bg-info'
            : 'text-bg-secondary'} ${collapseClass}"
          ${index < previousVariants.length - MAX_DISPLAYED_VARIANTS ? 'style="display: none"' : ''}
          href="${getInstanceQuestionUrl({
            courseInstanceId,
            instanceQuestionId,
            variantId: variant.id,
          })}"
        >
          ${variant.open ? 'Open' : `${Math.floor(variant.max_submission_score * 100)}%`}
          ${currentVariantId != null && idsEqual(variant.id, currentVariantId)
            ? html`<span class="visually-hidden">(current)</span>`
            : ''}
        </a>
      `,
    )}
  `;
}
