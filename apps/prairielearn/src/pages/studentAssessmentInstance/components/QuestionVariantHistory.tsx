import { getInstanceQuestionUrl } from '../../../lib/client/url.js';

import type { ClientVariantWithScore } from './types.js';

export function QuestionVariantHistory({
  instanceQuestionId,
  previousVariants,
  urlPrefix,
}: {
  instanceQuestionId: string;
  previousVariants: ClientVariantWithScore[] | null;
  urlPrefix: string;
}) {
  if (!previousVariants) return null;

  const MAX_DISPLAYED_VARIANTS = 10;
  const collapseClass = `variants-points-collapse-${instanceQuestionId}`;
  const collapseButtonId = `variants-points-collapse-button-${instanceQuestionId}`;

  return (
    <>
      {previousVariants.length > MAX_DISPLAYED_VARIANTS && (
        <button
          id={collapseButtonId}
          className="bg-white text-body p-0 m-0 border-0 rounded-0"
          aria-label="Show older variants"
          onClick={() => {
            document
              .querySelectorAll(`.${collapseClass}`)
              .forEach((e) => ((e as HTMLElement).style.display = ''));
            document
              .querySelectorAll(`#${collapseButtonId}`)
              .forEach((e) => ((e as HTMLElement).style.display = 'none'));
          }}
        >
          &ctdot;
        </button>
      )}
      {previousVariants.map((variant, index) => (
        <a
          key={variant.id}
          className={`badge text-bg-secondary ${collapseClass}`}
          style={
            index < previousVariants.length - MAX_DISPLAYED_VARIANTS
              ? { display: 'none' }
              : undefined
          }
          href={getInstanceQuestionUrl({ urlPrefix, instanceQuestionId, variantId: variant.id })}
        >
          {variant.open ? 'Open' : `${Math.floor(variant.maxSubmissionScore * 100)}%`}
        </a>
      ))}
    </>
  );
}
