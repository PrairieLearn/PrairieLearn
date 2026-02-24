import clsx from 'clsx';
import type { ReactNode } from 'react';

interface QuestionNumberTitleCellProps {
  questionNumber: number;
  /** For displaying "1.2." format for alternatives */
  alternativeNumber: number | null;
  /** Title link or text */
  titleContent: ReactNode;
  /** QID code + sync buttons */
  qidContent: ReactNode;
  /** Optional badges/icons after title (e.g., issue badge, comment icon) */
  badges?: ReactNode;
}

/**
 * A reusable component that renders the question number badge on the left
 * with title/QID stacked on the right.
 */
export function QuestionNumberTitleCell({
  questionNumber,
  alternativeNumber,
  titleContent,
  qidContent,
  badges,
}: QuestionNumberTitleCellProps) {
  const numberText =
    alternativeNumber != null ? `${questionNumber}.${alternativeNumber}.` : `${questionNumber}.`;

  return (
    <div
      className={clsx(
        'd-flex align-items-start gap-2',
        alternativeNumber != null ? 'ms-3' : 'ms-2',
      )}
    >
      <span className="badge color-gray1" style={{ minWidth: '2.5em' }}>
        {numberText}
      </span>
      <div>
        <div>
          {titleContent}
          {badges}
        </div>
        <div>{qidContent}</div>
      </div>
    </div>
  );
}
