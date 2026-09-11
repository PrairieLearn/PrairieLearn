import { moveCheckboxInstructions } from './print-checkbox-instructions.js';

const GENERIC_RESPONSE_PLACEHOLDERS = new Set([
  'asymptotic expression',
  'expression',
  'integer',
  'matrix',
  'number',
  'number + unit',
  'string',
  'symbolic expression',
  'text',
  'unit',
]);

function createResponseArea(label: string): HTMLDivElement {
  const responseArea = document.createElement('div');
  responseArea.className = 'printing-response-area';
  responseArea.dataset.printResponseArea = '';

  const responseLabel = document.createElement('div');
  responseLabel.className = 'printing-response-label';
  responseLabel.textContent = label;

  const responseLines = document.createElement('div');
  responseLines.className = 'printing-response-lines';
  responseLines.ariaHidden = 'true';

  responseArea.append(responseLabel, responseLines);
  return responseArea;
}

function replaceWithResponseArea(element: HTMLElement, label: string): void {
  element.replaceWith(createResponseArea(label));
}

function decodeBase64Utf8(value: string): string | null {
  try {
    const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function replaceFileEditors(source: HTMLElement): void {
  for (const editor of source.querySelectorAll<HTMLElement>('[id^="file-editor-"]')) {
    const paperEditor = document.createElement('div');
    paperEditor.className = 'printing-file-editor';

    const header = editor.querySelector<HTMLElement>('.card-header')?.cloneNode(true);
    if (header instanceof HTMLElement) {
      for (const button of header.querySelectorAll('button')) button.remove();
      const fileName = header.textContent.trim();
      if (fileName) {
        const fileNameElement = document.createElement('div');
        fileNameElement.className = 'printing-file-editor-name';
        fileNameElement.textContent = fileName;
        paperEditor.append(fileNameElement);
      }
    }

    const encodedContents = editor.querySelector<HTMLInputElement>('input[type="hidden"]')?.value;
    const contents = encodedContents == null ? null : decodeBase64Utf8(encodedContents);
    if (contents) {
      const starterLabel = document.createElement('div');
      starterLabel.className = 'printing-file-editor-starter-label';
      starterLabel.textContent = 'Starter code';

      const starterContents = document.createElement('pre');
      starterContents.className = 'printing-file-editor-contents';
      starterContents.textContent = contents;
      paperEditor.append(starterLabel, starterContents);
    }

    paperEditor.append(createResponseArea('Written response'));
    editor.replaceWith(paperEditor);
  }
}

function expandMultipleChoiceDropdowns(source: HTMLElement): void {
  for (const dropdown of source.querySelectorAll<HTMLElement>('.pl-multiple-choice-dropdown')) {
    const select = dropdown.querySelector('select');
    if (!select) continue;

    const choices = document.createElement('div');
    choices.className = 'printing-choice-list';
    for (const option of select.querySelectorAll<HTMLOptionElement>('option')) {
      if (!option.value) continue;
      const choice = document.createElement('div');
      choice.className = 'printing-choice';

      const marker = document.createElement('span');
      marker.className = 'printing-choice-marker';
      marker.ariaHidden = 'true';

      const content = document.createElement('span');
      content.innerHTML = option.dataset.content ?? option.textContent;
      choice.append(marker, content);
      choices.append(choice);
    }
    dropdown.replaceWith(choices);
  }
}

function moveResponseControlPlaceholders(source: HTMLElement): void {
  const controls = source.querySelectorAll<HTMLElement>(
    'input[placeholder]:not([type="hidden"]):not([type="file"]), textarea[placeholder], math-field[placeholder], math-field[data-placeholder-text]',
  );

  for (const control of controls) {
    const placeholder = (
      control.dataset.placeholderText ??
      control.getAttribute('placeholder') ??
      ''
    ).trim();
    control.removeAttribute('placeholder');
    control.removeAttribute('data-placeholder-text');
    if (!placeholder || GENERIC_RESPONSE_PLACEHOLDERS.has(placeholder.toLowerCase())) continue;

    const helper = document.createElement('small');
    helper.className = 'printing-response-placeholder';
    helper.textContent = placeholder;

    const inputGroup = control.closest<HTMLElement>('.input-group');
    (inputGroup ?? control).before(helper);
  }
}

function replaceImageCapture(source: HTMLElement): void {
  for (const capture of source.querySelectorAll<HTMLElement>('.image-capture-card')) {
    const response = createResponseArea('Show your work');
    response.classList.add('printing-drawing-response');
    capture.replaceWith(response);
  }
}

function replaceTextControls(source: HTMLElement): void {
  for (const control of source.querySelectorAll<HTMLElement>(
    'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), math-field, select',
  )) {
    const line = document.createElement('span');
    line.className = 'printing-response-line';
    line.dataset.printResponseLine = '';
    line.dataset.printAnswerName = control.getAttribute('name') ?? control.id;
    line.setAttribute('aria-label', control.getAttribute('aria-label') ?? 'Answer');
    if (control.id) line.id = control.id;
    const size = Number(control.getAttribute('size') ?? 26);
    line.style.setProperty('--printing-response-width', `${Math.max(8, Math.min(size, 35))}ch`);
    control.replaceWith(line);
  }
  for (const textarea of source.querySelectorAll('textarea')) {
    const response = document.createElement('div');
    response.className = 'printing-response-area printing-textarea-response';
    response.dataset.printResponseArea = '';
    if (textarea.id) response.id = textarea.id;
    const lines = document.createElement('div');
    lines.className = 'printing-response-lines';
    lines.ariaHidden = 'true';
    response.append(lines);
    textarea.replaceWith(response);
  }
}

function expandSelectOptions(source: HTMLElement): void {
  for (const select of source.querySelectorAll('select')) {
    const matching = select.closest('.pl-matching-container');
    if (matching?.querySelector('.pl-matching-options')) continue;
    const options = document.createElement('ol');
    options.className = matching
      ? 'pl-matching-options printing-select-options'
      : 'printing-select-options';
    options.type = 'A';
    for (const option of select.options) {
      if (!option.value || option.getAttribute('aria-label') === 'Blank') continue;
      const item = document.createElement('li');
      item.textContent = option.textContent;
      options.append(item);
    }
    if (matching) matching.append(options);
    else select.after(options);
  }
}

function createOrderBlockItem(
  block: HTMLElement,
  indentation: boolean,
  ordered: boolean,
): HTMLLIElement {
  const item = document.createElement('li');
  const position = document.createElement('span');
  position.className = 'printing-order-position';
  position.dataset.printResponseLine = '';
  position.setAttribute('aria-label', ordered ? 'Order number' : 'Include block');
  position.classList.toggle('printing-order-selection', !ordered);
  if (indentation) {
    const fields = document.createElement('div');
    fields.className = 'printing-order-fields';
    for (const [label, box] of [
      [ordered ? 'Order' : 'Use', position],
      ['Indent', position.cloneNode() as HTMLElement],
    ] as const) {
      const field = document.createElement('div');
      const caption = document.createElement('span');
      caption.className = 'printing-order-field-label';
      caption.textContent = label;
      if (label === 'Indent') {
        box.classList.remove('printing-order-selection');
        box.classList.add('printing-order-indent');
        box.setAttribute('aria-label', 'Indentation level');
      }
      field.append(caption, box);
      fields.append(field);
    }
    item.append(fields);
  } else {
    item.append(position);
  }
  const content = document.createElement('div');
  content.className = 'printing-order-block-content';
  const originalContent = block.querySelector('.pl-order-block-content') ?? block;
  content.append(...[...originalContent.childNodes].map((node) => node.cloneNode(true)));
  item.append(content);
  return item;
}

function createOrderBlockOptions(
  options: HTMLElement | null,
  indentation: boolean,
  ordered: boolean,
): HTMLElement {
  const paperOptions = document.createElement('div');
  paperOptions.className = 'printing-order-source';
  const blocks = [...(options?.querySelectorAll<HTMLElement>('.pl-order-block') ?? [])];
  let previousGroup: Element | null = null;
  let list: HTMLUListElement | undefined;

  for (const block of blocks) {
    const group = block.closest('.pl-order-blocks-pairing-indicator');
    if (!list || group !== previousGroup) {
      list = document.createElement('ul');
      list.className = 'printing-order-options';
      if (group) {
        const choiceGroup = document.createElement('div');
        choiceGroup.className = 'printing-order-choice-group';
        choiceGroup.setAttribute('role', 'group');
        choiceGroup.setAttribute('aria-label', 'Choose only one block from this group');
        const heading = document.createElement('div');
        heading.className = 'printing-order-choice-heading';
        heading.textContent = 'Choose only one block from this group';
        choiceGroup.append(heading, list);
        paperOptions.append(choiceGroup);
      } else {
        paperOptions.append(list);
      }
    }
    previousGroup = group;

    list.append(createOrderBlockItem(block, indentation, ordered));
  }
  return paperOptions;
}

function replaceOrderBlocks(source: HTMLElement): void {
  const widgets = [...source.querySelectorAll<HTMLElement>('[class*="pl-order-blocks-question-"]')];
  for (const [index, widget] of widgets.entries()) {
    const options = widget.querySelector<HTMLElement>('[id^="order-blocks-options-"]');
    const supplied = widget.querySelector<HTMLElement>('[id^="order-blocks-dropzone-"]');
    const suppliedBlocks = [...(supplied?.querySelectorAll<HTMLElement>('.pl-order-block') ?? [])];
    const paper = document.createElement('div');
    paper.className = 'printing-order-blocks';
    paper.dataset.printResponseArea = '';
    if (widgets.length > 1) {
      const heading = document.createElement('h4');
      heading.className = 'printing-order-set-heading';
      heading.textContent = `Block set ${index + 1}`;
      paper.append(heading);
    }
    const instructions = document.createElement('p');
    instructions.className = 'printing-response-instructions';
    const help = document.createElement('div');
    help.innerHTML =
      widget.querySelector('[data-bs-content]')?.getAttribute('data-bs-content') ?? '';
    const requirements = [...help.querySelectorAll('p')]
      .map((paragraph) => paragraph.querySelector('strong')?.textContent ?? paragraph.textContent)
      .filter((text) => !text.startsWith('Keyboard Controls:'));
    const indentation = [...help.querySelectorAll('strong')].some((requirement) =>
      requirement.textContent.includes('should be indented'),
    );
    const ordered = !requirements.some((requirement) => requirement.includes('does not matter'));
    instructions.textContent = [
      !ordered
        ? 'Check the box beside each block you want to include. Leave unused blocks blank. The order of the selected blocks does not matter.'
        : indentation
          ? 'Write the position of each block in its Order box (1 = first, 2 = second, and so on). Leave unused blocks blank.'
          : 'Write 1 beside the first block, 2 beside the next, and so on. Leave unused blocks blank.',
      ...(suppliedBlocks.length > 0
        ? [
            ordered
              ? 'Number the provided blocks too.'
              : 'Mark any provided blocks you want to include too.',
          ]
        : []),
      ...(indentation
        ? [
            'In each used block’s Indent box, write 0 for no indentation, 1 for one level, 2 for two levels, and so on.',
          ]
        : []),
    ].join(' ');
    paper.append(instructions);
    paper.append(createOrderBlockOptions(options, indentation, ordered));
    if (suppliedBlocks.length > 0) {
      const heading = document.createElement('div');
      heading.className = 'printing-response-label';
      heading.textContent = 'Provided blocks';
      const initial = document.createElement('ul');
      initial.className = 'printing-order-options printing-order-provided';
      initial.append(
        ...suppliedBlocks.map((block) => createOrderBlockItem(block, indentation, ordered)),
      );
      paper.append(heading, initial);
    }
    widget.replaceWith(paper);
  }
}

function normalizeFigures(source: HTMLElement): void {
  for (const drawing of source.querySelectorAll<HTMLElement>('.pl-drawing-container')) {
    const sidebar = drawing.querySelector('.pl-drawing-sidebar');
    if (sidebar) {
      drawing.dataset.printResponseArea = '';
      sidebar.remove();
    }
  }
  for (const drawing of source.querySelectorAll<HTMLElement>('.excalidraw-root')) {
    const canvas = drawing.querySelector('canvas');
    if (!canvas) continue;
    drawing.replaceChildren(canvas);
    drawing.className = 'printing-excalidraw';
    drawing.dataset.printResponseArea = '';
    canvas.style.cssText = '';
  }
  for (const sketch of source.querySelectorAll<HTMLElement>('.sketchresponse')) {
    const svg = sketch.querySelector<SVGSVGElement>('svg.si-canvas');
    if (!svg) continue;
    // SketchInput uses pixel coordinates without a viewBox. Resizing that SVG otherwise crops
    // the axes instead of scaling the entire drawing to the paper width.
    svg.setAttribute('viewBox', `0 0 ${svg.getAttribute('width')} ${svg.getAttribute('height')}`);
    svg.classList.add('printing-sketch');
    sketch.replaceChildren(svg);
    sketch.dataset.printResponseArea = '';
  }
  for (const media of source.querySelectorAll<HTMLIFrameElement | HTMLMediaElement>(
    'iframe, video, audio',
  )) {
    const link = document.createElement('a');
    link.className = 'printing-media-reference';
    link.href = media.src || media.querySelector('source')?.src || '';
    link.textContent = `${media.getAttribute('title') || 'Media reference'}: ${link.href}`;
    media.replaceWith(link);
  }
}

function normalizeVariableOutputs(source: HTMLElement): void {
  for (const output of source.querySelectorAll('.pl-variable-output, .card:has(.nav-tabs)')) {
    const tabs = output.querySelector('.nav-tabs');
    const label = document.createElement('span');
    label.textContent = tabs?.querySelector('.active')?.textContent ?? 'Variables';
    tabs?.replaceWith(label);
    for (const panel of output.querySelectorAll('.tab-pane:not(.active)')) panel.remove();
  }
}

export function normalizeAnswerPresentation(source: HTMLElement): void {
  normalizeVariableOutputs(source);
  for (const control of source.querySelectorAll('button, .modal, .popover')) control.remove();
  for (const answer of source.querySelectorAll(
    '.pl-order-blocks-answer-container:has(> .bg-success-subtle)',
  )) {
    if (answer.closest('.printing-order-answer-group')) continue;
    let distractors = answer.nextElementSibling;
    const breaks: Element[] = [];
    while (distractors?.matches('br')) {
      breaks.push(distractors);
      distractors = distractors.nextElementSibling;
    }
    if (!distractors?.matches('.pl-order-blocks-answer-container:has(> .bg-danger-subtle)')) {
      continue;
    }
    // Keep distractors with their own solution so a page break cannot associate them with
    // the next block set's correct answer.
    const group = document.createElement('div');
    group.className = 'printing-subsection printing-order-answer-group';
    answer.before(group);
    group.append(answer, distractors);
    for (const lineBreak of breaks) lineBreak.remove();
  }
}

function groupQuestionSections(source: HTMLElement): void {
  for (const response of source.querySelectorAll('.printing-response-area')) {
    let prompt = response.previousElementSibling;
    while (prompt?.matches('script, style, template')) prompt = prompt.previousElementSibling;
    if (!prompt?.matches('p')) continue;
    const section = document.createElement('div');
    section.className = 'printing-subsection';
    prompt.before(section);
    section.append(prompt, response);
  }
  for (const heading of source.querySelectorAll<HTMLElement>(
    ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > hr',
  )) {
    const section = document.createElement('div');
    section.className = 'printing-subsection';
    heading.before(section);
    section.append(heading);
    while (
      section.nextSibling &&
      !(
        section.nextSibling instanceof HTMLElement &&
        /^(H[1-6]|HR)$/.test(section.nextSibling.tagName)
      )
    ) {
      section.append(section.nextSibling);
    }
  }
}

function normalizeQuestionBodyResponseControls(questionBody: HTMLElement): void {
  replaceImageCapture(questionBody);
  replaceOrderBlocks(questionBody);
  normalizeFigures(questionBody);
  normalizeVariableOutputs(questionBody);
  expandMultipleChoiceDropdowns(questionBody);
  expandSelectOptions(questionBody);
  moveCheckboxInstructions(questionBody);
  for (const control of questionBody.querySelectorAll(
    'input[type="checkbox"], input[type="radio"]',
  )) {
    control.closest('fieldset, [role="group"]')?.classList.add('printing-selection-group');
    control
      .closest('.form-check, .checkbox, .radio, .trueFalse')
      ?.classList.add('printing-selection-option');
  }
  replaceFileEditors(questionBody);
  moveResponseControlPlaceholders(questionBody);

  for (const upload of questionBody.querySelectorAll<HTMLElement>('.pl-file-upload-container')) {
    replaceWithResponseArea(upload, 'Written response');
  }
  for (const fileInput of questionBody.querySelectorAll<HTMLInputElement>('input[type="file"]')) {
    replaceWithResponseArea(fileInput, 'Written response');
  }
  for (const editor of questionBody.querySelectorAll<HTMLElement>(
    '.pl-rich-text-editor-container',
  )) {
    const response = createResponseArea('Written response');
    const requirements = editor.querySelector(
      '.pl-rich-text-editor-counter-container .text-secondary .small',
    );
    if (requirements?.textContent.trim()) {
      const note = document.createElement('div');
      note.className = 'printing-response-instructions';
      note.textContent = requirements.textContent.trim();
      response.firstElementChild?.after(note);
    }
    editor.replaceWith(response);
  }
  for (const workspaceLink of questionBody.querySelectorAll<HTMLElement>(
    'a[href*="/workspace"], button[data-workspace-url]',
  )) {
    replaceWithResponseArea(workspaceLink, 'Written response');
  }

  for (const input of questionBody.querySelectorAll<HTMLInputElement>('input[type="hidden"]')) {
    input.remove();
  }
  replaceTextControls(questionBody);
  for (const input of questionBody.querySelectorAll<HTMLInputElement>('input')) {
    input.checked = false;
    input.removeAttribute('checked');
    input.removeAttribute('required');
    input.removeAttribute('value');
    input.disabled = true;
    input.tabIndex = -1;
  }
  for (const editable of questionBody.querySelectorAll<HTMLElement>('[contenteditable]')) {
    editable.contentEditable = 'false';
  }
  groupQuestionSections(questionBody);
}

export function normalizeResponseControls(source: HTMLElement): void {
  for (const questionBody of source.querySelectorAll<HTMLElement>(
    '.printing-question .question-block > .question-body',
  )) {
    normalizeQuestionBodyResponseControls(questionBody);
  }

  for (const form of source.querySelectorAll('form')) {
    form.removeAttribute('action');
    form.removeAttribute('method');
  }

  for (const question of source.querySelectorAll<HTMLElement>('.printing-question')) {
    const questionBody = question.querySelector<HTMLElement>('.question-block > .question-body');
    const hasResponseControl = questionBody?.querySelector(
      'input, [data-print-response-line], [data-print-response-area], .printing-choice-list',
    );
    if (!hasResponseControl) (questionBody ?? question).append(createResponseArea('Response'));
  }
}
