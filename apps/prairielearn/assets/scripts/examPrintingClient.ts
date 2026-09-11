import {
  QuestionBlockSizeOverflowError,
  parsePrintBlockSize,
  planPrintQuestionPages,
} from '../../src/lib/client/print-question-layout.js';
import {
  normalizeAnswerPresentation,
  normalizeResponseControls,
} from '../../src/lib/client/print-response-controls.js';

interface PagedFlow {
  total: number;
}

declare global {
  interface Window {
    PagedConfig: { auto: boolean };
    PagedPolyfill: {
      preview: (
        content: HTMLElement,
        stylesheets?: string[],
        renderTo?: HTMLElement,
      ) => Promise<PagedFlow>;
    };
    PrairieLearnExamPrinting: {
      waitUntil: (promise: Promise<unknown>) => void;
    };
    __PL_PRINT_READINESS_PROMISES__?: Promise<unknown>[];
    __PL_PRINT_READY__: Promise<{ totalPages: number }>;
  }
}

function getReadinessPromises(): Promise<unknown>[] {
  const readinessPromises = window.__PL_PRINT_READINESS_PROMISES__;
  if (!readinessPromises) throw new Error('Exam printing bootstrap is missing');
  return readinessPromises;
}

const extraReadinessPromises = getReadinessPromises();

function waitForDocumentReady(): Promise<void> {
  if (document.readyState !== 'loading') return Promise.resolve();
  return new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
  });
}

function waitForAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function waitForLegacyQuestions(source: HTMLElement): Promise<void> {
  const containers = [
    ...source.querySelectorAll<HTMLElement>(
      '.printing-question:not(.printing-question-freeform) .question-container',
    ),
  ];
  if (containers.length === 0) return;

  const getRenderError = () =>
    containers.find((container) => container.dataset.legacyQuestionRenderStatus === 'error');
  const isReady = () =>
    containers.every((container) => container.dataset.legacyQuestionRenderStatus === 'complete');
  const describeRenderError = (container: HTMLElement) => {
    const questionLabel =
      container.closest('.printing-question')?.getAttribute('aria-label') ?? 'A legacy question';
    const detail = container.dataset.legacyQuestionRenderError;
    return new Error(
      detail
        ? `${questionLabel} could not be rendered for paper: ${detail}`
        : `${questionLabel} could not be rendered for paper`,
    );
  };
  const initialRenderError = getRenderError();
  if (initialRenderError) throw describeRenderError(initialRenderError);

  if (!isReady()) {
    await new Promise<void>((resolve, reject) => {
      const observer = new MutationObserver(() => {
        const renderError = getRenderError();
        if (renderError) {
          window.clearTimeout(timeout);
          observer.disconnect();
          reject(describeRenderError(renderError));
          return;
        }
        if (!isReady()) return;
        window.clearTimeout(timeout);
        observer.disconnect();
        resolve();
      });
      const timeout = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error('Timed out waiting for legacy questions to render'));
      }, 60_000);
      for (const container of containers) {
        observer.observe(container, {
          attributes: true,
          attributeFilter: ['data-legacy-question-render-status'],
        });
      }
    });
  }
}

function getLowestCommonAncestor(elements: HTMLElement[], limit: HTMLElement): HTMLElement | null {
  let ancestor: HTMLElement | null = elements[0] ?? null;
  while (ancestor && ancestor !== limit) {
    if (elements.every((element) => ancestor?.contains(element))) return ancestor;
    ancestor = ancestor.parentElement;
  }
  return null;
}

function getAnswerKeyResponseTargets(questionBody: HTMLElement): HTMLElement[] {
  const targets = [
    ...questionBody.querySelectorAll<HTMLElement>(
      '[data-print-response-area], .printing-choice-list, .printing-select-options, .pl-matching-container',
    ),
  ];
  const choiceControls = [
    ...questionBody.querySelectorAll<HTMLInputElement>(
      'input[type="radio"], input[type="checkbox"]',
    ),
  ];
  const choiceFieldsets = new Set(
    choiceControls.flatMap((control) => {
      const fieldset = control.closest<HTMLElement>('fieldset');
      return fieldset ? [fieldset] : [];
    }),
  );
  targets.push(...choiceFieldsets);

  const ungroupedChoiceControls = choiceControls.filter(
    (control) => ![...choiceFieldsets].some((fieldset) => fieldset.contains(control)),
  );
  if (ungroupedChoiceControls.length > 0) {
    const choiceGroup = getLowestCommonAncestor(ungroupedChoiceControls, questionBody);
    if (choiceGroup) {
      targets.push(choiceGroup);
    } else {
      targets.push(
        ...ungroupedChoiceControls.map(
          (control) =>
            control.closest<HTMLElement>('.form-check, .checkbox') ??
            control.closest<HTMLElement>('label') ??
            control,
        ),
      );
    }
  }

  const responseControls = [
    ...questionBody.querySelectorAll<HTMLElement>('[data-print-response-line]'),
  ];
  const groupedResponseControls = responseControls.flatMap((control) => {
    const inputGroup = control.closest<HTMLElement>('.input-group');
    return inputGroup ? [inputGroup] : [];
  });
  targets.push(...groupedResponseControls);

  const ungroupedResponseControls = responseControls.filter(
    (control) => !groupedResponseControls.some((group) => group.contains(control)),
  );
  const responseGroup = getLowestCommonAncestor(ungroupedResponseControls, questionBody);
  if (responseGroup) {
    targets.push(responseGroup);
  } else {
    targets.push(...ungroupedResponseControls);
  }

  return targets
    .filter(
      (target, index, allTargets) =>
        allTargets.indexOf(target) === index &&
        !allTargets.some((otherTarget) => otherTarget !== target && otherTarget.contains(target)),
    )
    .sort((first, second) =>
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
    );
}

function createAnswerKeyArea(answerBody: HTMLElement, responseHeight: number): HTMLElement {
  const answerKey = document.createElement('div');
  answerKey.className = 'printing-answer-key';
  answerKey.dataset.printAnswerKey = '';
  answerKey.dataset.printReplacedResponseHeight = formatMeasurement(responseHeight);

  const label = document.createElement('div');
  label.className = 'printing-answer-key-label';
  label.textContent = 'Correct answer';

  const viewport = document.createElement('div');
  viewport.className = 'printing-answer-key-viewport';

  const content = document.createElement('div');
  content.className = 'printing-answer-key-content answer-body';
  content.append(...answerBody.childNodes);
  if (content.querySelector('pre')) answerKey.classList.add('printing-answer-key-code');
  viewport.append(content);
  answerKey.append(label, viewport);
  return answerKey;
}

function replaceStudentResponsesWithAnswerKeys(source: HTMLElement): void {
  const submissionBlocks = source.querySelectorAll(
    '.printing-question > .question-container > [data-testid="submission-block"]',
  );
  if (submissionBlocks.length > 0) {
    throw new Error('The printable answer key unexpectedly included student submission data');
  }

  for (const question of source.querySelectorAll<HTMLElement>('.printing-question')) {
    const questionBody = question.querySelector<HTMLElement>('.question-block > .question-body');
    const gradingBlocks = [
      ...question.querySelectorAll<HTMLElement>(':scope > .question-container > .grading-block'),
    ];
    const answerBody = gradingBlocks[0]?.querySelector<HTMLElement>('.answer-body');
    if (!questionBody || gradingBlocks.length !== 1 || !answerBody) {
      throw new Error(`${question.getAttribute('aria-label') ?? 'A question'} has no answer key`);
    }

    for (const gradingBlock of gradingBlocks) gradingBlock.remove();
    normalizeAnswerPresentation(answerBody);
    const studentHeight = question.getBoundingClientRect().height;
    const responseTargets = getAnswerKeyResponseTargets(questionBody);
    const responseHeight =
      responseTargets.length === 0
        ? 48
        : responseTargets.reduce(
            (height, responseTarget) => height + responseTarget.getBoundingClientRect().height,
            0,
          );
    const hasMultipleParts =
      responseTargets.length > 1 ||
      answerBody.querySelector(
        'h1, h2, h3, h4, h5, h6, .card, .pl-order-blocks-answer-container',
      ) !== null;
    const answerKey = createAnswerKeyArea(answerBody, responseHeight);

    if (hasMultipleParts) {
      // These answer panels contain the authored subparts themselves. Keeping the student
      // subparts as well duplicates headings and leaves empty prompts between answers.
      answerKey.classList.add('printing-answer-key-sections');
      questionBody.replaceChildren(answerKey);
      question.dataset.printAnswerKeyPlacement = 'response';
    } else if (responseTargets.length > 0) {
      responseTargets[0].replaceWith(answerKey);
      for (const responseTarget of responseTargets.slice(1)) responseTarget.remove();
      question.dataset.printAnswerKeyPlacement = 'response';
    } else {
      questionBody.append(answerKey);
      question.dataset.printAnswerKeyPlacement = 'appended';
    }

    const transformedHeight = question.getBoundingClientRect().height;
    const reservationHeight = hasMultipleParts ? 0 : Math.max(0, studentHeight - transformedHeight);
    const heightReservation = document.createElement('div');
    heightReservation.dataset.printAnswerKeyHeightReservation =
      formatMeasurement(reservationHeight);
    heightReservation.ariaHidden = 'true';
    heightReservation.style.blockSize = `${reservationHeight}px`;
    question.append(heightReservation);
    question.dataset.printStudentHeight = formatMeasurement(transformedHeight + reservationHeight);
  }
}

function replaceCanvasesWithImages(source: HTMLElement): void {
  for (const canvas of source.querySelectorAll('canvas')) {
    if (canvas.width === 0 || canvas.height === 0) continue;
    const image = document.createElement('img');
    image.className = `${canvas.className} printing-canvas-image`;
    image.id = canvas.id;
    image.style.cssText = canvas.style.cssText;
    image.alt = canvas.getAttribute('aria-label') ?? '';
    image.src = canvas.toDataURL('image/png');
    const bounds = canvas.getBoundingClientRect();
    image.width = bounds.width || canvas.width;
    image.height = bounds.height || canvas.height;
    canvas.replaceWith(image);
  }
}

function keepPrintableGroupsTogether(source: HTMLElement): void {
  const measure = document.createElement('div');
  measure.className = 'exam-print-page-measure';
  source.append(measure);
  const pageHeight = measure.getBoundingClientRect().height;
  measure.remove();
  for (const group of source.querySelectorAll<HTMLElement>(
    '.question-body .card, .printing-order-blocks, .printing-order-choice-group, .sketchresponse, .pl-drawing-container, .printing-subsection, .pl-order-blocks-answer-container, .printing-excalidraw',
  )) {
    if (group.getBoundingClientRect().height < pageHeight - 48) {
      group.classList.add('printing-keep-together');
    }
  }
}

function placeQuestionGroupBreaks(source: HTMLElement, pageHeight: number): void {
  for (const page of source.querySelectorAll<HTMLElement>(
    '.printing-question-page[data-print-allows-flow="true"]',
  )) {
    const pageTop = page.getBoundingClientRect().top;
    let addedSpace = 0;
    const groups = [...page.querySelectorAll<HTMLElement>('.printing-keep-together')].filter(
      (group) => !group.parentElement?.closest('.printing-keep-together'),
    );
    // Paged.js can split nested cards and SVGs despite break-inside: avoid. Give it explicit
    // boundaries for complete subparts, measured at the same width as the generated pages.
    for (const group of groups) {
      const bounds = group.getBoundingClientRect();
      const offset = (bounds.top - pageTop + addedSpace) % pageHeight;
      if (offset > 0.5 && offset + bounds.height > pageHeight - 2) {
        group.classList.add('printing-break-before');
        addedSpace += pageHeight - offset;
      }
    }
  }
}

function materializePrintableShadowRootStyles(source: HTMLElement): void {
  for (const host of source.querySelectorAll<HTMLElement>('[id^="xss-"]')) {
    if (!host.shadowRoot) continue;
    const styles = document.createDocumentFragment();
    for (const stylesheet of host.shadowRoot.adoptedStyleSheets) {
      const style = document.createElement('style');
      style.textContent = [...stylesheet.cssRules].map((rule) => rule.cssText).join('\n');
      styles.append(style);
    }
    host.shadowRoot.prepend(styles);
  }
}

async function waitForImages(source: HTMLElement): Promise<void> {
  await Promise.all(
    [...source.querySelectorAll('img')].map(async (image) => {
      // Elements such as image capture ship placeholder images that only receive a source once a
      // student acts, so an image without one has nothing to load and cannot block printing.
      if (!image.getAttribute('src')) return;
      if (!image.complete) {
        await new Promise<void>((resolve, reject) => {
          image.addEventListener('load', () => resolve(), { once: true });
          image.addEventListener(
            'error',
            () => reject(new Error('An image in the printable exam could not be loaded')),
            { once: true },
          );
        });
      }
      if (image.naturalWidth === 0) {
        throw new Error('An image in the printable exam could not be loaded');
      }
      await image.decode();
    }),
  );
}

function formatMeasurement(value: number): string {
  return value.toFixed(2);
}

interface PrintLayout {
  contentWidth: number;
  pageHeight: number;
  plannedPageAllowsFlow: boolean[];
}

const QUESTION_BLOCK_SIZE_OVERFLOW_ERROR_CODE = 'question-block-size-overflow';

function layoutQuestions(source: HTMLElement): PrintLayout {
  const questionsContainer = source.querySelector<HTMLElement>('.exam-questions');
  if (!questionsContainer) throw new Error('Printable question container is missing');

  const questions = [
    ...questionsContainer.querySelectorAll<HTMLElement>(':scope > .printing-question'),
  ];
  const pageMeasure = document.createElement('div');
  pageMeasure.className = 'exam-print-page-measure';
  pageMeasure.ariaHidden = 'true';
  source.append(pageMeasure);
  const { height: pageHeight, width: contentWidth } = pageMeasure.getBoundingClientRect();
  pageMeasure.remove();

  if (Math.abs(source.getBoundingClientRect().width - contentWidth) > 0.5) {
    throw new Error('Printable questions could not be measured at the paper content width');
  }

  const questionElements = new Map<string, HTMLElement>();
  const measurements = questions.map((question, index) => {
    const id = String(index);
    const label = question.getAttribute('aria-label') ?? `Question ${index + 1}`;
    const blockSize = parsePrintBlockSize(question.dataset.printBlockSize);
    const naturalHeight = Number(
      question.dataset.printStudentHeight ?? question.getBoundingClientRect().height,
    );
    questionElements.set(id, question);
    return { id, label, naturalHeight, blockSize };
  });
  const pages = planPrintQuestionPages({ questions: measurements, pageHeight });
  const laidOutPages = document.createDocumentFragment();

  for (const [pageIndex, pagePlan] of pages.entries()) {
    const page = document.createElement('div');
    page.className = 'printing-question-page';
    page.dataset.printPlannedPage = String(pageIndex + 1);
    page.dataset.printQuestionCount = String(pagePlan.questions.length);
    page.dataset.printReservedHeight = formatMeasurement(pagePlan.reservedHeight);
    page.dataset.printAllowsFlow = String(pagePlan.allowsFlow);

    for (const [slotIndex, plannedQuestion] of pagePlan.questions.entries()) {
      const question = questionElements.get(plannedQuestion.id);
      if (!question) throw new Error(`Printable question ${plannedQuestion.id} is missing`);
      question.dataset.printBlockSize = plannedQuestion.blockSize;
      question.dataset.printMeasuredHeight = formatMeasurement(plannedQuestion.naturalHeight);
      question.dataset.printReservedHeight = formatMeasurement(plannedQuestion.reservedHeight);
      question.dataset.printPlannedPage = String(pageIndex + 1);
      question.dataset.printPlannedSlot = String(slotIndex + 1);
      question.dataset.printAllowsFlow = String(plannedQuestion.allowsFlow);
      if (plannedQuestion.blockSize !== 'auto') {
        question.style.setProperty(
          '--printing-question-block-height',
          `${plannedQuestion.reservedHeight}px`,
        );
      }
      page.append(question);
    }

    laidOutPages.append(page);
  }

  questionsContainer.replaceChildren(laidOutPages);
  document.documentElement.dataset.printLayoutPageCount = String(pages.length);
  document.documentElement.dataset.printContentWidth = formatMeasurement(contentWidth);
  document.documentElement.dataset.printContentHeight = formatMeasurement(pageHeight);
  return {
    contentWidth,
    pageHeight,
    plannedPageAllowsFlow: pages.map((page) => page.allowsFlow),
  };
}

function validatePagedLayout(output: HTMLElement, layout: PrintLayout): void {
  const pagedArea = output.querySelector<HTMLElement>('.pagedjs_area');
  if (!pagedArea) throw new Error('Paged.js did not create a printable content area');

  const pagedAreaBounds = pagedArea.getBoundingClientRect();
  const geometryTolerance = 0.5;
  if (
    Math.abs(pagedAreaBounds.width - layout.contentWidth) > geometryTolerance ||
    Math.abs(pagedAreaBounds.height - layout.pageHeight) > geometryTolerance
  ) {
    throw new Error(
      `Paged.js created a ${formatMeasurement(pagedAreaBounds.width)}px by ${formatMeasurement(pagedAreaBounds.height)}px content area, but questions were measured at ${formatMeasurement(layout.contentWidth)}px by ${formatMeasurement(layout.pageHeight)}px`,
    );
  }
  document.documentElement.dataset.printPagedContentWidth = formatMeasurement(
    pagedAreaBounds.width,
  );
  document.documentElement.dataset.printPagedContentHeight = formatMeasurement(
    pagedAreaBounds.height,
  );

  const generatedPages = [...output.querySelectorAll<HTMLElement>('.pagedjs_page')];
  const coverPageIndexes = generatedPages.flatMap((generatedPage, pageIndex) =>
    generatedPage.querySelector('.exam-cover') ? [pageIndex] : [],
  );
  if (coverPageIndexes.length !== 1 || coverPageIndexes[0] !== 0) {
    throw new Error('The exam cover must occupy the first paginated page by itself');
  }

  let previousLastPageIndex = 0;
  for (const [plannedPageIndex, allowsFlow] of layout.plannedPageAllowsFlow.entries()) {
    const plannedPage = String(plannedPageIndex + 1);
    const containingPageIndexes = generatedPages.flatMap((generatedPage, pageIndex) =>
      generatedPage.querySelector(
        `.printing-question-page[data-print-planned-page="${CSS.escape(plannedPage)}"]`,
      )
        ? [pageIndex]
        : [],
    );
    if (containingPageIndexes.length === 0) {
      throw new Error(`Planned question page ${plannedPage} is missing from the paginated exam`);
    }
    if (!allowsFlow && containingPageIndexes.length !== 1) {
      throw new Error(
        `Planned question page ${plannedPage} unexpectedly spans ${containingPageIndexes.length} paginated pages`,
      );
    }
    if (containingPageIndexes[0] <= previousLastPageIndex) {
      throw new Error(
        `Planned question page ${plannedPage} did not start on a fresh paginated page`,
      );
    }
    if (
      containingPageIndexes.at(-1)! - containingPageIndexes[0] + 1 !==
      containingPageIndexes.length
    ) {
      throw new Error(
        `Planned question page ${plannedPage} is not contiguous in the paginated exam`,
      );
    }
    previousLastPageIndex = containingPageIndexes.at(-1)!;
  }
}

async function paginateExam(): Promise<{ totalPages: number }> {
  await waitForDocumentReady();
  const source = document.querySelector<HTMLElement>('#exam-print-source');
  const output = document.querySelector<HTMLElement>('#exam-print-pages');
  if (!source || !output) throw new Error('Printable exam containers are missing');

  await Promise.all([waitForLegacyQuestions(source), ...extraReadinessPromises]);
  await waitForAnimationFrame();
  await waitForAnimationFrame();
  materializePrintableShadowRootStyles(source);
  const mathJax = Reflect.get(window, 'MathJax') as
    | {
        startup?: { promise?: Promise<unknown> };
        typesetPromise?: (elements?: Element[]) => Promise<unknown>;
      }
    | undefined;
  await mathJax?.startup?.promise;
  normalizeResponseControls(source);
  await mathJax?.typesetPromise?.([source]);
  await document.fonts.ready;
  replaceCanvasesWithImages(source);
  await waitForImages(source);
  if (document.documentElement.dataset.printDocument === 'answer_key') {
    replaceStudentResponsesWithAnswerKeys(source);
  }
  keepPrintableGroupsTogether(source);
  const layout = layoutQuestions(source);
  placeQuestionGroupBreaks(source, layout.pageHeight);
  await waitForAnimationFrame();

  // All asynchronous content is settled above, so Paged.js can use a fixed layout. Its resize
  // observers otherwise race with page construction and can attempt to reflow incomplete pages.
  const resizeObserver = window.ResizeObserver;
  Reflect.set(
    window,
    'ResizeObserver',
    class {
      disconnect() {}
      observe() {}
      unobserve() {}
    },
  );
  let flow: PagedFlow;
  try {
    flow = await window.PagedPolyfill.preview(source, undefined, output);
  } finally {
    Reflect.set(window, 'ResizeObserver', resizeObserver);
  }
  validatePagedLayout(output, layout);
  source.remove();
  document.documentElement.dataset.printStatus = 'ready';
  document.documentElement.dataset.printPageCount = String(flow.total);
  return { totalPages: flow.total };
}

window.__PL_PRINT_READY__ = paginateExam().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  document.documentElement.dataset.printStatus = 'error';
  document.documentElement.dataset.printError = message;
  if (error instanceof QuestionBlockSizeOverflowError) {
    document.documentElement.dataset.printErrorCode = QUESTION_BLOCK_SIZE_OVERFLOW_ERROR_CODE;
  }
  const status = document.querySelector('#exam-print-status');
  if (status) status.textContent = `Unable to paginate this exam: ${message}`;
  throw error;
});
