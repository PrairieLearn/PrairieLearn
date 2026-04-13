import { useState } from 'react';

import { getInstanceQuestionUrl } from '../../../lib/client/url.js';

import type { ClientVariantWithScore } from './types.js';

export function QuestionVariantHistory({
  instanceQuestionId,
  previousVariants,
  courseInstanceId,
}: {
  instanceQuestionId: string;
  previousVariants: ClientVariantWithScore[] | null;
  courseInstanceId: string;
}) {
  const [expanded, setExpanded] = useState(false);

  if (!previousVariants) return null;

  const MAX_DISPLAYED_VARIANTS = 10;
  const hasOverflow = previousVariants.length > MAX_DISPLAYED_VARIANTS;

  return (
    <>
      {hasOverflow && !expanded && (
        <button
          className="bg-white text-body p-0 m-0 border-0 rounded-0"
          aria-label="Show older variants"
          onClick={() => setExpanded(true)}
        >
          &ctdot;
        </button>
      )}
      {previousVariants.map((variant, index) => {
        const hidden =
          hasOverflow && !expanded && index < previousVariants.length - MAX_DISPLAYED_VARIANTS;
        if (hidden) return null;

        return (
          <a
            key={variant.id}
            className="badge text-bg-secondary"
            href={getInstanceQuestionUrl({
              courseInstanceId,
              instanceQuestionId,
              variantId: variant.id,
            })}
          >
            {variant.open ? 'Open' : `${Math.floor(variant.maxSubmissionScore * 100)}%`}
          </a>
        );
      })}
    </>
  );
}
