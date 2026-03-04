import {
  ComputeEngine,
  type Expression,
  type MathJsonExpression,
  isTensor,
} from '@cortex-js/compute-engine';
import { MathfieldElement } from 'mathlive';

import { onDocumentReady } from '@prairielearn/browser-utils';

interface DrawerElements {
  drawer: HTMLElement;
  fab: HTMLElement;
  fabClose: HTMLElement | null;
}

type DisplayMode = 'numeric' | 'symbolic';

interface HistoryItem {
  input: string;
  displayed: string;
  numeric: number;
  angleMode: string;
}

interface CalculatorLocalData {
  variable: { name: string; value: string }[];
  history: HistoryItem[];
  temp_input: string | null;
  isOpen: boolean;
}

export function initCalculator(storageKey: string, { drawer, fab, fabClose }: DrawerElements) {
  showPanel('main');
  initColumnNavigation();
  initDrawerUI(drawer, fab, fabClose, storageKey);
  const ce = new ComputeEngine();
  ce.timeLimit = 500;


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

  // Auto-insert ans: after submitting to history, the next operator/function
  // input automatically prefixes with ans (classic calculator behavior).
  let shouldAutoInsertAns = false;
  const autoAnsButtons = new Set([
    'plus', 'minus', 'mul', 'div', 'sqr', 'apowerb', 'perc', 'factorial', 'inv',
    'sin', 'cos', 'tan', 'sin-1', 'cos-1', 'tan-1',
    'sinh', 'cosh', 'tanh', 'sinh-1', 'cosh-1', 'tanh-1',
    'sqrt', 'root', 'abs', 'ln', 'lg', 'log', 'epowerx', 'round',
  ]);
  const autoAnsKeys = new Set(['+', '-', '*', '/', '^', '!']);

  drawer.querySelectorAll('button[name="calculate"]').forEach((button) =>
    button.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      calculate(true);
    }),
  );

  let typingTimer: ReturnType<typeof setTimeout>;
  const delay = 200;
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
        isOpen: true,
      }),
    );
  } else {
    const data: CalculatorLocalData = JSON.parse(calculatorLocalData);
    for (const historyItem of data.history) {
      addHistoryItem(historyItem);
    }
    for (const variable of data.variable) {
      ce.assign(variable.name, ce.parse(variable.value));
    }

    // Set ans to the last history item's result, or \bot if no history
    const historyPanel = document.getElementById('history-panel')!;
    const items = Array.from(historyPanel.querySelectorAll<HTMLElement>('.history-item'));
    if (items.length > 0) {
      const displayMode = calculatorOutput.dataset.displayMode as DisplayMode;
      const lastResult = resolveAnsAndEvaluate(items, 0, displayMode);
      if (lastResult) {
        ce.assign('ans', lastResult.evaluated);
      } else {
        ce.assign('ans', ce.parse('\\bot'));
      }
    } else {
      ce.assign('ans', ce.parse('\\bot'));
    }

    if (data.temp_input) {
      calculatorInputElement.value = data.temp_input;
      calculatorInputElement.dispatchEvent(new CustomEvent('input'));
    }
  }

  /**
   * Resolves the correct `ans` value by recursively evaluating previous history
   * items, then evaluates the item at the given DOM index. Does not update the
   * DOM — only returns the result. Saves and restores the global `ans`.
   */
  function resolveAnsAndEvaluate(
    items: HTMLElement[],
    domIndex: number,
    displayMode: DisplayMode,
  ): ReturnType<typeof evaluateExpression> {
    const item = items[domIndex];
    const input = item.dataset.input!;
    const angleMode = item.dataset.angleMode!;

    const savedAns = ce.box('ans').evaluate();

    // checking `{ans}` here because it could be \mathrm{ans} or \operatorname{ans}
    if (input.includes('{ans}') && domIndex + 1 < items.length) {
      const prevResult = resolveAnsAndEvaluate(items, domIndex + 1, displayMode);
      if (prevResult) {
        ce.assign('ans', prevResult.evaluated);
      }
    }

    const result = evaluateExpression(input, angleMode, displayMode);
    ce.assign('ans', savedAns);
    return result;
  }

  /**
   * Re-evaluates a history item with the correct `ans` context, updates its
   * displayed output, and forward-propagates to subsequent items that use `ans`.
   */
  function reevaluateHistoryItem(historyItemEl: HTMLElement, updateGlobalAns = true) {
    const historyPanel = document.getElementById('history-panel')!;
    const items = Array.from(historyPanel.querySelectorAll<HTMLElement>('.history-item'));
    const domIndex = items.indexOf(historyItemEl);
    if (domIndex === -1) return;

    const displayMode = calculatorOutput.dataset.displayMode as DisplayMode;

    const result = resolveAnsAndEvaluate(items, domIndex, displayMode);
    if (result) {
      const outputField = historyItemEl.querySelector<MathfieldElement>(
        '.history-output .history-text',
      )!;
      outputField.value = `=${result.displayed}`;
    }

    // Forward propagation: if the next item uses ans, re-evaluate it too
    if (domIndex > 0) {
      const nextItem = items[domIndex - 1];
      if (nextItem.dataset.input?.includes('{ans}')) {
        reevaluateHistoryItem(nextItem, false);
      }
    }

    // After all re-evaluations, set ans to the last history item's result
    if (updateGlobalAns && items.length > 0) {
      const lastResult = resolveAnsAndEvaluate(items, 0, displayMode);
      if (lastResult) {
        ce.assign('ans', lastResult.evaluated);
      }
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
      calculatorInputContainer.classList.remove('error');
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
      console.error('Error during evaluation:', e);
      if (e instanceof Error && e.name === 'CancellationError') {
        evaluated = ce.error('Output is too large');
        calculatorOutput.value = '\\mathrm{Error:\\ Output\\ is\\ too\\ large}';
      } else {
        calculatorInputElement.value = '';
        console.error('Error during evaluation:', e);
        calculatorOutput.value = '\\mathrm{Error}';
        evaluated = ce.error(e instanceof Error ? e.message : String(e));
      }
    }

    const error = hasError(evaluated.json);

    if (error) {
      console.error('Error in evaluated expression:', evaluated.toString());
      calculatorInputContainer.classList.add('error');
      return;
    }

    let displayed = '';
    if (calculatorOutput.dataset.displayMode === 'symbolic') {
      displayed = evaluated.toLatex({
        notation: 'adaptiveScientific',
        fractionalDigits: ce.precision,
      });
    } else {
      displayed = evaluated
        .N()
        .toLatex({ notation: 'adaptiveScientific', fractionalDigits: ce.precision });
    }

    calculatorInputContainer.classList.remove('error');
    calculatorOutput.value = `=${displayed}`;

    // Update copy button
    const copyButton = document.getElementById('calculator-output-copy')!;
    copyButton.onclick = function () {
      void copyToClipboard(ce.parse(displayed).toString());
    };

    const data: CalculatorLocalData = JSON.parse(
      localStorage.getItem(storageKey) ??
        JSON.stringify({
          ans: null,
          variable: [],
          history: [],
          temp_input: null,
        }),
    );

    // Add to history
    if (addToHistory) {
      const parsedJson = parsed.json;
      // FIXME: could be multiple assignments in one expression
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
        shouldAutoInsertAns = true;
      } catch (e) {
        console.error('Failed to assign ans:', e);
      }

      const currentAngleMode = calculatorOutput.dataset.angleMode ?? 'rad';
      const numericValue = Number(evaluated.N().value);
      const historyItem = {
        input,
        displayed,
        numeric: numericValue,
        angleMode: currentAngleMode,
      };
      addHistoryItem(historyItem);
      data.history.push(historyItem);

      calculatorInputElement.value = '';
      calculatorOutput.value = '';
    }
    data.temp_input = calculatorInputElement.value;
    localStorage.setItem(storageKey, JSON.stringify(data));
  }

  // Clear history button
  const clearHistoryBtn = document.getElementById('calculatorClearHistory')!;
  clearHistoryBtn.addEventListener('click', () => {
    const historyPanel = document.getElementById('history-panel')!;
    historyPanel.innerHTML = '';
    clearHistoryBtn.classList.add('d-none');
    clearHistoryBtn.setAttribute('aria-hidden', 'true');

    const data: CalculatorLocalData = JSON.parse(
      localStorage.getItem(storageKey) ??
        JSON.stringify({ ans: null, variable: [], history: [], temp_input: null, isOpen: true }),
    );
    data.history = [];
    localStorage.setItem(storageKey, JSON.stringify(data));

    ce.assign('ans', ce.parse('\\bot'));
    shouldAutoInsertAns = false;
    if (calculatorInputElement.value.includes('{ans}')) {
      calculatorInputElement.dispatchEvent(new CustomEvent('input'));
    }
  });

  registerCustomFunctions(ce);

  // Buttons for number and letter inputs
  document.querySelectorAll<HTMLButtonElement>('.btn-key').forEach((button) => {
    prepareButton(button);
    button.addEventListener('click', () => {
      shouldAutoInsertAns = false;
      calculatorInputElement.insert(button.textContent);
      calculatorInputElement.focus();
    });
  });

  // Upper/lowercase switch
  document.getElementsByName('shift').forEach((button) =>
    button.addEventListener('click', () => {
      button.classList.toggle('btn-light');
      button.classList.toggle('btn-secondary');
      document.querySelectorAll<HTMLButtonElement>('.btn-key[data-key]').forEach((btn) => {
        const key = btn.dataset.key!;
        if (key >= 'a' && key <= 'z') {
          btn.textContent =
            btn.textContent.toUpperCase() === btn.textContent
              ? btn.textContent.toLowerCase()
              : btn.textContent.toUpperCase();
        }
      });
    }),
  );

  // Backspace button
  document.getElementsByName('backspace').forEach((button) => {
    prepareButton(button);
    button.addEventListener('click', () => {
      calculatorInputElement.executeCommand(['deleteBackward']);
      calculatorInputElement.focus();
    });
  });

  // Left/right
  document.getElementsByName('left').forEach((button) => {
    prepareButton(button);
    button.addEventListener('click', () => {
      calculatorInputElement.executeCommand(['moveToPreviousChar']);
      calculatorInputElement.focus();
    });
  });
  document.getElementsByName('right').forEach((button) => {
    prepareButton(button);
    button.addEventListener('click', () => {
      calculatorInputElement.executeCommand(['moveToNextChar']);
      calculatorInputElement.focus();
    });
  });

  // Clear all
  document.getElementsByName('clear').forEach((button) => {
    prepareButton(button);
    button.addEventListener('click', () => {
      calculatorInputElement.executeCommand('deleteAll');
      calculatorInputElement.dispatchEvent(new CustomEvent('input'));
      calculatorInputElement.focus();
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
  calculatorInputElement.addEventListener('keydown', (ev) => {
    if (shouldAutoInsertAns && calculatorInputElement.value.length === 0 && !ev.ctrlKey && !ev.metaKey) {
      if (autoAnsKeys.has(ev.key)) {
        calculatorInputElement.insert('\\operatorname{ans}');
      }
      if (ev.key.length === 1) {
        shouldAutoInsertAns = false;
      }
    }
    handleKeyPress(ev);
  });

  // Shortcuts
  calculatorInputElement.inlineShortcuts = {
    ...calculatorInputElement.inlineShortcuts,
    ans: '\\operatorname{ans}',
    stdev: '\\operatorname{stdev}([#?])',
    stdevp: '\\operatorname{stdevp}([#?])',
    nCr: '\\operatorname{nCr}(#?,#?)',
    nPr: '\\operatorname{nPr}(#?,#?)',
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
    let parsedExpr: MathJsonExpression;
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
          if (
            shouldAutoInsertAns &&
            calculatorInputElement.value.length === 0 &&
            autoAnsButtons.has(buttonName)
          ) {
            if (action.includes('#0')) {
              calculatorInputElement.insert(action.replaceAll('#0', '\\operatorname{ans}'));
            } else {
              calculatorInputElement.insert('\\operatorname{ans}');
              calculatorInputElement.insert(action);
            }
          } else {
            calculatorInputElement.insert(action);
          }
          shouldAutoInsertAns = false;
          calculatorInputElement.focus();
        });
      });
    }
  }

  function addHistoryItem(dataHistoryItem: HistoryItem) {
    const { input, displayed, angleMode } = dataHistoryItem;

    const historyPanel = document.getElementById('history-panel')!;

    const template = document.getElementById('history-item-template') as HTMLTemplateElement;
    const clone = document.importNode(template.content, true);

    const historyItem = clone.querySelector<HTMLElement>('.history-item')!;
    historyItem.dataset.input = input;
    historyItem.dataset.angleMode = angleMode;

    // Set input text
    const inputRow = clone.querySelector('.history-input')!;
    const inputField = inputRow.querySelector<MathfieldElement>('.history-text')!;
    inputField.value = input;

    // Set output text
    const outputRow = clone.querySelector('.history-output')!;
    const outputField = outputRow.querySelector<MathfieldElement>('.history-text')!;
    outputField.value = `=${displayed}`;

    // Only show rad/deg toggle if expression contains trig functions
    const modeSwitch = clone.querySelector<HTMLElement>('.history-mode-switch')!;
    const hasTrig = containsTrigFunction(input);
    if (!hasTrig) {
      modeSwitch.classList.remove('d-flex');
      modeSwitch.classList.add('d-none');
      modeSwitch.setAttribute('aria-hidden', 'true');
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
      void copyToClipboard(normalizeLatex(outputField.value.replace(/^=/, '')));
    });

    // Insert buttons
    const inputInsertBtn = clone.querySelector('.history-input .history-insert-btn')!;
    const outputInsertBtn = clone.querySelector('.history-output .history-insert-btn')!;
    inputInsertBtn.addEventListener('click', () => {
      calculatorInputElement.insert(input);
      calculatorInputElement.dispatchEvent(new CustomEvent('input'));
    });
    outputInsertBtn.addEventListener('click', () => {
      calculatorInputElement.insert(outputField.value.replace(/^=/, ''));
      calculatorInputElement.dispatchEvent(new CustomEvent('input'));
    });

    // Deg/rad mode switch
    const modeSwitchInput = modeSwitch.querySelector('input')!;
    modeSwitchInput.checked = angleMode === 'deg';

    modeSwitchInput.addEventListener('change', () => {
      const isDeg = modeSwitchInput.checked;
      const newMode = isDeg ? 'deg' : 'rad';
      historyItem.dataset.angleMode = newMode;

      reevaluateHistoryItem(historyItem);
    });

    historyPanel.insertBefore(clone, historyPanel.firstChild);

    const clearHistoryButton = document.getElementById('calculatorClearHistory')!;
    clearHistoryButton.classList.remove('d-none');
    clearHistoryButton.setAttribute('aria-hidden', 'false');
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

function initDrawerUI(
  drawer: HTMLElement,
  fab: HTMLElement,
  fabClose: HTMLElement | null,
  storageKey: string,
) {
  function setIsOpen(value: boolean) {
    const raw = localStorage.getItem(storageKey);
    const data: CalculatorLocalData = raw
      ? JSON.parse(raw)
      : { ans: null, variable: [], history: [], temp_input: null, isOpen: false };
    data.isOpen = value;
    localStorage.setItem(storageKey, JSON.stringify(data));
  }

  function openDrawer() {
    fab.classList.remove('visible');
    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');
    setIsOpen(true);
  }

  function collapseDrawer() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    fab.classList.add('visible');
    setIsOpen(false);
  }

  function dismissCalculator() {
    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');
    fab.classList.remove('visible');
    setIsOpen(false);
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

export function registerCustomFunctions(ce: InstanceType<typeof ComputeEngine>) {
  ce.declare('nCr', {
    signature: '(n: number, r: number) -> number',
    evaluate([n, r]) {
      // nCr(n, r) = n! / (r! * (n - r)!)
      const nVal = n.re;
      const rVal = r.re;
      if (Number.isNaN(nVal) || Number.isNaN(rVal)) return ce.error('Invalid input');
      if (rVal > nVal) return ce.number(0);
      const nFact = ce.box(['Factorial', n.json]).evaluate();
      const rFact = ce.box(['Factorial', r.json]).evaluate();
      const nrFact = ce.box(['Factorial', n.sub(r).json]).evaluate();
      return nFact.div(rFact.mul(nrFact));
    },
  });

  ce.declare('nPr', {
    signature: '(n: number, r: number) -> number',
    evaluate([n, r]) {
      // nPr(n, r) = n! / (n - r)!
      const nVal = n.re;
      const rVal = r.re;
      if (Number.isNaN(nVal) || Number.isNaN(rVal)) return ce.error('Invalid input');
      if (rVal > nVal) return ce.number(0);
      const nFact = ce.box(['Factorial', n.json]).evaluate();
      const nrFact = ce.box(['Factorial', n.sub(r).json]).evaluate();
      return nFact.div(nrFact);
    },
  });

  ce.declare('stdev', {
    signature: '(xs: list) -> number',
    evaluate([list]) {
      if (!isTensor(list)) {
        return ce.error('Input must be a list');
      }

      if (list.shape.length !== 1) {
        return ce.error('Input must be a 1-dimensional list');
      }

      const n = list.shape[0];
      const xs = Array.from(list.each());
      const mean = xs.reduce((a, b) => a.add(b)).div(n);
      const variance = xs.reduce((sum, x) => sum.add(x.sub(mean).pow(2)), ce.number(0)).div(n - 1);
      return variance.sqrt();
    },
  });


  // we define this here but its not actually usable, because the standard
  // deviation functions are only available as inline shortcuts stdev([#?])
  // and stdevp([#?]), but after you type stdev it turns into stdev([#?]),
  // so you can never actually call stdevp
  ce.declare('stdevp', {
    signature: '(xs: list) -> number',
    evaluate([list]) {
      if (!isTensor(list)) {
        return ce.error('Input must be a list');
      }

      if (list.shape.length !== 1) {
        return ce.error('Input must be a 1-dimensional list');
      }

      const n = list.shape[0];
      const xs = Array.from(list.each());
      const mean = xs.reduce((a, b) => a.add(b)).div(n);
      const variance = xs.reduce((sum, x) => sum.add(x.sub(mean).pow(2)), ce.number(0)).div(n);
      return variance.sqrt();
    },
  });
}

export function containsTrigFunction(input: string): boolean {
  return /sin|cos|tan|cot|sec|csc/i.test(input);
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

  const storageKey = drawer.dataset.storageKey ?? 'pl-calculator';
  let initialized = false;

  function initIfNeeded() {
    if (!initialized) {
      initialized = true;
      try {
        // drawer and fab are non-null: guarded above with `if (!drawer || !fab) return`
        initCalculator(storageKey, { drawer: drawer!, fab: fab!, fabClose });
      } catch (e) {
        console.error('Failed to initialize calculator:', e);
      }
    }
  }

  const toggleBtn = document.getElementById('calculatorDrawerToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      initIfNeeded();
      fab.classList.remove('visible');
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
    });
  }

  const savedData = localStorage.getItem(storageKey);
  const wasOpen = savedData
    ? (JSON.parse(savedData) as CalculatorLocalData).isOpen === true
    : false;
  if (wasOpen) {
    initIfNeeded();
    fab.classList.remove('visible');
    drawer.classList.add('no-transition', 'open');
    drawer.setAttribute('aria-hidden', 'false');
    // Remove the no-transition class after the browser has painted the open state
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        drawer.classList.remove('no-transition');
      });
    });
  }
});
