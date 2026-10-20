import type { QuestionBlockSize } from '../printing/question-block-size.js';

export interface MeasuredPrintQuestion {
  id: string;
  label?: string;
  naturalHeight: number;
  blockSize: QuestionBlockSize;
}

interface PlannedPrintQuestion extends MeasuredPrintQuestion {
  reservedHeight: number;
  /** Whether this question can continue onto another printed page. */
  allowsFlow: boolean;
}

export interface PlannedPrintQuestionPage {
  questions: PlannedPrintQuestion[];
  reservedHeight: number;
  /** Whether this page contains a question that can continue onto another printed page. */
  allowsFlow: boolean;
}

const FIT_TOLERANCE_PX = 0.5;

const BLOCK_SIZE_FRACTIONS: Record<Exclude<QuestionBlockSize, 'auto'>, number> = {
  third: 1 / 3,
  half: 1 / 2,
  full: 1,
};

export function getPrintBlockHeight(blockSize: QuestionBlockSize, pageHeight: number): number {
  return blockSize === 'auto' ? pageHeight : pageHeight * BLOCK_SIZE_FRACTIONS[blockSize];
}

export function planPrintQuestionPages({
  questions,
  pageHeight,
}: {
  questions: MeasuredPrintQuestion[];
  pageHeight: number;
}): PlannedPrintQuestionPage[] {
  if (!Number.isFinite(pageHeight) || pageHeight <= 0) {
    throw new Error('The printable page height must be a positive number');
  }

  const pages: PlannedPrintQuestionPage[] = [];
  let currentPage: PlannedPrintQuestionPage | undefined;

  function startPage(): PlannedPrintQuestionPage {
    const page = { questions: [], reservedHeight: 0, allowsFlow: false };
    pages.push(page);
    return page;
  }

  for (const question of questions) {
    const questionLabel = question.label ?? question.id;
    if (!Number.isFinite(question.naturalHeight) || question.naturalHeight < 0) {
      throw new Error(`${questionLabel} has an invalid measured height`);
    }

    const requestedHeight = getPrintBlockHeight(question.blockSize, pageHeight);
    const reservedHeight =
      question.blockSize === 'auto' || question.naturalHeight - requestedHeight > FIT_TOLERANCE_PX
        ? question.naturalHeight
        : requestedHeight;

    const needsMultiplePages = reservedHeight - pageHeight > FIT_TOLERANCE_PX;
    const plannedQuestion = { ...question, reservedHeight, allowsFlow: needsMultiplePages };
    if (
      currentPage == null ||
      needsMultiplePages ||
      currentPage.reservedHeight + reservedHeight - pageHeight > FIT_TOLERANCE_PX
    ) {
      currentPage = startPage();
    }
    currentPage.questions.push(plannedQuestion);
    currentPage.reservedHeight += reservedHeight;
    currentPage.allowsFlow ||= needsMultiplePages;

    if (needsMultiplePages || pageHeight - currentPage.reservedHeight <= FIT_TOLERANCE_PX) {
      currentPage = undefined;
    }
  }

  return pages;
}
