// TODO: migrate to TypeScript/React

import { ComputeEngine } from '@cortex-js/compute-engine';
import 'mathlive';

import { onDocumentReady } from '@prairielearn/browser-utils';

/**
 * @param {string} storageKey
 */
export function initCalculator(storageKey, { drawer, fab, fabClose }) {
  showPanel('main');
  initColumnNavigation();
  initDrawerUI(drawer, fab, fabClose);
  const ce = new ComputeEngine();
  ce.context.timeLimit = 1;

  ce.pushScope();
  /** @type {import('mathlive').MathfieldElement} */
  const calculatorInputElement = document.getElementById('calculator-input');
  const calculatorInputContainer = calculatorInputElement.parentElement;
  /** @type {import('mathlive').MathfieldElement} */
  const calculatorOutput = document.getElementById('calculator-output');

  const onExport = (_mf, latex) => {
    return ce.parse(latex).toString();
  };
  calculatorInputElement.onExport = onExport;
  calculatorOutput.onExport = onExport;

  MathfieldElement.soundsDirectory = null;
  calculatorInputElement.menuItems = [];
  calculatorOutput.dataset.displayMode = 'numeric'; // numeric or symbolic
  calculatorOutput.dataset.angleMode = 'rad'; // rad or deg

  document.getElementsByName('calculate').forEach((button) =>
    button.addEventListener('mousedown', (ev) => {
      ev.preventDefault();
      calculate(true);
    }),
  );

  /** @type {number} */
  let typingTimer; // Timer identifier
  const delay = 500; // 0.5 second delay
  calculatorInputElement.addEventListener('input', () => {
    clearTimeout(typingTimer); // Clear the previous timer
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
    const data = JSON.parse(calculatorLocalData);
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
      // dispatch custom event is used to trigger the input event to recompute the output panel
      calculatorInputElement.dispatchEvent(new CustomEvent('input'));
    }
  }

  /**
   * Evaluate a LaTeX expression and return the result
   * @param {string} input - LaTeX input string
   * @param {string} angleMode - 'rad' or 'deg'
   * @param {string} displayMode - 'symbolic' or 'numeric'
   * @returns {{ displayed: string, numeric: number, evaluated: import("@cortex-js/compute-engine").BoxedExpression } | null} The evaluation result, or null if input is empty or invalid.
   */
  function evaluateExpression(input, angleMode = 'rad', displayMode = 'numeric') {
    if (!input || input.length === 0) return null;

    let parsed = ce.parse(input, { parseNumbers: 'rational' });

    if (angleMode === 'deg') {
      parsed = ce.box(radianToDegree(parsed.json));
    }

    if (parsed.json[0] === 'Assign' && parsed.json[1] === 'InvisibleOperator') {
      return null;
    }

    try {
      const evaluated = parsed.evaluate();
      const displayed =
        displayMode === 'symbolic'
          ? evaluated.toLatex({ notation: 'auto' })
          : evaluated.N().toLatex({ notation: 'auto' });
      const numeric = evaluated.N().value;

      return { displayed, numeric, evaluated };
    } catch (e) {
      console.error('Evaluation failed:', e);
      return null;
    }
  }

  // Initialize action for calculation
  function calculate(addToHistory = false) {
    const input = calculatorInputElement.value;
    // When there is no input, clear the output panel
    // instead of outputting "nothing"
    if (input.length === 0) {
      calculatorOutput.value = '';
      const copyButton = document.getElementById('calculator-output-copy');
      copyButton.onclick = function () {
        navigator.clipboard.writeText('');
      };
      return;
    }
    /** @type {import("@cortex-js/compute-engine").BoxedExpression} */
    let parsed = ce.parse(input, {
      parseNumbers: 'rational',
    });
    if (calculatorOutput.dataset.angleMode === 'deg') {
      parsed = ce.box(radianToDegree(parsed.json));
    }
    if (parsed.json[0] === 'Assign' && parsed.json[1] === 'InvisibleOperator') {
      parsed = ce.box([
        'Error',
        '',
        'Assignment operator can only be used on single-letter variables',
      ]);
    }
    /** @type {import("@cortex-js/compute-engine").BoxedExpression} */
    let evaluated;
    try {
      evaluated = parsed.evaluate();
    } catch (e) {
      if (e.name === 'CancellationError') {
        calculatorInputElement.value = '';
        calculatorOutput.value = ce.box(['Error', '', 'Output is too large']);
      } else {
        evaluated = parsed.evaluate();
        calculatorInputElement.value = '';
        calculatorOutput.value = ce.box(['Error', '', e.message]);
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
    const copyButton = document.getElementById('calculator-output-copy');
    copyButton.onclick = function () {
      navigator.clipboard.writeText(evaluated.N().value);
    };

    const data = JSON.parse(localStorage.getItem(storageKey));
    // Add to history
    if (!error && addToHistory) {
      if (parsed.json[0] === 'Assign') {
        const varName = parsed.json[1];
        const varVal = ce.box(parsed.json[2]).evaluate();
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

      // Create item in history panel
      const currentAngleMode = calculatorOutput.dataset.angleMode;
      addHistoryItem(input, displayed, evaluated.N().value, currentAngleMode);

      // Add history data to localStorage
      data.history.push({
        input,
        displayed,
        numeric: evaluated.N().value,
        angleMode: currentAngleMode,
      });

      // Clear current input and output panels
      calculatorInputElement.value = '';
      calculatorOutput.value = '';
    }
    data.temp_input = calculatorInputElement.value;
    localStorage.setItem(storageKey, JSON.stringify(data));
  }

  ce.assign('ans', ce.parse('\\bot'));

  // Define custom functions
  // n choose r
  ce.assign('nCr', (args) => {
    if (args.length !== 2) {
      return ce.box(['Error', '', 'nCr requires 2 inputs']);
    }
    if (args[1] > args[0]) {
      return ce.number(0);
    }
    return ce.parse(`$$ \\frac{${args[0]}!}{(${args[1]})!*(${args[0]}-${args[1]})!} $$`).evaluate();
  });

  // n permute r
  ce.assign('nPr', (args) => {
    if (args.length !== 2) {
      return ce.box(['Error', '', 'nPr requires 2 inputs']);
    }
    if (args[1] > args[0]) {
      return ce.number(0);
    }
    return ce.parse(`$$ \\frac{${args[0]}!}{(${args[0]}-${args[1]})!} $$`).evaluate();
  });

  // Sample standard deviation (divided by (n-1))
  ce.assign('stdev', (args) => {
    const nums = String(args[0]).slice(1, -1).split(',').map(Number);
    const n = nums.length;
    const mean = nums.reduce((a, b) => a + b) / n;
    const variance = nums.reduce((sum, x) => sum + (x - mean) ** 2, 0) / (n - 1);
    return ce.number(Math.sqrt(variance));
  });

  // Population standard deviation (divided by n)
  ce.assign('stdevp', (args) => {
    const nums = String(args[0]).slice(1, -1).split(',').map(Number);
    const n = nums.length;
    const mean = nums.reduce((a, b) => a + b) / n;
    const variance = nums.reduce((sum, x) => sum + (x - mean) ** 2, 0) / n;
    return ce.number(Math.sqrt(variance));
  });

  // Round to nearest integer
  ce.assign('round', (args) => {
    return ce.number(Math.round(args[0]));
  });

  // Buttons for number inputs
  for (let i = 0; i < 10; ++i) {
    const button = document.getElementById(`${i}`);
    prepareButton(button);
    button.addEventListener('click', () => {
      calculatorInputElement.insert(`${i}`);
    });
  }

  // Buttons for alphabet inputs
  for (let char = 'a'.charCodeAt(0); char <= 'z'.charCodeAt(0); ++char) {
    const letter = String.fromCharCode(char);
    const button = document.getElementById(letter);
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
        const button = document.getElementById(letter);
        if (button.textContent <= 'Z') {
          button.textContent = button.textContent.toLowerCase();
        } else {
          button.textContent = button.textContent.toUpperCase();
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
  const buttonActions = {
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
    // TODO: add more name-latex insertion pair
    // For difference between #@, #?, look at https://cortexjs.io/mathlive/guides/shortcuts/
    // #0 is replaced with current selection, or placeholder if there is no selection
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

  // Symbolic-numeric transformation
  prepareButton(document.getElementById('displayModeSwitch'));
  document.getElementById('displayModeSwitch').addEventListener('click', () => {
    if (calculatorOutput.dataset.displayMode === 'numeric') {
      calculatorOutput.dataset.displayMode = 'symbolic';
    } else {
      calculatorOutput.dataset.displayMode = 'numeric';
    }
    calculate();
  });

  // Degree-radian transformation
  prepareButton(document.getElementById('angleModeSwitch'));
  document.getElementById('angleModeSwitch').addEventListener('click', () => {
    if (calculatorOutput.dataset.angleMode === 'deg') {
      calculatorOutput.dataset.angleMode = 'rad';
    } else {
      calculatorOutput.dataset.angleMode = 'deg';
    }
    calculate();
  });

  // Keyboard handling
  function handleKeyPress(ev) {
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
    ...calculatorInputElement.inlineShortcuts, // Preserve default shortcuts
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

  /**
   * @param {import('@cortex-js/compute-engine').SemiBoxedExpression} json
   */
  function hasError(json) {
    if (!Array.isArray(json)) return false;
    if (json[0] === 'Error') return true;

    for (const item of json.slice(1)) {
      if (hasError(item)) return true;
    }
    return false;
  }

  /**
   * @param {import('@cortex-js/compute-engine').SemiBoxedExpression} json
   */
  function radianToDegree(json) {
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
    let parsedExpr;
    if (trigFunc.includes(json[0])) {
      // If has a trig function, add a degree to the argument
      parsedExpr = [json[0], ['Degrees', radianToDegree(json[1])]];
    } else if (trigFuncInv.includes(json[0])) {
      // If has an inv trig function, divide output by degree
      parsedExpr = ['Divide', [json[0], radianToDegree(json[1])], ['Degrees', 1]];
    } else {
      // If no trig function, recursively check the children
      parsedExpr = [json[0]];
      json.slice(1).forEach((item) => {
        parsedExpr.push(radianToDegree(item));
      });
    }
    return parsedExpr;
  }

  /**
   * @param {HTMLButtonElement} button
   *
   * Prepares a button to maintain focus on the calculator input when clicked.
   * This prevents the input border from blinking when buttons are clicked.
   */
  function prepareButton(button) {
    // if the calculator input is focused, prevent losing focus when clicking button
    button.addEventListener('mousedown', (ev) => {
      if (document.activeElement === calculatorInputElement) {
        ev.preventDefault();
      }
    });
  }

  function setupButtonEvents(buttonActions) {
    for (const [buttonName, action] of Object.entries(buttonActions)) {
      document.getElementsByName(buttonName).forEach((button) => {
        prepareButton(button);
        button.addEventListener('click', () => {
          calculatorInputElement.insert(action);
        });
      });
    }
  }

  /**
   * @param {string} input
   * @param {string} displayed
   * @param {number} numeric
   * @param {string} angleMode
   */
  function addHistoryItem(input, displayed, numeric, angleMode = 'rad') {
    const historyPanel = document.getElementById('history-panel');

    const template = document.getElementById('history-item-template');
    /** @type {DocumentFragment} */
    const clone = document.importNode(template.content, true);

    // Store original input for recomputation
    /** @type {import('mathlive').MathfieldElement} */
    const historyItem = clone.querySelector('.history-item');
    historyItem.dataset.input = input;
    historyItem.dataset.angleMode = angleMode;

    // Set input text
    const inputRow = clone.querySelector('.history-input');
    /** @type {import('mathlive').MathfieldElement} */
    const inputField = inputRow.querySelector('.history-text');
    inputField.innerHTML = input;

    // Set output text
    const outputRow = clone.querySelector('.history-output');
    /** @type {import('mathlive').MathfieldElement} */
    const outputField = outputRow.querySelector('.history-text');
    outputField.innerHTML = `=${displayed}`;

    // Only show rad/deg toggle if expression contains trig functions
    const modeSwitch = clone.querySelector('.history-mode-switch');
    const hasTrig = containsTrigFunction(input);
    if (!hasTrig) {
      modeSwitch.style.display = 'none';
    }

    // Customize clipboard export to remove $$ wrapping
    const historyOnExport = (_mf, latex) => {
      return ce.parse(latex).toString();
    };
    inputField.onExport = historyOnExport;
    outputField.onExport = historyOnExport;

    // Copy buttons - copy to clipboard
    const inputCopyBtn = clone.querySelector('.history-input .history-copy-btn');
    const outputCopyBtn = clone.querySelector('.history-output .history-copy-btn');
    // Input row copy button
    inputCopyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(input);
    });
    // Output row copy button
    outputCopyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(String(numeric));
    });

    // Insert buttons - insert into calculator input
    const inputInsertBtn = clone.querySelector('.history-input .history-insert-btn');
    const outputInsertBtn = clone.querySelector('.history-output .history-insert-btn');
    // Input row insert button
    inputInsertBtn.addEventListener('click', () => {
      calculatorInputElement.insert(input);
      calculatorInputElement.dispatchEvent(new CustomEvent('input'));
    });
    // Output row insert button
    outputInsertBtn.addEventListener('click', () => {
      calculatorInputElement.insert(ce.parse(displayed).toString());
      calculatorInputElement.dispatchEvent(new CustomEvent('input'));
    });

    // Deg/rad mode switch (only active if trig functions present)
    const modeSwitchInput = modeSwitch.querySelector('input');
    modeSwitchInput.checked = angleMode === 'deg';

    modeSwitchInput.addEventListener('change', () => {
      const isDeg = modeSwitchInput.checked;
      const newMode = isDeg ? 'deg' : 'rad';
      historyItem.dataset.angleMode = newMode;

      // Recompute using the shared evaluateExpression function
      const result = evaluateExpression(input, newMode, calculatorOutput.dataset.displayMode);
      if (result) {
        outputField.innerHTML = `=${result.displayed}`;
        displayed = result.displayed;
        numeric = result.numeric;
      }
    });

    // Append to the history panel
    historyPanel.insertBefore(clone, historyPanel.firstChild);
  }
}

/**
 * @param {string} panelClass
 */
function showPanel(panelClass) {
  // Hide all panels
  const panels = document.querySelectorAll('.keyboard');
  panels.forEach((panel) => (panel.style.display = 'none'));

  // Show the selected panel
  const panelToShow = document.querySelectorAll(`.${panelClass}`);
  panelToShow.forEach((panel) => (panel.style.display = 'flex'));
}

// Expose showPanel globally for inline onclick handlers in the calculator HTML
window.showPanel = showPanel;

// Column navigation for responsive keyboards
function initColumnNavigation() {
  setupKeyboardNav('main-keyboard', 'show-functions');
  setupKeyboardNav('func-keyboard', 'show-trig');

  /**
   * @param {string} keyboardId
   * @param {string} toggleClass
   */
  function setupKeyboardNav(keyboardId, toggleClass) {
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

/**
 * @param {string} input
 */
export function containsTrigFunction(input) {
  return /sin|cos|tan|cot|sec|csc/i.test(input);
}

/**
 * @param {HTMLElement} drawer
 * @param {HTMLElement} fab
 * @param {HTMLElement | null} fabClose
 */
function initDrawerUI(drawer, fab, fabClose) {
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

  // Floating button opens the drawer
  fab.addEventListener('click', (ev) => {
    if (fabClose?.contains(ev.target)) return;
    openDrawer();
  });

  // X on floating button dismisses entirely
  if (fabClose) {
    fabClose.addEventListener('click', (ev) => {
      ev.stopPropagation();
      dismissCalculator();
    });
  }

  // Header close button collapses to fab
  const closeBtn = document.getElementById('calculatorDrawerClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', collapseDrawer);
  }

  // Left-edge resize handle
  const resizeHandle = document.getElementById('calculatorResizeHandle');
  if (resizeHandle) {
    let startX = 0;
    let startWidth = 0;

    function onPointerMove(ev) {
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
      if (ev.target === closeBtn || closeBtn?.contains(ev.target)) return;
      if (drawer.classList.contains('open')) {
        collapseDrawer();
      } else {
        openDrawer();
      }
    });
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
          })
        } catch (e) {
          console.error('Failed to initialize calculator:', e);
        }
      }
      fab.classList.remove('visible');
      drawer.classList.add('open');
    });
  }
});
