import { ComputeEngine, type Expression, type MathJsonExpression } from '@cortex-js/compute-engine';
import { MathfieldElement } from 'mathlive';

import { onDocumentReady } from '@prairielearn/browser-utils';

interface DrawerElements {
  drawer: HTMLElement;
  fab: HTMLElement;
  fabClose: HTMLElement | null;
}

type DisplayMode = 'numeric' | 'symbolic';

interface CalculatorLocalData {
  ans: string | null;
  variable: { name: string; value: string }[];
  history: { input: string; displayed: string; numeric: number; angleMode: string }[];
  temp_input: string | null;
}

export function initCalculator(storageKey: string, { drawer, fab, fabClose }: DrawerElements) {
  showPanel('main');
  initColumnNavigation();
  initDrawerUI(drawer, fab, fabClose);
  const ce = new ComputeEngine();
  ce.timeLimit = 1;

  ce.pushScope();
  const calculatorInputElement = document.getElementById('calculator-input') as MathfieldElement;
  const calculatorInputContainer = calculatorInputElement.parentElement!;
  const calculatorOutput = document.getElementById('calculator-output') as MathfieldElement;

  const onExport = (_mf: unknown, latex: string) => {
    return ce.parse(latex).toString();
  };
  calculatorInputElement.onExport = onExport;
  calculatorOutput.onExport = onExport;

  MathfieldElement.soundsDirectory = null;
  calculatorInputElement.menuItems = [];
  calculatorOutput.dataset.displayMode = 'numeric';
  calculatorOutput.dataset.angleMode = 'rad';

  document.getElementsByName('calculate').forEach((button) =>
    button.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      calculate(true);
    }),
  );

  let typingTimer: ReturnType<typeof setTimeout>;
  const delay = 500;
  calculatorInputElement.addEventListener('input', () => {
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
      calculate(false);
    }, delay);
  });

  // Data from localStorage
  const calculatorLocalData = localStorage.getItem(storageKey);
  if (!calculatorLocalData) {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ans: null,
        variable: [],
        history: [],
        temp_input: null,
      }),
    );
  } else {
    const data: CalculatorLocalData = JSON.parse(calculatorLocalData);
    for (const historyItem of data.history) {
      addHistoryItem(
        historyItem.input,
        historyItem.displayed,
        historyItem.numeric,
        historyItem.angleMode || 'rad',
      );
    }
    if (data.ans) {
      ce.assign('ans', ce.parse(data.ans));
    }
    for (const variable of data.variable) {
      ce.assign(variable.name, ce.parse(variable.value));
    }
    if (data.temp_input) {
      calculatorInputElement.value = data.temp_input;
      calculatorInputElement.dispatchEvent(new CustomEvent('input'));
    }
  }

  function evaluateExpression(
    input: string,
    angleMode = 'rad',
    displayMode: DisplayMode = 'numeric',
  ) {
    if (!input || input.length === 0) return null;

    let parsed = ce.parse(input, { parseNumbers: 'rational' });

    if (angleMode === 'deg') {
      parsed = ce.box(radianToDegree(parsed.json));
    }

    const json = parsed.json;
    if (Array.isArray(json) && json[0] === 'Assign' && json[1] === 'InvisibleOperator') {
      return null;
    }

    try {
      const evaluated = parsed.evaluate();
      const displayed =
        displayMode === 'symbolic'
          ? evaluated.toLatex({ notation: 'auto' })
          : evaluated.N().toLatex({ notation: 'auto' });
      const numeric = Number(evaluated.N().value);

      return { displayed, numeric, evaluated };
    } catch (e) {
      console.error('Evaluation failed:', e);
      return null;
    }
  }

  function calculate(addToHistory = false) {
    const input = calculatorInputElement.value;
    if (input.length === 0) {
      calculatorOutput.value = '';
      const copyButton = document.getElementById('calculator-output-copy')!;
      copyButton.onclick = function () {
        void copyToClipboard('');
      };
      return;
    }
    let parsed: Expression = ce.parse(input, {
      parseNumbers: 'rational',
    });
    if (calculatorOutput.dataset.angleMode === 'deg') {
      parsed = ce.box(radianToDegree(parsed.json));
    }
    const json = parsed.json;
    if (Array.isArray(json) && json[0] === 'Assign' && json[1] === 'InvisibleOperator') {
      parsed = ce.box([
        'Error',
        '',
        'Assignment operator can only be used on single-letter variables',
      ]);
    }
    let evaluated: Expression;
    try {
      evaluated = parsed.evaluate();
    } catch (e) {
      if (e instanceof Error && e.name === 'CancellationError') {
        calculatorInputElement.value = '';
        calculatorOutput.value = ce.box(['Error', '', 'Output is too large']).toString();
      } else {
        evaluated = parsed.evaluate();
        calculatorInputElement.value = '';
        calculatorOutput.value = ce
          .box(['Error', '', e instanceof Error ? e.message : String(e)])
          .toString();
      }
      return;
    }

    const error = hasError(evaluated.json);

    let displayed = '';
    if (calculatorOutput.dataset.displayMode === 'symbolic') {
      displayed = evaluated.toLatex({ notation: 'adaptiveScientific' });
    } else {
      displayed = evaluated.N().toLatex({ notation: 'adaptiveScientific' });
    }
    if (error) {
      calculatorInputContainer.classList.add('error');
    } else {
      calculatorInputContainer.classList.remove('error');
      calculatorOutput.value = `=${displayed}`;
    }

    // Update copy button
    const copyButton = document.getElementById('calculator-output-copy')!;
    copyButton.onclick = function () {
      void copyToClipboard(evaluated.toString());
    };

    const data: CalculatorLocalData = JSON.parse(localStorage.getItem(storageKey)!);
    // Add to history
    if (!error && addToHistory) {
      const parsedJson = parsed.json;
      if (Array.isArray(parsedJson) && parsedJson[0] === 'Assign') {
        const varName = parsedJson[1] as string;
        const varVal = ce.box(parsedJson[2]).evaluate();
        data.variable.push({
          name: varName,
          value: varVal.toLatex({ notation: 'auto' }),
        });
      }
      try {
        ce.assign('ans', evaluated);
        data.ans = evaluated.toLatex({ notation: 'auto' });
      } catch (e) {
        console.error('Failed to assign ans:', e);
      }

      const currentAngleMode = calculatorOutput.dataset.angleMode ?? 'rad';
      const numericValue = Number(evaluated.N().value);
      addHistoryItem(input, displayed, numericValue, currentAngleMode);

      data.history.push({
        input,
        displayed,
        numeric: numericValue,
        angleMode: currentAngleMode,
      });

      calculatorInputElement.value = '';
      calculatorOutput.value = '';
    }
    data.temp_input = calculatorInputElement.value;
    localStorage.setItem(storageKey, JSON.stringify(data));
  }

  ce.assign('ans', ce.parse('\\bot'));

  // Define custom functions
  ce.assign('nCr', (args: readonly Expression[]) => {
    if (args.length !== 2) {
      return ce.box(['Error', '', 'nCr requires 2 inputs']);
    }
    if (args[1] > args[0]) {
      return ce.number(0);
    }
    const [n, r] = [String(args[0]), String(args[1])];
    return ce.parse(`$$ \\frac{${n}!}{(${r})!*(${n}-${r})!} $$`).evaluate();
  });

  ce.assign('nPr', (args: readonly Expression[]) => {
    if (args.length !== 2) {
      return ce.box(['Error', '', 'nPr requires 2 inputs']);
    }
    if (args[1] > args[0]) {
      return ce.number(0);
    }
    const [n, r] = [String(args[0]), String(args[1])];
    return ce.parse(`$$ \\frac{${n}!}{(${n}-${r})!} $$`).evaluate();
  });

  ce.assign('stdev', (args: readonly Expression[]) => {
    const nums = String(args[0]).slice(1, -1).split(',').map(Number);
    const n = nums.length;
    const mean = nums.reduce((a, b) => a + b) / n;
    const variance = nums.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1);
    return ce.number(Math.sqrt(variance));
  });

  ce.assign('stdevp', (args: readonly Expression[]) => {
    const nums = String(args[0]).slice(1, -1).split(',').map(Number);
    const n = nums.length;
    const mean = nums.reduce((a, b) => a + b) / n;
    const variance = nums.reduce((sum, x) => sum + (x - mean) ** 2, 0) / n;
    return ce.number(Math.sqrt(variance));
  });

  ce.assign('round', (args: readonly Expression[]) => {
    return ce.number(Math.round(args[0] as unknown as number));
  });

  // Buttons for number inputs
  for (let i = 0; i < 10; ++i) {
    const button = document.getElementById(`${i}`)!;
    prepareButton(button);
    button.addEventListener('click', () => {
      calculatorInputElement.insert(`${i}`);
    });
  }

  // Buttons for alphabet inputs
  for (let char = 'a'.charCodeAt(0); char <= 'z'.charCodeAt(0); ++char) {
    const letter = String.fromCharCode(char);
    const button = document.getElementById(letter)!;
    prepareButton(button);
    button.addEventListener('click', () => {
      calculatorInputElement.insert(button.textContent);
    });
  }

  // Upper/lowercase switch
  document.getElementsByName('shift').forEach((button) =>
    button.addEventListener('click', () => {
      button.classList.toggle('btn-light');
      button.classList.toggle('btn-secondary');
      for (let char = 'a'.charCodeAt(0); char <= 'z'.charCodeAt(0); ++char) {
        const letter = String.fromCharCode(char);
        const letterBtn = document.getElementById(letter)!;
        if (letterBtn.textContent <= 'Z') {
          letterBtn.textContent = letterBtn.textContent.toLowerCase();
        } else {
          letterBtn.textContent = letterBtn.textContent.toUpperCase();
        }
      }
    }),
  );

  // Backspace button
  document.getElementsByName('backspace').forEach((button) => {
    prepareButton(button);
    button.addEventListener('click', () => {
      calculatorInputElement.executeCommand(['deleteBackward']);
    });
  });

  // Left/right
  document.getElementsByName('left').forEach((button) => {
    prepareButton(button);
    button.addEventListener('click', () => {
      calculatorInputElement.executeCommand(['moveToPreviousChar']);
    });
  });
  document.getElementsByName('right').forEach((button) => {
    prepareButton(button);
    button.addEventListener('click', () => {
      calculatorInputElement.executeCommand(['moveToNextChar']);
    });
  });

  // Clear all
  document.getElementsByName('clear').forEach((button) => {
    prepareButton(button);
    button.addEventListener('click', () => {
      calculatorInputElement.executeCommand(['deleteAll']);
    });
  });

  // Other panel buttons
  const buttonActions: Record<string, string> = {
    div: '\\frac{#@}{#?}',
    frac: '\\frac{#0}{#?}',
    deg: '#@\\degree',
    sin: '\\sin(#0)',
    'sin-1': '\\sin^{-1}(#0)',
    cos: '\\cos(#0)',
    'cos-1': '\\cos^{-1}(#0)',
    tan: '\\tan(#0)',
    'tan-1': '\\tan^{-1}(#0)',
    sinh: '\\sinh(#0)',
    'sinh-1': '\\sinh^{-1}(#0)',
    cosh: '\\cosh(#0)',
    'cosh-1': '\\cosh^{-1}(#0)',
    tanh: '\\tanh(#0)',
    'tanh-1': '\\tanh^{-1}(#0)',
    ans: '\\operatorname{ans}',
    nPr: '\\operatorname{nPr}(#?,#?)',
    nCr: '\\operatorname{nCr}(#?,#?)',
    factorial: '#@!',
    mean: '\\operatorname{mean}([#?])',
    stdev: '\\operatorname{stdev}([#?])',
    stdevp: '\\operatorname{stdevp}([#?])',
    pi: '\\pi',
    e: 'e',
    epowerx: 'e^{#0}',
    apowerb: '#@^{#?}',
    sqrt: '\\sqrt{#0}',
    root: '\\sqrt[#?]{#0}',
    abs: '|#0|',
    round: '\\operatorname{round}(#0)',
    inv: '\\frac{1}{#@}',
    log: '\\log_{#?}{#0}',
    lg: '\\lg(#0)',
    ln: '\\ln(#0)',
    sqr: '#@^2',
    perc: '\\%',
    lpar: '(',
    rpar: ')',
    assign: '\\coloneqq',
    mul: '\\times',
    minus: '-',
    plus: '+',
    'dec-point': '.',
    lbra: '[',
    rbra: ']',
    eq: '=',
  };

  setupButtonEvents(buttonActions);

  // Panel switching (main / abc / func keyboards)
  document.querySelectorAll<HTMLInputElement>('[data-panel]').forEach((radio) => {
    radio.addEventListener('click', () => {
      const panel = radio.dataset.panel;
      if (panel) showPanel(panel);
    });
  });

  // Symbolic-numeric transformation
  prepareButton(document.getElementById('displayModeSwitch')!);
  document.getElementById('displayModeSwitch')?.addEventListener('click', () => {
    if (calculatorOutput.dataset.displayMode === 'numeric') {
      calculatorOutput.dataset.displayMode = 'symbolic';
    } else {
      calculatorOutput.dataset.displayMode = 'numeric';
    }
    calculate();
  });

  // Degree-radian transformation
  prepareButton(document.getElementById('angleModeSwitch')!);
  document.getElementById('angleModeSwitch')!.addEventListener('click', () => {
    if (calculatorOutput.dataset.angleMode === 'deg') {
      calculatorOutput.dataset.angleMode = 'rad';
    } else {
      calculatorOutput.dataset.angleMode = 'deg';
    }
    calculate();
  });

  /** Keyboard handling */
  function handleKeyPress(ev: KeyboardEvent) {
    switch (ev.key) {
      case 'Enter':
        calculate(true);
      // falls through
      case 'Tab':
        if (calculatorInputElement.mode === 'latex') {
          calculatorInputElement.mode = 'math';
          ev.preventDefault();
        }
    }
  }
  calculatorInputElement.addEventListener('keydown', (ev) => handleKeyPress(ev));

  // Shortcuts
  calculatorInputElement.inlineShortcuts = {
    ...calculatorInputElement.inlineShortcuts,
    ans: '\\operatorname{ans}',
    stdev: '\\operatorname{stdev}([#?])',
    stdevp: '\\operatorname{stdevp}([#?])',
    mean: '\\operatorname{mean}([#?])',
    root: '\\sqrt[#?]{#?}',
    round: '\\operatorname{round}(#?)',
    log: '\\log_{#?}{#?}',
    abs: '|#?|',
    ':=': '\\coloneqq',
    '**': '#@^{(#?)}',
    '^': '#@^{(#?)}',
  };

  function hasError(json: MathJsonExpression): boolean {
    if (!Array.isArray(json)) return false;
    if (json[0] === 'Error') return true;

    for (const item of json.slice(1)) {
      if (hasError(item)) return true;
    }
    return false;
  }

  function radianToDegree(json: MathJsonExpression): MathJsonExpression {
    if (!Array.isArray(json)) {
      return json;
    }
    const trigFunc = [
      'Sin',
      'Cos',
      'Tan',
      'Cot',
      'Sec',
      'Csc',
      'Sinh',
      'Cosh',
      'Tanh',
      'Coth',
      'Sech',
      'Csch',
    ];
    const trigFuncInv = [
      'Arcsin',
      'Arccos',
      'Arctan',
      'Arctan2',
      'Acot',
      'Asec',
      'Acsc',
      'Arsinh',
      'Arcosh',
      'Artanh',
      'Arcoth',
      'Asech',
      'Acsch',
    ];
    // false positive
    // eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
    let parsedExpr: MathJsonExpression & any[];
    if (trigFunc.includes(json[0])) {
      parsedExpr = [json[0], ['Degrees', radianToDegree(json[1])]];
    } else if (trigFuncInv.includes(json[0])) {
      parsedExpr = ['Divide', [json[0], radianToDegree(json[1])], ['Degrees', 1]];
    } else {
      const [symbol, ...args] = json;
      parsedExpr = [symbol, ...args.map(radianToDegree)];
    }
    return parsedExpr;
  }

  /**
   * Prepares a button to maintain focus on the calculator input when clicked.
   * This prevents the input border from blinking when buttons are clicked.
   */
  function prepareButton(button: Element) {
    button.addEventListener('mousedown', (ev) => {
      if (document.activeElement === calculatorInputElement) {
        ev.preventDefault();
      }
    });
  }

  function setupButtonEvents(actions: Record<string, string>) {
    for (const [buttonName, action] of Object.entries(actions)) {
      document.getElementsByName(buttonName).forEach((button) => {
        prepareButton(button);
        button.addEventListener('click', () => {
          calculatorInputElement.insert(action);
        });
      });
    }
  }

  function addHistoryItem(input: string, displayed: string, numeric: number, angleMode = 'rad') {
    const historyPanel = document.getElementById('history-panel')!;

    const template = document.getElementById('history-item-template') as HTMLTemplateElement;
    const clone = document.importNode(template.content, true);

    const historyItem = clone.querySelector<HTMLElement>('.history-item')!;
    historyItem.dataset.input = input;
    historyItem.dataset.angleMode = angleMode;

    // Set input text
    const inputRow = clone.querySelector('.history-input')!;
    const inputField = inputRow.querySelector<MathfieldElement>('.history-text')!;
    inputField.innerHTML = input;

    // Set output text
    const outputRow = clone.querySelector('.history-output')!;
    const outputField = outputRow.querySelector<MathfieldElement>('.history-text')!;
    outputField.innerHTML = `=${displayed}`;

    // Only show rad/deg toggle if expression contains trig functions
    const modeSwitch = clone.querySelector<HTMLElement>('.history-mode-switch')!;
    const hasTrig = containsTrigFunction(input);
    if (!hasTrig) {
      modeSwitch.style.display = 'none';
    }

    const normalizeLatex = (latex: string) => ce.parse(latex).toString();
    const historyOnExport: MathfieldElement['onExport'] = (_mf, latex) => normalizeLatex(latex);
    inputField.onExport = historyOnExport;
    outputField.onExport = historyOnExport;

    // Copy buttons
    const inputCopyBtn = clone.querySelector('.history-input .history-copy-btn')!;
    const outputCopyBtn = clone.querySelector('.history-output .history-copy-btn')!;
    inputCopyBtn.addEventListener('click', () => {
      void copyToClipboard(normalizeLatex(input));
    });
    outputCopyBtn.addEventListener('click', () => {
      void copyToClipboard(normalizeLatex(displayed));
    });

    // Insert buttons
    const inputInsertBtn = clone.querySelector('.history-input .history-insert-btn')!;
    const outputInsertBtn = clone.querySelector('.history-output .history-insert-btn')!;
    inputInsertBtn.addEventListener('click', () => {
      calculatorInputElement.insert(input);
      calculatorInputElement.dispatchEvent(new CustomEvent('input'));
    });
    outputInsertBtn.addEventListener('click', () => {
      calculatorInputElement.insert(displayed);
      calculatorInputElement.dispatchEvent(new CustomEvent('input'));
    });

    // Deg/rad mode switch
    const modeSwitchInput = modeSwitch.querySelector('input')!;
    modeSwitchInput.checked = angleMode === 'deg';

    modeSwitchInput.addEventListener('change', () => {
      const isDeg = modeSwitchInput.checked;
      const newMode = isDeg ? 'deg' : 'rad';
      const displayMode = calculatorOutput.dataset.displayMode as DisplayMode;
      historyItem.dataset.angleMode = newMode;

      const result = evaluateExpression(input, newMode, displayMode);
      // TODO: overwrite localStorage
      if (result) {
        outputField.innerHTML = `=${result.displayed}`;
        displayed = result.displayed;
        numeric = result.numeric;
      }
    });

    historyPanel.insertBefore(clone, historyPanel.firstChild);
  }
}

function showPanel(panelClass: string) {
  const panels = document.querySelectorAll<HTMLElement>('.keyboard');
  panels.forEach((panel) => (panel.style.display = 'none'));

  const panelToShow = document.querySelectorAll<HTMLElement>(`.${panelClass}`);
  panelToShow.forEach((panel) => (panel.style.display = 'flex'));
}

function initColumnNavigation() {
  setupKeyboardNav('main-keyboard', 'show-functions');
  setupKeyboardNav('func-keyboard', 'show-trig');

  function setupKeyboardNav(keyboardId: string, toggleClass: string) {
    const keyboard = document.getElementById(keyboardId);
    if (!keyboard) return;

    keyboard.querySelectorAll('.col-nav').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        keyboard.classList.toggle(toggleClass);
      });
    });
  }
}

export function containsTrigFunction(input: string): boolean {
  return /sin|cos|tan|cot|sec|csc/i.test(input);
}

function initDrawerUI(drawer: HTMLElement, fab: HTMLElement, fabClose: HTMLElement | null) {
  function openDrawer() {
    fab.classList.remove('visible');
    drawer.classList.add('open');
  }

  function collapseDrawer() {
    drawer.classList.remove('open');
    fab.classList.add('visible');
  }

  function dismissCalculator() {
    drawer.classList.remove('open');
    fab.classList.remove('visible');
  }

  fab.addEventListener('click', (ev) => {
    if (fabClose?.contains(ev.target as Node)) return;
    openDrawer();
  });

  if (fabClose) {
    fabClose.addEventListener('click', (ev) => {
      ev.stopPropagation();
      dismissCalculator();
    });
  }

  const closeBtn = document.getElementById('calculatorDrawerClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', collapseDrawer);
  }

  // Left-edge resize handle
  const resizeHandle = document.getElementById('calculatorResizeHandle');
  if (resizeHandle) {
    let startX = 0;
    let startWidth = 0;

    function onPointerMove(ev: PointerEvent) {
      const delta = startX - ev.clientX;
      drawer.style.width = `${Math.max(460, startWidth + delta)}px`;
    }

    function onPointerUp() {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    }

    resizeHandle.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      startX = ev.clientX;
      startWidth = drawer.offsetWidth;
      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp);
    });
  }

  // Clicking the header bar toggles open/collapse
  const header = drawer.querySelector('.calculator-drawer-header');
  if (header) {
    header.addEventListener('click', (ev) => {
      if (ev.target === closeBtn || closeBtn?.contains(ev.target as Node)) return;
      if (drawer.classList.contains('open')) {
        collapseDrawer();
      } else {
        openDrawer();
      }
    });
  }
}

/** based on https://github.com/vueuse/vueuse/blob/main/packages/core/useClipboard/index.ts */
export async function copyToClipboard(text: string): Promise<void> {
  // Guard against SSR or non-browser environments
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (typeof window === 'undefined' || !navigator || !document) {
    return;
  }

  let useLegacy = true;

  // 1. Try Modern Async Clipboard API
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(text);
      useLegacy = false; // Success, no need for legacy
    } catch {
      // Permission denied or other error? Fallback to legacy.
      useLegacy = true;
    }
  }

  // 2. Fallback to legacy execCommand
  if (useLegacy) {
    legacyCopy(text);
  }
}

function legacyCopy(value: string) {
  const ta = document.createElement('textarea');
  ta.value = value;

  // Ensure the element is not visible but part of the DOM
  ta.style.position = 'absolute';
  ta.style.opacity = '0';
  ta.style.left = '-9999px'; // Added safety to ensure it's off-screen
  ta.style.top = '0';
  ta.setAttribute('readonly', ''); // Prevent keyboard from popping up on mobile

  document.body.append(ta);

  ta.select();
  // Additional selection range for mobile compatibility
  ta.setSelectionRange(0, value.length);

  try {
    document.execCommand('copy');
  } catch (err) {
    throw new Error('Failed to copy text using legacy method.', { cause: err });
  } finally {
    ta.remove();
  }
}

onDocumentReady(() => {
  const drawer = document.getElementById('calculatorDrawer');
  const fab = document.getElementById('calculatorFab');
  const fabClose = document.getElementById('calculatorFabClose');
  if (!drawer || !fab) return;

  let initialized = false;
  const toggleBtn = document.getElementById('calculatorDrawerToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (!initialized) {
        initialized = true;
        try {
          initCalculator(drawer.dataset.storageKey ?? 'pl-calculator', {
            drawer,
            fab,
            fabClose,
          });
        } catch (e) {
          console.error('Failed to initialize calculator:', e);
        }
      }
      fab.classList.remove('visible');
      drawer.classList.add('open');
    });
  }
});
