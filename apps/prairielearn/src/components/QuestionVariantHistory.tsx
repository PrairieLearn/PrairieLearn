import { html } from '@prairielearn/html';

import { getInstanceQuestionUrl } from '../lib/client/url.js';

const MAX_DISPLAYED_VARIANTS = 10;

export function QuestionVariantHistory({
  courseInstanceId,
  instanceQuestionId,
  previousVariants,
  currentVariantId,
}: {
  courseInstanceId: string;
  instanceQuestionId: string;
  previousVariants: { id: string; open: boolean | null; max_submission_score: number }[] | null;
  currentVariantId?: string;
}) {
  if (!previousVariants) return null;

  const hasOverflow = previousVariants.length > MAX_DISPLAYED_VARIANTS;
  const collapseClass = `variants-points-collapse-${instanceQuestionId}`;
  const collapseButtonId = `variants-points-collapse-button-${instanceQuestionId}`;

  return (
    <>
      {hasOverflow && (
        <span
          // eslint-disable-next-line @eslint-react/dom-no-dangerously-set-innerhtml -- inline onclick needed for renderHtml() compatibility
          dangerouslySetInnerHTML={{
            __html: html`
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
            `.toString(),
          }}
        />
      )}
      {previousVariants.map((variant, index) => {
        const hidden = hasOverflow && index < previousVariants.length - MAX_DISPLAYED_VARIANTS;

        return (
          <a
            key={variant.id}
            className={`badge ${currentVariantId != null && variant.id === currentVariantId ? 'text-bg-info' : 'text-bg-secondary'} ${collapseClass}`}
            style={hidden ? { display: 'none' } : undefined}
            href={getInstanceQuestionUrl({
              courseInstanceId,
              instanceQuestionId,
              variantId: variant.id,
            })}
          >
            {variant.open ? 'Open' : `${Math.floor(variant.max_submission_score * 100)}%`}
            {currentVariantId != null && variant.id === currentVariantId && (
              <span className="visually-hidden">(current)</span>
            )}
          </a>
        );
      })}
    </>
  );
}
