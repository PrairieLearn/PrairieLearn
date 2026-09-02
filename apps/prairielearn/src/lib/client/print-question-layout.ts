import type { QuestionBlockSize } from '@prairielearn/printing';

const QUESTION_BLOCK_SIZE_LOOKUP = {
  auto: true,
  third: true,
  half: true,
  full: true,
} satisfies Record<QuestionBlockSize, true>;

export interface MeasuredPrintQuestion {
  id: string;
  label?: string;
  naturalHeight: number;
  blockSize: QuestionBlockSize;
}

interface PlannedPrintQuestion extends MeasuredPrintQuestion {
  reservedHeight: number;
  allowsFlow: boolean;
}

export interface PlannedPrintQuestionPage {
  questions: PlannedPrintQuestion[];
  reservedHeight: number;
  allowsFlow: boolean;
}

const FIT_TOLERANCE_PX = 0.5;

const BLOCK_SIZE_FRACTIONS: Record<Exclude<QuestionBlockSize, 'auto'>, number> = {
  third: 1 / 3,
  half: 1 / 2,
  full: 1,
};

export class QuestionBlockSizeOverflowError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuestionBlockSizeOverflowError';
  }
}

function isQuestionBlockSize(value: string): value is QuestionBlockSize {
  return Object.hasOwn(QUESTION_BLOCK_SIZE_LOOKUP, value);
}

export function parsePrintBlockSize(value: string | undefined): QuestionBlockSize {
  if (value == null || value === '') return 'auto';
  if (isQuestionBlockSize(value)) return value;
  throw new Error(
    `Invalid print block size ${JSON.stringify(value)}. Expected auto, third, half, or full.`,
  );
}

function describeHeight(height: number): string {
  return `${Math.ceil(height)}px`;
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

  function getRemainingHeight(page: PlannedPrintQuestionPage): number {
    const occupiedHeight = page.allowsFlow ? page.reservedHeight % pageHeight : page.reservedHeight;
    return pageHeight - occupiedHeight;
  }

  function fillsCurrentPhysicalPage(page: PlannedPrintQuestionPage): boolean {
    const occupiedHeight = page.allowsFlow ? page.reservedHeight % pageHeight : page.reservedHeight;
    return (
      pageHeight - occupiedHeight <= FIT_TOLERANCE_PX ||
      (page.allowsFlow && occupiedHeight <= FIT_TOLERANCE_PX)
    );
  }

  for (const question of questions) {
    const questionLabel = question.label ?? question.id;
    if (!Number.isFinite(question.naturalHeight) || question.naturalHeight < 0) {
      throw new Error(`${questionLabel} has an invalid measured height`);
    }

    const reservedHeight =
      question.blockSize === 'auto'
        ? question.naturalHeight
        : pageHeight * BLOCK_SIZE_FRACTIONS[question.blockSize];

    if (
      question.blockSize !== 'auto' &&
      question.naturalHeight - reservedHeight > FIT_TOLERANCE_PX
    ) {
      throw new QuestionBlockSizeOverflowError(
        `${questionLabel} needs ${describeHeight(question.naturalHeight)}, but the requested ${question.blockSize} print block provides ${describeHeight(reservedHeight)}. Use auto or a larger block size.`,
      );
    }

    const needsMultiplePages = reservedHeight - pageHeight > FIT_TOLERANCE_PX;
    const plannedQuestion = { ...question, reservedHeight, allowsFlow: needsMultiplePages };
    if (
      currentPage == null ||
      (!needsMultiplePages && reservedHeight - getRemainingHeight(currentPage) > FIT_TOLERANCE_PX)
    ) {
      currentPage = startPage();
    }
    currentPage.questions.push(plannedQuestion);
    currentPage.reservedHeight += reservedHeight;
    currentPage.allowsFlow ||= needsMultiplePages;

    if (fillsCurrentPhysicalPage(currentPage)) {
      currentPage = undefined;
    }
  }

  return pages;
}
